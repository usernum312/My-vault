const { Plugin, PluginSettingTab, Setting, MarkdownView, Notice, Modal, normalizePath } = require('obsidian');

const DEFAULT_SETTINGS = {
    doNotTranslate: [],
    manualTranslations: [],
    preloadDistance: 500,
    translationDelay: 100,
    targetLanguage: 'ar',
    sourceLanguage: 'auto',               // new: force source language
    translationService: 'google',
    geminiApiKey: '',
    geminiModel: 'gemini-2.5-flash',
    customApiUrl: '',
    customApiHeaders: '{}',
    customApiBodyTemplate: '{"text": "{{text}}", "target_lang": "{{targetLang}}"}',
    customApiResponsePath: 'translated_text',
    maxChunkSize: 1000
};

// ---------- Helpers ----------
function escapeRegExp(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// ---------- Plugin ----------
module.exports = class AutoTranslatePlugin extends Plugin {
    async onload() {
        await this.loadSettings();
        this.cache = await this.loadCache();

        this.pendingTranslations = new Map();
        this.currentView = null;
        this.currentFile = null;
        this.observer = null;
        this.mutationObserver = null;
        this.translationCache = new Map();
        this.originalContents = new Map();
        this.visibleElements = new Set();
        this.nearbyElements = new Set();
        this.translationQueue = [];
        this.processing = false;
        this.activeTimeouts = new Set();

        this.targetSelectors = 'p, h1, h2, h3, h4, h5, h6, li, td, th, blockquote';

        this.saveCacheDebounced = this.debounce(async () => {
            await this.saveCache(this.cache);
        }, 2000);

        this.scrollHandler = this.debounce(() => {
            this.preloadNearbyElements();
        }, 150);

        this.registerEvent(this.app.workspace.on('active-leaf-change', () => this.reinitialize()));
        this.registerEvent(this.app.workspace.on('layout-change', () => this.reinitialize()));
        this.registerEvent(this.app.metadataCache.on('changed', (file) => {
            if (this.currentFile && file.path === this.currentFile.path) {
                this.reinitialize();
            }
        }));

        this.addSettingTab(new AutoTranslateSettingTab(this.app, this));

        this.reinitialize();
    }

    async onunload() {
        await this.saveCache(this.cache);
        this.cleanup();
        this.restoreAllOriginals();
        this.clearAllTimeouts();
    }

    async loadSettings() {
        const loadedData = await this.loadData();
        this.settings = Object.assign({}, DEFAULT_SETTINGS, loadedData);
    }

    async saveSettings() {
        await this.saveData(this.settings);
        // Clear cache when service/language changes to avoid stale translations
        this.cache = {};
        await this.saveCache(this.cache);
    }

    // ---------- Separate cache file ----------
    getCacheFilePath() {
        return normalizePath(this.app.vault.configDir + '/plugins/Translate/cache.json');
    }

    async loadCache() {
        try {
            const raw = await this.app.vault.adapter.read(this.getCacheFilePath());
            return JSON.parse(raw);
        } catch {
            return {};
        }
    }

    async saveCache(data) {
        try {
            await this.app.vault.adapter.write(this.getCacheFilePath(), JSON.stringify(data, null, 2));
        } catch (e) {
            console.error('Failed to save translation cache:', e);
        }
    }

    // ---------- Timeout management ----------
    setSafeTimeout(fn, ms) {
        const id = setTimeout(() => {
            this.activeTimeouts.delete(id);
            fn();
        }, ms);
        this.activeTimeouts.add(id);
        return id;
    }

    clearAllTimeouts() {
        for (const id of this.activeTimeouts) clearTimeout(id);
        this.activeTimeouts.clear();
    }

    debounce(func, wait) {
        let timeoutId;
        return (...args) => {
            if (timeoutId) {
                clearTimeout(timeoutId);
                this.activeTimeouts.delete(timeoutId);
            }
            timeoutId = this.setSafeTimeout(() => func.apply(this, args), wait);
        };
    }

    // ---------- Cleanup & reset ----------
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
        this.clearAllTimeouts();
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
        if (!activeFile || !this.shouldTranslate(activeFile)) return;
        this.currentFile = activeFile;

        const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
        if (!activeView || activeView.getMode() !== 'preview') return;

        this.currentView = activeView;
        const previewEl = activeView.contentEl.querySelector('.markdown-reading-view, .markdown-preview-view');
        if (!previewEl) return;

        previewEl.addEventListener('scroll', this.scrollHandler);
        this.registerEvent({ unload: () => previewEl.removeEventListener('scroll', this.scrollHandler) });

        this.observer = new IntersectionObserver(
            (entries) => this.handleIntersection(entries),
            { root: previewEl, threshold: 0.01, rootMargin: `${this.settings.preloadDistance}px` }
        );

        this.mutationObserver = new MutationObserver((mutations) => {
            for (const mut of mutations) {
                if (mut.type === 'childList') {
                    this.observeTargets(previewEl);
                    break;
                }
            }
        });
        this.mutationObserver.observe(previewEl, { childList: true, subtree: true });

        this.observeTargets(previewEl);
        this.setSafeTimeout(() => this.preloadNearbyElements(), 100);
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

    // ---------- IntersectionObserver ----------
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

        const containerRect = previewEl.getBoundingClientRect();
        const scrollTop = previewEl.scrollTop;
        const viewportHeight = previewEl.clientHeight;

        const allElements = previewEl.querySelectorAll(this.targetSelectors);
        for (const el of allElements) {
            if (this.visibleElements.has(el) || this.translationQueue.includes(el) || this.translationCache.has(el)) continue;

            const elRect = el.getBoundingClientRect();
            const elTop = elRect.top - containerRect.top + scrollTop;
            const elBottom = elRect.bottom - containerRect.top + scrollTop;

            const isAbove = elBottom < scrollTop && elBottom > scrollTop - this.settings.preloadDistance;
            const isBelow = elTop > scrollTop + viewportHeight && elTop < scrollTop + viewportHeight + this.settings.preloadDistance;

            if (isAbove || isBelow) {
                this.nearbyElements.add(el);
                this.queueTranslation(el);
            }
        }
    }

    // ---------- Translation queue ----------
    queueTranslation(el) {
        if (this.translationCache.has(el)) {
            if (this.visibleElements.has(el)) this.applyTranslation(el, this.translationCache.get(el));
            return;
        }
        if (this.translationQueue.includes(el)) return;

        this.translationQueue.push(el);
        if (!this.processing) this.processQueue();
    }

    async processQueue() {
        if (this.processing) return;
        this.processing = true;

        while (this.translationQueue.length > 0) {
            const el = this.translationQueue.shift();

            if (!this.visibleElements.has(el) && !this.nearbyElements.has(el)) continue;

            if (this.translationCache.has(el)) {
                if (this.visibleElements.has(el)) this.applyTranslation(el, this.translationCache.get(el));
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
                await sleep(this.settings.translationDelay);
            }
        }
        this.processing = false;
    }

    // ---------- Core translation logic ----------
    async translateElement(el) {
        const originalHTML = this.originalContents.get(el);
        if (!originalHTML) return '';

        try {
            const textNodes = this.extractTextFromHTML(originalHTML);
            const translatedTexts = await this.translateTextNodes(textNodes);
            return this.rebuildHTML(originalHTML, textNodes, translatedTexts);
        } catch (err) {
            console.error('Translation error:', err);
            return originalHTML;
        }
    }

    extractTextFromHTML(html) {
        const div = document.createElement('div');
        div.innerHTML = html;
        const textNodes = [];
        const walker = document.createTreeWalker(div, NodeFilter.SHOW_TEXT);
        while (walker.nextNode()) {
            textNodes.push(walker.currentNode.textContent);
        }
        return textNodes;
    }

    async translateTextNodes(textNodes) {
        if (!textNodes.length) return [];
        const translatedTexts = [];
        for (let i = 0; i < textNodes.length; i++) {
            const original = textNodes[i];
            const trimmed = original.trim();
            if (!trimmed) {
                translatedTexts.push(original);
                continue;
            }
            const translatedTrimmed = await this.translateSegment(trimmed);
            const leading = original.match(/^\s*/)[0];
            const trailing = original.match(/\s*$/)[0];
            translatedTexts.push(leading + translatedTrimmed + trailing);
            if (i < textNodes.length - 1) await sleep(50);
        }
        return translatedTexts;
    }

    rebuildHTML(originalHTML, textNodes, translatedTexts) {
        const div = document.createElement('div');
        div.innerHTML = originalHTML;
        let i = 0;
        const walker = document.createTreeWalker(div, NodeFilter.SHOW_TEXT);
        while (walker.nextNode() && i < translatedTexts.length) {
            walker.currentNode.textContent = translatedTexts[i++];
        }
        return div.innerHTML;
    }

    // ---------- Segment translation with placeholder protection ----------
    async translateSegment(text) {
        if (!text?.trim()) return text;

        const useHTML = this.settings.translationService === 'google';

        const dntTerms = [...this.settings.doNotTranslate].sort((a, b) => b.length - a.length);
        const mtPairs = [...this.settings.manualTranslations].sort((a, b) => b.from.length - a.from.length);

        const placeholders = new Map();
        let counter = 0;
        // A placeholder unlikely to appear in normal text or be corrupted by API.
        const getPlaceholder = () => `«OBS_TR_${counter++}»`;

        let processed = text;

        // Manual translations: replace with placeholder
        for (const { from, to } of mtPairs) {
            const regex = this.buildRegexForTerm(from);
            processed = processed.replace(regex, (match, ...args) => {
                // Preserve leading/trailing whitespace outside placeholder
                const fullMatch = match;
                const leading = fullMatch.match(/^\s*/)[0];
                const trailing = fullMatch.match(/\s*$/)[0];
                const core = fullMatch.slice(leading.length, fullMatch.length - trailing.length);
                const ph = getPlaceholder();
                placeholders.set(ph, { replacement: to, original: core });
                return leading + (useHTML ? `<span class="notranslate" translate="no">${ph}</span>` : ph) + trailing;
            });
        }

        // Do Not Translate terms
        for (const term of dntTerms) {
            const regex = this.buildRegexForTerm(term);
            processed = processed.replace(regex, (match, ...args) => {
                const leading = match.match(/^\s*/)[0];
                const trailing = match.match(/\s*$/)[0];
                const core = match.slice(leading.length, match.length - trailing.length);
                const ph = getPlaceholder();
                placeholders.set(ph, { replacement: core, original: core });
                return leading + (useHTML ? `<span class="notranslate" translate="no">${ph}</span>` : ph) + trailing;
            });
        }

        // Translate
        let translated;
        if (processed.length > this.settings.maxChunkSize) {
            translated = await this.translateLongText(processed);
        } else {
            translated = await this.getTranslation(processed);
        }

        // Restore placeholders
        let restored = translated;
        for (const [ph, info] of placeholders) {
            const marker = useHTML ? `<span class="notranslate" translate="no">${ph}</span>` : ph;
            restored = restored.split(marker).join(info.replacement);
        }

        // Fallback: if any placeholder remains (due to API corruption), try to match them.
        if (restored.includes('«OBS_TR_')) {
            for (const [ph, info] of placeholders) {
                if (restored.includes(ph)) {
                    restored = restored.split(ph).join(info.replacement);
                }
            }
        }

        return restored;
    }

    /**
     * Build regex for a term. If the term is a single word (letters/numbers/underscore),
     * add word boundaries to avoid partial matches.
     */
    buildRegexForTerm(term) {
        const escaped = escapeRegExp(term);
        // Single word: only word characters
        if (/^\w+$/.test(term)) {
            return new RegExp(`\\b${escaped}\\b`, 'g');
        }
        return new RegExp(escaped, 'g');
    }

    async translateLongText(text) {
        const maxLength = this.settings.maxChunkSize;
        if (text.length <= maxLength) return await this.getTranslation(text);

        const chunks = this.splitTextRespectingPlaceholders(text, maxLength);
        const translatedChunks = [];
        for (let i = 0; i < chunks.length; i++) {
            translatedChunks.push(await this.getTranslation(chunks[i]));
            if (i < chunks.length - 1) await sleep(50);
        }
        return translatedChunks.join('');
    }

    splitTextRespectingPlaceholders(text, maxLen) {
        const chars = [...text];
        const placeholderPattern = /«OBS_TR_\d+»/g;
        const chunks = [];
        let start = 0;

        while (start < chars.length) {
            let end = start + maxLen;
            if (end >= chars.length) {
                chunks.push(chars.slice(start).join(''));
                break;
            }

            const slice = chars.slice(start, end).join('');
            let cutSafe = end;
            placeholderPattern.lastIndex = 0;
            let match;
            while ((match = placeholderPattern.exec(slice)) !== null) {
                const phEndInSlice = match.index + match[0].length;
                if (match.index < end && phEndInSlice > slice.length) {
                    cutSafe = start + phEndInSlice;
                    break;
                }
            }

            if (cutSafe > chars.length) cutSafe = chars.length;
            if (cutSafe <= start) cutSafe = Math.min(start + maxLen, chars.length);

            chunks.push(chars.slice(start, cutSafe).join(''));
            start = cutSafe;
        }

        return chunks;
    }

    async getTranslation(text) {
        if (this.cache[text]) return this.cache[text];
        if (this.pendingTranslations.has(text)) return this.pendingTranslations.get(text);

        const promise = (async () => {
            try {
                let translated = await this.translateText(text);
                if (translated?.trim()) {
                    this.cache[text] = translated;
                    this.saveCacheDebounced();
                } else {
                    translated = text;
                }
                return translated;
            } catch (err) {
                console.error('Translation error:', err);
                return text;
            } finally {
                this.pendingTranslations.delete(text);
            }
        })();

        this.pendingTranslations.set(text, promise);
        return promise;
    }

    async translateText(text) {
        switch (this.settings.translationService) {
            case 'google': return this.translateWithGoogle(text);
            case 'gemini': return this.translateWithGemini(text);
            case 'custom': return this.translateWithCustomAPI(text);
            default: return this.translateWithGoogle(text);
        }
    }

    // ---------- Translation services ----------
    async translateWithGoogle(text) {
        const sourceLang = this.getSourceLang(text);
        const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=${sourceLang}&tl=${this.settings.targetLanguage}&dt=t&format=html&q=${encodeURIComponent(text)}`;
        const resp = await fetch(url);
        if (!resp.ok) throw new Error(`Google Translate HTTP ${resp.status}`);
        const data = await resp.json();
        if (!data?.[0]) throw new Error('Unexpected Google response');
        return data[0].map(item => item[0]).join('');
    }

    async translateWithGemini(text) {
        if (!this.settings.geminiApiKey) throw new Error('Gemini API key not configured');

        const model = this.settings.geminiModel || 'gemini-2.5-flash';
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${this.settings.geminiApiKey}`;
        const langName = this.getLanguageName(this.settings.targetLanguage);
        const prompt = `Translate the following text to ${langName}. IMPORTANT: Keep all placeholders that look like «OBS_TR_*» EXACTLY as they are (including the guillemets). Do not modify, translate, or reorder them. Return ONLY the translated text.\n\nText: ${text}`;

        const body = {
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: {
                temperature: 0.3,
                maxOutputTokens: 2048,
                topP: 0.8,
                topK: 40
            }
        };

        const resp = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });

        if (!resp.ok) {
            const errorText = await resp.text();
            if (resp.status === 403 || resp.status === 401) throw new Error('Invalid Gemini API key');
            if (resp.status === 429) throw new Error('Rate limit exceeded');
            throw new Error(`Gemini API error: ${resp.status} - ${errorText}`);
        }

        const data = await resp.json();
        const translated = data.candidates?.[0]?.content?.parts?.[0]?.text;
        if (!translated) throw new Error('Unexpected Gemini response format');
        return translated.trim().replace(/^["']|["']$/g, '');
    }

    async translateWithCustomAPI(text) {
        if (!this.settings.customApiUrl) throw new Error('Custom API URL not configured');

        let headers = {};
        try {
            headers = JSON.parse(this.settings.customApiHeaders);
        } catch {
            console.warn('Invalid custom API headers, using {}');
        }

        let bodyObj;
        try {
            bodyObj = JSON.parse(this.settings.customApiBodyTemplate);
        } catch {
            throw new Error('Custom API body template is not valid JSON');
        }
        this.replacePlaceholdersInObject(bodyObj, text, this.settings.targetLanguage);

        const resp = await fetch(this.settings.customApiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...headers },
            body: JSON.stringify(bodyObj)
        });

        if (!resp.ok) throw new Error(`Custom API HTTP ${resp.status}`);
        const data = await resp.json();

        const path = this.settings.customApiResponsePath.split('.');
        let result = data;
        for (const key of path) {
            if (result && typeof result === 'object') result = result[key];
            else throw new Error(`Invalid response path: ${this.settings.customApiResponsePath}`);
        }
        if (typeof result !== 'string') throw new Error('Translation result is not a string');
        return result;
    }

    replacePlaceholdersInObject(obj, text, targetLang) {
        if (typeof obj === 'string') {
            return obj.replace(/\{\{text\}\}/g, text).replace(/\{\{targetLang\}\}/g, targetLang);
        }
        if (Array.isArray(obj)) {
            return obj.map(item => this.replacePlaceholdersInObject(item, text, targetLang));
        }
        if (obj && typeof obj === 'object') {
            for (const key of Object.keys(obj)) {
                obj[key] = this.replacePlaceholdersInObject(obj[key], text, targetLang);
            }
        }
        return obj;
    }

    /**
     * Determine the source language code for Google Translate based on text content.
     * This improves accuracy for mixed‑script texts by choosing the dominant language.
     */
    getSourceLang(text) {
        if (this.settings.sourceLanguage && this.settings.sourceLanguage !== 'auto') {
            return this.settings.sourceLanguage;
        }

        // Count CJK characters (Han, Hiragana, Katakana)
        const cjkCount = (text.match(/[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FFF]/g) || []).length;
        const totalChars = text.replace(/\s/g, '').length;
        if (totalChars > 0 && cjkCount / totalChars > 0.6) {
            return 'zh'; // approximate; could be improved with language detection lib
        }
        // Default to auto
        return 'auto';
    }

    getLanguageName(langCode) {
        const map = {
            ar: 'Arabic', en: 'English', fr: 'French', es: 'Spanish',
            de: 'German', ja: 'Japanese', ko: 'Korean', zh: 'Chinese',
            ru: 'Russian', pt: 'Portuguese', it: 'Italian', nl: 'Dutch', tr: 'Turkish'
        };
        return map[langCode] || langCode;
    }

    // ---------- DOM manipulation ----------
    applyTranslation(el, translatedHTML) {
        if (!el?.isConnected) return;
        if (!this.originalContents.has(el)) {
            this.originalContents.set(el, el.innerHTML);
        }
        el.innerHTML = translatedHTML;
        el.dataset.translated = 'true';
        if (this.settings.targetLanguage === 'ar') el.setAttribute('dir', 'rtl');
        else el.removeAttribute('dir');
    }

    restoreOriginal(el) {
        if (!el?.isConnected) return;
        const original = this.originalContents.get(el);
        if (original && el.dataset.translated === 'true') {
            el.innerHTML = original;
            delete el.dataset.translated;
            el.removeAttribute('dir');
        }
    }
};

// ---------- Settings Tab ----------
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
            .addDropdown(d => d
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
                .onChange(async v => {
                    this.plugin.settings.targetLanguage = v;
                    await this.plugin.saveSettings();
                })
            );

        new Setting(containerEl)
            .setName('Source Language (for Google)')
            .setDesc('Force source language or "auto" for automatic detection. Helps with mixed-language texts.')
            .addText(t => t.setPlaceholder('auto').setValue(this.plugin.settings.sourceLanguage)
                .onChange(async v => {
                    this.plugin.settings.sourceLanguage = v || 'auto';
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName('Translation Service')
            .setDesc('Choose which service to use')
            .addDropdown(d => d
                .addOption('google', 'Google Translate')
                .addOption('gemini', 'Gemini AI')
                .addOption('custom', 'Custom API')
                .setValue(this.plugin.settings.translationService)
                .onChange(async v => {
                    this.plugin.settings.translationService = v;
                    await this.plugin.saveSettings();
                    this.display();
                })
            );

        if (this.plugin.settings.translationService === 'gemini') {
            this.renderGeminiSettings(containerEl);
        }
        if (this.plugin.settings.translationService === 'custom') {
            this.renderCustomAPISettings(containerEl);
        }

        this.renderDntAndMt(containerEl);
    }

    renderGeminiSettings(containerEl) {
        containerEl.createEl('h4', { text: 'Gemini AI' });

        new Setting(containerEl)
            .setName('API Key')
            .setDesc('Your Google AI Studio API key')
            .addText(t => t.setPlaceholder('Enter key').setValue(this.plugin.settings.geminiApiKey)
                .onChange(async v => {
                    this.plugin.settings.geminiApiKey = v;
                    await this.plugin.saveSettings();
                })
            );

        new Setting(containerEl)
            .setName('Model')
            .setDesc('Gemini model')
            .addDropdown(d => d
                .addOption('gemini-2.5-flash', 'Gemini 2.5 Flash')
                .setValue(this.plugin.settings.geminiModel)
                .onChange(async v => {
                    this.plugin.settings.geminiModel = v;
                    await this.plugin.saveSettings();
                })
            );

        new Setting(containerEl)
            .setName('Test Connection')
            .setDesc('Verify your Gemini setup')
            .addButton(btn => btn.setButtonText('Test').onClick(async () => {
                btn.setButtonText('Testing...');
                btn.setDisabled(true);
                try {
                    const result = await this.plugin.translateWithGemini('Hello test');
                    new Notice(`✓ Gemini works! "${result.substring(0, 100)}"`);
                } catch (e) {
                    new Notice(`⨉ ${e.message}`);
                } finally {
                    btn.setButtonText('Test');
                    btn.setDisabled(false);
                }
            }));
    }

    renderCustomAPISettings(containerEl) {
        containerEl.createEl('h4', { text: 'Custom API' });

        new Setting(containerEl)
            .setName('API URL')
            .addText(t => t.setPlaceholder('https://...').setValue(this.plugin.settings.customApiUrl)
                .onChange(async v => {
                    this.plugin.settings.customApiUrl = v;
                    await this.plugin.saveSettings();
                })
            );

        new Setting(containerEl)
            .setName('Headers (JSON)')
            .addTextArea(t => t.setPlaceholder('{}').setValue(this.plugin.settings.customApiHeaders)
                .onChange(async v => {
                    this.plugin.settings.customApiHeaders = v;
                    await this.plugin.saveSettings();
                })
            );

        new Setting(containerEl)
            .setName('Body Template (JSON with {{text}} and {{targetLang}})')
            .addTextArea(t => t.setPlaceholder('...').setValue(this.plugin.settings.customApiBodyTemplate)
                .onChange(async v => {
                    this.plugin.settings.customApiBodyTemplate = v;
                    await this.plugin.saveSettings();
                })
            );

        new Setting(containerEl)
            .setName('Response Path (dot notation)')
            .addText(t => t.setPlaceholder('translated_text').setValue(this.plugin.settings.customApiResponsePath)
                .onChange(async v => {
                    this.plugin.settings.customApiResponsePath = v;
                    await this.plugin.saveSettings();
                })
            );
    }

    renderDntAndMt(containerEl) {
        containerEl.createEl('h3', { text: 'Do Not Translate' });
        this.renderDntList(containerEl);

        new Setting(containerEl)
            .setName('Add term')
            .addText(t => {
                t.setPlaceholder('word or phrase');
                t.inputEl.addEventListener('keydown', async (e) => {
                    if (e.key === 'Enter' && t.getValue()) {
                        this.plugin.settings.doNotTranslate.push(t.getValue());
                        await this.plugin.saveSettings();
                        this.display();
                    }
                });
            });

        containerEl.createEl('h3', { text: 'Manual Translations' });
        this.renderMtList(containerEl);

        let fromVal = '', toVal = '';
        new Setting(containerEl)
            .setName('Add translation')
            .addText(t => { t.setPlaceholder('English'); t.onChange(v => fromVal = v); })
            .addText(t => { t.setPlaceholder('Translation'); t.onChange(v => toVal = v); })
            .addButton(btn => btn.setButtonText('Add').onClick(async () => {
                if (fromVal && toVal) {
                    this.plugin.settings.manualTranslations.push({ from: fromVal, to: toVal });
                    await this.plugin.saveSettings();
                    this.display();
                }
            }));
    }

    renderDntList(container) {
        const ul = container.createEl('ul');
        this.plugin.settings.doNotTranslate.forEach((term, idx) => {
            const li = ul.createEl('li', { text: term });
            new Setting(li)
                .addButton(btn => btn.setIcon('trash').onClick(async () => {
                    this.plugin.settings.doNotTranslate.splice(idx, 1);
                    await this.plugin.saveSettings();
                    this.display();
                }));
        });
    }

    renderMtList(container) {
        const ul = container.createEl('ul');
        this.plugin.settings.manualTranslations.forEach((pair, idx) => {
            const li = ul.createEl('li', { text: `${pair.from} → ${pair.to}` });
            new Setting(li)
                .addButton(btn => btn.setIcon('pencil').onClick(async () => {
                    const newFrom = await this.prompt('Edit source phrase', pair.from);
                    if (newFrom === null) return;
                    const newTo = await this.prompt('Edit translation', pair.to);
                    if (newTo === null) return;
                    pair.from = newFrom;
                    pair.to = newTo;
                    await this.plugin.saveSettings();
                    this.display();
                }))
                .addButton(btn => btn.setIcon('trash').onClick(async () => {
                    this.plugin.settings.manualTranslations.splice(idx, 1);
                    await this.plugin.saveSettings();
                    this.display();
                }));
        });
    }

    async prompt(title, defaultValue = '') {
        return new Promise((resolve) => {
            const modal = new Modal(this.app);
            modal.titleEl.setText(title);
            let value = defaultValue;
            new Setting(modal.contentEl)
                .addText(t => t.setValue(defaultValue).onChange(v => value = v))
                .addButton(btn => btn.setButtonText('OK').onClick(() => { modal.close(); resolve(value); }))
                .addButton(btn => btn.setButtonText('Cancel').onClick(() => { modal.close(); resolve(null); }));
            modal.open();
        });
    }
}