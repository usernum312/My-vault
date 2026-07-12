---
cssclasses:
  - rtl-everything
  - metadata-clean
icon: lucide-medal
---
```dataviewjs
const container = dv.el("div", "", { attr: { style: "display: flex; align-items: center; gap: 10px; margin: 0; margin-top: -16.5px; position: relative;" } }); const btn = dv.el("button", "تحفيز", { parent: container }); btn.style.padding = "0 0px"; btn.style.userSelect = "text" ; btn.style.background = "none"; btn.style.color = "#D3D3D3"; const textSpan = dv.el("span", "", { parent: container }); textSpan.innerHTML = `<b style="color:red">إقرأها:</b> ألم تسأم من تضييع وقتك انت لا تفعل اي شيء فقط تظل تستهلك؛ توقف: افتح الملاحظة وتعلم أي شيء `;  textSpan.style.display = "none"; textSpan.style.transition = "opacity 0.3s ease"; textSpan.style.color = "var(--blockquote-color)"; textSpan.style.padding = "5px 10px"; textSpan.style.borderRadius = "4px"; textSpan.style.fontSize = "14px"; btn.addEventListener("click", (event) => { event.stopPropagation(); if (textSpan.style.display === "none") { textSpan.style.display = "inline-block"; } else { textSpan.style.display = "none"; } }); document.addEventListener("click", (event) => { if (!btn.contains(event.target) && !textSpan.contains(event.target)) { textSpan.style.display = "none"; } });
```
```dataviewjs
// 1. تحديد المسار المخصص لملفات اليوميات والعنوان المستهدف
const folderPath = '"003 Daily/003 The Diaries Log\'s"';
const targetHeading = "ما الذي ترغب في التخلي عنه أو اكتسابه هذا الأسبوع؟";

// 2. حساب تاريخ بداية الأسبوع (قبل 7 أيام من اليوم) وتاريخ اليوم
const today = new Date();
const oneWeekAgo = new Date();
oneWeekAgo.setDate(today.getDate() - 7);

// جلب الملفات والفلترة بناءً على التاريخ الموجود في اسم الملف
const pages = dv.pages(folderPath)
    .filter(p => {
        // تحويل اسم الملف (مثال: 2026-07-12) إلى كائن تاريخ
        const fileDate = new Date(p.file.name);
        
        // التأكد من أن الاسم يمثل تاريخاً صحيحاً وأنه ضمن الأسبوع الحالي
        return !isNaN(fileDate) && fileDate >= oneWeekAgo && fileDate <= today;
    });

const allGoals = [];

for (let page of pages) {
    const tFile = app.vault.getAbstractFileByPath(page.file.path);
    
    if (tFile) {
        const fileContent = await app.vault.read(tFile);
        const lines = fileContent.split('\n');
        
        let headingFound = false;
        let targetContent = [];
        
        for (let line of lines) {
            if (line.includes(`#### ${targetHeading}`)) {
                headingFound = true;
                continue;
            }
            
            if (headingFound && line.startsWith('#')) {
                break;
            }
            
            if (headingFound) {
                targetContent.push(line.trim());
            }
        }
        
        const finalContent = targetContent.filter(line => line.length > 0).join('\n');
        
        if (finalContent && finalContent != "عادة، طريقة فكر...") {
            allGoals.push(`${finalContent}`);
        }
    }
}

// التنسيق المدمج للعناوين لحل مشكلة المساحات (Padding)
const h6Style = "margin-top: 0px !important;";

// 3. عرض الأهداف المجمعة للأسبوع الحالي
if (allGoals.length === 1) {
    dv.el("h6", "🎯 هدف الأسبوع الحالي:", { attr: { style: h6Style } });
    dv.list(allGoals);
}
else if (allGoals.length > 1) {
    dv.el("h6", "🎯 أهداف الأسبوع الحالي:", { attr: { style: h6Style } });
    dv.list(allGoals);
}
else {
    dv.paragraph("*لا توجد أهداف مسجلة للأسبوع الحالي بعد..*");
}
```