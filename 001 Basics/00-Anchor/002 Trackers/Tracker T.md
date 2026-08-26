---
icon: lucide-table
cssclasses:
  - metadata-no-actions
  - rm-lk-bg
---
![[Auto-run scripts]]
```dataviewjs
const {MarkdownRenderer} = require("obsidian");
// ===== الإعدادات =====
const folders = '"003 Daily/001 Active Diaries" or "003 Daily/002 Archived Diaries"';

// إنشاء حاوية رئيسية للكود لتسهيل تحديث المحتوى عند التنقل
const containerId = "task-tracker-" + Math.random().toString(36).substr(2, 9);
const wrapper = dv.el("div", "", { attr: { id: containerId } });

// جلب كل الملفات التي تحتوي على تاريخ وترتيبها من الأحدث للأقدم
let allPages = dv.pages(folders)
    .where(p => p.file.day)
    .sort(p => p.file.day, 'desc');

// دالة لمعالجة النصوص (إزالة التعليقات، توحيد المهام المتغيرة، وتحويل الروابط)
function formatTaskText(text) {
    // 1. إزالة التعليقات المخفية (مثل وقت الإنجاز)
    let cleanText = text.replace(/<!--[\s\S]*?-->/g, '').trim();
    
    // 2. حل مشكلة الروابط المتغيرة وجعلها رابطاً لليوم الحالي
    if (/^العمل على\s*\[\[.*?\]\]/.test(cleanText)) {
        // جلب تاريخ اليوم بالصيغة القياسية لأوبسيديان
        let todayDate = moment().format('YYYY-MM-DD'); 
        // بناء اسم الملف بناءً على صيغتك
        let todayLogFile = `log - ${todayDate}`; 
        
        // إرجاع رابط تفاعلي يفتح ملف سجل اليوم الحالي
        return `العمل على <a class="internal-link" data-href="${todayLogFile}" href="${todayLogFile}">تعلم --</a>`; 
    }
    
    // 3. رندرة الماركداون مع تنظيف شامل للفقرات والأسطر الفارغة لمنع تضخم الخلايا
    let tempEl = document.createElement("div");
    MarkdownRenderer.renderMarkdown(cleanText, tempEl, "", dv.component);
    
    // تنظيف المخرجات من وسوم p و br والمسافات الزائدة
    let renderedHtml = tempEl.innerHTML
        .replace(/^<p>|<\/p>$/g, '')
        .replace(/<p>/g, '')
        .replace(/<\/p>/g, '<br>')
        .trim();
        
    return renderedHtml;
}

// الدالة الرئيسية لرسم الجدول (تقبل رقم الصفحة/الأسبوع كمدخل)
function renderTracker(offset) {
    // تحديد بداية ونهاية الأسبوع بناءً على الإزاحة (الأسبوع الحالي = 0)
    let targetWeekStart = moment().subtract(offset, 'weeks').day(0).startOf('day');
    let targetWeekEnd = moment().subtract(offset, 'weeks').day(6).endOf('day');
    
    // تصفية الصفحات لتشمل فقط الأيام التي تقع ضمن هذا الأسبوع
    let currentPages = allPages.filter(p => {
        let d = moment(p.file.day.toString());
        return d.isSameOrAfter(targetWeekStart, 'day') && d.isSameOrBefore(targetWeekEnd, 'day');
    }).sort(p => p.file.day, 'asc');

    let allTasks = {}; 
    let dailyStats = [];
    let totalTasks = 0;
    let totalCompleted = 0;

    // ===== معالجة المهام =====
    for (let page of currentPages) {
        let dayTasks = page.file.tasks;
        let dayCompleted = 0;
        let dayTotal = dayTasks.length;
        let dateStr = moment(page.file.day.toString()).locale('en').format('DD-MM'); 

        for (let t of dayTasks) {
            let processedText = formatTaskText(t.text);
            
            if (!allTasks[processedText]) {
                allTasks[processedText] = {};
            }
            allTasks[processedText][page.file.name] = t.completed;
            if (t.completed) dayCompleted++;
        }

        dailyStats.push({
            fileName: page.file.name,
            dateLabel: dateStr,
            total: dayTotal,
            completed: dayCompleted,
            percent: dayTotal > 0 ? Math.round((dayCompleted/dayTotal)*100) : 0
        });

        totalTasks += dayTotal;
        totalCompleted += dayCompleted;
    }

    let overallPercent = totalTasks > 0 ? Math.round((totalCompleted/totalTasks)*100) : 0;

    let hasNewer = offset > 0;
    // التحقق مما إذا كان هناك صفحات أقدم من بداية الأسبوع المعروض
    let hasOlder = allPages.some(p => moment(p.file.day.toString()).isBefore(targetWeekStart, 'day'));

    // ===== تصميم الواجهة (CSS & HTML) =====
    let html = `
    <style>
        #${containerId} {
            direction: rtl;
            background-color: #16161850;
            color: #e5e5e5;
            padding: 20px;
            border-radius: 12px;
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            box-shadow: 0 4px 6px rgba(0,0,0,0.3);
            overflow-x: auto;
        }
        #${containerId} .tracker-header {
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 15px;
            margin-bottom: 30px;
            font-size: 1.1em;
            font-weight: bold;
        }
        #${containerId} .nav-btn {
            background: none;
            border: none;
            color: #a3a3a3;
            font-size: 1.2em;
            cursor: pointer;
            padding: 5px 10px;
            border-radius: 5px;
            transition: all 0.3s ease;
        }
        #${containerId} .nav-btn:hover:not(:disabled) {
            background-color: #2d2d2d;
            color: #fff;
        }
        #${containerId} .nav-btn:disabled {
            color: #333;
            cursor: not-allowed;
        }
        #${containerId} .progress-bar-bg {
            width: 40%;
            height: 10px;
            background-color: #2d2d2d;
            border-radius: 10px;
            overflow: hidden;
        }
        #${containerId} .progress-bar-fill {
            height: 100%;
            background-color: #facc15;
            border-radius: 10px;
            transition: width 0.5s ease;
        }
        #${containerId} .percent-text { color: #fff; font-size: 1.2em; min-width: 40px; }
        #${containerId} .count-text { color: #a3a3a3; font-size: 0.9em; min-width: 120px; text-align: center; }
        
        #${containerId} table {
            width: 100%;
            border-collapse: collapse;
            font-size: 0.95em;
            table-layout: fixed; /* يمنع الجدول من التمدد العشوائي افقياً */
        }
        #${containerId} th, #${containerId} td {
            border: 1px solid #2d2d2d;
            text-align: center;
            vertical-align: middle;
            padding: 16px 8px;
        }
        #${containerId} th { background-color: #1c1c1e50; color: #a3a3a3; font-weight: normal; }
        #${containerId} th a {
            color: var(--links-color);
            text-decoration: none;
            font-weight: bold;
        }
        #${containerId} th a:hover {
            text-decoration: underline;
        }
        
        /* تحجيم عمود المهام ومنع عناصر الماركداون من إضافة مساحات */
        #${containerId} .task-name-col {
            text-align: center !important;
            width: 35%;
            color: #e5e5e5;
            white-space: normal;
            word-break: break-word;
        }
        #${containerId} .task-name-col * {
            margin: 0 !important;
            padding: 0 !important;
            display: inline; /* إجبار عناصر الماركداون أن تكون على نفس السطر بدون فواصل */
        }
        
        #${containerId} .task-name-col a {
            color: var(--links-color);
            text-decoration: none;
            font-weight: bold;
        }
        #${containerId} tr a {
            color: #e5e5e5;
            font-weight: normal;
        }
        #${containerId} tr {
            text-align: center;
        }
        #${containerId} .day-percent {
            display: inline;
            margin-top: 0;
            font-weight: bold;
            padding: 2px 8px;
            border-radius: 12px;
            font-size: 0.85em;
        }
        #${containerId} .percent-high { background-color: #143c2b30; color: #4ade80; }
        #${containerId} .percent-med { background-color: #3c371430; color: #facc15; }
        #${containerId} .percent-low { background-color: #451a1a30; color: #f87171; }
        
        #${containerId} .status-box {
            width: 28px;
            height: 28px;
            display: inline-flex;
            align-items: center;
            justify-content: center;
            border-radius: 6px;
            font-size: 0.9em;
            margin: 0 auto;
        }
        #${containerId} .status-done { background-color: #143c2b; color: #4ade80; }
        #${containerId} .status-missed { background-color: #451a1a; color: #f87171; }
        #${containerId} .status-empty { background-color: transparent; color: #333; }
        #${containerId} th {
           font-size: 0.85em;
           padding: 4px 2px;
           line-height: 1.2;
        }
        #${containerId} th br {
           display: none;
        }
    </style>

    <!-- شريط التقدم العلوي مع أزرار التنقل -->
    <div class="tracker-header">
        <button class="nav-btn btn-older" title="الأسبوع الماضي" ${!hasOlder ? 'disabled' : ''}>&#10094;</button>
                <span class="percent-text">${overallPercent}%</span>
        <div class="progress-bar-bg">
            <div class="progress-bar-fill" style="width: ${overallPercent}%;"></div>
        </div>
        <span class="count-text">معدل الإنجاز ${totalCompleted}/${totalTasks}</span>
        <button class="nav-btn btn-newer" title="الأسبوع القادم" ${!hasNewer ? 'disabled' : ''}>&#10095;</button>
    </div>

    <!-- الجدول -->
    <table>
        <thead>
            <tr>
                <th class="task-name-col">المهمة</th>`;

    // إضافة عناوين الأيام (تم تعديلها لتصبح روابط قابلة للنقر)
    for (let stat of dailyStats) {
        let pClass = stat.percent >= 70 ? 'percent-high' : (stat.percent >= 40 ? 'percent-med' : 'percent-low');
        html += `<th>
                    <a class="internal-link" data-href="${stat.fileName}" href="${stat.fileName}">${stat.dateLabel}</a><br>
                    <span class="day-percent ${pClass}">${stat.percent}%</span>
                 </th>`;
    }

    html += `   </tr>
            </thead>
            <tbody>`;

    // إضافة المهام
    for (let taskText in allTasks) {
        html += `<tr><td class="task-name-col">${taskText}</td>`;
        
        for (let stat of dailyStats) {
            let status = allTasks[taskText][stat.fileName];
            let boxHtml = '';
            
            if (status === true) {
                boxHtml = `<div class="status-box status-done">✔</div>`;
            } else if (status === false) {
                boxHtml = `<div class="status-box status-missed">✘</div>`;
            } else {
                boxHtml = `<div class="status-box status-empty">-</div>`;
            }
            
            html += `<td>${boxHtml}</td>`;
        }
        html += `</tr>`;
    }

    html += `
            </tbody>
        </table>`;

    // تحديث محتوى الحاوية
    wrapper.innerHTML = html;

    // تفعيل وظائف الأزرار
    let btnNewer = wrapper.querySelector('.btn-newer');
    let btnOlder = wrapper.querySelector('.btn-older');

    if (btnNewer && hasNewer) {
        btnNewer.onclick = () => renderTracker(offset - 1);
    }
    if (btnOlder && hasOlder) {
        btnOlder.onclick = () => renderTracker(offset + 1);
    }
}

// تشغيل الدالة لأول مرة
renderTracker(0);
```