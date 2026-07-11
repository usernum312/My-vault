---
icon: lucide-timer-off
---
```dataviewjs
const targetFolder = "003 Daily/001 Active Diaries";
const defaultTime = 15; 

const customRules = [
    { term: "حفظ", time: 30 }
];

const actionTaskCosts = {
    "gum": { name: "شراء علكة", cost: 2, cost_time: 2 },
    "nuts": { name: "شراء مكسرات", cost: 2, cost_time: 2 },
    "icecream": { name: "شراء آيس كريم", cost: 6, cost_time: 2 },
    "juice": { name: "شراء عصير مجمد", cost: 3, cost_time: 2 },
    "hobby": { name: "ممارسة هواية ممتعة", cost: 1, cost_time: 30 },
    "shower": { name: "أخذ شاور", cost: 3, cost_time: 10 },
    "ply_bro": { name: "اللعب مع اخي الصغير", cost: 8, cost_time: 30, effective: true },
    "read_nov": { name:"قراءة روايات", pkg: "com.rajarsheechatterjee.LNReader", cost: 6, cost_time: 60, effective: true }
};

const audioPath = app.vault.adapter.getResourcePath("004 Meta/001 Attach/002 Attachment media/SNDs/Sounds/P Assets/end.m4a");

const todayStr = moment().format("YYYY-MM-DD");
const filePath = `${targetFolder}/${todayStr}.md`;
const page = dv.page(filePath);

if (!page) {
    dv.paragraph("⚠️ لم يتم العثور على ملف يوميات اليوم بعد.");
} else {
    const STORAGE_KEY = `rewards_panel_consumed_${todayStr}`; 
    const STATE_KEY = `rewards_panel_state_${todayStr}`;
    const CONTAINER_KEY = `rewards_panel_container_${todayStr}`;
    const ACTIVE_SESSION_KEY = `rewards_active_session_${todayStr}`;
    const APPS_CACHE_KEY = `rewards_apps_metadata_cache`; // مفتاح الكاش الثابت للأسماء والأيقونات

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

    const completedTasks = page.file.tasks.where(t => t.completed);
    const totalEarnedTime = calculateTotalTimeFromTasks(completedTasks);
    const totalTasksCount = completedTasks.length;

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

    function saveConsumedTime(consumed) {
        localStorage.setItem(STORAGE_KEY, JSON.stringify({
            date: todayStr,
            consumedTime: consumed
        }));
    }

    // دالات التعامل مع كاش التطبيقات (الأسماء والأيقونات)
    function getAppsCache() {
        const cached = localStorage.getItem(APPS_CACHE_KEY);
        return cached ? JSON.parse(cached) : {};
    }

    function saveAppToCache(pkg, name, icon) {
        const cache = getAppsCache();
        cache[pkg] = { name, icon, timestamp: Date.now() };
        localStorage.setItem(APPS_CACHE_KEY, JSON.stringify(cache));
    }

    let consumedTime = getConsumedTime();
    let remainingTime = Math.max(0, totalEarnedTime - consumedTime);
    
    const state = {
        totalTime: remainingTime,
        totalTasks: totalTasksCount,
        videoTime: 5,
        gameTime: 5,
        panelOpen: false,
        interval: null,
        consumedTime: consumedTime,
        earnedTime: totalEarnedTime
    };

    function saveState() {
        window[STATE_KEY] = state;
        saveConsumedTime(state.consumedTime);
    }

    function checkAndRefundUnusedTime() {
        const sessionStored = localStorage.getItem(ACTIVE_SESSION_KEY);
        if (!sessionStored) return;

        try {
            const session = JSON.parse(sessionStored);
            const now = Date.now();
            const elapsedMilliseconds = now - session.startTime;
            const elapsedMinutes = Math.floor(elapsedMilliseconds / 1000 / 60);

            if (elapsedMinutes < session.durationMinutes) {
                const unusedMinutes = session.durationMinutes - elapsedMinutes;
                state.consumedTime = Math.max(0, state.consumedTime - unusedMinutes);
                state.totalTime = Math.max(0, state.earnedTime - state.consumedTime);
                saveState();
                new Notice(`🔄 أهلاً بعودتك! تم استرجاع ${unusedMinutes} دقيقة غير مستغلة ورصيدها في حسابك.`);
            }
        } catch (e) {
            console.error("خطأ أثناء فحص الجلسة السابقة:", e);
        }
        localStorage.removeItem(ACTIVE_SESSION_KEY);
    }

    function refreshTimeFromDiary() {
        const currentPage = dv.page(filePath);
        if (!currentPage) return;
        
        const completed = currentPage.file.tasks.where(t => t.completed);
        const newEarnedTime = calculateTotalTimeFromTasks(completed);
        const newTasksCount = completed.length;
        
        if (newEarnedTime !== state.earnedTime || newTasksCount !== state.totalTasks) {
            state.earnedTime = newEarnedTime;
            state.totalTasks = newTasksCount;
            state.totalTime = Math.max(0, state.earnedTime - state.consumedTime);
            saveState();
            if (viewContainer) updateTextUI();
            return true;
        }
        return false;
    }

    function consumeTime(minutes) {
        if (state.totalTime < minutes) {
            return false;
        }
        state.consumedTime += minutes;
        state.totalTime = Math.max(0, state.earnedTime - state.consumedTime);
        saveState();
        if (viewContainer) updateTextUI();
        return true;
    }

    // مصفوفة الألعاب (قمت بإزالة بعض الأسماء لتجربة ميزة الـ Scraping التلقائي)
    const gamesData = [
        { name: "cookie run", pkg: "com.devsisters.ck" },
        { name: "rpg vanilla", pkg: "com.grimdev.grimquest" },
        { name: "UnderDark", pkg: "com.FreeDust.UnderDark" },
        { name: "ragdol fists", pkg: "com.lonriv.radofists" },
        { name: "warrior universe", pkg: "com.GamerMind.Warriors_of_the_Universe_Online" },
        { name: "Yugi yo links", pkg: "jp.konami.duellinks" },
        { name: "Boom Singers", pkg: "com.tuokio.boomslingers" },
        { name: "Alto relaxing", pkg: "com.noodlecake.altosodyssey" }
    ];

    // دالة واحدة تجلب الاسم والأيقونة معاً من صفحة المتجر وتقوم بعمل Scraping ذكي
    async function fetchAppMetadataFromStore(pkg) {
        let appName = "";
        let iconUrl = "https://cdn-icons-png.flaticon.com/512/3408/3408506.png"; 

        try {
            const url = `https://play.google.com/store/apps/details?id=${pkg}`;
            const response = await requestUrl({ url: url, method: 'GET' });
            const htmlText = response.text;
            
            // 1. Scraping الأيقونة
            const iconMatch = htmlText.match(/<meta[^>]*property=["']og:image["'][^>]*content=["']([^"']+)["']/i) || 
                              htmlText.match(/<meta[^>]*content=["']([^"']+)["'][^>]*property=["']og:image["']/i);
            if (iconMatch && iconMatch[1]) iconUrl = iconMatch[1];

            // 2. Scraping اسم التطبيق الفعلي
            const nameMatch = htmlText.match(/<meta[^>]*property=["']og:title["'][^>]*content=["']([^"']+)["']/i) || 
                              htmlText.match(/<meta[^>]*content=["']([^"']+)["'][^>]*property=["']og:title["']/i);
            if (nameMatch && nameMatch[1]) {
                // تنظيف الاسم لأن جوجل يضيف " - Apps on Google Play" في النهاية
                appName = nameMatch[1].replace(/\s-\sApps\son\sGoogle\sPlay/i, "").trim();
            }
        } catch (e) {
            console.error("خطأ أثناء عمل Scraping للحزمة: " + pkg, e);
        }

        return { name: appName, icon: iconUrl };
    }

    let viewContainer;
    const dvContainer = dv.el("div", "");

    checkAndRefundUnusedTime();

    // تجهيز البيانات المبدئية من الكاش لتفادي الوميض (Flickering) أثناء التحميل
    const appsCache = getAppsCache();
    gamesData.forEach(g => {
        if (appsCache[g.pkg]) {
            if (!g.name) g.name = appsCache[g.pkg].name;
            g.displayIcon = appsCache[g.pkg].icon;
        } else {
            if (!g.name) g.name = g.pkg.split('.').pop(); // اسم مؤقت لحين التحميل
            g.displayIcon = "https://cdn-icons-png.flaticon.com/512/3408/3408506.png";
        }
    });

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
                                    <img id="icon-${g.pkg.replace(/\./g, '-')}" src="${g.displayIcon}" style="width:54px; height:54px; border-radius:12px; object-fit:cover; border:1px solid rgba(0,0,0,0.1);" title="${g.name}" />
                                </a>
                                <div id="name-${g.pkg.replace(/\./g, '-')}" style="font-size:11px; font-weight:bold; color:var(--text-normal); height:32px; overflow:hidden;">${g.name}</div>
                                <button class="play-btn" data-pkg="${g.pkg}" style="font-size:10px; padding:4px 2px; margin-top:8px; width:100%; cursor:pointer;">ابدأ اللعب</button>
                            </div>
                        `).join('')}
                    </div>
                </div>

                <div style="border: 1px solid var(--background-modifier-border); padding: 12px; border-radius: 6px; margin-bottom: 12px;">
                    <h4 style="margin-top:0;">🛒 المكافئات المتاحة</h4>
                    <div class="ui-actions-grid" style="display:grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap:8px;">
                        ${Object.keys(actionTaskCosts).map(key => `
                            <button class="act-btn" data-key="${key}" style="text-align:right; padding:8px; font-size:12px; cursor:pointer;">${actionTaskCosts[key].name} (خصم ${actionTaskCosts[key].cost} مهمة)</button>
                        `).join('')}
                    </div>
                </div>
            </div>
        `;

        viewContainer.addEventListener("click", (e) => {
            const target = e.target;

            if (target.classList.contains("ui-toggle-btn")) {
                checkAndRefundUnusedTime(); 
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

        loadAllAppsMetadata();
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
        checkAndRefundUnusedTime();
        refreshTimeFromDiary();
        
        if (!consumeTime(minutes)) {
            showPopup("❌ رصيد الدقائق المتاحة لديك لا يكفي لهذه المدة!");
            return;
        }

        localStorage.setItem(ACTIVE_SESSION_KEY, JSON.stringify({
            startTime: Date.now(),
            durationMinutes: minutes
        }));
        
        updateTextUI();
        
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
                localStorage.removeItem(ACTIVE_SESSION_KEY);
                showPopup("🛑 انتهى وقت الترفيه المسموح! حان وقت العودة للإنتاجية.");
                new Notice("🛑 انتهى وقت الترفيه المسموح!");
                
                let audio = new Audio(audioPath);
                audio.play().catch(e => console.log("Audio play blocked: ", e));
            }
        }, 1000);
    }

    // دالة فحص وتحديث الكاش الذكي
    async function loadAllAppsMetadata() {
        const cache = getAppsCache();

        for (let g of gamesData) {
            const elementId = g.pkg.replace(/\./g, '-');
            const imgEl = viewContainer.querySelector(`#icon-${elementId}`);
            const nameEl = viewContainer.querySelector(`#name-${elementId}`);

            // إذا كان التطبيق مسجلاً في الكاش مسبقاً والمستخدم حدد اسماً يدوياً أو تم جلبه مسبقاً بنجاح
            if (cache[g.pkg] && (g.name && g.name !== g.pkg.split('.').pop())) {
                if (imgEl) imgEl.src = cache[g.pkg].icon;
                if (nameEl) nameEl.innerText = g.name;
                continue;
            }

            // إذا كان التطبيق في الكاش ولم يحدد المستخدم اسماً يدوياً، نستخدم الاسم المجلوب من الكاش فوراً
            if (cache[g.pkg] && !g.name) {
                if (imgEl) imgEl.src = cache[g.pkg].icon;
                if (nameEl) nameEl.innerText = cache[g.pkg].name || g.pkg.split('.').pop();
                continue;
            }

            // إذا لم يكن مخزناً، نقوم بعمل Scraping من المتجر (يحدث مرة واحدة فقط لكل تطبيق!)
            const metadata = await fetchAppMetadataFromStore(g.pkg);
            
            // تحديد الاسم النهائي: الأولوية لـ اسم مخصص من المستخدم -> ثم الاسم المجلوب -> ثم اسم الحزمة كبديل أخير
            const finalName = g.name || metadata.name || g.pkg.split('.').pop();
            
            // حفظ في اللوكال ستوريج
            saveAppToCache(g.pkg, finalName, metadata.icon);

            // تحديث واجهة المستخدم فوراً بدون إعادة تحميل الصفحة كاملة
            if (imgEl) imgEl.src = metadata.icon;
            if (nameEl) nameEl.innerText = finalName;
            if (imgEl) imgEl.title = finalName;
        }
    }

    refreshTimeFromDiary();
    updateTextUI();
}
```