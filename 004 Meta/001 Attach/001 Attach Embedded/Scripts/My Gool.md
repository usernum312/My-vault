---
cssclasses:
  - rtl-everything
  - metadata-clean
icon: lucide-medal
---
```dataviewjs
// 1. تحديد المسار المخصص لملفات اليوميات والعنوان المستهدف
const folderPath = '"003 Daily/003 The Diaries Log\'s"';
const targetHeading = "ما الذي ترغب في التخلي عنه أو اكتسابه هذا الأسبوع؟";

// 2. حساب تاريخ بداية الأسبوع الحالي (قبل 7 أيام من اليوم)
const ONE_WEEK_AGO = Date.now() - (7 * 24 * 60 * 60 * 1000);

// جلب الملفات من المسار المحدد التي تم إنشاؤها أو تعديلها خلال الأسبوع الحالي فقط
const pages = dv.pages(folderPath)
    .filter(p => new Date(p.file.ctime).getTime() >= ONE_WEEK_AGO);

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
        
        // التأكد من أن النص ليس فارغاً وليس النص الافتراضي للقالب
        if (finalContent && finalContent!="عادة، طريقة فكر...") {
            allGoals.push(`${finalContent}`);
        }
    }
}

// 3. عرض الأهداف المجمعة للأسبوع الحالي على شكل قائمة نقطية
if (allGoals.length > 1) {
    dv.header(6, "🎯 أهداف الأسبوع الحالي:");
    dv.list(allGoals);
}
else if (allGoals.length > 0) {
    dv.header(6, "🎯 هدف الأسبوع الحالي:");
    dv.list(allGoals);
}
 else {
    dv.paragraph("*لا توجد أهداف مسجلة للأسبوع الحالي بعد.. أضف هدفاً في يومياتك لتراه هنا!* 📝");
}
```