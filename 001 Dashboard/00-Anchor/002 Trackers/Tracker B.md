---
banner: https://images.pexels.com/photos/7876507/pexels-photo-7876507.jpeg?_gl=1*1xvfjbo*_ga*MTM4ODgwODc2Ny4xNzcwMDg3ODk1*_ga_8JE65Q40S6*czE3NzAyMDM5MTgkbzIkZzEkdDE3NzAyMDM5NTckajIxJGwwJGgw
icon: lucide-line-chart
cssclasses:
  - card
  - invert-banner
  - Disappear
banner_y: 68
---
```dataviewjs
// ---------- DATE ENGINE ----------
const hijriMonths = {
    "محرّم": 1, "muharram": 1, "صفر": 2, "safar": 2, "ربيع الأول": 3,
    "rabi' al-awwal": 3, "ربيع الآخر": 4, "rabi' al-thani": 4,
    "جمادى الأولى": 5, "jumada al-ula": 5,
    "جمادى الآخرة": 6, "jumada al-akhirah": 6,
    "رجب": 7, "rajab": 7, "شعبان": 8, "sha'ban": 8,
    "رمضان": 9, "ramadan": 9, "شوال": 10, "shawwal": 10,
    "ذو القعدة": 11, "dhu al-qi'dah": 11,
    "ذو الحجة": 12, "dhu al-hijjah": 12
};

function hijriToGregorian(y, m, d) {
    let jd = Math.floor((11 * y + 3) / 30) + 354 * y + 30 * m - Math.floor((m - 1) / 2) + d + 1948440 - 385;
    if (jd > 2299160) {
        let l = jd + 68569; let n = Math.floor((4 * l) / 146097); l -= Math.floor((146097 * n + 3) / 4);
        let i = Math.floor((4000 * (l + 1)) / 1461001); l -= Math.floor((1461 * i) / 4) + 31;
        let j = Math.floor((80 * l) / 2447); d = l - Math.floor((2447 * j) / 80);
        l = Math.floor(j / 11); m = j + 2 - 12 * l; y = 100 * (n - 49) + i + l;
    }
    return moment(`${y}-${m}-${d}`, "YYYY-M-D");
}

function parseAnyDate(fileName) {
    let greg = fileName.match(/(\d{4}-\d{2}-\d{2})/);
    if (greg && parseInt(greg[0].split('-')[0]) > 1900)
        return moment(greg[0], "YYYY-MM-DD");

    let hijriNum = fileName.match(/(14\d{2})-(\d{1,2})-(\d{1,2})/);
    if (hijriNum)
        return hijriToGregorian(parseInt(hijriNum[1]), parseInt(hijriNum[2]), parseInt(hijriNum[3]));

    for (let monthName in hijriMonths) {
        if (fileName.toLowerCase().includes(monthName.toLowerCase())) {
            let yearMatch = fileName.match(/14\d{2}/);
            let dayMatch = fileName.match(/(?:^|\s|—)(\d{1,2})(?:\s|$)/);
            if (yearMatch && dayMatch)
                return hijriToGregorian(parseInt(yearMatch[0]), hijriMonths[monthName], parseInt(dayMatch[1]));
        }
    }
    return null;
}

// ---------- TASK COMPLETION ----------
function getTaskCompletion(page, searchTerms) {
    if (!page.file.tasks) return { complete: 0, halfComplete: 0 };

    let complete = 0;
    let halfComplete = 0;

    page.file.tasks.forEach(t => {
        const taskTextLower = t.text.toLowerCase();
        const matchesTask = searchTerms.some(term =>
            taskTextLower.includes(term.toLowerCase())
        );

        if (!matchesTask) return;

        if (t.completed) {
            complete = 1;
            halfComplete = 0;
        }
        else if (t.text.trim().startsWith("[/]")) {
            halfComplete = 0.5;
        }
    });

    return { complete, halfComplete };
}

// ---------- GLOW ENGINE ----------
function getGlowIntensity(streak) {
    const maxStreak = 14;
    const normalized = Math.min(streak / maxStreak, 1);

    return {
        blur: 5 + normalized * 25,
        alpha: 0.4 + normalized * 0.6
    };
}

// ---------- CONFIG ----------
const items = [
    { icon: "🌙", label: "Fajr", terms: ["Fajr", "الفجر"], target: 7 },
    { icon: "🌇", label: "Dhuhr", terms: ["Dhuhr", "الظهر"], target: 7 },
    { icon: "🌄", label: "Asr", terms: ["Asr", "العصر"], target: 7 },
    { icon: "🌆", label: "Maghrib", terms: ["Maghrib", "المغرب"], target: 7 },
    { icon: "🌃", label: "Isha", terms: ["Isha", "العشاء"], target: 7 },
];

const allPages = dv.pages('"003 Daily/001 Active Diaries"');
const today = moment().startOf('day');
const weekStart = today.clone().startOf('isoWeek');
const weekEnd = today.clone().endOf('isoWeek');

const data = items.map(item => {

    const completedPages = [];
    const halfCompletedPages = [];

    allPages.forEach(p => {
        const d = parseAnyDate(p.file.name);
        if (!d || !d.isValid()) return;

        const completion = getTaskCompletion(p, item.terms);

        if (completion.complete === 1)
            completedPages.push(p);
        else if (completion.halfComplete === 0.5)
            halfCompletedPages.push(p);
    });

    let done = 0;

    completedPages.forEach(p => {
        const d = parseAnyDate(p.file.name);
        if (d.isBetween(weekStart, weekEnd, null, "[]"))
            done += 1;
    });

    halfCompletedPages.forEach(p => {
        const d = parseAnyDate(p.file.name);
        if (d.isBetween(weekStart, weekEnd, null, "[]"))
            done += 0.5;
    });

    const sortedDates = completedPages
        .map(p => parseAnyDate(p.file.name))
        .filter(d => d && d.isValid() && d.isSameOrBefore(today))
        .sort((a, b) => b.diff(a));

    let streak = 0;
    if (sortedDates.length > 0) {
        const daysSinceLast = today.diff(sortedDates[0], 'days');
        if (daysSinceLast <= 2) {
            for (let i = 0; i < sortedDates.length; i++) {
                streak++;
                if (i < sortedDates.length - 1) {
                    const gap = sortedDates[i].diff(sortedDates[i+1], 'days') - 1;
                    if (gap > 2) break;
                }
            }
        }
    }

    let todayComplete = 0;
    let todayHalfComplete = 0;

    for (let page of allPages) {
        const d = parseAnyDate(page.file.name);
        if (d && d.isValid() && d.isSame(today, 'day')) {
            const tComp = getTaskCompletion(page, item.terms);
            todayComplete = tComp.complete;
            todayHalfComplete = tComp.halfComplete;
            break;
        }
    }

    return {
        ...item,
        done,
        streak,
        progress: Math.min(done / item.target, 1),
        todayComplete,
        todayHalfComplete
    };
});

// ---------- WARNING ----------
const todayHalfCount = data.filter(d => d.todayHalfComplete === 0.5).length;

// ---------- RENDER ----------
const container = dv.el("div", "", {
    attr: { style: `display:flex;flex-direction:column;align-items:center;padding:20px;` }
});

const header = dv.el("div", "", { attr: { style: `text-align:center;margin-bottom:20px;` }});
header.appendChild(dv.el("div", "Salat Performance",
    { attr: { style: `font-size:1.3em;font-weight:300;color:var(--text-muted);letter-spacing:0.1em;` }}));
header.appendChild(dv.el("div",
    `Week ${today.isoWeek()} (${today.format("YYYY")})`,
    { attr: { style: `font-size:0.8em;color:var(--text-faint);` }}));

container.appendChild(header);

if (todayHalfCount > 2) {
    const warning = dv.el("div", "لا تضيع نفسك", {
        attr: { style: `font-weight:900;color:#ff0000;font-size:1.2em;margin-bottom:10px;` }
    });
    container.appendChild(warning);
}

// ---------- CANVAS ----------
const canvas = document.createElement("canvas");
canvas.width = 500;
canvas.height = 500;
canvas.style.maxWidth = "100%";
const ctx = canvas.getContext("2d");

const centerX = 250;
const centerY = 250;
const maxRadius = 160;

// Background circles
ctx.strokeStyle = "rgba(128,128,128,0.1)";
for (let i = 1; i <= 5; i++) {
    ctx.beginPath();
    ctx.arc(centerX, centerY, (maxRadius / 5) * i, 0, Math.PI * 2);
    ctx.stroke();
}

// Progress polygon
ctx.fillStyle = "rgba(99,102,241,0.15)";
ctx.strokeStyle = "rgba(99,102,241,0.8)";
ctx.lineWidth = 3;
ctx.beginPath();

for (let i = 0; i < 5; i++) {
    const progress = data[i].progress;
    const angle = (Math.PI * 2 * i) / 5 - Math.PI / 2;
    const x = centerX + Math.cos(angle) * (maxRadius * progress);
    const y = centerY + Math.sin(angle) * (maxRadius * progress);
    i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
}
ctx.closePath();
ctx.fill();
ctx.stroke();

// ---------- LABELS ----------
data.forEach((item, i) => {

    const angle = (Math.PI * 2 * i) / 5 - Math.PI / 2;
    const x = centerX + Math.cos(angle) * (maxRadius + 50);
    const y = centerY + Math.sin(angle) * (maxRadius + 50);

    let iconColor = "var(--text-muted)";
    let labelColor = "var(--text-normal)";
    ctx.shadowBlur = 0;
    ctx.shadowColor = "transparent";

    if (item.todayComplete === 1) {
        const glow = getGlowIntensity(item.streak);
        const glowColor = `rgba(255,250,205,${glow.alpha})`;

        iconColor = glowColor;
        labelColor = glowColor;
        ctx.shadowColor = glowColor;
        ctx.shadowBlur = glow.blur;
    }
    else if (item.todayHalfComplete === 0.5) {
        iconColor = "#222";
        labelColor = "#222";
    }

    ctx.textAlign = "center";

    // Icon
    ctx.fillStyle = iconColor;
    ctx.font = "24px sans-serif";
    ctx.fillText(item.icon, x, y - 20);
    ctx.shadowBlur = 0;

    // Label
    ctx.font = "bold 12px sans-serif";
    ctx.fillStyle = labelColor;
    ctx.fillText(item.label, x, y);

    // Progress
    const displayDone = item.done % 1 === 0 ? item.done : item.done.toFixed(1);
    ctx.font = "10px sans-serif";
    ctx.fillStyle = "var(--text-muted)";
    ctx.fillText(`${displayDone}/${item.target}`, x, y + 15);

    // Streak
    ctx.font = "bold 11px sans-serif";
    if (item.todayHalfComplete === 0.5) {
        ctx.fillStyle = "#000000";
    } else {
        ctx.fillStyle = item.streak > 2 ? "#10b981" : "#ef4444";
    }
    ctx.fillText(`${item.streak}🔥`, x, y + 30);
});

container.appendChild(canvas);
```

```dataviewjs
// (Note: This uses the same Date Engine logic as above)
const hijriMonths = { "محرّم": 1, "muharram": 1, "صفر": 2, "safar": 2, "ربيع الأول": 3, "rabi' al-awwal": 3, "ربيع الآخر": 4, "rabi' al-thani": 4, "جمادى الأولى": 5, "jumada al-ula": 5, "جمادى الآخرة": 6, "jumada al-akhirah": 6, "رجب": 7, "rajab": 7, "شعبان": 8, "sha'ban": 8, "رمضان": 9, "ramadan": 9, "شوال": 10, "shawwal": 10, "ذو القعدة": 11, "dhu al-qi'dah": 11, "ذو الحجة": 12, "dhu al-hijjah": 12 };
function hijriToGregorian(y, m, d) { let jd = Math.floor((11 * y + 3) / 30) + 354 * y + 30 * m - Math.floor((m - 1) / 2) + d + 1948440 - 385; if (jd > 2299160) { let l = jd + 68569; let n = Math.floor((4 * l) / 146097); l = l - Math.floor((146097 * n + 3) / 4); let i = Math.floor((4000 * (l + 1)) / 1461001); l = l - Math.floor((1461 * i) / 4) + 31; let j = Math.floor((80 * l) / 2447); d = l - Math.floor((2447 * j) / 80); l = Math.floor(j / 11); m = j + 2 - 12 * l; y = 100 * (n - 49) + i + l; } return moment(`${y}-${m}-${d}`, "YYYY-M-D"); }
function parseAnyDate(fileName) { let greg = fileName.match(/(\d{4}-\d{2}-\d{2})/); if (greg && parseInt(greg[0].split('-')[0]) > 1900) return moment(greg[0], "YYYY-MM-DD"); let hijriNum = fileName.match(/(14\d{2})-(\d{1,2})-(\d{1,2})/); if (hijriNum) return hijriToGregorian(parseInt(hijriNum[1]), parseInt(hijriNum[2]), parseInt(hijriNum[3])); for (let monthName in hijriMonths) { if (fileName.toLowerCase().includes(monthName.toLowerCase())) { let yearMatch = fileName.match(/14\d{2}/); let dayMatch = fileName.match(/(?:^|\s|—)(\d{1,2})(?:\s|$)/); if (yearMatch && dayMatch) return hijriToGregorian(parseInt(yearMatch[0]), hijriMonths[monthName], parseInt(dayMatch[1])); } } return null; }
function isTaskComplete(page, searchTerms) { if (!page.file.tasks) return false; return page.file.tasks.some(t => t.completed && searchTerms.some(term => t.text.toLowerCase().includes(term.toLowerCase()))); }

const items = [
    { icon: "🌅", label: "Morning", terms: ["Morning Athkar", "أذكار الصباح"], target: 7 },
    { icon: "🌇", label: "Evening", terms: ["Evening Athkar", "أذكار المساء"], target: 7 },
    { icon: "🌌", label: "Bedtime", terms: ["Bedtime Athkar", "أذكار النوم"], target: 7 },
];

const allPages = dv.pages('"003 Daily/001 Active Diaries"');
const today = moment().startOf('day');
const weekStart = today.clone().startOf('isoWeek');
const weekEnd = today.clone().endOf('isoWeek');

const data = items.map(item => {
    const completedPages = allPages.filter(p => {
        const d = parseAnyDate(p.file.name);
        return d && d.isValid() && isTaskComplete(p, item.terms);
    });
    const done = completedPages.filter(p => {
        const d = parseAnyDate(p.file.name);
        return d.isBetween(weekStart, weekEnd, null, "[]");
    }).length;
    const sortedDates = completedPages.map(p => parseAnyDate(p.file.name)).filter(d => d && d.isValid() && d.isSameOrBefore(today)).array().sort((a, b) => b.diff(a));
    let streak = 0;
    if (sortedDates.length > 0 && today.diff(sortedDates[0], 'days') <= 2) {
        for (let i = 0; i < sortedDates.length; i++) {
            streak++;
            if (i < sortedDates.length - 1 && sortedDates[i].diff(sortedDates[i+1], 'days') > 3) break;
        }
    }
    return { ...item, done, streak, progress: Math.min(done / item.target, 1) };
});


// ---------- RENDER ----------
const container = dv.el("div", "", { attr: { style: `display: flex; flex-direction: column; align-items: center; padding: 20px;` } });
// Header
const header = dv.el("div", "", { attr: { style: `text-align: center; margin-bottom: 30px;` } });
header.appendChild(dv.el("div", "Athkar Performance", { attr: { style: `font-size: 1.3em; font-weight: 300; color: var(--text-muted); letter-spacing: 0.1em;` } }));
header.appendChild(dv.el("div", `Week ${today.isoWeek()} (${today.format("YYYY")})`, { attr: { style: `font-size: 0.8em; color: var(--text-faint);` } }));
container.appendChild(header);

const canvas = document.createElement("canvas");
canvas.width = 500; canvas.height = 500;
canvas.style.maxWidth = "100%";
const ctx = canvas.getContext("2d");
const centerX = 250; const centerY = 250; const maxRadius = 160;

// Background Circles
ctx.strokeStyle = "rgba(128, 128, 128, 0.1)";
for (let i = 1; i <= 5; i++) {
    ctx.beginPath(); ctx.arc(centerX, centerY, (maxRadius / 5) * i, 0, Math.PI * 2); ctx.stroke();
}

// Progress Polygon
ctx.save(); // <--- Save state (remembers default colors/alpha)
ctx.fillStyle = "rgba(99, 102, 241, 0.15)";
ctx.strokeStyle = "rgba(99, 102, 241, 0.8)";
ctx.lineWidth = 3;
ctx.beginPath();
data.forEach((item, i) => {
    const angle = (Math.PI * 2 * i) / data.length - Math.PI / 2;
    const r = maxRadius * item.progress;
    const x = centerX + Math.cos(angle) * r;
    const y = centerY + Math.sin(angle) * r;
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
});
ctx.closePath(); 
ctx.fill(); 
ctx.stroke();
ctx.restore(); // <--- Restore state (wipes out the purple transparency/stroke)

// Labels
data.forEach((item, i) => {
    const angle = (Math.PI * 2 * i) / data.length - Math.PI / 2;
    const x = centerX + Math.cos(angle) * (maxRadius + 45);
    const y = centerY + Math.sin(angle) * (maxRadius + 45);
    
    ctx.textAlign = "center";
    ctx.beginPath(); // Ensure no lingering paths affect the text

    // 1. Draw icon - Explicitly set color INSIDE the loop for every item
    ctx.fillStyle = "var(--text-normal)"; 
    ctx.font = "18px sans-serif"; 
    ctx.fillText(item.icon, x, y - 15);
    
    // 2. Draw streak
    ctx.font = "bold 11px sans-serif"; 
    ctx.fillStyle = item.streak > 2 ? "#10b981" : "#ef4444";
    ctx.fillText(`${item.streak}🔥`, x, y);
    
    // 3. Draw label
    ctx.font = "10px sans-serif"; 
    ctx.fillStyle = "var(--text-muted)";
    ctx.fillText(item.label, x, y + 12);
});
container.appendChild(canvas);
```

```dataviewjs
// ------------------ CONFIG ------------------
const items = [
    { icon: "📘", label: "Learn English", term: "تعلم الانجليزية", target: 7 },
    { icon: "🎨", label: "Hobby / Relax", term: "خوض تجربة مفيدة", target: 7 },
    { icon: "🎥", label: "Learn Skill", term: "تعلم مهارة عن طريق مشاهدة", target: 7 },
];

// ------------------ HELPERS ------------------
// تحويل اسم الملف إلى تاريخ
function parseDate(fileName) {
    const match = fileName.match(/\d{4}-\d{2}-\d{2}/);
    if (match) return moment(match[0], "YYYY-MM-DD");
    return null;
}

// التحقق من إنجاز المهمة داخل الصفحة
function isTaskComplete(page, term) {
    return page.file.tasks?.some(t => t.completed && t.text.includes(term)) || false;
}

// ------------------ DATA PROCESSING ------------------
const allPages = dv.pages('"003 Daily/001 Active Diaries"');
const today = moment().startOf('day');
const weekStart = today.clone().startOf('isoWeek');
const weekEnd = today.clone().endOf('isoWeek');

const data = items.map(item => {
    const completedPages = allPages.filter(p => {
        const d = parseDate(p.file.name);
        return d && d.isValid() && isTaskComplete(p, item.term);
    });

    const done = completedPages.filter(p => {
        const d = parseDate(p.file.name);
        return d.isBetween(weekStart, weekEnd, null, "[]");
    }).length;

    const sortedDates = completedPages
        .map(p => parseDate(p.file.name))
        .filter(d => d && d.isValid() && d.isSameOrBefore(today))
        .sort((a, b) => {
        // Ensure both a and b are valid moment objects before diff
        if (a && b && a.isValid && b.isValid) {
            return b.diff(a);
        }
        return 0; // If invalid, treat as equal
    });

    let streak = 0;
    if (sortedDates.length > 0 && today.diff(sortedDates[0], 'days') <= 2) {
        for (let i = 0; i < sortedDates.length; i++) {
            streak++;
            if (i < sortedDates.length - 1 && sortedDates[i].diff(sortedDates[i+1], 'days') > 3) break;
        }
    }

    return { ...item, done, streak, progress: Math.min(done / item.target, 1) };
});

// ------------------ RENDER ------------------
const container = dv.el("div", "", { attr: { style: `display: flex; flex-direction: column; align-items: center; padding: 20px;` } });

// Header
const header = dv.el("div", "", { attr: { style: `text-align: center; margin-bottom: 30px;` } });
header.appendChild(dv.el("div", "Tasks Performance", { attr: { style: `font-size: 1.3em; font-weight: 300; color: var(--text-muted); letter-spacing: 0.1em;` } }));
header.appendChild(dv.el("div", `Week ${today.isoWeek()} (${today.format("YYYY")})`, { attr: { style: `font-size: 0.8em; color: var(--text-faint);` } }));
container.appendChild(header);

// Canvas
const canvas = document.createElement("canvas");
canvas.width = 500;
canvas.height = 500;
canvas.style.maxWidth = "100%";
const ctx = canvas.getContext("2d");
const centerX = 250; const centerY = 250; const maxRadius = 160;

// Background Circles
ctx.strokeStyle = "rgba(128, 128, 128, 0.1)";
for (let i = 1; i <= 5; i++) {
    ctx.beginPath(); 
    ctx.arc(centerX, centerY, (maxRadius / 5) * i, 0, Math.PI * 2); 
    ctx.stroke();
}

// Progress Polygon
ctx.save();
ctx.fillStyle = "rgba(99, 102, 241, 0.15)";
ctx.strokeStyle = "rgba(99, 102, 241, 0.8)";
ctx.lineWidth = 3;
ctx.beginPath();
data.forEach((item, i) => {
    const angle = (Math.PI * 2 * i) / data.length - Math.PI / 2;
    const r = maxRadius * item.progress;
    const x = centerX + Math.cos(angle) * r;
    const y = centerY + Math.sin(angle) * r;
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
});
ctx.closePath();
ctx.fill();
ctx.stroke();
ctx.restore();

// Labels
data.forEach((item, i) => {
    const angle = (Math.PI * 2 * i) / data.length - Math.PI / 2;
    const x = centerX + Math.cos(angle) * (maxRadius + 45);
    const y = centerY + Math.sin(angle) * (maxRadius + 45);

    ctx.textAlign = "center";
    ctx.beginPath();

    // 1. Icon
    ctx.fillStyle = "var(--text-normal)";
    ctx.font = "18px sans-serif";
    ctx.fillText(item.icon, x, y - 15);

    // 2. Streak
    ctx.font = "bold 11px sans-serif";
    ctx.fillStyle = item.streak > 2 ? "#10b981" : "#ef4444";
    ctx.fillText(`${item.streak}🔥`, x, y);

    // 3. Label
    ctx.font = "10px sans-serif";
    ctx.fillStyle = "var(--text-muted)";
    ctx.fillText(item.label, x, y + 12);
});

container.appendChild(canvas);
```