:root{--bg:#03040b;--panel:rgba(8,16,33,.85);--border:rgba(110,210,255,.35);--blue:#3fb6e8;--blue-light:#8fdfff;--text:#d9f5ff;--glow:0 0 24px rgba(80,200,255,.25)}
*{box-sizing:border-box;margin:0;padding:0}
html,body{height:100%;overflow:hidden;background:var(--bg);color:var(--text);font-family:Inter,system-ui,sans-serif}
canvas#game{position:fixed;inset:0;width:100%;height:100%;display:block}
[hidden]{display:none!important}

.overlay{position:fixed;inset:0;display:flex;align-items:center;justify-content:center;flex-direction:column;text-align:center;
  background:radial-gradient(circle at 50% 20%,#0c1a33 0%,rgba(3,4,11,.96) 70%);z-index:10;padding:20px;overflow:auto}
.overlay.menu{flex-direction:row;align-items:flex-start;justify-content:center;gap:40px}
.menu-content{max-width:680px;width:100%;padding:20px 0}
h1{font-family:Orbitron,sans-serif;font-size:clamp(40px,7vw,76px);letter-spacing:.25em;color:var(--blue-light);text-shadow:0 0 30px rgba(80,200,255,.5)}
h2{font-family:Orbitron,sans-serif;letter-spacing:.2em;color:var(--blue-light);margin:22px 0 10px;font-size:15px}
.sub{letter-spacing:.35em;font-size:12px;opacity:.7;margin:6px 0 18px}
.status{font-size:12px;opacity:.8;min-height:18px;margin:6px 0}
.btn{font-family:Orbitron,sans-serif;letter-spacing:.15em;background:var(--panel);color:var(--text);border:1px solid var(--border);
  padding:11px 20px;margin:4px;cursor:pointer;border-radius:8px;font-size:12px;transition:.15s}
.btn:hover:not(:disabled){background:rgba(63,182,232,.25);box-shadow:var(--glow)}
.btn:disabled{opacity:.35;cursor:not-allowed}
.btn.main{font-size:15px;padding:15px 34px;border-color:var(--blue-light)}
#levels{display:flex;flex-wrap:wrap;justify-content:center}
#playerName{font-family:Orbitron,sans-serif;letter-spacing:.15em;color:var(--blue-light);margin-bottom:4px}
input,select{background:var(--panel);color:var(--text);border:1px solid var(--border);border-radius:8px;padding:11px;font-family:Orbitron,sans-serif;letter-spacing:.2em;font-size:12px;text-align:center}
#mpCode{width:110px;text-transform:uppercase}
#mpRoomCode{font-family:Orbitron,sans-serif;font-size:34px;letter-spacing:.35em;color:var(--blue-light);margin:4px 0 10px}
#mpPlayers{margin-bottom:10px}
.mp-player{display:inline-block;margin:3px;padding:6px 12px;border:1px solid var(--border);border-radius:20px;font-size:12px;background:var(--panel)}
.mp-player.host{border-color:#ffd166}
.controls{font-size:12.5px;opacity:.8;line-height:1.9;margin-top:22px}
.controls b{color:var(--blue-light);font-family:Orbitron,sans-serif;font-size:10.5px;letter-spacing:.1em}

/* leaderboard */
.leaderboard{width:320px;max-width:100%;margin-top:20px;background:var(--panel);border:1px solid var(--border);border-radius:12px;padding:16px;box-shadow:var(--glow)}
.leaderboard h2{margin-top:0}
.leaderboard p{font-size:10px;letter-spacing:.3em;opacity:.6;margin-bottom:12px}
#playersList{max-height:46vh;overflow:auto}
.leaderboard-loading{font-size:12px;opacity:.7}
.leaderboard-row{display:flex;justify-content:space-between;gap:10px;padding:7px 8px;border-radius:6px;font-size:13px}
.leaderboard-row:nth-child(odd){background:rgba(255,255,255,.04)}
.leaderboard-row.is-you{background:rgba(63,182,232,.25);border:1px solid var(--border)}
.leaderboard-rank{color:var(--blue-light);font-family:Orbitron,sans-serif;font-size:11px;margin-right:8px}
.anti-cheat-warning{margin-top:14px;padding:10px;border:1px solid rgba(255,90,90,.4);border-radius:8px;font-size:11px;opacity:.85}
.anti-cheat-title{color:#ff8080;font-family:Orbitron,sans-serif;font-size:10px;letter-spacing:.1em}
.anti-cheat-tagline{display:block;margin-top:6px;font-family:Orbitron,sans-serif;font-size:9px;letter-spacing:.2em;color:var(--blue-light)}

/* HUD */
#hud{position:fixed;inset:0;pointer-events:none;z-index:5}
.panel{background:var(--panel);border:1px solid var(--border);border-radius:8px;padding:8px 12px;margin-bottom:8px;min-width:170px}
.lbl{display:block;font-family:Orbitron,sans-serif;font-size:10px;letter-spacing:.2em;color:var(--blue-light);margin-bottom:4px}
.bar{height:9px;background:rgba(255,255,255,.1);border-radius:5px;overflow:hidden}
.fill{height:100%;width:100%;transition:width .1s}
#hpFill{background:linear-gradient(90deg,#ff3b5c,#ff7a8e)}
#enFill{background:linear-gradient(90deg,#3fb6e8,#8fdfff)}
#hudL{position:absolute;left:16px;top:16px}
#hudR{position:absolute;right:16px;top:16px;text-align:right}
.mate{font-size:12px;margin:3px 0}
.mate .bar{height:5px;margin-top:2px}
#mini{position:absolute;right:16px;bottom:16px;width:190px;height:190px;border:1px solid var(--border);border-radius:8px;background:rgba(3,4,11,.6)}
#cross{position:absolute;left:50%;top:50%;width:22px;height:22px;transform:translate(-50%,-50%)}
#cross:before,#cross:after{content:"";position:absolute;background:var(--blue-light);opacity:.85}
#cross:before{left:10px;top:0;width:2px;height:22px;-webkit-mask:linear-gradient(#000 35%,transparent 35% 65%,#000 65%);mask:linear-gradient(#000 35%,transparent 35% 65%,#000 65%)}
#cross:after{top:10px;left:0;height:2px;width:22px;-webkit-mask:linear-gradient(90deg,#000 35%,transparent 35% 65%,#000 65%);mask:linear-gradient(90deg,#000 35%,transparent 35% 65%,#000 65%)}
#cross.hit:before,#cross.hit:after{background:#ff4466;opacity:1}
#msg{position:absolute;left:50%;bottom:90px;transform:translateX(-50%);font-family:Orbitron,sans-serif;letter-spacing:.12em;font-size:14px;
  background:var(--panel);border:1px solid var(--border);padding:10px 18px;border-radius:8px;opacity:0;transition:opacity .3s;text-align:center;max-width:80vw}
#msg.show{opacity:1}
#vig{position:absolute;inset:0;box-shadow:inset 0 0 160px 40px rgba(255,0,40,0);transition:box-shadow .25s}
#vig.dmg{box-shadow:inset 0 0 160px 60px rgba(255,0,40,.55)}
#pause{background:rgba(3,4,11,.85)}
#end p{margin:8px 0 18px}

@media (max-width:900px){.overlay.menu{flex-direction:column;align-items:center}}
