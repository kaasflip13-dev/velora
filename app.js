// ==========================================
// VÉLORA — THE WORLD THAT LISTENS
// ORIGINAL 2D GAME
// ==========================================

const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");

const menu = document.getElementById("menu");
const gameUI = document.getElementById("gameUI");
const winScreen = document.getElementById("winScreen");

let W, H;
let running = false;
let lastTime = 0;
let elapsed = 0;

function resize() {
    W = canvas.width = window.innerWidth;
    H = canvas.height = window.innerHeight;
}
window.addEventListener("resize", resize);
resize();

const keys = {};
const world = {
    width: 2400,
    height: 1800
};

let player;
let camera;
let pulses;
let particles;
let crystals;
let enemies;
let plants;
let walls;
let collected;
let messageTimer = 0;
let audioContext = null;

function random(min, max) {
    return Math.random() * (max - min) + min;
}

function distance(a, b) {
    return Math.hypot(a.x - b.x, a.y - b.y);
}

function showMessage(text) {
    const el = document.getElementById("message");
    el.textContent = text;
    messageTimer = 2.5;
}

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

    crystals = [
        {x: 470, y: 310, found:false},
        {x: 900, y: 650, found:false},
        {x: 1300, y: 300, found:false},
        {x: 1750, y: 1100, found:false},
        {x: 2150, y: 1500, found:false}
    ];

    enemies = [
        {x:650,y:430,speed:65,angle:0,alert:0},
        {x:1100,y:900,speed:55,angle:0,alert:0},
        {x:1600,y:550,speed:75,angle:0,alert:0},
        {x:1950,y:1300,speed:60,angle:0,alert:0}
    ];

    walls = [];
    plants = [];

    // World structures
    for (let i = 0; i < 48; i++) {
        let x = random(100, world.width - 100);
        let y = random(100, world.height - 100);

        if (Math.hypot(x - 200, y - 200) > 180) {
            walls.push({
                x, y,
                w: random(35, 95),
                h: random(35, 95)
            });
        }
    }

    for (let i = 0; i < 180; i++) {
        plants.push({
            x: random(0, world.width),
            y: random(0, world.height),
            size: random(5, 15),
            phase: random(0, 6.28)
        });
    }

    running = true;
    lastTime = performance.now();
    requestAnimationFrame(loop);
}

function startAudio() {
    try {
        if (!audioContext) {
            audioContext = new (window.AudioContext || window.webkitAudioContext)();
        }
        if (audioContext.state === "suspended") audioContext.resume();
    } catch(e) {}
}

function sound(frequency, duration, volume = 0.04) {
    if (!audioContext) return;

    try {
        const osc = audioContext.createOscillator();
        const gain = audioContext.createGain();

        osc.type = "sine";
        osc.frequency.value = frequency;
        gain.gain.setValueAtTime(volume, audioContext.currentTime);
        gain.gain.exponentialRampToValueAtTime(
            0.001, audioContext.currentTime + duration
        );

        osc.connect(gain);
        gain.connect(audioContext.destination);
        osc.start();
        osc.stop(audioContext.currentTime + duration);
    } catch(e) {}
}

function pulse() {
    if (!running || player.pulseCooldown > 0) return;

    player.pulseCooldown = 1.1;

    pulses.push({
        x: player.x,
        y: player.y,
        radius: 5,
        maxRadius: 410,
        alpha: 1
    });

    player.reveal = 3;

    sound(180, 0.7, 0.07);
    showMessage("THE WORLD IS LISTENING");

    // Monsters hear the pulse
    enemies.forEach(enemy => {
        enemy.alert = 3.5;
        enemy.target = {x: player.x, y: player.y};
    });

    for (let i = 0; i < 25; i++) {
        particles.push({
            x: player.x,
            y: player.y,
            vx: random(-120, 120),
            vy: random(-120, 120),
            life: random(.3, .9)
        });
    }
}

function collides(x, y, radius) {
    if (x < radius || y < radius ||
        x > world.width - radius ||
        y > world.height - radius) return true;

    for (const wall of walls) {
        const nearestX = Math.max(wall.x, Math.min(x, wall.x + wall.w));
        const nearestY = Math.max(wall.y, Math.min(y, wall.y + wall.h));

        if (Math.hypot(x - nearestX, y - nearestY) < radius) {
            return true;
        }
    }

    return false;
}

function movePlayer(dx, dy) {
    if (!collides(player.x + dx, player.y, player.radius)) {
        player.x += dx;
    }
    if (!collides(player.x, player.y + dy, player.radius)) {
        player.y += dy;
    }
}

function update(dt) {
    elapsed += dt;

    const sprint = keys["Shift"] ? 1.5 : 1;
    let dx = 0, dy = 0;

    if (keys["w"] || keys["ArrowUp"]) dy--;
    if (keys["s"] || keys["ArrowDown"]) dy++;
    if (keys["a"] || keys["ArrowLeft"]) dx--;
    if (keys["d"] || keys["ArrowRight"]) dx++;

    if (dx || dy) {
        const len = Math.hypot(dx, dy);
        dx /= len;
        dy /= len;

        player.direction = Math.atan2(dy, dx);
        movePlayer(dx * player.speed * sprint * dt,
                   dy * player.speed * sprint * dt);
    }

    player.pulseCooldown = Math.max(0, player.pulseCooldown - dt);
    player.reveal = Math.max(0, player.reveal - dt);

    pulses.forEach(p => {
        p.radius += 700 * dt;
        p.alpha = Math.max(0, 1 - p.radius / p.maxRadius);
    });
    pulses = pulses.filter(p => p.radius < p.maxRadius);

    particles.forEach(p => {
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.life -= dt;
    });
    particles = particles.filter(p => p.life > 0);

    enemies.forEach(enemy => {
        enemy.alert = Math.max(0, enemy.alert - dt);

        let tx = enemy.x + Math.cos(elapsed + enemy.angle) * 30;
        let ty = enemy.y + Math.sin(elapsed * .7 + enemy.angle) * 30;

        if (enemy.alert > 0 && enemy.target) {
            tx = enemy.target.x;
            ty = enemy.target.y;
        }

        const angle = Math.atan2(ty - enemy.y, tx - enemy.x);
        const speed = enemy.alert > 0 ? enemy.speed * 1.7 : enemy.speed * .35;

        const nx = enemy.x + Math.cos(angle) * speed * dt;
        const ny = enemy.y + Math.sin(angle) * speed * dt;

        if (!collides(nx, ny, 15)) {
            enemy.x = nx;
            enemy.y = ny;
        }

        // They chase but do not kill the player.
        if (distance(enemy, player) < 25) {
            enemy.alert = 0;
            const push = Math.atan2(enemy.y-player.y, enemy.x-player.x);
            enemy.x += Math.cos(push) * 90 * dt;
            enemy.y += Math.sin(push) * 90 * dt;
            showMessage("SOMETHING HEARD YOU...");
        }
    });

    crystals.forEach(crystal => {
        if (!crystal.found && distance(player, crystal) < 30) {
            crystal.found = true;
            collected++;
            document.getElementById("crystalCount").textContent = collected;
            sound(500 + collected * 100, .5, .08);
            showMessage("MEMORY RECOVERED  " + collected + " / 5");

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

    if (collected >= 5 && distance(player, {
        x: world.width - 120,
        y: world.height - 120
    }) < 65) {
        winGame();
    }

    camera.x = Math.max(0, Math.min(
        world.width - W,
        player.x - W / 2
    ));

    camera.y = Math.max(0, Math.min(
        world.height - H,
        player.y - H / 2
    ));

    if (messageTimer > 0) {
        messageTimer -= dt;
        if (messageTimer <= 0) {
            document.getElementById("message").textContent = "";
        }
    }
}

function drawWorld() {
    ctx.fillStyle = "#080b19";
    ctx.fillRect(0, 0, W, H);

    // Background stars
    for (let i = 0; i < 180; i++) {
        const x = (i * 173 % world.width) - camera.x;
        const y = (i * 293 % world.height) - camera.y;

        if (x >= 0 && x <= W && y >= 0 && y <= H) {
            ctx.fillStyle = "rgba(120,170,255,0.12)";
            ctx.fillRect(x, y, 2, 2);
        }
    }

    ctx.save();
    ctx.translate(-camera.x, -camera.y);

    // Ground patterns
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

    // Structures are visible only when revealed
    const reveal = player.reveal > 0;

    if (reveal) {
        walls.forEach(w => {
            ctx.fillStyle = "#182743";
            ctx.fillRect(w.x, w.y, w.w, w.h);
            ctx.strokeStyle = "#54c9ee";
            ctx.strokeRect(w.x, w.y, w.w, w.h);
        });
    }

    // Plants
    plants.forEach(p => {
        const glow = .3 + Math.sin(elapsed * 2 + p.phase) * .2;

        ctx.globalAlpha = reveal ? 1 : .12;
        ctx.fillStyle = "#4cdbba";
        ctx.shadowBlur = reveal ? 15 : 0;
        ctx.shadowColor = "#39ffd0";

        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();
    });
    ctx.globalAlpha = 1;
    ctx.shadowBlur = 0;

    // Crystals
    crystals.forEach(c => {
        if (c.found) return;

        ctx.save();
        ctx.translate(c.x, c.y);
        ctx.rotate(elapsed * .7);

        ctx.globalAlpha = reveal ? 1 : .12;
        ctx.shadowBlur = reveal ? 30 : 0;
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

    // Exit
    const exitX = world.width - 120;
    const exitY = world.height - 120;

    ctx.globalAlpha = collected >= 5 ? 1 : .15;
    ctx.shadowBlur = collected >= 5 ? 35 : 0;
    ctx.shadowColor = "#8e74ff";
    ctx.strokeStyle = "#9b8aff";
    ctx.lineWidth = 4;

    ctx.beginPath();
    ctx.arc(exitX, exitY, 35 + Math.sin(elapsed * 2) * 5, 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = 1;
    ctx.shadowBlur = 0;

    // Enemies
    enemies.forEach(e => {
        ctx.globalAlpha = reveal ? 1 : .12;
        ctx.shadowBlur = reveal ? 20 : 0;
        ctx.shadowColor = "#ff4b91";
        ctx.fillStyle = "#d73d79";

        ctx.beginPath();
        ctx.arc(e.x, e.y, 15, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = "#fff";
        ctx.beginPath();
        ctx.arc(e.x - 5, e.y - 3, 3, 0, Math.PI * 2);
        ctx.arc(e.x + 5, e.y - 3, 3, 0, Math.PI * 2);
        ctx.fill();
    });
    ctx.globalAlpha = 1;
    ctx.shadowBlur = 0;

    // Pulses
    pulses.forEach(p => {
        ctx.globalAlpha = p.alpha;
        ctx.strokeStyle = "#5be5ff";
        ctx.lineWidth = 4;
        ctx.shadowBlur = 25;
        ctx.shadowColor = "#44dfff";

        ctx.beginPath();
        ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
        ctx.stroke();
    });
    ctx.globalAlpha = 1;
    ctx.shadowBlur = 0;

    // Particles
    particles.forEach(p => {
        ctx.globalAlpha = Math.min(1, p.life);
        ctx.fillStyle = "#83eaff";
        ctx.beginPath();
        ctx.arc(p.x, p.y, 3, 0, Math.PI * 2);
        ctx.fill();
    });
    ctx.globalAlpha = 1;

    // Player
    ctx.shadowBlur = 25;
    ctx.shadowColor = "#62eaff";
    ctx.fillStyle = "#e1faff";

    ctx.beginPath();
    ctx.arc(player.x, player.y, player.radius, 0, Math.PI * 2);
    ctx.fill();

    ctx.shadowBlur = 0;
    ctx.strokeStyle = "#69dfff";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(player.x, player.y, 21, 0, Math.PI * 2);
    ctx.stroke();

    ctx.restore();

    // Dark vision mask
    if (player.reveal <= 0) {
        const px = player.x - camera.x;
        const py = player.y - camera.y;

        const gradient = ctx.createRadialGradient(
            px, py, 10, px, py, 125
        );

        gradient.addColorStop(0, "rgba(3,5,15,0)");
        gradient.addColorStop(1, "rgba(3,5,15,0.94)");

        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, W, H);
    }
}

function winGame() {
    running = false;
    gameUI.style.display = "none";
    winScreen.style.display = "flex";
}

function loop(time) {
    if (!running) return;

    const dt = Math.min((time - lastTime) / 1000, 0.04);
    lastTime = time;

    update(dt);
    drawWorld();

    requestAnimationFrame(loop);
}

// Controls
window.addEventListener("keydown", e => {
    const key = e.key.toLowerCase();

    if (["arrowup", "arrowdown", "arrowleft", "arrowright", " "].includes(key)) {
        e.preventDefault();
    }

    keys[key] = true;

    if (key === " " && !e.repeat) pulse();
});

window.addEventListener("keyup", e => {
    keys[e.key.toLowerCase()] = false;
});

document.getElementById("startButton").addEventListener("click", () => {
    startAudio();
    startGame();
});

document.getElementById("restartButton").addEventListener("click", () => {
    startGame();
});
