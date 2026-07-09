---
icon: lucide-sun-medium
---
```dataviewjs
// ==================================================================
// أذكار الصباح - نسخة مُصلَحة
// ------------------------------------------------------------------
// السبب الجذري لمعظم الأعطال السابقة: الاعتماد على افتراض أن
// document.querySelectorAll يُرجع كل الأذكار دفعة واحدة وبترتيب ثابت.
// هذا صحيح فقط في "وضع القراءة" (Reading View). أما في "وضع التحرير"
// (Live Preview / Edit Mode)، فإن Obsidian يستخدم محرك CodeMirror 6
// الذي "يُلغي تحميل" العناصر البعيدة عن نطاق الرؤية (virtualization) -
// فلا تكون كل الأذكار موجودة في الـ DOM في نفس الوقت، ويتغيّر ترتيبها
// وتوفرها مع التمرير.
//
// الإصلاحات الرئيسية:
// 1) عدم "تخطي" أي ذكر تلقائياً لمجرد عدم العثور عليه في الـ DOM.
//    بدلاً من ذلك، ننتظر ظهوره فعلياً عبر MutationObserver.
// 2) اكتشاف وضع العرض (قراءة/تحرير) وإظهار رسالة واضحة في وضع التحرير
//    بدل محاولة تشغيل منطق إخفاء/إظهار مضمون الفشل بسبب الـ virtualization.
// 3) إزالة أزرار "تخطي" و"إعادة تعيين" بناءً على الطلب.
// ==================================================================

// الحصول على تاريخ اليوم
const today = new Date().toDateString();
const storageKey = `athkar-morning-complete-${today}`;

// العدد الإجمالي الثابت للأذكار (ضعه حسب عدد أذكارك الفعلي)
const TOTAL_ATHKAR = 28; // غير هذا الرقم حسب عدد أذكارك الفعلية

// دالة لتنقية الحالة (إزالة التكرارات والفهارس غير الصالحة)
function cleanState(state) {
    if (!state) return { completed: [], currentIndex: 0, totalCount: TOTAL_ATHKAR };

    const uniqueCompleted = [...new Set(state.completed || [])]
        .filter(index => index >= 0 && index < TOTAL_ATHKAR);

    let currentIndex = state.currentIndex || 0;
    if (currentIndex < 0) currentIndex = 0;
    if (currentIndex >= TOTAL_ATHKAR) currentIndex = 0;

    while (currentIndex < TOTAL_ATHKAR && uniqueCompleted.includes(currentIndex)) {
        currentIndex++;
    }

    return {
        completed: uniqueCompleted,
        currentIndex: currentIndex,
        totalCount: TOTAL_ATHKAR
    };
}

// تحميل تقدم اليوم من localStorage مع التنقية
let athkarState = cleanState({
    completed: [],
    currentIndex: 0,
    totalCount: TOTAL_ATHKAR
});

try {
    const stored = localStorage.getItem(storageKey);
    if (stored) {
        const parsed = JSON.parse(stored);
        athkarState = cleanState(parsed);
    }
} catch (e) {
    console.log("Error loading athkar state:", e);
    athkarState = cleanState({ completed: [], currentIndex: 0, totalCount: TOTAL_ATHKAR });
}

// الحفظ في localStorage بعد تنقية الحالة
function saveState() {
    try {
        const stateToSave = cleanState(athkarState);
        localStorage.setItem(storageKey, JSON.stringify(stateToSave));
        athkarState = stateToSave;
    } catch (e) {
        console.log("Error saving athkar state:", e);
    }
}

// ------------------------------------------------------------------
// اكتشاف وضع العرض الحالي (قراءة أم تحرير)
// ------------------------------------------------------------------
function getViewMode() {
    if (!dv || !dv.container) return "unknown";
    if (dv.container.closest(".markdown-reading-view") || dv.container.closest(".markdown-preview-view")) {
        return "reading";
    }
    if (dv.container.closest(".markdown-source-view")) {
        return "editing"; // يشمل Live Preview ووضع المصدر الخام
    }
    return "unknown";
}

// دالة محسنة لاستخراج عدد التكرارات المطلوبة
function getRequiredRepetitions(calloutContent) {
    try {
        let text = calloutContent.textContent || calloutContent.innerText || '';

        // 1. تنظيف النص من الحركات والتنوين تماماً لضمان المطابقة الصحيحة
        text = text.replace(/[\u064B-\u065F]/g, ""); // يزيل الفتحة، الضمة، الكسرة، السكون، الشدة، والتنوين

        // 2. مصفوفة الأنماط (بدون تشكيل تماماً لسهولة المطابقة)
        const repetitionPatterns = [
            { patterns: ['مائة مرة', '100 مرة', 'مائة مر', 'مئة مرة'], value: 100 },
            { patterns: ['عشر مرات', '10 مرات', 'عشر مر'], value: 10 },
            { patterns: ['سبع مرات', '7 مرات', 'سبع مر'], value: 7 },
            { patterns: ['أربع مرات', '4 مرات', 'أربع مر'], value: 4 },
            { patterns: ['ثلاث مرات', '3 مرات', 'ثلاث مر'], value: 3 },
            { patterns: ['مرة واحدة', 'مرة واحده'], value: 1 },
            { patterns: [/(\d+)\s*مرة/], value: null }
        ];

        // 3. البحث في الأنماط
        for (const pattern of repetitionPatterns) {
            for (const pat of pattern.patterns) {
                if (typeof pat === 'string') {
                    if (text.includes(pat)) return pattern.value;
                } else if (pat instanceof RegExp) {
                    const match = text.match(pat);
                    if (match && match[1]) return parseInt(match[1]);
                }
            }
        }

        return 1; // الافتراضي إذا لم يجد شيئاً
    } catch (e) {
        console.error("Error in getRequiredRepetitions:", e);
        return 1;
    }
}


// الحصول على كل الأذكار الموجودة حالياً في الـ DOM (قد لا تكون كاملة في وضع التحرير)
function getAllAthkarCallouts() {
    let allCallouts = document.querySelectorAll('.callout[data-callout="adhkar"]');
    if (allCallouts.length === 0) {
        allCallouts = document.querySelectorAll('.callout');
    }
    return allCallouts;
}

function getAthkarByIndex(index) {
    const allCallouts = getAllAthkarCallouts();
    if (index >= 0 && index < allCallouts.length) {
        return allCallouts[index];
    }
    return null;
}

// إخفاء كل الأذكار الموجودة حالياً في الـ DOM (فقط تلك من نوع adhkar إن وُجدت)
function hideAllAthkar() {
    const allCallouts = getAllAthkarCallouts();
    allCallouts.forEach(callout => {
        callout.style.display = 'none';
    });
}

// ------------------------------------------------------------------
// انتظار ظهور الذكر المطلوب في الـ DOM فعلياً بدل تخمين/تخطي وجوده.
// نستخدم MutationObserver بدل التمرير العشوائي و setTimeout الثابت.
// ------------------------------------------------------------------
function waitForAthkar(index, { timeoutMs = 20000 } = {}) {
    return new Promise((resolve) => {
        const existing = getAthkarByIndex(index);
        if (existing) {
            resolve(existing);
            return;
        }

        const target = document.querySelector('.markdown-preview-view')
            || document.querySelector('.markdown-reading-view')
            || document.body;

        let settled = false;

        const observer = new MutationObserver(() => {
            const found = getAthkarByIndex(index);
            if (found && !settled) {
                settled = true;
                observer.disconnect();
                clearTimeout(timer);
                resolve(found);
            }
        });

        observer.observe(target, { childList: true, subtree: true });

        const timer = setTimeout(() => {
            if (!settled) {
                settled = true;
                observer.disconnect();
                resolve(null); // لم يظهر خلال المهلة - لن نتخطاه، سنعرض رسالة بدل ذلك
            }
        }, timeoutMs);
    });
}

// إعداد الذكر الحالي
function setupCurrentAthkar(callout) {
    const calloutContent = callout.querySelector('.callout-content') || callout;

    const existingCounter = callout.querySelector('.adhkar-counter');
    if (existingCounter) {
        existingCounter.remove();
    }

    const repetitions = getRequiredRepetitions(calloutContent);

    const counterContainer = document.createElement('div');
    counterContainer.className = 'adhkar-counter';
    counterContainer.style.cssText = `
        margin-top: 0px;
        padding: 20px;
        border-radius: 10px;
        text-align: center;
        background: var(--background-secondary);
        border: 2px solid var(--interactive-accent);
    `;

    const progressInfo = document.createElement('div');
    progressInfo.style.cssText = `
        font-size: 14px;
        color: var(--text-muted);
        margin-bottom: 5px;
    `;
    progressInfo.textContent = `الذكر ${athkarState.currentIndex + 1} من ${TOTAL_ATHKAR}`;

    const progressDiv = document.createElement('div');
    progressDiv.style.cssText = `
        font-size: 16px;
        color: var(--text-muted);
        margin-bottom: 15px;
    `;

    const progressSpan = document.createElement('span');
    progressSpan.className = 'progress-count';
    progressSpan.textContent = `0/${repetitions}`;
    progressSpan.style.cssText = `
        font-weight: bold;
        font-size: 20px;
        color: var(--text-normal);
    `;

    progressDiv.innerHTML = `التكرارات: `;
    progressDiv.appendChild(progressSpan);

    // زر التسبيح
    const incrementBtn = document.createElement('button');
    incrementBtn.textContent = 'تسبيح';
    incrementBtn.style.cssText = `
        background: transparent;
        color: var(--text-normal);
        border: 2px solid var(--interactive-accent);
        padding: 12px 40px;
        border-radius: 8px;
        cursor: pointer;
        font-size: 18px;
        font-weight: bold;
        width: 100%;
        max-width: 300px;
        transition: all 0.3s;
        margin: 10px 0;
    `;

    incrementBtn.onmouseenter = () => {
        incrementBtn.style.backgroundColor = 'var(--interactive-hover)';
        incrementBtn.style.transform = 'translateY(-2px)';
    };

    incrementBtn.onmouseleave = () => {
        incrementBtn.style.backgroundColor = 'transparent';
        incrementBtn.style.transform = 'translateY(0)';
    };

    let count = 0;

    function updateProgress() {
        progressSpan.textContent = `${count}/${repetitions}`;

        const progressPercentage = count / repetitions;
        if (progressPercentage >= 1) {
            progressSpan.style.color = '#10b981';
        } else if (progressPercentage >= 0.5) {
            progressSpan.style.color = '#f59e0b';
        }
    }

    incrementBtn.onclick = () => {
        count++;
        updateProgress();

        incrementBtn.style.transform = 'scale(0.95)';
        setTimeout(() => {
            incrementBtn.style.transform = 'scale(1)';
        }, 100);

        if (count >= repetitions) {
            incrementBtn.textContent = '✓ مكتمل';
            incrementBtn.style.borderColor = '#10b981';
            incrementBtn.style.color = '#10b981';
            incrementBtn.disabled = true;

            if (!athkarState.completed.includes(athkarState.currentIndex)) {
                athkarState.completed.push(athkarState.currentIndex);
            }

            setTimeout(() => {
                athkarState.currentIndex++;
                saveState();
                showCurrentAthkar();
            }, 500);
        }
    };

    counterContainer.appendChild(progressInfo);
    counterContainer.appendChild(progressDiv);
    counterContainer.appendChild(incrementBtn);

    // ملاحظة: تم إزالة زر "تخطي هذا الذكر" بناءً على الطلب.

    callout.appendChild(counterContainer);
}

// عرض الذكر الحالي فقط - لا يوجد تخطي تلقائي بعد الآن، فقط انتظار حقيقي للعنصر
async function showCurrentAthkar() {

    if (athkarState.currentIndex >= TOTAL_ATHKAR) {
        showCompletionMessage();
        return;
    }

    // إذا كان هذا الذكر مكتملاً بالفعل (حالة نادرة بعد التنقية)، انتقل للتالي بدون حذف تقدمه
    if (athkarState.completed.includes(athkarState.currentIndex)) {
        athkarState.currentIndex++;
        saveState();
        await showCurrentAthkar();
        return;
    }

    hideAllAthkar();

    let currentCallout = getAthkarByIndex(athkarState.currentIndex);

    if (!currentCallout) {
        // لا نتخطى الذكر أبداً لمجرد عدم وجوده في الذاكرة حالياً.
        // ننتظر ظهوره الفعلي، ونعرض رسالة انتظار واضحة بدل شاشة فارغة.
        const container = dv.container || document.body;

        currentCallout = await waitForAthkar(athkarState.currentIndex, { timeoutMs: 20000 });

        if (!currentCallout) {
            // انتهت المهلة ولم يظهر الذكر - نعرض رسالة توضيحية بدل الانهيار الصامت
            const timeoutDiv = document.createElement('div');
            timeoutDiv.className = 'adhkar-waiting-message';
            timeoutDiv.style.cssText = `
                text-align: center;
                padding: 30px 20px;
                color: var(--text-muted);
                font-size: 14px;
            `;
            timeoutDiv.textContent = 'تعذّر العثور على هذا الذكر في الصفحة. حاول التمرير قليلاً في الملاحظة ثم أعد النقر على "قراءة الأذكار".';
            container.appendChild(timeoutDiv);
            return;
        }

        hideAllAthkar();
    }

    currentCallout.style.display = 'block';
    currentCallout.style.opacity = '1';

    setupCurrentAthkar(currentCallout);
}

// عرض رسالة الإكمال (بدون زر إعادة تعيين، بناءً على الطلب)
function showCompletionMessage() {
    const existingMessage = document.querySelector('.completion-message');
    if (existingMessage) {
        existingMessage.remove();
    }

    const completedCount = athkarState.completed.length;

    const completionDiv = document.createElement('div');
    completionDiv.className = 'completion-message';
    completionDiv.style.cssText = `
        text-align: center;
        padding: 40px 20px;
        background: var(--background-secondary);
        border-radius: 15px;
        margin: 40px auto;
        max-width: 600px;
        box-shadow: 0 5px 20px rgba(0,0,0,0.05);
    `;

    completionDiv.innerHTML = `
        <div style="font-size: 70px; margin-bottom: 20px;">🎉</div>
        <h2 style="color: var(--text-normal); margin-bottom: 20px; font-size: 26px;">
            مبروك! لقد أكملت أذكار الصباح
        </h2>
        <div style="background: var(--background-primary); padding: 15px; border-radius: 10px; margin: 20px 0;">
            <p style="color: var(--text-muted); font-size: 17px; margin-bottom: 10px; line-height: 1.5;">
                ﴿وَذَكَرَ اسْمَ رَبِّهِ فَصَلَّىٰ﴾
            </p>
            <div style="display: inline-flex; gap: 30px; margin-top: 15px;">
                <div style="text-align: center;">
                    <div style="font-size: 32px; color: #10b981; font-weight: bold;">
                        ${completedCount}
                    </div>
                    <div style="font-size: 13px; color: var(--text-muted);">
                        مكتملة
                    </div>
                </div>
                <div style="text-align: center;">
                    <div style="font-size: 32px; color: var(--text-normal); font-weight: bold;">
                        ${TOTAL_ATHKAR}
                    </div>
                    <div style="font-size: 13px; color: var(--text-muted);">
                        الإجمالي
                    </div>
                </div>
            </div>
        </div>
        <p style="color: var(--text-faint); font-size: 13px; margin-top: 20px;">
            ${new Date().toLocaleDateString('ar-SA', {
                weekday: 'long',
                year: 'numeric',
                month: 'long',
                day: 'numeric'
            })}
        </p>
    `;

    // ملاحظة: تم إزالة زر "ابدأ من جديد" (Reset) بناءً على الطلب.

    const container = dv.container || document.querySelector('.markdown-reading-view') || document.body;
    container.appendChild(completionDiv);
}

// إعادة تعيين تقدم الأمس
function resetOldProgress() {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayKey = `athkar-complete-${yesterday.toDateString()}`;
    localStorage.removeItem(yesterdayKey);
}

// الدالة الرئيسية
async function initializeAthkar() {
    resetOldProgress();

    const mode = getViewMode();

    if (athkarState.completed.length >= TOTAL_ATHKAR) {
        showCompletionMessage();
    } else {
        await showCurrentAthkar();
    }
}

// ========== عرض زر "تشغيل" بدلاً من التشغيل التلقائي ==========
if (dv) {
    const runButton = dv.el('button', 'قراءة الأذكار', {
        attr: {
            style: `
                padding: 15px 40px;
                background: var(--interactive-accent);
                color: white;
                border: none;
                border-radius: 10px;
                font-size: 18px;
                font-weight: bold;
                cursor: pointer;
                transition: all 0.3s;
            `
        }
    });

    runButton.addEventListener('mouseenter', () => {
        runButton.style.transform = 'scale(1.05)';
        runButton.style.boxShadow = '0 4px 15px rgba(0,0,0,0.2)';
    });

    runButton.addEventListener('mouseleave', () => {
        runButton.style.transform = 'scale(1)';
        runButton.style.boxShadow = 'none';
    });

    runButton.addEventListener('click', async () => {
        runButton.style.display = 'none';
        await initializeAthkar();
    });
}
```