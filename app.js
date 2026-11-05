// ==========================================
// VÉLORA — THE WORLD THAT LISTENS
// GOOGLE LOGIN + PLAYER LIST + CLOUD SAVES
// ==========================================

import { initializeApp } from "https://www.gstatic.com/firebasejs/13.1.0/firebase-app.js";

import {
    getAuth,
    GoogleAuthProvider,
    signInWithPopup,
    signOut,
    onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/13.1.0/firebase-auth.js";

import {
    getDatabase,
    ref,
    get,
    set,
    onValue,
    serverTimestamp
} from "https://www.gstatic.com/firebasejs/13.1.0/firebase-database.js";

// ==========================================
// FIREBASE
// ==========================================

const firebaseConfig = {
    apiKey: "AIzaSyC8PkUPS4X9d4VLyHGnkK8WW4MUDcdus6A",
    authDomain: "velora-5246f.firebaseapp.com",
    projectId: "velora-5246f",
    storageBucket: "velora-5246f.firebasestorage.app",
    messagingSenderId: "688498933492",
    appId: "1:688498933492:web:b28f6aea2a6f5a9ff868a1",
    measurementId: "G-4855RPPXEF"
};

const firebaseApp = initializeApp(firebaseConfig);
const auth = getAuth(firebaseApp);
const provider = new GoogleAuthProvider();

const database = getDatabase(
    firebaseApp,
    "https://velora-5246f-default-rtdb.europe-west1.firebasedatabase.app"
);

let currentUser = null;
let playerUID = null;
let saving = false;
let playersListenerStarted = false;

// ==========================================
// HTML ELEMENTEN
// ==========================================

const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");

const menu = document.getElementById("menu");
const startButton = document.getElementById("startButton");
const gameUI = document.getElementById("gameUI");

const googleButton = document.getElementById("googleButton");
const logoutButton = document.getElementById("logoutButton");

const loginArea = document.getElementById("loginArea");
const loggedInArea = document.getElementById("loggedInArea");

const loginStatus = document.getElementById("loginStatus");
const playerName = document.getElementById("playerName");
const playerEmail = document.getElementById("playerEmail");
const playersList = document.getElementById("playersList");

const crystalCount = document.getElementById("crystalCount");
const cooldownBar = document.getElementById("cooldownBar");
const cooldownText = document.getElementById("cooldownText");

const hint = document.getElementById("hint");
const message = document.getElementById("message");

const winScreen = document.getElementById("winScreen");
const restartButton = document.getElementById("restartButton");

// ==========================================
// INSTELLINGEN
// ==========================================

const WORLD_SIZE = 2200;
const WAVE_COOLDOWN = 5;
const PLAYER_LIGHT_RADIUS = 115;

let running = false;
let lastTime = 0;
let crystals = 0;
let waveCooldown = 0;

let keys = {};
let camera = { x: 0, y: 0 };

let enemies = [];
let crystalObjects = [];
let trees = [];
let rocks = [];
let waves = [];

let portal = { x: 0, y: 0 };
let messageTimer = 0;

const player = {
    x: WORLD_SIZE / 2,
    y: WORLD_SIZE / 2,
    radius: 15,
    speed: 190,
    health: 100
};

function saveKey() {
    return playerUID
        ? "velora_backup_" + playerUID
        : "velora_backup";
}

// ==========================================
// DONKERTE CANVAS
// ==========================================

const darknessCanvas = document.createElement("canvas");
const darknessCtx = darknessCanvas.getContext("2d");

function resizeCanvas() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

    darknessCanvas.width = canvas.width;
    darknessCanvas.height = canvas.height;

    if (running) {
        updateCamera();
        render();
    }
}

window.addEventListener("resize", resizeCanvas);
resizeCanvas();

// ==========================================
// HULPFUNCTIES
// ==========================================

function random(min, max) {
    return Math.random() * (max - min) + min;
}

function distance(a, b) {
    return Math.hypot(a.x - b.x, a.y - b.y);
}

// ==========================================
// GOOGLE LOGIN
// ==========================================

async function loginWithGoogle() {
    googleButton.disabled = true;
    loginStatus.textContent = "Connecting to Google...";

    try {
        const result = await signInWithPopup(auth, provider);

        currentUser = result.user;
        playerUID = result.user.uid;

        loginStatus.textContent = "Google account connected!";
        console.log("Google login:", playerUID);

    } catch (error) {
        console.error("Google login error:", error);

        if (error.code === "auth/popup-closed-by-user") {
            loginStatus.textContent = "Login cancelled.";
        } else if (error.code === "auth/unauthorized-domain") {
            loginStatus.textContent = "Add this website domain in Firebase.";
        } else {
            loginStatus.textContent = "Login failed: " + error.message;
        }

    } finally {
        googleButton.disabled = false;
    }
}

// ==========================================
// UITLOGGEN
// ==========================================

async function logout() {
    if (running) {
        saveGame();
        running = false;
    }

    try {
        await signOut(auth);

        currentUser = null;
        playerUID = null;

        menu.style.display = "flex";
        gameUI.style.display = "none";
        winScreen.style.display = "none";

        console.log("Signed out.");

    } catch (error) {
        console.error("Logout error:", error);
    }
}

// ==========================================
// ACCOUNT STATUS
// ==========================================

onAuthStateChanged(auth, async user => {
    currentUser = user;
    playerUID = user ? user.uid : null;

    if (user) {
        loginArea.style.display = "none";
        loggedInArea.style.display = "block";

        playerName.textContent =
            user.displayName || "VÉLORA Player";

        playerEmail.textContent = user.email || "";

        startButton.disabled = false;
        startButton.textContent = "ENTER THE WORLD";

        await savePublicProfile(user);
        listenToPlayers();

        console.log("Account ready:", user.uid);

    } else {
        loginArea.style.display = "block";
        loggedInArea.style.display = "none";

        startButton.disabled = true;
        startButton.textContent = "SIGN IN FIRST";

        playersList.textContent = "Sign in to see the players.";
    }
});

// ==========================================
// OPENBAAR SPELERSPROFIEL
// ==========================================

async function savePublicProfile(user) {
    if (!user) return;

    const profile = {
        name: user.displayName || "VÉLORA Player",
        photoURL: user.photoURL || "",
        lastSeen: Date.now()
    };

    try {
        await set(
            ref(database, "publicPlayers/" + user.uid),
            profile
        );

        console.log("Player profile saved.");

    } catch (error) {
        console.error("Profile save error:", error);
    }
}

// ==========================================
// SPELERSLIJST
// ==========================================

function listenToPlayers() {
    if (playersListenerStarted) return;

    playersListenerStarted = true;

    onValue(
        ref(database, "publicPlayers"),
        snapshot => {
            playersList.innerHTML = "";

            if (!snapshot.exists()) {
                playersList.textContent = "No players yet.";
                return;
            }

            const players = Object.entries(snapshot.val());

            players.sort((a, b) => {
                return (b[1].lastSeen || 0) -
                       (a[1].lastSeen || 0);
            });

            players.forEach(([uid, data]) => {
                const row = document.createElement("div");
                row.className = "player-row";

                const dot = document.createElement("span");
                dot.className = "player-dot";

                const name = document.createElement("span");
                name.textContent =
                    data.name || "VÉLORA Player";

                if (uid === playerUID) {
                    name.textContent += " (You)";
                }

                row.appendChild(dot);
                row.appendChild(name);
                playersList.appendChild(row);
            });
        },
        error => {
            console.error("Players list error:", error);
            playersList.textContent = "Could not load players.";
        }
    );
}

// ==========================================
// SAVE DATA
// ==========================================

function getSaveData() {
    return {
        x: player.x,
        y: player.y,
        health: player.health,
        crystals: crystals,
        enemies: enemies,
        crystalObjects: crystalObjects,
        trees: trees,
        rocks: rocks,
        portal: portal,
        savedAt: Date.now()
    };
}

function applySaveData(data) {
    if (!data) return false;

    player.x = Number(data.x) || WORLD_SIZE / 2;
    player.y = Number(data.y) || WORLD_SIZE / 2;

    player.x = Math.max(20, Math.min(WORLD_SIZE - 20, player.x));
    player.y = Math.max(20, Math.min(WORLD_SIZE - 20, player.y));

    player.health = Number(data.health ?? 100);
    crystals = Number(data.crystals ?? 0);

    enemies = Array.isArray(data.enemies) ? data.enemies : [];
    trees = Array.isArray(data.trees) ? data.trees : [];
    rocks = Array.isArray(data.rocks) ? data.rocks : [];

    crystalObjects = Array.isArray(data.crystalObjects)
        ? data.crystalObjects.map(c => ({
            ...c,
            pulse: c.pulse || 0
        }))
        : [];

    portal = data.portal || {
        x: WORLD_SIZE - 180,
        y: WORLD_SIZE - 180
    };

    waves = [];
    waveCooldown = 0;

    updateCrystalCount();

    return true;
}

// ==========================================
// LOKALE SAVE
// ==========================================

function saveLocal() {
    try {
        localStorage.setItem(
            saveKey(),
            JSON.stringify(getSaveData())
        );

        return true;

    } catch (error) {
        console.error("Local save error:", error);
        return false;
    }
}

function loadLocal() {
    try {
        const saved = localStorage.getItem(saveKey());

        if (!saved) return false;

        return applySaveData(JSON.parse(saved));

    } catch (error) {
        console.error("Local load error:", error);
        return false;
    }
}

// ==========================================
// FIREBASE SAVE
// ==========================================

async function saveFirebase() {
    if (!playerUID || saving) return;

    saving = true;

    try {
        await set(
            ref(database, "players/" + playerUID + "/save"),
            getSaveData()
        );

        console.log("Cloud save completed!");

    } catch (error) {
        console.error("Cloud save error:", error);

    } finally {
        saving = false;
    }
}

async function loadFirebase() {
    if (!playerUID) return false;

    try {
        const snapshot = await get(
            ref(database, "players/" + playerUID + "/save")
        );

        if (!snapshot.exists()) return false;

        return applySaveData(snapshot.val());

    } catch (error) {
        console.error("Cloud load error:", error);
        return false;
    }
}

async function saveGame() {
    saveLocal();

    if (playerUID) {
        await saveFirebase();
    }
}

// ==========================================
// BESTURING
// ==========================================

window.addEventListener("keydown", e => {
    keys[e.key.toLowerCase()] = true;

    if (e.code === "Space") {
        e.preventDefault();
        createWave();
    }
});

window.addEventListener("keyup", e => {
    keys[e.key.toLowerCase()] = false;
});

window.addEventListener("blur", () => {
    keys = {};

    if (running) saveGame();
});

// ==========================================
// WERELD MAKEN
// ==========================================

function createWorld() {
    trees = [];
    rocks = [];
    enemies = [];
    crystalObjects = [];
    waves = [];

    for (let i = 0; i < 130; i++) {
        trees.push({
            x: random(80, WORLD_SIZE - 80),
            y: random(80, WORLD_SIZE - 80),
            size: random(13, 25)
        });
    }

    for (let i = 0; i < 100; i++) {
        rocks.push({
            x: random(80, WORLD_SIZE - 80),
            y: random(80, WORLD_SIZE - 80),
            size: random(8, 18)
        });
    }

    for (let i = 0; i < 5; i++) {
        let x, y;
        let attempts = 0;

        do {
            x = random(150, WORLD_SIZE - 150);
            y = random(150, WORLD_SIZE - 150);
            attempts++;
        } while (
            Math.hypot(x - player.x, y - player.y) < 300 &&
            attempts < 100
        );

        crystalObjects.push({
            x,
            y,
            collected: false,
            pulse: random(0, 6)
        });
    }

    for (let i = 0; i < 7; i++) {
        enemies.push({
            x: random(100, WORLD_SIZE - 100),
            y: random(100, WORLD_SIZE - 100),
            speed: random(35, 55),
            alert: false,
            angle: 0
        });
    }

    portal = {
        x: WORLD_SIZE - 180,
        y: WORLD_SIZE - 180
    };
}

// ==========================================
// NIEUWE WERELD
// ==========================================

function newWorld() {
    player.x = WORLD_SIZE / 2;
    player.y = WORLD_SIZE / 2;
    player.health = 100;

    crystals = 0;
    waveCooldown = 0;
    waves = [];

    createWorld();
    updateCrystalCount();
}

// ==========================================
// GAME STARTEN
// ==========================================

async function startGame() {
    if (running) return;

    if (!currentUser) {
        loginStatus.textContent = "Sign in with Google first.";
        return;
    }

    startButton.disabled = true;
    startButton.textContent = "LOADING WORLD...";

    try {
        // Eerst de cloud-save proberen.
        let loaded = await loadFirebase();

        // Anders de lokale save van dit account.
        if (!loaded) {
            loaded = loadLocal();
        }

        // Nog geen save? Nieuwe wereld.
        if (!loaded || player.health <= 0) {
            newWorld();
        }

        keys = {};
        waves = [];
        waveCooldown = 0;

        menu.style.display = "none";
        winScreen.style.display = "none";
        gameUI.style.display = "block";

        running = true;
        lastTime = performance.now();

        updateCrystalCount();
        updateCamera();
        render();

        showMessage(
            loaded ? "Welcome back!" : "Welcome to VÉLORA!"
        );

        requestAnimationFrame(gameLoop);

    } catch (error) {
        console.error("Start error:", error);
        showMessage("Could not load your world.");

    } finally {
        startButton.disabled = false;
        startButton.textContent = "ENTER THE WORLD";
    }
}

// ==========================================
// SHOCKWAVE
// ==========================================

function createWave() {
    if (!running || waveCooldown > 0) return;

    waves.push({
        x: player.x,
        y: player.y,
        radius: 5,
        alpha: 1
    });

    waveCooldown = WAVE_COOLDOWN;

    enemies.forEach(enemy => {
        if (distance(player, enemy) < 550) {
            enemy.alert = true;
        }
    });
}

function updateWaves(dt) {
    waves.forEach(wave => {
        wave.radius += 650 * dt;
        wave.alpha -= 0.7 * dt;
    });

    waves = waves.filter(wave =>
        wave.alpha > 0 && wave.radius < 900
    );

    waveCooldown = Math.max(0, waveCooldown - dt);

    cooldownBar.style.width =
        `${100 - waveCooldown / WAVE_COOLDOWN * 100}%`;

    cooldownText.textContent = waveCooldown > 0
        ? `${waveCooldown.toFixed(1)}s`
        : "READY";
}

// ==========================================
// SPELER
// ==========================================

function updatePlayer(dt) {
    let dx = 0;
    let dy = 0;

    if (keys["w"] || keys["arrowup"]) dy--;
    if (keys["s"] || keys["arrowdown"]) dy++;
    if (keys["a"] || keys["arrowleft"]) dx--;
    if (keys["d"] || keys["arrowright"]) dx++;

    if (dx !== 0 || dy !== 0) {
        const length = Math.hypot(dx, dy);

        dx /= length;
        dy /= length;

        const sprint = keys["shift"] ? 1.55 : 1;

        player.x += dx * player.speed * sprint * dt;
        player.y += dy * player.speed * sprint * dt;
    }

    player.x = Math.max(20, Math.min(WORLD_SIZE - 20, player.x));
    player.y = Math.max(20, Math.min(WORLD_SIZE - 20, player.y));
}

// ==========================================
// VIJANDEN
// ==========================================

function updateEnemies(dt) {
    enemies.forEach(enemy => {
        const d = distance(player, enemy);

        if (d < 170) enemy.alert = true;

        if (enemy.alert) {
            const angle = Math.atan2(
                player.y - enemy.y,
                player.x - enemy.x
            );

            enemy.angle = angle;

            enemy.x += Math.cos(angle) * enemy.speed * dt;
            enemy.y += Math.sin(angle) * enemy.speed * dt;

            if (d < 28) {
                player.health -= 12 * dt;

                if (player.health <= 0) {
                    player.health = 0;
                    gameOver();
                }
            }
        }
    });
}

// ==========================================
// KRISTALLEN
// ==========================================

function updateCrystals() {
    crystalObjects.forEach(crystal => {
        if (
            !crystal.collected &&
            distance(player, crystal) < 27
        ) {
            crystal.collected = true;
            crystals++;

            updateCrystalCount();
            showMessage("Memory discovered!");

            saveGame();
        }
    });
}

function updateCrystalCount() {
    crystalCount.textContent = `${crystals}/5`;
}

// ==========================================
// BERICHTEN
// ==========================================

function showMessage(text) {
    message.textContent = text;
    message.style.display = "block";
    messageTimer = 2;
}

function updateMessage(dt) {
    if (messageTimer > 0) {
        messageTimer -= dt;

        if (messageTimer <= 0) {
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
        Math.min(WORLD_SIZE - canvas.width, camera.x)
    );

    camera.y = Math.max(
        0,
        Math.min(WORLD_SIZE - canvas.height, camera.y)
    );
}

// ==========================================
// WERELD TEKENEN
// ==========================================

function drawWorld() {
    ctx.fillStyle = "#263b31";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.strokeStyle = "rgba(180,210,170,0.08)";
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

    ctx.strokeStyle = "#829b85";
    ctx.lineWidth = 5;

    ctx.strokeRect(
        -camera.x,
        -camera.y,
        WORLD_SIZE,
        WORLD_SIZE
    );
}

// ==========================================
// BOMEN
// ==========================================

function drawTrees() {
    trees.forEach(tree => {
        const x = tree.x - camera.x;
        const y = tree.y - camera.y;

        if (
            x < -50 || y < -50 ||
            x > canvas.width + 50 ||
            y > canvas.height + 50
        ) return;

        ctx.fillStyle = "#493a2d";
        ctx.fillRect(x - 5, y, 10, tree.size);

        ctx.fillStyle = "#244f36";
        ctx.beginPath();
        ctx.arc(x, y, tree.size, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = "#376a43";
        ctx.beginPath();
        ctx.arc(x - 5, y - 5, tree.size * 0.65, 0, Math.PI * 2);
        ctx.fill();
    });
}

// ==========================================
// ROTSEN
// ==========================================

function drawRocks() {
    rocks.forEach(rock => {
        const x = rock.x - camera.x;
        const y = rock.y - camera.y;

        if (
            x < -30 || y < -30 ||
            x > canvas.width + 30 ||
            y > canvas.height + 30
        ) return;

        ctx.fillStyle = "#697477";
        ctx.beginPath();
        ctx.ellipse(
            x, y,
            rock.size,
            rock.size * 0.7,
            0, 0, Math.PI * 2
        );
        ctx.fill();
    });
}

// ==========================================
// KRISTALLEN
// ==========================================

function drawCrystals() {
    crystalObjects.forEach(crystal => {
        if (crystal.collected) return;

        const x = crystal.x - camera.x;
        const y = crystal.y - camera.y;

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
    });
}

// ==========================================
// VIJANDEN
// ==========================================

function drawEnemies() {
    enemies.forEach(enemy => {
        const x = enemy.x - camera.x;
        const y = enemy.y - camera.y;

        if (
            x < -50 || y < -50 ||
            x > canvas.width + 50 ||
            y > canvas.height + 50
        ) return;

        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(enemy.angle);

        ctx.fillStyle = "#a4c76d";
        ctx.beginPath();
        ctx.ellipse(0, 0, 17, 12, 0, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = "#b8df82";
        ctx.beginPath();
        ctx.ellipse(10, -3, 10, 9, 0, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = "#ff526b";
        ctx.beginPath();
        ctx.arc(14, -6, 2.5, 0, Math.PI * 2);
        ctx.fill();

        ctx.restore();
    });
}

// ==========================================
// PORTAAL
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
// DONKERTE + LICHT
// ==========================================

function drawNightEffect() {
    const dark = darknessCtx;

    dark.clearRect(0, 0, darknessCanvas.width, darknessCanvas.height);
    dark.globalCompositeOperation = "source-over";
    dark.fillStyle = "#02050b";
    dark.fillRect(0, 0, darknessCanvas.width, darknessCanvas.height);

    dark.globalCompositeOperation = "destination-out";

    waves.forEach(wave => {
        const x = wave.x - camera.x;
        const y = wave.y - camera.y;

        const gradient = dark.createRadialGradient(
            x, y, 0,
            x, y, wave.radius
        );

        const reveal = Math.min(1, wave.alpha * 1.8);

        gradient.addColorStop(0, `rgba(0,0,0,${reveal})`);
        gradient.addColorStop(0.75, `rgba(0,0,0,${reveal * 0.9})`);
        gradient.addColorStop(1, "rgba(0,0,0,0)");

        dark.fillStyle = gradient;
        dark.beginPath();
        dark.arc(x, y, wave.radius, 0, Math.PI * 2);
        dark.fill();
    });

    const px = player.x - camera.x;
    const py = player.y - camera.y;

    const playerLight = dark.createRadialGradient(
        px, py, 5,
        px, py, PLAYER_LIGHT_RADIUS
    );

    playerLight.addColorStop(0, "rgba(0,0,0,0.65)");
    playerLight.addColorStop(0.45, "rgba(0,0,0,0.38)");
    playerLight.addColorStop(1, "rgba(0,0,0,0)");

    dark.fillStyle = playerLight;
    dark.beginPath();
    dark.arc(px, py, PLAYER_LIGHT_RADIUS, 0, Math.PI * 2);
    dark.fill();

    dark.globalCompositeOperation = "source-over";
    ctx.drawImage(darknessCanvas, 0, 0);
}

// ==========================================
// SHOCKWAVES TEKENEN
// ==========================================

function drawWaves() {
    waves.forEach(wave => {
        const x = wave.x - camera.x;
        const y = wave.y - camera.y;

        ctx.beginPath();
        ctx.arc(x, y, wave.radius, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(100,230,255,${wave.alpha})`;
        ctx.lineWidth = 3;
        ctx.stroke();
    });
}

// ==========================================
// SPELER TEKENEN
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
    ctx.beginPath();
    ctx.arc(0, -3, 9, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
}

// ==========================================
// HUD
// ==========================================

function drawHUD() {
    hint.textContent =
        "WASD: MOVE | SHIFT: SPRINT | SPACE: SHOCKWAVE";

    ctx.fillStyle = "rgba(0,0,0,0.7)";
    ctx.fillRect(20, 20, 160, 12);

    ctx.fillStyle = "#71d99a";
    ctx.fillRect(
        20,
        20,
        160 * Math.max(0, player.health / 100),
        12
    );
}

// ==========================================
// GAME OVER
// ==========================================

function gameOver() {
    if (!running) return;

    running = false;
    saveGame();

    message.textContent = "You have been found...";
    message.style.display = "block";

    setTimeout(() => {
        if (!running) {
            menu.style.display = "flex";
            gameUI.style.display = "none";

            startButton.disabled = !currentUser;
            startButton.textContent = currentUser
                ? "ENTER THE WORLD"
                : "SIGN IN FIRST";
        }
    }, 1800);
}

// ==========================================
// WINNEN
// ==========================================

function checkWin() {
    if (crystals >= 5 && distance(player, portal) < 45) {
        running = false;
        saveGame();

        winScreen.style.display = "flex";
        gameUI.style.display = "none";
    }
}

// ==========================================
// UPDATE
// ==========================================

function update(dt) {
    updatePlayer(dt);
    updateEnemies(dt);
    updateCrystals();
    updateWaves(dt);
    updateMessage(dt);

    updateCamera();
    checkWin();
}

// ==========================================
// RENDER
// ==========================================

function render() {
    drawWorld();
    drawTrees();
    drawRocks();
    drawPortal();
    drawCrystals();
    drawEnemies();

    drawNightEffect();
    drawWaves();
    drawPlayer();
    drawHUD();
}

// ==========================================
// GAME LOOP
// ==========================================

function gameLoop(time) {
    if (!running) return;

    const dt = Math.min((time - lastTime) / 1000, 0.04);
    lastTime = time;

    update(dt);
    render();

    requestAnimationFrame(gameLoop);
}

// ==========================================
// KNOPPEN
// ==========================================

googleButton.addEventListener("click", loginWithGoogle);
logoutButton.addEventListener("click", logout);
startButton.addEventListener("click", startGame);

restartButton.addEventListener("click", () => {
    newWorld();

    winScreen.style.display = "none";
    gameUI.style.display = "block";

    running = true;
    lastTime = performance.now();

    updateCamera();
    updateCrystalCount();
    render();

    requestAnimationFrame(gameLoop);
    saveGame();
});

// ==========================================
// AUTOMATISCH OPSLAAN
// ==========================================

setInterval(() => {
    if (running) {
        saveGame();
    }
}, 5000);

// ==========================================
// BEGINSTAND
// ==========================================

menu.style.display = "flex";
gameUI.style.display = "none";
winScreen.style.display = "none";

startButton.disabled = true;
startButton.textContent = "SIGN IN FIRST";

console.log("VÉLORA is ready!");
