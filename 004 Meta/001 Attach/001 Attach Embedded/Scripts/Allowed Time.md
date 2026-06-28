---
icon: lucide-timer-off
---
<!--```dataviewjs
const targetFolder = "003 Daily/001 Active Diaries";
const defaultTime = 10; 

const customRules = [
    { term: "صلاة", time: 15 },
    { term: "قراءة [[Quran|القرآن الكريم]]", time: 15 },
    { term: "حفظ", time: 30 }
];

const todayStr = moment().format("YYYY-MM-DD");
const filePath = `${targetFolder}/${todayStr}.md`;
const page = dv.page(filePath);

if (!page) {} 
else {
    const completedTasks = page.file.tasks.where(t => t.completed);
    
    let totalRestTime = 0;
    for (let task of completedTasks) {
        let taskTime = defaultTime;
        
        for (let rule of customRules) {
            if (task.text.includes(rule.term)) {
                taskTime = rule.time;
                break;
            }
        }
        totalRestTime += taskTime;
    }

dv.paragraph(`- **عدد المهمات المنجزة:** ${completedTasks.length}\n- **إجمالي الوقت المستحق:** ${totalRestTime} دقيقة`);
}
```--
```dataviewjs
const targetFolder = "003 Daily/001 Active Diaries";
const defaultTime = 10; 

const customRules = [
    { term: "صلاة", time: 15 },
    { term: "قراءة [[Quran|القرآن الكريم]]", time: 15 },
    { term: "حفظ", time: 30 }
];

const actionTaskCosts = {
    "gum": { name: "شراء علكة", cost: 2 },
    "nuts": { name: "شراء مكسرات", cost: 2 },
    "icecream": { name: "شراء آيس كريم", cost: 6 },
    "juice": { name: "شراء عصير مجمد", cost: 3 },
    "new_exp": { name: "خوض تجربة جديدة", cost: 1 },
    "hobby": { name: "ممارسة هواية ممتعة", cost: 1 },
    "shower": { name: "أخذ شاور بارد", cost: 3 }
};

const audioPath = app.vault.adapter.getResourcePath("004 Meta/001 Attach/002 Attachment media/SNDs/Sounds/P Assets/end.m4a");

const todayStr = moment().format("YYYY-MM-DD");
const filePath = `${targetFolder}/${todayStr}.md`;
const page = dv.page(filePath);

if (!page) {
    dv.paragraph("⚠️ لم يتم العثور على ملف يوميات اليوم بعد.");
} else {
    // ═══════════════════════════════════════════════════════════════
    // الحل الجذري: تخزين الـ state في window بمفتاح فريد لليوم
    // هذا يضمن بقاء البيانات حتى عند إعادة رسم Dataview للمكوّن
    // ═══════════════════════════════════════════════════════════════
    const STATE_KEY = `rewards_panel_state_${todayStr}`;
    const CONTAINER_KEY = `rewards_panel_container_${todayStr}`;

    // حساب القيم من الملف (تُستخدم فقط عند الإنشاء الأول)
    const completedTasks = page.file.tasks.where(t => t.completed);
    const initialTasksCount = completedTasks.length;

    let initialRestTime = 0;
    for (let task of completedTasks) {
        let taskTime = defaultTime;
        for (let rule of customRules) {
            if (task.text.includes(rule.term)) {
                taskTime = rule.time;
                break;
            }
        }
        initialRestTime += taskTime;
    }

    // إذا لم يوجد state محفوظ → أنشئه من بيانات الملف
    // إذا وُجد → استخدمه كما هو (يحافظ على التعديلات السابقة)
    if (!window[STATE_KEY]) {
        window[STATE_KEY] = {
            totalTime: initialRestTime,
            totalTasks: initialTasksCount,
            videoTime: 5,
            gameTime: 5,
            panelOpen: false,
            interval: null,
            gameIcons: {}
        };
    }

    const state = window[STATE_KEY];

    const gamesData = [
        { name: "cookie run", pkg: "com.devsisters.ck" },
        { name: "rpg vanilla", pkg: "com.grimdev.grimquest" },
        { name: "underdark", pkg: "com.FreeDust.UnderDark" },
        { name: "ragdol fists", pkg: "com.lonriv.radofists" },
        { name: "warrior un", pkg: "com.GamerMind.Warriors_of_the_Universe_Online" },
        { name: "Yugi yo lins", pkg: "jp.konami.duellinks" },
        { name: "Boom birdS", pkg: "com.tuokio.boomslingers" },
        { name: "Alto relaxing", pkg: "com.noodlecake.altosodyssey" }
    ];

    async function fetchPlayStoreIcon(pkg) {
        try {
            const url = `https://play.google.com/store/apps/details?id=${pkg}`;
            const response = await requestUrl({ url: url, method: 'GET' });
            const htmlText = response.text;
            const match = htmlText.match(/<meta[^>]*property=["']og:image["'][^>]*content=["']([^"']+)["']/i) || 
                          htmlText.match(/<meta[^>]*content=["']([^"']+)["'][^>]*property=["']og:image["']/i);
            if (match && match[1]) return match[1];
        } catch (e) {
            console.error("خطأ في جلب أيقونة الحزمة: " + pkg, e);
        }
        return 'https://cdn-icons-png.flaticon.com/512/3408/3408506.png'; 
    }

    // ═══════════════════════════════════════════════════════════════
    // إنشاء الـ DOM مرة واحدة فقط وتخزينه في window
    // عند إعادة رسم Dataview نعيد إضافة نفس العنصر بدلاً من إعادة بنائه
    // ═══════════════════════════════════════════════════════════════
    let viewContainer;
    const dvContainer = dv.el("div", "");

    if (window[CONTAINER_KEY] && document.body.contains(window[CONTAINER_KEY])) {
        // العنصر موجود وحيّ → أعد تعليقه فقط
        viewContainer = window[CONTAINER_KEY];
        dvContainer.appendChild(viewContainer);
        updateTextUI(); // فقط حدّث النصوص لتعكس الـ state الحالي
    } else {
        // أول تشغيل أو بعد إغلاق وإعادة فتح الملف → ابنِ الـ DOM من الصفر
        viewContainer = document.createElement("div");
        window[CONTAINER_KEY] = viewContainer;
        dvContainer.appendChild(viewContainer);

        viewContainer.innerHTML = `
            <div style="background: var(--background-secondary); padding: 15px; border-radius: 8px; margin-bottom: 15px; display:grid; grid-template-columns: 1fr 1fr; gap:10px;">
                <div style="border-left: 3px solid var(--interactive-accent); padding-left:10px; text-align:right;">
                    <p style="margin:0; font-size:13px; color:var(--text-muted);">🎯 المهمات المتاحة:</p>
                    <p style="margin:5px 0 0 0; font-size:20px; font-weight:bold; color:var(--interactive-accent);"><span class="ui-tasks">${state.totalTasks}</span> مهمة</p>
                </div>
                <div style="text-align:right;">
                    <p style="margin:0; font-size:13px; color:var(--text-muted);">⏳ وقت الترفيه المتاح:</p>
                    <p style="margin:5px 0 0 0; font-size:20px; font-weight:bold; color:var(--text-accent);"><span class="ui-time">${state.totalTime}</span> دقيقة</p>
                </div>
            </div>

            <button class="ui-toggle-btn" style="width:100%; padding:10px; font-weight:bold; background:var(--interactive-accent); color:white; border-radius:6px; margin-bottom:15px; cursor:pointer;">✨ فتح لوحة المقايضة والترفيه</button>

            <div class="ui-trading-panel" style="display: none;">
                
                <div style="border: 1px solid var(--background-modifier-border); padding: 12px; border-radius: 6px; margin-bottom: 12px;">
                    <h4 style="margin-top:0;">📺 مشاهدة الفيديوهات</h4>
                    <div style="display:flex; align-items:center; gap: 12px;">
                        <button class="video-minus" style="padding:4px 12px;">-</button>
                        <span style="font-weight:bold; font-size:16px;"><span class="ui-video-time">${state.videoTime}</span> دقيقة</span>
                        <button class="video-plus" style="padding:4px 12px;">+</button>
                        <button class="video-start" style="background:var(--text-accent); color:white; margin-right:auto; padding:6px 12px; cursor:pointer;">بدء المشاهدة</button>
                    </div>
                </div>

                <div style="border: 1px solid var(--background-modifier-border); padding: 12px; border-radius: 6px; margin-bottom: 12px;">
                    <h4 style="margin-top:0;">🎮 الألعاب المتاحة</h4>
                    <div style="margin-bottom:15px; display:flex; align-items:center; gap:12px; background:var(--background-primary); padding:8px; border-radius:6px;">
                        <span>⏱️ حدد وقت اللعب:</span>
                        <button class="game-minus" style="padding:2px 10px;">-</button>
                        <span style="font-weight:bold;"><span class="ui-game-time">${state.gameTime}</span> دقيقة</span>
                        <button class="game-plus" style="padding:2px 10px;">+</button>
                    </div>
                    <div class="ui-games-grid" style="display: grid; grid-template-columns: repeat(auto-fill, minmax(110px, 1fr)); gap: 12px;">
                        ${gamesData.map(g => `
                            <div style="text-align:center; background:var(--background-primary); padding:8px; border-radius:6px; border:1px solid var(--background-modifier-border); display:flex; flex-direction:column; justify-content:space-between; align-items:center;">
                                <a href="android-app://${g.pkg}" style="display:block; text-decoration:none; margin-bottom:5px;">
                                    <img id="icon-${g.pkg.replace(/\./g, '-')}" src="${state.gameIcons[g.pkg] || 'https://cdn-icons-png.flaticon.com/512/3408/3408506.png'}" style="width:54px; height:54px; border-radius:12px; object-fit:cover; border:1px solid rgba(0,0,0,0.1);" title="${g.name}" />
                                </a>
                                <div style="font-size:11px; font-weight:bold; color:var(--text-normal); height:32px; overflow:hidden;">${g.name}</div>
                                <button class="play-btn" data-pkg="${g.pkg}" style="font-size:10px; padding:4px 2px; margin-top:8px; width:100%; cursor:pointer;">ابدأ اللعب</button>
                            </div>
                        `).join('')}
                    </div>
                </div>

                <div style="border: 1px solid var(--background-modifier-border); padding: 12px; border-radius: 6px; margin-bottom: 12px;">
                    <h4 style="margin-top:0;">🛒 المكافئات المتاحة</h4>
                    <div class="ui-actions-grid" style="display:grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap:8px;">
                        ${Object.keys(actionTaskCosts).map(key => `
                            <button class="act-btn" data-key="${key}" style="text-align:right; padding:8px; font-size:12px; cursor:pointer;">🔹 ${actionTaskCosts[key].name} (خصم ${actionTaskCosts[key].cost} مهمة)</button>
                        `).join('')}
                    </div>
                </div>

                <div class="countdown-box" style="display:none; background: var(--text-selection); padding:15px; border-radius:6px; font-weight:bold; text-align:center; margin-top:10px; border:1px solid var(--interactive-accent);">
                    ⏳ الجلسة نشطة! متبقي: <span class="clock-display" style="font-size:18px; color:var(--text-accent);">00:00</span>
                </div>
            </div>
        `;

        // ═══════════════════════════════════════════════════════
        // تسجيل الأحداث مرة واحدة فقط على العنصر الثابت
        // استخدام { once: false } ضمنياً لأننا نسجّل على viewContainer
        // الذي يبقى نفسه، فلا تتراكم listeners عند re-render
        // ═══════════════════════════════════════════════════════
        viewContainer.addEventListener("click", (e) => {
            const target = e.target;

            if (target.classList.contains("ui-toggle-btn")) {
                state.panelOpen = !state.panelOpen;
                updateTextUI();
            } 
            else if (target.classList.contains("video-minus")) {
                state.videoTime = Math.max(5, state.videoTime - 5);
                updateTextUI();
            } 
            else if (target.classList.contains("video-plus")) {
                state.videoTime += 5;
                updateTextUI();
            } 
            else if (target.classList.contains("game-minus")) {
                state.gameTime = Math.max(5, state.gameTime - 5);
                updateTextUI();
            } 
            else if (target.classList.contains("game-plus")) {
                state.gameTime += 5;
                updateTextUI();
            } 
            else if (target.classList.contains("video-start")) {
                startActivity('video', 'android-app://net.waterfox.android.release', state.videoTime);
            } 
            else if (target.classList.contains("play-btn")) {
                const pkg = target.getAttribute("data-pkg");
                startActivity('game', `android-app://${pkg}`, state.gameTime);
            } 
            else if (target.classList.contains("act-btn")) {
                const key = target.getAttribute("data-key");
                const act = actionTaskCosts[key];
                if (state.totalTasks < act.cost) {
                    alert(`❌ رصيد المهمات غير كافٍ! تحتاج إلى ${act.cost} مهمات لهذه المقايضة.`);
                    return;
                }
                state.totalTasks -= act.cost;
                alert(`🛒 تم تسجيل مقايضة (${act.name}) بنجاح!`);
                updateTextUI();
            }
        });

        // جلب الأيقونات مرة واحدة فقط عند الإنشاء
        loadAllIcons();
    }

    // ═══════════════════════════════════════════════════════════════
    // دوال مشتركة (تعمل سواء كان العنصر جديداً أو معاداً استخدامه)
    // ═══════════════════════════════════════════════════════════════

    function updateTextUI() {
        viewContainer.querySelector(".ui-tasks").innerText = state.totalTasks;
        viewContainer.querySelector(".ui-time").innerText = state.totalTime;
        viewContainer.querySelector(".ui-video-time").innerText = state.videoTime;
        viewContainer.querySelector(".ui-game-time").innerText = state.gameTime;
        
        const panel = viewContainer.querySelector(".ui-trading-panel");
        const toggleBtn = viewContainer.querySelector(".ui-toggle-btn");
        
        if (state.panelOpen) {
            panel.style.display = "block";
            toggleBtn.innerText = "🔼 إخفاء لوحة المقايضة";
        } else {
            panel.style.display = "none";
            toggleBtn.innerText = "✨ فتح لوحة المقايضة والترفيه";
        }
    }

    function startActivity(type, url, minutes) {
        if (state.totalTime < minutes) {
            alert("❌ رصيد الدقائق المتاحة لديك لا يكفي لهذه المدة!");
            return;
        }
        
        state.totalTime -= minutes;
        updateTextUI(); 
        
        window.open(url);
        
        // إلغاء أي مؤقت سابق قبل بدء جديد
        if (state.interval) {
            clearInterval(state.interval);
            state.interval = null;
        }
        
        const countBox = viewContainer.querySelector(".countdown-box");
        const clockDisp = viewContainer.querySelector(".clock-display");
        if (countBox) countBox.style.display = "block";
        
        let secondsLeft = minutes * 60;
        state.interval = setInterval(() => {
            secondsLeft--;
            let mins = Math.floor(secondsLeft / 60);
            let secs = secondsLeft % 60;
            if (clockDisp) clockDisp.innerText = `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
            
            if (secondsLeft <= 0) {
                clearInterval(state.interval);
                state.interval = null;
                if (clockDisp) clockDisp.innerText = "00:00";
                alert("🛑 انتهى وقت الترفيه المسموح! حان وقت العودة للإنتاجية.");
                
                let audio = new Audio(audioPath);
                audio.play().catch(e => console.log("Audio play blocked: ", e));
            }
        }, 1000);
    }

    async function loadAllIcons() {
        gamesData.forEach(async (g) => {
            // لا تجلب مجدداً إذا كانت الأيقونة محفوظة مسبقاً في الـ state
            if (state.gameIcons[g.pkg]) {
                const imgEl = viewContainer.querySelector(`#icon-${g.pkg.replace(/\./g, '-')}`);
                if (imgEl) imgEl.src = state.gameIcons[g.pkg];
                return;
            }
            const iconUrl = await fetchPlayStoreIcon(g.pkg);
            state.gameIcons[g.pkg] = iconUrl;
            const imgEl = viewContainer.querySelector(`#icon-${g.pkg.replace(/\./g, '-')}`);
            if (imgEl) imgEl.src = iconUrl;
        });
    }
}
```--
```dataviewjs
const targetFolder = "003 Daily/001 Active Diaries";
const defaultTime = 10; 

const customRules = [
    { term: "صلاة", time: 15 },
    { term: "قراءة [[Quran|القرآن الكريم]]", time: 15 },
    { term: "حفظ", time: 30 }
];

const actionTaskCosts = {
    "gum": { name: "شراء علكة", cost: 2 },
    "nuts": { name: "شراء مكسرات", cost: 2 },
    "icecream": { name: "شراء آيس كريم", cost: 6 },
    "juice": { name: "شراء عصير مجمد", cost: 3 },
    "new_exp": { name: "خوض تجربة جديدة", cost: 1 },
    "hobby": { name: "ممارسة هواية ممتعة", cost: 1 },
    "shower": { name: "أخذ شاور بارد", cost: 3 }
};

const audioPath = app.vault.adapter.getResourcePath("004 Meta/001 Attach/002 Attachment media/SNDs/Sounds/P Assets/end.m4a");

const todayStr = moment().format("YYYY-MM-DD");
const filePath = `${targetFolder}/${todayStr}.md`;
const page = dv.page(filePath);

if (!page) {
    dv.paragraph("⚠️ لم يتم العثور على ملف يوميات اليوم بعد.");
} else {
    // ═══════════════════════════════════════════════════════════════
    // الحل الجذري: تخزين الـ state في window بمفتاح فريد لليوم
    // هذا يضمن بقاء البيانات حتى عند إعادة رسم Dataview للمكوّن
    // ═══════════════════════════════════════════════════════════════
    const STATE_KEY = `rewards_panel_state_${todayStr}`;
    const CONTAINER_KEY = `rewards_panel_container_${todayStr}`;

    // حساب القيم من الملف (تُستخدم فقط عند الإنشاء الأول)
    const completedTasks = page.file.tasks.where(t => t.completed);
    const initialTasksCount = completedTasks.length;

    let initialRestTime = 0;
    for (let task of completedTasks) {
        let taskTime = defaultTime;
        for (let rule of customRules) {
            if (task.text.includes(rule.term)) {
                taskTime = rule.time;
                break;
            }
        }
        initialRestTime += taskTime;
    }

    // إذا لم يوجد state محفوظ → أنشئه من بيانات الملف
    // إذا وُجد → استخدمه كما هو (يحافظ على التعديلات السابقة)
    if (!window[STATE_KEY]) {
        window[STATE_KEY] = {
            totalTime: initialRestTime,
            totalTasks: initialTasksCount,
            videoTime: 5,
            gameTime: 5,
            panelOpen: false,
            interval: null,
            gameIcons: {}
        };
    }

    const state = window[STATE_KEY];

    const gamesData = [
        { name: "cookie run", pkg: "com.devsisters.ck" },
        { name: "rpg vanilla", pkg: "com.grimdev.grimquest" },
        { name: "underdark", pkg: "com.FreeDust.UnderDark" },
        { name: "ragdol fists", pkg: "com.lonriv.radofists" },
        { name: "warrior un", pkg: "com.GamerMind.Warriors_of_the_Universe_Online" },
        { name: "Yugi yo lins", pkg: "jp.konami.duellinks" },
        { name: "Boom birdS", pkg: "com.tuokio.boomslingers" },
        { name: "Alto relaxing", pkg: "com.noodlecake.altosodyssey" }
    ];

    async function fetchPlayStoreIcon(pkg) {
        try {
            const url = `https://play.google.com/store/apps/details?id=${pkg}`;
            const response = await requestUrl({ url: url, method: 'GET' });
            const htmlText = response.text;
            const match = htmlText.match(/<meta[^>]*property=["']og:image["'][^>]*content=["']([^"']+)["']/i) || 
                          htmlText.match(/<meta[^>]*content=["']([^"']+)["'][^>]*property=["']og:image["']/i);
            if (match && match[1]) return match[1];
        } catch (e) {
            console.error("خطأ في جلب أيقونة الحزمة: " + pkg, e);
        }
        return 'https://cdn-icons-png.flaticon.com/512/3408/3408506.png'; 
    }

    // ═══════════════════════════════════════════════════════════════
    // إنشاء الـ DOM مرة واحدة فقط وتخزينه في window
    // عند إعادة رسم Dataview نعيد إضافة نفس العنصر بدلاً من إعادة بنائه
    // ═══════════════════════════════════════════════════════════════
    let viewContainer;
    const dvContainer = dv.el("div", "");

    if (window[CONTAINER_KEY] && document.body.contains(window[CONTAINER_KEY])) {
        // العنصر موجود وحيّ → أعد تعليقه فقط
        viewContainer = window[CONTAINER_KEY];
        dvContainer.appendChild(viewContainer);
        updateTextUI(); // فقط حدّث النصوص لتعكس الـ state الحالي
    } else {
        // أول تشغيل أو بعد إغلاق وإعادة فتح الملف → ابنِ الـ DOM من الصفر
        viewContainer = document.createElement("div");
        window[CONTAINER_KEY] = viewContainer;
        dvContainer.appendChild(viewContainer);

        viewContainer.innerHTML = `
            <div class="custom-popup-overlay" style="display:none; position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.5); z-index:9999; align-items:center; justify-content:center;">
                <div style="background:var(--background-primary); padding:20px; border-radius:10px; width:85%; max-width:350px; text-align:center; border:2px solid var(--interactive-accent); box-shadow:0 4px 15px rgba(0,0,0,0.3);">
                    <p class="popup-message" style="font-size:15px; font-weight:bold; margin-bottom:15px; color:var(--text-normal);"></p>
                    <button class="popup-close-btn" style="background:var(--interactive-accent); color:white; border:none; padding:8px 25px; border-radius:5px; cursor:pointer; font-weight:bold;">حسناً</button>
                </div>
            </div>

            <div style="background: var(--background-secondary); padding: 15px; border-radius: 8px; margin-bottom: 15px; display:grid; grid-template-columns: 1fr 1fr; gap:10px;">
                <div style="border-left: 3px solid var(--interactive-accent); padding-left:10px; text-align:right;">
                    <p style="margin:0; font-size:13px; color:var(--text-muted);">🎯 المهمات المتاحة:</p>
                    <p style="margin:5px 0 0 0; font-size:20px; font-weight:bold; color:var(--interactive-accent);"><span class="ui-tasks">${state.totalTasks}</span> مهمة</p>
                </div>
                <div style="text-align:right;">
                    <p style="margin:0; font-size:13px; color:var(--text-muted);">⏳ وقت الترفيه المتاح:</p>
                    <p style="margin:5px 0 0 0; font-size:20px; font-weight:bold; color:var(--text-accent);"><span class="ui-time">${state.totalTime}</span> دقيقة</p>
                </div>
            </div>

            <button class="ui-toggle-btn" style="width:100%; padding:10px; font-weight:bold; background:var(--interactive-accent); color:white; border-radius:6px; margin-bottom:15px; cursor:pointer;">✨ فتح لوحة المقايضة والترفيه</button>

            <div class="ui-trading-panel" style="display: none;">
                
                <div style="border: 1px solid var(--background-modifier-border); padding: 12px; border-radius: 6px; margin-bottom: 12px;">
                    <h4 style="margin-top:0;">📺 مشاهدة الفيديوهات</h4>
                    <div style="display:flex; align-items:center; gap: 12px;">
                        <button class="video-minus" style="padding:4px 12px;">-</button>
                        <span style="font-weight:bold; font-size:16px;"><span class="ui-video-time">${state.videoTime}</span> دقيقة</span>
                        <button class="video-plus" style="padding:4px 12px;">+</button>
                        <button class="video-start" style="background:var(--text-accent); color:white; margin-right:auto; padding:6px 12px; cursor:pointer;">بدء المشاهدة</button>
                    </div>
                </div>

                <div style="border: 1px solid var(--background-modifier-border); padding: 12px; border-radius: 6px; margin-bottom: 12px;">
                    <h4 style="margin-top:0;">🎮 الألعاب المتاحة</h4>
                    <div style="margin-bottom:15px; display:flex; align-items:center; gap:12px; background:var(--background-primary); padding:8px; border-radius:6px;">
                        <span>⏱️ حدد وقت اللعب:</span>
                        <button class="game-minus" style="padding:2px 10px;">-</button>
                        <span style="font-weight:bold;"><span class="ui-game-time">${state.gameTime}</span> دقيقة</span>
                        <button class="game-plus" style="padding:2px 10px;">+</button>
                    </div>
                    <div class="ui-games-grid" style="display: grid; grid-template-columns: repeat(auto-fill, minmax(110px, 1fr)); gap: 12px;">
                        ${gamesData.map(g => `
                            <div style="text-align:center; background:var(--background-primary); padding:8px; border-radius:6px; border:1px solid var(--background-modifier-border); display:flex; flex-direction:column; justify-content:space-between; align-items:center;">
                                <a href="android-app://${g.pkg}" style="display:block; text-decoration:none; margin-bottom:5px;">
                                    <img id="icon-${g.pkg.replace(/\./g, '-')}" src="${state.gameIcons[g.pkg] || 'https://cdn-icons-png.flaticon.com/512/3408/3408506.png'}" style="width:54px; height:54px; border-radius:12px; object-fit:cover; border:1px solid rgba(0,0,0,0.1);" title="${g.name}" />
                                </a>
                                <div style="font-size:11px; font-weight:bold; color:var(--text-normal); height:32px; overflow:hidden;">${g.name}</div>
                                <button class="play-btn" data-pkg="${g.pkg}" style="font-size:10px; padding:4px 2px; margin-top:8px; width:100%; cursor:pointer;">ابدأ اللعب</button>
                            </div>
                        `).join('')}
                    </div>
                </div>

                <div style="border: 1px solid var(--background-modifier-border); padding: 12px; border-radius: 6px; margin-bottom: 12px;">
                    <h4 style="margin-top:0;">🛒 المكافئات المتاحة</h4>
                    <div class="ui-actions-grid" style="display:grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap:8px;">
                        ${Object.keys(actionTaskCosts).map(key => `
                            <button class="act-btn" data-key="${key}" style="text-align:right; padding:8px; font-size:12px; cursor:pointer;">🔹 ${actionTaskCosts[key].name} (خصم ${actionTaskCosts[key].cost} مهمة)</button>
                        `).join('')}
                    </div>
                </div>
            </div>
        `;

        // ═══════════════════════════════════════════════════════
        // تسجيل الأحداث مرة واحدة فقط على العنصر الثابت
        // استخدام { once: false } ضمنياً لأننا نسجّل على viewContainer
        // الذي يبقى نفسه، فلا تتراكم listeners عند re-render
        // ═══════════════════════════════════════════════════════
        viewContainer.addEventListener("click", (e) => {
            const target = e.target;

            if (target.classList.contains("ui-toggle-btn")) {
                state.panelOpen = !state.panelOpen;
                updateTextUI();
            } 
            else if (target.classList.contains("popup-close-btn")) {
                viewContainer.querySelector(".custom-popup-overlay").style.display = "none";
            }
            else if (target.classList.contains("video-minus")) {
                state.videoTime = Math.max(5, state.videoTime - 5);
                updateTextUI();
            } 
            else if (target.classList.contains("video-plus")) {
                state.videoTime += 5;
                updateTextUI();
            } 
            else if (target.classList.contains("game-minus")) {
                state.gameTime = Math.max(5, state.gameTime - 5);
                updateTextUI();
            } 
            else if (target.classList.contains("game-plus")) {
                state.gameTime += 5;
                updateTextUI();
            } 
            else if (target.classList.contains("video-start")) {
                startActivity('video', 'android-app://net.waterfox.android.release', state.videoTime);
            } 
            else if (target.classList.contains("play-btn")) {
                const pkg = target.getAttribute("data-pkg");
                startActivity('game', `android-app://${pkg}`, state.gameTime);
            } 
            else if (target.classList.contains("act-btn")) {
                const key = target.getAttribute("data-key");
                const act = actionTaskCosts[key];
                if (state.totalTasks < act.cost) {
                    showPopup(`❌ رصيد المهمات غير كافٍ! تحتاج إلى ${act.cost} مهمات لهذه المقايضة.`);
                    return;
                }
                state.totalTasks -= act.cost;
                new Notice(`🛒 تم تسجيل مقايضة (${act.name}) بنجاح!`);
                updateTextUI();
            }
        });

        // جلب الأيقونات مرة واحدة فقط عند الإنشاء
        loadAllIcons();
    }

    // دالة مخصصة لإظهار النوافذ المنبثقة بشكل انسيابي دون تعطيل الأكواد
    function showPopup(message) {
        const overlay = viewContainer.querySelector(".custom-popup-overlay");
        const msgEl = viewContainer.querySelector(".popup-message");
        if (overlay && msgEl) {
            msgEl.innerText = message;
            overlay.style.display = "flex";
        }
    }

    // ═══════════════════════════════════════════════════════════════
    // دوال مشتركة (تعمل سواء كان العنصر جديداً أو معاداً استخدامه)
    // ═══════════════════════════════════════════════════════════════

    function updateTextUI() {
        viewContainer.querySelector(".ui-tasks").innerText = state.totalTasks;
        viewContainer.querySelector(".ui-time").innerText = state.totalTime;
        viewContainer.querySelector(".ui-video-time").innerText = state.videoTime;
        viewContainer.querySelector(".ui-game-time").innerText = state.gameTime;
        
        const panel = viewContainer.querySelector(".ui-trading-panel");
        const toggleBtn = viewContainer.querySelector(".ui-toggle-btn");
        
        if (state.panelOpen) {
            panel.style.display = "block";
            toggleBtn.innerText = "🔼 إخفاء لوحة المقايضة";
        } else {
            panel.style.display = "none";
            toggleBtn.innerText = "✨ فتح لوحة المقايضة والترفيه";
        }
    }

    async function startActivity(type, url, minutes) {
        if (state.totalTime < minutes) {
            showPopup("❌ رصيد الدقائق المتاحة لديك لا يكفي لهذه المدة!");
            return;
        }
        
        state.totalTime -= minutes;
        updateTextUI(); 
        
        // ═══════════════════════════════════════════════════════════════
        // كتابة القيمة (المقاسة بالدقائق فقط) كـ Overwrite داخل مجلد .obsidian
        // ═══════════════════════════════════════════════════════════════
        try {
            await app.vault.adapter.write(".obsidian/timer.txt", minutes.toString());
        } catch (err) {
            console.error("خطأ أثناء الكتابة في ملف التوقيت: ", err);
        }

        window.open(url);
        
        // إلغاء أي مؤقت سابق قبل بدء جديد
        if (state.interval) {
            clearInterval(state.interval);
            state.interval = null;
        }
        
        const countBox = viewContainer.querySelector(".countdown-box");
        const clockDisp = viewContainer.querySelector(".clock-display");
        if (countBox) countBox.style.display = "block";
        
        let secondsLeft = minutes * 60;
        state.interval = setInterval(() => {
            secondsLeft--;
            let mins = Math.floor(secondsLeft / 60);
            let secs = secondsLeft % 60;
            if (clockDisp) clockDisp.innerText = `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
            
            if (secondsLeft <= 0) {
                clearInterval(state.interval);
                state.interval = null;
                if (clockDisp) clockDisp.innerText = "00:00";
                showPopup("🛑 انتهى وقت الترفيه المسموح! حان وقت العودة للإنتاجية.");
                new Notice("🛑 انتهى وقت الترفيه المسموح!");
                
                let audio = new Audio(audioPath);
                audio.play().catch(e => console.log("Audio play blocked: ", e));
            }
        }, 1000);
    }

    async function loadAllIcons() {
        gamesData.forEach(async (g) => {
            // لا تجلب مجدداً إذا كانت الأيقونة محفوظة مسبقاً في الـ state
            if (state.gameIcons[g.pkg]) {
                const imgEl = viewContainer.querySelector(`#icon-${g.pkg.replace(/\./g, '-')}`);
                if (imgEl) imgEl.src = state.gameIcons[g.pkg];
                return;
            }
            const iconUrl = await fetchPlayStoreIcon(g.pkg);
            state.gameIcons[g.pkg] = iconUrl;
            const imgEl = viewContainer.querySelector(`#icon-${g.pkg.replace(/\./g, '-')}`);
            if (imgEl) imgEl.src = iconUrl;
        });
    }
}
```
```dataviewjs
const targetFolder = "003 Daily/001 Active Diaries";
const defaultTime = 15; 

const customRules = [
    { term: "صلاة", time: 20 },
    { term: "حفظ", time: 30 }
];

const actionTaskCosts = {
    "gum": { name: "شراء علكة", cost: 2 },
    "nuts": { name: "شراء مكسرات", cost: 2 },
    "icecream": { name: "شراء آيس كريم", cost: 6 },
    "juice": { name: "شراء عصير مجمد", cost: 3 },
    "new_exp": { name: "خوض تجربة جديدة", cost: 1 },
    "hobby": { name: "ممارسة هواية ممتعة", cost: 1 },
    "shower": { name: "أخذ شاور بارد", cost: 3 }
};

const audioPath = app.vault.adapter.getResourcePath("004 Meta/001 Attach/002 Attachment media/SNDs/Sounds/P Assets/end.m4a");

const todayStr = moment().format("YYYY-MM-DD");
const filePath = `${targetFolder}/${todayStr}.md`;
const page = dv.page(filePath);

if (!page) {
    dv.paragraph("⚠️ لم يتم العثور على ملف يوميات اليوم بعد.");
} else {
    // استخدام مفتاح موحد وثابت للـ localStorage لتجنب تكرار المفاتيح يومياً
    const STORAGE_KEY = `rewards_panel_storage_data`;
    const STATE_KEY = `rewards_panel_state_${todayStr}`;
    const CONTAINER_KEY = `rewards_panel_container_${todayStr}`;

    // حساب القيم الافتراضية الأولية من ملف اليومية الحالي
    const completedTasks = page.file.tasks.where(t => t.completed);
    const initialTasksCount = completedTasks.length;

    let initialRestTime = 0;
    for (let task of completedTasks) {
        let taskTime = defaultTime;
        for (let rule of customRules) {
            if (task.text.includes(rule.term)) {
                taskTime = rule.time;
                break;
            }
        }
        initialRestTime += taskTime;
    }

    // دالة لحفظ الحالة في الـ localStorage والـ window معاً
    function saveState(stateData) {
        window[STATE_KEY] = stateData;
        
        const dataToSave = {
            date: todayStr, // حفظ التاريخ مع البيانات للتحقق منه لاحقاً
            totalTime: stateData.totalTime,
            totalTasks: stateData.totalTasks,
            videoTime: stateData.videoTime,
            gameTime: stateData.gameTime,
            panelOpen: stateData.panelOpen,
            gameIcons: stateData.gameIcons
        };
        localStorage.setItem(STORAGE_KEY, JSON.stringify(dataToSave));
    }

    // دالة استدعاء الحالة المخزنة مع تنظيف الذاكرة القديمة
    function loadState() {
        if (window[STATE_KEY]) return window[STATE_KEY];

        const localData = localStorage.getItem(STORAGE_KEY);
        if (localData) {
            try {
                const parsed = JSON.parse(localData);
                
                // الشرط السحري: إذا كان التاريخ المخزن يختلف عن تاريخ اليوم الحلي
                if (parsed.date !== todayStr) {
                    // حذف ذاكرة الأيام الماضية تماماً لتبقى الذاكرة نظيفة
                    localStorage.removeItem(STORAGE_KEY);
                } else {
                    // إذا كان نفس اليوم، استرجع البيانات بأمان دون تصفيرها
                    window[STATE_KEY] = {
                        ...parsed,
                        interval: null
                    };
                    return window[STATE_KEY];
                }
            } catch (e) {
                console.error("خطأ في قراءة localStorage:", e);
            }
        }

        // إنشاء كاش جديد كلياً لليوم الحالي فقط بعد مسح القديم
        const newState = {
            totalTime: initialRestTime,
            totalTasks: initialTasksCount,
            videoTime: 5,
            gameTime: 5,
            panelOpen: false,
            interval: null,
            gameIcons: {}
        };
        
        const dataToSave = {
            date: todayStr,
            ...newState
        };
        localStorage.setItem(STORAGE_KEY, JSON.stringify(dataToSave));
        window[STATE_KEY] = newState;
        return newState;
    }

    const state = loadState();

    const gamesData = [
        { name: "cookie run", pkg: "com.devsisters.ck" },
        { name: "rpg vanilla", pkg: "com.grimdev.grimquest" },
        { name: "underdark", pkg: "com.FreeDust.UnderDark" },
        { name: "ragdol fists", pkg: "com.lonriv.radofists" },
        { name: "warrior un", pkg: "com.GamerMind.Warriors_of_the_Universe_Online" },
        { name: "Yugi yo lins", pkg: "jp.konami.duellinks" },
        { name: "Boom birdS", pkg: "com.tuokio.boomslingers" },
        { name: "Alto relaxing", pkg: "com.noodlecake.altosodyssey" },
        { name: "Manhattan", pkg:"com.abyss.abyssreader" }
    ];

    async function fetchPlayStoreIcon(pkg) {
        try {
            const url = `https://play.google.com/store/apps/details?id=${pkg}`;
            const response = await requestUrl({ url: url, method: 'GET' });
            const htmlText = response.text;
            const match = htmlText.match(/<meta[^>]*property=["']og:image["'][^>]*content=["']([^"']+)["']/i) || 
                          htmlText.match(/<meta[^>]*content=["']([^"']+)["'][^>]*property=["']og:image["']/i);
            if (match && match[1]) return match[1];
        } catch (e) {
            console.error("خطأ في جلب أيقونة الحزمة: " + pkg, e);
        }
        return 'https://cdn-icons-png.flaticon.com/512/3408/3408506.png'; 
    }

    let viewContainer;
    const dvContainer = dv.el("div", "");

    if (window[CONTAINER_KEY] && document.body.contains(window[CONTAINER_KEY])) {
        viewContainer = window[CONTAINER_KEY];
        dvContainer.appendChild(viewContainer);
        updateTextUI(); 
    } else {
        viewContainer = document.createElement("div");
        window[CONTAINER_KEY] = viewContainer;
        dvContainer.appendChild(viewContainer);

        viewContainer.innerHTML = `
            <div class="custom-popup-overlay" style="display:none; position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.5); z-index:9999; align-items:center; justify-content:center;">
                <div style="background:var(--background-primary); padding:20px; border-radius:10px; width:85%; max-width:350px; text-align:center; border:2px solid var(--interactive-accent); box-shadow:0 4px 15px rgba(0,0,0,0.3);">
                    <p class="popup-message" style="font-size:15px; font-weight:bold; margin-bottom:15px; color:var(--text-normal);"></p>
                    <button class="popup-close-btn" style="background:var(--interactive-accent); color:white; border:none; padding:8px 25px; border-radius:5px; cursor:pointer; font-weight:bold;">حسناً</button>
                </div>
            </div>

            <div style="background: var(--background-secondary); padding: 15px; border-radius: 8px; margin-bottom: 15px; display:grid; grid-template-columns: 1fr 1fr; gap:10px;">
                <div style="border-left: 3px solid var(--interactive-accent); padding-left:10px; text-align:right;">
                    <p style="margin:0; font-size:13px; color:var(--text-muted);">🎯 المهمات المتاحة:</p>
                    <p style="margin:5px 0 0 0; font-size:20px; font-weight:bold; color:var(--interactive-accent);"><span class="ui-tasks">${state.totalTasks}</span> مهمة</p>
                </div>
                <div style="text-align:right;">
                    <p style="margin:0; font-size:13px; color:var(--text-muted);">⏳ وقت الترفيه المتاح:</p>
                    <p style="margin:5px 0 0 0; font-size:20px; font-weight:bold; color:var(--text-accent);"><span class="ui-time">${state.totalTime}</span> دقيقة</p>
                </div>
            </div>

            <button class="ui-toggle-btn" style="width:100%; padding:10px; font-weight:bold; background:var(--interactive-accent); color:white; border-radius:6px; margin-bottom:15px; cursor:pointer;">✨ فتح لوحة المقايضة والترفيه</button>

            <div class="ui-trading-panel" style="display: none;">
                
                <div style="border: 1px solid var(--background-modifier-border); padding: 12px; border-radius: 6px; margin-bottom: 12px;">
                    <h4 style="margin-top:0;">📺 مشاهدة الفيديوهات</h4>
                    <div style="display:flex; align-items:center; gap: 12px;">
                        <button class="video-minus" style="padding:4px 12px;">-</button>
                        <span style="font-weight:bold; font-size:16px;"><span class="ui-video-time">${state.videoTime}</span> دقيقة</span>
                        <button class="video-plus" style="padding:4px 12px;">+</button>
                        <button class="video-start" style="background:var(--text-accent); color:white; margin-right:auto; padding:6px 12px; cursor:pointer;">بدء المشاهدة</button>
                    </div>
                </div>

                <div style="border: 1px solid var(--background-modifier-border); padding: 12px; border-radius: 6px; margin-bottom: 12px;">
                    <h4 style="margin-top:0;">🎮 الألعاب المتاحة</h4>
                    <div style="margin-bottom:15px; display:flex; align-items:center; gap:12px; background:var(--background-primary); padding:8px; border-radius:6px;">
                        <span>⏱️ حدد وقت اللعب:</span>
                        <button class="game-minus" style="padding:2px 10px;">-</button>
                        <span style="font-weight:bold;"><span class="ui-game-time">${state.gameTime}</span> دقيقة</span>
                        <button class="game-plus" style="padding:2px 10px;">+</button>
                    </div>
                    <div class="ui-games-grid" style="display: grid; grid-template-columns: repeat(auto-fill, minmax(110px, 1fr)); gap: 12px;">
                        ${gamesData.map(g => `
                            <div style="text-align:center; background:var(--background-primary); padding:8px; border-radius:6px; border:1px solid var(--background-modifier-border); display:flex; flex-direction:column; justify-content:space-between; align-items:center;">
                                <a href="android-app://${g.pkg}" style="display:block; text-decoration:none; margin-bottom:5px;">
                                    <img id="icon-${g.pkg.replace(/\./g, '-')}" src="${state.gameIcons[g.pkg] || 'https://cdn-icons-png.flaticon.com/512/3408/3408506.png'}" style="width:54px; height:54px; border-radius:12px; object-fit:cover; border:1px solid rgba(0,0,0,0.1);" title="${g.name}" />
                                </a>
                                <div style="font-size:11px; font-weight:bold; color:var(--text-normal); height:32px; overflow:hidden;">${g.name}</div>
                                <button class="play-btn" data-pkg="${g.pkg}" style="font-size:10px; padding:4px 2px; margin-top:8px; width:100%; cursor:pointer;">ابدأ اللعب</button>
                            </div>
                        `).join('')}
                    </div>
                </div>

                <div style="border: 1px solid var(--background-modifier-border); padding: 12px; border-radius: 6px; margin-bottom: 12px;">
                    <h4 style="margin-top:0;">🛒 المكافئات المتاحة</h4>
                    <div class="ui-actions-grid" style="display:grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap:8px;">
                        ${Object.keys(actionTaskCosts).map(key => `
                            <button class="act-btn" data-key="${key}" style="text-align:right; padding:8px; font-size:12px; cursor:pointer;">🔹 ${actionTaskCosts[key].name} (خصم ${actionTaskCosts[key].cost} مهمة)</button>
                        `).join('')}
                    </div>
                </div>
            </div>
        `;

        viewContainer.addEventListener("click", (e) => {
            const target = e.target;

            if (target.classList.contains("ui-toggle-btn")) {
                state.panelOpen = !state.panelOpen;
                updateTextUI();
                saveState(state);
            } 
            else if (target.classList.contains("popup-close-btn")) {
                viewContainer.querySelector(".custom-popup-overlay").style.display = "none";
            }
            else if (target.classList.contains("video-minus")) {
                state.videoTime = Math.max(5, state.videoTime - 5);
                updateTextUI();
                saveState(state);
            } 
            else if (target.classList.contains("video-plus")) {
                state.videoTime += 5;
                updateTextUI();
                saveState(state);
            } 
            else if (target.classList.contains("game-minus")) {
                state.gameTime = Math.max(5, state.gameTime - 5);
                updateTextUI();
                saveState(state);
            } 
            else if (target.classList.contains("game-plus")) {
                state.gameTime += 5;
                updateTextUI();
                saveState(state);
            } 
            else if (target.classList.contains("video-start")) {
                startActivity('video', 'android-app://net.waterfox.android.release', state.videoTime);
            } 
            else if (target.classList.contains("play-btn")) {
                const pkg = target.getAttribute("data-pkg");
                startActivity('game', `android-app://${pkg}`, state.gameTime);
            } 
            else if (target.classList.contains("act-btn")) {
                const key = target.getAttribute("data-key");
                const act = actionTaskCosts[key];
                if (state.totalTasks < act.cost) {
                    showPopup(`❌ رصيد المهمات غير كافٍ! تحتاج إلى ${act.cost} مهمات لهذه المقايضة.`);
                    return;
                }
                state.totalTasks -= act.cost;
                new Notice(`🛒 تم تسجيل مقايضة (${act.name}) بنجاح!`);
                updateTextUI();
                saveState(state);
            }
        });

        loadAllIcons();
    }

    function showPopup(message) {
        const overlay = viewContainer.querySelector(".custom-popup-overlay");
        const msgEl = viewContainer.querySelector(".popup-message");
        if (overlay && msgEl) {
            msgEl.innerText = message;
            overlay.style.display = "flex";
        }
    }

    function updateTextUI() {
        viewContainer.querySelector(".ui-tasks").innerText = state.totalTasks;
        viewContainer.querySelector(".ui-time").innerText = state.totalTime;
        viewContainer.querySelector(".ui-video-time").innerText = state.videoTime;
        viewContainer.querySelector(".ui-game-time").innerText = state.gameTime;
        
        const panel = viewContainer.querySelector(".ui-trading-panel");
        const toggleBtn = viewContainer.querySelector(".ui-toggle-btn");
        
        if (state.panelOpen) {
            panel.style.display = "block";
            toggleBtn.innerText = "🔼 إخفاء لوحة المقايضة";
        } else {
            panel.style.display = "none";
            toggleBtn.innerText = "✨ فتح لوحة المقايضة والترفيه";
        }
    }

    async function startActivity(type, url, minutes) {
        if (state.totalTime < minutes) {
            showPopup("❌ رصيد الدقائق المتاحة لديك لا يكفي لهذه المدة!");
            return;
        }
        
        state.totalTime -= minutes;
        updateTextUI(); 
        saveState(state);
        
        try {
            await app.vault.adapter.write(".timer.md", minutes.toString());
        } catch (err) {
            console.error("خطأ أثناء الكتابة في ملف التوقيت: ", err);
        }

        window.open(url);
        
        if (state.interval) {
            clearInterval(state.interval);
            state.interval = null;
        }
        
        let secondsLeft = minutes * 60;
        state.interval = setInterval(() => {
            secondsLeft--;
            if (secondsLeft <= 0) {
                clearInterval(state.interval);
                state.interval = null;
                showPopup("🛑 انتهى وقت الترفيه المسموح! حان وقت العودة للإنتاجية.");
                new Notice("🛑 انتهى وقت الترفيه المسموح!");
                
                let audio = new Audio(audioPath);
                audio.play().catch(e => console.log("Audio play blocked: ", e));
            }
        }, 1000);
    }

    async function loadAllIcons() {
        gamesData.forEach(async (g) => {
            if (state.gameIcons[g.pkg]) {
                const imgEl = viewContainer.querySelector(`#icon-${g.pkg.replace(/\./g, '-')}`);
                if (imgEl) imgEl.src = state.gameIcons[g.pkg];
                return;
            }
            const iconUrl = await fetchPlayStoreIcon(g.pkg);
            state.gameIcons[g.pkg] = iconUrl;
            const imgEl = viewContainer.querySelector(`#icon-${g.pkg.replace(/\./g, '-')}`);
            if (imgEl) imgEl.src = iconUrl;
            saveState(state);
        });
    }
}
```-->
```dataviewjs
const targetFolder = "003 Daily/001 Active Diaries";
const defaultTime = 15; 

const customRules = [
    { term: "صلاة", time: 20 },
    { term: "حفظ", time: 30 }
];

const actionTaskCosts = {
    "gum": { name: "شراء علكة", cost: 2 },
    "nuts": { name: "شراء مكسرات", cost: 2 },
    "icecream": { name: "شراء آيس كريم", cost: 6 },
    "juice": { name: "شراء عصير مجمد", cost: 3 },
    "new_exp": { name: "خوض تجربة جديدة", cost: 1 },
    "hobby": { name: "ممارسة هواية ممتعة", cost: 1 },
    "shower": { name: "أخذ شاور بارد", cost: 3 }
};

const audioPath = app.vault.adapter.getResourcePath("004 Meta/001 Attach/002 Attachment media/SNDs/Sounds/P Assets/end.m4a");

const todayStr = moment().format("YYYY-MM-DD");
const filePath = `${targetFolder}/${todayStr}.md`;
const page = dv.page(filePath);

if (!page) {
    dv.paragraph("⚠️ لم يتم العثور على ملف يوميات اليوم بعد.");
} else {
    const STORAGE_KEY = `rewards_panel_consumed_${todayStr}`; // تخزين الوقت المستهلك فقط
    const STATE_KEY = `rewards_panel_state_${todayStr}`;
    const CONTAINER_KEY = `rewards_panel_container_${todayStr}`;

    // دالة لحساب إجمالي الوقت من المهام المكتملة
    function calculateTotalTimeFromTasks(completedTasks) {
        let totalTime = 0;
        for (let task of completedTasks) {
            let taskTime = defaultTime;
            for (let rule of customRules) {
                if (task.text.includes(rule.term)) {
                    taskTime = rule.time;
                    break;
                }
            }
            totalTime += taskTime;
        }
        return totalTime;
    }

    // حساب الوقت الإجمالي المستحق من المهام المكتملة
    const completedTasks = page.file.tasks.where(t => t.completed);
    const totalEarnedTime = calculateTotalTimeFromTasks(completedTasks);
    const totalTasksCount = completedTasks.length;

    // دالة للحصول على الوقت المستهلك من localStorage
    function getConsumedTime() {
        const stored = localStorage.getItem(STORAGE_KEY);
        if (stored) {
            try {
                const data = JSON.parse(stored);
                if (data.date === todayStr) {
                    return data.consumedTime || 0;
                }
            } catch (e) {}
        }
        return 0;
    }

    // دالة لحفظ الوقت المستهلك
    function saveConsumedTime(consumed) {
        localStorage.setItem(STORAGE_KEY, JSON.stringify({
            date: todayStr,
            consumedTime: consumed
        }));
    }

    // حساب الوقت المتبقي = الوقت المكتسب - الوقت المستهلك
    let consumedTime = getConsumedTime();
    let remainingTime = Math.max(0, totalEarnedTime - consumedTime);
    
    // إنشاء الحالة
    const state = {
        totalTime: remainingTime,
        totalTasks: totalTasksCount,
        videoTime: 5,
        gameTime: 5,
        panelOpen: false,
        interval: null,
        gameIcons: {},
        consumedTime: consumedTime,
        earnedTime: totalEarnedTime
    };

    // دالة لحفظ الحالة الكاملة (للاستخدام الداخلي)
    function saveState() {
        window[STATE_KEY] = state;
        saveConsumedTime(state.consumedTime);
    }

    // دالة لتحديث الوقت من الملف (لإضافة المهام الجديدة)
    function refreshTimeFromDiary() {
        const currentPage = dv.page(filePath);
        if (!currentPage) return;
        
        const completed = currentPage.file.tasks.where(t => t.completed);
        const newEarnedTime = calculateTotalTimeFromTasks(completed);
        const newTasksCount = completed.length;
        
        // تحديث الوقت المكتسب إذا تغير
        if (newEarnedTime !== state.earnedTime || newTasksCount !== state.totalTasks) {
            state.earnedTime = newEarnedTime;
            state.totalTasks = newTasksCount;
            // إعادة حساب الوقت المتبقي
            state.totalTime = Math.max(0, state.earnedTime - state.consumedTime);
            saveState();
            if (viewContainer) updateTextUI();
            console.log(`🔄 تم التحديث: الوقت المكتسب=${state.earnedTime}, المستهلك=${state.consumedTime}, المتبقي=${state.totalTime}`);
            return true;
        }
        return false;
    }

    // دالة لاستهلاك وقت (خصم دقائق)
    function consumeTime(minutes) {
        if (state.totalTime < minutes) {
            return false;
        }
        state.consumedTime += minutes;
        state.totalTime = Math.max(0, state.earnedTime - state.consumedTime);
        saveState();
        if (viewContainer) updateTextUI();
        console.log(`⏱️ تم استهلاك ${minutes} دقيقة، المستهلك=${state.consumedTime}, المتبقي=${state.totalTime}`);
        return true;
    }

    const gamesData = [
        { name: "cookie run", pkg: "com.devsisters.ck" },
        { name: "rpg vanilla", pkg: "com.grimdev.grimquest" },
        { name: "underdark", pkg: "com.FreeDust.UnderDark" },
        { name: "ragdol fists", pkg: "com.lonriv.radofists" },
        { name: "warrior un", pkg: "com.GamerMind.Warriors_of_the_Universe_Online" },
        { name: "Yugi yo lins", pkg: "jp.konami.duellinks" },
        { name: "Boom birdS", pkg: "com.tuokio.boomslingers" },
        { name: "Alto relaxing", pkg: "com.noodlecake.altosodyssey" }
    ];

    async function fetchPlayStoreIcon(pkg) {
        try {
            const url = `https://play.google.com/store/apps/details?id=${pkg}`;
            const response = await requestUrl({ url: url, method: 'GET' });
            const htmlText = response.text;
            const match = htmlText.match(/<meta[^>]*property=["']og:image["'][^>]*content=["']([^"']+)["']/i) || 
                          htmlText.match(/<meta[^>]*content=["']([^"']+)["'][^>]*property=["']og:image["']/i);
            if (match && match[1]) return match[1];
        } catch (e) {
            console.error("خطأ في جلب أيقونة الحزمة: " + pkg, e);
        }
        return 'https://cdn-icons-png.flaticon.com/512/3408/3408506.png'; 
    }

    let viewContainer;
    const dvContainer = dv.el("div", "");

    if (window[CONTAINER_KEY] && document.body.contains(window[CONTAINER_KEY])) {
        viewContainer = window[CONTAINER_KEY];
        dvContainer.appendChild(viewContainer);
        refreshTimeFromDiary();
        updateTextUI(); 
    } else {
        viewContainer = document.createElement("div");
        window[CONTAINER_KEY] = viewContainer;
        dvContainer.appendChild(viewContainer);

        viewContainer.innerHTML = `
            <div class="custom-popup-overlay" style="display:none; position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.5); z-index:9999; align-items:center; justify-content:center;">
                <div style="background:var(--background-primary); padding:20px; border-radius:10px; width:85%; max-width:350px; text-align:center; border:2px solid var(--interactive-accent); box-shadow:0 4px 15px rgba(0,0,0,0.3);">
                    <p class="popup-message" style="font-size:15px; font-weight:bold; margin-bottom:15px; color:var(--text-normal);"></p>
                    <button class="popup-close-btn" style="background:var(--interactive-accent); color:white; border:none; padding:8px 25px; border-radius:5px; cursor:pointer; font-weight:bold;">حسناً</button>
                </div>
            </div>

            <div style="background: var(--background-secondary); padding: 15px; border-radius: 8px; margin-bottom: 15px; display:grid; grid-template-columns: 1fr 1fr; gap:10px;">
                <div style="border-left: 3px solid var(--interactive-accent); padding-left:10px; text-align:right;">
                    <p style="margin:0; font-size:13px; color:var(--text-muted);">🎯 المهمات المتاحة:</p>
                    <p style="margin:5px 0 0 0; font-size:20px; font-weight:bold; color:var(--interactive-accent);"><span class="ui-tasks">${state.totalTasks}</span> مهمة</p>
                </div>
                <div style="text-align:right;">
                    <p style="margin:0; font-size:13px; color:var(--text-muted);">⏳ وقت الترفيه المتاح:</p>
                    <p style="margin:5px 0 0 0; font-size:20px; font-weight:bold; color:var(--text-accent);"><span class="ui-time">${state.totalTime}</span> دقيقة</p>
                </div>
            </div>

            <button class="ui-toggle-btn" style="width:100%; padding:10px; font-weight:bold; background:var(--interactive-accent); color:white; border-radius:6px; margin-bottom:15px; cursor:pointer;">✨ فتح لوحة المقايضة والترفيه</button>

            <div class="ui-trading-panel" style="display: none;">
                
                <div style="border: 1px solid var(--background-modifier-border); padding: 12px; border-radius: 6px; margin-bottom: 12px;">
                    <h4 style="margin-top:0;">📺 مشاهدة الفيديوهات</h4>
                    <div style="display:flex; align-items:center; gap: 12px;">
                        <button class="video-minus" style="padding:4px 12px;">-</button>
                        <span style="font-weight:bold; font-size:16px;"><span class="ui-video-time">${state.videoTime}</span> دقيقة</span>
                        <button class="video-plus" style="padding:4px 12px;">+</button>
                        <button class="video-start" style="background:var(--text-accent); color:white; margin-right:auto; padding:6px 12px; cursor:pointer;">بدء المشاهدة</button>
                    </div>
                </div>

                <div style="border: 1px solid var(--background-modifier-border); padding: 12px; border-radius: 6px; margin-bottom: 12px;">
                    <h4 style="margin-top:0;">🎮 الألعاب المتاحة</h4>
                    <div style="margin-bottom:15px; display:flex; align-items:center; gap:12px; background:var(--background-primary); padding:8px; border-radius:6px;">
                        <span>⏱️ حدد وقت اللعب:</span>
                        <button class="game-minus" style="padding:2px 10px;">-</button>
                        <span style="font-weight:bold;"><span class="ui-game-time">${state.gameTime}</span> دقيقة</span>
                        <button class="game-plus" style="padding:2px 10px;">+</button>
                    </div>
                    <div class="ui-games-grid" style="display: grid; grid-template-columns: repeat(auto-fill, minmax(110px, 1fr)); gap: 12px;">
                        ${gamesData.map(g => `
                            <div style="text-align:center; background:var(--background-primary); padding:8px; border-radius:6px; border:1px solid var(--background-modifier-border); display:flex; flex-direction:column; justify-content:space-between; align-items:center;">
                                <a href="android-app://${g.pkg}" style="display:block; text-decoration:none; margin-bottom:5px;">
                                    <img id="icon-${g.pkg.replace(/\./g, '-')}" src="${state.gameIcons[g.pkg] || 'https://cdn-icons-png.flaticon.com/512/3408/3408506.png'}" style="width:54px; height:54px; border-radius:12px; object-fit:cover; border:1px solid rgba(0,0,0,0.1);" title="${g.name}" />
                                </a>
                                <div style="font-size:11px; font-weight:bold; color:var(--text-normal); height:32px; overflow:hidden;">${g.name}</div>
                                <button class="play-btn" data-pkg="${g.pkg}" style="font-size:10px; padding:4px 2px; margin-top:8px; width:100%; cursor:pointer;">ابدأ اللعب</button>
                            </div>
                        `).join('')}
                    </div>
                </div>

                <div style="border: 1px solid var(--background-modifier-border); padding: 12px; border-radius: 6px; margin-bottom: 12px;">
                    <h4 style="margin-top:0;">🛒 المكافئات المتاحة</h4>
                    <div class="ui-actions-grid" style="display:grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap:8px;">
                        ${Object.keys(actionTaskCosts).map(key => `
                            <button class="act-btn" data-key="${key}" style="text-align:right; padding:8px; font-size:12px; cursor:pointer;">🔹 ${actionTaskCosts[key].name} (خصم ${actionTaskCosts[key].cost} مهمة)</button>
                        `).join('')}
                    </div>
                </div>
            </div>
        `;

        viewContainer.addEventListener("click", (e) => {
            const target = e.target;

            if (target.classList.contains("ui-toggle-btn")) {
                refreshTimeFromDiary();
                state.panelOpen = !state.panelOpen;
                updateTextUI();
                saveState();
            } 
            else if (target.classList.contains("popup-close-btn")) {
                viewContainer.querySelector(".custom-popup-overlay").style.display = "none";
            }
            else if (target.classList.contains("video-minus")) {
                state.videoTime = Math.max(5, state.videoTime - 5);
                updateTextUI();
                saveState();
            } 
            else if (target.classList.contains("video-plus")) {
                state.videoTime += 5;
                updateTextUI();
                saveState();
            } 
            else if (target.classList.contains("game-minus")) {
                state.gameTime = Math.max(5, state.gameTime - 5);
                updateTextUI();
                saveState();
            } 
            else if (target.classList.contains("game-plus")) {
                state.gameTime += 5;
                updateTextUI();
                saveState();
            } 
            else if (target.classList.contains("video-start")) {
                startActivity('video', 'android-app://net.waterfox.android.release', state.videoTime);
            } 
            else if (target.classList.contains("play-btn")) {
                const pkg = target.getAttribute("data-pkg");
                startActivity('game', `android-app://${pkg}`, state.gameTime);
            } 
            else if (target.classList.contains("act-btn")) {
                const key = target.getAttribute("data-key");
                const act = actionTaskCosts[key];
                if (state.totalTasks < act.cost) {
                    showPopup(`❌ رصيد المهمات غير كافٍ! تحتاج إلى ${act.cost} مهمات لهذه المقايضة.`);
                    return;
                }
                state.totalTasks -= act.cost;
                new Notice(`🛒 تم تسجيل مقايضة (${act.name}) بنجاح!`);
                updateTextUI();
                saveState();
            }
        });

        loadAllIcons();
    }

    function showPopup(message) {
        const overlay = viewContainer.querySelector(".custom-popup-overlay");
        const msgEl = viewContainer.querySelector(".popup-message");
        if (overlay && msgEl) {
            msgEl.innerText = message;
            overlay.style.display = "flex";
        }
    }

    function updateTextUI() {
        const tasksEl = viewContainer.querySelector(".ui-tasks");
        const timeEl = viewContainer.querySelector(".ui-time");
        const videoEl = viewContainer.querySelector(".ui-video-time");
        const gameEl = viewContainer.querySelector(".ui-game-time");
        
        if (tasksEl) tasksEl.innerText = state.totalTasks;
        if (timeEl) timeEl.innerText = state.totalTime;
        if (videoEl) videoEl.innerText = state.videoTime;
        if (gameEl) gameEl.innerText = state.gameTime;
        
        const panel = viewContainer.querySelector(".ui-trading-panel");
        const toggleBtn = viewContainer.querySelector(".ui-toggle-btn");
        
        if (panel && toggleBtn) {
            if (state.panelOpen) {
                panel.style.display = "block";
                toggleBtn.innerText = "🔼 إخفاء لوحة المقايضة";
            } else {
                panel.style.display = "none";
                toggleBtn.innerText = "✨ فتح لوحة المقايضة والترفيه";
            }
        }
    }

    async function startActivity(type, url, minutes) {
        // تحديث الوقت من الملف أولاً
        refreshTimeFromDiary();
        
        // محاولة استهلاك الوقت
        if (!consumeTime(minutes)) {
            showPopup("❌ رصيد الدقائق المتاحة لديك لا يكفي لهذه المدة!");
            return;
        }
        
        // تحديث الواجهة
        updateTextUI();
        
        try {
            await app.vault.adapter.write(".timer.md", minutes.toString());
        } catch (err) {
            console.error("خطأ أثناء الكتابة في ملف التوقيت: ", err);
        }

        // فتح التطبيق
        window.open(url);
        
        // إلغاء أي مؤقت سابق
        if (state.interval) {
            clearInterval(state.interval);
            state.interval = null;
        }
        
        // بدء المؤقت
        let secondsLeft = minutes * 60;
        state.interval = setInterval(() => {
            secondsLeft--;
            if (secondsLeft <= 0) {
                clearInterval(state.interval);
                state.interval = null;
                showPopup("🛑 انتهى وقت الترفيه المسموح! حان وقت العودة للإنتاجية.");
                new Notice("🛑 انتهى وقت الترفيه المسموح!");
                
                let audio = new Audio(audioPath);
                audio.play().catch(e => console.log("Audio play blocked: ", e));
            }
        }, 1000);
    }

    async function loadAllIcons() {
        for (let g of gamesData) {
            if (state.gameIcons[g.pkg]) {
                const imgEl = viewContainer.querySelector(`#icon-${g.pkg.replace(/\./g, '-')}`);
                if (imgEl) imgEl.src = state.gameIcons[g.pkg];
                continue;
            }
            const iconUrl = await fetchPlayStoreIcon(g.pkg);
            state.gameIcons[g.pkg] = iconUrl;
            const imgEl = viewContainer.querySelector(`#icon-${g.pkg.replace(/\./g, '-')}`);
            if (imgEl) imgEl.src = iconUrl;
            saveState();
        }
    }

    // التحديث النهائي
    refreshTimeFromDiary();
    updateTextUI();
}
```