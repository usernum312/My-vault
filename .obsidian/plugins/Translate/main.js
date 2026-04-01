const { Plugin, PluginSettingTab, Setting } = require('obsidian');

const DEFAULT_SETTINGS = {
    doNotTranslate: [],
    manualTranslations: [],
    preloadDistance: 500,
    translationDelay: 100,
    targetLanguage: 'ar',
    translationService: 'google',
    geminiApiKey: '',
    geminiModel: 'gemini-2.5-flash',
    customApiUrl: '',
    customApiHeaders: '{}',
    customApiBodyTemplate: '{"text": "{{text}}", "target_lang": "{{targetLang}}"}',
    customApiResponsePath: 'translated_text',
    maxChunkSize: 1000
};

module.exports = class AutoTranslatePlugin extends Plugin {
    async onload() {
        await this.loadSettings();

        this.cache = (await this.loadData()) || {};
        this.pendingTranslations = new Map();

        this.currentView = null;
        this.currentFile = null;
        this.observer = null;
        this.mutationObserver = null;
        this.translationCache = new Map();
        this.visibleElements = new Set();
        this.nearbyElements = new Set();
        this.translationQueue = [];
        this.processing = false;
        this.originalContents = new Map();

        this.targetSelectors = 'p, h1, h2, h3, h4, h5, h6, li, td, th, blockquote';

        this.saveCacheDebounced = this.debounce(() => {
            this.saveData(this.cache);
        }, 2000);

        this.scrollHandler = this.debounce(() => {
            this.preloadNearbyElements();
        }, 150);

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

        this.addSettingTab(new AutoTranslateSettingTab(this.app, this));

        this.reinitialize();
    }

    onunload() {
        this.saveData(this.cache);
        this.cleanup();
        this.restoreAllOriginals();
    }

    async loadSettings() {
        const loadedData = await this.loadData();
        this.settings = Object.assign({}, DEFAULT_SETTINGS, loadedData);
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
        if (this.currentView?.contentEl) {
            this.currentView.contentEl.removeEventListener('scroll', this.scrollHandler);
        }
        this.translationCache.clear();
        this.originalContents.clear();
        this.visibleElements.clear();
        this.nearbyElements.clear();
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

        previewEl.addEventListener('scroll', this.scrollHandler);
        this.registerEvent({ 
            unload: () => previewEl.removeEventListener('scroll', this.scrollHandler) 
        });

        this.observer = new IntersectionObserver(
            (entries) => this.handleIntersection(entries),
            { threshold: 0.01, rootMargin: `${this.settings.preloadDistance}px` }
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
        
        setTimeout(() => this.preloadNearbyElements(), 100);
    }

    observeTargets(container) {
        const elements = container.querySelectorAll(this.targetSelectors);
        for (const el of elements) {
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
                this.nearbyElements.delete(el);
                this.queueTranslation(el);
            } else {
                this.visibleElements.delete(el);
                
                const rect = entry.boundingClientRect;
                if (Math.abs(rect.top) < this.settings.preloadDistance) {
                    this.nearbyElements.add(el);
                    this.queueTranslation(el);
                } else {
                    this.nearbyElements.delete(el);
                    this.restoreOriginal(el);
                }
            }
        }
    }

    preloadNearbyElements() {
        const previewEl = this.currentView?.contentEl?.querySelector('.markdown-reading-view, .markdown-preview-view');
        if (!previewEl) return;
        
        const scrollTop = previewEl.scrollTop;
        const viewportHeight = previewEl.clientHeight;
        const allElements = Array.from(previewEl.querySelectorAll(this.targetSelectors));
        
        for (const el of allElements) {
            if (this.visibleElements.has(el) || this.translationQueue.includes(el) || this.translationCache.has(el)) {
                continue;
            }
            
            const rect = el.getBoundingClientRect();
            const elementTop = rect.top + scrollTop;
            const elementBottom = elementTop + rect.height;
            
            const isAbove = elementBottom < scrollTop && elementBottom > scrollTop - this.settings.preloadDistance;
            const isBelow = elementTop > scrollTop + viewportHeight && elementTop < scrollTop + viewportHeight + this.settings.preloadDistance;
            
            if (isAbove || isBelow) {
                this.nearbyElements.add(el);
                this.queueTranslation(el);
            }
        }
    }

    queueTranslation(el) {
        if (this.translationCache.has(el)) {
            if (this.visibleElements.has(el)) {
                this.applyTranslation(el, this.translationCache.get(el));
            }
            return;
        }
        
        if (this.translationQueue.includes(el)) {
            return;
        }
        
        this.translationQueue.push(el);
        
        if (!this.processing) {
            this.processQueue();
        }
    }

    async processQueue() {
        if (this.processing) return;
        if (this.translationQueue.length === 0) return;
        
        this.processing = true;
        
        while (this.translationQueue.length > 0) {
            const el = this.translationQueue.shift();
            
            if (!this.visibleElements.has(el) && !this.nearbyElements.has(el)) {
                continue;
            }
            
            if (this.translationCache.has(el)) {
                if (this.visibleElements.has(el)) {
                    this.applyTranslation(el, this.translationCache.get(el));
                }
                continue;
            }
            
            try {
                const translatedHTML = await this.translateElement(el);
                this.translationCache.set(el, translatedHTML);
                
                if (this.visibleElements.has(el) && el.isConnected) {
                    this.applyTranslation(el, translatedHTML);
                }
            } catch (err) {
                console.error('Translation failed:', err);
            }
            
            if (this.translationQueue.length > 0) {
                await this.sleep(this.settings.translationDelay);
            }
        }
        
        this.processing = false;
    }

    async translateElement(el) {
        const originalHTML = this.originalContents.get(el);
        if (!originalHTML) return '';
        
        try {
            const textNodes = this.extractTextWithStructure(originalHTML);
            const translatedTexts = await this.translateTextNodes(textNodes);
            const translatedHTML = this.rebuildHTML(originalHTML, textNodes, translatedTexts);
            return translatedHTML;
        } catch (err) {
            console.error('Translation error:', err);
            return originalHTML;
        }
    }

    extractTextWithStructure(html) {
        const div = document.createElement('div');
        div.innerHTML = html;
        
        const textNodes = [];
        const walker = document.createTreeWalker(div, NodeFilter.SHOW_TEXT, null, false);
        
        while (walker.nextNode()) {
            const node = walker.currentNode;
            const text = node.textContent;
            if (text && text.trim()) {
                textNodes.push({
                    text: text,
                    node: node,
                    parentTag: node.parentNode?.tagName,
                    parentClasses: node.parentNode?.className,
                    isBold: node.parentNode?.tagName === 'STRONG' || node.parentNode?.tagName === 'B',
                    isItalic: node.parentNode?.tagName === 'EM' || node.parentNode?.tagName === 'I',
                    isCode: node.parentNode?.tagName === 'CODE',
                    isLink: node.parentNode?.tagName === 'A'
                });
            }
        }
        
        return textNodes;
    }

    async translateTextNodes(textNodes) {
        if (!textNodes.length) return [];
        
        const translatedTexts = [];
        
        for (let i = 0; i < textNodes.length; i++) {
            const node = textNodes[i];
            const translatedText = await this.applyRulesAndTranslate(node.text);
            translatedTexts.push(translatedText);
            
            if (i < textNodes.length - 1) {
                await this.sleep(50);
            }
        }
        
        return translatedTexts;
    }

    async translateLongText(text) {
        const maxLength = this.settings.maxChunkSize;
        
        if (text.length <= maxLength) {
            return await this.applyRulesAndTranslate(text);
        }
        
        const chunks = this.splitTextIntoChunks(text, maxLength);
        const translatedChunks = [];
        
        for (let i = 0; i < chunks.length; i++) {
            const chunk = chunks[i];
            const translatedChunk = await this.applyRulesAndTranslate(chunk);
            translatedChunks.push(translatedChunk);
            
            if (i < chunks.length - 1) {
                await this.sleep(50);
            }
        }
        
        return translatedChunks.join('');
    }

    splitTextIntoChunks(text, maxLength) {
        const chunks = [];
        let currentChunk = '';
        const sentences = this.splitIntoSentences(text);
        
        for (const sentence of sentences) {
            if ((currentChunk + sentence).length <= maxLength) {
                currentChunk += sentence;
            } else {
                if (currentChunk) {
                    chunks.push(currentChunk);
                }
                
                if (sentence.length > maxLength) {
                    const subChunks = this.splitLongSentence(sentence, maxLength);
                    chunks.push(...subChunks);
                    currentChunk = '';
                } else {
                    currentChunk = sentence;
                }
            }
        }
        
        if (currentChunk) {
            chunks.push(currentChunk);
        }
        
        return chunks;
    }

    splitIntoSentences(text) {
        const sentenceEndings = /[.!?。！？]+/g;
        const parts = [];
        let lastIndex = 0;
        let match;
        
        while ((match = sentenceEndings.exec(text)) !== null) {
            const endIndex = match.index + match[0].length;
            const sentence = text.substring(lastIndex, endIndex);
            if (sentence.trim()) {
                parts.push(sentence);
            }
            lastIndex = endIndex;
        }
        
        if (lastIndex < text.length) {
            const remaining = text.substring(lastIndex);
            if (remaining.trim()) {
                parts.push(remaining);
            }
        }
        
        return parts.length > 0 ? parts : [text];
    }

    splitLongSentence(sentence, maxLength) {
        const chunks = [];
        let remaining = sentence;
        
        while (remaining.length > maxLength) {
            let splitPoint = maxLength;
            
            for (let i = maxLength; i > Math.max(0, maxLength - 100); i--) {
                const char = remaining[i];
                if (char === ' ' || char === ',' || char === '，') {
                    splitPoint = i + 1;
                    break;
                }
            }
            
            const chunk = remaining.substring(0, splitPoint);
            chunks.push(chunk);
            remaining = remaining.substring(splitPoint);
        }
        
        if (remaining) {
            chunks.push(remaining);
        }
        
        return chunks;
    }

    rebuildHTML(originalHTML, textNodes, translatedTexts) {
        const div = document.createElement('div');
        div.innerHTML = originalHTML;
        
        let nodeIndex = 0;
        const walker = document.createTreeWalker(div, NodeFilter.SHOW_TEXT, null, false);
        
        while (walker.nextNode()) {
            const node = walker.currentNode;
            if (node.textContent && node.textContent.trim() && nodeIndex < translatedTexts.length) {
                node.textContent = translatedTexts[nodeIndex];
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

        for (const { from, to } of mtPairs) {
            const escaped = from.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const regex = new RegExp(escaped, 'g');
            textWithPlaceholders = textWithPlaceholders.replace(regex, (match) => {
                const placeholder = getPlaceholder();
                placeholders.set(placeholder, { type: 'mt', original: match, replacement: to });
                return placeholder;
            });
        }

        for (const term of dntTerms) {
            const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const regex = new RegExp(escaped, 'g');
            textWithPlaceholders = textWithPlaceholders.replace(regex, (match) => {
                const placeholder = getPlaceholder();
                placeholders.set(placeholder, { type: 'dnt', original: match, replacement: match });
                return placeholder;
            });
        }

        let translatedWithPlaceholders;
        
        if (textWithPlaceholders.length > this.settings.maxChunkSize) {
            translatedWithPlaceholders = await this.translateLongText(textWithPlaceholders);
        } else {
            translatedWithPlaceholders = await this.getTranslation(textWithPlaceholders);
        }

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
                    return text;
                }
                this.pendingTranslations.delete(text);
                return translated;
            })
            .catch(err => {
                console.error(`Translation error:`, err);
                this.pendingTranslations.delete(text);
                return text;
            });

        this.pendingTranslations.set(text, promise);
        return promise;
    }

    async translateText(text) {
        switch (this.settings.translationService) {
            case 'google':
                return this.translateWithGoogle(text);
            case 'gemini':
                return this.translateWithGemini(text);
            case 'custom':
                return this.translateWithCustomAPI(text);
            default:
                return this.translateWithGoogle(text);
        }
    }

    async translateWithGoogle(text) {
        const url = 'https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=' 
            + this.settings.targetLanguage + '&dt=t&q=' + encodeURIComponent(text);

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
            console.error('Google Translate fetch failed:', error);
            throw error;
        }
    }

    async translateWithGemini(text) {
        if (!this.settings.geminiApiKey) {
            throw new Error('Gemini API key not configured');
        }

        const modelName = this.settings.geminiModel || 'gemini-2.5-flash';
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${this.settings.geminiApiKey}`;
        
        const targetLangName = this.getLanguageName(this.settings.targetLanguage);
        const prompt = `Translate the following text to ${targetLangName}. Return ONLY the translated text, nothing else, no explanations, no quotes.\n\nText: ${text}\n\nTranslation:`;
        
        const body = {
            contents: [{
                parts: [{
                    text: prompt
                }]
            }],
            generationConfig: {
                temperature: 0.3,
                maxOutputTokens: 2048,
                topP: 0.8,
                topK: 40
            }
        };

        try {
            const response = await fetch(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(body)
            });

            if (!response.ok) {
                const errorText = await response.text();
                console.error('Gemini API error:', response.status, errorText);
                
                if (response.status === 403 || response.status === 401) {
                    throw new Error('Invalid Gemini API key. Please check your API key in settings.');
                } else if (response.status === 429) {
                    throw new Error('Rate limit exceeded. Please wait a moment and try again.');
                } else {
                    throw new Error(`Gemini API error: ${response.status} - ${errorText}`);
                }
            }

            const data = await response.json();
            
            const translatedText = data.candidates?.[0]?.content?.parts?.[0]?.text;
            
            if (!translatedText) {
                console.error('Unexpected Gemini API response:', data);
                throw new Error('Unexpected response format from Gemini API');
            }
            
            let cleanedText = translatedText.trim();
            cleanedText = cleanedText.replace(/^["']|["']$/g, '');
            
            return cleanedText;
        } catch (error) {
            console.error('Gemini translation failed:', error);
            throw error;
        }
    }

    async translateWithCustomAPI(text) {
        if (!this.settings.customApiUrl) {
            throw new Error('Custom API URL not configured');
        }

        try {
            let headers = {};
            try {
                headers = JSON.parse(this.settings.customApiHeaders);
            } catch (e) {
                console.warn('Failed to parse custom API headers, using empty headers');
            }

            let bodyString = this.settings.customApiBodyTemplate;
            bodyString = bodyString.replace(/\{\{text\}\}/g, text);
            bodyString = bodyString.replace(/\{\{targetLang\}\}/g, this.settings.targetLanguage);
            
            let body;
            try {
                body = JSON.parse(bodyString);
            } catch (e) {
                body = bodyString;
            }

            const response = await fetch(this.settings.customApiUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...headers
                },
                body: JSON.stringify(body)
            });

            if (!response.ok) {
                throw new Error(`Custom API error: ${response.status}`);
            }

            const data = await response.json();
            
            const path = this.settings.customApiResponsePath.split('.');
            let result = data;
            for (const key of path) {
                if (result && typeof result === 'object') {
                    result = result[key];
                } else {
                    throw new Error(`Invalid response path: ${this.settings.customApiResponsePath}`);
                }
            }
            
            if (!result || typeof result !== 'string') {
                throw new Error('Could not extract translation from API response');
            }
            
            return result;
        } catch (error) {
            console.error('Custom API translation failed:', error);
            throw error;
        }
    }

    getLanguageName(langCode) {
        const languages = {
            'ar': 'Arabic',
            'en': 'English',
            'fr': 'French',
            'es': 'Spanish',
            'de': 'German',
            'ja': 'Japanese',
            'ko': 'Korean',
            'zh': 'Chinese',
            'ru': 'Russian',
            'pt': 'Portuguese',
            'it': 'Italian',
            'nl': 'Dutch',
            'tr': 'Turkish'
        };
        return languages[langCode] || langCode;
    }

    applyTranslation(el, translatedHTML) {
        if (!el || !el.isConnected) return;
        
        if (!this.originalContents.has(el)) {
            this.originalContents.set(el, el.innerHTML);
        }
        
        el.innerHTML = translatedHTML;
        el.dataset.translated = 'true';
        if (this.settings.targetLanguage === 'ar') {
            el.setAttribute('dir', 'rtl');
        } else {
            el.removeAttribute('dir');
        }
    }

    restoreOriginal(el) {
        if (!el || !el.isConnected) return;
        
        const originalHTML = this.originalContents.get(el);
        if (originalHTML && el.dataset.translated === 'true') {
            el.innerHTML = originalHTML;
            delete el.dataset.translated;
            el.removeAttribute('dir');
        }
    }
    
    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
};

class AutoTranslateSettingTab extends PluginSettingTab {
    constructor(app, plugin) {
        super(app, plugin);
        this.plugin = plugin;
    }

    display() {
        const { containerEl } = this;
        containerEl.empty();

        containerEl.createEl('h2', { text: 'Auto Translate Settings' });

        containerEl.createEl('h3', { text: 'Language Settings' });
        
        new Setting(containerEl)
            .setName('Target Language')
            .setDesc('Language to translate content into')
            .addDropdown(dropdown => dropdown
                .addOption('ar', 'Arabic')
                .addOption('en', 'English')
                .addOption('fr', 'French')
                .addOption('es', 'Spanish')
                .addOption('de', 'German')
                .addOption('ja', 'Japanese')
                .addOption('ko', 'Korean')
                .addOption('zh', 'Chinese')
                .addOption('ru', 'Russian')
                .addOption('pt', 'Portuguese')
                .addOption('it', 'Italian')
                .addOption('nl', 'Dutch')
                .addOption('tr', 'Turkish')
                .setValue(this.plugin.settings.targetLanguage)
                .onChange(async (value) => {
                    this.plugin.settings.targetLanguage = value;
                    await this.plugin.saveSettings();
                }));
        
        containerEl.createEl('h4', { text: 'Translation Service' });
        
        new Setting(containerEl)
            .setName('Translation Service')
            .setDesc('Choose which translation service to use')
            .addDropdown(dropdown => dropdown
                .addOption('google', 'Google Translate')
                .addOption('gemini', 'Gemini AI')
                .addOption('custom', 'Custom API')
                .setValue(this.plugin.settings.translationService)
                .onChange(async (value) => {
                    this.plugin.settings.translationService = value;
                    await this.plugin.saveSettings();
                    this.display();
                }));

        if (this.plugin.settings.translationService === 'gemini') {
            containerEl.createEl('h5', { text: 'Gemini AI Settings' });
            
            new Setting(containerEl)
                .setName('Gemini API Key')
                .setDesc('Enter your Google AI Studio API key')
                .addText(text => text
                    .setPlaceholder('Enter API key')
                    .setValue(this.plugin.settings.geminiApiKey)
                    .onChange(async (value) => {
                        this.plugin.settings.geminiApiKey = value;
                        await this.plugin.saveSettings();
                    }));
            
            new Setting(containerEl)
                .setName('Model')
                .setDesc('Gemini model to use')
                .addDropdown(dropdown => dropdown
                    .addOption('gemini-2.5-flash', 'Gemini 2.5 Flash')
                    .setValue(this.plugin.settings.geminiModel)
                    .onChange(async (value) => {
                        this.plugin.settings.geminiModel = value;
                        await this.plugin.saveSettings();
                    }));
            
            const testSection = containerEl.createDiv();
            new Setting(testSection)
                .setName('Test Gemini Connection')
                .setDesc('Test if your Gemini API key is working')
                .addButton(btn => btn
                    .setButtonText('Test Connection')
                    .onClick(async () => {
                        btn.setButtonText('Testing...');
                        btn.setDisabled(true);
                        
                        try {
                            const testText = 'Hello, this is a test.';
                            const result = await this.plugin.translateWithGemini(testText);
                            const Notice = require('obsidian').Notice;
                            new Notice(`✓ Gemini works! Test translation: "${result.substring(0, 100)}"`);
                        } catch (error) {
                            const Notice = require('obsidian').Notice;
                            new Notice(`⨉ Gemini error: ${error.message}`);
                        } finally {
                            btn.setButtonText('Test Connection');
                            btn.setDisabled(false);
                        }
                    }));
        }

        if (this.plugin.settings.translationService === 'custom') {
            containerEl.createEl('h5', { text: 'Custom API Settings' });
            
            new Setting(containerEl)
                .setName('API URL')
                .setDesc('URL of your custom translation API')
                .addText(text => text
                    .setPlaceholder('https://api.example.com/translate')
                    .setValue(this.plugin.settings.customApiUrl)
                    .onChange(async (value) => {
                        this.plugin.settings.customApiUrl = value;
                        await this.plugin.saveSettings();
                    }));
            
            new Setting(containerEl)
                .setName('Headers (JSON)')
                .setDesc('Custom headers as JSON object')
                .addTextArea(text => text
                    .setPlaceholder('{"Authorization": "Bearer token"}')
                    .setValue(this.plugin.settings.customApiHeaders)
                    .onChange(async (value) => {
                        this.plugin.settings.customApiHeaders = value;
                        await this.plugin.saveSettings();
                    }));
            
            new Setting(containerEl)
                .setName('Body Template')
                .setDesc('Template for request body. Use {{text}} and {{targetLang}}')
                .addTextArea(text => text
                    .setPlaceholder('{"text": "{{text}}", "lang": "{{targetLang}}"}')
                    .setValue(this.plugin.settings.customApiBodyTemplate)
                    .onChange(async (value) => {
                        this.plugin.settings.customApiBodyTemplate = value;
                        await this.plugin.saveSettings();
                    }));
            
            new Setting(containerEl)
                .setName('Response Path')
                .setDesc('JSON path to extract translation (e.g., "data.translated_text")')
                .addText(text => text
                    .setPlaceholder('translated_text')
                    .setValue(this.plugin.settings.customApiResponsePath)
                    .onChange(async (value) => {
                        this.plugin.settings.customApiResponsePath = value;
                        await this.plugin.saveSettings();
                    }));
        }

        containerEl.createEl('h3', { text: 'Do Not Translate' });

        const dntContainer = containerEl.createDiv();
        this.renderDntList(dntContainer);

        const addDntDiv = containerEl.createDiv({ cls: 'setting-item' });
        new Setting(addDntDiv)
            .setName('Add new term')
            .setDesc('Enter a word or phrase to preserve in original language')
            .addText(text => text.setPlaceholder('e.g., Obsidian').onChange(async (value) => {
                if (value && !this.plugin.settings.doNotTranslate.includes(value)) {
                    this.plugin.settings.doNotTranslate.push(value);
                    await this.plugin.saveSettings();
                    this.display();
                }
            }));

        containerEl.createEl('h3', { text: 'Manual Translations' });

        const mtContainer = containerEl.createDiv();
        this.renderMtList(mtContainer);

        const addMtDiv = containerEl.createDiv({ cls: 'setting-item' });
        let fromInput, toInput;
        new Setting(addMtDiv)
            .setName('Add new translation')
            .setDesc('Source phrase and desired translation')
            .addText(text => text.setPlaceholder('English').onChange(v => fromInput = v))
            .addText(text => text.setPlaceholder('Translation').onChange(v => toInput = v))
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
                    const newFrom = await this.prompt('Edit source phrase', pair.from);
                    if (newFrom === null) return;
                    const newTo = await this.prompt('Edit translation', pair.to);
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