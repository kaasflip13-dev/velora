import { initializeApp } from "https://www.gstatic.com/firebasejs/13.1.0/firebase-app.js";
import {
    getAuth, GoogleAuthProvider, signInWithPopup, signOut,
    onAuthStateChanged, setPersistence, browserLocalPersistence
} from "https://www.gstatic.com/firebasejs/13.1.0/firebase-auth.js";
import {
    getDatabase, ref, get, set, onValue
} from "https://www.gstatic.com/firebasejs/13.1.0/firebase-database.js";

// ==========================================
// FIREBASE - LOGIN EN ONLINE SPELERS
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
provider.setCustomParameters({ prompt: "select_account" });

try {
    await setPersistence(auth, browserLocalPersistence);
} catch (error) {
    console.error("Firebase persistence:", error);
}

let currentUser = null;
let playerUID = null;
let playersListenerStarted = false;
let gameStarted = false;
let saveTimer = 0;

// ==========================================
// HTML
// ==========================================
const canvas = document.getElementById("game");
const ctx = canvas?.getContext("2d");
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
const cooldownText = document.getElementById("cooldownText");
const cooldownBar = document.getElementById("cooldownBar");
const message = document.getElementById("message");
const winScreen = document.getElementById("winScreen");
const restartButton = document.getElementById("restartButton");
const healthBar = document.getElementById("healthBar");
const energyBar = document.getElementById("energyBar");

if (!canvas || !ctx) {
    throw new Error('Canvas #game ontbreekt. Controleer of index.html de canvas met id="game" bevat.');
}

// ==========================================
// WERELD EN SPELER
// ==========================================
const WORLD_W = 4200;
const WORLD_H = 4200;
const MAX_CRYSTALS = 5;
const TOTAL_ENEMIES = 13;

let camera = { x: 0, y: 0 };
let player = {
    x: WORLD_W / 2, y: WORLD_H / 2, radius: 14,
    speed: 205, sprint: 315, health: 100, energy: 100,
    shockCooldown: 0, facing: 0
};

let keys = {};
let crystalsCollected = 0;
let trees = [];
let rocks = [];
let plants = [];
let crystals = [];
let enemies = [];
let shockwaves = [];
let particles = [];
let revealedUntil = 0;
let lastTime = 0;
let messageTimer = 0;
let worldSeeded = false;

const portal = { x: WORLD_W / 2 + 1450, y: WORLD_H / 2 + 1050, radius: 48 };

function random(min, max) { return Math.random() * (max - min) + min; }
function distance(a, b) { return Math.hypot(a.x - b.x, a.y - b.y); }
function clamp(value, min, max) { return Math.max(min, Math.min(max, value)); }

function resizeCanvas() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    canvas.style.width = window.innerWidth + "px";
    canvas.style.height = window.innerHeight + "px";
    ctx.setTransform(1, 0, 0, 1, 0, 0);
}
window.addEventListener("resize", resizeCanvas);
resizeCanvas();

function showMessage(text, duration = 1.7) {
    if (!message) return;
    message.textContent = text;
    message.style.display = "block";
    messageTimer = duration;
}

// ==========================================
// GOOGLE LOGIN
// ==========================================
async function loginWithGoogle() {
    if (googleButton) {
        googleButton.disabled = true;
        googleButton.textContent = "CONNECTING...";
    }
    if (loginStatus) loginStatus.textContent = "Opening Google login...";
    try {
        const result = await signInWithPopup(auth, provider);
        if (loginStatus) loginStatus.textContent = "Signed in successfully!";
        console.log("Signed in:", result.user.uid);
    } catch (error) {
        console.error("Google login error:", error);
        if (loginStatus) loginStatus.textContent = `${error.code || "Error"}: ${error.message || "Could not sign in."}`;
        if (googleButton) {
            googleButton.disabled = false;
            googleButton.innerHTML = '<span class="google-icon">G</span> SIGN IN WITH GOOGLE';
        }
    }
}
googleButton?.addEventListener("click", loginWithGoogle);

async function logout() {
    if (gameStarted) await saveGame();
    try {
        gameStarted = false;
        await signOut(auth);
        showMenu();
    } catch (error) {
        console.error("Logout error:", error);
    }
}
logoutButton?.addEventListener("click", logout);

// ==========================================
// FIREBASE PROFIEL EN SPELERSLIJST
// ==========================================
async function savePublicProfile(user) {
    try {
        await set(ref(database, "publicPlayers/" + user.uid), {
            name: user.displayName || "VÉLORA Player",
            photoURL: user.photoURL || "",
            lastSeen: Date.now()
        });
    } catch (error) {
        console.error("Public profile error:", error);
    }
}

function listenToPlayers() {
    if (playersListenerStarted) return;
    playersListenerStarted = true;

    onValue(ref(database, "publicPlayers"), snapshot => {
        if (!playersList) return;
        playersList.innerHTML = "";
        if (!snapshot.exists()) {
            playersList.textContent = "No players yet.";
            return;
        }

        const players = [];
        snapshot.forEach(child => players.push({ uid: child.key, ...child.val() }));
        players.sort((a, b) => (b.lastSeen || 0) - (a.lastSeen || 0));

        for (const onlinePlayer of players) {
            const row = document.createElement("div");
            row.className = "player-row";

            const dot = document.createElement("span");
            dot.className = "player-dot";

            const name = document.createElement("span");
            name.className = "player-name";
            name.textContent = onlinePlayer.name || "VÉLORA Player";

            const status = document.createElement("span");
            status.className = "player-status";
            status.textContent = onlinePlayer.uid === playerUID ? "YOU" : "PLAYER";

            row.append(dot, name, status);
            playersList.appendChild(row);
        }
    }, error => {
        console.error("Player list error:", error);
        if (playersList) playersList.textContent = "Could not load players.";
    });
}

onAuthStateChanged(auth, async user => {
    if (user && !user.isAnonymous) {
        currentUser = user;
        playerUID = user.uid;
        if (loginArea) loginArea.style.display = "none";
        if (loggedInArea) loggedInArea.style.display = "block";
        if (playerName) playerName.textContent = user.displayName || "VÉLORA Player";
        if (playerEmail) playerEmail.textContent = user.email || "";
        if (startButton) {
            startButton.disabled = false;
            startButton.textContent = "ENTER THE WORLD";
        }
        await savePublicProfile(user);
        listenToPlayers();
    } else {
        currentUser = null;
        playerUID = null;
        if (loginArea) loginArea.style.display = "block";
        if (loggedInArea) loggedInArea.style.display = "none";
        if (startButton) {
            startButton.disabled = true;
            startButton.textContent = "SIGN IN FIRST";
        }
        if (playersList) playersList.textContent = "Sign in to see the players.";
        playersListenerStarted = false;
    }
});

// ==========================================
// OPSLAAN EN LADEN
// ==========================================
function saveKey() { return "velora_backup_" + (playerUID || "guest"); }

async function saveGame() {
    if (!playerUID) return;
    const data = {
        x: player.x, y: player.y,
        health: player.health, energy: player.energy,
        crystals: crystalsCollected, savedAt: Date.now()
    };
    try {
        localStorage.setItem(saveKey(), JSON.stringify(data));
        await set(ref(database, "players/" + playerUID + "/save"), data);
    } catch (error) {
        console.error("Save error:", error);
    }
}

async function loadGame() {
    if (!playerUID) return false;
    try {
        const snapshot = await get(ref(database, "players/" + playerUID + "/save"));
        let data = snapshot.exists() ? snapshot.val() : null;
        if (!data) {
            const local = localStorage.getItem(saveKey());
            if (local) data = JSON.parse(local);
        }
        if (!data) return false;

        player.x = clamp(Number(data.x) || WORLD_W / 2, player.radius, WORLD_W - player.radius);
        player.y = clamp(Number(data.y) || WORLD_H / 2, player.radius, WORLD_H - player.radius);
        player.health = clamp(Number(data.health) || 100, 1, 100);
        player.energy = clamp(Number(data.energy) || 100, 0, 100);
        crystalsCollected = clamp(Number(data.crystals) || 0, 0, MAX_CRYSTALS);
        return true;
    } catch (error) {
        console.error("Load error:", error);
        return false;
    }
}
window.addEventListener("beforeunload", () => {
    if (!playerUID || !gameStarted) return;
    localStorage.setItem(saveKey(), JSON.stringify({
        x: player.x, y: player.y, health: player.health,
        energy: player.energy, crystals: crystalsCollected, savedAt: Date.now()
    }));
});

// ==========================================
// WERELD GENEREREN
// ==========================================
function generateWorld() {
    trees = [];
    rocks = [];
    plants = [];
    crystals = [];
    enemies = [];
    shockwaves = [];
    particles = [];

    const cx = WORLD_W / 2;
    const cy = WORLD_H / 2;

    for (let i = 0; i < 330; i++) {
        let x = random(65, WORLD_W - 65);
        let y = random(65, WORLD_H - 65);
        if (Math.hypot(x - cx, y - cy) < 190) continue;
        trees.push({ x, y, r: random(17, 34), tone: Math.floor(random(0, 3)) });
    }

    for (let i = 0; i < 250; i++) {
        let x = random(45, WORLD_W - 45);
        let y = random(45, WORLD_H - 45);
        if (Math.hypot(x - cx, y - cy) < 100) continue;
        rocks.push({ x, y, r: random(7, 20), angle: random(0, Math.PI) });
    }

    for (let i = 0; i < 520; i++) {
        plants.push({
            x: random(25, WORLD_W - 25), y: random(25, WORLD_H - 25),
            r: random(2, 6), alien: Math.random() < 0.22,
            phase: random(0, Math.PI * 2)
        });
    }

    const crystalSpots = [
        [cx - 470, cy - 330], [cx + 520, cy - 270],
        [cx - 650, cy + 430], [cx + 320, cy + 590],
        [cx + 950, cy + 250]
    ];

    crystalSpots.forEach(([x, y]) => crystals.push({
        x, y, radius: 12, collected: false, pulse: random(0, 6)
    }));

    for (let i = 0; i < TOTAL_ENEMIES; i++) {
        let x, y;
        do {
            x = random(100, WORLD_W - 100);
            y = random(100, WORLD_H - 100);
        } while (Math.hypot(x - cx, y - cy) < 360);

        enemies.push({
            x, y, radius: 17, speed: random(38, 66),
            angle: random(0, Math.PI * 2), turn: random(1, 4),
            alive: true, stunned: 0, phase: random(0, 6)
        });
    }

    worldSeeded = true;
}

// ==========================================
// START / MENU
// ==========================================
async function startGame() {
    if (!currentUser || currentUser.isAnonymous) {
        if (loginStatus) loginStatus.textContent = "Please sign in with Google first.";
        return;
    }

    if (startButton) {
        startButton.disabled = true;
        startButton.textContent = "LOADING WORLD...";
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
    if (winScreen) winScreen.style.display = "none";
    if (gameUI) gameUI.style.display = "block";

    resizeCanvas();
    updateCamera();
    updateHUD();

    gameStarted = true;
    lastTime = performance.now();
    requestAnimationFrame(gameLoop);

    if (startButton) {
        startButton.disabled = false;
        startButton.textContent = "ENTER THE WORLD";
    }
}

startButton?.addEventListener("click", startGame);

restartButton?.addEventListener("click", async () => {
    if (winScreen) winScreen.style.display = "none";

    if (playerUID) {
        try {
            await set(ref(database, "players/" + playerUID + "/save"), null);
        } catch (e) {}
        localStorage.removeItem(saveKey());
    }

    startGame();
});

function showMenu() {
    gameStarted = false;
    if (menu) menu.style.display = "flex";
    if (gameUI) gameUI.style.display = "none";
    if (winScreen) winScreen.style.display = "none";
}

// ==========================================
// BESTURING
// ==========================================
window.addEventListener("keydown", event => {
    const key = event.key.toLowerCase();

    if (["arrowup", "arrowdown", "arrowleft", "arrowright", " "].includes(key)) {
        event.preventDefault();
    }

    keys[key] = true;

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
// CAMERA EN SCHOKGOLF
// ==========================================
function updateCamera() {
    const viewW = window.innerWidth;
    const viewH = window.innerHeight;

    camera.x = clamp(player.x - viewW / 2, 0, Math.max(0, WORLD_W - viewW));
    camera.y = clamp(player.y - viewH / 2, 0, Math.max(0, WORLD_H - viewH));
}

function useShockwave() {
    if (!gameStarted || player.shockCooldown > 0) return;

    shockwaves.push({
        x: player.x, y: player.y, radius: 8, life: 0.85, max: 520
    });

    player.shockCooldown = 5;
    revealedUntil = performance.now() + 2000;

    for (const enemy of enemies) {
        if (enemy.alive && distance(player, enemy) < 520) {
            enemy.stunned = 2.1;
        }
    }

    for (let i = 0; i < 55; i++) {
        const angle = random(0, Math.PI * 2);
        const speed = random(50, 260);

        particles.push({
            x: player.x, y: player.y,
            vx: Math.cos(angle) * speed,
            vy: Math.sin(angle) * speed,
            life: random(0.35, 0.9),
            maxLife: 0.9
        });
    }
}

// ==========================================
// COLLISIES / UPDATE
// ==========================================
function blockedAt(x, y, radius) {
    for (const tree of trees) {
        if (Math.hypot(x - tree.x, y - tree.y) < radius + tree.r * 0.72) {
            return true;
        }
    }

    for (const rock of rocks) {
        if (Math.hypot(x - rock.x, y - rock.y) < radius + rock.r * 0.7) {
            return true;
        }
    }

    return false;
}

function movePlayer(dx, dy) {
    const nx = clamp(player.x + dx, player.radius, WORLD_W - player.radius);
    const ny = clamp(player.y + dy, player.radius, WORLD_H - player.radius);

    if (!blockedAt(nx, player.y, player.radius)) player.x = nx;
    if (!blockedAt(player.x, ny, player.radius)) player.y = ny;
}

function update(dt) {
    if (!gameStarted) return;

    let dx = 0;
    let dy = 0;

    if (keys.w || keys.arrowup) dy -= 1;
    if (keys.s || keys.arrowdown) dy += 1;
    if (keys.a || keys.arrowleft) dx -= 1;
    if (keys.d || keys.arrowright) dx += 1;

    const moving = dx !== 0 || dy !== 0;

    if (moving) {
        const len = Math.hypot(dx, dy);
        dx /= len;
        dy /= len;
        player.facing = Math.atan2(dy, dx);
    }

    const sprinting = keys.shift && player.energy > 0 && moving;
    const speed = sprinting ? player.sprint : player.speed;

    movePlayer(dx * speed * dt, dy * speed * dt);

    if (sprinting) player.energy = Math.max(0, player.energy - 24 * dt);
    else player.energy = Math.min(100, player.energy + 15 * dt);

    player.shockCooldown = Math.max(0, player.shockCooldown - dt);

    for (const wave of shockwaves) {
        wave.radius += 690 * dt;
        wave.life -= dt;
    }
    shockwaves = shockwaves.filter(w => w.life > 0);

    for (const p of particles) {
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.vx *= 0.985;
        p.vy *= 0.985;
        p.life -= dt;
    }
    particles = particles.filter(p => p.life > 0);

    for (const enemy of enemies) {
        if (!enemy.alive) continue;

        enemy.phase += dt * 4;

        if (enemy.stunned > 0) {
            enemy.stunned -= dt;
            continue;
        }
                const dist = distance(player, enemy);

        if (dist < 440) {
            const angle = Math.atan2(player.y - enemy.y, player.x - enemy.x);
            enemy.x += Math.cos(angle) * enemy.speed * dt;
            enemy.y += Math.sin(angle) * enemy.speed * dt;
        } else {
            enemy.turn -= dt;

            if (enemy.turn <= 0) {
                enemy.angle = random(0, Math.PI * 2);
                enemy.turn = random(1.5, 4);
            }

            enemy.x += Math.cos(enemy.angle) * enemy.speed * 0.3 * dt;
            enemy.y += Math.sin(enemy.angle) * enemy.speed * 0.3 * dt;
        }

        enemy.x = clamp(enemy.x, 25, WORLD_W - 25);
        enemy.y = clamp(enemy.y, 25, WORLD_H - 25);

        if (dist < player.radius + enemy.radius + 2) {
            player.health -= 17 * dt;
            const away = Math.atan2(player.y - enemy.y, player.x - enemy.x);
            movePlayer(Math.cos(away) * 45 * dt, Math.sin(away) * 45 * dt);
        }
    }

    for (const crystal of crystals) {
        crystal.pulse += dt * 2;

        if (!crystal.collected && distance(player, crystal) < 34) {
            crystal.collected = true;
            crystalsCollected++;
            showMessage("MEMORY FRAGMENT FOUND");
            saveGame();
        }
    }

    if (crystalsCollected >= MAX_CRYSTALS && distance(player, portal) < 65) {
        winGame();
        return;
    }

    if (player.health <= 0) {
        player.health = 0;
        gameOver();
        return;
    }

    if (messageTimer > 0) {
        messageTimer -= dt;
        if (messageTimer <= 0 && message) message.style.display = "none";
    }

    saveTimer += dt;
    if (saveTimer >= 12) {
        saveTimer = 0;
        saveGame();
    }

    updateCamera();
    updateHUD();
}

// ==========================================
// TEKENEN: OMGEVING
// ==========================================
function drawGround() {
    ctx.fillStyle = "#17251f";
    ctx.fillRect(0, 0, WORLD_W, WORLD_H);

    for (let x = 0; x < WORLD_W; x += 120) {
        for (let y = 0; y < WORLD_H; y += 120) {
            ctx.fillStyle = ((x / 120 + y / 120) % 2 === 0)
                ? "#1a2a22" : "#192820";
            ctx.fillRect(x, y, 120, 120);
        }
    }

    ctx.strokeStyle = "rgba(100,150,130,0.09)";
    ctx.lineWidth = 3;
    ctx.strokeRect(8, 8, WORLD_W - 16, WORLD_H - 16);
}

function drawPlants() {
    for (const plant of plants) {
        ctx.save();
        ctx.translate(plant.x, plant.y);

        if (plant.alien) {
            ctx.shadowBlur = 10;
            ctx.shadowColor = "#43d9c7";
            ctx.strokeStyle = "#3b9d8d";
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(0, 5);
            ctx.lineTo(-3, -plant.r * 2);
            ctx.moveTo(0, 5);
            ctx.lineTo(4, -plant.r * 2.4);
            ctx.stroke();

            ctx.fillStyle = "#65e8d6";
            ctx.beginPath();
            ctx.arc(0, -plant.r * 2.5, 2.5, 0, Math.PI * 2);
            ctx.fill();
        } else {
            ctx.fillStyle = "#527b56";
            ctx.beginPath();
            ctx.ellipse(0, 0, plant.r + 2, plant.r, plant.phase, 0, Math.PI * 2);
            ctx.fill();
        }

        ctx.restore();
    }
}

function drawTrees() {
    for (const tree of trees) {
        ctx.save();
        ctx.translate(tree.x, tree.y);

        ctx.fillStyle = "#101713";
        ctx.beginPath();
        ctx.ellipse(4, 9, tree.r * 1.1, tree.r * 0.78, 0, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = "#392f29";
        ctx.fillRect(-tree.r * 0.18, -2, tree.r * 0.36, tree.r * 0.9);

        const colors = ["#294b3a", "#315440", "#244333"];
        ctx.fillStyle = colors[tree.tone];
        ctx.beginPath();
        ctx.arc(0, -tree.r * 0.25, tree.r, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = "rgba(116,171,119,0.24)";
        ctx.beginPath();
        ctx.arc(-tree.r * 0.28, -tree.r * 0.55, tree.r * 0.48, 0, Math.PI * 2);
        ctx.fill();

        ctx.restore();
    }
}

function drawRocks() {
    for (const rock of rocks) {
        ctx.save();
        ctx.translate(rock.x, rock.y);
        ctx.rotate(rock.angle);

        ctx.fillStyle = "#343e3e";
        ctx.beginPath();
        ctx.moveTo(-rock.r, rock.r * 0.35);
        ctx.lineTo(-rock.r * 0.55, -rock.r * 0.75);
        ctx.lineTo(rock.r * 0.25, -rock.r);
        ctx.lineTo(rock.r, -rock.r * 0.1);
        ctx.lineTo(rock.r * 0.65, rock.r * 0.8);
        ctx.closePath();
        ctx.fill();

        ctx.strokeStyle = "rgba(160,190,180,0.18)";
        ctx.lineWidth = 2;
        ctx.stroke();

        ctx.restore();
    }
}

function drawCrystals() {
    for (const crystal of crystals) {
        if (crystal.collected) continue;

        const pulse = 1 + Math.sin(crystal.pulse) * 0.12;

        ctx.save();
        ctx.translate(crystal.x, crystal.y);
        ctx.scale(pulse, pulse);
        ctx.shadowBlur = 24;
        ctx.shadowColor = "#4deaff";
        ctx.fillStyle = "#55eaff";

        ctx.beginPath();
        ctx.moveTo(0, -19);
        ctx.lineTo(12, -2);
        ctx.lineTo(7, 17);
        ctx.lineTo(-7, 17);
        ctx.lineTo(-12, -2);
        ctx.closePath();
        ctx.fill();

        ctx.shadowBlur = 0;
        ctx.fillStyle = "rgba(255,255,255,0.75)";
        ctx.beginPath();
        ctx.moveTo(0, -14);
        ctx.lineTo(4, -2);
        ctx.lineTo(0, 8);
        ctx.closePath();
        ctx.fill();

        ctx.restore();
    }
}

function drawPortal() {
    const unlocked = crystalsCollected >= MAX_CRYSTALS;

    ctx.save();
    ctx.translate(portal.x, portal.y);
    ctx.shadowBlur = unlocked ? 34 : 15;
    ctx.shadowColor = unlocked ? "#b78aff" : "#5742a8";
    ctx.strokeStyle = unlocked ? "#c9a7ff" : "#6655a0";
    ctx.lineWidth = 7;

    ctx.beginPath();
    ctx.ellipse(0, 0, 38, 53, 0, 0, Math.PI * 2);
    ctx.stroke();

    ctx.fillStyle = unlocked
        ? "rgba(123,75,190,0.45)"
        : "rgba(50,38,90,0.65)";

    ctx.beginPath();
    ctx.ellipse(0, 0, 28, 43, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.shadowBlur = 0;
    ctx.strokeStyle = "#e3d5ff";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(0, 0, 19, 34, 0, 0, Math.PI * 2);
    ctx.stroke();

    ctx.restore();
}

function drawEnemies() {
    for (const enemy of enemies) {
        if (!enemy.alive) continue;

        ctx.save();
        ctx.translate(enemy.x, enemy.y);

        const bob = Math.sin(enemy.phase) * 2;
        ctx.translate(0, bob);
        ctx.shadowBlur = enemy.stunned > 0 ? 22 : 13;
        ctx.shadowColor = enemy.stunned > 0 ? "#8ceeff" : "#c34eae";

        ctx.fillStyle = enemy.stunned > 0 ? "#8eddea" : "#713c78";
        ctx.beginPath();
        ctx.ellipse(0, 0, 19, 15, 0, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = "#b36db0";
        ctx.beginPath();
        ctx.moveTo(-10, -8);
        ctx.lineTo(-15, -20);
        ctx.lineTo(-2, -12);
        ctx.moveTo(10, -8);
        ctx.lineTo(15, -20);
        ctx.lineTo(2, -12);
        ctx.fill();

        ctx.shadowBlur = 0;
        ctx.fillStyle = "#e8ffff";
        ctx.beginPath();
        ctx.ellipse(-6, -2, 3, 4, 0, 0, Math.PI * 2);
        ctx.ellipse(6, -2, 3, 4, 0, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = "#271b32";
        ctx.beginPath();
        ctx.arc(-6, -2, 1.5, 0, Math.PI * 2);
        ctx.arc(6, -2, 1.5, 0, Math.PI * 2);
        ctx.fill();

        ctx.restore();
    }
}
function drawPlayer() {
    ctx.save();
    ctx.translate(player.x, player.y);
    ctx.rotate(player.facing);

    ctx.fillStyle = "rgba(0,0,0,0.45)";
    ctx.beginPath();
    ctx.ellipse(2, 7, 17, 12, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.shadowBlur = 22;
    ctx.shadowColor = "#6ceaff";
    ctx.fillStyle = "#c8f7ff";
    ctx.beginPath();
    ctx.arc(0, 0, player.radius, 0, Math.PI * 2);
    ctx.fill();

    ctx.shadowBlur = 0;
    ctx.fillStyle = "#42bdd7";
    ctx.beginPath();
    ctx.arc(4, -2, 6, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "#eaffff";
    ctx.beginPath();
    ctx.moveTo(10, 0);
    ctx.lineTo(20, -5);
    ctx.lineTo(20, 5);
    ctx.closePath();
    ctx.fill();

    ctx.restore();
}

function drawEffects() {
    for (const wave of shockwaves) {
        ctx.save();
        ctx.globalAlpha = Math.max(0, wave.life);
        ctx.strokeStyle = "#75efff";
        ctx.shadowBlur = 22;
        ctx.shadowColor = "#42dfff";
        ctx.lineWidth = 5;
        ctx.beginPath();
        ctx.arc(wave.x, wave.y, wave.radius, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
    }

    for (const p of particles) {
        ctx.save();
        ctx.globalAlpha = Math.max(0, p.life / (p.maxLife || 1));
        ctx.fillStyle = "#8df4ff";
        ctx.shadowBlur = 10;
        ctx.shadowColor = "#55dfff";
        ctx.beginPath();
        ctx.arc(p.x, p.y, 2.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    }
}

// ==========================================
// DONKERHEID EN LICHT
// ==========================================
function drawDarkness() {
    const viewW = window.innerWidth;
    const viewH = window.innerHeight;

    const px = player.x - camera.x;
    const py = player.y - camera.y;

    // Always dark world
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalCompositeOperation = "source-over";
    ctx.fillStyle = "rgba(0, 2, 8, 0.97)";
    ctx.fillRect(0, 0, viewW, viewH);

    // Cut out the permanent small player light
    ctx.globalCompositeOperation = "destination-out";

    const smallLight = ctx.createRadialGradient(px, py, 5, px, py, 185);
    smallLight.addColorStop(0, "rgba(0,0,0,1)");
    smallLight.addColorStop(0.6, "rgba(0,0,0,0.9)");
    smallLight.addColorStop(1, "rgba(0,0,0,0)");

    ctx.fillStyle = smallLight;
    ctx.beginPath();
    ctx.arc(px, py, 185, 0, Math.PI * 2);
    ctx.fill();

    // Shockwave light: fully reveals a large area
    const remaining = (revealedUntil - performance.now()) / 2000;

    if (remaining > 0) {
        const radius = 850;

        const bigLight = ctx.createRadialGradient(
            px, py, 20,
            px, py, radius
        );

        bigLight.addColorStop(0, "rgba(0,0,0,1)");
        bigLight.addColorStop(0.65, "rgba(0,0,0,0.95)");
        bigLight.addColorStop(1, "rgba(0,0,0,0)");

        ctx.fillStyle = bigLight;
        ctx.beginPath();
        ctx.arc(px, py, radius, 0, Math.PI * 2);
        ctx.fill();
    }

    ctx.restore();

    // Blue glow around player
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);

    const glow = ctx.createRadialGradient(px, py, 5, px, py, 120);
    glow.addColorStop(0, "rgba(65,210,255,0.3)");
    glow.addColorStop(1, "rgba(65,210,255,0)");

    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(px, py, 120, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
}
// ==========================================
// COMPLETE WERELD TEKENEN
// ==========================================
function drawWorld() {
    const viewW = window.innerWidth;
    const viewH = window.innerHeight;

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, viewW, viewH);

    ctx.fillStyle = "#101a17";
    ctx.fillRect(0, 0, viewW, viewH);

    ctx.save();
    ctx.translate(-camera.x, -camera.y);

    drawGround();
    drawPlants();
    drawTrees();
    drawRocks();
    drawCrystals();
    drawPortal();
    drawEnemies();
    drawEffects();
    drawPlayer();

    ctx.restore();

    drawDarkness();
}

// ==========================================
// GAME LOOP / HUD
// ==========================================
function updateHUD() {
    if (crystalCount) {
        crystalCount.textContent = String(crystalsCollected);
    }

    if (cooldownText) {
        cooldownText.textContent = player.shockCooldown > 0
            ? player.shockCooldown.toFixed(1) + "s"
            : "READY";
    }

    if (cooldownBar) {
        const percent = 100 * (1 - player.shockCooldown / 5);
        cooldownBar.style.width = clamp(percent, 0, 100) + "%";
    }

    if (healthBar) {
        healthBar.style.width = clamp(player.health, 0, 100) + "%";
    }

    if (energyBar) {
        energyBar.style.width = clamp(player.energy, 0, 100) + "%";
    }
}

function gameLoop(timestamp) {
    if (!gameStarted) return;

    const dt = Math.min((timestamp - lastTime) / 1000, 0.04);
    lastTime = timestamp;

    update(dt);
    drawWorld();

    if (gameStarted) {
        requestAnimationFrame(gameLoop);
    }
}

async function winGame() {
    if (!gameStarted) return;

    gameStarted = false;
    await saveGame();

    if (winScreen) {
        winScreen.style.display = "flex";
    }
}

async function gameOver() {
    if (!gameStarted) return;

    gameStarted = false;
    await saveGame();

    showMessage("THE DARKNESS FOUND YOU");
    setTimeout(() => showMenu(), 2200);
}

// ==========================================
// BEGININSTELLINGEN
// ==========================================
if (gameUI) gameUI.style.display = "none";
if (winScreen) winScreen.style.display = "none";
if (message) message.style.display = "none";

if (startButton) {
    startButton.disabled = true;
    startButton.textContent = "SIGN IN FIRST";
}
