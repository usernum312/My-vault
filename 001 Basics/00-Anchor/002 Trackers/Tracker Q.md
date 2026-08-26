---
icon: lucide-form-input
banner: https://marketplace.canva.com/EAHBFGCGpKk/1/0/1131w/canva-green-and-white-modern-islamic-qur%27an-tracker-document-4lD2UK58iBg.jpg
banner_y: 15
cssclasses:
  - metadata-clean
ui: edit
---
```dataviewjs
/* ========================================================================== 
   كود تتبع تلاوة القرآن الكريم - النسخة المحدثة (مع إصلاح حساب أجزاء الصفحات)
   ========================================================================== */

// مسار وملف الكود الحالي
const SCRIPT_FILE_PATH = dv.current().file.path;

// --- 0. نظام التخزين الموحد والتنظيف التلقائي ---
const STORAGE_KEY = 'quran_tracker_store';
const QURAN_JSON_PATH = ".obsidian/quran.json";

// دوال قراءة وتحديث رقم الصفحة من ملف JSON المباشر
const getLastReachedPageFromJSON = async () => {
  try {
    const exists = await app.vault.adapter.exists(QURAN_JSON_PATH);
    if (!exists) return 0;
    
    const content = await app.vault.adapter.read(QURAN_JSON_PATH);
    const data = JSON.parse(content);
    
    if (Array.isArray(data) && data.length > 0) {
      const lastItem = data[data.length - 1];
      return lastItem?.lastReachedPage ?? 0;
    }
    return 0;
  } catch (e) {
    console.error("خطأ في قراءة ملف quran.json:", e);
    return 0;
  }
};

const saveLastReachedPageToJSON = async (newPage) => {
  try {
    const exists = await app.vault.adapter.exists(QURAN_JSON_PATH);
    if (!exists) {
      new Notice("⚠️ لم يتم العثور على الملف في المسار .obsidian/quran.json");
      return;
    }

    const content = await app.vault.adapter.read(QURAN_JSON_PATH);
    const data = JSON.parse(content);

    if (!Array.isArray(data)) return;

    const lastIndex = data.length - 1;
    if (lastIndex >= 0 && data[lastIndex].hasOwnProperty('lastReachedPage')) {
      data[lastIndex].lastReachedPage = newPage;
    } else {
      data.push({ lastReachedPage: newPage });
    }

    await app.vault.adapter.write(QURAN_JSON_PATH, JSON.stringify(data, null, 2));
    new Notice(`✅ تم تحديث الصفحة (${newPage}) بنجاح داخل quran.json`);
  } catch (e) {
    console.error("خطأ في تعديل ملف quran.json:", e);
    new Notice("❌ حدث خطأ أثناء التعديل على ملف quran.json");
  }
};

const getStore = () => {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || { lastInputs: {}, showCounts: {} };
  } catch (e) {
    return { lastInputs: {}, showCounts: {} };
  }
};

const saveStore = (store) => {
  const DAYS_MS = 1 * 24 * 60 * 60 * 1000;
  const now = Date.now();

  if (store.lastInputs) {
    for (const path in store.lastInputs) {
      if (now - store.lastInputs[path] > DAYS_MS) {
        delete store.lastInputs[path];
      }
    }
  }

  if (store.showCounts) {
    for (const dateStr in store.showCounts) {
      if (now - Date.parse(dateStr) > DAYS_MS) {
        delete store.showCounts[dateStr];
      }
    }
  }

  localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
};

// --- 1. البيانات الثابتة للمصحف الشريف ---
const SURAH_NAMES = [
  "الفاتحة", "البقرة", "آل عمران", "النساء", "المائدة", "الأنعام", "الأعراف", "الأنفال", "التوبة", "يونس", "هود", "يوسف", "الرعد", "إبراهيم", "الحجر", "النحل", "الإسراء", "الكهف", "مريم", "طه", "الأنبيائ", "الحج", "المؤمنون", "النور", "الفرقان", "الشعراء", "النمل", "القصص", "العنكبوت", "الروم", "لقمان", "السجدة", "الأحزاب", "سبأ", "فاطر", "يس", "الصافات", "ص", "الزمر", "غافر", "فصلت", "الشورى", "الزخرف", "الدخان", "الجاثية", "الأحقاف", "محمد", "الفتح", "الحجرات", "ق", "الذاريات", "الطور", "النجم", "القمر", "الرحمن", "الواقعة", "الحديد", "المجادلة", "الحشر", "الممتحنة", "الصف", "الجمعة", "المنافقون", "التغابن", "الطلاق", "التحريم", "الملك", "القلم", "الحاقة", "المعارج", "نوح", "الجن", "المزمل", "المدثر", "القيامة", "الإنسان", "المرسلات", "النبأ", "النازعات", "عبس", "التكوير", "الانفطار", "المطففين", "الانشقاق", "البروج", "الطارق", "الأعلى", "الغاشية", "الفجر", "البلد", "الشمس", "الليل", "الضحى", "الشرح", "التين", "العلق", "القدر", "البينة", "الزلزلة", "العاديات", "القارعة", "التكاثر", "العصر", "الهمزة", "الفيل", "قريش", "الماعون", "الكوثر", "الكافرون", "النصر", "المسد", "الإخلاص", "الفلق", "الناس"
];

const SURAH_PAGES = [1.0,2.0,50.0,77.0,106.4,128.0,151.0,177.0,187.0,208.0,221.4,235.6,249.0,255.2,262.0,267.4,282.0,293.6,305.0,312.3,322.0,332.0,342.0,350.0,359.7,367.0,377.0,385.5,396.5,404.6,411.0,415.0,418.0,428.0,434.5,440.2,446.0,453.0,458.2,467.2,477.0,483.0,489.3,496.0,499.0,502.4,507.0,511.0,515.4,518.0,520.8,523.5,526.0,528.6,531.3,534.4,537.7,542.0,545.4,549.0,551.4,553.0,554.4,556.0,558.0,560.0,562.0,564.4,566.6,568.6,570.3,572.0,574.0,575.5,577.4,578.6,580.4,582.0,583.5,585.0,586.0,587.7,587.7,589.1,590.0,591.5,591.5,592.2,592.2,593.0,595.6,595.6,596.2,596.7,597.0,597.4,598.0,598.4,599.2,599.6,600.1,600.6,601.0,601.3,601.7,602.0,602.4,602.8,603.0,603.4,603.7,604.0,604.3,604.6,605.0];

const SURAH_LIST = SURAH_NAMES.map((name, i) => `${i + 1}- ${name}`);

// --- 2. دوال التحقق الصارمة من التواريخ والتضمين ---
const isDateFile = (file) => {
  if (!file) return false;
  const parts = file.basename.split('-');
  if (parts.length !== 3) return false;
  const fileDate = new Date(parts[0], parts[1] - 1, parts[2]);
  return !isNaN(fileDate.getTime());
};

const getDateFileDiffDays = (file) => {
  if (!isDateFile(file)) return -1;
  const parts = file.basename.split('-');
  const fileDate = new Date(parts[0], parts[1] - 1, parts[2]);
  const today = new Date();
  const midnightToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const diffTime = midnightToday - fileDate;
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
};

const isScriptEmbeddedIn = (file, visited = new Set()) => {
  if (!file || visited.has(file.path)) return false;
  visited.add(file.path);

  if (file.path === SCRIPT_FILE_PATH) return true;

  const cache = app.metadataCache.getFileCache(file);
  if (!cache || !cache.embeds) return false;

  for (const embed of cache.embeds) {
    const targetFile = app.metadataCache.getFirstLinkpathDest(embed.link, file.path);
    if (targetFile) {
      if (targetFile.path === SCRIPT_FILE_PATH) return true;
      if (isScriptEmbeddedIn(targetFile, visited)) return true;
    }
  }
  return false;
};

const getLatestAvailableDateFile = () => {
  const allFiles = app.vault.getMarkdownFiles();
  let bestFile = null;
  let minDiff = Infinity;

  for (const file of allFiles) {
    if (isDateFile(file)) {
      const diffDays = getDateFileDiffDays(file);
      if (diffDays >= 0 && diffDays <= 2 && diffDays < minDiff) {
        minDiff = diffDays;
        bestFile = file;
      }
    }
  }
  return bestFile;
};

// --- 3. دوال مساعدة لإدارة الـ UI والزر العائم ---
const removeExistingButton = () => {
  const activeLeaf = app.workspace.getActiveViewOfType(Object)?.leaf || app.workspace.getMostRecentLeaf();
  if (activeLeaf?.view?.containerEl) {
    const existingBtn = activeLeaf.view.containerEl.querySelector('.quran-float-btn');
    if (existingBtn) existingBtn.remove();
  }
};

// --- 4. دوال حساب صفحات السور والبحث المتقدم (مع إصلاح الأرقام العشرية) ---
const getSurahIndexFromInput = (val) => {
  val = val.trim().toLowerCase();
  if (!val) return -1;
  const match = val.match(/^(\d+)\s*[-–—]?\s*/);
  if (match) {
    const idx = parseInt(match[1], 10) - 1;
    if (idx >= 0 && idx < SURAH_NAMES.length) return idx;
  }
  return SURAH_NAMES.findIndex(name => name.toLowerCase().includes(val));
};

const getSurahStartPage = (index) => (index >= 0 && index < SURAH_PAGES.length) ? SURAH_PAGES[index] : -1;

const getSurahNextStartPage = (index) => {
  if (index >= 0 && index < SURAH_PAGES.length - 1) {
    return SURAH_PAGES[index + 1];
  }
  return 605.0; // نهاية المصحف
};

// --- 5. دالة الـ Autocomplete ---
const createCustomAutocomplete = (inputElement, allOptions) => {
  const container = inputElement.parentElement;
  container.style.position = 'relative';
  const dropdown = document.createElement('div');
  dropdown.className = 'surah-autocomplete-dropdown';
  Object.assign(dropdown.style, {
    position: 'absolute',
    bottom: '100%',
    left: '0',
    right: '0',
    background: 'var(--background-primary)',
    border: '1px solid var(--background-modifier-border)',
    borderRadius: '8px',
    maxHeight: '200px',
    overflowY: 'auto',
    display: 'none',
    zIndex: '10000',
    boxShadow: '0 -4px 12px rgba(0,0,0,0.3)',
    marginBottom: '4px',
    direction: 'rtl'
  });

  if (!document.getElementById('surah-dropdown-styles')) {
    const style = document.createElement('style');
    style.id = 'surah-dropdown-styles';
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
  }

  container.appendChild(dropdown);
  let currentFocus = -1;

  const updateDropdown = (filterText = '') => {
    if (inputElement.dataset.type === 'page') {
      dropdown.style.display = 'none';
      return;
    }
    const lowerFilter = filterText.toLowerCase();
    const filtered = allOptions.filter(opt => {
      const isMatchInFullOption = opt.toLowerCase().includes(lowerFilter);
      const isMatchInSurahName = SURAH_NAMES.some(name => name.toLowerCase().includes(lowerFilter) && opt.includes(name));
      return isMatchInFullOption || isMatchInSurahName;
    });

    dropdown.innerHTML = '';
    if (filtered.length === 0) {
      dropdown.style.display = 'none';
      return;
    }

    filtered.forEach((opt, index) => {
      const item = document.createElement('div');
      item.className = 'option-item';
      item.dataset.index = index;
      if (filterText) {
        const regex = new RegExp(filterText, 'gi');
        item.innerHTML = opt.replace(regex, match => `<strong>${match}</strong>`);
      } else {
        item.textContent = opt;
      }
      item.addEventListener('click', () => {
        inputElement.value = opt;
        dropdown.style.display = 'none';
        inputElement.focus();
        inputElement.dispatchEvent(new Event('input'));
      });
      dropdown.appendChild(item);
    });
    dropdown.style.display = 'block';
    currentFocus = -1;
  };

  inputElement.addEventListener('input', (e) => updateDropdown(e.target.value));
  inputElement.addEventListener('focus', (e) => updateDropdown(e.target.value));
  inputElement.addEventListener('blur', () => {
    setTimeout(() => { dropdown.style.display = 'none'; }, 150);
  });
  inputElement.addEventListener('keydown', (e) => {
    const items = dropdown.querySelectorAll('.option-item');
    if (items.length === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      currentFocus = (currentFocus + 1) % items.length;
      items.forEach((item, idx) => item.classList.toggle('selected', idx === currentFocus));
      items[currentFocus]?.scrollIntoView({ block: 'nearest' });
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      currentFocus = (currentFocus - 1 + items.length) % items.length;
      items.forEach((item, idx) => item.classList.toggle('selected', idx === currentFocus));
      items[currentFocus]?.scrollIntoView({ block: 'nearest' });
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (currentFocus >= 0 && currentFocus < items.length) {
        inputElement.value = items[currentFocus].textContent;
        dropdown.style.display = 'none';
        inputElement.dispatchEvent(new Event('input'));
      }
    } else if (e.key === 'Escape') {
      dropdown.style.display = 'none';
    }
  });

  return dropdown;
};

// --- 6. الزر الدائري العائم ---
const addFloatingButton = (targetFile) => {
  const currentFile = app.workspace.getActiveFile();
  let targetLeaf = null;
  app.workspace.iterateAllLeaves(leaf => {
    if (leaf.view?.file?.path === currentFile.path && leaf.getRoot() === app.workspace.rootSplit) {
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
    position: 'absolute',
    bottom: '28px',
    right: '30px',
    width: '42px',
    height: '42px',
    borderRadius: '50%',
    background: 'var(--interactive-accent)',
    opacity: '0.6',
    border: 'none',
    cursor: 'pointer',
    zIndex: '200',
    fontSize: '20px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    boxShadow: '0 2px 10px rgba(0,0,0,0.3)',
    transition: 'opacity 0.2s, transform 0.2s',
    pointerEvents: 'auto',
  });

  if (!document.getElementById('quran-btn-styles')) {
    const styleTag = document.createElement('style');
    styleTag.id = 'quran-btn-styles';
    styleTag.textContent = `
      @media (orientation: portrait) {
        .is-mobile .quran-float-btn { bottom: 80px !important; }
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

  btn.addEventListener('click', () => {
    const activeF = app.workspace.getActiveFile();
    let finalTarget = null;

    if (isDateFile(activeF)) {
      const diffDays = getDateFileDiffDays(activeF);
      if (diffDays < 0 || diffDays > 2) {
        return new Notice("⚠️ ملف التاريخ هذا أقدم من يومين، لا يمكن الحفظ فيه.");
      }
      finalTarget = activeF;
    } else {
      finalTarget = getLatestAvailableDateFile();
      if (!finalTarget) {
        return new Notice("⚠️ لم يتم العثور على ملف تاريخ مناسب (ضمن اليومين الأخيرة) للحفظ فيه!");
      }
    }

    renderActualModal(finalTarget);
  });

  if (getComputedStyle(viewEl).position === 'static') {
    viewEl.style.position = 'relative';
  }
  viewEl.appendChild(btn);
};

// --- 7. بناء نافذة الإدخال الرئيسية (Modal) ---
const renderActualModal = async (targetFile) => {
  const currentFile = targetFile;
  const store = getStore();

  const lastReachedPage = await getLastReachedPageFromJSON();

  const modalHtml = `
    <style>
      .q-tab-btn { flex: 1; padding: 8px; background: transparent; border: 1px solid var(--background-modifier-border); color: var(--text-muted); cursor: pointer; border-radius: 8px; font-size: 13px; }
      .q-tab-btn.active { background: var(--interactive-accent); color: var(--text-on-accent); }
      .q-tab-content { display: none; padding-top: 5px; }
      .q-tab-content.active { display: block; }
      .quran-modal .q-input { width: 100% !important; padding: 10px !important; border-radius: 8px !important; border: 1px solid var(--background-modifier-border) !important; background: var(--background-secondary) !important; color: var(--text-normal) !important; text-align: right !important; direction: rtl !important; height: 40px !important; }
      .quran-modal .q-input:focus { outline: none !important; box-shadow: 0 0 0 2px var(--interactive-accent-hover) !important; }
      .q-row { display: flex; gap: 8px; align-items: center; margin-top: 10px; }
      .q-select-type { padding: 8px; border-radius: 8px; border: 1px solid var(--background-modifier-border); background: var(--background-secondary); color: var(--text-normal); cursor: pointer; font-size: 12.2px; height: 40px; }
      .autocomplete-wrapper { position: relative; flex: 1; }
    </style>
    <div class="quran-modal modal-container" style="direction: rtl; position: fixed; top: 0; left: 0; width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; z-index: 1000; background: rgba(0,0,0,0.4);">
      <div class="modal" style="background: var(--background-primary); border-radius: 12px; padding: 20px; width: 380px; border: 1px solid var(--background-modifier-border); max-height: 90vh; overflow-y: auto;">
        <div id="modal-read" style="text-align: center !important; margin-bottom: 15px !important;">
          <a href="obsidian://open?vault=My-vault&file=001%20Basics%2FQuran" style="text-align:center; background-color:var(--interactive-accent); color:var(--text-on-accent); border:none; border-radius:20px; text-decoration: none; padding: 5px 15px;">لا تهجر القرآن</a>
        </div>
        <div style="display: flex; gap: 5px; margin-bottom: 15px;">
          <button class="q-tab-btn active" data-target="mode1">وصلت لصفحة (ختمة)</button>
          <button class="q-tab-btn" data-target="mode2">التلاوة (سور/صفحات)</button>
        </div>

        <div id="mode1" class="q-tab-content active">
          <input type="number" id="input-mode1" class="q-input" placeholder="رقم الصفحة التي وصلت إليها..." autofocus dir="rtl">
          ${lastReachedPage > 0 ? `<div style="font-size: 11px; color: var(--text-muted); margin-top: 5px; text-align: right;">آخر صفحة مسجلة: ${lastReachedPage}</div>` : ''}
        </div>

        <div id="mode2" class="q-tab-content">
          <div class="q-row">
            <select id="type-start" class="q-select-type">
              <option value="surah" selected>سورة</option>
              <option value="page">صفحة</option>
            </select>
            <div class="autocomplete-wrapper">
              <input id="input-start" class="q-input" placeholder="اختر سورة البداية..." dir="rtl" autocomplete="off" data-type="surah">
            </div>
          </div>

          <div class="q-row">
            <select id="type-end" class="q-select-type">
              <option value="surah" selected>سورة</option>
              <option value="page">صفحة</option>
            </select>
            <div class="autocomplete-wrapper">
              <input id="input-end" class="q-input" placeholder="اختر سورة النهاية (اختياري)..." dir="rtl" autocomplete="off" data-type="surah">
            </div>
          </div>

          <div id="combined-result" style="margin-top:15px; text-align:center; color:var(--text-accent); font-weight:bold;">المجموع: 0 صفحة</div>
        </div>

        <div style="display: flex; gap: 10px; margin-top: 20px;">
          <button id="modal-submit" style="flex: 2; padding: 10px; border-radius: 8px; background: var(--interactive-accent); color: var(--text-on-accent); border: none; cursor: pointer;">حفظ</button>
          <button id="modal-cancel" style="flex: 1; padding: 10px; border-radius: 8px; background: transparent; border: 1px solid var(--background-modifier-border); cursor: pointer;">إلغاء</button>
        </div>
      </div>
    </div>
  `;

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

  const startInput = modalDiv.querySelector('#input-start');
  const endInput = modalDiv.querySelector('#input-end');
  const typeStart = modalDiv.querySelector('#type-start');
  const typeEnd = modalDiv.querySelector('#type-end');
  const resultDiv = modalDiv.querySelector('#combined-result');

  createCustomAutocomplete(startInput, SURAH_LIST);
  createCustomAutocomplete(endInput, SURAH_LIST);

  const updateInputMode = (selectEl, inputEl) => {
    const isSurah = selectEl.value === 'surah';
    inputEl.dataset.type = selectEl.value;
    inputEl.value = '';
    inputEl.className = "q-input";

    if (isSurah) {
      inputEl.type = 'text';
      inputEl.removeAttribute('inputmode');
      inputEl.placeholder = selectEl.id === 'type-start' ? 'اختر سورة البداية...' : 'اختر سورة النهاية (اختياري)...';
    } else {
      inputEl.type = 'text';
      inputEl.inputMode = 'numeric';
      inputEl.placeholder = selectEl.id === 'type-start' ? 'من صفحة...' : 'إلى صفحة...';
    }
    calcCombinedPages();
  };

  typeStart.addEventListener('change', () => updateInputMode(typeStart, startInput));
  typeEnd.addEventListener('change', () => updateInputMode(typeEnd, endInput));

  // --- إصلاح معادلة الحساب الدقيقة مع الأرقام العشرية ---
  const calcCombinedPages = () => {
    const isStartSurah = typeStart.value === 'surah';
    const isEndSurah = typeEnd.value === 'surah';
    const valStart = startInput.value.trim();
    const valEnd = endInput.value.trim();

    if (!valStart) {
      resultDiv.innerText = `المجموع: 0 صفحة`;
      return 0;
    }

    let totalPages = 0;

    if (isStartSurah && (!valEnd || (isEndSurah && valEnd === valStart))) {
      // اختيار سورة واحدة فقط
      const sIdx = getSurahIndexFromInput(valStart);
      if (sIdx !== -1) {
        const startP = getSurahStartPage(sIdx);
        const nextStartP = getSurahNextStartPage(sIdx);
        totalPages = nextStartP - startP;
      }
    } else {
      let startP = -1;
      let endP = -1;

      if (isStartSurah) {
        const sIdx = getSurahIndexFromInput(valStart);
        if (sIdx !== -1) startP = getSurahStartPage(sIdx);
      } else {
        startP = parseFloat(valStart);
      }

      if (isEndSurah) {
        const eIdx = getSurahIndexFromInput(valEnd);
        if (eIdx !== -1) endP = getSurahNextStartPage(eIdx); // نقطة نهاية السورة الأخيرة هي بداية السورة التي تليها
      } else {
        endP = parseFloat(valEnd);
        if (!isNaN(endP)) endP += 1; // إذا كانت صفحة عادية نضيف 1 لشمل الصفحة بالكامل
      }

      if (startP > 0 && endP > 0 && endP >= startP) {
        totalPages = endP - startP;
      }
    }

    if (isNaN(totalPages) || totalPages <= 0) {
      resultDiv.innerText = `المجموع: 0 صفحة`;
      return 0;
    }

    // تقريب الناتج لمنع أخطاء الجافاسكربت مثل 0.30000000000004
    const pagesFormatted = (Math.round(totalPages * 100) / 100).toFixed(1);
    resultDiv.innerText = `المجموع: ${pagesFormatted} صفحة`;
    return parseFloat(pagesFormatted);
  };

  startInput.addEventListener('input', calcCombinedPages);
  endInput.addEventListener('input', calcCombinedPages);

  modalDiv.querySelector('#modal-cancel').addEventListener('click', () => modalDiv.remove());
  modalDiv.querySelector('#modal-read').addEventListener('click', () => modalDiv.remove());

  modalDiv.querySelector('#modal-submit').addEventListener('click', async (e) => {
    const submitBtn = e.target;
    
    if (submitBtn.disabled) return;
    submitBtn.disabled = true;
    submitBtn.innerText = "جاري الحفظ...";

    let added = 0;
    const currentStore = getStore();

    if (currentMode === 'mode1') {
      const inputVal = modalDiv.querySelector('#input-mode1').value;
      if (!inputVal) {
        submitBtn.disabled = false;
        submitBtn.innerText = "حفظ";
        return new Notice('⚠️ الرجاء إدخال رقم الصفحة');
      }

      const newPage = parseInt(inputVal, 10);
      const prevPage = await getLastReachedPageFromJSON();

      if (isNaN(newPage) || newPage <= 0) {
        submitBtn.disabled = false;
        submitBtn.innerText = "حفظ";
        return new Notice('⚠️ الرجاء إدخال رقم صفحة صحيح');
      }

      added = prevPage > 0 ? (newPage - prevPage) : newPage;
      if (added <= 0) {
        submitBtn.disabled = false;
        submitBtn.innerText = "حفظ";
        return new Notice('⚠️ الرجاء إدخال صفحة أكبر من الصفحة الحالية المسجلة');
      }

      await saveLastReachedPageToJSON(newPage);
    } else if (currentMode === 'mode2') {
      added = calcCombinedPages();
      if (added <= 0) {
        submitBtn.disabled = false;
        submitBtn.innerText = "حفظ";
        return new Notice('⚠️ الرجاء التثبت من صحة البيانات المدخلة (يجب أن يكون النطاق صحيحاً وموجباً)');
      }
    }

    modalDiv.remove();

    await app.fileManager.processFrontMatter(currentFile, (fm) => {
      const currentPages = Number(fm["Number of Pages (reading)"]) || 0;
      const addPages = (currentPages + Number(added)).toFixed(1);
      fm["Number of Pages (reading)"] = Number(addPages);
    });

    const cache = app.metadataCache.getFileCache(currentFile);
    const updatedTotalPages = cache?.frontmatter?.["Number of Pages (reading)"] || Number(added);

    if (updatedTotalPages > 10) {
      const content = await app.vault.read(currentFile);
      const lines = content.split('\n');
      let isModified = false;
      for (let i = 0; i < lines.length; i++) {
        if (/- \[[ xX]\]/.test(lines[i]) && lines[i].includes('قراءة') && lines[i].includes('القرآن') && !/- \[[xX]\]/.test(lines[i])) {
          lines[i] = lines[i].replace(/- \[ \]/, '- [x]');
          isModified = true;
          break;
        }
      }
      if (isModified) await app.vault.modify(currentFile, lines.join('\n'));
    }

    currentStore.lastInputs[targetFile.path] = Date.now();
    saveStore(currentStore);
  });
};

// --- 8. التشغيل الرئيسي (Runner) ---
const runQuranTracker = async () => {
  const activeFile = app.workspace.getActiveFile();
  if (!activeFile) {
    removeExistingButton();
    return;
  }

  let targetFile = null;

  if (isDateFile(activeFile)) {
    const diffDays = getDateFileDiffDays(activeFile);
    if (diffDays < 0 || diffDays > 2) {
      removeExistingButton();
      return;
    }
    targetFile = activeFile;
  } else if (isScriptEmbeddedIn(activeFile)) {
    targetFile = getLatestAvailableDateFile();
    if (!targetFile) {
      removeExistingButton();
      return;
    }
  } else {
    removeExistingButton();
    return;
  }

  const content = await app.vault.read(targetFile);

  addFloatingButton(targetFile);

  const store = getStore();
  const lastInputTime = store.lastInputs[targetFile.path];

  if (lastInputTime && (Date.now() - parseInt(lastInputTime, 10) < 3600000)) {
    return;
  }

  const showCount = store.showCounts[targetFile.basename] || 0;
  if (showCount >= 3) return;

  if (!isScriptEmbeddedIn(activeFile)) {
    const quranRegex = /قراءة \[\[Quran\|القرآن الكريم\]\].*?/;
    if (!content.match(quranRegex)) return;
  }

  const cache = app.metadataCache.getFileCache(targetFile);
  if (cache?.frontmatter?.["Number of Pages (reading)"] > 0) return;

  store.showCounts[targetFile.basename] = showCount + 1;
  store.lastInputs[targetFile.path] = Date.now();
  saveStore(store);

  renderActualModal(targetFile);
};

// --- تنصيب وتشغيل الكود ---
if (!window.__quranExecuted) {
  window.__quranExecuted = true;
  runQuranTracker();
  setTimeout(() => {
    window.__quranExecuted = false;
  }, 1000);
}

if (!window.__quranListenerAdded) {
  app.workspace.on('file-open', (file) => {
    if (!file) {
      removeExistingButton();
    } else {
      runQuranTracker();
    }
  });
  window.__quranListenerAdded = true;
}
```