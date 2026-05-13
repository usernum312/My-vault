---
icon: ScriptEngine
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
const sourceFolder = "002 Notes/001 Notes/Norm Notes";
const archiveFolder = "002 Notes/004 Archived Notes/Snippets/Various snippets";

const snippetFiles = app.vault.getFiles()
    .filter(file => file.path.startsWith(sourceFolder))
    .filter(file => {
        const cache = app.metadataCache.getFileCache(file);
        if (!cache?.frontmatter) return false;
        const Topic = cache.frontmatter["Categories"];
        if (!Topic) return false;
        if (Array.isArray(Topic)) return Topic.includes("Snippet");
        if (typeof Topic === "string") return Topic === "Snippet";
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
// 3. كود : نقل ملفات Log (صامت تماماً)
const sourceFolder = '002 Notes/001 Notes/Norm Notes';
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
const sourceFolder = '002 Notes/001 Notes/Norm Notes';
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
// Configuration
const folders = {
    audio: {
        extensions: ['mp3', 'm4a', 'wav', 'ogg', 'flac'],
        pattern: /^Rec/i, // Files starting with "Recording" (case-insensitive)
        dest: '004 Meta/001 Attach/002 Attachment media/SNDs/Records'
    },
    images: {
        extensions: ['jpg', 'jpeg', 'gif', 'png', 'bmp', 'svg', 'webp'],
        dest: '004 Meta/001 Attach/002 Attachment media/IMGs'
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