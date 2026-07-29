---
ui: preview-force
icon: lucide-chart-pie
cssclasses:
  - metadata-no-actions
node_size: 30
---
```dataviewjs
// --- معرف فريد للمؤقت لحفظ حالته في ذاكرة أوبسيديان العالمية ---
const TIMER_KEY = "obsidian_perfect_state_v4";

// إعدادات المستخدم الافتراضية
let CONFIG = {
    durationMinutes: 10,        
    soundIntervalSeconds: 1,    
    soundType: 'tictac',        
    customSoundPath: 'https://www.soundjay.com/buttons/sounds/button-16.mp3' 
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
    zIndex: "20", width: "220px", fontSize: "0.9em"
});

settingsPanel.innerHTML = `
  <div style="margin-bottom:8px;"><label>المدة (دقائق):</label><input type="number" id="cfg-min" value="${state.durationSeconds / 60}" style="width:60px; float:left;"></div>
  <div style="margin-bottom:8px;"><label>تكرار الصوت (ثواني):</label><input type="number" id="cfg-sec" value="${CONFIG.soundIntervalSeconds}" style="width:60px; float:left;"></div>
  <div style="margin-bottom:8px;"><label>نوع الصوت:</label>
    <select id="cfg-type" style="float:left;">
      <option value="tictac" ${CONFIG.soundType==='tictac'?'selected':''}>تيك تاك</option>
      <option value="bubbles" ${CONFIG.soundType==='bubbles'?'selected':''}>فقاعات</option>
      <option value="water" ${CONFIG.soundType==='water'?'selected':''}>تموج ماء</option>
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

// عنصر الكانفاس ونص الوقت
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

function updateText(secondsTotal) {
    if (secondsTotal < 0) secondsTotal = 0;
    const minutes = Math.floor(secondsTotal / 60);
    const seconds = Math.floor(secondsTotal % 60);
    timeDisplay.innerText = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
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
    
    // إيقونة التشغيل أو التصفير
    if (!state.isRunning) {
        ctx.fillStyle = "rgba(100, 100, 100, 0.3)";
        if (state.timeLeft <= 0) {
            // رسم سهم دائري (Reset Icon) عندما ينتهي المؤقت للإشارة للمستخدم بإمكانية التصفير
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
            // رسم زر التشغيل التقليدي المثلث إذا كان المؤقت متوقف مؤقتاً فقط
            ctx.beginPath(); ctx.moveTo(radius - 12, radius - 20); ctx.lineTo(radius + 24, radius); ctx.lineTo(radius - 12, radius + 20); ctx.closePath();
            ctx.fill();
        }
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

canvas.addEventListener("mousedown", (e) => {
    initGlobalAudio();
    isPointerDown = true;
    updatePointerPositions(e);
    
    const distanceFromCenter = Math.sqrt(Math.pow(currentPointerCoords.x - radius, 2) + Math.pow(currentPointerCoords.y - radius, 2));
    
    if (distanceFromCenter < 60) {
        // [مفتاح الحل الذكي للـ Reset]:
        if (state.timeLeft <= 0) {
            // إذا كان المؤقت منتهياً تماماً، أعد ضبط العداد للمدة الأصلية
            state.timeLeft = state.durationSeconds;
            state.isRunning = false;
            state.endTime = null;
            state.userRipples = [];
        } else {
            // الحالة الطبيعية: تشغيل وإيقاف مؤقت
            state.isRunning = !state.isRunning;
            if (state.isRunning) {
                state.endTime = Date.now() + (state.timeLeft * 1000);
                state.lastSoundPlayTime = Date.now();
            }
        }
        isPointerDown = false; 
    } else {
        addRipple(currentPointerCoords.x, currentPointerCoords.y);
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
    if (distanceFromCenter < 60) {
        if (state.timeLeft <= 0) {
            state.timeLeft = state.durationSeconds;
            state.isRunning = false;
            state.endTime = null;
            state.userRipples = [];
        } else {
            state.isRunning = !state.isRunning;
            if (state.isRunning) state.endTime = Date.now() + (state.timeLeft * 1000);
        }
        isPointerDown = false;
    } else {
        addRipple(currentPointerCoords.x, currentPointerCoords.y);
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
    
    // 1. تحديث إعدادات الصوت دائماً دون التأثير على الوقت الحالي
    CONFIG.soundIntervalSeconds = parseFloat(settingsPanel.querySelector("#cfg-sec").value) || 1;
    CONFIG.soundType = settingsPanel.querySelector("#cfg-type").value;
    CONFIG.customSoundPath = settingsPanel.querySelector("#cfg-path").value;
    
    // 2. لا تقم بإعادة ضبط العداد إلا إذا قام المستخدم بتغيير الوقت بالفعل
    if (state.durationSeconds !== newDurationSeconds) {
        state.durationSeconds = newDurationSeconds;
        state.timeLeft = newDurationSeconds;
        state.isRunning = false;
        state.endTime = null;
        state.userRipples = [];
    }
    
    settingsPanel.style.display = "none"; 
};
```