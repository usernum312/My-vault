---
Categories:
  - "[[Technical Doc's]]"
---

اكواد الautomation المستخدمة سابقا
```js
// كود DataviewJS موحد: مراقبة إنشاء الملفات وتنفيذ العمليات بعد تأخير ثانية
const sourceFolder = '002 Notes/001 Notes/Norm Notes';
const targetLogFolder = '002 Notes/002 Lessons/Logs/Learning logs';
const targetDiaryFolder = '002 Notes/002 Lessons/Logs/Diaries logs';

// دالة مساعدة لنقل الملفات
async function moveFile(file, targetFolder) {
    // التأكد من أن المجلد الهدف موجود
    const targetFolderExists = app.vault.getAbstractFileByPath(targetFolder);
    if (!targetFolderExists) {
        await app.vault.createFolder(targetFolder);
    }

    const newPath = file.path.replace(sourceFolder, targetFolder);
    const existingFile = app.vault.getAbstractFileByPath(newPath);
    
    try {
        if (existingFile) {
            // في حال وجود ملف بنفس الاسم
            const fileNameWithoutExt = file.name.replace('.md', '');
            const newFileName = `${fileNameWithoutExt} (${Date.now()}).md`;
            const newPathWithSuffix = newPath.replace(file.name, newFileName);
            await app.vault.rename(file, newPathWithSuffix);
        } else {
            await app.vault.rename(file, newPath);
        }
        return true;
    } catch (error) {
        console.error(`خطأ في نقل الملف ${file.name}:`, error);
        return false;
    }
}

// دالة مساعدة لملء محتوى ملف فارغ من قالب
async function fillFileFromTemplate(file, templateFileName) {
    const templateFile = app.vault.getMarkdownFiles().find(f => f.name === templateFileName);
    if (!templateFile) return false;

    const content = await app.vault.read(file);
    // تجاهل الـ frontmatter إن وجد
    const contentWithoutFrontmatter = content.replace(/^---\n[\s\S]*?\n---\n/, '');
    
    if (!contentWithoutFrontmatter.trim()) {
        const templateContent = await app.vault.read(templateFile);
        const dateMatch = file.name.match(/(\d{4}-\d{2}-\d{2})/);
        const fileDate = dateMatch ? dateMatch[1] : '';
        
        let fileContent = templateContent
            .replace(/{{DATE:YYYY-MM-DD}}/g, fileDate)
            .replace(/{{TITLE}}/g, file.name.replace('.md', '')
                .replace(/^(log - |Dia - log - )/i, ''));
                
        await app.vault.modify(file, fileContent);
        return true;
    }
    return false;
}

// **الجزء الأساسي: مستمع الحدث مع تأخير ثانية واحدة**
const eventRef = app.vault.on('create', async (file) => {
    // تأخير لمدة ثانية واحدة قبل بدء التنفيذ
    setTimeout(async () => {
        // التحقق من أن الملف ينتمي للمجلد المطلوب
        if (!file.path.startsWith(sourceFolder) || !(file.extension === 'md')) {
            return;
        }

        const fileName = file.name.toLowerCase();
        let moved = false;
        let filled = false;

        // **1. فحص ونقل ملفات الـ Learning Log**
        if (fileName.startsWith('log -')) {
            moved = await moveFile(file, targetLogFolder);
            if (moved) {
                // انتظار إضافي للتأكد من اكتمال عملية النقل
                setTimeout(async () => {
                    const newFile = app.vault.getAbstractFileByPath(file.path.replace(sourceFolder, targetLogFolder));
                    if (newFile) {
                        filled = await fillFileFromTemplate(newFile, 'Learning Log Tem.md');
                        if (filled) new Notice(`✓ تم ملء ${newFile.name}`);
                    }
                }, 100);
                new Notice(`✓ تم نقل ${file.name} إلى Learning logs`);
            }
        } 
        // **2. فحص ونقل ملفات الـ Diary Log**
        else if (fileName.startsWith('dia - log -')) {
            moved = await moveFile(file, targetDiaryFolder);
            if (moved) {
                // انتظار إضافي للتأكد من اكتمال عملية النقل
                setTimeout(async () => {
                    const newFile = app.vault.getAbstractFileByPath(file.path.replace(sourceFolder, targetDiaryFolder));
                    if (newFile) {
                        filled = await fillFileFromTemplate(newFile, 'Daily Log Tem.md');
                        if (filled) new Notice(`✓ تم ملء ${newFile.name}`);
                    }
                }, 100);
                new Notice(`✓ تم نقل ${file.name} إلى Diaries logs`);
            }
        }
    }, 1000); // 👈 هذا هو المؤقت: 1000 مللي ثانية = ثانية واحدة
});

// **تنظيف المستمع عند إعادة تحميل الكود**
if (window._myVaultEventListener) {
    app.vault.off('create', window._myVaultEventListener);
}
window._myVaultEventListener = eventRef;
```