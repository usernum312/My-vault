---
icon: lucide-recycle
cssclasses:
  - center-title
  - Disappear
node_size: 15
---
#### انشغل بما ينفعك واعبد ربك وتوكل عليه
<div style="direction: rtl; text-align: center ! important; padding: 20px; border-radius: 15px; background: linear-gradient(135deg, #667eea20, #764ba220); backdrop-filter: blur(5px); margin: 20px 0;">
  <span style="font-size: 1.5em; color: #667eea; font-weight: 600;">﴿ وَاصْبِرْ وَمَا صَبْرُكَ إِلَّا بِاللَّهِ ﴾</span>
</div>

![[RandomAya]]
![[Tracker Q]]
###### <span style="display: none; height:-10px;">Automation</span>

```dataviewjs
const DiariesFolder = "003 Daily/001 Active Diaries";
const archiveFolder = "003 Daily/002 Archived Diaries";
const threeDaysAgo = moment().subtract(30, 'days');

// الحصول على جميع الملفات في مجلد المهام
const files = app.vault.getFiles()
    .filter(file => file.path.includes(DiariesFolder))
    .filter(file => {
        // استخراج التاريخ من اسم الملف إذا كان بصيغة yyyy-mm-dd
        const dateMatch = file.name.match(/(\d{4}-\d{2}-\d{2})/);
        if (dateMatch) {
            const fileDate = moment(dateMatch[1]);
            return fileDate.isBefore(threeDaysAgo);
        }
        return false;
    });

// نقل الملفات
if (files.length > 0) {
    files.forEach(async (file) => {
        const newPath = file.path.replace(DiariesFolder, archiveFolder);
        await app.vault.rename(file, newPath);
        console.log(`تم نقل: ${file.name} إلى الأرشيف`);
    });
    dv.paragraph(`✓ تم نقل ${files.length} ملف إلى الأرشيف`);
} else {
}
```

```dataviewjs
// نقل الملفات الأقدم من 30 يوم باستخدام ctime
const sourceFolder = "002 Notes/001 Notes";
const archiveFolder = "002 Notes/004 Archived Notes";
const thirtyDaysAgo = moment().subtract(30, 'days');

// الحصول على جميع الملفات في المجلد المصدر
const files = app.vault.getFiles()
    .filter(file => file.path.startsWith(sourceFolder))
    .filter(file => {
        // الحصول على وقت إنشاء الملف
        const fileCtime = moment(file.stat.ctime);
        // التحقق إذا كان الملف أقدم من 30 يوم
        return fileCtime.isBefore(thirtyDaysAgo);
    });

// نقل الملفات
if (files.length > 0) {
    files.forEach(async (file) => {
        // إنشاء المسار الجديد في مجلد الأرشيف
        const newPath = file.path.replace(sourceFolder, archiveFolder);
        
        // التأكد من وجود المجلد الهدف (اختياري)
        const archiveFolderExists = app.vault.getAbstractFileByPath(archiveFolder);
        if (!archiveFolderExists) {
            await app.vault.createFolder(archiveFolder);
        }
        
        // نقل الملف
        await app.vault.rename(file, newPath);
        console.log(`تم نقل: ${file.name} إلى الأرشيف`);
    });
    
    dv.paragraph(`✓ تم نقل ${files.length} ملف إلى الأرشيف`);
} else {
}
```
```dataviewjs
// كود نقل ملفات Log تلقائياً (نسخة صامتة)

async function autoMoveLogFiles() {
    const sourceFolder = '002 Notes/001 Notes';
    const targetFolder = '002 Notes/002 Lessons/Logs';
    
    // التأكد من وجود المجلد الهدف
    const targetFolderExists = app.vault.getAbstractFileByPath(targetFolder);
    if (!targetFolderExists) {
        await app.vault.createFolder(targetFolder);
    }
    
    // البحث عن ملفات Log
    const files = app.vault.getMarkdownFiles()
        .filter(f => f.path.startsWith(sourceFolder))
        .filter(f => f.name.toLowerCase().startsWith('log -'));
    
    if (files.length === 0) return;
    
    let movedCount = 0;
    
    for (const file of files) {
        try {
            const newPath = file.path.replace(sourceFolder, targetFolder);
            
            // التحقق من عدم وجود تعارض
            const existingFile = app.vault.getAbstractFileByPath(newPath);
            if (existingFile) {
                const fileNameWithoutExt = file.name.replace('.md', '');
                const newFileName = `${fileNameWithoutExt} (${Date.now()}).md`;
                const newPathWithSuffix = newPath.replace(file.name, newFileName);
                await app.vault.rename(file, newPathWithSuffix);
            } else {
                await app.vault.rename(file, newPath);
            }
            
            movedCount++;
        } catch (error) {
            console.error(`خطأ في نقل ${file.name}:`, error);
        }
    }
    
    if (movedCount > 0) {
         dv.paragraph(`✓ تم حفظ ${movedCount} ملف Log`);
    }
}

// تشغيل الكود
await autoMoveLogFiles();
```
```dataviewjs
// كود تلقائي لملء ملفات Log الفارغة (يعمل بصمت)

async function autoFillEmptyLogs() {
    const logsFolder = '002 Notes/002 Lessons/Logs';
    const templateFile = 'Log Tem.md';
    
    // البحث عن القالب
    const template = app.vault.getMarkdownFiles().find(f => f.name === templateFile);
    if (!template) return;
    
    const templateContent = await app.vault.read(template);
    
    // البحث عن ملفات Log
    const logFiles = app.vault.getMarkdownFiles()
        .filter(f => f.path.startsWith(logsFolder))
        .filter(f => f.name.match(/^log - \d{4}-\d{2}-\d{2}\.md$/i));
    
    let filledCount = 0;
    
    for (const file of logFiles) {
        const content = await app.vault.read(file);
        const contentWithoutFrontmatter = content.replace(/^---\n[\s\S]*?\n---\n/, '');
        
        // إذا كان الملف فارغاً
        if (!contentWithoutFrontmatter.trim()) {
            const dateMatch = file.name.match(/(\d{4}-\d{2}-\d{2})/);
            const fileDate = dateMatch ? dateMatch[1] : '';
            
            let fileContent = templateContent
                .replace(/{{DATE:YYYY-MM-DD}}/g, fileDate)
                .replace(/{{TITLE}}/g, file.name.replace('.md', '').replace(/^log - /i, ''));
            
            await app.vault.modify(file, fileContent);
            filledCount++;
        }
    }
    
    if (filledCount > 0) {
        dv.paragraph(`✓ تم ملء ${filledCount} ملف Log`);
    }
}

// تشغيل الكود
await autoFillEmptyLogs();
```