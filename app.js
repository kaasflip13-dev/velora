
// ==========================================
// VÉLORA — THE WORLD THAT LISTENS
// DARKNESS + PLAYER LIGHT + SHOCKWAVES
// ==========================================

const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");

const menu = document.getElementById("menu");
const startButton = document.getElementById("startButton");
const gameUI = document.getElementById("gameUI");
const crystalCount = document.getElementById("crystalCount");
const cooldownBar = document.getElementById("cooldownBar");
const cooldownText = document.getElementById("cooldownText");
const hint = document.getElementById("hint");
const message = document.getElementById("message");
const winScreen = document.getElementById("winScreen");
const restartButton = document.getElementById("restartButton");

const WORLD_SIZE = 2200;
const WAVE_COOLDOWN = 5;
const PLAYER_LIGHT_RADIUS = 115;

let running = false;
let lastTime = 0;
let crystals = 0;
let waveCooldown = 0;
let keys = {};
let camera = { x: 0, y: 0 };

const player = {
    x: WORLD_SIZE / 2,
    y: WORLD_SIZE / 2,
    radius: 15,
    speed: 190,
    health: 100
};

let enemies = [];
let crystalObjects = [];
let trees = [];
let rocks = [];
let waves = [];
let portal = { x: 0, y: 0 };
let messageTimer = 0;

const darknessCanvas = document.createElement("canvas");
const darknessCtx = darknessCanvas.getContext("2d");

function resizeCanvas() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    darknessCanvas.width = canvas.width;
    darknessCanvas.height = canvas.height;
}

window.addEventListener("resize", resizeCanvas);
resizeCanvas();

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

function random(min, max) {
    return Math.random() * (max - min) + min;
}

function distance(a, b) {
    return Math.hypot(a.x - b.x, a.y - b.y);
}

// ==========================================
// WERELD
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

        do {
            x = random(150, WORLD_SIZE - 150);
            y = random(150, WORLD_SIZE - 150);
        } while (Math.hypot(x - player.x, y - player.y) < 300);

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
// START
// ==========================================

function startGame() {
    crystals = 0;
    waveCooldown = 0;
    messageTimer = 0;
    keys = {};

    player.x = WORLD_SIZE / 2;
    player.y = WORLD_SIZE / 2;
    player.health = 100;

    createWorld();

    menu.style.display = "none";
    winScreen.style.display = "none";
    gameUI.style.display = "block";

    running = true;
    lastTime = performance.now();

    updateCrystalCount();
    requestAnimationFrame(gameLoop);
}

startButton.addEventListener("click", startGame);

if (restartButton) {
    restartButton.addEventListener("click", startGame);
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

    if (cooldownBar) {
        cooldownBar.style.width =
            `${100 - waveCooldown / WAVE_COOLDOWN * 100}%`;
    }

    if (cooldownText) {
        cooldownText.textContent = waveCooldown > 0
            ? `${waveCooldown.toFixed(1)}s`
            : "READY";
    }
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
        if (!crystal.collected &&
            distance(player, crystal) < 27) {

            crystal.collected = true;
            crystals++;

            updateCrystalCount();
            showMessage("Herinnering gevonden!");
        }
    });
}

function updateCrystalCount() {
    if (crystalCount) {
        crystalCount.textContent = `${crystals}/5`;
    }
}

// ==========================================
// BERICHTEN
// ==========================================

function showMessage(text) {
    if (!message) return;

    message.textContent = text;
    message.style.display = "block";
    messageTimer = 2;
}

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

    camera.x = Math.max(0, Math.min(
        WORLD_SIZE - canvas.width, camera.x
    ));

    camera.y = Math.max(0, Math.min(
        WORLD_SIZE - canvas.height, camera.y
    ));
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
    ctx.strokeRect(-camera.x, -camera.y, WORLD_SIZE, WORLD_SIZE);
}

function drawTrees() {
    trees.forEach(tree => {
        const x = tree.x - camera.x;
        const y = tree.y - camera.y;

        if (x < -50 || y < -50 ||
            x > canvas.width + 50 ||
            y > canvas.height + 50) return;

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

function drawRocks() {
    rocks.forEach(rock => {
        const x = rock.x - camera.x;
        const y = rock.y - camera.y;

        if (x < -30 || y < -30 ||
            x > canvas.width + 30 ||
            y > canvas.height + 30) return;

        ctx.fillStyle = "#697477";
        ctx.beginPath();
        ctx.ellipse(x, y, rock.size, rock.size * 0.7, 0, 0, Math.PI * 2);
        ctx.fill();
    });
}

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

function drawEnemies() {
    enemies.forEach(enemy => {
        const x = enemy.x - camera.x;
        const y = enemy.y - camera.y;

        if (x < -50 || y < -50 ||
            x > canvas.width + 50 ||
            y > canvas.height + 50) return;

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
// DONKERTE + KLEINE LICHTCIRKEL
// ==========================================

function drawNightEffect() {
    const dark = darknessCtx;

    dark.clearRect(0, 0, darknessCanvas.width, darknessCanvas.height);

    // Hele scherm donker
    dark.globalCompositeOperation = "source-over";
    dark.fillStyle = "#02050b";
    dark.fillRect(0, 0, darknessCanvas.width, darknessCanvas.height);

    // Shockwaves maken grote gebieden zichtbaar
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

    // Kleine permanente lichtcirkel rond speler
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
// SHOCKWAVE RING
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
// SPELER
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
    if (hint) {
        hint.textContent =
            "WASD: bewegen | SHIFT: sprinten | SPACE: shockwave";
    }

    ctx.fillStyle = "rgba(0,0,0,0.7)";
    ctx.fillRect(20, 20, 160, 12);

    ctx.fillStyle = "#71d99a";
    ctx.fillRect(20, 20, 160 * (player.health / 100), 12);
}

// ==========================================
// WINNEN / GAME OVER
// ==========================================

function gameOver() {
    running = false;

    if (message) {
        message.textContent = "Je bent gevonden...";
        message.style.display = "block";
    }

    setTimeout(() => {
        if (!running) {
            menu.style.display = "flex";
            gameUI.style.display = "none";
        }
    }, 1800);
}

function checkWin() {
    if (crystals >= 5 && distance(player, portal) < 45) {
        running = false;
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

    // Eerst donkerte, dan zichtbare speler en shockwave
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
// BEGINSTAND
// ==========================================

menu.style.display = "flex";
gameUI.style.display = "none";
winScreen.style.display = "none";
