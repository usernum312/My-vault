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
   كود تتبع تلاوة القرآن الكريم - النسخة المرنة (اليوم ± يومين) بمعايير ES6+
   ========================================================================== */

// --- 1. البيانات الثابتة للمصحف الشريف ---
const SURAH_NAMES = [
  "الفاتحة", "البقرة", "آل عمران", "النساء", "المائدة", "الأنعام", "الأعراف", "الأنفال", 
  "التوبة", "يونس", "هود", "يوسف", "الرعد", "إبراهيم", "الحجر", "النحل", "الإسراء", 
  "الكهف", "مريم", "طه", "الأنبياء", "الحج", "المؤمنون", "النور", "الفرقان", "الشعراء", 
  "النمل", "القصص", "العنكبوت", "الروم", "لقمان", "السجدة", "الأحزاب", "سبأ", "فاطر", 
  "يس", "الصافات", "ص", "الزمر", "غافر", "فصلت", "الشورى", "الزخرف", "الدخان", 
  "الجاثية", "الأحقاف", "محمد", "الفتح", "الحجرات", "ق", "الذاريات", "الطور", "النجم", 
  "القمر", "الرحمن", "الواقعة", "الحديد", "المجادلة", "الحشر", "الممتحنة", "الصف", 
  "الجمعة", "المنافقون", "التغابن", "الطلاق", "التحريم", "الملك", "القلم", "الحاقة", 
  "المعارج", "نوح", "الجن", "المزمل", "المدثر", "القيامة", "الإنسان", "المرسلات", 
  "النبأ", "النازعات", "عبس", "التكوير", "الانفطار", "المطففين", "الانشقاق", "البروج", 
  "الطارق", "الأعلى", "الغاشية", "الفجر", "البلد", "الشمس", "الليل", "الضحى", "الشرح", 
  "التين", "العلق", "القدر", "البينة", "الزلزلة", "العاديات", "القارعة", "التكاثر", 
  "العصر", "الهمزة", "الفيل", "قريش", "الماعون", "الكوثر", "الكافرون", "النصر", 
  "المسد", "الإخلاص", "الفلق", "الناس"
];

const SURAH_PAGES = [1.0,2.0,50.0,77.0,106.4,128.0,151.0,177.0,187.0,208.0,221.4,235.6,249.0,255.2,262.0,267.4,282.0,293.6,305.0,312.3,322.0,332.0,342.0,350.0,359.7,367.0,377.0,385.5,396.5,404.6,411.0,415.0,418.0,428.0,434.5,440.2,446.0,453.0,458.2,467.2,477.0,483.0,489.3,496.0,499.0,502.4,507.0,511.0,515.4,518.0,520.8,523.5,526.0,528.6,531.3,534.4,537.7,542.0,545.4,549.0,551.4,553.0,554.4,556.0,558.0,560.0,562.0,564.4,566.6,568.6,570.3,572.0,574.0,575.5,577.4,578.6,580.4,582.0,583.5,585.0,586.0,587.7,587.7,589.1,590.0,591.5,591.5,592.2,592.2,593.0,595.6,595.6,596.2,596.7,597.0,597.4,598.0,598.4,599.2,599.6,600.1,600.6,601.0,601.3,601.7,602.0,602.4,602.8,603.0,603.4,603.7,604.0,604.3,604.6,605.0];

const SURAH_LIST = SURAH_NAMES.map((name, i) => `${i + 1}- ${name}`);


// --- 2. دوال مساعدة لإدارة الـ UI والزر العائم ---
const removeExistingButton = () => {
  const activeLeaf = app.workspace.getActiveViewOfType(Object)?.leaf || app.workspace.getMostRecentLeaf();
  if (activeLeaf?.view?.containerEl) {
    const existingBtn = activeLeaf.view.containerEl.querySelector('.quran-float-btn');
    if (existingBtn) existingBtn.remove();
  }
};

const isFileWithinAllowedRange = (fileBasename) => {
  if (!fileBasename) return false;
  const fileParts = fileBasename.split('-');
  if (fileParts.length !== 3) return false;

  const fileDate = new Date(fileParts[0], fileParts[1] - 1, fileParts[2]);
  const today = new Date();
  const midnightToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  
  const diffTime = midnightToday - fileDate;
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

  return diffDays >= 0 && diffDays <= 2;
};


// --- 3. دوال حساب صفحات السور والبحث المتقدم ---
const getSurahIndexFromInput = (inputEl) => {
  const val = inputEl.value.trim().toLowerCase();
  if (!val) return -1;

  // 1. محاولة استخراج الرقم (مثل "1" أو "1- الفاتحة")
  const match = val.match(/^(\d+)\s*[-–—]?\s*/);
  if (match) {
    const idx = parseInt(match[1], 10) - 1;
    if (idx >= 0 && idx < SURAH_NAMES.length) return idx;
  }

  // 2. البحث النصي الذكي والجزئي بأسماء السور
  return SURAH_NAMES.findIndex(name => name.toLowerCase().includes(val));
};

const getSurahStartPage = (index) => (index >= 0 && index < SURAH_PAGES.length) ? SURAH_PAGES[index] : -1;

const getSurahEndPage = (index) => {
  if (index >= 0 && index < SURAH_PAGES.length - 1) {
    return SURAH_PAGES[index + 1] - 1;
  }
  return -1;
};


// --- 4. دالة الـ Autocomplete المحدثة (للأعلى + مرونة البحث) ---
const createCustomAutocomplete = (inputElement, allOptions) => {
  const container = inputElement.parentElement;
  container.style.position = 'relative';

  const dropdown = document.createElement('div');
  dropdown.className = 'surah-autocomplete-dropdown';
  
  // تغيير الاتجاه إلى الأعلى bottom: 100%
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

  // أنماط مظهر القائمة المنسدلة
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
    const lowerFilter = filterText.toLowerCase();

    // فلترة مرنة: تبحث بالاسم الصريح أو بالاسم الذي يتضمن الرقم المنسق
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

  // ربط الأحداث للحقل
  inputElement.addEventListener('input', (e) => updateDropdown(e.target.value));
  inputElement.addEventListener('focus', (e) => updateDropdown(e.target.value));
  inputElement.addEventListener('blur', () => {
    setTimeout(() => { dropdown.style.display = 'none'; }, 150);
  });

  // التنقل عبر لوحة المفاتيح
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


// --- 5. الزر الدائري العائم ---
const addFloatingButton = (LAST_INPUT_KEY) => {
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
    opacity: '0.3',
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
      @media (orientation: portrait) { .is-mobile .quran-float-btn { bottom: 70px !important; } }
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
};


// --- 6. بناء نافذة الإدخال الرئيسية (Modal) ---
const renderActualModal = async (LAST_INPUT_KEY) => {
  const currentFile = app.workspace.getActiveFile();
  let totalPagesSoFar = 0;

  const allDailyFiles = app.vault.getMarkdownFiles()
    .filter(f => f.path.includes('003 Daily/001 Active Diaries'))
    .filter(f => f.path !== currentFile.path);

  for (const file of allDailyFiles) {
    const cache = app.metadataCache.getFileCache(file);
    totalPagesSoFar += cache?.frontmatter?.["Number of Pages (reading)"] || 0;
  }

  const modalHtml = `
    <style>
      .q-tab-btn { flex: 1; padding: 8px; background: transparent; border: 1px solid var(--background-modifier-border); color: var(--text-muted); cursor: pointer; border-radius: 8px; font-size: 12px; }
      .q-tab-btn.active { background: var(--interactive-accent); color: var(--text-on-accent); }
      .q-tab-content { display: none; padding-top: 5px; }
      .q-tab-content.active { display: block; }
      .q-input { width: 100%; padding: 10px; border-radius: 8px; border: 1px solid var(--background-modifier-border); background: var(--background-secondary); color: var(--text-normal); text-align: right; direction: rtl; }
      .q-input:focus { border-color: var(--interactive-accent); outline: none; box-shadow: 0 0 0 2px var(--interactive-accent-hover); }
      .q-range-input { display: flex; gap: 10px; align-items: center; }
      .q-range-input input { flex: 1; }
      .q-range-label { font-size: 14px; color: var(--text-muted); white-space: nowrap; }
      .autocomplete-wrapper { position: relative; margin-top: 15px; }
    </style>
    <div class="quran-modal modal-container" style="direction: rtl; position: fixed; top: 0; left: 0; width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; z-index: 1000; background: rgba(0,0,0,0.4);">
      <div class="modal" style="background: var(--background-primary); border-radius: 12px; padding: 20px; width: 380px; border: 1px solid var(--background-modifier-border); max-height: 90vh; overflow-y: auto;">
        <div id="modal-read" style="text-align: center !important; margin-bottom: 15px !important;">
          <a href="obsidian://open?vault=My-vault&file=001%20Basics%2FQuran" style="text-align:center; background-color:var(--interactive-accent); color:var(--text-on-accent); border:none; border-radius:20px; text-decoration: none; padding: 5px 15px;">لا تهجر القرآن</a>
        </div>
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
    </div>
  `;

  const modalDiv = document.createElement('div');
  modalDiv.innerHTML = modalHtml;
  modalDiv.classList.add('quran-modal');
  document.body.appendChild(modalDiv);

  // تبديل الألسنة (Tabs)
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
  const surahResult = modalDiv.querySelector('#surah-result');

  createCustomAutocomplete(startInput, SURAH_LIST);
  createCustomAutocomplete(endInput, SURAH_LIST);

  // دالة حساب الصفحات للسور
  const calcSurah = () => {
    const sIdx = getSurahIndexFromInput(startInput);
    const eIdx = getSurahIndexFromInput(endInput);

    if (sIdx === -1) {
      surahResult.innerText = `المجموع: 0 صفحة`;
      return;
    }

    if (eIdx === -1 || eIdx < sIdx) {
      const startPage = getSurahStartPage(sIdx);
      const endPage = getSurahEndPage(sIdx);
      if (startPage !== -1 && endPage !== -1) {
        const pages = (endPage - startPage + 1).toFixed(1);
        surahResult.innerText = `المجموع: ${pages} صفحة (سورة ${SURAH_NAMES[sIdx]} فقط)`;
      } else {
        surahResult.innerText = `المجموع: 0 صفحة`;
      }
      return;
    }

    const startPage = getSurahStartPage(sIdx);
    const endPage = getSurahEndPage(eIdx);
    if (startPage !== -1 && endPage !== -1) {
      const pages = (endPage - startPage + 1).toFixed(1);
      surahResult.innerText = `المجموع: ${pages} صفحة (من ${SURAH_NAMES[sIdx]} إلى ${SURAH_NAMES[eIdx]})`;
    } else {
      surahResult.innerText = `المجموع: 0 صفحة`;
    }
  };

  startInput.addEventListener('input', calcSurah);
  endInput.addEventListener('input', calcSurah);

  // حساب أرقام الصفحات اليدوي (التبويب الثاني)
  const startInput2 = modalDiv.querySelector('#input-mode2-start');
  const endInput2 = modalDiv.querySelector('#input-mode2-end');
  const mode2Result = modalDiv.querySelector('#mode2-result');

  const calcPages = () => {
    const start = parseInt(startInput2.value, 10);
    const end = parseInt(endInput2.value, 10);
    if (!isNaN(start) && !isNaN(end) && end >= start) {
      mode2Result.innerText = `المجموع: ${(end - start + 1).toFixed(1)} صفحة`;
    } else {
      mode2Result.innerText = `المجموع: 0 صفحة`;
    }
  };

  startInput2.addEventListener('input', calcPages);
  endInput2.addEventListener('input', calcPages);

  // أزرار الخروج والإغلاق
  modalDiv.querySelector('#modal-cancel').addEventListener('click', () => modalDiv.remove());
  modalDiv.querySelector('#modal-read').addEventListener('click', () => modalDiv.remove());

  // حفظ البيانات
  modalDiv.querySelector('#modal-submit').addEventListener('click', async () => {
    let added = 0;
    let surahInfo = '';

    if (currentMode === 'mode1') {
      const inputVal = modalDiv.querySelector('#input-mode1').value;
      if (!inputVal) return new Notice('⚠️ الرجاء إدخال رقم الصفحة');
      
      added = parseInt(inputVal, 10) - totalPagesSoFar;
      if (isNaN(added) || added < 0) return new Notice('⚠️ الرجاء إدخال صفحة أكبر من الصفحة الحالية');

    } else if (currentMode === 'mode2') {
      const start = parseInt(startInput2.value, 10);
      const end = parseInt(endInput2.value, 10);
      if (!isNaN(start) && !isNaN(end) && end >= start && start > 0) {
        added = (end - start + 1).toFixed(1);
      } else {
        return new Notice('⚠️ تأكد من إدخال أرقام صحيحة (البداية <= النهاية)');
      }

    } else if (currentMode === 'mode3') {
      const sIdx = getSurahIndexFromInput(startInput);
      const eIdx = getSurahIndexFromInput(endInput);

      if (sIdx === -1) return new Notice('⚠️ الرجاء اختيار سورة البداية');

      if (eIdx === -1 || eIdx < sIdx) {
        const startPage = getSurahStartPage(sIdx);
        const endPage = getSurahEndPage(sIdx);
        if (startPage !== -1 && endPage !== -1) {
          added = endPage - startPage + 1;
          surahInfo = `سورة ${SURAH_NAMES[sIdx]}`;
        } else {
          return new Notice('⚠️ خطأ في حساب صفحات السورة');
        }
      } else {
        const startPage = getSurahStartPage(sIdx);
        const endPage = getSurahEndPage(eIdx);
        if (startPage !== -1 && endPage !== -1 && endPage >= startPage) {
          added = endPage - startPage + 1;
          surahInfo = `من ${SURAH_NAMES[sIdx]} إلى ${SURAH_NAMES[eIdx]}`;
        } else {
          return new Notice('⚠️ خطأ في حساب الصفحات');
        }
      }

      if (added <= 0) return new Notice('⚠️ عدد الصفحات يجب أن يكون أكبر من صفر');
    }

    modalDiv.remove();

    // تحديث الـ Frontmatter وحفظ التغييرات
    await app.fileManager.processFrontMatter(currentFile, (fm) => {
      fm["Number of Pages (reading)"] = added;
    });

    if ((totalPagesSoFar + added) > 10) {
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

    localStorage.setItem(LAST_INPUT_KEY, Date.now().toString());
    new Notice(`✓ تم تسجيل ${added} صفحة ${surahInfo ? `(${surahInfo})` : ''}`);
  });
};


// --- 7. التشغيل الرئيسي (Runner) ---
const runQuranTracker = async () => {
  const currentFile = app.workspace.getActiveFile();
  if (!currentFile || !isFileWithinAllowedRange(currentFile.basename)) {
    removeExistingButton();
    return;
  }

  const content = await app.vault.read(currentFile);
  const LAST_INPUT_KEY = `[[quran]]-pages-last-input-${currentFile.path}`;

  addFloatingButton(LAST_INPUT_KEY);

  const lastInputTime = localStorage.getItem(LAST_INPUT_KEY);
  if (lastInputTime && (Date.now() - parseInt(lastInputTime, 10) < 3600000)) {
    return;
  }

  const SHOW_COUNT_KEY = `quran-show-count-${currentFile.basename}`;
  const showCount = parseInt(localStorage.getItem(SHOW_COUNT_KEY) || "0", 10);
  if (showCount >= 3) return;

  const quranRegex = /قراءة \[\[Quran\|القرآن الكريم\]\].*?/;
  if (!content.match(quranRegex)) return;

  const cache = app.metadataCache.getFileCache(currentFile);
  if (cache?.frontmatter?.["Number of Pages (reading)"] > 0) return;

  localStorage.setItem(SHOW_COUNT_KEY, (showCount + 1).toString());
  localStorage.setItem(LAST_INPUT_KEY, Date.now().toString());
  renderActualModal(LAST_INPUT_KEY);
};


// تنصيب وتشغيل الكود
if (!window.__quranExecuted) {
  window.__quranExecuted = true;
  runQuranTracker();
  setTimeout(() => { window.__quranExecuted = false; }, 1000);
}

if (!window.__quranListenerAdded) {
  app.workspace.on('file-open', (file) => {
    if (!file || !isFileWithinAllowedRange(file.basename)) {
      removeExistingButton();
    }
  });
  window.__quranListenerAdded = true;
}
```