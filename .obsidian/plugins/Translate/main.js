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
    imageTranslationService: 'simple',      // 'simple' | 'gemini' | 'google-vision'
    googleVisionApiKey: '',               // for Google Cloud Vision + Translate
    // Background style for image translation overlays:
    //   'inpaint' – gradient reconstructed from border strips (original artistic mode)
    //   'solid'   – flat color sampled from surrounding pixels (robust, best for text-heavy images)
    //   'static'  – semi-transparent dark frosted-glass panel (fastest, always readable)
    dynamicBackground: 'inpaint',
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
        // Images are translated on a separate queue/loop from text so a slow
        // image (OCR + translation + inpainting) never blocks text elements
        // further down the page from being translated and shown.
        this.imageQueue = [];
        this.imageProcessing = false;
        this.imageInFlight = new Set(); // images currently being translated (async gap guard)
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
        this.registerEvent(this.app.workspace.on('layout-change', () => this.reinitializeLayout()));
        this.registerEvent(this.app.metadataCache.on('changed', (file) => {
            if (this.currentFile && file.path === this.currentFile.path) {
                this.reinitialize();
            }
        }));

        this.addSettingTab(new AutoTranslateSettingTab(this.app, this));

        this.addCommand({
            id: 'clear-image-translation-cache',
            name: 'Clear image translation',
            callback: () => this.clearImageTranslationCache(),
        });

        // Opens a small modal so the user can pick the overlay background mode
        // from the command palette without having to open the settings tab.
        this.addCommand({
            id: 'switch-image-overlay-mode',
            name: 'Image overlay Switcher',
            callback: () => new OverlayModeSwitchModal(this.app, this).open(),
        });

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
        // Migrate old boolean dynamicBackground to the new string enum.
        if (this.settings.dynamicBackground === true)  this.settings.dynamicBackground = 'inpaint';
        if (this.settings.dynamicBackground === false) this.settings.dynamicBackground = 'static';
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
        this.imageQueue = [];
        this.imageProcessing = false;
        this.imageInFlight = new Set();
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

    /**
     * Clears BOTH the persistent disk cache (img-cache.json, keyed by image
     * src URL — the thing that makes an already-translated image skip
     * retranslation forever, even across Obsidian restarts and plugin
     * updates, since it's checked before any translation logic runs) and
     * the in-memory caches/overlays for the current note, then immediately
     * re-scans so images are retranslated right away instead of requiring
     * a manual note switch.
     */
    /**
     * Opens a modal letting the user choose between clearing all cached images
     * or selecting specific ones to remove.
     */
    async clearImageTranslationCache() {
        new ClearImgCacheModal(this.app, this).open();
    }

    /** Internal: wipe the entire image cache and retranslate everything. */
    async _clearAllImgCache() {
        this.imgCache = {};
        await this.saveImgCache(this.imgCache);
        for (const wrapper of this.imageOverlays.values()) {
            this.unwrapImageOverlay(wrapper);
        }
        this.imageOverlays.clear();
        this.imageTranslationCache.clear();
        await this.reinitialize();
        new Notice('All image translation cache cleared.');
    }

    /** Internal: remove a specific set of src-keyed entries from the image cache. */
    async _clearImgCacheKeys(keys) {
        for (const k of keys) delete this.imgCache[k];
        await this.saveImgCache(this.imgCache);
        for (const [imgEl, wrapper] of this.imageOverlays.entries()) {
            if (keys.has(this.getImgCacheKey(imgEl))) {
                this.unwrapImageOverlay(wrapper);
                this.imageOverlays.delete(imgEl);
                this.imageTranslationCache.delete(imgEl);
            }
        }
        await this.reinitialize();
        new Notice(`Removed ${keys.size} cached image${keys.size !== 1 ? 's' : ''}.`);
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

    /**
     * Returns true if imgEl is the banner rendered by the Obsidian Banner
     * plugin. The plugin wraps the banner <img> in a container that carries
     * the .banner-image class, so we check the ancestor rather than the
     * element itself. This also means the same image URL used inside the
     * note body is correctly allowed through for translation.
     */
    isBannerImage(imgEl) {
        // The Obsidian Banner plugin renders the banner <img> inside a wrapper
        // element that carries the .banner-image class. Checking the ancestor is
        // both necessary (the class is on the wrapper, not the <img> itself) and
        // sufficient — it identifies the banner by its DOM position rather than
        // by src URL, so the same image used again inside the note body is not
        // incorrectly excluded from translation.
        return !!imgEl.closest('.banner-image');
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

    /**
     * Lightweight re-initialization triggered by layout-change events (sidebar
     * open/close, panel resize, splitter drag, etc.).
     *
     * Unlike reinitialize(), this does NOT tear down image overlays.
     * Removing and re-applying overlays on every layout-change is what caused
     * translated image captions to disappear whenever the sidebar was touched:
     *   1. layout-change fires → reinitialize() → cleanup() removes all overlays
     *      and clears imageTranslationCache.
     *   2. observeTargets() re-queues the raw <img> elements.
     *   3. applyImageOverlay() is async, so there is a visible gap where the
     *      image has no overlay at all.
     *   4. For cached images the disk-cache (imgCache) is checked, but
     *      applyImageOverlay still has to do async canvas/pixel work, so the
     *      gap is noticeable.
     *
     * Instead, for layout changes within the same note and view we:
     *   - Do nothing if the active file/view hasn't changed.
     *   - Fall back to a full reinitialize() only when the note or view really
     *     did change (e.g. the user switched notes via the sidebar).
     */
    async reinitializeLayout() {
        const activeFile = this.app.workspace.getActiveFile();
        const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);

        // If the file or view is genuinely different, do a full reset.
        const sameFile = activeFile && this.currentFile && activeFile.path === this.currentFile.path;
        const sameView = activeView && this.currentView && activeView === this.currentView;

        if (!sameFile || !sameView) {
            return this.reinitialize();
        }

        // Same note, same view — the layout just reflowed (sidebar toggled, panel
        // resized, etc.). Image overlays are still in the DOM and correct; we only
        // need to re-observe text targets in case new ones appeared, and re-seed
        // the ResizeObserver-driven --ati-h variable so font sizes stay accurate.
        const previewEl = activeView.contentEl.querySelector('.markdown-reading-view, .markdown-preview-view');
        if (!previewEl) return;

        // Re-observe text targets (harmless if already observed — the
        // IntersectionObserver deduplicates internally).
        if (this.observer) {
            this.observeTargets(previewEl);
        }

        // Update --ati-h on every wrapper so overlay font sizes reflect the
        // new rendered dimensions after the layout reflow.
        for (const [imgEl, wrapper] of this.imageOverlays) {
            if (wrapper.isConnected) {
                const h = wrapper.offsetHeight || imgEl.offsetHeight || 0;
                if (h > 0) wrapper.style.setProperty('--ati-h', h + 'px');
            }
        }
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
            const images = container.querySelectorAll('img');
            for (const img of images) {
                if (this.imageOverlays.has(img)) continue;   // already translated
                if (this.imageInFlight.has(img)) continue;   // currently being translated
                if (this.imageQueue.includes(img)) continue; // already queued
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

    // ---------- Image Translation ----------

    /**
     * Returns a stable cache key for an image element.
     * img.src (the DOM property) can be a blob: URL that changes on every
     * re-render. img.getAttribute('src') returns the raw attribute value
     * (vault path / app:// URL) which is stable across reinitializations,
     * so it is used as the persistent imgCache key instead.
     */
    getImgCacheKey(imgEl) {
        return imgEl.getAttribute('src') || imgEl.src || '';
    }

    async queueImageTranslation(imgEl) {
        if (this.imageOverlays.has(imgEl)) return; // already processed
        if (this.imageInFlight.has(imgEl)) return;  // currently being translated (async gap guard)

        // Banner images are filtered out at observation time (observeTargets +
        // applyTranslation re-queue both call isBannerImage). This is a final
        // safety net in case an image slips through (e.g. loaded after observe).
        if (this.isBannerImage(imgEl)) return;

        // Check in-memory cache first
        if (this.imageTranslationCache.has(imgEl)) {
            await this.applyImageOverlay(imgEl, this.imageTranslationCache.get(imgEl));
            return;
        }

        // Check persistent img-cache.json by stable src key
        const cacheKey = this.getImgCacheKey(imgEl);
        if (cacheKey && this.imgCache[cacheKey]) {
            const cached = this.imgCache[cacheKey];
            this.imageTranslationCache.set(imgEl, cached);
            await this.applyImageOverlay(imgEl, cached);
            return;
        }

        // Defer until image is loaded
        if (!imgEl.complete || imgEl.naturalWidth === 0) {
            imgEl.addEventListener('load', () => this.queueImageTranslation(imgEl), { once: true });
            return;
        }

        // Images run on their own queue (see processImageQueue), independent
        // of the text queue, so a slow image never blocks text queued after it.
        if (this.imageQueue.includes(imgEl)) return;
        this.imageQueue.push(imgEl);
        if (!this.imageProcessing) this.processImageQueue();
    }

    /**
     * Separate processing loop for images, running independently of
     * processQueue() (text). Both loops are driven by the same async event
     * loop and neither awaits the other, so a slow image translation (OCR +
     * AI translation + inpainting) no longer holds up text elements further
     * down the page — text keeps being translated and displayed while an
     * image is still in flight, instead of queueing up behind it.
     */
    async processImageQueue() {
        if (this.imageProcessing) return;
        this.imageProcessing = true;

        while (this.imageQueue.length > 0) {
            const imgEl = this.imageQueue.shift();
            if (!imgEl.isConnected) continue;
            if (this.imageOverlays.has(imgEl)) continue;
            this.imageInFlight.add(imgEl);
            try {
                const regions = await this.translateImage(imgEl);
                this.imageTranslationCache.set(imgEl, regions);
                // Persist to img-cache.json keyed by stable src attribute
                const cacheKey = this.getImgCacheKey(imgEl);
                if (cacheKey) {
                    this.imgCache[cacheKey] = regions;
                    this.saveImgCacheDebounced();
                }
                await this.applyImageOverlay(imgEl, regions);
            } catch (err) {
                console.error('Image translation failed:', err);
            } finally {
                this.imageInFlight.delete(imgEl);
            }
            if (this.imageQueue.length > 0) await sleep(this.settings.translationDelay);
        }
        this.imageProcessing = false;
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

        if (service === 'simple') {
            return await this.translateImageSimple(imgEl);
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

    /**
     * Returns true if `text` contains no letters in any script — i.e. it's
     * made up entirely of symbols, arrows, math operators, digits, or
     * punctuation (e.g. "→", "±", "50%", "©"). OCR/Vision frequently detect
     * a lone symbol like this as its own text region; there is nothing to
     * translate, and sending it to a translation API risks it being mangled
     * into something else even though it should stay untouched.
     */
    isSymbolOnlyText(text) {
        const trimmed = (text || '').trim();
        if (!trimmed) return true;
        return !/\p{L}/u.test(trimmed);
    }

    /**
     * Translate a single OCR'd line/block of image text. Routes through the
     * same translateSegment() pipeline used for regular page text, so manual
     * translation rules and "do not translate" terms apply exactly the same
     * way inside images as they do everywhere else. Symbol-only text (arrows,
     * operators, standalone punctuation) is left untouched instead of being
     * sent to the translation API.
     */
    async translateImageText(text) {
        if (this.isSymbolOnlyText(text)) return text;
        try {
            return await this.translateSegment(text);
        } catch (err) {
            console.warn('Image text translation failed, keeping original:', err);
            return text;
        }
    }

    // ---------- simple provider: OCR.space (helloworld key) + Google Translate ----------

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
     *               simple public "helloworld" key — no registration needed.
     *               500 req/day per IP. Returns line+word bounding boxes.
     *   Translate - Same service as normal text (Google Translate by default)
     *               Completely simple, no key, CORS-enabled,
     *               5,000 chars/day per IP.
     */
    async translateImageSimple(imgEl) {
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

        // Step 2: build a geometry+text descriptor per OCR line — no
        // translation yet. OCR.space only gives us line-level data, so we
        // group adjacent lines into paragraphs ourselves before translating.
        const rawLines = [];
        for (const line of lines) {
            const words = line.Words || [];
            if (words.length === 0) continue;
            const lineText = words.map(w => w.WordText).join(' ').trim();
            if (!lineText) continue;

            const left   = Math.min(...words.map(w => w.Left));
            const top    = Math.min(...words.map(w => w.Top));
            const right  = Math.max(...words.map(w => w.Left + w.Width));
            const bottom = Math.max(...words.map(w => w.Top  + w.Height));

            // Estimate font size as a fraction of image height from the line bounding box.
            // Bold heuristic: if the average word height is > 60% of the average word width,
            // it is likely bold (taller-than-wide stroke ratio typical of bold type).
            const avgWordW = words.reduce((s, w) => s + w.Width, 0) / words.length;
            const avgWordH = words.reduce((s, w) => s + w.Height, 0) / words.length;

            rawLines.push({
                text: lineText,
                x: left           / imgW,
                y: top            / imgH,
                w: (right - left) / imgW,
                h: (bottom - top) / imgH,
                fontSize: (bottom - top) / imgH,
                bold: avgWordH > 0 && (avgWordH / avgWordW) > 0.6,
            });
        }

        // Step 3: group lines that make up one paragraph so the whole
        // paragraph can be translated together as a single coherent unit —
        // preserving sentence flow and context across line breaks — instead
        // of translating each line in isolation. A line that stands apart
        // (heading, caption, isolated label) stays its own single-line group.
        const groups = this.groupIntoParagraphs(rawLines);

        // Step 4: translate each group once and build its merged region
        const results = [];
        for (const group of groups) {
            const mergedText = group.map(l => l.text).join(' ').trim();
            if (!mergedText) continue;

            const translated = await this.translateImageText(mergedText);

            const x = Math.min(...group.map(l => l.x));
            const y = Math.min(...group.map(l => l.y));
            const right  = Math.max(...group.map(l => l.x + l.w));
            const bottom = Math.max(...group.map(l => l.y + l.h));

            results.push({
                original:   mergedText,
                translated: translated,
                x, y,
                w: right - x,
                h: bottom - y,
                fontSize: this.medianOf(group.map(l => l.fontSize)),
                bold:     group[0].bold,
                color:    null, // resolved later in applyImageOverlay via pixel simpling
            });
            await sleep(60);
        }
        return results;
    }

    async translateImageWithGemini(base64, langName) {
        if (!this.settings.geminiApiKey) throw new Error('Gemini API key not configured');

        const model = this.settings.geminiModel || 'gemini-2.5-flash';
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${this.settings.geminiApiKey}`;

        // NOTE: Gemini is used here purely for OCR + layout/style detection
        // (original text, position, color, weight, font size) — NOT for the
        // actual translation. Translation happens afterward via
        // translateImageText()/translateSegment(), the same pipeline every
        // other translation path uses. This guarantees manual translation
        // rules and "do not translate" terms are honored consistently,
        // instead of depending on an image-specific AI prompt to obey them.
        const prompt = `You are a professional OCR text extractor.
Examine this image and find ALL visible text (signs, labels, captions, UI text, handwriting, etc.), EXCEPT standalone symbols, arrows, or mathematical operators with no accompanying words (e.g. a lone "→", "±", "×") — skip those entirely, they are not text to extract.
If the image contains multiple distinct paragraphs of body text — even ones sitting close together in the same column with no large gap between them — treat each paragraph as its OWN separate region. Never merge two or more paragraphs into a single region's "original" text.
For each distinct text region, return a JSON object with these fields:
  - "original": the exact original text as it appears in the image, transcribed verbatim (do NOT translate it here)
  - "x": left edge of the text region as a fraction of image width (0.0 to 1.0). Be precise — measure the actual left edge of the text's ink, not an approximate or padded box.
  - "y": top edge of the text region as a fraction of image height (0.0 to 1.0). Be precise — measure the actual top edge of the text's ink.
  - "w": width of the text region as a fraction of image width (0.0 to 1.0), tightly matching the text's actual rightmost extent.
  - "h": height of the text region as a fraction of image height (0.0 to 1.0), tightly matching the text's actual bottom extent.
  - "color": the approximate hex color of the text (e.g. "#ffffff", "#000000", "#ff0000"). Simple the dominant text stroke color.
  - "bold": true if the text appears bold/heavy weight, false otherwise
  - "fontSize": estimated font size relative to image height as a fraction (0.0 to 1.0), e.g. 0.05 for text that is 5% of the image height

Return ONLY a JSON array of these objects. If no text is found, return [].
Example: [{"original":"Hello","x":0.1,"y":0.05,"w":0.4,"h":0.08,"color":"#ffffff","bold":true,"fontSize":0.06}]`;

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
        const rawRegions = JSON.parse(clean).filter(r => r && typeof r.original === 'string' && r.original.trim());

        // Group lines that make up one paragraph so the whole paragraph gets
        // translated together as a single coherent unit — preserving
        // sentence flow and context across line breaks — rather than each
        // line being translated in isolation. This also acts as a safety
        // net if Gemini's own OCR happened to split one paragraph into
        // several line-level regions despite the prompt's instruction above.
        const groups = this.groupIntoParagraphs(rawRegions);

        const regions = [];
        for (const group of groups) {
            const mergedText = group.map(r => r.original).join(' ').trim();
            if (!mergedText) continue;

            // Translate through the shared pipeline (applies manual rules /
            // DNT / symbol filtering) rather than trusting an inline
            // translation from the vision model.
            const translated = await this.translateImageText(mergedText);

            const x = Math.min(...group.map(r => r.x));
            const y = Math.min(...group.map(r => r.y));
            const right  = Math.max(...group.map(r => r.x + r.w));
            const bottom = Math.max(...group.map(r => r.y + r.h));
            const sizes = group.map(r => r.fontSize).filter(f => typeof f === 'number' && f > 0);

            regions.push({
                original: mergedText,
                translated,
                x, y,
                w: right - x,
                h: bottom - y,
                fontSize: sizes.length ? this.medianOf(sizes) : group[0].fontSize,
                bold:  group[0].bold,
                color: group[0].color,
            });
        }
        return regions;
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

        // Step 2: translate each PARAGRAPH's text — not each block. A Vision
        // "block" can span multiple distinct paragraphs (very common in dense
        // article body text with no big gap between them), which would merge
        // separate paragraphs into one oversized region with one flattened,
        // concatenated string. Vision exposes a bounding box per paragraph
        // too, so we use that as the actual region unit instead.
        const results = [];
        for (const block of blocks) {
            for (const paragraph of (block.paragraphs || [])) {
                const words = paragraph.words || [];
                const paraText = words
                    .map(w => w.symbols?.map(s => s.text).join('') ?? '')
                    .join(' ')
                    .trim();
                if (!paraText) continue;

                const vs = paragraph.boundingBox?.vertices || [];
                if (vs.length < 4) continue;

                const xs = vs.map(v => v.x || 0);
                const ys = vs.map(v => v.y || 0);
                const bx = Math.min(...xs), by = Math.min(...ys);
                const bw = Math.max(...xs) - bx;
                const bh = Math.max(...ys) - by;

                const translated = await this.translateImageText(paraText);

                // Derive font size from the average INDIVIDUAL WORD height,
                // not the paragraph box height — a paragraph can legitimately
                // span several original lines, and using the whole box's
                // height would wildly overestimate the actual glyph size.
                let avgH = 0, avgW = 0;
                if (words.length > 0) {
                    avgH = words.reduce((s, w) => {
                        const ys2 = (w.boundingBox?.vertices || []).map(v => v.y || 0);
                        return s + (Math.max(...ys2) - Math.min(...ys2));
                    }, 0) / words.length;
                    avgW = words.reduce((s, w) => {
                        const xs2 = (w.boundingBox?.vertices || []).map(v => v.x || 0);
                        return s + (Math.max(...xs2) - Math.min(...xs2));
                    }, 0) / words.length;
                }
                const fontSizeFrac = (avgH > 0 ? avgH : bh) / imgH;
                const boldEstimate = avgH > 0 && avgW > 0 && (avgH / avgW) > 0.6;

                results.push({
                    original: paraText,
                    translated,
                    x: bx / imgW,
                    y: by / imgH,
                    w: bw / imgW,
                    h: bh / imgH,
                    fontSize: fontSizeFrac,
                    bold: boldEstimate,
                    color: null, // resolved later in applyImageOverlay via pixel simpling
                });
                await sleep(80);
            }
        }
        return results;
    }

    /**
     * Simple the dominant text (foreground) color from a region of the image.
     * Strategy: fetch a small canvas of the region, compute the two most common
     * "poles" of color (darkest cluster vs lightest cluster via luminance split),
     * then return whichever cluster's average is more saturated/distinct vs. the
     * background (i.e. the smaller cluster if the region has clear foreground text).
     * Falls back to '#000000' on CORS failure.
     * Returns a CSS hex string like '#1a2b3c'.
     */
    async simpleTextColor(imgEl, region) {
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

            // Down-simple to at most 20×20 for speed
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
     * Solid mode: estimate the background color of a text region by sampling
     * pixels from a border ring OUTSIDE the OCR bounding box.
     * Returns { avgR, avgG, avgB } or null on failure.
     *
     * Uses per-channel median so stray ink/fringe pixels can't pull the result
     * toward black. OFFSET skips the immediate anti-aliasing fringe zone;
     * BORDER is the ring thickness sampled beyond that.
     */
    async sampleBackgroundColor(imgEl, region) {
        try {
            const resp = await fetch(imgEl.src);
            if (!resp.ok) throw new Error(`fetch failed: ${resp.status}`);
            const blob = await resp.blob();
            const bitmap = await createImageBitmap(blob);

            const iw = bitmap.width;
            const ih = bitmap.height;
            const px = Math.round(region.x * iw);
            const py = Math.round(region.y * ih);
            const pw = Math.max(1, Math.round(region.w * iw));
            const ph = Math.max(1, Math.round(region.h * ih));

            const src = document.createElement('canvas');
            src.width = iw; src.height = ih;
            const sctx = src.getContext('2d');
            sctx.drawImage(bitmap, 0, 0);
            bitmap.close();
            const srcData = sctx.getImageData(0, 0, iw, ih).data;

            const getPixel = (x, y) => {
                const cx = Math.max(0, Math.min(iw - 1, Math.round(x)));
                const cy = Math.max(0, Math.min(ih - 1, Math.round(y)));
                const i = (cy * iw + cx) * 4;
                return [srcData[i], srcData[i+1], srcData[i+2]];
            };

            const OFFSET = 4, BORDER = 6, STEP = 2;
            const allR = [], allG = [], allB = [];

            for (let col = 0; col < pw; col += STEP) {
                const ix = px + col;
                for (let d = OFFSET + 1; d <= OFFSET + BORDER; d++) {
                    const [r,g,b] = getPixel(ix, py - d);
                    allR.push(r); allG.push(g); allB.push(b);
                    const [r2,g2,b2] = getPixel(ix, py + ph - 1 + d);
                    allR.push(r2); allG.push(g2); allB.push(b2);
                }
            }
            for (let row = 0; row < ph; row += STEP) {
                const iy = py + row;
                for (let d = OFFSET + 1; d <= OFFSET + BORDER; d++) {
                    const [r,g,b] = getPixel(px - d, iy);
                    allR.push(r); allG.push(g); allB.push(b);
                    const [r2,g2,b2] = getPixel(px + pw - 1 + d, iy);
                    allR.push(r2); allG.push(g2); allB.push(b2);
                }
            }

            if (allR.length === 0) return null;

            const median = (arr) => {
                const s = [...arr].sort((a, b) => a - b);
                const mid = s.length >> 1;
                return s.length % 2 ? s[mid] : (s[mid-1] + s[mid]) >> 1;
            };

            return { avgR: median(allR), avgG: median(allG), avgB: median(allB) };
        } catch (_) {
            return null;
        }
    }

    /**
     * Inpaint the text region by simpling a border ring of pixels around the
     * box from the original image, then bilinearly interpolating across the
     * interior — reconstructing what the background likely looks like without
     * the text.  Returns { dataUrl, avgR, avgG, avgB } or null on CORS failure.
     *
     * Steps:
     *  1. Draw the full image onto a scratch canvas to read raw pixel data.
     *  2. For each output pixel (u, v) inside the region, compute its distance-
     *     weighted blend of the four nearest border simples:
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

            // Region in pixel coords, clamped to image bounds.
            // OFFSET skips the pixels immediately outside the OCR/Vision bounding
            // box — those very often still contain anti-aliased text-ink fringe,
            // since detected bounding boxes are rarely pixel-perfect around glyph
            // edges. BORDER is the thickness of the ring simpled beyond that gap.
            const OFFSET = 2;
            const BORDER = 5; // px ring thickness to simple for better colour accuracy
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

            // Helper: simple a clamped pixel from the source image
            const srcPx = (x, y) => {
                const cx = Math.max(0, Math.min(iw - 1, Math.round(x)));
                const cy = Math.max(0, Math.min(ih - 1, Math.round(y)));
                const i  = (cy * iw + cx) * 4;
                return [srcData[i], srcData[i+1], srcData[i+2]];
            };

            // Helper: median of a small numeric array — robust to the 1-2
            // outlier pixels (stray dark ink / anti-aliasing) that a plain
            // average would let bleed into the reconstructed background.
            const median = (arr) => {
                const s = [...arr].sort((a, b) => a - b);
                const mid = s.length >> 1;
                return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
            };

            // Helper: robust colour estimate for a set of [r,g,b] simples —
            // per-channel MEDIAN rather than mean, so a minority of dark
            // ink/fringe pixels caught in the ring can't drag the whole strip
            // (and therefore a whole interpolated row/column) toward black.
            const robustColor = (simples) => {
                const rs = simples.map(s => s[0]);
                const gs = simples.map(s => s[1]);
                const bs = simples.map(s => s[2]);
                return [median(rs), median(gs), median(bs)];
            };

            // --- Step 2: pre-simple the four border strips ---
            // Each strip is an array of [r,g,b] — the per-channel median over a
            // ring of thickness BORDER, starting OFFSET pixels out from the box.
            // leftStrip[row]   = robust colour of columns [px-OFFSET-BORDER .. px-OFFSET-1] at that row
            // rightStrip[row]  = robust colour of columns [px+pw+OFFSET .. px+pw+OFFSET+BORDER-1] at that row
            // topStrip[col]    = robust colour of rows    [py-OFFSET-BORDER .. py-OFFSET-1] at that col
            // bottomStrip[col] = robust colour of rows    [py+ph+OFFSET .. py+ph+OFFSET+BORDER-1] at that col
            const leftStrip   = new Array(ph);
            const rightStrip  = new Array(ph);
            const topStrip    = new Array(pw);
            const bottomStrip = new Array(pw);

            for (let row = 0; row < ph; row++) {
                const iy = py + row;
                const lSimples = [], rSimples = [];
                for (let d = OFFSET + 1; d <= OFFSET + BORDER; d++) {
                    lSimples.push(srcPx(px - d, iy));
                    rSimples.push(srcPx(px + pw - 1 + d, iy));
                }
                leftStrip[row]  = robustColor(lSimples);
                rightStrip[row] = robustColor(rSimples);
            }
            for (let col = 0; col < pw; col++) {
                const ix = px + col;
                const tSimples = [], bSimples = [];
                for (let d = OFFSET + 1; d <= OFFSET + BORDER; d++) {
                    tSimples.push(srcPx(ix, py - d));
                    bSimples.push(srcPx(ix, py + ph - 1 + d));
                }
                topStrip[col]    = robustColor(tSimples);
                bottomStrip[col] = robustColor(bSimples);
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
     * Median of a numeric array. Used whenever several lines' individual
     * measurements (font size, etc.) need to collapse into one
     * representative value for a merged group.
     */
    medianOf(numbers) {
        const s = [...numbers].sort((a, b) => a - b);
        const mid = s.length >> 1;
        return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
    }

    /**
     * Groups nearby, similarly-sized, horizontally-aligned items into visual
     * "paragraphs" using geometry alone (x, y, w, h, fontSize). Used both to
     * decide which OCR'd lines should be merged and translated together as
     * one paragraph — preserving sentence flow and context across line
     * breaks, instead of translating each line in isolation — and to keep a
     * rendered paragraph's line-to-line font size consistent.
     *
     * Distances are judged relative to font size rather than with a fixed
     * pixel/fraction cutoff: normal single-line spacing (top-of-line to
     * top-of-next-line) is consistently around 1.2-1.6x the font size
     * across ordinary typography, while an actual paragraph break (blank
     * line, heading margin, or a genuinely separate element) is reliably
     * larger than that. Sizes are compared with a generous tolerance
     * because OCR's "ink height" for a line — the only font-size proxy
     * available — varies noticeably line to line just from which letters
     * happen to appear (a line with descenders like "g"/"y"/"p" measures
     * taller than one without, at the exact same real font size).
     *
     * Returns an array of groups, each an array of the original input
     * objects in reading order. An item that doesn't cluster with any
     * neighbor — including standalone headings, captions, or labels — comes
     * back as its own one-item group.
     */
    groupIntoParagraphs(items) {
        if (items.length === 0) return [];
        if (items.length === 1) return [[items[0]]];

        // Work in reading order (top-to-bottom, then left-to-right) rather
        // than trusting whatever order the caller/service provided.
        const ordered = [...items].sort((a, b) => (a.y - b.y) || (a.x - b.x));

        const groups = [];
        let current = [ordered[0]];

        for (let i = 1; i < ordered.length; i++) {
            const prev = ordered[i - 1];
            const cur = ordered[i];

            // Top-to-top spacing, not the gap between ink boxes: the gap
            // between tight OCR ink boxes is itself noisy (it shrinks or
            // grows with ascender/descender content) and, worked through
            // typical line-height ratios, is frequently AS LARGE as the ink
            // height itself for perfectly normal single-spaced text — a
            // fixed small multiplier on it wrongly rejects ordinary lines.
            const topToTop = cur.y - prev.y;
            const prevSize = (typeof prev.fontSize === 'number' && prev.fontSize > 0) ? prev.fontSize : prev.h;
            const curSize  = (typeof cur.fontSize  === 'number' && cur.fontSize  > 0) ? cur.fontSize  : cur.h;
            const avgSize = (prevSize + curSize) / 2;
            // A continuation line must start *below* the previous line by at
            // least ~30% of a line-height. Items at nearly the same Y are
            // side-by-side columns (same visual row), not stacked paragraph
            // lines — merging them is what caused separate captions/columns
            // to be concatenated into one translated block.
            const sufficientlyBelow = avgSize > 0 && topToTop > avgSize * 0.3;
            const closelyStacked = sufficientlyBelow && topToTop < avgSize * 2.0;

            const haveSizes = prevSize > 0 && curSize > 0;
            const sizeRatio = haveSizes ? curSize / prevSize : 1;
            const sizesMatch = !haveSizes || (sizeRatio > 0.55 && sizeRatio < 1.8); // generous — absorbs ink-height noise, still catches a real heading-vs-body jump

            // Require horizontal overlap too, so two unrelated columns
            // sitting at the same height don't get merged just because
            // their y-ranges are close (small tolerance for ordinary jitter).
            const xOverlap = Math.min(cur.x + cur.w, prev.x + prev.w) - Math.max(cur.x, prev.x);
            const horizontallyAligned = xOverlap > 0.01; // require actual overlap, not just nearness

            if (closelyStacked && sizesMatch && horizontallyAligned) {
                current.push(cur);
            } else {
                groups.push(current);
                current = [cur];
            }
        }
        groups.push(current);
        return groups;
    }

    /**
     * Gives every line within a detected paragraph the same font size (the
     * group's median), so translated running text doesn't visually jump in
     * size from one line to the next. A region is left with its own
     * individually-estimated size whenever it sits apart from its
     * neighbors: a bigger vertical gap, a different horizontal column, or a
     * font size that's clearly different (e.g. a heading above body text).
     */
    normalizeParagraphFontSizes(regions) {
        const sized = regions.filter(r => typeof r.fontSize === 'number' && r.fontSize > 0);
        if (sized.length < 2) return;

        const groups = this.groupIntoParagraphs(sized);

        // Snap every line in a multi-line group to the group's median font
        // size. Solo regions (including standalone headings) are untouched.
        for (const group of groups) {
            if (group.length < 2) continue;
            const median = this.medianOf(group.map(r => r.fontSize));
            for (const r of group) r.fontSize = median;
        }
    }

    /**
     * Finds the largest font size (down to a minimum readable floor) at
     * which `text` fits inside a box of `boxWidthPx` x `boxHeightPx`,
     * wrapping across multiple lines if needed. This is what stops a
     * translation that's much longer than the original text (very common —
     * translations often run 20-40%+ longer) from overflowing its box and
     * spilling into a neighboring text region.
     *
     * Uses per-word wrapping for space-delimited scripts, and per-character
     * wrapping for scripts like Chinese/Japanese that don't use spaces
     * between words (detected heuristically from average "word" length).
     */
    fitFontSizeToBox(text, boxWidthPx, boxHeightPx, startingFontPx, bold) {
        if (!text || !boxWidthPx || !boxHeightPx) return startingFontPx;

        const canvas = this._measureCanvas || (this._measureCanvas = document.createElement('canvas'));
        const ctx = canvas.getContext('2d');
        const minFont = 8;

        // Detect RTL/Arabic scripts — Arabic, Hebrew, Persian, Urdu
        // These scripts must never be broken mid-word (word-break:normal),
        // so we always split only on whitespace, never per-character.
        const hasRtlChars = /[\u0600-\u06FF\u0590-\u05FF\u0750-\u077F\uFB50-\uFDFF\uFE70-\uFEFF]/.test(text);

        const words = text.split(/\s+/).filter(Boolean);
        const compact = text.replace(/\s+/g, '');
        const avgWordLen = words.length ? compact.length / words.length : 0;
        // No-space scripts (CJK etc.) wrap at any character, not just spaces.
        // But never do per-char wrapping for RTL scripts (Arabic, Hebrew etc.)
        const perChar = !hasRtlChars && avgWordLen > 6;
        const units = perChar ? [...compact] : words;
        const joiner = perChar ? '' : ' ';

        const fits = (size) => {
            ctx.font = `${bold ? '700' : '400'} ${size}px sans-serif`;
            const joinerWidth = joiner ? ctx.measureText(joiner).width : 0;
            let lines = 1, lineWidth = 0;
            for (const unit of units) {
                const uWidth = ctx.measureText(unit).width;
                const addWidth = (lineWidth > 0 ? joinerWidth : 0) + uWidth;
                if (lineWidth > 0 && lineWidth + addWidth > boxWidthPx) {
                    lines++;
                    lineWidth = uWidth;
                } else {
                    lineWidth += addWidth;
                }
            }
            const totalHeight = lines * size * 1.25; // matches overlay's line-height:1.25
            return totalHeight <= boxHeightPx * 1.0; // no extra tolerance — stay within box
        };

        let fontPx = Math.max(minFont, Math.min(startingFontPx, 72));

        if (fits(fontPx)) {
            // There is room to grow — scale up until we no longer fit, then
            // step back one to stay inside the box. This handles the case where
            // the translated text is shorter than the original (very common for
            // compact target scripts like Arabic, Chinese, etc.) and ensures the
            // rendered font matches the original visual size instead of staying
            // stuck at the OCR-estimated floor.
            const maxFont = 72;
            while (fontPx < maxFont && fits(fontPx + 1)) fontPx += 1;
        } else {
            // Text overflows at startingFontPx — shrink until it fits.
            while (fontPx > minFont && !fits(fontPx)) fontPx -= 1;
        }

        return fontPx;
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

        // Make same-paragraph lines share one consistent font size instead of
        // each line using its own independently-estimated size (headings and
        // other visually-separate text keep their own size — see method).
        this.normalizeParagraphFontSizes(regions);

        // Build wrapper
        const wrapper = document.createElement('span');
        wrapper.className = 'auto-translate-img-wrapper';

        // ── Snapshot computed style BEFORE touching the DOM ───────────────────
        // getComputedStyle must be called while the <img> is still in its
        // original position so it still matches CSS rules like `.article img`.
        // Once we reparent it into the wrapper those rules stop applying to
        // it, and a later getComputedStyle would return the browser defaults.
        //
        // We capture every layout-relevant property as resolved px/keyword
        // values and then apply them as inline styles on the wrapper so the
        // wrapper occupies exactly the same space the image used to.
        // The image itself is then told to fill the wrapper (width/height 100%)
        // so percentage-based overlay positions remain correct at any size.
        {
            const cs = getComputedStyle(imgEl);

            // Width: prefer the computed px value. If the image is sized by a
            // CSS rule like `width:40%` the computed value is the resolved px
            // equivalent (e.g. "320px") — accurate enough for the wrapper.
            // We do NOT use the raw percentage string from the stylesheet
            // because getComputedStyle always returns resolved values.
            const wrapperW   = cs.width;        // e.g. "320px"
            const wrapperH   = cs.height;       // e.g. "240px" or "auto"
            const maxW       = cs.maxWidth;     // e.g. "40%" or "none"
            const maxH       = cs.maxHeight;
            const floatVal   = cs.float;        // e.g. "left"
            const display    = cs.display === 'inline' ? 'inline-block' : cs.display;
            const vAlign     = cs.verticalAlign;
            const marginTop  = cs.marginTop;
            const marginRight= cs.marginRight;
            const marginBottom=cs.marginBottom;
            const marginLeft = cs.marginLeft;
            const borderRadius = cs.borderRadius;

            // Build wrapper inline style: take over all flow & box properties
            // from the image so nothing moves in the layout.
            let css = `display:${display};position:relative;line-height:0;`;
            if (wrapperW && wrapperW !== '0px') css += `width:${wrapperW};`;
            if (wrapperH && wrapperH !== 'auto' && wrapperH !== '0px') css += `height:${wrapperH};`;
            if (maxW && maxW !== 'none')  css += `max-width:${maxW};`;
            if (maxH && maxH !== 'none')  css += `max-height:${maxH};`;
            if (floatVal && floatVal !== 'none') css += `float:${floatVal};`;
            if (vAlign)  css += `vertical-align:${vAlign};`;
            // Re-apply margins individually so Obsidian/theme spacing is preserved.
            if (marginTop    && marginTop    !== '0px') css += `margin-top:${marginTop};`;
            if (marginRight  && marginRight  !== '0px') css += `margin-right:${marginRight};`;
            if (marginBottom && marginBottom !== '0px') css += `margin-bottom:${marginBottom};`;
            if (marginLeft   && marginLeft   !== '0px') css += `margin-left:${marginLeft};`;
            if (borderRadius && borderRadius !== '0px') css += `border-radius:${borderRadius};`;

            wrapper.style.cssText = css;

            // Strip the layout properties from the image that are now owned by
            // the wrapper; make the image fill the wrapper instead.
            // We override with inline styles (highest specificity) so any
            // stylesheet rule (like `.article img { width:40% }`) that still
            // matches the image doesn't fight us.
            imgEl.style.setProperty('width',  '100%', 'important');
            imgEl.style.setProperty('height', 'auto',  'important');
            imgEl.style.setProperty('max-width',  'none', 'important');
            imgEl.style.setProperty('float', 'none', 'important');
            imgEl.style.setProperty('margin', '0',   'important');
            imgEl.style.setProperty('border-radius', '0', 'important');
        }

        imgEl.parentNode.insertBefore(wrapper, imgEl);
        wrapper.appendChild(imgEl);

        const pct = (n) => (n * 100).toFixed(2) + '%';

        // Compute rendered image pixel dimensions (may differ from natural size due to CSS scaling).
        // These are used only for initial font-size calculation; the overlay positions
        // are all expressed as percentages of the wrapper so they remain correct
        // if the image is later resized.
        const renderedW = imgEl.offsetWidth  || imgEl.naturalWidth  || 300;
        const renderedH = imgEl.offsetHeight || imgEl.naturalHeight || 300;

        for (const region of regions) {
            const overlay = document.createElement('span');
            overlay.className = 'auto-translate-img-overlay';
            overlay.textContent = region.translated;
            // Store the region geometry and color hint on the element so
            // reapplyOverlayBackgrounds() can update the background in-place
            // when the user switches mode, without re-running OCR/translation.
            overlay.dataset.atiRegion = JSON.stringify({
                x: region.x, y: region.y, w: region.w, h: region.h,
                color: region.color || null,
            });

            let bgStyle, bgAvgR = 128, bgAvgG = 128, bgAvgB = 128;

            const bgMode = this.settings.dynamicBackground; // 'inpaint' | 'solid' | 'static'

            if (bgMode === 'inpaint') {
                // Inpaint mode: reconstruct background as a gradient image from border
                // strips. Best for artistic/complex backgrounds (textures, ripples,
                // gradients). Original logic — unchanged from old file.
                const inpainted = await this.inpaintRegion(imgEl, region);

                if (inpainted) {
                    bgStyle = `background-image:url('${inpainted.dataUrl}');background-size:100% 100%;background-repeat:no-repeat;`;
                    bgAvgR = inpainted.avgR; bgAvgG = inpainted.avgG; bgAvgB = inpainted.avgB;
                } else {
                    // Fetch failed — sample a quick average color from the image element.
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
            } else if (bgMode === 'solid') {
                // Solid mode: flat color sampled from the pixels surrounding the box.
                // Robust against text-heavy images; no banding or gradient artifacts.
                const sampled = await this.sampleBackgroundColor(imgEl, region);
                if (sampled) {
                    bgAvgR = sampled.avgR; bgAvgG = sampled.avgG; bgAvgB = sampled.avgB;
                } else {
                    try {
                        const fc = document.createElement('canvas');
                        fc.width = 8; fc.height = 8;
                        const fx = fc.getContext('2d');
                        const iw2 = imgEl.naturalWidth || imgEl.width || 1;
                        const ih2 = imgEl.naturalHeight || imgEl.height || 1;
                        fx.drawImage(imgEl,
                            Math.round(region.x * iw2), Math.round(region.y * ih2),
                            Math.round(region.w * iw2), Math.round(region.h * ih2),
                            0, 0, 8, 8);
                        const fd = fx.getImageData(0, 0, 8, 8).data;
                        let sr = 0, sg = 0, sb = 0, n = 0;
                        for (let i = 0; i < fd.length; i += 4) { sr += fd[i]; sg += fd[i+1]; sb += fd[i+2]; n++; }
                        if (n) { bgAvgR = sr/n|0; bgAvgG = sg/n|0; bgAvgB = sb/n|0; }
                    } catch (_) { /* still tainted — use midpoint grey */ }
                }
                bgStyle = `background:rgb(${bgAvgR},${bgAvgG},${bgAvgB});`;
            } else {
                // Static mode: semi-transparent black with a frosted-glass (backdrop blur)
                // effect so the text sits on a legible dark panel without hiding the image.
                bgStyle = `background:rgba(0,0,0,0.55);backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px);`;
                bgAvgR = 0; bgAvgG = 0; bgAvgB = 0;
            }

            // ── Adaptive font color ────────────────────────────────────────────
            // Static mode always gets white text (dark panel).
            // Other modes: (1) color from Gemini/service, (2) pixel-sampled text
            // color, (3) contrast fallback against the background average.
            let textColor;
            if (bgMode === 'static') {
                textColor = '#ffffff';
            } else if (region.color && /^#[0-9a-fA-F]{6}$/.test(region.color)) {
                // Trust the AI-supplied color directly
                textColor = region.color;
            } else {
                // Pixel-simple the dominant foreground color in this region
                const simpled = await this.simpleTextColor(imgEl, region);
                // Validate the simpled color isn't too close to the background
                // (which would make the text invisible). If it is, fall back to contrast.
                const hex2rgb = h => [
                    parseInt(h.slice(1,3),16),
                    parseInt(h.slice(3,5),16),
                    parseInt(h.slice(5,7),16)
                ];
                const [sr2, sg2, sb2] = hex2rgb(simpled);
                const bgLum = (0.299*bgAvgR + 0.587*bgAvgG + 0.114*bgAvgB) / 255;
                const fgLum = (0.299*sr2   + 0.587*sg2   + 0.114*sb2)   / 255;
                const contrast = Math.abs(fgLum - bgLum);
                // If contrast is very low (text matches bg), use computed contrast color
                textColor = contrast > 0.1 ? simpled : this.contrastTextColor(bgAvgR, bgAvgG, bgAvgB);
            }

            // ── Adaptive font size ─────────────────────────────────────────────
            // Start from the service's fontSize fraction (converted to px via
            // the rendered image height), or estimate from region.h if absent.
            let startingFontPx;
            if (region.fontSize && region.fontSize > 0) {
                startingFontPx = region.fontSize * renderedH;
            } else {
                // Heuristic: text height is ~75% of the region height
                startingFontPx = region.h * renderedH * 0.75;
            }
            startingFontPx = Math.max(9, Math.min(startingFontPx, 72));

            // Then shrink to fit if needed: translated text is very often
            // longer than the original (translations commonly run 20-40%+
            // longer), and a box fixed to the original text's size would let
            // that overflow spill visibly into the next text region below it.
            const boxWidthPx  = region.w * renderedW;
            const boxHeightPx = region.h * renderedH;
            const fontPx = this.fitFontSizeToBox(
                region.translated, boxWidthPx, boxHeightPx, startingFontPx, region.bold
            );

            // Convert the fitted px size to a fraction of the wrapper height
            // so the overlay font scales proportionally when the image is
            // resized (by CSS, Obsidian |size syntax, or any other means).
            // cqh (container query height) would be ideal but has limited
            // support; instead we store the fraction as a CSS custom property
            // on the wrapper and read it with a calc() that multiplies by the
            // wrapper's current height — expressed via the `1cqh` trick below.
            // Simpler and universally supported: express as a percentage of the
            // wrapper's height using the fact that `font-size` inside an
            // absolutely-positioned child CANNOT use `%` of the parent's
            // height directly — but we CAN rely on the wrapper emitting a
            // ResizeObserver-free fallback: store the fraction and use `min()`
            // with a vw/vh cap. The most compatible approach that actually
            // works in all Obsidian webviews is to store `fontFrac` as a CSS
            // variable on the wrapper and let the overlay reference it via
            // `calc(var(--ati-h) * <fraction>)` where `--ati-h` is kept in
            // sync by a ResizeObserver on the wrapper.
            const fontFrac = renderedH > 0 ? fontPx / renderedH : 0.05;

            // ── Adaptive font weight ───────────────────────────────────────────
            const fontWeight = region.bold ? '700' : '400';

            const isRtl = ['ar', 'he', 'fa', 'ur'].includes(this.settings.targetLanguage);
            overlay.style.cssText = `
                position:absolute;
                left:${pct(region.x)};top:${pct(region.y)};
                width:${pct(region.w)};height:${pct(region.h)};
                ${bgStyle}
                color:${textColor};
                font-family:${isRtl ? '"Segoe UI", Tahoma, Arial' : 'sans-serif'};
                font-size:calc(var(--ati-h, ${renderedH}px) * ${fontFrac.toFixed(5)});
                font-weight:${fontWeight};
                line-height:1.25;
                display:flex;align-items:center;justify-content:center;
                text-align:center;
                padding:1px 3px;
                box-sizing:border-box;
                border-radius:3px;
                white-space:normal;
                word-break:normal;
                overflow-wrap:break-word;
                overflow:hidden;
                pointer-events:none;
                z-index:5;
                direction:${isRtl ? 'rtl' : 'ltr'};
                text-shadow:0 0 3px ${textColor === '#ffffff' ? 'rgba(0,0,0,0.7)' : 'rgba(255,255,255,0.7)'};
            `;
            if (isRtl) {
                overlay.setAttribute('dir', 'rtl');
            }
            wrapper.appendChild(overlay);
        }

        // ── Keep --ati-h in sync with the wrapper's rendered height ───────────
        // All overlay font-sizes are expressed as `calc(var(--ati-h) * fraction)`
        // so they scale automatically whenever the user (or a theme) resizes the
        // image. We seed --ati-h with the current rendered height and then update
        // it via a ResizeObserver so it tracks the live size.
        const updateAtiH = () => {
            const h = wrapper.offsetHeight || imgEl.offsetHeight || renderedH;
            wrapper.style.setProperty('--ati-h', h + 'px');
        };
        updateAtiH(); // seed immediately
        if (typeof ResizeObserver !== 'undefined') {
            const ro = new ResizeObserver(updateAtiH);
            ro.observe(wrapper);
            // Store the observer on the wrapper element so unwrapImageOverlay
            // can disconnect it and avoid a leak.
            wrapper._atiResizeObserver = ro;
        }

        this.imageOverlays.set(imgEl, wrapper);
    }

    unwrapImageOverlay(wrapper) {
        if (!wrapper || !wrapper.isConnected) return;
        // Disconnect the ResizeObserver that keeps --ati-h up to date so it
        // doesn't hold a reference to a detached DOM node after removal.
        if (wrapper._atiResizeObserver) {
            wrapper._atiResizeObserver.disconnect();
            wrapper._atiResizeObserver = null;
        }
        const img = wrapper.querySelector('img');
        if (img) {
            // Remove every inline style we forced onto the image so that the
            // original stylesheet rules (e.g. `.article img { width:40% }`)
            // take back control cleanly.
            for (const prop of ['width', 'height', 'max-width', 'float', 'margin', 'border-radius']) {
                img.style.removeProperty(prop);
            }
            wrapper.parentNode.insertBefore(img, wrapper);
        }
        wrapper.remove();
    }

    /**
     * Update the background (and text color) of every live overlay in-place
     * to match the current dynamicBackground mode — without tearing down
     * wrappers, re-running OCR, or re-translating anything.
     *
     * Called after the user switches mode so already-rendered overlays
     * immediately reflect the new style without any flicker or re-translation.
     */
    async reapplyOverlayBackgrounds() {
        const bgMode = this.settings.dynamicBackground;

        for (const [imgEl, wrapper] of this.imageOverlays.entries()) {
            if (!wrapper.isConnected || !imgEl.isConnected) continue;

            const overlays = wrapper.querySelectorAll('.auto-translate-img-overlay');
            for (const overlay of overlays) {
                let region;
                try { region = JSON.parse(overlay.dataset.atiRegion || 'null'); } catch { region = null; }
                if (!region) continue;

                let bgStyle, bgAvgR = 128, bgAvgG = 128, bgAvgB = 128;

                if (bgMode === 'inpaint') {
                    const inpainted = await this.inpaintRegion(imgEl, region);
                    if (inpainted) {
                        bgStyle = `background-image:url('${inpainted.dataUrl}');background-size:100% 100%;background-repeat:no-repeat;`;
                        bgAvgR = inpainted.avgR; bgAvgG = inpainted.avgG; bgAvgB = inpainted.avgB;
                    } else {
                        bgStyle = `background:rgb(${bgAvgR},${bgAvgG},${bgAvgB});`;
                    }
                } else if (bgMode === 'solid') {
                    const sampled = await this.sampleBackgroundColor(imgEl, region);
                    if (sampled) {
                        bgAvgR = sampled.avgR; bgAvgG = sampled.avgG; bgAvgB = sampled.avgB;
                    }
                    bgStyle = `background:rgb(${bgAvgR},${bgAvgG},${bgAvgB});`;
                } else {
                    bgStyle = `background:rgba(0,0,0,0.55);backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px);`;
                    bgAvgR = 0; bgAvgG = 0; bgAvgB = 0;
                }

                // Recompute text color against the new background.
                let textColor;
                if (bgMode === 'static') {
                    textColor = '#ffffff';
                } else if (region.color && /^#[0-9a-fA-F]{6}$/.test(region.color)) {
                    textColor = region.color;
                } else {
                    const simpled = await this.simpleTextColor(imgEl, region);
                    const hex2rgb = h => [parseInt(h.slice(1,3),16), parseInt(h.slice(3,5),16), parseInt(h.slice(5,7),16)];
                    const [sr, sg, sb] = hex2rgb(simpled);
                    const bgLum = (0.299*bgAvgR + 0.587*bgAvgG + 0.114*bgAvgB) / 255;
                    const fgLum = (0.299*sr + 0.587*sg + 0.114*sb) / 255;
                    textColor = Math.abs(fgLum - bgLum) > 0.1 ? simpled : this.contrastTextColor(bgAvgR, bgAvgG, bgAvgB);
                }

                // Patch only the background and color properties — leave
                // position, size, font, direction, etc. untouched.
                overlay.style.cssText = overlay.style.cssText
                    .replace(/background(-image|-size|-repeat|-color)?:[^;]+;/g, '')
                    .replace(/backdrop-filter:[^;]+;/g, '')
                    .replace(/-webkit-backdrop-filter:[^;]+;/g, '')
                    .replace(/color:[^;]+;/g, '')
                    .replace(/text-shadow:[^;]+;/g, '');
                overlay.style.cssText += bgStyle +
                    `color:${textColor};` +
                    `text-shadow:0 0 3px ${textColor === '#ffffff' ? 'rgba(0,0,0,0.7)' : 'rgba(255,255,255,0.7)'};`;
            }
        }
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
            .setName('Overlay background style')
            .setDesc(
                'Artistic (gradient reconstruct): rebuilds the background by interpolating surrounding border ' +
                'pixels — best for complex/artistic images with textures, ripples, or gradients. ' +
                'Solid color: samples the dominant color from surrounding pixels — best for text-heavy images, ' +
                'no banding. ' +
                'Static panel: semi-transparent frosted-glass dark overlay — fastest, always readable.'
            )
            .addDropdown(d => d
                .addOption('inpaint', 'Artistic (gradient reconstruct)')
                .addOption('solid',   'Solid color (text-heavy images)')
                .addOption('static',  'Static panel (frosted glass)')
                .setValue(this.plugin.settings.dynamicBackground || 'inpaint')
                .onChange(async v => {
                    this.plugin.settings.dynamicBackground = v;
                    await this.plugin.saveSettings();
                })
            );

        new Setting(containerEl)
            .setName('Clear image translation cache')
            .setDesc('Remove cached translations to force re-translation of images.')
            .addButton(btn => btn
                .setButtonText('Clear cache…')
                .onClick(() => this.plugin.clearImageTranslationCache())
            );

        new Setting(containerEl)
            .setName('Image translation service')
            .setDesc('simple: no API keys needed, works immediately. Gemini/Vision require API keys but handle more languages and complex images.')
            .addDropdown(d => d
                .addOption('simple', 'OCR.space + Translate (no key required)')
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

// ---------- Overlay Mode Switch Modal ----------
/**
 * Opened by the command palette command "Image overlay: switch background mode".
 * Shows three clearly-labelled buttons — one per mode — so the user can switch
 * without opening the settings tab.
 */
class OverlayModeSwitchModal extends Modal {
    constructor(app, plugin) {
        super(app);
        this.plugin = plugin;
    }

    onOpen() {
        const { contentEl } = this;

        const modes = [
            {
                value: 'inpaint',
                label: 'Artistic',
            },
            {
                value: 'solid',
                label: 'Solid color',
            },
            {
                value: 'static',
                label: 'Frosted glass',
            },
        ];

        const current = this.plugin.settings.dynamicBackground || 'inpaint';

        for (const mode of modes) {
            const row = contentEl.createDiv();
            row.style.cssText = 'display:flex;align-items:center;gap:10px;padding:10px 0;border-bottom:1px solid var(--background-modifier-border);';

            const btn = row.createEl('button', { text: mode.label });
            btn.style.cssText = 'width:100%;flex-shrink:0;';
            if (mode.value === current) {
                btn.addClass('mod-cta');
                btn.textContent = '\u2713 ' + mode.label;
            }

            btn.addEventListener('click', async () => {
                this.plugin.settings.dynamicBackground = mode.value;
                await this.plugin.saveSettings();
                this.close();
            });
        }
    }

    onClose() {
        this.contentEl.empty();
    }
}

// ---------- Image Cache Clear Modal ----------
/**
 * Presents two options:
 *   1. Delete all cached image translations at once.
 *   2. Browse the cached images and select specific ones to remove.
 */
class ClearImgCacheModal extends Modal {
    constructor(app, plugin) {
        super(app);
        this.plugin = plugin;
        this._selectedKeys = new Set();
    }

    onOpen() {
        this.titleEl.setText('Clear image translation cache');
        this._renderChoiceView();
    }

    _renderChoiceView() {
        const { contentEl } = this;
        contentEl.empty();

        contentEl.createEl('p', {
            text: 'Choose what to clear:',
            cls: 'setting-item-description',
        });

        const btnRow = contentEl.createDiv();
        btnRow.style.cssText = 'display:flex;gap:8px;margin-top:12px;flex-wrap:wrap;';

        // ── Button 1: Delete all ──────────────────────────────────────────────
        const allBtn = btnRow.createEl('button', { text: 'Delete all cache' });
        allBtn.addClass('mod-warning');
        allBtn.addEventListener('click', async () => {
            allBtn.disabled = true;
            allBtn.textContent = 'Clearing\u2026';
            await this.plugin._clearAllImgCache();
            this.close();
        });

        // ── Button 2: Select specific ─────────────────────────────────────────
        const cacheKeys = Object.keys(this.plugin.imgCache || {});
        const selectBtn = btnRow.createEl('button', {
            text: `Select specific (${cacheKeys.length} cached)`,
        });
        selectBtn.disabled = cacheKeys.length === 0;
        selectBtn.addEventListener('click', () => this._renderListView(cacheKeys));
    }

    _renderListView(keys) {
        const { contentEl } = this;
        contentEl.empty();
        this._selectedKeys.clear();

        contentEl.createEl('p', {
            text: 'Select the images whose cache you want to remove, then click "Delete selected".',
            cls: 'setting-item-description',
        });

        // Select-all toggle
        const topRow = contentEl.createDiv();
        topRow.style.cssText = 'display:flex;align-items:center;gap:8px;margin-bottom:8px;';
        const selectAllCb = topRow.createEl('input', { type: 'checkbox' });
        topRow.createEl('span', { text: 'Select all' });
        selectAllCb.addEventListener('change', () => {
            const checked = selectAllCb.checked;
            contentEl.querySelectorAll('.ati-cache-row input[type=checkbox]').forEach(cb => {
                cb.checked = checked;
                const k = cb.dataset.key;
                if (checked) this._selectedKeys.add(k);
                else this._selectedKeys.delete(k);
            });
            deleteBtn.disabled = this._selectedKeys.size === 0;
            deleteBtn.textContent = `Delete selected (${this._selectedKeys.size})`;
        });

        // Scrollable list
        const list = contentEl.createDiv();
        list.style.cssText = 'max-height:320px;overflow-y:auto;border:1px solid var(--background-modifier-border);border-radius:4px;padding:6px;margin-bottom:10px;';

        for (const key of keys) {
            const row = list.createDiv({ cls: 'ati-cache-row' });
            row.style.cssText = 'display:flex;align-items:center;gap:8px;padding:4px 2px;border-bottom:1px solid var(--background-modifier-border-hover);';

            const cb = row.createEl('input', { type: 'checkbox' });
            cb.dataset.key = key;
            cb.addEventListener('change', () => {
                if (cb.checked) this._selectedKeys.add(key);
                else this._selectedKeys.delete(key);
                const total = keys.length;
                const sel = this._selectedKeys.size;
                selectAllCb.indeterminate = sel > 0 && sel < total;
                selectAllCb.checked = sel === total;
                deleteBtn.disabled = sel === 0;
                deleteBtn.textContent = `Delete selected (${sel})`;
            });

            // Thumbnail
            const thumb = row.createEl('img');
            thumb.style.cssText = 'width:48px;height:36px;object-fit:cover;border-radius:3px;flex-shrink:0;';
            thumb.src = key;
            thumb.onerror = () => { thumb.style.display = 'none'; };

            // Label: filename portion of the src URL
            const label = row.createEl('span');
            label.style.cssText = 'font-size:0.85em;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1;color:var(--text-muted);';
            try {
                label.textContent = decodeURIComponent(key.split('/').pop().split('?')[0]) || key;
            } catch {
                label.textContent = key;
            }
        }

        // Action buttons
        const btnRow = contentEl.createDiv();
        btnRow.style.cssText = 'display:flex;gap:8px;flex-wrap:wrap;';

        const deleteBtn = btnRow.createEl('button', { text: 'Delete selected (0)' });
        deleteBtn.addClass('mod-warning');
        deleteBtn.disabled = true;
        deleteBtn.addEventListener('click', async () => {
            if (this._selectedKeys.size === 0) return;
            deleteBtn.disabled = true;
            deleteBtn.textContent = 'Deleting\u2026';
            await this.plugin._clearImgCacheKeys(new Set(this._selectedKeys));
            this.close();
        });

        const backBtn = btnRow.createEl('button', { text: '\u2190 Back' });
        backBtn.addEventListener('click', () => this._renderChoiceView());
    }

    onClose() {
        this.contentEl.empty();
    }
}