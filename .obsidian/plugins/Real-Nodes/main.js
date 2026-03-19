const { Plugin, PluginSettingTab, Setting, Notice, TFolder } = require('obsidian');

const DEFAULT_SETTINGS = {
    appendAfterBlock: true,
    autoRunOnChange: false,
    enableBases: true,
    enableDataview: true,
    autoUpdateFiles: [],
    autoUpdateAll: false,
};

module.exports = class RealNodesPlugin extends Plugin {
    constructor(app, manifest) {
        super(app, manifest);
        this.pendingChanges = 0;
        this.settings = Object.assign({}, DEFAULT_SETTINGS);
    }

    async onload() {
        try {
            console.log('RealNodesPlugin: Loading...');
            
            await this.loadSettingsSafe();
            this.registerCommands();
            this.setupAutoUpdate();
            this.addSettingTab(new RealNodesSettingTab(this.app, this));
            
            console.log('RealNodesPlugin: Loaded successfully');
        } catch (e) {
            console.error('RealNodesPlugin: Failed to load', e);
            new Notice('Real Nodes plugin failed to load. Check console for details.');
        }
    }

    async loadSettingsSafe() {
        try {
            if (!this.app) {
                console.warn('RealNodesPlugin: this.app is undefined, using default settings');
                return;
            }
            
            const savedData = await this.loadData();
            this.settings = Object.assign({}, DEFAULT_SETTINGS, savedData);
            console.log('RealNodesPlugin: Settings loaded', this.settings);
        } catch (e) {
            console.error('RealNodesPlugin: Error loading settings, using defaults', e);
            this.settings = Object.assign({}, DEFAULT_SETTINGS);
        }
    }

    registerCommands() {
        try {
            if (!this.app) {
                console.error('RealNodesPlugin: Cannot register commands - app is undefined');
                return;
            }

            this.addCommand({
                id: 'append-bases-links-after-block',
                name: 'Real Nodes: Append after block',
                callback: () => this.processCurrentFile(false),
            });

            this.addCommand({
                id: 'append-bases-links-to-end',
                name: 'Real Nodes: Append to end',
                callback: () => this.processCurrentFile(true),
            });

            this.addCommand({
                id: 'add-current-file-to-auto-update',
                name: 'Real Nodes: Add current file to auto update list',
                callback: () => this.addCurrentFileToAutoUpdate(),
            });

            this.addCommand({
                id: 'remove-current-file-from-auto-update',
                name: 'Real Nodes: Remove current file from auto update list',
                callback: () => this.removeCurrentFileFromAutoUpdate(),
            });
        } catch (e) {
            console.error('RealNodesPlugin: Error registering commands', e);
        }
    }

    onunload() {
        console.log('RealNodesPlugin unloaded');
    }

    async saveSettings() {
        try {
            if (!this.app) {
                console.error('RealNodesPlugin: Cannot save settings - app is undefined');
                return;
            }
            await this.saveData(this.settings);
        } catch (e) {
            console.error('RealNodesPlugin: Error saving settings', e);
        }
    }

    // ======================== دوال التحديث التلقائي ========================
    setupAutoUpdate() {
        try {
            if (!this.app || !this.app.vault) {
                console.error('RealNodesPlugin: Cannot setup auto update - vault is undefined');
                return;
            }

            this.registerEvent(
                this.app.vault.on('modify', (file) => {
                    if (this.pendingChanges === 0 && file && file.extension === 'md') {
                        this.checkAndProcessFile(file);
                    }
                })
            );

            this.registerEvent(
                this.app.vault.on('create', (file) => {
                    if (this.pendingChanges === 0 && file && file.extension === 'md') {
                        this.checkAndProcessFile(file);
                    }
                })
            );

            this.registerEvent(
                this.app.vault.on('rename', (file, oldPath) => {
                    if (this.pendingChanges === 0 && file && file.extension === 'md') {
                        this.checkAndProcessFile(file);
                    }
                })
            );
        } catch (e) {
            console.error('RealNodesPlugin: Error setting up auto update', e);
        }
    }

    checkAndProcessFile(file) {
        try {
            if (!this.settings.autoRunOnChange) return;

            if (this.settings.autoUpdateAll) {
                console.log(`Auto updating all files: ${file.path}`);
                this.processFile(file);
                return;
            }

            if (this.settings.autoUpdateFiles.includes(file.path)) {
                console.log(`Auto updating specific file: ${file.path}`);
                this.processFile(file);
                return;
            }
        } catch (e) {
            console.error('RealNodesPlugin: Error in checkAndProcessFile', e);
        }
    }

    async addCurrentFileToAutoUpdate() {
        try {
            if (!this.app) {
                new Notice('Plugin not properly initialized');
                return;
            }

            const activeFile = this.app.workspace.getActiveFile();
            if (!activeFile) {
                new Notice('No active file');
                return;
            }

            if (!this.settings.autoUpdateFiles.includes(activeFile.path)) {
                this.settings.autoUpdateFiles.push(activeFile.path);
                await this.saveSettings();
                new Notice(`Added ${activeFile.name} to auto update list`);
            } else {
                new Notice(`${activeFile.name} is already in auto update list`);
            }
        } catch (e) {
            console.error('RealNodesPlugin: Error adding file to auto update', e);
            new Notice('Error adding file to auto update list');
        }
    }

    async removeCurrentFileFromAutoUpdate() {
        try {
            if (!this.app) {
                new Notice('Plugin not properly initialized');
                return;
            }

            const activeFile = this.app.workspace.getActiveFile();
            if (!activeFile) {
                new Notice('No active file');
                return;
            }

            const index = this.settings.autoUpdateFiles.indexOf(activeFile.path);
            if (index > -1) {
                this.settings.autoUpdateFiles.splice(index, 1);
                await this.saveSettings();
                new Notice(`Removed ${activeFile.name} from auto update list`);
            } else {
                new Notice(`${activeFile.name} is not in auto update list`);
            }
        } catch (e) {
            console.error('RealNodesPlugin: Error removing file from auto update', e);
            new Notice('Error removing file from auto update list');
        }
    }

    // ======================== دوال معالجة الملفات ========================
    async processCurrentFile(forceAppendToEnd) {
        try {
            if (!this.app) {
                new Notice('Plugin not properly initialized');
                return;
            }

            const activeFile = this.app.workspace.getActiveFile();
            if (!activeFile) {
                new Notice('No active file');
                return;
            }
            await this.processFile(activeFile, forceAppendToEnd);
        } catch (e) {
            console.error('RealNodesPlugin: Error processing current file', e);
            new Notice('Error processing file');
        }
    }

    async processFile(file, forceAppendToEnd) {
        try {
            if (!this.app || !this.app.vault) {
                console.error('RealNodesPlugin: Cannot process file - vault is undefined');
                return;
            }

            console.log(`Processing file: ${file.path}`);
            const content = await this.app.vault.read(file);
            const cleanContent = this.removeExistingLinks(content);
            const newContent = await this.transformContent(cleanContent, file, forceAppendToEnd ?? !this.settings.appendAfterBlock);

            if (newContent !== cleanContent) {
                this.pendingChanges++;
                await this.app.vault.modify(file, newContent);
                this.pendingChanges--;
                console.log(`Real Nodes updated in ${file.name}`);
                console.log('File updated successfully');
            } else {
                console.log('No changes detected for', file.path);
            }
        } catch (e) {
            console.error(`Error processing file ${file.path}:`, e);
            new Notice(`Error updating ${file.name}: ${e.message}`);
        }
    }

    removeExistingLinks(content) {
        const linkBlockRegex = /> \[!link\]- Real Links.*\n(> .*\n)*/g;
        let newContent = content.replace(linkBlockRegex, '');
        newContent = newContent.replace(/\n{3,}/g, '\n\n');
        return newContent;
    }

    async transformContent(content, file, appendToEnd) {
        const baseRegex = /```base\n([\s\S]*?)```/g;
        const dataviewRegex = /```dataview\n([\s\S]*?)```/g;

        let match;
        let lastIndex = 0;
        const parts = [];
        let hasChanges = false;
        let allLinks = [];

        console.log('Searching for query blocks...');

        if (this.settings.enableBases) {
            while ((match = baseRegex.exec(content)) !== null) {
                const fullMatch = match[0];
                const queryText = match[1].trim();
                const blockStart = match.index;
                const blockEnd = blockStart + fullMatch.length;

                console.log(`Found Base block at index ${blockStart}`);
                parts.push(content.slice(lastIndex, blockStart));
                parts.push(fullMatch);

                const linkedFiles = this.getFilesFromBaseQuery(queryText, file);
                console.log(`Extracted ${linkedFiles.length} files from Base block`);

                if (linkedFiles.length > 0) {
                    const linksText = this.formatLinks(linkedFiles, 'Base');
                    if (!appendToEnd) {
                        parts.push('\n\n' + linksText);
                        hasChanges = true;
                    } else {
                        allLinks.push(...linkedFiles);
                        hasChanges = true;
                    }
                }

                lastIndex = blockEnd;
            }
        }

        if (this.settings.enableDataview) {
            dataviewRegex.lastIndex = lastIndex;

            while ((match = dataviewRegex.exec(content)) !== null) {
                const fullMatch = match[0];
                const queryText = match[1].trim();
                const blockStart = match.index;
                const blockEnd = blockStart + fullMatch.length;

                console.log(`Found Dataview block at index ${blockStart}`);

                parts.push(content.slice(lastIndex, blockStart));
                parts.push(fullMatch);

                const linkedFiles = await this.getFilesFromDataviewQuery(queryText, file);
                console.log(`Extracted ${linkedFiles.length} files from Dataview block`);

                if (linkedFiles.length > 0) {
                    const linksText = this.formatLinks(linkedFiles, 'Dataview');
                    if (!appendToEnd) {
                        parts.push('\n\n' + linksText);
                        hasChanges = true;
                    } else {
                        allLinks.push(...linkedFiles);
                        hasChanges = true;
                    }
                }

                lastIndex = blockEnd;
            }
        }

        parts.push(content.slice(lastIndex));

        if (appendToEnd && hasChanges && allLinks.length > 0) {
            const uniqueLinks = [...new Set(allLinks)];
            const linksText = this.formatLinks(uniqueLinks, 'Combined');
            parts.push('\n\n' + linksText);
            console.log(`Appended ${uniqueLinks.length} unique links to end`);
        }

        let result = parts.join('');
        result = result.replace(/\n{3,}/g, '\n\n');
        return result;
    }

    // ======================== دوال Bases المتكاملة ========================
    getFilesFromBaseQuery(yamlText, currentFile) {
        try {
            const conditions = this.parseBaseConditions(yamlText);
            console.log('Parsed conditions:', JSON.stringify(conditions, null, 2));

            const allFiles = this.app.vault.getMarkdownFiles();
            console.log(`Total files in vault: ${allFiles.length}`);

            const matchedFiles = allFiles.filter(file => {
                return this.evaluateBaseConditions(file, conditions);
            });

            console.log(`Matched files: ${matchedFiles.length}`);
            
            if (matchedFiles.length > 0) {
                console.log('Matched files list:');
                matchedFiles.forEach((f, index) => {
                    console.log(`  ${index + 1}. ${f.path}`);
                });
            }
            
            return matchedFiles.map(f => f.path);
        } catch (e) {
            console.error('Error in getFilesFromBaseQuery:', e);
            return [];
        }
    }

    parseBaseConditions(yamlText) {
        const conditions = {};
        const lines = yamlText.split('\n');
        let i = 0;

        // البحث عن filters:
        while (i < lines.length && !lines[i].trim().startsWith('filters:')) i++;
        i++;

        // تحديد نوع الفلتر الرئيسي (or أو and)
        while (i < lines.length) {
            const line = lines[i].trim();
            
            if (line === 'or:') {
                conditions.or = [];
                this.parseFilterBlock(lines, i + 1, 'or', conditions);
                break;
            } else if (line === 'and:') {
                conditions.and = [];
                this.parseFilterBlock(lines, i + 1, 'and', conditions);
                break;
            }
            i++;
        }

        console.log('Final conditions:', JSON.stringify(conditions, null, 2));
        return conditions;
    }

    parseFilterBlock(lines, startIndex, type, conditions) {
        let i = startIndex;
        let currentAnd = null;

        while (i < lines.length) {
            const line = lines[i].trim();
            const fullLine = lines[i];
            const indent = fullLine.search(/\S/);

            if (line.startsWith('views:')) break;

            if (line.startsWith('-')) {
                const item = line.substring(1).trim();

                if (item === 'and:') {
                    currentAnd = { and: [] };
                    if (type === 'or') {
                        conditions.or.push(currentAnd);
                    } else if (type === 'and') {
                        // and داخل and (نادر)
                        conditions.and.push(currentAnd);
                    }
                }
                else if (currentAnd && indent > 4) {
                    currentAnd.and.push(item);
                }
                else {
                    if (type === 'or') {
                        conditions.or.push(item);
                    } else if (type === 'and') {
                        conditions.and.push(item);
                    }
                    currentAnd = null;
                }
            }
            i++;
        }
    }

    evaluateBaseConditions(file, conditions) {
        if (!conditions) return false;

        // إذا كان هناك شرط and رئيسي
        if (conditions.and && Array.isArray(conditions.and)) {
            return conditions.and.every(condition => {
                if (typeof condition === 'string') {
                    return this.evaluateBaseCondition(file, condition);
                }
                else if (condition.and && Array.isArray(condition.and)) {
                    return condition.and.every(subCond => 
                        this.evaluateBaseCondition(file, subCond)
                    );
                }
                return false;
            });
        }
        
        // إذا كان هناك شرط or رئيسي
        if (conditions.or && Array.isArray(conditions.or)) {
            return conditions.or.some(condition => {
                if (typeof condition === 'string') {
                    return this.evaluateBaseCondition(file, condition);
                }
                else if (condition.and && Array.isArray(condition.and)) {
                    return condition.and.every(subCond => 
                        this.evaluateBaseCondition(file, subCond)
                    );
                }
                return false;
            });
        }

        return false;
    }

    evaluateBaseCondition(file, condition) {
        console.log(`Evaluating condition: "${condition}" for file: ${file.path}`);
        
        // ============ شروط Frontmatter ============
        
        // pattern: note["The Topic"].contains("Games")
        const frontmatterContainsMatch = condition.match(/(\w+)\[["']([^"']+)["']\]\.contains\(["']([^"']+)["']\)/);
        if (frontmatterContainsMatch) {
            const field = frontmatterContainsMatch[2];
            const value = frontmatterContainsMatch[3];
            const frontmatter = this.getFrontmatter(file);
            
            if (frontmatter && frontmatter[field] !== undefined) {
                const result = String(frontmatter[field]).toLowerCase().includes(value.toLowerCase());
                console.log(`frontmatter[${field}] contains "${value}"? ${result}`);
                return result;
            }
            return false;
        }
        
        // pattern: note["The Topic"] == "Games"
        const frontmatterEqMatch = condition.match(/(\w+)\[["']([^"']+)["']\]\s*==\s*["']([^"']+)["']/);
        if (frontmatterEqMatch) {
            const field = frontmatterEqMatch[2];
            const value = frontmatterEqMatch[3];
            const frontmatter = this.getFrontmatter(file);
            
            if (frontmatter && frontmatter[field] !== undefined) {
                const result = String(frontmatter[field]) === value;
                console.log(`frontmatter[${field}] == "${value}"? ${result}`);
                return result;
            }
            return false;
        }
        
        // pattern: note["The Topic"] != "Games"
        const frontmatterNeMatch = condition.match(/(\w+)\[["']([^"']+)["']\]\s*!=\s*["']([^"']+)["']/);
        if (frontmatterNeMatch) {
            const field = frontmatterNeMatch[2];
            const value = frontmatterNeMatch[3];
            const frontmatter = this.getFrontmatter(file);
            
            if (frontmatter && frontmatter[field] !== undefined) {
                const result = String(frontmatter[field]) !== value;
                console.log(`frontmatter[${field}] != "${value}"? ${result}`);
                return result;
            }
            return true; // إذا لم يوجد الحقل، يعتبر غير متساوٍ
        }
        
        // ============ شروط الملف الأساسية ============
        
        // file.folder ==
        const folderEqMatch = condition.match(/file\.folder\s*==\s*["']([^"']+)["']/);
        if (folderEqMatch) {
            const targetFolder = folderEqMatch[1];
            const fileFolder = file.path.includes('/') ? 
                file.path.substring(0, file.path.lastIndexOf('/')) : '';
            console.log(`folder == "${targetFolder}"? ${fileFolder === targetFolder}`);
            return fileFolder === targetFolder;
        }

        // file.folder !=
        const folderNeMatch = condition.match(/file\.folder\s*!=\s*["']([^"']+)["']/);
        if (folderNeMatch) {
            const targetFolder = folderNeMatch[1];
            const fileFolder = file.path.includes('/') ? 
                file.path.substring(0, file.path.lastIndexOf('/')) : '';
            console.log(`folder != "${targetFolder}"? ${fileFolder !== targetFolder}`);
            return fileFolder !== targetFolder;
        }

        // file.name !=
        const nameNeMatch = condition.match(/file\.name\s*!=\s*["']([^"']+)["']/);
        if (nameNeMatch) {
            const forbiddenName = nameNeMatch[1];
            console.log(`name != "${forbiddenName}"? ${file.basename !== forbiddenName}`);
            return file.basename !== forbiddenName;
        }

        // file.hasProperty()
        const hasPropMatch = condition.match(/file\.hasProperty\(["']([^"']+)["']\)/);
        if (hasPropMatch) {
            const prop = hasPropMatch[1];
            const frontmatter = this.getFrontmatter(file);
            const result = frontmatter?.hasOwnProperty(prop) || false;
            console.log(`hasProperty("${prop}")? ${result}`);
            return result;
        }

        // !file.name.contains("Tem") - حالة خاصة
        if (condition.includes('!file.name.contains("Tem")')) {
            const result = !file.basename.includes('Tem') && !file.basename.includes('tem') && !file.basename.includes('TEM');
            console.log(`!name.contains("Tem")? ${result}`);
            return result;
        }

        // file.name.contains()
        const nameContainsMatch = condition.match(/file\.name\.contains\(["']([^"']+)["']\)/);
        if (nameContainsMatch) {
            const text = nameContainsMatch[1];
            const result = file.basename.includes(text);
            console.log(`name.contains("${text}")? ${result}`);
            return result;
        }

        // !file.name.contains() - عام
        const nameNotContainsMatch = condition.match(/!file\.name\.contains\(["']([^"']+)["']\)/);
        if (nameNotContainsMatch) {
            const text = nameNotContainsMatch[1];
            const result = !file.basename.includes(text);
            console.log(`!name.contains("${text}")? ${result}`);
            return result;
        }

        // file.inFolder()
        const inFolderMatch = condition.match(/file\.inFolder\(["']([^"']+)["']\)/);
        if (inFolderMatch) {
            return this.isFileInFolder(file, inFolderMatch[1]);
        }

        // file.hasTag()
        const hasTagMatch = condition.match(/file\.hasTag\(["']([^"']+)["']\)/);
        if (hasTagMatch) {
            return this.fileHasTag(file, hasTagMatch[1]);
        }

        console.log(`No pattern matched for: "${condition}"`);
        return false;
    }

    // ======================== دوال مساعدة محسنة ========================
    isFileInFolder(file, folderPath) {
        // مسار مجلد الملف (بدون اسم الملف)
        const fileFolder = file.path.includes('/') ? file.path.substring(0, file.path.lastIndexOf('/')) : '';
        // إذا كان الملف في الجذر، fileFolder = ''
        
        // تنظيف المجلد المطلوب من الشرطة المائلة في النهاية
        const normalizedFolder = folderPath.endsWith('/') ? folderPath.slice(0, -1) : folderPath;
        
        // التحقق: إما أن يكون مجلد الملف مساوياً للمجلد المطلوب، أو يبدأ به متبوعاً بـ /
        const result = fileFolder === normalizedFolder || fileFolder.startsWith(normalizedFolder + '/');
        
        console.log(`isFileInFolder: ${file.path} in "${folderPath}"? ${result} (fileFolder: "${fileFolder}")`);
        return result;
    }

    fileHasTag(file, tag) {
        try {
            const cache = this.app.metadataCache.getFileCache(file);
            if (!cache) {
                console.log(`fileHasTag: ${file.path} - no cache`);
                return false;
            }
            
            // تنظيف التاغ من علامات التنصيص والمسافات
            const cleanTag = tag.replace(/["']/g, '').trim();
            // إزالة # من البداية إن وجدت
            const searchTag = cleanTag.startsWith('#') ? cleanTag.slice(1) : cleanTag;
            
            // 1. البحث في frontmatter
            if (cache.frontmatter) {
                // يمكن أن يكون frontmatter.tags مصفوفة أو سلسلة مفصولة بفواصل
                const fmTags = cache.frontmatter.tags || cache.frontmatter.tag;
                if (fmTags) {
                    let tagsArray = [];
                    if (typeof fmTags === 'string') {
                        tagsArray = fmTags.split(',').map(s => s.trim());
                    } else if (Array.isArray(fmTags)) {
                        tagsArray = fmTags;
                    }
                    // التحقق من وجود التاغ (مع أو بدون #)
                    if (tagsArray.includes(searchTag) || tagsArray.includes(`#${searchTag}`)) {
                        console.log(`fileHasTag: ${file.path} has tag "${tag}" in frontmatter`);
                        return true;
                    }
                }
            }
            
            // 2. البحث في cache.tags (التاغات من النص)
            if (cache.tags) {
                const hasTag = cache.tags.some(t => {
                    const tagname = t.tag.startsWith('#') ? t.tag.slice(1) : t.tag;
                    return tagname === searchTag;
                });
                if (hasTag) {
                    console.log(`fileHasTag: ${file.path} has tag "${tag}" in text`);
                    return true;
                }
            }
            
            console.log(`fileHasTag: ${file.path} does NOT have tag "${tag}"`);
            return false;
        } catch (e) {
            console.error('Error checking tag:', e);
            return false;
        }
    }

    getFrontmatter(file) {
        try {
            if (!this.app || !this.app.metadataCache) {
                return {};
            }
            const cache = this.app.metadataCache.getFileCache(file);
            const frontmatter = cache?.frontmatter || {};
            console.log(`getFrontmatter for ${file.path}:`, frontmatter);
            return frontmatter;
        } catch (e) {
            console.error('Error getting frontmatter:', e);
            return {};
        }
    }

    // ======================== دوال Dataview ========================
    async getFilesFromDataviewQuery(queryText, currentFile) {
        try {
            const dataview = this.getDataviewPlugin();
            if (!dataview) return [];

            console.log('Executing Dataview query:', queryText);
            const result = await dataview.api.query(queryText);

            if (!result.successful) {
                console.log('Dataview query failed:', result.error);
                return [];
            }

            const files = [];

            if (result.value.type === 'table' && result.value.headers) {
                if (result.value.headers[0] === 'File') {
                    result.value.values.forEach(row => {
                        if (row[0] && row[0].path) {
                            files.push(row[0].path);
                        }
                    });
                }
            } else if (result.value.type === 'list') {
                result.value.values.forEach(item => {
                    if (item && item.path) {
                        files.push(item.path);
                    }
                });
            }

            return [...new Set(files)];
        } catch (e) {
            console.error('Error executing Dataview query:', e);
            return [];
        }
    }

    getDataviewPlugin() {
        try {
            if (!this.app || !this.app.plugins) {
                return null;
            }
            const dataview = this.app.plugins.getPlugin('dataview');
            if (!dataview) {
                console.warn('Dataview plugin is not enabled');
                return null;
            }
            return dataview;
        } catch (e) {
            console.error('Error getting Dataview plugin:', e);
            return null;
        }
    }

    formatLinks(filePaths, source = '') {
        if (filePaths.length === 0) return '';
        const sourceText = source ? ` (${source})` : '';
        let result = `> [!link]- Real Links${sourceText}\n`;

        const sortedPaths = [...filePaths].sort();

        sortedPaths.forEach(path => {
            const fileName = path.split('/').pop().replace('.md', '') || path;
            result += `> - [[${fileName}]]\n`;
        });

        return result;
    }
};

class RealNodesSettingTab extends PluginSettingTab {
    constructor(app, plugin) {
        super(app, plugin);
        this.plugin = plugin;
    }

    display() {
        const { containerEl } = this;
        containerEl.empty();

        containerEl.createEl('h2', { text: 'General Settings' });

        new Setting(containerEl)
            .setName('Append after block')
            .setDesc('If enabled, links will be appended right after each block. Otherwise, they will be appended at the end of the file.')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.appendAfterBlock)
                .onChange(async (value) => {
                    this.plugin.settings.appendAfterBlock = value;
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName('Enable Bases support')
            .setDesc('Process ```base blocks')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.enableBases)
                .onChange(async (value) => {
                    this.plugin.settings.enableBases = value;
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName('Enable Dataview support')
            .setDesc('Process ```dataview blocks')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.enableDataview)
                .onChange(async (value) => {
                    this.plugin.settings.enableDataview = value;
                    await this.plugin.saveSettings();
                }));

        containerEl.createEl('h2', { text: 'Auto Update Settings' });

        new Setting(containerEl)
            .setName('Enable auto update')
            .setDesc('Turn on automatic updates for selected files')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.autoRunOnChange)
                .onChange(async (value) => {
                    this.plugin.settings.autoRunOnChange = value;
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName('Auto update all files')
            .setDesc('⚠️ Warning: This will auto update EVERY markdown file in your vault')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.autoUpdateAll)
                .onChange(async (value) => {
                    this.plugin.settings.autoUpdateAll = value;
                    await this.plugin.saveSettings();
                }));

        containerEl.createEl('h3', { text: 'Selected Files for Auto Update' });

        if (this.plugin.settings.autoUpdateFiles.length === 0) {
            containerEl.createEl('p', {
                text: 'No files selected. Use commands to add files:',
                cls: 'setting-item-description'
            });
            containerEl.createEl('ul', { cls: 'setting-item-description' }).innerHTML = `
                <li>「Real Nodes: Add current file to auto update list」</li>
                <li>「Real Nodes: Remove current file from auto update list」</li>
            `;
        } else {
            const fileList = containerEl.createEl('div', { cls: 'setting-item' });
            this.plugin.settings.autoUpdateFiles.forEach(filePath => {
                const fileSetting = new Setting(fileList)
                    .setName(filePath.split('/').pop())
                    .setDesc(filePath);

                fileSetting.addButton(btn => btn
                    .setButtonText('Remove')
                    .onClick(async () => {
                        const index = this.plugin.settings.autoUpdateFiles.indexOf(filePath);
                        if (index > -1) {
                            this.plugin.settings.autoUpdateFiles.splice(index, 1);
                            await this.plugin.saveSettings();
                            this.display();
                        }
                    }));
            });
        }
    }
}