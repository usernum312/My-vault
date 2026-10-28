---
ui: preview-force
icon: lucide-chart-pie
cssclasses:
  - metadata-no-actions
node_size: 30
Categories:
  - "[[Time|Time]]"
  - "[[Management|Management]]"
  - "[[Work|Work]]"
  - "[[Productivity|Productivity]]"
---
<!--```dataviewjs
// --- معرف فريد للمؤقت لحفظ حالته في ذاكرة أوبسيديان العالمية ---
const TIMER_KEY = "obsidian_perfect_state_v4";

// إعدادات المستخدم الافتراضية
let CONFIG = {
    durationMinutes: 10,        
    soundIntervalSeconds: 1,    
    soundType: 'tictac',        
    customSoundPath: '[https://www.soundjay.com/buttons/sounds/button-16.mp3](https://www.soundjay.com/buttons/sounds/button-16.mp3)',
    counterMode: 'down',        // 'down' or 'up'
    visualMode: 'border'        // 'waves' or 'border'
};

// [تنظيف صارم]: إيقاف وتدمير أي حلقة سابقة فوراً لمنع التراكم
if (window[TIMER_KEY] && window[TIMER_KEY].animationFrameId) {
    cancelAnimationFrame(window[TIMER_KEY].animationFrameId);
}

// إنشاء الحالة لأول مرة في الذاكرة العالمية إذا لم تكن موجودة
if (!window[TIMER_KEY]) {
    const r = Math.floor(Math.random() * 160) + 70; 
    const g = Math.floor(Math.random() * 160) + 70;
    const b = Math.floor(Math.random() * 160) + 70;
    
    window[TIMER_KEY] = {
        durationSeconds: CONFIG.durationMinutes * 60,
        timeLeft: CONFIG.durationMinutes * 60,
        isRunning: false,
        endTime: null, 
        baseColor: { r, g, b },
        waveAngle: 0,
        userRipples: [],
        lastSoundPlayTime: 0,
        animationFrameId: null,
        audioCtx: null
    };
}

let state = window[TIMER_KEY];

// --- [تحديث المزامنة الخلفية المستمرة] ---
if (state.isRunning && state.endTime) {
    let remaining = (state.endTime - Date.now()) / 1000;
    if (remaining <= 0) {
        state.timeLeft = 0;
        state.isRunning = false;
    } else {
        state.timeLeft = remaining;
    }
}

// تفعيل المحرك الصوتي العالمي
function initGlobalAudio() {
    if (!state.audioCtx) {
        state.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (state.audioCtx && state.audioCtx.state === 'suspended') {
        state.audioCtx.resume();
    }
}

function playSound() {
    if (CONFIG.soundType === 'custom' && CONFIG.customSoundPath) {
        const audio = new Audio(CONFIG.customSoundPath);
        audio.play().catch(() => {});
        return;
    }
    if (!state.audioCtx) return;
    
    const osc = state.audioCtx.createOscillator();
    const gain = state.audioCtx.createGain();
    osc.connect(gain); gain.connect(state.audioCtx.destination);
    const now = state.audioCtx.currentTime;
    
    if (CONFIG.soundType === 'tictac') {
        osc.type = 'sine'; osc.frequency.setValueAtTime(800, now);
        gain.gain.setValueAtTime(0.15, now); gain.gain.exponentialRampToValueAtTime(0.01, now + 0.04);
        osc.start(now); osc.stop(now + 0.04);
    } else if (CONFIG.soundType === 'bubbles') {
        osc.type = 'sine'; osc.frequency.setValueAtTime(350, now);
        osc.frequency.exponentialRampToValueAtTime(1000, now + 0.12);
        gain.gain.setValueAtTime(0.1, now); gain.gain.exponentialRampToValueAtTime(0.01, now + 0.12);
        osc.start(now); osc.stop(now + 0.12);
    } else if (CONFIG.soundType === 'water') {
        osc.type = 'triangle'; osc.frequency.setValueAtTime(130, now);
        osc.frequency.linearRampToValueAtTime(260, now + 0.18);
        gain.gain.setValueAtTime(0.1, now); gain.gain.exponentialRampToValueAtTime(0.01, now + 0.18);
        osc.start(now); osc.stop(now + 0.18);
    }
}

// --- إنشاء واجهة الحاوية الكبرى ---
const mainContainer = dv.el("div", "", { cls: "main-timer-wrapper" });
Object.assign(mainContainer.style, {
    position: "relative", width: "100%", margin: "30px auto", padding: "20px",
    fontFamily: "sans-serif", display: "flex", flexDirection: "column",
    alignItems: "center", background: "var(--background-secondary)",
    borderRadius: "12px", boxShadow: "0 8px 24px rgba(0,0,0,0.12)"
});

// زر لوحة الإعدادات الملون ديناميكياً
const settingsBtn = document.createElement("button");
settingsBtn.innerHTML = "*";

const btnColor = `rgba(${state.baseColor.r}, ${state.baseColor.g}, ${state.baseColor.b}, 0.85)`;
const btnHoverColor = `rgba(${Math.min(state.baseColor.r + 30, 255)}, ${Math.min(state.baseColor.g + 30, 255)}, ${Math.min(state.baseColor.b + 30, 255)}, 1)`;

Object.assign(settingsBtn.style, {
    position: "absolute", top: "15px", right: "15px", background: "none",
    border: "none", color: btnColor, fontSize: "2.2em", cursor: "pointer", 
    zIndex: "10", transition: "color 0.2s ease, transform 0.2s ease"
});

settingsBtn.onmouseenter = () => {
    settingsBtn.style.color = btnHoverColor;
    settingsBtn.style.transform = "scale(1.1) rotate(15deg)";
};
settingsBtn.onmouseleave = () => {
    settingsBtn.style.color = btnColor;
    settingsBtn.style.transform = "scale(1) rotate(0deg)";
};

mainContainer.appendChild(settingsBtn);

// لوحة الإعدادات
const settingsPanel = document.createElement("div");
Object.assign(settingsPanel.style, {
    display: "none", position: "absolute", top: "50px", right: "15px",
    background: "var(--background-primary)", border: "1px solid var(--border-color)",
    padding: "15px", borderRadius: "8px", boxShadow: "0 4px 12px rgba(0,0,0,0.2)",
    zIndex: "20", width: "240px", fontSize: "0.9em"
});

settingsPanel.innerHTML = `
  <div style="margin-bottom:8px;"><label>المدة (دقائق):</label><input type="number" id="cfg-min" value="${state.durationSeconds / 60}" style="width:60px; float:left;"></div>
  <div style="margin-bottom:8px;"><label>اتجاه العداد:</label>
    <select id="cfg-counter-mode" style="float:left;">
      <option value="down" ${CONFIG.counterMode==='down'?'selected':''}>تنازلي</option>
      <option value="up" ${CONFIG.counterMode==='up'?'selected':''}>تصاعدي</option>
    </select>
  </div>
  <div style="margin-bottom:8px;"><label>الشكل البصري:</label>
    <select id="cfg-visual-mode" style="float:left;">
      <option value="waves" ${CONFIG.visualMode==='waves'?'selected':''}>أمواج داخلية</option>
      <option value="border" ${CONFIG.visualMode==='border'?'selected':''}>خط إطار يتزايد</option>
    </select>
  </div>
  <div style="margin-bottom:8px;"><label>تكرار الصوت (ثواني):</label><input type="number" id="cfg-sec" value="${CONFIG.soundIntervalSeconds}" style="width:60px; float:left;"></div>
  <div style="margin-bottom:8px;"><label>نوع الصوت:</label>
    <select id="cfg-type" style="float:left;">
      <option value="tictac" ${CONFIG.soundType==='tictac'?'selected':''}>تيك تاك</option>
      <option value="bubbles" ${CONFIG.soundType==='bubbles'?'selected':''}>فقاعات</option>
      <option value="water" ${CONFIG.soundType==='water'?'selected':''}>قطرات ماء</option>
      <option value="custom" ${CONFIG.soundType==='custom'?'selected':''}>مسار خاص</option>
    </select>
  </div>
  <div style="margin-bottom:12px;"><label>مسار الصوت الخاص:</label><input type="text" id="cfg-path" value="${CONFIG.customSoundPath}" style="width:100%; margin-top:4px;"></div>
  <button id="cfg-save" style="width:100%; background:rgba(${state.baseColor.r}, ${state.baseColor.g}, ${state.baseColor.b}, 0.9); color:white; border:none; padding:5px; border-radius:4px; cursor:pointer;">حفظ وتطبيق</button>
`;
mainContainer.appendChild(settingsPanel);

settingsBtn.onclick = () => {
    settingsPanel.style.display = settingsPanel.style.display === "none" ? "block" : "none";
};

// عنصر الكانفاس ونص الوقت الأسفل (مستخدم في نمط الأمواج)
const canvas = document.createElement("canvas");
canvas.width = 350; canvas.height = 350;
canvas.style.cursor = "pointer"; canvas.style.borderRadius = "50%";
mainContainer.appendChild(canvas);

const timeDisplay = dv.el("div", "", { cls: "timer-text" });
Object.assign(timeDisplay.style, { marginTop: "15px", fontSize: "1.8em", fontWeight: "bold" });
mainContainer.appendChild(timeDisplay);

const ctx = canvas.getContext("2d");
const radius = canvas.width / 2;

let isPointerDown = false;
let currentPointerCoords = { x: 0, y: 0 };
let continuousRippleTimer = 0;

function getTimeString(secondsRemaining) {
    let displayTime = secondsRemaining;
    if (CONFIG.counterMode === 'up') {
        displayTime = state.durationSeconds - secondsRemaining;
    }
    if (displayTime < 0) displayTime = 0;
    const minutes = Math.floor(displayTime / 60);
    const seconds = Math.floor(displayTime % 60);
    return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

function updateText(secondsRemaining) {
    if (CONFIG.visualMode === 'waves') {
        timeDisplay.style.display = "block";
        timeDisplay.innerText = getTimeString(secondsRemaining);
    } else {
        timeDisplay.style.display = "none";
    }
}

function addRipple(x, y) {
    state.userRipples.push({ x: x, y: y, radius: 2, alpha: 1.0 });
}

const currentLoopId = Math.random();
state.currentActiveLoop = currentLoopId;

// --- حلقة الرسم الآمنة والمستقرة والمحمية ---
function draw() {
    if (state.currentActiveLoop !== currentLoopId || !document.body.contains(canvas)) {
        if (state.isRunning) {
            let remaining = (state.endTime - Date.now()) / 1000;
            if (remaining <= 0) {
                state.timeLeft = 0;
                state.isRunning = false;
            } else {
                state.timeLeft = remaining;
            }
        }
        setTimeout(draw, 500); 
        return; 
    }

    const nowTimestamp = Date.now();
    
    if (state.isRunning) {
        let remaining = (state.endTime - nowTimestamp) / 1000;
        if (remaining <= 0) {
            state.timeLeft = 0;
            state.isRunning = false;
        } else {
            state.timeLeft = remaining;
            
            if (nowTimestamp - state.lastSoundPlayTime >= CONFIG.soundIntervalSeconds * 1000) {
                playSound();
                state.lastSoundPlayTime = nowTimestamp;
            }
        }
        state.waveAngle += 0.04; 
    }
    
    if (isPointerDown) {
        const distanceFromCenter = Math.sqrt(Math.pow(currentPointerCoords.x - radius, 2) + Math.pow(currentPointerCoords.y - radius, 2));
        if (distanceFromCenter >= 60) {
            continuousRippleTimer++;
            if (continuousRippleTimer % 7 === 0) { 
                addRipple(currentPointerCoords.x, currentPointerCoords.y);
            }
        }
    }
    
    updateText(state.timeLeft);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    let progress = 1 - (state.timeLeft / state.durationSeconds);
    if (progress < 0) progress = 0;
    if (progress > 1) progress = 1;

    if (CONFIG.visualMode === 'waves') {
        // --- نمط 1: الأمواج والماء الداخلي ---
        let startRatio = 1 / 6;
        let currentFillRatio = startRatio + (progress * (1 - startRatio));
        let fillHeight = canvas.height - (currentFillRatio * canvas.height);
        
        ctx.save();
        ctx.beginPath();
        ctx.arc(radius, radius, radius - 8, 0, Math.PI * 2);
        ctx.clip();
        
        ctx.fillStyle = "rgba(200, 200, 200, 0.08)";
        ctx.fill();
        
        ctx.beginPath();
        ctx.moveTo(0, fillHeight);
        
        for (let x = 0; x <= canvas.width; x += 2) { 
            let yOffset = Math.sin(x * 0.025 + state.waveAngle) * 6;
            
            for (let i = 0; i < state.userRipples.length; i++) {
                let r = state.userRipples[i];
                let distX = Math.abs(x - r.x);
                if (distX < r.radius + 15 && distX > r.radius - 15) {
                    let wavePhase = (distX - r.radius) / 15; 
                    yOffset += Math.sin(wavePhase * Math.PI) * 12 * r.alpha; 
                }
            }
            ctx.lineTo(x, fillHeight + yOffset);
        }
        
        ctx.lineTo(canvas.width, canvas.height);
        ctx.lineTo(0, canvas.height);
        ctx.closePath();
        ctx.fillStyle = `rgba(${state.baseColor.r}, ${state.baseColor.g}, ${state.baseColor.b}, 0.85)`;
        ctx.fill();
        
        for (let i = state.userRipples.length - 1; i >= 0; i--) {
            let r = state.userRipples[i];
            if (state.isRunning) {
                r.radius += 3.5;
                r.alpha -= 0.025;
            }
            if (r.alpha <= 0) {
                state.userRipples.splice(i, 1);
                continue;
            }
            ctx.beginPath();
            ctx.arc(r.x, r.y, r.radius, 0, Math.PI * 2);
            ctx.strokeStyle = `rgba(${state.baseColor.r - 40}, ${state.baseColor.g - 40}, ${state.baseColor.b - 40}, ${r.alpha})`;
            ctx.lineWidth = 3;
            ctx.stroke();
        }
        
        ctx.restore();
        
        ctx.beginPath();
        ctx.arc(radius, radius, radius - 8, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(${state.baseColor.r}, ${state.baseColor.g}, ${state.baseColor.b}, 0.5)`;
        ctx.lineWidth = 5;
        ctx.stroke();

        // إيقونة التشغيل أو التصفير المركزية لنمط الأمواج
        if (!state.isRunning) {
            ctx.fillStyle = "rgba(100, 100, 100, 0.3)";
            if (state.timeLeft <= 0) {
                ctx.strokeStyle = "rgba(100, 100, 100, 0.4)";
                ctx.lineWidth = 6;
                ctx.beginPath();
                ctx.arc(radius, radius, 16, 0, Math.PI * 1.5);
                ctx.stroke();
                ctx.fillStyle = "rgba(100, 100, 100, 0.4)";
                ctx.beginPath();
                ctx.moveTo(radius + 10, radius - 18); ctx.lineTo(radius + 22, radius - 10); ctx.lineTo(radius + 10, radius - 2);
                ctx.closePath(); ctx.fill();
            } else {
                ctx.beginPath(); ctx.moveTo(radius - 12, radius - 20); ctx.lineTo(radius + 24, radius); ctx.lineTo(radius - 12, radius + 20); ctx.closePath();
                ctx.fill();
            }
        }

    } else {
        // --- نمط 2: إطار خطي (Circuit Line Mode) ---
        
        // خلفية الفقاعة عند عمل المؤقت أو توقفه
        ctx.beginPath();
        ctx.arc(radius, radius, radius - 10, 0, Math.PI * 2);
        if (state.isRunning) {
            ctx.fillStyle = `rgba(${state.baseColor.r}, ${state.baseColor.g}, ${state.baseColor.b}, 0.1)`;
        } else {
            ctx.fillStyle = "rgba(200, 200, 200, 0.08)";
        }
        ctx.fill();

        // رسم زر التشغيل في الخلفية عند إيقاف المؤقت
        if (!state.isRunning) {
            ctx.save();
            ctx.fillStyle = `rgba(${state.baseColor.r}, ${state.baseColor.g}, ${state.baseColor.b}, 0.1)`;
            const rBoundary = radius - 40;
            const x1 = radius + rBoundary * Math.cos(0);
            const y1 = radius + rBoundary * Math.sin(0);
            
            const x2 = radius + rBoundary * Math.cos((2 * Math.PI) / 3);
            const y2 = radius + rBoundary * Math.sin((2 * Math.PI) / 3);
            
            const x3 = radius + rBoundary * Math.cos((4 * Math.PI) / 3);
            const y3 = radius + rBoundary * Math.sin((4 * Math.PI) / 3);

            ctx.beginPath();
            ctx.moveTo(x1, y1);
            ctx.lineTo(x2, y2);
            ctx.lineTo(x3, y3);
            ctx.closePath();
            ctx.fill();
            ctx.restore();
        }

        // رسم إطار الخلفية الخفيف
        ctx.beginPath();
        ctx.arc(radius, radius, radius - 10, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(${state.baseColor.r}, ${state.baseColor.g}, ${state.baseColor.b}, 0.15)`;
        ctx.lineWidth = 8;
        ctx.stroke();

        // رسم خط التقدم المكتمل مع الوقت
        if (progress > 0) {
            ctx.beginPath();
            ctx.arc(
                radius, 
                radius, 
                radius - 10, 
                -Math.PI / 2, 
                (-Math.PI / 2) + (Math.PI * 2 * progress)
            );
            ctx.strokeStyle = `rgba(${state.baseColor.r}, ${state.baseColor.g}, ${state.baseColor.b}, 0.9)`;
            ctx.lineWidth = 8;
            ctx.lineCap = "round";
            ctx.stroke();
        }

        // رسم النص الكبير داخل الفقاعة في المنتصف تماماً
        ctx.font = "bold 52px sans-serif";
        ctx.fillStyle = `rgba(${state.baseColor.r}, ${state.baseColor.g}, ${state.baseColor.b}, 0.9)`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(getTimeString(state.timeLeft), radius, radius);
    }

    
    state.animationFrameId = requestAnimationFrame(draw);
}

state.animationFrameId = requestAnimationFrame(draw);

// --- التعامل مع حركة وإدخلات المؤشرات ---
function updatePointerPositions(e) {
    const rect = canvas.getBoundingClientRect();
    if (e.touches && e.touches.length > 0) {
        currentPointerCoords.x = e.touches[0].clientX - rect.left;
        currentPointerCoords.y = e.touches[0].clientY - rect.top;
    } else {
        currentPointerCoords.x = e.clientX - rect.left;
        currentPointerCoords.y = e.clientY - rect.top;
    }
}

mainContainer.addEventListener("mouseenter", initGlobalAudio);
mainContainer.addEventListener("mousemove", initGlobalAudio);
mainContainer.addEventListener("touchstart", initGlobalAudio, { passive: true });

function handleInteraction() {
    if (state.timeLeft <= 0) {
        state.timeLeft = state.durationSeconds;
        state.isRunning = false;
        state.endTime = null;
        state.userRipples = [];
    } else {
        state.isRunning = !state.isRunning;
        if (state.isRunning) {
            state.endTime = Date.now() + (state.timeLeft * 1000);
            state.lastSoundPlayTime = Date.now();
        }
    }
}

canvas.addEventListener("mousedown", (e) => {
    initGlobalAudio();
    isPointerDown = true;
    updatePointerPositions(e);
    
    const distanceFromCenter = Math.sqrt(Math.pow(currentPointerCoords.x - radius, 2) + Math.pow(currentPointerCoords.y - radius, 2));
    
    if (CONFIG.visualMode === 'border') {
        if (distanceFromCenter < radius - 10) {
            handleInteraction();
        }
        isPointerDown = false;
    } else {
        if (distanceFromCenter < 60) {
            handleInteraction();
            isPointerDown = false; 
        } else {
            addRipple(currentPointerCoords.x, currentPointerCoords.y);
        }
    }
});

canvas.addEventListener("mousemove", (e) => {
    if (isPointerDown) updatePointerPositions(e);
});

window.addEventListener("mouseup", () => { isPointerDown = false; });

canvas.addEventListener("touchstart", (e) => {
    e.preventDefault();
    initGlobalAudio(); isPointerDown = true; updatePointerPositions(e);
    const distanceFromCenter = Math.sqrt(Math.pow(currentPointerCoords.x - radius, 2) + Math.pow(currentPointerCoords.y - radius, 2));
    
    if (CONFIG.visualMode === 'border') {
        if (distanceFromCenter < radius - 10) {
            handleInteraction();
        }
        isPointerDown = false;
    } else {
        if (distanceFromCenter < 60) {
            handleInteraction();
            isPointerDown = false;
        } else {
            addRipple(currentPointerCoords.x, currentPointerCoords.y);
        }
    }
}, { passive: false });

canvas.addEventListener("touchmove", (e) => {
    e.preventDefault();
    if (isPointerDown) updatePointerPositions(e);
}, { passive: false });

window.addEventListener("touchend", () => { isPointerDown = false; });

// حفظ الإعدادات السلس
settingsPanel.querySelector("#cfg-save").onclick = () => {
    const m = parseFloat(settingsPanel.querySelector("#cfg-min").value) || 10;
    const newDurationSeconds = m * 60;
    
    CONFIG.counterMode = settingsPanel.querySelector("#cfg-counter-mode").value;
    CONFIG.visualMode = settingsPanel.querySelector("#cfg-visual-mode").value;
    CONFIG.soundIntervalSeconds = parseFloat(settingsPanel.querySelector("#cfg-sec").value) || 1;
    CONFIG.soundType = settingsPanel.querySelector("#cfg-type").value;
    CONFIG.customSoundPath = settingsPanel.querySelector("#cfg-path").value;
    
    if (state.durationSeconds !== newDurationSeconds) {
        state.durationSeconds = newDurationSeconds;
        state.timeLeft = newDurationSeconds;
        state.isRunning = false;
        state.endTime = null;
        state.userRipples = [];
    }
    
    settingsPanel.style.display = "none"; 
};
```-->
```dataviewjs
// Time management's code
const WORKSPACE_KEY = "obsidian_hd_instant_workspace";
const DATA_FILE_PATH = ".obsidian/timer-workspace.json";

function hexToRgb(hex) {
    if (!hex) return { r: 46, g: 204, b: 113 };
    hex = hex.replace("#", "");
    if (hex.length === 3) hex = hex.split("").map(c => c + c).join("");
    const num = parseInt(hex, 16);
    return { r: (num >> 16) & 255, g: (num >> 8) & 255, b: num & 255 };
}

function getTodayDateString() {
    const today = new Date();
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, '0');
    const day = String(today.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

function getRandomHexColor() {
    const letters = '0123456789ABCDEF';
    let color = '#';
    for (let i = 0; i < 6; i++) {
        color += letters[Math.floor(Math.random() * 16)];
    }
    return color;
}

// Save the workspace data
async function saveWorkspaceData() {
    try {
        const dataToSave = {
            sortBy: state.sortBy,
            sortDirection: state.sortDirection,
            sortBySecondary: state.sortBySecondary,
            globalSoundType: state.globalSoundType,
            globalSoundInterval: state.globalSoundInterval,
            globalCustomSoundPath: state.globalCustomSoundPath,
            globalCounterMode: state.globalCounterMode,
            globalVisualMode: state.globalVisualMode,
            categories: state.categories,
            bubbles: state.bubbles.map(b => ({
                id: b.id,
                name: b.name,
                categoryId: b.categoryId,
                durationMinutes: b.durationMinutes,
                customColor: b.customColor,
                timeLeft: b.timeLeft,
                isRunning: b.isRunning,
                endTime: b.endTime,
                lastResetDate: b.lastResetDate
            }))
        };
        const adapter = app.vault.adapter;
        const exists = await adapter.exists(DATA_FILE_PATH);
        if (!exists) {
            const folderPath = DATA_FILE_PATH.substring(0, DATA_FILE_PATH.lastIndexOf('/'));
            if (!(await adapter.exists(folderPath))) {
                await adapter.mkdir(folderPath);
            }
        }
        await adapter.write(DATA_FILE_PATH, JSON.stringify(dataToSave, null, 2));
    } catch (err) {
        console.error("خطأ أثناء حفظ بيانات المؤقتات:", err);
    }
}

// Load the workspace
async function loadWorkspaceData() {
    try {
        const adapter = app.vault.adapter;
        if (await adapter.exists(DATA_FILE_PATH)) {
            const content = await adapter.read(DATA_FILE_PATH);
            const saved = JSON.parse(content);
            if (saved) {
                state.sortBy = saved.sortBy || 'category';
                state.sortDirection = saved.sortDirection || 'asc';
                state.sortBySecondary = saved.sortBySecondary || 'added';
                state.globalSoundType = saved.globalSoundType || 'tictac';
                state.globalSoundInterval = saved.globalSoundInterval || 1;
                state.globalCustomSoundPath = saved.globalCustomSoundPath || '';
                state.globalCounterMode = saved.globalCounterMode || 'down';
                state.globalVisualMode = saved.globalVisualMode || 'border';
                state.categories = saved.categories || [];
                const todayDateString = getTodayDateString();
                state.bubbles = (saved.bubbles || []).map(b => {
                    let timeLeft = b.durationMinutes * 60;
                    let isRunning = false;
                    let endTime = null;
                    let lastResetDate = b.lastResetDate || null;
                    if (lastResetDate === todayDateString) {
                        timeLeft = b.timeLeft;
                        isRunning = b.isRunning;
                        endTime = b.endTime;
                        if (isRunning && endTime && endTime <= Date.now()) {
                            timeLeft = 0;
                            isRunning = false;
                            endTime = null;
                        }
                    } else {
                        lastResetDate = todayDateString;
                    }
                    return {
                        id: b.id,
                        name: b.name,
                        categoryId: b.categoryId,
                        durationMinutes: b.durationMinutes,
                        customColor: b.customColor,
                        
                        timeLeft: timeLeft,
                        isRunning: isRunning,
                        endTime: endTime,
                        lastResetDate: lastResetDate,
                        waveAngle: 0,
                        userRipples: [],
                        lastSoundPlayTime: 0
                    };
                });
            }
        }
    } catch (err) {
        console.error("خطأ أثناء قراءة بيانات المؤقتات:", err);
    }
}

if (window[WORKSPACE_KEY] && window[WORKSPACE_KEY].animationFrameId) {
    cancelAnimationFrame(window[WORKSPACE_KEY].animationFrameId);
}

if (!window[WORKSPACE_KEY]) {
    window[WORKSPACE_KEY] = {
        sortBy: 'category',
        sortDirection: 'asc',
        sortBySecondary: 'added',
        globalSoundType: 'tictac',
        globalSoundInterval: 1,
        globalCustomSoundPath: 'https://www.soundjay.com/buttons/sounds/button-16.mp3',
        globalCounterMode: 'down',
        globalVisualMode: 'border',
        categories: [],
        bubbles: [],
        animationFrameId: null,
        audioCtx: null
    };
}

let state = window[WORKSPACE_KEY];
await loadWorkspaceData();

function initGlobalAudio() {
    if (!state.audioCtx) state.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    if (state.audioCtx && state.audioCtx.state === 'suspended') state.audioCtx.resume();
}

function playSound(soundType, customPath) {
    if (soundType === 'custom' && customPath) {
        new Audio(customPath).play().catch(() => {});
        return;
    }
    initGlobalAudio();
    if (!state.audioCtx) return;
    if (state.audioCtx.state === 'suspended') {
        state.audioCtx.resume();
    }
    const osc = state.audioCtx.createOscillator();
    const gain = state.audioCtx.createGain();
    osc.connect(gain);
    gain.connect(state.audioCtx.destination);
    const now = state.audioCtx.currentTime;
    if (soundType === 'tictac') {
        osc.type = 'sine';
        osc.frequency.setValueAtTime(800, now);
        gain.gain.setValueAtTime(0.15, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.04);
        osc.start(now);
        osc.stop(now + 0.04);
    } else if (soundType === 'fire') {
        const ctx = osc.context;
        const dur = 2.5;
        const vol = 0.1;

        // If the sound is longer than the repeat interval, wait (sound length × interval) in silence after it ends
        const interval = state.globalSoundInterval || 1;
        if (dur > interval) {
            if (now < (state.fireBusyUntil || 0) - 0.1) return;
            state.fireBusyUntil = now + dur + dur * interval;
        }

        const buf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
        const d = buf.getChannelData(0);
        for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;

        // [filter, freq, Q, level, flicker Hz, flicker depth]
        [
            ['lowpass', 160, 0.7, 5, 0.4, 2],
            ['bandpass', 500, 0.7, 1.5, 0.7, 0.7],
            ['bandpass', 1100, 0.5, 0.8, 1.1, 0.4],
            ['highpass', 3000, 0.7, 0.05, 0.9, 0.03]
        ].forEach(([type, freq, q, level, lfoHz, lfoDepth]) => {
            const src = ctx.createBufferSource();
            src.buffer = buf; src.loop = true;
            const f = ctx.createBiquadFilter();
            f.type = type; f.frequency.value = freq; f.Q.value = q;
            const g = ctx.createGain(); g.gain.value = level;
            const lfo = ctx.createOscillator(); lfo.frequency.value = lfoHz;
            const dp = ctx.createGain(); dp.gain.value = lfoDepth;
            lfo.connect(dp); dp.connect(g.gain);
            src.connect(f); f.connect(g); g.connect(gain);
            src.start(now, Math.random()); lfo.start(now);
            src.stop(now + dur); lfo.stop(now + dur);
        });

        gain.gain.setValueAtTime(0.0001, now);
        gain.gain.exponentialRampToValueAtTime(vol, now + 0.4);
        gain.gain.setValueAtTime(vol, now + dur - 0.8);
        gain.gain.exponentialRampToValueAtTime(0.001, now + dur);
    } else if (soundType === 'water') {
        osc.type = 'sine';
        osc.frequency.setValueAtTime(300, now);
        osc.frequency.exponentialRampToValueAtTime(1200, now + 0.04);
        gain.gain.setValueAtTime(0.3, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.06);
        osc.start(now);
        osc.stop(now + 0.06);
    }
}

function getTimeString(timeLeft, durationMinutes, counterMode) {
    let displayTime = timeLeft;
    if (counterMode === 'up') displayTime = (durationMinutes * 60) - timeLeft;
    if (displayTime < 0) displayTime = 0;
    const minutes = Math.floor(displayTime / 60);
    const seconds = Math.floor(displayTime % 60);
    return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

const mainContainer = dv.el("div", "", { cls: "main-workspace-wrapper" });
Object.assign(mainContainer.style, {
    position: "relative",
    width: "100%",
    margin: "15px auto",
    padding: "20px 15px",
    fontFamily: "var(--font-interface, sans-serif)",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    background: "var(--background-secondary)",
    borderRadius: "14px",
    boxShadow: "0 8px 24px rgba(0,0,0,0.12)",
    direction: "rtl",
    boxSizing: "border-box"
});

const settingsBtn = document.createElement("button");
settingsBtn.innerHTML = "⚙";
Object.assign(settingsBtn.style, {
    position: "absolute",
    top: "12px",
    right: "15px",
    width: "36px",
    height: "36px",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    background: "none",
    border: "none",
    fontSize: "1.6em",
    lineHeight: "1",
    padding: "0",
    margin: "0",
    cursor: "pointer",
    zIndex: "20",
    transition: "color 0.2s ease, transform 0.3s ease",
    transformOrigin: "center center"
});
mainContainer.appendChild(settingsBtn);

const settingsPanel = document.createElement("div");
Object.assign(settingsPanel.style, {
    display: "none",
    position: "absolute",
    top: "48px",
    right: "15px",
    background: "var(--background-primary-alt, var(--background-primary))",
    border: "1px solid var(--border-color)",
    padding: "16px",
    borderRadius: "12px",
    boxShadow: "0 10px 28px rgba(0,0,0,0.3)",
    zIndex: "30",
    width: "320px",
    fontSize: "0.88em",
    color: "var(--text-normal)",
    maxHeight: "80vh",
    overflowY: "auto"
});
mainContainer.appendChild(settingsPanel);

function buildSettingsUI() {
    const catsOptions = state.categories.map(c => `<option value="${c.id}">${c.name}</option>`).join('');
    const defaultNewCatColor = getRandomHexColor();
    let bubblesListHtml = state.bubbles.map((b, i) => `
        <div style="display:flex; justify-content:space-between; align-items:center; background:var(--background-primary); padding:6px 10px; border-radius:6px; margin-bottom:5px; border:1px solid var(--border-color);">
            <span style="font-weight:600; color:var(--text-normal);">${b.name}</span>
            <div style="display:flex; gap:6px; align-items:center;">
                <input type="number" value="${b.durationMinutes}" style="width:48px; padding:3px; border-radius:4px; border:1px solid var(--border-color); background:var(--background-secondary); color:var(--text-normal);" onchange="window['${WORKSPACE_KEY}'].updateBubbleDuration(${i}, this.value)">
                <span style="font-size:0.8em; color:var(--text-muted);">د</span>
                <button onclick="window['${WORKSPACE_KEY}'].deleteBubble(${i})" style="color:var(--text-error, #e74c3c); background:none; border:none; cursor:pointer; font-weight:bold; font-size:1.1em; margin-right:4px;">✕</button>
            </div>
        </div>
    `).join('');

    settingsPanel.innerHTML = `
        <div style="font-weight:bold; font-size:1em; margin-bottom:12px; border-bottom:1px solid var(--border-color); padding-bottom:6px; color:var(--text-accent);">⚙️ إعدادات التطبيق الفوري</div>
        <div style="background:var(--background-secondary); padding:10px; border-radius:8px; margin-bottom:10px; border:1px solid var(--border-color);">
            <div style="font-weight:bold; margin-bottom:8px; color:var(--text-normal); font-size:0.92em;">🔔 إعدادات الأصوات العامة:</div>
            <div style="margin-bottom:8px; display:flex; justify-content:space-between; align-items:center;">
                <label style="font-size:0.88em;">نوع الصوت:</label>
                <select id="cfg-sound-type" style="padding:4px; border-radius:4px; background:var(--background-primary); border:1px solid var(--border-color); color:var(--text-normal);">
                    <option value="tictac" ${state.globalSoundType==='tictac'?'selected':''}>تيك تاك</option>
                    <option value="water" ${state.globalSoundType==='water'?'selected':''}>قطرات ماء</option>
                    <option value="fire" ${state.globalSoundType==='fire'?'selected':''}>احتراق النار</option>
                    <option value="custom" ${state.globalSoundType==='custom'?'selected':''}>مسار خاص</option>
                </select>
            </div>
            <div style="margin-bottom:8px; display:flex; justify-content:space-between; align-items:center;">
                <label style="font-size:0.88em;">التكرار (ثواني):</label>
                <input type="number" id="cfg-sound-sec" value="${state.globalSoundInterval}" style="width:60px; padding:3px; border-radius:4px; border:1px solid var(--border-color); background:var(--background-primary); color:var(--text-normal);">
            </div>
            <div style="margin-bottom:4px;">
                <label style="display:block; font-size:0.8em; margin-bottom:3px; color:var(--text-muted);">مسار صوت مخصص (URL):</label>
                <input type="text" id="cfg-sound-path" value="${state.globalCustomSoundPath}" style="width:100%; padding:4px; border-radius:4px; border:1px solid var(--border-color); background:var(--background-primary); color:var(--text-normal); box-sizing:border-box;">
            </div>
        </div>
        <div style="background:var(--background-secondary); padding:10px; border-radius:8px; margin-bottom:10px; border:1px solid var(--border-color);">
            <div style="font-weight:bold; margin-bottom:8px; color:var(--text-normal); font-size:0.92em;">🎨 النمط البصري والعداد (للجميع):</div>
            <div style="margin-bottom:6px; display:flex; justify-content:space-between; align-items:center;">
                <label style="font-size:0.85em;">الشكل البصري:</label>
                <select id="bulk-visual" style="padding:4px; border-radius:4px; background:var(--background-primary); border:1px solid var(--border-color); color:var(--text-normal);">
                    <option value="border" ${state.globalVisualMode==='border'?'selected':''}>إطار يتزايد</option>
                    <option value="waves" ${state.globalVisualMode==='waves'?'selected':''}>أمواج داخلية</option>
                </select>
            </div>
            <div style="display:flex; justify-content:space-between; align-items:center;">
                <label style="font-size:0.85em;">اتجاه العداد:</label>
                <select id="bulk-counter" style="padding:4px; border-radius:4px; background:var(--background-primary); border:1px solid var(--border-color); color:var(--text-normal);">
                    <option value="down" ${state.globalCounterMode==='down'?'selected':''}>تنازلي</option>
                    <option value="up" ${state.globalCounterMode==='up'?'selected':''}>تصاعدي</option>
                </select>
            </div>
        </div>
        <div style="background:var(--background-secondary); padding:10px; border-radius:8px; margin-bottom:10px; border:1px solid var(--border-color);">
            <div style="font-weight:bold; margin-bottom:8px; color:var(--text-normal); font-size:0.92em;">ترتيب الفقاعات:</div>
            <div style="margin-bottom:6px; display:flex; justify-content:space-between; align-items:center;">
                <label style="font-size:0.85em;">الترتيب حسب:</label>
                <select id="cfg-sort-by" style="padding:4px; border-radius:4px; background:var(--background-primary); border:1px solid var(--border-color); color:var(--text-normal);">
                    <option value="category" ${state.sortBy==='category'?'selected':''}>التصنيف</option>
                    <option value="added" ${state.sortBy==='added'?'selected':''}>تاريخ الإضافة</option>
                    <option value="duration" ${state.sortBy==='duration'?'selected':''}>المدة</option>
                </select>
            </div>
            <div style="display:flex; justify-content:space-between; align-items:center;">
                <label style="font-size:0.85em;">الاتجاه:</label>
                <select id="cfg-sort-direction" style="padding:4px; border-radius:4px; background:var(--background-primary); border:1px solid var(--border-color); color:var(--text-normal);">
                    <option value="asc" ${state.sortDirection==='asc'?'selected':''}>تصاعدي</option>
                    <option value="desc" ${state.sortDirection==='desc'?'selected':''}>تنازلي</option>
                </select>
            </div>
            <div style="margin-bottom:6px; display:flex; justify-content:space-between; align-items:center;">
                <label style="font-size:0.85em;">الترتيب الثانوي حسب:</label>
                <select id="cfg-sort-by-secondary" style="padding:4px; border-radius:4px; background:var(--background-primary); border:1px solid var(--border-color); color:var(--text-normal);">
                    <option value="category" ${state.sortBySecondary==='category'?'selected':''}>التصنيف</option>
                    <option value="added" ${state.sortBySecondary==='added'?'selected':''}>تاريخ الإضافة</option>
                    <option value="duration" ${state.sortBySecondary==='duration'?'selected':''}>المدة</option>
                </select>
            </div>
        </div>
        <div id="toggle-categories-btn" style="font-weight:bold; font-size:0.92em; margin-bottom:10px; padding:8px 10px; background:var(--background-secondary); border:1px solid var(--border-color); border-radius:8px; cursor:pointer; color:var(--text-accent); display:flex; justify-content:space-between; align-items:center;">
            <span>التصانيف والفقاعات </span><span style="font-size: 3px;" id="toggle-categories-icon">▼</span>
        </div>
        <div id="categories-content" style="display:none;">
            <div style="background:var(--background-secondary); padding:10px; border-radius:8px; margin-bottom:10px; border:1px solid var(--border-color);">
                <div style="font-weight:bold; margin-bottom:6px; color:var(--text-normal); font-size:0.92em;">إضافة تصنيف (أب):</div>
                <div style="display:flex; gap:6px; margin-bottom:6px;">
                    <input type="text" id="new-cat-title" placeholder="اسم التصنيف" style="flex:1; padding:4px; border-radius:4px; border:1px solid var(--border-color); background:var(--background-primary); color:var(--text-normal);">
                    <input type="color" id="new-cat-hex" value="${defaultNewCatColor}" style="width:34px; height:28px; border:none; cursor:pointer; background:none;">
                </div>
                <button id="btn-add-category" style="width:100%; background:var(--interactive-accent); color:var(--text-on-accent); border:none; padding:5px; border-radius:4px; cursor:pointer; font-weight:bold;">+ إضافة تصنيف</button>
            </div>
            <div style="background:var(--background-secondary); padding:10px; border-radius:8px; margin-bottom:10px; border:1px solid var(--border-color);">
                <div style="font-weight:bold; margin-bottom:6px; color:var(--text-normal); font-size:0.92em;">إضافة فقاعة فرعية:</div>
                <input type="text" id="new-b-title" placeholder="اسم المهمة" style="width:100%; padding:4px; margin-bottom:6px; border-radius:4px; border:1px solid var(--border-color); background:var(--background-primary); color:var(--text-normal); box-sizing:border-box;">
                <div style="display:flex; gap:6px; margin-bottom:6px;">
                    <select id="new-b-catid" style="flex:1; padding:4px; border-radius:4px; background:var(--background-primary); border:1px solid var(--border-color); color:var(--text-normal);">${catsOptions}</select>
                    <input type="number" id="new-b-duration" placeholder="دقائق" value="10" style="width:60px; padding:4px; border-radius:4px; border:1px solid var(--border-color); background:var(--background-primary); color:var(--text-normal);">
                </div>
                <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:6px;">
                    <label style="font-size:0.85em;">لون مخصص (Hex):</label>
                    <input type="color" id="new-b-hex" value="#ffffff" style="width:28px; height:22px; border:none; cursor:pointer; background:none;">
                </div>
                <button id="btn-add-bubble-item" style="width:100%; background:var(--interactive-accent); color:var(--text-on-accent); border:none; padding:5px; border-radius:4px; cursor:pointer; font-weight:bold;">+ إضافة فقاعة</button>
            </div>
            <div style="font-weight:bold; margin-bottom:6px; color:var(--text-accent);">المهام والفقاعات الحالية:</div>
            ${bubblesListHtml}
        </div>
    `;

    settingsPanel.querySelector("#cfg-sound-type").onchange = async (e) => {
        state.globalSoundType = e.target.value;
        state.bubbles.forEach(b => b.soundType = state.globalSoundType);
        await saveWorkspaceData();
    };
    settingsPanel.querySelector("#cfg-sound-sec").oninput = async (e) => {
        state.globalSoundInterval = parseFloat(e.target.value) || 1;
        state.bubbles.forEach(b => b.soundIntervalSeconds = state.globalSoundInterval);
        await saveWorkspaceData();
    };
    settingsPanel.querySelector("#cfg-sound-path").oninput = async (e) => {
        state.globalCustomSoundPath = e.target.value;
        state.bubbles.forEach(b => b.customSoundPath = state.globalCustomSoundPath);
        await saveWorkspaceData();
    };
    settingsPanel.querySelector("#bulk-visual").onchange = async (e) => {
        const val = e.target.value;
        state.globalVisualMode = val;
        state.bubbles.forEach(b => b.visualMode = val);
        renderWorkspace();
        await saveWorkspaceData();
    };
    settingsPanel.querySelector("#bulk-counter").onchange = async (e) => {
        const val = e.target.value;
        state.globalCounterMode = val;
        state.bubbles.forEach(b => b.counterMode = val);
        renderWorkspace();
        await saveWorkspaceData();
    };
    settingsPanel.querySelector("#cfg-sort-by").onchange = async (e) => {
        state.sortBy = e.target.value;
        renderWorkspace();
        await saveWorkspaceData();
    };
    settingsPanel.querySelector("#cfg-sort-direction").onchange = async (e) => {
        state.sortDirection = e.target.value;
        renderWorkspace();
        await saveWorkspaceData();
    };
    settingsPanel.querySelector("#cfg-sort-by-secondary").onchange = async (e) => {
        state.sortBySecondary = e.target.value;
        renderWorkspace();
        await saveWorkspaceData();
    };
    settingsPanel.querySelector("#btn-add-category").onclick = async () => {
        const name = settingsPanel.querySelector("#new-cat-title").value.trim();
        const color = settingsPanel.querySelector("#new-cat-hex").value;
        if (name) {
            state.categories.push({ id: 'cat_' + Date.now(), name, color });
            buildSettingsUI();
            renderWorkspace();
            await saveWorkspaceData();
        }
    };

    const toggleCategoriesBtn = settingsPanel.querySelector("#toggle-categories-btn");
    const categoriesContent = settingsPanel.querySelector("#categories-content");
    const toggleCategoriesIcon = settingsPanel.querySelector("#toggle-categories-icon");
    toggleCategoriesBtn.onclick = () => {
        const isHidden = categoriesContent.style.display === "none";
        categoriesContent.style.display = isHidden ? "block" : "none";
        toggleCategoriesIcon.innerText = isHidden ? "▲" : "▼";
    };

    settingsPanel.querySelector("#btn-add-bubble-item").onclick = async () => {
        const name = settingsPanel.querySelector("#new-b-title").value.trim();
        const categoryId = settingsPanel.querySelector("#new-b-catid").value;
        const mins = parseFloat(settingsPanel.querySelector("#new-b-duration").value) || 10;
        const customHex = settingsPanel.querySelector("#new-b-hex").value;
        if (name && categoryId) {
            state.bubbles.push({
                id: 'b_' + Date.now(),
                name,
                categoryId,
                durationMinutes: mins,
                customColor: customHex === '#ffffff' ? '' : customHex,
                timeLeft: mins * 60,
                isRunning: false,
                endTime: null,
                waveAngle: 0,
                userRipples: [],
                lastSoundPlayTime: 0,
                lastResetDate: getTodayDateString()
            });
            buildSettingsUI();
            renderWorkspace();
            await saveWorkspaceData();
        }
    };
}

state.updateBubbleDuration = async (index, mins) => {
    const val = parseFloat(mins) || 10;
    state.bubbles[index].durationMinutes = val;
    state.bubbles[index].timeLeft = val * 60;
    state.bubbles[index].isRunning = false;
    state.bubbles[index].endTime = null;
    state.bubbles[index].lastResetDate = getTodayDateString();
    renderWorkspace();
    await saveWorkspaceData();
};

state.deleteBubble = async (index) => {
    state.bubbles.splice(index, 1);
    buildSettingsUI();
    renderWorkspace();
    await saveWorkspaceData();
};

settingsBtn.onclick = () => {
    let settingsBtnRgb = hexToRgb('#2ecc71');
    let list = [...state.bubbles];
    if (list.length > 0) {
        const firstBubble = list[0];
        const firstBubbleCategory = state.categories.find(c => c.id === firstBubble.categoryId) || { name: 'عام', color: '#2ecc71' };
        const firstBubbleHexColor = firstBubble.customColor || firstBubbleCategory.color;
        settingsBtnRgb = hexToRgb(firstBubbleHexColor);
    }
    const settingsBtnHoverRgb = {
        r: Math.min(settingsBtnRgb.r + 30, 255),
        g: Math.min(settingsBtnRgb.g + 30, 255),
        b: Math.min(settingsBtnRgb.b + 30, 255)
    };

    if (settingsPanel.style.display === "none") {
        buildSettingsUI();
        settingsPanel.style.display = "block";
        settingsBtn.style.color = `rgba(${settingsBtnHoverRgb.r}, ${settingsBtnHoverRgb.g}, ${settingsBtnHoverRgb.b}, 1)`;
        settingsBtn.style.transform = "rotate(360deg)";
    } else {
        settingsPanel.style.display = "none";
        settingsBtn.style.color = `rgba(${settingsBtnRgb.r}, ${settingsBtnRgb.g}, ${settingsBtnRgb.b}, 0.85)`;
        settingsBtn.style.transform = "rotate(0deg)";
    }
};

const workspaceView = document.createElement("div");
Object.assign(workspaceView.style, {
    width: "100%",
    marginTop: "10px"
});
mainContainer.appendChild(workspaceView);

let activeRenderTargets = [];

function renderWorkspace() {
    workspaceView.innerHTML = "";
    activeRenderTargets = [];
    const grid = document.createElement("div");
    Object.assign(grid.style, {
        display: "flex",
        flexDirection: "row",
        flexWrap: "wrap",
        justifyContent: "flex-start",
        alignItems: "center",
        gap: "20px",
        direction: "rtl",
        width: "100%"
    });

    let list = [...state.bubbles];
    list.sort((a, b) => {
        let primaryCompare = 0;

        // Primary Sort Logic
        if (state.sortBy === 'category') {
            const catA = state.categories.find(c => c.id === a.categoryId)?.name || '';
            const catB = state.categories.find(c => c.id === b.categoryId)?.name || '';
            primaryCompare = catA.localeCompare(catB, 'ar');
        } else if (state.sortBy === 'added') {
            primaryCompare = parseInt(a.id.split('_')[1]) - parseInt(b.id.split('_')[1]);
        } else if (state.sortBy === 'duration') {
            primaryCompare = a.durationMinutes - b.durationMinutes;
        }

        if (state.sortDirection === 'desc') {
            primaryCompare *= -1;
        }

        // If primary sort values are equal, apply secondary sort
        if (primaryCompare === 0) {
            let secondaryCompare = 0;
            if (state.sortBySecondary === 'category') {
                const catA = state.categories.find(c => c.id === a.categoryId)?.name || '';
                const catB = state.categories.find(c => c.id === b.categoryId)?.name || '';
                secondaryCompare = catA.localeCompare(catB, 'ar');
            } else if (state.sortBySecondary === 'added') {
                secondaryCompare = parseInt(a.id.split('_')[1]) - parseInt(b.id.split('_')[1]);
            } else if (state.sortBySecondary === 'duration') {
                secondaryCompare = a.durationMinutes - b.durationMinutes;
            }
            return secondaryCompare;
        }

        return primaryCompare;
    });

    let settingsBtnRgb = hexToRgb('#2ecc71');
    if (list.length > 0) {
        const firstBubble = list[0];
        const firstBubbleCategory = state.categories.find(c => c.id === firstBubble.categoryId) || { name: 'عام', color: '#2ecc71' };
        const firstBubbleHexColor = firstBubble.customColor || firstBubbleCategory.color;
        settingsBtnRgb = hexToRgb(firstBubbleHexColor);
    }

    settingsBtn.style.color = `rgba(${settingsBtnRgb.r}, ${settingsBtnRgb.g}, ${settingsBtnRgb.b}, 0.85)`;
    const settingsBtnHoverRgb = {
        r: Math.min(settingsBtnRgb.r + 30, 255),
        g: Math.min(settingsBtnRgb.g + 30, 255),
        b: Math.min(settingsBtnRgb.b + 30, 255)
    };

    settingsBtn.onmouseenter = () => {
        settingsBtn.style.color = `rgba(${settingsBtnHoverRgb.r}, ${settingsBtnHoverRgb.g}, ${settingsBtnHoverRgb.b}, 1)`;
        settingsBtn.style.transform = "rotate(360deg)";
    };
    settingsBtn.onmouseleave = () => {
        if (settingsPanel.style.display === "none") {
            settingsBtn.style.color = `rgba(${settingsBtnRgb.r}, ${settingsBtnRgb.g}, ${settingsBtnRgb.b}, 0.85)`;
            settingsBtn.style.transform = "rotate(0deg)";
        }
    };

    const maxDuration = Math.max(...list.map(b => b.durationMinutes), 1);
    const dpr = window.devicePixelRatio || 1;

    list.forEach(bubble => {
        const category = state.categories.find(c => c.id === bubble.categoryId) || { name: 'عام', color: '#2ecc71' };
        const hexColor = bubble.customColor || category.color;
        const rgb = hexToRgb(hexColor);
        const minPx = 100;
        const maxPx = 200;
        const ratio = bubble.durationMinutes / maxDuration;
        const diameter = Math.round(minPx + ratio * (maxPx - minPx));

        const canvas = document.createElement("canvas");
        canvas.width = diameter * dpr;
        canvas.height = diameter * dpr;
        canvas.style.width = `${diameter}px`;
        canvas.style.height = `${diameter}px`;
        canvas.style.cursor = "pointer";
        canvas.style.borderRadius = "50%";
        grid.appendChild(canvas);

        canvas.onclick = async (e) => {
            initGlobalAudio();
            const rect = canvas.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const y = e.clientY - rect.top;
            const radius = diameter / 2;
            const dist = Math.sqrt(Math.pow(x - radius, 2) + Math.pow(y - radius, 2));

            const handleToggle = async () => {
                if (bubble.timeLeft <= 0) {
                    bubble.timeLeft = bubble.durationMinutes * 60;
                    bubble.isRunning = false;
                    bubble.endTime = null;
                    bubble.userRipples = [];
                } else {
                    bubble.isRunning = !bubble.isRunning;
                    if (bubble.isRunning) {
                        bubble.endTime = Date.now() + (bubble.timeLeft * 1000);
                        bubble.lastSoundPlayTime = Date.now();
                    }
                }
                bubble.lastResetDate = getTodayDateString();
                await saveWorkspaceData();
            };

            if (state.globalVisualMode === 'border') {
                if (dist < radius - 10) await handleToggle();
            } else {
                if (dist < 50) await handleToggle();
                else bubble.userRipples.push({ x, y, radius: 2, alpha: 1.0 });
            }
        };

        activeRenderTargets.push({ canvas, bubble, category, rgb, diameter, dpr });
    });

    workspaceView.appendChild(grid);
}

function animate() {
    const now = Date.now();
    activeRenderTargets.forEach(target => {
        const { canvas, bubble, category, rgb, diameter, dpr } = target;
        const ctx = canvas.getContext("2d");
        ctx.save();
        ctx.scale(dpr, dpr);
        const radius = diameter / 2;
        const scale = diameter / 350;

        if (bubble.isRunning) {
            let remaining = (bubble.endTime - now) / 1000;
            if (remaining <= 0) {
                bubble.timeLeft = 0;
                bubble.isRunning = false;
            } else {
                bubble.timeLeft = remaining;
                /*const soundInt = (bubble.soundIntervalSeconds || 1) * 1000;
                if (now - bubble.lastSoundPlayTime >= soundInt) {
                    playSound(bubble.soundType || state.globalSoundType, bubble.customSoundPath || state.globalCustomSoundPath);
                    bubble.lastSoundPlayTime = now;
                }*/
            }
            bubble.waveAngle += 0.04;
        }

        const totalSecs = bubble.durationMinutes * 60;
        let progress = 1 - (bubble.timeLeft / totalSecs);
        if (progress < 0) progress = 0;
        if (progress > 1) progress = 1;

        ctx.clearRect(0, 0, diameter, diameter);

        if (state.globalVisualMode === 'waves') {
            let startRatio = 1 / 6;
            let currentFillRatio = startRatio + (progress * (1 - startRatio));
            let fillHeight = diameter - (currentFillRatio * diameter);

            ctx.save();
            ctx.beginPath();
            ctx.arc(radius, radius, radius - (8 * scale), 0, Math.PI * 2);
            ctx.clip();
            ctx.fillStyle = "rgba(200, 200, 200, 0.08)";
            ctx.fill();

            ctx.beginPath();
            ctx.moveTo(0, fillHeight);
            for (let x = 0; x <= diameter; x += 2) {
                let yOffset = Math.sin((x / scale) * 0.025 + bubble.waveAngle) * (6 * scale);
                for (let i = 0; i < bubble.userRipples.length; i++) {
                    let r = bubble.userRipples[i];
                    let distX = Math.abs(x - r.x);
                    if (distX < (r.radius + 15) * scale && distX > (r.radius - 15) * scale) {
                        yOffset += Math.sin(((distX - r.radius * scale) / (15 * scale)) * Math.PI) * (12 * scale) * r.alpha;
                    }
                }
                ctx.lineTo(x, fillHeight + yOffset);
            }
            ctx.lineTo(diameter, diameter);
            ctx.lineTo(0, diameter);
            ctx.closePath();
            ctx.fillStyle = `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.85)`;
            ctx.fill();

            for (let i = bubble.userRipples.length - 1; i >= 0; i--) {
                let r = bubble.userRipples[i];
                if (bubble.isRunning) {
                    r.radius += 3.5;
                    r.alpha -= 0.025;
                }
                if (r.alpha <= 0) {
                    bubble.userRipples.splice(i, 1);
                    continue;
                }
                ctx.beginPath();
                ctx.arc(r.x, r.y, r.radius * scale, 0, Math.PI * 2);
                ctx.strokeStyle = `rgba(${rgb.r - 40}, ${rgb.g - 40}, ${rgb.b - 40}, ${r.alpha})`;
                ctx.lineWidth = 3 * scale;
                ctx.stroke();
            }
            ctx.restore();

            ctx.beginPath();
            ctx.arc(radius, radius, radius - (8 * scale), 0, Math.PI * 2);
            ctx.strokeStyle = `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.5)`;
            ctx.lineWidth = 5 * scale;
            ctx.stroke();

            ctx.textAlign = "center";
            ctx.fillStyle = "#ffffff";
            ctx.font = `bold ${Math.max(12, Math.round(22 * scale))}px sans-serif`;
            ctx.fillText(bubble.name, radius, radius - (35 * scale));

            ctx.fillStyle = `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 1)`;
            ctx.font = `${Math.max(10, Math.round(16 * scale))}px sans-serif`;
            ctx.fillText(`(${category.name})`, radius, radius - (14 * scale));

            if (!bubble.isRunning && bubble.timeLeft > 0) {
                ctx.fillStyle = "rgba(255, 255, 255, 0.45)";
                ctx.beginPath();
                ctx.moveTo(radius - (6 * scale), radius - (8 * scale));
                ctx.lineTo(radius + (9 * scale), radius);
                ctx.lineTo(radius - (6 * scale), radius + (8 * scale));
                ctx.closePath();
                ctx.fill();
            }

            ctx.fillStyle = "#ffffff";
            ctx.font = `bold ${Math.max(14, Math.round(32 * scale))}px monospace`;
            ctx.fillText(getTimeString(bubble.timeLeft, bubble.durationMinutes, state.globalCounterMode), radius, radius + (42 * scale));
        } else {
            ctx.beginPath();
            ctx.arc(radius, radius, radius - (10 * scale), 0, Math.PI * 2);
            if (bubble.isRunning) {
                ctx.fillStyle = `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.1)`;
            } else {
                ctx.fillStyle = "rgba(200, 200, 200, 0.08)";
            }
            ctx.fill();

            if (!bubble.isRunning) {
                ctx.save();
                ctx.fillStyle = `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.12)`;
                const rBoundary = radius - (40 * scale);
                const x1 = radius + rBoundary * Math.cos(0);
                const y1 = radius + rBoundary * Math.sin(0);
                const x2 = radius + rBoundary * Math.cos((2 * Math.PI) / 3);
                const y2 = radius + rBoundary * Math.sin((2 * Math.PI) / 3);
                const x3 = radius + rBoundary * Math.cos((4 * Math.PI) / 3);
                const y3 = radius + rBoundary * Math.sin((4 * Math.PI) / 3);
                ctx.beginPath();
                ctx.moveTo(x1, y1);
                ctx.lineTo(x2, y2);
                ctx.lineTo(x3, y3);
                ctx.closePath();
                ctx.fill();
                ctx.restore();
            }

            ctx.beginPath();
            ctx.arc(radius, radius, radius - (10 * scale), 0, Math.PI * 2);
            ctx.strokeStyle = `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.15)`;
            ctx.lineWidth = 8 * scale;
            ctx.stroke();

            if (progress > 0) {
                ctx.beginPath();
                ctx.arc(
                    radius,
                    radius,
                    radius - (10 * scale),
                    -Math.PI / 2,
                    (-Math.PI / 2) + (Math.PI * 2 * progress)
                );
                ctx.strokeStyle = `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.9)`;
                ctx.lineWidth = 8 * scale;
                ctx.lineCap = "round";
                ctx.stroke();
            }

            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            ctx.fillStyle = `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.9)`;
            ctx.font = `bold ${Math.max(12, Math.round(22 * scale))}px sans-serif`;
            ctx.fillText(bubble.name, radius, radius - (29 * scale));

            ctx.font = `bold ${Math.max(16, Math.round(44 * scale))}px monospace`;
            ctx.fillText(getTimeString(bubble.timeLeft, bubble.durationMinutes, state.globalCounterMode), radius, radius + (14 * scale));
        }
        ctx.restore();
    });
    state.animationFrameId = requestAnimationFrame(animate);
}

renderWorkspace();
state.animationFrameId = requestAnimationFrame(animate);
if (window.globalObsidianTimerTicker) {
    clearInterval(window.globalObsidianTimerTicker);
}
window.globalObsidianTimerTicker = setInterval(() => {
    const now = Date.now();
    if (window[WORKSPACE_KEY] && window[WORKSPACE_KEY].bubbles) {
        window[WORKSPACE_KEY].bubbles.forEach(bubble => {
            if (bubble.isRunning) {
                let remaining = (bubble.endTime - now) / 1000;
                if (remaining <= 0) {
                    bubble.timeLeft = 0;
                    bubble.isRunning = false;
                    bubble.endTime = null;
                } else {
                    bubble.timeLeft = remaining;
                    const soundInt = (window[WORKSPACE_KEY].globalSoundInterval || 1) * 1000;
                    if (now - bubble.lastSoundPlayTime >= soundInt) {
                        playSound(window[WORKSPACE_KEY].globalSoundType, window[WORKSPACE_KEY].globalCustomSoundPath);
                        bubble.lastSoundPlayTime = now;
                    }
                }
            }
        });
    }
}, 500);
```