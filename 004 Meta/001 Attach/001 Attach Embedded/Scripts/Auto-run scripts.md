---
icon: lucide-cog
cssclasses:
  - metadata-clean
---
```dataviewjs
// 1. كود : نقل المذكرات القديمة (صامت تماماً)
const DiariesFolder = "003 Daily/001 Active Diaries";
const archiveFolder = "003 Daily/002 Archived Diaries";
const threeDaysAgo = moment().subtract(10, 'days');

const files = app.vault.getFiles()
    .filter(file => file.path.includes(DiariesFolder))
    .filter(file => {
        const dateMatch = file.name.match(/(\d{4}-\d{2}-\d{2})/);
        if (dateMatch) {
            const fileDate = moment(dateMatch[1]);
            return fileDate.isBefore(threeDaysAgo);
        }
        return false;
    });

if (files.length > 0) {
    for (const file of files) {
        const newPath = file.path.replace(DiariesFolder, archiveFolder);
        await app.vault.rename(file, newPath);
        console.log(`✓ تم نقل: ${file.name}`);
    }
    new Notice(`✓ تم نقل ${files.length} مذكرة قديمة`);
}
```
```dataviewjs
// 2. كود : نقل ملفات Snippet (صامت تماماً)
const sourceFolder = "002 Notes/001 Notes";
const archiveFolder = "002 Notes/004 Archived Notes/Snippets/Various snippets";

const snippetFiles = app.vault.getFiles()
    .filter(file => file.path.startsWith(sourceFolder))
    .filter(file => {
        const cache = app.metadataCache.getFileCache(file);
        if (!cache?.frontmatter) return false;
        const Topic = cache.frontmatter["Categories"];
        if (!Topic) return false;
        if (Array.isArray(Topic)) return Topic.includes("[[Snippet|Snippet]]");
        if (typeof Topic === "string") return Topic === "[[Snippet|Snippet]]";
        return false;
    });

if (snippetFiles.length > 0) {
    const archiveFolderExists = app.vault.getAbstractFileByPath(archiveFolder);
    if (!archiveFolderExists) await app.vault.createFolder(archiveFolder);
    
    for (const file of snippetFiles) {
        const newPath = file.path.replace(sourceFolder, archiveFolder);
        await app.vault.rename(file, newPath);
        console.log(`✓ تم نقل Snippet: ${file.name}`);
    }
    if (snippetFiles.length == 1) new Notice(`✓ تم نقل المقتطف`);
    else if (snippetFiles.length > 0) new Notice(`✓ تم نقل ${snippetFiles.length} مقتطف`);
}
```
```dataviewjs
// 2.5 كود : نقل ملفات التوثيق (صامت تماماً)
const sourceFolder = "002 Notes/001 Notes";
const archiveFolder = "004 Meta/002 Archive/002 Olders/Old Topics";

const snippetFiles = app.vault.getFiles()
    .filter(file => file.path.startsWith(sourceFolder))
    .filter(file => {
        const cache = app.metadataCache.getFileCache(file);
        if (!cache?.frontmatter) return false;
        const Topic = cache.frontmatter["Categories"];
        if (!Topic) return false;
        if (Array.isArray(Topic)) return Topic.includes("[[Technical Doc's|Technical Doc's]]");
        if (typeof Topic === "string") return Topic === "[[Technical Doc's|Technical Doc's]]";
        return false;
    });

if (snippetFiles.length > 0) {
    const archiveFolderExists = app.vault.getAbstractFileByPath(archiveFolder);
    if (!archiveFolderExists) await app.vault.createFolder(archiveFolder);
    
    for (const file of snippetFiles) {
        const newPath = file.path.replace(sourceFolder, archiveFolder);
        await app.vault.rename(file, newPath);
        console.log(`✓ تم نقل Tech doc: ${file.name}`);
    }
    if (snippetFiles.length == 1) new Notice(`✓ تم نقل الدوكيمنت التقني`);
    else if (snippetFiles.length > 0) new Notice(`✓ تم نقل ${snippetFiles.length} دوكيمنت تقني`);
}
```
```dataviewjs
// 3. كود : نقل ملفات Log (صامت تماماً)
const sourceFolder = '002 Notes/001 Notes';
const targetFolder = '002 Notes/002 Lessons/Logs';

const targetFolderExists = app.vault.getAbstractFileByPath(targetFolder);
if (!targetFolderExists) await app.vault.createFolder(targetFolder);

const logFiles = app.vault.getMarkdownFiles()
    .filter(f => f.path.startsWith(sourceFolder))
    .filter(f => f.name.toLowerCase().startsWith('log -'));

if (logFiles.length > 0) {
    let movedCount = 0;
    for (const file of logFiles) {
        try {
            const newPath = file.path.replace(sourceFolder, targetFolder);
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
            console.error(`خطأ: ${file.name}`, error);
        }
    }
    if (movedCount == 1) new Notice(`✓ تم نقل ملف Log`);
    else if (movedCount > 0) new Notice(`✓ تم نقل ${movedCount} ملف Log`);
}
```
```dataviewjs
// 4. كود : ملء ملفات Log الفارغة (صامت تماماً)
const logsFolder = '002 Notes/002 Lessons/Logs';
const templateFile = 'Learning Log Tem.md';

const template = app.vault.getMarkdownFiles().find(f => f.name === templateFile);
if (template) {
    const templateContent = await app.vault.read(template);
    const logFiles = app.vault.getMarkdownFiles()
        .filter(f => f.path.startsWith(logsFolder))
        .filter(f => f.name.match(/^log - \d{4}-\d{2}-\d{2}\.md$/i));
    
    let filledCount = 0;
    for (const file of logFiles) {
        const content = await app.vault.read(file);
        const contentWithoutFrontmatter = content.replace(/^---\n[\s\S]*?\n---\n/, '');
        
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
    if (filledCount == 1) new Notice(`✓ تم ملء ملف Log`);
    else if (filledCount > 0) new Notice(`✓ تم ملء ${filledCount} ملف Log`);
}
```
```dataviewjs
// 5. كود: نقل ملفات اليوميات (Dia - log -)
const sourceFolder = '002 Notes/001 Notes';
const targetFolder = "003 Daily/003 The Diaries Log's";

const targetFolderExists = app.vault.getAbstractFileByPath(targetFolder);
if (!targetFolderExists) await app.vault.createFolder(targetFolder);

const diaryFiles = app.vault.getMarkdownFiles()
    .filter(f => f.path.startsWith(sourceFolder))
    .filter(f => f.name.toLowerCase().startsWith('dia - log -'));

if (diaryFiles.length > 0) {
    let movedCount = 0;
    for (const file of diaryFiles) {
        try {
            const newPath = file.path.replace(sourceFolder, targetFolder);
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
            console.error(`خطأ: ${file.name}`, error);
        }
    }
    if (movedCount == 1) new Notice(`✓ تم نقل ملف يوميات`);
    else if (movedCount > 0) new Notice(`✓ تم نقل ${movedCount} ملف يوميات`);
}
```
```dataviewjs
// 6. كود : ملء ملفات Log الفارغة (صامت تماماً) - مع Dia prefix
const logsFolder = "003 Daily/003 The Diaries Log's";
const templateFile = 'Daily Log Tem.md';

const template = app.vault.getMarkdownFiles().find(f => f.name === templateFile);
if (template) {
    const templateContent = await app.vault.read(template);
    const logFiles = app.vault.getMarkdownFiles()
        .filter(f => f.path.startsWith(logsFolder))
        .filter(f => f.name.match(/^Dia - log - \d{4}-\d{2}-\d{2}\.md$/i));
    
    let filledCount = 0;
    for (const file of logFiles) {
        const content = await app.vault.read(file);
        const contentWithoutFrontmatter = content.replace(/^---\n[\s\S]*?\n---\n/, '');
        
        if (!contentWithoutFrontmatter.trim()) {
            const dateMatch = file.name.match(/(\d{4}-\d{2}-\d{2})/);
            const fileDate = dateMatch ? dateMatch[1] : '';
            let fileContent = templateContent
                .replace(/{{DATE:YYYY-MM-DD}}/g, fileDate)
                .replace(/{{TITLE}}/g, file.name.replace('.md', '').replace(/^Dia - log - /i, ''));
            await app.vault.modify(file, fileContent);
            filledCount++;
        }
    }
    if (filledCount == 1) new Notice(`✓ تم ملء ملف يوميات`);
    else if (filledCount > 0) new Notice(`✓ تم ملء ${filledCount} ملف يوميات`);
}
```
```dataviewjs
// 7. نقل المرفقات: كود لنقل الملفات المرفقه الى مجلدات من اجل التنظيم
// Configuration
const folders = {
    audio: {
        extensions: ['mp3', 'm4a', 'wav', 'ogg', 'flac'],
        pattern: /^Rec/i,
        dest: '004 Meta/001 Attach/002 Attachment media/SNDs/Records'
    },
    images: {
        extensions: ['jpg', 'jpeg', 'gif', 'png', 'bmp', 'svg', 'webp'],
        dest: '004 Meta/001 Attach/002 Attachment media/IMGs'
    },
    videos: {
        extensions: ['mp4', 'mkv', 'avi', 'mov', 'webm', 'wmv', 'flv'],
        dest: '004 Meta/001 Attach/002 Attachment media/VIDs'
    },
    pdfs: {
        extensions: ['pdf'],
        dest: '004 Meta/001 Attach/002 Attachment media/PDFs'
    }
};

// Get all files in the vault
const allFiles = app.vault.getFiles();
let movedCount = 0;
let errors = [];

// Helper function to move file
async function moveFile(file, destFolder) {
    try {
        const newPath = `${destFolder}/${file.name}`;
        
        // Check if file already exists at destination
        const existingFile = app.vault.getAbstractFileByPath(newPath);
        if (existingFile) {
            console.warn(`File already exists: ${newPath}`);
            return false;
        }
        
        // Move the file
        await app.fileManager.renameFile(file, newPath);
        return true;
    } catch (err) {
        console.error(`Error moving ${file.path}: ${err.message}`);
        errors.push(`${file.name}: ${err.message}`);
        return false;
    }
}

// Process each file
for (const file of allFiles) {
    const extension = file.extension.toLowerCase();
    const fileName = file.name;
    
    // Skip files already in target folders to avoid loops
    const isInTargetFolder = Object.values(folders).some(folder => 
        file.path.startsWith(folder.dest)
    );
    if (isInTargetFolder) continue;
    
    // Check and move audio files
    if (folders.audio.extensions.includes(extension) && 
        folders.audio.pattern.test(fileName)) {
        const moved = await moveFile(file, folders.audio.dest);
        if (moved) movedCount++;
    }
    // Check and move image files
    else if (folders.images.extensions.includes(extension)) {
        const moved = await moveFile(file, folders.images.dest);
        if (moved) movedCount++;
    }
    // Check and move video files
    else if (folders.videos.extensions.includes(extension)) {
        const moved = await moveFile(file, folders.videos.dest);
        if (moved) movedCount++;
    }
    // Check and move PDF files
    else if (folders.pdfs.extensions.includes(extension)) {
        const moved = await moveFile(file, folders.pdfs.dest);
        if (moved) movedCount++;
    }
}

// Show results
if (movedCount > 0) {
    new Notice(`✓ **Moved ${movedCount} file(s) successfully!**`);
} else {}

if (errors.length > 0) {
    dv.paragraph(`⚠️ **Errors (${errors.length}):**`);
    dv.list(errors);
}
```
```dataviewjs
// 8. تصفية الروابط: كود يحول الروابط الغير مستعملة الى نصوص
const dailyFolder = "003 Daily/002 Archived Diaries";

const todayStr = new Date().toISOString().split('T')[0];
const storageKey = "daily_link_cleaner_last_run";

if (localStorage.getItem(storageKey) === todayStr) {}
else {
    const files = app.vault.getMarkdownFiles().filter(f => {
        const isInFolder = f.path.startsWith(dailyFolder);
        const isDateFormat = /^\d{4}-\d{2}-\d{2}$/.test(f.basename);
        return isInFolder && isDateFormat;
    });

    let processedCount = 0;
    let updatedFiles = [];
    const linkRegex = /\[\[(Dia\s*-\s*log\s*-\s*\d{4}-\d{2}-\d{2}|log\s*-\s*\d{4}-\d{2}-\d{2})(?:\|([^\]]+))?\]\]/g;

    for (let file of files) {
        let content = await app.vault.read(file);
        let isChanged = false;

        let newContent = content.replace(linkRegex, (match, linkPath, alias) => {

            const targetFile = app.metadataCache.getFirstLinkpathDest(linkPath.trim(), file.path);

            if (targetFile) {
                return match;
            }

            isChanged = true;

            if (alias && alias.trim() !== "") {
                return alias.trim();
            }

            if (linkPath.includes("Dia")) {
                return "هذا اليوم";
            } else {
                return "تعلم/مشروع --";
            }
        });

        if (isChanged) {
            await app.vault.modify(file, newContent);
            updatedFiles.push(file.basename);
            processedCount++;
        }
    }
    localStorage.setItem(storageKey, todayStr);

    if (processedCount > 0) {
        console.log(`تم تعديل ${processedCount} ملفا بنجاح.`);
        console.log(updatedFiles);
    } else {
        console.log("لم يتم العثور على روابط مكسورة مطابقة بعد التحديث.");
    }
}
```
```dataviewjs
// 9. حذف تاع الاخفاء: الخاص بلغه html ومحتوياته 
const targetFolders = ["003 Daily/002 Archived Diaries"];
const files = app.vault.getMarkdownFiles().filter(file => targetFolders.some(folder => file.path.startsWith(folder + "/")));
const today = new Date().toDateString();
const lastRunKey = "htmlCommentsCleaner_lastRun";

if (localStorage.getItem(lastRunKey) === today) {/*تم التنظيف مسبقاً*/}
else {
    for (const file of files) {
        const content = await app.vault.read(file);
        const newContent = content.replace(/<!--[\s\S]*?-->/g, '');
        if (content !== newContent) {
            await app.vault.modify(file, newContent);
        }
    }
    localStorage.setItem(lastRunKey, today);
    console.log("🎉 تم تنظيف التعليقات بنجاح");
}
```
```dataviewjs
// 10. حذف الروابط غير المهمة: الموجوده في ارشيف اليوميات
const lastRun = localStorage.getItem("daily_cleanup_last_run");
const today = new Date().toDateString();

if (lastRun !== today) {
    const wiki_expected = ["log", "Days MOC", "Automatically"];
    const targetFolder = "003 Daily/002 Archived Diaries";
    const filePattern = /^\d{4}-\d{2}-\d{2}$/;

    const files = app.vault.getFiles().filter(f => f.path.startsWith(targetFolder) && filePattern.test(f.basename)); 
    
    for (const file of files) { 
        const content = await app.vault.read(file); 
        let fmMatch = content.match(/^---\n([\s\S]*?)\n---/); 
        let fm = fmMatch ? fmMatch[0] : ""; 
        let body = fmMatch ? content.slice(fmMatch[0].length) : content; 
        
        if (fm) { 
            fm = fm.replace(/^(.*)\[\[([^\]]+)\]\](.*)$\n?/gm, (match, before, p1, after) => { 
                const parts = p1.split('|'); 
                const link = parts[0]; 
                const alias = parts[1] || link; 
                if (wiki_expected.some(w => link.includes(w) || alias.includes(w))) { 
                    return match; 
                } 
                return ''; 
            }); 
        } 
        body = body.replace(/!\[\[([^\]]+)\]\]/g, (match, p1) => {
            const parts = p1.split('|');
            const link = parts[0];
            const alias = parts[1] || link;
            if (wiki_expected.some(w => link.includes(w) || alias.includes(w))) {
                return match;
            }
            return "";
        });

        body = body.replace(/\[\[([^\]]+)\]\]/g, (match, p1) => { 
            const parts = p1.split('|'); 
            const link = parts[0]; 
            const alias = parts[1] || link; 
            if (wiki_expected.some(w => link.includes(w) || alias.includes(w))) { 
                return match; 
            } 
            return `**${alias}**`; 
        }); 
        
        const updated = fm + body; 
        if (updated !== content) { 
            await app.vault.modify(file, updated); 
        } 
    } 
    localStorage.setItem("daily_cleanup_last_run", today); 
}
```
```dataviewjs
// 11. منظف المفاتيح: يقوم بتنظيف اللوكال ستوريج من المفاتيح غير المفيدة
const todayDash = moment().format("YYYY-MM-DD");
const todayParts = moment().format("MMM DD YYYY");
const CLEAN_LOCK_KEY = "global_storage_cleanup_last_run";

const dictionary = ["note-fold", "search", "vConsole", "communityPluginSortOrder", "pdfjs.sidebarView", "file-explorer-unfold"];
const excludes = ["Azkaru"];

const dateDashRegex = /\d{4}-\d{2}-\d{2}/;
const dateTextRegex = /(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d+\s+\d{4}/i;

if (localStorage.getItem(CLEAN_LOCK_KEY) === todayDash + 1) {/*Cleanup already done today*/}
else {
    
    let deletedCount = 0;

    for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (!key || key === CLEAN_LOCK_KEY) continue;

        let shouldDelete = false;

        const keyLower = key.toLowerCase();
        if (dictionary.some(word => keyLower.includes(word.toLowerCase())) && !excludes.some(word => keyLower.includes(word.toLowerCase())) ) {
            shouldDelete = true;
        }

        if (!shouldDelete) {
            const matchDash = key.match(dateDashRegex);
            if (matchDash && matchDash[0] !== todayDash) {
                shouldDelete = true;
            }
        }

        if (!shouldDelete) {
            const matchText = key.match(dateTextRegex);
            if (matchText) {
                const cleanFound = matchText[0].replace(/\s+/g, ' ').toLowerCase();
                const cleanToday = todayParts.replace(/\s+/g, ' ').toLowerCase();
                if (cleanFound !== cleanToday) {
                    shouldDelete = true;
                }
            }
        }

        if (shouldDelete) {
            console.log(`🗑️ تم حذف المفتاح: ${key}`);
            localStorage.removeItem(key);
            deletedCount++;
            i--;
        }
    }

    localStorage.setItem(CLEAN_LOCK_KEY, todayDash);

    if (deletedCount > 0) {
        console.log(`🧹 تم تنظيف وحذف ${deletedCount} من المفاتيح القديمة!`);
    }
}
```
```dataviewjs
// 12. ماحي الباكلينكس: حذف الواجهة الخاصة بالروابط الخلفية فور ظهورها
function closeBacklinksLeaf() {
    app.workspace.iterateAllLeaves(leaf => {
        if (leaf.view && typeof leaf.view.getViewType === "function" && leaf.view.getViewType() === "backlink") {
            leaf.detach();
        }
    });
}

closeBacklinksLeaf();

const layoutChangeRef = app.workspace.on("layout-change", () => {
    closeBacklinksLeaf();
});

dv.container.onunload = () => {
    app.workspace.offref(layoutChangeRef);
};
```