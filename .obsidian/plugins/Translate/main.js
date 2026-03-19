const { Plugin, PluginSettingTab, Setting } = require('obsidian');

// Default settings
const DEFAULT_SETTINGS = {
    doNotTranslate: [],
    manualTranslations: []
};

module.exports = class AutoTranslatePlugin extends Plugin {
    async onload() {
        await this.loadSettings();

        // Load persistent translation cache
        this.cache = (await this.loadData()) || {};
        this.pendingTranslations = new Map();

        // Core state
        this.currentView = null;
        this.currentFile = null;
        this.observer = null;
        this.mutationObserver = null;
        this.translationCache = new Map();
        this.visibleElements = new Set();
        this.translationQueue = [];
        this.processing = false;
        this.originalContents = new Map(); // Store original HTML content

        this.targetSelectors = 'p, h1, h2, h3, h4, h5, h6, li, td, th, blockquote';

        // Debounced cache save
        this.saveCacheDebounced = this.debounce(() => {
            this.saveData(this.cache);
        }, 2000);

        // Register events
        this.registerEvent(this.app.workspace.on('active-leaf-change', () => {
            this.reinitialize();
        }));
        this.registerEvent(this.app.workspace.on('layout-change', () => {
            this.reinitialize();
        }));
        this.registerEvent(this.app.metadataCache.on('changed', (file) => {
            if (this.currentFile && file.path === this.currentFile.path) {
                this.reinitialize();
            }
        }));

        // Add settings tab
        this.addSettingTab(new AutoTranslateSettingTab(this.app, this));

        this.reinitialize();
    }

    onunload() {
        this.saveData(this.cache);
        this.cleanup();
        this.restoreAllOriginals();
    }

    async loadSettings() {
        this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    }

    async saveSettings() {
        await this.saveData(this.settings);
    }

    debounce(func, wait) {
        let timeout;
        return (...args) => {
            clearTimeout(timeout);
            timeout = setTimeout(() => func.apply(this, args), wait);
        };
    }

    cleanup() {
        if (this.observer) {
            this.observer.disconnect();
            this.observer = null;
        }
        if (this.mutationObserver) {
            this.mutationObserver.disconnect();
            this.mutationObserver = null;
        }
        this.translationCache.clear();
        this.originalContents.clear();
        this.visibleElements.clear();
        this.translationQueue = [];
        this.processing = false;
        this.currentView = null;
        this.currentFile = null;
    }

    restoreAllOriginals() {
        for (const [el, originalHTML] of this.originalContents) {
            if (el && el.isConnected) {
                el.innerHTML = originalHTML;
                el.removeAttribute('dir');
                delete el.dataset.translated;
            }
        }
        this.originalContents.clear();
    }

    shouldTranslate(file) {
        if (!file) return false;
        const frontmatter = this.app.metadataCache.getFileCache(file)?.frontmatter;
        if (!frontmatter) return false;
        const translateKey = Object.keys(frontmatter).find(key => key.toLowerCase() === 'translate');
        if (!translateKey) return false;
        const val = frontmatter[translateKey];
        return val === true || val === 'true';
    }

    async reinitialize() {
        this.cleanup();
        this.restoreAllOriginals();

        const activeFile = this.app.workspace.getActiveFile();
        if (!activeFile || !this.shouldTranslate(activeFile)) {
            return;
        }
        this.currentFile = activeFile;

        const activeView = this.app.workspace.getActiveViewOfType(require('obsidian').MarkdownView);
        if (!activeView || activeView.getMode() !== 'preview') return;

        this.currentView = activeView;
        const previewEl = activeView.contentEl.querySelector('.markdown-reading-view, .markdown-preview-view');
        if (!previewEl) return;

        this.observer = new IntersectionObserver(
            (entries) => this.handleIntersection(entries),
            { threshold: 0.1 }
        );

        this.mutationObserver = new MutationObserver((mutations) => {
            let shouldReObserve = false;
            for (const mut of mutations) {
                if (mut.type === 'childList') {
                    shouldReObserve = true;
                }
            }
            if (shouldReObserve) {
                this.observeTargets(previewEl);
            }
        });

        this.mutationObserver.observe(previewEl, { childList: true, subtree: true });
        this.observeTargets(previewEl);
    }

    observeTargets(container) {
        const elements = container.querySelectorAll(this.targetSelectors);
        for (const el of elements) {
            // Store original HTML if not already stored
            if (!this.originalContents.has(el)) {
                this.originalContents.set(el, el.innerHTML);
            }
            this.observer.observe(el);
        }
    }

    handleIntersection(entries) {
        for (const entry of entries) {
            const el = entry.target;
            if (entry.isIntersecting) {
                this.visibleElements.add(el);
                this.queueTranslation(el);
            } else {
                this.visibleElements.delete(el);
                this.restoreOriginal(el);
            }
        }
    }

    queueTranslation(el) {
        if (this.translationCache.has(el)) {
            this.applyTranslation(el, this.translationCache.get(el));
            return;
        }
        if (!this.translationQueue.includes(el)) {
            this.translationQueue.push(el);
        }
        this.processQueue();
    }

    async processQueue() {
        if (this.processing || this.translationQueue.length === 0) return;
        this.processing = true;

        const el = this.translationQueue.shift();
        if (!this.visibleElements.has(el)) {
            this.processing = false;
            this.processQueue();
            return;
        }

        // Get the original HTML content
        const originalHTML = this.originalContents.get(el);
        if (!originalHTML) {
            this.processing = false;
            this.processQueue();
            return;
        }

        try {
            // Extract text content while preserving structure
            const textContent = this.extractTextWithStructure(originalHTML);
            const translatedStructure = await this.translateStructure(textContent);
            
            // Rebuild HTML with translated text
            const translatedHTML = this.rebuildHTML(originalHTML, translatedStructure);
            
            this.translationCache.set(el, translatedHTML);
            if (this.visibleElements.has(el)) {
                this.applyTranslation(el, translatedHTML);
            }
        } catch (err) {
            console.error('Translation failed for element:', el, err);
        } finally {
            this.processing = false;
            setTimeout(() => this.processQueue(), 300);
        }
    }

    extractTextWithStructure(html) {
        // Create a temporary div to parse the HTML
        const div = document.createElement('div');
        div.innerHTML = html;
        
        // Extract text nodes with their paths
        const textNodes = [];
        const walker = document.createTreeWalker(div, NodeFilter.SHOW_TEXT, null, false);
        
        while (walker.nextNode()) {
            const node = walker.currentNode;
            if (node.textContent.trim()) {
                // Build a path to this node (simplified - just store parent info)
                const parent = node.parentNode;
                textNodes.push({
                    text: node.textContent,
                    parentTag: parent.tagName,
                    parentClasses: parent.className,
                    isBold: parent.tagName === 'STRONG' || parent.tagName === 'B',
                    isItalic: parent.tagName === 'EM' || parent.tagName === 'I',
                    isCode: parent.tagName === 'CODE',
                    isLink: parent.tagName === 'A'
                });
            }
        }
        
        return textNodes;
    }

    async translateStructure(textNodes) {
        // Combine all text for translation
        const fullText = textNodes.map(node => node.text).join(' \n ');
        
        // Translate the full text
        const translatedFullText = await this.applyRulesAndTranslate(fullText);
        
        // Split back into segments (simplified - assumes similar structure)
        // In reality, you'd want more sophisticated text segmentation
        const segments = translatedFullText.split(' \n ');
        
        // Map back to original structure
        return textNodes.map((node, index) => ({
            ...node,
            translatedText: segments[index] || node.text
        }));
    }

    rebuildHTML(originalHTML, translatedStructure) {
        const div = document.createElement('div');
        div.innerHTML = originalHTML;
        
        // Replace text nodes with translated versions
        let nodeIndex = 0;
        const walker = document.createTreeWalker(div, NodeFilter.SHOW_TEXT, null, false);
        
        while (walker.nextNode()) {
            const node = walker.currentNode;
            if (node.textContent.trim() && nodeIndex < translatedStructure.length) {
                node.textContent = translatedStructure[nodeIndex].translatedText;
                nodeIndex++;
            }
        }
        
        return div.innerHTML;
    }

    async applyRulesAndTranslate(originalText) {
        const dntTerms = [...this.settings.doNotTranslate].sort((a, b) => b.length - a.length);
        const mtPairs = [...this.settings.manualTranslations].sort((a, b) => b.from.length - a.from.length);

        const placeholders = new Map();
        let placeholderCounter = 0;

        function getPlaceholder() {
            return `__OBSD_TR_${placeholderCounter++}__`;
        }

        let textWithPlaceholders = originalText;

        // Apply manual translations first
        for (const { from, to } of mtPairs) {
            const escaped = from.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const regex = new RegExp(escaped, 'g');
            textWithPlaceholders = textWithPlaceholders.replace(regex, (match) => {
                const placeholder = getPlaceholder();
                placeholders.set(placeholder, { type: 'mt', original: match, replacement: to });
                return placeholder;
            });
        }

        // Apply do-not-translate terms
        for (const term of dntTerms) {
            const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const regex = new RegExp(escaped, 'g');
            textWithPlaceholders = textWithPlaceholders.replace(regex, (match) => {
                const placeholder = getPlaceholder();
                placeholders.set(placeholder, { type: 'dnt', original: match, replacement: match });
                return placeholder;
            });
        }

        // Translate the text with placeholders
        const translatedWithPlaceholders = await this.getTranslation(textWithPlaceholders);

        // Restore placeholders
        let finalText = translatedWithPlaceholders;
        for (const [placeholder, info] of placeholders) {
            finalText = finalText.replace(new RegExp(placeholder, 'g'), info.replacement);
        }

        return finalText;
    }

    async getTranslation(text) {
        if (this.cache[text]) {
            return this.cache[text];
        }

        if (this.pendingTranslations.has(text)) {
            return this.pendingTranslations.get(text);
        }

        const promise = this.translateText(text)
            .then(translated => {
                if (translated && translated.trim() !== '') {
                    this.cache[text] = translated;
                    this.saveCacheDebounced();
                } else {
                    console.warn(`Translation returned empty for: "${text}"`);
                }
                this.pendingTranslations.delete(text);
                return translated || text;
            })
            .catch(err => {
                console.error(`Translation error for "${text}":`, err);
                this.pendingTranslations.delete(text);
                throw err;
            });

        this.pendingTranslations.set(text, promise);
        return promise;
    }

    applyTranslation(el, translatedHTML) {
        if (!el || !el.isConnected) return;
        
        // Store original HTML if not already stored
        if (!this.originalContents.has(el)) {
            this.originalContents.set(el, el.innerHTML);
        }
        
        // Apply translated HTML
        el.innerHTML = translatedHTML;
        el.dataset.translated = 'true';
        el.setAttribute('dir', 'rtl');
    }

    restoreOriginal(el) {
        if (!el || !el.isConnected) return;
        
        const originalHTML = this.originalContents.get(el);
        if (originalHTML) {
            el.innerHTML = originalHTML;
            delete el.dataset.translated;
        }
        el.removeAttribute('dir');
    }

    async translateText(text, targetLang = 'ar') {
        const url = 'https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=' 
            + targetLang + '&dt=t&q=' + encodeURIComponent(text);

        try {
            const response = await fetch(url);
            if (!response.ok) {
                throw new Error(`HTTP error ${response.status}`);
            }
            const data = await response.json();
            if (!data || !Array.isArray(data) || !data[0]) {
                throw new Error('Unexpected API response format');
            }
            return data[0].map(item => item[0]).join('');
        } catch (error) {
            console.error('translateText fetch failed:', error);
            throw error;
        }
    }
};

// ==================== Settings Tab (unchanged) ====================
class AutoTranslateSettingTab extends PluginSettingTab {
    constructor(app, plugin) {
        super(app, plugin);
        this.plugin = plugin;
    }

    display() {
        const { containerEl } = this;
        containerEl.empty();

        containerEl.createEl('h2', { text: 'Auto Translate Settings' });

        // Do Not Translate section
        containerEl.createEl('h3', { text: 'Do Not Translate' });
        containerEl.createEl('p', { text: 'Words or phrases that should remain in English (case‑sensitive).' });

        const dntContainer = containerEl.createDiv();
        this.renderDntList(dntContainer);

        const addDntDiv = containerEl.createDiv({ cls: 'setting-item' });
        new Setting(addDntDiv)
            .setName('Add new term')
            .setDesc('Enter a word or phrase to preserve in English')
            .addText(text => text.setPlaceholder('e.g., Obsidian').onChange(async (value) => {
                if (value && !this.plugin.settings.doNotTranslate.includes(value)) {
                    this.plugin.settings.doNotTranslate.push(value);
                    await this.plugin.saveSettings();
                    this.display();
                }
            }));

        // Manual Translations section
        containerEl.createEl('h3', { text: 'Manual Translations' });
        containerEl.createEl('p', { text: 'Override automatic translation for specific words/phrases.' });

        const mtContainer = containerEl.createDiv();
        this.renderMtList(mtContainer);

        const addMtDiv = containerEl.createDiv({ cls: 'setting-item' });
        let fromInput, toInput;
        new Setting(addMtDiv)
            .setName('Add new translation')
            .setDesc('Source phrase and desired Arabic translation')
            .addText(text => text.setPlaceholder('English').onChange(v => fromInput = v))
            .addText(text => text.setPlaceholder('العربية').onChange(v => toInput = v))
            .addButton(btn => btn.setButtonText('Add').onClick(async () => {
                if (fromInput && toInput) {
                    this.plugin.settings.manualTranslations.push({ from: fromInput, to: toInput });
                    await this.plugin.saveSettings();
                    this.display();
                }
            }));
    }

    renderDntList(container) {
        const list = container.createEl('ul');
        for (const term of this.plugin.settings.doNotTranslate) {
            const item = list.createEl('li', { text: term });
            item.style.marginBottom = '5px';
            new Setting(item)
                .setClass('mod-no-header')
                .addButton(btn => btn.setIcon('trash').setTooltip('Remove').onClick(async () => {
                    const idx = this.plugin.settings.doNotTranslate.indexOf(term);
                    if (idx !== -1) {
                        this.plugin.settings.doNotTranslate.splice(idx, 1);
                        await this.plugin.saveSettings();
                        this.display();
                    }
                }));
        }
    }

    renderMtList(container) {
        const list = container.createEl('ul');
        for (const pair of this.plugin.settings.manualTranslations) {
            const item = list.createEl('li', { text: `${pair.from} → ${pair.to}` });
            item.style.marginBottom = '5px';
            new Setting(item)
                .setClass('mod-no-header')
                .addButton(btn => btn.setIcon('pencil').setTooltip('Edit').onClick(async () => {
                    const newFrom = await this.prompt('Edit English phrase', pair.from);
                    if (newFrom === null) return;
                    const newTo = await this.prompt('Edit Arabic translation', pair.to);
                    if (newTo === null) return;
                    pair.from = newFrom;
                    pair.to = newTo;
                    await this.plugin.saveSettings();
                    this.display();
                }))
                .addButton(btn => btn.setIcon('trash').setTooltip('Remove').onClick(async () => {
                    const idx = this.plugin.settings.manualTranslations.indexOf(pair);
                    if (idx !== -1) {
                        this.plugin.settings.manualTranslations.splice(idx, 1);
                        await this.plugin.saveSettings();
                        this.display();
                    }
                }));
        }
    }

    async prompt(question, defaultValue = '') {
        const { Modal, Setting } = require('obsidian');
        return new Promise((resolve) => {
            const modal = new Modal(this.app);
            let inputValue = defaultValue;
            modal.titleEl.setText(question);
            new Setting(modal.contentEl)
                .addText(text => text.setValue(defaultValue).onChange(v => inputValue = v))
                .addButton(btn => btn.setButtonText('OK').onClick(() => {
                    modal.close();
                    resolve(inputValue);
                }))
                .addButton(btn => btn.setButtonText('Cancel').onClick(() => {
                    modal.close();
                    resolve(null);
                }));
            modal.open();
        });
    }
}