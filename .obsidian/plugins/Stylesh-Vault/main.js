// ============================================================
//  StyleshVault — Obsidian Plugin
//  Refactored for readability, DRY-ness, and loose coupling.
//  External behaviour is 100% identical to the original.
// ============================================================

const {
    Plugin, PluginSettingTab, Setting, MarkdownView,
    getIcon, getIconIds, SuggestModal, TFile, TFolder,
    debounce, Menu, Modal, Notice, setIcon,
    requestUrl, arrayBufferToBase64
} = require("obsidian");

// ─────────────────────────────────────────────────────────────
//  Constants
// ─────────────────────────────────────────────────────────────

const DEFAULT_SETTINGS = {
    enableBanner:               true,
    bannerProperty:             "banner",
    bannerPositionProperty:     "banner_y",
    bannerHeight:               200,
    bannerMargin:               0,
    bannerFading:               false,
    enableIcon:                 true,
    iconProperty:               "icon",
    iconSize:                   36,
    iconTopMargin:              70,
    iconTopMarginWithoutBanner: -10,
    iconLeftMargin:             0,
    iconGap:                    10,
    bannerIconGap:              0,
    iconInTitle:                true,
    showFileExplorerIcons:      true,
    folderIcons:                {},
    hiddenProperties:           [],
    temporaryHiddenProperties:  [],
    temporaryViewTimeout:       60,
    uiProperty:                 "ui",
    enableCache:                true,
    cacheExpiryDays:            30,
    hideScrollbars:             true,
    iconColorPreferences:       {}
};

/** Video file extensions recognised for banner rendering. */
const VIDEO_EXTENSIONS = [".mp4", ".webm", ".mov"];

/** Image extensions accepted by the banner picker. */
const IMAGE_EXTENSIONS = ["png", "jpg", "jpeg", "gif", "bmp", "svg", "webp", "mp4"];

/** SVG load / image-resolve timeout in milliseconds. */
const ICON_TIMEOUT_MS = 5000;

/** Delay (ms) before a hidden property is re-hidden after focus leaves it. */
const PROPERTY_EDIT_GRACE_MS = 1000;

// ─────────────────────────────────────────────────────────────
//  Helpers (pure functions — no plugin state)
// ─────────────────────────────────────────────────────────────

/** Strip Obsidian wiki-link syntax: `![[…]]` → inner text. */
function formatImageLink(link) {
    if (!link || typeof link !== "string") return "";
    return link.replace(/^!?\[\[|\]\]$/g, "");
}

/** Return true when `str` is a single emoji character (not a path/URL). */
function isEmoji(str) {
    return /^\p{Emoji}$/u.test(str) && !str.includes(".") && !str.includes("/");
}

/** Return true when `url` points to an SVG file (ignores query strings). */
function isExternalSvgUrl(url) {
    if (!url || typeof url !== "string") return false;
    return url.split("?")[0].toLowerCase().endsWith(".svg");
}

/** Return true when `src` is a remote URL. */
function isExternalUrl(src) {
    return typeof src === "string" && (src.startsWith("http://") || src.startsWith("https://") || src.startsWith("http"));
}

/** Return true when `src` looks like a video file. */
function isVideoSrc(src) {
    const lower = src.toLowerCase();
    return VIDEO_EXTENSIONS.some(ext => lower.endsWith(ext));
}

/**
 * Race a promise against a reject-after-timeout promise.
 * @param {Promise<T>} promise
 * @param {number} ms
 * @param {string} label  — shown in the rejection Error message
 * @returns {Promise<T>}
 */
function withTimeout(promise, ms, label) {
    return Promise.race([
        promise,
        new Promise((_, reject) =>
            setTimeout(() => reject(new Error(`Timeout: ${label}`)), ms))
    ]);
}

/**
 * Apply color-inversion filter to an `<img>` based on its stored preference
 * and the current Obsidian theme.
 * @param {HTMLImageElement} img
 * @param {"white"|"black"|null} colorPref
 */
function applyColorFilter(img, colorPref) {
    if (!colorPref) return;
    const isDark = document.body.classList.contains("theme-dark");
    const shouldInvert =
        (colorPref === "white" && !isDark) ||
        (colorPref === "black" &&  isDark);
    img.style.filter = shouldInvert ? "invert(100%)" : "none";
}

// ─────────────────────────────────────────────────────────────
//  Main Plugin Class
// ─────────────────────────────────────────────────────────────

module.exports = class StyleshVault extends Plugin {

    // ── Lifecycle ─────────────────────────────────────────────

    async onload() {
        await this.loadSettings();

        this.bufferFilePath = `${this.app.vault.configDir}/plugins/stylesh-vault/buffer.json`;

        this.hideBacklinksOnStartup();

        // Property-editing state
        this.editingProperties   = new Set();
        this.propertyEditTimeout = null;
        this.temporaryVisibleProps = new Map();

        // Timer bookkeeping (for clean onunload)
        this.activeTimeouts  = new Map();
        this.activeIntervals = new Map();

        // MutationObserver for file-explorer folder expansion
        this.fileExplorerObserver = null;

        // Icon render deduplication
        this.iconRenderPromises = new Map();
        this.iconRenderTimeouts = new Map();
        this.renderedIcons      = new Map();
        this.pendingIconRenders = new Set();

        // WeakMap<containerElement, iconValue>
        // Tracks which icon value has been rendered into each specific DOM container.
        // Because it is a WeakMap, entries are automatically released when Obsidian
        // destroys and rebuilds the container DOM node (e.g. on edit↔preview switch),
        // so the next processView call re-places the icon without re-fetching any
        // image data (that is handled separately by the image cache).
        this.renderedContainers = new WeakMap();

        // Must be defined BEFORE registerAllEvents so event callbacks never call undefined
        this.debouncedUpdate = debounce(() => {
            this.updateAllViews();
            this.updateTabIcons();
        }, 300, true);

        this.addSettingTab(new StyleshVaultSettingTab(this.app, this));
        this.updateCssVariables();
        this.updateHiddenPropertiesCSS();

        this.registerAllEvents();
        this._registerFileOpenHandler();
        this._registerCommands();
        this._registerContextMenus();
        this._registerDomListeners();

        await this.initCache();

        this.setupPropertyEditListeners();
        this.updateScrollbarStyle();

        this.registerEvent(
            this.app.workspace.on("css-change", () => this.updateIconColorInversion())
        );
    }

    onunload() {
        // Cancel all pending timers
        if (this.propertyEditTimeout) clearTimeout(this.propertyEditTimeout);
        this.activeTimeouts.forEach(id  => clearTimeout(id));
        this.activeIntervals.forEach(id => clearInterval(id));
        this.activeTimeouts.clear();
        this.activeIntervals.clear();
        this.temporaryVisibleProps.forEach(function(entry) { if (entry.timeout) clearTimeout(entry.timeout); });
        this.temporaryVisibleProps.clear();
        this.iconRenderTimeouts.forEach(t => clearTimeout(t));
        this.iconRenderTimeouts.clear();

        // Remove all injected DOM elements
        document.querySelectorAll(".banner-image, .icon-wrapper, .pp-title-icon, .pp-file-icon")
            .forEach(el => el.remove());
        var _ppHidden = document.getElementById("pp-hidden-props"); if (_ppHidden) _ppHidden.remove();
        document.querySelectorAll(".show-full-properties-btn").forEach(btn => btn.remove());

        // Restore title elements to their original position
        document.querySelectorAll(".pp-title-wrapper").forEach(w => {
            const title = w.querySelector(".inline-title");
            if (title) w.parentNode.insertBefore(title, w);
            w.remove();
        });

        document.body.classList.remove("hider-scroll");

        // Restore tab icons
        this.app.workspace.iterateAllLeaves(leaf => {
            if (!leaf.tabHeaderEl) return;
            const iconContainer = leaf.tabHeaderEl.querySelector(".workspace-tab-header-inner-icon");
            if (iconContainer) {
                iconContainer.style.display = "";
                setIcon(iconContainer, "lucide-file");
            }
            leaf.tabHeaderEl.removeAttribute("data-pp-icon");
            var _tabIcon = leaf.tabHeaderEl.querySelector(".pp-tab-icon"); if (_tabIcon) _tabIcon.remove();
        });

        // Remove context-menu listener markers
        document.querySelectorAll(".metadata-property[data-pp-has-listener]")
            .forEach(el => el.removeAttribute("data-pp-has-listener"));

        // Clear render caches (renderedContainers is a WeakMap — no manual clear needed)
        this.renderedIcons.clear();
        this.iconRenderPromises.clear();
        this.pendingIconRenders.clear();

        if (this.fileExplorerObserver) {
            this.fileExplorerObserver.disconnect();
            this.fileExplorerObserver = null;
        }

        this.saveBufferData().catch(err =>
            console.error("Error saving buffer on unload:", err));
    }

    // ── Private: registration helpers called from onload ──────

    /** Register the file-open event with its full handler logic. */
    _registerFileOpenHandler() {
        this.registerEvent(
            this.app.workspace.on("file-open", (file) => {
                setTimeout(async () => {
                    this.cleanupDuplicates(file);

                    const activeLeaf = this.app.workspace.activeLeaf;
                    if (activeLeaf) this.checkForceModeForLeaf(activeLeaf);

                    if (file instanceof TFile) {
                        var _fc0 = this.app.metadataCache.getFileCache(file);
                        const fm = _fc0 ? _fc0.frontmatter : undefined;
                        if (fm && await this.isFileFromTemplate(file)) {
                            await this.processSpecialBanner(file, fm);
                        }
                    }

                    this.debouncedUpdate();
                    this.addShowFullPropertiesButtons();
                    this.updateHiddenPropertiesCSS();
                }, 50);
            })
        );
    }

    /** Register all palette commands. */
    _registerCommands() {
        // Helper: only run when an active TFile exists
        const withActiveFile = (fn) => (checking) => {
            const file = this.app.workspace.getActiveFile();
            if (!(file instanceof TFile)) return false;
            if (!checking) fn(file);
            return true;
        };

        this.addCommand({
            id: "select-icon",
            name: "Select Icon",
            checkCallback: withActiveFile(file =>
                new IconSuggestModal(this.app, this, file).open())
        });

        this.addCommand({
            id: "select-banner",
            name: "Select Banner",
            checkCallback: withActiveFile(file =>
                new BannerSuggestModal(this.app, this, file).open())
        });

        this.addCommand({
            id: "force-refresh-icons",
            name: "Clear the Cache & Refresh icons",
            callback: async () => {
                this._clearRenderCaches();
                await this.clearImageCache();
                this.updateAllViews();
                new Notice("Icons refreshed and cache cleared");
            }
        });

        this.addCommand({
            id: "show-all-hidden-properties",
            name: "Show All Hidden Properties Temporarily",
            checkCallback: withActiveFile(file =>
                this.showTemporaryProperties(file, this.settings.hiddenProperties))
        });

        this.addCommand({
            id: "show-temporary-properties",
            name: "Show Temporary Properties",
            checkCallback: withActiveFile(file =>
                this.showTemporaryProperties(file, this.settings.temporaryHiddenProperties))
        });

        this.addCommand({
            id: "set-icon-color-preference",
            name: "Set Icon Color Preference",
            checkCallback: (checking) => {
                const file = this.app.workspace.getActiveFile();
                if (!(file instanceof TFile)) return false;
                var _fc1 = this.app.metadataCache.getFileCache(file);
                const fm = _fc1 ? _fc1.frontmatter : undefined;
                const iconValue = fm ? fm[this.settings.iconProperty] : undefined;
                if (iconValue && isExternalUrl(iconValue)) {
                    if (!checking) new IconColorPreferenceModal(this.app, this, iconValue).open();
                    return true;
                }
                if (!checking) new Notice("No external icon URL found in the current file");
                return false;
            }
        });

        this.addCommand({
            id: "clear-icon-color-preferences",
            name: "Clear All Icon Color Preferences",
            callback: async () => {
                this.settings.iconColorPreferences = {};
                await this.saveSettings();
                new Notice("All icon color preferences cleared");
                this.forceRefreshAllIcons();
            }
        });
    }

    /** Register context-menu handlers (file-menu, banner, icon). */
    _registerContextMenus() {
        // File-explorer / tab context menu
        this.registerEvent(
            this.app.workspace.on("file-menu", (menu, file) => {
                if (!(file instanceof TFile) && !(file instanceof TFolder)) return;
                menu.addItem(item =>
                    item.setTitle("Change Icon").setIcon("image-plus").onClick(() =>
                        new IconSuggestModal(this.app, this, file).open()));
            })
        );

        // DOM right-click (banner & icon elements)
        this.registerDomEvent(document, "contextmenu", (evt) => {
            const view = this.app.workspace.getActiveViewOfType(MarkdownView);
            if (!view || !view.file) return;

            if (evt.target.closest(".banner-image")) {
                evt.preventDefault();
                const menu = new Menu();
                menu.addItem(i => i.setTitle("Change Banner").setIcon("image")
                    .onClick(() => new BannerSuggestModal(this.app, this, view.file).open()));
                menu.addItem(i => i.setTitle("Change Banner Position").setIcon("move-vertical")
                    .onClick(() => new BannerPositionModal(this.app, this, view.file).open()));
                menu.addItem(i => i.setTitle("Remove Banner").setIcon("trash")
                    .onClick(() => this.app.fileManager.processFrontMatter(
                        view.file, fm => { delete fm[this.settings.bannerProperty]; })));
                menu.showAtPosition({ x: evt.clientX, y: evt.clientY });
            }

            if (evt.target.closest(".icon-image") || evt.target.closest(".pp-title-icon")) {
                evt.preventDefault();
                const menu = new Menu();
                menu.addItem(i => i.setTitle("Change Icon").setIcon("image-plus")
                    .onClick(() => new IconSuggestModal(this.app, this, view.file).open()));
                menu.addItem(i => i.setTitle("Remove Icon").setIcon("trash")
                    .onClick(() => this.app.fileManager.processFrontMatter(
                        view.file, fm => { delete fm[this.settings.iconProperty]; })));
                menu.showAtPosition({ x: evt.clientX, y: evt.clientY });
            }
        });
    }

    /** Register remaining DOM/workspace listeners. */
    _registerDomListeners() {
        this.registerEvent(
            this.app.workspace.on("active-leaf-change",
                debounce(() => this.setupPropertyContextMenus(), 100))
        );

        this.app.workspace.onLayoutReady(() => {
            this.setupPropertyContextMenus();
            this.addShowFullPropertiesButtons();
            this.app.workspace.getLeavesOfType("markdown")
                .forEach(leaf => this.checkForceModeForLeaf(leaf));
            // Start watching the file explorer for folder expansions
            this._observeFileExplorer();
        });

        // Re-attach observer if the file-explorer leaf is opened later
        this.registerEvent(
            this.app.workspace.on("layout-change", () => this._observeFileExplorer())
        );
    }

    /**
     * Attach a MutationObserver to every file-explorer container so that
     * icons are rendered immediately when the user expands a folder —
     * without waiting for a file-open or layout-change event.
     * Safe to call multiple times: skips leaves already being observed.
     */
    _observeFileExplorer() {
        if (!this.settings.showFileExplorerIcons) return;

        // One observer watches all file-explorer containers simultaneously
        if (!this.fileExplorerObserver) {
            this.fileExplorerObserver = new MutationObserver((mutations) => {
                // Only act when new tree-item nodes have actually been added
                var hasNewItems = false;
                for (var m = 0; m < mutations.length; m++) {
                    var added = mutations[m].addedNodes;
                    for (var n = 0; n < added.length; n++) {
                        var node = added[n];
                        if (node.nodeType !== 1) continue; // element nodes only
                        // A folder expansion adds .tree-item nodes (children of the folder)
                        if (node.classList && (
                            node.classList.contains("tree-item") ||
                            node.querySelector(".tree-item-self[data-path]")
                        )) {
                            hasNewItems = true;
                            break;
                        }
                    }
                    if (hasNewItems) break;
                }
                if (hasNewItems) this.updateFileExplorer();
            });
        }

        // Attach to any file-explorer container not yet observed
        this.app.workspace.getLeavesOfType("file-explorer").forEach((leaf) => {
            var container = leaf.view.containerEl;
            // Use a data attribute as a lightweight "already observed" flag
            if (!container.hasAttribute("data-pp-observed")) {
                container.setAttribute("data-pp-observed", "true");
                this.fileExplorerObserver.observe(container, {
                    childList: true,
                    subtree:   true
                });
            }
        });
    }

    // ── Force-mode (preview / edit) ───────────────────────────

    registerAllEvents() {
        const isForcedMode = (uiMode) =>
            uiMode === "preview-force" || uiMode === "edit-force";

        // Enforce forced mode on layout change for all markdown leaves
        this.registerEvent(this.app.workspace.on("layout-change", () => {
            this.app.workspace.getLeavesOfType("markdown").forEach(leaf => {
                const uiMode = this._getLeafUiMode(leaf);
                if (isForcedMode(uiMode)) this.checkForceModeForLeaf(leaf);
            });
        }));

        // Enforce forced mode when switching active leaf
        this.registerEvent(this.app.workspace.on("active-leaf-change", (leaf) => {
            if (!leaf) return;
            const uiMode = this._getLeafUiMode(leaf);
            if (isForcedMode(uiMode)) this.checkForceModeForLeaf(leaf);
        }));

        // Enforce forced mode when frontmatter changes for the active file
        this.registerEvent(this.app.metadataCache.on("changed", (file) => {
            var _af0 = this.app.workspace.getActiveFile(); if (!_af0 || _af0.path !== file.path) return;
            const activeLeaf = this.app.workspace.activeLeaf;
            if (!activeLeaf) return;
            const uiMode = this._getLeafUiMode(activeLeaf);
            if (isForcedMode(uiMode)) this.checkForceModeForLeaf(activeLeaf);
        }));

        // General update triggers
        this.registerEvent(this.app.workspace.on("layout-change", () => this.debouncedUpdate()));
        this.registerEvent(this.app.workspace.on("active-leaf-change", () => {
            this.debouncedUpdate();
            setTimeout(() => this.addShowFullPropertiesButtons(), 100);
        }));
        this.registerEvent(this.app.metadataCache.on("changed", (file) => {
            setTimeout(() => {
                this.cleanupDuplicates(file);
                this.debouncedUpdate();
            }, 50);
        }));
        this.registerEvent(this.app.workspace.on("file-open", (file) => {
            setTimeout(() => {
                this.cleanupDuplicates(file);
                this.debouncedUpdate();
                this.addShowFullPropertiesButtons();
            }, 100);
        }));
        this.registerEvent(this.app.vault.on("create", (file) => {
            if (!(file instanceof TFile)) return;
            setTimeout(() => {
                var _af1 = this.app.workspace.getActiveFile(); if (_af1 && _af1.path === file.path) {
                    this.updateHiddenPropertiesCSS();
                }
            }, 100);
        }));
        this.registerEvent(this.app.workspace.on("layout-change",
            () => this.closeBacklinksLeaf()));
    }

    /**
     * Read the `uiProperty` frontmatter value for a given leaf's file.
     * @private
     */
    _getLeafUiMode(leaf) {
        var _lv = leaf ? leaf.view : null;
        var file = _lv ? _lv.file : null;
        if (!file) return null;
        var _fc2 = this.app.metadataCache.getFileCache(file);
        var _fm2 = _fc2 ? _fc2.frontmatter : null;
        return (_fm2 && _fm2[this.settings.uiProperty] !== undefined) ? _fm2[this.settings.uiProperty] : null;
    }

    /**
     * Switch a leaf to the mode declared in its frontmatter (`preview`,
     * `preview-force`, `edit`, or `edit-force`).
     */
    checkForceModeForLeaf(leaf) {
        if (!leaf || !(leaf.view instanceof MarkdownView) || !leaf.view.file) return;

        const uiMode = this._getLeafUiMode(leaf);
        if (!uiMode) return;

        let targetMode = null;
        if (uiMode === "preview-force" || uiMode === "preview") targetMode = "preview";
        else if (uiMode === "edit-force"   || uiMode === "edit")    targetMode = "source";
        if (!targetMode) return;

        const state = leaf.getViewState();
        if (state.state && state.state.mode === targetMode) return;

        var newState = Object.assign({}, state);
        newState.state = Object.assign({}, state.state, { mode: targetMode });
        leaf.setViewState(newState)
            .catch(err => console.error("Error enforcing force mode:", err));
    }

    // ── Icon colour management ────────────────────────────────

    async setIconColorPreference(iconUrl, color) {
        if (!this.settings.iconColorPreferences) this.settings.iconColorPreferences = {};
        this.settings.iconColorPreferences[iconUrl] = color;
        await this.saveSettings();
        new Notice(`Icon color preference set to ${color}`);
        this.forceRefreshAllIcons();
    }

    async getIconColorPreference(iconUrl) {
        var _icp = this.settings.iconColorPreferences; return (_icp && _icp[iconUrl] !== undefined) ? _icp[iconUrl] : null;
    }

    /** Re-apply colour-inversion filters to all currently rendered icon images. */
    updateIconColorInversion() {
        const selectors = [
            ".icon-image img.icon-color-adjustable",
            ".pp-title-icon img.icon-color-adjustable",
            ".pp-file-icon img.icon-color-adjustable",
            ".pp-tab-icon img.icon-color-adjustable",
            ".workspace-tab-header-inner-icon img.icon-color-adjustable"
        ].join(", ");

        document.querySelectorAll(selectors).forEach(img => {
            applyColorFilter(img, img.getAttribute("data-color-pref"));
        });
    }

    /** Clear all render caches without touching the persistent image cache. */
    _clearRenderCaches() {
        this.renderedIcons.clear();
        this.iconRenderPromises.clear();
        this.pendingIconRenders.clear();
        // WeakMap has no .clear(); replace it so all containers re-render on next update
        this.renderedContainers = new WeakMap();
    }

    forceRefreshAllIcons() {
        this._clearRenderCaches();
        this.updateAllViews();
        this.updateTabIcons();
        if (this.settings.showFileExplorerIcons) this.updateFileExplorer();
    }

    // ── Hidden properties ─────────────────────────────────────

    async showTemporaryProperties(file, propsArray) {
        if (!file || !file.path) return;
        if (propsArray.length === 0) {
            new Notice("No properties selected to show.");
            return;
        }

        const filePath = file.path;
        const timeoutKey = `tempProps-${filePath}`;

        // Cancel any previous timer for this file
        const previous = this.temporaryVisibleProps.get(filePath);
        if (previous && previous.timeout) clearTimeout(previous.timeout);
        if (this.activeTimeouts.has(timeoutKey)) clearTimeout(this.activeTimeouts.get(timeoutKey));

        this.temporaryVisibleProps.set(filePath, { props: new Set(propsArray), timeout: null });
        this.updateHiddenPropertiesCSS();
        new Notice(`Showing ${propsArray.length} properties for ${this.settings.temporaryViewTimeout} seconds`);

        const timeout = setTimeout(
            () => this.hideTemporaryProperties(filePath),
            this.settings.temporaryViewTimeout * 1000
        );
        this.temporaryVisibleProps.get(filePath).timeout = timeout;
        this.activeTimeouts.set(timeoutKey, timeout);
    }

    hideTemporaryProperties(filePath) {
        const data = this.temporaryVisibleProps.get(filePath);
        if (data) {
            if (data.timeout) clearTimeout(data.timeout);
            this.temporaryVisibleProps.delete(filePath);
            this.updateHiddenPropertiesCSS();
            new Notice("Temporary properties have been hidden");
        }
        const timeoutKey = `tempProps-${filePath}`;
        if (this.activeTimeouts.has(timeoutKey)) {
            clearTimeout(this.activeTimeouts.get(timeoutKey));
            this.activeTimeouts.delete(timeoutKey);
        }
    }

    updateHiddenPropertiesCSS() {
        const styleEl = document.getElementById("pp-hidden-props")
            || document.head.createEl("style", { id: "pp-hidden-props" });

        var _afp = this.app.workspace.getActiveFile(); var currentFilePath = _afp ? _afp.path : null;
        const tempProps = currentFilePath
            ? (function(e){ return e ? (e.props || new Set()) : new Set(); })(this.temporaryVisibleProps.get(currentFilePath))
            : new Set();

        const rules = this.settings.hiddenProperties.map(prop => {
            const isVisible =
                this.editingProperties.has(prop) ||
                tempProps.has(prop);

            return isVisible
                ? `.metadata-property[data-property-key="${prop}"] { opacity: 1 !important; display: block !important; }`
                : `.metadata-property[data-property-key="${prop}"] { display: none !important; }`;
        });

        styleEl.innerText = rules.join("\n");
    }

    addShowFullPropertiesButtons() {
        const file = this.app.workspace.getActiveFile();
        if (!file) return;

        document.querySelectorAll(".metadata-container").forEach(container => {
            if (container.querySelector(".show-full-properties-btn")) return;
            const header = container.querySelector(".metadata-container-heading");
            if (!header) return;

            const btn = document.createElement("button");
            btn.classList.add("show-full-properties-btn");
            btn.textContent = "Show All Hidden";
            btn.title = "Show all hidden properties temporarily";
            btn.addEventListener("click", async (e) => {
                e.stopPropagation();
                e.preventDefault();
                await this.showTemporaryProperties(file, this.settings.hiddenProperties);
            });
            header.appendChild(btn);
        });
    }

    // ── Property context menus ────────────────────────────────

    handlePropertyContextMenu(evt, propertyEl) {
        evt.preventDefault();
        evt.stopPropagation();

        const propertyKey = propertyEl.getAttribute("data-property-key");
        if (!propertyKey) return;

        const isHidden    = this.settings.hiddenProperties.includes(propertyKey);
        const isInTempView = this.settings.temporaryHiddenProperties.includes(propertyKey);

        const menu = new Menu();

        menu.addItem(item =>
            item
                .setTitle(isHidden
                    ? `Unhide property "${propertyKey}"`
                    : `Hide property "${propertyKey}"`)
                .setIcon(isHidden ? "eye" : "eye-off")
                .onClick(async () => {
                    if (isHidden) {
                        this.settings.hiddenProperties.remove(propertyKey);
                        this.settings.temporaryHiddenProperties.remove(propertyKey);
                        new Notice(`Property "${propertyKey}" is now permanently visible`);
                    } else {
                        this.settings.hiddenProperties.push(propertyKey);
                        new Notice(`Property "${propertyKey}" is now hidden`);
                        // Keep it visible while the user is looking at it
                        this.editingProperties.add(propertyKey);
                        this.updateHiddenPropertiesCSS();
                        setTimeout(() => {
                            this.editingProperties.delete(propertyKey);
                            this.updateHiddenPropertiesCSS();
                        }, 3000);
                    }
                    await this.saveSettings();
                    this.updateHiddenPropertiesCSS();
                })
        );

        if (isHidden) {
            menu.addItem(item =>
                item
                    .setTitle(isInTempView
                        ? "Remove from temporary view"
                        : "Add to temporary view")
                    .setIcon("square-dashed-mouse-pointer")
                    .onClick(async () => {
                        if (isInTempView) {
                            this.settings.temporaryHiddenProperties.remove(propertyKey);
                            new Notice(`"${propertyKey}" removed from temporary view`);
                        } else {
                            this.settings.temporaryHiddenProperties.push(propertyKey);
                            new Notice(`"${propertyKey}" added to temporary view`);
                        }
                        await this.saveSettings();
                    })
            );
        }

        menu.addSeparator();
        menu.showAtPosition({ x: evt.clientX, y: evt.clientY });
    }

    setupPropertyContextMenus() {
        document.querySelectorAll(".metadata-property:not([data-pp-has-listener])").forEach(el => {
            el.setAttribute("data-pp-has-listener", "true");
            el.addEventListener("contextmenu", (evt) => this.handlePropertyContextMenu(evt, el));
        });
    }

    setupPropertyEditListeners() {
        this.registerDomEvent(document, "focusin", (evt) => {
            const propertyEl = evt.target.closest(".metadata-property");
            if (!propertyEl) return;
            const key = propertyEl.getAttribute("data-property-key");
            if (key && this.settings.hiddenProperties.includes(key)) {
                this.editingProperties.add(key);
                if (this.propertyEditTimeout) clearTimeout(this.propertyEditTimeout);
                this.updateHiddenPropertiesCSS();
            }
        });

        this.registerDomEvent(document, "focusout", (evt) => {
            const propertyEl = evt.target.closest(".metadata-property");
            if (!propertyEl) return;
            const key = propertyEl.getAttribute("data-property-key");
            if (key && this.editingProperties.has(key)) {
                this.propertyEditTimeout = setTimeout(() => {
                    this.editingProperties.delete(key);
                    this.updateHiddenPropertiesCSS();
                }, PROPERTY_EDIT_GRACE_MS);
            }
        });
    }

    // ── Duplicate element cleanup ─────────────────────────────

    cleanupDuplicates(file) {
        var filePath = file ? file.path : undefined;
        if (!filePath) return;

        const cleanedContainers = new Set();
        const containers = [];

        this.app.workspace.getLeavesOfType("markdown").forEach(leaf => {
            if (!leaf.view || !leaf.view.file || leaf.view.file.path !== filePath) return;
            const contentEl = leaf.view.contentEl;
            const scroller = contentEl.querySelector(".markdown-source-view > .cm-editor > .cm-scroller");
            const preview  = contentEl.querySelector(".markdown-reading-view > .markdown-preview-view");
            if (scroller) containers.push(scroller);
            if (preview)  containers.push(preview);
        });

        containers.forEach(container => {
            if (cleanedContainers.has(container)) return;
            cleanedContainers.add(container);

            this._deduplicateByAttr(container, ":scope > .icon-wrapper",  "data-icon");
            this._deduplicateByAttr(container, ":scope > .banner-image",  "data-src");
        });

        // Deduplicate title icons per wrapper — NOT globally across the whole leaf.
        // Each pane (editor + preview) legitimately has its own .pp-title-icon,
        // so we only remove duplicates within the same .pp-title-wrapper.
        this.app.workspace.getLeavesOfType("markdown").forEach(leaf => {
            if (!leaf.view || !leaf.view.file || leaf.view.file.path !== filePath) return;
            leaf.view.contentEl.querySelectorAll(".pp-title-wrapper").forEach(wrapper => {
                this._deduplicateByAttr(wrapper, ":scope > .pp-title-icon", "data-icon");
            });
        });
    }

    /**
     * Remove duplicate child elements that share the same attribute value,
     * keeping the first occurrence.
     * @private
     */
    _deduplicateByAttr(scope, selector, attr) {
        const els = scope.querySelectorAll(selector);
        if (els.length <= 1) return;
        const firstVal = els[0].getAttribute(attr);
        for (let i = 1; i < els.length; i++) {
            if (els[i].getAttribute(attr) === firstVal) els[i].remove();
        }
    }

    // ── Special banner (random / serial) ─────────────────────

    /**
     * Return true when `file` lives outside template folders AND its banner
     * property starts with "random" or "serial".
     */
    async isFileFromTemplate(file) {
        if (!file) return false;

        const inTemplatesFolder =
            file.path.includes("004 Meta/004 Temple") ||
            file.path.includes("/Templates/")         ||
            file.path.includes("\\Templates\\");
        if (inTemplatesFolder) return false;

        var _fc3 = this.app.metadataCache.getFileCache(file);
        var _fm3 = _fc3 ? _fc3.frontmatter : null;
        var bannerValue = (_fm3) ? _fm3[this.settings.bannerProperty] : undefined;
        if (typeof bannerValue !== "string") return false;

        return bannerValue.includes("random") || bannerValue.includes("serial");
    }

    async processSpecialBanner(file, fm) {
        var bannerValue = fm ? fm[this.settings.bannerProperty] : undefined;
        if (typeof bannerValue !== "string") return false;

        const randomMatch = bannerValue.match(/^random\s*\[(.*?)\]$/s);
        if (randomMatch) {
            const images = this.parseImageArray(randomMatch[1]);
            if (images.length > 0) {
                const selected = images[Math.floor(Math.random() * images.length)];
                await this.updateBannerWithValue(file, selected);
                return true;
            }
        }

        const serialMatch = bannerValue.match(/^serial\s*\[(.*?)\]$/s);
        if (serialMatch) {
            const images = this.parseImageArray(serialMatch[1]);
            if (images.length > 0) {
                const selected = images[this.getNextSerialIndex(file, images)];
                await this.updateBannerWithValue(file, selected);
                return true;
            }
        }

        return false;
    }

    parseImageArray(str) {
        try {
            const matches = str.match(/"([^"]*)"/g);
            if (matches) return matches.map(m => m.slice(1, -1));
            return str.split(",").map(s => s.trim().replace(/^["']|["']$/g, ""));
        } catch (e) {
            console.error("Error parsing image array:", e);
            return [];
        }
    }

    async updateBannerWithValue(file, value) {
        await this.app.fileManager.processFrontMatter(file, fm => {
            fm[this.settings.bannerProperty] = value;
        });
        this.debouncedUpdate();
    }

    getNextSerialIndex(file, images) {
        const filePath = file.path;
        const current  = this.serialIndexes.get(filePath) || 0;
        const next     = (current + 1) % images.length;
        this.serialIndexes.set(filePath, next);

        if (!this.settings.serialCounters) this.settings.serialCounters = {};
        this.settings.serialCounters[filePath] = next;
        this.saveSettings();

        return current;
    }

    // ── Banner rendering ──────────────────────────────────────

    async renderBanner(contentEl, containers, fm, sourcePath) {
        var bannerUrl = fm ? fm[this.settings.bannerProperty] : undefined;

        if (!this.settings.enableBanner || !bannerUrl) {
            containers.forEach(c =>
                c.querySelectorAll(":scope > .banner-image").forEach(el => el.remove()));
            contentEl.classList.remove("has-banner");
            return;
        }

        const bannerSrc = formatImageLink(bannerUrl);
        const bannerPos = fm[this.settings.bannerPositionProperty] || 50;
        const isVideo   = isVideoSrc(bannerSrc);

        for (const container of containers) {
            let bannerEl = container.querySelector(":scope > .banner-image");
            if (!bannerEl) {
                bannerEl = document.createElement("div");
                bannerEl.classList.add("banner-image");
                container.prepend(bannerEl);
            }

            const srcChanged = bannerEl.getAttribute("data-src") !== bannerSrc;
            const posChanged = bannerEl.getAttribute("data-pos") !== String(bannerPos);
            if (!srcChanged && !posChanged) continue;

            bannerEl.setAttribute("data-src", bannerSrc);
            bannerEl.setAttribute("data-pos", String(bannerPos));
            bannerEl.empty();

            try {
                const resolvedSrc = await this.resolveLink(bannerSrc, sourcePath);
                const mediaEl = isVideo
                    ? this._createVideoEl(resolvedSrc, bannerPos)
                    : this._createImageEl(resolvedSrc, bannerPos);

                mediaEl.onerror = () => {
                    console.warn(`Failed to load banner media: ${bannerSrc}`);
                    bannerEl.style.display = "none";
                };
                if (isVideo) {
                    mediaEl.onloadedmetadata = () => { bannerEl.style.display = ""; };
                } else {
                    mediaEl.onload = () => { bannerEl.style.display = ""; };
                }

                bannerEl.appendChild(mediaEl);
            } catch (error) {
                console.error("Error rendering banner:", error);
                bannerEl.remove();
            }
        }

        contentEl.classList.add("has-banner");
    }

    /** @private Build a `<video>` element for a banner. */
    _createVideoEl(src, posPercent) {
        const v = document.createElement("video");
        v.src        = src;
        v.autoplay   = true;
        v.loop       = true;
        v.muted      = true;
        v.playsInline = true;
        v.setAttribute("muted", "");
        // object-position controls which part of the video is visible (same as image banner)
        v.style.objectPosition = `center ${posPercent}%`;
        return v;
    }

    /** @private Build an `<img>` element for a banner. */
    _createImageEl(src, posPercent) {
        const img = document.createElement("img");
        img.src = src;
        img.style.objectPosition = `center ${posPercent}%`;
        return img;
    }

    // ── Icon rendering ────────────────────────────────────────

    async renderIcon(contentEl, containers, fm, sourcePath) {
        var iconValue = fm ? fm[this.settings.iconProperty] : undefined;

        if (!this.settings.enableIcon || !iconValue) {
            containers.forEach(c =>
                c.querySelectorAll(":scope > .icon-wrapper").forEach(el => el.remove()));
            contentEl.querySelectorAll(".pp-title-icon").forEach(el => el.remove());
            return;
        }

        const renderKey = `${sourcePath}-${iconValue}`;

        // If all panes already show the correct icon, just refresh stale values
        if (this.settings.iconInTitle) {
            var previewPane = contentEl.querySelector(".markdown-reading-view .markdown-preview-view");
            var editorScroller = contentEl.querySelector(".markdown-source-view .cm-editor .cm-scroller");
            var previewIcon  = previewPane   ? previewPane.querySelector(".pp-title-wrapper > .pp-title-icon")   : null;
            var editorIconWr = editorScroller ? editorScroller.querySelector(":scope > .icon-wrapper") : null;
            // Both panes have their element (or the pane doesn't exist)
            var previewDone = !previewPane   || previewIcon  !== null;
            var editorDone  = !editorScroller || editorIconWr !== null;
            if (previewDone && editorDone) {
                if (previewIcon  && previewIcon.getAttribute("data-icon")  !== iconValue) this.updateIconContent(previewIcon,  iconValue, sourcePath);
                if (editorIconWr && editorIconWr.getAttribute("data-icon") !== iconValue) this.updateIconContent(editorIconWr, iconValue, sourcePath);
                return;
            }
        } else {
            const hasExisting = containers.some(c => c.querySelector(":scope > .icon-wrapper"));
            if (hasExisting) {
                containers.forEach(container => {
                    const w = container.querySelector(":scope > .icon-wrapper");
                    if (w && w.getAttribute("data-icon") !== iconValue)
                        this.updateIconContent(w, iconValue, sourcePath);
                });
                return;
            }
        }

        if (this.pendingIconRenders.has(renderKey)) return;
        this.pendingIconRenders.add(renderKey);

        try {
            if (this.settings.iconInTitle) {
                containers.forEach(c =>
                    c.querySelectorAll(":scope > .icon-wrapper").forEach(el => el.remove()));
                await this.renderIconInTitle(contentEl, iconValue, sourcePath);
            } else {
                contentEl.querySelectorAll(".pp-title-icon").forEach(el => el.remove());
                await this.renderStandardIcon(containers, iconValue, sourcePath);
            }
        } catch (error) {
            console.error("Error rendering icon:", error);
        } finally {
            setTimeout(() => this.pendingIconRenders.delete(renderKey), 100);
        }
    }

    async renderStandardIcon(containers, iconValue, sourcePath) {
        for (const container of containers) {
            let iconWrapper = container.querySelector(":scope > .icon-wrapper");
            if (!iconWrapper) {
                iconWrapper = document.createElement("div");
                iconWrapper.classList.add("icon-wrapper");
                const banner = container.querySelector(":scope > .banner-image");
                if (banner) banner.after(iconWrapper);
                else container.prepend(iconWrapper);
            }
            if (iconWrapper.getAttribute("data-icon") !== iconValue) {
                iconWrapper.setAttribute("data-icon", iconValue);
                await this.appendIconContent(iconWrapper, iconValue, sourcePath, true);
            }
            // Mark this container element as up-to-date so processView skips it next time
            this.renderedContainers.set(iconWrapper, iconValue);
        }
    }

    async renderIconInTitle(contentEl, iconValue, sourcePath) {
        // STRATEGY: two different approaches per pane.
        //
        // PREVIEW (.markdown-preview-view): wrap .inline-title in a flex row.
        //   This works because Obsidian owns the preview DOM cleanly and the
        //   inline-title is at the top of the content, above everything else.
        //
        // EDITOR (.cm-scroller): NEVER wrap .inline-title.
        //   In the editor, .inline-title lives inside CodeMirror's managed
        //   .cm-content, positioned *after* the frontmatter block. Wrapping it
        //   in-place drops the icon below the frontmatter. Instead, use the same
        //   floating icon-wrapper approach used by renderStandardIcon — prepend to
        //   .cm-scroller which is outside CodeMirror's managed area.

        // ── Preview pane ──────────────────────────────────────────────────────
        var previewView = contentEl.querySelector(".markdown-reading-view .markdown-preview-view");
        if (previewView) {
            var titleEl = await this._waitForElement(
                previewView, ".inline-title:not(.markdown-embed .inline-title)"
            );
            if (titleEl) {
                var wrapper = titleEl.parentElement;
                if (!wrapper.classList.contains("pp-title-wrapper")) {
                    wrapper = document.createElement("div");
                    wrapper.classList.add("pp-title-wrapper");
                    titleEl.parentNode.insertBefore(wrapper, titleEl);
                    wrapper.appendChild(titleEl);
                }
                var iconEl = wrapper.querySelector(":scope > .pp-title-icon");
                if (!iconEl) {
                    iconEl = document.createElement("span");
                    iconEl.classList.add("pp-title-icon");
                    wrapper.prepend(iconEl);
                }
                if (iconEl.getAttribute("data-icon") !== iconValue) {
                    iconEl.setAttribute("data-icon", iconValue);
                    await this.appendIconContent(iconEl, iconValue, sourcePath);
                }
                this.renderedContainers.set(iconEl, iconValue);
            }
        }

        // ── Editor pane ───────────────────────────────────────────────────────
        var scroller = contentEl.querySelector(".markdown-source-view .cm-editor .cm-scroller");
        if (scroller) {
            var editorWrapper = scroller.querySelector(":scope > .icon-wrapper");
            if (!editorWrapper) {
                editorWrapper = document.createElement("div");
                editorWrapper.classList.add("icon-wrapper");
                var banner = scroller.querySelector(":scope > .banner-image");
                if (banner) banner.after(editorWrapper);
                else scroller.prepend(editorWrapper);
            }
            if (editorWrapper.getAttribute("data-icon") !== iconValue) {
                editorWrapper.setAttribute("data-icon", iconValue);
                await this.appendIconContent(editorWrapper, iconValue, sourcePath, true);
            }
            this.renderedContainers.set(editorWrapper, iconValue);
        }
    }

    /**
     * Poll `scope` for `selector` until the element appears or `maxWaitMs` elapses.
     * Resolves with the element, or null on timeout.
     * @param {HTMLElement} scope
     * @param {string}      selector
     * @param {number}      [maxWaitMs=1500]
     * @param {number}      [intervalMs=50]
     * @returns {Promise<HTMLElement|null>}
     */
    _waitForElement(scope, selector, maxWaitMs, intervalMs) {
        if (maxWaitMs === undefined) maxWaitMs = 1500;
        if (intervalMs === undefined) intervalMs = 50;
        return new Promise(function(resolve) {
            var immediate = scope.querySelector(selector);
            if (immediate) { resolve(immediate); return; }
            var elapsed = 0;
            var timer = setInterval(function() {
                var el = scope.querySelector(selector);
                if (el) { clearInterval(timer); resolve(el); return; }
                elapsed += intervalMs;
                if (elapsed >= maxWaitMs) { clearInterval(timer); resolve(null); }
            }, intervalMs);
        });
    }

    /**
     * Populate `container` with the visual representation of `iconValue`.
     * Handles Lucide IDs, emojis, external SVGs (inline injection),
     * and raster/non-SVG external images.
     *
     * This method is shared between `updateIconContent` and `appendIconContent`.
     * Both used to duplicate this logic — now there is one place.
     *
     * @param {HTMLElement} container  — element to fill
     * @param {string}      iconValue  — raw frontmatter value
     * @param {string}      sourcePath — file path for local-link resolution
     * @param {boolean}     [isFloating=false] — when true, wraps content in `.icon-image`
     */
    async _renderIconContent(container, iconValue, sourcePath, isFloating = false) {
        container.empty();
        const contentContainer = isFloating
            ? container.createDiv({ cls: "icon-image" })
            : container;

        // 1. Lucide built-in icon
        const lucideIcon = getIcon(iconValue);
        if (lucideIcon) {
            lucideIcon.classList.add("pp-svg-icon");
            // Ensure stroke/fill are set via CSS currentColor, not inline style
            const svg = lucideIcon.querySelector("svg");
            if (svg) {
                svg.setAttribute("stroke", "currentColor");
                svg.setAttribute("fill", "none");
                svg.style.removeProperty("stroke");
                svg.style.removeProperty("color");
            }
            contentContainer.appendChild(lucideIcon);
            return;
        }

        // 2. Emoji
        if (isEmoji(iconValue)) {
            contentContainer.createDiv({ cls: "pp-text-icon", text: iconValue });
            return;
        }

        const formattedSrc = formatImageLink(iconValue);
        if (!formattedSrc) {
            console.warn("Empty icon source:", iconValue);
            return;
        }

        const isExternal = isExternalUrl(iconValue);

        // 3. External SVG — inject inline so CSS currentColor works
        if (isExternal && isExternalSvgUrl(formattedSrc)) {
            try {
                const svgText = await withTimeout(
                    this.fetchExternalSvgText(formattedSrc),
                    ICON_TIMEOUT_MS, "SVG load timeout"
                );
                if (svgText) {
                    this.injectInlineSvg(contentContainer, svgText);
                    return;
                }
            } catch (err) {
                console.warn("External SVG inline injection failed, falling back to img:", err);
            }
        }

        // 4. Raster / non-SVG image
        const colorPreference = isExternal
            ? await this.getIconColorPreference(iconValue)
            : null;

        const img = document.createElement("img");
        img.alt = "Icon";

        if (isExternal && colorPreference) {
            img.classList.add("icon-color-adjustable");
            img.setAttribute("data-color-pref", colorPreference);
        }

        const appendFallback = (target) => {
            const fallback = getIcon("lucide-file");
            if (fallback) {
                fallback.classList.add("pp-svg-icon");
                target.appendChild(fallback);
            }
        };

        try {
            let imgSrc;
            if (formattedSrc.startsWith("data:")) {
                imgSrc = formattedSrc;
            } else if (formattedSrc.startsWith("http")) {
                imgSrc = await withTimeout(
                    this.resolveLink(formattedSrc, sourcePath),
                    ICON_TIMEOUT_MS, "Image load timeout"
                );
            } else {
                imgSrc = await this.resolveLink(formattedSrc, sourcePath);
            }

            img.src = imgSrc;

            img.onerror = () => {
                console.warn(`Failed to load icon image: ${formattedSrc}`);
                img.remove();
                appendFallback(contentContainer);
            };

            img.onload = () => {
                contentContainer.appendChild(img);
                if (isExternal && colorPreference) {
                    applyColorFilter(img, colorPreference);
                }
            };

        } catch (error) {
            console.error("Error resolving icon:", error);
            appendFallback(contentContainer);
        }
    }

    /**
     * Update an already-mounted icon container in-place (no deduplication key needed).
     * Used when the icon value changes via context menu or frontmatter edit.
     */
    async updateIconContent(container, iconValue, sourcePath) {
        container.setAttribute("data-icon", iconValue);
        await this._renderIconContent(container, iconValue, sourcePath, false);
        this.renderedContainers.set(container, iconValue);
    }

    /**
     * Populate a freshly created or recycled icon slot.
     * Deduplicates concurrent renders for the same (container class + icon + source).
     * @param {boolean} [isFloating=false]
     */
    async appendIconContent(container, iconValue, sourcePath, isFloating = false) {
        if (!container || !iconValue) return;

        // NOTE: Date.now() makes every call unique intentionally
        // (the original used the same strategy), preventing stale promise reuse
        // when the same container is reused for a different icon.
        const renderKey = `${container.className}-${iconValue}-${sourcePath}-${Date.now()}`;

        if (this.iconRenderPromises.has(renderKey)) {
            return await this.iconRenderPromises.get(renderKey);
        }

        const renderPromise = (async () => {
            try {
                await this._renderIconContent(container, iconValue, sourcePath, isFloating);
            } catch (error) {
                console.error("Error in appendIconContent:", error);
            } finally {
                this.iconRenderPromises.delete(renderKey);
                const timeout = this.iconRenderTimeouts.get(renderKey);
                if (timeout) {
                    clearTimeout(timeout);
                    this.iconRenderTimeouts.delete(renderKey);
                }
            }
        })();

        this.iconRenderPromises.set(renderKey, renderPromise);
        await renderPromise;
    }

    // ── View orchestration ────────────────────────────────────

    async processView(view) {
        const file = view.file;
        if (!file) return;

        try {
            this.cleanupDuplicates(file);

            var _fc4 = this.app.metadataCache.getFileCache(file);
            const fm         = _fc4 ? _fc4.frontmatter : undefined;
            const contentEl  = view.contentEl;
            const scroller   = contentEl.querySelector(".markdown-source-view > .cm-editor > .cm-scroller");
            const preview    = contentEl.querySelector(".markdown-reading-view > .markdown-preview-view");
            const containers = [scroller, preview].filter(Boolean);

            // Remove any icon/banner leaking from embedded notes
            contentEl.querySelectorAll(
                ".markdown-embed .banner-image, .markdown-embed .icon-wrapper, .markdown-embed .pp-title-icon"
            ).forEach(function(el) { el.remove(); });

            const iconValue = fm ? (fm[this.settings.iconProperty] || null) : null;

            // If this view is showing a different file than what was last rendered,
            // clean up any pp-title-wrapper left in the preview pane from the previous file.
            // (The editor scroller's icon-wrapper is keyed by data-icon and gets
            // overwritten naturally, but the preview wrapper wraps .inline-title in-place
            // and must be explicitly unwrapped before Obsidian replaces the content.)
            var lastFile = contentEl.getAttribute("data-pp-file");
            if (lastFile !== file.path) {
                contentEl.setAttribute("data-pp-file", file.path);
                if (preview) {
                    preview.querySelectorAll(".pp-title-wrapper").forEach(function(w) {
                        var title = w.querySelector(".inline-title");
                        if (title) w.parentNode.insertBefore(title, w);
                        w.remove();
                    });
                }
            }

            // Banner is always re-applied (cheap — skips internally if src+pos unchanged)
            await this.renderBanner(contentEl, containers, fm, file.path);

            if (!iconValue) return; // no icon to render

            if (this.settings.iconInTitle) {
                // Preview pane: check for a wrapped .pp-title-icon inside preview
                var previewView = contentEl.querySelector(".markdown-reading-view .markdown-preview-view");
                var previewReady = false;
                if (previewView) {
                    var previewIcon = previewView.querySelector(".pp-title-wrapper > .pp-title-icon");
                    previewReady = previewIcon && this.renderedContainers.get(previewIcon) === iconValue;
                } else {
                    previewReady = true; // no preview pane present — nothing to render there
                }

                // Editor pane: check for a floating .icon-wrapper on the scroller
                var editorScroller2 = contentEl.querySelector(".markdown-source-view .cm-editor .cm-scroller");
                var editorReady = false;
                if (editorScroller2) {
                    var editorWrapper = editorScroller2.querySelector(":scope > .icon-wrapper");
                    editorReady = editorWrapper && this.renderedContainers.get(editorWrapper) === iconValue;
                } else {
                    editorReady = true; // no editor pane present — nothing to render there
                }

                if (!previewReady || !editorReady) {
                    await this.renderIcon(contentEl, containers, fm, file.path);
                }
            } else {
                // Floating icon: check every active container
                var needsRender = false;
                for (var i = 0; i < containers.length; i++) {
                    var existingWrapper = containers[i].querySelector(":scope > .icon-wrapper");
                    if (!existingWrapper || this.renderedContainers.get(existingWrapper) !== iconValue) {
                        needsRender = true;
                        break;
                    }
                }
                if (needsRender) {
                    await this.renderIcon(contentEl, containers, fm, file.path);
                }
            }

        } catch (error) {
            console.error("Error processing view:", error);
        }
    }

    updateAllViews() {
        this.app.workspace.getLeavesOfType("markdown").forEach(leaf => {
            if (leaf.view instanceof MarkdownView) this.processView(leaf.view);
        });
        this.updateTabIcons();
        if (this.settings.showFileExplorerIcons) this.updateFileExplorer();
        this.updateIconColorInversion();
    }

    // ── Tab icons ─────────────────────────────────────────────

    updateTabIcons() {
        if (!this.settings.enableIcon && !this.settings.showFileExplorerIcons) return;

        this.app.workspace.getLeavesOfType("markdown").forEach(leaf => {
            const file  = leaf.view ? leaf.view.file : null;
            const tabEl = leaf.tabHeaderEl;
            if (!file || !tabEl) return;

            var _leafCache = this.app.metadataCache.getFileCache(file);
            var _fm5 = _leafCache ? _leafCache.frontmatter : null;
            var iconValue = _fm5 ? _fm5[this.settings.iconProperty] : undefined;

            if (tabEl.closest(".mod-stacked")) {
                this._updateStackedTabIcon(tabEl, iconValue, file.path);
            } else {
                this._updateFlatTabIcon(tabEl, iconValue, file.path);
            }
        });
    }

    /** @private Update icon in a stacked (vertical) tab header. */
    _updateStackedTabIcon(tabEl, iconValue, filePath) {
        const iconContainer = tabEl.querySelector(".workspace-tab-header-inner-icon");
        if (!iconContainer) return;

        if (iconValue) {
            if (tabEl.getAttribute("data-pp-icon") !== iconValue) {
                tabEl.setAttribute("data-pp-icon", iconValue);
                this.appendIconContent(iconContainer, iconValue, filePath);
            }
        } else if (tabEl.hasAttribute("data-pp-icon")) {
            tabEl.removeAttribute("data-pp-icon");
            setIcon(iconContainer, "lucide-file");
        }
    }

    /** @private Update icon in a normal (horizontal) tab header. */
    _updateFlatTabIcon(tabEl, iconValue, filePath) {
        const container   = tabEl.querySelector(".workspace-tab-header-inner");
        if (!container) return;

        const defaultIcon = container.querySelector(".workspace-tab-header-inner-icon");
        let   customIconEl = container.querySelector(".pp-tab-icon");

        if (iconValue) {
            if (defaultIcon) defaultIcon.style.display = "none";

            if (!customIconEl) {
                customIconEl = document.createElement("div");
                customIconEl.classList.add("pp-tab-icon");
                const titleEl = container.querySelector(".workspace-tab-header-inner-title");
                if (titleEl) container.insertBefore(customIconEl, titleEl);
                else container.appendChild(customIconEl);
            }

            if (customIconEl.getAttribute("data-icon") !== iconValue) {
                customIconEl.setAttribute("data-icon", iconValue);
                this.appendIconContent(customIconEl, iconValue, filePath);
            }
        } else {
            if (customIconEl) customIconEl.remove();
            if (defaultIcon) defaultIcon.style.display = "";
        }
    }

    // ── File explorer icons ───────────────────────────────────

    updateFileExplorer() {
        if (!this.settings.showFileExplorerIcons) return;
        this.app.workspace.getLeavesOfType("file-explorer").forEach(leaf => {
            leaf.view.containerEl.querySelectorAll(".tree-item-self[data-path]").forEach(item => {
                const path = item.getAttribute("data-path");
                const file = this.app.vault.getAbstractFileByPath(path);
                let iconValue = null;
                let isFolder  = false;

                if (file instanceof TFile) {
                    var _explorerCache = this.app.metadataCache.getFileCache(file);
                    var _fm6 = _explorerCache ? _explorerCache.frontmatter : null;
                    iconValue = _fm6 ? _fm6[this.settings.iconProperty] : undefined;
                } else if (file instanceof TFolder) {
                    iconValue = this.settings.folderIcons[file.path] || "lucide-folder";
                    isFolder  = true;
                }

                this.renderFileExplorerIcon(item, iconValue, path, isFolder);
            });
        });
    }

    renderFileExplorerIcon(itemEl, iconValue, sourcePath, isFolder) {
        let iconEl = itemEl.querySelector(".pp-file-icon");

        if (!iconValue && !isFolder) {
            if (iconEl) iconEl.remove();
            return;
        }
        if (isFolder && !iconValue) iconValue = "lucide-folder";

        if (!iconEl) {
            iconEl = document.createElement("div");
            iconEl.classList.add("pp-file-icon");
            if (isFolder) iconEl.classList.add("pp-folder-icon");
            const inner = itemEl.querySelector(".tree-item-inner");
            if (inner) itemEl.insertBefore(iconEl, inner);
            else itemEl.appendChild(iconEl);
        }

        if (iconEl.getAttribute("data-icon") !== iconValue) {
            iconEl.setAttribute("data-icon", iconValue || "");
            this.appendIconContent(iconEl, iconValue, sourcePath);
        }
    }

    // ── Backlinks suppression ─────────────────────────────────

    hideBacklinksOnStartup() {
        setTimeout(() => this.closeBacklinksLeaf(), 1000);
        this.registerEvent(
            this.app.workspace.on("layout-change", () => this.closeBacklinksLeaf())
        );
    }

    closeBacklinksLeaf() {
        this.app.workspace.iterateAllLeaves(leaf => {
            if (leaf.view && typeof leaf.view.getViewType === "function" && leaf.view.getViewType() === "backlink") leaf.detach();
        });
    }

    // ── CSS helpers ───────────────────────────────────────────

    updateScrollbarStyle() {
        document.body.classList.toggle("hider-scroll", this.settings.hideScrollbars);
    }

    updateCssVariables() {
        const s = this.settings;
        const vars = {
            "--banner-height":          s.bannerHeight + "px",
            "--banner-margin":          s.bannerMargin + "px",
            "--banner-fading":          s.bannerFading
                ? "linear-gradient(to bottom, black 25%, transparent)"
                : "none",
            "--pp-icon-size":           s.iconSize + "px",
            "--pp-title-icon-size":     s.iconSize + "px",
            "--pp-icon-top-margin":     s.iconTopMargin + "px",
            "--pp-icon-top-margin-wb":  s.iconTopMarginWithoutBanner + "px",
            "--pp-icon-gap":            s.iconGap + "px",
            "--pp-banner-icon-gap":     s.bannerIconGap + "px",
            "--pp-icon-left-margin":    s.iconLeftMargin + "px",
        };
        var varKeys = Object.keys(vars);
        for (var vi = 0; vi < varKeys.length; vi++) {
            document.body.style.setProperty(varKeys[vi], vars[varKeys[vi]]);
        }
    }

    // ── Settings persistence ──────────────────────────────────

    async loadSettings() {
        const data = await this.loadData();
        this.settings = Object.assign({}, DEFAULT_SETTINGS, data);

        // Strip cache fields that were mistakenly saved into settings in old versions
        delete this.settings.imageCache;
        delete this.settings.cacheTimestamps;

        // Ensure optional setting fields exist
        if (!this.settings.temporaryHiddenProperties) this.settings.temporaryHiddenProperties = [];
        if (!this.settings.temporaryViewTimeout)      this.settings.temporaryViewTimeout = 60;
        if (!this.settings.iconColorPreferences)      this.settings.iconColorPreferences = {};

        this.serialIndexes = this.settings.serialCounters
            ? new Map(Object.entries(this.settings.serialCounters))
            : new Map();
        if (!this.settings.serialCounters) this.settings.serialCounters = {};
    }

    async saveSettings() {
        this.settings.serialCounters = Object.fromEntries(this.serialIndexes);

        var mainSettings = Object.assign({}, this.settings);
        delete mainSettings.imageCache;
        delete mainSettings.cacheTimestamps;

        await this.saveData(mainSettings);
        await this.saveBufferData();

        this.updateCssVariables();
        this.updateHiddenPropertiesCSS();
        this.debouncedUpdate();
    }

    // ── Image cache ───────────────────────────────────────────

    async initCache() {
        await this.loadData();        // loads main data.json (already done in loadSettings)
        this.imageCache      = {};
        this.cacheTimestamps = {};
        await this.loadBufferData();
        this.pendingFetches  = new Map();
    }

    async loadBufferData() {
        try {
            const raw    = await this.app.vault.adapter.read(this.bufferFilePath);
            const parsed = JSON.parse(raw);
            this.imageCache      = parsed.imageCache      || {};
            this.cacheTimestamps = parsed.cacheTimestamps || {};
        } catch (_err) {
            // File missing or corrupt — start fresh
            this.imageCache      = {};
            this.cacheTimestamps = {};
            await this.saveBufferData();
        }
    }

    async saveBufferData() {
        try {
            await this.app.vault.adapter.write(
                this.bufferFilePath,
                JSON.stringify({
                    imageCache:      this.imageCache,
                    cacheTimestamps: this.cacheTimestamps,
                    lastUpdated:     Date.now()
                }, null, 2)
            );
        } catch (error) {
            console.error("Error saving buffer data:", error);
        }
    }

    async saveCache() {
        var mainSettings = Object.assign({}, this.settings);
        delete mainSettings.imageCache;
        delete mainSettings.cacheTimestamps;
        await this.saveData(mainSettings);
        await this.saveBufferData();
    }

    async clearImageCache() {
        this.imageCache      = {};
        this.cacheTimestamps = {};
        this.pendingFetches.clear();
        this._clearRenderCaches();
        await this.saveBufferData();
        await this.saveCache();
        this.debouncedUpdate();
    }

    /** Determine whether a cached entry is still within the expiry window. */
    _isCacheEntryFresh(cacheKey) {
        if (!this.imageCache[cacheKey] || !this.cacheTimestamps[cacheKey]) return false;
        const expiryMs = this.settings.cacheExpiryDays * 24 * 60 * 60 * 1000;
        return (Date.now() - this.cacheTimestamps[cacheKey]) < expiryMs;
    }

    /**
     * Fetch a remote image, cache it as a base64 data-URL, and return it.
     * Deduplicates in-flight requests for the same URL.
     */
    async fetchAndCacheImage(url, _sourcePath) {
        if (!url || !url.startsWith("http")) return url;
        const cacheKey = url;

        if (this._isCacheEntryFresh(cacheKey)) return this.imageCache[cacheKey];
        if (this.pendingFetches.has(cacheKey))  return await this.pendingFetches.get(cacheKey);

        const fetchPromise = (async () => {
            try {
                const response = await requestUrl({ url, method: "GET" });
                if (response.status >= 200 && response.status < 300) {
                    let contentType = (response.headers["content-type"] || "image/png")
                        .split(";")[0].trim();
                    if (url.toLowerCase().endsWith(".svg") || contentType.includes("svg")) {
                        contentType = "image/svg+xml";
                    }
                    const dataUrl = `data:${contentType};base64,${arrayBufferToBase64(response.arrayBuffer)}`;
                    this.imageCache[cacheKey]      = dataUrl;
                    this.cacheTimestamps[cacheKey] = Date.now();
                    await this.saveCache();
                    return dataUrl;
                }
                console.warn(`Failed to fetch image: ${response.status} ${url}`);
                return this.imageCache[cacheKey] || url;
            } catch (error) {
                console.error("Error fetching image:", error);
                return this.imageCache[cacheKey] || url;
            } finally {
                this.pendingFetches.delete(cacheKey);
            }
        })();

        this.pendingFetches.set(cacheKey, fetchPromise);
        return await fetchPromise;
    }

    /**
     * Fetch an external SVG as cleaned markup (colors → currentColor, sizes removed).
     * Caches the result in `imageCache`.
     */
    async fetchExternalSvgText(url) {
        const cacheKey = `svg-text:${url}`;

        if (this._isCacheEntryFresh(cacheKey)) return this.imageCache[cacheKey];
        if (this.pendingFetches.has(cacheKey))  return await this.pendingFetches.get(cacheKey);

        const fetchPromise = (async () => {
            try {
                const response = await requestUrl({ url, method: "GET" });
                if (response.status < 200 || response.status >= 300) {
                    console.warn(`SVG fetch failed (${response.status}): ${url}`);
                    return null;
                }

                let svgText = response.text;

                // Rewrite hardcoded colours → currentColor
                svgText = svgText.replace(/\b(fill|stroke)="(?!none)[^"]*"/gi,   '$1="currentColor"');
                svgText = svgText.replace(/\b(fill|stroke)\s*:\s*(?!none)[^;}"]+/gi, "$1:currentColor");
                svgText = svgText.replace(/stop-color="(?!none)[^"]*"/gi,         'stop-color="currentColor"');

                // Remove fixed root dimensions so CSS controls the size
                svgText = svgText.replace(/(<svg\b[^>]*?)\s+width="[^"]*"/i,  "$1");
                svgText = svgText.replace(/(<svg\b[^>]*?)\s+height="[^"]*"/i, "$1");

                this.imageCache[cacheKey]      = svgText;
                this.cacheTimestamps[cacheKey] = Date.now();
                await this.saveCache();
                return svgText;
            } catch (err) {
                console.error("Error fetching external SVG text:", err);
                return null;
            } finally {
                this.pendingFetches.delete(cacheKey);
            }
        })();

        this.pendingFetches.set(cacheKey, fetchPromise);
        return await fetchPromise;
    }

    /**
     * Parse cleaned SVG markup and inject a real `<svg>` DOM element
     * so that CSS `color: inherit` / `currentColor` flows through correctly.
     */
    injectInlineSvg(container, svgText) {
        try {
            const doc  = new DOMParser().parseFromString(svgText, "image/svg+xml");
            const svgEl = doc.querySelector("svg");
            if (!svgEl) return false;

            svgEl.setAttribute("width",  "100%");
            svgEl.setAttribute("height", "100%");
            svgEl.style.display = "block";
            svgEl.classList.add("pp-external-svg");

            container.appendChild(document.adoptNode(svgEl));
            return true;
        } catch (err) {
            console.error("Error injecting inline SVG:", err);
            return false;
        }
    }

    /**
     * Resolve a link to a usable `src` string.
     * Remote URLs are passed through the image cache when caching is enabled.
     * Local wiki-links are resolved via metadataCache → vault resource path.
     */
    async resolveLink(link, sourcePath) {
        if (!link) return "";
        if (isExternalUrl(link)) {
            return this.settings.enableCache
                ? await this.fetchAndCacheImage(link, sourcePath)
                : link;
        }
        const file = this.app.metadataCache.getFirstLinkpathDest(link, sourcePath);
        return file ? this.app.vault.getResourcePath(file) : link;
    }
};

// ─────────────────────────────────────────────────────────────
//  Modal: Icon picker
// ─────────────────────────────────────────────────────────────

class IconSuggestModal extends SuggestModal {
    constructor(app, plugin, targetItem) {
        super(app);
        this.plugin     = plugin;
        this.targetItem = targetItem;
        this.iconIds    = getIconIds();
    }

    getSuggestions(query) {
        const suggestions = this.iconIds.filter(id =>
            id.toLowerCase().includes(query.toLowerCase())
        );
        // Prepend the raw query as a "Custom" option when it looks like a custom icon
        if (query && !suggestions.includes(query) && this._isCustomIcon(query)) {
            suggestions.unshift(`Custom: ${query}`);
        }
        return suggestions;
    }

    /** Any non-empty query is valid as a custom icon (URL, emoji, path, etc.). */
    _isCustomIcon(value) {
        return value.length > 0;
    }

    renderSuggestion(item, el) {
        el.classList.add("pp-icon-suggestion");
        if (item.startsWith("Custom: ")) {
            el.createSpan({ text: "Custom icon", cls: "pp-icon-custom" });
            el.createSpan({ text: `"${item.substring(8)}"`, cls: "pp-icon-name" });
            return;
        }
        const iconSvg = getIcon(item);
        if (iconSvg) el.appendChild(iconSvg);
        el.createSpan({ text: item, cls: "pp-icon-name" });
    }

    onChooseSuggestion(item) {
        const iconValue = item.startsWith("Custom: ") ? item.substring(8) : item;

        if (this.targetItem instanceof TFile) {
            this.app.fileManager.processFrontMatter(this.targetItem, fm => {
                fm[this.plugin.settings.iconProperty] = iconValue;
            });
            // Invalidate the WeakMap cache so every container for this file
            // re-renders with the new icon on the next processView call.
            // We do this by replacing the WeakMap entirely (WeakMap has no .clear()).
            this.plugin.renderedContainers = new WeakMap();

        } else if (this.targetItem instanceof TFolder) {
            this.plugin.settings.folderIcons[this.targetItem.path] = iconValue;
            this.plugin.saveSettings();
        }
    }
}

// ─────────────────────────────────────────────────────────────
//  Modal: Banner picker
// ─────────────────────────────────────────────────────────────

class BannerSuggestModal extends SuggestModal {
    constructor(app, plugin, targetFile) {
        super(app);
        this.plugin     = plugin;
        this.targetFile = targetFile;
    }

    getSuggestions(query) {
        const fileSuggestions = this.app.vault.getFiles().filter(f =>
            IMAGE_EXTENSIONS.includes(f.extension) &&
            f.path.toLowerCase().includes(query.toLowerCase())
        );

        const suggestions = fileSuggestions.slice();
        if (query && this._isImageLink(query)) {
            suggestions.unshift(`Custom: ${query}`);
        }
        return suggestions;
    }

    _isImageLink(value) {
        return value.startsWith("http") || value.startsWith("![[") || value.includes(".");
    }

    renderSuggestion(item, el) {
        el.empty();
        el.addClass("pp-banner-suggestion");
        const textContainer = el.createDiv({ cls: "pp-banner-text" });

        if (typeof item === "string" && item.startsWith("Custom: ")) {
            const customValue = item.substring(8);
            textContainer.createDiv({ text: "Custom image URL" });
            textContainer.createDiv({ text: customValue, cls: "pp-suggestion-sub" });
            if (customValue.startsWith("http")) {
                this._loadImagePreview(el.createDiv({ cls: "pp-banner-preview-container" }), customValue);
            }
        } else {
            textContainer.createDiv({ text: item.name });
            textContainer.createDiv({ text: item.path, cls: "pp-suggestion-sub" });
        }
    }

    _loadImagePreview(container, src) {
        const img = container.createEl("img", { cls: "pp-banner-preview" });
        img.setAttribute("loading", "lazy");
        img.src = src;
        img.onerror = () => {
            container.empty();
            container.style.display = "none";
        };
    }

    onChooseSuggestion(item) {
        let bannerValue;
        if (typeof item === "string" && item.startsWith("Custom: ")) {
            const customValue = item.substring(8);
            if (customValue.startsWith("http")) {
                bannerValue = customValue;
            } else if (customValue.includes(".") && !customValue.startsWith("[[")) {
                bannerValue = `[[${customValue}]]`;
            } else {
                bannerValue = customValue;
            }
        } else {
            bannerValue = `[[${item.path}]]`;
        }

        this.app.fileManager.processFrontMatter(this.targetFile, fm => {
            fm[this.plugin.settings.bannerProperty] = bannerValue;
        });
    }
}

// ─────────────────────────────────────────────────────────────
//  Modal: Banner position
// ─────────────────────────────────────────────────────────────

class BannerPositionModal extends Modal {
    constructor(app, plugin, targetFile) {
        super(app);
        this.plugin     = plugin;
        this.targetFile = targetFile;
    }

    onOpen() {
        const { contentEl } = this;
        contentEl.empty();

        var _fc7 = this.app.metadataCache.getFileCache(this.targetFile); const fm = (_fc7 && _fc7.frontmatter) ? _fc7.frontmatter : {};
        const currentPos = fm[this.plugin.settings.bannerPositionProperty] || 50;

        // Slider
        const sliderContainer = contentEl.createDiv({ cls: "banner-position-slider" });
        const slider = sliderContainer.createEl("input", {
            type: "range",
            attr: { min: "0", max: "100", value: String(currentPos) }
        });
        const valueDisplay = sliderContainer.createEl("span", {
            text: `${currentPos}%`, cls: "position-value"
        });

        slider.addEventListener("input", (e) => {
            valueDisplay.textContent = `${e.target.value}%`;
        });
        slider.addEventListener("change", async (e) => {
            await this._saveBannerPosition(parseInt(e.target.value));
        });

        // Preset buttons
        const presets = contentEl.createDiv({ cls: "position-presets" });
        var presetData = [["Top", 0], ["Center", 50], ["Bottom", 100]];
        for (var pi = 0; pi < presetData.length; pi++) {
            (function(label, value) {
                presets.createEl("button", { text: label })
                    .addEventListener("click", function() { this._saveBannerPosition(value); }.bind(this));
            }).call(this, presetData[pi][0], presetData[pi][1]);
        }
    }

    async _saveBannerPosition(value) {
        await this.app.fileManager.processFrontMatter(this.targetFile, fm => {
            fm[this.plugin.settings.bannerPositionProperty] = value;
        });
        this.plugin.debouncedUpdate();
        this.close();
    }

    onClose() {
        this.contentEl.empty();
    }
}

// ─────────────────────────────────────────────────────────────
//  Modal: Icon colour preference
// ─────────────────────────────────────────────────────────────

class IconColorPreferenceModal extends Modal {
    constructor(app, plugin, iconUrl) {
        super(app);
        this.plugin  = plugin;
        this.iconUrl = iconUrl;
    }

    onOpen() {
        const { contentEl } = this;
        contentEl.empty();
        contentEl.createEl("h2", { text: "Icon Color Preference" });

        const truncated = this.iconUrl.length > 60
            ? this.iconUrl.substring(0, 60) + "..."
            : this.iconUrl;
        contentEl.createEl("p", { text: `For icon: ${truncated}`, cls: "icon-preference-url" });
        contentEl.createEl("p", {
            text: "Select the icon's base color to ensure it displays correctly in both light and dark themes.",
            cls: "icon-preference-desc"
        });

        const buttonContainer = contentEl.createDiv({ cls: "icon-preference-buttons" });

        this._addButton(buttonContainer, "White Icon (Light Color)", "mod-cta", async () => {
            await this.plugin.setIconColorPreference(this.iconUrl, "white");
            this.close();
        });
        this._addButton(buttonContainer, "Black Icon (Dark Color)", "mod-cta", async () => {
            await this.plugin.setIconColorPreference(this.iconUrl, "black");
            this.close();
        });
        this._addButton(buttonContainer, "Clear Preference", "mod-warning", async () => {
            if (this.plugin.settings.iconColorPreferences) {
                delete this.plugin.settings.iconColorPreferences[this.iconUrl];
                await this.plugin.saveSettings();
                new Notice("Icon color preference cleared");
                this.plugin.forceRefreshAllIcons();
            }
            this.close();
        });
        this._addButton(buttonContainer, "Cancel", null, () => this.close());

        contentEl.createEl("p", {
            text: "Tip: Choose 'White' if the icon is white/light on a transparent background. Choose 'Black' if the icon is black/dark. The plugin will automatically adjust the color for the opposite theme.",
            cls: "icon-preference-tip",
            style: "margin-top: 20px; font-size: 12px; color: var(--text-muted);"
        });
    }

    _addButton(container, text, cls, onClick) {
        const btn = container.createEl("button", { text, cls: cls || undefined });
        btn.addEventListener("click", onClick);
        return btn;
    }

    onClose() {
        this.contentEl.empty();
    }
}

// ─────────────────────────────────────────────────────────────
//  Settings tab
// ─────────────────────────────────────────────────────────────

class StyleshVaultSettingTab extends PluginSettingTab {
    constructor(app, plugin) {
        super(app, plugin);
        this.plugin = plugin;
    }

    display() {
        const { containerEl } = this;
        containerEl.empty();

        // ── Banner settings ──────────────────────────────────
        containerEl.createEl("h2", { text: "Banners" });
        this._toggle("Enable Banners", null, "enableBanner");
        this._text("Banner Height", null, "bannerHeight", Number);

        // ── Icon settings ────────────────────────────────────
        containerEl.createEl("h2", { text: "Icons" });
        this._toggle("Enable Icons", null, "enableIcon");
        this._text("Icon Size", null, "iconSize", Number);

        // ── Cache settings ───────────────────────────────────
        containerEl.createEl("h2", { text: "Image Cache" });
        this._toggle("Enable Image Cache", "Cache remote images locally for offline access", "enableCache");
        this._text("Cache Expiry Days", "How many days to keep cached images", "cacheExpiryDays", Number);

        // ── UI mode ──────────────────────────────────────────
        containerEl.createEl("h2", { text: "UI Mode" });
        this._text(
            "UI Mode Property Key",
            "Frontmatter key to force 'edit' or 'preview' mode. Use 'preview-force' or 'edit-force' to prevent user from changing the mode.",
            "uiProperty"
        );

        // ── Scrollbars ───────────────────────────────────────
        containerEl.createEl("h2", { text: "hide scrollbar" });
        this._toggle("hide Scrollbars", "enable to hide scrollbars", "hideScrollbars",
            () => this.plugin.updateScrollbarStyle());

        // ── Hidden properties ────────────────────────────────
        containerEl.createEl("h2", { text: "Hidden Properties" });
        this._text(
            "Temporary View Timeout",
            "How many seconds to show properties in temporary view",
            "temporaryViewTimeout",
            (v) => { const n = parseInt(v); return (!isNaN(n) && n > 0) ? n : null; }
        );
        this._buildHiddenPropertiesList(containerEl);

        // ── Icon colour preferences ──────────────────────────
        containerEl.createEl("h2", { text: "Icon Color Preferences" });
        new Setting(containerEl)
            .setName("Clear All Icon Color Preferences")
            .setDesc("Remove all saved icon color preferences")
            .addButton(btn => btn.setButtonText("Clear All").setWarning().onClick(async () => {
                this.plugin.settings.iconColorPreferences = {};
                await this.plugin.saveSettings();
                new Notice("All icon color preferences cleared");
                this.plugin.forceRefreshAllIcons();
            }));
    }

    // ── Private setting builders ──────────────────────────────

    /**
     * Create a toggle setting bound to a settings key.
     * @param {string}   name
     * @param {string|null} desc
     * @param {string}   key         — key in `this.plugin.settings`
     * @param {Function} [onAfter]   — called after save (optional)
     */
    _toggle(name, desc, key, onAfter = null) {
        const setting = new Setting(this.containerEl).setName(name);
        if (desc) setting.setDesc(desc);
        setting.addToggle(t =>
            t.setValue(this.plugin.settings[key]).onChange(async v => {
                this.plugin.settings[key] = v;
                await this.plugin.saveSettings();
                if (onAfter) onAfter(v);
            })
        );
    }

    /**
     * Create a text setting bound to a settings key.
     * @param {string}            name
     * @param {string|null}       desc
     * @param {string}            key
     * @param {Function|null}     coerce  — transforms string → stored value; return null to skip save
     */
    _text(name, desc, key, coerce = null) {
        const setting = new Setting(this.containerEl).setName(name);
        if (desc) setting.setDesc(desc);
        setting.addText(t =>
            t.setValue(String(this.plugin.settings[key])).onChange(async v => {
                const value = coerce ? coerce(v) : v;
                if (value === null) return;         // validation failed
                this.plugin.settings[key] = value;
                await this.plugin.saveSettings();
            })
        );
    }

    /** Build the collapsible hidden-properties list UI. */
    _buildHiddenPropertiesList(containerEl) {
        const hiddenPropsContainer = containerEl.createDiv({ cls: "hidden-props-container" });
        const dropdownHeader = hiddenPropsContainer.createDiv({ cls: "hidden-props-dropdown-header" });
        dropdownHeader.createEl("h3", { text: "Hidden Properties" });

        const countSpan = dropdownHeader.createEl("span", {
            cls: "hidden-props-count",
            text: `(${this.plugin.settings.hiddenProperties.length})`
        });
        const toggleIcon = dropdownHeader.createEl("span", { cls: "hidden-props-toggle", text: "▼" });

        let isExpanded = false;
        const hiddenList = hiddenPropsContainer.createDiv({ cls: "hidden-props-list" });
        hiddenList.style.display = "none";

        const refresh = () => {
            hiddenList.empty();
            const props = this.plugin.settings.hiddenProperties;

            if (props.length === 0) {
                hiddenList.createEl("div", { text: "No hidden properties", cls: "hidden-props-empty" });
            } else {
                props.forEach(prop => this._renderHiddenPropItem(hiddenList, prop, refresh, countSpan));
            }
            toggleIcon.textContent = isExpanded ? "▲" : "▼";
        };

        refresh();

        dropdownHeader.addEventListener("click", () => {
            isExpanded = !isExpanded;
            hiddenList.style.display = isExpanded ? "block" : "none";
            toggleIcon.textContent = isExpanded ? "▲" : "▼";
        });
    }

    /** Render a single hidden-property row. */
    _renderHiddenPropItem(listEl, prop, refresh, countSpan) {
        const propItem = listEl.createDiv({ cls: "hidden-prop-item" });
        propItem.createEl("span", { text: prop, cls: "hidden-prop-name" });

        const buttonContainer = propItem.createDiv({ cls: "hidden-prop-buttons" });

        // Show-in-temp button
        const showInTempBtn = buttonContainer.createEl("button", {
            cls:  "hidden-prop-show-temp",
            attr: { title: "Show this property in temporary view" }
        });
        const tempIcon = getIcon("square-dashed-mouse-pointer");
        if (tempIcon) showInTempBtn.appendChild(tempIcon.cloneNode(true));
        else          showInTempBtn.textContent = "T";

        const isInTemp = this.plugin.settings.temporaryHiddenProperties.includes(prop);
        if (isInTemp) {
            showInTempBtn.classList.add("is-active");
            showInTempBtn.title = "Will show in temporary view";
        }

        showInTempBtn.addEventListener("click", async (e) => {
            e.stopPropagation();
            if (!this.plugin.settings.temporaryHiddenProperties.includes(prop)) {
                this.plugin.settings.temporaryHiddenProperties.push(prop);
                await this.plugin.saveSettings();
                new Notice(`"${prop}" will appear in temporary view`);
                showInTempBtn.classList.add("is-active");
                showInTempBtn.title = "Will show in temporary view";
            } else {
                this.plugin.settings.temporaryHiddenProperties.remove(prop);
                await this.plugin.saveSettings();
                new Notice(`"${prop}" removed from temporary view`);
                showInTempBtn.classList.remove("is-active");
                showInTempBtn.title = "Show this property in temporary view";
            }
        });

        // Remove (unhide permanently) button
        const removeBtn = buttonContainer.createEl("button", { cls: "hidden-prop-remove" });
        removeBtn.innerHTML = "×";
        removeBtn.title = "Unhide property permanently";

        removeBtn.addEventListener("click", async (e) => {
            e.stopPropagation();
            this.plugin.settings.hiddenProperties.remove(prop);
            this.plugin.settings.temporaryHiddenProperties.remove(prop);
            await this.plugin.saveSettings();
            refresh();
            countSpan.textContent = `(${this.plugin.settings.hiddenProperties.length})`;
            new Notice(`Property "${prop}" is now permanently visible`);
        });
    }
}