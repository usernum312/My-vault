const { Plugin, PluginSettingTab, Setting, MarkdownView, Notice, Modal, normalizePath } = require('obsidian');

const DEFAULT_SETTINGS = {
    doNotTranslate: [],
    manualTranslations: [],
    preloadDistance: 500,
    translationDelay: 100,
    targetLanguage: 'ar',
    sourceLanguage: 'auto',
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
    imageTranslationService: 'sample',      // 'sample' | 'gemini' | 'google-vision'
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
        this.imgCache = await this.loadImgCache();

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

        this.saveImgCacheDebounced = this.debounce(async () => {
            await this.saveImgCache(this.imgCache);
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
        await this.saveImgCache(this.imgCache);
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

    // ---------- Image cache file (img-cache.json) ----------
    getImgCacheFilePath() {
        return normalizePath(this.app.vault.configDir + '/plugins/Translate/img-cache.json');
    }

    async loadImgCache() {
        try {
            const raw = await this.app.vault.adapter.read(this.getImgCacheFilePath());
            return JSON.parse(raw);
        } catch {
            return {};
        }
    }

    async saveImgCache(data) {
        try {
            await this.app.vault.adapter.write(this.getImgCacheFilePath(), JSON.stringify(data, null, 2));
        } catch (e) {
            console.error('Failed to save image translation cache:', e);
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

    getBannerUrl(file) {
        if (!file) return null;
        const frontmatter = this.app.metadataCache.getFileCache(file)?.frontmatter;
        if (!frontmatter) return null;
        const bannerKey = Object.keys(frontmatter).find(key => key.toLowerCase() === 'banner');
        return bannerKey ? frontmatter[bannerKey] : null;
    }

    /**
     * Returns true if imgEl is the banner image declared in the current file's
     * frontmatter. Works for both external URLs (https://...) and vault-local paths.
     * Also catches images rendered by the Obsidian Banner plugin, which applies
     * the `.banner-image` CSS class to the banner <img> element.
     */
    isBannerImage(imgEl) {
        // Catch banner images rendered by the Obsidian Banner plugin (uses .banner-image class).
        if (imgEl.classList.contains('banner-image *')) return true;

        const bannerValue = this.getBannerUrl(this.currentFile);
        if (!bannerValue) return false;
        const srcBase = imgEl.src.split('?')[0].toLowerCase();
        const isExternal = /^https?:\/\//i.test(bannerValue);
        if (isExternal) {
            return srcBase === bannerValue.split('?')[0].toLowerCase();
        }
        // Vault-local: compare resolved app:// URL
        const bannerFile = this.app.metadataCache.getFirstLinkpathDest(bannerValue, '')
                        || this.app.vault.getAbstractFileByPath(bannerValue);
        if (bannerFile) {
            return srcBase === this.app.vault.getResourcePath(bannerFile).split('?')[0].toLowerCase();
        }
        return false;
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
        // Observe images for translation if enabled.
        // Skip: already-wrapped images, banner image (.banner-image class or
        // frontmatter match), and images nested inside a targetSelector element
        // (those are re-queued by applyTranslation after innerHTML).
        if (this.settings.imageTranslationEnabled) {
            const images = container.querySelectorAll('img:not(.banner-image *)');
            for (const img of images) {
                if (this.imageOverlays.has(img)) continue;
                if (this.isBannerImage(img)) continue;
                if (img.closest(this.targetSelectors)) continue;
                this.observer.observe(img);
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
                    // Persist to img-cache.json keyed by src URL
                    if (imgEl.src) {
                        this.imgCache[imgEl.src] = regions;
                        this.saveImgCacheDebounced();
                    }
                    await this.applyImageOverlay(imgEl, regions);
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

    async queueImageTranslation(imgEl) {
        if (this.imageOverlays.has(imgEl)) return; // already processed

        // Banner images are filtered out at observation time (observeTargets +
        // applyTranslation re-queue both call isBannerImage). This is a final
        // safety net in case an image slips through (e.g. loaded after observe).
        if (this.isBannerImage(imgEl)) return;

        // Check in-memory cache first
        if (this.imageTranslationCache.has(imgEl)) {
            await this.applyImageOverlay(imgEl, this.imageTranslationCache.get(imgEl));
            return;
        }

        // Check persistent img-cache.json by src URL
        if (imgEl.src && this.imgCache[imgEl.src]) {
            const cached = this.imgCache[imgEl.src];
            this.imageTranslationCache.set(imgEl, cached);
            await this.applyImageOverlay(imgEl, cached);
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
    /**
     * Translate text in an image.
     * Returns an array of { original, translated, x, y, w, h } region objects
     * (coordinates as fractions 0-1 of image dimensions), or [] if no text found.
     */
    async translateImage(imgEl) {
        const service = this.settings.imageTranslationService;
        const langName = this.getLanguageName(this.settings.targetLanguage);

        if (service === 'sample') {
            return await this.translateImageSample(imgEl);
        }

        // Strip the data-URI prefix to get raw base64 for Gemini / Vision APIs
        const dataUri = await this.imgToBase64DataUri(imgEl);
        const base64 = dataUri.split(',')[1];

        if (service === 'gemini') {
            return await this.translateImageWithGemini(base64, langName);
        } else if (service === 'google-vision') {
            return await this.translateImageWithGoogleVision(base64, langName);
        }
        throw new Error(`Unknown image translation service: ${service}`);
    }

    // ---------- sample provider: OCR.space (helloworld key) + Google Translate ----------

    /**
     * Convert img to base64 string (data URI prefix included).
     * Canvas first; fetch fallback for vault-local images.
     */
    async imgToBase64DataUri(imgEl) {
        try {
            const canvas = document.createElement('canvas');
            canvas.width  = imgEl.naturalWidth  || imgEl.width  || 300;
            canvas.height = imgEl.naturalHeight || imgEl.height || 300;
            canvas.getContext('2d').drawImage(imgEl, 0, 0);
            return canvas.toDataURL('image/png'); // includes "data:image/png;base64," prefix
        } catch (_) { /* cross-origin taint - fall through */ }
        const resp = await fetch(imgEl.src);
        if (!resp.ok) throw new Error(`Image fetch failed: ${resp.status}`);
        const blob = await resp.blob();
        return await new Promise((res, rej) => {
            const reader = new FileReader();
            reader.onload  = () => res(reader.result);
            reader.onerror = () => rej(new Error('FileReader failed'));
            reader.readAsDataURL(blob);
        });
    }

    /**
     * Full pipeline:
     *   OCR       - OCR.space  (https://api.ocr.space/parse/image)
     *               sample public "helloworld" key — no registration needed.
     *               500 req/day per IP. Returns line+word bounding boxes.
     *   Translate - Same service as normal text (Google Translate by default)
     *               Completely sample, no key, CORS-enabled,
     *               5,000 chars/day per IP.
     */
    async translateImageSample(imgEl) {
        // Step 1: OCR via OCR.space with public demo key
        const dataUri = await this.imgToBase64DataUri(imgEl);

        const form = new FormData();
        form.append('base64Image', dataUri);
        form.append('isOverlayRequired', 'true');
        form.append('OCREngine', '2');      // Engine 2: best balance, auto-detects language
        form.append('detectOrientation', 'true');

        const ocrResp = await fetch('https://api.ocr.space/parse/image', {
            method: 'POST',
            headers: { apikey: 'helloworld' },
            body: form
        });
        if (!ocrResp.ok) throw new Error(`OCR.space error: ${ocrResp.status}`);
        const ocrData = await ocrResp.json();

        if (ocrData.IsErroredOnProcessing) {
            throw new Error(`OCR.space: ${ocrData.ErrorMessage || 'OCR failed'}`);
        }

        // OCR.space returns Lines[], each Line has Words[]
        // Words have: WordText, Left, Top, Width, Height (pixels)
        const page = ocrData.ParsedResults?.[0];
        if (!page || page.FileParseExitCode !== 1) return [];
        const lines = page.TextOverlay?.Lines;
        if (!lines || lines.length === 0) return [];

        const imgW = imgEl.naturalWidth  || imgEl.width  || 1;
        const imgH = imgEl.naturalHeight || imgEl.height || 1;

        // Step 2: translate each line using the same service as normal text (Google Translate etc.)
        const results = [];
        for (const line of lines) {
            const words = line.Words || [];
            if (words.length === 0) continue;
            const lineText = words.map(w => w.WordText).join(' ').trim();
            if (!lineText) continue;

            const left   = Math.min(...words.map(w => w.Left));
            const top    = Math.min(...words.map(w => w.Top));
            const right  = Math.max(...words.map(w => w.Left + w.Width));
            const bottom = Math.max(...words.map(w => w.Top  + w.Height));

            let translated = lineText;
            try {
                translated = await this.translateSegment(lineText);
            } catch (err) {
                console.warn('Image line translation failed, keeping original:', err);
            }

            // Estimate font size as a fraction of image height from the line bounding box.
            // Bold heuristic: if the average word height is > 60% of the average word width,
            // it is likely bold (taller-than-wide stroke ratio typical of bold type).
            const lineH = bottom - top;
            const fontSizeFrac = lineH / imgH;
            const avgWordW = words.reduce((s, w) => s + w.Width, 0) / words.length;
            const avgWordH = words.reduce((s, w) => s + w.Height, 0) / words.length;
            const boldEstimate = avgWordH > 0 && (avgWordH / avgWordW) > 0.6;

            results.push({
                original:    lineText,
                translated:  translated,
                x: left           / imgW,
                y: top            / imgH,
                w: (right - left) / imgW,
                h: (bottom - top) / imgH,
                fontSize:    fontSizeFrac,
                bold:        boldEstimate,
                color:       null, // resolved later in applyImageOverlay via pixel sampling
            });
            await sleep(60);
        }
        return results;
    }

    async translateImageWithGemini(base64, langName) {
        if (!this.settings.geminiApiKey) throw new Error('Gemini API key not configured');

        const model = this.settings.geminiModel || 'gemini-2.5-flash';
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${this.settings.geminiApiKey}`;

        const prompt = `You are a professional image text extractor and translator.
Examine this image and find ALL visible text (signs, labels, captions, UI text, handwriting, etc.).
For each distinct text region, translate the text into natural, fluent ${langName} — the way a native speaker would phrase it, not word-for-word. Preserve the meaning and tone.
For each distinct text region, return a JSON object with these fields:
  - "original": the original text as it appears in the image
  - "translated": the text translated to ${langName}
  - "x": left edge of the text region as a fraction of image width (0.0 to 1.0)
  - "y": top edge of the text region as a fraction of image height (0.0 to 1.0)
  - "w": width of the text region as a fraction of image width (0.0 to 1.0)
  - "h": height of the text region as a fraction of image height (0.0 to 1.0)
  - "color": the approximate hex color of the text (e.g. "#ffffff", "#000000", "#ff0000"). Sample the dominant text stroke color.
  - "bold": true if the text appears bold/heavy weight, false otherwise
  - "fontSize": estimated font size relative to image height as a fraction (0.0 to 1.0), e.g. 0.05 for text that is 5% of the image height

Return ONLY a JSON array of these objects. If no text is found, return [].
Example: [{"original":"Hello","translated":"مرحبا","x":0.1,"y":0.05,"w":0.4,"h":0.08,"color":"#ffffff","bold":true,"fontSize":0.06}]`;

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

            // Derive font-size fraction and bold estimate from block dimensions.
            // Google Vision exposes per-word confidence but not explicit font weight;
            // use the block height-to-width ratio of individual words as a proxy.
            const fontSizeFrac = bh / imgH;
            const words = block.paragraphs?.flatMap(p => p.words || []) || [];
            let boldEstimate = false;
            if (words.length > 0) {
                const avgH = words.reduce((s, w) => {
                    const ys2 = (w.boundingBox?.vertices || []).map(v => v.y || 0);
                    return s + (Math.max(...ys2) - Math.min(...ys2));
                }, 0) / words.length;
                const avgW = words.reduce((s, w) => {
                    const xs2 = (w.boundingBox?.vertices || []).map(v => v.x || 0);
                    return s + (Math.max(...xs2) - Math.min(...xs2));
                }, 0) / words.length;
                boldEstimate = avgH > 0 && avgW > 0 && (avgH / avgW) > 0.6;
            }

            results.push({
                original: blockText,
                translated,
                x: bx / imgW,
                y: by / imgH,
                w: bw / imgW,
                h: bh / imgH,
                fontSize: fontSizeFrac,
                bold: boldEstimate,
                color: null, // resolved later in applyImageOverlay via pixel sampling
            });
            await sleep(80);
        }
        return results;
    }

    /**
     * Sample the dominant text (foreground) color from a region of the image.
     * Strategy: fetch a small canvas of the region, compute the two most common
     * "poles" of color (darkest cluster vs lightest cluster via luminance split),
     * then return whichever cluster's average is more saturated/distinct vs. the
     * background (i.e. the smaller cluster if the region has clear foreground text).
     * Falls back to '#000000' on CORS failure.
     * Returns a CSS hex string like '#1a2b3c'.
     */
    async sampleTextColor(imgEl, region) {
        try {
            const resp = await fetch(imgEl.src);
            if (!resp.ok) throw new Error('fetch failed');
            const blob = await resp.blob();
            const bitmap = await createImageBitmap(blob);

            const iw = bitmap.width;
            const ih = bitmap.height;
            const px = Math.round(region.x * iw);
            const py = Math.round(region.y * ih);
            const pw = Math.max(1, Math.round(region.w * iw));
            const ph = Math.max(1, Math.round(region.h * ih));

            // Down-sample to at most 20×20 for speed
            const sw = Math.min(pw, 20);
            const sh = Math.min(ph, 20);
            const sc = document.createElement('canvas');
            sc.width = sw; sc.height = sh;
            const sctx = sc.getContext('2d');
            sctx.drawImage(bitmap, px, py, pw, ph, 0, 0, sw, sh);
            bitmap.close();

            const data = sctx.getImageData(0, 0, sw, sh).data;
            let darkR = 0, darkG = 0, darkB = 0, darkN = 0;
            let lightR = 0, lightG = 0, lightB = 0, lightN = 0;

            for (let i = 0; i < data.length; i += 4) {
                const r = data[i], g = data[i+1], b = data[i+2];
                const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
                if (lum < 0.5) { darkR += r; darkG += g; darkB += b; darkN++; }
                else           { lightR += r; lightG += g; lightB += b; lightN++; }
            }

            // The "text" cluster is the minority cluster (smaller count = foreground strokes)
            // unless one cluster is near-empty, in which case pick the other.
            let r, g, b;
            if (darkN === 0) {
                r = lightR/lightN|0; g = lightG/lightN|0; b = lightB/lightN|0;
            } else if (lightN === 0) {
                r = darkR/darkN|0; g = darkG/darkN|0; b = darkB/darkN|0;
            } else if (darkN <= lightN) {
                // Dark text on light background
                r = darkR/darkN|0; g = darkG/darkN|0; b = darkB/darkN|0;
            } else {
                // Light text on dark background
                r = lightR/lightN|0; g = lightG/lightN|0; b = lightB/lightN|0;
            }

            return '#' + [r, g, b].map(v => v.toString(16).padStart(2, '0')).join('');
        } catch (_) {
            return '#000000';
        }
    }

    /**
     * Inpaint the text region by sampling a border ring of pixels around the
     * box from the original image, then bilinearly interpolating across the
     * interior — reconstructing what the background likely looks like without
     * the text.  Returns { dataUrl, avgR, avgG, avgB } or null on CORS failure.
     *
     * Steps:
     *  1. Draw the full image onto a scratch canvas to read raw pixel data.
     *  2. For each output pixel (u, v) inside the region, compute its distance-
     *     weighted blend of the four nearest border samples:
     *       left edge  → column px-1, same row interpolated to region height
     *       right edge → column px+pw, same row
     *       top edge   → row py-1, same column interpolated to region width
     *       bottom edge→ row py+ph, same column
     *     Weights are 1/distance so nearer edges dominate.
     *  3. Paint the blended colour into an output canvas and export as PNG.
     *  4. Also compute the average of the blended result for text-contrast use.
     */
    async inpaintRegion(imgEl, region) {
        try {
            // Fetch raw image bytes via fetch() to avoid the CORS canvas-taint that
            // occurs when drawing an app:// <img> element directly. createImageBitmap
            // from a Blob is not tainted, so getImageData works freely.
            const resp = await fetch(imgEl.src);
            if (!resp.ok) throw new Error(`fetch failed: ${resp.status}`);
            const blob = await resp.blob();
            const bitmap = await createImageBitmap(blob);

            const iw = bitmap.width;
            const ih = bitmap.height;

            // Region in pixel coords, clamped to image bounds
            const BORDER = 4; // px ring thickness to sample for better colour accuracy
            const px = Math.round(region.x * iw);
            const py = Math.round(region.y * ih);
            const pw = Math.max(1, Math.round(region.w * iw));
            const ph = Math.max(1, Math.round(region.h * ih));

            // --- Step 1: draw bitmap (not the <img> element) into a scratch canvas ---
            const src = document.createElement('canvas');
            src.width  = iw;
            src.height = ih;
            const sctx = src.getContext('2d');
            sctx.drawImage(bitmap, 0, 0);
            bitmap.close();
            const srcData = sctx.getImageData(0, 0, iw, ih).data;

            // Helper: sample a clamped pixel from the source image
            const srcPx = (x, y) => {
                const cx = Math.max(0, Math.min(iw - 1, Math.round(x)));
                const cy = Math.max(0, Math.min(ih - 1, Math.round(y)));
                const i  = (cy * iw + cx) * 4;
                return [srcData[i], srcData[i+1], srcData[i+2]];
            };

            // --- Step 2: pre-sample the four border strips ---
            // Each strip is an array of [r,g,b] averaged over BORDER thickness.
            // leftStrip[row]   = average of columns [px-BORDER .. px-1] at that row
            // rightStrip[row]  = average of columns [px+pw .. px+pw+BORDER-1] at that row
            // topStrip[col]    = average of rows    [py-BORDER .. py-1] at that col
            // bottomStrip[col] = average of rows    [py+ph .. py+ph+BORDER-1] at that col
            const leftStrip   = new Array(ph);
            const rightStrip  = new Array(ph);
            const topStrip    = new Array(pw);
            const bottomStrip = new Array(pw);

            for (let row = 0; row < ph; row++) {
                const iy = py + row;
                let lr = 0, lg = 0, lb = 0, rr = 0, rg = 0, rb = 0, n = 0;
                for (let d = 1; d <= BORDER; d++) {
                    const [lr2,lg2,lb2] = srcPx(px - d, iy);
                    const [rr2,rg2,rb2] = srcPx(px + pw - 1 + d, iy);
                    lr += lr2; lg += lg2; lb += lb2;
                    rr += rr2; rg += rg2; rb += rb2;
                    n++;
                }
                leftStrip[row]  = [lr/n, lg/n, lb/n];
                rightStrip[row] = [rr/n, rg/n, rb/n];
            }
            for (let col = 0; col < pw; col++) {
                const ix = px + col;
                let tr = 0, tg = 0, tb = 0, br2 = 0, bg2 = 0, bb2 = 0, n = 0;
                for (let d = 1; d <= BORDER; d++) {
                    const [tr2,tg2,tb2] = srcPx(ix, py - d);
                    const [br3,bg3,bb3] = srcPx(ix, py + ph - 1 + d);
                    tr += tr2; tg += tg2; tb += tb2;
                    br2 += br3; bg2 += bg3; bb2 += bb3;
                    n++;
                }
                topStrip[col]    = [tr/n, tg/n, tb/n];
                bottomStrip[col] = [br2/n, bg2/n, bb2/n];
            }

            // --- Step 3: for each interior pixel, blend the four edge estimates ---
            const out = document.createElement('canvas');
            out.width  = pw;
            out.height = ph;
            const octx = out.getContext('2d');
            const outImg = octx.createImageData(pw, ph);
            const od = outImg.data;

            let sumR = 0, sumG = 0, sumB = 0;

            for (let row = 0; row < ph; row++) {
                // Normalised position 0..1 along height
                const tv = row / Math.max(ph - 1, 1);

                for (let col = 0; col < pw; col++) {
                    const tu = col / Math.max(pw - 1, 1);

                    // Distance from each edge (in pixels, min 0.5 to avoid /0)
                    const dL = Math.max(0.5, col);
                    const dR = Math.max(0.5, pw - 1 - col);
                    const dT = Math.max(0.5, row);
                    const dB = Math.max(0.5, ph - 1 - row);

                    // Interpolate along each strip to the pixel's perpendicular position
                    // Left/right strips indexed by row; top/bottom by col — already aligned.
                    const [lR,lG,lB] = leftStrip[row];
                    const [rR,rG,rB] = rightStrip[row];
                    const [tR,tG,tB] = topStrip[col];
                    const [bR,bG,bB] = bottomStrip[col];

                    // Inverse-distance weights
                    const wL = 1/dL, wR = 1/dR, wT = 1/dT, wB = 1/dB;
                    const wSum = wL + wR + wT + wB;

                    const blendR = (lR*wL + rR*wR + tR*wT + bR*wB) / wSum;
                    const blendG = (lG*wL + rG*wR + tG*wT + bG*wB) / wSum;
                    const blendB = (lB*wL + rB*wR + tB*wT + bB*wB) / wSum;

                    const i = (row * pw + col) * 4;
                    od[i]   = Math.round(blendR);
                    od[i+1] = Math.round(blendG);
                    od[i+2] = Math.round(blendB);
                    od[i+3] = 255;

                    sumR += blendR; sumG += blendG; sumB += blendB;
                }
            }

            octx.putImageData(outImg, 0, 0);

            const total = pw * ph;
            const avgR = Math.round(sumR / total);
            const avgG = Math.round(sumG / total);
            const avgB = Math.round(sumB / total);

            return { dataUrl: out.toDataURL('image/png'), avgR, avgG, avgB };
        } catch (e) {
            return null; // CORS-tainted canvas or other error
        }
    }

    /**
     * Given average RGB values of the inpainted background, return '#000000'
     * or '#ffffff' for maximum text legibility (perceived luminance formula).
     */
    contrastTextColor(r, g, b) {
        const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
        return luminance > 0.5 ? '#000000' : '#ffffff';
    }

    /**
     * Wrap the image in a relative-positioned container and render
     * Google-Lens-style overlay blocks for each translated region.
     *
     * Each overlay background is the EXACT pixels from the original image
     * (captured via canvas → data-URL), fully opaque, with translated
     * text drawn on top in a contrasting color.
     * Falls back to a neutral dark block if the canvas is CORS-tainted.
     */
    async applyImageOverlay(imgEl, regions) {
        if (!imgEl.isConnected) return;
        if (this.imageOverlays.has(imgEl)) return;
        if (!regions || regions.length === 0) return;

        // Build wrapper
        const wrapper = document.createElement('span');
        wrapper.className = 'auto-translate-img-wrapper';
        wrapper.style.cssText = 'display:inline-block;position:relative;line-height:0;';

        // Service badge
        const svcMap = { 'sample': 'OCR', 'gemini': 'Gemini', 'google-vision': 'Vision' };
        const svc = svcMap[this.settings.imageTranslationService] || 'OCR';
        const badge = document.createElement('span');
        badge.className = 'auto-translate-img-badge';
        badge.textContent = svc;
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

        const pct = (n) => (n * 100).toFixed(2) + '%';

        // Compute rendered image pixel dimensions (may differ from natural size due to CSS scaling)
        const renderedW = imgEl.offsetWidth  || imgEl.naturalWidth  || 300;
        const renderedH = imgEl.offsetHeight || imgEl.naturalHeight || 300;

        for (const region of regions) {
            const overlay = document.createElement('span');
            overlay.className = 'auto-translate-img-overlay';
            overlay.textContent = region.translated;

            // Inpaint the region: reconstruct the background behind the text
            // by interpolating surrounding border pixels, then overlay the translation.
            const inpainted = await this.inpaintRegion(imgEl, region);

            let bgStyle, bgAvgR = 128, bgAvgG = 128, bgAvgB = 128;
            if (inpainted) {
                bgStyle = `background-image:url('${inpainted.dataUrl}');background-size:100% 100%;background-repeat:no-repeat;`;
                bgAvgR = inpainted.avgR; bgAvgG = inpainted.avgG; bgAvgB = inpainted.avgB;
            } else {
                // Fetch failed (network error etc.) — sample a quick average color
                // from the image element itself via a tiny canvas.
                try {
                    const fc = document.createElement('canvas');
                    fc.width = 8; fc.height = 8;
                    const fx = fc.getContext('2d');
                    const iw = imgEl.naturalWidth || imgEl.width || 1;
                    const ih = imgEl.naturalHeight || imgEl.height || 1;
                    fx.drawImage(imgEl,
                        Math.round(region.x * iw), Math.round(region.y * ih),
                        Math.round(region.w * iw), Math.round(region.h * ih),
                        0, 0, 8, 8);
                    const fd = fx.getImageData(0, 0, 8, 8).data;
                    let sr = 0, sg = 0, sb = 0, n = 0;
                    for (let i = 0; i < fd.length; i += 4) { sr += fd[i]; sg += fd[i+1]; sb += fd[i+2]; n++; }
                    if (n) { bgAvgR = sr/n|0; bgAvgG = sg/n|0; bgAvgB = sb/n|0; }
                } catch (_) { /* still tainted — use midpoint grey */ }
                bgStyle = `background:rgb(${bgAvgR},${bgAvgG},${bgAvgB});`;
            }

            // ── Adaptive font color ────────────────────────────────────────────
            // Priority: (1) color returned by Gemini/service, (2) pixel-sampled
            // text color, (3) contrast fallback against the inpainted background.
            let textColor;
            if (region.color && /^#[0-9a-fA-F]{6}$/.test(region.color)) {
                // Trust the AI-supplied color directly
                textColor = region.color;
            } else {
                // Pixel-sample the dominant foreground color in this region
                const sampled = await this.sampleTextColor(imgEl, region);
                // Validate the sampled color isn't too close to the background
                // (which would make the text invisible). If it is, fall back to contrast.
                const hex2rgb = h => [
                    parseInt(h.slice(1,3),16),
                    parseInt(h.slice(3,5),16),
                    parseInt(h.slice(5,7),16)
                ];
                const [sr2, sg2, sb2] = hex2rgb(sampled);
                const bgLum = (0.299*bgAvgR + 0.587*bgAvgG + 0.114*bgAvgB) / 255;
                const fgLum = (0.299*sr2   + 0.587*sg2   + 0.114*sb2)   / 255;
                const contrast = Math.abs(fgLum - bgLum);
                // If contrast is very low (text matches bg), use computed contrast color
                textColor = contrast > 0.1 ? sampled : this.contrastTextColor(bgAvgR, bgAvgG, bgAvgB);
            }

            // ── Adaptive font size ─────────────────────────────────────────────
            // If the service provided a fontSize fraction, convert it to pixels
            // using the rendered image height. Otherwise estimate from region.h.
            let fontPx;
            if (region.fontSize && region.fontSize > 0) {
                fontPx = region.fontSize * renderedH;
            } else {
                // Heuristic: text height is ~75% of the region height
                fontPx = region.h * renderedH * 0.75;
            }
            // Clamp to a readable range
            fontPx = Math.max(9, Math.min(fontPx, 72));

            // ── Adaptive font weight ───────────────────────────────────────────
            const fontWeight = region.bold ? '700' : '400';

            overlay.style.cssText = `
                position:absolute;
                left:${pct(region.x)};top:${pct(region.y)};
                width:${pct(region.w)};height:${pct(region.h)};
                ${bgStyle}
                color:${textColor};
                font-family:sans-serif;
                font-size:${fontPx.toFixed(1)}px;
                font-weight:${fontWeight};
                line-height:1.25;
                display:flex;align-items:center;justify-content:center;
                text-align:center;
                padding:1px 3px;
                box-sizing:border-box;
                border-radius:3px;
                word-break:break-word;
                pointer-events:none;
                z-index:5;
                text-shadow:0 0 3px ${textColor === '#ffffff' ? 'rgba(0,0,0,0.7)' : 'rgba(255,255,255,0.7)'};
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
        // Shared pattern sets reused across language aliases
        const cStyle  = { single: /(\/\/[^\n]*)/g,   multi: /(\/\*[\s\S]*?\*\/)/g };
        const hash    = { single: /(#[^\n]*)/g,       multi: null };
        const dashdash = { single: /(--[^\n]*)/g,     multi: null };
        const xmlHtml = { single: null,               multi: /(<!--[\s\S]*?-->)/g };
        const haskellStyle = { single: /(--[^\n]*)/g, multi: /(\{-[\s\S]*?-\})/g };

        return {
            // C-style: // and /* */
            javascript: cStyle, js: cStyle, typescript: cStyle,
            jsx: cStyle, tsx: cStyle,
            java: cStyle, c: cStyle, cpp: cStyle,
            csharp: cStyle, cs: cStyle,
            go: cStyle, rust: cStyle, swift: cStyle,
            kotlin: cStyle, scala: cStyle, dart: cStyle,
            scss: cStyle, less: cStyle,
            // PHP: // or # and /* */
            php: { single: /(\/\/[^\n]*|#[^\n]*)/g, multi: /(\/\*[\s\S]*?\*\/)/g },
            // Hash-style single-line only
            python: hash, ruby: hash, perl: hash, r: hash,
            bash: hash, sh: hash, shell: hash, powershell: hash,
            yaml: hash, toml: hash,
            // Lua: -- and --[[ ]]
            lua: { single: /(--[^\n]*)/g, multi: /(--\[\[[\s\S]*?\]\])/g },
            // SQL: -- and /* */
            sql: { single: dashdash.single, multi: /(\/\*[\s\S]*?\*\/)/g },
            // HTML / XML
            html: xmlHtml, xml: xmlHtml,
            // CSS: /* */ only
            css: { single: null, multi: /(\/\*[\s\S]*?\*\/)/g },
            // Haskell / Elm
            haskell: haskellStyle, elm: haskellStyle,
            // Matlab / Octave
            matlab: { single: /(%[^\n]*)/g, multi: null },
            octave: { single: /(%[^\n]*|#[^\n]*)/g, multi: null },
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

    // ---------- Sentence splitting ----------
    /**
     * Splits text into sentences for natural translation.
     * Handles common abbreviations to avoid false splits (e.g. "Dr.", "e.g.", "U.S.").
     * Returns an array of { sentence, trailing } objects where `trailing` is the
     * whitespace/newline that followed each sentence in the original.
     */
    splitIntoSentences(text) {
        // Abbreviations that should NOT trigger a sentence split
        const abbrevPattern = /\b(?:Mr|Mrs|Ms|Dr|Prof|Sr|Jr|vs|etc|e\.g|i\.e|U\.S|U\.K|Fig|Eq|No|Vol|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\./gi;
        // Temporarily replace abbreviation dots with a placeholder
        const ABBREV_PH = '\x00ABBREV\x00';
        let protected_ = text.replace(abbrevPattern, m => m.slice(0, -1) + ABBREV_PH);

        // Split on sentence-ending punctuation followed by whitespace + uppercase
        // or end of string. Keeps the punctuation with the sentence.
        const parts = [];
        const re = /([^.!?]*[.!?]+(?:\s*["""')\]»]*)?)/g;
        let lastIndex = 0;
        let match;
        while ((match = re.exec(protected_)) !== null) {
            let sentence = match[1];
            // Only treat as a split if followed by whitespace+capital or end
            const after = protected_.slice(match.index + match[0].length);
            const isEnd = after.trim() === '' || /^\s+[A-ZÀ-Ö\u0600-\u06FF\u4E00-\u9FFF]/.test(after);
            if (isEnd) {
                const trailing = sentence.match(/(\s+)$/)?.[1] ?? '';
                parts.push({ sentence: sentence.trimEnd().replace(new RegExp(ABBREV_PH, 'g'), '.'), trailing });
                lastIndex = match.index + match[0].length;
            }
        }
        // Any remaining text (no terminal punctuation)
        const remainder = protected_.slice(lastIndex).replace(new RegExp(ABBREV_PH, 'g'), '.');
        if (remainder.trim()) {
            parts.push({ sentence: remainder.trimEnd(), trailing: remainder.slice(remainder.trimEnd().length) });
        }

        // If splitting produced nothing useful (single short fragment), return as-is
        return parts.length > 0 ? parts : [{ sentence: text.trimEnd(), trailing: text.slice(text.trimEnd().length) }];
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

        // Translate sentence by sentence for natural, context-aware output.
        // Short single-sentence texts go straight through; longer or multi-sentence
        // texts are split so each sentence is translated with its own context rather
        // than as isolated words strung together.
        let translated;
        const sentences = this.splitIntoSentences(processed);
        if (sentences.length <= 1) {
            // Single sentence or very short text — translate directly
            if (processed.length > this.settings.maxChunkSize) {
                translated = await this.translateLongText(processed);
            } else {
                translated = await this.getTranslation(processed);
            }
        } else {
            // Multiple sentences — translate each one individually and rejoin
            const parts = [];
            for (let s = 0; s < sentences.length; s++) {
                const { sentence, trailing } = sentences[s];
                if (!sentence.trim()) { parts.push(sentence + trailing); continue; }
                let translatedSentence;
                if (sentence.length > this.settings.maxChunkSize) {
                    translatedSentence = await this.translateLongText(sentence);
                } else {
                    translatedSentence = await this.getTranslation(sentence);
                }
                parts.push(translatedSentence + trailing);
                if (s < sentences.length - 1) await sleep(30);
            }
            translated = parts.join('');
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
        const prompt = `You are a professional translator. Translate the following text into natural, fluent ${langName} — the way a native speaker would write it, not word-for-word. Translate sentence by sentence, preserving the meaning, tone, and intent of each sentence. Do not add, remove, or summarise content. IMPORTANT: Keep all placeholders that look like «OBS_TR_*» EXACTLY as they are (including the guillemets «»). Do not modify, translate, split, or reorder them. Return ONLY the translated text, with no preamble or explanation.\n\nText: ${text}`;

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
        // After innerHTML replacement, any <img> nodes inside this element are
        // fresh DOM nodes (the old ones were destroyed). Queue them for image
        // translation now that they exist in the live DOM.
        if (this.settings.imageTranslationEnabled) {
            for (const img of el.querySelectorAll('img')) {
                if (!this.isBannerImage(img)) this.queueImageTranslation(img);
            }
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
            .setDesc('sample: no API keys needed, works immediately. Gemini/Vision require API keys but handle more languages and complex images.')
            .addDropdown(d => d
                .addOption('sample', 'OCR.space + Translate (no key required)')
                .addOption('gemini', 'Gemini AI (uses existing Gemini key)')
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
            new Setting(containerEl)
                .setName('Test image translation')
                .setDesc('Sends a small test image to Gemini to verify image OCR works.')
                .addButton(btn => btn.setButtonText('Test').onClick(async () => {
                    btn.setButtonText('Testing…');
                    btn.setDisabled(true);
                    try {
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