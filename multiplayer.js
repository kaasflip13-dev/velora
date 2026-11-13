@import url('https://fonts.googleapis.com/css2?family=Orbitron:wght@400;500;600;700;800&family=Inter:wght@300;400;500;600&display=swap');

* { margin: 0; padding: 0; box-sizing: border-box; }

body {
    background: #03040b;
    color: white;
    font-family: 'Inter', sans-serif;
    overflow: hidden;
}

#gameUI { position: fixed; inset: 0; display: none; background: #03040b; }
#game {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    display: block;
}

#menu, #winScreen {
    position: fixed;
    inset: 0;
    z-index: 10;
    display: flex;
    justify-content: center;
    align-items: center;
    text-align: center;
    background: radial-gradient(ellipse at center, #18234b, #090b20 55%, #03040b);
    overflow-y: auto;
}

.menu-content, .win-content { padding: 30px; width: min(100%, 650px); }
.eyebrow { color: #76dfff; font-size: 11px; letter-spacing: 6px; margin-bottom: 25px; }

h1 {
    font-family: 'Orbitron', sans-serif;
    font-size: clamp(55px, 10vw, 115px);
    letter-spacing: 15px;
    font-weight: 500;
    color: #e5faff;
    text-shadow: 0 0 30px #49d9ff, 0 0 90px #3565ff;
}

.menu-content > p { margin-top: 15px; letter-spacing: 8px; font-size: 12px; color: #8eadd4; }

button {
    margin-top: 25px;
    background: linear-gradient(120deg, #56dfff, #766bff);
    color: #050b1a;
    border: none;
    padding: 18px 42px;
    font-family: 'Orbitron', sans-serif;
    font-size: 12px;
    letter-spacing: 3px;
    cursor: pointer;
    transition: .25s;
    box-shadow: 0 0 35px #427bff55;
}
button:hover:not(:disabled) { transform: scale(1.04); box-shadow: 0 0 60px #42dfff99; }
button:disabled { opacity: .4; cursor: not-allowed; }

#accountPanel {
    width: min(100%, 390px);
    margin: 30px auto 0;
    padding: 22px;
    background: #101a31cc;
    border: 1px solid #4778a855;
    border-radius: 12px;
    box-shadow: 0 0 35px #284d8a22;
}
.account-title, .players-heading {
    font-family: 'Orbitron', sans-serif;
    font-size: 12px;
    letter-spacing: 3px;
    color: #8eeaff;
}
.account-subtitle { margin-top: 9px; font-size: 12px; color: #91a9c8; }
.google-button {
    width: 100%; margin-top: 20px; padding: 15px;
    background: #f7f9fc; color: #202735; border-radius: 6px;
    font-family: 'Inter', sans-serif; font-weight: 600; letter-spacing: 1px;
    display: flex; justify-content: center; align-items: center; gap: 12px;
}
.google-icon { font-size: 20px; font-weight: 800; color: #4285f4; }
#loginStatus { margin-top: 13px; color: #8ca8c9; font-size: 11px; overflow-wrap: anywhere; }
#playerName { margin-top: 14px; color: #e9faff; font-size: 16px; font-weight: 600; }
#playerEmail { margin-top: 6px; color: #91a9c8; font-size: 11px; }
.logout-button { background: #263651; color: #d8eaff; box-shadow: none; padding: 12px 25px; font-size: 10px; }
#startButton { display: block; margin: 22px auto 0; }

#playersPanel {
    width: min(100%, 390px); margin: 25px auto 0; padding: 18px;
    background: #0b1428bb; border: 1px solid #4778a833; border-radius: 10px;
}
.players-heading { margin-bottom: 12px; }
#playersList { max-height: 115px; overflow-y: auto; color: #b6cce5; font-size: 12px; }
.player-row {
    display: flex; align-items: center; gap: 10px; padding: 9px 5px;
    border-bottom: 1px solid #ffffff12; text-align: left;
}
.player-dot { width: 7px; height: 7px; border-radius: 50%; background: #63e9ad; box-shadow: 0 0 10px #63e9ad; flex-shrink: 0; }
.player-name { flex: 1; }
.player-status { color: #63e9ad; font-family: 'Orbitron', sans-serif; font-size: 9px; letter-spacing: 1px; }
.menu-bottom { margin-top: 30px; font-size: 9px; color: #52617e; letter-spacing: 3px; }

header {
    position: absolute; z-index: 3; top: 0; left: 0; width: 100%;
    padding: 25px 35px; display: flex; justify-content: space-between;
    align-items: center; background: linear-gradient(#03040bdc, transparent);
    pointer-events: none;
}
.logo { font-family: 'Orbitron', sans-serif; font-size: 20px; letter-spacing: 5px; color: #8eeaff; }
.objective { font-size: 10px; letter-spacing: 3px; color: #a3bad8; }
.crystals { font-family: 'Orbitron', sans-serif; color: #80eaff; font-size: 17px; }

#statusPanel {
    position: absolute; z-index: 4; top: 85px; left: 35px; width: 180px;
    padding: 12px 14px; background: #07101caa; border: 1px solid #5b9ecb44;
    border-radius: 8px; pointer-events: none;
}
.stat-line { display: flex; align-items: center; gap: 9px; margin: 5px 0; color: #a7d9ee; font: 8px 'Orbitron', sans-serif; letter-spacing: 1px; }
.stat-track { flex: 1; height: 6px; border-radius: 8px; background: #17263d; overflow: hidden; }
#healthBar, #energyBar { width: 100%; height: 100%; border-radius: inherit; transition: width .12s linear; }
#healthBar { background: linear-gradient(90deg, #e45d78, #ff9c9c); }
#energyBar { background: linear-gradient(90deg, #42dfff, #8274ff); }

#cooldownContainer { position: absolute; z-index: 4; bottom: 78px; left: 50%; transform: translateX(-50%); width: 210px; }
.cooldown-label { display: flex; justify-content: space-between; margin-bottom: 7px; font-family: 'Orbitron', sans-serif; font-size: 9px; letter-spacing: 2px; color: #a7d9ee; }
#cooldownText { color: #64e9ff; }
#cooldown { width: 100%; height: 8px; background: #17263d; border: 1px solid #42617d; border-radius: 20px; overflow: hidden; }
#cooldownBar { width: 100%; height: 100%; background: linear-gradient(90deg, #42dfff, #8274ff); box-shadow: 0 0 12px #42dfff; transition: width .05s linear; }

#hint {
    position: absolute; z-index: 4; bottom: 25px; left: 50%; transform: translateX(-50%);
    font-size: 10px; letter-spacing: 3px; color: #9cb8d5; padding: 13px 22px;
    border: 1px solid #5b9ecb55; background: #07101cbb; pointer-events: none; white-space: nowrap;
}
#message {
    position: absolute; z-index: 5; top: 18%; left: 50%; transform: translateX(-50%);
    font-family: 'Orbitron', sans-serif; font-size: 13px; letter-spacing: 3px;
    color: #8deaff; text-shadow: 0 0 20px #36baff; pointer-events: none; text-align: center;
}
#winScreen { display: none; background: radial-gradient(circle, #152c50, #03040b 75%); }
.win-content h1 { font-size: clamp(30px, 6vw, 65px); letter-spacing: 5px; }
.win-content p { color: #a5c3e2; margin-top: 25px; }

@media(max-width: 600px) {
    .menu-content { padding: 20px 14px; }
    header { padding: 18px; }
    .objective { display: none; }
    #statusPanel { top: 65px; left: 14px; width: 160px; }
    #hint { width: 94%; text-align: center; font-size: 8px; letter-spacing: 1px; white-space: normal; }
    #cooldownContainer { bottom: 85px; }
    h1 { letter-spacing: 8px; }
}
