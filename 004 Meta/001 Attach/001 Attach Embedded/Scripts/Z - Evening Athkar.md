---
icon: lucide-sun-moon
---
```dataviewjs
// الحصول على تاريخ اليوم
const today = new Date().toDateString();
const storageKey = `athkar-evening-complete-${today}`;

// العدد الإجمالي الثابت للأذكار (ضعه حسب عدد أذكارك الفعلي)
const TOTAL_ATHKAR = 26; // غير هذا الرقم حسب عدد أذكارك الفعلية

// دالة لتنقية الحالة (إزالة التكرارات والفهارس غير الصالحة)
function cleanState(state) {
    if (!state) return { completed: [], currentIndex: 0, totalCount: TOTAL_ATHKAR };
    
    // تنظيف completed: إزالة التكرارات والفهارس خارج النطاق
    const uniqueCompleted = [...new Set(state.completed || [])]
        .filter(index => index >= 0 && index < TOTAL_ATHKAR);
    
    // التأكد من أن currentIndex ضمن النطاق الصحيح
    let currentIndex = state.currentIndex || 0;
    if (currentIndex < 0) currentIndex = 0;
    if (currentIndex >= TOTAL_ATHKAR) currentIndex = 0; // إعادة تعيين إذا كان خارج النطاق
    
    // إذا كان currentIndex موجوداً في completed، نبحث عن أول فهرس غير مكتمل
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
        // تنظيف الحالة قبل الحفظ
        const stateToSave = cleanState(athkarState);
        localStorage.setItem(storageKey, JSON.stringify(stateToSave));
        // تحديث المتغير العالمي بالحالة المنظفة
        athkarState = stateToSave;
    } catch (e) {
        console.log("Error saving athkar state:", e);
    }
}

// دالة لإجبار تحميل جميع الأذكار
function forceLoadAllAthkar() {
    console.log("بدء تحميل جميع الأذكار...");
    
    // التمرير لأسفل ثم لأعلى لإجبار التحميل
    const container = document.querySelector('.markdown-preview-view') || 
                     document.querySelector('.markdown-reading-view') || 
                     document.body;
    
    // حفظ الموضع الحالي
    const currentScroll = window.scrollY;
    
    // التمرير لأسفل
    container.scrollTop = container.scrollHeight;
    
    // الانتظار قليلاً للتحميل
    return new Promise(resolve => {
        setTimeout(() => {
            // التمرير لأعلى
            container.scrollTop = 0;
            
            // العودة للموضع الأصلي
            setTimeout(() => {
                window.scrollTo(0, currentScroll);
                console.log("اكتمل تحميل الأذكار");
                resolve();
            }, 500);
        }, 1000);
    });
}

// دالة محسنة لاستخراج عدد التكرارات المطلوبة
function getRequiredRepetitions(calloutContent) {
    try {
        const text = calloutContent.textContent || calloutContent.innerText || '';
        
        // قائمة بأنماط التكرارات
        const repetitionPatterns = [
            // أنماط مائة مرة
            { patterns: ['مائة مرة', '100 مرة', 'مائة مر', 'مِائَةَ مَرَّةٍ'], value: 100 },
            
            // أنماط عشر مرات
            { patterns: ['عشر مرات', '10 مرات', 'عشرَ مرَّات', 'عشرَ مرَّاٍ'], value: 10 },
            
            // أنماط سبع مرات
            { patterns: ['سبع مرات', '7 مرات', 'سبع مر', 'سَبْعَ مَرّاتٍ'], value: 7 },
            
            // أنماط أربع مرات
            { patterns: ['أربع مرات', '4 مرات', 'أربع مر', 'أربعَ مَرَّاتٍ'], value: 4 },
            
            // أنماط ثلاث مرات
            { patterns: ['ثلاث مرات', '3 مرات', 'ثلاث مر', 'ثلاثَ مرَّاتٍ'], value: 3 },
            
            // أنماط مرة واحدة
            { patterns: ['مرة واحدة', 'مرة واحده', 'مرة واحدة', 'مَرَّةً وَاحِدَةً'], value: 1 },
            
            // البحث عن أي رقم متبوع بكلمة مرة
            { patterns: [/(\d+)\s*مرة/], value: null }
        ];
        
        // البحث في جميع الأنماط
        for (const pattern of repetitionPatterns) {
            for (const pat of pattern.patterns) {
                if (typeof pat === 'string') {
                    if (text.includes(pat)) {
                        return pattern.value;
                    }
                } else if (pat instanceof RegExp) {
                    const match = text.match(pat);
                    if (match && match[1]) {
                        return parseInt(match[1]);
                    }
                }
            }
        }
                
        return 1; // الافتراضي
    } catch (e) {
        console.error("Error in getRequiredRepetitions:", e);
        return 1;
    }
}

// الحصول على الذكر بالرقم المحدد (محسّن)
function getAthkarByIndex(index) {
    // البحث عن جميع callouts من نوع adhkar
    let allCallouts = document.querySelectorAll('.callout[data-callout="adhkar"]');
    
    // إذا لم يتم العثور على أي، حاول البحث عن أي callout
    if (allCallouts.length === 0) {
        allCallouts = document.querySelectorAll('.callout');
    }
    
    if (index >= 0 && index < allCallouts.length) {
        return allCallouts[index];
    }
    
    return null;
}

// إخفاء جميع الأذكار
function hideAllAthkar() {
    const allCallouts = document.querySelectorAll('.callout[data-callout="adhkar"], .callout');
    allCallouts.forEach(callout => {
        callout.style.display = 'none';
    });
}

// عرض الذكر الحالي فقط مع إعادة محاولة إذا لم يتم العثور عليه
async function showCurrentAthkar(retryCount = 0) {
    const MAX_RETRIES = 5;
    
    console.log(`محاولة عرض الذكر ${athkarState.currentIndex + 1} (محاولة ${retryCount + 1})`);
    
    // إذا تجاوزنا العدد الإجمالي، نعرض رسالة الإكمال
    if (athkarState.currentIndex >= TOTAL_ATHKAR) {
        console.log("تم الوصول إلى نهاية الأذكار");
        showCompletionMessage();
        return;
    }
    
    // إذا كان هذا الذكر مكتملاً بالفعل، انتقل للذي يليه
    if (athkarState.completed.includes(athkarState.currentIndex)) {
        console.log(`الذكر ${athkarState.currentIndex + 1} مكتمل بالفعل، الانتقال للتالي`);
        athkarState.currentIndex++;
        saveState();
        setTimeout(() => showCurrentAthkar(0), 100);
        return;
    }
    
    // إخفاء جميع الأذكار أولاً
    hideAllAthkar();
    
    // محاولة الحصول على الذكر الحالي
    let currentCallout = getAthkarByIndex(athkarState.currentIndex);
    
    // إذا لم يتم العثور على الذكر، ننتظر ونحاول مرة أخرى (بحد أقصى)
    if (!currentCallout) {
        if (retryCount < MAX_RETRIES) {
            console.log(`الذكر ${athkarState.currentIndex + 1} غير محمل، انتظار... (محاولة ${retryCount + 1}/${MAX_RETRIES})`);
            
            // تأخير متصاعد
            const delay = 300 * (retryCount + 1);
            await new Promise(resolve => setTimeout(resolve, delay));
            
            // محاولة إجبار التحميل في بعض المحاولات
            if (retryCount === 2) {
                await forceLoadAllAthkar();
            }
            
            // حاول مرة أخرى
            return showCurrentAthkar(retryCount + 1);
        } else {
            console.log(`لم يتم العثور على الذكر ${athkarState.currentIndex + 1} بعد ${MAX_RETRIES} محاولات. تخطيه.`);
            athkarState.currentIndex++;
            saveState();
            setTimeout(() => showCurrentAthkar(0), 100);
            return;
        }
    }
    
    // عرض الذكر الحالي
    currentCallout.style.display = 'block';
    currentCallout.style.opacity = '1';
    
    // إعداد الذكر الحالي
    setupCurrentAthkar(currentCallout);
}

// إعداد الذكر الحالي
function setupCurrentAthkar(callout) {
    const calloutContent = callout.querySelector('.callout-content') || callout;
    
    // حذف أي عداد موجود مسبقاً
    const existingCounter = callout.querySelector('.adhkar-counter');
    if (existingCounter) {
        existingCounter.remove();
    }
    
    // الحصول على التكرارات المطلوبة
    const repetitions = getRequiredRepetitions(calloutContent);
    console.log(`الذكر ${athkarState.currentIndex + 1}: ${repetitions} تكرار`);
    
    // إنشاء حاوية العداد
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
    
    // مؤشر التقدم
    const progressInfo = document.createElement('div');
    progressInfo.style.cssText = `
        font-size: 14px;
        color: var(--text-muted);
        margin-bottom: 5px;
    `;
    progressInfo.textContent = `الذكر ${athkarState.currentIndex + 1} من ${TOTAL_ATHKAR}`;
    
    // عرض التقدم
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
    
    // تأثيرات hover
    incrementBtn.onmouseenter = () => {
        incrementBtn.style.backgroundColor = 'var(--interactive-hover)';
        incrementBtn.style.transform = 'translateY(-2px)';
    };
    
    incrementBtn.onmouseleave = () => {
        incrementBtn.style.backgroundColor = 'transparent';
        incrementBtn.style.transform = 'translateY(0)';
    };
    
    // تهيئة العداد
    let count = 0;
    
    // تحديث التقدم
    function updateProgress() {
        progressSpan.textContent = `${count}/${repetitions}`;
        
        const progressPercentage = count / repetitions;
        if (progressPercentage >= 1) {
            progressSpan.style.color = '#10b981';
        } else if (progressPercentage >= 0.5) {
            progressSpan.style.color = '#f59e0b';
        }
    }
    
    // معالج النقر
    incrementBtn.onclick = () => {
        count++;
        updateProgress();
        
        // تأثير النقر
        incrementBtn.style.transform = 'scale(0.95)';
        setTimeout(() => {
            incrementBtn.style.transform = 'scale(1)';
        }, 100);
        
        if (count >= repetitions) {
            // وضع علامة مكتمل
            incrementBtn.textContent = '✓ مكتمل';
            incrementBtn.style.borderColor = '#10b981';
            incrementBtn.style.color = '#10b981';
            incrementBtn.disabled = true;
            
            // إضافة إلى المكتملين
            if (!athkarState.completed.includes(athkarState.currentIndex)) {
                athkarState.completed.push(athkarState.currentIndex);
            }
            
            // الانتقال إلى الذكر التالي بعد تأخير
            setTimeout(() => {
                athkarState.currentIndex++;
                saveState();
                showCurrentAthkar(0);
            }, 500);
        }
    };
    
    // تجميع المكونات
    counterContainer.appendChild(progressInfo);
    counterContainer.appendChild(progressDiv);
    counterContainer.appendChild(incrementBtn);
    
    // إضافة إلى الذكر
    callout.appendChild(counterContainer);
}

// عرض رسالة الإكمال (بدون border)
function showCompletionMessage() {
    // حذف أي رسالة موجودة
    const existingMessage = document.querySelector('.completion-message');
    if (existingMessage) {
        existingMessage.remove();
    }
    
    const completedCount = athkarState.completed.length;
    
    // إنشاء رسالة الإكمال بدون border
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
            مبروك! لقد أكملت أذكار المساء
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
    
    // زر البدء من جديد
    const restartBtn = document.createElement('button');
    restartBtn.textContent = 'ابدأ من جديد';
    restartBtn.style.cssText = `
        background: var(--interactive-normal);
        color: var(--text-normal);
        border: none;
        padding: 10px 25px;
        border-radius: 8px;
        cursor: pointer;
        font-size: 14px;
        margin-top: 25px;
        transition: all 0.3s;
    `;
    
    restartBtn.onmouseenter = () => {
        restartBtn.style.backgroundColor = 'var(--interactive-hover)';
        restartBtn.style.transform = 'translateY(-2px)';
    };
    
    restartBtn.onmouseleave = () => {
        restartBtn.style.backgroundColor = 'var(--interactive-normal)';
        restartBtn.style.transform = 'translateY(0)';
    };
    
    restartBtn.onclick = () => {
        if (confirm('هل تريد بدء الأذكار من جديد؟ سيتم حذف تقدم اليوم.')) {
            athkarState = { completed: [], currentIndex: 0, totalCount: TOTAL_ATHKAR };
            localStorage.removeItem(storageKey);
            location.reload();
        }
    };
    
    completionDiv.appendChild(restartBtn);
    
    // إدراج الرسالة
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
    console.log("بدء تهيئة الأذكار...");
    
    // إعادة تعيين تقدم الأمس
    resetOldProgress();
    
    // انتظار تحميل الصفحة
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // إجبار تحميل جميع الأذكار
    await forceLoadAllAthkar();
    
    // انتظار إضافي للتحميل
    await new Promise(resolve => setTimeout(resolve, 500));
    
    // التحقق مما إذا تم إكمال جميع الأذكار
    if (athkarState.completed.length >= TOTAL_ATHKAR) {
        showCompletionMessage();
    } else {
        // عرض الذكر الحالي
        await showCurrentAthkar(0);
    }
    
    // إضافة زر إعادة تحميل يدوي (اختياري) - يمكن تركه فارغاً أو إزالته إذا لم ترد زر إضافي
}

// ========== التعديل: عرض زر "تشغيل" بدلاً من التشغيل التلقائي ==========
if (dv) {
    console.log("عرض زر بدء الأذكار...");
    
    // إنشاء زر التشغيل
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
    
    // إضافة تأثيرات التحويم
    runButton.addEventListener('mouseenter', () => {
        runButton.style.transform = 'scale(1.05)';
        runButton.style.boxShadow = '0 4px 15px rgba(0,0,0,0.2)';
    });
    
    runButton.addEventListener('mouseleave', () => {
        runButton.style.transform = 'scale(1)';
        runButton.style.boxShadow = 'none';
    });
    
    // عند النقر، شغّل النظام وأخفِ الزر
    runButton.addEventListener('click', async () => {
        runButton.style.display = 'none'; // إخفاء الزر فوراً
        await initializeAthkar();
    });
}
```