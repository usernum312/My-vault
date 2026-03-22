const { Plugin, PluginSettingTab, Setting } = require('obsidian');

// Import Tesseract.js for OCR
const Tesseract = require('tesseract.js');

// Default settings
const DEFAULT_SETTINGS = {
    doNotTranslate: [],
    manualTranslations: [],
    preloadDistance: 500,
    translationDelay: 100,
    ocrEnabled: true,
    ocrLanguage: 'eng', // Default OCR language
    ocrCacheEnabled: true // Cache OCR results
};

module.exports = class AutoTranslatePlugin extends Plugin {
    async onload() {
        await this.loadSettings();

        // Load persistent translation cache
        this.cache = (await this.loadData()) || {};
        this.ocrCache = (await this.loadData())?.ocrCache || {}; // Cache for OCR results
        this.pendingTranslations = new Map();
        this.pendingOcr = new Map(); // Track pending OCR operations

        // Core state
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

        this.targetSelectors = 'p, h1, h2, h3, h4, h5, h6, li, td, th, blockquote, img';
        this.imageSelector = 'img';

        // Debounced cache save
        this.saveCacheDebounced = this.debounce(() => {
            this.saveData({ ...this.cache, ocrCache: this.ocrCache });
        }, 2000);

        // Debounced scroll handler
        this.scrollHandler = this.debounce(() => {
            this.preloadNearbyElements();
        }, 150);

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
        this.saveData({ ...this.cache, ocrCache: this.ocrCache });
        this.cleanup();
        this.restoreAllOriginals();
        
        // Terminate Tesseract workers
        if (this.tesseractWorker) {
            this.tesseractWorker.terminate();
        }
    }

    async loadSettings() {
        const data = await this.loadData();
        this.settings = Object.assign({}, DEFAULT_SETTINGS, data);
        if (data?.ocrCache) {
            this.ocrCache = data.ocrCache;
        }
    }

    async saveSettings() {
        await this.saveData({ ...this.settings, ocrCache: this.ocrCache });
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
                if (el.tagName === 'IMG') {
                    // For images, restore original alt text if we changed it
                    if (originalHTML.alt !== undefined) {
                        el.alt = originalHTML.alt;
                    }
                    if (originalHTML.title !== undefined) {
                        el.title = originalHTML.title;
                    }
                    // Remove translation overlay if exists
                    const overlay = el.parentElement?.querySelector('.ocr-translation-overlay');
                    if (overlay) overlay.remove();
                } else {
                    el.innerHTML = originalHTML;
                }
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
        // Observe text elements
        const elements = container.querySelectorAll(this.targetSelectors);
        for (const el of elements) {
            if (!this.originalContents.has(el)) {
                if (el.tagName === 'IMG') {
                    // Store image info
                    this.originalContents.set(el, {
                        src: el.src,
                        alt: el.alt,
                        title: el.title
                    });
                } else {
                    this.originalContents.set(el, el.innerHTML);
                }
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
                let translatedContent;
                
                if (el.tagName === 'IMG' && this.settings.ocrEnabled) {
                    translatedContent = await this.translateImage(el);
                } else if (el.tagName !== 'IMG') {
                    translatedContent = await this.translateElement(el);
                } else {
                    continue;
                }
                
                this.translationCache.set(el, translatedContent);
                
                if (this.visibleElements.has(el) && el.isConnected) {
                    this.applyTranslation(el, translatedContent);
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

    async translateImage(imgElement) {
        const imgUrl = imgElement.src;
        const cacheKey = `ocr_${imgUrl}`;
        
        // Check OCR cache
        if (this.settings.ocrCacheEnabled && this.ocrCache[cacheKey]) {
            return this.ocrCache[cacheKey];
        }
        
        // Check if already processing
        if (this.pendingOcr.has(imgUrl)) {
            return this.pendingOcr.get(imgUrl);
        }
        
        const ocrPromise = this.performOcr(imgUrl);
        this.pendingOcr.set(imgUrl, ocrPromise);
        
        try {
            const ocrResult = await ocrPromise;
            
            if (ocrResult && ocrResult.text) {
                // Translate the extracted text
                const translatedText = await this.applyRulesAndTranslate(ocrResult.text);
                
                const result = {
                    type: 'ocr',
                    originalText: ocrResult.text,
                    translatedText: translatedText,
                    confidence: ocrResult.confidence,
                    words: ocrResult.words
                };
                
                if (this.settings.ocrCacheEnabled) {
                    this.ocrCache[cacheKey] = result;
                    this.saveCacheDebounced();
                }
                
                return result;
            }
            
            return null;
        } finally {
            this.pendingOcr.delete(imgUrl);
        }
    }

    async performOcr(imageUrl) {
        try {
            // Load image
            const img = new Image();
            img.crossOrigin = 'Anonymous';
            
            await new Promise((resolve, reject) => {
                img.onload = resolve;
                img.onerror = reject;
                img.src = imageUrl;
            });
            
            // Create canvas for OCR
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            
            // Resize if image is too large (max 2000px)
            let width = img.width;
            let height = img.height;
            const maxSize = 2000;
            
            if (width > maxSize || height > maxSize) {
                if (width > height) {
                    height = (height * maxSize) / width;
                    width = maxSize;
                } else {
                    width = (width * maxSize) / height;
                    height = maxSize;
                }
            }
            
            canvas.width = width;
            canvas.height = height;
            ctx.drawImage(img, 0, 0, width, height);
            
            // Perform OCR
            const { data: { text, words, confidence } } = await Tesseract.recognize(
                canvas,
                this.settings.ocrLanguage,
                {
                    logger: m => {
                        if (m.status === 'recognizing text') {
                            // Optional: log progress
                            // console.log(`OCR progress: ${Math.round(m.progress * 100)}%`);
                        }
                    }
                }
            );
            
            return {
                text: text.trim(),
                words: words,
                confidence: confidence
            };
        } catch (error) {
            console.error('OCR failed:', error);
            return null;
        }
    }

    async translateElement(el) {
        const originalHTML = this.originalContents.get(el);
        if (!originalHTML) return '';
        
        try {
            const textContent = this.extractTextWithStructure(originalHTML);
            const translatedStructure = await this.translateStructure(textContent);
            return this.rebuildHTML(originalHTML, translatedStructure);
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
                const parent = node.parentNode;
                textNodes.push({
                    text: text,
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
        if (!textNodes.length) return [];
        
        const segments = textNodes.map(node => node.text);
        const combinedText = segments.join(' ||| ');
        const translatedCombined = await this.applyRulesAndTranslate(combinedText);
        const translatedSegments = translatedCombined.split(' ||| ');
        
        return textNodes.map((node, index) => ({
            ...node,
            translatedText: translatedSegments[index] || node.text
        }));
    }

    rebuildHTML(originalHTML, translatedStructure) {
        const div = document.createElement('div');
        div.innerHTML = originalHTML;
        
        let nodeIndex = 0;
        const walker = document.createTreeWalker(div, NodeFilter.SHOW_TEXT, null, false);
        
        while (walker.nextNode()) {
            const node = walker.currentNode;
            if (node.textContent && node.textContent.trim() && nodeIndex < translatedStructure.length) {
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

        const translatedWithPlaceholders = await this.getTranslation(textWithPlaceholders);

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

    applyTranslation(el, content) {
        if (!el || !el.isConnected) return;
        
        if (el.tagName === 'IMG' && content && content.type === 'ocr') {
            this.applyImageTranslation(el, content);
        } else if (el.tagName !== 'IMG') {
            if (!this.originalContents.has(el)) {
                this.originalContents.set(el, el.innerHTML);
            }
            el.innerHTML = content;
            el.dataset.translated = 'true';
            el.setAttribute('dir', 'rtl');
        }
    }

    applyImageTranslation(imgElement, ocrResult) {
        if (!ocrResult || !ocrResult.translatedText) return;
        
        // Store original alt text if not already stored
        if (!this.originalContents.has(imgElement)) {
            this.originalContents.set(imgElement, {
                src: imgElement.src,
                alt: imgElement.alt,
                title: imgElement.title
            });
        }
        
        // Create a wrapper if not exists
        let wrapper = imgElement.parentElement;
        let needsWrapper = wrapper && wrapper.classList.contains('image-translation-wrapper');
        
        if (!needsWrapper) {
            wrapper = document.createElement('div');
            wrapper.className = 'image-translation-wrapper';
            wrapper.style.position = 'relative';
            wrapper.style.display = 'inline-block';
            imgElement.parentNode.insertBefore(wrapper, imgElement);
            wrapper.appendChild(imgElement);
        }
        
        // Add translation overlay
        let overlay = wrapper.querySelector('.ocr-translation-overlay');
        if (!overlay) {
            overlay = document.createElement('div');
            overlay.className = 'ocr-translation-overlay';
            overlay.style.position = 'absolute';
            overlay.style.bottom = '0';
            overlay.style.left = '0';
            overlay.style.right = '0';
            overlay.style.backgroundColor = 'rgba(0, 0, 0, 0.7)';
            overlay.style.color = 'white';
            overlay.style.padding = '8px';
            overlay.style.fontSize = '12px';
            overlay.style.zIndex = '10';
            overlay.style.borderRadius = '4px';
            overlay.style.backdropFilter = 'blur(4px)';
            wrapper.appendChild(overlay);
        }
        
        // Set overlay content
        overlay.innerHTML = `
            <div style="direction: rtl; text-align: right;">
                <strong>ترجمة:</strong> ${ocrResult.translatedText}
                ${ocrResult.confidence ? `<br><small style="opacity:0.7;">الدقة: ${Math.round(ocrResult.confidence)}%</small>` : ''}
            </div>
        `;
        
        // Add tooltip with original text
        imgElement.title = `النص الأصلي: ${ocrResult.originalText}\nالترجمة: ${ocrResult.translatedText}`;
        
        imgElement.dataset.translated = 'true';
    }

    restoreOriginal(el) {
        if (!el || !el.isConnected) return;
        
        if (el.tagName === 'IMG') {
            const original = this.originalContents.get(el);
            if (original) {
                // Remove overlay
                const wrapper = el.parentElement;
                if (wrapper && wrapper.classList.contains('image-translation-wrapper')) {
                    const overlay = wrapper.querySelector('.ocr-translation-overlay');
                    if (overlay) overlay.remove();
                    // Unwrap if needed
                    if (wrapper.parentElement) {
                        wrapper.parentElement.insertBefore(el, wrapper);
                        wrapper.remove();
                    }
                }
                el.alt = original.alt || '';
                el.title = original.title || '';
                delete el.dataset.translated;
            }
        } else {
            const originalHTML = this.originalContents.get(el);
            if (originalHTML && el.dataset.translated === 'true') {
                el.innerHTML = originalHTML;
                delete el.dataset.translated;
                el.removeAttribute('dir');
            }
        }
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
    
    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
};

// Settings Tab with OCR options
class AutoTranslateSettingTab extends PluginSettingTab {
    constructor(app, plugin) {
        super(app, plugin);
        this.plugin = plugin;
    }

    display() {
        const { containerEl } = this;
        containerEl.empty();

        containerEl.createEl('h2', { text: 'Auto Translate Settings' });
        
        // OCR Settings
        containerEl.createEl('h3', { text: 'OCR (Image Text Recognition)' });
        
        new Setting(containerEl)
            .setName('Enable OCR')
            .setDesc('Extract and translate text from images')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.ocrEnabled)
                .onChange(async (value) => {
                    this.plugin.settings.ocrEnabled = value;
                    await this.plugin.saveSettings();
                }));
        
        new Setting(containerEl)
            .setName('OCR Language')
            .setDesc('Language of text in images (eng, ara, fra, etc.)')
            .addText(text => text
                .setPlaceholder('eng')
                .setValue(this.plugin.settings.ocrLanguage)
                .onChange(async (value) => {
                    this.plugin.settings.ocrLanguage = value || 'eng';
                    await this.plugin.saveSettings();
                }));
        
        new Setting(containerEl)
            .setName('Cache OCR Results')
            .setDesc('Save OCR results to avoid reprocessing same images')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.ocrCacheEnabled)
                .onChange(async (value) => {
                    this.plugin.settings.ocrCacheEnabled = value;
                    await this.plugin.saveSettings();
                }));
        
        // Performance settings
        containerEl.createEl('h3', { text: 'Performance' });
        
        new Setting(containerEl)
            .setName('Preload distance')
            .setDesc('How many pixels ahead to preload translations')
            .addSlider(slider => slider
                .setLimits(200, 1000, 50)
                .setValue(this.plugin.settings.preloadDistance)
                .setDynamicTooltip()
                .onChange(async (value) => {
                    this.plugin.settings.preloadDistance = value;
                    await this.plugin.saveSettings();
                }));
        
        new Setting(containerEl)
            .setName('Translation delay')
            .setDesc('Delay between translating each element (ms)')
            .addSlider(slider => slider
                .setLimits(50, 500, 10)
                .setValue(this.plugin.settings.translationDelay)
                .setDynamicTooltip()
                .onChange(async (value) => {
                    this.plugin.settings.translationDelay = value;
                    await this.plugin.saveSettings();
                }));

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