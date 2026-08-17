---
icon: lucide-timer-off
---
```dataviewjs
const targetFolder = "003 Daily/001 Active Diaries";
const defaultTime = 60; 

const customRules = [
    { term: "حفظ", time: 120, count: 4 }
];

const actionTaskCosts = {
    "hobby": { name: "ممارسة هواية ممتعة", cost: 1, pkg: "", Tcost: 30, effective: false },
    "shower": { name: "أخذ شاور", cost: 1, pkg: "", Tcost: 15, effective: false },
    "gum": { name: "شراء علكة", cost: 2, pkg: "", Tcost: 2, effective: false },
    "nuts": { name: "شراء مكسرات", cost: 2, pkg: "", Tcost: 2, effective: false },
    "icecream": { name: "شراء آيس كريم", cost: 3, pkg: "", Tcost: 2, effective: false },
    "juice": { name: "شراء عصير مجمد", cost: 3, pkg: "", Tcost: 2, effective: false },
    "read_nov": { name:"قراءة روايات", cost: 3, pkg: "net.waterfox.android.release", Tcost: 45, effective: true },
    "ply_bro": { name: "اللعب مع اخي الصغير", cost: 3, pkg: "", Tcost: 30, effective: false }
};
const gamesData = [
        { name: "RPG Vanilla", pkg: "com.grimdev.grimquest" },
        { name: "UnderDark", pkg: "com.FreeDust.UnderDark" },
        { name: "Boom Slingers", pkg: "com.tuokio.boomslingers" },
        { name: "Alto Relaxing", pkg: "com.noodlecake.altosodyssey" },
        { name: "Pocket Ant", pkg: "com.ariel.zanyants" }
];

const audioPath = app.vault.adapter.getResourcePath("004 Meta/001 Attach/002 Attachment media/SNDs/Sounds/Assets/end.m4a");

const todayStr = moment().format("YYYY-MM-DD");
const filePath = `${targetFolder}/${todayStr}.md`;
const page = dv.page(filePath);

if (!page) {
    dv.paragraph("⚠️ لم يتم العثور على ملف يوميات اليوم بعد.");
} else {
    const MAIN_STORE_KEY = `reward-panel-store`;
    const STATE_KEY = `rewards_panel_state`;
    const CONTAINER_KEY = `rewards_panel_container`;

    function getStoreData() {
        const stored = localStorage.getItem(MAIN_STORE_KEY);
        if (stored) {
            try {
                return JSON.parse(stored) || {};
            } catch (e) {}
        }
        return {};
    }

    function saveStoreData(data) {
        localStorage.setItem(MAIN_STORE_KEY, JSON.stringify(data));
    }

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
    function calculateTotalCountFromTasks(completedTasks) {
        let totalCount = 0;
        for (let task of completedTasks) {
            let taskCount = 1;
            for (let rule of customRules) {
                if (task.text.includes(rule.term)) {
                    taskCount = rule.count;
                    break;
                }
            }
            totalCount += taskCount;
        }
        return totalCount;
    }
    const completedTasks = page.file.tasks.where(t => t.completed);
    const totalEarnedTime = calculateTotalTimeFromTasks(completedTasks);
    const totalTasksCount = calculateTotalCountFromTasks(completedTasks);

    function getConsumedTime() {
        const store = getStoreData();
        if (store.consumed && store.consumed.date === todayStr) {
            return store.consumed.consumedTime || 0;
        }
        return 0;
    }

    function saveConsumedTime(consumed) {
        const store = getStoreData();
        store.consumed = {
            date: todayStr,
            consumedTime: consumed
        };
        saveStoreData(store);
    }

    function getSpentTasks() {
        const store = getStoreData();
        if (store.tasksSpent && store.tasksSpent.date === todayStr) {
            return store.tasksSpent.spentTasks || 0;
        }
        return 0;
    }

    function saveSpentTasks(spent) {
        const store = getStoreData();
        store.tasksSpent = {
            date: todayStr,
            spentTasks: spent
        };
        saveStoreData(store);
    }

    function getAppsCache() {
        const store = getStoreData();
        return store.appsCache || {};
    }

    function saveAppToCache(pkg, name, icon) {
        const store = getStoreData();
        if (!store.appsCache) store.appsCache = {};
        store.appsCache[pkg] = { name, icon, timestamp: Date.now() };
        saveStoreData(store);
    }

    let consumedTime = getConsumedTime();
    let spentTasks = getSpentTasks();
    let remainingTime = Math.max(0, totalEarnedTime - consumedTime);
    let availableTasks = Math.max(0, totalTasksCount - spentTasks);
    
    const state = {
        totalTime: remainingTime,
        totalTasks: availableTasks,
        originalTasks: totalTasksCount,
        videoTime: 5,
        gameTime: 5,
        panelOpen: false,
        interval: null,
        consumedTime: consumedTime,
        earnedTime: totalEarnedTime,
        spentTasks: spentTasks
    };

    function saveState() {
        window[STATE_KEY] = state;
        saveConsumedTime(state.consumedTime);
        saveSpentTasks(state.spentTasks);
    }

    function refreshTimeFromDiary() {
        const currentPage = dv.page(filePath);
        if (!currentPage) return;
        
        const completed = currentPage.file.tasks.where(t => t.completed);
        const newEarnedTime = calculateTotalTimeFromTasks(completed);
        const newTasksCount = calculateTotalCountFromTasks(completedTasks);
        
        if (newEarnedTime !== state.earnedTime || newTasksCount !== state.originalTasks) {
            state.earnedTime = newEarnedTime;
            state.originalTasks = newTasksCount;
            state.totalTasks = Math.max(0, state.originalTasks - state.spentTasks);
            state.totalTime = Math.max(0, state.earnedTime - state.consumedTime);
            saveState();
            if (viewContainer) {
                updateTextUI();
                updateActionButtons();
            }
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
        if (viewContainer) {
            updateTextUI();
            updateActionButtons();
        }
        return true;
    }

    function consumeTasks(cost) {
        if (state.totalTasks < cost) {
            return false;
        }
        state.spentTasks += cost;
        state.totalTasks = Math.max(0, state.originalTasks - state.spentTasks);
        saveState();
        if (viewContainer) {
            updateTextUI();
            updateActionButtons();
        }
        return true;
    }

    async function fetchAppMetadataFromStore(pkg) {
        let appName = "";
        let iconUrl = "https://cdn-icons-png.flaticon.com/512/3408/3408506.png"; 

        try {
            const url = `https://play.google.com/store/apps/details?id=${pkg}`;
            const response = await requestUrl({ url: url, method: 'GET' });
            const htmlText = response.text;
            
            const iconMatch = htmlText.match(/<meta[^>]*property=["']og:image["'][^>]*content=["']([^"']+)["']/i) || 
                              htmlText.match(/<meta[^>]*content=["']([^"']+)["'][^>]*property=["']og:image["']/i);
            if (iconMatch && iconMatch[1]) iconUrl = iconMatch[1];

            const nameMatch = htmlText.match(/<meta[^>]*property=["']og:title["'][^>]*content=["']([^"']+)["']/i) || 
                              htmlText.match(/<meta[^>]*content=["']([^"']+)["'][^>]*property=["']og:title["']/i);
            if (nameMatch && nameMatch[1]) {
                appName = nameMatch[1].replace(/\s-\sApps\son\sGoogle\sPlay/i, "").trim();
            }
        } catch (e) {}

        return { name: appName, icon: iconUrl };
    }

    let viewContainer;
    const dvContainer = dv.el("div", "");

    const appsCache = getAppsCache();
    gamesData.forEach(g => {
        if (appsCache[g.pkg]) {
            if (!g.name) g.name = appsCache[g.pkg].name;
            g.displayIcon = appsCache[g.pkg].icon;
        } else {
            if (!g.name) g.name = g.pkg.split('.').pop();
            g.displayIcon = "https://cdn-icons-png.flaticon.com/512/3408/3408506.png";
        }
    });

    if (window[CONTAINER_KEY] && document.body.contains(window[CONTAINER_KEY])) {
        viewContainer = window[CONTAINER_KEY];
        dvContainer.appendChild(viewContainer);
        refreshTimeFromDiary();
        updateTextUI(); 
        updateActionButtons();
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
                    <div class="ui-actions-grid" style="display:grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap:8px;">
                        ${Object.keys(actionTaskCosts).map(key => {
                            const act = actionTaskCosts[key];
                            let icon = "";
                            if (act.pkg && act.pkg !== "") icon += "← ";
                            if (act.effective) icon += "⏱ ";
                            const isDisabled = act.cost > state.totalTasks;
                            const opacityStyle = isDisabled ? "opacity:0.4; cursor:not-allowed;" : "";
                            return `
                                <button class="act-btn" data-key="${key}" style="text-align:right; padding:8px; font-size:12px; cursor:pointer; ${opacityStyle}" ${isDisabled ? 'disabled' : ''}>
                                    ${icon}${act.name} (خصم ${act.cost} مهمة)
                                </button>
                            `;
                        }).join('')}
                    </div>
                </div>

                <div class="countdown-box" style="display:none; background: var(--text-selection); padding:15px; border-radius:6px; font-weight:bold; text-align:center; margin-top:10px; border:1px solid var(--interactive-accent);">
                    ⏳ الجلسة نشطة! متبقي: <span class="clock-display" style="font-size:18px; color:var(--text-accent);">00:00</span>
                </div>
            </div>
        `;

        viewContainer.addEventListener("click", (e) => {
            const target = e.target;

            if (target.classList.contains("ui-toggle-btn")) {
                refreshTimeFromDiary();
                state.panelOpen = !state.panelOpen;
                updateTextUI();
                updateActionButtons();
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
                
                if (act.cost > state.totalTasks) {
                    showPopup(`❌ رصيد المهمات غير كافٍ! تحتاج إلى ${act.cost} مهمات لهذه المقايضة، لديك ${state.totalTasks} مهمات فقط.`);
                    return;
                }
                
                if (!consumeTasks(act.cost)) {
                    showPopup(`❌ رصيد المهمات غير كافٍ! تحتاج إلى ${act.cost} مهمات لهذه المقايضة.`);
                    return;
                }
                
                new Notice(`🛒 تم تسجيل مقايضة (${act.name}) بنجاح!`);
                updateTextUI();
                updateActionButtons();
                saveState();

                const actionCost = act.Tcost || 5;
                const isEffective = act.effective || false;
                const actionUrl = `android-app://${act.pkg}` || "";
                
                if (isEffective) {
                    if (consumeTime(actionCost)) {
                        startActivity('action', actionUrl, actionCost, false)
                    } else {
                        showPopup(`❌ رصيد الدقائق المتاحة لا يكفي! تحتاج ${actionCost} دقيقة.`);
                    }
                } else {
                    startCountdown(actionCost, false);
                }
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

    function updateActionButtons() {
        const actionButtons = viewContainer.querySelectorAll(".act-btn");
        actionButtons.forEach(btn => {
            const key = btn.getAttribute("data-key");
            const act = actionTaskCosts[key];
            if (!act) return;
            
            const isDisabled = act.cost > state.totalTasks;
            if (isDisabled) {
                btn.style.opacity = "0.4";
                btn.style.cursor = "not-allowed";
                btn.disabled = true;
            } else {
                btn.style.opacity = "1";
                btn.style.cursor = "pointer";
                btn.disabled = false;
            }
        });
    }

    function startCountdown(minutes, consumeTime = true) {
	    const countBox = viewContainer.querySelector(".countdown-box");
	    const clockDisp = viewContainer.querySelector(".clock-display");
	    
	    if (!countBox || !clockDisp) return;
	    
	    if (state.interval) {
	        clearInterval(state.interval);
	        state.interval = null;
	    }
	    
	    countBox.style.display = "block";
	    
	    const endTime = Date.now() + (minutes * 60 * 1000);
	    
	    const updateClock = () => {
	        const msLeft = endTime - Date.now();
	        
	        if (msLeft <= 0) {
	            clearInterval(state.interval);
	            state.interval = null;
	            clockDisp.innerText = "00:00";
	            countBox.style.display = "none";
	            
	            if (consumeTime) {
	                showPopup("✅ انتهى وقت النشاط المحدد!");
	            } else {
	                showPopup("⏱️ انتهى الوقت المقدر لهذا النشاط!");
	            }
	            
	            new Audio(audioPath).play().catch(e => console.log("Audio play blocked: ", e));
	            return;
	        }
	        
	        const totalSecondsLeft = Math.ceil(msLeft / 1000);
	        const mins = Math.floor(totalSecondsLeft / 60).toString().padStart(2, '0');
	        const secs = (totalSecondsLeft % 60).toString().padStart(2, '0');
	        
	        clockDisp.innerText = `${mins}:${secs}`;
	    };
	    
	    updateClock();
	    state.interval = setInterval(updateClock, 1000);
	}

    async function startActivity(type, url, minutes, isCost) {
        refreshTimeFromDiary();
        if (isCost === null || isCost === undefined) {isCost = true}
        if (isCost === true && !consumeTime(minutes)) {
            showPopup("❌ رصيد الدقائق المتاحة لديك لا يكفي لهذه المدة!");
            return;
        }

        const store = getStoreData();
        store.activeSession = {
            date: todayStr,
            startTime: Date.now(),
            durationMinutes: minutes
        };
        saveStoreData(store);
        
        updateTextUI();
        
        try {
            await app.vault.adapter.write(".timer.md", minutes.toString());
        } catch (err) {
            console.error("خطأ أثناء الكتابة في ملف التوقيت: ", err);
        }
        
        window.open(url);
        
        startCountdown(minutes, true);
    }

    async function loadAllAppsMetadata() {
        const cache = getAppsCache();

        for (let g of gamesData) {
            const elementId = g.pkg.replace(/\./g, '-');
            const imgEl = viewContainer.querySelector(`#icon-${elementId}`);
            const nameEl = viewContainer.querySelector(`#name-${elementId}`);

            if (cache[g.pkg] && (g.name && g.name !== g.pkg.split('.').pop())) {
                if (imgEl) imgEl.src = cache[g.pkg].icon;
                if (nameEl) nameEl.innerText = g.name;
                continue;
            }

            if (cache[g.pkg] && !g.name) {
                if (imgEl) imgEl.src = cache[g.pkg].icon;
                if (nameEl) nameEl.innerText = cache[g.pkg].name || g.pkg.split('.').pop();
                continue;
            }

            const metadata = await fetchAppMetadataFromStore(g.pkg);
            const finalName = g.name || metadata.name || g.pkg.split('.').pop();
            
            saveAppToCache(g.pkg, finalName, metadata.icon);

            if (imgEl) imgEl.src = metadata.icon;
            if (nameEl) nameEl.innerText = finalName;
            if (imgEl) imgEl.title = finalName;
        }
    }

    refreshTimeFromDiary();
    updateTextUI();
    updateActionButtons();
}
```