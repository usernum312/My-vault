---
icon: lucide-recycle
cssclasses:
  - center-title
  - Disappear
node_size: 15
---

### يكتب يومك فكيف هو؟
![[Quotes]]
![[Tracker Q]]
![[RandomAya]]
```dataviewjs
// كود 1: نقل المذكرات القديمة (صامت تماماً)
const DiariesFolder = "003 Daily/001 Active Diaries";
const archiveFolder = "003 Daily/002 Archived Diaries";
const threeDaysAgo = moment().subtract(30, 'days');

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
        console.log(`✅ تم نقل: ${file.name}`);
    }
    new Notice(`✓ تم نقل ${files.length} مذكرة قديمة`);
}
```
```dataviewjs
// كود 2: نقل ملفات Snippet (صامت تماماً)
const sourceFolder = "002 Notes/001 Notes";
const archiveFolder = "002 Notes/004 Archived Notes/Snippet";

const snippetFiles = app.vault.getFiles()
    .filter(file => file.path.startsWith(sourceFolder))
    .filter(file => {
        const cache = app.metadataCache.getFileCache(file);
        if (!cache?.frontmatter) return false;
        const theTopic = cache.frontmatter["The Topic"];
        if (!theTopic) return false;
        if (Array.isArray(theTopic)) return theTopic.includes("snippet");
        if (typeof theTopic === "string") return theTopic === "snippet";
        return false;
    });

if (snippetFiles.length > 0) {
    const archiveFolderExists = app.vault.getAbstractFileByPath(archiveFolder);
    if (!archiveFolderExists) await app.vault.createFolder(archiveFolder);
    
    for (const file of snippetFiles) {
        const newPath = file.path.replace(sourceFolder, archiveFolder);
        await app.vault.rename(file, newPath);
        console.log(`✅ تم نقل Snippet: ${file.name}`);
    }
    new Notice(`✓ تم نقل ${snippetFiles.length} ملف Snippet`);
}
```
```dataviewjs
// كود 3: نقل ملفات Log (صامت تماماً)
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
    if (movedCount > 0) new Notice(`✓ تم نقل ${movedCount} ملف Log`);
}
```
```dataviewjs
// كود 4: ملء ملفات Log الفارغة (صامت تماماً)
const logsFolder = '002 Notes/002 Lessons/Logs';
const templateFile = 'Log Tem.md';

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
    if (filledCount > 0) new Notice(`✓ تم ملء ${filledCount} ملف Log`);
}
```