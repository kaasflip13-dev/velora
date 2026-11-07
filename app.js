// ==========================================
// VÉLORA — THE WORLD THAT LISTENS
// FIREBASE + COINS + 2D WORLD
// ==========================================

import { initializeApp } from "https://www.gstatic.com/firebasejs/13.1.0/firebase-app.js";

import {
    getAuth,
    GoogleAuthProvider,
    signInWithPopup,
    signOut,
    onAuthStateChanged,
    setPersistence,
    browserLocalPersistence
} from "https://www.gstatic.com/firebasejs/13.1.0/firebase-auth.js";

import {
    getDatabase,
    ref,
    get,
    set,
    onValue,
    runTransaction
} from "https://www.gstatic.com/firebasejs/13.1.0/firebase-database.js";

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
const database = getDatabase(firebaseApp);
const provider = new GoogleAuthProvider();

provider.setCustomParameters({
    prompt: "select_account"
});

try {
    await setPersistence(auth, browserLocalPersistence);
} catch (error) {
    console.error("Persistence error:", error);
}

// ==========================================
// HTML ELEMENTS
// ==========================================

const canvas = document.getElementById("game");

if (!canvas) {
    throw new Error('Canvas met id="game" niet gevonden in index.html.');
}

const ctx = canvas.getContext("2d");

const menu = document.getElementById("menu");
const startButton = document.getElementById("startButton");

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
const cooldownBar = document.getElementById("cooldownBar");
const cooldownText = document.getElementById("cooldownText");
const hint = document.getElementById("hint");
const message = document.getElementById("message");

const winScreen = document.getElementById("winScreen");
const restartButton = document.getElementById("restartButton");

// ==========================================
// ACCOUNT
// ==========================================

let currentUser = null;
let playerUID = null;
let playersUnsubscribe = null;
let gameStarted = false;
let coins = 0;

// ==========================================
// GOOGLE LOGIN
// ==========================================

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
            loginStatus.textContent = "Signed in successfully!";
        }
    } catch (error) {
        console.error("Google login error:", error);

        if (loginStatus) {
            loginStatus.textContent =
                `${error.code || "Error"}: ${error.message || "Could not sign in."}`;
        }

        if (googleButton) {
            googleButton.disabled = false;
            googleButton.textContent = "SIGN IN WITH GOOGLE";
        }
    }
}

if (googleButton) {
    googleButton.addEventListener("click", loginWithGoogle);
}

// ==========================================
// LOGOUT
// ==========================================

async function logout() {
    if (gameStarted) {
        await saveGame();
    }

    try {
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

        if (loginArea) loginArea.style.display = "none";
        if (loggedInArea) loggedInArea.style.display = "block";

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

        await savePublicProfile(user);
        listenToPlayers();

    } else {
        currentUser = null;
        playerUID = null;
        coins = 0;

        if (loginArea) loginArea.style.display = "block";
        if (loggedInArea) loggedInArea.style.display = "none";

        if (startButton) {
            startButton.disabled = true;
            startButton.textContent = "SIGN IN FIRST";
        }

        if (playersList) {
            playersList.textContent = "Sign in to see the players.";
        }

        if (playersUnsubscribe) {
            playersUnsubscribe();
            playersUnsubscribe = null;
        }

        gameStarted = false;
        showMenu();
    }
});

// ==========================================
// PUBLIC PLAYER PROFILE
// ==========================================

async function savePublicProfile(user) {
    if (!user) return;

    const profileRef = ref(database, "publicPlayers/" + user.uid);

    try {
        const snapshot = await get(profileRef);
        const oldData = snapshot.exists() ? snapshot.val() : {};

        if (oldData.coins === undefined) {
            coins = 0;

            await set(
                ref(database, "publicPlayers/" + user.uid + "/coins"),
                0
            );
        } else {
            coins = Math.max(0, Number(oldData.coins) || 0);
        }

        await set(
            ref(database, "publicPlayers/" + user.uid + "/name"),
            user.displayName || "VÉLORA Player"
        );

        await set(
            ref(database, "publicPlayers/" + user.uid + "/photoURL"),
            user.photoURL || ""
        );

        await set(
            ref(database, "publicPlayers/" + user.uid + "/lastSeen"),
            Date.now()
        );

        console.log("Player profile loaded. Coins:", coins);

    } catch (error) {
        console.error("Public profile error:", error);
    }
}

// ==========================================
// PUBLIC PLAYER LIST / COIN RANKING
// ==========================================

function listenToPlayers() {
    if (playersUnsubscribe) return;

    playersUnsubscribe = onValue(
        ref(database, "publicPlayers"),

        snapshot => {
            if (!playersList) return;

            playersList.innerHTML = "";

            if (!snapshot.exists()) {
                playersList.textContent = "No players yet.";
                return;
            }

            const players = [];

            snapshot.forEach(child => {
                const data = child.val() || {};

                players.push({
                    uid: child.key,
                    name: data.name || "VÉLORA Player",
                    coins: Math.max(0, Number(data.coins) || 0)
                });
            });

            players.sort((a, b) => b.coins - a.coins);

            players.forEach((otherPlayer, index) => {
                const item = document.createElement("div");
                item.className = "player-item";

                const name = document.createElement("span");
                name.textContent =
                    `${index + 1}. ${otherPlayer.name}`;

                const amount = document.createElement("span");
                amount.textContent = `🪙 ${otherPlayer.coins}`;

                item.appendChild(name);
                item.appendChild(amount);

                playersList.appendChild(item);
            });
        },

        error => {
            console.error("Player list error:", error);

            if (playersList) {
                playersList.textContent = "Could not load players.";
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
// SAVE SYSTEM
// ==========================================

function saveKey() {
    return playerUID
        ? "velora_backup_" + playerUID
        : "velora_backup";
}

function makeSaveData() {
    return {
        x: player.x,
        y: player.y,
        health: player.health,
        energy: player.energy,
        crystals: crystalsCollected,
        savedAt: Date.now()
    };
}

async function saveGame() {
    if (!playerUID) return;

    const saveData = makeSaveData();

    try {
        localStorage.setItem(saveKey(), JSON.stringify(saveData));
    } catch (error) {
        console.error("Local save error:", error);
    }

    try {
        await set(
            ref(database, "players/" + playerUID + "/save"),
            saveData
        );

        console.log("Game saved!");
    } catch (error) {
        console.error("Firebase save error:", error);
    }
}

async function loadGame() {
    if (!playerUID) return false;

    let data = null;

    try {
        const snapshot = await get(
            ref(database, "players/" + playerUID + "/save")
        );

        if (snapshot.exists()) {
            data = snapshot.val();
        }
    } catch (error) {
        console.error("Firebase load error:", error);
    }

    if (!data) {
        try {
            const localSave = localStorage.getItem(saveKey());

            if (localSave) {
                data = JSON.parse(localSave);
            }
        } catch (error) {
            console.error("Local load error:", error);
        }
    }

    if (!data) return false;

    player.x = Math.max(
        player.radius,
        Math.min(WORLD_W - player.radius, data.x ?? player.x)
    );

    player.y = Math.max(
        player.radius,
        Math.min(WORLD_H - player.radius, data.y ?? player.y)
    );

    player.health = Math.max(1, Math.min(100, data.health ?? 100));
    player.energy = Math.max(0, Math.min(100, data.energy ?? 100));

    crystalsCollected = Math.max(
        0,
        Math.min(MAX_CRYSTALS, data.crystals ?? 0)
    );

    updateHUD();
    return true;
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
    if (!currentUser || currentUser.isAnonymous) return;

    if (startButton) {
        startButton.disabled = true;
        startButton.textContent = "LOADING...";
    }

    gameStarted = false;

    player.x = WORLD_W / 2;
    player.y = WORLD_H / 2;
    player.health = 100;
    player.energy = 100;
    player.shockCooldown = 0;

    crystalsCollected = 0;

    portal.x = WORLD_W - 180;
    portal.y = WORLD_H - 180;

    shockwaves = [];
    particles = [];

    generateWorld();

    if (!newGame) {
        await loadGame();
    }

    keys = {};

    if (menu) menu.style.display = "none";
    if (gameUI) gameUI.style.display = "block";
    if (winScreen) winScreen.style.display = "none";
    if (message) message.style.display = "none";

    gameStarted = true;
    lastTime = performance.now();

    updateCamera();
    updateHUD();

    if (newGame) {
        await saveGame();
        showMessage("A NEW JOURNEY BEGINS");
    }

    requestAnimationFrame(gameLoop);

    if (startButton) {
        startButton.disabled = false;
        startButton.textContent = "ENTER THE WORLD";
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

const newGameButton = document.createElement("button");
newGameButton.id = "newGameButton";
newGameButton.textContent = "NEW GAME";
newGameButton.style.marginTop = "12px";
newGameButton.style.padding = "14px 30px";
newGameButton.style.background = "#18252b";
newGameButton.style.color = "#78eaff";
newGameButton.style.border = "1px solid #78eaff";
newGameButton.style.borderRadius = "6px";
newGameButton.style.fontSize = "15px";
newGameButton.style.fontWeight = "bold";
newGameButton.style.cursor = "pointer";
newGameButton.style.letterSpacing = "2px";

if (menu) {
    menu.appendChild(newGameButton);
}

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

// ==========================================
// INPUT
// ==========================================

window.addEventListener("keydown", event => {
    const key = event.key.toLowerCase();

    keys[key] = true;

    if (event.code === "Space") {
        event.preventDefault();
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

async function updateCrystals() {
    for (const crystal of crystals) {
        if (crystal.collected) continue;

        if (distance(player, crystal) < 28) {
            // Meteen markeren zodat dezelfde crystal
            // niet meerdere keren coins geeft.
            crystal.collected = true;
            crystalsCollected++;

            if (playerUID) {
                const coinsRef = ref(
                    database,
                    "publicPlayers/" + playerUID + "/coins"
                );

                try {
                    const result = await runTransaction(
                        coinsRef,
                        current => {
                            return (Number(current) || 0) + 10;
                        }
                    );

                    if (result.committed) {
                        coins = Number(result.snapshot.val()) || 0;
                        console.log("Coins:", coins);
                    } else {
                        showMessage("COINS NOT SAVED");
                    }
                } catch (error) {
                    console.error("Coins error:", error);
                    showMessage("COINS COULD NOT BE SAVED");
                }
            }

            updateHUD();
            await saveGame();

            showMessage("+10 COINS — MEMORY FOUND");
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
            `${crystalsCollected}/${MAX_CRYSTALS}`;
    }

    const healthBar = document.getElementById("healthBar");
    const energyBar = document.getElementById("energyBar");

    if (healthBar) {
        healthBar.style.width = player.health + "%";
    }

    if (energyBar) {
        energyBar.style.width = player.energy + "%";
    }

    if (cooldownElement) {
        cooldownElement.textContent =
            player.shockCooldown > 0
                ? player.shockCooldown.toFixed(1) + "s"
                : "READY";
    }

    if (cooldownText) {
        cooldownText.textContent =
            player.shockCooldown > 0
                ? player.shockCooldown.toFixed(1) + "s"
                : "READY";
    }

    if (cooldownBar) {
        cooldownBar.style.width =
            `${100 - (player.shockCooldown / WAVE_COOLDOWN) * 100}%`;
    }

    if (hint) {
        hint.textContent =
            "WASD: MOVE  |  SHIFT: SPRINT  |  SPACE: SHOCKWAVE";
    }

    // Coins laten zien als er een coins-element bestaat.
    const coinsDisplay = document.getElementById("coinsDisplay");

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
    saveGame();

    if (winScreen) {
        winScreen.style.display = "flex";
    }

    if (gameUI) {
        gameUI.style.display = "none";
    }

    showMessage("THE SIGNAL HAS BEEN RESTORED");
}

// ==========================================
// GAME OVER
// ==========================================

function gameOver() {
    if (!gameStarted) return;

    gameStarted = false;
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
    if (menu) menu.style.display = "flex";
    if (gameUI) gameUI.style.display = "none";
    if (winScreen) winScreen.style.display = "none";
}

// ==========================================
// RESTART
// ==========================================

if (restartButton) {
    restartButton.addEventListener("click", () => {
        if (winScreen) {
            winScreen.style.display = "none";
        }

        startGame();
    });
}

// ==========================================
// SAVE WHEN LEAVING
// ==========================================

window.addEventListener("beforeunload", () => {
    if (!playerUID || !gameStarted) return;

    try {
        localStorage.setItem(
            saveKey(),
            JSON.stringify(makeSaveData())
        );
    } catch (error) {
        console.error("Exit save error:", error);
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

function gameLoop(timestamp) {
    if (!gameStarted) return;

    const dt = Math.min(
        (timestamp - lastTime) / 1000,
        0.04
    );

    lastTime = timestamp;

    update(dt);
    render();

    if (gameStarted) {
        requestAnimationFrame(gameLoop);
    }
}

// ==========================================
// INITIAL STATE
// ==========================================

if (menu) menu.style.display = "flex";
if (gameUI) gameUI.style.display = "none";
if (winScreen) winScreen.style.display = "none";

if (startButton) {
    startButton.disabled = true;
    startButton.textContent = "SIGN IN FIRST";
}

console.log("VÉLORA loaded successfully.");
