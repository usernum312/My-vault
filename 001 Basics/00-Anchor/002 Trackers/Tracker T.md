---
icon: lucide-table
cssclasses:
  - metadata-no-actions
  - page-black
  - rm-lk-bg
ui: preview
---
![[Auto-run scripts]]
```dataviewjs
// ===== الإعدادات =====
const folders = '"003 Daily/001 Active Diaries" or "003 Daily/002 Archived Diaries"';
const daysPerPage = 7; // عدد الأيام في كل صفحة (أسبوع)

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
        return `العمل على <a class="internal-link" data-href="${todayLogFile}" href="${todayLogFile}">سجل اليوم</a>`; 
    }
    
    // 3. تحويل روابط أوبسيديان [[Link]] إلى روابط قابلة للنقر (لباقي المهام العادية)
    cleanText = cleanText.replace(/\[\[([^\]\|]+)(?:\|([^\]]+))?\]\]/g, (match, link, alias) => {
        let displayText = alias ? alias : link;
        return `<a class="internal-link" data-href="${link}" href="${link}">${displayText}</a>`;
    });
    
    // 4. تحويل الروابط العادية [text](url) إن وجدت
    cleanText = cleanText.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (match, text, url) => {
        return `<a class="external-link" href="${url}" target="_blank">${text}</a>`;
    });

    return cleanText;
}

// الدالة الرئيسية لرسم الجدول (تقبل رقم الصفحة/الأسبوع كمدخل)
function renderTracker(offset) {
    let startIndex = offset * daysPerPage;
    let endIndex = startIndex + daysPerPage;
    
    let currentPages = allPages.slice(startIndex, endIndex).sort(p => p.file.day, 'asc');

    let allTasks = {}; 
    let dailyStats =[];
    let totalTasks = 0;
    let totalCompleted = 0;

    // ===== معالجة المهام =====
    for (let page of currentPages) {
        let dayTasks = page.file.tasks;
        let dayCompleted = 0;
        let dayTotal = dayTasks.length;
        let dateStr = moment(page.file.day.toString()).locale('ar').format('D MMMM'); 

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
    let hasOlder = endIndex < allPages.length;

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
        }
        #${containerId} th, #${containerId} td {
            border: 1px solid #2d2d2d;
            padding: 12px 8px;
            text-align: center;
            vertical-align: middle;
        }
        #${containerId} th { background-color: #1c1c1e50; color: #a3a3a3; font-weight: normal; }
        #${containerId} .task-name-col {
            text-align: right;
            width: 35%;
            color: #e5e5e5;
        }
        #${containerId} .task-name-col a {
            color: var(--links-color);
            text-decoration: none;
            font-weight: bold;
        }
        
        #${containerId} .day-percent {
            display: inline-block;
            margin-top: 5px;
            font-weight: bold;
            padding: 2px 8px;
            border-radius: 12px;
            font-size: 0.85em;
        }
        #${containerId} .percent-high { color: #4ade80; }
        #${containerId} .percent-med { color: #facc15; }
        #${containerId} .percent-low { color: #f87171; }
        
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
           padding: 0px 0px;
           height: 05px;
           max-height: 05px;
           line-height: 1;
        }
        #${containerId} th br {
           display: none;
        }
        #${containerId} .day-percent {
           display: inline;
           margin-top: 0;
        }
        #${containerId} .task-name-col {
           text-align: center !important;
        }
    </style>

    <!-- شريط التقدم العلوي مع أزرار التنقل -->
    <div class="tracker-header">
        <button class="nav-btn btn-newer" title="الأسبوع القادم" ${!hasNewer ? 'disabled' : ''}>&#10095;</button>
        <span class="percent-text">${overallPercent}%</span>
        <div class="progress-bar-bg">
            <div class="progress-bar-fill" style="width: ${overallPercent}%;"></div>
        </div>
        <span class="count-text">معدل الإنجاز ${totalCompleted}/${totalTasks}</span>
        <button class="nav-btn btn-older" title="الأسبوع الماضي" ${!hasOlder ? 'disabled' : ''}>&#10094;</button>
    </div>

    <!-- الجدول -->
    <table>
        <thead>
            <tr>
                <th class="task-name-col">المهمة</th>`;

    // إضافة عناوين الأيام
    for (let stat of dailyStats) {
        let pClass = stat.percent >= 70 ? 'percent-high' : (stat.percent >= 40 ? 'percent-med' : 'percent-low');
        html += `<th>
                    ${stat.dateLabel}<br>
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