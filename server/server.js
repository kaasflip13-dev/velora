import express from "express";
import http from "node:http";
import { randomBytes } from "node:crypto";
import { WebSocketServer, WebSocket } from "ws";

import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";

// ======================================================
// VÉLORA CO-OP SERVER
// 1-4 PLAYERS PER ROOM
// ======================================================

const PORT = Number(process.env.PORT || 10000);

const MIN_PLAYERS = 1;
const MAX_PLAYERS = 4;
const MAX_SERVER_PLAYERS = 10;

const WORLD = { width: 2400, height: 1800 };

const TICK_MS = 50;
const SNAPSHOT_MS = 100;
const MISSION_TIME_MS = 180000;

const allowedOrigins = [...new Set([
    "https://kaasflip13-dev.github.io",
    "https://velora.partybag.com",
    ...(process.env.ALLOWED_ORIGINS || "")
        .split(",")
        .map(x => x.trim().replace(/\/+$/, ""))
        .filter(Boolean)
])];

// ======================================================
// FIREBASE ADMIN
// ======================================================

const serviceAccountRaw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;

if (!serviceAccountRaw) {
    throw new Error("Missing FIREBASE_SERVICE_ACCOUNT_JSON");
}

const serviceAccount = JSON.parse(serviceAccountRaw);

if (!getApps().length) {
    initializeApp({
        credential: cert(serviceAccount)
    });
}

const firebaseAuth = getAuth();

// ======================================================
// HTTP
// ======================================================

const app = express();

app.disable("x-powered-by");

const rooms = new Map();
const socketsByUid = new Map();

app.get("/", (_req, res) => {
    res.send("VÉLORA CO-OP SERVER ONLINE");
});

app.get("/health", (_req, res) => {
    res.json({
        status: "ok",
        service: "velora-coop-multiplayer",
        rooms: rooms.size,
        players: socketsByUid.size,
        minimumPlayers: MIN_PLAYERS,
        maximumPlayersPerRoom: MAX_PLAYERS,
        uptime: Math.floor(process.uptime())
    });
});

const server = http.createServer(app);

const wss = new WebSocketServer({
    noServer: true,
    maxPayload: 16384
});

// ======================================================
// HELPERS
// ======================================================

function send(ws, data) {
    if (ws?.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(data));
    }
}

function broadcast(room, data) {
    for (const player of room.players.values()) {
        send(player.ws, data);
    }
}

function makeCode() {
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    let code;

    do {
        code = [...randomBytes(6)]
            .map(b => chars[b % chars.length])
            .join("");
    } while (rooms.has(code));

    return code;
}

function safeName(value) {
    return String(value || "Explorer")
        .replace(/[<>\u0000-\u001f]/g, "")
        .trim()
        .slice(0, 22) || "Explorer";
}

function distance(a, b) {
    return Math.hypot(a.x - b.x, a.y - b.y);
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
        kills: p.kills,
        coins: p.coins || 0
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
        players: [...room.players.values()].map(p => ({
            ...publicPlayer(p),
            ready: Boolean(p.ready)
        }))
    };
}

// ======================================================
// ROOM MANAGEMENT
// ======================================================

function createRoom(mode, host) {
    const room = {
        code: makeCode(),
        mode,
        status: "lobby",
        hostUid: host.uid,
        players: new Map(),
        bots: [],
        coins: [],
        nextCoinId: 1,
        createdAt: Date.now(),
        missionEndsAt: 0,
        lastSnapshotAt: 0,
        matchTimer: null
    };

    rooms.set(room.code, room);
    return room;
}

function addPlayer(room, client) {
    if (room.players.size >= MAX_PLAYERS) return false;

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
        coins: 0,
        ready: false,

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

function roomUpdate(room) {
    broadcast(room, {
        type: "room_update",
        ...roomInfo(room)
    });
}

function checkAllReady(room) {
    if (!room || room.status !== "lobby") return;
    if (room.players.size < MIN_PLAYERS) return;

    for (const p of room.players.values()) {
        if (!p.ready) return;
    }

    startMission(room);
}

function removeRoomIfEmpty(room) {
    if (!room || room.players.size > 0) return;

    if (room.matchTimer) clearTimeout(room.matchTimer);
    rooms.delete(room.code);
}

function removePlayer(client) {
    if (!client?.roomCode) return;

    const room = rooms.get(client.roomCode);
    client.roomCode = null;

    if (!room) return;

    room.players.delete(client.uid);

    if (room.hostUid === client.uid) {
        room.hostUid = room.players.keys().next().value || null;
    }

    if (room.players.size === 0) {
        removeRoomIfEmpty(room);
        return;
    }

    broadcast(room, {
        type: "player_left",
        uid: client.uid,
        name: client.name
    });

    roomUpdate(room);
    checkAllReady(room);
}

// ======================================================
// BOTS
// ======================================================

function createBots() {
    const bots = [];

    for (let i = 0; i < 14; i++) {
        const brute = i % 5 === 4;
        const scout = i % 4 === 1;

        const hp = brute ? 210 : scout ? 65 : 110;

        bots.push({
            id: `bot-${i + 1}`,
            kind: brute ? "brute" : scout ? "scout" : "stalker",

            x: 980 + Math.random() * 1050,
            y: 180 + Math.random() * 1440,

            angle: Math.PI,
            hp,
            maxHp: hp,

            speed: brute ? 54 : scout ? 112 : 78,
            damage: brute ? 17 : scout ? 7 : 11,

            attackReadyAt: 0,
            hitUntil: 0,
            dead: false
        });
    }

    return bots;
}

// ======================================================
// SNAPSHOTS
// ======================================================

function missionSnapshot(room) {
    return {
        type: "snapshot",
        code: room.code,
        status: room.status,

        timeLeft: Math.max(0, room.missionEndsAt - Date.now()),

        players: [...room.players.values()].map(publicPlayer),

        coins: room.coins.map(c => ({
            id: c.id,
            x: c.x,
            y: c.y,
            value: c.value
        })),

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

// ======================================================
// START MISSION
// ======================================================

function startMission(room) {
    if (!room || room.status !== "lobby") return false;
    if (room.players.size < MIN_PLAYERS) return false;

    if (room.matchTimer) {
        clearTimeout(room.matchTimer);
        room.matchTimer = null;
    }

    room.status = "mission";
    room.bots = createBots();
    room.coins = [];
    room.nextCoinId = 1;
    room.missionEndsAt = Date.now() + MISSION_TIME_MS;

    let slot = 0;

    for (const p of room.players.values()) {
        p.x = 300 + slot * 55;
        p.y = 850 + (slot % 2 ? 45 : -45);
        p.hp = 100;
        p.downed = false;
        p.respawnAt = 0;
        p.kills = 0;
        p.attackReadyAt = 0;
        p.specialReadyAt = 0;
        slot++;
    }

    broadcast(room, {
        ...missionSnapshot(room),
        type: "mission_started"
    });

    return true;
}

function finishMission(room, result) {
    if (room.status !== "mission") return;

    room.status = "finished";

    broadcast(room, {
        type: "mission_end",
        result,
        remainingBots: room.bots.filter(b => !b.dead).length,
        totalBots: room.bots.length,
        players: [...room.players.values()].map(publicPlayer)
    });
}

// ======================================================
// COMBAT
// ======================================================

function angleDelta(a, b) {
    let d = (a - b + Math.PI) % (Math.PI * 2);
    if (d < 0) d += Math.PI * 2;
    return Math.abs(d - Math.PI);
}

function dropCoins(room, bot) {
    room.coins.push({
        id: `coin-${room.nextCoinId++}`,
        x: bot.x,
        y: bot.y,
        value: 5
    });
}

function handleAttack(room, player) {
    const now = Date.now();

    if (
        room.status !== "mission" ||
        player.downed ||
        now < player.attackReadyAt
    ) return;

    player.attackReadyAt = now + 330;

    const maxRange = 620;
    const dirX = Math.cos(player.angle);
    const dirY = Math.sin(player.angle);

    let target = null;
    let bestAlong = maxRange;

    for (const bot of room.bots) {
        if (bot.dead) continue;

        const dx = bot.x - player.x;
        const dy = bot.y - player.y;

        const along = dx * dirX + dy * dirY;

        if (along < 0 || along > maxRange) continue;

        const perpendicular = Math.abs(
            dx * dirY - dy * dirX
        );

        const botRadius =
            bot.kind === "brute" ? 27 :
            bot.kind === "scout" ? 15 : 20;

        if (perpendicular > botRadius + 19) continue;

        if (along < bestAlong) {
            bestAlong = along;
            target = bot;
        }
    }

    const endDistance = target ? bestAlong : maxRange;

    const endPoint = {
        x: player.x + dirX * endDistance,
        y: player.y + dirY * endDistance
    };

    let killed = false;

    if (target) {
        target.hp = Math.max(0, target.hp - 42);
        target.hitUntil = now + 180;

        if (target.hp <= 0 && !target.dead) {
            target.dead = true;
            player.kills++;
            killed = true;
            dropCoins(room, target);
        }
    }

    broadcast(room, {
        type: "attack_event",
        uid: player.uid,
        from: { x: player.x, y: player.y },
        to: target
            ? { x: target.x, y: target.y }
            : endPoint,
        hit: Boolean(target),
        targetId: target?.id || null,
        damage: target ? 42 : 0,
        killed
    });
}

function handleSpecial(room, player) {
    const now = Date.now();

    if (
        room.status !== "mission" ||
        player.downed ||
        now < player.specialReadyAt
    ) return;

    player.specialReadyAt = now + 5000;

    const radius = 230;
    const damage = 85;

    for (const bot of room.bots) {
        if (bot.dead || distance(player, bot) > radius) continue;

        bot.hp = Math.max(0, bot.hp - damage);
        bot.hitUntil = now + 260;

        if (bot.hp <= 0 && !bot.dead) {
            bot.dead = true;
            player.kills++;
            dropCoins(room, bot);
        }

        broadcast(room, {
            type: "bot_hit",
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
        radius
    });
}

function handleRevive(room, player) {
    const now = Date.now();

    if (now - player.lastReviveAt < 1000) return;
    player.lastReviveAt = now;

    const target = [...room.players.values()].find(p =>
        p.uid !== player.uid &&
        p.downed &&
        distance(player, p) < 95
    );

    if (!target) return;

    target.downed = false;
    target.hp = 45;
    target.respawnAt = 0;

    broadcast(room, {
        type: "player_revived",
        uid: target.uid,
        by: player.uid
    });
}

// ======================================================
// MESSAGE HANDLING
// ======================================================

function processMessage(client, message) {
    const type = message.type;

    if (type === "create_room") {
        removePlayer(client);

        const mode = String(message.mode || "quick").slice(0, 20);
        const room = createRoom(mode, client);

        if (!addPlayer(room, client)) return;

        send(client.ws, {
            type: "room_joined",
            ...roomInfo(room),
            yourUid: client.uid
        });

        roomUpdate(room);
        return;
    }

    if (type === "join_room") {
        const code = String(message.code || "")
            .trim()
            .toUpperCase();

        const room = rooms.get(code);

        if (!room) {
            return send(client.ws, {
                type: "error",
                message: "Room not found."
            });
        }

        if (room.status !== "lobby") {
            return send(client.ws, {
                type: "error",
                message: "Mission already started."
            });
        }

        if (room.players.size >= MAX_PLAYERS) {
            return send(client.ws, {
                type: "error",
                message: "Room is full."
            });
        }

        removePlayer(client);

        if (!addPlayer(room, client)) return;

        send(client.ws, {
            type: "room_joined",
            ...roomInfo(room),
            yourUid: client.uid
        });

        broadcast(room, {
            type: "player_joined",
            player: publicPlayer(room.players.get(client.uid))
        });

        roomUpdate(room);
        return;
    }

    if (type === "set_ready") {
        const room = rooms.get(client.roomCode);
        const player = room?.players.get(client.uid);

        if (!room || !player || room.status !== "lobby") return;

        player.ready = Boolean(message.ready);
        roomUpdate(room);
        checkAllReady(room);
        return;
    }

    if (type === "input") {
        const room = rooms.get(client.roomCode);
        const player = room?.players.get(client.uid);

        if (!room || room.status !== "mission" || !player || player.downed) {
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

    if (["attack", "special", "revive"].includes(type)) {
        const room = rooms.get(client.roomCode);
        const player = room?.players.get(client.uid);

        if (!room || !player) return;

        if (type === "attack") {
            const angle = Number(message.angle);
            if (Number.isFinite(angle)) player.angle = angle;
            handleAttack(room, player);
        }

        if (type === "special") handleSpecial(room, player);
        if (type === "revive") handleRevive(room, player);

        return;
    }

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

    if (type === "leave_room") {
        removePlayer(client);
        send(client.ws, { type: "room_left" });
        return;
    }

    send(client.ws, {
        type: "error",
        message: "Unknown multiplayer command: " + type
    });
}

// ======================================================
// GAME TICK
// ======================================================

function tickRoom(room, now) {
    if (room.status !== "mission") return;

    const dt = TICK_MS / 1000;

    // PLAYER MOVEMENT
    for (const p of room.players.values()) {
        if (p.downed) {
            if (now >= p.respawnAt) {
                p.downed = false;
                p.hp = 55;
                p.x = 300 + Math.random() * 70;
                p.y = 850 + Math.random() * 120;

                broadcast(room, {
                    type: "player_respawned",
                    uid: p.uid,
                    x: p.x,
                    y: p.y
                });
            }

            continue;
        }

        const speed = p.input.sprint ? 330 : 230;

        p.x = Math.max(
            65,
            Math.min(WORLD.width - 65, p.x + p.input.x * speed * dt)
        );

        p.y = Math.max(
            65,
            Math.min(WORLD.height - 65, p.y + p.input.y * speed * dt)
        );
    }

    // BOT AI
    for (const bot of room.bots) {
        if (bot.dead) continue;

        const targets = [...room.players.values()].filter(p => !p.downed);
        if (!targets.length) continue;

        let target = targets[0];
        let best = distance(bot, target);

        for (const p of targets.slice(1)) {
            const d = distance(bot, p);

            if (d < best) {
                best = d;
                target = p;
            }
        }

        bot.angle = Math.atan2(
            target.y - bot.y,
            target.x - bot.x
        );

        const attackRange = bot.kind === "brute" ? 49 : 39;

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
                bot.kind === "scout" ? 950 : 1250
            );

            target.hp = Math.max(0, target.hp - bot.damage);

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

    // COIN PICKUPS
    // Shared coins: the first player who touches a coin gets it.
    for (const p of room.players.values()) {
        if (p.downed) continue;

        for (let i = room.coins.length - 1; i >= 0; i--) {
            const coin = room.coins[i];

            if (distance(p, coin) <= 42) {
                p.coins = (p.coins || 0) + coin.value;
                room.coins.splice(i, 1);

                broadcast(room, {
                    type: "coin_collected",
                    uid: p.uid,
                    value: coin.value,
                    total: p.coins,
                    x: coin.x,
                    y: coin.y
                });
            }
        }
    }

    // WIN / TIMEOUT
    if (room.bots.every(b => b.dead)) {
        finishMission(room, "victory");
    } else if (now >= room.missionEndsAt) {
        finishMission(room, "defeat");
    }

    // SNAPSHOT
    if (
        room.status === "mission" &&
        now - room.lastSnapshotAt >= SNAPSHOT_MS
    ) {
        room.lastSnapshotAt = now;
        broadcast(room, missionSnapshot(room));
    }
}

// ======================================================
// WEBSOCKET UPGRADE
// ======================================================

server.on("upgrade", (request, socket, head) => {
    const origin = request.headers.origin;

    const pathname = new URL(
        request.url || "/",
        "http://localhost"
    ).pathname;

    if (
        pathname !== "/ws" ||
        (origin && !allowedOrigins.includes(origin))
    ) {
        socket.write("HTTP/1.1 403 Forbidden\r\n\r\n");
        socket.destroy();
        return;
    }

    wss.handleUpgrade(request, socket, head, ws => {
        wss.emit("connection", ws, request);
    });
});

// ======================================================
// CONNECTION + FIREBASE AUTH
// ======================================================

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
                message: "Authentication timed out."
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
            if (message.type !== "auth" || typeof message.token !== "string") {
                ws.close(4001, "Send Firebase token first");
                return;
            }

            try {
                const decoded = await firebaseAuth.verifyIdToken(message.token);

                client.uid = decoded.uid;
                client.name = safeName(
                    decoded.name ||
                    decoded.email?.split("@")[0] ||
                    "Explorer"
                );

                const previous = socketsByUid.get(client.uid);

                if (!previous && socketsByUid.size >= MAX_SERVER_PLAYERS) {
                    send(ws, {
                        type: "error",
                        message: "Server full (10/10 players)."
                    });

                    ws.close(4029, "Server full");
                    return;
                }

                if (previous && previous !== ws) {
                    previous.close(4002, "Signed in from another tab");
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
                console.warn("Firebase auth failed:", error.message);

                send(ws, {
                    type: "error",
                    message: "Firebase authentication failed."
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
            console.error("Message error:", error);

            send(ws, {
                type: "error",
                message: "Server could not process that action."
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
        console.warn("WebSocket error:", error.message);
    });
});

// ======================================================
// SERVER LOOP
// ======================================================

const tick = setInterval(() => {
    const now = Date.now();

    for (const room of rooms.values()) {
        tickRoom(room, now);
    }
}, TICK_MS);

tick.unref?.();

// ======================================================
// START
// ======================================================

server.listen(PORT, "0.0.0.0", () => {
    console.log(`VÉLORA CO-OP SERVER running on port ${PORT}`);
});

// ======================================================
// SHUTDOWN
// ======================================================

function shutdown() {
    clearInterval(tick);

    for (const room of rooms.values()) {
        if (room.matchTimer) clearTimeout(room.matchTimer);

        broadcast(room, {
            type: "error",
            message: "Server restarting. Please reconnect."
        });
    }

    wss.close(() => {
        server.close(() => process.exit(0));
    });

    setTimeout(() => process.exit(0), 5000).unref();
}

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
