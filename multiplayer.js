// ============================================================
// VÉLORA — CO-OP BLASTERS MODE
// Quick Match (4 players) + Private Rooms + shared bot combat
// ============================================================

import { getApp, getApps, initializeApp } from "https://www.gstatic.com/firebasejs/12.17.1/firebase-app.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.17.1/firebase-auth.js";

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

const IS_VCLIENT = Boolean(document.getElementById("veloraButton"));

const TEXT_SIGN_IN = IS_VCLIENT
    ? "Connect to VÉLORA (step 2) to play online."
    : "Sign in with Google to play online.";

const TEXT_SIGN_IN_FIRST = IS_VCLIENT
    ? "Connect to VÉLORA first (step 2)."
    : "Sign in with Google first.";

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
        TEAM UP WITH UP TO 3 OTHER EXPLORERS — OR GO SOLO.<br>
        TAKE DOWN THE BOT SWARM. 1–4 PLAYERS. EVERYONE CLICKS READY TO START.
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
        ${TEXT_SIGN_IN}
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
            <button type="button" id="mpReadyToggle">READY</button>
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
    startButton = panel.querySelector("#mpReadyToggle");
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

    startButton.addEventListener("click", () => {
        const me = (room?.players || []).find(p => p.uid === signedInUser?.uid);

        runAction("set_ready", { ready: !me?.ready });
    });

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
