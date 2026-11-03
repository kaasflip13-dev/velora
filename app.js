
"use strict";

// ==========================================
// STREETDRIVE — OPEN CITY
// ==========================================

const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");
const mapCanvas = document.getElementById("map");
const mapCtx = mapCanvas.getContext("2d");

const $ = id => document.getElementById(id);

let W = innerWidth;
let H = innerHeight;

function resize() {
  W = canvas.width = innerWidth;
  H = canvas.height = innerHeight;
}
resize();
addEventListener("resize", resize);

// ==========================================
// GAME STATE
// ==========================================

let state = "menu";
let lastTime = 0;
let camera = {x:0,y:0};

let money = 0;
let totalDistance = 0;
let missionDistance = 0;
let missionNumber = 1;
let missionReward = 150;
let toastTimer = null;

const player = {
  x:0,
  y:0,
  angle:0,
  speed:0,
  maxSpeed:8,
  acceleration:0.16,
  turn:0.042,
  color:"#36a9e8",
  width:32,
  height:58,
  car:"CITY STARTER"
};

const ownedCars = ["starter"];
let selectedCar = "starter";

const carModels = [
  {
    id:"starter",
    name:"City Starter",
    price:0,
    speed:8,
    acceleration:0.16,
    color:"#36a9e8",
    icon:"🚙"
  },
  {
    id:"sport",
    name:"Street Sport",
    price:500,
    speed:12,
    acceleration:0.22,
    color:"#e64e42",
    icon:"🏎️"
  },
  {
    id:"classic",
    name:"Classic GT",
    price:1200,
    speed:10,
    acceleration:0.19,
    color:"#e8bd56",
    icon:"🚗"
  },
  {
    id:"super",
    name:"Super Racer",
    price:3500,
    speed:16,
    acceleration:0.28,
    color:"#a37af1",
    icon:"🏎️"
  }
];

let traffic = [];
let particles = [];
let trafficLights = [];

// ==========================================
// WORLD
// ==========================================

const BLOCK = 600;
const ROAD = 150;
const HALF_ROAD = ROAD / 2;

const world = {
  buildings:[],
  trees:[],
  parks:[],
  lamps:[]
};

function seededRandom(a,b) {
  let n = Math.sin(a*127.1+b*311.7)*43758.5453;
  return n-Math.floor(n);
}

function makeBlock(bx,by) {
  const key = bx+"_"+by;

  if(world.buildings.some(b=>b.key===key)) return;

  const random = (n)=>seededRandom(bx*20+n,by*30+n);
  const x = bx*BLOCK;
  const y = by*BLOCK;

  if(random(1)<0.17) {
    world.parks.push({
      key,x:x+ROAD/2,y:y+ROAD/2,
      width:BLOCK-ROAD,height:BLOCK-ROAD
    });

    for(let i=0;i<12;i++){
      world.trees.push({
        x:x+ROAD+random(i+2)*(BLOCK-ROAD-60),
        y:y+ROAD+random(i+20)*(BLOCK-ROAD-60),
        size:15+random(i+30)*10
      });
    }
    return;
  }

  const colors=["#a9a39a","#777f85","#b4a18c","#657b87","#8a9295","#9b8576"];

  world.buildings.push({
    key,
    x:x+ROAD+35,
    y:y+ROAD+35,
    width:BLOCK-ROAD-70,
    height:BLOCK-ROAD-70,
    color:colors[Math.floor(random(3)*colors.length)],
    roof:random(4)>.5?"#515c63":"#39464d"
  });

  for(let i=0;i<4;i++){
    world.lamps.push({
      x:x+ROAD+20+i*90,
      y:y+ROAD+20
    });
  }
}

function ensureWorld() {
  const bx=Math.floor(player.x/BLOCK);
  const by=Math.floor(player.y/BLOCK);

  for(let x=bx-3;x<=bx+3;x++){
    for(let y=by-3;y<=by+3;y++){
      makeBlock(x,y);
    }
  }

  world.buildings=world.buildings.filter(b=>
    Math.abs(b.x-player.x)<2500&&Math.abs(b.y-player.y)<2500
  );

  world.trees=world.trees.filter(t=>
    Math.abs(t.x-player.x)<2500&&Math.abs(t.y-player.y)<2500
  );

  world.parks=world.parks.filter(p=>
    Math.abs(p.x-player.x)<2500&&Math.abs(p.y-player.y)<2500
  );
}

// ==========================================
// TRAFFIC
// ==========================================

function spawnTraffic() {
  traffic=[];

  for(let i=0;i<32;i++){
    const horizontal=Math.random()<0.5;
    const direction=Math.random()<0.5?1:-1;
    const lane=direction===1?-35:35;

    traffic.push({
      x:horizontal?
        (player.x+(Math.random()-.5)*1800):
        Math.round((player.x+(Math.random()-.5)*1500)/BLOCK)*BLOCK+lane,
      y:horizontal?
        Math.round((player.y+(Math.random()-.5)*1500)/BLOCK)*BLOCK+lane:
        player.y+(Math.random()-.5)*1800,
      horizontal,
      direction,
      speed:2+Math.random()*2.5,
      color:["#e74c3c","#e9e9e9","#e4ba4d","#4889b7","#777e86","#222b34"][i%6],
      angle:horizontal?
        (direction===1?Math.PI/2:-Math.PI/2):
        (direction===1?0:Math.PI)
    });
  }
}

function updateTraffic(dt) {
  for(const car of traffic){
    if(car.horizontal) car.x+=car.speed*car.direction*dt;
    else car.y+=car.speed*car.direction*dt;

    if(Math.abs(car.x-player.x)>1500 ||
       Math.abs(car.y-player.y)>1500){
      const direction=Math.random()<.5?1:-1;
      car.direction=direction;

      if(car.horizontal){
        car.x=player.x+(Math.random()-.5)*1000;
        car.y=Math.round((player.y+(Math.random()-.5)*1200)/BLOCK)*BLOCK+(direction===1?-35:35);
      }else{
        car.y=player.y+(Math.random()-.5)*1000;
        car.x=Math.round((player.x+(Math.random()-.5)*1200)/BLOCK)*BLOCK+(direction===1?-35:35);
      }

      car.angle=car.horizontal?
        (direction===1?Math.PI/2:-Math.PI/2):
        (direction===1?0:Math.PI);
    }
  }
}

// ==========================================
// DRAWING WORLD
// ==========================================

function screenX(x){return x-camera.x+W/2}
function screenY(y){return y-camera.y+H/2}

function drawRoads() {
  ctx.fillStyle="#477e4c";
  ctx.fillRect(0,0,W,H);

  const minX=Math.floor((camera.x-W)/BLOCK)-1;
  const maxX=Math.ceil((camera.x+W)/BLOCK)+1;
  const minY=Math.floor((camera.y-H)/BLOCK)-1;
  const maxY=Math.ceil((camera.y+H)/BLOCK)+1;

  // Parkjes
  for(const p of world.parks){
    ctx.fillStyle="#367347";
    ctx.fillRect(screenX(p.x),screenY(p.y),p.width,p.height);

    ctx.fillStyle="#78946b";
    ctx.fillRect(screenX(p.x+25),screenY(p.y+25),p.width-50,p.height-50);
  }

  // Wegen
  ctx.fillStyle="#30383e";

  for(let i=minX;i<=maxX;i++){
    let x=screenX(i*BLOCK);
    ctx.fillRect(x-HALF_ROAD,0,ROAD,H);
  }

  for(let i=minY;i<=maxY;i++){
    let y=screenY(i*BLOCK);
    ctx.fillRect(0,y-HALF_ROAD,W,ROAD);
  }

  // Trottoirs
  ctx.fillStyle="#9c9d91";

  for(let i=minX;i<=maxX;i++){
    let x=screenX(i*BLOCK);
    ctx.fillRect(x-HALF_ROAD,0,5,H);
    ctx.fillRect(x+HALF_ROAD-5,0,5,H);
  }

  for(let i=minY;i<=maxY;i++){
    let y=screenY(i*BLOCK);
    ctx.fillRect(0,y-HALF_ROAD,W,5);
    ctx.fillRect(0,y+HALF_ROAD-5,W,5);
  }

  // Rijstrookstrepen
  ctx.strokeStyle="#d9d4a7";
  ctx.lineWidth=3;
  ctx.setLineDash([30,35]);

  for(let i=minX;i<=maxX;i++){
    let x=screenX(i*BLOCK);
    ctx.beginPath();
    ctx.moveTo(x,0);
    ctx.lineTo(x,H);
    ctx.stroke();
  }

  for(let i=minY;i<=maxY;i++){
    let y=screenY(i*BLOCK);
    ctx.beginPath();
    ctx.moveTo(0,y);
    ctx.lineTo(W,y);
    ctx.stroke();
  }

  ctx.setLineDash([]);
}

function drawBuildings() {
  for(const b of world.buildings){
    const x=screenX(b.x);
    const y=screenY(b.y);

    if(x+b.width<0||x>W||y+b.height<0||y>H)continue;

    ctx.fillStyle="#1c2925";
    ctx.fillRect(x+9,y+12,b.width,b.height);

    ctx.fillStyle=b.color;
    ctx.fillRect(x,y,b.width,b.height);

    ctx.fillStyle=b.roof;
    ctx.fillRect(x+10,y+10,b.width-20,b.height-20);

    // Daken
    ctx.fillStyle="#56646a";
    ctx.fillRect(x+22,y+22,b.width-44,10);

    // Ramen
    for(let wx=20;wx<b.width-15;wx+=38){
      for(let wy=40;wy<b.height-15;wy+=42){
        ctx.fillStyle="#d5c99b";
        ctx.fillRect(x+wx,y+wy,17,20);
      }
    }
  }
}

function drawTrees() {
  for(const t of world.trees){
    const x=screenX(t.x);
    const y=screenY(t.y);

    if(x<-40||x>W+40||y<-40||y>H+40)continue;

    ctx.fillStyle="#4c3825";
    ctx.fillRect(x-4,y,8,16);

    ctx.fillStyle="#183f2b";
    ctx.beginPath();
    ctx.arc(x+3,y+5,t.size+3,0,Math.PI*2);
    ctx.fill();

    ctx.fillStyle="#28643a";
    ctx.beginPath();
    ctx.arc(x,y,t.size,0,Math.PI*2);
    ctx.fill();

    ctx.fillStyle="#39854a";
    ctx.beginPath();
    ctx.arc(x-5,y-5,t.size*.55,0,Math.PI*2);
    ctx.fill();
  }
}

// ==========================================
// CARS
// ==========================================

function drawCar(x,y,angle,color,scale=1,isPlayer=false) {
  ctx.save();
  ctx.translate(x,y);
  ctx.rotate(angle);
  ctx.scale(scale,scale);

  // Schaduw
  ctx.fillStyle="#10181788";
  ctx.fillRect(-17,-25,39,65);

  // Wielen
  ctx.fillStyle="#121719";
  ctx.fillRect(-19,-23,8,17);
  ctx.fillRect(11,-23,8,17);
  ctx.fillRect(-19,12,8,17);
  ctx.fillRect(11,12,8,17);

  // Carrosserie
  ctx.fillStyle=color;
  ctx.beginPath();
  ctx.roundRect(-16,-31,32,62,8);
  ctx.fill();

  // Motorkap
  ctx.fillStyle=color;
  ctx.beginPath();
  ctx.roundRect(-13,-26,26,13,4);
  ctx.fill();

  // Ramen
  ctx.fillStyle="#263c49";
  ctx.beginPath();
  ctx.roundRect(-12,-12,24,24,5);
  ctx.fill();

  ctx.fillStyle="#9bc9d3";
  ctx.fillRect(-10,-9,20,8);

  ctx.fillStyle="#47717e";
  ctx.fillRect(-10,3,20,7);

  // Koplampen
  ctx.fillStyle="#fff4bb";
  ctx.fillRect(-12,-29,7,4);
  ctx.fillRect(5,-29,7,4);

  // Achterlichten
  ctx.fillStyle="#ff423b";
  ctx.fillRect(-12,26,7,4);
  ctx.fillRect(5,26,7,4);

  if(isPlayer){
    ctx.strokeStyle="#ffffff";
    ctx.lineWidth=1.5;
    ctx.strokeRect(-16,-31,32,62);
  }

  ctx.restore();
}

function drawTraffic() {
  for(const car of traffic){
    drawCar(screenX(car.x),screenY(car.y),car.angle,car.color,.85);
  }
}

// ==========================================
// COLLISIONS
// ==========================================

function collision() {
  // Botsingen met gebouwen
  for(const b of world.buildings){
    if(player.x>b.x-30 &&
       player.x<b.x+b.width+30 &&
       player.y>b.y-30 &&
       player.y<b.y+b.height+30){
      player.speed=-player.speed*.35;
      player.x-=Math.sin(player.angle)*12;
      player.y+=Math.cos(player.angle)*12;
    }
  }

  // Botsingen met andere auto's
  for(const car of traffic){
    const dx=player.x-car.x;
    const dy=player.y-car.y;

    if(Math.abs(dx)<30&&Math.abs(dy)<42){
      player.speed*=.65;
      player.x+=dx*.15;
      player.y+=dy*.15;
    }
  }
}

// ==========================================
// PLAYER
// ==========================================


function updatePlayer(dt) {
  const forward = keys.w || keys.arrowup;
  const backward = keys.s || keys.arrowdown;
  const left = keys.a || keys.arrowleft;
  const right = keys.d || keys.arrowright;

  // GAS EN REMMEN
  if (forward) {
    player.speed += player.acceleration * dt;
  } else if (backward) {
    if (player.speed > 0.3) {
      player.speed -= player.acceleration * 2.2 * dt;
    } else {
      player.speed -= player.acceleration * dt;
    }
  } else {
    player.speed *= Math.pow(0.97, dt);
  }

  player.speed = Math.max(-3.5, Math.min(player.maxSpeed, player.speed));

  // STUREN
  const steeringInput = (right ? 1 : 0) - (left ? 1 : 0);
  const speedFactor = Math.min(1, Math.max(0.35, Math.abs(player.speed) / 4));
  const reverseFactor = player.speed < 0 ? -1 : 1;

  player.angle += steeringInput * player.turn * speedFactor * reverseFactor * dt;

  // BEWEGING
  const oldX = player.x;
  const oldY = player.y;

  player.x += Math.sin(player.angle) * player.speed * dt;
  player.y -= Math.cos(player.angle) * player.speed * dt;

  // AFSTAND
  if (player.speed > 0) {
    const travelled = player.speed * dt * 0.13;
    totalDistance += travelled;
    missionDistance += travelled;
  }

  // BOTSINGEN
  collision();

  // Camera volgt de auto
  const smooth = 1 - Math.pow(0.88, dt);
  camera.x += (player.x - camera.x) * smooth;
  camera.y += (player.y - camera.y) * smooth;
}


// ==========================================
// MISSIONS
// ==========================================

function updateMission(){
  const goal=500;

  if(missionDistance>=goal){
    missionDistance-=goal;
    money+=missionReward;

    showToast("MISSION COMPLETED! +€"+missionReward);

    missionNumber++;
    missionReward+=50;
  }

  const progress=Math.min(100,missionDistance/goal*100);

  $("missionTitle").innerText="City Explorer #"+missionNumber;
  $("missionProgress").style.width=progress+"%";
  $("missionText").innerText=
    Math.floor(missionDistance)+" / "+goal+" meters";
}

// ==========================================
// MINIMAP
// ==========================================

function drawMap(){
  const s=mapCanvas.width;
  mapCtx.fillStyle="#477e4c";
  mapCtx.fillRect(0,0,s,s);

  mapCtx.fillStyle="#343d42";

  for(let i=-2;i<=2;i++){
    let pos=s/2+i*BLOCK/10;
    mapCtx.fillRect(pos-7,0,14,s);
    mapCtx.fillRect(0,pos-7,s,14);
  }

  mapCtx.fillStyle="#a4a89c";

  for(const b of world.buildings){
    let x=s/2+(b.x-player.x)/10;
    let y=s/2+(b.y-player.y)/10;
    mapCtx.fillRect(x,y,b.width/10,b.height/10);
  }

  mapCtx.fillStyle="#f1c75a";
  for(const car of traffic){
    let x=s/2+(car.x-player.x)/10;
    let y=s/2+(car.y-player.y)/10;
    if(x>0&&x<s&&y>0&&y<s){
      mapCtx.fillRect(x-2,y-2,4,4);
    }
  }

  mapCtx.save();
  mapCtx.translate(s/2,s/2);
  mapCtx.rotate(player.angle);
  mapCtx.fillStyle="#80f0a8";
  mapCtx.beginPath();
  mapCtx.moveTo(0,-9);
  mapCtx.lineTo(-6,7);
  mapCtx.lineTo(6,7);
  mapCtx.closePath();
  mapCtx.fill();
  mapCtx.restore();
}

// ==========================================
// HUD
// ==========================================

function updateHUD(){
  $("money").innerText=money.toLocaleString("nl-NL");
  $("garageMoney").innerText=money.toLocaleString("nl-NL");
  $("speed").innerText=Math.round(Math.abs(player.speed)*16);
  $("gear").innerText=player.speed<-.2?"R":player.speed>.2?"D":"N";
  $("carName").innerText=player.car.toUpperCase();
}

// ==========================================
// GARAGE
// ==========================================

function renderGarage(){
  const container=$("garageCars");
  container.innerHTML="";

  for(const car of carModels){
    const owned=ownedCars.includes(car.id);
    const selected=selectedCar===car.id;

    const div=document.createElement("div");
    div.className="car-option";

    const preview=document.createElement("div");
    preview.className="car-preview";
    preview.textContent=car.icon;

    const name=document.createElement("h3");
    name.textContent=car.name;

    const stats=document.createElement("p");
    stats.textContent="Maximum speed: "+car.speed*16+" KM/H";

    const button=document.createElement("button");

    if(selected)button.textContent="SELECTED";
    else if(owned)button.textContent="SELECT CAR";
    else button.textContent="BUY €"+car.price;

    button.onclick=()=>{
      if(owned){
        selectCar(car);
      }else if(money>=car.price){
        money-=car.price;
        ownedCars.push(car.id);
        showToast(car.name+" PURCHASED!");
        selectCar(car);
      }else{
        showToast("NOT ENOUGH MONEY!");
      }

      renderGarage();
      updateHUD();
    };

    div.append(preview,name,stats,button);
    container.appendChild(div);
  }

  updateHUD();
}

function selectCar(car){
  selectedCar=car.id;
  player.maxSpeed=car.speed;
  player.acceleration=car.acceleration;
  player.color=car.color;
  player.car=car.name;
  showToast(car.name+" SELECTED!");
}

function openGarage(){
  const previous=state;
  if(previous==="playing"){
    state="garage";
    $("hud").classList.add("hidden");
  }else if(previous==="paused"){
    state="garage";
  }else{
    state="garageMenu";
  }

  $("mainMenu").classList.add("hidden");
  $("pauseMenu").classList.add("hidden");
  $("garageMenu").classList.remove("hidden");

  renderGarage();
}

function closeGarage(){
  $("garageMenu").classList.add("hidden");

  if(state==="garage"){
    if(previousState==="playing"){
      resumeGame();
    }else{
      state="paused";
      $("pauseMenu").classList.remove("hidden");
    }
  }else{
    state="menu";
    $("mainMenu").classList.remove("hidden");
  }
}

let previousState="menu";

function showToast(message){
  const el=$("toast");
  el.textContent=message;
  el.classList.add("show");

  clearTimeout(toastTimer);
  toastTimer=setTimeout(()=>el.classList.remove("show"),2200);
}

// ==========================================
// MENUS
// ==========================================

function startGame(){
  state="playing";

  player.x=0;
  player.y=0;
  player.angle=0;
  player.speed=0;

  camera.x=0;
  camera.y=0;

  totalDistance=0;
  missionDistance=0;
  missionNumber=1;
  missionReward=150;

  world.buildings=[];
  world.trees=[];
  world.parks=[];
  world.lamps=[];

  ensureWorld();
  spawnTraffic();

  $("mainMenu").classList.add("hidden");
  $("pauseMenu").classList.add("hidden");
  $("garageMenu").classList.add("hidden");
  $("hud").classList.remove("hidden");

  lastTime=performance.now();
  requestAnimationFrame(gameLoop);
}

function pauseGame(){
  if(state!=="playing")return;

  state="paused";
  $("pauseMenu").classList.remove("hidden");
}

function resumeGame(){
  state="playing";
  $("pauseMenu").classList.add("hidden");
  $("hud").classList.remove("hidden");

  lastTime=performance.now();
  requestAnimationFrame(gameLoop);
}

function mainMenu(){
  state="menu";

  $("pauseMenu").classList.add("hidden");
  $("garageMenu").classList.add("hidden");
  $("hud").classList.add("hidden");
  $("mainMenu").classList.remove("hidden");
}

// ==========================================
// MAIN RENDER LOOP
// ==========================================

function draw(){
  ensureWorld();

  drawRoads();
  drawBuildings();
  drawTrees();
  drawTraffic();

  drawCar(
    W/2,
    H/2,
    player.angle,
    player.color,
    1.15,
    true
  );

  drawMap();
}

function gameLoop(time){
  if(state!=="playing")return;

  const dt=Math.min((time-lastTime)/16.667,2);
  lastTime=time;

  updatePlayer(dt);
  updateTraffic(dt);
  updateMission();
  updateHUD();

  draw();

  requestAnimationFrame(gameLoop);
}

// ==========================================
// BUTTONS
// ==========================================

$("playBtn").onclick=startGame;

$("garageBtn").onclick=()=>{
  previousState="menu";
  openGarage();
};

$("pauseGarageBtn").onclick=()=>{
  previousState="paused";
  openGarage();
};

$("closeGarage").onclick=closeGarage;
$("resumeBtn").onclick=resumeGame;
$("quitBtn").onclick=mainMenu;

// ==========================================
// INITIALIZATION
// ==========================================

renderGarage();
updateHUD();

