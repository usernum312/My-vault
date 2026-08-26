// ============================================================
//  StyleshVault — Obsidian Plugin
// ============================================================

const {
    Plugin, PluginSettingTab, Setting, MarkdownView,
    getIcon, getIconIds, addIcon, SuggestModal, TFile, TFolder,
    debounce, Menu, Modal, Notice, setIcon,
    requestUrl, arrayBufferToBase64
} = require("obsidian");

// ─────────────────────────────────────────────────────────────
//  Constants
// ─────────────────────────────────────────────────────────────

const DEFAULT_SETTINGS = {
    enableBanner:               true,
    bannerProperty:             "banner",
    ShowHiddenPropsWhileEditing:       false,
    bannerPositionProperty:     "banner_y",
    bannerHeight:               170,
    bannerMargin:               0,
    bannerFading:               false,
    enableIcon:                 true,
    iconProperty:               "icon",
    iconSize:                   40,
    iconTopMargin:              145,
    iconTopMarginWithoutBanner: 0,
    iconLeftMargin:             22,
    iconGap:                    10,
    bannerIconGap:              0,
    iconInTitle:                true,
    showFileExplorerIcons:      true,
    hidePropsOnEditorOnly:      false,
    folderIcons:                {},
    folderIconsIndex:           {},
    hiddenProperties:           [],
    temporaryHiddenProperties:  [],
    temporaryViewTimeout:       60,
    uiProperty:                 "ui",
    enableCache:                true,
    cacheExpiryDays:            30,
    hideScrollbars:             true,
    iconColorPreferences:       {}
};

const VIDEO_EXTENSIONS   = [".mp4", ".webm", ".mov"];
const IMAGE_EXTENSIONS   = ["png", "jpg", "jpeg", "gif", "bmp", "svg", "webp", "mp4"];
const ICON_TIMEOUT_MS    = 5000;
const PROPERTY_EDIT_GRACE_MS = 1000;

// ─────────────────────────────────────────────────────────────
//  Pure helper functions
// ─────────────────────────────────────────────────────────────

function formatImageLink(link) {
    if (!link || typeof link !== "string") return "";
    return link.replace(/^!?\[\[|\]\]$/g, "");
}

function isEmoji(str) {
    return /^\p{Emoji}$/u.test(str) &&
        str.indexOf(".") === -1 &&
        str.indexOf("/") === -1;
}

function isExternalSvgUrl(url) {
    if (!url || typeof url !== "string") return false;
    return url.split("?")[0].toLowerCase().endsWith(".svg");
}

function isExternalUrl(src) {
    return typeof src === "string" &&
        (src.indexOf("http://") === 0 || src.indexOf("https://") === 0);
}

function isVideoSrc(src) {
    var lower = src.toLowerCase();
    for (var i = 0; i < VIDEO_EXTENSIONS.length; i++) {
        if (lower.endsWith(VIDEO_EXTENSIONS[i])) return true;
    }
    return false;
}

function withTimeout(promise, ms, label) {
    return Promise.race([
        promise,
        new Promise(function(_, reject) {
            setTimeout(function() {
                reject(new Error("Timeout: " + label));
            }, ms);
        })
    ]);
}

function applyColorFilter(img, colorPref) {
    if (!colorPref) return;
    var isDark = document.body.classList.contains("theme-dark");
    var shouldInvert =
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

        this.bufferFilePath =
            this.app.vault.configDir + "/plugins/stylesh-vault/buffer.json";

        // Property-editing state
        this.editingProperties     = new Set();
        this.propertyEditTimeout   = null;
        this.temporaryVisibleProps  = new Map();

        // Timer bookkeeping (for clean onunload)
        this.activeTimeouts  = new Map();
        this.activeIntervals = new Map();

        // MutationObserver for file-explorer folder expansion
        this.fileExplorerObserver = null;

        // WeakSet: tracks containers currently mid-render to prevent
        // concurrent duplicate renders on the same DOM element.
        // Entries are GC'd automatically when elements leave the DOM.
        this.renderingContainers = new WeakSet();

        // debouncedUpdate MUST be defined BEFORE registerAllEvents because
        // Obsidian fires layout-change during startup, before onload finishes.
        this.debouncedUpdate = debounce(function() {
            this.updateAllViews();
            this.updateTabIcons();
        }.bind(this), 300, true);

        this.addSettingTab(new StyleshVaultSettingTab(this.app, this));
        this.updateCssVariables();
        this.updateHiddenPropertiesCSS();

        this.registerAllEvents();
        this._registerFileOpenHandler();
        this._registerCommands();
        this._registerContextMenus();
        this._registerDomListeners();

        // Patch getIcon() before onLayoutReady so the sidebar icon is correct
        // on Obsidian's very first render — no flicker.
        var _self = this;
        this.app.workspace.iterateAllLeaves(function(leaf) {
            if (!leaf.view || !(leaf.view instanceof MarkdownView)) return;
            var file     = leaf.view.file;
            var filePath = file ? file.path : ((leaf.getViewState().state) || {}).file || null;
            if (!filePath) return;
            var tfile = file || _self.app.vault.getAbstractFileByPath(filePath);
            if (!(tfile instanceof TFile)) return;
            var fc = _self.app.metadataCache.getFileCache(tfile);
            var fm = fc ? fc.frontmatter : null;
            var iconValue = fm ? fm[_self.settings.iconProperty] : null;
            if (iconValue) _self._patchLeafGetIcon(leaf, iconValue, filePath);
        });

        // Initialise in-memory cache structures immediately so fetch
        // deduplication (pendingFetches) and _isCacheEntryFresh() work from
        // the very first render — even before buffer.json has been read.
        this.imageCache      = {};
        this.cacheTimestamps = {};
        this.pendingFetches  = new Map();

        // Load buffer.json off the critical onload path.  Icons and banners
        // start rendering right away using an empty cache; once the file is
        // parsed (typically a few hundred ms later) the populated cache is
        // available for all subsequent resolveLink / fetchAndCacheImage calls.
        // This eliminates the largest single startup delay (~multi-second JSON
        // parse of a large cache blocking the entire plugin load).
        this.initCache().catch(function(err) {
            console.error("StyleshVault: error loading image cache:", err);
        });

        this.setupPropertyEditListeners();
        this.updateScrollbarStyle();

        this.registerEvent(
            this.app.workspace.on("css-change", function() {
                this.updateIconColorInversion();
            }.bind(this))
        );

        // ── Monkey-patch MarkdownView.prototype.setState ──────────────────
        // Intercepts every view-mode transition globally (file open, Ctrl/Cmd+E,
        // toolbar clicks) BEFORE Obsidian applies the state, so there is zero
        // flicker.  No event listeners or DOM manipulation are used.
        var _pluginSelf = this;
        var _proto = MarkdownView.prototype;
        this._origMarkdownViewSetState = _proto.setState;

        _proto.setState = function(state, result) {
            try {
                // Detect embedded transclusions: a real top-level leaf's containerEl
                // is never inside a .markdown-embed element, but embedded views are.
                // This is the most reliable guard — works even when .leaf/.leaf.view
                // are present on embed contexts in newer Obsidian builds.
                var _containerEl = this.containerEl || (this.leaf && this.leaf.containerEl);
                var _isEmbed = _containerEl
                    ? !!_containerEl.closest(".markdown-embed")
                    : true; // can't determine — treat as embed to be safe

                if (!_isEmbed && state) {
                    // Resolve file — this.file may not be set yet on first open;
                    // fall back to the path Obsidian passes inside the state object.
                    var _filePath = state.file || (state.state && state.state.file);
                    var _file = (this.file instanceof TFile)
                        ? this.file
                        : (_filePath ? _pluginSelf.app.vault.getAbstractFileByPath(_filePath) : null);

                    if (_file instanceof TFile) {
                        var _fc    = _pluginSelf.app.metadataCache.getFileCache(_file);
                        var _fm    = _fc ? _fc.frontmatter : null;
                        var _uiVal = _fm ? _fm[_pluginSelf.settings.uiProperty] : undefined;

                        if (_uiVal === "preview-force") {
                            state = Object.assign({}, state, { mode: "preview", source: false });
                        } else if (_uiVal === "edit-force") {
                            state = Object.assign({}, state, { mode: "source" });
                        }
                    }
                }
            } catch (e) {
                console.error("StyleshVault: setState patch error:", e);
            }
            return _pluginSelf._origMarkdownViewSetState.call(this, state, result);
        };
    }

    onunload() {
        if (this.propertyEditTimeout) clearTimeout(this.propertyEditTimeout);
        this.activeTimeouts.forEach(function(id)  { clearTimeout(id);  });
        this.activeIntervals.forEach(function(id) { clearInterval(id); });
        this.activeTimeouts.clear();
        this.activeIntervals.clear();
        this.temporaryVisibleProps.forEach(function(entry) {
            if (entry.timeout) clearTimeout(entry.timeout);
        });
        this.temporaryVisibleProps.clear();

        // Remove all injected DOM elements
        document.querySelectorAll(
            ".banner-image, .icon-wrapper, .pp-title-icon, .pp-file-icon, .pp-header-icon"
        ).forEach(function(el) { el.remove(); });

        var ppHidden = document.getElementById("pp-hidden-props");
        if (ppHidden) ppHidden.remove();
        document.querySelectorAll(".show-full-properties-btn")
            .forEach(function(btn) { btn.remove(); });

        // Unwrap any legacy pp-title-wrapper elements (backward compatibility)
        document.querySelectorAll(".pp-title-wrapper").forEach(function(w) {
            var title = w.querySelector(".inline-title");
            if (title) w.parentNode.insertBefore(title, w);
            w.remove();
        });

        document.body.classList.remove("hider-scroll");

        // Restore default tab icons and undo getIcon patches
        this.app.workspace.iterateAllLeaves(function(leaf) {
            // Restore monkey-patched getIcon so the sidebar / nav history
            // revert to the Obsidian default "lucide-file" immediately.
            if (leaf.view && leaf.view._pp_origGetIcon) {
                leaf.view.getIcon      = leaf.view._pp_origGetIcon;
                delete leaf.view._pp_origGetIcon;
            }

            if (!leaf.tabHeaderEl) return;
            var iconContainer =
                leaf.tabHeaderEl.querySelector(".workspace-tab-header-inner-icon");
            if (iconContainer) {
                iconContainer.style.display = "";
                setIcon(iconContainer, "lucide-file");
            }
            leaf.tabHeaderEl.removeAttribute("data-pp-icon");
            var tabIcon = leaf.tabHeaderEl.querySelector(".pp-tab-icon");
            if (tabIcon) tabIcon.remove();

            // Restore .view-header-icon
            var containerEl = leaf.containerEl || (leaf.view && leaf.view.containerEl);
            if (containerEl) {
                var headerIcon = containerEl.querySelector(
                    ".workspace-leaf-content .view-header .view-header-icon");
                if (headerIcon) {
                    var customEl   = headerIcon.querySelector(".pp-header-icon");
                    if (customEl) customEl.remove();
                    var defaultSvg = headerIcon.querySelector("svg");
                    if (defaultSvg) defaultSvg.style.display = "";
                }
            }
        });

        document.querySelectorAll(".metadata-property[data-pp-has-listener]")
            .forEach(function(el) { el.removeAttribute("data-pp-has-listener"); });

        this.renderingContainers = new WeakSet();

        if (this.fileExplorerObserver) {
            this.fileExplorerObserver.disconnect();
            this.fileExplorerObserver = null;
        }

        // Disconnect the top-level workspace icon observer
        if (this._workspaceIconObserver) {
            this._workspaceIconObserver.disconnect();
            this._workspaceIconObserver = null;
        }
        // Disconnect any per-element view-header-icon guards
        if (this._viewHeaderObservers) {
            this.app.workspace.getLeavesOfType("markdown").forEach(function(leaf) {
                var obs = self._viewHeaderObservers && self._viewHeaderObservers.get(leaf);
                if (obs) { obs.disconnect(); }
            });
            this._viewHeaderObservers = null;
        }


        // Restore the original MarkdownView.prototype.setState
        if (this._origMarkdownViewSetState) {
            MarkdownView.prototype.setState = this._origMarkdownViewSetState;
            this._origMarkdownViewSetState = null;
        }

        this.saveBufferData().catch(function(err) {
            console.error("Error saving buffer on unload:", err);
        });
    }

    // ── Registration helpers ──────────────────────────────────

    _registerFileOpenHandler() {
        var self = this;
        this.registerEvent(
            this.app.workspace.on("file-open", function(file) {
                setTimeout(async function() {
                    self.cleanupDuplicates(file);

                    // Set initial view mode for plain "preview" / "edit" values
                    // (non-force: only applied once on open, user can still switch).
                    if (file instanceof TFile) {
                        var fc = self.app.metadataCache.getFileCache(file);
                        var fm = fc ? fc.frontmatter : null;
                        var uiVal = fm ? fm[self.settings.uiProperty] : undefined;

                        if (uiVal === "preview" || uiVal === "edit") {
                            var activeLeaf = self.app.workspace.activeLeaf;
                            if (activeLeaf && activeLeaf.view instanceof MarkdownView &&
                                activeLeaf.view.file &&
                                activeLeaf.view.file.path === file.path) {

                                var targetMode = uiVal === "preview" ? "preview" : "source";
                                var state = activeLeaf.getViewState();
                                var cur   = state.state || {};
                                if (cur.mode !== targetMode) {
                                    var newState = Object.assign({}, state, {
                                        state: Object.assign({}, cur, { mode: targetMode })
                                    });
                                    activeLeaf.setViewState(newState).catch(function(err) {
                                        console.error("StyleshVault: error setting initial view mode:", err);
                                    });
                                }
                            }
                        }

                        if (fm && await self.isFileFromTemplate(file)) {
                            await self.processSpecialBanner(file, fm);
                        }
                    }

                    self.debouncedUpdate();
                    self.addShowFullPropertiesButtons();
                    self.updateHiddenPropertiesCSS();
                }, 50);
            })
        );
    }

    _registerCommands() {
        var self = this;

        function withActiveFile(fn) {
            return function(checking) {
                var file = self.app.workspace.getActiveFile();
                if (!(file instanceof TFile)) return false;
                if (!checking) fn(file);
                return true;
            };
        }

        this.addCommand({
            id: "select-icon",
            name: "Select Icon",
            checkCallback: withActiveFile(function(file) {
                new IconSuggestModal(self.app, self, file).open();
            })
        });

        this.addCommand({
            id: "select-banner",
            name: "Select Banner",
            checkCallback: withActiveFile(function(file) {
                new BannerSuggestModal(self.app, self, file).open();
            })
        });

        this.addCommand({
            id: "force-refresh-icons",
            name: "Clear the Cache & Refresh icons",
            callback: async function() {
                self._clearRenderCaches();
                await self.clearImageCache();
                self.updateAllViews();
                new Notice("Icons refreshed and cache cleared");
            }
        });

        this.addCommand({
            id: "clean-unused-banner-cache",
            name: "Clean Unused Banner Cache",
            callback: async function() {
                new Notice("Scanning vault for banner usage\u2026");
                try {
                    var result = await self.cleanUnusedBannerCache();
                    if (result.removed === 0) {
                        new Notice("Banner cache is clean \u2014 no unused entries found.");
                    } else {
                        new Notice(
                            "Removed " + result.removed +
                            " unused banner cache entr" +
                            (result.removed === 1 ? "y" : "ies") +
                            " (" + result.kept + " kept)."
                        );
                    }
                } catch (err) {
                    console.error("cleanUnusedBannerCache error:", err);
                    new Notice("Error while cleaning banner cache. See console.");
                }
            }
        });

        this.addCommand({
            id: "show-all-hidden-properties",
            name: "Show All Hidden Properties Temporarily",
            checkCallback: withActiveFile(function(file) {
                self.showTemporaryProperties(file, self.settings.hiddenProperties);
            })
        });

        this.addCommand({
            id: "show-temporary-properties",
            name: "Show Temporary Properties",
            checkCallback: withActiveFile(function(file) {
                self.showTemporaryProperties(
                    file, self.settings.temporaryHiddenProperties);
            })
        });

        this.addCommand({
            id: "set-icon-color-preference",
            name: "Set Icon Color Preference",
            checkCallback: function(checking) {
                var file = self.app.workspace.getActiveFile();
                if (!(file instanceof TFile)) return false;
                var fc = self.app.metadataCache.getFileCache(file);
                var fm = fc ? fc.frontmatter : null;
                var iconValue = fm ? fm[self.settings.iconProperty] : null;
                if (iconValue && isExternalUrl(iconValue)) {
                    if (!checking)
                        new IconColorPreferenceModal(self.app, self, iconValue).open();
                    return true;
                }
                if (!checking)
                    new Notice("No external icon URL found in the current file");
                return false;
            }
        });

        this.addCommand({
            id: "clear-icon-color-preferences",
            name: "Clear All Icon Color Preferences",
            callback: async function() {
                self.settings.iconColorPreferences = {};
                await self.saveSettings();
                new Notice("All icon color preferences cleared");
                self.forceRefreshAllIcons();
            }
        });

    }

    _registerContextMenus() {
        var self = this;

        this.registerEvent(
            this.app.workspace.on("file-menu", function(menu, file) {
                if (!(file instanceof TFile) && !(file instanceof TFolder)) return;
                menu.addItem(function(item) {
                    item.setTitle("Change Icon").setIcon("image-plus")
                        .onClick(function() {
                            new IconSuggestModal(self.app, self, file).open();
                        });
                });
            })
        );

        this.registerDomEvent(document, "contextmenu", function(evt) {
            var view = self.app.workspace.getActiveViewOfType(MarkdownView);
            if (!view || !view.file) return;

            if (evt.target.closest(".banner-image")) {
                evt.preventDefault();
                var menu = new Menu();
                menu.addItem(function(i) {
                    i.setTitle("Change Banner").setIcon("image").onClick(function() {
                        new BannerSuggestModal(self.app, self, view.file).open();
                    });
                });
                menu.addItem(function(i) {
                    i.setTitle("Change Banner Position").setIcon("move-vertical")
                        .onClick(function() {
                            new BannerPositionModal(self.app, self, view.file).open();
                        });
                });
                menu.addItem(function(i) {
                    i.setTitle("Remove Banner").setIcon("trash").onClick(function() {
                        self.app.fileManager.processFrontMatter(
                            view.file, function(fm) {
                                delete fm[self.settings.bannerProperty];
                            });
                    });
                });
                menu.showAtPosition({ x: evt.clientX, y: evt.clientY });
            }

            if (evt.target.closest(".icon-image") ||
                evt.target.closest(".pp-title-icon")) {
                evt.preventDefault();
                var iconMenu = new Menu();
                iconMenu.addItem(function(i) {
                    i.setTitle("Change Icon").setIcon("image-plus").onClick(function() {
                        new IconSuggestModal(self.app, self, view.file).open();
                    });
                });
                iconMenu.addItem(function(i) {
                    i.setTitle("Remove Icon").setIcon("trash").onClick(function() {
                        self.app.fileManager.processFrontMatter(
                            view.file, function(fm) {
                                delete fm[self.settings.iconProperty];
                            });
                    });
                });
                iconMenu.showAtPosition({ x: evt.clientX, y: evt.clientY });
            }
        });
    }

    _registerDomListeners() {
        var self = this;

        this.registerEvent(
            this.app.workspace.on("active-leaf-change",
                debounce(function() { self.setupPropertyContextMenus(); }, 100))
        );

        this.app.workspace.onLayoutReady(function() {
            self.setupPropertyContextMenus();
            self.addShowFullPropertiesButtons();
            self._observeFileExplorer();

            // Stamp icons on every tab that was already open when the vault
            // loaded, including background tabs whose leaf.view.file is null.
            // updateAllViews() internally calls the fixed updateTabIcons() which
            // now reads the file path from leaf state for unactivated tabs.
            self.updateAllViews();

            // Obsidian renders some file-explorer items lazily, a tick or two
            // after layout-ready. Re-run the explorer pass after a short delay
            // so those items receive their icons without needing a manual action.
            setTimeout(function() {
                if (self.settings.showFileExplorerIcons) self.updateFileExplorer();
            }, 500);
        });

        this.registerEvent(
            this.app.workspace.on("layout-change", function() {
                self._observeFileExplorer();
            })
        );
    }

    _observeFileExplorer() {
        if (!this.settings.showFileExplorerIcons) return;
        var self = this;

        if (!this.fileExplorerObserver) {
            this.fileExplorerObserver = new MutationObserver(function(mutations) {
                var needsUpdate = false;
                for (var m = 0; m < mutations.length; m++) {
                    var mut = mutations[m];

                    // Case 1: new tree-item nodes were injected (folder expand
                    // that renders children for the first time, or a new file).
                    if (mut.type === "childList") {
                        var added = mut.addedNodes;
                        for (var n = 0; n < added.length; n++) {
                            var node = added[n];
                            if (node.nodeType !== 1) continue;
                            if (node.classList && (
                                node.classList.contains("tree-item") ||
                                node.querySelector(".tree-item-self[data-path]")
                            )) {
                                needsUpdate = true;
                                break;
                            }
                        }
                    }

                    // Case 2: a folder's is-collapsed class was toggled (expand/
                    // collapse). Child nodes may already be in the DOM but were
                    // hidden; they need icons stamped now that they are visible.
                    if (!needsUpdate && mut.type === "attributes") {
                        var target = mut.target;
                        if (target.classList &&
                            (target.classList.contains("tree-item") ||
                             target.classList.contains("tree-item-self"))) {
                            needsUpdate = true;
                        }
                    }

                    if (needsUpdate) break;
                }
                if (needsUpdate) self.updateFileExplorer();
            });
        }

        this.app.workspace.getLeavesOfType("file-explorer").forEach(function(leaf) {
            var container = leaf.view.containerEl;
            if (!container.hasAttribute("data-pp-observed")) {
                container.setAttribute("data-pp-observed", "true");
                self.fileExplorerObserver.observe(container, {
                    childList:  true,
                    subtree:    true,
                    // Watch for is-collapsed class toggles so expanding a folder
                    // that was already in the DOM triggers an icon refresh.
                    attributes: true,
                    attributeFilter: ["class"]
                });
            }
        });
    }

    registerAllEvents() {
        var self = this;

        // layout-change: general view update
        this.registerEvent(this.app.workspace.on("layout-change", function() {
            self.debouncedUpdate();
        }));

        // active-leaf-change: view update + property buttons
        this.registerEvent(this.app.workspace.on("active-leaf-change",
            function() {
                self.debouncedUpdate();
                setTimeout(function() { self.addShowFullPropertiesButtons(); }, 100);
            }
        ));

        // metadataCache changed: cleanup + view update
        this.registerEvent(this.app.metadataCache.on("changed", function(file) {
            setTimeout(function() {
                self.cleanupDuplicates(file);
                self.debouncedUpdate();
            }, 50);
        }));

        // file-open: handled entirely by _registerFileOpenHandler (no duplicate here)

        this.registerEvent(this.app.vault.on("create", function(file) {
            if (!(file instanceof TFile)) return;
            setTimeout(function() {
                var af = self.app.workspace.getActiveFile();
                if (af && af.path === file.path) self.updateHiddenPropertiesCSS();
            }, 100);
        }));

        // ── Folder-icon migration on rename / move ────────────────────────
        // When a folder (or any item) is renamed or moved, Obsidian fires the
        // vault "rename" event with (file, oldPath).  We use this to keep
        // folderIcons in sync so custom icons survive renames and moves.
        this.registerEvent(this.app.vault.on("rename", function(file, oldPath) {
            if (!(file instanceof TFolder)) return;
            self._migrateFolderIconOnRename(oldPath, file);
        }));
    }

    // ── Icon colour management ────────────────────────────────

    async setIconColorPreference(iconUrl, color) {
        if (!this.settings.iconColorPreferences)
            this.settings.iconColorPreferences = {};
        this.settings.iconColorPreferences[iconUrl] = color;
        await this.saveSettings();
        new Notice("Icon color preference set to " + color);
        this.forceRefreshAllIcons();
    }

    async getIconColorPreference(iconUrl) {
        var prefs = this.settings.iconColorPreferences;
        if (!prefs || prefs[iconUrl] === undefined) return null;
        return prefs[iconUrl];
    }

    updateIconColorInversion() {
        var selectors = [
            ".icon-image img.icon-color-adjustable",
            ".pp-title-icon img.icon-color-adjustable",
            ".pp-file-icon img.icon-color-adjustable",
            ".pp-tab-icon img.icon-color-adjustable",
            ".workspace-tab-header-inner-icon img.icon-color-adjustable"
        ].join(", ");

        document.querySelectorAll(selectors).forEach(function(img) {
            applyColorFilter(img, img.getAttribute("data-color-pref"));
        });
    }

    /**
     * Clear render state so every icon-wrapper re-renders on the next
     * processView call.  Removes data-icon from existing wrappers rather than
     * deleting the DOM nodes, so the next render is an in-place update.
     */
    _clearRenderCaches() {
        this.renderingContainers = new WeakSet();
        document.querySelectorAll(".icon-wrapper[data-icon]").forEach(function(w) {
            w.removeAttribute("data-icon");
        });
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

        var self       = this;
        var filePath   = file.path;
        var timeoutKey = "tempProps-" + filePath;

        var previous = this.temporaryVisibleProps.get(filePath);
        if (previous && previous.timeout) clearTimeout(previous.timeout);
        if (this.activeTimeouts.has(timeoutKey))
            clearTimeout(this.activeTimeouts.get(timeoutKey));

        this.temporaryVisibleProps.set(filePath,
            { props: new Set(propsArray), timeout: null });
        this.updateHiddenPropertiesCSS();
        new Notice("Showing " + propsArray.length + " properties for " +
            this.settings.temporaryViewTimeout + " seconds");

        var timeout = setTimeout(function() {
            self.hideTemporaryProperties(filePath);
        }, this.settings.temporaryViewTimeout * 1000);

        this.temporaryVisibleProps.get(filePath).timeout = timeout;
        this.activeTimeouts.set(timeoutKey, timeout);
    }

    hideTemporaryProperties(filePath) {
        var data = this.temporaryVisibleProps.get(filePath);
        if (data) {
            if (data.timeout) clearTimeout(data.timeout);
            this.temporaryVisibleProps.delete(filePath);
            this.updateHiddenPropertiesCSS();
            new Notice("Temporary properties have been hidden");
        }
        var timeoutKey = "tempProps-" + filePath;
        if (this.activeTimeouts.has(timeoutKey)) {
            clearTimeout(this.activeTimeouts.get(timeoutKey));
            this.activeTimeouts.delete(timeoutKey);
        }
    }

    updateHiddenPropertiesCSS() {
    var styleEl = document.getElementById("pp-hidden-props") ||
        document.head.createEl("style", { id: "pp-hidden-props" });

    var activeFile      = this.app.workspace.getActiveFile();
    var currentFilePath = activeFile ? activeFile.path : null;
    var entry = currentFilePath
        ? this.temporaryVisibleProps.get(currentFilePath) : null;
    var tempProps = entry ? entry.props : new Set();

    // 1. جلب المتغير من الإعدادات هنا ليكون متاحاً داخل الـ map
    var hidePropsOnEditorOnly = this.settings.hidePropsOnEditorOnly; 

    var self  = this;
    var rules = this.settings.hiddenProperties.map(function(prop) {
        var isVisible = tempProps.has(prop);
        if (self.settings.ShowHiddenPropsWhileEditing) {
          var isVisible = self.editingProperties.has(prop) || tempProps.has(prop);
        }
        
        // 2. استخدام المتغير بشكل طبيعي الآن
        if (hidePropsOnEditorOnly) {
            return isVisible
                ? ":is(.markdown-preview-view, .markdown-source-view) .metadata-property[data-property-key=\"" + prop +
                  "\"] { opacity: 1 !important; display: block !important; }"
                : ":is(.markdown-preview-view, .markdown-source-view) .metadata-property[data-property-key=\"" + prop +
                  "\"] { display: none !important; }";
        } else { 
            // استخدام else مباشرة هنا أفضل وأضمن من else if
            return isVisible
                ? ".metadata-property[data-property-key=\"" + prop +
                  "\"] { opacity: 1 !important; display: block !important; }"
                : ".metadata-property[data-property-key=\"" + prop +
                  "\"] { display: none !important; }";
        }
    });

    styleEl.innerText = rules.join("\n");
}

    addShowFullPropertiesButtons() {
        var file = this.app.workspace.getActiveFile();
        if (!file) return;
        var self = this;

        document.querySelectorAll(".metadata-container").forEach(function(container) {
            if (container.querySelector(".show-full-properties-btn")) return;
            var header = container.querySelector(".metadata-container-heading");
            if (!header) return;

            var btn = document.createElement("button");
            btn.classList.add("show-full-properties-btn");
            btn.textContent = "Show All Hidden";
            btn.title = "Show all hidden properties temporarily";
            btn.addEventListener("click", async function(e) {
                e.stopPropagation();
                e.preventDefault();
                await self.showTemporaryProperties(
                    file, self.settings.hiddenProperties);
            });
            header.appendChild(btn);
        });
    }

    // ── Property context menus ────────────────────────────────

    handlePropertyContextMenu(evt, propertyEl) {
        evt.preventDefault();
        evt.stopPropagation();

        var self         = this;
        var propertyKey  = propertyEl.getAttribute("data-property-key");
        if (!propertyKey) return;

        var isHidden     = this.settings.hiddenProperties.includes(propertyKey);
        var isInTempView = this.settings.temporaryHiddenProperties.includes(propertyKey);
        var menu         = new Menu();

        menu.addItem(function(item) {
            item.setTitle(isHidden
                    ? "Unhide property \"" + propertyKey + "\""
                    : "Hide property \"" + propertyKey + "\"")
                .setIcon(isHidden ? "eye" : "eye-off")
                .onClick(async function() {
                    if (isHidden) {
                        self.settings.hiddenProperties.remove(propertyKey);
                        self.settings.temporaryHiddenProperties.remove(propertyKey);
                        new Notice("Property \"" + propertyKey +
                            "\" is now permanently visible");
                    } else {
                        self.settings.hiddenProperties.push(propertyKey);
                        new Notice("Property \"" + propertyKey + "\" is now hidden");
                        self.editingProperties.add(propertyKey);
                        self.updateHiddenPropertiesCSS();
                        setTimeout(function() {
                            self.editingProperties.delete(propertyKey);
                            self.updateHiddenPropertiesCSS();
                        }, 3000);
                    }
                    await self.saveSettings();
                    self.updateHiddenPropertiesCSS();
                });
        });

        if (isHidden) {
            menu.addItem(function(item) {
                item.setTitle(isInTempView
                        ? "Remove from temporary view"
                        : "Add to temporary view")
                    .setIcon("square-dashed-mouse-pointer")
                    .onClick(async function() {
                        if (isInTempView) {
                            self.settings.temporaryHiddenProperties.remove(propertyKey);
                            new Notice("\"" + propertyKey +
                                "\" removed from temporary view");
                        } else {
                            self.settings.temporaryHiddenProperties.push(propertyKey);
                            new Notice("\"" + propertyKey +
                                "\" added to temporary view");
                        }
                        await self.saveSettings();
                    });
            });
        }

        menu.addSeparator();
        menu.showAtPosition({ x: evt.clientX, y: evt.clientY });
    }

    setupPropertyContextMenus() {
        var self = this;
        document.querySelectorAll(
            ".metadata-property:not([data-pp-has-listener])"
        ).forEach(function(el) {
            el.setAttribute("data-pp-has-listener", "true");
            el.addEventListener("contextmenu", function(evt) {
                self.handlePropertyContextMenu(evt, el);
            });
        });
    }

    setupPropertyEditListeners() {
        var self = this;

        this.registerDomEvent(document, "focusin", function(evt) {
            var propertyEl = evt.target.closest(".metadata-property");
            if (!propertyEl) return;
            var key = propertyEl.getAttribute("data-property-key");
            if (key && self.settings.hiddenProperties.includes(key)) {
                self.editingProperties.add(key);
                if (self.propertyEditTimeout)
                    clearTimeout(self.propertyEditTimeout);
                self.updateHiddenPropertiesCSS();
            }
        });

        this.registerDomEvent(document, "focusout", function(evt) {
            var propertyEl = evt.target.closest(".metadata-property");
            if (!propertyEl) return;
            var key = propertyEl.getAttribute("data-property-key");
            if (key && self.editingProperties.has(key)) {
                self.propertyEditTimeout = setTimeout(function() {
                    self.editingProperties.delete(key);
                    self.updateHiddenPropertiesCSS();
                }, PROPERTY_EDIT_GRACE_MS);
            }
        });
    }

    // ── Duplicate element cleanup ─────────────────────────────

    cleanupDuplicates(file) {
        var filePath = file ? file.path : null;
        if (!filePath) return;

        var self = this;
        var cleanedContainers = new Set();
        var containers = [];

        this.app.workspace.getLeavesOfType("markdown").forEach(function(leaf) {
            if (!leaf.view || !leaf.view.file || leaf.view.file.path !== filePath)
                return;
            var contentEl = leaf.view.contentEl;
            var scroller  = contentEl.querySelector(
                ".markdown-source-view > .cm-editor > .cm-scroller");
            var preview   = contentEl.querySelector(
                ".markdown-reading-view > .markdown-preview-view");
            if (scroller) containers.push(scroller);
            if (preview)  containers.push(preview);
        });

        containers.forEach(function(container) {
            if (cleanedContainers.has(container)) return;
            cleanedContainers.add(container);
            self._deduplicateByAttr(container, ":scope > .icon-wrapper", "data-icon");
            self._deduplicateByAttr(container, ":scope > .banner-image", "data-src");
        });
    }

    _deduplicateByAttr(scope, selector, attr) {
        var els = scope.querySelectorAll(selector);
        if (els.length <= 1) return;
        var firstVal = els[0].getAttribute(attr);
        for (var i = 1; i < els.length; i++) {
            if (els[i].getAttribute(attr) === firstVal) els[i].remove();
        }
    }

    // ── Special banner (random / serial) ─────────────────────

    async isFileFromTemplate(file) {
        if (!file) return false;
        var path = file.path;
        var inTemplatesFolder =
            path.includes("004 Meta/004 Temple") ||
            path.includes("/Templates/")         ||
            path.includes("\\Templates\\");
        if (inTemplatesFolder) return false;

        var fc          = this.app.metadataCache.getFileCache(file);
        var fm          = fc ? fc.frontmatter : null;
        var bannerValue = fm ? fm[this.settings.bannerProperty] : null;
        if (typeof bannerValue !== "string") return false;
        return bannerValue.includes("random") || bannerValue.includes("serial");
    }

    async processSpecialBanner(file, fm) {
        var bannerValue = fm ? fm[this.settings.bannerProperty] : null;
        if (typeof bannerValue !== "string") return false;

        var randomMatch = bannerValue.match(/^random\s*\[(.*?)\]$/s);
        if (randomMatch) {
            var rImages = this.parseImageArray(randomMatch[1]);
            if (rImages.length > 0) {
                var rSelected = rImages[Math.floor(Math.random() * rImages.length)];
                await this.updateBannerWithValue(file, rSelected);
                return true;
            }
        }

        var serialMatch = bannerValue.match(/^serial\s*\[(.*?)\]$/s);
        if (serialMatch) {
            var sImages = this.parseImageArray(serialMatch[1]);
            if (sImages.length > 0) {
                var sSelected = sImages[this.getNextSerialIndex(file, sImages)];
                await this.updateBannerWithValue(file, sSelected);
                return true;
            }
        }

        return false;
    }

    parseImageArray(str) {
        try {
            var matches = str.match(/"([^"]*)"/g);
            if (matches) return matches.map(function(m) { return m.slice(1, -1); });
            return str.split(",").map(function(s) {
                return s.trim().replace(/^["']|["']$/g, "");
            });
        } catch (e) {
            console.error("Error parsing image array:", e);
            return [];
        }
    }

    async updateBannerWithValue(file, value) {
        var self = this;
        await this.app.fileManager.processFrontMatter(file, function(fm) {
            fm[self.settings.bannerProperty] = value;
        });
        this.debouncedUpdate();
    }

    getNextSerialIndex(file, images) {
        var filePath = file.path;
        var current  = this.serialIndexes.get(filePath) || 0;
        var next     = (current + 1) % images.length;
        this.serialIndexes.set(filePath, next);
        if (!this.settings.serialCounters) this.settings.serialCounters = {};
        this.settings.serialCounters[filePath] = next;
        this.saveSettings();
        return current;
    }

    // ── Banner rendering ──────────────────────────────────────

    async renderBanner(contentEl, containers, fm, sourcePath) {
        var bannerUrl = fm ? fm[this.settings.bannerProperty] : null;

        if (!this.settings.enableBanner || !bannerUrl) {
            for (var ci = 0; ci < containers.length; ci++) {
                containers[ci].querySelectorAll(":scope > .banner-image")
                    .forEach(function(el) { el.remove(); });
            }
            contentEl.classList.remove("has-banner");
            return;
        }

        var self      = this;
        var bannerSrc = formatImageLink(bannerUrl);
        var bannerPos = fm[this.settings.bannerPositionProperty] || 50;
        var isVideo   = isVideoSrc(bannerSrc);

        for (var i = 0; i < containers.length; i++) {
            var container = containers[i];
            var bannerEl  = container.querySelector(":scope > .banner-image");
            if (!bannerEl) {
                bannerEl = document.createElement("div");
                bannerEl.classList.add("banner-image");
                container.prepend(bannerEl);
            }

            var srcChanged = bannerEl.getAttribute("data-src") !== bannerSrc;
            var posChanged = bannerEl.getAttribute("data-pos") !== String(bannerPos);
            if (!srcChanged && !posChanged) continue;

            bannerEl.setAttribute("data-src", bannerSrc);
            bannerEl.setAttribute("data-pos", String(bannerPos));
            bannerEl.empty();

            try {
                var resolvedSrc = await self.resolveLink(bannerSrc, sourcePath);
                var mediaEl = isVideo
                    ? self._createVideoEl(resolvedSrc, bannerPos)
                    : self._createImageEl(resolvedSrc, bannerPos);

                // Capture bannerEl in closure for the error/load callbacks
                (function(bEl) {
                    mediaEl.onerror = function() {
                        console.warn("Failed to load banner: " + bannerSrc);
                        bEl.style.display = "none";
                    };
                    if (isVideo) {
                        mediaEl.onloadedmetadata = function() {
                            bEl.style.display = "";
                        };
                    } else {
                        mediaEl.onload = function() {
                            bEl.style.display = "";
                        };
                    }
                })(bannerEl);

                bannerEl.appendChild(mediaEl);
            } catch (error) {
                console.error("Error rendering banner:", error);
                bannerEl.remove();
            }
        }

        contentEl.classList.add("has-banner");
    }

    _createVideoEl(src, posPercent) {
        var v = document.createElement("video");
        v.src         = src;
        v.autoplay    = true;
        v.loop        = true;
        v.muted       = true;
        v.playsInline = true;
        v.setAttribute("muted", "");
        v.style.objectPosition = "center " + posPercent + "%";
        return v;
    }

    _createImageEl(src, posPercent) {
        var img = document.createElement("img");
        img.src = src;
        img.style.objectPosition = "center " + posPercent + "%";
        return img;
    }

    // ── Icon rendering ────────────────────────────────────────
    //
    // DESIGN — floating icon-wrapper approach:
    //
    //   A .icon-wrapper div is prepended to each container
    //   (.cm-scroller and .markdown-preview-view). CSS positions it
    //   absolutely at the top of the note, above the content.
    //
    //   Skip guard: data-icon attribute on the wrapper.
    //     data-icon === iconValue  →  already up-to-date, skip.
    //     data-icon !== iconValue  →  re-render in place.
    //     wrapper absent          →  create then render.
    //
    //   Because Obsidian keeps both editor and preview DOM alive
    //   simultaneously (toggling CSS visibility only), both wrappers
    //   survive mode switches. No re-render happens on a switch.

    async renderIcon(contentEl, containers, fm, sourcePath) {
        var iconValue = fm ? (fm[this.settings.iconProperty] || null) : null;

        if (!this.settings.enableIcon || !iconValue) {
            for (var ci = 0; ci < containers.length; ci++) {
                containers[ci].querySelectorAll(":scope > .icon-wrapper")
                    .forEach(function(el) { el.remove(); });
            }
            return;
        }

        await this.renderStandardIcon(containers, iconValue, sourcePath);
    }

    async renderStandardIcon(containers, iconValue, sourcePath) {
        for (var i = 0; i < containers.length; i++) {
            var container = containers[i];

            // Skip if a concurrent render is already in progress for this container
            if (this.renderingContainers.has(container)) continue;

            var iconWrapper = container.querySelector(":scope > .icon-wrapper");

            if (!iconWrapper) {
                iconWrapper = document.createElement("div");
                iconWrapper.classList.add("icon-wrapper");
                var banner = container.querySelector(":scope > .banner-image");
                if (banner) banner.after(iconWrapper);
                else        container.prepend(iconWrapper);
            }

            // data-icon is the authoritative skip guard
            if (iconWrapper.getAttribute("data-icon") === iconValue) continue;

            iconWrapper.setAttribute("data-icon", iconValue);
            this.renderingContainers.add(container);
            try {
                await this._renderIconContent(iconWrapper, iconValue, sourcePath, true);
            } catch (err) {
                console.error("renderStandardIcon error:", err);
            } finally {
                this.renderingContainers.delete(container);
            }
        }
    }

    /**
     * Populate `container` with the visual for `iconValue`.
     * Handles Lucide IDs, emojis, external SVGs, and raster images.
     *
     * @param {HTMLElement} container   element to fill
     * @param {string}      iconValue   raw frontmatter value
     * @param {string}      sourcePath  used to resolve local wiki-links
     * @param {boolean}     isFloating  true → wraps content in .icon-image div
     */
    async _renderIconContent(container, iconValue, sourcePath, isFloating) {
        if (isFloating === undefined) isFloating = false;
        container.empty();

        var contentContainer = isFloating
            ? container.createDiv({ cls: "icon-image" })
            : container;

        // 1. Lucide built-in icon
        var lucideIcon = getIcon(iconValue);
        if (lucideIcon) {
            lucideIcon.classList.add("pp-svg-icon");
            var svg = lucideIcon.querySelector("svg");
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

        var formattedSrc = formatImageLink(iconValue);
        if (!formattedSrc) {
            console.warn("Empty icon source:", iconValue);
            return;
        }

        var isExternal = isExternalUrl(iconValue);

        // 3. External SVG — inject inline for currentColor support
        if (isExternal && isExternalSvgUrl(formattedSrc)) {
            try {
                var svgText = await withTimeout(
                    this.fetchExternalSvgText(formattedSrc),
                    ICON_TIMEOUT_MS, "SVG load timeout"
                );
                if (svgText && this.injectInlineSvg(contentContainer, svgText)) {
                    return;
                }
            } catch (err) {
                console.warn("SVG inline injection failed, falling back to img:", err);
            }
        }

        // 4. Raster / non-SVG image
        var colorPreference = isExternal
            ? await this.getIconColorPreference(iconValue)
            : null;

        var img = document.createElement("img");
        img.alt = "Icon";

        if (isExternal && colorPreference) {
            img.classList.add("icon-color-adjustable");
            img.setAttribute("data-color-pref", colorPreference);
        }

        var self = this;

        function appendFallback(target) {
            var fallback = getIcon("lucide-file");
            if (fallback) {
                fallback.classList.add("pp-svg-icon");
                target.appendChild(fallback);
            }
        }

        try {
            var imgSrc;
            if (formattedSrc.indexOf("data:") === 0) {
                imgSrc = formattedSrc;
            } else if (formattedSrc.indexOf("http") === 0) {
                imgSrc = await withTimeout(
                    self.resolveLink(formattedSrc, sourcePath),
                    ICON_TIMEOUT_MS, "Image load timeout"
                );
            } else {
                imgSrc = await self.resolveLink(formattedSrc, sourcePath);
            }

            img.src = imgSrc;

            img.onerror = function() {
                console.warn("Failed to load icon: " + formattedSrc);
                img.remove();
                appendFallback(contentContainer);
            };

            img.onload = function() {
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
     * Update an already-mounted icon container in-place.
     * Detects from the container's class whether isFloating applies.
     */
    async updateIconContent(container, iconValue, sourcePath) {
        container.setAttribute("data-icon", iconValue);
        var isFloating = container.classList.contains("icon-wrapper");
        await this._renderIconContent(container, iconValue, sourcePath, isFloating);
    }

    async appendIconContent(container, iconValue, sourcePath, isFloating) {
        if (!container || !iconValue) return;
        if (isFloating === undefined) isFloating = false;
        try {
            await this._renderIconContent(container, iconValue, sourcePath, isFloating);
        } catch (err) {
            console.error("appendIconContent error:", err);
        }
    }

    // ── View orchestration ────────────────────────────────────

    async processView(view) {
        var file = view.file;
        if (!file) return;

        try {
            this.cleanupDuplicates(file);

            var fc         = this.app.metadataCache.getFileCache(file);
            var fm         = fc ? fc.frontmatter : null;
            var contentEl  = view.contentEl;
            var scroller   = contentEl.querySelector(
                ".markdown-source-view > .cm-editor > .cm-scroller");
            var preview    = contentEl.querySelector(
                ".markdown-reading-view > .markdown-preview-view");
            var containers = [scroller, preview].filter(Boolean);

            // Remove any icon/banner that leaked out of embedded notes
            contentEl.querySelectorAll(
                ".markdown-embed .banner-image, .markdown-embed .icon-wrapper"
            ).forEach(function(el) { el.remove(); });

            // Banner: safe to call every time — skips internally if unchanged
            await this.renderBanner(contentEl, containers, fm, file.path);

            // Icon: skips each container whose data-icon already matches
            await this.renderIcon(contentEl, containers, fm, file.path);

            this.updateInlineTitleClasses();

        } catch (err) {
            console.error("processView error:", err);
        }
    }

    updateAllViews() {
        var self = this;
        this.app.workspace.getLeavesOfType("markdown").forEach(function(leaf) {
            if (leaf.view instanceof MarkdownView) self.processView(leaf.view);
        });
        this.updateTabIcons();
        if (this.settings.showFileExplorerIcons) this.updateFileExplorer();
        this.updateIconColorInversion();
        this.updateInlineTitleClasses();
    }

    // ── Tab icons ─────────────────────────────────────────────

    /**
     * Patch leaf.view.getIcon() so Obsidian's own UI (right-sidebar file icon,
     * navigate-back/forward history list) returns the user's custom icon
     * instead of the default "lucide-file".
     *
     * Obsidian calls leaf.view.getIcon() — not tabHeaderEl DOM queries — when
     * it builds the sidebar leaf icon and the navigation history entries.
     * DOM-only patching cannot reach those surfaces; this is the correct fix.
     *
     * Strategy per icon type:
     *   • Lucide ID  → return it directly; setIcon() already knows it.
     *   • Emoji      → register a custom SVG icon via addIcon() that wraps the
     *                  emoji in a <text> element, then return that ID.
     *   • Image URL / wiki-link → register a custom SVG icon via addIcon()
     *                  that embeds the resolved URL in an <image> element,
     *                  then return that ID.
     *
     * Registered IDs are cached in this._ppIconRegistry (Map: iconValue → id)
     * so we never call addIcon() twice for the same value.
     *
     * The original getIcon is saved as _pp_origGetIcon so we can restore it
     * cleanly on plugin unload.
     *
     * @param {WorkspaceLeaf} leaf
     * @param {string|null}   iconValue  custom icon value, or null to restore default
     * @param {string}        [sourcePath] vault path used to resolve wiki-link icons
     */
    _patchLeafGetIcon(leaf, iconValue, sourcePath) {
        if (!leaf || !leaf.view) return;
        var view = leaf.view;
        var self = this;

        // Save the original method once
        if (!view._pp_origGetIcon) {
            view._pp_origGetIcon = view.getIcon.bind(view);
        }

        if (!iconValue) {
            view.getIcon = view._pp_origGetIcon;
            return;
        }

        // ── 1. Lucide built-in ────────────────────────────────────────────
        if (getIcon(iconValue)) {
            view.getIcon = function() { return iconValue; };
            return;
        }

        // ── 2. Emoji ──────────────────────────────────────────────────────
        if (isEmoji(iconValue)) {
            if (!this._ppIconRegistry) this._ppIconRegistry = new Map();
            var existingEmoji = this._ppIconRegistry.get(iconValue);
            if (existingEmoji) {
                view.getIcon = function() { return existingEmoji; };
                return;
            }
            var emojiId = "pp-custom-" + Math.random().toString(36).slice(2, 9);
            addIcon(emojiId,
                '<text x="50" y="80" text-anchor="middle" ' +
                'font-size="80" font-family="inherit">' + iconValue + '</text>');
            this._ppIconRegistry.set(iconValue, emojiId);
            view.getIcon = function() { return emojiId; };
            return;
        }

        // ── 3. Image (external URL or local vault file) ───────────────────
        // addIcon() accepts only the INNER content of an SVG whose implicit
        // viewBox is "0 0 100 100".  The strategy differs by file type:
        //
        //  SVG  → extract the inner XML from the raw SVG text and pass it
        //         directly to addIcon().  We CANNOT use <image href="…svg">
        //         because browsers block SVG-referencing-SVG for security.
        //
        //  PNG/raster → resolve to a data: URL (base64) or vault resource
        //         path and embed via <image href="…">.  Raster data-URLs
        //         work fine inside addIcon's SVG wrapper.

        if (!this._ppIconRegistry) this._ppIconRegistry = new Map();
        var cached = this._ppIconRegistry.get(iconValue);
        if (cached) {
            view.getIcon = function() { return cached; };
            return;
        }

        var formattedSrc = formatImageLink(iconValue);
        var sp = sourcePath ||
            (leaf.view && leaf.view.file ? leaf.view.file.path : "");
        var isExternal = isExternalUrl(formattedSrc);
        var isSvg      = isExternalSvgUrl(formattedSrc) ||
                         formattedSrc.toLowerCase().endsWith(".svg");
        var iconId = "pp-custom-" + Math.random().toString(36).slice(2, 9);

        // Helper: apply a registered id to the view
        function applyId(id) {
            self._ppIconRegistry.set(iconValue, id);
            view.getIcon = function() { return id; };
        }

        // Helper: extract usable inner SVG content from raw SVG text.
        // addIcon() wraps content in <svg viewBox="0 0 100 100"> so we only
        // need to scale it.  We strip the outer <svg> tag and return the inner
        // XML, replacing width/height with 100% so it fills the viewBox.
        function svgTextToInnerContent(svgText) {
            if (!svgText) return null;
            // Extract everything between the first <svg …> and </svg>
            var match = svgText.match(/<svg[^>]*>([\s\S]*?)<\/svg>/i);
            if (!match) return null;
            var inner = match[1].trim();
            if (!inner) return null;
            // Wrap in a <g> that scales the original artwork to 0 0 100 100.
            // We read the original viewBox if present so we can preserve aspect.
            var vbMatch = svgText.match(/viewBox=["']([^"']+)["']/i);
            if (vbMatch) {
                // Use a nested <svg> to honour the original viewBox while
                // letting addIcon's outer viewBox stay at 0 0 100 100.
                return '<svg viewBox="' + vbMatch[1] +
                       '" width="100" height="100" xmlns="http://www.w3.org/2000/svg">' +
                       inner + '</svg>';
            }
            return '<g transform="scale(1)">' + inner + '</g>';
        }

        if (isSvg) {
            // --- SVG path ---
            var svgPromise = isExternal
                ? self.fetchExternalSvgText(formattedSrc)
                : (function() {
                    // Local vault SVG: find the TFile and read it
                    var tfile = self.app.metadataCache.getFirstLinkpathDest(
                        formattedSrc, sp);
                    if (!tfile) return Promise.resolve(null);
                    return self.app.vault.read(tfile);
                })();

            svgPromise.then(function(svgText) {
                var inner = svgTextToInnerContent(svgText);
                if (!inner) {
                    console.warn("StyleshVault: could not extract SVG content for leaf icon:", formattedSrc);
                    return;
                }
                addIcon(iconId, inner);
                applyId(iconId);
            }).catch(function(err) {
                console.warn("StyleshVault: SVG load failed for leaf icon:", err);
            });

        } else {
            // --- Raster (PNG, WEBP, JPG, …) path ---
            // resolveLink returns either a base64 data: URL (external, cached)
            // or a vault resource path (local file).  Both work as <image href>.
            self.resolveLink(formattedSrc, sp).then(function(resolvedSrc) {
                if (!resolvedSrc) return;
                addIcon(iconId,
                    '<image href="' + resolvedSrc + '" ' +
                    'x="0" y="0" width="100" height="100" ' +
                    'preserveAspectRatio="xMidYMid meet" />');
                applyId(iconId);
            }).catch(function(err) {
                console.warn("StyleshVault: raster icon load failed for leaf icon:", err);
            });
        }
    }

    updateTabIcons() {
        if (!this.settings.enableIcon && !this.settings.showFileExplorerIcons) return;
        var self = this;

        this.app.workspace.getLeavesOfType("markdown").forEach(function(leaf) {
            var tabEl = leaf.tabHeaderEl;
            if (!tabEl) return;

            // leaf.view.file is null for background tabs that have never been
            // activated in this session: Obsidian restores their layout state
            // but does not load the file into the view until the tab is clicked.
            // Fall back to the path stored in the serialised view state, which
            // is always present regardless of activation status.
            var file     = leaf.view ? leaf.view.file : null;
            var filePath = file
                ? file.path
                : ((leaf.getViewState().state) || {}).file || null;

            if (!filePath) return;

            // Resolve the TFile so we can read frontmatter.
            // For an already-active tab this is the same object as leaf.view.file.
            var tfile = file || self.app.vault.getAbstractFileByPath(filePath);
            if (!(tfile instanceof TFile)) return;

            var fc        = self.app.metadataCache.getFileCache(tfile);
            var fm        = fc ? fc.frontmatter : null;
            var iconValue = fm ? fm[self.settings.iconProperty] : null;

            // ── API-level patch: fixes right sidebar & nav-history icons ──
            self._patchLeafGetIcon(leaf, iconValue, filePath);

            // ── DOM patch: .view-header-icon (the icon in the bar above the note) ──
            self._updateViewHeaderIcon(leaf, iconValue, filePath);

            if (tabEl.closest(".mod-stacked")) {
                self._updateStackedTabIcon(tabEl, iconValue, filePath);
            } else {
                self._updateFlatTabIcon(tabEl, iconValue, filePath);
            }
        });
    }

    /**
     * Update the .view-header-icon element — the icon Obsidian renders in the
     * bar directly above the note content (and in the right-sidebar leaf header
     * on desktop / the title bar on mobile).
     *
     * Structure (confirmed from console log):
     *   .workspace-leaf
     *     .workspace-leaf-content
     *       .view-header
     *         .view-header-title-container
     *           .view-header-icon   ← target
     *           .view-header-title
     *
     * Strategy: same as _updateFlatTabIcon.
     *   - iconValue present → hide Obsidian's default SVG inside .view-header-icon,
     *     inject a .pp-header-icon child with our content.
     *   - iconValue absent  → remove .pp-header-icon, restore default display.
     */
    _updateViewHeaderIcon(leaf, iconValue, filePath) {
        var containerEl = leaf.containerEl || (leaf.view && leaf.view.containerEl);
        if (!containerEl) return;

        var leafEl      = containerEl.closest(".workspace-leaf");
        if (!leafEl) return;

        var headerIcon  = leafEl.querySelector(
            ".workspace-leaf-content .view-header .view-header-icon");
        if (!headerIcon) return;

        var defaultSvg  = headerIcon.querySelector("svg");
        var customEl    = headerIcon.querySelector(".pp-header-icon");

        if (iconValue) {
            // Hide Obsidian's default SVG
            if (defaultSvg) defaultSvg.style.display = "none";

            if (!customEl) {
                customEl = document.createElement("div");
                customEl.classList.add("pp-header-icon");
                headerIcon.appendChild(customEl);
            }

            if (customEl.getAttribute("data-icon") !== iconValue) {
                customEl.setAttribute("data-icon", iconValue);
                this.appendIconContent(customEl, iconValue, filePath);
            }
        } else {
            if (customEl)   customEl.remove();
            if (defaultSvg) defaultSvg.style.display = "";
        }
    }

    _updateStackedTabIcon(tabEl, iconValue, filePath) {
        var iconContainer =
            tabEl.querySelector(".workspace-tab-header-inner-icon");
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

    _updateFlatTabIcon(tabEl, iconValue, filePath) {
        var container = tabEl.querySelector(".workspace-tab-header-inner");
        if (!container) return;

        var defaultIcon  = container.querySelector(".workspace-tab-header-inner-icon");
        var customIconEl = container.querySelector(".pp-tab-icon");

        if (iconValue) {
            if (defaultIcon) defaultIcon.style.display = "none";

            if (!customIconEl) {
                customIconEl = document.createElement("div");
                customIconEl.classList.add("pp-tab-icon");
                var titleEl = container.querySelector(
                    ".workspace-tab-header-inner-title");
                if (titleEl) container.insertBefore(customIconEl, titleEl);
                else         container.appendChild(customIconEl);
            }

            if (customIconEl.getAttribute("data-icon") !== iconValue) {
                customIconEl.setAttribute("data-icon", iconValue);
                this.appendIconContent(customIconEl, iconValue, filePath);
            }
        } else {
            if (customIconEl) customIconEl.remove();
            if (defaultIcon)  defaultIcon.style.display = "";
        }
    }

    // ── File explorer icons ───────────────────────────────────

    updateFileExplorer() {
        if (!this.settings.showFileExplorerIcons) return;
        var self = this;

        this.app.workspace.getLeavesOfType("file-explorer").forEach(function(leaf) {
            leaf.view.containerEl.querySelectorAll(
                ".tree-item-self[data-path]"
            ).forEach(function(item) {
                var path      = item.getAttribute("data-path");
                var file      = self.app.vault.getAbstractFileByPath(path);
                var iconValue = null;
                var isFolder  = false;

                if (file instanceof TFile) {
                    var fc = self.app.metadataCache.getFileCache(file);
                    var fm = fc ? fc.frontmatter : null;
                    iconValue = fm ? fm[self.settings.iconProperty] : null;
                } else if (file instanceof TFolder) {
                    iconValue = self.settings.folderIcons[file.path] || "lucide-folder";
                    isFolder  = true;
                }

                self.renderFileExplorerIcon(item, iconValue, path, isFolder);
            });
        });
    }

    renderFileExplorerIcon(itemEl, iconValue, sourcePath, isFolder) {
        var iconEl = itemEl.querySelector(".pp-file-icon");

        if (!iconValue && !isFolder) {
            if (iconEl) iconEl.remove();
            return;
        }
        if (isFolder && !iconValue) iconValue = "lucide-folder";

        if (!iconEl) {
            iconEl = document.createElement("div");
            iconEl.classList.add("pp-file-icon");
            if (isFolder) iconEl.classList.add("pp-folder-icon");
            var inner = itemEl.querySelector(".tree-item-inner");
            if (inner) itemEl.insertBefore(iconEl, inner);
            else       itemEl.appendChild(iconEl);
        }

        if (iconEl.getAttribute("data-icon") !== iconValue) {
            iconEl.setAttribute("data-icon", iconValue || "");
            this.appendIconContent(iconEl, iconValue, sourcePath);
        }
    }

    // ── CSS helpers ───────────────────────────────────────────

    updateScrollbarStyle() {
        document.body.classList.toggle("hider-scroll", this.settings.hideScrollbars);
    }

    updateCssVariables() {
        var s    = this.settings;
        var vars = {
            "--banner-height":         s.bannerHeight + "px",
            "--banner-margin":         s.bannerMargin + "px",
            "--banner-fading":         s.bannerFading
                ? "linear-gradient(to bottom, black 25%, transparent)"
                : "none",
            "--pp-icon-size":          s.iconSize + "px",
            "--pp-title-icon-size":    s.iconSize + "px",
            "--pp-icon-top-margin":    s.iconTopMargin + "px",
            "--pp-icon-top-margin-wb": s.iconTopMarginWithoutBanner + "px",
            "--pp-icon-gap":           s.iconGap + "px",
            "--pp-banner-icon-gap":    s.bannerIconGap + "px",
            "--pp-icon-left-margin":   s.iconLeftMargin + "px"
        };
        var keys = Object.keys(vars);
        for (var i = 0; i < keys.length; i++) {
            document.body.style.setProperty(keys[i], vars[keys[i]]);
        }
    }

    // ── Inline-title class management ────────────────────────

    _hasRtlText(str) {
        if (!str) return false;
        return /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF\u0590-\u05FF\uFB1D-\uFB4F]/.test(str);
    }

    updateInlineTitleClasses() {
        var self = this;
        this.app.workspace.getLeavesOfType("markdown").forEach(function(leaf) {
            if (!(leaf.view instanceof MarkdownView)) return;

            // Use the file's basename as the authoritative title source.
            // el.textContent is unreliable during note switches: Obsidian reuses
            // the same .inline-title DOM element and updates its text after the
            // leaf's file reference has already changed, so textContent may still
            // hold the previous note's title when this function runs — causing the
            // RTL class to "stick" on the next (LTR) note.
            var file      = leaf.view.file;
            var titleText = file ? file.basename : null;

            var contentEl = leaf.view.contentEl;
            contentEl.querySelectorAll(".inline-title").forEach(function(el) {
                el.classList.toggle("icon-in-title", !!self.settings.iconInTitle);
                el.classList.toggle("inline-title-is-rtl", self._hasRtlText(titleText));
            });
        });
    }

    // ── Settings persistence ──────────────────────────────────

    async loadSettings() {
        var data = await this.loadData();
        this.settings = Object.assign({}, DEFAULT_SETTINGS, data);

        delete this.settings.imageCache;
        delete this.settings.cacheTimestamps;

        if (!this.settings.temporaryHiddenProperties)
            this.settings.temporaryHiddenProperties = [];
        if (!this.settings.temporaryViewTimeout)
            this.settings.temporaryViewTimeout = 60;
        if (!this.settings.iconColorPreferences)
            this.settings.iconColorPreferences = {};
        if (!this.settings.folderIconsIndex)
            this.settings.folderIconsIndex = {};

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

        // Only write data.json (settings). The image cache (buffer.json) is
        // written separately by saveBufferData() / saveCache() when images are
        // actually fetched or the cache is explicitly cleared — not on every
        // settings change.
        await this.saveData(mainSettings);

        this.updateCssVariables();
        this.updateHiddenPropertiesCSS();
        // Only trigger a view update when a setting that affects rendering changes.
        // Callers that need a re-render invoke debouncedUpdate() themselves;
        // doing it unconditionally here caused redundant full re-renders on every
        // settings save (e.g. during serial-counter updates at startup).
        // this.debouncedUpdate() is intentionally omitted here.
    }

    // ── Image cache ───────────────────────────────────────────

    async initCache() {
        // imageCache, cacheTimestamps and pendingFetches are pre-created in
        // onload so rendering can begin immediately.  Here we only read
        // buffer.json and merge its contents into the already-live maps.
        // Any fetches that started before this completes will still dedup
        // correctly via pendingFetches.
        await this.loadBufferData();
    }

    async loadBufferData() {
        try {
            var raw    = await this.app.vault.adapter.read(this.bufferFilePath);
            var parsed = JSON.parse(raw);
            this.imageCache      = parsed.imageCache      || {};
            this.cacheTimestamps = parsed.cacheTimestamps || {};
        } catch (_err) {
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
        // Only persist the image cache (buffer.json). Settings (data.json) are
        // written exclusively by saveSettings() and must not be written here —
        // doing so caused a redundant data.json write on every image network
        // fetch (fetchAndCacheImage / fetchExternalSvgText).
        await this.saveBufferData();
    }

    async clearImageCache() {
        this.imageCache      = {};
        this.cacheTimestamps = {};
        this.pendingFetches.clear();
        this._ppIconRegistry = new Map(); // force re-registration with fresh URLs
        this._clearRenderCaches();
        // Single write: saveCache() now writes only buffer.json.
        await this.saveCache();
        this.debouncedUpdate();
    }

    /**
     * Collect every banner URL that is actively referenced by at least one
     * note in the vault, then remove any cache entry whose key is not in
     * that set.  Only external-URL keys (http/https) are considered; local
     * wiki-link banners are never cached, so they are ignored.
     *
     * @returns {{ removed: number, kept: number }}
     */
    async cleanUnusedBannerCache() {
        var self        = this;
        var bannerProp  = this.settings.bannerProperty;
        var usedUrls    = new Set();

        // ── 1. Walk every markdown file and harvest banner values ──────────
        var allFiles = this.app.vault.getMarkdownFiles();
        for (var i = 0; i < allFiles.length; i++) {
            var fc = this.app.metadataCache.getFileCache(allFiles[i]);
            var fm = fc ? fc.frontmatter : null;
            if (!fm) continue;

            var bannerValue = fm[bannerProp];
            if (!bannerValue || typeof bannerValue !== "string") continue;

            // Normalise: strip wiki-link wrappers if present
            var cleaned = formatImageLink(bannerValue);

            // Only external URLs are stored in imageCache
            if (!isExternalUrl(cleaned)) continue;

            // Mark both the plain URL key and the svg-text variant as in-use
            usedUrls.add(cleaned);
            usedUrls.add("svg-text:" + cleaned);
        }

        // ── 2. Purge cache entries that are no longer referenced ───────────
        var removed = 0;
        var kept    = 0;

        Object.keys(this.imageCache).forEach(function(key) {
            // Only clean keys that look like URLs (banner cache entries).
            // Icon cache entries that are not banner URLs are left untouched.
            var isHttpKey = key.indexOf("http://") === 0 ||
                            key.indexOf("https://") === 0 ||
                            key.indexOf("svg-text:http") === 0;
            if (!isHttpKey) { kept++; return; }

            if (usedUrls.has(key)) {
                kept++;
            } else {
                delete self.imageCache[key];
                delete self.cacheTimestamps[key];
                removed++;
            }
        });

        if (removed > 0) {
            // Single write: saveCache() writes buffer.json only.
            await this.saveCache();
        }

        return { removed: removed, kept: kept };
    }

    _isCacheEntryFresh(cacheKey) {
        if (!this.imageCache[cacheKey] || !this.cacheTimestamps[cacheKey]) return false;
        var expiryMs = this.settings.cacheExpiryDays * 24 * 60 * 60 * 1000;
        return (Date.now() - this.cacheTimestamps[cacheKey]) < expiryMs;
    }

    async fetchAndCacheImage(url, _sourcePath) {
        if (!url || url.indexOf("http") !== 0) return url;
        var cacheKey = url;

        if (this._isCacheEntryFresh(cacheKey)) return this.imageCache[cacheKey];
        if (this.pendingFetches.has(cacheKey))
            return await this.pendingFetches.get(cacheKey);

        var self = this;
        var fetchPromise = (async function() {
            try {
                var response = await requestUrl({ url: url, method: "GET" });
                if (response.status >= 200 && response.status < 300) {
                    var contentType =
                        (response.headers["content-type"] || "image/png")
                        .split(";")[0].trim();
                    if (url.toLowerCase().endsWith(".svg") ||
                        contentType.includes("svg")) {
                        contentType = "image/svg+xml";
                    }
                    var dataUrl = "data:" + contentType + ";base64," +
                        arrayBufferToBase64(response.arrayBuffer);
                    self.imageCache[cacheKey]      = dataUrl;
                    self.cacheTimestamps[cacheKey] = Date.now();
                    await self.saveCache();
                    return dataUrl;
                }
                console.warn("Failed to fetch image: " + response.status + " " + url);
                return self.imageCache[cacheKey] || url;
            } catch (error) {
                console.error("Error fetching image:", error);
                return self.imageCache[cacheKey] || url;
            } finally {
                self.pendingFetches.delete(cacheKey);
            }
        })();

        this.pendingFetches.set(cacheKey, fetchPromise);
        return await fetchPromise;
    }

    async fetchExternalSvgText(url) {
        var cacheKey = "svg-text:" + url;

        if (this._isCacheEntryFresh(cacheKey)) return this.imageCache[cacheKey];
        if (this.pendingFetches.has(cacheKey))
            return await this.pendingFetches.get(cacheKey);

        var self = this;
        var fetchPromise = (async function() {
            try {
                var response = await requestUrl({ url: url, method: "GET" });
                if (response.status < 200 || response.status >= 300) {
                    console.warn("SVG fetch failed (" + response.status + "): " + url);
                    return null;
                }

                var svgText = response.text;
                svgText = svgText.replace(
                    /\b(fill|stroke)="(?!none)[^"]*"/gi, "$1=\"currentColor\"");
                svgText = svgText.replace(
                    /\b(fill|stroke)\s*:\s*(?!none)[^;}"]+/gi, "$1:currentColor");
                svgText = svgText.replace(
                    /stop-color="(?!none)[^"]*"/gi, "stop-color=\"currentColor\"");
                svgText = svgText.replace(
                    /(<svg\b[^>]*?)\s+width="[^"]*"/i, "$1");
                svgText = svgText.replace(
                    /(<svg\b[^>]*?)\s+height="[^"]*"/i, "$1");

                self.imageCache[cacheKey]      = svgText;
                self.cacheTimestamps[cacheKey] = Date.now();
                await self.saveCache();
                return svgText;
            } catch (err) {
                console.error("Error fetching external SVG text:", err);
                return null;
            } finally {
                self.pendingFetches.delete(cacheKey);
            }
        })();

        this.pendingFetches.set(cacheKey, fetchPromise);
        return await fetchPromise;
    }

    injectInlineSvg(container, svgText) {
        try {
            var doc   = new DOMParser().parseFromString(svgText, "image/svg+xml");
            var svgEl = doc.querySelector("svg");
            if (!svgEl) return false;

            svgEl.setAttribute("width",  "100%");
            svgEl.setAttribute("height", "100%");
            svgEl.style.display = "block";
            svgEl.classList.add("pp-external-svg");

            // Replace hardcoded fill/stroke colours on every element so the
            // icon inherits currentColor from the surrounding theme, matching
            // Lucide icon behaviour.  We skip "none" and "transparent" so
            // intentional transparent fills are preserved.
            var SKIP = { "none": true, "transparent": true };
            var all  = [svgEl].concat(Array.from(svgEl.querySelectorAll("*")));
            all.forEach(function(el) {
                ["fill", "stroke"].forEach(function(attr) {
                    var val = el.getAttribute(attr);
                    if (val && !SKIP[val.toLowerCase()]) {
                        el.setAttribute(attr, "currentColor");
                    }
                    // Also clear any inline style overrides for fill/stroke
                    if (el.style) {
                        var sv = el.style[attr];
                        if (sv && !SKIP[sv.toLowerCase()]) {
                            el.style[attr] = "currentColor";
                        }
                    }
                });
            });

            container.appendChild(document.adoptNode(svgEl));
            return true;
        } catch (err) {
            console.error("Error injecting inline SVG:", err);
            return false;
        }
    }

    /**
     * Returns a sorted array of the direct children names (files + sub-folders)
     * of a TFolder.  Used as a stable fingerprint so we can re-locate the
     * folder after it has been moved or renamed.
     */
    _getFolderChildNames(folder) {
        if (!folder || !folder.children) return [];
        return folder.children
            .map(function(child) { return child.name; })
            .sort();
    }

    /**
     * Persist the children-name index for a folder that has an icon assigned.
     * Call this whenever folderIcons[path] is written.
     */
    _indexFolderIcon(folder) {
        if (!folder) return;
        this.settings.folderIconsIndex[folder.path] = this._getFolderChildNames(folder);
    }

    /**
     * When a folder is renamed/moved, migrate its icon entry (keyed by old path)
     * to the new path.  Also update the index entry.
     * If the old path had no icon of its own, scan every indexed folder whose
     * children fingerprint matches a currently existing folder that has no icon
     * yet, and assign it — this handles the case where the containing parent
     * was moved and the iconned subfolder arrived at a new path.
     */
    async _migrateFolderIconOnRename(oldPath, newFile) {
        var self     = this;
        var settings = this.settings;

        // ── Case 1: the renamed item IS a folder that had an icon ──────────
        if (settings.folderIcons[oldPath] !== undefined) {
            var icon      = settings.folderIcons[oldPath];
            var oldIndex  = settings.folderIconsIndex[oldPath] || [];

            // Move icon to new path
            settings.folderIcons[newFile.path]      = icon;
            settings.folderIconsIndex[newFile.path] = oldIndex;

            // Clean up old entries
            delete settings.folderIcons[oldPath];
            delete settings.folderIconsIndex[oldPath];

            await this.saveSettings();
            this.updateFileExplorer();
            return;
        }

        // ── Case 2: a parent was renamed/moved; scan all indexed folders ───
        // For every folder that has a saved index entry, check whether any
        // current vault folder (without an icon) has matching children.
        var indexedPaths = Object.keys(settings.folderIconsIndex);
        if (indexedPaths.length === 0) return;

        // Build a map of current vault folders that have NO icon yet
        var allFolders = this.app.vault.getAllLoadedFiles().filter(function(f) {
            return f instanceof TFolder && !settings.folderIcons[f.path];
        });

        var changed = false;

        indexedPaths.forEach(function(indexedPath) {
            // If the indexed path still exists and has an icon, skip it
            if (settings.folderIcons[indexedPath] !== undefined) return;

            var savedChildren = settings.folderIconsIndex[indexedPath];
            if (!savedChildren || savedChildren.length === 0) return;

            // Find a current folder whose children match the saved fingerprint
            var match = null;
            for (var i = 0; i < allFolders.length; i++) {
                var candidate      = allFolders[i];
                var candidateNames = self._getFolderChildNames(candidate);

                // Must have the same number of children and same names
                if (candidateNames.length !== savedChildren.length) continue;
                var allMatch = true;
                for (var j = 0; j < savedChildren.length; j++) {
                    if (candidateNames[j] !== savedChildren[j]) { allMatch = false; break; }
                }
                if (allMatch) { match = candidate; break; }
            }

            if (!match) return;

            // Retrieve the icon from the (now stale) indexed path entry.
            // Since folderIcons[indexedPath] was already deleted when the
            // folder was moved, we need to find the icon value that was saved
            // in folderIconsIndex as a companion — but we only stored children
            // there, not the icon itself. The icon lives in folderIcons keyed
            // by the path at assignment time.  However after Case 1 runs for
            // a direct rename the key is already migrated, so we will not find
            // it here.  This branch therefore only fires when the PARENT was
            // renamed and Obsidian reports it as a rename of the parent folder
            // — in that situation the child folders are NOT individually
            // reported as renamed, so their folderIcons entries still exist
            // under their old paths (e.g. "OldParent/Folder") and we need to
            // copy them to the new paths (e.g. "NewParent/Folder").
            var iconValue = settings.folderIcons[indexedPath];
            if (iconValue === undefined) return; // icon was already migrated

            settings.folderIcons[match.path]      = iconValue;
            settings.folderIconsIndex[match.path] = self._getFolderChildNames(match);

            delete settings.folderIcons[indexedPath];
            delete settings.folderIconsIndex[indexedPath];

            changed = true;
        });

        if (changed) {
            await this.saveSettings();
            this.updateFileExplorer();
        }
    }

    async resolveLink(link, sourcePath) {
        if (!link) return "";
        if (isExternalUrl(link)) {
            return this.settings.enableCache
                ? await this.fetchAndCacheImage(link, sourcePath)
                : link;
        }
        var file = this.app.metadataCache.getFirstLinkpathDest(link, sourcePath);
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
        var suggestions = this.iconIds.filter(function(id) {
            return id.toLowerCase().includes(query.toLowerCase());
        });
        if (query && !suggestions.includes(query) && query.length > 0) {
            suggestions.unshift("Custom: " + query);
        }
        return suggestions;
    }

    renderSuggestion(item, el) {
        el.classList.add("pp-icon-suggestion");
        if (item.startsWith("Custom: ")) {
            el.createSpan({ text: "Custom icon", cls: "pp-icon-custom" });
            el.createSpan({
                text: "\"" + item.substring(8) + "\"",
                cls: "pp-icon-name"
            });
            return;
        }
        var iconSvg = getIcon(item);
        if (iconSvg) el.appendChild(iconSvg);
        el.createSpan({ text: item, cls: "pp-icon-name" });
    }

    onChooseSuggestion(item) {
        var iconValue = item.startsWith("Custom: ") ? item.substring(8) : item;
        var plugin    = this.plugin;

        if (this.targetItem instanceof TFile) {
            this.app.fileManager.processFrontMatter(this.targetItem, function(fm) {
                fm[plugin.settings.iconProperty] = iconValue;
            });
            // metadata:changed fires → debouncedUpdate → renderStandardIcon.
            // renderStandardIcon sees data-icon !== new value and re-renders.
            // No manual cache clearing needed.

        } else if (this.targetItem instanceof TFolder) {
            plugin.settings.folderIcons[this.targetItem.path] = iconValue;
            // Index the folder's children so the icon can be re-located if
            // the folder is later renamed or moved.
            plugin._indexFolderIcon(this.targetItem);
            plugin.saveSettings();
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
        var fileSuggestions = this.app.vault.getFiles().filter(function(f) {
            return IMAGE_EXTENSIONS.includes(f.extension) &&
                f.path.toLowerCase().includes(query.toLowerCase());
        });
        var suggestions = fileSuggestions.slice();
        if (query && this._isImageLink(query)) {
            suggestions.unshift("Custom: " + query);
        }
        return suggestions;
    }

    _isImageLink(value) {
        return value.startsWith("http") ||
            value.startsWith("![[")    ||
            value.includes(".");
    }

    renderSuggestion(item, el) {
        el.empty();
        el.addClass("pp-banner-suggestion");
        var textContainer = el.createDiv({ cls: "pp-banner-text" });

        if (typeof item === "string" && item.startsWith("Custom: ")) {
            var customValue = item.substring(8);
            textContainer.createDiv({ text: "Custom image URL" });
            textContainer.createDiv({ text: customValue, cls: "pp-suggestion-sub" });
            if (customValue.startsWith("http")) {
                this._loadImagePreview(
                    el.createDiv({ cls: "pp-banner-preview-container" }), customValue);
            }
        } else {
            textContainer.createDiv({ text: item.name });
            textContainer.createDiv({ text: item.path, cls: "pp-suggestion-sub" });
        }
    }

    _loadImagePreview(container, src) {
        var img = container.createEl("img", { cls: "pp-banner-preview" });
        img.setAttribute("loading", "lazy");
        img.src = src;
        img.onerror = function() {
            container.empty();
            container.style.display = "none";
        };
    }

    onChooseSuggestion(item) {
        var bannerValue;
        if (typeof item === "string" && item.startsWith("Custom: ")) {
            var customValue = item.substring(8);
            if (customValue.startsWith("http")) {
                bannerValue = customValue;
            } else if (customValue.includes(".") && !customValue.startsWith("[[")) {
                bannerValue = "[[" + customValue + "]]";
            } else {
                bannerValue = customValue;
            }
        } else {
            bannerValue = "[[" + item.path + "]]";
        }

        var plugin = this.plugin;
        this.app.fileManager.processFrontMatter(this.targetFile, function(fm) {
            fm[plugin.settings.bannerProperty] = bannerValue;
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
        var self       = this;
        var contentEl  = this.contentEl;
        var fc         = this.app.metadataCache.getFileCache(this.targetFile);
        var fm         = (fc && fc.frontmatter) ? fc.frontmatter : {};
        var currentPos = fm[this.plugin.settings.bannerPositionProperty] || 50;

        contentEl.empty();

        var sliderContainer = contentEl.createDiv({ cls: "banner-position-slider" });
        var slider = sliderContainer.createEl("input", {
            type: "range",
            attr: { min: "0", max: "100", value: String(currentPos) }
        });
        var valueDisplay = sliderContainer.createEl("span", {
            text: currentPos + "%", cls: "position-value"
        });

        slider.addEventListener("input", function(e) {
            valueDisplay.textContent = e.target.value + "%";
        });
        slider.addEventListener("change", async function(e) {
            await self._saveBannerPosition(parseInt(e.target.value));
        });

        var presets    = contentEl.createDiv({ cls: "position-presets" });
        var presetData = [["Top", 0], ["Center", 50], ["Bottom", 100]];
        for (var pi = 0; pi < presetData.length; pi++) {
            (function(label, value) {
                presets.createEl("button", { text: label })
                    .addEventListener("click", async function() {
                        await self._saveBannerPosition(value);
                    });
            })(presetData[pi][0], presetData[pi][1]);
        }
    }

    async _saveBannerPosition(value) {
        var self = this;
        await this.app.fileManager.processFrontMatter(
            this.targetFile, function(fm) {
                fm[self.plugin.settings.bannerPositionProperty] = value;
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
        var self      = this;
        var contentEl = this.contentEl;
        contentEl.empty();

        contentEl.createEl("h2", { text: "Icon Color Preference" });

        var truncated = this.iconUrl.length > 60
            ? this.iconUrl.substring(0, 60) + "..."
            : this.iconUrl;
        contentEl.createEl("p",
            { text: "For icon: " + truncated, cls: "icon-preference-url" });
        contentEl.createEl("p", {
            text: "Select the icon's base color to ensure it displays correctly " +
                  "in both light and dark themes.",
            cls: "icon-preference-desc"
        });

        var buttonContainer = contentEl.createDiv({ cls: "icon-preference-buttons" });

        this._addButton(buttonContainer, "White Icon (Light Color)", "mod-cta",
            async function() {
                await self.plugin.setIconColorPreference(self.iconUrl, "white");
                self.close();
            });
        this._addButton(buttonContainer, "Black Icon (Dark Color)", "mod-cta",
            async function() {
                await self.plugin.setIconColorPreference(self.iconUrl, "black");
                self.close();
            });
        this._addButton(buttonContainer, "Clear Preference", "mod-warning",
            async function() {
                if (self.plugin.settings.iconColorPreferences) {
                    delete self.plugin.settings.iconColorPreferences[self.iconUrl];
                    await self.plugin.saveSettings();
                    new Notice("Icon color preference cleared");
                    self.plugin.forceRefreshAllIcons();
                }
                self.close();
            });
        this._addButton(buttonContainer, "Cancel", null,
            function() { self.close(); });

        contentEl.createEl("p", {
            text: "Tip: Choose 'White' if the icon is white/light on a transparent " +
                  "background. Choose 'Black' if the icon is black/dark. The plugin " +
                  "will automatically adjust the color for the opposite theme.",
            cls:   "icon-preference-tip",
            style: "margin-top:20px;font-size:12px;color:var(--text-muted);"
        });
    }

    _addButton(container, text, cls, onClick) {
        var btn = container.createEl("button",
            { text: text, cls: cls || undefined });
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
        var containerEl = this.containerEl;
        containerEl.empty();

        containerEl.createEl("h2", { text: "Icons" });
        this._toggle("Enable Icons", null, "enableIcon");
        this._toggle("Icon next Title", null, "iconInTitle",
        function() { this.plugin.updateCssVariables(); this.plugin.updateAllViews(); }.bind(this));
        this._toggle("File Explorer icons", null, "showFileExplorerIcons");
        this._text("Icon Size", null, "iconSize", Number);

        containerEl.createEl("h2", { text: "Banners" });
        this._toggle("Enable Banners", null, "enableBanner");
        this._text("Banner Height", null, "bannerHeight", Number);


        containerEl.createEl("h2", { text: "Image Cache" });
        this._toggle("Enable Image Cache",
            "Cache remote images locally for offline access", "enableCache");
        this._text("Cache Expiry Days",
            "How many days to keep cached images", "cacheExpiryDays", Number);

        containerEl.createEl("h2", { text: "UI Mode" });
        this._text("UI Mode Property Key",
            "Frontmatter key to force 'edit' or 'preview' mode. " +
            "Use 'preview-force' or 'edit-force' to lock the mode.",
            "uiProperty");

        containerEl.createEl("h2", { text: "Scrollbar" });
        this._toggle("Hide Scrollbars", "Hide scrollbars in note views",
            "hideScrollbars",
            function() { this.plugin.updateScrollbarStyle(); }.bind(this));

        containerEl.createEl("h2", { text: "Hidden Properties" });
        this._toggle("Show properties while editing", "When enabled, the property label and value will remain visible while editing hidden properties.", "ShowHiddenPropsWhileEditing");
       
        this._toggle("Property hiding range", "When enabled, properties are hidden only in the editor view; otherwise, they are hidden globally.", "hidePropsOnEditorOnly");
        this._text("Temporary View Timeout",
            "How many seconds to show properties in temporary view",
            "temporaryViewTimeout",
            function(v) {
                var n = parseInt(v);
                return (!isNaN(n) && n > 0) ? n : null;
            });
        this._buildHiddenPropertiesList(containerEl);
    }

    _toggle(name, desc, key, onAfter) {
        var self    = this;
        var setting = new Setting(this.containerEl).setName(name);
        if (desc) setting.setDesc(desc);
        setting.addToggle(function(t) {
            t.setValue(self.plugin.settings[key])
             .onChange(async function(v) {
                 self.plugin.settings[key] = v;
                 await self.plugin.saveSettings();
                 // saveSettings no longer auto-fires debouncedUpdate; trigger it
                 // here so toggling any visual setting refreshes the views.
                 self.plugin.debouncedUpdate();
                 if (onAfter) onAfter(v);
             });
        });
    }

    _text(name, desc, key, coerce) {
        var self    = this;
        var setting = new Setting(this.containerEl).setName(name);
        if (desc) setting.setDesc(desc);
        setting.addText(function(t) {
            t.setValue(String(self.plugin.settings[key]))
             .onChange(async function(v) {
                 var value = coerce ? coerce(v) : v;
                 if (value === null) return;
                 self.plugin.settings[key] = value;
                 await self.plugin.saveSettings();
                 // Refresh views so numeric setting changes (icon size, etc.) apply.
                 self.plugin.debouncedUpdate();
             });
        });
    }

    _buildHiddenPropertiesList(containerEl) {
        var self = this;
        var hiddenPropsContainer =
            containerEl.createDiv({ cls: "hidden-props-container" });
        var dropdownHeader =
            hiddenPropsContainer.createDiv({ cls: "hidden-props-dropdown-header" });
        dropdownHeader.createEl("h3", { text: "Hidden Properties" });

        var countSpan = dropdownHeader.createEl("span", {
            cls:  "hidden-props-count",
            text: "(" + this.plugin.settings.hiddenProperties.length + ")"
        });
        var toggleIcon = dropdownHeader.createEl("span",
            { cls: "hidden-props-toggle", text: "▼" });

        var isExpanded = false;
        var hiddenList = hiddenPropsContainer.createDiv({ cls: "hidden-props-list" });
        hiddenList.style.display = "none";

        function refresh() {
            hiddenList.empty();
            var props = self.plugin.settings.hiddenProperties;
            if (props.length === 0) {
                hiddenList.createEl("div",
                    { text: "No hidden properties", cls: "hidden-props-empty" });
            } else {
                props.forEach(function(prop) {
                    self._renderHiddenPropItem(hiddenList, prop, refresh, countSpan);
                });
            }
            toggleIcon.textContent = isExpanded ? "▲" : "▼";
        }

        refresh();

        dropdownHeader.addEventListener("click", function() {
            isExpanded = !isExpanded;
            hiddenList.style.display = isExpanded ? "block" : "none";
            toggleIcon.textContent = isExpanded ? "▲" : "▼";
        });
    }

    _renderHiddenPropItem(listEl, prop, refresh, countSpan) {
        var self     = this;
        var propItem = listEl.createDiv({ cls: "hidden-prop-item" });
        propItem.createEl("span", { text: prop, cls: "hidden-prop-name" });

        var buttonContainer = propItem.createDiv({ cls: "hidden-prop-buttons" });

        var showInTempBtn = buttonContainer.createEl("button", {
            cls:  "hidden-prop-show-temp",
            attr: { title: "Show this property in temporary view" }
        });
        var tempIcon = getIcon("square-dashed-mouse-pointer");
        if (tempIcon) showInTempBtn.appendChild(tempIcon.cloneNode(true));
        else          showInTempBtn.textContent = "T";

        var isInTemp =
            this.plugin.settings.temporaryHiddenProperties.includes(prop);
        if (isInTemp) {
            showInTempBtn.classList.add("is-active");
            showInTempBtn.title = "Will show in temporary view";
        }

        showInTempBtn.addEventListener("click", async function(e) {
            e.stopPropagation();
            if (!self.plugin.settings.temporaryHiddenProperties.includes(prop)) {
                self.plugin.settings.temporaryHiddenProperties.push(prop);
                await self.plugin.saveSettings();
                new Notice("\"" + prop + "\" will appear in temporary view");
                showInTempBtn.classList.add("is-active");
                showInTempBtn.title = "Will show in temporary view";
            } else {
                self.plugin.settings.temporaryHiddenProperties.remove(prop);
                await self.plugin.saveSettings();
                new Notice("\"" + prop + "\" removed from temporary view");
                showInTempBtn.classList.remove("is-active");
                showInTempBtn.title = "Show this property in temporary view";
            }
        });

        var removeBtn = buttonContainer.createEl("button",
            { cls: "hidden-prop-remove" });
        removeBtn.innerHTML = "×";
        removeBtn.title = "Unhide property permanently";

        removeBtn.addEventListener("click", async function(e) {
            e.stopPropagation();
            self.plugin.settings.hiddenProperties.remove(prop);
            self.plugin.settings.temporaryHiddenProperties.remove(prop);
            await self.plugin.saveSettings();
            refresh();
            countSpan.textContent =
                "(" + self.plugin.settings.hiddenProperties.length + ")";
            new Notice("Property \"" + prop + "\" is now permanently visible");
        });
    }
}