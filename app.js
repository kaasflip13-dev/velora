
// ==========================================
// VÉLORA — THE WORLD THAT LISTENS
// FIREBASE FIRESTORE + 5 LEVELS + STARS
// ==========================================

import { initializeApp } from "https://www.gstatic.com/firebasejs/12.17.1/firebase-app.js";

import {
    getAuth,
    GoogleAuthProvider,
    signInWithPopup,
    signOut,
    onAuthStateChanged,
    setPersistence,
    browserLocalPersistence
} from "https://www.gstatic.com/firebasejs/12.17.1/firebase-auth.js";

import {
    getFirestore,
    doc,
    getDoc,
    setDoc,
    updateDoc,
    increment,
    collection,
    query,
    orderBy,
    limit,
    onSnapshot,
    serverTimestamp,
    runTransaction
} from "https://www.gstatic.com/firebasejs/12.17.1/firebase-firestore.js";

// ==========================================
// FIREBASE
// ==========================================

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

const firebaseApp = initializeApp(firebaseConfig);
const auth = getAuth(firebaseApp);
const db = getFirestore(firebaseApp);
const provider = new GoogleAuthProvider();

provider.setCustomParameters({ prompt: "select_account" });

setPersistence(auth, browserLocalPersistence).catch(console.error);

// ==========================================
// HTML ELEMENTS
// ==========================================

const canvas = document.getElementById("game");

if (!canvas) {
    throw new Error('Canvas with id="game" not found.');
}

const ctx = canvas.getContext("2d");

const menu = document.getElementById("menu");
const startButton = document.getElementById("startButton");
const newGameButton = document.getElementById("newGameButton");

const loginArea = document.getElementById("loginArea");
const googleButton = document.getElementById("googleButton");
const loginStatus = document.getElementById("loginStatus");

const loggedInArea = document.getElementById("loggedInArea");
const playerName = document.getElementById("playerName");
const playerEmail = document.getElementById("playerEmail");
const logoutButton = document.getElementById("logoutButton");

const playersList = document.getElementById("playersList");

const gameUI = document.getElementById("gameUI");
const crystalCount = document.getElementById("crystalCount");
const cooldownElement = document.getElementById("cooldown");
const healthBar = document.getElementById("healthBar");
const energyBar = document.getElementById("energyBar");
const coinsDisplay = document.getElementById("coinsDisplay");
const hint = document.getElementById("hint");
const message = document.getElementById("message");

const winScreen = document.getElementById("winScreen");
const restartButton = document.getElementById("restartButton");

function setVisible(element, visible) {
    if (element) element.hidden = !visible;
}

// ==========================================
// LEVEL SETTINGS
// ==========================================

const LEVELS = [
    {
        number: 1, name: "THE AWAKENING",
        world: 2200, crystals: 3, enemies: 3, enemySpeed: 0.8,
        light: 170, cooldown: 3, trees: 90, solidTrees: false,
        walls: 0, hazards: 0, par: [50, 80, 120],
        hint: "A small clearing. Find 3 memories, then reach the portal.",
        theme: { ground: "#2d4a38", grid: "rgba(180,220,170,0.08)", border: "#829b85",
                 tree: "#2c5e3f", treeHi: "#44804f", wall: "#4a5a55", night: "#02050b" }
    },
    {
        number: 2, name: "FORGOTTEN FOREST",
        world: 2800, crystals: 4, enemies: 5, enemySpeed: 1,
        light: 140, cooldown: 4, trees: 300, solidTrees: true,
        walls: 0, hazards: 0, par: [70, 110, 160],
        hint: "The trees are thick here and block your way. Find 4 memories.",
        theme: { ground: "#1d3326", grid: "rgba(140,200,140,0.06)", border: "#5f8a63",
                 tree: "#1a4a2c", treeHi: "#2a6b3e", wall: "#3d4a40", night: "#010806" }
    },
    {
        number: 3, name: "THE LOST PATH",
        world: 3000, crystals: 5, enemies: 6, enemySpeed: 1.1,
        light: 125, cooldown: 4, trees: 50, solidTrees: false,
        walls: 20, hazards: 0, par: [90, 135, 190],
        hint: "Ancient ruins block the way. Use the walls to lose your hunters.",
        theme: { ground: "#26303f", grid: "rgba(150,180,230,0.09)", border: "#6c85b0",
                 tree: "#2f4a52", treeHi: "#45707a", wall: "#6b7a99", night: "#02040b" }
    },
    {
        number: 4, name: "SHADOWS RISING",
        world: 3200, crystals: 5, enemies: 8, enemySpeed: 1.2,
        light: 110, cooldown: 5, trees: 130, solidTrees: true,
        walls: 0, hazards: 11, par: [100, 150, 210],
        hint: "Toxic pools hide in the dark. Fire a shockwave to reveal them.",
        theme: { ground: "#2a2038", grid: "rgba(190,150,240,0.07)", border: "#8a6cb5",
                 tree: "#3b2a55", treeHi: "#5a3f80", wall: "#55486e", night: "#05020a" }
    },
    {
        number: 5, name: "THE FINAL MEMORY",
        world: 3600, crystals: 6, enemies: 10, enemySpeed: 1.35,
        light: 95, cooldown: 5, trees: 90, solidTrees: true,
        walls: 12, hazards: 12, par: [130, 190, 260],
        hint: "The portal is sealed until all 6 memories are found. Survive.",
        theme: { ground: "#35201f", grid: "rgba(255,150,120,0.07)", border: "#b5654f",
                 tree: "#5a2a26", treeHi: "#82403a", wall: "#6e4a44", night: "#080203" }
    }
];

const T = () => getLevelConfig().theme;

let currentLevel = 1;
let unlockedLevel = 1;
let levelProgress = {};

let levelElapsed = 0;
let levelStartTime = 0;
let finishingLevel = false;

// ENDLESS MODE: zones keep coming, each harder than the last.
let endless = false;
let endlessZone = 1;
let endlessTotal = 0;
let endlessBest = null;
let endlessCfg = null;

function refreshEndlessCfg() {
    const base = LEVELS[(endlessZone - 1) % LEVELS.length];
    const z = endlessZone;

    endlessCfg = {
        ...base,
        number: 5 + z,
        name: `ENDLESS — ZONE ${z}`,
        crystals: Math.min(6, 3 + Math.floor((z - 1) / 3)),
        enemies: Math.min(30, 3 + z * 2),
        enemySpeed: Math.min(2.2, 0.9 + z * 0.1),
        light: Math.max(80, base.light - Math.floor((z - 1) / 5) * 10),
        hint: "ENDLESS: collect every memory, enter the portal, survive the next zone."
    };
}

function getLevelConfig() {
    if (endless && endlessCfg) return endlessCfg;
    return LEVELS[currentLevel - 1] || LEVELS[0];
}

function starsForTime(seconds) {
    const par = getLevelConfig().par;
    if (seconds <= par[0]) return 3;
    if (seconds <= par[1]) return 2;
    if (seconds <= par[2]) return 1;
    return 0;
}

function formatTime(seconds) {
    return `${Math.floor(seconds / 60)}:${(seconds % 60).toFixed(1).padStart(4, "0")}`;
}

// ==========================================
// DYNAMIC LEVEL SELECTOR
// ==========================================

const levelSelector = document.createElement("div");

levelSelector.id = "levelSelector";
levelSelector.style.cssText = `
    display:flex;
    flex-wrap:wrap;
    justify-content:center;
    gap:9px;
    margin:22px auto;
    max-width:430px;
`;

const levelTitle = document.createElement("div");
levelTitle.textContent = "SELECT YOUR LEVEL";
levelTitle.style.cssText = `
    font-family:Orbitron,sans-serif;
    font-size:12px;
    letter-spacing:3px;
    text-align:center;
    color:#8fdfff;
    margin-top:22px;
    width:100%;
`;

levelSelector.appendChild(levelTitle);

const levelButtons = [];

LEVELS.forEach(level => {
    const button = document.createElement("button");

    button.textContent = `LEVEL ${level.number}`;
    button.type = "button";
    button.title = level.name;

    button.style.cssText = `
        min-width:100px;
        padding:12px 14px;
        border:1px solid rgba(110,210,255,.35);
        border-radius:7px;
        background:rgba(20,35,60,.7);
        color:#b8eaff;
        font-family:Orbitron,sans-serif;
        font-size:10px;
        letter-spacing:1px;
        cursor:pointer;
        transition:.2s;
    `;

    button.addEventListener("mouseenter", () => {
        if (!button.disabled) {
            button.style.background = "rgba(50,110,160,.7)";
        }
    });

    button.addEventListener("mouseleave", () => {
        button.style.background = "rgba(20,35,60,.7)";
    });

    button.addEventListener("click", () => {
        if (level.number > unlockedLevel) return;

        currentLevel = level.number;
        updateLevelSelector();
    });

    levelSelector.appendChild(button);
    levelButtons.push(button);
});

const endlessButton = document.createElement("button");
endlessButton.type = "button";
endlessButton.className = "menu-button";
endlessButton.textContent = "ENDLESS MODE";
endlessButton.disabled = true;

const endlessBestLabel = document.createElement("div");
endlessBestLabel.style.cssText = `
    font-family:Orbitron,sans-serif;
    font-size:10px;
    letter-spacing:2px;
    text-align:center;
    color:#8fdfff;
    margin:8px 0;
`;

function updateEndlessLabel() {
    endlessBestLabel.textContent = endlessBest
        ? `ENDLESS BEST: ${endlessBest.memories} MEMORIES • ZONE ${endlessBest.zone}`
        : "";
}

endlessButton.addEventListener("click", () => startGame(true, true));

if (startButton && menu) {
    menu.querySelector(".menu-content")?.insertBefore(
        levelSelector,
        startButton
    );
}

function updateLevelSelector() {
    endlessButton.disabled = !currentUser;
    updateEndlessLabel();

    levelButtons.forEach((button, index) => {
        const number = index + 1;
        const progress = levelProgress[String(number)] || {};
        const bestStars = Number(progress.bestStars) || 0;

        button.disabled = number > unlockedLevel;

        button.textContent =
            number > unlockedLevel
                ? `LEVEL ${number} 🔒`
                : `LEVEL ${number} ${"★".repeat(bestStars)}`;

        button.style.opacity = button.disabled ? "0.35" : "1";

        button.style.borderColor =
            currentLevel === number
                ? "#69dfff"
                : "rgba(110,210,255,.35)";

        button.style.boxShadow =
            currentLevel === number
                ? "0 0 15px rgba(80,200,255,.35)"
                : "none";
    });
}

// ==========================================
// DYNAMIC TIMER IN HUD
// ==========================================

const timerPanel = document.createElement("div");

timerPanel.className = "hud-panel";
timerPanel.innerHTML = `
    <span class="hud-label">LEVEL TIMER</span>
    <span id="levelTimerDisplay">0:00.0</span>
`;

const levelTimerDisplay = timerPanel.querySelector("#levelTimerDisplay");

const hudLeft = document.querySelector(".hud-left");

const levelPanel = document.createElement("div");
levelPanel.className = "hud-panel";
levelPanel.innerHTML = `
    <span class="hud-label">LEVEL</span>
    <span id="currentLevelLabel"></span>
`;

if (hudLeft) {
    hudLeft.appendChild(levelPanel);
    hudLeft.appendChild(timerPanel);
}

// ==========================================
// WIN SCREEN RESULTS
// ==========================================

const resultContainer = document.createElement("div");

resultContainer.style.cssText = `
    margin:20px 0;
    text-align:center;
    color:#d9f5ff;
    font-family:Inter,sans-serif;
`;

const resultTime = document.createElement("div");
const resultStars = document.createElement("div");
const resultCoins = document.createElement("div");
const resultBest = document.createElement("div");

resultTime.style.cssText = "margin:12px;font-size:18px;";
resultStars.style.cssText = "margin:14px;font-size:30px;color:#ffe58a;";
resultCoins.style.cssText = "margin:12px;font-size:17px;color:#8fffd3;";
resultBest.style.cssText = "margin:10px;font-size:13px;color:#9ab7ca;";

resultContainer.append(
    resultTime,
    resultStars,
    resultCoins,
    resultBest
);

const winContent = winScreen?.querySelector(".overlay-content");

if (winContent) {
    winContent.appendChild(resultContainer);
}

const nextLevelButton = document.createElement("button");

nextLevelButton.className = "main-button";
nextLevelButton.textContent = "NEXT LEVEL";
nextLevelButton.style.display = "none";

const menuButton = document.createElement("button");

menuButton.className = "menu-button";
menuButton.textContent = "BACK TO MENU";

if (winContent) {
    winContent.appendChild(nextLevelButton);
    winContent.appendChild(menuButton);
}

if (restartButton) {
    restartButton.textContent = "REPLAY LEVEL";
}

menuButton.addEventListener("click", () => {
    showMenu();
    updateLevelSelector();
});

nextLevelButton.addEventListener("click", () => {
    if (currentLevel >= 5) return;

    currentLevel++;
    updateLevelSelector();
    startGame(true);
});

newGameButton?.after(endlessButton, endlessBestLabel);

// ==========================================
// ACCOUNT
// ==========================================

let currentUser = null;
let playerUID = null;
let playersUnsubscribe = null;

let gameStarted = false;
let starting = false;
let frameId = null;
let coins = 0;

let keys = {};

// ==========================================
// GOOGLE LOGIN
// ==========================================

function resetGoogleButton() {
    if (!googleButton) return;

    googleButton.disabled = false;
    googleButton.textContent = "SIGN IN WITH GOOGLE";
}

const LOGIN_ERRORS = {
    "auth/popup-closed-by-user": "Sign-in was cancelled.",
    "auth/cancelled-popup-request": "Sign-in was cancelled.",
    "auth/popup-blocked": "Your browser blocked the sign-in popup.",
    "auth/network-request-failed": "Network error. Check your connection.",
    "auth/unauthorized-domain": "This domain is not authorized in Firebase."
};

async function loginWithGoogle() {
    if (googleButton) {
        googleButton.disabled = true;
        googleButton.textContent = "CONNECTING...";
    }

    if (loginStatus) {
        loginStatus.textContent = "Opening Google login...";
    }

    try {
        await signInWithPopup(auth, provider);

        if (loginStatus) loginStatus.textContent = "";

    } catch (error) {
        console.error("Google login error:", error);

        if (loginStatus) {
            loginStatus.textContent =
                LOGIN_ERRORS[error.code] ||
                `${error.code || "Error"}: ${error.message}`;
        }

        resetGoogleButton();
    }
}

googleButton?.addEventListener("click", loginWithGoogle);

// ==========================================
// LOGOUT
// ==========================================

async function logout() {
    try {
        if (gameStarted) await saveGame();

        stopLoop();
        gameStarted = false;
        keys = {};

        await signOut(auth);
        showMenu();

    } catch (error) {
        console.error("Logout error:", error);
    }
}

logoutButton?.addEventListener("click", logout);

// ==========================================
// AUTH STATE
// ==========================================

onAuthStateChanged(auth, async user => {
    if (user && !user.isAnonymous) {
        currentUser = user;
        playerUID = user.uid;

        setVisible(loginArea, false);
        setVisible(loggedInArea, true);
        resetGoogleButton();

        if (playerName) {
            playerName.textContent = user.displayName || "VÉLORA Player";
        }

        if (playerEmail) {
            playerEmail.textContent = user.email || "";
        }

        if (startButton) {
            startButton.disabled = false;
            startButton.textContent = "ENTER THE WORLD";
        }

        if (newGameButton) newGameButton.disabled = false;

        await savePublicProfile(user);
        listenToPlayers();

        updateLevelSelector();

    } else {
        currentUser = null;
        playerUID = null;
        coins = 0;
        levelProgress = {};
        unlockedLevel = 1;
        currentLevel = 1;
        endless = false;
        endlessBest = null;

        stopLoop();
        gameStarted = false;
        keys = {};

        setVisible(loginArea, true);
        setVisible(loggedInArea, false);
        resetGoogleButton();

        if (startButton) {
            startButton.disabled = true;
            startButton.textContent = "SIGN IN FIRST";
        }

        if (newGameButton) newGameButton.disabled = true;

        if (playersList) {
            playersList.textContent = "Sign in to see the players.";
        }

        if (playersUnsubscribe) {
            playersUnsubscribe();
            playersUnsubscribe = null;
        }

        showMenu();
        updateLevelSelector();
    }
});

// ==========================================
// FIRESTORE PLAYER PROFILE
// ==========================================

function publicUserRef(uid) {
    return doc(db, "users", uid);
}

async function savePublicProfile(user) {
    if (!user) return;

    try {
        const profileRef = publicUserRef(user.uid);
        const snapshot = await getDoc(profileRef);
        const exists = snapshot.exists();
        const data = exists ? snapshot.data() : {};

        const profileData = {
            displayName: user.displayName || "VÉLORA Player",
            photoURL: user.photoURL || "",
            updatedAt: serverTimestamp()
        };

        if (!exists) {
            profileData.coins = 0;
            profileData.highscore = 0;
            profileData.unlockedLevel = 1;
            profileData.levelProgress = {};
            profileData.createdAt = serverTimestamp();
        }

        await setDoc(profileRef, profileData, { merge: true });

        coins = Math.max(0, Number(data.coins) || 0);

        unlockedLevel = Math.max(
            1,
            Math.min(5, Number(data.unlockedLevel) || 1)
        );

        levelProgress = data.levelProgress || {};
        endlessBest = data.endlessBest || null;

        updateHUD();
        updateLevelSelector();

    } catch (error) {
        console.error("Firestore profile error:", error);

        if (loginStatus) {
            loginStatus.textContent =
                "Could not load your profile: " + error.message;
        }
    }
}

// ==========================================
// LEADERBOARD
// ==========================================

function listenToPlayers() {
    if (playersUnsubscribe) {
        playersUnsubscribe();
        playersUnsubscribe = null;
    }

    const leaderboardQuery = query(
        collection(db, "users"),
        orderBy("coins", "desc"),
        limit(50)
    );

    playersUnsubscribe = onSnapshot(
        leaderboardQuery,
        snapshot => {
            if (!playersList) return;

            playersList.innerHTML = "";

            if (snapshot.empty) {
                playersList.textContent = "No players yet.";
                return;
            }

            snapshot.docs.forEach((playerDoc, index) => {
                const data = playerDoc.data() || {};

                const row = document.createElement("div");
                row.className = "leaderboard-row";

                if (playerDoc.id === playerUID) {
                    row.classList.add("is-you");
                }

                const info = document.createElement("div");
                info.className = "leaderboard-player";

                const rank = document.createElement("span");
                rank.className = "leaderboard-rank";
                rank.textContent = `#${index + 1}`;

                const name = document.createElement("span");
                name.className = "leaderboard-name";
                name.textContent = data.displayName || "VÉLORA Player";

                const amount = document.createElement("span");
                amount.className = "leaderboard-coins";
                amount.textContent =
                    `🪙 ${Math.max(0, Number(data.coins) || 0)}`;

                info.append(rank, name);
                row.append(info, amount);
                playersList.appendChild(row);
            });
        },
        error => {
            console.error("Leaderboard error:", error);

            if (playersList) {
                playersList.textContent =
                    "Could not load leaderboard: " + error.message;
            }
        }
    );
}

// ==========================================
// WORLD SETTINGS
// ==========================================

let WORLD_W = 3200;
let WORLD_H = 3200;

let MAX_CRYSTALS = 5;
let PLAYER_LIGHT_RADIUS = 125;

let WAVE_COOLDOWN = 4;
const WAVE_DURATION = 2;

let camera = { x: 0, y: 0 };

let player = {
    x: WORLD_W / 2,
    y: WORLD_H / 2,
    radius: 14,
    speed: 190,
    sprint: 280,
    health: 100,
    energy: 100,
    shockCooldown: 0
};

let crystalsCollected = 0;

let shockwaves = [];
let particles = [];
let enemies = [];
let walls = [];
let hazards = [];
let inHazard = false;
let crystals = [];
let trees = [];
let rocks = [];
let plants = [];

let lastTime = 0;
let messageTimer = 0;
let autosaveTimer = 0;

let collectingCrystal = false;

const darknessCanvas = document.createElement("canvas");
const darknessCtx = darknessCanvas.getContext("2d");

const portal = {
    x: WORLD_W - 180,
    y: WORLD_H - 180,
    radius: 38
};

// ==========================================
// HELPERS
// ==========================================

let rng = Math.random;

function random(min, max) {
    return rng() * (max - min) + min;
}

function mulberry32(seed) {
    return function () {
        seed |= 0;
        seed = (seed + 0x6D2B79F5) | 0;
        let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

function distToRect(x, y, r) {
    return Math.hypot(
        x - clamp(x, r.x, r.x + r.w),
        y - clamp(y, r.y, r.y + r.h)
    );
}

function pushOutRect(o, r, radius) {
    const cx = clamp(o.x, r.x, r.x + r.w);
    const cy = clamp(o.y, r.y, r.y + r.h);
    const dx = o.x - cx;
    const dy = o.y - cy;
    const d = Math.hypot(dx, dy);

    if (d >= radius) return;

    if (d === 0) {
        o.y = r.y - radius;
        return;
    }

    o.x = cx + (dx / d) * radius;
    o.y = cy + (dy / d) * radius;
}

function applyLevelConfig() {
    const c = getLevelConfig();

    WORLD_W = c.world;
    WORLD_H = c.world;
    MAX_CRYSTALS = c.crystals;
    PLAYER_LIGHT_RADIUS = c.light;
    WAVE_COOLDOWN = c.cooldown;

    portal.x = WORLD_W - 180;
    portal.y = WORLD_H - 180;
}

function distance(a, b) {
    return Math.hypot(a.x - b.x, a.y - b.y);
}

function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
}

function toNumber(value, fallback) {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
}

function showMessage(text) {
    if (!message) return;

    message.textContent = text;
    message.style.display = "block";
    messageTimer = 2;
}

// ==========================================
// CANVAS SIZE
// ==========================================

function resizeCanvas() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

    darknessCanvas.width = canvas.width;
    darknessCanvas.height = canvas.height;

    updateCamera();
}

window.addEventListener("resize", resizeCanvas);
resizeCanvas();

// ==========================================
// FIRESTORE SAVE SYSTEM
// ==========================================

function makeSaveData() {
    return {
        level: currentLevel,
        elapsed: levelElapsed,
        x: player.x,
        y: player.y,
        health: player.health,
        energy: player.energy,
        crystals: crystalsCollected,
        crystalList: crystals.map(crystal => ({
            x: Math.round(crystal.x),
            y: Math.round(crystal.y),
            collected: crystal.collected
        })),
        savedAt: Date.now()
    };
}

async function saveGame() {
    if (!playerUID || endless) return;

    try {
        await setDoc(
            publicUserRef(playerUID),
            {
                save: makeSaveData(),
                updatedAt: serverTimestamp()
            },
            { merge: true }
        );
    } catch (error) {
        console.error("Firestore save error:", error);
        showMessage("SAVE FAILED");
    }
}

async function clearSave() {
    if (!playerUID || endless) return;

    try {
        localStorage.removeItem("velora_backup_" + playerUID);
    } catch (error) {}

    try {
        await setDoc(
            publicUserRef(playerUID),
            {
                save: {
                    level: currentLevel,
                    elapsed: 0,
                    x: WORLD_W / 2,
                    y: WORLD_H / 2,
                    health: 100,
                    energy: 100,
                    crystals: 0,
                    crystalList: [],
                    savedAt: Date.now()
                },
                updatedAt: serverTimestamp()
            },
            { merge: true }
        );
    } catch (error) {
        console.error("Firestore clear-save error:", error);
    }
}

function readBackup() {
    if (!playerUID) return null;

    const key = "velora_backup_" + playerUID;

    try {
        const raw = localStorage.getItem(key);
        localStorage.removeItem(key);
        return raw ? JSON.parse(raw) : null;
    } catch (error) {
        return null;
    }
}

async function loadGame() {
    if (!playerUID) return { data: null, failed: false };

    let data = null;
    let failed = false;

    try {
        const snapshot = await getDoc(publicUserRef(playerUID));
        data = snapshot.exists() ? snapshot.data()?.save || null : null;
    } catch (error) {
        console.error("Firestore load error:", error);
        failed = true;
    }

    const backup = readBackup();

    if (
        backup &&
        (!data || toNumber(backup.savedAt, 0) > toNumber(data.savedAt, 0))
    ) {
        data = backup;
    }

    return { data, failed };
}

function applySavedPlayer(data) {
    player.x = Math.max(
        player.radius,
        Math.min(WORLD_W - player.radius, toNumber(data.x, player.x))
    );

    player.y = Math.max(
        player.radius,
        Math.min(WORLD_H - player.radius, toNumber(data.y, player.y))
    );

    player.health = Math.max(1, Math.min(100, toNumber(data.health, 100)));
    player.energy = Math.max(0, Math.min(100, toNumber(data.energy, 100)));

    crystalsCollected = Math.max(
        0,
        Math.min(MAX_CRYSTALS, Math.floor(toNumber(data.crystals, 0)))
    );

    levelElapsed = Math.max(0, toNumber(data.elapsed, 0));
}

function applyCrystalSave(data) {
    if (
        Array.isArray(data.crystalList) &&
        data.crystalList.length === MAX_CRYSTALS
    ) {
        crystals = data.crystalList.map(item => ({
            x: Math.max(0, Math.min(WORLD_W, toNumber(item.x, WORLD_W / 2))),
            y: Math.max(0, Math.min(WORLD_H, toNumber(item.y, WORLD_H / 2))),
            radius: 11,
            collected: Boolean(item.collected),
            pulse: random(0, 6)
        }));

        crystalsCollected = crystals.filter(c => c.collected).length;
    } else {
        crystals.forEach((crystal, index) => {
            crystal.collected = index < crystalsCollected;
        });
    }
}

// ==========================================
// GENERATE WORLD
// ==========================================

function generateWorld() {
    const cfg = getLevelConfig();
    const startPoint = { x: WORLD_W / 2, y: WORLD_H / 2 };

    trees = [];
    rocks = [];
    plants = [];
    crystals = [];
    enemies = [];
    walls = [];
    hazards = [];
    shockwaves = [];
    particles = [];

    // Fixed layout per level: same seed = same level every time.
    rng = mulberry32(cfg.number * 7919 + 13);

    // Crystals
    for (let i = 0; i < MAX_CRYSTALS; i++) {
        let x, y, attempts = 0;

        do {
            x = random(180, WORLD_W - 180);
            y = random(180, WORLD_H - 180);
            attempts++;
        } while (
            (
                distance({ x, y }, startPoint) < 400 ||
                distance({ x, y }, portal) < 300 ||
                crystals.some(c => Math.hypot(c.x - x, c.y - y) < 350)
            ) && attempts < 200
        );

        crystals.push({ x, y, radius: 11, collected: false, pulse: random(0, 6) });
    }

    // Toxic pools
    for (let i = 0; i < cfg.hazards; i++) {
        let x, y, attempts = 0;
        const radius = random(55, 95);

        do {
            x = random(150, WORLD_W - 150);
            y = random(150, WORLD_H - 150);
            attempts++;
        } while (
            (
                distance({ x, y }, startPoint) < radius + 220 ||
                distance({ x, y }, portal) < radius + 160 ||
                crystals.some(c => Math.hypot(c.x - x, c.y - y) < radius + 70)
            ) && attempts < 200
        );

        hazards.push({ x, y, radius, pulse: random(0, 6) });
    }

    // Ruin walls
    for (let i = 0; i < cfg.walls; i++) {
        let rect, attempts = 0;

        do {
            const horizontal = rng() > 0.5;
            const length = random(280, 560);

            rect = {
                x: random(100, WORLD_W - 100 - length),
                y: random(100, WORLD_H - 100 - length),
                w: horizontal ? length : 30,
                h: horizontal ? 30 : length
            };

            attempts++;
        } while (
            (
                distToRect(startPoint.x, startPoint.y, rect) < 170 ||
                distToRect(portal.x, portal.y, rect) < 170 ||
                crystals.some(c => distToRect(c.x, c.y, rect) < 90) ||
                walls.some(w =>
                    rect.x < w.x + w.w + 90 && rect.x + rect.w > w.x - 90 &&
                    rect.y < w.y + w.h + 90 && rect.y + rect.h > w.y - 90
                )
            ) && attempts < 200
        );

        if (attempts < 200) walls.push(rect);
    }

    // Trees
    for (let i = 0; i < cfg.trees; i++) {
        const x = random(70, WORLD_W - 70);
        const y = random(70, WORLD_H - 70);
        const size = random(13, 27);

        if (distance({ x, y }, startPoint) < 110) continue;
        if (distance({ x, y }, portal) < 110) continue;
        if (crystals.some(c => Math.hypot(c.x - x, c.y - y) < 70)) continue;
        if (walls.some(w => distToRect(x, y, w) < size + 20)) continue;

        trees.push({ x, y, size });
    }

    for (let i = 0; i < 140 * (WORLD_W / 3200); i++) {
        rocks.push({
            x: random(60, WORLD_W - 60),
            y: random(60, WORLD_H - 60),
            size: random(8, 19)
        });
    }

    for (let i = 0; i < 100 * (WORLD_W / 3200); i++) {
        plants.push({
            x: random(60, WORLD_W - 60),
            y: random(60, WORLD_H - 60),
            size: random(5, 12),
            color: rng() > 0.5 ? "#477e75" : "#596b9c",
            pulse: random(0, 6)
        });
    }

    // Enemies are random each run
    rng = Math.random;

    for (let i = 0; i < cfg.enemies; i++) {
        let x, y, attempts = 0;

        do {
            x = random(100, WORLD_W - 100);
            y = random(100, WORLD_H - 100);
            attempts++;
        } while (
            (
                Math.hypot(x - startPoint.x, y - startPoint.y) < 400 ||
                walls.some(w => distToRect(x, y, w) < 50)
            ) && attempts < 200
        );

        enemies.push({
            x,
            y,
            radius: 15,
            speed: (random(35, 58) + Math.min(cfg.number, 8) * 3) * cfg.enemySpeed,
            angle: random(0, Math.PI * 2),
            alert: false,
            stunned: 0,
            changeDirection: random(1, 3)
        });
    }
}

// ==========================================
// START GAME
// ==========================================

async function startGame(newGame = false, asEndless = false) {
    if (!currentUser || currentUser.isAnonymous || starting) return;

    starting = true;

    endless = asEndless;

    if (endless) {
        endlessZone = 1;
        endlessTotal = 0;
        refreshEndlessCfg();
        newGame = true;
    }

    if (startButton) {
        startButton.disabled = true;
        startButton.textContent = "LOADING...";
    }

    if (newGameButton) newGameButton.disabled = true;

    try {
        stopLoop();
        gameStarted = false;
        finishingLevel = false;
        collectingCrystal = false;
        inHazard = false;

        applyLevelConfig();

        player.x = WORLD_W / 2;
        player.y = WORLD_H / 2;
        player.health = 100;
        player.energy = 100;
        player.shockCooldown = 0;

        crystalsCollected = 0;
        levelElapsed = 0;

        portal.x = WORLD_W - 180;
        portal.y = WORLD_H - 180;

        let saved = null;
        let loadFailed = false;

        if (!newGame) {
            const result = await loadGame();

            saved = result.data;
            loadFailed = result.failed;

            // Only load a save belonging to the selected level.
            if (saved && Number(saved.level || 1) === currentLevel) {
                applySavedPlayer(saved);
            } else {
                saved = null;
            }
        }

        generateWorld();

        if (saved) applyCrystalSave(saved);

        if (!currentUser) return;

        keys = {};

        setVisible(menu, false);
        setVisible(winScreen, false);
        setVisible(gameUI, true);

        if (message) message.style.display = "none";

        if (hint) {
            hint.textContent =
                "WASD / ARROWS: MOVE  |  SHIFT: SPRINT  |  SPACE: SHOCKWAVE\n" +
                getLevelConfig().hint;
            hint.style.whiteSpace = "pre-line";
        }

        resizeCanvas();

        gameStarted = true;
        lastTime = performance.now();
        levelStartTime = lastTime;
        autosaveTimer = 0;

        updateCamera();
        updateHUD();

        frameId = requestAnimationFrame(gameLoop);

        showMessage(
            endless
                ? getLevelConfig().name
                : `LEVEL ${currentLevel} — ${getLevelConfig().name}`
        );

        if (newGame) {
            await saveGame();
        } else if (loadFailed) {
            showMessage("SAVE COULD NOT LOAD");
        }

    } catch (error) {
        console.error("Start game error:", error);
        showMessage("COULD NOT START GAME");
    } finally {
        starting = false;

        if (currentUser) {
            if (startButton) {
                startButton.disabled = false;
                startButton.textContent = "ENTER THE WORLD";
            }

            if (newGameButton) newGameButton.disabled = false;
        }
    }
}

// ==========================================
// MENU BUTTONS
// ==========================================

startButton?.addEventListener("click", () => {
    startGame(false);
});

newGameButton?.addEventListener("click", async () => {
    if (!currentUser) {
        if (loginStatus) loginStatus.textContent = "Sign in first.";
        return;
    }

    const confirmed = confirm(
        "Start a NEW GAME on this level? Your current level save will be replaced. Your stars and coins will stay."
    );

    if (!confirmed) return;

    await startGame(true);
});

// ==========================================
// INPUT
// ==========================================

const GAME_KEYS = new Set([
    " ",
    "arrowup",
    "arrowdown",
    "arrowleft",
    "arrowright"
]);

window.addEventListener("keydown", event => {
    if (!gameStarted) return;

    const key = event.key.toLowerCase();
    keys[key] = true;

    if (GAME_KEYS.has(key)) event.preventDefault();

    if (event.code === "Space" && !event.repeat) {
        useShockwave();
    }
});

window.addEventListener("keyup", event => {
    keys[event.key.toLowerCase()] = false;
});

window.addEventListener("blur", () => {
    keys = {};
});

// ==========================================
// SHOCKWAVE
// ==========================================

function useShockwave() {
    if (!gameStarted || player.shockCooldown > 0) return;

    shockwaves.push({
        x: player.x,
        y: player.y,
        radius: 15,
        maxRadius: 570,
        life: WAVE_DURATION,
        alpha: 1
    });

    player.shockCooldown = WAVE_COOLDOWN;

    for (const enemy of enemies) {
        if (distance(player, enemy) < 570) {
            enemy.stunned = 1.5;
            enemy.alert = false;
        }
    }

    for (let i = 0; i < 35; i++) {
        const angle = random(0, Math.PI * 2);
        const speed = random(50, 210);

        particles.push({
            x: player.x,
            y: player.y,
            vx: Math.cos(angle) * speed,
            vy: Math.sin(angle) * speed,
            life: random(0.4, 0.9)
        });
    }
}

// ==========================================
// PLAYER UPDATE
// ==========================================

function updatePlayer(dt) {
    let dx = 0;
    let dy = 0;

    if (keys["w"] || keys["arrowup"]) dy--;
    if (keys["s"] || keys["arrowdown"]) dy++;
    if (keys["a"] || keys["arrowleft"]) dx--;
    if (keys["d"] || keys["arrowright"]) dx++;

    const moving = dx !== 0 || dy !== 0;

    if (moving) {
        const length = Math.hypot(dx, dy);

        dx /= length;
        dy /= length;

        const sprinting = keys["shift"] && player.energy > 0;
        const speed = sprinting ? player.sprint : player.speed;

        player.x += dx * speed * dt;
        player.y += dy * speed * dt;

        if (sprinting) {
            player.energy = Math.max(0, player.energy - 25 * dt);
        } else {
            player.energy = Math.min(100, player.energy + 13 * dt);
        }
    } else {
        player.energy = Math.min(100, player.energy + 13 * dt);
    }

    player.x = Math.max(
        player.radius,
        Math.min(WORLD_W - player.radius, player.x)
    );

    player.y = Math.max(
        player.radius,
        Math.min(WORLD_H - player.radius, player.y)
    );

    // Walls and (on forest levels) trees are solid
    for (const wall of walls) pushOutRect(player, wall, player.radius);

    if (getLevelConfig().solidTrees) {
        for (const tree of trees) {
            const minDist = tree.size * 0.5 + player.radius;
            const dx = player.x - tree.x;
            const dy = player.y - tree.y;
            const d = Math.hypot(dx, dy);

            if (d < minDist && d > 0) {
                player.x = tree.x + (dx / d) * minDist;
                player.y = tree.y + (dy / d) * minDist;
            }
        }
    }

    // Toxic pools
    const standingIn = hazards.some(h => distance(player, h) < h.radius);

    if (standingIn) {
        player.health -= 14 * dt;

        if (!inHazard) showMessage("TOXIC POOL — GET OUT");
    }

    inHazard = standingIn;

    player.shockCooldown = Math.max(0, player.shockCooldown - dt);
}

// ==========================================
// ENEMY UPDATE
// ==========================================

function updateEnemies(dt) {
    for (const enemy of enemies) {
        if (enemy.stunned > 0) {
            enemy.stunned -= dt;
            continue;
        }

        const dist = distance(player, enemy);

        if (dist < 260) enemy.alert = true;

        if (enemy.alert) {
            const angle = Math.atan2(
                player.y - enemy.y,
                player.x - enemy.x
            );

            enemy.angle = angle;

            enemy.x += Math.cos(angle) * enemy.speed * dt;
            enemy.y += Math.sin(angle) * enemy.speed * dt;

            if (dist < player.radius + enemy.radius) {
                player.health -= 15 * dt;
            }
        } else {
            enemy.changeDirection -= dt;

            if (enemy.changeDirection <= 0) {
                enemy.angle = random(0, Math.PI * 2);
                enemy.changeDirection = random(1, 3);
            }

            enemy.x += Math.cos(enemy.angle) * enemy.speed * 0.3 * dt;
            enemy.y += Math.sin(enemy.angle) * enemy.speed * 0.3 * dt;
        }

        for (const wall of walls) pushOutRect(enemy, wall, enemy.radius);

        enemy.x = Math.max(20, Math.min(WORLD_W - 20, enemy.x));
        enemy.y = Math.max(20, Math.min(WORLD_H - 20, enemy.y));
    }
}

// ==========================================
// CRYSTALS + 10 COINS
// ==========================================

async function updateCrystals() {
    if (collectingCrystal) return;

    for (const crystal of crystals) {
        if (crystal.collected) continue;

        if (distance(player, crystal) < 28) {
            crystal.collected = true;
            crystalsCollected++;
            collectingCrystal = true;

            if (endless) endlessTotal++;

            try {
                if (playerUID) {
                    await updateDoc(publicUserRef(playerUID), {
                        coins: increment(endless ? 5 : 10),
                        updatedAt: serverTimestamp()
                    });

                    const snapshot = await getDoc(publicUserRef(playerUID));

                    if (snapshot.exists()) {
                        coins = Number(snapshot.data().coins) || 0;
                    }
                }

                updateHUD();
                await saveGame();

                showMessage(endless ? "+5 COINS — MEMORY FOUND" : "+10 COINS — MEMORY FOUND");

            } catch (error) {
                console.error("Coin save error:", error);
                showMessage("COINS COULD NOT BE SAVED");
            }

            collectingCrystal = false;
            break;
        }
    }
}

// ==========================================
// WAVES AND PARTICLES
// ==========================================

function updateWaves(dt) {
    for (const wave of shockwaves) {
        wave.radius = Math.min(
            wave.maxRadius,
            wave.radius + 850 * dt
        );

        wave.life -= dt;
        wave.alpha = Math.max(0, wave.life / WAVE_DURATION);
    }

    shockwaves = shockwaves.filter(wave => wave.life > 0);

    for (const particle of particles) {
        particle.x += particle.vx * dt;
        particle.y += particle.vy * dt;
        particle.life -= dt;
    }

    particles = particles.filter(particle => particle.life > 0);
}

// ==========================================
// MESSAGE UPDATE
// ==========================================

function updateMessage(dt) {
    if (messageTimer > 0) {
        messageTimer -= dt;

        if (messageTimer <= 0 && message) {
            message.style.display = "none";
        }
    }
}

// ==========================================
// CAMERA
// ==========================================

function updateCamera() {
    camera.x = player.x - canvas.width / 2;
    camera.y = player.y - canvas.height / 2;

    camera.x = Math.max(0, Math.min(WORLD_W - canvas.width, camera.x));
    camera.y = Math.max(0, Math.min(WORLD_H - canvas.height, camera.y));
}

// ==========================================
// ENDLESS: NEXT ZONE + RUN END
// ==========================================

function advanceZone() {
    endlessZone++;
    refreshEndlessCfg();
    applyLevelConfig();

    crystalsCollected = 0;
    inHazard = false;
    shockwaves = [];
    particles = [];

    player.x = WORLD_W / 2;
    player.y = WORLD_H / 2;
    player.health = Math.min(100, player.health + 30);
    player.energy = 100;
    player.shockCooldown = 0;

    generateWorld();
    updateCamera();
    showMessage(`${getLevelConfig().name} — +30 HEALTH`);
}

async function finishEndless() {
    const time = levelElapsed;
    const run = { memories: endlessTotal, zone: endlessZone, time: Math.round(time * 10) / 10 };

    let best = run;

    try {
        if (playerUID) {
            const ref = publicUserRef(playerUID);
            const snapshot = await getDoc(ref);
            const prev = snapshot.exists() ? snapshot.data().endlessBest : null;

            if (prev && Number(prev.memories) >= run.memories) {
                best = prev;
            } else {
                await updateDoc(ref, {
                    endlessBest: run,
                    updatedAt: serverTimestamp()
                });
            }
        }
    } catch (error) {
        console.error("Endless save error:", error);
    }

    endlessBest = best;
    updateEndlessLabel();

    resultTime.textContent = `SURVIVED: ${formatTime(time)}`;
    resultStars.textContent = `ZONE ${run.zone}`;
    resultCoins.textContent = `${run.memories} MEMORIES COLLECTED`;
    resultBest.textContent =
        `BEST: ${best.memories} MEMORIES  •  ZONE ${best.zone}`;

    const heading = winContent?.querySelector("h2");
    const paragraph = winContent?.querySelector("p");

    if (heading) heading.textContent = "RUN OVER";
    if (paragraph) paragraph.textContent = "The dark claimed you. How deep can you go?";

    nextLevelButton.style.display = "none";
    if (restartButton) restartButton.textContent = "TRY AGAIN";

    setVisible(gameUI, false);
    setVisible(winScreen, true);
}

// ==========================================
// WORLD UPDATE
// ==========================================

function update(dt) {
    if (!gameStarted) return;

    levelElapsed += dt;

    updatePlayer(dt);
    updateEnemies(dt);
    updateCrystals();
    updateWaves(dt);
    updateMessage(dt);
    updateCamera();

    autosaveTimer += dt;

    if (autosaveTimer >= 15) {
        autosaveTimer = 0;
        saveGame();
    }

    if (player.health <= 0) {
        player.health = 0;
        gameOver();
        return;
    }

    if (
        crystalsCollected >= MAX_CRYSTALS &&
        distance(player, portal) < 55
    ) {
        if (endless) {
            advanceZone();
            return;
        }

        winGame();
    }

    updateHUD();
}

// ==========================================
// DRAW WORLD
// ==========================================

function drawWorld() {
    const theme = T();

    ctx.fillStyle = "#05070b";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.fillStyle = theme.ground;
    ctx.fillRect(-camera.x, -camera.y, WORLD_W, WORLD_H);

    ctx.strokeStyle = theme.grid;
    ctx.lineWidth = 1;

    for (let x = -camera.x % 80; x < canvas.width; x += 80) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, canvas.height);
        ctx.stroke();
    }

    for (let y = -camera.y % 80; y < canvas.height; y += 80) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(canvas.width, y);
        ctx.stroke();
    }

    ctx.strokeStyle = theme.border;
    ctx.lineWidth = 5;
    ctx.strokeRect(-camera.x, -camera.y, WORLD_W, WORLD_H);
}

function drawWalls() {
    ctx.fillStyle = T().wall;

    for (const wall of walls) {
        const x = wall.x - camera.x;
        const y = wall.y - camera.y;

        if (
            x > canvas.width || y > canvas.height ||
            x + wall.w < 0 || y + wall.h < 0
        ) continue;

        ctx.fillStyle = "rgba(0,0,0,0.35)";
        ctx.fillRect(x + 4, y + 6, wall.w, wall.h);

        ctx.fillStyle = T().wall;
        ctx.fillRect(x, y, wall.w, wall.h);

        ctx.strokeStyle = "rgba(255,255,255,0.18)";
        ctx.lineWidth = 2;
        ctx.strokeRect(x, y, wall.w, wall.h);
    }
}

function drawHazards() {
    for (const h of hazards) {
        const x = h.x - camera.x;
        const y = h.y - camera.y;

        if (
            x < -h.radius || y < -h.radius ||
            x > canvas.width + h.radius || y > canvas.height + h.radius
        ) continue;

        h.pulse += 0.03;

        const grad = ctx.createRadialGradient(x, y, 4, x, y, h.radius);
        grad.addColorStop(0, "rgba(170,60,255,0.85)");
        grad.addColorStop(0.7, "rgba(110,40,190,0.6)");
        grad.addColorStop(1, "rgba(80,20,150,0)");

        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(x, y, h.radius + Math.sin(h.pulse) * 4, 0, Math.PI * 2);
        ctx.fill();
    }
}

// ==========================================
// DRAW TREES
// ==========================================

function drawTrees() {
    for (const tree of trees) {
        const x = tree.x - camera.x;
        const y = tree.y - camera.y;

        if (
            x < -60 || y < -60 ||
            x > canvas.width + 60 ||
            y > canvas.height + 60
        ) continue;

        ctx.fillStyle = "#14251c";
        ctx.beginPath();
        ctx.arc(x + 5, y + 7, tree.size + 4, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = "#493a2d";
        ctx.fillRect(x - 5, y, 10, tree.size);

        ctx.fillStyle = T().tree;
        ctx.beginPath();
        ctx.arc(x, y, tree.size, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = T().treeHi;
        ctx.beginPath();
        ctx.arc(x - 5, y - 5, tree.size * 0.65, 0, Math.PI * 2);
        ctx.fill();
    }
}

// ==========================================
// DRAW ROCKS
// ==========================================

function drawRocks() {
    for (const rock of rocks) {
        const x = rock.x - camera.x;
        const y = rock.y - camera.y;

        if (
            x < -40 || y < -40 ||
            x > canvas.width + 40 ||
            y > canvas.height + 40
        ) continue;

        ctx.fillStyle = "#465452";
        ctx.beginPath();
        ctx.ellipse(x, y, rock.size, rock.size * 0.7, 0.2, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = "#697477";
        ctx.beginPath();
        ctx.ellipse(
            x - 3,
            y - 3,
            rock.size * 0.5,
            rock.size * 0.3,
            0.2,
            0,
            Math.PI * 2
        );
        ctx.fill();
    }
}

// ==========================================
// DRAW PLANTS
// ==========================================

function drawPlants() {
    for (const plant of plants) {
        const x = plant.x - camera.x;
        const y = plant.y - camera.y;

        if (
            x < -30 || y < -30 ||
            x > canvas.width + 30 ||
            y > canvas.height + 30
        ) continue;

        plant.pulse += 0.025;

        ctx.save();
        ctx.translate(x, y);

        ctx.fillStyle = plant.color;
        ctx.shadowBlur = 9;
        ctx.shadowColor = plant.color;

        ctx.beginPath();
        ctx.ellipse(
            0,
            0,
            plant.size * 0.6,
            plant.size,
            Math.sin(plant.pulse) * 0.2,
            0,
            Math.PI * 2
        );
        ctx.fill();

        ctx.restore();
    }
}

// ==========================================
// DRAW CRYSTALS
// ==========================================

function drawCrystals() {
    for (const crystal of crystals) {
        if (crystal.collected) continue;

        const x = crystal.x - camera.x;
        const y = crystal.y - camera.y;

        if (
            x < -30 || y < -30 ||
            x > canvas.width + 30 ||
            y > canvas.height + 30
        ) continue;

        crystal.pulse += 0.05;

        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(Math.sin(crystal.pulse) * 0.15);

        ctx.shadowBlur = 20;
        ctx.shadowColor = "#6eeaff";
        ctx.fillStyle = "#76eaff";

        ctx.beginPath();
        ctx.moveTo(0, -17);
        ctx.lineTo(12, -4);
        ctx.lineTo(7, 15);
        ctx.lineTo(-7, 15);
        ctx.lineTo(-12, -4);
        ctx.closePath();
        ctx.fill();

        ctx.restore();
    }
}

// ==========================================
// DRAW PORTAL
// ==========================================

function drawPortal() {
    const x = portal.x - camera.x;
    const y = portal.y - camera.y;

    ctx.save();
    ctx.translate(x, y);

    ctx.globalAlpha = crystalsCollected >= MAX_CRYSTALS ? 1 : 0.3;
    ctx.shadowBlur = 25;
    ctx.shadowColor = "#a56bff";
    ctx.strokeStyle = "#c49aff";
    ctx.lineWidth = 6;

    ctx.beginPath();
    ctx.ellipse(0, 0, 25, 40, 0, 0, Math.PI * 2);
    ctx.stroke();

    ctx.fillStyle = "rgba(140,80,255,0.2)";
    ctx.beginPath();
    ctx.ellipse(0, 0, 19, 34, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
}

// ==========================================
// DRAW ENEMIES
// ==========================================

function drawEnemies() {
    for (const enemy of enemies) {
        const x = enemy.x - camera.x;
        const y = enemy.y - camera.y;

        if (
            x < -50 || y < -50 ||
            x > canvas.width + 50 || y > canvas.height + 50
        ) continue;

        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(enemy.angle);

        ctx.fillStyle =
            enemy.stunned > 0 ? "#9deeff" : "#a4c76d";

        ctx.beginPath();
        ctx.ellipse(0, 0, 17, 12, 0, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle =
            enemy.stunned > 0 ? "#d4faff" : "#b8df82";

        ctx.beginPath();
        ctx.ellipse(10, -3, 10, 9, 0, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = "#ff526b";
        ctx.beginPath();
        ctx.arc(14, -6, 2.5, 0, Math.PI * 2);
        ctx.fill();

        ctx.strokeStyle = "#6e9b61";
        ctx.lineWidth = 3;

        ctx.beginPath();
        ctx.moveTo(-5, 8);
        ctx.lineTo(-10, 15);
        ctx.moveTo(5, 8);
        ctx.lineTo(10, 15);
        ctx.stroke();

        ctx.restore();
    }
}

// ==========================================
// DARKNESS + LIGHT
// ==========================================

function drawNightEffect() {
    const dark = darknessCtx;

    dark.clearRect(0, 0, darknessCanvas.width, darknessCanvas.height);

    dark.globalCompositeOperation = "source-over";
    dark.fillStyle = T().night;
    dark.fillRect(0, 0, darknessCanvas.width, darknessCanvas.height);

    dark.globalCompositeOperation = "destination-out";

    for (const wave of shockwaves) {
        const x = wave.x - camera.x;
        const y = wave.y - camera.y;

        const gradient = dark.createRadialGradient(
            x, y, 0,
            x, y, Math.max(1, wave.radius)
        );

        const reveal = Math.min(1, wave.alpha * 1.5);

        gradient.addColorStop(0, `rgba(0,0,0,${reveal})`);
        gradient.addColorStop(0.75, `rgba(0,0,0,${reveal * 0.9})`);
        gradient.addColorStop(1, "rgba(0,0,0,0)");

        dark.fillStyle = gradient;
        dark.beginPath();
        dark.arc(x, y, wave.radius, 0, Math.PI * 2);
        dark.fill();
    }

    const px = player.x - camera.x;
    const py = player.y - camera.y;

    const playerLight = dark.createRadialGradient(
        px, py, 5,
        px, py, PLAYER_LIGHT_RADIUS
    );

    playerLight.addColorStop(0, "rgba(0,0,0,0.85)");
    playerLight.addColorStop(0.45, "rgba(0,0,0,0.55)");
    playerLight.addColorStop(1, "rgba(0,0,0,0)");

    dark.fillStyle = playerLight;
    dark.beginPath();
    dark.arc(px, py, PLAYER_LIGHT_RADIUS, 0, Math.PI * 2);
    dark.fill();

    dark.globalCompositeOperation = "source-over";

    ctx.drawImage(darknessCanvas, 0, 0);
}

// ==========================================
// DRAW SHOCKWAVE RINGS
// ==========================================

function drawWaves() {
    for (const wave of shockwaves) {
        const x = wave.x - camera.x;
        const y = wave.y - camera.y;

        ctx.save();

        ctx.beginPath();
        ctx.arc(x, y, wave.radius, 0, Math.PI * 2);

        ctx.strokeStyle = `rgba(100,230,255,${wave.alpha})`;
        ctx.lineWidth = 3;
        ctx.shadowBlur = 15;
        ctx.shadowColor = "#64e6ff";
        ctx.stroke();

        ctx.restore();
    }
}

// ==========================================
// DRAW PLAYER
// ==========================================

function drawPlayer() {
    const x = player.x - camera.x;
    const y = player.y - camera.y;

    ctx.save();
    ctx.translate(x, y);

    ctx.fillStyle = "rgba(0,0,0,0.3)";
    ctx.beginPath();
    ctx.ellipse(0, 12, 15, 7, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "#e6e3d6";
    ctx.beginPath();
    ctx.arc(0, 0, player.radius, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "#65d9df";
    ctx.shadowBlur = 12;
    ctx.shadowColor = "#65d9df";

    ctx.beginPath();
    ctx.arc(0, -3, 9, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
}

// ==========================================
// DRAW PARTICLES
// ==========================================

function drawParticles() {
    for (const particle of particles) {
        const x = particle.x - camera.x;
        const y = particle.y - camera.y;

        ctx.fillStyle =
            `rgba(100,230,255,${Math.max(0, particle.life)})`;

        ctx.beginPath();
        ctx.arc(x, y, 2.5, 0, Math.PI * 2);
        ctx.fill();
    }
}

// ==========================================
// HUD
// ==========================================

function updateHUD() {
    if (crystalCount) {
        crystalCount.textContent = `${crystalsCollected} / ${MAX_CRYSTALS}`;
    }

    if (healthBar) {
        healthBar.style.width = clamp(player.health, 0, 100) + "%";
    }

    if (energyBar) {
        energyBar.style.width = clamp(player.energy, 0, 100) + "%";
    }

    if (cooldownElement) {
        cooldownElement.textContent =
            player.shockCooldown > 0
                ? player.shockCooldown.toFixed(1) + "s"
                : "READY";
    }

    if (coinsDisplay) {
        coinsDisplay.textContent = `🪙 ${coins}`;
    }

    if (levelTimerDisplay) {
        levelTimerDisplay.textContent = formatTime(levelElapsed);
    }

    const levelLabel = document.getElementById("currentLevelLabel");

    if (levelLabel) {
        levelLabel.textContent = endless
            ? `ZONE ${endlessZone} · ${endlessTotal} MEMORIES`
            : `${currentLevel} — ${getLevelConfig().name}`;
    }
}

// ==========================================
// FINISH LEVEL + AWARD COINS
// ==========================================

async function completeLevel() {
    const completedTime = levelElapsed;
    const stars = starsForTime(completedTime);
    const reward = stars * 10;

    const key = String(currentLevel);
    const profileRef = publicUserRef(playerUID);

    let newBestTime = completedTime;
    let newBestStars = stars;

    try {
        await runTransaction(db, async transaction => {
            const snapshot = await transaction.get(profileRef);

            if (!snapshot.exists()) {
                throw new Error("Player profile does not exist.");
            }

            const data = snapshot.data();
            const oldProgress = data.levelProgress || {};
            const oldLevel = oldProgress[key] || {};

            const previousBestTime =
                Number(oldLevel.bestTime);

            const previousBestStars =
                Number(oldLevel.bestStars) || 0;

            newBestTime =
                Number.isFinite(previousBestTime) && previousBestTime > 0
                    ? Math.min(previousBestTime, completedTime)
                    : completedTime;

            newBestStars = Math.max(previousBestStars, stars);

            const updatedProgress = {
                ...oldProgress,
                [key]: {
                    bestTime: newBestTime,
                    bestStars: newBestStars
                }
            };

            const newUnlockedLevel = Math.min(
                5,
                Math.max(Number(data.unlockedLevel) || 1, currentLevel + 1)
            );

            transaction.update(profileRef, {
                coins: increment(reward),
                levelProgress: updatedProgress,
                unlockedLevel: newUnlockedLevel,
                updatedAt: serverTimestamp()
            });

            unlockedLevel = newUnlockedLevel;
            levelProgress = updatedProgress;
        });

        coins += reward;
        updateHUD();
        updateLevelSelector();

        await clearSave();

        showLevelResults(completedTime, stars, reward, newBestTime, newBestStars);

    } catch (error) {
        console.error("Level completion error:", error);

        // The player can see that the reward could not be saved.
        showMessage("LEVEL FINISHED — SAVE ERROR");
        setTimeout(() => showMenu(), 1800);
    }
}

function showLevelResults(time, stars, reward, bestTime, bestStars) {
    resultTime.textContent = `TIME: ${formatTime(time)}`;

    resultStars.textContent =
        stars > 0 ? "★".repeat(stars) + "☆".repeat(3 - stars) : "NO STARS";

    resultCoins.textContent = `+${reward} COINS`;

    resultBest.textContent =
        `BEST: ${formatTime(bestTime)}  •  ${bestStars} / 3 STARS`;

    const heading = winContent?.querySelector("h2");
    const paragraph = winContent?.querySelector("p");

    if (heading) {
        heading.textContent =
            currentLevel === 5 ? "VÉLORA RESTORED" : "LEVEL COMPLETED";
    }

    if (paragraph) {
        paragraph.textContent =
            currentLevel === 5
                ? "You have restored the memories of VÉLORA."
                : `${getLevelConfig().name} completed.`;
    }

    nextLevelButton.style.display =
        currentLevel < 5 ? "block" : "none";

    if (currentLevel < 5) {
        nextLevelButton.textContent = `NEXT LEVEL — ${currentLevel + 1}`;
    }

    if (restartButton) {
        restartButton.textContent = "REPLAY LEVEL";
    }

    setVisible(gameUI, false);
    setVisible(winScreen, true);
}

// ==========================================
// WIN
// ==========================================

async function winGame() {
    if (!gameStarted || finishingLevel) return;

    finishingLevel = true;
    gameStarted = false;

    stopLoop();
    keys = {};

    await completeLevel();
}

// ==========================================
// GAME OVER
// ==========================================

function gameOver() {
    if (!gameStarted) return;

    gameStarted = false;
    stopLoop();

    player.health = 0;
    updateHUD();

    if (endless) {
        finishEndless();
        return;
    }

    player.health = 100;
    player.energy = 100;

    saveGame();

    showMessage("YOU WERE LOST IN THE DARK");

    setTimeout(() => {
        showMenu();

        if (message) message.style.display = "none";
    }, 2200);
}

// ==========================================
// SHOW MENU
// ==========================================

function showMenu() {
    setVisible(menu, true);
    setVisible(gameUI, false);
    setVisible(winScreen, false);

    updateLevelSelector();
}

// ==========================================
// REPLAY LEVEL
// ==========================================

restartButton?.addEventListener("click", () => {
    setVisible(winScreen, false);
    startGame(true, endless);
});

// ==========================================
// SAVE WHEN LEAVING
// ==========================================

window.addEventListener("beforeunload", () => {
    if (!playerUID || !gameStarted || endless) return;

    try {
        localStorage.setItem(
            "velora_backup_" + playerUID,
            JSON.stringify(makeSaveData())
        );
    } catch (error) {
        console.error("Exit backup error:", error);
    }
});

document.addEventListener("visibilitychange", () => {
    if (document.hidden && gameStarted) {
        saveGame();
    }
});

// ==========================================
// RENDER
// ==========================================

function render() {
    drawWorld();
    drawTrees();
    drawRocks();
    drawPlants();
    drawHazards();
    drawWalls();
    drawPortal();
    drawCrystals();
    drawEnemies();

    drawNightEffect();

    drawWaves();
    drawParticles();
    drawPlayer();
}

// ==========================================
// GAME LOOP
// ==========================================

function stopLoop() {
    if (frameId !== null) {
        cancelAnimationFrame(frameId);
        frameId = null;
    }
}

function gameLoop(timestamp) {
    frameId = null;

    if (!gameStarted) return;

    const dt = clamp((timestamp - lastTime) / 1000, 0, 0.04);

    lastTime = timestamp;

    update(dt);
    render();

    if (gameStarted) {
        frameId = requestAnimationFrame(gameLoop);
    }
}

// ==========================================
// INITIAL STATE
// ==========================================

setVisible(menu, true);
setVisible(gameUI, false);
setVisible(winScreen, false);

if (startButton) {
    startButton.disabled = true;
    startButton.textContent = "SIGN IN FIRST";
}

if (newGameButton) {
    newGameButton.disabled = true;
}

updateLevelSelector();
updateHUD();

console.log("VÉLORA — 5 UNIQUE LEVELS LOADED");
