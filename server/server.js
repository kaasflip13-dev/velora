// ======================================================
// VÉLORA FPS — CO-OP ROOM SERVER
// Rooms (max 4 spelers), Firebase-authenticatie, en een
// relay: de host-client draait de vijanden, de server
// verdeelt alleen berichten. Daardoor is de server licht.
// ======================================================

import express from "express";
import http from "node:http";
import crypto from "node:crypto";
import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { WebSocketServer, WebSocket } from "ws";

const PORT = process.env.PORT || 3000;
const MAX_PLAYERS = 4;
const MAX_SERVER_PLAYERS = 40;
const MAX_MSG_BYTES = 4096;
const MAX_MSGS_PER_SEC = 80;
const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

const allowedOrigins = [...new Set([
    "https://kaasflip13-dev.github.io",
    "https://velora.partybag.com",
    "http://localhost:5500",
    "http://127.0.0.1:5500",
    "http://localhost:8080",
    "http://localhost:3000",
    ...(process.env.ALLOWED_ORIGINS || "")
        .split(",").map(x => x.trim().replace(/\/+$/, "")).filter(Boolean)
])];

// ---------- Firebase Admin ----------
// Lokaal testen zonder Firebase: zet DEV_NO_AUTH=1 (nooit in productie!).
const DEV_NO_AUTH = process.env.DEV_NO_AUTH === "1";
let firebaseAuth = null;

if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
    if (!getApps().length) {
        initializeApp({ credential: cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON)) });
    }
    firebaseAuth = getAuth();
} else if (!DEV_NO_AUTH) {
    throw new Error("Missing FIREBASE_SERVICE_ACCOUNT_JSON");
}

// ---------- HTTP ----------
const app = express();
app.get("/", (_req, res) => res.send("VÉLORA FPS server is running."));
app.get("/health", (_req, res) => res.json({ ok: true, rooms: rooms.size, players: socketsByUid.size }));

const server = http.createServer(app);
const wss = new WebSocketServer({ noServer: true, maxPayload: MAX_MSG_BYTES });

// ---------- State ----------
const rooms = new Map();        // code -> { code, host, members: Map(uid -> client), started }
const socketsByUid = new Map(); // uid -> ws

const send = (ws, obj) => { if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(obj)); };
const safeName = n => String(n || "Explorer").replace(/[^\p{L}\p{N} _.\-]/gu, "").trim().slice(0, 16) || "Explorer";

function makeCode() {
    for (let tries = 0; tries < 50; tries++) {
        let c = "";
        for (let i = 0; i < 6; i++) c += CODE_CHARS[crypto.randomInt(CODE_CHARS.length)];
        if (!rooms.has(c)) return c;
    }
    throw new Error("No room code available");
}

const roomInfo = room => ({
    code: room.code,
    host: room.host,
    started: room.started,
    players: [...room.members.values()].map(m => ({ uid: m.uid, name: m.name }))
});

function broadcastRoom(room, type = "room_update") {
    const info = { type, ...roomInfo(room) };
    for (const m of room.members.values()) send(m.ws, info);
}

function leaveRoom(client, reason) {
    const room = client.room;
    if (!room) return;
    client.room = null;
    room.members.delete(client.uid);

    if (room.host === client.uid || room.members.size === 0) {
        // De host bepaalt het spel: als hij weggaat sluit de room.
        for (const m of room.members.values()) {
            m.room = null;
            send(m.ws, { type: "room_closed", reason: reason || "De host heeft de room verlaten." });
        }
        rooms.delete(room.code);
    } else {
        broadcastRoom(room);
    }
}

// ---------- Berichten ----------
function handle(client, m) {
    switch (m.type) {
        case "create_room": {
            if (client.room) leaveRoom(client);
            const code = makeCode();
            const room = { code, host: client.uid, members: new Map(), started: false };
            room.members.set(client.uid, client);
            client.room = room;
            rooms.set(code, room);
            broadcastRoom(room, "room_joined");
            break;
        }
        case "join_room": {
            const code = String(m.code || "").toUpperCase().slice(0, 6);
            const room = rooms.get(code);
            if (!room) return send(client.ws, { type: "error", message: "Room niet gevonden." });
            if (room.started) return send(client.ws, { type: "error", message: "Het spel is al begonnen." });
            if (room.members.size >= MAX_PLAYERS && !room.members.has(client.uid))
                return send(client.ws, { type: "error", message: `Room is vol (${MAX_PLAYERS}/${MAX_PLAYERS}).` });
            if (client.room) leaveRoom(client);
            room.members.set(client.uid, client);
            client.room = room;
            broadcastRoom(room, "room_joined");
            break;
        }
        case "leave_room":
            leaveRoom(client);
            break;
        case "set_started": {
            const room = client.room;
            if (!room || room.host !== client.uid) return;
            room.started = !!m.value;
            broadcastRoom(room);
            break;
        }
        case "relay": {
            const room = client.room;
            if (!room || typeof m.data !== "object" || m.data === null) return;
            const out = { type: "relay", from: client.uid, data: m.data };
            if (m.to) {
                const target = room.members.get(String(m.to));
                if (target) send(target.ws, out);
            } else {
                for (const other of room.members.values()) if (other !== client) send(other.ws, out);
            }
            break;
        }
        default:
            send(client.ws, { type: "error", message: "Onbekend bericht." });
    }
}

// ---------- WebSocket ----------
server.on("upgrade", (req, socket, head) => {
    let pathname = "";
    try { pathname = new URL(req.url, "http://localhost").pathname; } catch {}
    const origin = (req.headers.origin || "").replace(/\/+$/, "");

    if (pathname !== "/ws" || !allowedOrigins.includes(origin)) {
        socket.write("HTTP/1.1 403 Forbidden\r\n\r\n");
        socket.destroy();
        return;
    }
    wss.handleUpgrade(req, socket, head, ws => wss.emit("connection", ws, req));
});

wss.on("connection", ws => {
    const client = { ws, uid: null, name: "", room: null, authenticated: false, bucket: MAX_MSGS_PER_SEC, last: Date.now() };
    const authTimeout = setTimeout(() => { if (!client.authenticated) ws.close(4000, "Auth timeout"); }, 10000);

    ws.on("message", async raw => {
        // simpele rate limit (token bucket)
        const now = Date.now();
        client.bucket = Math.min(MAX_MSGS_PER_SEC, client.bucket + (now - client.last) / 1000 * MAX_MSGS_PER_SEC);
        client.last = now;
        if (client.bucket < 1) return;
        client.bucket -= 1;

        if (raw.length > MAX_MSG_BYTES) return;
        let m;
        try { m = JSON.parse(raw.toString()); } catch { return; }
        if (!m || typeof m !== "object") return;

        if (!client.authenticated) {
            if (m.type !== "auth" || typeof m.token !== "string") return ws.close(4001, "Send token first");
            try {
                let uid, name;
                if (firebaseAuth) {
                    const d = await firebaseAuth.verifyIdToken(m.token);
                    uid = d.uid; name = d.name || d.email?.split("@")[0];
                } else {            // DEV_NO_AUTH
                    uid = "dev_" + m.token.slice(0, 20); name = "Dev " + m.token.slice(0, 6);
                }
                if (!socketsByUid.has(uid) && socketsByUid.size >= MAX_SERVER_PLAYERS) {
                    send(ws, { type: "error", message: "Server vol." });
                    return ws.close(4029, "Server full");
                }
                const prev = socketsByUid.get(uid);
                if (prev && prev !== ws) prev.close(4002, "Signed in elsewhere");

                client.uid = uid; client.name = safeName(name); client.authenticated = true;
                clearTimeout(authTimeout);
                socketsByUid.set(uid, ws);
                ws._client = client;
                send(ws, { type: "authenticated", uid, name: client.name });
            } catch (e) {
                console.warn("Auth failed:", e.message);
                send(ws, { type: "error", message: "Firebase authenticatie mislukt." });
                ws.close(4003, "Invalid token");
            }
            return;
        }

        try { handle(client, m); }
        catch (e) { console.error(e); send(ws, { type: "error", message: "Server fout." }); }
    });

    ws.on("close", () => {
        clearTimeout(authTimeout);
        if (client.authenticated) {
            if (socketsByUid.get(client.uid) === ws) socketsByUid.delete(client.uid);
            leaveRoom(client, "Een speler verbrak de verbinding.");
        }
    });
    ws.on("error", () => {});
});

// Heartbeat: verwijder dode verbindingen
setInterval(() => {
    for (const ws of wss.clients) {
        if (ws._alive === false) { ws.terminate(); continue; }
        ws._alive = false; ws.ping();
    }
}, 30000);
wss.on("connection", ws => { ws._alive = true; ws.on("pong", () => { ws._alive = true; }); });

server.listen(PORT, () => console.log(`VÉLORA FPS server on :${PORT}`));
