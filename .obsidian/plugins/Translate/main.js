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
    maxChunkSize: 1000,
    // Image translation settings
    imageTranslationEnabled: true,
    imageTranslationService: 'gemini',    // 'gemini' | 'google-vision'
    googleVisionApiKey: '',               // for Google Cloud Vision + Translate
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

        this.targetSelectors = 'p, h1, h2, h3, h4, h5, h6, li, td, th, blockquote, pre';
        this.imageTranslationCache = new Map(); // img el → overlay data
        this.imageOverlays = new Map();         // img el → wrapper el

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
        // Remove all image overlays
        for (const wrapper of this.imageOverlays.values()) {
            this.unwrapImageOverlay(wrapper);
        }
        this.imageOverlays.clear();
        this.imageTranslationCache.clear();
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
        for (const wrapper of this.imageOverlays.values()) {
            this.unwrapImageOverlay(wrapper);
        }
        this.imageOverlays.clear();
        this.imageTranslationCache.clear();
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
        // Observe images for translation if enabled
        if (this.settings.imageTranslationEnabled) {
            const images = container.querySelectorAll('img');
            for (const img of images) {
                if (!this.imageOverlays.has(img)) {
                    this.observer.observe(img);
                }
            }
        }
    }

    // ---------- IntersectionObserver ----------
    handleIntersection(entries) {
        for (const entry of entries) {
            const el = entry.target;
            // Handle image elements separately
            if (el.tagName === 'IMG') {
                if (entry.isIntersecting && this.settings.imageTranslationEnabled) {
                    this.queueImageTranslation(el);
                }
                continue;
            }
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
            const item = this.translationQueue.shift();

            // Image translation items are objects { type:'image', el }
            if (item && typeof item === 'object' && item.type === 'image') {
                const imgEl = item.el;
                if (!imgEl.isConnected) continue;
                if (this.imageOverlays.has(imgEl)) continue;
                try {
                    const regions = await this.translateImage(imgEl);
                    this.imageTranslationCache.set(imgEl, regions);
                    this.applyImageOverlay(imgEl, regions);
                } catch (err) {
                    console.error('Image translation failed:', err);
                }
                if (this.translationQueue.length > 0) await sleep(this.settings.translationDelay);
                continue;
            }

            const el = item;
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

    // ---------- Image Translation ----------

    queueImageTranslation(imgEl) {
        if (this.imageOverlays.has(imgEl)) return; // already processed
        if (this.imageTranslationCache.has(imgEl)) {
            this.applyImageOverlay(imgEl, this.imageTranslationCache.get(imgEl));
            return;
        }
        // Defer until image is loaded
        if (!imgEl.complete || imgEl.naturalWidth === 0) {
            imgEl.addEventListener('load', () => this.queueImageTranslation(imgEl), { once: true });
            return;
        }
        this.translationQueue.push({ type: 'image', el: imgEl });
        if (!this.processing) this.processQueue();
    }

    /**
     * Convert an <img> to a base64 data URL via an off-screen canvas.
     * Returns null if the image is cross-origin and tainted.
     */
    imgToBase64(imgEl) {
        try {
            const canvas = document.createElement('canvas');
            canvas.width = imgEl.naturalWidth || imgEl.width || 300;
            canvas.height = imgEl.naturalHeight || imgEl.height || 300;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(imgEl, 0, 0);
            // strip "data:image/png;base64," prefix
            return canvas.toDataURL('image/png').split(',')[1];
        } catch (e) {
            // CORS-tainted canvas – fall back to src URL fetch
            return null;
        }
    }

    /**
     * Fetch image bytes as base64 via fetch() – works for vault-local images.
     */
    async imgUrlToBase64(src) {
        const resp = await fetch(src);
        if (!resp.ok) throw new Error(`Image fetch failed: ${resp.status}`);
        const buf = await resp.arrayBuffer();
        let binary = '';
        const bytes = new Uint8Array(buf);
        for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
        return btoa(binary);
    }

    /**
     * Translate text in an image.
     * Returns an array of { text, x, y, w, h } region objects (coordinates as
     * fractions 0–1 of image dimensions), or null if no text found.
     */
    async translateImage(imgEl) {
        const service = this.settings.imageTranslationService;
        const langName = this.getLanguageName(this.settings.targetLanguage);

        let base64 = this.imgToBase64(imgEl);
        if (!base64) {
            base64 = await this.imgUrlToBase64(imgEl.src);
        }

        if (service === 'gemini') {
            return await this.translateImageWithGemini(base64, langName);
        } else if (service === 'google-vision') {
            return await this.translateImageWithGoogleVision(base64, langName);
        }
        throw new Error(`Unknown image translation service: ${service}`);
    }

    async translateImageWithGemini(base64, langName) {
        if (!this.settings.geminiApiKey) throw new Error('Gemini API key not configured');

        const model = this.settings.geminiModel || 'gemini-2.5-flash';
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${this.settings.geminiApiKey}`;

        const prompt = `You are an image text extractor and translator.
Examine this image and find ALL visible text (signs, labels, captions, UI text, handwriting, etc.).
For each distinct text region, return a JSON object with these fields:
  - "original": the original text as it appears in the image
  - "translated": the text translated to ${langName}
  - "x": left edge of the text region as a fraction of image width (0.0 to 1.0)
  - "y": top edge of the text region as a fraction of image height (0.0 to 1.0)
  - "w": width of the text region as a fraction of image width (0.0 to 1.0)
  - "h": height of the text region as a fraction of image height (0.0 to 1.0)

Return ONLY a JSON array of these objects. If no text is found, return [].
Example: [{"original":"Hello","translated":"مرحبا","x":0.1,"y":0.05,"w":0.4,"h":0.08}]`;

        const body = {
            contents: [{
                parts: [
                    { inline_data: { mime_type: 'image/png', data: base64 } },
                    { text: prompt }
                ]
            }],
            generationConfig: { temperature: 0.1, maxOutputTokens: 4096 }
        };

        const resp = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });

        if (!resp.ok) {
            const err = await resp.text();
            throw new Error(`Gemini image API error: ${resp.status} – ${err}`);
        }

        const data = await resp.json();
        const raw = data.candidates?.[0]?.content?.parts?.[0]?.text || '[]';
        const clean = raw.replace(/```json|```/g, '').trim();
        return JSON.parse(clean);
    }

    async translateImageWithGoogleVision(base64, langName) {
        const visionKey = this.settings.googleVisionApiKey;
        if (!visionKey) throw new Error('Google Vision API key not configured');

        // Step 1: OCR with Google Vision
        const visionUrl = `https://vision.googleapis.com/v1/images:annotate?key=${visionKey}`;
        const visionBody = {
            requests: [{
                image: { content: base64 },
                features: [{ type: 'DOCUMENT_TEXT_DETECTION' }]
            }]
        };

        const visionResp = await fetch(visionUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(visionBody)
        });

        if (!visionResp.ok) {
            const err = await visionResp.text();
            throw new Error(`Google Vision error: ${visionResp.status} – ${err}`);
        }

        const visionData = await visionResp.json();
        const blocks = visionData.responses?.[0]?.fullTextAnnotation?.pages?.[0]?.blocks;
        if (!blocks || blocks.length === 0) return [];

        // Get image dimensions from the first page
        const page = visionData.responses?.[0]?.fullTextAnnotation?.pages?.[0];
        const imgW = page?.width || 1;
        const imgH = page?.height || 1;

        // Step 2: Translate each block's text
        const results = [];
        for (const block of blocks) {
            const blockText = block.paragraphs
                ?.flatMap(p => p.words?.map(w => w.symbols?.map(s => s.text).join('')) ?? [])
                .join(' ') ?? '';

            if (!blockText.trim()) continue;

            const vs = block.boundingBox?.vertices || [];
            if (vs.length < 4) continue;

            const xs = vs.map(v => v.x || 0);
            const ys = vs.map(v => v.y || 0);
            const bx = Math.min(...xs), by = Math.min(...ys);
            const bw = Math.max(...xs) - bx;
            const bh = Math.max(...ys) - by;

            const translated = await this.translateSegment(blockText);
            results.push({
                original: blockText,
                translated,
                x: bx / imgW,
                y: by / imgH,
                w: bw / imgW,
                h: bh / imgH
            });
            await sleep(80);
        }
        return results;
    }

    /**
     * Wrap the image in a relative-positioned container and render
     * Google-Lens-style overlay blocks for each translated region.
     */
    applyImageOverlay(imgEl, regions) {
        if (!imgEl.isConnected) return;
        if (this.imageOverlays.has(imgEl)) return;
        if (!regions || regions.length === 0) return;

        // Build wrapper
        const wrapper = document.createElement('span');
        wrapper.className = 'auto-translate-img-wrapper';
        wrapper.style.cssText = 'display:inline-block;position:relative;line-height:0;';

        // Service badge
        const svc = this.settings.imageTranslationService === 'gemini' ? 'Gemini' : 'Vision';
        const badge = document.createElement('span');
        badge.className = 'auto-translate-img-badge';
        badge.textContent = `🔤 ${svc}`;
        badge.style.cssText = `
            position:absolute;top:4px;right:4px;z-index:10;
            background:rgba(30,30,40,0.82);color:#fff;
            font-size:10px;font-family:sans-serif;font-weight:600;
            padding:2px 7px;border-radius:10px;pointer-events:none;
            letter-spacing:0.03em;backdrop-filter:blur(3px);
        `;

        imgEl.parentNode.insertBefore(wrapper, imgEl);
        wrapper.appendChild(imgEl);
        wrapper.appendChild(badge);

        // Render overlays using percentage positioning
        for (const region of regions) {
            const overlay = document.createElement('span');
            overlay.className = 'auto-translate-img-overlay';
            overlay.textContent = region.translated;

            const pct = (n) => (n * 100).toFixed(2) + '%';
            overlay.style.cssText = `
                position:absolute;
                left:${pct(region.x)};top:${pct(region.y)};
                width:${pct(region.w)};height:${pct(region.h)};
                background:rgba(10,20,60,0.78);
                color:#fff;
                font-family:sans-serif;
                font-size:clamp(9px,${Math.max(region.h * 80, 10).toFixed(1)}px,18px);
                line-height:1.25;
                display:flex;align-items:center;justify-content:center;
                text-align:center;
                padding:1px 3px;
                box-sizing:border-box;
                border-radius:3px;
                word-break:break-word;
                pointer-events:none;
                z-index:5;
                backdrop-filter:blur(2px);
                border:1px solid rgba(255,255,255,0.12);
            `;
            if (['ar', 'he', 'fa', 'ur'].includes(this.settings.targetLanguage)) {
                overlay.setAttribute('dir', 'rtl');
            }
            wrapper.appendChild(overlay);
        }

        this.imageOverlays.set(imgEl, wrapper);
    }

    unwrapImageOverlay(wrapper) {
        if (!wrapper || !wrapper.isConnected) return;
        const img = wrapper.querySelector('img');
        if (img) {
            wrapper.parentNode.insertBefore(img, wrapper);
        }
        wrapper.remove();
    }

    // ---------- Code block comment patterns ----------
    // Each entry has:
    //   single  – regex matching a full single-line comment (capture group 1 = comment body)
    //   multi   – regex matching a full block comment (capture group 1 = comment body), or null
    // All regexes use the 'g' flag so they can be used with replaceAll-style loops.
    static get CODE_COMMENT_PATTERNS() {
        return {
            // C-style single + block comments
            javascript: {
                single: /(\/\/[^\n]*)/g,
                multi:  /(\/\*[\s\S]*?\*\/)/g,
            },
            js: {
                single: /(\/\/[^\n]*)/g,
                multi:  /(\/\*[\s\S]*?\*\/)/g,
            },
            typescript: {
                single: /(\/\/[^\n]*)/g,
                multi:  /(\/\*[\s\S]*?\*\/)/g,
            },
            jsx: {
                single: /(\/\/[^\n]*)/g,
                multi:  /(\/\*[\s\S]*?\*\/)/g,
            },
            tsx: {
                single: /(\/\/[^\n]*)/g,
                multi:  /(\/\*[\s\S]*?\*\/)/g,
            },
            java: {
                single: /(\/\/[^\n]*)/g,
                multi:  /(\/\*[\s\S]*?\*\/)/g,
            },
            c: {
                single: /(\/\/[^\n]*)/g,
                multi:  /(\/\*[\s\S]*?\*\/)/g,
            },
            cpp: {
                single: /(\/\/[^\n]*)/g,
                multi:  /(\/\*[\s\S]*?\*\/)/g,
            },
            csharp: {
                single: /(\/\/[^\n]*)/g,
                multi:  /(\/\*[\s\S]*?\*\/)/g,
            },
            cs: {
                single: /(\/\/[^\n]*)/g,
                multi:  /(\/\*[\s\S]*?\*\/)/g,
            },
            go: {
                single: /(\/\/[^\n]*)/g,
                multi:  /(\/\*[\s\S]*?\*\/)/g,
            },
            rust: {
                single: /(\/\/[^\n]*)/g,
                multi:  /(\/\*[\s\S]*?\*\/)/g,
            },
            swift: {
                single: /(\/\/[^\n]*)/g,
                multi:  /(\/\*[\s\S]*?\*\/)/g,
            },
            kotlin: {
                single: /(\/\/[^\n]*)/g,
                multi:  /(\/\*[\s\S]*?\*\/)/g,
            },
            scala: {
                single: /(\/\/[^\n]*)/g,
                multi:  /(\/\*[\s\S]*?\*\/)/g,
            },
            dart: {
                single: /(\/\/[^\n]*)/g,
                multi:  /(\/\*[\s\S]*?\*\/)/g,
            },
            php: {
                single: /(\/\/[^\n]*|#[^\n]*)/g,
                multi:  /(\/\*[\s\S]*?\*\/)/g,
            },
            // Hash-style single-line only
            python: {
                single: /(#[^\n]*)/g,
                multi:  null,
            },
            ruby: {
                single: /(#[^\n]*)/g,
                multi:  null,
            },
            perl: {
                single: /(#[^\n]*)/g,
                multi:  null,
            },
            r: {
                single: /(#[^\n]*)/g,
                multi:  null,
            },
            bash: {
                single: /(#[^\n]*)/g,
                multi:  null,
            },
            sh: {
                single: /(#[^\n]*)/g,
                multi:  null,
            },
            shell: {
                single: /(#[^\n]*)/g,
                multi:  null,
            },
            powershell: {
                single: /(#[^\n]*)/g,
                multi:  null,
            },
            yaml: {
                single: /(#[^\n]*)/g,
                multi:  null,
            },
            toml: {
                single: /(#[^\n]*)/g,
                multi:  null,
            },
            // Lua
            lua: {
                single: /(--[^\n]*)/g,
                multi:  /(--\[\[[\s\S]*?\]\])/g,
            },
            // SQL
            sql: {
                single: /(--[^\n]*)/g,
                multi:  /(\/\*[\s\S]*?\*\/)/g,
            },
            // HTML / XML
            html: {
                single: null,
                multi:  /(<!--[\s\S]*?-->)/g,
            },
            xml: {
                single: null,
                multi:  /(<!--[\s\S]*?-->)/g,
            },
            // CSS / SCSS / Less
            css: {
                single: null,
                multi:  /(\/\*[\s\S]*?\*\/)/g,
            },
            scss: {
                single: /(\/\/[^\n]*)/g,
                multi:  /(\/\*[\s\S]*?\*\/)/g,
            },
            less: {
                single: /(\/\/[^\n]*)/g,
                multi:  /(\/\*[\s\S]*?\*\/)/g,
            },
            // Haskell / Elm
            haskell: {
                single: /(--[^\n]*)/g,
                multi:  /(\{-[\s\S]*?-\})/g,
            },
            elm: {
                single: /(--[^\n]*)/g,
                multi:  /(\{-[\s\S]*?-\})/g,
            },
            // Matlab / Octave
            matlab: {
                single: /(%[^\n]*)/g,
                multi:  null,
            },
            octave: {
                single: /(%[^\n]*|#[^\n]*)/g,
                multi:  null,
            },
        };
    }

    /**
     * Reads the language identifier from a <pre> element by inspecting the
     * class list of its child <code> element (e.g. class="language-python").
     * Returns the lowercase language string, or null if not found.
     */
    getCodeBlockLanguage(preEl) {
        const codeEl = preEl.querySelector('code');
        if (!codeEl) return null;
        for (const cls of codeEl.classList) {
            if (cls.startsWith('language-')) {
                return cls.slice('language-'.length).toLowerCase();
            }
        }
        return null;
    }

    /**
     * Strips the comment marker(s) from a raw comment token and returns
     * { marker, body, trailer } so only the human-readable body is sent to
     * the translation API.
     *
     * Examples:
     *   "// Hello world"  → { marker: "// ", body: "Hello world", trailer: "" }
     *   "# Hello world"   → { marker: "# ",  body: "Hello world", trailer: "" }
     *   "/* Hello *\/"    → { marker: "/* ", body: "Hello",       trailer: " *\/" }
     *   "<!-- Hi -->"     → { marker: "<!-- ",body: "Hi",         trailer: " -->" }
     */
    splitCommentToken(raw) {
        // Single-line markers: //, #, --, %
        const singleMatch = raw.match(/^(\/\/\s*|#\s*|--\s*|%\s*)([\s\S]*)$/);
        if (singleMatch) {
            return { marker: singleMatch[1], body: singleMatch[2], trailer: '' };
        }
        // Block: /* … */
        const cBlockMatch = raw.match(/^(\/\*\s*)([\s\S]*?)(\s*\*\/)$/);
        if (cBlockMatch) {
            return { marker: cBlockMatch[1], body: cBlockMatch[2], trailer: cBlockMatch[3] };
        }
        // HTML/XML: <!-- … -->
        const htmlMatch = raw.match(/^(<!--\s*)([\s\S]*?)(\s*-->)$/);
        if (htmlMatch) {
            return { marker: htmlMatch[1], body: htmlMatch[2], trailer: htmlMatch[3] };
        }
        // Lua block: --[[ … ]]
        const luaMatch = raw.match(/^(--\[\[\s*)([\s\S]*?)(\s*\]\])$/);
        if (luaMatch) {
            return { marker: luaMatch[1], body: luaMatch[2], trailer: luaMatch[3] };
        }
        // Haskell/Elm block: {- … -}
        const haskellMatch = raw.match(/^(\{-\s*)([\s\S]*?)(\s*-\})$/);
        if (haskellMatch) {
            return { marker: haskellMatch[1], body: haskellMatch[2], trailer: haskellMatch[3] };
        }
        // Fallback: treat the whole token as body
        return { marker: '', body: raw, trailer: '' };
    }

    /**
     * Translates only the comments inside a code block element.
     *
     * Two bugs this version fixes vs. the previous one:
     *
     * Bug 1 – Translation silently skipped:
     *   The cache guard (translated === source) was triggering because we sent
     *   the full token "// some text" to the API. The comment marker "//" is
     *   identical in source and result, so the trimmed strings compared equal
     *   and the result was discarded. Fix: strip the marker first, translate
     *   only the human text body, then reattach the marker afterward.
     *
     * Bug 2 – All syntax colours disappear:
     *   The old code did `cloneCode.textContent = result`, which replaces the
     *   entire innerHTML of the <code> element with a plain string, destroying
     *   every <span> that Obsidian's syntax highlighter created. Fix: work
     *   directly on the live DOM spans that carry comment text. Obsidian and
     *   common highlighters (CodeMirror, highlight.js, Prism) mark comment
     *   spans with predictable class names; we target only those spans and
     *   update their textContent in place, leaving every other span intact.
     */
    async translateCodeBlock(preEl) {
        const lang = this.getCodeBlockLanguage(preEl);
        const patterns = lang ? AutoTranslatePlugin.CODE_COMMENT_PATTERNS[lang] : null;

        // Unknown language or no comment syntax defined – skip entirely.
        if (!patterns) return preEl.innerHTML;

        const codeEl = preEl.querySelector('code');
        if (!codeEl) return preEl.innerHTML;

        // ----------------------------------------------------------------
        // Step 1: collect all DOM nodes whose text represents a comment.
        //
        // Obsidian renders code blocks in two ways depending on whether a
        // syntax-highlight plugin is active:
        //
        //   A) Highlighted: <span class="cm-comment">// text</span>
        //      (CodeMirror uses "cm-comment"; highlight.js uses "hljs-comment";
        //       Prism uses "token comment")
        //   B) Plain: a single text node inside <code> with the full source.
        //
        // We handle both by attempting the span path first, then falling back
        // to regex-on-textContent.
        // ----------------------------------------------------------------

        const commentSpanSelectors = [
            '.cm-comment',         // CodeMirror (Obsidian default)
            '.hljs-comment',       // highlight.js
            '.token.comment',      // Prism
            'span[class*="comment"]', // generic fallback
        ];

        const commentSpans = codeEl.querySelectorAll(commentSpanSelectors.join(', '));

        if (commentSpans.length > 0) {
            // --- Path A: highlighted code, comment spans exist ---
            // Build a dedup translation map first (avoid sending duplicates to API)
            const translationMap = new Map();
            for (const span of commentSpans) {
                const raw = span.textContent;
                if (!translationMap.has(raw)) {
                    const { marker, body, trailer } = this.splitCommentToken(raw);
                    if (body.trim()) {
                        const translatedBody = await this.translateSegment(body);
                        translationMap.set(raw, marker + translatedBody + trailer);
                    } else {
                        translationMap.set(raw, raw); // empty comment, keep as-is
                    }
                }
            }

            // Clone the pre innerHTML, patch comment spans inside the clone,
            // then return the clone's innerHTML (keeps all other spans intact).
            const clone = document.createElement('div');
            clone.innerHTML = preEl.innerHTML;
            const clonedCommentSpans = clone.querySelectorAll(commentSpanSelectors.join(', '));
            for (const span of clonedCommentSpans) {
                const translated = translationMap.get(span.textContent);
                if (translated !== undefined) span.textContent = translated;
            }
            return clone.innerHTML;

        } else {
            // --- Path B: plain (un-highlighted) code, no comment spans ---
            // Fall back to regex matching on the raw text content.
            const originalCode = codeEl.textContent;
            const combinedPatterns = [patterns.single, patterns.multi].filter(Boolean);

            const spans = [];
            for (const regex of combinedPatterns) {
                regex.lastIndex = 0;
                let match;
                while ((match = regex.exec(originalCode)) !== null) {
                    spans.push({ start: match.index, end: match.index + match[0].length, raw: match[0] });
                }
            }

            if (!spans.length) return preEl.innerHTML;

            spans.sort((a, b) => a.start - b.start);

            const translationMap = new Map();
            for (const span of spans) {
                if (!translationMap.has(span.raw)) {
                    const { marker, body, trailer } = this.splitCommentToken(span.raw);
                    if (body.trim()) {
                        const translatedBody = await this.translateSegment(body);
                        translationMap.set(span.raw, marker + translatedBody + trailer);
                    } else {
                        translationMap.set(span.raw, span.raw);
                    }
                }
            }

            // Rebuild the plain text string with translated comments spliced in.
            let result = '';
            let cursor = 0;
            for (const span of spans) {
                if (span.start < cursor) continue;
                result += originalCode.slice(cursor, span.start);
                result += translationMap.get(span.raw) ?? span.raw;
                cursor = span.end;
            }
            result += originalCode.slice(cursor);

            // In plain mode there are no highlight spans to preserve, so
            // setting textContent on the <code> element is safe.
            const clone = document.createElement('div');
            clone.innerHTML = preEl.innerHTML;
            const cloneCode = clone.querySelector('code');
            if (cloneCode) cloneCode.textContent = result;
            return clone.innerHTML;
        }
    }

    // ---------- Core translation logic ----------
    async translateElement(el) {
        const originalHTML = this.originalContents.get(el);
        if (!originalHTML) return '';

        try {
            // Code blocks get their own path: only comments are translated,
            // the rest of the code is left completely untouched.
            if (el.tagName === 'PRE') {
                return await this.translateCodeBlock(el);
            }

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
                    // Only cache when the translation is actually different from the
                    // source text. If they match, the content was already in the target
                    // language and storing it would create a redundant
                    // "Target language → Target language" cache entry.
                    if (translated.trim() !== text.trim()) {
                        this.cache[text] = translated;
                        this.saveCacheDebounced();
                    }
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
        // Never force a text direction on code blocks — the code itself is
        // always LTR regardless of the target language, and applying dir="rtl"
        // to the <pre> flips the entire block layout.
        if (el.tagName !== 'PRE') {
            if (this.settings.targetLanguage === 'ar') el.setAttribute('dir', 'rtl');
            else el.removeAttribute('dir');
        }
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

        this.renderImageTranslationSettings(containerEl);
        this.renderDntAndMt(containerEl);
    }

    renderImageTranslationSettings(containerEl) {
        containerEl.createEl('h3', { text: 'Image Translation (Google Lens style)' });

        new Setting(containerEl)
            .setName('Enable image translation')
            .setDesc('Detect and translate text found in images, overlaid directly on the image.')
            .addToggle(t => t
                .setValue(this.plugin.settings.imageTranslationEnabled)
                .onChange(async v => {
                    this.plugin.settings.imageTranslationEnabled = v;
                    await this.plugin.saveSettings();
                    this.display();
                })
            );

        if (!this.plugin.settings.imageTranslationEnabled) return;

        new Setting(containerEl)
            .setName('Image translation service')
            .setDesc('Gemini can read images natively. Google Cloud Vision uses the Vision API for OCR then translates each block.')
            .addDropdown(d => d
                .addOption('gemini', 'Gemini AI (recommended — uses existing key)')
                .addOption('google-vision', 'Google Cloud Vision + Translate')
                .setValue(this.plugin.settings.imageTranslationService)
                .onChange(async v => {
                    this.plugin.settings.imageTranslationService = v;
                    await this.plugin.saveSettings();
                    this.display();
                })
            );

        if (this.plugin.settings.imageTranslationService === 'gemini') {
            const hasKey = !!this.plugin.settings.geminiApiKey;
            containerEl.createEl('p', {
                text: hasKey
                    ? '✓ Uses the Gemini API key configured above.'
                    : '⚠ Please configure a Gemini API key in the Translation Service section above.',
                cls: 'setting-item-description'
            });
            // Test image translation
            new Setting(containerEl)
                .setName('Test image translation')
                .setDesc('Sends a small test image to Gemini to verify image OCR works.')
                .addButton(btn => btn.setButtonText('Test').onClick(async () => {
                    btn.setButtonText('Testing…');
                    btn.setDisabled(true);
                    try {
                        // Create a tiny canvas with text as a test image
                        const canvas = document.createElement('canvas');
                        canvas.width = 200; canvas.height = 60;
                        const ctx = canvas.getContext('2d');
                        ctx.fillStyle = '#fff'; ctx.fillRect(0,0,200,60);
                        ctx.fillStyle = '#000'; ctx.font = '22px sans-serif';
                        ctx.fillText('Hello World', 20, 38);
                        const b64 = canvas.toDataURL('image/png').split(',')[1];
                        const langName = this.plugin.getLanguageName(this.plugin.settings.targetLanguage);
                        const regions = await this.plugin.translateImageWithGemini(b64, langName);
                        if (regions.length > 0) {
                            new Notice(`✓ Image translation works! Found: "${regions[0].translated}"`);
                        } else {
                            new Notice('⚠ No text detected in test image.');
                        }
                    } catch (e) {
                        new Notice(`⨉ ${e.message}`);
                    } finally {
                        btn.setButtonText('Test');
                        btn.setDisabled(false);
                    }
                }));
        }

        if (this.plugin.settings.imageTranslationService === 'google-vision') {
            new Setting(containerEl)
                .setName('Google Cloud Vision API Key')
                .setDesc('Create a key at console.cloud.google.com → APIs & Services. Enable "Cloud Vision API" and "Cloud Translation API".')
                .addText(t => t
                    .setPlaceholder('AIza…')
                    .setValue(this.plugin.settings.googleVisionApiKey)
                    .onChange(async v => {
                        this.plugin.settings.googleVisionApiKey = v;
                        await this.plugin.saveSettings();
                    })
                );
        }
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