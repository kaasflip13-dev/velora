// ==========================================
// VÉLORA FPS — THE WORLD THAT LISTENS
// Three.js FPS + Firebase (login, profiel, leaderboard) + co-op
// ==========================================

import { initializeApp } from "https://www.gstatic.com/firebasejs/12.17.1/firebase-app.js";
import {
    getAuth, GoogleAuthProvider, signInWithPopup, signOut,
    onAuthStateChanged, setPersistence, browserLocalPersistence
} from "https://www.gstatic.com/firebasejs/12.17.1/firebase-auth.js";
import {
    getFirestore, doc, getDoc, setDoc, collection, query, orderBy, limit,
    onSnapshot, serverTimestamp, runTransaction
} from "https://www.gstatic.com/firebasejs/12.17.1/firebase-firestore.js";

import { MAPS, LEVELS } from "./maps.js";
import { Net } from "./multiplayer.js";

const THREE = window.THREE;
const $ = id => document.getElementById(id);

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

let user = null;
let progress = { unlocked: 1, levels: {}, coins: 0 };   // levels[n] = { bestStars, bestTime }
let unsubPlayers = null;

function loadLocal() {
    try {
        const s = JSON.parse(localStorage.getItem("velora_fps") || "{}");
        progress = { unlocked: s.unlocked || 1, levels: s.levels || {}, coins: s.coins || 0 };
    } catch { /* ignore */ }
}
function saveLocal() {
    try { localStorage.setItem("velora_fps", JSON.stringify(progress)); } catch { /* ignore */ }
}

async function loadProfile(u) {
    try {
        const ref = doc(db, "users", u.uid);
        const snap = await getDoc(ref);
        const d = snap.exists() ? snap.data() : {};
        const data = {
            displayName: u.displayName || "VÉLORA Player",
            photoURL: u.photoURL || "",
            updatedAt: serverTimestamp()
        };
        if (!snap.exists()) {
            data.coins = 0; data.highscore = 0; data.unlockedLevel = 1;
            data.levelProgress = {}; data.createdAt = serverTimestamp();
        }
        await setDoc(ref, data, { merge: true });
        progress = {
            coins: Math.max(0, Number(d.coins) || 0),
            unlocked: Math.max(1, Math.min(LEVELS.length, Number(d.unlockedLevel) || 1)),
            levels: d.levelProgress || {}
        };
    } catch (e) {
        console.error("Profile error:", e);
        $("loginStatus").textContent = "Kon profiel niet laden: " + e.message;
    }
    renderLevels();
}

async function recordResult(levelNo, win, stars, secs, earned) {
    const k = String(levelNo);
    if (user) {
        try {
            const ref = doc(db, "users", user.uid);
            const out = await runTransaction(db, async tx => {
                const s = await tx.get(ref);
                const d = s.exists() ? s.data() : {};
                const lp = d.levelProgress || {};
                const prev = lp[k] || {};
                if (win) {
                    lp[k] = {
                        ...prev,
                        bestStars: Math.max(prev.bestStars || 0, stars),
                        bestTime: prev.bestTime ? Math.min(prev.bestTime, secs) : secs
                    };
                }
                const data = {
                    displayName: user.displayName || d.displayName || "VÉLORA Player",
                    photoURL: user.photoURL || d.photoURL || "",
                    coins: (Number(d.coins) || 0) + earned,
                    highscore: Math.max(Number(d.highscore) || 0, earned),
                    unlockedLevel: win ? Math.max(Number(d.unlockedLevel) || 1, Math.min(LEVELS.length, levelNo + 1))
                                       : (Number(d.unlockedLevel) || 1),
                    levelProgress: lp,
                    updatedAt: serverTimestamp()
                };
                tx.set(ref, data, { merge: true });
                return data;
            });
            progress = { coins: out.coins, unlocked: out.unlockedLevel, levels: out.levelProgress };
        } catch (e) { console.error("Save error:", e); }
    } else {
        if (win) {
            const prev = progress.levels[k] || {};
            progress.levels[k] = { ...prev, bestStars: Math.max(prev.bestStars || 0, stars), bestTime: prev.bestTime ? Math.min(prev.bestTime, secs) : secs };
            progress.unlocked = Math.max(progress.unlocked, Math.min(LEVELS.length, levelNo + 1));
        }
        progress.coins += earned;
        saveLocal();
    }
}

function listenToPlayers() {
    if (unsubPlayers) { unsubPlayers(); unsubPlayers = null; }
    const list = $("playersList");
    unsubPlayers = onSnapshot(
        query(collection(db, "users"), orderBy("coins", "desc"), limit(50)),
        snap => {
            list.innerHTML = "";
            if (snap.empty) { list.textContent = "No players yet."; return; }
            snap.docs.forEach((d, i) => {
                const data = d.data() || {};
                const row = document.createElement("div"); row.className = "leaderboard-row";
                if (user && d.id === user.uid) row.classList.add("is-you");
                const info = document.createElement("div");
                const rank = document.createElement("span"); rank.className = "leaderboard-rank"; rank.textContent = `#${i + 1}`;
                const name = document.createElement("span"); name.textContent = data.displayName || "VÉLORA Player";
                info.append(rank, name);
                const amount = document.createElement("span"); amount.textContent = `🪙 ${Math.max(0, Number(data.coins) || 0)}`;
                row.append(info, amount); list.appendChild(row);
            });
        },
        err => { list.textContent = "Could not load leaderboard: " + err.message; }
    );
}

$("googleButton").onclick = async () => {
    $("loginStatus").textContent = "Signing in...";
    try { await signInWithPopup(auth, provider); $("loginStatus").textContent = ""; }
    catch (e) {
        $("loginStatus").textContent = location.protocol === "file:"
            ? "Google-login werkt niet vanaf een lokaal bestand. Host de map via http (GitHub Pages, Live Server of 'npx serve')."
            : "Sign-in mislukt: " + (e.code || e.message);
    }
};
$("logoutButton").onclick = () => signOut(auth);

onAuthStateChanged(auth, async u => {
    user = u || null;
    $("loginArea").hidden = !!u; $("loggedInArea").hidden = !u;
    if (u) {
        $("playerName").textContent = (u.displayName || u.email || "EXPLORER").toUpperCase();
        await loadProfile(u); listenToPlayers();
    } else {
        if (unsubPlayers) { unsubPlayers(); unsubPlayers = null; }
        $("playersList").textContent = "Sign in to see the players.";
        if (net) leaveMultiplayer();
        loadLocal(); renderLevels();
    }
    updateMpUi();
});

// ==========================================
// THREE.JS BASIS
// ==========================================
const CELL = 4, WALL_H = 4.4, EYE = 1.7, PR = 0.45;
const canvas = $("game");
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(78, 1, .1, 200);
camera.rotation.order = "YXZ";
scene.add(camera);
scene.add(new THREE.AmbientLight(0xffffff, .22));
const plight = new THREE.PointLight(0xbfeaff, 1.7, 24, 1.3);
camera.add(plight);
function resize() { renderer.setSize(innerWidth, innerHeight, false); camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); }
addEventListener("resize", resize); resize();

const gun = new THREE.Group();
gun.add(new THREE.Mesh(new THREE.BoxGeometry(.12, .14, .6), new THREE.MeshStandardMaterial({ color: 0x33485c, metalness: .6, roughness: .4 })));
const gunTip = new THREE.Mesh(new THREE.BoxGeometry(.05, .05, .08), new THREE.MeshBasicMaterial({ color: 0x8fdfff }));
gunTip.position.set(0, .03, -.34); gun.add(gunTip);
const flash = new THREE.Mesh(new THREE.SphereGeometry(.12, 8, 8), new THREE.MeshBasicMaterial({ color: 0xcff4ff, transparent: true, opacity: .9 }));
flash.position.set(0, .03, -.5); flash.visible = false; gun.add(flash);
gun.position.set(.27, -.25, -.55);
camera.add(gun);

function tex(size, draw, rx = 1, ry = 1) {
    const c = document.createElement("canvas"); c.width = c.height = size;
    draw(c.getContext("2d"), size);
    const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(rx, ry); t.anisotropy = 4;
    return t;
}
const brickTex = tex(128, (x, s) => {
    x.fillStyle = "#cfcfcf"; x.fillRect(0, 0, s, s);
    for (let i = 0; i < 500; i++) { x.fillStyle = `rgba(0,0,0,${Math.random() * .08})`; x.fillRect(Math.random() * s, Math.random() * s, 6, 4); }
    x.strokeStyle = "#555"; x.lineWidth = 3;
    for (let r = 0; r < 4; r++) {
        const y = r * 32; x.beginPath(); x.moveTo(0, y); x.lineTo(s, y); x.stroke();
        const off = r % 2 ? 16 : 0;
        for (let c = 0; c < 4; c++) { x.beginPath(); x.moveTo(off + c * 32, y); x.lineTo(off + c * 32, y + 32); x.stroke(); }
    }
});
const glowTex = tex(64, (x, s) => {
    const g = x.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    g.addColorStop(0, "rgba(255,255,255,1)"); g.addColorStop(.3, "rgba(255,255,255,.4)"); g.addColorStop(1, "rgba(255,255,255,0)");
    x.fillStyle = g; x.fillRect(0, 0, s, s);
});
glowTex.wrapS = glowTex.wrapT = THREE.ClampToEdgeWrapping;
function glow(color, size) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
    s.scale.set(size, size, 1); return s;
}

let actx = null;
function beep(f, d = .1, type = "square", vol = .06, slide = 0) {
    try {
        actx = actx || new (window.AudioContext || window.webkitAudioContext)();
        const o = actx.createOscillator(), g = actx.createGain();
        o.type = type; o.frequency.setValueAtTime(f, actx.currentTime);
        if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, f + slide), actx.currentTime + d);
        g.gain.setValueAtTime(vol, actx.currentTime); g.gain.exponentialRampToValueAtTime(.0001, actx.currentTime + d);
        o.connect(g).connect(actx.destination); o.start(); o.stop(actx.currentTime + d);
    } catch { /* ignore */ }
}

// ==========================================
// GAME STATE
// ==========================================
let world = null, grid = [], W = 0, H = 0, lvl = 0;
let crystals = [], enemies = [], pickups = [], bullets = [], tracers = [], rings = [], hazards = [], portal = null, hazardMat = null;
let remoteBullets = [];
let flows = new Map();
const player = { x: 0, z: 0, yaw: 0, pitch: 0, hp: 100, energy: 100, vx: 0, vz: 0, coins: 0, bob: 0 };
let startPos = { x: 0, z: 0 };
let running = false, locked = false, noLock = false, paused = false, ended = false, spectating = false;
let levelTime = 0, nextShot = 0, swCd = 0, kick = 0, msgT = 0, lastT = 0, flowT = 0, snapT = 0, psT = 0, hudT = 0, portalWarn = 0;
const keys = {}; let mouseDown = false, rmb = false;

const mp = { on: false, remotes: new Map() };
let net = null;
const SLOT_COLORS = [0x8fdfff, 0xffcc66, 0x9dff8f, 0xff8fd8];
const myId = () => (user ? user.uid : "solo");
const isGuest = () => mp.on && net && !net.isHost;
const isAuthority = () => !isGuest();

const solidAt = (cx, cz) => (cx < 0 || cz < 0 || cx >= W || cz >= H) ? true : (grid[cz][cx] === "#" || grid[cz][cx] === "T");
function blocked(x, z, r) {
    for (const dx of [-r, r]) for (const dz of [-r, r])
        if (solidAt(Math.floor((x + dx) / CELL), Math.floor((z + dz) / CELL))) return true;
    return false;
}
function los(ax, az, bx, bz) {
    const d = Math.hypot(bx - ax, bz - az), n = Math.ceil(d / .6);
    for (let i = 1; i < n; i++) { const t = i / n; if (solidAt(Math.floor((ax + (bx - ax) * t) / CELL), Math.floor((az + (bz - az) * t) / CELL))) return false; }
    return true;
}
function msg(text, ms = 2600) { const m = $("msg"); m.textContent = text; m.classList.add("show"); msgT = performance.now() + ms; }
const fmt = s => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

// ==========================================
// LEVEL BOUWEN
// ==========================================
function disposeGroup(g) {
    g.traverse(o => {
        if (o.geometry) o.geometry.dispose();
        if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => m.dispose());
    });
}

function buildLevel(i) {
    lvl = i; const L = LEVELS[i], th = L.theme;
    if (world) { scene.remove(world); disposeGroup(world); }
    world = new THREE.Group(); scene.add(world);
    crystals = []; enemies = []; pickups = []; bullets = []; tracers = []; rings = []; hazards = []; portal = null; remoteBullets = [];
    mp.remotes.forEach(r => { r.mesh = null; });

    const rows = MAPS[i]; H = rows.length; W = Math.max(...rows.map(r => r.length));
    grid = rows.map(r => r.padEnd(W, "#").split(""));

    scene.background = new THREE.Color(th.fog);
    scene.fog = new THREE.FogExp2(new THREE.Color(th.fog), .045);
    plight.distance = L.light;

    const floorT = tex(128, (x, s) => {
        x.fillStyle = "#bbb"; x.fillRect(0, 0, s, s); x.strokeStyle = "#666"; x.lineWidth = 3; x.strokeRect(0, 0, s, s);
        for (let k = 0; k < 200; k++) { x.fillStyle = `rgba(0,0,0,${Math.random() * .1})`; x.fillRect(Math.random() * s, Math.random() * s, 3, 3); }
    }, W, H);
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(W * CELL, H * CELL), new THREE.MeshStandardMaterial({ map: floorT, color: th.floor, roughness: 1 }));
    floor.rotation.x = -Math.PI / 2; floor.position.set(W * CELL / 2, 0, H * CELL / 2); world.add(floor);

    const wallCells = [], pillarCells = [];
    hazardMat = new THREE.MeshBasicMaterial({ color: 0x66ff44, transparent: true, opacity: .6 });
    let hasStart = false;
    for (let z = 0; z < H; z++) for (let x = 0; x < W; x++) {
        const ch = grid[z][x], cx = (x + .5) * CELL, cz = (z + .5) * CELL;
        if (ch === "#") wallCells.push([cx, cz]);
        else if (ch === "T") pillarCells.push([cx, cz]);
        else if (ch === "~") {
            const p = new THREE.Mesh(new THREE.PlaneGeometry(CELL, CELL), hazardMat);
            p.rotation.x = -Math.PI / 2; p.position.set(cx, .03, cz); world.add(p);
            const gl = glow(0x66ff44, CELL * 1.6); gl.position.set(cx, .6, cz); world.add(gl);
            hazards.push({ x: cx, z: cz });
        } else if (ch === "P") { startPos = { x: cx, z: cz }; hasStart = true; grid[z][x] = "."; }
        else if (ch === "C") {
            const m = new THREE.Mesh(new THREE.OctahedronGeometry(.5), new THREE.MeshBasicMaterial({ color: 0x8fdfff }));
            m.scale.y = 1.7; const g = glow(0x3fb6e8, 3.2); g.scale.set(3.2, 1.9, 1); m.add(g);
            m.position.set(cx, 1.3, cz); world.add(m); crystals.push({ mesh: m, x: cx, z: cz, got: false }); grid[z][x] = ".";
        } else if (ch === "E" || ch === "S") {
            const shooter = ch === "S";
            const body = new THREE.Mesh(shooter ? new THREE.OctahedronGeometry(.8) : new THREE.IcosahedronGeometry(.75, 1),
                new THREE.MeshStandardMaterial({ color: shooter ? 0x1a0a2a : 0x2a0a10, emissive: shooter ? 0xaa44ff : 0xff2244, emissiveIntensity: .7, roughness: .5 }));
            body.add(glow(shooter ? 0xcc88ff : 0xff3355, 1.8));
            body.position.set(cx, 1.3, cz); world.add(body);
            enemies.push({ mesh: body, x: cx, z: cz, tx: cx, tz: cz, hp: shooter ? 3 : 4, shooter, stun: 0, hitCd: 0, shootCd: 1 + Math.random() * 2, flash: 0, seed: Math.random() * 9, active: false, dead: false });
            grid[z][x] = ".";
        } else if (ch === "H") {
            const m = new THREE.Mesh(new THREE.BoxGeometry(.5, .5, .5), new THREE.MeshBasicMaterial({ color: 0xff5577 }));
            m.add(glow(0xff3355, 2.2)); m.position.set(cx, .9, cz); world.add(m); pickups.push({ mesh: m, x: cx, z: cz, got: false }); grid[z][x] = ".";
        } else if (ch === "X") {
            const g = new THREE.Group();
            const ring = new THREE.Mesh(new THREE.TorusGeometry(1.5, .14, 12, 40), new THREE.MeshBasicMaterial({ color: 0xff3344 }));
            const disc = new THREE.Mesh(new THREE.CircleGeometry(1.45, 32), new THREE.MeshBasicMaterial({ color: 0xff3344, transparent: true, opacity: .3, side: THREE.DoubleSide }));
            const gl = glow(0xff3344, 6); g.add(ring, disc, gl); g.position.set(cx, 1.8, cz); world.add(g);
            portal = { g, ring, disc, gl, x: cx, z: cz, open: false }; grid[z][x] = ".";
        }
    }
    if (!hasStart) { startPos = { x: 1.5 * CELL, z: 1.5 * CELL }; console.warn("Map heeft geen 'P'"); }

    const dummy = new THREE.Object3D();
    if (wallCells.length) {
        const im = new THREE.InstancedMesh(new THREE.BoxGeometry(CELL, WALL_H, CELL), new THREE.MeshStandardMaterial({ map: brickTex, color: th.wall, roughness: .9 }), wallCells.length);
        wallCells.forEach(([x, z], k) => { dummy.position.set(x, WALL_H / 2, z); dummy.updateMatrix(); im.setMatrixAt(k, dummy.matrix); });
        world.add(im);
    }
    if (pillarCells.length) {
        const im = new THREE.InstancedMesh(new THREE.CylinderGeometry(1.5, 1.9, WALL_H, 7), new THREE.MeshStandardMaterial({ color: th.wall, roughness: 1, map: brickTex }), pillarCells.length);
        pillarCells.forEach(([x, z], k) => { dummy.position.set(x, WALL_H / 2, z); dummy.updateMatrix(); im.setMatrixAt(k, dummy.matrix); });
        world.add(im);
    }
}

function setPortalOpen(open) {
    if (!portal || portal.open === open) return;
    portal.open = open;
    const c = open ? LEVELS[lvl].theme.accent : "#ff3344";
    portal.ring.material.color.set(c); portal.disc.material.color.set(c); portal.gl.material.color.set(c);
    if (open) { msg("De portal is open!", 3000); beep(440, .6, "triangle", .1, 440); }
}

// ==========================================
// REMOTE SPELERS
// ==========================================
function nameSprite(name, color) {
    const c = document.createElement("canvas"); c.width = 256; c.height = 64;
    const x = c.getContext("2d");
    x.font = "bold 30px Orbitron, sans-serif"; x.textAlign = "center";
    x.shadowColor = "#000"; x.shadowBlur = 6;
    x.fillStyle = "#" + color.toString(16).padStart(6, "0");
    x.fillText(name.slice(0, 14), 128, 42);
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), transparent: true }));
    s.scale.set(2.4, .6, 1); s.position.y = 1.2; return s;
}
function makeRemoteMesh(r) {
    const col = SLOT_COLORS[r.slot % 4];
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.CylinderGeometry(.35, .4, 1.1, 10), new THREE.MeshStandardMaterial({ color: col, emissive: col, emissiveIntensity: .45 }));
    body.position.y = .55;
    const head = new THREE.Mesh(new THREE.SphereGeometry(.28, 12, 12), new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: col, emissiveIntensity: .5 }));
    head.position.y = 1.35;
    const nose = new THREE.Mesh(new THREE.BoxGeometry(.12, .12, .5), new THREE.MeshBasicMaterial({ color: col }));
    nose.position.set(.25, 1.1, -.35);
    const tag = nameSprite(r.name, col); tag.position.y = 2.2;
    g.add(body, head, nose, tag, glow(col, 2.5));
    world.add(g); return g;
}
function syncRemotes() {
    // maak/verwijder remotes op basis van room-spelers
    const ids = new Set();
    (net ? net.players : []).forEach((p, slot) => {
        if (p.uid === net.uid) return;
        ids.add(p.uid);
        let r = mp.remotes.get(p.uid);
        if (!r) { r = { uid: p.uid, name: p.name, slot, x: startPos.x, z: startPos.z, yaw: 0, tx: startPos.x, tz: startPos.z, tyaw: 0, hp: 100, alive: true, mesh: null }; mp.remotes.set(p.uid, r); }
        r.name = p.name; r.slot = slot;
        if (world && !r.mesh) r.mesh = makeRemoteMesh(r);
    });
    for (const [uid, r] of mp.remotes) if (!ids.has(uid)) { if (r.mesh && world) world.remove(r.mesh); mp.remotes.delete(uid); }
}

// ==========================================
// LEVEL STARTEN / EINDIGEN
// ==========================================
function setPause(on, title = "PAUZE", note = "") {
    paused = on; $("pause").hidden = !on;
    if (on) {
        $("pauseTitle").textContent = title;
        $("pauseNote").textContent = note || (mp.on ? "In co-op staat het spel niet stil." : "");
        $("resumeBtn").textContent = title === "PAUZE" ? "VERDER SPELEN" : "SPELEN";
    }
}

function engage() {
    noLock = false;
    try { const r = canvas.requestPointerLock(); if (r && r.catch) r.catch(() => { noLock = true; }); } catch { noLock = true; }
    setTimeout(() => { if (running && !locked) noLock = true; }, 500);
}

function startLevel(i, needClick = false) {
    buildLevel(i);
    Object.assign(player, { x: startPos.x, z: startPos.z, hp: 100, energy: 100, vx: 0, vz: 0, yaw: 0, pitch: 0, coins: 0 });
    levelTime = 0; swCd = 0; nextShot = 0; flowT = 0; snapT = 0; spectating = false; ended = false; noLock = false;
    mp.remotes.forEach(r => { r.alive = true; r.hp = 100; r.x = r.tx = startPos.x; r.z = r.tz = startPos.z; });
    if (mp.on) syncRemotes();
    $("menu").hidden = true; $("end").hidden = true; $("hud").hidden = false;
    $("matesPanel").hidden = !mp.on;
    $("lvlTxt").textContent = `${i + 1} — ${LEVELS[i].name}`;
    running = true; lastT = performance.now();
    msg(LEVELS[i].hint, 4500);
    if (needClick) setPause(true, "KLAAR? KLIK OM TE SPELEN", "De host heeft het level gestart.");
    else { setPause(false); engage(); }
}

function finishLevel(win, secsOverride) {
    if (ended) return;
    ended = true; running = false; spectating = false;
    if (document.pointerLockElement) document.exitPointerLock();
    setPause(false);
    const secs = secsOverride ?? levelTime;
    const par = LEVELS[lvl].par;
    const stars = win ? (secs <= par[0] ? 3 : secs <= par[1] ? 2 : 1) : 0;
    const earned = win ? player.coins : Math.floor(player.coins / 2);
    recordResult(lvl + 1, win, stars, secs, earned).then(() => renderLevels());

    $("hud").hidden = true; $("end").hidden = false;
    const last = lvl === LEVELS.length - 1;
    $("endTitle").textContent = win ? (last ? "MEMORIES RESTORED" : "LEVEL VOLTOOID") : "JE BENT VERLOREN";
    $("endText").textContent = win
        ? `${"★".repeat(stars)}${"☆".repeat(3 - stars)} — tijd ${fmt(secs)} — +${earned} coins`
        : `De jagers hebben je gevonden. +${earned} coins`;

    const main = $("endMain");
    if (mp.on && !net.isHost) {
        main.hidden = true; $("endText").textContent += " — wachten op de host…";
    } else {
        main.hidden = false;
        const next = win ? (last ? 0 : lvl + 1) : lvl;
        main.textContent = win ? (last ? "OPNIEUW SPELEN" : "VOLGEND LEVEL") : "OPNIEUW PROBEREN";
        main.onclick = () => {
            if (mp.on) { net.setStarted(true); net.send({ t: "start", lvl: next }); }
            startLevel(next);
        };
    }
    if (mp.on && net.isHost) net.setStarted(false);
}

function hostEnd(win) {                      // solo of multiplayer-host
    if (ended) return;
    if (mp.on) net.send({ t: "end", win, secs: levelTime });
    finishLevel(win, levelTime);
}

// ==========================================
// INPUT
// ==========================================
addEventListener("keydown", e => {
    keys[e.code] = true;
    if (e.code === "KeyQ" && running && !paused && !spectating && (locked || noLock)) shockwave();
    if (e.code === "Escape" && noLock && running && !ended) setPause(!paused);
    if (["Space", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.code) && running) e.preventDefault();
});
addEventListener("keyup", e => { keys[e.code] = false; });
addEventListener("mousedown", e => { if (e.button === 0) mouseDown = true; if (e.button === 2) rmb = true; });
addEventListener("mouseup", e => { if (e.button === 0) mouseDown = false; if (e.button === 2) rmb = false; });
addEventListener("blur", () => { mouseDown = false; rmb = false; for (const k in keys) keys[k] = false; });
addEventListener("contextmenu", e => { if (running) e.preventDefault(); });
addEventListener("mousemove", e => {
    if (!running || paused || spectating || !(locked || (noLock && rmb))) return;
    player.yaw -= e.movementX * .0022;
    player.pitch = Math.max(-1.45, Math.min(1.45, player.pitch - e.movementY * .0022));
});
document.addEventListener("pointerlockchange", () => {
    locked = document.pointerLockElement === canvas;
    if (locked) { noLock = false; if (running) setPause(false); }
    else if (running && !ended && !paused) setPause(true);
});
document.addEventListener("pointerlockerror", () => {
    if (running) { noLock = true; msg("Muis-lock niet beschikbaar: kijk met pijltjes of rechtermuisknop slepen", 5000); }
});
$("resumeBtn").onclick = () => { setPause(false); engage(); };
$("quitBtn").onclick = () => { goMenu(); };
$("endMenu").onclick = () => { goMenu(); };

function goMenu() {
    running = false; ended = false; setPause(false);
    if (document.pointerLockElement) document.exitPointerLock();
    $("hud").hidden = true; $("end").hidden = true; $("menu").hidden = false;
    if (mp.on && net) { net.leaveRoom(); mp.on = false; mp.remotes.clear(); }
    renderLevels(); updateMpUi();
}

// ==========================================
// SCHIETEN & SHOCKWAVE
// ==========================================
function aimDir() {
    const cp = Math.cos(player.pitch);
    return new THREE.Vector3(-Math.sin(player.yaw) * cp, Math.sin(player.pitch), -Math.cos(player.yaw) * cp);
}
function wallDist(ox, oy, oz, d, max) {
    for (let t = .2; t < max; t += .15) {
        const y = oy + d.y * t; if (y < 0 || y > WALL_H) return t;
        if (solidAt(Math.floor((ox + d.x * t) / CELL), Math.floor((oz + d.z * t) / CELL))) return t;
    }
    return max;
}
function addTracer(a, b, color = 0x8fdfff) {
    const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints([a, b]), new THREE.LineBasicMaterial({ color, transparent: true, opacity: .9 }));
    world.add(line); tracers.push({ line, life: .08 });
}
function addRing(x, z, color, max, life) {
    const m = new THREE.Mesh(new THREE.RingGeometry(.9, 1, 40), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: .8, side: THREE.DoubleSide }));
    m.rotation.x = -Math.PI / 2; m.position.set(x, .1, z); world.add(m); rings.push({ m, max, life, t: 0 });
}

function shoot(now) {
    if (now < nextShot) return; nextShot = now + 140;
    const d = aimDir(); d.x += (Math.random() - .5) * .012; d.y += (Math.random() - .5) * .012; d.normalize();
    const ox = player.x, oy = EYE, oz = player.z;
    let best = wallDist(ox, oy, oz, d, 80), target = null;
    enemies.forEach(e => {
        if (e.dead || e.hp <= 0) return;
        const vx = e.x - ox, vy = 1.3 - oy, vz = e.z - oz, t = vx * d.x + vy * d.y + vz * d.z;
        if (t < 0 || t > best) return;
        const px = ox + d.x * t - e.x, py = oy + d.y * t - 1.3, pz = oz + d.z * t - e.z;
        if (px * px + py * py + pz * pz < .85 * .85) { best = t; target = e; }
    });
    const a = new THREE.Vector3(ox, oy - .25, oz).addScaledVector(new THREE.Vector3(-Math.cos(player.yaw), 0, Math.sin(player.yaw)), .3);
    const b = new THREE.Vector3(ox, oy, oz).addScaledVector(d, best);
    addTracer(a, b);
    if (mp.on) net.send({ t: "shot", o: [a.x, a.y, a.z], e: [b.x, b.y, b.z] });
    flash.visible = true; setTimeout(() => { flash.visible = false; }, 45); kick = 1;
    beep(520, .09, "square", .05, -380);
    if (target) {
        const c = $("cross"); c.classList.add("hit"); setTimeout(() => c.classList.remove("hit"), 90); beep(900, .05, "triangle", .05);
        if (isGuest()) net.send({ t: "hit", id: enemies.indexOf(target) }, net.host);
        else applyHit(target, myId());
    }
}

function applyHit(e, by) {           // alleen solo/host
    if (!e || e.dead) return;
    e.hp -= 1; e.flash = .1; e.active = true; if (e.stun < .15) e.stun = .15;
    if (e.hp <= 0) killEnemy(e, by);
}
function removeEnemyVisual(e) {
    if (e.dead && !e.mesh.parent) return;
    e.dead = true; e.hp = Math.min(e.hp, 0);
    if (e.mesh.parent) { world.remove(e.mesh); e.mesh.geometry.dispose(); }
    addRing(e.x, e.z, 0xff4466, 4, .4); beep(180, .3, "sawtooth", .07, -120);
}
function killEnemy(e, by) {
    if (e.dead) return;
    removeEnemyVisual(e);
    const v = e.shooter ? 15 : 10;
    if (by === myId()) player.coins += v;
    else if (mp.on && by) net.send({ t: "coin", v }, by);
}

function shockwave() {
    if (swCd > 0) return; swCd = LEVELS[lvl].cooldown;
    addRing(player.x, player.z, 0x8fdfff, 16, .55); beep(120, .5, "sawtooth", .1, 300);
    if (mp.on) net.send({ t: "sw", x: player.x, z: player.z });
    if (isAuthority()) applyShockwave(player.x, player.z, myId());
}
function applyShockwave(px, pz, by) {   // alleen solo/host
    for (const e of enemies) {
        if (e.dead || e.hp <= 0) continue;
        const dx = e.x - px, dz = e.z - pz, d = Math.hypot(dx, dz);
        if (d < 16) {
            e.stun = 2; e.active = true; e.flash = .2;
            const k = (16 - d) * .45 / (d || 1);
            if (!blocked(e.x + dx * k, e.z, .6)) e.x += dx * k;
            if (!blocked(e.x, e.z + dz * k, .6)) e.z += dz * k;
            e.hp -= 1; if (e.hp <= 0) killEnemy(e, by);
        }
    }
}

function hurt(n) {
    if (ended || spectating || paused && !mp.on) return;
    player.hp -= n; beep(110, .2, "sawtooth", .1, -50);
    const v = $("vig"); v.classList.add("dmg"); setTimeout(() => v.classList.remove("dmg"), 180);
    if (player.hp <= 0) {
        player.hp = 0;
        if (mp.on) { spectating = true; msg("Je bent neergehaald! Je kijkt mee met je team…", 6000); }
        else finishLevel(false);
    }
}

// ==========================================
// VIJANDEN (solo/host)
// ==========================================
function targets() {
    const a = [];
    if (!spectating && player.hp > 0) a.push({ uid: myId(), x: player.x, z: player.z, self: true });
    for (const r of mp.remotes.values()) if (r.alive) a.push({ uid: r.uid, x: r.x, z: r.z, self: false });
    return a;
}
function bfs(sx, sz) {
    const dist = new Int16Array(W * H).fill(-1);
    if (solidAt(sx, sz)) return dist;
    const q = [[sx, sz]]; dist[sz * W + sx] = 0;
    for (let h = 0; h < q.length; h++) {
        const [x, z] = q[h], d = dist[z * W + x];
        for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
            const nx = x + dx, nz = z + dz;
            if (solidAt(nx, nz) || dist[nz * W + nx] >= 0) continue;
            dist[nz * W + nx] = d + 1; q.push([nx, nz]);
        }
    }
    return dist;
}
const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
function stepEnemy(e, dx, dz, sp, dt) {
    const l = Math.hypot(dx, dz) || 1, mx = dx / l * sp * dt, mz = dz / l * sp * dt;
    if (!blocked(e.x + mx, e.z, .6)) e.x += mx;
    if (!blocked(e.x, e.z + mz, .6)) e.z += mz;
}
function damageTarget(t, n) { if (t.self) hurt(n); else net.send({ t: "dmg", n }, t.uid); }

function updateEnemies(dt, t, tg) {
    const base = 3.4 * LEVELS[lvl].enemySpeed;
    for (const e of enemies) {
        if (e.dead || e.hp <= 0) continue;
        e.hitCd -= dt; e.flash -= dt; e.stun -= dt;
        e.mesh.material.emissiveIntensity = e.flash > 0 ? 2.5 : .7;
        e.mesh.rotation.y += dt * 1.5; e.mesh.position.y = 1.3 + Math.sin(t * 2 + e.seed) * .15;

        let tgt = null, pd = Infinity;
        for (const c of tg) { const d = Math.hypot(c.x - e.x, c.z - e.z); if (d < pd) { pd = d; tgt = c; } }
        if (!tgt) { e.mesh.position.x = e.x; e.mesh.position.z = e.z; continue; }
        if (pd < 30 && los(e.x, e.z, tgt.x, tgt.z)) e.active = true;
        if (!e.active || e.stun > 0) { e.mesh.position.x = e.x; e.mesh.position.z = e.z; continue; }

        let tx = tgt.x, tz = tgt.z;
        const dist = flows.get(tgt.uid), cx = Math.floor(e.x / CELL), cz = Math.floor(e.z / CELL);
        const d = dist ? dist[cz * W + cx] : -1;
        if (d > 1) {
            let best = d, bx = cx, bz = cz;
            for (const [dx, dz] of DIRS) {
                const nx = cx + dx, nz = cz + dz; if (solidAt(nx, nz)) continue;
                if (dx && dz && (solidAt(cx + dx, cz) || solidAt(cx, cz + dz))) continue;
                const nd = dist[nz * W + nx]; if (nd >= 0 && nd < best) { best = nd; bx = nx; bz = nz; }
            }
            tx = (bx + .5) * CELL; tz = (bz + .5) * CELL;
        }
        if (e.shooter) {
            const seen = los(e.x, e.z, tgt.x, tgt.z);
            if (seen && pd < 10) stepEnemy(e, e.x - tgt.x, e.z - tgt.z, base * .9, dt);
            else if (!seen || pd > 15) stepEnemy(e, tx - e.x, tz - e.z, base * .8, dt);
            e.shootCd -= dt;
            if (seen && pd < 30 && e.shootCd <= 0) {
                e.shootCd = 2.2;
                const m = new THREE.Mesh(new THREE.SphereGeometry(.22, 8, 8), new THREE.MeshBasicMaterial({ color: 0xcc66ff })); m.add(glow(0xcc66ff, 1.6));
                const dir = new THREE.Vector3(tgt.x - e.x, EYE - 1.5, tgt.z - e.z).normalize();
                m.position.set(e.x, 1.3, e.z); world.add(m); bullets.push({ m, v: dir.multiplyScalar(13), life: 4 });
                beep(300, .15, "sine", .05, 200);
            }
        } else {
            stepEnemy(e, tx - e.x, tz - e.z, base, dt);
            if (pd < 1.5 && e.hitCd <= 0) { e.hitCd = .9; damageTarget(tgt, 12); }
        }
        e.mesh.position.x = e.x; e.mesh.position.z = e.z;
    }
    for (let i = 0; i < enemies.length; i++) for (let j = i + 1; j < enemies.length; j++) {
        const a = enemies[i], b = enemies[j]; if (a.dead || b.dead) continue;
        const dx = b.x - a.x, dz = b.z - a.z, d = Math.hypot(dx, dz);
        if (d < 1.3 && d > 0) {
            const p = (1.3 - d) / 2 / d;
            if (!blocked(a.x - dx * p, a.z - dz * p, .6)) { a.x -= dx * p; a.z -= dz * p; }
            if (!blocked(b.x + dx * p, b.z + dz * p, .6)) { b.x += dx * p; b.z += dz * p; }
        }
    }
    for (let i = bullets.length - 1; i >= 0; i--) {
        const b = bullets[i]; b.m.position.addScaledVector(b.v, dt); b.life -= dt;
        const p = b.m.position; let gone = b.life <= 0 || p.y < 0 || p.y > WALL_H || solidAt(Math.floor(p.x / CELL), Math.floor(p.z / CELL));
        if (!gone) for (const c of tg) if (Math.hypot(p.x - c.x, p.z - c.z) < .8 && Math.abs(p.y - EYE) < 1) { damageTarget(c, 10); gone = true; break; }
        if (gone) { world.remove(b.m); bullets.splice(i, 1); }
    }
}

// ==========================================
// PICKUPS
// ==========================================
function crystalsLeft() { return crystals.filter(c => !c.got).length; }
function collectCrystal(i) {
    const c = crystals[i]; if (!c || c.got) return;
    c.got = true; c.mesh.visible = false; beep(880, .25, "sine", .08, 500); addRing(c.x, c.z, 0x8fdfff, 3, .5);
    msg(`Herinnering gevonden! (${crystals.length - crystalsLeft()}/${crystals.length})`);
}
function collectPickup(i) { const p = pickups[i]; if (!p || p.got) return; p.got = true; p.mesh.visible = false; }

// ==========================================
// MULTIPLAYER
// ==========================================
function onRelay(from, d) {
    if (!d || typeof d !== "object") return;
    switch (d.t) {
        case "start": if (!net.isHost) startLevel(Number(d.lvl) || 0, true); break;
        case "ps": {
            const r = mp.remotes.get(from); if (!r) return;
            r.tx = d.x; r.tz = d.z; r.tyaw = d.y; r.hp = d.hp; r.alive = !!d.al;
            break;
        }
        case "shot": if (world && running) addTracer(new THREE.Vector3(...d.o), new THREE.Vector3(...d.e), 0xffcc66); break;
        case "sw": if (world && running) { addRing(d.x, d.z, 0x8fdfff, 16, .55); if (isAuthority()) applyShockwave(d.x, d.z, from); } break;
        case "hit": if (isAuthority() && running) applyHit(enemies[d.id], from); break;
        case "pick":
            if (!isAuthority()) break;
            if (d.k === "c") collectCrystal(d.i); else collectPickup(d.i);
            break;
        case "portal": if (isAuthority() && running && portal && portal.open) hostEnd(true); break;
        case "dmg": hurt(Number(d.n) || 10); break;
        case "coin": player.coins += Number(d.v) || 0; break;
        case "es": if (isGuest() && running) applySnapshot(d); break;
        case "end": if (isGuest()) finishLevel(!!d.win, d.secs); break;
    }
}

function applySnapshot(d) {
    d.e.forEach((a, i) => {
        const e = enemies[i]; if (!e || e.dead) return;
        if (a[2] < e.hp) e.flash = .1;
        e.hp = a[2]; e.tx = a[0]; e.tz = a[1]; e.stun = a[3] ? 1 : 0; e.active = true;
        if (e.hp <= 0) removeEnemyVisual(e);
    });
    for (let i = 0; i < d.c.length; i++) if (d.c[i] === "1") collectCrystal(i);
    for (let i = 0; i < d.h.length; i++) if (d.h[i] === "1") collectPickup(i);
    setPortalOpen(!!d.o);
    while (remoteBullets.length < d.b.length) {
        const m = new THREE.Mesh(new THREE.SphereGeometry(.22, 8, 8), new THREE.MeshBasicMaterial({ color: 0xcc66ff })); m.add(glow(0xcc66ff, 1.6));
        world.add(m); remoteBullets.push(m);
    }
    remoteBullets.forEach((m, i) => { const b = d.b[i]; m.visible = !!b; if (b) m.position.set(b[0], b[1], b[2]); });
}

function sendSnapshot() {
    net.send({
        t: "es",
        e: enemies.map(e => [+e.x.toFixed(2), +e.z.toFixed(2), e.hp, e.stun > 0 ? 1 : 0]),
        c: crystals.map(c => c.got ? "1" : "0").join(""),
        h: pickups.map(p => p.got ? "1" : "0").join(""),
        b: bullets.map(b => [+b.m.position.x.toFixed(2), +b.m.position.y.toFixed(2), +b.m.position.z.toFixed(2)]),
        o: portal && portal.open ? 1 : 0
    });
}

async function ensureNet() {
    if (net && net.ready) return;
    if (!user) throw new Error("Log eerst in met Google.");
    net = new Net({
        onRoom: room => {
            const wasOn = mp.on; mp.on = true;
            if (running && wasOn) syncRemotes();
            updateMpUi();
        },
        onRelay,
        onRoomClosed: reason => { mp.on = false; mp.remotes.clear(); $("mpStatus").textContent = reason; if (running || ended || !$("end").hidden) goMenu(); updateMpUi(); },
        onClose: () => { mp.on = false; mp.remotes.clear(); $("mpStatus").textContent = "Verbinding met server verbroken."; if (running) goMenu(); updateMpUi(); },
        onError: m => { $("mpStatus").textContent = m; }
    });
    await net.connect(await user.getIdToken());
}
function leaveMultiplayer() {
    if (net) { net.leaveRoom(); net.close(); }
    mp.on = false; mp.remotes.clear(); net = null;
}

$("mpCreate").onclick = async () => {
    $("mpStatus").textContent = "Verbinden…";
    try { await ensureNet(); net.createRoom(); $("mpStatus").textContent = ""; } catch (e) { $("mpStatus").textContent = e.message; }
};
$("mpJoin").onclick = async () => {
    const code = $("mpCode").value.trim();
    if (code.length < 6) { $("mpStatus").textContent = "Vul een room-code van 6 tekens in."; return; }
    $("mpStatus").textContent = "Verbinden…";
    try { await ensureNet(); net.joinRoom(code); $("mpStatus").textContent = ""; } catch (e) { $("mpStatus").textContent = e.message; }
};
$("mpLeave").onclick = () => { leaveMultiplayer(); updateMpUi(); renderLevels(); };
$("mpStart").onclick = () => {
    const i = Number($("mpLevel").value) || 0;
    net.setStarted(true); net.send({ t: "start", lvl: i }); startLevel(i);
};

function updateMpUi() {
    const inRoom = !!(net && net.inRoom);
    $("mpOffline").hidden = inRoom; $("mpLobby").hidden = !inRoom;
    $("mpCreate").disabled = $("mpJoin").disabled = !user;
    if (!user && !inRoom) $("mpStatus").textContent = "Log in met Google om multiplayer te spelen.";
    if (!inRoom) return;
    $("mpRoomCode").textContent = net.room.code;
    const box = $("mpPlayers"); box.innerHTML = "";
    net.players.forEach(p => {
        const s = document.createElement("span"); s.className = "mp-player" + (p.uid === net.host ? " host" : "");
        s.textContent = (p.uid === net.host ? "★ " : "") + p.name + (p.uid === net.uid ? " (jij)" : "");
        box.appendChild(s);
    });
    $("mpHostControls").hidden = !net.isHost; $("mpWait").hidden = net.isHost;
    const sel = $("mpLevel"), prev = sel.value; sel.innerHTML = "";
    LEVELS.forEach((L, i) => { if (i + 1 <= progress.unlocked) { const o = document.createElement("option"); o.value = i; o.textContent = `Level ${i + 1} — ${L.name}`; sel.appendChild(o); } });
    if (prev) sel.value = prev;
    renderLevels();
}

// ==========================================
// MENU
// ==========================================
function renderLevels() {
    const box = $("levels"); box.innerHTML = "";
    const inRoom = !!(net && net.inRoom);
    LEVELS.forEach((L, i) => {
        const b = document.createElement("button"); b.className = "btn";
        const s = (progress.levels[String(i + 1)] || {}).bestStars || 0;
        b.textContent = i + 1 > progress.unlocked ? `LEVEL ${i + 1} 🔒` : `LEVEL ${i + 1} ${"★".repeat(s)}${"☆".repeat(3 - s)}`;
        b.title = L.name; b.disabled = i + 1 > progress.unlocked || inRoom;
        b.onclick = () => startLevel(i);
        box.appendChild(b);
    });
}

// ==========================================
// MINIMAP & HUD
// ==========================================
const mctx = $("mini").getContext("2d");
function drawMini() {
    const s = Math.min(190 / W, 190 / H), ox = (190 - W * s) / 2, oy = (190 - H * s) / 2;
    mctx.clearRect(0, 0, 190, 190);
    for (let z = 0; z < H; z++) for (let x = 0; x < W; x++) {
        const ch = grid[z][x]; if (ch === ".") continue;
        mctx.fillStyle = ch === "~" ? "rgba(100,255,70,.5)" : ch === "T" ? "#3d7a55" : "#4c6b85"; mctx.fillRect(ox + x * s, oy + z * s, s, s);
    }
    const P = (x, z) => [ox + x / CELL * s, oy + z / CELL * s];
    for (const c of crystals) if (!c.got) { const [a, b] = P(c.x, c.z); mctx.fillStyle = "#8fdfff"; mctx.fillRect(a - 2, b - 2, 4, 4); }
    if (portal) { const [a, b] = P(portal.x, portal.z); mctx.fillStyle = portal.open ? "#8fffb0" : "#ff4455"; mctx.beginPath(); mctx.arc(a, b, 3.5, 0, 7); mctx.fill(); }
    for (const e of enemies) if (!e.dead && e.hp > 0 && Math.hypot(e.x - player.x, e.z - player.z) < 28) { const [a, b] = P(e.x, e.z); mctx.fillStyle = "#ff3355"; mctx.beginPath(); mctx.arc(a, b, 2.5, 0, 7); mctx.fill(); }
    for (const r of mp.remotes.values()) if (r.alive) { const [a, b] = P(r.x, r.z); mctx.fillStyle = "#" + SLOT_COLORS[r.slot % 4].toString(16).padStart(6, "0"); mctx.beginPath(); mctx.arc(a, b, 3, 0, 7); mctx.fill(); }
    const [px, pz] = P(player.x, player.z); mctx.save(); mctx.translate(px, pz); mctx.rotate(-player.yaw);
    mctx.fillStyle = "#fff"; mctx.beginPath(); mctx.moveTo(0, -6); mctx.lineTo(4, 4); mctx.lineTo(-4, 4); mctx.closePath(); mctx.fill(); mctx.restore();
}
function updateMates() {
    const box = $("mates"); box.innerHTML = "";
    for (const r of mp.remotes.values()) {
        const row = document.createElement("div"); row.className = "mate";
        row.textContent = r.name + (r.alive ? "" : " ✖");
        const bar = document.createElement("div"); bar.className = "bar";
        const f = document.createElement("div"); f.className = "fill"; f.style.width = Math.max(0, r.hp) + "%";
        f.style.background = "#" + SLOT_COLORS[r.slot % 4].toString(16).padStart(6, "0");
        bar.appendChild(f); row.appendChild(bar); box.appendChild(row);
    }
}

// ==========================================
// HOOFDLUS
// ==========================================
function frame(now) {
    requestAnimationFrame(frame);
    if (!running) return;
    const dt = Math.min(.05, (now - lastT) / 1000); lastT = now; const t = now / 1000;
    const simOn = mp.on || !paused;                       // in co-op staat de wereld nooit stil
    const ctrl = !paused && (locked || noLock) && !spectating && !ended;

    if (simOn) levelTime += dt;

    // ---- speler ----
    if (ctrl) {
        if (noLock) {
            const tl = (keys.ArrowLeft ? 1 : 0) - (keys.ArrowRight ? 1 : 0), tp = (keys.ArrowUp ? 1 : 0) - (keys.ArrowDown ? 1 : 0);
            player.yaw += tl * 2.2 * dt; player.pitch = Math.max(-1.45, Math.min(1.45, player.pitch + tp * 1.6 * dt));
        }
        const up = !noLock && keys.ArrowUp, dn = !noLock && keys.ArrowDown, rt = !noLock && keys.ArrowRight, lf = !noLock && keys.ArrowLeft;
        const fw = (keys.KeyW || up ? 1 : 0) - (keys.KeyS || dn ? 1 : 0), st = (keys.KeyD || rt ? 1 : 0) - (keys.KeyA || lf ? 1 : 0);
        const moving = fw || st, canSprint = (keys.ShiftLeft || keys.ShiftRight) && moving && player.energy > 2;
        const sp = canSprint ? 11 : 6.8;
        player.energy = Math.max(0, Math.min(100, player.energy + (canSprint ? -28 : 16) * dt));
        let ix = -Math.sin(player.yaw) * fw + Math.cos(player.yaw) * st, iz = -Math.cos(player.yaw) * fw - Math.sin(player.yaw) * st;
        const l = Math.hypot(ix, iz) || 1; ix = ix / l * (moving ? sp : 0); iz = iz / l * (moving ? sp : 0);
        player.vx += (ix - player.vx) * Math.min(1, dt * 14); player.vz += (iz - player.vz) * Math.min(1, dt * 14);
        const nx = player.x + player.vx * dt, nz = player.z + player.vz * dt;
        if (!blocked(nx, player.z, PR)) player.x = nx;
        if (!blocked(player.x, nz, PR)) player.z = nz;
        player.bob += Math.hypot(player.vx, player.vz) * dt * 1.5;

        if (mouseDown) shoot(now);
        swCd = Math.max(0, swCd - dt);

        for (const h of hazards) if (Math.abs(player.x - h.x) < CELL / 2 + .1 && Math.abs(player.z - h.z) < CELL / 2 + .1) {
            player.hp -= 14 * dt; if (player.hp <= 0) { player.hp = 0; if (mp.on) { spectating = true; msg("Je bent neergehaald!", 5000); } else finishLevel(false); }
        }
        crystals.forEach((c, i) => {
            if (!c.got && Math.hypot(c.x - player.x, c.z - player.z) < 1.6) { collectCrystal(i); if (isGuest()) net.send({ t: "pick", k: "c", i }); }
        });
        pickups.forEach((p, i) => {
            if (!p.got && player.hp < 100 && Math.hypot(p.x - player.x, p.z - player.z) < 1.5) {
                collectPickup(i); player.hp = Math.min(100, player.hp + 35); beep(600, .2, "sine", .08, 300); msg("+35 health");
                if (isGuest()) net.send({ t: "pick", k: "h", i });
            }
        });
        if (portal && Math.hypot(portal.x - player.x, portal.z - player.z) < 1.8) {
            if (portal.open) { if (isGuest()) { if (now - portalWarn > 1000) { portalWarn = now; net.send({ t: "portal" }, net.host); } } else hostEnd(true); }
            else if (now - portalWarn > 2500) { portalWarn = now; msg("Verzamel eerst alle herinneringen!"); }
        }
    }
    if (swCd > 0 && !ctrl) swCd = Math.max(0, swCd - dt);

    // ---- wereld (solo/host) ----
    if (simOn && isAuthority()) {
        const tg = targets();
        flowT -= dt; if (flowT <= 0) { flows = new Map(); tg.forEach(c => flows.set(c.uid, bfs(Math.floor(c.x / CELL), Math.floor(c.z / CELL)))); flowT = .25; }
        updateEnemies(dt, t, tg);
        if (hazardMat) hazardMat.opacity = .45 + Math.sin(t * 3) * .15;
        if (portal && !portal.open && crystalsLeft() === 0) setPortalOpen(true);
        if (mp.on) {
            snapT -= dt; if (snapT <= 0) { snapT = .1; sendSnapshot(); }
            if (tg.length === 0 && !ended) hostEnd(false);
        }
    } else if (isGuest()) {
        for (const e of enemies) {
            if (e.dead) continue;
            e.x += (e.tx - e.x) * Math.min(1, dt * 12); e.z += (e.tz - e.z) * Math.min(1, dt * 12);
            e.flash -= dt; e.mesh.material.emissiveIntensity = e.flash > 0 ? 2.5 : .7;
            e.mesh.rotation.y += dt * 1.5; e.mesh.position.set(e.x, 1.3 + Math.sin(t * 2 + e.seed) * .15, e.z);
        }
        if (hazardMat) hazardMat.opacity = .45 + Math.sin(t * 3) * .15;
    }

    // ---- netwerk ----
    if (mp.on && net) {
        psT -= dt;
        if (psT <= 0) { psT = .066; net.send({ t: "ps", x: +player.x.toFixed(2), z: +player.z.toFixed(2), y: +player.yaw.toFixed(2), hp: Math.round(player.hp), al: spectating ? 0 : 1 }); }
        for (const r of mp.remotes.values()) {
            r.x += (r.tx - r.x) * Math.min(1, dt * 12); r.z += (r.tz - r.z) * Math.min(1, dt * 12);
            r.yaw += (r.tyaw - r.yaw) * Math.min(1, dt * 12);
            if (r.mesh) { r.mesh.visible = r.alive; r.mesh.position.set(r.x, 0, r.z); r.mesh.rotation.y = r.yaw; }
        }
    }

    // ---- HUD ----
    const left = crystalsLeft();
    $("hpFill").style.width = Math.max(0, player.hp) + "%"; $("enFill").style.width = player.energy + "%";
    $("memTxt").textContent = `${crystals.length - left} / ${crystals.length}`;
    $("coinTxt").textContent = `🪙 ${player.coins}`;
    $("swTxt").textContent = swCd > 0 ? swCd.toFixed(1) + "s" : "READY";
    $("timeTxt").textContent = fmt(levelTime);
    hudT -= dt; if (hudT <= 0) { hudT = .25; if (mp.on) updateMates(); }
    drawMini();

    // ---- animaties ----
    crystals.forEach(c => { c.mesh.rotation.y = t * 1.5; c.mesh.position.y = 1.3 + Math.sin(t * 2 + c.x) * .15; });
    pickups.forEach(p => { p.mesh.rotation.y = t * 2; p.mesh.rotation.x = t; });
    if (portal) { portal.ring.rotation.z = t * 1.2; portal.gl.material.opacity = .7 + Math.sin(t * 4) * .3; }
    for (let i = rings.length - 1; i >= 0; i--) { const r = rings[i]; r.t += dt; const k = r.t / r.life; r.m.scale.setScalar(1 + k * r.max); r.m.material.opacity = .8 * (1 - k); if (k >= 1) { world.remove(r.m); r.m.geometry.dispose(); rings.splice(i, 1); } }
    for (let i = tracers.length - 1; i >= 0; i--) { const r = tracers[i]; r.life -= dt; r.line.material.opacity = Math.max(0, r.life / .08); if (r.life <= 0) { world.remove(r.line); r.line.geometry.dispose(); tracers.splice(i, 1); } }
    kick = Math.max(0, kick - dt * 9);

    // ---- camera (bij spectaten: meekijken met een teamgenoot) ----
    let cx = player.x, cz = player.z, cyaw = player.yaw, cpitch = player.pitch;
    if (spectating) { const r = [...mp.remotes.values()].find(r => r.alive); if (r) { cx = r.x; cz = r.z; cyaw = r.yaw; cpitch = 0; } }
    gun.visible = !spectating;
    gun.position.set(.27 + Math.sin(player.bob) * .012, -.25 + Math.abs(Math.cos(player.bob)) * .012, -.55 + kick * .06);
    camera.position.set(cx, EYE + Math.sin(player.bob * 2) * .04, cz);
    camera.rotation.set(cpitch + kick * .012, cyaw, 0);
    plight.intensity = 1.7 + kick * 1.2;
    if (performance.now() > msgT) $("msg").classList.remove("show");
    renderer.render(scene, camera);
}

loadLocal();
renderLevels();
updateMpUi();
requestAnimationFrame(t => { lastT = t; frame(t); });
