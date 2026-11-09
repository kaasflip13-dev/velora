// ==========================================
// VÉLORA — THE WORLD THAT LISTENS
// FIREBASE FIRESTORE + COINS + 2D WORLD
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
    serverTimestamp
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

provider.setCustomParameters({
    prompt: "select_account"
});

setPersistence(auth, browserLocalPersistence).catch(error => {
    console.error("Persistence error:", error);
});

// ==========================================
// HTML ELEMENTS
// ==========================================

const canvas = document.getElementById("game");

if (!canvas) {
    throw new Error('Canvas with id="game" not found in index.html.');
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

// The HTML "hidden" attribute is forced to display:none in the CSS,
// so visibility is always toggled through this helper.
function setVisible(element, visible) {
    if (element) element.hidden = !visible;
}

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
    "auth/popup-blocked": "Your browser blocked the sign-in popup. Allow popups for this page and try again.",
    "auth/network-request-failed": "Network error. Check your connection and try again.",
    "auth/unauthorized-domain": "This domain is not authorized in Firebase Authentication."
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

        if (loginStatus) {
            loginStatus.textContent = "";
        }
    } catch (error) {
        console.error("Google login error:", error);

        if (loginStatus) {
            loginStatus.textContent =
                LOGIN_ERRORS[error.code] ||
                `${error.code || "Error"}: ${error.message || "Could not sign in."}`;
        }

        resetGoogleButton();
    }
}

if (googleButton) {
    googleButton.addEventListener("click", loginWithGoogle);
}

// ==========================================
// LOGOUT
// ==========================================

async function logout() {
    try {
        if (gameStarted) {
            await saveGame();
        }

        stopLoop();
        gameStarted = false;
        keys = {};

        await signOut(auth);
        showMenu();

    } catch (error) {
        console.error("Logout error:", error);
    }
}

if (logoutButton) {
    logoutButton.addEventListener("click", logout);
}

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

        if (newGameButton) {
            newGameButton.disabled = false;
        }

        await savePublicProfile(user);
        listenToPlayers();

    } else {
        currentUser = null;
        playerUID = null;
        coins = 0;

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

        if (newGameButton) {
            newGameButton.disabled = true;
        }

        if (playersList) {
            playersList.textContent = "Sign in to see the players.";
        }

        if (playersUnsubscribe) {
            playersUnsubscribe();
            playersUnsubscribe = null;
        }

        showMenu();
    }
});

// ==========================================
// FIRESTORE PLAYER PROFILE + LEADERBOARD
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

        const profileData = {
            displayName: user.displayName || "VÉLORA Player",
            photoURL: user.photoURL || "",
            updatedAt: serverTimestamp()
        };

        if (!exists) {
            profileData.coins = 0;
            profileData.highscore = 0;
            profileData.createdAt = serverTimestamp();
        }

        await setDoc(profileRef, profileData, { merge: true });

        coins = exists
            ? Math.max(0, Number(snapshot.data()?.coins) || 0)
            : 0;

        updateHUD();

    } catch (error) {
        console.error("Firestore profile error:", error);

        if (loginStatus) {
            loginStatus.textContent =
                "Could not load your Firestore profile: " + error.message;
        }
    }
}

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

                info.appendChild(rank);
                info.appendChild(name);
                row.appendChild(info);
                row.appendChild(amount);

                playersList.appendChild(row);
            });
        },
        error => {
            console.error("Firestore leaderboard error:", error);

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

const WORLD_W = 3200;
const WORLD_H = 3200;

const MAX_CRYSTALS = 5;
const TOTAL_ENEMIES = 7;
const PLAYER_LIGHT_RADIUS = 125;

const WAVE_COOLDOWN = 4;
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

let keys = {};
let crystalsCollected = 0;

let shockwaves = [];
let particles = [];
let enemies = [];
let crystals = [];
let trees = [];
let rocks = [];
let plants = [];

let lastTime = 0;
let messageTimer = 0;
let autosaveTimer = 0;

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

function random(min, max) {
    return Math.random() * (max - min) + min;
}

function distance(a, b) {
    return Math.hypot(a.x - b.x, a.y - b.y);
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

function toNumber(value, fallback) {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
}

function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
}

function makeSaveData() {
    return {
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
    if (!playerUID) return;

    const saveData = makeSaveData();

    try {
        await setDoc(
            publicUserRef(playerUID),
            {
                save: saveData,
                updatedAt: serverTimestamp()
            },
            { merge: true }
        );

    } catch (error) {
        console.error("Firestore save error:", error);
        showMessage("SAVE FAILED");
    }
}

// Resets the stored progress (used after winning) so the next
// "ENTER THE WORLD" does not drop the player back on the portal.
async function clearSave() {
    if (!playerUID) return;

    try {
        localStorage.removeItem("velora_backup_" + playerUID);
    } catch (error) {
        // ignore
    }

    try {
        await setDoc(
            publicUserRef(playerUID),
            {
                save: {
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

// Emergency backup written on page close (see beforeunload).
// Only used when it is newer than the Firestore save.
function readBackup() {
    if (!playerUID) return null;

    const storageKey = "velora_backup_" + playerUID;

    try {
        const raw = localStorage.getItem(storageKey);
        localStorage.removeItem(storageKey);

        return raw ? JSON.parse(raw) : null;
    } catch (error) {
        return null;
    }
}

// Returns { data, failed }. data is the save object or null.
async function loadGame() {
    if (!playerUID) return { data: null, failed: false };

    let data = null;
    let failed = false;

    try {
        const snapshot = await getDoc(publicUserRef(playerUID));
        data = snapshot.exists() ? (snapshot.data()?.save || null) : null;
    } catch (error) {
        console.error("Firestore load error:", error);
        failed = true;
    }

    const backup = readBackup();

    if (backup && (!data || toNumber(backup.savedAt, 0) > toNumber(data.savedAt, 0))) {
        data = backup;
    }

    return { data, failed };
}

function applySavedPlayer(data) {
    player.x = clamp(toNumber(data.x, player.x), player.radius, WORLD_W - player.radius);
    player.y = clamp(toNumber(data.y, player.y), player.radius, WORLD_H - player.radius);
    player.health = clamp(toNumber(data.health, 100), 1, 100);
    player.energy = clamp(toNumber(data.energy, 100), 0, 100);

    crystalsCollected = clamp(
        Math.floor(toNumber(data.crystals, 0)),
        0,
        MAX_CRYSTALS
    );
}

// Runs after generateWorld(): restores which crystals were already taken,
// so reloading a save cannot be used to collect (and be paid for) them again.
function applyCrystalSave(data) {
    if (Array.isArray(data.crystalList) && data.crystalList.length === MAX_CRYSTALS) {
        crystals = data.crystalList.map(item => ({
            x: clamp(toNumber(item.x, WORLD_W / 2), 0, WORLD_W),
            y: clamp(toNumber(item.y, WORLD_H / 2), 0, WORLD_H),
            radius: 11,
            collected: Boolean(item.collected),
            pulse: random(0, 6)
        }));

        crystalsCollected = crystals.filter(crystal => crystal.collected).length;
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
    trees = [];
    rocks = [];
    plants = [];
    crystals = [];
    enemies = [];
    shockwaves = [];
    particles = [];

    for (let i = 0; i < 190; i++) {
        const x = random(70, WORLD_W - 70);
        const y = random(70, WORLD_H - 70);

        if (Math.hypot(x - player.x, y - player.y) < 100) continue;

        trees.push({
            x,
            y,
            size: random(13, 27)
        });
    }

    for (let i = 0; i < 140; i++) {
        const x = random(60, WORLD_W - 60);
        const y = random(60, WORLD_H - 60);

        rocks.push({
            x,
            y,
            size: random(8, 19)
        });
    }

    for (let i = 0; i < 100; i++) {
        plants.push({
            x: random(60, WORLD_W - 60),
            y: random(60, WORLD_H - 60),
            size: random(5, 12),
            color: Math.random() > 0.5 ? "#477e75" : "#596b9c",
            pulse: random(0, 6)
        });
    }

    for (let i = 0; i < MAX_CRYSTALS; i++) {
        let x;
        let y;
        let attempts = 0;

        do {
            x = random(180, WORLD_W - 180);
            y = random(180, WORLD_H - 180);
            attempts++;
        } while (
            (Math.hypot(x - player.x, y - player.y) < 300 ||
             Math.hypot(x - portal.x, y - portal.y) < 180) &&
            attempts < 100
        );

        crystals.push({
            x,
            y,
            radius: 11,
            collected: false,
            pulse: random(0, 6)
        });
    }

    for (let i = 0; i < TOTAL_ENEMIES; i++) {
        let x;
        let y;
        let attempts = 0;

        do {
            x = random(100, WORLD_W - 100);
            y = random(100, WORLD_H - 100);
            attempts++;
        } while (
            Math.hypot(x - player.x, y - player.y) < 350 &&
            attempts < 100
        );

        enemies.push({
            x,
            y,
            radius: 15,
            speed: random(35, 58),
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

async function startGame(newGame = false) {
    if (!currentUser || currentUser.isAnonymous || starting) return;

    starting = true;

    if (startButton) {
        startButton.disabled = true;
        startButton.textContent = "LOADING...";
    }

    if (newGameButton) {
        newGameButton.disabled = true;
    }

    try {
        stopLoop();
        gameStarted = false;

        player.x = WORLD_W / 2;
        player.y = WORLD_H / 2;
        player.health = 100;
        player.energy = 100;
        player.shockCooldown = 0;

        crystalsCollected = 0;

        portal.x = WORLD_W - 180;
        portal.y = WORLD_H - 180;

        let saved = null;
        let loadFailed = false;

        if (!newGame) {
            const result = await loadGame();

            saved = result.data;
            loadFailed = result.failed;

            if (saved) applySavedPlayer(saved);
        }

        // The player position is known now, so enemies and crystals
        // are never generated on top of the player.
        generateWorld();

        if (saved) applyCrystalSave(saved);

        // The user may have signed out while the save was loading.
        if (!currentUser) return;

        keys = {};

        setVisible(menu, false);
        setVisible(winScreen, false);
        setVisible(gameUI, true);

        if (message) message.style.display = "none";

        if (hint) {
            hint.textContent =
                "WASD / ARROWS: MOVE  |  SHIFT: SPRINT  |  SPACE: SHOCKWAVE";
        }

        resizeCanvas();

        gameStarted = true;
        lastTime = performance.now();
        autosaveTimer = 0;

        updateCamera();
        updateHUD();

        frameId = requestAnimationFrame(gameLoop);

        if (newGame) {
            showMessage("A NEW JOURNEY BEGINS");
            await saveGame();
        } else if (loadFailed) {
            showMessage("SAVE COULD NOT LOAD");
        }

    } finally {
        starting = false;

        if (currentUser) {
            if (startButton) {
                startButton.disabled = false;
                startButton.textContent = "ENTER THE WORLD";
            }

            if (newGameButton) {
                newGameButton.disabled = false;
            }
        }
    }
}

// ==========================================
// ENTER THE WORLD + NEW GAME BUTTONS
// ==========================================

if (startButton) {
    startButton.addEventListener("click", () => {
        startGame(false);
    });
}

if (newGameButton) {
    newGameButton.addEventListener("click", async () => {
        if (!currentUser) {
            if (loginStatus) loginStatus.textContent = "Sign in first.";
            return;
        }

        const confirmed = confirm(
            "Start a NEW GAME? Your old save will be replaced permanently."
        );

        if (!confirmed) return;

        await startGame(true);
    });
}

// ==========================================
// INPUT
// ==========================================

const GAME_KEYS = new Set([" ", "arrowup", "arrowdown", "arrowleft", "arrowright"]);

window.addEventListener("keydown", event => {
    if (!gameStarted) return;

    const key = event.key.toLowerCase();

    keys[key] = true;

    // Stop the page from scrolling / clicking buttons while playing.
    if (GAME_KEYS.has(key)) {
        event.preventDefault();
    }

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

    player.shockCooldown = Math.max(
        0,
        player.shockCooldown - dt
    );
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

        if (dist < 260) {
            enemy.alert = true;
        }

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

        enemy.x = Math.max(20, Math.min(WORLD_W - 20, enemy.x));
        enemy.y = Math.max(20, Math.min(WORLD_H - 20, enemy.y));
    }
}

// ==========================================
// CRYSTALS + 10 COINS
// ==========================================

let collectingCrystal = false;

async function updateCrystals() {
    if (collectingCrystal) return;

    for (const crystal of crystals) {
        if (crystal.collected) continue;

        if (distance(player, crystal) < 28) {
            crystal.collected = true;
            crystalsCollected++;
            collectingCrystal = true;

            try {
                if (playerUID) {
                    await updateDoc(publicUserRef(playerUID), {
                        coins: increment(10),
                        updatedAt: serverTimestamp()
                    });

                    const profileSnapshot = await getDoc(publicUserRef(playerUID));

                    if (profileSnapshot.exists()) {
                        coins = Number(profileSnapshot.data().coins) || 0;
                    }
                }

                updateHUD();
                await saveGame();

                showMessage("+10 COINS — MEMORY FOUND");

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
// WAVES AND PARTICLES UPDATE
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

    camera.x = Math.max(
        0,
        Math.min(WORLD_W - canvas.width, camera.x)
    );

    camera.y = Math.max(
        0,
        Math.min(WORLD_H - canvas.height, camera.y)
    );
}

// ==========================================
// WORLD UPDATE
// ==========================================

function update(dt) {
    if (!gameStarted) return;

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
        winGame();
    }

    updateHUD();
}

// ==========================================
// DRAW WORLD
// ==========================================

function drawWorld() {
    ctx.fillStyle = "#263b31";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.fillStyle = "#263b31";
    ctx.fillRect(
        -camera.x,
        -camera.y,
        WORLD_W,
        WORLD_H
    );

    ctx.strokeStyle = "rgba(180,210,170,0.08)";
    ctx.lineWidth = 1;

    for (
        let x = -camera.x % 80;
        x < canvas.width;
        x += 80
    ) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, canvas.height);
        ctx.stroke();
    }

    for (
        let y = -camera.y % 80;
        y < canvas.height;
        y += 80
    ) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(canvas.width, y);
        ctx.stroke();
    }

    ctx.strokeStyle = "#829b85";
    ctx.lineWidth = 5;

    ctx.strokeRect(
        -camera.x,
        -camera.y,
        WORLD_W,
        WORLD_H
    );
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

        ctx.fillStyle = "#244f36";
        ctx.beginPath();
        ctx.arc(x, y, tree.size, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = "#376a43";
        ctx.beginPath();
        ctx.arc(
            x - 5,
            y - 5,
            tree.size * 0.65,
            0,
            Math.PI * 2
        );
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
        ctx.ellipse(
            x,
            y,
            rock.size,
            rock.size * 0.7,
            0.2,
            0,
            Math.PI * 2
        );
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
            x > canvas.width + 50 ||
            y > canvas.height + 50
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
// DARKNESS + PLAYER LIGHT + SHOCKWAVE LIGHT
// ==========================================

function drawNightEffect() {
    const dark = darknessCtx;

    dark.clearRect(
        0,
        0,
        darknessCanvas.width,
        darknessCanvas.height
    );

    dark.globalCompositeOperation = "source-over";
    dark.fillStyle = "#02050b";

    dark.fillRect(
        0,
        0,
        darknessCanvas.width,
        darknessCanvas.height
    );

    dark.globalCompositeOperation = "destination-out";

    // Shockwave licht
    for (const wave of shockwaves) {
        const x = wave.x - camera.x;
        const y = wave.y - camera.y;

        const gradient = dark.createRadialGradient(
            x, y, 0,
            x, y, Math.max(1, wave.radius)
        );

        const reveal = Math.min(1, wave.alpha * 1.5);

        gradient.addColorStop(
            0,
            `rgba(0,0,0,${reveal})`
        );

        gradient.addColorStop(
            0.75,
            `rgba(0,0,0,${reveal * 0.9})`
        );

        gradient.addColorStop(
            1,
            "rgba(0,0,0,0)"
        );

        dark.fillStyle = gradient;
        dark.beginPath();
        dark.arc(x, y, wave.radius, 0, Math.PI * 2);
        dark.fill();
    }

    // Kleine permanente lichtcirkel
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
    dark.arc(
        px,
        py,
        PLAYER_LIGHT_RADIUS,
        0,
        Math.PI * 2
    );
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

        ctx.strokeStyle =
            `rgba(100,230,255,${wave.alpha})`;

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
        crystalCount.textContent =
            `${crystalsCollected} / ${MAX_CRYSTALS}`;
    }

    if (healthBar) {
        healthBar.style.width =
            clamp(player.health, 0, 100) + "%";
    }

    if (energyBar) {
        energyBar.style.width =
            clamp(player.energy, 0, 100) + "%";
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
}

// ==========================================
// WIN
// ==========================================

function winGame() {
    if (!gameStarted) return;

    gameStarted = false;
    stopLoop();
    clearSave();

    setVisible(gameUI, false);
    setVisible(winScreen, true);
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

    // Respawn with full stats next time instead of 1 HP.
    player.health = 100;
    player.energy = 100;
    saveGame();

    showMessage("YOU WERE LOST IN THE DARK");

    setTimeout(() => {
        showMenu();

        if (message) {
            message.style.display = "none";
        }
    }, 2200);
}

// ==========================================
// SHOW MENU
// ==========================================

function showMenu() {
    setVisible(menu, true);
    setVisible(gameUI, false);
    setVisible(winScreen, false);
}

// ==========================================
// RESTART
// ==========================================

if (restartButton) {
    restartButton.addEventListener("click", () => {
        setVisible(winScreen, false);
        startGame(true);
    });
}

// ==========================================
// SAVE WHEN LEAVING
// ==========================================

// Firestore writes are not reliable while the page is closing, so a local
// emergency backup is stored too. loadGame() uses it if it is newer.
window.addEventListener("beforeunload", () => {
    if (!playerUID || !gameStarted) return;

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

console.log("VÉLORA Firestore version loaded successfully.");
