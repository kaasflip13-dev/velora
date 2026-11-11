
import express from "express";
import http from "node:http";
import crypto from "node:crypto";
import { initializeApp, cert } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { WebSocketServer, WebSocket } from "ws";

// ==========================================
// VÉLORA MULTIPLAYER SERVER
// ==========================================

const PORT = process.env.PORT || 3000;
const MAX_PLAYERS = 10;
const ROOM_CODE_LENGTH = 6;

const allowedOrigins = (
    process.env.ALLOWED_ORIGINS ||
    "https://kaasflip13-dev.github.io,http://localhost:5500,http://127.0.0.1:5500"
)
    .split(",")
    .map(value => value.trim())
    .filter(Boolean);

// ==========================================
// FIREBASE ADMIN
// ==========================================

if (!process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
    throw new Error("Missing FIREBASE_SERVICE_ACCOUNT_JSON environment variable");
}

const serviceAccount = JSON.parse(
    process.env.FIREBASE_SERVICE_ACCOUNT_JSON
);

initializeApp({
    credential: cert(serviceAccount)
});

const firebaseAuth = getAuth();

// ==========================================
// HTTP SERVER
// ==========================================

const app = express();
const server = http.createServer(app);

app.get("/", (req, res) => {
    res.json({
        name: "VÉLORA Multiplayer",
        status: "online",
        maxPlayersPerRoom: MAX_PLAYERS
    });
});

app.get("/health", (req, res) => {
    res.status(200).json({
        status: "ok",
        service: "velora-multiplayer",
        rooms: rooms.size,
        uptime: Math.floor(process.uptime())
    });
});

const wss = new WebSocketServer({
    noServer: true,
    maxPayload: 4096
});

// ==========================================
// ROOM STORAGE
// ==========================================

const rooms = new Map();
const clients = new Set();

function createRoomCode() {
    const characters = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

    let code;

    do {
        code = "";

        for (let i = 0; i < ROOM_CODE_LENGTH; i++) {
            code += characters[
                crypto.randomInt(characters.length)
            ];
        }
    } while (rooms.has(code));

    return code;
}

// ==========================================
// MESSAGE HELPERS
// ==========================================

function send(ws, type, data = {}) {
    if (ws.readyState !== WebSocket.OPEN) return;

    ws.send(JSON.stringify({
        type,
        ...data
    }));
}

function broadcast(room, type, data = {}, exceptUid = null) {
    for (const player of room.players.values()) {
        if (player.uid === exceptUid) continue;

        if (player.ws.readyState === WebSocket.OPEN) {
            send(player.ws, type, data);
        }
    }
}

function getRoomState(room) {
    return {
        code: room.code,
        hostUid: room.hostUid,
        maxPlayers: MAX_PLAYERS,
        playerCount: room.players.size,
        players: [...room.players.values()].map(player => ({
            uid: player.uid,
            name: player.name,
            x: player.x,
            y: player.y,
            angle: player.angle
        }))
    };
}

// ==========================================
// ROOM LEAVING
// ==========================================

function leaveRoom(ws) {
    if (!ws.roomCode || !ws.user) return;

    const room = rooms.get(ws.roomCode);

    if (!room) {
        ws.roomCode = null;
        return;
    }

    const uid = ws.user.uid;
    const player = room.players.get(uid);

    // Only remove this connection's player entry.
    if (player && player.ws === ws) {
        room.players.delete(uid);

        broadcast(room, "player_left", {
            uid,
            playerCount: room.players.size
        });

        if (room.players.size === 0) {
            rooms.delete(room.code);
        } else {
            if (room.hostUid === uid) {
                room.hostUid = room.players.keys().next().value;
            }

            broadcast(room, "room_update", getRoomState(room));
        }
    }

    ws.roomCode = null;
}

// ==========================================
// CREATE ROOM
// ==========================================

function createRoom(ws) {
    if (ws.roomCode) {
        leaveRoom(ws);
    }

    const code = createRoomCode();

    const room = {
        code,
        hostUid: ws.user.uid,
        players: new Map(),
        createdAt: Date.now()
    };

    rooms.set(code, room);

    addPlayerToRoom(ws, room);
}

// ==========================================
// JOIN ROOM
// ==========================================

function joinRoom(ws, requestedCode) {
    const code = String(requestedCode || "")
        .trim()
        .toUpperCase();

    if (!/^[A-HJ-NP-Z2-9]{6}$/.test(code)) {
        return send(ws, "error", {
            message: "Invalid room code."
        });
    }

    const room = rooms.get(code);

    if (!room) {
        return send(ws, "error", {
            message: "Room not found."
        });
    }

    if (room.players.size >= MAX_PLAYERS &&
        !room.players.has(ws.user.uid)) {
        return send(ws, "error", {
            message: "This room is full (10/10)."
        });
    }

    if (ws.roomCode) {
        leaveRoom(ws);
    }

    addPlayerToRoom(ws, room);
}

// ==========================================
// ADD PLAYER
// ==========================================

function addPlayerToRoom(ws, room) {
    const user = ws.user;

    // Replace an older connection for the same account.
    const previous = room.players.get(user.uid);

    if (previous && previous.ws !== ws) {
        send(previous.ws, "error", {
            message: "Your account connected from another session."
        });

        previous.ws.close(4001, "Replaced by another session");
    }

    const player = {
        uid: user.uid,
        name: user.name || "Explorer",
        x: 0,
        y: 0,
        angle: 0,
        ws
    };

    room.players.set(user.uid, player);
    ws.roomCode = room.code;

    send(ws, "room_joined", {
        ...getRoomState(room),
        yourUid: user.uid
    });

    broadcast(room, "player_joined", {
        player: {
            uid: player.uid,
            name: player.name,
            x: player.x,
            y: player.y,
            angle: player.angle
        },
        playerCount: room.players.size
    }, user.uid);
}

// ==========================================
// PLAYER MOVEMENT
// ==========================================

function movePlayer(ws, data) {
    if (!ws.roomCode) return;

    const room = rooms.get(ws.roomCode);
    if (!room) return;

    const player = room.players.get(ws.user.uid);

    if (!player || player.ws !== ws) return;

    // Limit movement messages to 20 per second.
    const now = Date.now();

    if (now - (ws.lastMoveAt || 0) < 50) return;

    ws.lastMoveAt = now;

    const x = Number(data.x);
    const y = Number(data.y);
    const angle = Number(data.angle);

    if (
        !Number.isFinite(x) ||
        !Number.isFinite(y) ||
        !Number.isFinite(angle) ||
        Math.abs(x) > 100000 ||
        Math.abs(y) > 100000
    ) {
        return;
    }

    player.x = x;
    player.y = y;
    player.angle = angle;

    broadcast(room, "player_moved", {
        uid: player.uid,
        x: player.x,
        y: player.y,
        angle: player.angle
    }, player.uid);
}

// ==========================================
// WEBSOCKET AUTHENTICATION
// ==========================================

async function authenticate(ws, token) {
    if (ws.user) return;

    if (typeof token !== "string" || token.length > 10000) {
        send(ws, "error", {
            message: "Invalid login token."
        });

        return ws.close(4002, "Invalid token");
    }

    try {
        const decoded = await firebaseAuth.verifyIdToken(token);

        ws.user = {
            uid: decoded.uid,
            name: decoded.name || decoded.email || "Explorer"
        };

        clearTimeout(ws.authTimeout);

        send(ws, "authenticated", {
            uid: decoded.uid,
            name: ws.user.name
        });

    } catch (error) {
        console.error("Authentication failed:", error.message);

        send(ws, "error", {
            message: "Google login verification failed."
        });

        ws.close(4003, "Authentication failed");
    }
}

// ==========================================
// WEBSOCKET MESSAGE HANDLER
// ==========================================

wss.on("connection", (ws) => {
    clients.add(ws);

    ws.user = null;
    ws.roomCode = null;
    ws.isAlive = true;

    ws.authTimeout = setTimeout(() => {
        if (!ws.user) {
            ws.close(4000, "Authentication timeout");
        }
    }, 10000);

    ws.on("pong", () => {
        ws.isAlive = true;
    });

    ws.on("message", async (raw) => {
        let data;

        try {
            data = JSON.parse(raw.toString());
        } catch {
            return send(ws, "error", {
                message: "Invalid message."
            });
        }

        if (!data || typeof data.type !== "string") return;

        if (data.type === "auth") {
            return authenticate(ws, data.token);
        }

        if (!ws.user) {
            return send(ws, "error", {
                message: "Please authenticate first."
            });
        }

        switch (data.type) {
            case "create_room":
                createRoom(ws);
                break;

            case "join_room":
                joinRoom(ws, data.code);
                break;

            case "leave_room":
                leaveRoom(ws);
                send(ws, "room_left");
                break;

            case "move":
                movePlayer(ws, data);
                break;

            case "get_room":
                if (ws.roomCode) {
                    const room = rooms.get(ws.roomCode);

                    if (room) {
                        send(ws, "room_update", getRoomState(room));
                    }
                }
                break;

            default:
                send(ws, "error", {
                    message: "Unknown message type."
                });
        }
    });

    ws.on("close", () => {
        clearTimeout(ws.authTimeout);
        leaveRoom(ws);
        clients.delete(ws);
    });

    ws.on("error", (error) => {
        console.error("WebSocket error:", error.message);
    });
});

// ==========================================
// CONNECTION UPGRADE
// ==========================================

server.on("upgrade", (request, socket, head) => {
    const origin = request.headers.origin;

    if (!origin || !allowedOrigins.includes(origin)) {
        socket.write("HTTP/1.1 403 Forbidden\r\n\r\n");
        socket.destroy();
        return;
    }

    const pathname = new URL(
        request.url,
        "http://localhost"
    ).pathname;

    if (pathname !== "/ws") {
        socket.write("HTTP/1.1 404 Not Found\r\n\r\n");
        socket.destroy();
        return;
    }

    wss.handleUpgrade(request, socket, head, (ws) => {
        wss.emit("connection", ws, request);
    });
});

// ==========================================
// HEARTBEAT
// ==========================================

const heartbeat = setInterval(() => {
    for (const ws of clients) {
        if (!ws.isAlive) {
            ws.terminate();
            continue;
        }

        ws.isAlive = false;
        ws.ping();
    }
}, 30000);

wss.on("close", () => clearInterval(heartbeat));

// ==========================================
// START SERVER
// ==========================================

server.listen(PORT, "0.0.0.0", () => {
    console.log("--------------------------------");
    console.log(" VÉLORA MULTIPLAYER ONLINE");
    console.log(" Port:", PORT);
    console.log(" Max players per room:", MAX_PLAYERS);
    console.log("--------------------------------");
});
