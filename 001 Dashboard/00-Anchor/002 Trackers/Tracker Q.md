---
icon: lucide-form-input
banner: https://marketplace.canva.com/EAHBFGCGpKk/1/0/1131w/canva-green-and-white-modern-islamic-qur%27an-tracker-document-4lD2UK58iBg.jpg
banner_y: 15
cssclasses:
  - invert-banner
  - invert-dark
  - invert-dark-apt
  - Disappear
ui: edit
---
```dataviewjs
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
const COOLDOWN_HOURS = 1; // ساعتان
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
<!--
```dataviewjs
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