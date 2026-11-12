import express from "express";
import http from "node:http";
import { randomBytes } from "node:crypto";
import { WebSocketServer, WebSocket } from "ws";

import {
    cert,
    getApps,
    initializeApp
} from "firebase-admin/app";

import {
    getAuth
} from "firebase-admin/auth";

// ============================================================
// SERVER SETTINGS
// ============================================================

const PORT = Number(process.env.PORT || 10000);

const WS_PATH = "/ws";

const MAX_PLAYERS = 4;
const MAX_SERVER_PLAYERS = 10;

const WORLD = {
    width: 2400,
    height: 1800
};

const TICK_MS = 50;
const SNAPSHOT_MS = 100;
const MATCH_START_MS = 16000;
const MISSION_TIME_MS = 180000;

const allowedOrigins = (
    process.env.ALLOWED_ORIGINS ||
    "https://kaasflip13-dev.github.io"
)
    .split(",")
    .map(v => v.trim())
    .filter(Boolean);

// ============================================================
// FIREBASE ADMIN
// ============================================================

const serviceAccountRaw =
    process.env.FIREBASE_SERVICE_ACCOUNT_JSON;

if (!serviceAccountRaw) {
    throw new Error(
        "Missing FIREBASE_SERVICE_ACCOUNT_JSON environment variable."
    );
}

let serviceAccount;

try {
    serviceAccount = JSON.parse(serviceAccountRaw);
} catch {
    throw new Error(
        "FIREBASE_SERVICE_ACCOUNT_JSON must contain valid JSON."
    );
}

if (!getApps().length) {
    initializeApp({
        credential: cert(serviceAccount)
    });
}

const firebaseAuth = getAuth();

// ============================================================
// HTTP SERVER
// ============================================================

const app = express();

app.disable("x-powered-by");

app.get("/", (_req, res) => {
    res.status(200).send(
        "VÉLORA co-op server is running."
    );
});

app.get("/health", (_req, res) => {
    res.json({
        status: "ok",
        service: "velora-coop-multiplayer",
        rooms: rooms.size,
        players: [...rooms.values()].reduce(
            (n, room) => n + room.players.size,
            0
        ),
        uptime: Math.floor(process.uptime())
    });
});

const server = http.createServer(app);

const wss = new WebSocketServer({
    noServer: true,
    maxPayload: 16 * 1024
});

// ============================================================
// SERVER STATE
// ============================================================

const rooms = new Map();
const socketsByUid = new Map();

// ============================================================
// HELPERS
// ============================================================

function send(ws, payload) {
    if (ws?.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(payload));
    }
}

function broadcast(room, payload) {
    for (const player of room.players.values()) {
        send(player.ws, payload);
    }
}

function makeCode() {
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

    let code;

    do {
        const bytes = randomBytes(6);

        code = [...bytes]
            .map(b => chars[b % chars.length])
            .join("");

    } while (rooms.has(code));

    return code;
}

function safeName(value) {
    const name = String(value || "Explorer")
        .replace(/[<>\u0000-\u001f]/g, "")
        .trim();

    return name.slice(0, 22) || "Explorer";
}

function publicPlayer(p) {
    return {
        uid: p.uid,
        name: p.name,
        x: p.x,
        y: p.y,
        angle: p.angle,
        hp: p.hp,
        maxHp: p.maxHp,
        downed: p.downed,
        respawnAt: p.respawnAt,
        kills: p.kills
    };
}

function roomInfo(room) {
    return {
        code: room.code,
        mode: room.mode,
        status: room.status,
        hostUid: room.hostUid,
        maxPlayers: MAX_PLAYERS,
        playerCount: room.players.size,
        players: [...room.players.values()].map(publicPlayer)
    };
}

// ============================================================
// ROOMS
// ============================================================

function createRoom(mode, host) {
    const code = makeCode();

    const room = {
        code,
        mode,
        status: "lobby",
        hostUid: host.uid,
        players: new Map(),
        bots: [],
        createdAt: Date.now(),
        missionEndsAt: 0,
        lastSnapshotAt: 0,
        matchTimer: null,
        result: null
    };

    rooms.set(code, room);

    return room;
}

function addPlayer(room, client) {
    if (room.players.size >= MAX_PLAYERS) {
        return false;
    }

    const slot = room.players.size;

    room.players.set(client.uid, {
        uid: client.uid,
        name: client.name,
        ws: client.ws,

        x: 300 + slot * 65,
        y: 900 + (slot % 2 ? 45 : -45),
        angle: 0,

        hp: 100,
        maxHp: 100,

        downed: false,
        respawnAt: 0,

        kills: 0,

        input: {
            x: 0,
            y: 0,
            sprint: false
        },

        attackReadyAt: 0,
        specialReadyAt: 0,
        lastReviveAt: 0
    });

    client.roomCode = room.code;

    return true;
}

function broadcastRoomUpdate(room) {
    broadcast(room, {
        type: "room_update",
        ...roomInfo(room)
    });
}

function removeRoomIfEmpty(room) {
    if (!room || room.players.size) return;

    if (room.matchTimer) {
        clearTimeout(room.matchTimer);
    }

    rooms.delete(room.code);
}

function removePlayer(client) {
    if (!client?.roomCode) return;

    const room = rooms.get(client.roomCode);

    client.roomCode = null;

    if (!room) return;

    room.players.delete(client.uid);

    if (room.hostUid === client.uid) {
        room.hostUid =
            room.players.keys().next().value || null;
    }

    if (!room.players.size) {
        removeRoomIfEmpty(room);
        return;
    }

    broadcast(room, {
        type: "player_left",
        uid: client.uid,
        name: client.name
    });

    broadcastRoomUpdate(room);
}

// ============================================================
// BOT GENERATION
// ============================================================

function createBots() {
    const bots = [];
    const count = 14;

    for (let i = 0; i < count; i++) {
        const brute = i % 5 === 4;
        const scout = i % 4 === 1;

        const hp = brute
            ? 210
            : scout
                ? 65
                : 110;

        bots.push({
            id: `bot-${i + 1}`,

            kind: brute
                ? "brute"
                : scout
                    ? "scout"
                    : "stalker",

            x: 980 + Math.random() * 1050,
            y: 180 + Math.random() * 1440,

            angle: Math.PI,

            hp,
            maxHp: hp,

            speed: brute
                ? 54
                : scout
                    ? 112
                    : 78,

            damage: brute
                ? 17
                : scout
                    ? 7
                    : 11,

            attackReadyAt: 0,
            hitUntil: 0,
            dead: false
        });
    }

    return bots;
}

// ============================================================
// MISSION SNAPSHOTS
// ============================================================

function missionSnapshot(room) {
    return {
        type: "snapshot",
        code: room.code,
        status: room.status,

        timeLeft: Math.max(
            0,
            room.missionEndsAt - Date.now()
        ),

        players: [...room.players.values()].map(publicPlayer),

        bots: room.bots.map(b => ({
            id: b.id,
            kind: b.kind,
            x: b.x,
            y: b.y,
            angle: b.angle,
            hp: b.hp,
            maxHp: b.maxHp,
            dead: b.dead,
            hit: b.hitUntil > Date.now()
        })),

        remainingBots: room.bots.filter(b => !b.dead).length
    };
}

// ============================================================
// START / END MISSION
// ============================================================

function startMission(room) {
    if (
        !room ||
        room.status !== "lobby" ||
        room.players.size < 1
    ) {
        return false;
    }

    if (room.matchTimer) {
        clearTimeout(room.matchTimer);
    }

    room.status = "mission";
    room.bots = createBots();

    room.missionEndsAt = Date.now() + MISSION_TIME_MS;

    for (const p of room.players.values()) {
        p.x = 300 + Math.random() * 90;
        p.y = 850 + Math.random() * 100;

        p.hp = 100;
        p.downed = false;
        p.respawnAt = 0;
        p.kills = 0;

        p.attackReadyAt = 0;
        p.specialReadyAt = 0;
    }

    broadcast(room, {
        type: "mission_started",
        ...missionSnapshot(room)
    });

    return true;
}

function finishMission(room, result) {
    if (room.status !== "mission") return;

    room.status = "finished";
    room.result = result;

    broadcast(room, {
        type: "mission_end",
        result,

        remainingBots: room.bots.filter(b => !b.dead).length,
        totalBots: room.bots.length,

        players: [...room.players.values()].map(publicPlayer)
    });
}

// ============================================================
// COMBAT HELPERS
// ============================================================

function distance(a, b) {
    return Math.hypot(
        a.x - b.x,
        a.y - b.y
    );
}

function angleDelta(a, b) {
    let d = (a - b + Math.PI) % (Math.PI * 2);

    if (d < 0) d += Math.PI * 2;

    return Math.abs(d - Math.PI);
}

function activePlayers(room) {
    return [...room.players.values()]
        .filter(p => !p.downed);
}

// ============================================================
// MELEE ATTACK
// ============================================================

function handleAttack(room, player) {
    const now = Date.now();

    if (
        room.status !== "mission" ||
        player.downed ||
        now < player.attackReadyAt
    ) {
        return;
    }

    player.attackReadyAt = now + 430;

    let target = null;
    let best = Infinity;

    for (const bot of room.bots) {
        if (bot.dead) continue;

        const d = distance(player, bot);

        if (d > 168) continue;

        const angle = Math.atan2(
            bot.y - player.y,
            bot.x - player.x
        );

        if (angleDelta(angle, player.angle) > 0.78) {
            continue;
        }

        if (d < best) {
            best = d;
            target = bot;
        }
    }

    let damage = 0;

    if (target) {
        damage = 42;

        target.hp = Math.max(0, target.hp - damage);
        target.hitUntil = now + 180;

        if (target.hp <= 0) {
            target.dead = true;
            player.kills++;
        }
    }

    broadcast(room, {
        type: "attack_event",

        uid: player.uid,

        from: {
            x: player.x,
            y: player.y
        },

        to: target
            ? {
                x: target.x,
                y: target.y
            }
            : {
                x: player.x + Math.cos(player.angle) * 135,
                y: player.y + Math.sin(player.angle) * 135
            },

        hit: Boolean(target),
        targetId: target?.id || null,
        damage,
        killed: Boolean(target?.dead)
    });
}

// ============================================================
// SPECIAL TEAM PULSE
// ============================================================

function handleSpecial(room, player) {
    const now = Date.now();

    if (
        room.status !== "mission" ||
        player.downed ||
        now < player.specialReadyAt
    ) {
        return;
    }

    player.specialReadyAt = now + 8500;

    const radius = 275;
    const hitBots = [];

    for (const bot of room.bots) {
        if (
            bot.dead ||
            distance(player, bot) > radius
        ) {
            continue;
        }

        const damage = 95;

        bot.hp = Math.max(0, bot.hp - damage);
        bot.hitUntil = now + 260;

        if (bot.hp <= 0) {
            bot.dead = true;
            player.kills++;
        }

        hitBots.push({
            id: bot.id,
            x: bot.x,
            y: bot.y,
            damage,
            killed: bot.dead
        });
    }

    broadcast(room, {
        type: "special_event",
        uid: player.uid,
        x: player.x,
        y: player.y,
        radius,
        hitBots
    });
}

// ============================================================
// REVIVE TEAMMATE
// ============================================================

function handleRevive(room, player) {
    if (
        room.status !== "mission" ||
        player.downed ||
        Date.now() - player.lastReviveAt < 1100
    ) {
        return;
    }

    const target = [...room.players.values()].find(
        p => p.downed && distance(player, p) < 95
    );

    if (!target) return;

    player.lastReviveAt = Date.now();

    target.downed = false;
    target.hp = 45;
    target.respawnAt = 0;

    broadcast(room, {
        type: "player_revived",
        uid: target.uid,
        by: player.uid,
        x: target.x,
        y: target.y
    });
}

// ============================================================
// INCOMING CLIENT MESSAGES
// ============================================================

function processMessage(client, message) {
    const type = String(message?.type || "");

    // --------------------------------------------------------
    // QUICK MATCH
    // --------------------------------------------------------

    if (type === "quick_match") {
        if (client.roomCode) {
            removePlayer(client);
        }

        let room = [...rooms.values()].find(
            r =>
                r.mode === "quick" &&
                r.status === "lobby" &&
                r.players.size < MAX_PLAYERS
        );

        if (!room) {
            room = createRoom("quick", client);
        }

        if (!addPlayer(room, client)) {
            return send(client.ws, {
                type: "error",
                message: "This team is full. Try again."
            });
        }

        send(client.ws, {
            type: "room_joined",
            ...roomInfo(room),
            yourUid: client.uid
        });

        broadcastRoomUpdate(room);

        if (room.players.size >= MAX_PLAYERS) {
            startMission(room);

        } else if (!room.matchTimer) {
            room.matchTimer = setTimeout(() => {
                room.matchTimer = null;

                if (
                    room.status === "lobby" &&
                    room.players.size
                ) {
                    startMission(room);
                } else {
                    removeRoomIfEmpty(room);
                }
            }, MATCH_START_MS);

            room.matchTimer.unref?.();
        }

        return;
    }

    // --------------------------------------------------------
    // CREATE PRIVATE ROOM
    // --------------------------------------------------------

    if (type === "create_room") {
        if (client.roomCode) {
            removePlayer(client);
        }

        const room = createRoom("private", client);

        addPlayer(room, client);

        send(client.ws, {
            type: "room_joined",
            ...roomInfo(room),
            yourUid: client.uid
        });

        broadcastRoomUpdate(room);

        return;
    }

    // --------------------------------------------------------
    // JOIN PRIVATE ROOM
    // --------------------------------------------------------

    if (type === "join_room") {
        const code = String(message.code || "")
            .toUpperCase()
            .replace(/[^A-Z0-9]/g, "")
            .slice(0, 6);

        const room = rooms.get(code);

        if (
            !room ||
            room.mode !== "private" ||
            room.status !== "lobby"
        ) {
            return send(client.ws, {
                type: "error",
                message: "Private room not found or already started."
            });
        }

        if (room.players.has(client.uid)) {
            return send(client.ws, {
                type: "room_joined",
                ...roomInfo(room),
                yourUid: client.uid
            });
        }

        if (room.players.size >= MAX_PLAYERS) {
            return send(client.ws, {
                type: "error",
                message: "This room is full (4/4)."
            });
        }

        if (client.roomCode) {
            removePlayer(client);
        }

        addPlayer(room, client);

        send(client.ws, {
            type: "room_joined",
            ...roomInfo(room),
            yourUid: client.uid
        });

        broadcast(room, {
            type: "player_joined",
            player: publicPlayer(room.players.get(client.uid))
        });

        broadcastRoomUpdate(room);

        return;
    }

    // --------------------------------------------------------
    // PRIVATE HOST STARTS MISSION
    // --------------------------------------------------------

    if (type === "start_mission") {
        const room = rooms.get(client.roomCode);

        if (!room || room.mode !== "private") {
            return send(client.ws, {
                type: "error",
                message: "You are not in a private room."
            });
        }

        if (room.hostUid !== client.uid) {
            return send(client.ws, {
                type: "error",
                message: "Only the room host can start the mission."
            });
        }

        if (room.status !== "lobby") return;

        startMission(room);

        return;
    }

    // --------------------------------------------------------
    // PLAYER INPUT
    // --------------------------------------------------------

    if (type === "input") {
        const room = rooms.get(client.roomCode);
        const player = room?.players.get(client.uid);

        if (
            !room ||
            room.status !== "mission" ||
            !player ||
            player.downed
        ) {
            return;
        }

        const mx = Number(message.moveX) || 0;
        const my = Number(message.moveY) || 0;

        const mag = Math.hypot(mx, my) || 1;

        player.input.x = Math.max(-1, Math.min(1, mx / mag));
        player.input.y = Math.max(-1, Math.min(1, my / mag));

        player.input.sprint = Boolean(message.sprint);

        const angle = Number(message.angle);

        if (Number.isFinite(angle)) {
            player.angle = angle;
        }

        return;
    }

    // --------------------------------------------------------
    // COMBAT COMMANDS
    // --------------------------------------------------------

    if (
        type === "attack" ||
        type === "special" ||
        type === "revive"
    ) {
        const room = rooms.get(client.roomCode);
        const player = room?.players.get(client.uid);

        if (!room || !player) return;

        if (type === "attack") {
            handleAttack(room, player);
        }

        if (type === "special") {
            handleSpecial(room, player);
        }

        if (type === "revive") {
            handleRevive(room, player);
        }

        return;
    }

    // --------------------------------------------------------
    // REQUEST ROOM INFO
    // --------------------------------------------------------

    if (type === "get_room") {
        const room = rooms.get(client.roomCode);

        if (room) {
            send(client.ws, {
                type: "room_update",
                ...roomInfo(room)
            });
        }

        return;
    }

    // --------------------------------------------------------
    // LEAVE ROOM
    // --------------------------------------------------------

    if (type === "leave_room") {
        removePlayer(client);

        send(client.ws, {
            type: "room_left"
        });

        return;
    }

    send(client.ws, {
        type: "error",
        message: "Unknown multiplayer command."
    });
}

// ============================================================
// SERVER GAME LOOP
// ============================================================

function tickRoom(room, now) {
    if (room.status !== "mission") return;

    const dt = TICK_MS / 1000;

    // Player movement
    for (const player of room.players.values()) {
        if (player.downed) {
            if (now >= player.respawnAt) {
                player.downed = false;
                player.hp = 55;

                player.x = 300 + Math.random() * 70;
                player.y = 850 + Math.random() * 120;

                broadcast(room, {
                    type: "player_respawned",
                    uid: player.uid,
                    x: player.x,
                    y: player.y
                });
            }

            continue;
        }

        const speed = player.input.sprint
            ? 330
            : 230;

        player.x = Math.max(
            65,
            Math.min(
                WORLD.width - 65,
                player.x + player.input.x * speed * dt
            )
        );

        player.y = Math.max(
            65,
            Math.min(
                WORLD.height - 65,
                player.y + player.input.y * speed * dt
            )
        );
    }

    // Bot AI
    for (const bot of room.bots) {
        if (bot.dead) continue;

        const targets = activePlayers(room);

        if (!targets.length) continue;

        let target = targets[0];
        let best = distance(bot, target);

        for (const p of targets.slice(1)) {
            const d = distance(bot, p);

            if (d < best) {
                target = p;
                best = d;
            }
        }

        bot.angle = Math.atan2(
            target.y - bot.y,
            target.x - bot.x
        );

        const attackRange = bot.kind === "brute"
            ? 49
            : 39;

        if (best > attackRange) {
            bot.x = Math.max(
                55,
                Math.min(
                    WORLD.width - 55,
                    bot.x + Math.cos(bot.angle) * bot.speed * dt
                )
            );

            bot.y = Math.max(
                55,
                Math.min(
                    WORLD.height - 55,
                    bot.y + Math.sin(bot.angle) * bot.speed * dt
                )
            );

        } else if (now >= bot.attackReadyAt) {
            bot.attackReadyAt = now + (
                bot.kind === "scout"
                    ? 950
                    : 1250
            );

            target.hp = Math.max(
                0,
                target.hp - bot.damage
            );

            broadcast(room, {
                type: "player_hit",
                uid: target.uid,
                damage: bot.damage,
                from: bot.id
            });

            if (target.hp <= 0) {
                target.downed = true;
                target.respawnAt = now + 8500;

                broadcast(room, {
                    type: "player_downed",
                    uid: target.uid,
                    by: bot.id
                });
            }
        }
    }

    // Mission victory or timeout
    if (room.bots.every(b => b.dead)) {
        finishMission(room, "victory");

    } else if (now >= room.missionEndsAt) {
        finishMission(room, "defeat");
    }

    // Broadcast shared game state
    if (
        room.status === "mission" &&
        now - room.lastSnapshotAt >= SNAPSHOT_MS
    ) {
        room.lastSnapshotAt = now;

        broadcast(room, missionSnapshot(room));
    }
}

// ============================================================
// WEBSOCKET UPGRADE
// ============================================================

server.on("upgrade", (request, socket, head) => {
    const origin = request.headers.origin;

    const pathname = new URL(
        request.url || "/",
        "http://localhost"
    ).pathname;

    if (
        pathname !== WS_PATH ||
        (origin && !allowedOrigins.includes(origin))
    ) {
        socket.write(
            "HTTP/1.1 403 Forbidden\r\n\r\n"
        );

        socket.destroy();

        return;
    }

    wss.handleUpgrade(
        request,
        socket,
        head,
        ws => wss.emit("connection", ws, request)
    );
});

// ============================================================
// WEBSOCKET CONNECTION + FIREBASE AUTH
// ============================================================

wss.on("connection", ws => {
    const client = {
        ws,
        uid: null,
        name: "Explorer",
        roomCode: null,
        authenticated: false
    };

    const authTimeout = setTimeout(() => {
        if (!client.authenticated) {
            send(ws, {
                type: "error",
                message: "Authentication timed out. Please reconnect."
            });

            ws.close(4001, "Authentication required");
        }
    }, 10000);

    ws.on("message", async raw => {
        let message;

        try {
            message = JSON.parse(raw.toString());
        } catch {
            return send(ws, {
                type: "error",
                message: "Invalid message format."
            });
        }

        if (!client.authenticated) {
            if (
                message.type !== "auth" ||
                typeof message.token !== "string"
            ) {
                ws.close(4001, "Send Firebase auth token first");
                return;
            }

            try {
                const decoded = await firebaseAuth.verifyIdToken(
                    message.token
                );

                client.uid = decoded.uid;

                client.name = safeName(
                    decoded.name ||
                    decoded.email?.split("@")[0] ||
                    "Explorer"
                );

                const previous = socketsByUid.get(client.uid);

                if (
                    !previous &&
                    socketsByUid.size >= MAX_SERVER_PLAYERS
                ) {
                    send(ws, {
                        type: "error",
                        message: "This VÉLORA server is full (10/10 players). Try again later."
                    });

                    ws.close(4029, "Server full");

                    return;
                }

                if (previous && previous !== ws) {
                    previous.close(
                        4002,
                        "Signed in from another tab"
                    );
                }

                client.authenticated = true;

                clearTimeout(authTimeout);

                socketsByUid.set(client.uid, ws);

                send(ws, {
                    type: "authenticated",
                    uid: client.uid,
                    name: client.name
                });

            } catch (error) {
                console.warn(
                    "WebSocket auth failed:",
                    error?.message || error
                );

                send(ws, {
                    type: "error",
                    message: "Firebase authentication failed. Sign in again."
                });

                ws.close(4003, "Invalid token");
            }

            return;
        }

        if (raw.length > 8192) {
            return send(ws, {
                type: "error",
                message: "Message too large."
            });
        }

        try {
            processMessage(client, message);

        } catch (error) {
            console.error(
                "Message handler error:",
                error
            );

            send(ws, {
                type: "error",
                message: "The server could not process that action."
            });
        }
    });

    ws.on("close", () => {
        clearTimeout(authTimeout);

        if (
            client.uid &&
            socketsByUid.get(client.uid) === ws
        ) {
            socketsByUid.delete(client.uid);
        }

        removePlayer(client);
    });

    ws.on("error", error => {
        console.warn(
            "WebSocket error:",
            error.message
        );
    });
});

// ============================================================
// SERVER TICK
// ============================================================

const tick = setInterval(() => {
    const now = Date.now();

    for (const room of rooms.values()) {
        tickRoom(room, now);
    }
}, TICK_MS);

tick.unref?.();

// ============================================================
// START SERVER
// ============================================================

server.listen(PORT, "0.0.0.0", () => {
    console.log(
        `VÉLORA co-op server listening on ${PORT}`
    );
});

// ============================================================
// SHUTDOWN
// ============================================================

function shutdown() {
    clearInterval(tick);

    for (const room of rooms.values()) {
        if (room.matchTimer) {
            clearTimeout(room.matchTimer);
        }

        broadcast(room, {
            type: "error",
            message: "Server restarting. Please reconnect."
        });
    }

    wss.close(() => {
        server.close(() => process.exit(0));
    });

    setTimeout(
        () => process.exit(0),
        5000
    ).unref();
}

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
