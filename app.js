
// ==================================================
// VÉLORA — THE WORLD THAT LISTENS
// COMPLETE GAME ENGINE + SHOCK WAVE COOLDOWN
// ==================================================

const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");

const menu = document.getElementById("menu");
const gameUI = document.getElementById("gameUI");
const winScreen = document.getElementById("winScreen");

const cooldownBar = document.getElementById("cooldownBar");
const cooldownText = document.getElementById("cooldownText");

let W, H;
let running = false;
let lastTime = 0;
let elapsed = 0;

const COOLDOWN_TIME = 5;

const world = {
    width: 2400,
    height: 1800
};

let player;
let camera;
let pulses = [];
let particles = [];
let crystals = [];
let enemies = [];
let plants = [];
let walls = [];
let collected = 0;
let messageTimer = 0;
let audioContext = null;

const keys = {};

function resize() {
    W = canvas.width = window.innerWidth;
    H = canvas.height = window.innerHeight;
}

window.addEventListener("resize", resize);
resize();

function random(min, max) {
    return Math.random() * (max - min) + min;
}

function distance(a, b) {
    return Math.hypot(a.x - b.x, a.y - b.y);
}

function showMessage(text) {
    document.getElementById("message").textContent = text;
    messageTimer = 2.5;
}

// ==================================================
// AUDIO
// ==================================================

function startAudio() {
    try {
        if (!audioContext) {
            audioContext = new (
                window.AudioContext ||
                window.webkitAudioContext
            )();
        }

        if (audioContext.state === "suspended") {
            audioContext.resume();
        }
    } catch (e) {}
}

function sound(frequency, duration, volume = 0.04) {
    if (!audioContext) return;

    try {
        const osc = audioContext.createOscillator();
        const gain = audioContext.createGain();

        osc.type = "sine";
        osc.frequency.value = frequency;

        gain.gain.setValueAtTime(
            volume,
            audioContext.currentTime
        );

        gain.gain.exponentialRampToValueAtTime(
            0.001,
            audioContext.currentTime + duration
        );

        osc.connect(gain);
        gain.connect(audioContext.destination);

        osc.start();
        osc.stop(audioContext.currentTime + duration);
    } catch (e) {}
}

// ==================================================
// START GAME
// ==================================================

function startGame() {
    menu.style.display = "none";
    winScreen.style.display = "none";
    gameUI.style.display = "block";

    player = {
        x: 200,
        y: 200,
        radius: 13,
        speed: 210,
        direction: 0,
        pulseCooldown: 0,
        reveal: 0
    };

    camera = { x: 0, y: 0 };

    pulses = [];
    particles = [];
    collected = 0;
    elapsed = 0;
    messageTimer = 0;

    document.getElementById("crystalCount").textContent = "0";
    document.getElementById("message").textContent = "";

    updateCooldownUI();

    crystals = [
        { x: 470, y: 310, found: false },
        { x: 900, y: 650, found: false },
        { x: 1300, y: 300, found: false },
        { x: 1750, y: 1100, found: false },
        { x: 2150, y: 1500, found: false }
    ];

    enemies = [
        { x: 650, y: 430, speed: 65, angle: 0, alert: 0 },
        { x: 1100, y: 900, speed: 55, angle: 2, alert: 0 },
        { x: 1600, y: 550, speed: 75, angle: 4, alert: 0 },
        { x: 1950, y: 1300, speed: 60, angle: 1, alert: 0 }
    ];

    walls = [];
    plants = [];

    // BUILDINGS AND RUINS
    for (let i = 0; i < 48; i++) {
        const x = random(100, world.width - 100);
        const y = random(100, world.height - 100);

        if (Math.hypot(x - 200, y - 200) > 180) {
            walls.push({
                x,
                y,
                w: random(35, 95),
                h: random(35, 95)
            });
        }
    }

    // GLOWING PLANTS
    for (let i = 0; i < 180; i++) {
        plants.push({
            x: random(0, world.width),
            y: random(0, world.height),
            size: random(5, 15),
            phase: random(0, 6.28)
        });
    }

    // RESET MOVEMENT KEYS
    for (const key in keys) {
        keys[key] = false;
    }

    running = true;
    lastTime = performance.now();

    requestAnimationFrame(loop);
}

// ==================================================
// SHOCK WAVE
// ==================================================

function pulse() {
    if (!running) return;

    // COOLDOWN CHECK
    if (player.pulseCooldown > 0) return;

    player.pulseCooldown = COOLDOWN_TIME;

    // CREATE SHOCK WAVE
    pulses.push({
        x: player.x,
        y: player.y,
        radius: 5,
        maxRadius: 410,
        alpha: 1
    });

    // REVEAL THE WORLD
    player.reveal = 3;

    sound(180, 0.7, 0.07);

    showMessage("THE WORLD IS LISTENING");

    // MONSTERS HEAR THE SOUND
    enemies.forEach(enemy => {
        enemy.alert = 3.5;

        enemy.target = {
            x: player.x,
            y: player.y
        };
    });

    // PARTICLE EFFECT
    for (let i = 0; i < 25; i++) {
        particles.push({
            x: player.x,
            y: player.y,
            vx: random(-120, 120),
            vy: random(-120, 120),
            life: random(0.3, 0.9)
        });
    }

    updateCooldownUI();
}

// ==================================================
// COOLDOWN UI
// ==================================================

function updateCooldownUI() {
    if (!player) return;

    const progress = Math.max(
        0,
        Math.min(
            1,
            1 - player.pulseCooldown / COOLDOWN_TIME
        )
    );

    cooldownBar.style.width = (progress * 100) + "%";

    if (player.pulseCooldown <= 0) {
        cooldownText.textContent = "READY";
        cooldownText.style.color = "#64e9ff";
    } else {
        cooldownText.textContent =
            player.pulseCooldown.toFixed(1) + "s";

        cooldownText.style.color = "#ffae72";
    }
}

// ==================================================
// COLLISIONS
// ==================================================

function collides(x, y, radius) {
    if (
        x < radius ||
        y < radius ||
        x > world.width - radius ||
        y > world.height - radius
    ) {
        return true;
    }

    for (const wall of walls) {
        const nearestX = Math.max(
            wall.x,
            Math.min(x, wall.x + wall.w)
        );

        const nearestY = Math.max(
            wall.y,
            Math.min(y, wall.y + wall.h)
        );

        if (
            Math.hypot(
                x - nearestX,
                y - nearestY
            ) < radius
        ) {
            return true;
        }
    }

    return false;
}

function movePlayer(dx, dy) {
    if (!collides(
        player.x + dx,
        player.y,
        player.radius
    )) {
        player.x += dx;
    }

    if (!collides(
        player.x,
        player.y + dy,
        player.radius
    )) {
        player.y += dy;
    }
}

// ==================================================
// UPDATE GAME
// ==================================================

function update(dt) {
    elapsed += dt;

    // PLAYER MOVEMENT
    const sprint = keys["Shift"] ? 1.5 : 1;

    let dx = 0;
    let dy = 0;

    if (keys["w"] || keys["ArrowUp"]) dy--;
    if (keys["s"] || keys["ArrowDown"]) dy++;
    if (keys["a"] || keys["ArrowLeft"]) dx--;
    if (keys["d"] || keys["ArrowRight"]) dx++;

    if (dx || dy) {
        const len = Math.hypot(dx, dy);

        dx /= len;
        dy /= len;

        player.direction = Math.atan2(dy, dx);

        movePlayer(
            dx * player.speed * sprint * dt,
            dy * player.speed * sprint * dt
        );
    }

    // COOLDOWN
    player.pulseCooldown = Math.max(
        0,
        player.pulseCooldown - dt
    );

    player.reveal = Math.max(
        0,
        player.reveal - dt
    );

    updateCooldownUI();

    // SHOCK WAVES
    pulses.forEach(p => {
        p.radius += 700 * dt;

        p.alpha = Math.max(
            0,
            1 - p.radius / p.maxRadius
        );
    });

    pulses = pulses.filter(
        p => p.radius < p.maxRadius
    );

    // PARTICLES
    particles.forEach(p => {
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.life -= dt;
    });

    particles = particles.filter(
        p => p.life > 0
    );

    // MONSTERS
    enemies.forEach(enemy => {
        enemy.alert = Math.max(
            0,
            enemy.alert - dt
        );

        let tx = enemy.x +
            Math.cos(elapsed + enemy.angle) * 30;

        let ty = enemy.y +
            Math.sin(elapsed * 0.7 + enemy.angle) * 30;

        if (enemy.alert > 0 && enemy.target) {
            tx = enemy.target.x;
            ty = enemy.target.y;
        }

        const angle = Math.atan2(
            ty - enemy.y,
            tx - enemy.x
        );

        const speed = enemy.alert > 0
            ? enemy.speed * 1.7
            : enemy.speed * 0.35;

        const nx = enemy.x +
            Math.cos(angle) * speed * dt;

        const ny = enemy.y +
            Math.sin(angle) * speed * dt;

        if (!collides(nx, ny, 15)) {
            enemy.x = nx;
            enemy.y = ny;
        }

        // PLAYER AND MONSTER INTERACTION
        if (distance(enemy, player) < 25) {
            enemy.alert = 0;

            const push = Math.atan2(
                enemy.y - player.y,
                enemy.x - player.x
            );

            enemy.x += Math.cos(push) * 90 * dt;
            enemy.y += Math.sin(push) * 90 * dt;
        }
    });

    // CRYSTALS
    crystals.forEach(crystal => {
        if (
            !crystal.found &&
            distance(player, crystal) < 30
        ) {
            crystal.found = true;
            collected++;

            document.getElementById(
                "crystalCount"
            ).textContent = collected;

            sound(500 + collected * 100, 0.5, 0.08);

            showMessage(
                "MEMORY RECOVERED " + collected + " / 5"
            );

            for (let i = 0; i < 18; i++) {
                particles.push({
                    x: crystal.x,
                    y: crystal.y,
                    vx: random(-90, 90),
                    vy: random(-90, 90),
                    life: 1
                });
            }
        }
    });

    // EXIT
    const exit = {
        x: world.width - 120,
        y: world.height - 120
    };

    if (
        collected >= 5 &&
        distance(player, exit) < 65
    ) {
        winGame();
        return;
    }

    // CAMERA
    camera.x = Math.max(
        0,
        Math.min(
            world.width - W,
            player.x - W / 2
        )
    );

    camera.y = Math.max(
        0,
        Math.min(
            world.height - H,
            player.y - H / 2
        )
    );

    // MESSAGE TIMER
    if (messageTimer > 0) {
        messageTimer -= dt;

        if (messageTimer <= 0) {
            document.getElementById(
                "message"
            ).textContent = "";
        }
    }
}

// ==================================================
// DRAW WORLD
// ==================================================

function drawWorld() {
    ctx.fillStyle = "#080b19";
    ctx.fillRect(0, 0, W, H);

    // BACKGROUND STARS
    for (let i = 0; i < 180; i++) {
        const x = (i * 173 % world.width) - camera.x;
        const y = (i * 293 % world.height) - camera.y;

        if (
            x >= 0 && x <= W &&
            y >= 0 && y <= H
        ) {
            ctx.fillStyle = "rgba(120,170,255,0.12)";
            ctx.fillRect(x, y, 2, 2);
        }
    }

    ctx.save();
    ctx.translate(-camera.x, -camera.y);

    // GROUND GRID
    ctx.strokeStyle = "rgba(80,120,180,0.07)";
    ctx.lineWidth = 1;

    for (let x = 0; x < world.width; x += 100) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, world.height);
        ctx.stroke();
    }

    for (let y = 0; y < world.height; y += 100) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(world.width, y);
        ctx.stroke();
    }

    // BUILDINGS
    if (player.reveal > 0) {
        walls.forEach(w => {
            ctx.fillStyle = "#182743";
            ctx.fillRect(w.x, w.y, w.w, w.h);

            ctx.strokeStyle = "#54c9ee";
            ctx.lineWidth = 2;
            ctx.strokeRect(w.x, w.y, w.w, w.h);
        });
    }

    // GLOWING PLANTS
    plants.forEach(p => {
        ctx.globalAlpha = player.reveal > 0 ? 1 : 0.12;

        ctx.fillStyle = "#4cdbba";
        ctx.shadowBlur = player.reveal > 0 ? 15 : 0;
        ctx.shadowColor = "#39ffd0";

        ctx.beginPath();
        ctx.arc(
            p.x,
            p.y,
            p.size,
            0,
            Math.PI * 2
        );

        ctx.fill();
    });

    ctx.globalAlpha = 1;
    ctx.shadowBlur = 0;

    // CRYSTALS
    crystals.forEach(c => {
        if (c.found) return;

        ctx.save();
        ctx.translate(c.x, c.y);
        ctx.rotate(elapsed * 0.7);

        ctx.globalAlpha = player.reveal > 0 ? 1 : 0.12;
        ctx.shadowBlur = player.reveal > 0 ? 30 : 0;
        ctx.shadowColor = "#57dfff";
        ctx.fillStyle = "#81edff";

        ctx.beginPath();
        ctx.moveTo(0, -17);
        ctx.lineTo(12, 0);
        ctx.lineTo(0, 17);
        ctx.lineTo(-12, 0);
        ctx.closePath();
        ctx.fill();

        ctx.restore();
    });

    // EXIT PORTAL
    const exitX = world.width - 120;
    const exitY = world.height - 120;

    ctx.globalAlpha = collected >= 5 ? 1 : 0.15;
    ctx.shadowBlur = collected >= 5 ? 35 : 0;
    ctx.shadowColor = "#8e74ff";
    ctx.strokeStyle = "#9b8aff";
    ctx.lineWidth = 4;

    ctx.beginPath();
    ctx.arc(
        exitX,
        exitY,
        35 + Math.sin(elapsed * 2) * 5,
        0,
        Math.PI * 2
    );

    ctx.stroke();

    ctx.globalAlpha = 1;
    ctx.shadowBlur = 0;

    // MONSTERS
    enemies.forEach(e => {
        ctx.globalAlpha = player.reveal > 0 ? 1 : 0.12;
        ctx.shadowBlur = player.reveal > 0 ? 20 : 0;
        ctx.shadowColor = "#ff4b91";
        ctx.fillStyle = "#d73d79";

        ctx.beginPath();
        ctx.arc(e.x, e.y, 15, 0, Math.PI * 2);
        ctx.fill();

        // EYES
        ctx.fillStyle = "#ffffff";

        ctx.beginPath();
        ctx.arc(e.x - 5, e.y - 3, 3, 0, Math.PI * 2);
        ctx.arc(e.x + 5, e.y - 3, 3, 0, Math.PI * 2);
        ctx.fill();
    });

    ctx.globalAlpha = 1;
    ctx.shadowBlur = 0;

    // SHOCK WAVE RINGS
    pulses.forEach(p => {
        ctx.globalAlpha = p.alpha;
        ctx.strokeStyle = "#5be5ff";
        ctx.lineWidth = 4;
        ctx.shadowBlur = 25;
        ctx.shadowColor = "#44dfff";

        ctx.beginPath();
        ctx.arc(
            p.x,
            p.y,
            p.radius,
            0,
            Math.PI * 2
        );

        ctx.stroke();
    });

    ctx.globalAlpha = 1;
    ctx.shadowBlur = 0;

    // PARTICLES
    particles.forEach(p => {
        ctx.globalAlpha = Math.min(1, p.life);
        ctx.fillStyle = "#83eaff";

        ctx.beginPath();
        ctx.arc(p.x, p.y, 3, 0, Math.PI * 2);
        ctx.fill();
    });

    ctx.globalAlpha = 1;

    // PLAYER
    ctx.shadowBlur = 25;
    ctx.shadowColor = "#62eaff";
    ctx.fillStyle = "#e1faff";

    ctx.beginPath();
    ctx.arc(
        player.x,
        player.y,
        player.radius,
        0,
        Math.PI * 2
    );

    ctx.fill();

    ctx.shadowBlur = 0;
    ctx.strokeStyle = "#69dfff";
    ctx.lineWidth = 3;

    ctx.beginPath();
    ctx.arc(
        player.x,
        player.y,
        21,
        0,
        Math.PI * 2
    );

    ctx.stroke();

    ctx.restore();

    // DARK VISION MASK
    if (player.reveal <= 0) {
        const px = player.x - camera.x;
        const py = player.y - camera.y;

        const gradient = ctx.createRadialGradient(
            px, py, 10,
            px, py, 125
        );

        gradient.addColorStop(
            0,
            "rgba(3,5,15,0)"
        );

        gradient.addColorStop(
            1,
            "rgba(3,5,15,0.94)"
        );

        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, W, H);
    }
}

// ==================================================
// GAME LOOP
// ==================================================

function loop(time) {
    if (!running) return;

    const dt = Math.min(
        (time - lastTime) / 1000,
        0.04
    );

    lastTime = time;

    update(dt);
    drawWorld();

    requestAnimationFrame(loop);
}

// ==================================================
// KEYBOARD
// ==================================================

window.addEventListener("keydown", e => {
    const key = e.key.toLowerCase();

    if (
        ["arrowup", "arrowdown", "arrowleft",
         "arrowright", " "].includes(key)
    ) {
        e.preventDefault();
    }

    keys[key] = true;

    if (key === " " && !e.repeat) {
        pulse();
    }
});

window.addEventListener("keyup", e => {
    keys[e.key.toLowerCase()] = false;
});

// ==================================================
// BUTTONS
// ==================================================

document.getElementById("startButton")
    .addEventListener("click", () => {
        startAudio();
        startGame();
    });

document.getElementById("restartButton")
    .addEventListener("click", () => {
        startGame();
    });

// ==================================================
// END
// ==================================================
