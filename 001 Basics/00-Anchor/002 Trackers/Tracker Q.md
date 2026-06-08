---
icon: lucide-form-input
banner: https://marketplace.canva.com/EAHBFGCGpKk/1/0/1131w/canva-green-and-white-modern-islamic-qur%27an-tracker-document-4lD2UK58iBg.jpg
banner_y: 15
cssclasses:
  - metadata-clean
ui: edit
---
```dataviewjs
/* ===========================================================
   كود تتبع تلاوة القرآن الكريم - النسخة المصححة والمحدثة
   =========================================================== */

// دالة لمسح الزر العائم من الـ Leaf الحالي لمنع تكراره أو بقائه عند تغيير الصفحة
function removeExistingButton() {
    const activeLeaf = app.workspace.getActiveViewOfType(Object)?.leaf || app.workspace.getMostRecentLeaf();
    if (activeLeaf && activeLeaf.view && activeLeaf.view.containerEl) {
        const existingBtn = activeLeaf.view.containerEl.querySelector('.quran-float-btn');
        if (existingBtn) existingBtn.remove();
    }
}

// 1. توليد تاريخ اليوم الفعلي بصيغة YYYY-MM-DD
const today = new Date();
const todayStr = today.getFullYear() + "-" + 
                 String(today.getMonth() + 1).padStart(2, '0') + "-" + 
                 String(today.getDate()).padStart(2, '0');

const currentFile = app.workspace.getActiveFile();

// التحقق الصارم: إذا تغير الملف أو لم يكن مطابقاً لتاريخ اليوم، احذف الزر فوراً وتوقف
if (!currentFile || currentFile.basename !== todayStr) {
    removeExistingButton();
    return;
}

if (window.__quranExecuted) return;
window.__quranExecuted = true;
setTimeout(() => { window.__quranExecuted = false; }, 1000);

function parseTaskTime(dateStr, timeStr, offsetStr) {
    const dt = new Date(`${dateStr}T${timeStr}`);
    if (offsetStr) {
        const minutes = parseInt(offsetStr.replace('m', ''));
        dt.setMinutes(dt.getMinutes() + minutes);
    }
    return dt;
}

/* =====================================================
   1. مزامنة المهمة ↔ الـ Property (ثنائية الاتجاه)
   ===================================================== */
async function syncTaskAndProperty() {
    const content = await app.vault.read(currentFile);
    const cache = app.metadataCache.getFileCache(currentFile);
    const readQuranProp = cache?.frontmatter?.["Read Quran"];

    const lines = content.split('\n');
    let taskLineIndex = -1;
    let isTaskCompleted = false;

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (/- \[[ xX]\]/.test(line) && line.includes('قراءة') && line.includes('القرآن')) {
            taskLineIndex = i;
            isTaskCompleted = /- \[[xX]\]/.test(line);
            break;
        }
    }

    if (taskLineIndex === -1) return;

    if (isTaskCompleted && !readQuranProp) {
        await app.fileManager.processFrontMatter(currentFile, (fm) => {
            fm["Read Quran"] = true;
        });
        console.log("✅ تم تحديث Read Quran إلى true بناءً على المهمة.");

    } else if (!isTaskCompleted && readQuranProp === true) {
        lines[taskLineIndex] = lines[taskLineIndex].replace(/- \[ \]/, '- [x]');
        await app.vault.modify(currentFile, lines.join('\n'));
        console.log("✅ تم وضع علامة إنجاز على مهمة القرآن بناءً على الخاصية.");
    }
}

/* =====================================================
   2. الزر الدائري العائم (leaf رئيسي فقط)
   ===================================================== */
function addFloatingButton(LAST_INPUT_KEY) {
    let targetLeaf = null;
    app.workspace.iterateAllLeaves(leaf => {
        if (
            leaf.view?.file?.path === currentFile.path &&
            leaf.getRoot() === app.workspace.rootSplit
        ) {
            targetLeaf = leaf;
        }
    });

    if (!targetLeaf) return;

    const viewEl = targetLeaf.view.containerEl;
    viewEl.querySelector('.quran-float-btn')?.remove();

    const btn = document.createElement('button');
    btn.className = 'quran-float-btn';
    btn.title = 'تسجيل قراءة القرآن الكريم';
    btn.innerHTML = 'Q';
    Object.assign(btn.style, {
        position:     'absolute',
        bottom:       '28px',
        right:        '30px',
        width:        '42px',
        height:       '42px',
        borderRadius: '50%',
        background:   'var(--interactive-accent)',
        opacity:      '0.3',
        border:       'none',
        cursor:       'pointer',
        zIndex:       '200',
        fontSize:     '20px',
        display:      'flex',
        alignItems:   'center',
        justifyContent: 'center',
        boxShadow:    '0 2px 10px rgba(0,0,0,0.3)',
        transition:   'opacity 0.2s, transform 0.2s',
        pointerEvents:'auto',
    });
    
    if (!document.getElementById('quran-btn-styles')) {
        const styleTag = document.createElement('style');
        styleTag.id = 'quran-btn-styles';
        styleTag.textContent = `
        @media (orientation: portrait) {
            .is-mobile .quran-float-btn { bottom: 70px !important; }
        }
        @media (orientation: landscape) {
            .is-mobile .quran-float-btn { right: 70px !important; }
            .is-mobile:has(.workspace-drawer.mod-right.is-pinned) .quran-float-btn { right: 30px !important; }
        }
        `;
        document.head.appendChild(styleTag);
    }

    btn.addEventListener('mouseenter', () => {
        btn.style.opacity = '1';
        btn.style.transform = 'scale(1.1)';
    });
    btn.addEventListener('mouseleave', () => {
        btn.style.opacity = '0.6';
        btn.style.transform = 'scale(1)';
    });

    btn.addEventListener('click', () => renderActualModal(LAST_INPUT_KEY));

    if (getComputedStyle(viewEl).position === 'static') {
        viewEl.style.position = 'relative';
    }

    viewEl.appendChild(btn);
}

/* =====================================================
   3. التشغيل الرئيسي (التحقق من الوقت + Cooldown)
   ==================================================== */
async function runQuranTracker() {
    const content = await app.vault.read(currentFile);
    const now = new Date();
    
    const fileDate = todayStr; 
    const LAST_INPUT_KEY = `[[quran]]-pages-last-input-${currentFile.path}`;

    await syncTaskAndProperty();
    addFloatingButton(LAST_INPUT_KEY);

    const lastInputTime = localStorage.getItem(LAST_INPUT_KEY);
    if (lastInputTime) {
        const timeSinceLast = Date.now() - parseInt(lastInputTime);
        if (timeSinceLast < 3600000) {
            console.log(`⏳ مهلة الساعة نشطة. تبقى ${((3600000 - timeSinceLast) / 60000).toFixed(0)} دقيقة.`);
            return;
        }
    }

    const SHOW_COUNT_KEY = `quran-show-count-${fileDate}`;
    let showCount = parseInt(localStorage.getItem(SHOW_COUNT_KEY) || "0");
    if (showCount >= 7) {
        console.log("🚫 ظهرت النافذة 7 مرات اليوم بالفعل.");
        return;
    }

    const quranRegex = /قراءة \[\[Quran\|القرآن الكريم\]\].*?/;
    const quranMatch = content.match(quranRegex);
    if (!quranMatch) return;

    const quranStartTime = parseTaskTime(quranMatch[1], quranMatch[2], quranMatch[3]);
    if (now < quranStartTime) {
        console.log("⏳ لم يحن موعد مهمة القرآن بعد.");
        return;
    }

    const allTasksRegex = /<strong.*?(\d+)\s+(دقيقة|ساعة).*?/g;
    let match;
    let isInsideAnotherTask = false;
    while ((match = allTasksRegex.exec(content)) !== null) {
        let duration = parseInt(match[1]);
        const taskStart = parseTaskTime(match[3], match[4], match[5]);
        const taskEnd = new Date(taskStart.getTime() + duration * 60000);
        const taskEndBuffer = new Date(taskEnd.getTime() + 15 * 60000);
        if (now >= taskStart && now <= taskEndBuffer) {
            if (taskStart.getTime() !== quranStartTime.getTime()) {
                isInsideAnotherTask = true;
                break;
            }
        }
    }
    if (isInsideAnotherTask) {
        console.log("🧘 وقت مهمة أخرى حالياً.");
        return;
    }

    const cache = app.metadataCache.getFileCache(currentFile);
    if (cache?.frontmatter?.["Number of Pages (reading)"] > 0) return;

    localStorage.setItem(SHOW_COUNT_KEY, (showCount + 1).toString());
    localStorage.setItem(LAST_INPUT_KEY, Date.now().toString());
    renderActualModal(LAST_INPUT_KEY);
}

/* =====================================================
   4. نافذة الإدخال 
   ===================================================== */
async function renderActualModal(LAST_INPUT_KEY) {
    let totalPagesSoFar = 0;
    const allDailyFiles = app.vault.getMarkdownFiles()
        .filter(f => f.path.includes('003 Daily/001 Active Diaries'))
        .filter(f => f.path !== currentFile.path);

    for (const file of allDailyFiles) {
        const cache = app.metadataCache.getFileCache(file);
        totalPagesSoFar += cache?.frontmatter?.["Number of Pages (reading)"] || 0;
    }

    const surahNames = ["الفاتحة","البقرة","آل عمران","النساء","المائدة","الأنعام","الأعراف","الأنفال","التوبة","يونس","هود","يوسف","الرعد","إبراهيم","الحجر","النحل","الإسراء","الكهف","مريم","طه","الأنبياء","الحج","المؤمنون","النور","الفرقان","الشعراء","النمل","القصص","العنكبوت","الروم","لقمان","السجدة","الأحزاب","سبأ","فاطر","يس","الصافات","ص","الزمر","غافر","فصلت","الشورى","الزخرف","الدخان","الجاثية","الأحقاف","محمد","الفتح","الحجرات","ق","الذاريات","الطور","النجم","القمر","الرحمن","الواقعة","الحديد","المجادلة","الحشر","الممتحنة","الصف","الجمعة","المنافقون","التغابن","الطلاق","التحريم","الملك","القلم","الحاقة","المعارج","نوح","الجن","المزمل","المدثر","القيامة","الإنسان","المرسلات","النبأ","النازعات","عبس","التكوير","الانفطار","المطففين","الانشقاق","البروج","الطارق","الأعلى","الغاشية","الفجر","البلد","الشمس","الليل","الضحى","الشرح","التين","العلق","القدر","البينة","الزلزلة","العاديات","القارعة","التكاثر","العصر","الهمزة","الفيل","قريش","الماعون","الكوثر","الكافرون","النصر","المسد","الإخلاص","الفلق","الناس"];
    const surahPages = [1,2,50,77,106,128,151,177,187,208,221,235,249,255,262,267,282,293,305,312,322,332,342,350,359,367,377,385,396,404,411,415,418,428,434,440,446,453,458,467,477,483,489,496,499,502,507,511,515,518,520,523,526,528,531,534,537,542,545,549,551,553,554,556,558,560,562,564,566,568,570,572,574,575,577,578,580,582,583,585,586,587,587,589,590,591,591,592,592,593,595,595,596,596,597,597,598,598,599,599,600,600,601,601,601,602,602,602,603,603,603,604,604,605];

    let surahOptions = '';
    for (let i = 0; i < surahNames.length; i++) {
        surahOptions += `<option value="${i}">${i+1}- ${surahNames[i]}</option>`;
    }

    const modalHtml = `
    <style>
        .q-tab-btn { flex: 1; padding: 8px; background: transparent; border: 1px solid var(--background-modifier-border); color: var(--text-muted); cursor: pointer; border-radius: 8px; font-size: 12px; }
        .q-tab-btn.active { background: var(--interactive-accent); color: var(--text-on-accent); }
        .q-tab-content { display: none; padding-top: 5px; }
        .q-tab-content.active { display: block; }
        .q-input { width: 100%; padding: 10px; border-radius: 8px; border: 1px solid var(--background-modifier-border); background: var(--background-secondary); color: var(--text-normal);}
        .q-select { width: 100%; padding: 8px; border-radius: 8px; background: var(--background-primary); color: var(--text-normal); border: 1px solid var(--background-modifier-border); }
    </style>
    <div class="quran-modal modal-container" style="direction: rtl; position: fixed; top: 0; left: 0; width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; z-index: 1000; background: rgba(0,0,0,0.4);">
        <div class="modal" style="background: var(--background-primary); border-radius: 12px; padding: 20px; width: 350px; border: 1px solid var(--background-modifier-border);">
            <div id="modal-read" style="text-align: center !important;margin-bottom: 15px !important;"><a href="obsidian://open?vault=My-vault&file=001%20Basics%2FQuran" style="text-align:center;background-color:var(--interactive-accent);color:var(--text-on-accent);border:none;border-radius:20px;text-decoration: none;padding: 5px 15px;">لا تهجر القرآن</a></div>
            <div style="display: flex; gap: 5px; margin-bottom: 15px;">
                <button class="q-tab-btn active" data-target="mode1">الصفحة</button>
                <button class="q-tab-btn" data-target="mode2">العدد</button>
                <button class="q-tab-btn" data-target="mode3">السور</button>
            </div>
            <div id="mode1" class="q-tab-content active">
                <input type="number" id="input-mode1" class="q-input" placeholder="رقم الصفحة التي وصلت إليها..." autofocus>
            </div>
            <div id="mode2" class="q-tab-content">
                <input type="number" id="input-mode2" class="q-input" placeholder="عدد الصفحات المقروءة...">
            </div>
            <div id="mode3" class="q-tab-content">
                <select id="select-start" class="q-select" style="margin-bottom:10px">${surahOptions}</select>
                <select id="select-end" class="q-select">${surahOptions}</select>
                <div id="surah-result" style="margin-top:10px; text-align:center; color:var(--text-accent); font-weight:bold;">المجموع: 0</div>
            </div>
            <div style="display: flex; gap: 10px; margin-top: 20px;">
                <button id="modal-submit" style="flex: 2; padding: 10px; border-radius: 8px; background: var(--interactive-accent); color: var(--text-on-accent); border: none;">حفظ</button>
                <button id="modal-cancel" style="flex: 1; padding: 10px; border-radius: 8px; background: transparent; border: 1px solid var(--background-modifier-border);">إلغاء</button>
            </div>
        </div>
    </div>`;

    const modalDiv = document.createElement('div');
    modalDiv.innerHTML = modalHtml;
    modalDiv.classList.add('quran-modal');
    document.body.appendChild(modalDiv);

    const tabs = modalDiv.querySelectorAll('.q-tab-btn');
    const contents = modalDiv.querySelectorAll('.q-tab-content');
    let currentMode = 'mode1';

    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            tabs.forEach(t => t.classList.remove('active'));
            contents.forEach(c => c.classList.remove('active'));
            tab.classList.add('active');
            currentMode = tab.getAttribute('data-target');
            modalDiv.querySelector(`#${currentMode}`).classList.add('active');
        });
    });

    const startSelect = modalDiv.querySelector('#select-start');
    const endSelect = modalDiv.querySelector('#select-end');
    const surahResult = modalDiv.querySelector('#surah-result');

    function calc() {
        const s = parseInt(startSelect.value), e = parseInt(endSelect.value);
        surahResult.innerText = `المجموع: ${(e >= s) ? (surahPages[e + 1] - surahPages[s]) : 0} صفحة`;
    }
    startSelect.addEventListener('change', calc);
    endSelect.addEventListener('change', calc);

    modalDiv.querySelector('#modal-cancel').addEventListener('click', () => modalDiv.remove());
    modalDiv.querySelector('#modal-read').addEventListener('click', () => modalDiv.remove());
    modalDiv.querySelector('#modal-submit').addEventListener('click', async () => {
        let added = 0;
        if (currentMode === 'mode1') added = parseInt(modalDiv.querySelector('#input-mode1').value) - totalPagesSoFar;
        else if (currentMode === 'mode2') added = parseInt(modalDiv.querySelector('#input-mode2').value);
        else if (currentMode === 'mode3') added = surahPages[parseInt(endSelect.value) + 1] - surahPages[parseInt(startSelect.value)];

        if (isNaN(added) || added < 0) { new Notice('⚠️ خطأ في الإدخال'); return; }

        modalDiv.remove();
        await app.fileManager.processFrontMatter(currentFile, (fm) => {
            fm["Number of Pages (reading)"] = added;
            if ((totalPagesSoFar + added) > 10) fm["Read Quran"] = true;
        });

        await syncTaskAndProperty();

        localStorage.setItem(LAST_INPUT_KEY, Date.now().toString());
        new Notice(`✓ تم تسجيل ${added} صفحة`);
    });
}

// تشغيل السكربت للمرة الأولى
runQuranTracker();

// إضافة مستمع لحدث تغيير الملفات النشطة (Active File Change) لمسح الزر تلقائياً عند مغادرة الصفحة اليومية
if (!window.__quranListenerAdded) {
    app.workspace.on('file-open', (file) => {
        if (!file || file.basename !== todayStr) {
            removeExistingButton();
        }
    });
    window.__quranListenerAdded = true;
}
```
<!--
## Code 2 (more improved)
```js
// كود متقدم لتتبع صفحات القرآن - مع منع التكرار لمدة ساعتين

// استخدام متغير عام مع timeout للتأكد من التنفيذ مرة واحدة فقط
if (window.__quranExecuted) {
    return;
}
window.__quranExecuted = true;

// إعادة تعيين المتغير بعد ثانية واحدة للسماح بالتنفيذ مرة أخرى إذا لزم الأمر
setTimeout(() => {
    window.__quranExecuted = false;
}, 1000);

const currentFile = app.workspace.getActiveFile();
if (!currentFile) {
    return;
}

// استخراج تاريخ اليوم من اسم الملف
const todayMatch = currentFile.name.match(/(\d{4}-\d{2}-\d{2})/);
if (!todayMatch) {
    console.log('⨉ اسم الملف لا يحتوي على تاريخ صحيح');
    return;
}
const fileDate = todayMatch[1];

// ===== التحقق من أن الملف الحالي هو ملف اليوم الفعلي =====
const today = new Date();
const year = today.getFullYear();
const month = String(today.getMonth() + 1).padStart(2, '0');
const day = String(today.getDate()).padStart(2, '0');
const todayFormatted = `${year}-${month}-${day}`;

// إذا كان تاريخ الملف لا يساوي تاريخ اليوم، لا تظهر النافذة
if (fileDate !== todayFormatted) {
    console.log(`📅 هذا الملف بتاريخ ${fileDate} وليس ملف اليوم (${todayFormatted}). لن يتم فتح النافذة.`);
    return;
}

// ===== التحقق من آخر وقت إدخال =====
const LAST_INPUT_KEY = `[[quran]]-pages-last-input-${currentFile.path}`;
const COOLDOWN_HOURS = 1; // الوحدة: ساعات
const COOLDOWN_MS = COOLDOWN_HOURS * 60 * 60 * 1000;

// التحقق من وجود إدخال سابق خلال ساعتين
const lastInputTime = localStorage.getItem(LAST_INPUT_KEY);
if (lastInputTime) {
    const timeSinceLastInput = Date.now() - parseInt(lastInputTime);
    const hoursSinceLastInput = (timeSinceLastInput / (1000 * 60 * 60)).toFixed(1);
    
    if (timeSinceLastInput < COOLDOWN_MS) {
        console.log(`⏳ تم إدخال قراءة قبل ${hoursSinceLastInput} ساعة. سيتم إعادة الفتح بعد ${((COOLDOWN_MS - timeSinceLastInput) / (1000 * 60 * 60)).toFixed(1)} ساعات.`);
        return;
    }
}

// التحقق مما إذا كان اليوم قد تم إدخال قراءة بالفعل
const fileCache = app.metadataCache.getFileCache(currentFile);
if (fileCache?.frontmatter?.["Number of Pages (reading)"] !== undefined) {
    if (lastInputTime) {
        const timeSinceLastInput = Date.now() - parseInt(lastInputTime);
        if (timeSinceLastInput < COOLDOWN_MS) {
            console.log(`📖 تم تسجيل قراءة اليوم (${fileCache.frontmatter["Number of Pages (reading)"]} صفحات)`);
            return;
        }
    } else {
        console.log('تم تسجيل قراءة سابقة، ولكن لا يوجد وقت مرجعي - سيتم فتح النافذة');
    }
}

// باقي الكود كما هو (بدون تغيير)...
// جلب مجموع الصفحات من جميع الملفات (بدون تحديد فترة زمنية)
let totalPagesSoFar = 0;
const allDailyFiles = app.vault.getMarkdownFiles()
    .filter(f => f.path.includes('003 Daily/001 Active Diaries'))
    .filter(f => f.path !== currentFile.path);

// حساب مجموع الصفحات من جميع الملفات السابقة
for (const file of allDailyFiles) {
    const cache = app.metadataCache.getFileCache(file);
    totalPagesSoFar += cache?.frontmatter?.["Number of Pages (reading)"] || 0;
}

// الحصول على آخر صفحة مسجلة
const lastPage = totalPagesSoFar;

// التحقق إذا كانت النافذة مفتوحة بالفعل
if (document.querySelector('.quran-modal')) {
    return;
}

const pdfLink = "obsidian://open?vault=My-vault&file=004%20Meta%2F001%20Attach%2Fwarsh.pdf#page=${pageNum}";

// ===== نافذة منبثقة جميلة =====
const modalHtml = `
<div class="quran-modal modal-container" style="direction: rtl;position: fixed; top: 0; left: 0; width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; z-index: 1000; background-color: rgba(0, 0, 0, 0.5);">
    <div class="modal" style="background-color: var(--background-primary); border-radius: 16px; padding: 20px; width: 340px; box-shadow: 0 10px 25px rgba(0, 0, 0, 0.2); border: 1px solid var(--background-modifier-border);">
        <h3 style="margin-top: 0; margin-bottom: 15px; color: var(--text-normal); font-size: 18px;">إلى أين وصلت في تلاوة القرآن؟</h3>
        
        ${lastPage > 0 ? `
<div style="margin-bottom: 15px; padding: 12px; background-color: var(--background-secondary); border-radius: 12px; text-align: center;">
    <div style="font-size: 14px; color: var(--text-muted); margin-bottom: 5px;">آخر صفحة وصلت لها سابقاً:</div>
    <div style="font-size: 24px; font-weight: bold; color: var(--text-accent); margin-bottom: 8px;">${lastPage}</div>
    <button id="modal-continue-btn" style="display: inline-block; padding: 8px 16px; background-color: var(--interactive-accent); color: var(--text-on-accent); border: none; border-radius: 20px; font-size: 14px; font-weight: 500; cursor: pointer;">
        استمر من حيث توقفت
    </button>
</div>
` : ''}
        
        <input type="number" id="modal-page-input" style="direction: right; width: 100%; padding: 10px; border-radius: 12px; border: 1px solid var(--background-modifier-border); background-color: var(--background-secondary); color: var(--text-normal); font-size: 16px; box-sizing: border-box; margin-bottom: 15px;" placeholder="رقم الصفحة الجديدة التي وصلت إليها" autofocus>
        
        <div style="display: flex; gap: 10px;">
            <button id="modal-submit" style="flex: 2; padding: 10px; border-radius: 12px; border: none; background-color: var(--interactive-accent); color: var(--text-on-accent); font-size: 14px; cursor: pointer;">حفظ التقدم</button>
            <button id="modal-cancel" style="flex: 1; padding: 10px; border-radius: 12px; border: 1px solid var(--background-modifier-border); background-color: transparent; color: var(--text-muted); font-size: 14px; cursor: pointer;">إلغاء</button>
        </div>
    </div>
</div>
`;

// إنشاء وإضافة النافذة إلى الصفحة
const modalDiv = document.createElement('div');
modalDiv.innerHTML = modalHtml;
modalDiv.classList.add('quran-modal');
document.body.appendChild(modalDiv);

// التركيز على حقل الإدخال
const input = modalDiv.querySelector('#modal-page-input');
setTimeout(() => input.focus(), 100);

// دالة لإغلاق النافذة
function closeModal() {
    const modal = document.querySelector('.quran-modal');
    if (modal) {
        modal.remove();
    }
}

// معالج زر الإلغاء
modalDiv.querySelector('#modal-cancel').addEventListener('click', () => {
    closeModal();
});

// معالج زر الاستمرار
const continueBtn = modalDiv.querySelector('#modal-continue-btn');
if (continueBtn) {
    continueBtn.addEventListener('click', () => {
        closeModal();
        window.open(pdfLink, '_blank');
    });
}

// معالج زر الحفظ
modalDiv.querySelector('#modal-submit').addEventListener('click', async () => {
    const pageNum = parseInt(input.value);
    
    if (isNaN(pageNum) || pageNum < 0) {
        new Notice('⨉ الرجاء إدخال رقم صحيح');
        return;
    }
    
    const todayPages = pageNum - totalPagesSoFar;
    if (todayPages < 0) {
        new Notice('⚠️ رقم الصفحة أقل من المجموع السابق');
        return;
    }
    
    // إغلاق النافذة أولاً
    closeModal();
    
    if (todayPages === 0) {
        const confirmed = confirm('⚠️ لم تقرأ أي صفحات اليوم. هل أنت متأكد؟');
        if (!confirmed) {
            return;
        }
    }
    
    // حفظ النتيجة في الملف الحالي
    await app.fileManager.processFrontMatter(currentFile, (fm) => {
        fm["Number of Pages (reading)"] = todayPages;
    });
    
    // الميزة الجديدة: التحقق من عدد الصفحات وتعديل خاصية Read Quran في الملف الحالي فقط
    // نحتاج لحساب إجمالي الصفحات حتى الآن (بما في ذلك قراءة اليوم)
    const newTotalPages = totalPagesSoFar + todayPages;
    
    // إذا كان مجموع الصفحات أكثر من 10، نقوم بتعيين خاصية Read Quran إلى true في الملف الحالي فقط
    if (newTotalPages > 10) {
        console.log(`📊 إجمالي الصفحات ${newTotalPages} > 10، سيتم تحديث خاصية Read Quran في الملف الحالي فقط`);
        
        // تحديث الملف الحالي فقط (باستخدام الاسم الصحيح للخاصية)
        await app.fileManager.processFrontMatter(currentFile, (fm) => {
            fm["Read Quran"] = true;
            console.log('✓ تم تحديث خاصية Read Quran في الملف الحالي');
        });
    } else {
        console.log(`📊 إجمالي الصفحات ${newTotalPages} <= 10، لا حاجة لتحديث Read Quran`);
    }
    
    // تسجيل وقت الإدخال
    localStorage.setItem(LAST_INPUT_KEY, Date.now().toString());
    
    new Notice(`✓ تم تسجيل ${todayPages} صفحة`);
    
    // عرض رسالة مع رابط للصفحة الجديدة
    setTimeout(() => {
        new Notice(`✓ يمكنك الآن الاستمرار من صفحة ${pageNum}`);
    }, 1500);
});

// معالج الضغط على Enter في حقل الإدخال
input.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        modalDiv.querySelector('#modal-submit').click();
    }
});
```
## code 1 (old something not the best )
```js
Old code (without change Read Quran property value to true)
// كود متقدم لتتبع صفحات القرآن - مع منع التكرار لمدة ساعتين

// استخدام متغير عام مع timeout للتأكد من التنفيذ مرة واحدة فقط
if (window.__quranExecuted) {
    return;
}
window.__quranExecuted = true;

// إعادة تعيين المتغير بعد ثانية واحدة للسماح بالتنفيذ مرة أخرى إذا لزم الأمر
setTimeout(() => {
    window.__quranExecuted = false;
}, 1000);

const currentFile = app.workspace.getActiveFile();
if (!currentFile) {
    return;
}

// استخراج تاريخ اليوم
const todayMatch = currentFile.name.match(/(\d{4}-\d{2}-\d{2})/);
if (!todayMatch) {
    console.log('⨉ اسم الملف لا يحتوي على تاريخ صحيح');
    return;
}
const todayDate = todayMatch[1];

// ===== التحقق من آخر وقت إدخال =====
const LAST_INPUT_KEY = `[[quran]]-pages-last-input-${currentFile.path}`;
const COOLDOWN_HOURS = 2; // ساعتان
const COOLDOWN_MS = COOLDOWN_HOURS * 60 * 60 * 1000;

// التحقق من وجود إدخال سابق خلال ساعتين
const lastInputTime = localStorage.getItem(LAST_INPUT_KEY);
if (lastInputTime) {
    const timeSinceLastInput = Date.now() - parseInt(lastInputTime);
    const hoursSinceLastInput = (timeSinceLastInput / (1000 * 60 * 60)).toFixed(1);
    
    if (timeSinceLastInput < COOLDOWN_MS) {
        console.log(`⏳ تم إدخال قراءة قبل ${hoursSinceLastInput} ساعة. سيتم إعادة الفتح بعد ${((COOLDOWN_MS - timeSinceLastInput) / (1000 * 60 * 60)).toFixed(1)} ساعات.`);
        return;
    }
}

// التحقق مما إذا كان اليوم قد تم إدخال قراءة بالفعل
const fileCache = app.metadataCache.getFileCache(currentFile);
if (fileCache?.frontmatter?.["Number of Pages (reading)"] !== undefined) {
    if (lastInputTime) {
        const timeSinceLastInput = Date.now() - parseInt(lastInputTime);
        if (timeSinceLastInput < COOLDOWN_MS) {
            console.log(`📖 تم تسجيل قراءة اليوم (${fileCache.frontmatter["Number of Pages (reading)"]} صفحات)`);
            return;
        }
    } else {
        console.log('تم تسجيل قراءة سابقة، ولكن لا يوجد وقت مرجعي - سيتم فتح النافذة');
    }
}

// جلب مجموع الصفحات من جميع الملفات (بدون تحديد فترة زمنية)
let totalPagesSoFar = 0;
const allDailyFiles = app.vault.getMarkdownFiles()
    .filter(f => f.path.includes('003 Daily/001 Active Diaries'))
    .filter(f => f.path !== currentFile.path);

// حساب مجموع الصفحات من جميع الملفات السابقة
for (const file of allDailyFiles) {
    const cache = app.metadataCache.getFileCache(file);
    totalPagesSoFar += cache?.frontmatter?.["Number of Pages (reading)"] || 0;
}

// الحصول على آخر صفحة مسجلة
const lastPage = totalPagesSoFar;

// التحقق إذا كانت النافذة مفتوحة بالفعل
if (document.querySelector('.quran-modal')) {
    return;
}

const pdfLink = "obsidian://open?vault=My-vault&file=004%20Meta%2F001%20Attach%2Fwarsh.pdf#page=${pageNum}";

// ===== نافذة منبثقة جميلة =====
const modalHtml = `
<div class="quran-modal modal-container" style="direction: rtl;position: fixed; top: 0; left: 0; width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; z-index: 1000; background-color: rgba(0, 0, 0, 0.5);">
    <div class="modal" style="background-color: var(--background-primary); border-radius: 16px; padding: 20px; width: 340px; box-shadow: 0 10px 25px rgba(0, 0, 0, 0.2); border: 1px solid var(--background-modifier-border);">
        <h3 style="margin-top: 0; margin-bottom: 15px; color: var(--text-normal); font-size: 18px;">إلى أين وصلت في تلاوة القرآن؟</h3>
        
        ${lastPage > 0 ? `
<div style="margin-bottom: 15px; padding: 12px; background-color: var(--background-secondary); border-radius: 12px; text-align: center;">
    <div style="font-size: 14px; color: var(--text-muted); margin-bottom: 5px;">آخر صفحة وصلت لها سابقاً:</div>
    <div style="font-size: 24px; font-weight: bold; color: var(--text-accent); margin-bottom: 8px;">${lastPage}</div>
    <button id="modal-continue-btn" style="display: inline-block; padding: 8px 16px; background-color: var(--interactive-accent); color: var(--text-on-accent); border: none; border-radius: 20px; font-size: 14px; font-weight: 500; cursor: pointer;">
        استمر من حيث توقفت
    </button>
</div>
` : ''}
        
        <input type="number" id="modal-page-input" style="direction: right; width: 100%; padding: 10px; border-radius: 12px; border: 1px solid var(--background-modifier-border); background-color: var(--background-secondary); color: var(--text-normal); font-size: 16px; box-sizing: border-box; margin-bottom: 15px;" placeholder="رقم الصفحة الجديدة التي وصلت إليها" autofocus>
        
        <div style="display: flex; gap: 10px;">
            <button id="modal-submit" style="flex: 2; padding: 10px; border-radius: 12px; border: none; background-color: var(--interactive-accent); color: var(--text-on-accent); font-size: 14px; cursor: pointer;">حفظ التقدم</button>
            <button id="modal-cancel" style="flex: 1; padding: 10px; border-radius: 12px; border: 1px solid var(--background-modifier-border); background-color: transparent; color: var(--text-muted); font-size: 14px; cursor: pointer;">إلغاء</button>
        </div>
    </div>
</div>
`;

// إنشاء وإضافة النافذة إلى الصفحة
const modalDiv = document.createElement('div');
modalDiv.innerHTML = modalHtml;
modalDiv.classList.add('quran-modal');
document.body.appendChild(modalDiv);

// التركيز على حقل الإدخال
const input = modalDiv.querySelector('#modal-page-input');
setTimeout(() => input.focus(), 100);

// دالة لإغلاق النافذة
function closeModal() {
    const modal = document.querySelector('.quran-modal');
    if (modal) {
        modal.remove();
    }
}

// معالج زر الإلغاء
modalDiv.querySelector('#modal-cancel').addEventListener('click', () => {
    closeModal();
});

// معالج زر الاستمرار
const continueBtn = modalDiv.querySelector('#modal-continue-btn');
if (continueBtn) {
    continueBtn.addEventListener('click', () => {
        closeModal();
        window.open(pdfLink, '_blank');
    });
}

// معالج زر الحفظ
modalDiv.querySelector('#modal-submit').addEventListener('click', async () => {
    const pageNum = parseInt(input.value);
    
    if (isNaN(pageNum) || pageNum < 0) {
        new Notice('⨉ الرجاء إدخال رقم صحيح');
        return;
    }
    
    const todayPages = pageNum - totalPagesSoFar;
    if (todayPages < 0) {
        new Notice('⚠️ رقم الصفحة أقل من المجموع السابق');
        return;
    }
    
    // إغلاق النافذة أولاً
    closeModal();
    
    if (todayPages === 0) {
        const confirmed = confirm('⚠️ لم تقرأ أي صفحات اليوم. هل أنت متأكد؟');
        if (!confirmed) {
            return;
        }
    }
    
    // حفظ النتيجة
    await app.fileManager.processFrontMatter(currentFile, (fm) => {
        fm["Number of Pages (reading)"] = todayPages;
    });
    
    // تسجيل وقت الإدخال
    localStorage.setItem(LAST_INPUT_KEY, Date.now().toString());
    
    new Notice(`✓ تم تسجيل ${todayPages} صفحة`);
    
    // عرض رسالة مع رابط للصفحة الجديدة
    setTimeout(() => {
        new Notice(`✓ يمكنك الآن الاستمرار من صفحة ${pageNum}`);
    }, 1500);
});

// معالج الضغط على Enter في حقل الإدخال
input.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        modalDiv.querySelector('#modal-submit').click();
    }
});
```
-->