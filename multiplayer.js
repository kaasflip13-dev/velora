// ============================================================
// VÉLORA — CO-OP BLASTERS MODE
// Quick Match (4 players) + Private Rooms + shared bot combat
// This module is intentionally separate from the single-player
// app.js game loop. It uses the existing default Firebase Auth app.
// ============================================================

import { getApp, getApps, initializeApp } from "https://www.gstatic.com/firebasejs/12.17.1/firebase-app.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.17.1/firebase-auth.js";

// Reuse app.js's Firebase app when it exists; initialize it as a safe fallback.
const firebaseConfig = {
    apiKey: "AIzaSyC8PkUPS4X9d4VLyHGnkK8WW4MUDcdus6A",
    authDomain: "velora-5246f.firebaseapp.com",
    databaseURL: "https://velora-5246f-default-rtdb.europe-west1.firebasedatabase.app",
    projectId: "velora-5246f",
    storageBucket: "velora-5246f.firebasestorage.app",
    messagingSenderId: "688498933492",
    appId: "1:688498933492:web:b28f6aea2a6f5a9ff868a1",
    measurementId: "G-4855RPPXEF"
};

const firebaseApp = getApps().length ? getApp() : initializeApp(firebaseConfig);

const SERVER_URL = "wss://velora-7dxm.onrender.com/ws";
const WORLD = { width: 2400, height: 1800 };
const MAX_PLAYERS = 4;
const auth = getAuth(firebaseApp);

const menu = document.getElementById("menu");
const gameUI = document.getElementById("gameUI");
const menuContent = menu?.querySelector(".menu-content");

let signedInUser = auth.currentUser || null;
let socket = null;
let authReady = false;
let connectPromise = null;
let room = null;
let stage = null;
let canvas = null;
let ctx = null;
let rafId = 0;
let lastFrame = 0;
let inputSendTimer = 0;
let activeMission = false;
let endingMission = false;
let pointerDown = false;
let aimAngle = 0;
let camera = { x: 0, y: 0 };
let snapshot = {
    players: [],
    bots: [],
    timeLeft: 0,
    remainingBots: 0
};

let renderPlayers = new Map();
let effects = [];
let particles = [];
let damageFlash = 0;
let screenShake = 0;
let toastTimer = 0;
let toastText = "";

let roomCodeInput;
let quickButton;
let createButton;
let joinButton;
let joinButtonInput;
let menuStatus;
let lobbyBox;
let lobbyPlayers;
let lobbyCode;
let lobbyStatus;
let startButton;
let leaveButton;
let copyButton;
let returnButton;
let missionResult;
let missionHud;
let authUnsubscribe = null;

const keys = new Set();
const input = {
    x: 0,
    y: 0,
    sprint: false
};

// ============================================================
// MULTIPLAYER STYLE
// ============================================================

function addStyle() {
    if (document.getElementById("veloraMpStyle")) return;

    const style = document.createElement("style");
    style.id = "veloraMpStyle";

    style.textContent = `
      #veloraMpPanel{
        width:min(440px,92vw);
        margin:18px auto 0;
        padding:16px 18px;
        border:1px solid rgba(100,205,255,.24);
        border-radius:10px;
        background:rgba(4,12,28,.88);
        box-shadow:0 0 30px rgba(35,140,220,.12);
        color:#d9f5ff;
        font-family:Inter,sans-serif;
        text-align:center
      }

      #veloraMpPanel h2{
        margin:0 0 7px;
        color:#83ddff;
        font:700 15px Orbitron,sans-serif;
        letter-spacing:2px
      }

      #veloraMpPanel .mp-sub{
        margin:0 0 14px;
        color:#8caabd;
        font-size:11px;
        line-height:1.5
      }

      .mp-actions{
        display:grid;
        grid-template-columns:1fr 1fr;
        gap:8px
      }

      .mp-actions button,
      .mp-row button,
      .mp-lobby button{
        min-height:39px;
        padding:10px 12px;
        border:1px solid rgba(115,210,255,.35);
        border-radius:6px;
        background:linear-gradient(135deg,rgba(18,60,91,.95),rgba(10,27,48,.95));
        color:#d8f5ff;
        font:600 10px Orbitron,sans-serif;
        letter-spacing:1px;
        cursor:pointer;
        transition:.18s
      }

      .mp-actions button:hover,
      .mp-row button:hover,
      .mp-lobby button:hover{
        border-color:#8be5ff;
        box-shadow:0 0 16px rgba(80,200,255,.2)
      }

      .mp-actions button:disabled,
      .mp-row button:disabled,
      .mp-lobby button:disabled{
        opacity:.38;
        cursor:not-allowed;
        box-shadow:none
      }

      .mp-row{
        display:flex;
        gap:7px;
        margin-top:9px
      }

      .mp-row input{
        min-width:0;
        flex:1;
        padding:10px 12px;
        border:1px solid rgba(115,210,255,.25);
        border-radius:6px;
        background:rgba(1,8,18,.8);
        color:#e6f9ff;
        font:600 12px Orbitron,sans-serif;
        letter-spacing:3px;
        text-transform:uppercase;
        text-align:center;
        outline:none
      }

      #mpMenuStatus{
        min-height:18px;
        margin:10px 0 0;
        color:#91dfff;
        font-size:11px;
        line-height:1.4
      }

      .mp-lobby{
        margin-top:12px;
        padding:12px;
        border:1px solid rgba(115,210,255,.2);
        border-radius:8px;
        background:rgba(9,24,43,.72)
      }

      .mp-room-code{
        font:800 22px Orbitron,sans-serif;
        letter-spacing:6px;
        color:#a7ebff;
        margin:4px 0
      }

      .mp-lobby-title{
        font:600 10px Orbitron,sans-serif;
        letter-spacing:2px;
        color:#8dbbd0;
        margin:9px 0
      }

      #mpLobbyPlayers{
        display:grid;
        gap:6px;
        margin:9px 0
      }

      .mp-lobby-player{
        display:flex;
        justify-content:space-between;
        align-items:center;
        padding:7px 9px;
        border-radius:5px;
        background:rgba(25,55,78,.45);
        font-size:11px;
        color:#d5eff8
      }

      .mp-lobby-player small{
        color:#8eb2c2
      }

      .mp-lobby-controls{
        display:flex;
        gap:7px;
        justify-content:center;
        flex-wrap:wrap;
        margin-top:10px
      }

      #veloraMpStage{
        position:fixed;
        inset:0;
        z-index:99999;
        background:#020711;
        overflow:hidden;
        color:#e7f8ff;
        font-family:Inter,sans-serif
      }

      #veloraMpCanvas{
        display:block;
        width:100%;
        height:100%;
        touch-action:none
      }

      .mp-hud{
        position:absolute;
        inset:0;
        pointer-events:none;
        padding:18px;
        display:flex;
        justify-content:space-between;
        align-items:flex-start;
        gap:12px
      }

      .mp-hud-card{
        padding:12px 14px;
        border:1px solid rgba(113,211,255,.24);
        border-radius:8px;
        background:rgba(3,12,27,.82);
        box-shadow:0 0 22px rgba(60,160,220,.1);
        backdrop-filter:blur(8px)
      }

      .mp-hud-title{
        font:700 11px Orbitron,sans-serif;
        letter-spacing:2px;
        color:#83ddff;
        margin-bottom:7px
      }

      .mp-hud-main{
        font:700 20px Orbitron,sans-serif;
        color:#f0fbff
      }

      .mp-hud-meta{
        font-size:11px;
        color:#a5c4d2;
        margin-top:5px
      }

      .mp-hp-track{
        height:7px;
        width:190px;
        max-width:38vw;
        background:rgba(130,155,180,.22);
        border-radius:8px;
        overflow:hidden;
        margin-top:7px
      }

      .mp-hp-fill{
        height:100%;
        width:100%;
        background:linear-gradient(90deg,#42d9b5,#a5f7d8);
        transition:width .15s
      }

      .mp-hud-bottom{
        position:absolute;
        left:50%;
        bottom:16px;
        transform:translateX(-50%);
        padding:9px 13px;
        border:1px solid rgba(113,211,255,.18);
        border-radius:7px;
        background:rgba(3,12,27,.78);
        font-size:11px;
        color:#a8c8d9;
        white-space:nowrap;
        pointer-events:none
      }

      .mp-exit{
        position:absolute;
        right:18px;
        top:112px;
        pointer-events:auto;
        padding:8px 11px;
        border:1px solid rgba(255,140,150,.25);
        border-radius:5px;
        background:rgba(52,15,28,.72);
        color:#ffbdc5;
        font:600 9px Orbitron,sans-serif;
        letter-spacing:1px;
        cursor:pointer
      }

      .mp-toast{
        position:absolute;
        left:50%;
        top:19%;
        transform:translate(-50%,-50%);
        padding:10px 16px;
        border:1px solid rgba(120,220,255,.35);
        border-radius:7px;
        background:rgba(4,17,35,.88);
        color:#b9efff;
        font:700 11px Orbitron,sans-serif;
        letter-spacing:2px;
        text-align:center;
        opacity:0;
        transition:opacity .15s;
        pointer-events:none
      }

      .mp-result{
        position:absolute;
        inset:0;
        display:flex;
        align-items:center;
        justify-content:center;
        background:rgba(1,5,15,.72);
        backdrop-filter:blur(9px);
        padding:20px;
        pointer-events:auto
      }

      .mp-result-card{
        width:min(390px,92vw);
        padding:26px;
        border:1px solid rgba(120,220,255,.32);
        border-radius:12px;
        background:rgba(5,16,34,.96);
        box-shadow:0 0 50px rgba(30,150,255,.18);
        text-align:center
      }

      .mp-result-card h2{
        font:800 22px Orbitron,sans-serif;
        letter-spacing:3px;
        color:#96e8ff;
        margin:0 0 12px
      }

      .mp-result-card p{
        color:#a9c7d7;
        font-size:13px;
        line-height:1.5
      }

      .mp-result-card button{
        margin-top:13px;
        padding:12px 18px;
        border:1px solid #73dfff;
        border-radius:6px;
        background:rgba(20,75,110,.8);
        color:#effbff;
        font:700 10px Orbitron,sans-serif;
        letter-spacing:2px;
        cursor:pointer
      }

      @media(max-width:600px){
        .mp-hud{padding:9px}
        .mp-hud-card{padding:9px}
        .mp-hud-main{font-size:16px}
        .mp-hp-track{width:125px}
        .mp-hud-bottom{
          font-size:9px;
          max-width:92vw;
          white-space:normal;
          text-align:center
        }
        .mp-exit{top:95px;right:9px}
      }
    `;

    document.head.appendChild(style);
}

// ============================================================
// MULTIPLAYER MENU
// ============================================================

function buildMenu() {
    if (!menuContent || document.getElementById("veloraMpPanel")) return;

    addStyle();

    const panel = document.createElement("section");
    panel.id = "veloraMpPanel";

    panel.innerHTML = `
      <h2>CO-OP BLASTERS</h2>

      <p class="mp-sub">
        TEAM UP WITH 3 OTHER EXPLORERS.<br>
        TAKE DOWN THE BOT SWARM. MAX 4 PLAYERS.
      </p>

      <div class="mp-actions">
        <button type="button" id="mpQuickMatch">QUICK MATCH</button>
        <button type="button" id="mpCreateRoom">CREATE PRIVATE ROOM</button>
      </div>

      <div class="mp-row">
        <input
            id="mpJoinCode"
            maxlength="6"
            placeholder="ROOM CODE"
            aria-label="Private room code"
        >
        <button type="button" id="mpJoinRoom">JOIN</button>
      </div>

      <div id="mpMenuStatus" role="status" aria-live="polite">
        Sign in with Google to play online.
      </div>

      <div id="mpLobby" class="mp-lobby" hidden>
        <div class="mp-lobby-title">YOUR TEAM ROOM</div>
        <div id="mpRoomCode" class="mp-room-code">------</div>

        <div class="mp-lobby-title">
            EXPLORERS <span id="mpCount">1/4</span>
        </div>

        <div id="mpLobbyPlayers"></div>

        <div id="mpLobbyStatus" class="mp-sub">
            Waiting for your team...
        </div>

        <div class="mp-lobby-controls">
            <button type="button" id="mpCopyCode">COPY CODE</button>
            <button type="button" id="mpStartMission">START MISSION</button>
            <button type="button" id="mpLeaveRoom">LEAVE ROOM</button>
        </div>
      </div>
    `;

    const objective = menuContent.querySelector(".objective");
    menuContent.insertBefore(panel, objective || null);

    quickButton = panel.querySelector("#mpQuickMatch");
    createButton = panel.querySelector("#mpCreateRoom");
    joinButton = panel.querySelector("#mpJoinRoom");
    joinButtonInput = panel.querySelector("#mpJoinCode");
    menuStatus = panel.querySelector("#mpMenuStatus");
    lobbyBox = panel.querySelector("#mpLobby");
    lobbyPlayers = panel.querySelector("#mpLobbyPlayers");
    lobbyCode = panel.querySelector("#mpRoomCode");
    lobbyStatus = panel.querySelector("#mpLobbyStatus");
    startButton = panel.querySelector("#mpStartMission");
    leaveButton = panel.querySelector("#mpLeaveRoom");
    copyButton = panel.querySelector("#mpCopyCode");

    quickButton.addEventListener("click", () => runAction("quick_match"));
    createButton.addEventListener("click", () => runAction("create_room"));

    joinButton.addEventListener("click", () => {
        const code = joinButtonInput.value.trim().toUpperCase();

        if (code.length !== 6) {
            return setMenuStatus("Enter a 6-character room code.");
        }

        runAction("join_room", { code });
    });

    joinButtonInput.addEventListener("input", () => {
        joinButtonInput.value = joinButtonInput.value
            .toUpperCase()
            .replace(/[^A-Z0-9]/g, "")
            .slice(0, 6);
    });

    joinButtonInput.addEventListener("keydown", e => {
        if (e.key === "Enter") joinButton.click();
    });

    startButton.addEventListener("click", () => runAction("start_mission"));
    leaveButton.addEventListener("click", () => runAction("leave_room"));

    copyButton.addEventListener("click", async () => {
        if (!room?.code) return;

        try {
            await navigator.clipboard.writeText(room.code);
            setMenuStatus("Room code copied: " + room.code);
        } catch {
            setMenuStatus("Your room code is " + room.code + ". Copy it manually.");
        }
    });

    updateAuthButtons();
}

function setMenuStatus(text) {
    if (menuStatus) menuStatus.textContent = text;
}

function updateAuthButtons() {
    const ready = Boolean(signedInUser);

    for (const button of [quickButton, createButton, joinButton]) {
        if (button) button.disabled = !ready;
    }

    if (!ready && menuStatus && !room) {
        setMenuStatus("Sign in with Google to play online.");
    }

    if (ready && menuStatus && !room) {
        setMenuStatus("Choose Quick Match or create a private room.");
    }
}

function updateLobby() {
    if (!room || !lobbyBox) return;

    lobbyBox.hidden = false;
    lobbyCode.textContent = room.code || "------";

    const players = Array.isArray(room.players) ? room.players : [];

    panelText(
        lobbyStatus,
        room.mode === "quick"
            ? (
                room.status === "lobby"
                    ? "Searching for teammates... the mission starts when the team fills or the timer ends."
                    : "Preparing mission..."
            )
            : (
                room.status === "lobby"
                    ? "Share the room code. The host can start when everyone is ready."
                    : "Mission in progress."
            )
    );

    panelText(panelCount(), `${players.length}/${MAX_PLAYERS}`);

    lobbyPlayers.replaceChildren();

    for (const p of players) {
        const row = document.createElement("div");
        row.className = "mp-lobby-player";

        const name = document.createElement("span");
        name.textContent = p.name || "Explorer";

        const role = document.createElement("small");
        role.textContent = p.uid === room.hostUid ? "HOST" : "READY";

        row.append(name, role);
        lobbyPlayers.appendChild(row);
    }

    if (!players.length) {
        const empty = document.createElement("div");
        empty.className = "mp-lobby-player";
        empty.textContent = "Waiting for explorers...";
        lobbyPlayers.appendChild(empty);
    }

    const isHost = room.hostUid === signedInUser?.uid;

    startButton.hidden = room.mode === "quick";
    startButton.disabled = !isHost || room.status !== "lobby";
    copyButton.hidden = room.mode !== "private";
}

function panelCount() {
    return document.getElementById("mpCount");
}

function panelText(element, text) {
    if (element) element.textContent = text;
}

// ============================================================
// SERVER CONNECTION
// ============================================================

function connect() {
    if (socket?.readyState === WebSocket.OPEN && authReady) {
        return Promise.resolve();
    }

    if (connectPromise) return connectPromise;

    if (!signedInUser) {
        return Promise.reject(new Error("Sign in with Google first."));
    }

    connectPromise = new Promise(async (resolve, reject) => {
        try {
            const token = await signedInUser.getIdToken();

            socket = new WebSocket(SERVER_URL);

            const timeout = setTimeout(() => {
                if (!authReady) {
                    reject(new Error("Multiplayer server did not authenticate in time."));
                }
            }, 12000);

            socket.addEventListener("open", () => {
                socket.send(JSON.stringify({
                    type: "auth",
                    token
                }));
            }, { once: true });

            socket.addEventListener("message", event => {
                let data;

                try {
                    data = JSON.parse(event.data);
                } catch {
                    return;
                }

                handleServerMessage(data);

                if (data.type === "authenticated") {
                    authReady = true;
                    clearTimeout(timeout);
                    resolve();
                } else if (data.type === "error" && !authReady) {
                    clearTimeout(timeout);
                    reject(new Error(data.message || "Authentication failed."));
                }
            });

            socket.addEventListener("close", () => {
                const wasActive = activeMission || Boolean(room);

                authReady = false;
                socket = null;
                connectPromise = null;

                if (wasActive) showToast("CONNECTION LOST");

                if (activeMission) {
                    setMenuStatus("Connection lost. Return to the menu and reconnect.");
                }
            });

            socket.addEventListener("error", () => {
                if (!authReady) {
                    clearTimeout(timeout);
                    reject(new Error("Could not connect to the multiplayer server."));
                }
            });

        } catch (error) {
            reject(error);
        }
    }).finally(() => {
        connectPromise = null;
    });

    return connectPromise;
}

async function runAction(type, payload = {}) {
    if (!signedInUser) {
        return setMenuStatus("Sign in with Google before entering multiplayer.");
    }

    setMenuStatus(
        type === "quick_match"
            ? "Connecting to matchmaking..."
            : "Connecting..."
    );

    try {
        await connect();

        if (!socket || socket.readyState !== WebSocket.OPEN) {
            throw new Error("Connection closed. Try again.");
        }

        socket.send(JSON.stringify({
            type,
            ...payload
        }));

        if (type === "quick_match") {
            setMenuStatus("Finding explorers for your 4-player team...");
        }

        if (type === "create_room") {
            setMenuStatus("Creating your private room...");
        }

        if (type === "join_room") {
            setMenuStatus("Joining room " + payload.code + "...");
        }

    } catch (error) {
        setMenuStatus(error.message || "Multiplayer connection failed.");
    }
}

// ============================================================
// SERVER MESSAGES
// ============================================================

function handleServerMessage(data) {
    switch (data.type) {
        case "authenticated":
            break;

        case "room_joined":
        case "room_update":
            room = {
                code: data.code,
                mode: data.mode || room?.mode || "private",
                status: data.status || "lobby",
                hostUid: data.hostUid,
                players: data.players || [],
                maxPlayers: data.maxPlayers || MAX_PLAYERS
            };

            updateLobby();

            if (data.type === "room_joined") {
                setMenuStatus(
                    `Joined ${room.mode === "quick" ? "Quick Match" : "private room"} ${room.code}.`
                );
            }
            break;

        case "player_joined":
        case "player_left":
            runAction("get_room").catch(() => {});
            break;

        case "mission_started":
            room = {
                ...room,
                status: "mission"
            };

            beginMission(data);
            break;

        case "snapshot":
            snapshot = data;
            syncRenderPlayers(data.players || []);
            updateMissionHud();
            break;

        case "attack_event":
            addAttackEffect(data);
            break;

        case "special_event":
            addSpecialEffect(data);
            break;

        case "player_hit":
            if (data.uid === signedInUser?.uid) {
                damageFlash = 0.34;
                screenShake = Math.max(screenShake, 9);
            }

            addHitSparkForUid(data.uid);
            break;

        case "player_downed":
            showToast(
                data.uid === signedInUser?.uid
                    ? "YOU ARE DOWN — GET BACK UP!"
                    : "TEAMMATE DOWN — REVIVE WITH E"
            );
            break;

        case "player_revived":
            showToast("TEAMMATE REVIVED!");
            spawnBurst(data.x, data.y, "#7affdf", 24);
            break;

        case "player_respawned":
            showToast("BACK IN THE FIGHT!");
            spawnBurst(data.x, data.y, "#84eaff", 25);
            break;

        case "mission_end":
            finishMissionView(data);
            break;

        case "room_left":
            room = null;

            if (lobbyBox) lobbyBox.hidden = true;

            setMenuStatus("You left the room.");
            break;

        case "error":
            if (activeMission) {
                showToast(data.message || "SERVER ERROR");
            } else {
                setMenuStatus(data.message || "Multiplayer error.");
            }
            break;
    }
}

// ============================================================
// START MISSION SCENE
// ============================================================

function beginMission(data) {
    activeMission = true;
    endingMission = false;

    snapshot = data;

    effects = [];
    particles = [];
    renderPlayers.clear();

    syncRenderPlayers(data.players || []);

    if (menu) menu.hidden = true;
    if (gameUI) gameUI.hidden = true;

    if (stage) stage.remove();

    stage = document.createElement("div");
    stage.id = "veloraMpStage";

    stage.innerHTML = `
      <canvas id="veloraMpCanvas"></canvas>

      <div class="mp-hud">
        <div class="mp-hud-card">
          <div class="mp-hud-title">TEAM VÉLORA</div>
          <div class="mp-hud-main" id="mpHudHp">100 HP</div>
          <div class="mp-hp-track">
            <div class="mp-hp-fill" id="mpHudHpFill"></div>
          </div>
          <div class="mp-hud-meta" id="mpHudTeam">
            4 EXPLORERS • CO-OP
          </div>
        </div>

        <div class="mp-hud-card" style="text-align:right">
          <div class="mp-hud-title">BOT SWARM</div>
          <div class="mp-hud-main" id="mpHudBots">14 LEFT</div>
          <div class="mp-hud-meta" id="mpHudTimer">03:00</div>
        </div>
      </div>

      <button class="mp-exit" id="mpExitMission" type="button">
        LEAVE MISSION
      </button>

      <div class="mp-toast" id="mpToast"></div>

      <div class="mp-hud-bottom">
        WASD / ARROWS MOVE · SHIFT SPRINT · J / CLICK ATTACK · Q PULSE · E REVIVE
      </div>
    `;

    document.body.appendChild(stage);

    canvas = stage.querySelector("#veloraMpCanvas");
    ctx = canvas.getContext("2d", { alpha: false });

    stage.querySelector("#mpExitMission").addEventListener(
        "click",
        () => returnToMenu(true)
    );

    resizeStage();

    window.addEventListener("resize", resizeStage);

    canvas.addEventListener("pointermove", updateAimFromPointer);

    canvas.addEventListener("pointerdown", event => {
        if (event.button === 0) {
            pointerDown = true;
            sendCombatCommand("attack");
        }
    });

    canvas.addEventListener("pointerup", () => {
        pointerDown = false;
    });

    canvas.addEventListener("pointercancel", () => {
        pointerDown = false;
    });

    showToast("MISSION START — CLEAR THE BOT SWARM");

    lastFrame = performance.now();
    inputSendTimer = 0;

    rafId = requestAnimationFrame(missionFrame);
}

function resizeStage() {
    if (!canvas || !ctx) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);

    canvas.width = Math.round(window.innerWidth * dpr);
    canvas.height = Math.round(window.innerHeight * dpr);

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

function syncRenderPlayers(players) {
    const keep = new Set();

    for (const p of players) {
        keep.add(p.uid);

        const current = renderPlayers.get(p.uid);

        if (current) {
            current.tx = p.x;
            current.ty = p.y;
            current.angle = p.angle || 0;
            current.hp = p.hp;
            current.maxHp = p.maxHp;
            current.downed = p.downed;
            current.name = p.name;
            current.kills = p.kills || 0;

        } else {
            renderPlayers.set(p.uid, {
                uid: p.uid,
                x: p.x,
                y: p.y,
                tx: p.x,
                ty: p.y,
                angle: p.angle || 0,
                hp: p.hp,
                maxHp: p.maxHp,
                downed: p.downed,
                name: p.name,
                kills: p.kills || 0
            });
        }
    }

    for (const uid of renderPlayers.keys()) {
        if (!keep.has(uid)) renderPlayers.delete(uid);
    }
}

function localPlayer() {
    return renderPlayers.get(signedInUser?.uid);
}

function updateAimFromPointer(event) {
    const p = localPlayer();

    if (!p || !canvas) return;

    const rect = canvas.getBoundingClientRect();

    const sx = event.clientX - rect.left - rect.width / 2;
    const sy = event.clientY - rect.top - rect.height / 2;

    aimAngle = Math.atan2(sy, sx);
}

function sendCombatCommand(type) {
    if (
        !activeMission ||
        !socket ||
        socket.readyState !== WebSocket.OPEN ||
        !authReady
    ) {
        return;
    }

    socket.send(JSON.stringify({ type }));
}

// ============================================================
// GAME LOOP
// ============================================================

function missionFrame(now) {
    if (!activeMission || !canvas || !ctx) return;

    const dt = Math.min(
        0.04,
        Math.max(0, (now - lastFrame) / 1000)
    );

    lastFrame = now;
    inputSendTimer += dt;

    updateInputFromKeys();

    if (inputSendTimer >= 0.05) {
        inputSendTimer = 0;

        if (socket?.readyState === WebSocket.OPEN && authReady) {
            socket.send(JSON.stringify({
                type: "input",
                moveX: input.x,
                moveY: input.y,
                sprint: input.sprint,
                angle: aimAngle
            }));
        }
    }

    for (const p of renderPlayers.values()) {
        p.x += (p.tx - p.x) * Math.min(1, dt * 13);
        p.y += (p.ty - p.y) * Math.min(1, dt * 13);
    }

    updateEffects(dt);
    drawMission(now);
    updateMissionHud();

    rafId = requestAnimationFrame(missionFrame);
}

function updateInputFromKeys() {
    input.x =
        (keys.has("d") || keys.has("arrowright") ? 1 : 0) -
        (keys.has("a") || keys.has("arrowleft") ? 1 : 0);

    input.y =
        (keys.has("s") || keys.has("arrowdown") ? 1 : 0) -
        (keys.has("w") || keys.has("arrowup") ? 1 : 0);

    const length = Math.hypot(input.x, input.y);

    if (length > 1) {
        input.x /= length;
        input.y /= length;
    }

    input.sprint = keys.has("shift");

    if (!pointerDown && Math.hypot(input.x, input.y) > 0.1) {
        aimAngle = Math.atan2(input.y, input.x);
    }
}

// ============================================================
// VFX UPDATE
// ============================================================

function updateEffects(dt) {
    for (const effect of effects) {
        effect.life -= dt;
    }

    effects = effects.filter(effect => effect.life > 0);

    for (const particle of particles) {
        particle.x += particle.vx * dt;
        particle.y += particle.vy * dt;

        particle.vx *= Math.max(0, 1 - dt * 2.8);
        particle.vy *= Math.max(0, 1 - dt * 2.8);

        particle.life -= dt;
    }

    particles = particles.filter(p => p.life > 0);

    damageFlash = Math.max(0, damageFlash - dt);
    screenShake = Math.max(0, screenShake - dt * 28);
    toastTimer = Math.max(0, toastTimer - dt);

    const toast = stage?.querySelector("#mpToast");

    if (toast) {
        toast.textContent = toastText;
        toast.style.opacity = toastTimer > 0 ? "1" : "0";
    }
}

function addAttackEffect(data) {
    effects.push({
        kind: "slash",
        from: data.from,
        to: data.to,
        uid: data.uid,
        hit: data.hit,
        life: 0.24,
        maxLife: 0.24
    });

    if (data.hit) {
        spawnBurst(
            data.to.x,
            data.to.y,
            data.killed ? "#ffe58a" : "#8cecff",
            data.killed ? 28 : 14
        );

        effects.push({
            kind: "damage",
            x: data.to.x,
            y: data.to.y,
            value: data.damage,
            life: 0.7,
            maxLife: 0.7
        });
    }

    if (data.uid === signedInUser?.uid) {
        screenShake = Math.max(screenShake, data.hit ? 3 : 1.2);
    }
}

function addSpecialEffect(data) {
    effects.push({
        kind: "pulse",
        x: data.x,
        y: data.y,
        radius: data.radius,
        life: 0.55,
        maxLife: 0.55
    });

    spawnBurst(data.x, data.y, "#8ceaff", 44);

    for (const hit of data.hitBots || []) {
        spawnBurst(
            hit.x,
            hit.y,
            hit.killed ? "#ffe58a" : "#adf7ff",
            hit.killed ? 24 : 12
        );

        effects.push({
            kind: "damage",
            x: hit.x,
            y: hit.y,
            value: hit.damage,
            life: 0.7,
            maxLife: 0.7
        });
    }

    screenShake = Math.max(screenShake, 8);
}

function addHitSparkForUid(uid) {
    const p = renderPlayers.get(uid);

    if (p) {
        spawnBurst(p.x, p.y, "#ff8194", 12);
    }
}

function spawnBurst(x, y, color, count) {
    for (let i = 0; i < count; i++) {
        const angle = Math.random() * Math.PI * 2;
        const speed = 35 + Math.random() * 230;
        const life = 0.22 + Math.random() * 0.5;

        particles.push({
            x,
            y,
            vx: Math.cos(angle) * speed,
            vy: Math.sin(angle) * speed,
            life,
            maxLife: life,
            color,
            size: 1.5 + Math.random() * 3.8
        });
    }
}

function showToast(text) {
    toastText = String(text || "").slice(0, 90);
    toastTimer = 2.0;
}

// ============================================================
// DRAWING
// ============================================================

function drawMission(now) {
    const w = window.innerWidth;
    const h = window.innerHeight;
    const me = localPlayer();

    if (!me) return;

    const camTargetX = me.x - w / 2;
    const camTargetY = me.y - h / 2;

    camera.x += (
        Math.max(0, Math.min(WORLD.width - w, camTargetX)) - camera.x
    ) * 0.14;

    camera.y += (
        Math.max(0, Math.min(WORLD.height - h, camTargetY)) - camera.y
    ) * 0.14;

    const shakeX = screenShake
        ? (Math.random() - 0.5) * screenShake
        : 0;

    const shakeY = screenShake
        ? (Math.random() - 0.5) * screenShake
        : 0;

    ctx.save();
    ctx.translate(shakeX, shakeY);

    ctx.fillStyle = "#050d19";
    ctx.fillRect(-10, -10, w + 20, h + 20);

    drawGrid(w, h);
    drawArenaDecor(w, h, now);

    const glow = ctx.createRadialGradient(
        w / 2,
        h / 2,
        30,
        w / 2,
        h / 2,
        Math.max(w, h) * 0.72
    );

    glow.addColorStop(0, "rgba(14,54,79,.08)");
    glow.addColorStop(1, "rgba(0,0,0,.68)");

    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, w, h);

    for (const bot of snapshot.bots || []) {
        if (!bot.dead) drawBot(bot, now);
    }

    for (const p of renderPlayers.values()) {
        drawCoopPlayer(
            p,
            p.uid === signedInUser?.uid,
            now
        );
    }

    drawEffects();
    drawParticles();

    ctx.restore();

    if (damageFlash > 0) {
        ctx.fillStyle = `rgba(255,35,70,${damageFlash * 0.34})`;
        ctx.fillRect(0, 0, w, h);
    }
}

function drawGrid(w, h) {
    const size = 80;

    ctx.strokeStyle = "rgba(85,157,193,.09)";
    ctx.lineWidth = 1;

    const sx = -((camera.x % size) + size) % size;
    const sy = -((camera.y % size) + size) % size;

    ctx.beginPath();

    for (let x = sx; x < w; x += size) {
        ctx.moveTo(x, 0);
        ctx.lineTo(x, h);
    }

    for (let y = sy; y < h; y += size) {
        ctx.moveTo(0, y);
        ctx.lineTo(w, y);
    }

    ctx.stroke();

    ctx.strokeStyle = "rgba(88,185,224,.19)";
    ctx.strokeRect(
        -camera.x,
        -camera.y,
        WORLD.width,
        WORLD.height
    );
}

function drawArenaDecor(w, h, now) {
    for (let i = 0; i < 34; i++) {
        const xw = ((i * 317) % 2280) + 60;
        const yw = ((i * 193) % 1680) + 60;

        const x = xw - camera.x;
        const y = yw - camera.y;

        if (
            x < -30 ||
            y < -30 ||
            x > w + 30 ||
            y > h + 30
        ) {
            continue;
        }

        const pulse = 0.5 + Math.sin(now * 0.0018 + i) * 0.22;

        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(i * 0.61);

        ctx.shadowBlur = 13;
        ctx.shadowColor = "#40aeca";
        ctx.fillStyle = `rgba(76,177,197,${pulse * 0.28})`;

        ctx.beginPath();
        ctx.moveTo(0, -9);
        ctx.lineTo(6, 0);
        ctx.lineTo(0, 9);
        ctx.lineTo(-6, 0);
        ctx.closePath();
        ctx.fill();

        ctx.restore();
    }
}

function drawBot(bot, now) {
    const x = bot.x - camera.x;
    const y = bot.y - camera.y;

    if (
        x < -100 ||
        y < -100 ||
        x > innerWidth + 100 ||
        y > innerHeight + 100
    ) {
        return;
    }

    const r =
        bot.kind === "brute"
            ? 27
            : bot.kind === "scout"
                ? 15
                : 20;

    const color =
        bot.kind === "brute"
            ? "#ff9b62"
            : bot.kind === "scout"
                ? "#b98cff"
                : "#ff607e";

    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(bot.angle || 0);

    ctx.shadowBlur = bot.hit ? 27 : 15;
    ctx.shadowColor = bot.hit ? "#ffffff" : color;

    ctx.fillStyle = bot.hit ? "#fff4e8" : "#182838";
    ctx.strokeStyle = color;
    ctx.lineWidth = bot.kind === "brute" ? 4 : 2.4;

    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(r * 0.35, -r * 0.2, r * 0.27, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "#d9f8ff";
    ctx.fillRect(r * 0.05, -r * 0.12, r * 0.5, 3);

    ctx.restore();

    const barW = r * 2.3;

    ctx.fillStyle = "rgba(0,0,0,.65)";
    ctx.fillRect(x - barW / 2, y - r - 13, barW, 5);

    ctx.fillStyle = bot.kind === "brute" ? "#ffae75" : "#ff718d";

    ctx.fillRect(
        x - barW / 2,
        y - r - 13,
        barW * Math.max(0, bot.hp / bot.maxHp),
        5
    );
}

function drawCoopPlayer(p, isMe, now) {
    const x = p.x - camera.x;
    const y = p.y - camera.y;

    if (
        x < -70 ||
        y < -70 ||
        x > innerWidth + 70 ||
        y > innerHeight + 70
    ) {
        return;
    }

    const color = isMe ? "#77e8ff" : "#77f4c7";

    ctx.save();
    ctx.translate(x, y);

    if (p.downed) {
        ctx.rotate(-Math.PI / 2);
    } else {
        ctx.rotate(p.angle || 0);
    }

    ctx.shadowBlur = isMe ? 25 : 17;
    ctx.shadowColor = p.downed ? "#ff657c" : color;

    ctx.fillStyle = p.downed
        ? "#4d1d30"
        : (isMe ? "#15516d" : "#155443");

    ctx.strokeStyle = p.downed ? "#ff718b" : color;
    ctx.lineWidth = isMe ? 3.5 : 2.5;

    ctx.beginPath();
    ctx.arc(0, 0, 17, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = "#e7fbff";
    ctx.beginPath();
    ctx.moveTo(23, 0);
    ctx.lineTo(9, -7);
    ctx.lineTo(9, 7);
    ctx.closePath();
    ctx.fill();

    ctx.restore();

    ctx.font = "600 11px Inter, sans-serif";
    ctx.textAlign = "center";
    ctx.fillStyle = isMe ? "#b5f1ff" : "#aef4d9";

    ctx.fillText(
        (isMe ? "YOU · " : "") + (p.name || "Explorer"),
        x,
        y - 29
    );

    if (p.downed) {
        ctx.fillStyle = "#ff91a5";
        ctx.fillText("DOWN — PRESS E NEAR THEM", x, y + 34);
    }

    const bw = 38;

    ctx.fillStyle = "rgba(0,0,0,.7)";
    ctx.fillRect(x - bw / 2, y + 23, bw, 4);

    ctx.fillStyle = p.downed ? "#ff667f" : "#6ef0c3";

    ctx.fillRect(
        x - bw / 2,
        y + 23,
        bw * Math.max(0, p.hp / p.maxHp),
        4
    );
}

// ============================================================
// DRAW VFX
// ============================================================

function drawEffects() {
    for (const e of effects) {
        const alpha = Math.max(0, e.life / e.maxLife);

        if (e.kind === "slash") {
            const x1 = e.from.x - camera.x;
            const y1 = e.from.y - camera.y;
            const x2 = e.to.x - camera.x;
            const y2 = e.to.y - camera.y;

            ctx.save();
            ctx.globalAlpha = alpha;
            ctx.lineCap = "round";
            ctx.shadowBlur = 24;
            ctx.shadowColor = e.hit ? "#a7f6ff" : "#79dfff";
            ctx.strokeStyle = e.hit ? "#eaffff" : "#6bcfff";
            ctx.lineWidth = e.hit ? 12 : 7;

            ctx.beginPath();
            ctx.moveTo(x1, y1);
            ctx.lineTo(x2, y2);
            ctx.stroke();

            ctx.strokeStyle = "rgba(255,255,255,.7)";
            ctx.lineWidth = 2;

            ctx.beginPath();
            ctx.moveTo(x1, y1);
            ctx.lineTo(x2, y2);
            ctx.stroke();

            ctx.restore();

        } else if (e.kind === "pulse") {
            const x = e.x - camera.x;
            const y = e.y - camera.y;
            const progress = 1 - alpha;

            ctx.save();
            ctx.globalAlpha = alpha;
            ctx.strokeStyle = "#8aeaff";
            ctx.lineWidth = 6 * alpha + 1;
            ctx.shadowBlur = 30;
            ctx.shadowColor = "#5adfff";

            ctx.beginPath();
            ctx.arc(
                x,
                y,
                e.radius * progress,
                0,
                Math.PI * 2
            );
            ctx.stroke();

            ctx.strokeStyle = "rgba(226,252,255,.72)";
            ctx.lineWidth = 2;

            ctx.beginPath();
            ctx.arc(
                x,
                y,
                e.radius * progress * 0.78,
                0,
                Math.PI * 2
            );
            ctx.stroke();

            ctx.restore();

        } else if (e.kind === "damage") {
            const x = e.x - camera.x;
            const y = e.y - camera.y - (1 - alpha) * 30;

            ctx.save();
            ctx.globalAlpha = alpha;
            ctx.font = "800 16px Orbitron,sans-serif";
            ctx.textAlign = "center";
            ctx.fillStyle = "#fff1ae";
            ctx.shadowBlur = 9;
            ctx.shadowColor = "#ffbb5a";
            ctx.fillText("-" + e.value, x, y);
            ctx.restore();
        }
    }
}

function drawParticles() {
    for (const p of particles) {
        const alpha = Math.max(0, p.life / p.maxLife);

        ctx.globalAlpha = alpha;
        ctx.fillStyle = p.color;
        ctx.shadowBlur = 12;
        ctx.shadowColor = p.color;

        ctx.beginPath();
        ctx.arc(
            p.x - camera.x,
            p.y - camera.y,
            p.size * alpha,
            0,
            Math.PI * 2
        );
        ctx.fill();
    }

    ctx.globalAlpha = 1;
    ctx.shadowBlur = 0;
}

// ============================================================
// HUD
// ============================================================

function updateMissionHud() {
    if (!stage) return;

    const me =
        snapshot.players?.find(p => p.uid === signedInUser?.uid) ||
        localPlayer();

    const hp = Math.max(0, Number(me?.hp) || 0);
    const maxHp = Math.max(1, Number(me?.maxHp) || 100);

    const hpText = stage.querySelector("#mpHudHp");
    const hpFill = stage.querySelector("#mpHudHpFill");
    const botsText = stage.querySelector("#mpHudBots");
    const timer = stage.querySelector("#mpHudTimer");
    const team = stage.querySelector("#mpHudTeam");

    if (hpText) {
        hpText.textContent = me?.downed ? "DOWN" : `${Math.round(hp)} HP`;
    }

    if (hpFill) {
        hpFill.style.width = `${Math.max(0, hp / maxHp * 100)}%`;

        hpFill.style.background = hp < 35
            ? "linear-gradient(90deg,#ed4b6c,#ff9c91)"
            : "linear-gradient(90deg,#42d9b5,#a5f7d8)";
    }

    if (botsText) {
        botsText.textContent =
            `${snapshot.remainingBots ?? (snapshot.bots || []).filter(b => !b.dead).length} LEFT`;
    }

    const seconds = Math.max(
        0,
        Math.ceil((snapshot.timeLeft || 0) / 1000)
    );

    if (timer) {
        timer.textContent =
            `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
    }

    if (team) {
        team.textContent =
            `${snapshot.players?.length || room?.players?.length || 1} EXPLORERS · CO-OP`;
    }
}

// ============================================================
// MISSION RESULT
// ============================================================

function finishMissionView(data) {
    if (!stage) return;

    endingMission = true;

    snapshot.players = data.players || snapshot.players;

    const won = data.result === "victory";

    showToast(won ? "BOT SWARM DEFEATED!" : "MISSION FAILED");

    const result = document.createElement("div");
    result.className = "mp-result";

    result.innerHTML = `
      <div class="mp-result-card">
        <h2>${won ? "MISSION CLEAR" : "MISSION FAILED"}</h2>
        <p>
          ${won
            ? "Your team cleared the VÉLORA bot swarm."
            : "The team ran out of time. Regroup and try again."}
        </p>
        <p>
          ${data.totalBots - data.remainingBots} / ${data.totalBots} bots defeated
        </p>
        <button type="button" id="mpReturnFromResult">
            RETURN TO MENU
        </button>
      </div>
    `;

    stage.appendChild(result);

    result.querySelector("#mpReturnFromResult").addEventListener(
        "click",
        () => returnToMenu(true)
    );
}

// ============================================================
// RETURN TO MENU
// ============================================================

async function returnToMenu(leaveRoom) {
    activeMission = false;
    endingMission = false;
    pointerDown = false;

    keys.clear();

    if (rafId) cancelAnimationFrame(rafId);

    rafId = 0;

    window.removeEventListener("resize", resizeStage);

    stage?.remove();

    stage = null;
    canvas = null;
    ctx = null;

    if (leaveRoom) {
        if (
            socket?.readyState === WebSocket.OPEN &&
            authReady
        ) {
            socket.send(JSON.stringify({
                type: "leave_room"
            }));
        }

        room = null;

        if (lobbyBox) lobbyBox.hidden = true;
    }

    if (menu) menu.hidden = false;
    if (gameUI) gameUI.hidden = true;

    if (leaveRoom) {
        setMenuStatus("Back in VÉLORA. Choose another co-op mission any time.");
    }
}

// ============================================================
// CONTROLS
// ============================================================

function handleKeyDown(event) {
    if (!activeMission) return;

    const key = event.key.toLowerCase();

    if (
        [
            "w", "a", "s", "d",
            "arrowup", "arrowdown",
            "arrowleft", "arrowright",
            "shift", " ", "j", "q", "e", "escape"
        ].includes(key)
    ) {
        event.preventDefault();
    }

    if (event.repeat && [" ", "j", "q", "e"].includes(key)) {
        return;
    }

    keys.add(key);

    if (key === " " || key === "j") {
        sendCombatCommand("attack");
    }

    if (key === "q") {
        sendCombatCommand("special");
    }

    if (key === "e") {
        sendCombatCommand("revive");
    }

    if (key === "escape") {
        showToast("Use LEAVE MISSION to return to the room menu.");
    }
}

function handleKeyUp(event) {
    if (!activeMission) return;

    keys.delete(event.key.toLowerCase());
}

window.addEventListener("keydown", handleKeyDown, { capture: true });
window.addEventListener("keyup", handleKeyUp, { capture: true });

window.addEventListener("blur", () => {
    keys.clear();
    pointerDown = false;
});

// ============================================================
// CONNECTION CLEANUP
// ============================================================

function disconnect() {
    authReady = false;

    if (socket && socket.readyState < WebSocket.CLOSING) {
        socket.close(1000, "Client leaving");
    }

    socket = null;
    room = null;
}

// ============================================================
// FIREBASE AUTH
// ============================================================

authUnsubscribe = onAuthStateChanged(auth, user => {
    signedInUser = user && !user.isAnonymous ? user : null;

    updateAuthButtons();

    if (!signedInUser) {
        if (activeMission) {
            returnToMenu(false);
        }

        disconnect();

        if (lobbyBox) {
            lobbyBox.hidden = true;
        }
    }
});

buildMenu();

window.addEventListener("beforeunload", () => {
    try {
        if (socket?.readyState === WebSocket.OPEN) {
            socket.send(JSON.stringify({
                type: "leave_room"
            }));
        }
    } catch {}

    if (authUnsubscribe) {
        authUnsubscribe();
    }
});
