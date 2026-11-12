
/* =========================================================
   VÉLORA — MULTIPLAYER CLIENT
   Firebase Authentication + Render WebSocket
   1–4 PLAYERS | CO-OP BLASTERS
   ========================================================= */

import {
    getApp,
    getApps,
    initializeApp
} from "https://www.gstatic.com/firebasejs/12.17.1/firebase-app.js";

import {
    getAuth,
    onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/12.17.1/firebase-auth.js";

/* =========================================================
   CONFIG
   ========================================================= */

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

const firebaseApp = getApps().length
    ? getApp()
    : initializeApp(firebaseConfig);

const auth = getAuth(firebaseApp);

const SERVER_URL = "wss://velora-7dxm.onrender.com/ws";

const WORLD = {
    width: 2400,
    height: 1800
};

const MAX_PLAYERS = 4;

/* =========================================================
   STATE
   ========================================================= */

let signedInUser = auth.currentUser || null;
let authReady = false;

let socket = null;
let socketAuthenticated = false;
let connectingPromise = null;

let room = null;
let snapshot = {
    players: [],
    bots: [],
    coins: [],
    timeLeft: 0,
    remainingBots: 0
};

let activeMission = false;
let endingMission = false;

let stage = null;
let canvas = null;
let ctx = null;

let rafId = 0;
let lastFrame = 0;
let lastInputSend = 0;

let camera = { x: 0, y: 0 };
let aimAngle = 0;

let pointerDown = false;
let mouseX = 0;
let mouseY = 0;

let effects = [];
let particles = [];

let damageFlash = 0;
let screenShake = 0;

let toastText = "";
let toastTimer = 0;

const keys = new Set();

const input = {
    x: 0,
    y: 0,
    sprint: false
};

/* =========================================================
   DOM
   ========================================================= */

const menu = document.getElementById("menu");
const gameUI = document.getElementById("gameUI");

const IS_VCLIENT = Boolean(
    document.getElementById("veloraButton")
);

let menuContent = menu?.querySelector(".menu-content");

let mpPanel;
let quickButton;
let createButton;
let joinButton;
let joinButtonInput;
let roomCodeInput;
let menuStatus;

let lobbyBox;
let lobbyPlayers;
let lobbyCode;
let lobbyStatus;
let lobbyCount;

let startButton;
let leaveButton;
let copyButton;

let missionResult;

/* =========================================================
   HELPERS
   ========================================================= */

function $(id) {
    return document.getElementById(id);
}

function sendMessage(type, data = {}) {
    if (!socket || socket.readyState !== WebSocket.OPEN) {
        return false;
    }

    if (!socketAuthenticated && type !== "auth") {
        return false;
    }

    socket.send(JSON.stringify({
        type,
        ...data
    }));

    return true;
}

function setMenuStatus(message, error = false) {
    if (!menuStatus) return;

    menuStatus.textContent = message;
    menuStatus.style.color = error
        ? "#ff667c"
        : "#91dfff";
}

function showToast(message) {
    toastText = message;
    toastTimer = 2.5;
}

function escapeHTML(value) {
    return String(value ?? "").replace(/[&<>"']/g, char => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#039;"
    })[char]);
}

function getMyPlayer() {
    return snapshot.players.find(
        player => player.uid === signedInUser?.uid
    );
}

/* =========================================================
   STYLING
   ========================================================= */

function addStyle() {
    if ($("veloraMultiplayerStyle")) return;

    const style = document.createElement("style");
    style.id = "veloraMultiplayerStyle";

    style.textContent = `
        #veloraMpPanel {
            width: min(540px, 94%);
            margin: 24px auto;
            padding: 22px;
            background: rgba(5, 12, 29, .96);
            border: 1px solid rgba(73, 183, 255, .35);
            border-radius: 12px;
            box-shadow: 0 0 35px rgba(0, 120, 255, .12);
            color: #e9f7ff;
            font-family: Inter, Arial, sans-serif;
            box-sizing: border-box;
        }

        #veloraMpPanel * {
            box-sizing: border-box;
        }

        #veloraMpPanel h2 {
            margin: 0 0 8px;
            color: #8edaff;
            font-family: Orbitron, sans-serif;
            font-size: 19px;
            letter-spacing: 2px;
        }

        #veloraMpPanel p {
            color: #9db4c8;
            font-size: 12px;
            line-height: 1.6;
        }

        .mp-button {
            min-height: 43px;
            padding: 11px 15px;
            border: 1px solid rgba(95, 194, 255, .55);
            border-radius: 6px;
            background: rgba(19, 76, 119, .35);
            color: #e9f7ff;
            font-family: Orbitron, sans-serif;
            font-size: 10px;
            letter-spacing: 1px;
            cursor: pointer;
            transition: .2s;
        }

        .mp-button:hover {
            background: rgba(30, 135, 205, .55);
            box-shadow: 0 0 16px rgba(0, 153, 255, .25);
        }

        .mp-button:disabled {
            opacity: .4;
            cursor: not-allowed;
        }

        .mp-button.primary {
            background: rgba(0, 126, 205, .5);
        }

        .mp-actions {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 9px;
            margin-top: 16px;
        }

        .mp-join-row {
            display: flex;
            gap: 8px;
            margin-top: 12px;
        }

        #mpJoinCode {
            min-width: 0;
            flex: 1;
            padding: 12px;
            border: 1px solid #245578;
            border-radius: 6px;
            outline: none;
            background: #071426;
            color: white;
            text-transform: uppercase;
            letter-spacing: 3px;
        }

        #mpMenuStatus,
        #mpLobbyStatus {
            min-height: 20px;
            margin-top: 12px;
            color: #91dfff;
            font-size: 12px;
        }

        #mpLobby {
            display: none;
            margin-top: 20px;
            padding: 16px;
            border: 1px solid rgba(73, 183, 255, .3);
            border-radius: 8px;
            background: rgba(4, 17, 34, .9);
        }

        #mpRoomCode {
            color: #8edaff;
            font-family: Orbitron, sans-serif;
            font-size: 24px;
            letter-spacing: 5px;
        }

        #mpLobbyPlayers {
            display: grid;
            gap: 7px;
            margin-top: 14px;
        }

        .mp-player-row {
            display: flex;
            justify-content: space-between;
            gap: 10px;
            padding: 9px;
            border-radius: 5px;
            background: rgba(35, 77, 110, .2);
            font-size: 12px;
        }

        .mp-ready {
            color: #6dffb0;
        }

        .mp-not-ready {
            color: #ffc36d;
        }

        #mpLobbyButtons {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 8px;
            margin-top: 14px;
        }

        #veloraMpStage {
            position: fixed;
            inset: 0;
            z-index: 99999;
            display: none;
            overflow: hidden;
            background: #030711;
            font-family: Inter, Arial, sans-serif;
        }

        #veloraMpCanvas {
            width: 100%;
            height: 100%;
            display: block;
            cursor: crosshair;
            touch-action: none;
        }

        #mpHud {
            position: absolute;
            top: 16px;
            left: 16px;
            z-index: 2;
            min-width: 210px;
            padding: 13px;
            border: 1px solid rgba(75, 183, 255, .4);
            border-radius: 7px;
            background: rgba(3, 12, 27, .85);
            color: white;
            pointer-events: none;
        }

        #mpHudTitle {
            color: #8edaff;
            font-family: Orbitron, sans-serif;
            font-size: 12px;
            letter-spacing: 2px;
        }

        #mpHudStats {
            margin-top: 9px;
            font-size: 12px;
            line-height: 1.8;
        }

        #mpHealthTrack {
            height: 7px;
            margin-top: 5px;
            overflow: hidden;
            border-radius: 5px;
            background: #27354a;
        }

        #mpHealthFill {
            width: 100%;
            height: 100%;
            background: #46e89b;
            transition: width .15s;
        }

        #mpExit {
            position: absolute;
            top: 16px;
            right: 16px;
            z-index: 4;
        }

        #mpToast {
            position: absolute;
            top: 22%;
            left: 50%;
            z-index: 3;
            transform: translateX(-50%);
            padding: 12px 20px;
            border: 1px solid rgba(90, 198, 255, .5);
            border-radius: 6px;
            background: rgba(3, 15, 33, .9);
            color: #b8eaff;
            font-family: Orbitron, sans-serif;
            font-size: 12px;
            letter-spacing: 1px;
            opacity: 0;
            pointer-events: none;
            transition: opacity .2s;
        }

        #mpResult {
            position: absolute;
            inset: 0;
            z-index: 5;
            display: none;
            align-items: center;
            justify-content: center;
            background: rgba(0, 5, 15, .83);
        }

        #mpResultBox {
            width: min(420px, 90%);
            padding: 30px;
            border: 1px solid rgba(75, 183, 255, .5);
            border-radius: 10px;
            background: #071426;
            text-align: center;
            color: white;
        }

        #mpResultTitle {
            color: #8edaff;
            font-family: Orbitron, sans-serif;
            letter-spacing: 2px;
        }

        #mpResultText {
            color: #a9bfd3;
            font-size: 13px;
            line-height: 1.7;
        }

        @media(max-width: 600px) {
            #mpHud {
                top: 8px;
                left: 8px;
                min-width: 165px;
                padding: 9px;
            }

            #mpExit {
                top: 8px;
                right: 8px;
            }

            .mp-actions {
                grid-template-columns: 1fr;
            }
        }
    `;

    document.head.appendChild(style);
}

/* =========================================================
   MENU
   ========================================================= */

function buildMenu() {
    if (!menuContent) {
        menuContent = document.createElement("div");
        menuContent.className = "menu-content";

        if (menu) {
            menu.appendChild(menuContent);
        } else {
            document.body.appendChild(menuContent);
        }
    }

    if ($("veloraMpPanel")) return;

    mpPanel = document.createElement("section");
    mpPanel.id = "veloraMpPanel";

    mpPanel.innerHTML = `
        <h2>CO-OP BLASTERS</h2>

        <p>
            TEAM UP WITH OTHER EXPLORERS.
            TAKE DOWN THE BOT SWARM.
            MAX 4 PLAYERS PER ROOM.
        </p>

        <div class="mp-actions">
            <button class="mp-button primary" id="mpQuickMatch">
                QUICK MATCH
            </button>

            <button class="mp-button" id="mpCreateRoom">
                CREATE PRIVATE ROOM
            </button>
        </div>

        <div class="mp-join-row">
            <input
                id="mpJoinCode"
                maxlength="8"
                placeholder="ROOM CODE"
                autocomplete="off"
            >

            <button class="mp-button" id="mpJoinRoom">
                JOIN
            </button>
        </div>

        <div id="mpMenuStatus">
            Checking sign-in...
        </div>

        <div id="mpLobby">
            <div style="font-size:10px;color:#9db4c8;letter-spacing:2px">
                PRIVATE ROOM CODE
            </div>

            <div id="mpRoomCode">------</div>

            <div id="mpLobbyStatus">Waiting for players...</div>

            <div style="font-size:11px;color:#9db4c8;margin-top:12px">
                PLAYERS <span id="mpCount">0 / 4</span>
            </div>

            <div id="mpLobbyPlayers"></div>

            <div id="mpLobbyButtons">
                <button class="mp-button" id="mpCopyCode">
                    COPY CODE
                </button>

                <button class="mp-button primary" id="mpReadyToggle">
                    READY
                </button>

                <button class="mp-button" id="mpLeaveRoom">
                    LEAVE ROOM
                </button>
            </div>
        </div>
    `;

    menuContent.appendChild(mpPanel);

    quickButton = $("mpQuickMatch");
    createButton = $("mpCreateRoom");
    joinButton = $("mpJoinRoom");
    roomCodeInput = $("mpJoinCode");
    menuStatus = $("mpMenuStatus");

    lobbyBox = $("mpLobby");
    lobbyPlayers = $("mpLobbyPlayers");
    lobbyCode = $("mpRoomCode");
    lobbyStatus = $("mpLobbyStatus");
    lobbyCount = $("mpCount");

    copyButton = $("mpCopyCode");
    startButton = $("mpReadyToggle");
    leaveButton = $("mpLeaveRoom");

    quickButton.addEventListener("click", () => {
        runAction("quick_match");
    });

    createButton.addEventListener("click", () => {
        runAction("create_room");
    });

    joinButton.addEventListener("click", () => {
        const code = roomCodeInput.value.trim().toUpperCase();

        if (!code) {
            setMenuStatus("ENTER A ROOM CODE FIRST.", true);
            return;
        }

        runAction("join_room", { code });
    });

    roomCodeInput.addEventListener("keydown", event => {
        if (event.key === "Enter") {
            joinButton.click();
        }
    });

    copyButton.addEventListener("click", async () => {
        if (!room?.code) return;

        try {
            await navigator.clipboard.writeText(room.code);
            setMenuStatus("ROOM CODE COPIED.");
        } catch {
            setMenuStatus("COPY FAILED. CODE: " + room.code, true);
        }
    });

    startButton.addEventListener("click", () => {
        const me = (room?.players || []).find(
            player => player.uid === signedInUser?.uid
        );

        sendMessage("set_ready", {
            ready: !me?.ready
        });
    });

    leaveButton.addEventListener("click", () => {
        sendMessage("leave_room");
    });

    updateAuthButtons();
}

function updateAuthButtons() {
    if (!quickButton) return;

    const signedIn = Boolean(signedInUser);

    quickButton.disabled = !signedIn;
    createButton.disabled = !signedIn;
    joinButton.disabled = !signedIn;

    if (!signedIn) {
        setMenuStatus(
            IS_VCLIENT
                ? "CONNECT TO VÉLORA FIRST TO PLAY ONLINE."
                : "SIGN IN WITH GOOGLE FIRST TO PLAY ONLINE.",
            true
        );
    } else {
        setMenuStatus("SIGNED IN — READY TO PLAY.");
    }
}

/* =========================================================
   AUTH + WEBSOCKET
   ========================================================= */

function connectServer() {
    if (!signedInUser) {
        return Promise.reject(
            new Error("Sign in with Google first.")
        );
    }

    if (
        socket &&
        socket.readyState === WebSocket.OPEN &&
        socketAuthenticated
    ) {
        return Promise.resolve();
    }

    if (connectingPromise) {
        return connectingPromise;
    }

    connectingPromise = new Promise(async (resolve, reject) => {
        let finished = false;

        const finish = (error) => {
            if (finished) return;
            finished = true;
            connectingPromise = null;

            if (error) reject(error);
            else resolve();
        };

        try {
            const token = await signedInUser.getIdToken();

            socketAuthenticated = false;

            if (socket) {
                try {
                    socket.close();
                } catch {}
            }

            socket = new WebSocket(SERVER_URL);

            const timeout = setTimeout(() => {
                finish(new Error("Server connection timed out."));
                socket?.close();
            }, 15000);

            socket.onopen = () => {
                socket.send(JSON.stringify({
                    type: "auth",
                    token
                }));
            };

            socket.onmessage = event => {
                let message;

                try {
                    message = JSON.parse(event.data);
                } catch {
                    return;
                }

                handleServerMessage(message);

                if (message.type === "authenticated") {
                    socketAuthenticated = true;
                    clearTimeout(timeout);
                    finish();
                }

                if (message.type === "error" && !socketAuthenticated) {
                    clearTimeout(timeout);
                    finish(new Error(
                        message.message || "Authentication failed."
                    ));
                }
            };

            socket.onerror = () => {
                clearTimeout(timeout);
                finish(new Error("Could not connect to multiplayer server."));
            };

            socket.onclose = () => {
                socketAuthenticated = false;

                if (!finished) {
                    clearTimeout(timeout);
                    finish(new Error("Connection closed."));
                }

                if (activeMission) {
                    showToast("CONNECTION LOST");
                }
            };

        } catch (error) {
            finish(error);
        }
    });

    return connectingPromise;
}

async function runAction(type, data = {}) {
    if (!signedInUser) {
        setMenuStatus("SIGN IN WITH GOOGLE FIRST.", true);
        return;
    }

    setMenuStatus("CONNECTING TO SERVER...");

    try {
        await connectServer();

        if (type === "quick_match") {
            // Current server.js has no quick_match command.
            // Create a room instead.
            sendMessage("create_room");
        } else {
            sendMessage(type, data);
        }

        setMenuStatus("REQUEST SENT.");
    } catch (error) {
        setMenuStatus(error.message || "CONNECTION FAILED.", true);
    }
}

/* =========================================================
   SERVER MESSAGES
   ========================================================= */

function handleServerMessage(message) {
    switch (message.type) {

        case "authenticated":
            setMenuStatus("CONNECTED TO VÉLORA SERVER.");
            break;

        case "room_joined":
            room = message.room || message;
            renderLobby();
            break;

        case "room_update":
            room = message.room || message;
            renderLobby();
            break;

        case "player_joined":
            if (message.room) {
                room = message.room;
            }
            renderLobby();
            break;

        case "player_left":
            if (message.room) {
                room = message.room;
            }
            renderLobby();
            break;

        case "room_left":
            room = null;
            lobbyBox.style.display = "none";
            setMenuStatus("YOU LEFT THE ROOM.");
            break;

        case "mission_started":
            activeMission = true;
            endingMission = false;

            if (message.room) {
                room = message.room;
            }

            startGame();
            showToast("MISSION STARTED");
            break;

        case "snapshot":
            snapshot = {
                players: message.players || [],
                bots: message.bots || [],
                coins: message.coins || [],
                timeLeft: message.timeLeft ?? 0,
                remainingBots: message.remainingBots ?? 0
            };

            updateHUD();
            break;

        case "attack_event":
            addEffect(message.x, message.y, "shot");
            break;

        case "bot_hit":
            addEffect(message.x, message.y, "hit");
            break;

        case "special_event":
            addEffect(message.x, message.y, "special");
            screenShake = 0.3;
            break;

        case "player_hit":
            damageFlash = 0.25;
            screenShake = 0.2;
            break;

        case "player_downed":
            showToast("YOU ARE DOWN — WAIT FOR A REVIVE");
            break;

        case "player_respawned":
            showToast("BACK IN THE FIGHT");
            break;

        case "player_revived":
            showToast("TEAMMATE REVIVED");
            break;

        case "coin_collected":
            showToast("+ COINS");
            break;

        case "mission_end":
            activeMission = false;
            endingMission = true;
            stopGame();
            showMissionResult(message);
            break;

        case "error":
            setMenuStatus(
                message.message || "SERVER ERROR",
                true
            );
            showToast(message.message || "SERVER ERROR");
            break;
    }
}

/* =========================================================
   LOBBY
   ========================================================= */

function renderLobby() {
    if (!room || !lobbyBox) return;

    lobbyBox.style.display = "block";

    const code = room.code || room.roomCode || "------";
    const players = Array.isArray(room.players)
        ? room.players
        : [];

    lobbyCode.textContent = code;
    lobbyCount.textContent = `${players.length} / ${MAX_PLAYERS}`;

    lobbyPlayers.innerHTML = "";

    players.forEach(player => {
        const row = document.createElement("div");
        row.className = "mp-player-row";

        const name = escapeHTML(
            player.name || player.displayName || "Explorer"
        );

        const isHost = player.uid === room.hostUid;
        const status = player.ready ? "READY" : "NOT READY";

        row.innerHTML = `
            <span>
                ${name}
                ${isHost ? " ★ HOST" : ""}
            </span>

            <span class="${player.ready ? "mp-ready" : "mp-not-ready"}">
                ${status}
            </span>
        `;

        lobbyPlayers.appendChild(row);
    });

    const me = players.find(
        player => player.uid === signedInUser?.uid
    );

    startButton.textContent = me?.ready
        ? "CANCEL READY"
        : "READY";

    const allReady = players.length >= 1 &&
        players.every(player => player.ready);

    lobbyStatus.textContent = allReady
        ? "EVERYONE READY — STARTING..."
        : "WAITING FOR PLAYERS TO READY UP...";

    if (players.length >= MAX_PLAYERS) {
        lobbyStatus.textContent = "ROOM FULL — 4 / 4 PLAYERS";
    }
}

/* =========================================================
   GAME STAGE
   ========================================================= */

function createStage() {
    if (stage) return;

    stage = document.createElement("div");
    stage.id = "veloraMpStage";

    stage.innerHTML = `
        <canvas id="veloraMpCanvas"></canvas>

        <div id="mpHud">
            <div id="mpHudTitle">CO-OP BLASTERS</div>

            <div id="mpHudStats">
                HEALTH: <span id="mpHealthText">100</span>
                <div id="mpHealthTrack">
                    <div id="mpHealthFill"></div>
                </div>

                COINS: <span id="mpCoins">0</span><br>
                KILLS: <span id="mpKills">0</span><br>
                BOTS LEFT: <span id="mpBots">0</span><br>
                TIME: <span id="mpTime">180</span>
            </div>
        </div>

        <button class="mp-button" id="mpExit">
            LEAVE MISSION
        </button>

        <div id="mpToast"></div>

        <div id="mpResult">
            <div id="mpResultBox">
                <h2 id="mpResultTitle">MISSION COMPLETE</h2>
                <p id="mpResultText"></p>
                <button class="mp-button primary" id="mpReturn">
                    RETURN TO LOBBY
                </button>
            </div>
        </div>
    `;

    document.body.appendChild(stage);

    canvas = $("veloraMpCanvas");
    ctx = canvas.getContext("2d");

    $("mpExit").addEventListener("click", () => {
        sendMessage("leave_room");
        activeMission = false;
        stopGame();
        stage.style.display = "none";
    });

    $("mpReturn").addEventListener("click", () => {
        $("mpResult").style.display = "none";
        stage.style.display = "none";
        endingMission = false;
    });

    canvas.addEventListener("mousemove", event => {
        const rect = canvas.getBoundingClientRect();

        mouseX = event.clientX - rect.left;
        mouseY = event.clientY - rect.top;

        updateAim();
    });

    canvas.addEventListener("mousedown", event => {
        if (event.button !== 0 || !activeMission) return;

        pointerDown = true;
        updateAim();
        sendMessage("attack", { angle: aimAngle });
    });

    window.addEventListener("mouseup", () => {
        pointerDown = false;
    });

    canvas.addEventListener("contextmenu", event => {
        event.preventDefault();
    });

    resizeCanvas();
    window.addEventListener("resize", resizeCanvas);
}

function resizeCanvas() {
    if (!canvas) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);

    canvas.width = Math.floor(window.innerWidth * dpr);
    canvas.height = Math.floor(window.innerHeight * dpr);

    canvas.style.width = window.innerWidth + "px";
    canvas.style.height = window.innerHeight + "px";

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

function startGame() {
    createStage();

    stage.style.display = "block";

    if (menu) {
        menu.style.display = "none";
    }

    if (gameUI) {
        gameUI.style.display = "none";
    }

    keys.clear();

    lastFrame = performance.now();

    if (rafId) {
        cancelAnimationFrame(rafId);
    }

    rafId = requestAnimationFrame(gameLoop);
}

function stopGame() {
    if (rafId) {
        cancelAnimationFrame(rafId);
        rafId = 0;
    }

    keys.clear();
    pointerDown = false;
}

/* =========================================================
   INPUT
   ========================================================= */

window.addEventListener("keydown", event => {
    const key = event.key.toLowerCase();

    if (
        ["arrowup", "arrowdown", "arrowleft", "arrowright", " "]
            .includes(key)
    ) {
        event.preventDefault();
    }

    keys.add(key);

    if (!activeMission || event.repeat) return;

    if (key === " ") {
        sendMessage("special");
        showToast("SPECIAL ATTACK");
    }

    if (key === "e") {
        sendMessage("revive");
    }
});

window.addEventListener("keyup", event => {
    keys.delete(event.key.toLowerCase());
});

window.addEventListener("blur", () => {
    keys.clear();
    pointerDown = false;
});

function readMovement() {
    let x = 0;
    let y = 0;

    if (keys.has("w") || keys.has("arrowup")) y -= 1;
    if (keys.has("s") || keys.has("arrowdown")) y += 1;
    if (keys.has("a") || keys.has("arrowleft")) x -= 1;
    if (keys.has("d") || keys.has("arrowright")) x += 1;

    const length = Math.hypot(x, y);

    if (length > 0) {
        x /= length;
        y /= length;
    }

    input.x = x;
    input.y = y;
    input.sprint = keys.has("shift");
}

function updateAim() {
    const me = getMyPlayer();
    if (!me || !canvas) return;

    const screenX = window.innerWidth / 2;
    const screenY = window.innerHeight / 2;

    const dx = mouseX - screenX;
    const dy = mouseY - screenY;

    aimAngle = Math.atan2(dy, dx);
}

/* =========================================================
   HUD
   ========================================================= */

function updateHUD() {
    const me = getMyPlayer();
    if (!me) return;

    const hp = Math.max(0, Number(me.hp ?? me.health ?? 100));
    const coins = Number(me.coins || 0);
    const kills = Number(me.kills || 0);

    $("mpHealthText").textContent = Math.round(hp);
    $("mpHealthFill").style.width = `${Math.min(100, hp)}%`;

    $("mpCoins").textContent = coins;
    $("mpKills").textContent = kills;
    $("mpBots").textContent = snapshot.remainingBots;

    $("mpTime").textContent = Math.max(
        0,
        Math.ceil(snapshot.timeLeft)
    );
}

/* =========================================================
   EFFECTS
   ========================================================= */

function addEffect(x, y, type) {
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;

    effects.push({
        x,
        y,
        type,
        life: type === "special" ? 0.65 : 0.22,
        maxLife: type === "special" ? 0.65 : 0.22
    });
}

/* =========================================================
   GAME LOOP
   ========================================================= */

function gameLoop(now) {
    if (!activeMission) return;

    const dt = Math.min((now - lastFrame) / 1000, 0.05);
    lastFrame = now;

    readMovement();

    if (now - lastInputSend > 50) {
        sendMessage("input", {
            moveX: input.x,
            moveY: input.y,
            sprint: input.sprint,
            angle: aimAngle
        });

        lastInputSend = now;
    }

    updateCamera();
    updateEffects(dt);
    drawGame(dt);

    if (toastTimer > 0) {
        toastTimer -= dt;
        const toast = $("mpToast");

        toast.textContent = toastText;
        toast.style.opacity = toastTimer > 0 ? "1" : "0";
    }

    if (damageFlash > 0) damageFlash -= dt;
    if (screenShake > 0) screenShake -= dt;

    rafId = requestAnimationFrame(gameLoop);
}

function updateCamera() {
    const me = getMyPlayer();

    if (!me) return;

    const width = window.innerWidth;
    const height = window.innerHeight;

    camera.x = Math.max(
        0,
        Math.min(
            WORLD.width - width,
            me.x - width / 2
        )
    );

    camera.y = Math.max(
        0,
        Math.min(
            WORLD.height - height,
            me.y - height / 2
        )
    );
}

function updateEffects(dt) {
    effects.forEach(effect => {
        effect.life -= dt;
    });

    effects = effects.filter(effect => effect.life > 0);
}

/* =========================================================
   DRAWING
   ========================================================= */

function drawGame() {
    if (!ctx) return;

    const width = window.innerWidth;
    const height = window.innerHeight;

    ctx.clearRect(0, 0, width, height);

    ctx.save();

    if (screenShake > 0) {
        ctx.translate(
            (Math.random() - 0.5) * 7,
            (Math.random() - 0.5) * 7
        );
    }

    drawBackground();
    drawGrid();
    drawCoins();
    drawBots();
    drawPlayers();
    drawEffects();

    ctx.restore();

    if (damageFlash > 0) {
        ctx.fillStyle = `rgba(255, 35, 65, ${damageFlash * 0.45})`;
        ctx.fillRect(0, 0, width, height);
    }
}

function drawBackground() {
    ctx.fillStyle = "#07101d";
    ctx.fillRect(
        -camera.x,
        -camera.y,
        WORLD.width,
        WORLD.height
    );

    ctx.strokeStyle = "rgba(42, 115, 160, .13)";
    ctx.lineWidth = 2;

    ctx.strokeRect(
        -camera.x,
        -camera.y,
        WORLD.width,
        WORLD.height
    );
}

function drawGrid() {
    const gridSize = 80;

    ctx.strokeStyle = "rgba(65, 130, 180, .09)";
    ctx.lineWidth = 1;

    const startX = Math.floor(camera.x / gridSize) * gridSize;
    const startY = Math.floor(camera.y / gridSize) * gridSize;

    for (
        let x = startX;
        x < camera.x + window.innerWidth + gridSize;
        x += gridSize
    ) {
        ctx.beginPath();
        ctx.moveTo(x - camera.x, 0);
        ctx.lineTo(x - camera.x, window.innerHeight);
        ctx.stroke();
    }

    for (
        let y = startY;
        y < camera.y + window.innerHeight + gridSize;
        y += gridSize
    ) {
        ctx.beginPath();
        ctx.moveTo(0, y - camera.y);
        ctx.lineTo(window.innerWidth, y - camera.y);
        ctx.stroke();
    }
}

function drawCoins() {
    snapshot.coins.forEach(coin => {
        const x = coin.x - camera.x;
        const y = coin.y - camera.y;

        ctx.beginPath();
        ctx.arc(x, y, 8, 0, Math.PI * 2);
        ctx.fillStyle = "#ffd65a";
        ctx.shadowColor = "#ffbb22";
        ctx.shadowBlur = 15;
        ctx.fill();

        ctx.shadowBlur = 0;
    });
}

function drawBots() {
    snapshot.bots.forEach(bot => {
        if (bot.dead || bot.hp <= 0) return;

        const x = bot.x - camera.x;
        const y = bot.y - camera.y;

        const radius = bot.radius || 17;

        ctx.beginPath();
        ctx.arc(x, y, radius + 5, 0, Math.PI * 2);
        ctx.fillStyle = "rgba(255, 50, 75, .12)";
        ctx.fill();

        ctx.beginPath();
        ctx.arc(x, y, radius, 0, Math.PI * 2);
        ctx.fillStyle =
            bot.type === "brute"
                ? "#a83e57"
                : bot.type === "scout"
                    ? "#df914d"
                    : "#a44bd0";

        ctx.fill();

        ctx.strokeStyle = "#ff9aa9";
        ctx.lineWidth = 2;
        ctx.stroke();

        const maxHp = bot.maxHp || bot.hp || 100;
        const hpPercent = Math.max(0, bot.hp / maxHp);

        ctx.fillStyle = "#321722";
        ctx.fillRect(x - 19, y - radius - 12, 38, 4);

        ctx.fillStyle = "#ff526c";
        ctx.fillRect(x - 19, y - radius - 12, 38 * hpPercent, 4);
    });
}

function drawPlayers() {
    snapshot.players.forEach(player => {
        const x = player.x - camera.x;
        const y = player.y - camera.y;

        const isMe = player.uid === signedInUser?.uid;
        const radius = player.radius || 15;

        ctx.beginPath();
        ctx.arc(x, y, radius + 7, 0, Math.PI * 2);
        ctx.fillStyle = isMe
            ? "rgba(70, 190, 255, .14)"
            : "rgba(80, 255, 180, .12)";
        ctx.fill();

        ctx.beginPath();
        ctx.arc(x, y, radius, 0, Math.PI * 2);

        ctx.fillStyle = player.downed
            ? "#626d7b"
            : isMe
                ? "#40bfff"
                : "#52e7ad";

        ctx.fill();

        ctx.strokeStyle = "#e4f8ff";
        ctx.lineWidth = 2;
        ctx.stroke();

        const angle = isMe
            ? aimAngle
            : Number(player.angle || 0);

        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(
            x + Math.cos(angle) * 27,
            y + Math.sin(angle) * 27
        );

        ctx.strokeStyle = "#d9f5ff";
        ctx.lineWidth = 4;
        ctx.stroke();

        ctx.fillStyle = "#eaf7ff";
        ctx.font = "12px Arial";
        ctx.textAlign = "center";

        ctx.fillText(
            player.name || "Explorer",
            x,
            y - radius - 12
        );

        if (player.downed) {
            ctx.fillStyle = "#ff7185";
            ctx.fillText("DOWN", x, y + radius + 17);
        }
    });
}

function drawEffects() {
    effects.forEach(effect => {
        const x = effect.x - camera.x;
        const y = effect.y - camera.y;

        const progress = 1 - effect.life / effect.maxLife;

        if (effect.type === "special") {
            const radius = 230 * progress;

            ctx.beginPath();
            ctx.arc(x, y, radius, 0, Math.PI * 2);
            ctx.strokeStyle = `rgba(65, 190, 255, ${1 - progress})`;
            ctx.lineWidth = 6;
            ctx.stroke();

            return;
        }

        ctx.beginPath();
        ctx.arc(
            x,
            y,
            effect.type === "hit" ? 13 : 8,
            0,
            Math.PI * 2
        );

        ctx.fillStyle = effect.type === "hit"
            ? "#ff657c"
            : "#a9eaff";

        ctx.globalAlpha = Math.max(0, 1 - progress);
        ctx.fill();
        ctx.globalAlpha = 1;
    });
}

/* =========================================================
   MISSION RESULT
   ========================================================= */

function showMissionResult(message) {
    if (!stage) return;

    const won = Boolean(message.won);

    $("mpResultTitle").textContent = won
        ? "MISSION COMPLETE"
        : "MISSION FAILED";

    $("mpResultText").textContent = won
        ? "THE BOT SWARM HAS BEEN DEFEATED. WELL DONE, EXPLORERS."
        : "THE MISSION HAS ENDED. REGROUP AND TRY AGAIN.";

    $("mpResult").style.display = "flex";
}

/* =========================================================
   FIREBASE AUTH STATE
   ========================================================= */

onAuthStateChanged(auth, user => {
    signedInUser = user || null;
    authReady = true;

    updateAuthButtons();

    if (!user && socket) {
        socket.close();
        socket = null;
        socketAuthenticated = false;
    }
});

/* =========================================================
   START
   ========================================================= */

addStyle();
buildMenu();
createStage();

console.log("VÉLORA Multiplayer Client Loaded.");
