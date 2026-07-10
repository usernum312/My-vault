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
   كود تتبع تلاوة القرآن الكريم - النسخة المرنة (اليوم ± يومين)
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

// دالة جديدة للتحقق مما إذا كان الملف يخص اليوم، أمس، أو قبل أمس (تأخير حتى يومين)
function isFileWithinAllowedRange(fileBasename) {
    if (!fileBasename) return false;
    
    // تحويل اسم الملف (الذي من المفترض أن يكون تاريخاً) إلى كائن تاريخ
    const fileParts = fileBasename.split('-');
    if (fileParts.length !== 3) return false; // إذا لم يكن الاسم بصيغة تاريخ تخطّاه
    
    const fileDate = new Date(fileParts[0], fileParts[1] - 1, fileParts[2]);
    
    // إنشاء كائن تاريخ اليوم بدون توقيت (ساعات/دقائق) للمقارنة العادلة
    const midnightToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    
    // حساب الفارق بالأيام
    const diffTime = midnightToday - fileDate;
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    
    // يرجع true إذا كان الملف اليوم (0)، أمس (1)، أو قبل أمس (2)
    return diffDays >= 0 && diffDays <= 2;
}

const currentFile = app.workspace.getActiveFile();

// التحقق المرن: إذا تغير الملف أو لم يكن ضمن النطاق المسموح (اليوم أو متأخر يومين)، احذف الزر وتوقف
if (!currentFile || !isFileWithinAllowedRange(currentFile.basename)) {
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
   1. الزر الدائري العائم (leaf رئيسي فقط)
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
   2. التشغيل الرئيسي (التحقق من الوقت + Cooldown)
   ==================================================== */
async function runQuranTracker() {
    const content = await app.vault.read(currentFile);
    const now = new Date();
    
    // استخدام اسم ملف المذكرات نفسه للمفاتيح الفريدة بدلاً من تاريخ اليوم الثابت دائماً
    const fileDate = currentFile.basename; 
    const LAST_INPUT_KEY = `[[quran]]-pages-last-input-${currentFile.path}`;

    // await syncTaskAndProperty();
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
    if (showCount >= 3) {
        console.log("🚫 ظهرت النافذة 3 مرات لهذا الملف اليوم بالفعل.");
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
   3. نافذة الإدخال 
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

    // إنشاء قائمة السور كاملة مع الأرقام
    const surahList = surahNames.map((name, i) => `${i+1}- ${name}`);

    // دالة مساعدة لاستخراج فهرس السورة من قيمة الحقل
    function getSurahIndexFromInput(inputEl) {
        const val = inputEl.value.trim();
        if (!val) return -1;
        // محاولة استخراج الرقم من بداية النص (مثل "1- الفاتحة")
        const match = val.match(/^(\d+)\s*[-–—]\s*/);
        if (match) {
            const idx = parseInt(match[1]) - 1;
            if (idx >= 0 && idx < surahNames.length) return idx;
        }
        // إذا لم نجد رقماً، نحاول مطابقة النص مع أسماء السور (بحث جزئي)
        const lowerVal = val.toLowerCase();
        for (let i = 0; i < surahNames.length; i++) {
            if (surahNames[i].includes(lowerVal)) return i;
        }
        return -1;
    }

    // دالة لاستخراج رقم الصفحة التي تبدأ منها السورة
    function getSurahStartPage(index) {
        if (index >= 0 && index < surahPages.length) {
            return surahPages[index];
        }
        return -1;
    }

    // دالة لاستخراج رقم الصفحة التي تنتهي عندها السورة
    function getSurahEndPage(index) {
        if (index >= 0 && index < surahPages.length - 1) {
            return surahPages[index + 1] - 1;
        }
        return -1;
    }

    // دالة لإنشاء القائمة المنسدلة المخصصة
    function createCustomAutocomplete(inputElement, allOptions) {
        const container = inputElement.parentElement;
        const dropdown = document.createElement('div');
        dropdown.className = 'surah-autocomplete-dropdown';
        dropdown.style.cssText = `
            position: absolute;
            top: 100%;
            left: 0;
            right: 0;
            background: var(--background-primary);
            border: 1px solid var(--background-modifier-border);
            border-radius: 8px;
            max-height: 200px;
            overflow-y: auto;
            display: none;
            z-index: 10000;
            box-shadow: 0 4px 12px rgba(0,0,0,0.3);
            margin-top: 2px;
            direction: rtl;
        `;
        
        // إضافة ستايل للخيارات
        const style = document.createElement('style');
        style.textContent = `
            .surah-autocomplete-dropdown .option-item {
                padding: 8px 12px;
                cursor: pointer;
                color: var(--text-normal);
                border-bottom: 1px solid var(--background-modifier-border);
                transition: background 0.15s;
                text-align: right;
                direction: rtl;
            }
            .surah-autocomplete-dropdown .option-item:hover {
                background: var(--background-modifier-hover);
            }
            .surah-autocomplete-dropdown .option-item.selected {
                background: var(--interactive-accent);
                color: var(--text-on-accent);
            }
            .surah-autocomplete-dropdown .option-item:last-child {
                border-bottom: none;
            }
            .surah-autocomplete-dropdown::-webkit-scrollbar {
                width: 6px;
            }
            .surah-autocomplete-dropdown::-webkit-scrollbar-track {
                background: var(--background-secondary);
            }
            .surah-autocomplete-dropdown::-webkit-scrollbar-thumb {
                background: var(--background-modifier-border);
                border-radius: 3px;
            }
        `;
        document.head.appendChild(style);
        
        container.style.position = 'relative';
        container.appendChild(dropdown);
        
        let currentFocus = -1;
        
        function updateDropdown(filterText = '') {
            const filtered = allOptions.filter(opt => 
                opt.includes(filterText) || 
                surahNames.some(name => name.includes(filterText))
            );
            
            dropdown.innerHTML = '';
            if (filtered.length === 0) {
                dropdown.style.display = 'none';
                return;
            }
            
            filtered.forEach((opt, index) => {
                const item = document.createElement('div');
                item.className = 'option-item';
                item.textContent = opt;
                item.dataset.index = index;
                
                // تسليط الضوء على النص المطابق
                if (filterText) {
                    const regex = new RegExp(filterText, 'gi');
                    item.innerHTML = opt.replace(regex, match => `<strong>${match}</strong>`);
                }
                
                item.addEventListener('click', () => {
                    inputElement.value = opt;
                    dropdown.style.display = 'none';
                    inputElement.focus();
                    // تشغيل حدث input لتحديث النتيجة
                    inputElement.dispatchEvent(new Event('input'));
                });
                
                dropdown.appendChild(item);
            });
            
            dropdown.style.display = 'block';
            currentFocus = -1;
        }
        
        inputElement.addEventListener('input', function(e) {
            const val = this.value;
            updateDropdown(val);
        });
        
        inputElement.addEventListener('focus', function(e) {
            if (this.value) {
                updateDropdown(this.value);
            } else {
                updateDropdown('');
            }
        });
        
        inputElement.addEventListener('blur', function(e) {
            setTimeout(() => {
                dropdown.style.display = 'none';
            }, 150);
        });
        
        // دعم التنقل بالأسهم و Enter
        inputElement.addEventListener('keydown', function(e) {
            const items = dropdown.querySelectorAll('.option-item');
            if (items.length === 0) return;
            
            if (e.key === 'ArrowDown') {
                e.preventDefault();
                currentFocus = (currentFocus + 1) % items.length;
                items.forEach((item, idx) => {
                    item.classList.toggle('selected', idx === currentFocus);
                });
                items[currentFocus]?.scrollIntoView({ block: 'nearest' });
            } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                currentFocus = (currentFocus - 1 + items.length) % items.length;
                items.forEach((item, idx) => {
                    item.classList.toggle('selected', idx === currentFocus);
                });
                items[currentFocus]?.scrollIntoView({ block: 'nearest' });
            } else if (e.key === 'Enter') {
                e.preventDefault();
                if (currentFocus >= 0 && currentFocus < items.length) {
                    const selectedItem = items[currentFocus];
                    inputElement.value = selectedItem.textContent;
                    dropdown.style.display = 'none';
                    inputElement.dispatchEvent(new Event('input'));
                }
            } else if (e.key === 'Escape') {
                dropdown.style.display = 'none';
            }
        });
        
        return dropdown;
    }

    const modalHtml = `
    <style>
        .q-tab-btn { flex: 1; padding: 8px; background: transparent; border: 1px solid var(--background-modifier-border); color: var(--text-muted); cursor: pointer; border-radius: 8px; font-size: 12px; }
        .q-tab-btn.active { background: var(--interactive-accent); color: var(--text-on-accent); }
        .q-tab-content { display: none; padding-top: 5px; }
        .q-tab-content.active { display: block; }
        .q-input { 
            width: 100%; 
            padding: 10px; 
            border-radius: 8px; 
            border: 1px solid var(--background-modifier-border); 
            background: var(--background-secondary); 
            color: var(--text-normal);
            text-align: right;
            direction: rtl;
        }
        .q-input:focus {
            border-color: var(--interactive-accent);
            outline: none;
            box-shadow: 0 0 0 2px var(--interactive-accent-hover);
        }
        .q-select { width: 100%; padding: 8px; border-radius: 8px; background: var(--background-primary); color: var(--text-normal); border: 1px solid var(--background-modifier-border); }
        .q-range-input { display: flex; gap: 10px; align-items: center; }
        .q-range-input input { flex: 1; }
        .q-range-label { font-size: 14px; color: var(--text-muted); white-space: nowrap; }
        .autocomplete-wrapper {
            position: relative;
            margin-bottom: 10px;
        }
        .autocomplete-wrapper:last-of-type {
            margin-bottom: 0;
        }
    </style>
    <div class="quran-modal modal-container" style="direction: rtl; position: fixed; top: 0; left: 0; width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; z-index: 1000; background: rgba(0,0,0,0.4);">
        <div class="modal" style="background: var(--background-primary); border-radius: 12px; padding: 20px; width: 380px; border: 1px solid var(--background-modifier-border); max-height: 90vh; overflow-y: auto;">
            <div id="modal-read" style="text-align: center !important;margin-bottom: 15px !important;"><a href="obsidian://open?vault=My-vault&file=001%20Basics%2FQuran" style="text-align:center;background-color:var(--interactive-accent);color:var(--text-on-accent);border:none;border-radius:20px;text-decoration: none;padding: 5px 15px;">لا تهجر القرآن</a></div>
            <div style="display: flex; gap: 5px; margin-bottom: 15px;">
                <button class="q-tab-btn active" data-target="mode1">الصفحة</button>
                <button class="q-tab-btn" data-target="mode2">العدد</button>
                <button class="q-tab-btn" data-target="mode3">السور</button>
            </div>
            <div id="mode1" class="q-tab-content active">
                <input type="number" id="input-mode1" class="q-input" placeholder="رقم الصفحة التي وصلت إليها..." autofocus dir="rtl">
            </div>
            <div id="mode2" class="q-tab-content">
                <div class="q-range-input">
                    <input type="number" id="input-mode2-start" class="q-input" placeholder="من صفحة" style="flex: 1;" dir="rtl">
                    <span class="q-range-label">إلى</span>
                    <input type="number" id="input-mode2-end" class="q-input" placeholder="إلى صفحة" style="flex: 1;" align="rtl">
                </div>
                <div id="mode2-result" style="margin-top: 10px; text-align: center; color: var(--text-accent); font-weight: bold;">المجموع: 0 صفحة</div>
            </div>
            <div id="mode3" class="q-tab-content">
                <div class="autocomplete-wrapper">
                    <input id="input-start" class="q-input" placeholder="اختر سورة البداية..." dir="rtl" autocomplete="off">
                </div>
                <div class="autocomplete-wrapper">
                    <input id="input-end" class="q-input" placeholder="اختر سورة النهاية (اختياري)..." dir="rtl" autocomplete="off">
                </div>
                <div id="surah-result" style="margin-top:10px; text-align:center; color:var(--text-accent); font-weight:bold;">المجموع: 0 صفحة</div>
            </div>
            <div style="display: flex; gap: 10px; margin-top: 20px;">
                <button id="modal-submit" style="flex: 2; padding: 10px; border-radius: 8px; background: var(--interactive-accent); color: var(--text-on-accent); border: none; cursor: pointer;">حفظ</button>
                <button id="modal-cancel" style="flex: 1; padding: 10px; border-radius: 8px; background: transparent; border: 1px solid var(--background-modifier-border); cursor: pointer;">إلغاء</button>
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

    // عناصر الوضع الثالث (السور) مع الـ autocomplete المخصص
    const startInput = modalDiv.querySelector('#input-start');
    const endInput = modalDiv.querySelector('#input-end');
    const surahResult = modalDiv.querySelector('#surah-result');

    // إنشاء قوائم الـ autocomplete المخصصة
    createCustomAutocomplete(startInput, surahList);
    createCustomAutocomplete(endInput, surahList);

    // دالة حساب عدد الصفحات من السور (مع دعم سورة واحدة فقط)
    function calcSurah() {
        const sIdx = getSurahIndexFromInput(startInput);
        const eIdx = getSurahIndexFromInput(endInput);
        
        // إذا لم يتم اختيار سورة البداية، لا نعرض شيء
        if (sIdx === -1) {
            surahResult.innerText = `المجموع: 0 صفحة`;
            return;
        }
        
        // إذا تم اختيار سورة البداية فقط (أو النهاية غير صالحة)
        if (eIdx === -1 || eIdx < sIdx) {
            // حساب عدد صفحات سورة البداية فقط
            const startPage = getSurahStartPage(sIdx);
            const endPage = getSurahEndPage(sIdx);
            if (startPage !== -1 && endPage !== -1) {
                const pages = endPage - startPage + 1;
                surahResult.innerText = `المجموع: ${pages} صفحة (سورة ${surahNames[sIdx]} فقط)`;
            } else {
                surahResult.innerText = `المجموع: 0 صفحة`;
            }
            return;
        }
        
        // إذا تم اختيار سورة البداية والنهاية معاً
        const startPage = getSurahStartPage(sIdx);
        const endPage = getSurahEndPage(eIdx);
        if (startPage !== -1 && endPage !== -1) {
            const pages = endPage - startPage + 1;
            surahResult.innerText = `المجموع: ${pages} صفحة (من ${surahNames[sIdx]} إلى ${surahNames[eIdx]})`;
        } else {
            surahResult.innerText = `المجموع: 0 صفحة`;
        }
    }

    // ربط الأحداث لتحديث النتيجة فورًا عند الكتابة
    startInput.addEventListener('input', calcSurah);
    endInput.addEventListener('input', calcSurah);
    startInput.addEventListener('change', calcSurah);
    endInput.addEventListener('change', calcSurah);

    // إضافة حساب تلقائي لوضع العدد
    const startInput2 = modalDiv.querySelector('#input-mode2-start');
    const endInput2 = modalDiv.querySelector('#input-mode2-end');
    const mode2Result = modalDiv.querySelector('#mode2-result');

    function calcPages() {
        const start = parseInt(startInput2.value);
        const end = parseInt(endInput2.value);
        if (!isNaN(start) && !isNaN(end) && end >= start) {
            const total = end - start + 1;
            mode2Result.innerText = `المجموع: ${total} صفحة`;
        } else {
            mode2Result.innerText = `المجموع: 0 صفحة`;
        }
    }

    startInput2.addEventListener('input', calcPages);
    endInput2.addEventListener('input', calcPages);

    // زر الإلغاء
    modalDiv.querySelector('#modal-cancel').addEventListener('click', () => modalDiv.remove());
    modalDiv.querySelector('#modal-read').addEventListener('click', () => modalDiv.remove());
    
    // زر الحفظ
    modalDiv.querySelector('#modal-submit').addEventListener('click', async () => {
        let added = 0;
        let surahInfo = '';
        
        if (currentMode === 'mode1') {
            const inputVal = modalDiv.querySelector('#input-mode1').value;
            if (!inputVal) {
                new Notice('⚠️ الرجاء إدخال رقم الصفحة');
                return;
            }
            added = parseInt(inputVal) - totalPagesSoFar;
            if (isNaN(added) || added < 0) {
                new Notice('⚠️ الرجاء إدخال صفحة أكبر من الصفحة الحالية');
                return;
            }
        }
        else if (currentMode === 'mode2') {
            const start = parseInt(modalDiv.querySelector('#input-mode2-start').value);
            const end = parseInt(modalDiv.querySelector('#input-mode2-end').value);
            if (!isNaN(start) && !isNaN(end) && end >= start && start > 0 && end > 0) {
                added = end - start + 1;
            } else {
                new Notice('⚠️ تأكد من إدخال أرقام صحيحة (البداية <= النهاية)');
                return;
            }
        }
        else if (currentMode === 'mode3') {
            const sIdx = getSurahIndexFromInput(startInput);
            const eIdx = getSurahIndexFromInput(endInput);
            
            // يجب اختيار سورة البداية على الأقل
            if (sIdx === -1) {
                new Notice('⚠️ الرجاء اختيار سورة البداية');
                return;
            }
            
            // إذا تم اختيار سورة البداية فقط
            if (eIdx === -1 || eIdx < sIdx) {
                // حساب عدد صفحات سورة البداية فقط
                const startPage = getSurahStartPage(sIdx);
                const endPage = getSurahEndPage(sIdx);
                if (startPage !== -1 && endPage !== -1) {
                    added = endPage - startPage + 1;
                    surahInfo = `سورة ${surahNames[sIdx]}`;
                } else {
                    new Notice('⚠️ خطأ في حساب صفحات السورة');
                    return;
                }
            } else {
                // حساب عدد الصفحات من سورة البداية إلى سورة النهاية
                const startPage = getSurahStartPage(sIdx);
                const endPage = getSurahEndPage(eIdx);
                if (startPage !== -1 && endPage !== -1 && endPage >= startPage) {
                    added = endPage - startPage + 1;
                    surahInfo = `من ${surahNames[sIdx]} إلى ${surahNames[eIdx]}`;
                } else {
                    new Notice('⚠️ خطأ في حساب الصفحات');
                    return;
                }
            }
            
            if (added <= 0) {
                new Notice('⚠️ عدد الصفحات يجب أن يكون أكبر من صفر');
                return;
            }
        }

        if (isNaN(added) || added < 0) { 
            new Notice('⚠️ خطأ في الإدخال'); 
            return; 
        }

        modalDiv.remove();
        
        // 1. تحديث بيانات الفونتماتر أولاً
        await app.fileManager.processFrontMatter(currentFile, (fm) => {
            fm["Number of Pages (reading)"] = added;
        });

        // 2. تحديث حالة المهمة في نص الملف (خارج دالة الفيرونتماتر لتجنب الخطأ)
        if ((totalPagesSoFar + added) > 10) { 
            const content = await app.vault.read(currentFile); 
            const lines = content.split('\n'); 
            let isModified = false;
            
            for (let i = 0; i < lines.length; i++) { 
                const line = lines[i]; 
                if (/- \[[ xX]\]/.test(line) && line.includes('قراءة') && line.includes('القرآن') && !/- \[[xX]\]/.test(line)) { 
                    lines[i] = line.replace(/- \[ \]/, '- [x]'); 
                    isModified = true;
                    break; 
                } 
            } 
            
            if (isModified) {
                await app.vault.modify(currentFile, lines.join('\n')); 
            }
        }

        localStorage.setItem(LAST_INPUT_KEY, Date.now().toString());
        
        // عرض رسالة مناسبة
        let message = `✓ تم تسجيل ${added} صفحة`;
        if (surahInfo) {
            message += ` (${surahInfo})`;
        }
        new Notice(message);
    });
}

// تشغيل السكربت للمرة الأولى
runQuranTracker();

// إضافة مستمع لحدث تغيير الملفات النشطة لمسح الزر تلقائياً عند الانتقال لملف خارج النطاق المسموح
if (!window.__quranListenerAdded) {
    app.workspace.on('file-open', (file) => {
        if (!file || !isFileWithinAllowedRange(file.basename)) {
            removeExistingButton();
        }
    });
    window.__quranListenerAdded = true;
}
```