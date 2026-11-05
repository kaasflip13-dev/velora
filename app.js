
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
    onValue
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
    measurementId: "G-4855RPPXEF",
    databaseURL: "https://velora-5246f-default-rtdb.europe-west1.firebasedatabase.app/"
};

const firebaseApp = initializeApp(firebaseConfig);
const auth = getAuth(firebaseApp);
const database = getDatabase(firebaseApp);
const provider = new GoogleAuthProvider();

let currentUser = null;
let playerUID = null;
let playersListenerStarted = false;
let gameStarted = false;

// ==========================================
// HTML ELEMENTS
// ==========================================

const canvas = document.getElementById("game");
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
const hint = document.getElementById("hint");
const message = document.getElementById("message");

const winScreen = document.getElementById("winScreen");
const restartButton = document.getElementById("restartButton");

// ==========================================
// GOOGLE LOGIN
// ==========================================

async function loginWithGoogle() {
    if (googleButton) {
        googleButton.disabled = true;
        googleButton.textContent = "CONNECTING...";
    }

    if (loginStatus) {
        loginStatus.textContent = "Connecting to Google...";
    }

    try {
        const result = await signInWithPopup(auth, provider);

        currentUser = result.user;
        playerUID = result.user.uid;

        if (loginStatus) {
            loginStatus.textContent = "Successfully signed in!";
        }

    } catch (error) {
        console.error("Google login error:", error);

        if (loginStatus) {
            loginStatus.textContent =
                error.code === "auth/unauthorized-domain"
                    ? "Add this website domain in Firebase Authorized domains."
                    : error.message;
        }

    } finally {
        if (googleButton) {
            googleButton.disabled = false;
            googleButton.textContent = "SIGN IN WITH GOOGLE";
        }
    }
}

async function logout() {
    if (gameStarted) {
        saveGame();
    }

    try {
        await signOut(auth);
        gameStarted = false;
        showMenu();
    } catch (error) {
        console.error("Logout error:", error);
    }
}

if (googleButton) {
    googleButton.addEventListener("click", loginWithGoogle);
}

if (logoutButton) {
    logoutButton.addEventListener("click", logout);
}

// ==========================================
// AUTH STATE
// ==========================================

onAuthStateChanged(auth, async user => {

    // Oude anonieme login opruimen
    if (user && user.isAnonymous) {
        try {
            await signOut(auth);
        } catch (error) {
            console.error("Could not clear old anonymous login:", error);
        }
        return;
    }

    currentUser = user;
    playerUID = user ? user.uid : null;

    if (user) {
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
        if (loginArea) loginArea.style.display = "block";
        if (loggedInArea) loggedInArea.style.display = "none";

        if (startButton) {
            startButton.disabled = true;
            startButton.textContent = "SIGN IN FIRST";
        }

        if (playersList) {
            playersList.textContent = "Sign in to see the players.";
        }

        playersListenerStarted = false;
    }
});

// ==========================================
// PUBLIC PLAYER PROFILE
// ==========================================

async function savePublicProfile(user) {
    if (!user) return;

    try {
        await set(ref(database, "publicPlayers/" + user.uid), {
            name: user.displayName || "VÉLORA Player",
            photoURL: user.photoURL || "",
            lastSeen: Date.now()
        });
    } catch (error) {
        console.error("Could not save public profile:", error);
    }
}

// ==========================================
// PUBLIC PLAYER LIST
// ==========================================

function listenToPlayers() {
    if (playersListenerStarted) return;

    playersListenerStarted = true;

    const playersRef = ref(database, "publicPlayers");

    onValue(playersRef, snapshot => {
        if (!playersList) return;

        playersList.innerHTML = "";

        if (!snapshot.exists()) {
            playersList.textContent = "No players yet.";
            return;
        }

        const players = [];

        snapshot.forEach(child => {
            players.push({
                uid: child.key,
                ...child.val()
            });
        });

        players.sort((a, b) => (b.lastSeen || 0) - (a.lastSeen || 0));

        players.forEach(player => {
            const item = document.createElement("div");
            item.className = "player-item";

            const name = document.createElement("span");
            name.textContent = player.name || "VÉLORA Player";

            const status = document.createElement("span");
            status.className = "player-status";

            if (player.uid === playerUID) {
                status.textContent = "YOU";
            } else {
                status.textContent = "PLAYER";
            }

            item.appendChild(name);
            item.appendChild(status);
            playersList.appendChild(item);
        });

    }, error => {
        console.error("Player list error:", error);

        if (playersList) {
            playersList.textContent = "Could not load players.";
        }
    });
}

// ==========================================
// SAVE SYSTEM
// ==========================================

function saveKey() {
    return playerUID
        ? "velora_backup_" + playerUID
        : "velora_backup";
}

async function saveGame() {
    if (!playerUID) return;

    const saveData = {
        x: player.x,
        y: player.y,
        health: player.health,
        energy: player.energy,
        crystals: crystalsCollected,
        savedAt: Date.now()
    };

    try {
        localStorage.setItem(saveKey(), JSON.stringify(saveData));

        await set(
            ref(database, "players/" + playerUID + "/save"),
            saveData
        );

        console.log("Game saved!");

    } catch (error) {
        console.error("Save error:", error);
    }
}

async function loadGame() {
    if (!playerUID) return false;

    try {
        const snapshot = await get(
            ref(database, "players/" + playerUID + "/save")
        );

        let data = snapshot.exists() ? snapshot.val() : null;

        if (!data) {
            const localSave = localStorage.getItem(saveKey());
            if (localSave) data = JSON.parse(localSave);
        }

        if (!data) return false;

        player.x = data.x ?? player.x;
        player.y = data.y ?? player.y;
        player.health = data.health ?? 100;
        player.energy = data.energy ?? 100;
        crystalsCollected = data.crystals ?? 0;

        updateHUD();
        return true;

    } catch (error) {
        console.error("Load error:", error);
        return false;
    }
}

// ==========================================
// GAME WORLD
// ==========================================

const WORLD_W = 3200;
const WORLD_H = 3200;

let camera = { x: 0, y: 0 };

let player = {
    x: WORLD_W / 2,
    y: WORLD_H / 2,
    radius: 13,
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
let revealedUntil = 0;
let lastTime = 0;

const MAX_CRYSTALS = 5;
const TOTAL_ENEMIES = 7;

const portal = {
    x: WORLD_W / 2 + 950,
    y: WORLD_H / 2 + 700,
    radius: 38
};

// ==========================================
// RANDOM WORLD GENERATION
// ==========================================

function random(min, max) {
    return Math.random() * (max - min) + min;
}

function distance(a, b) {
    return Math.hypot(a.x - b.x, a.y - b.y);
}

function generateWorld() {
    trees = [];
    rocks = [];
    crystals = [];
    enemies = [];
    shockwaves = [];
    particles = [];

    for (let i = 0; i < 170; i++) {
        trees.push({
            x: random(80, WORLD_W - 80),
            y: random(80, WORLD_H - 80),
            radius: random(12, 25)
        });
    }

    for (let i = 0; i < 110; i++) {
        rocks.push({
            x: random(80, WORLD_W - 80),
            y: random(80, WORLD_H - 80),
            radius: random(7, 18)
        });
    }

    for (let i = 0; i < MAX_CRYSTALS; i++) {
        crystals.push({
            x: random(250, WORLD_W - 250),
            y: random(250, WORLD_H - 250),
            radius: 10,
            collected: false
        });
    }

    for (let i = 0; i < TOTAL_ENEMIES; i++) {
        enemies.push({
            x: random(100, WORLD_W - 100),
            y: random(100, WORLD_H - 100),
            radius: 15,
            speed: random(35, 65),
            angle: random(0, Math.PI * 2),
            changeDirection: random(1, 3),
            alive: true
        });
    }
}

// ==========================================
// GAME START
// ==========================================

async function startGame() {
    if (!currentUser) {
        if (loginStatus) loginStatus.textContent = "Please sign in first.";
        return;
    }

    if (startButton) {
        startButton.disabled = true;
        startButton.textContent = "LOADING...";
    }

    gameStarted = false;

    generateWorld();

    player.x = WORLD_W / 2;
    player.y = WORLD_H / 2;
    player.health = 100;
    player.energy = 100;
    player.shockCooldown = 0;
    crystalsCollected = 0;

    await loadGame();

    if (menu) menu.style.display = "none";
    if (gameUI) gameUI.style.display = "block";
    if (winScreen) winScreen.style.display = "none";

    gameStarted = true;
    lastTime = performance.now();

    updateHUD();
    requestAnimationFrame(gameLoop);

    if (startButton) {
        startButton.disabled = false;
        startButton.textContent = "ENTER THE WORLD";
    }
}

if (startButton) {
    startButton.addEventListener("click", startGame);
}

function showMenu() {
    if (menu) menu.style.display = "flex";
    if (gameUI) gameUI.style.display = "none";
    if (winScreen) winScreen.style.display = "none";
}

// ==========================================
// INPUT
// ==========================================

window.addEventListener("keydown", event => {
    keys[event.key.toLowerCase()] = true;

    if (event.code === "Space") {
        event.preventDefault();
        useShockwave();
    }
});

window.addEventListener("keyup", event => {
    keys[event.key.toLowerCase()] = false;
});

window.addEventListener("beforeunload", () => {
    if (playerUID && gameStarted) {
        localStorage.setItem(saveKey(), JSON.stringify({
            x: player.x,
            y: player.y,
            health: player.health,
            energy: player.energy,
            crystals: crystalsCollected,
            savedAt: Date.now()
        }));
    }
});

// ==========================================
// SHOCKWAVE
// ==========================================

function useShockwave() {
    if (!gameStarted || player.shockCooldown > 0) return;

    shockwaves.push({
        x: player.x,
        y: player.y,
        radius: 0,
        maxRadius: 430,
        life: 1
    });

    player.shockCooldown = 4;
    revealedUntil = performance.now() + 2000;

    for (let enemy of enemies) {
        if (!enemy.alive) continue;

        if (distance(player, enemy) < 430) {
            enemy.stunned = 1.5;
        }
    }

    for (let i = 0; i < 28; i++) {
        particles.push({
            x: player.x,
            y: player.y,
            vx: random(-130, 130),
            vy: random(-130, 130),
            life: random(0.3, 0.8)
        });
    }
}

// ==========================================
// UPDATE
// ==========================================

function update(dt) {
    if (!gameStarted) return;

    let dx = 0;
    let dy = 0;

    if (keys["w"] || keys["arrowup"]) dy--;
    if (keys["s"] || keys["arrowdown"]) dy++;
    if (keys["a"] || keys["arrowleft"]) dx--;
    if (keys["d"] || keys["arrowright"]) dx++;

    const length = Math.hypot(dx, dy) || 1;
    dx /= length;
    dy /= length;

    const moving = dx !== 0 || dy !== 0;
    const sprinting = keys["shift"] && player.energy > 0 && moving;

    const speed = sprinting ? player.sprint : player.speed;

    player.x += dx * speed * dt;
    player.y += dy * speed * dt;

    player.x = Math.max(player.radius, Math.min(WORLD_W - player.radius, player.x));
    player.y = Math.max(player.radius, Math.min(WORLD_H - player.radius, player.y));

    if (sprinting) {
        player.energy = Math.max(0, player.energy - 25 * dt);
    } else {
        player.energy = Math.min(100, player.energy + 13 * dt);
    }

    player.shockCooldown = Math.max(0, player.shockCooldown - dt);

    for (const wave of shockwaves) {
        wave.radius += 650 * dt;
        wave.life -= dt;
    }

    shockwaves = shockwaves.filter(wave => wave.life > 0);

    for (const particle of particles) {
        particle.x += particle.vx * dt;
        particle.y += particle.vy * dt;
        particle.life -= dt;
    }

    particles = particles.filter(particle => particle.life > 0);

    for (const enemy of enemies) {
        if (!enemy.alive) continue;

        if (enemy.stunned > 0) {
            enemy.stunned -= dt;
            continue;
        }

        const dist = distance(player, enemy);

        if (dist < 360) {
            const angle = Math.atan2(player.y - enemy.y, player.x - enemy.x);
            enemy.x += Math.cos(angle) * enemy.speed * dt;
            enemy.y += Math.sin(angle) * enemy.speed * dt;
        } else {
            enemy.changeDirection -= dt;

            if (enemy.changeDirection <= 0) {
                enemy.angle = random(0, Math.PI * 2);
                enemy.changeDirection = random(1, 3);
            }

            enemy.x += Math.cos(enemy.angle) * enemy.speed * 0.35 * dt;
            enemy.y += Math.sin(enemy.angle) * enemy.speed * 0.35 * dt;
        }

        enemy.x = Math.max(20, Math.min(WORLD_W - 20, enemy.x));
        enemy.y = Math.max(20, Math.min(WORLD_H - 20, enemy.y));

        if (dist < player.radius + enemy.radius) {
            player.health -= 18 * dt;
        }
    }

    for (const crystal of crystals) {
        if (crystal.collected) continue;

        if (distance(player, crystal) < 28) {
            crystal.collected = true;
            crystalsCollected++;
            updateHUD();

            if (message) {
                message.textContent = "CRYSTAL FOUND";
                message.style.display = "block";

                setTimeout(() => {
                    message.style.display = "none";
                }, 1500);
            }

            saveGame();
        }
    }

    if (crystalsCollected >= MAX_CRYSTALS && distance(player, portal) < 55) {
        winGame();
    }

    if (player.health <= 0) {
        player.health = 0;
        gameOver();
    }

    camera.x = player.x - canvas.width / 2;
    camera.y = player.y - canvas.height / 2;

    camera.x = Math.max(0, Math.min(WORLD_W - canvas.width, camera.x));
    camera.y = Math.max(0, Math.min(WORLD_H - canvas.height, camera.y));

    updateHUD();
}

// ==========================================
// DRAW WORLD
// ==========================================

function drawWorld() {
    ctx.fillStyle = "#10151a";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.save();
    ctx.translate(-camera.x, -camera.y);

    // Ground
    ctx.fillStyle = "#18251f";
    ctx.fillRect(0, 0, WORLD_W, WORLD_H);

    // Ground details
    ctx.fillStyle = "#203128";

    for (let x = 0; x < WORLD_W; x += 100) {
        for (let y = 0; y < WORLD_H; y += 100) {
            ctx.fillRect(x + 10, y + 10, 2, 2);
        }
    }

    // Trees
    for (const tree of trees) {
        ctx.fillStyle = "#101b18";
        ctx.beginPath();
        ctx.arc(tree.x, tree.y, tree.radius + 5, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = "#294b3a";
        ctx.beginPath();
        ctx.arc(tree.x, tree.y, tree.radius, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = "#3b6449";
        ctx.beginPath();
        ctx.arc(tree.x - 5, tree.y - 5, tree.radius * 0.45, 0, Math.PI * 2);
        ctx.fill();
    }

    // Rocks
    for (const rock of rocks) {
        ctx.fillStyle = "#4b5351";
        ctx.beginPath();
        ctx.arc(rock.x, rock.y, rock.radius, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = "#707c78";
        ctx.beginPath();
        ctx.arc(rock.x - 3, rock.y - 3, rock.radius * 0.35, 0, Math.PI * 2);
        ctx.fill();
    }

    // Crystals
    for (const crystal of crystals) {
        if (crystal.collected) continue;

        ctx.save();
        ctx.translate(crystal.x, crystal.y);

        ctx.fillStyle = "#54eaff";
        ctx.shadowBlur = 18;
        ctx.shadowColor = "#54eaff";

        ctx.beginPath();
        ctx.moveTo(0, -14);
        ctx.lineTo(10, 0);
        ctx.lineTo(0, 14);
        ctx.lineTo(-10, 0);
        ctx.closePath();
        ctx.fill();

        ctx.restore();
    }

    // Portal
    ctx.beginPath();
    ctx.arc(portal.x, portal.y, portal.radius + 8, 0, Math.PI * 2);
    ctx.strokeStyle = "#754cff";
    ctx.lineWidth = 5;
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(portal.x, portal.y, portal.radius, 0, Math.PI * 2);
    ctx.fillStyle = "#281d4d";
    ctx.fill();

    ctx.beginPath();
    ctx.arc(portal.x, portal.y, portal.radius - 9, 0, Math.PI * 2);
    ctx.strokeStyle = "#c6a3ff";
    ctx.lineWidth = 3;
    ctx.stroke();

    // Enemies
    for (const enemy of enemies) {
        if (!enemy.alive) continue;

        ctx.fillStyle = enemy.stunned > 0 ? "#9deeff" : "#9a4a8c";

        ctx.beginPath();
        ctx.ellipse(enemy.x, enemy.y, 17, 13, 0, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = "#e8c5ff";
        ctx.beginPath();
        ctx.arc(enemy.x - 5, enemy.y - 3, 3, 0, Math.PI * 2);
        ctx.arc(enemy.x + 5, enemy.y - 3, 3, 0, Math.PI * 2);
        ctx.fill();
    }

    // Shockwaves
    for (const wave of shockwaves) {
        ctx.beginPath();
        ctx.arc(wave.x, wave.y, wave.radius, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(100,230,255,${Math.max(0, wave.life)})`;
        ctx.lineWidth = 5;
        ctx.stroke();
    }

    // Player
    ctx.fillStyle = "#d6faff";
    ctx.shadowBlur = 18;
    ctx.shadowColor = "#73eaff";
    ctx.beginPath();
    ctx.arc(player.x, player.y, player.radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;

    ctx.fillStyle = "#5acfe8";
    ctx.beginPath();
    ctx.arc(player.x, player.y, 5, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();

    // Darkness overlay
    ctx.save();

    ctx.fillStyle = "rgba(0, 0, 0, 0.97)";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const px = player.x - camera.x;
    const py = player.y - camera.y;

    const gradient = ctx.createRadialGradient(
        px, py, 10,
        px, py, 125
    );

    gradient.addColorStop(0, "rgba(0,0,0,0)");
    gradient.addColorStop(0.65, "rgba(0,0,0,0.2)");
    gradient.addColorStop(1, "rgba(0,0,0,1)");

    ctx.globalCompositeOperation = "destination-out";
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(px, py, 125, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();

    // Temporary full reveal after shockwave
    if (performance.now() < revealedUntil) {
        const remaining = (revealedUntil - performance.now()) / 2000;

        ctx.fillStyle = `rgba(0,0,0,${0.72 * remaining})`;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
}

// ==========================================
// GAME LOOP
// ==========================================

function gameLoop(timestamp) {
    if (!gameStarted) return;

    const dt = Math.min((timestamp - lastTime) / 1000, 0.05);
    lastTime = timestamp;

    update(dt);
    drawWorld();

    requestAnimationFrame(gameLoop);
}

// ==========================================
// HUD
// ==========================================

function updateHUD() {
    if (crystalCount) {
        crystalCount.textContent = `${crystalsCollected}/${MAX_CRYSTALS}`;
    }

    if (cooldownElement) {
        cooldownElement.textContent =
            player.shockCooldown > 0
                ? player.shockCooldown.toFixed(1) + "s"
                : "READY";
    }

    const healthBar = document.getElementById("healthBar");
    const energyBar = document.getElementById("energyBar");

    if (healthBar) {
        healthBar.style.width = player.health + "%";
    }

    if (energyBar) {
        energyBar.style.width = player.energy + "%";
    }
}

// ==========================================
// WIN / GAME OVER
// ==========================================

function winGame() {
    gameStarted = false;
    saveGame();

    if (winScreen) {
        winScreen.style.display = "flex";
    }

    if (message) {
        message.textContent = "THE SIGNAL HAS BEEN RESTORED";
        message.style.display = "block";
    }
}

function gameOver() {
    gameStarted = false;
    saveGame();

    if (message) {
        message.textContent = "YOU WERE LOST IN THE DARK";
        message.style.display = "block";
    }

    setTimeout(() => {
        showMenu();
        if (message) message.style.display = "none";
    }, 2500);
}

// ==========================================
// RESTART
// ==========================================

if (restartButton) {
    restartButton.addEventListener("click", () => {
        if (winScreen) winScreen.style.display = "none";
        startGame();
    });
}

// ==========================================
// CANVAS SIZE
// ==========================================

function resizeCanvas() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
}

window.addEventListener("resize", resizeCanvas);
resizeCanvas();

// ==========================================
// INITIAL STATE
// ==========================================

if (gameUI) gameUI.style.display = "none";
if (winScreen) winScreen.style.display = "none";

if (startButton) {
    startButton.disabled = true;
    startButton.textContent = "SIGN IN FIRST";
}
