```js
const { Plugin, PluginSettingTab, Setting, MarkdownView, getIcon, getIconIds, SuggestModal, TFile, TFolder, debounce, Menu, Modal, Notice, setIcon, requestUrl } = require("obsidian");

const DEFAULT_SETTINGS = {
    enableBanner: true,
    bannerProperty: "banner",
    bannerPositionProperty: "banner_y",
    bannerHeight: 150,
    bannerMargin: 0,
    bannerFading: false,
    enableIcon: true,
    iconProperty: "icon",
    iconSize: 36,
    iconTopMargin: 70,
    iconTopMarginWithoutBanner: -10,
    iconLeftMargin: 0,
    iconGap: 10,
    bannerIconGap: 0,
    iconInTitle: true,
    showFileExplorerIcons: true,
    folderIcons: {},
    hiddenProperties: [],
    temporaryHiddenProperties: [],
    temporaryViewTimeout: 60,
    defaultNotePath: "",
    uiProperty: "ui",
    enableCache: true,
    cacheExpiryDays: 30,
    hideScrollbars: true,
    showPropertiesOnCreate: true,
    showPropertiesOnCreateDuration: 60
};

module.exports = class StyleshVault extends Plugin {
    async onload() {
        await this.loadSettings();

        this.editingProperties = new Set();
        this.propertyEditTimeout = null;

        this.temporaryVisibleProps = new Map();

        this.iconRenderPromises = new Map();
        this.iconRenderTimeouts = new Map();
        this.renderedIcons = new Map();
        this.pendingIconRenders = new Set();

        // NEW: Track which files have had their icons rendered to avoid re-rendering on mode switch
        this.renderedFiles = new Set();
        this.currentRenderedFile = null;

        this.forceModeWatchers = new Map();
        this.newlyCreatedFiles = new Map();
        this.newFileTimer = null;

        this.addSettingTab(new StyleshVaultSettingTab(this.app, this));
        this.updateCssVariables();
        this.updateHiddenPropertiesCSS();

        await this.initCache();

        this.addCommand({
            id: 'select-icon',
            name: 'Select Icon',
            checkCallback: (checking) => {
                const file = this.app.workspace.getActiveFile();
                if (file instanceof TFile) {
                    if (!checking) new IconSuggestModal(this.app, this, file).open();
                    return true;
                }
                return false;
            }
        });

        this.addCommand({
            id: 'force-refresh-icons',
            name: 'Force Refresh Icons',
            callback: async () => {
                this.renderedIcons.clear();
                this.iconRenderPromises.clear();
                this.pendingIconRenders.clear();
                this.renderedFiles.clear(); // NEW: Clear file cache as well
                await this.clearImageCache();
                this.updateAllViews();
                new Notice('Icons refreshed and cache cleared');
            }
        });

        this.registerEvent(
            this.app.workspace.on("file-menu", (menu, file) => {
                if (file instanceof TFile || file instanceof TFolder) {
                    menu.addItem((item) => {
                        item.setTitle("Change Icon").setIcon("image-plus").onClick(() => {
                            new IconSuggestModal(this.app, this, file).open();
                        });
                    });
                }
            })
        );

        this.registerEvent(
            this.app.workspace.on("active-leaf-change", debounce(() => {
                this.setupPropertyContextMenus();
            }, 100))
        );

        this.app.workspace.onLayoutReady(() => {
            this.setupPropertyContextMenus();
            this.addShowFullPropertiesButtons();
        });

        this.registerDomEvent(document, 'contextmenu', (evt) => {
            const target = evt.target;
            const view = this.app.workspace.getActiveViewOfType(MarkdownView);
            if (!view || !view.file) return;

            if (target.closest('.banner-image')) {
                evt.preventDefault();
                const menu = new Menu();
                menu.addItem(i => i.setTitle("Change Banner").setIcon("image").onClick(() => new BannerSuggestModal(this.app, this, view.file).open()));
                menu.addItem(i => i.setTitle("Change Banner Position").setIcon("move-vertical").onClick(() => new BannerPositionModal(this.app, this, view.file).open()));
                menu.addItem(i => i.setTitle("Remove Banner").setIcon("trash").onClick(() => {
                    this.app.fileManager.processFrontMatter(view.file, (fm) => { delete fm[this.settings.bannerProperty]; });
                }));
                menu.showAtPosition({ x: evt.clientX, y: evt.clientY });
            }

            if (target.closest('.icon-image') || target.closest('.pp-title-icon')) {
                evt.preventDefault();
                const menu = new Menu();
                menu.addItem(i => i.setTitle("Change Icon").setIcon("image-plus").onClick(() => new IconSuggestModal(this.app, this, view.file).open()));
                menu.addItem(i => i.setTitle("Remove Icon").setIcon("trash").onClick(() => {
                    this.app.fileManager.processFrontMatter(view.file, (fm) => { delete fm[this.settings.iconProperty]; });
                }));
                menu.showAtPosition({ x: evt.clientX, y: evt.clientY });
            }
        });

        this.debouncedUpdate = debounce(() => {
            this.updateAllViews();
            this.updateTabIcons();
        }, 300, true);

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
                this.handleViewMode(file);
                this.cleanupDuplicates(file);
                this.debouncedUpdate();
                this.addShowFullPropertiesButtons();
                this.checkNewlyCreatedFile(file);
            }, 100);
        }));

        this.registerEvent(this.app.vault.on("create", (file) => {
            if (file instanceof TFile) {
                setTimeout(() => {
                    this.checkNewlyCreatedFile(file);
                    if (this.app.workspace.getActiveFile()?.path === file.path) {
                        this.updateHiddenPropertiesCSS();
                    }
                }, 100);
            }
        }));

        this.app.workspace.onLayoutReady(() => {
            this.setupPropertyContextMenus();

            this.app.workspace.iterateAllLeaves((leaf) => {
                if (leaf.view instanceof MarkdownView && leaf.view.file) {
                    const fm = this.app.metadataCache.getFileCache(leaf.view.file)?.frontmatter;
                    const uiMode = fm?.[this.settings.uiProperty];
                    if (uiMode) {
                        this.enforceUIModeForLeaf(leaf, uiMode);
                    }
                    this.checkNewlyCreatedFile(leaf.view.file);
                }
            });

            setTimeout(() => {
                this.debouncedUpdate();
            }, 200);

            setTimeout(() => this.addShowFullPropertiesButtons(), 300);

            setTimeout(() => {
                this.openDefaultNote();
            }, 500);

            this.registerEvent(this.app.workspace.on('active-leaf-change', debounce((leaf) => {
                if (leaf && leaf.view instanceof MarkdownView && leaf.view.file) {
                    const fm = this.app.metadataCache.getFileCache(leaf.view.file)?.frontmatter;
                    const uiMode = fm?.[this.settings.uiProperty];
                    if (uiMode) {
                        this.enforceUIModeForLeaf(leaf, uiMode);
                    }
                    this.checkNewlyCreatedFile(leaf.view.file);
                }
            }, 100)));
        });

        this.addCommand({
            id: 'clear-image-cache',
            name: 'Clear Image Cache',
            callback: async () => {
                await this.clearImageCache();
                new Notice('Image cache cleared.');
            }
        });

        this.addCommand({
            id: 'show-temporary-properties',
            name: 'Show Hidden Properties Temporarily',
            checkCallback: (checking) => {
                const file = this.app.workspace.getActiveFile();
                if (file instanceof TFile) {
                    if (!checking) {
                        this.showTemporaryProperties(file);
                    }
                    return true;
                }
                return false;
            }
        });

        this.updateScrollbarStyle(); 

        this.setupPropertyEditListeners();
    }

    checkNewlyCreatedFile(file) {
        if (!file || !file.path || !this.settings.showPropertiesOnCreate) return false;

        const filePath = file.path;
        const now = Date.now();

        if (this.newlyCreatedFiles.has(filePath)) {
            const expiryTime = this.newlyCreatedFiles.get(filePath);
            if (now < expiryTime) {
                return true;
            } else {
                this.newlyCreatedFiles.delete(filePath);
                return false;
            }
        }

        try {
            const stat = this.app.vault.getAbstractFileByPath(filePath)?.stat;
            if (stat && stat.ctime) {
                const fileAge = now - stat.ctime;
                const durationMs = this.settings.showPropertiesOnCreateDuration * 1000;

                if (fileAge < durationMs) {
                    this.newlyCreatedFiles.set(filePath, stat.ctime + durationMs);

                    setTimeout(() => {
                        if (this.newlyCreatedFiles.has(filePath)) {
                            this.newlyCreatedFiles.delete(filePath);
                            this.updateHiddenPropertiesCSS();

                            if (this.app.workspace.getActiveFile()?.path === filePath) {
                                new Notice('New file grace period ended - hidden properties are now hidden');
                            }
                        }
                    }, durationMs - (now - stat.ctime));

                    return true;
                }
            }
        } catch (error) {
            console.error('Error checking file creation time:', error);
        }

        return false;
    }

    toggleNewFileNotice(file, isNewlyCreated) {
        if (!file) return;

        const container = document.querySelector('.metadata-container');
        if (!container) return;

        let noticeEl = container.querySelector('.new-file-notice');

        if (isNewlyCreated) {
            if (!noticeEl) {
                const stat = file.stat;
                const now = Date.now();
                const expiryTime = stat.ctime + (this.settings.showPropertiesOnCreateDuration * 1000);
                const remainingSeconds = Math.max(0, Math.ceil((expiryTime - now) / 1000));

                noticeEl = document.createElement('div');
                noticeEl.classList.add('new-file-notice');

                const iconSpan = document.createElement('span');
                iconSpan.classList.add('new-file-notice-icon');
                iconSpan.innerHTML = '✨';

                const textSpan = document.createElement('span');
                textSpan.classList.add('new-file-notice-text');
                textSpan.textContent = `New file: showing all properties for ${remainingSeconds}s`;

                noticeEl.appendChild(iconSpan);
                noticeEl.appendChild(textSpan);

                const metadataContent = container.querySelector('.metadata-content');
                if (metadataContent) {
                    container.insertBefore(noticeEl, metadataContent);
                } else {
                    container.appendChild(noticeEl);
                }

                if (this.newFileTimer) clearInterval(this.newFileTimer);
                this.newFileTimer = setInterval(() => {
                    if (!this.newlyCreatedFiles.has(file.path)) {
                        clearInterval(this.newFileTimer);
                        this.newFileTimer = null;
                        if (noticeEl) noticeEl.remove();
                        return;
                    }

                    const now = Date.now();
                    const expiryTime = this.newlyCreatedFiles.get(file.path);
                    const remainingSeconds = Math.max(0, Math.ceil((expiryTime - now) / 1000));

                    if (remainingSeconds <= 0) {
                        clearInterval(this.newFileTimer);
                        this.newFileTimer = null;
                        if (noticeEl) noticeEl.remove();
                    } else {
                        const textSpan = noticeEl.querySelector('.new-file-notice-text');
                        if (textSpan) {
                            textSpan.textContent = `New file: showing all properties for ${remainingSeconds}s`;
                        }
                    }
                }, 1000);
            }
        } else {
            if (noticeEl) {
                noticeEl.remove();
            }
            if (this.newFileTimer) {
                clearInterval(this.newFileTimer);
                this.newFileTimer = null;
            }
        }
    }

    async showTemporaryProperties(file) {
        if (!file || !file.path) return;

        const filePath = file.path;
        const activeProps = this.settings.temporaryHiddenProperties;

        if (activeProps.length === 0) {
            new Notice('No properties configured for temporary view. Add properties in plugin settings.');
            return;
        }

        if (this.temporaryVisibleProps.has(filePath)) {
            const previous = this.temporaryVisibleProps.get(filePath);
            if (previous.timeout) {
                clearTimeout(previous.timeout);
            }
        }

        const propsSet = new Set(activeProps);
        this.temporaryVisibleProps.set(filePath, {
            props: propsSet,
            timeout: null
        });

        this.updateHiddenPropertiesCSS();

        new Notice(`Showing ${activeProps.length} hidden properties for ${this.settings.temporaryViewTimeout} seconds`);

        const timeout = setTimeout(() => {
            this.hideTemporaryProperties(filePath);
        }, this.settings.temporaryViewTimeout * 1000);

        this.temporaryVisibleProps.get(filePath).timeout = timeout;
    }

    hideTemporaryProperties(filePath) {
        if (this.temporaryVisibleProps.has(filePath)) {
            const data = this.temporaryVisibleProps.get(filePath);
            if (data.timeout) {
                clearTimeout(data.timeout);
            }
            this.temporaryVisibleProps.delete(filePath);

            this.updateHiddenPropertiesCSS();

            new Notice('Temporary properties have been hidden');
        }
    }

    updateHiddenPropertiesCSS() {
        let styleEl = document.getElementById('pp-hidden-props') || document.head.createEl('style', { id: 'pp-hidden-props' });

        const rules = [];
        const currentFile = this.app.workspace.getActiveFile();
        const currentFilePath = currentFile ? currentFile.path : null;

        const isNewlyCreated = currentFilePath ? this.checkNewlyCreatedFile(currentFile) : false;

        this.settings.hiddenProperties.forEach(prop => {
            let shouldShow = false;

            if (isNewlyCreated) {
                shouldShow = true;
            }
            else if (this.editingProperties.has(prop)) {
                shouldShow = true;
            }
            else if (currentFilePath && 
                    this.temporaryVisibleProps.has(currentFilePath) && 
                    this.temporaryVisibleProps.get(currentFilePath).props.has(prop)) {
                shouldShow = true;
            }

            if (shouldShow) {
                rules.push(`
                    .metadata-property[data-property-key="${prop}"] { 
                        opacity: 1 !important;
                        display: block !important;
                    }
                `);
            } else {
                rules.push(`.metadata-property[data-property-key="${prop}"] { display: none !important; }`);
            }
        });

        if (isNewlyCreated) {
            rules.push(`
                .new-file-notice {
                    display: flex !important;
                }
            `);
        }

        styleEl.innerText = rules.join("\n");

        this.toggleNewFileNotice(currentFile, isNewlyCreated);
    }

    addShowFullPropertiesButtons() {
        const propertiesContainers = document.querySelectorAll('.metadata-container');

        propertiesContainers.forEach(container => {
            if (container.querySelector('.show-full-properties-btn')) return;

            const header = container.querySelector('.metadata-container-heading');
            if (!header) return;

            const file = this.app.workspace.getActiveFile();
            if (!file) return;

            const showFullBtn = document.createElement('button');
            showFullBtn.classList.add('show-full-properties-btn');
            showFullBtn.textContent = 'Show Full Properties';
            showFullBtn.title = 'Show temporary properties for 60 seconds';

            showFullBtn.addEventListener('click', async (e) => {
                e.stopPropagation();
                e.preventDefault();
                await this.showTemporaryProperties(file);
            });

            header.appendChild(showFullBtn);
        });
    }

    handlePropertyContextMenu(evt, propertyEl) {
        evt.preventDefault();
        evt.stopPropagation();

        const propertyKey = propertyEl.getAttribute('data-property-key');
        if (!propertyKey) return;

        const isHidden = this.settings.hiddenProperties.includes(propertyKey);
        const isInTempView = this.settings.temporaryHiddenProperties.includes(propertyKey);

        const menu = new Menu();

        menu.addItem(item => 
            item
                .setTitle(isHidden ? `Unhide property "${propertyKey}"` : `Hide property "${propertyKey}"`)
                .setIcon(isHidden ? "eye" : "eye-off")
                .onClick(async () => {
                    if (isHidden) {
                        this.settings.hiddenProperties.remove(propertyKey);
                        this.settings.temporaryHiddenProperties.remove(propertyKey);
                        new Notice(`Property "${propertyKey}" is now permanently visible`);
                    } else {
                        this.settings.hiddenProperties.push(propertyKey);
                        new Notice(`Property "${propertyKey}" is now hidden`);

                        this.editingProperties.add(propertyKey);
                        await this.saveSettings();
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
                    .setTitle(isInTempView ? `Remove from temporary view` : `Add to temporary view`)
                    .setIcon(isInTempView ? "square-dashed-mouse-pointer" : "square-dashed-mouse-pointer")
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

    setupPropertyEditListeners() {
        this.registerDomEvent(document, 'focusin', (evt) => {
            const input = evt.target;
            const propertyEl = input.closest('.metadata-property');
            if (propertyEl) {
                const propertyKey = propertyEl.getAttribute('data-property-key');
                if (propertyKey && this.settings.hiddenProperties.includes(propertyKey)) {
                    this.editingProperties.add(propertyKey);

                    if (this.propertyEditTimeout) {
                        clearTimeout(this.propertyEditTimeout);
                    }

                    this.updateHiddenPropertiesCSS();
                }
            }
        });

        this.registerDomEvent(document, 'focusout', (evt) => {
            const input = evt.target;
            const propertyEl = input.closest('.metadata-property');
            if (propertyEl) {
                const propertyKey = propertyEl.getAttribute('data-property-key');
                if (propertyKey && this.editingProperties.has(propertyKey)) {
                    this.propertyEditTimeout = setTimeout(() => {
                        this.editingProperties.delete(propertyKey);
                        this.updateHiddenPropertiesCSS();
                    }, 1000);
                }
            }
        });
    }

    async handleViewMode(file) {
        if (!file || !(file instanceof TFile)) return;

        await new Promise(resolve => setTimeout(resolve, 50));

        const fm = this.app.metadataCache.getFileCache(file)?.frontmatter;
        const uiMode = fm?.[this.settings.uiProperty];
        if (!uiMode) return;

        this.app.workspace.iterateAllLeaves((leaf) => {
            if (leaf.view instanceof MarkdownView && leaf.view.file && leaf.view.file.path === file.path) {
                this.enforceUIModeForLeaf(leaf, uiMode);
            }
        });
    }

    async enforceUIModeForLeaf(leaf, uiMode) {
        const state = leaf.getViewState();
        const currentMode = state.state?.mode;

        let targetMode = null;
        let isForceMode = false;

        if (uiMode === 'preview-force') {
            targetMode = 'preview';
            isForceMode = true;
        } else if (uiMode === 'edit-force') {
            targetMode = 'source';
            isForceMode = true;
        } else if (uiMode === 'preview') {
            targetMode = 'preview';
        } else if (uiMode === 'edit') {
            targetMode = 'source';
        }

        if (!targetMode || currentMode === targetMode) return;

        await leaf.setViewState({
            ...state,
            state: {
                ...state.state,
                mode: targetMode
            }
        });

        if (isForceMode) {
            this.setupForceModeWatcher(leaf, uiMode);
        }
    }

    setupForceModeWatcher(leaf, uiMode) {
        const leafId = this.getLeafId(leaf);

        if (this.forceModeWatchers.has(leafId)) {
            clearInterval(this.forceModeWatchers.get(leafId).interval);
            this.forceModeWatchers.delete(leafId);
        }

        let targetMode;
        if (uiMode === 'preview-force') {
            targetMode = 'preview';
        } else if (uiMode === 'edit-force') {
            targetMode = 'source';
        } else {
            return;
        }

        const watcher = {
            interval: setInterval(() => {
                if (!leaf.view || !(leaf.view instanceof MarkdownView)) {
                    this.removeForceModeWatcher(leafId);
                    return;
                }

                const state = leaf.getViewState();
                const currentMode = state.state?.mode;

                if (currentMode !== targetMode) {
                    console.log(`Force mode: Reverting from ${currentMode} to ${targetMode}`);

                    leaf.setViewState({
                        ...state,
                        state: {
                            ...state.state,
                            mode: targetMode
                        }
                    }).catch(err => {
                        console.error('Error reverting force mode:', err);
                    });
                }
            }, 100),
            targetMode: targetMode
        };

        this.forceModeWatchers.set(leafId, watcher);
    }

    getLeafId(leaf) {
        return leaf.id || leaf.view?.file?.path || Math.random().toString(36).substr(2, 9);
    }

    removeForceModeWatcher(leafId) {
        if (this.forceModeWatchers.has(leafId)) {
            const watcher = this.forceModeWatchers.get(leafId);
            clearInterval(watcher.interval);
            this.forceModeWatchers.delete(leafId);
        }
    }

    cleanupDuplicates(file) {
        const filePath = file?.path;
        if (!filePath) return;

        const cleanedContainers = new Set();

        const containers = [];
        this.app.workspace.iterateAllLeaves((leaf) => {
            if (leaf.view instanceof MarkdownView && leaf.view.file?.path === filePath) {
                const contentEl = leaf.view.contentEl;
                const scroller = contentEl.querySelector(".markdown-source-view > .cm-editor > .cm-scroller");
                const preview = contentEl.querySelector(".markdown-reading-view > .markdown-preview-view");
                if (scroller) containers.push(scroller);
                if (preview) containers.push(preview);
            }
        });

        containers.forEach(container => {
            if (cleanedContainers.has(container)) return;

            const iconWrappers = container.querySelectorAll(":scope > .icon-wrapper");
            if (iconWrappers.length > 1) {
                const firstWrapper = iconWrappers[0];
                for (let i = 1; i < iconWrappers.length; i++) {
                    const currentIcon = iconWrappers[i].getAttribute("data-icon");
                    const firstIcon = firstWrapper.getAttribute("data-icon");
                    if (currentIcon === firstIcon) {
                        iconWrappers[i].remove();
                    }
                }
            }

            const bannerImages = container.querySelectorAll(":scope > .banner-image");
            if (bannerImages.length > 1) {
                const firstBanner = bannerImages[0];
                for (let i = 1; i < bannerImages.length; i++) {
                    const currentSrc = bannerImages[i].getAttribute("data-src");
                    const firstSrc = firstBanner.getAttribute("data-src");
                    if (currentSrc === firstSrc) {
                        bannerImages[i].remove();
                    }
                }
            }

            cleanedContainers.add(container);
        });

        this.app.workspace.iterateAllLeaves((leaf) => {
            if (leaf.view instanceof MarkdownView && leaf.view.file?.path === filePath) {
                const contentEl = leaf.view.contentEl;
                const titleIcons = contentEl.querySelectorAll(".pp-title-icon");
                if (titleIcons.length > 1) {
                    const firstIcon = titleIcons[0];
                    const firstIconValue = firstIcon.getAttribute("data-icon");
                    for (let i = 1; i < titleIcons.length; i++) {
                        if (titleIcons[i].getAttribute("data-icon") === firstIconValue) {
                            titleIcons[i].remove();
                        }
                    }
                }
            }
        });
    }

    async initCache() {
        const data = await this.loadData();
        this.imageCache = data?.imageCache || {};
        this.cacheTimestamps = data?.cacheTimestamps || {};
        this.pendingFetches = new Map();
    }

    async saveCache() {
        await this.saveData({
            ...this.settings,
            imageCache: this.imageCache,
            cacheTimestamps: this.cacheTimestamps
        });
    }

    async clearImageCache() {
        this.imageCache = {};
        this.cacheTimestamps = {};
        this.pendingFetches.clear();
        this.renderedIcons.clear();
        this.iconRenderPromises.clear();
        this.renderedFiles.clear(); // NEW: Clear file cache
        await this.saveCache();
        this.debouncedUpdate();
    }

    async fetchAndCacheImage(url, sourcePath) {
        if (!url || !url.startsWith("http")) return url;

        const cacheKey = `${url}`;
        const now = Date.now();
        const expiryMs = this.settings.cacheExpiryDays * 24 * 60 * 60 * 1000;

        if (this.imageCache[cacheKey] && this.cacheTimestamps[cacheKey]) {
            const age = now - this.cacheTimestamps[cacheKey];
            if (age < expiryMs) {
                return this.imageCache[cacheKey];
            }
        }

        if (this.pendingFetches.has(cacheKey)) {
            return await this.pendingFetches.get(cacheKey);
        }

        const fetchPromise = (async () => {
            try {
                const response = await requestUrl({
                    url: url,
                    method: 'GET',
                    contentType: 'arraybuffer'
                });

                if (response.status >= 200 && response.status < 300) {
                    const contentType = response.headers['content-type'] || 'image/png';
                    const base64 = Buffer.from(response.arrayBuffer).toString('base64');
                    const dataUrl = `data:${contentType};base64,${base64}`;

                    this.imageCache[cacheKey] = dataUrl;
                    this.cacheTimestamps[cacheKey] = now;

                    await this.saveCache();

                    return dataUrl;
                } else {
                    console.warn(`Failed to fetch image: ${response.status} ${url}`);
                    return this.imageCache[cacheKey] || url;
                }
            } catch (error) {
                console.error('Error fetching image:', error);
                return this.imageCache[cacheKey] || url;
            } finally {
                this.pendingFetches.delete(cacheKey);
            }
        })();

        this.pendingFetches.set(cacheKey, fetchPromise);
        return await fetchPromise;
    }

    async resolveLink(link, sourcePath) {
        if (!link) return "";

        if (link.startsWith("http")) {
            if (this.settings.enableCache) {
                return await this.fetchAndCacheImage(link, sourcePath);
            }
            return link;
        }

        const file = this.app.metadataCache.getFirstLinkpathDest(link, sourcePath);
        return file ? this.app.vault.getResourcePath(file) : link;
    }

    async renderBanner(contentEl, containers, fm, sourcePath) {
        const bannerUrl = fm?.[this.settings.bannerProperty];
        if (!this.settings.enableBanner || !bannerUrl) {
            containers.forEach(c => c.querySelectorAll(":scope > .banner-image").forEach(el => el.remove()));
            contentEl.classList.remove("has-banner");
            return;
        }

        const bannerSrc = this.formatImageLink(bannerUrl);
        const bannerPos = fm[this.settings.bannerPositionProperty] || 50;

        for (const container of containers) {
            let bannerEl = container.querySelector(":scope > .banner-image");
            if (!bannerEl) {
                bannerEl = document.createElement("div");
                bannerEl.classList.add("banner-image");
                container.prepend(bannerEl);
            }

            if (bannerEl.getAttribute("data-src") !== bannerSrc || bannerEl.getAttribute("data-pos") !== String(bannerPos)) {
                bannerEl.setAttribute("data-src", bannerSrc);
                bannerEl.setAttribute("data-pos", String(bannerPos));
                bannerEl.empty();

                try {
                    const img = document.createElement("img");

                    let imgSrc = bannerSrc;
                    if (bannerSrc.startsWith("http")) {
                        imgSrc = await this.resolveLink(bannerSrc, sourcePath);
                    } else if (!bannerSrc.startsWith("data:")) {
                        imgSrc = await this.resolveLink(bannerSrc, sourcePath);
                    }

                    img.src = imgSrc;
                    img.style.objectPosition = `center ${bannerPos}%`;
                    img.onerror = () => {
                        console.warn(`Failed to load banner: ${bannerSrc}`);
                        bannerEl.style.display = "none";
                    };
                    img.onload = () => {
                        bannerEl.style.display = "";
                    };

                    bannerEl.appendChild(img);
                } catch (error) {
                    console.error("Error rendering banner:", error);
                    bannerEl.remove();
                }
            }
        }

        contentEl.classList.add("has-banner");
    }

    // NEW: Ensure icons are visible without re-rendering
    ensureIconsVisible(containers, contentEl, fm, sourcePath) {
        const iconValue = fm?.[this.settings.iconProperty];

        if (!iconValue) return;

        // Check if icons exist in both views
        if (this.settings.iconInTitle) {
            const titleIcon = contentEl.querySelector(".pp-title-icon");
            if (!titleIcon && iconValue) {
                // Icon missing in this view, render it
                this.renderIcon(contentEl, containers, fm, sourcePath);
            } else if (titleIcon && titleIcon.getAttribute("data-icon") !== iconValue) {
                this.updateIconContent(titleIcon, iconValue, sourcePath);
            }
        } else {
            containers.forEach(container => {
                const iconWrapper = container.querySelector(":scope > .icon-wrapper");
                if (!iconWrapper && iconValue) {
                    this.renderIcon(contentEl, containers, fm, sourcePath);
                } else if (iconWrapper && iconWrapper.getAttribute("data-icon") !== iconValue) {
                    this.updateIconContent(iconWrapper, iconValue, sourcePath);
                }
            });
        }
    }

    async processView(view) {
        const file = view.file;
        if (!file) return;

        try {
            await new Promise(resolve => setTimeout(resolve, 10));

            this.cleanupDuplicates(file);

            const fm = this.app.metadataCache.getFileCache(file)?.frontmatter;
            const contentEl = view.contentEl;

            const scroller = contentEl.querySelector(".markdown-source-view > .cm-editor > .cm-scroller");
            const preview = contentEl.querySelector(".markdown-reading-view > .markdown-preview-view");
            const containers = [scroller, preview].filter(c => c !== null);

            contentEl.querySelectorAll(".markdown-embed .banner-image, .markdown-embed .icon-wrapper, .markdown-embed .pp-title-icon").forEach(el => el.remove());

            // Check if this file already has rendered icons
            const iconValue = fm?.[this.settings.iconProperty] || 'no-icon';
            const fileKey = `${file.path}-${iconValue}`;

            if (!this.renderedFiles.has(fileKey)) {
                // First time rendering this file (or icon changed)
                await this.renderBanner(contentEl, containers, fm, file.path);
                await this.renderIcon(contentEl, containers, fm, file.path);
                this.renderedFiles.add(fileKey);
                this.currentRenderedFile = fileKey;
            } else {
                // File already has icons rendered, just ensure they're visible in both views
                await this.renderBanner(contentEl, containers, fm, file.path); // Banner still needs to be handled (but it's already efficient)
                this.ensureIconsVisible(containers, contentEl, fm, file.path);
            }
        } catch (error) {
            console.error("Error processing view:", error);
        }
    }

    setupPropertyContextMenus() {
        document.querySelectorAll('.metadata-property:not([data-pp-has-listener])').forEach(propertyEl => {
            propertyEl.setAttribute('data-pp-has-listener', 'true');
            propertyEl.addEventListener('contextmenu', (evt) => this.handlePropertyContextMenu(evt, propertyEl));
        });
    }

    onunload() {
        if (this.propertyEditTimeout) {
            clearTimeout(this.propertyEditTimeout);
        }

        this.temporaryVisibleProps.forEach((data, filePath) => {
            if (data.timeout) {
                clearTimeout(data.timeout);
            }
        });
        this.temporaryVisibleProps.clear();

        this.iconRenderTimeouts.forEach(timeout => clearTimeout(timeout));
        this.iconRenderTimeouts.clear();

        this.forceModeWatchers.forEach((watcher, leafId) => {
            clearInterval(watcher.interval);
        });
        this.forceModeWatchers.clear();

        if (this.newFileTimer) {
            clearInterval(this.newFileTimer);
        }

        document.querySelectorAll(".banner-image, .icon-wrapper, .pp-title-icon, .pp-file-icon").forEach(el => el.remove());
        document.getElementById('pp-hidden-props')?.remove();

        document.querySelectorAll('.show-full-properties-btn').forEach(btn => btn.remove());

        document.querySelectorAll(".pp-title-wrapper").forEach(w => {
            const title = w.querySelector(".inline-title");
            if (title) w.parentNode.insertBefore(title, w);
            w.remove();
        });

        document.body.classList.remove("hider-scroll");

        this.app.workspace.iterateAllLeaves((leaf) => {
            if (leaf.tabHeaderEl) {
                const iconContainer = leaf.tabHeaderEl.querySelector(".workspace-tab-header-inner-icon");
                if (iconContainer) {
                    iconContainer.style.display = "";
                    setIcon(iconContainer, "lucide-file");
                }
                leaf.tabHeaderEl.removeAttribute("data-pp-icon");

                const customIcon = leaf.tabHeaderEl.querySelector(".pp-tab-icon");
                if (customIcon) customIcon.remove();
            }
        });

        document.querySelectorAll('.metadata-property[data-pp-has-listener]').forEach(propertyEl => {
            propertyEl.removeAttribute('data-pp-has-listener');
        });

        this.renderedIcons.clear();
        this.iconRenderPromises.clear();
        this.pendingIconRenders.clear();
        this.renderedFiles.clear(); // NEW: Clear file cache
    }

    updateAllViews() {
        this.app.workspace.iterateAllLeaves((leaf) => {
            if (leaf.view instanceof MarkdownView) {
                this.processView(leaf.view);
            }
        });
        this.updateTabIcons();
        if (this.settings.showFileExplorerIcons) this.updateFileExplorer();
    }

    updateTabIcons() {
        if (!this.settings.enableIcon) return;

        this.app.workspace.iterateAllLeaves((leaf) => {
            if (!(leaf.view instanceof MarkdownView) || !leaf.view.file) return;

            const file = leaf.view.file;
            const iconValue = this.app.metadataCache.getFileCache(file)?.frontmatter?.[this.settings.iconProperty];
            const tabEl = leaf.tabHeaderEl;
            if (!tabEl) return;

            const isStacked = tabEl.closest(".mod-stacked");

            if (isStacked) {
                const iconContainer = tabEl.querySelector(".workspace-tab-header-inner-icon");
                if (!iconContainer) return;

                if (iconValue) {
                    if (tabEl.getAttribute("data-pp-icon") !== iconValue) {
                        tabEl.setAttribute("data-pp-icon", iconValue);
                        this.appendIconContent(iconContainer, iconValue, file.path);
                    }
                } else {
                    if (tabEl.hasAttribute("data-pp-icon")) {
                        tabEl.removeAttribute("data-pp-icon");
                        setIcon(iconContainer, "lucide-file");
                    }
                }
            } else {
                const container = tabEl.querySelector(".workspace-tab-header-inner");
                if (!container) return;

                const defaultIcon = container.querySelector(".workspace-tab-header-inner-icon");
                let customIconEl = container.querySelector(".pp-tab-icon");

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
                        this.appendIconContent(customIconEl, iconValue, file.path);
                    }
                } else {
                    if (customIconEl) customIconEl.remove();
                    if (defaultIcon) defaultIcon.style.display = "";
                }
            }
        });
    }

    updateScrollbarStyle() {
        document.body.classList.toggle("hider-scroll", this.settings.hideScrollbars);
    }

    async renderIcon(contentEl, containers, fm, sourcePath) {
        const iconValue = fm?.[this.settings.iconProperty];
        const shouldRender = this.settings.enableIcon && iconValue;

        if (!shouldRender) {
            containers.forEach(c => c.querySelectorAll(":scope > .icon-wrapper").forEach(el => el.remove()));
            contentEl.querySelectorAll(".pp-title-icon").forEach(el => el.remove());
            return;
        }

        const renderKey = `${sourcePath}-${iconValue}`;

        // NEW: Check if icons already exist before rendering
        const existingIcons = this.settings.iconInTitle 
            ? contentEl.querySelectorAll(".pp-title-icon").length
            : containers.some(c => c.querySelector(":scope > .icon-wrapper"));

        if (existingIcons > 0) {
            // Icons already exist, just ensure they have the right icon value
            if (this.settings.iconInTitle) {
                contentEl.querySelectorAll(".pp-title-icon").forEach(iconEl => {
                    if (iconEl.getAttribute("data-icon") !== iconValue) {
                        this.updateIconContent(iconEl, iconValue, sourcePath);
                    }
                });
            } else {
                containers.forEach(container => {
                    const iconWrapper = container.querySelector(":scope > .icon-wrapper");
                    if (iconWrapper && iconWrapper.getAttribute("data-icon") !== iconValue) {
                        this.updateIconContent(iconWrapper, iconValue, sourcePath);
                    }
                });
            }
            return;
        }

        if (this.pendingIconRenders.has(renderKey)) {
            return;
        }

        this.pendingIconRenders.add(renderKey);

        try {
            if (this.settings.iconInTitle) {
                containers.forEach(c => c.querySelectorAll(":scope > .icon-wrapper").forEach(el => el.remove()));
                await this.renderIconInTitle(contentEl, iconValue, sourcePath);
            } else {
                contentEl.querySelectorAll(".pp-title-icon").forEach(el => el.remove());
                await this.renderStandardIcon(containers, iconValue, sourcePath);
            }
        } catch (error) {
            console.error("Error rendering icon:", error);
        } finally {
            setTimeout(() => {
                this.pendingIconRenders.delete(renderKey);
            }, 100);
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
        }
    }

    async renderIconInTitle(contentEl, iconValue, sourcePath) {
        const inlineTitles = Array.from(contentEl.querySelectorAll(".inline-title")).filter(el => !el.closest(".markdown-embed"));

        for (const titleEl of inlineTitles) {
            let wrapper = titleEl.parentElement;
            if (!wrapper.classList.contains("pp-title-wrapper")) {
                wrapper = document.createElement("div");
                wrapper.classList.add("pp-title-wrapper");
                titleEl.parentNode.insertBefore(wrapper, titleEl);
                wrapper.appendChild(titleEl);
            }

            let iconEl = wrapper.querySelector(":scope > .pp-title-icon");
            if (!iconEl) {
                iconEl = document.createElement("span");
                iconEl.classList.add("pp-title-icon");
                wrapper.prepend(iconEl);
            }

            if (iconEl.getAttribute("data-icon") !== iconValue) {
                iconEl.setAttribute("data-icon", iconValue);
                await this.appendIconContent(iconEl, iconValue, sourcePath);
            }
        }
    }

    // NEW: Update icon content without full re-render
    async updateIconContent(container, iconValue, sourcePath) {
        container.setAttribute("data-icon", iconValue);
        container.empty();

        const lucideIcon = getIcon(iconValue);
        if (lucideIcon) {
            lucideIcon.classList.add("pp-svg-icon");
            container.appendChild(lucideIcon);
            return;
        }

        if (this.isEmoji(iconValue)) {
            const emojiDiv = container.createDiv({ cls: "pp-text-icon" });
            emojiDiv.innerText = iconValue;
            return;
        }

        const formattedSrc = this.formatImageLink(iconValue);
        if (!formattedSrc) {
            console.warn("Empty icon source:", iconValue);
            return;
        }

        const img = document.createElement("img");
        img.alt = "Icon";

        try {
            let imgSrc;
            if (formattedSrc.startsWith("http")) {
                imgSrc = await Promise.race([
                    this.resolveLink(formattedSrc, sourcePath),
                    new Promise((_, reject) => 
                        setTimeout(() => reject(new Error("Image load timeout")), 5000)
                    )
                ]);
            } else if (formattedSrc.startsWith("data:")) {
                imgSrc = formattedSrc;
            } else {
                imgSrc = await this.resolveLink(formattedSrc, sourcePath);
            }

            img.src = imgSrc;

            img.onerror = () => {
                console.warn(`Failed to load icon image: ${formattedSrc}`);
                img.remove();

                const fallbackIcon = getIcon("lucide-file");
                if (fallbackIcon) {
                    fallbackIcon.classList.add("pp-svg-icon");
                    container.appendChild(fallbackIcon);
                }
            };

            img.onload = () => {
                container.appendChild(img);
            };

        } catch (error) {
            console.error("Error resolving icon:", error);
            const fallbackIcon = getIcon("lucide-file");
            if (fallbackIcon) {
                fallbackIcon.classList.add("pp-svg-icon");
                container.appendChild(fallbackIcon);
            }
        }
    }

    updateFileExplorer() {
        if (!this.settings.showFileExplorerIcons) return;

        const fileExplorers = this.app.workspace.getLeavesOfType("file-explorer");
        fileExplorers.forEach(leaf => {
            const items = leaf.view.containerEl.querySelectorAll(".tree-item-self[data-path]");
            items.forEach(item => {
                const path = item.getAttribute("data-path");
                const file = this.app.vault.getAbstractFileByPath(path);
                let iconValue = null;
                let isFolder = false;

                if (file instanceof TFile) {
                    iconValue = this.app.metadataCache.getFileCache(file)?.frontmatter?.[this.settings.iconProperty];
                } else if (file instanceof TFolder) { 
                    iconValue = this.settings.folderIcons[file.path] || 'lucide-folder'; 
                    isFolder = true; 
                }

                this.renderFileExplorerIcon(item, iconValue, path, isFolder);
            });
        });
    }

    async appendIconContent(container, iconValue, sourcePath, isFloating = false) {
        if (!container || !iconValue) return;

        const renderKey = `${container.className}-${iconValue}-${sourcePath}-${Date.now()}`;

        if (this.iconRenderPromises.has(renderKey)) {
            return await this.iconRenderPromises.get(renderKey);
        }

        const renderPromise = (async () => {
            try {
                container.empty();

                let contentContainer = isFloating ? container.createDiv({ cls: "icon-image" }) : container;

                const lucideIcon = getIcon(iconValue);
                if (lucideIcon) {
                    lucideIcon.classList.add("pp-svg-icon");
                    contentContainer.appendChild(lucideIcon);
                    return;
                }

                if (this.isEmoji(iconValue)) {
                    const emojiDiv = contentContainer.createDiv({ cls: "pp-text-icon" });
                    emojiDiv.innerText = iconValue;
                    return;
                }

                const formattedSrc = this.formatImageLink(iconValue);
                if (!formattedSrc) {
                    console.warn("Empty icon source:", iconValue);
                    return;
                }

                const img = document.createElement("img");
                img.alt = "Icon";

                try {
                    let imgSrc;
                    if (formattedSrc.startsWith("http")) {
                        imgSrc = await Promise.race([
                            this.resolveLink(formattedSrc, sourcePath),
                            new Promise((_, reject) => 
                                setTimeout(() => reject(new Error("Image load timeout")), 5000)
                            )
                        ]);
                    } else if (formattedSrc.startsWith("data:")) {
                        imgSrc = formattedSrc;
                    } else {
                        imgSrc = await this.resolveLink(formattedSrc, sourcePath);
                    }

                    img.src = imgSrc;

                    img.onerror = () => {
                        console.warn(`Failed to load icon image: ${formattedSrc}`);
                        img.remove();

                        const fallbackIcon = getIcon("lucide-file");
                        if (fallbackIcon) {
                            fallbackIcon.classList.add("pp-svg-icon");
                            contentContainer.appendChild(fallbackIcon);
                        }
                    };

                    img.onload = () => {
                        contentContainer.appendChild(img);
                    };

                    const loadTimeout = setTimeout(() => {
                        if (!img.parentElement) {
                            console.warn(`Icon image load timeout: ${formattedSrc}`);
                            img.remove();

                            const fallbackIcon = getIcon("lucide-file");
                            if (fallbackIcon) {
                                fallbackIcon.classList.add("pp-svg-icon");
                                contentContainer.appendChild(fallbackIcon);
                            }
                        }
                    }, 3000);

                    this.iconRenderTimeouts.set(renderKey, loadTimeout);

                } catch (error) {
                    console.error("Error resolving icon:", error);
                    const fallbackIcon = getIcon("lucide-file");
                    if (fallbackIcon) {
                        fallbackIcon.classList.add("pp-svg-icon");
                        contentContainer.appendChild(fallbackIcon);
                    }
                }

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

    renderFileExplorerIcon(itemEl, iconValue, sourcePath, isFolder) {
        let iconEl = itemEl.querySelector(".pp-file-icon");

        if (!iconValue && !isFolder) { 
            if (iconEl) iconEl.remove(); 
            return; 
        }

        if (isFolder && !iconValue) {
            iconValue = 'lucide-folder';
        }

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

    formatImageLink(link) {
        if (!link || typeof link !== 'string') return "";
        return link.replace(/^!?\[\[|\]\]$/g, "");
    }

    isEmoji(str) { 
        const emojiRegex = /^\p{Emoji}$/u;
        return emojiRegex.test(str) && !str.includes(".") && !str.includes("/");
    }

    updateCssVariables() {
        const s = this.settings;
        const b = document.body;
        b.style.setProperty("--banner-height", s.bannerHeight + "px");
        b.style.setProperty("--banner-margin", s.bannerMargin + "px");
        b.style.setProperty("--banner-fading", s.bannerFading ? "linear-gradient(to bottom, black 25%, transparent)" : "none");
        b.style.setProperty("--pp-icon-size", s.iconSize + "px");
        b.style.setProperty("--pp-title-icon-size", s.iconSize + "px");
        b.style.setProperty("--pp-icon-top-margin", s.iconTopMargin + "px");
        b.style.setProperty("--pp-icon-top-margin-wb", s.iconTopMarginWithoutBanner + "px");
        b.style.setProperty("--pp-icon-gap", s.iconGap + "px");
        b.style.setProperty("--pp-banner-icon-gap", s.bannerIconGap + "px");
        b.style.setProperty("--pp-icon-left-margin", s.iconLeftMargin + "px");
    }

    async openDefaultNote() {
        if (!this.settings.defaultNotePath) {
            return;
        }

        await new Promise(resolve => setTimeout(resolve, 800));

        const file = this.app.vault.getAbstractFileByPath(this.settings.defaultNotePath);
        if (!(file instanceof TFile)) {
            console.log("Default note file not found:", this.settings.defaultNotePath);
            return;
        }

        let defaultNoteLeaf = null;
        this.app.workspace.iterateAllLeaves((leaf) => {
            if (leaf.view && leaf.view.file && leaf.view.file.path === file.path) {
                defaultNoteLeaf = leaf;
            }
        });

        if (defaultNoteLeaf) {
            this.app.workspace.setActiveLeaf(defaultNoteLeaf);
            return;
        }

        let anyFileOpen = false;
        this.app.workspace.iterateAllLeaves((leaf) => {
            if (leaf.view && leaf.view.file && leaf.view.file.path !== file.path) {
                anyFileOpen = true;
            }
        });

        if (anyFileOpen) {
            let activeLeaf = this.app.workspace.getLeaf();

            if (!activeLeaf || !(activeLeaf.view instanceof MarkdownView)) {
                const markdownLeaves = this.app.workspace.getLeavesOfType("markdown");
                if (markdownLeaves.length > 0) {
                    activeLeaf = markdownLeaves[0];
                }
            }

            if (activeLeaf) {
                try {
                    await activeLeaf.openFile(file);
                    this.app.workspace.setActiveLeaf(activeLeaf);
                    return;
                } catch (error) {
                    console.error("Error opening in existing leaf:", error);
                }
            }
        }

        try {
            const leaf = this.app.workspace.getLeaf(true);
            await leaf.openFile(file);
            this.app.workspace.setActiveLeaf(leaf);
        } catch (error) {
            console.error("Error opening default note:", error);
        }
    }

    async loadSettings() { 
        this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData()); 
        if (!this.settings.temporaryHiddenProperties) {
            this.settings.temporaryHiddenProperties = [];
        }
        if (!this.settings.temporaryViewTimeout) {
            this.settings.temporaryViewTimeout = 60;
        }
        if (this.settings.showPropertiesOnCreate === undefined) {
            this.settings.showPropertiesOnCreate = true;
        }
        if (!this.settings.showPropertiesOnCreateDuration) {
            this.settings.showPropertiesOnCreateDuration = 60;
        }
    }

    async saveSettings() { 
        await this.saveData(this.settings); 
        this.updateCssVariables(); 
        this.updateHiddenPropertiesCSS(); 
        this.debouncedUpdate(); 
    }
};

class IconSuggestModal extends SuggestModal {
    constructor(app, plugin, targetItem) { 
        super(app); 
        this.plugin = plugin; 
        this.targetItem = targetItem; 
        this.iconIds = getIconIds(); 
    }

    getSuggestions(query) { 
        const suggestions = this.iconIds.filter(icon => icon.toLowerCase().includes(query.toLowerCase()));

        if (query && !suggestions.includes(query) && query.length > 0) {
            if (this.isCustomIcon(query)) {
                suggestions.unshift(`Custom: ${query}`);
            }
        }

        return suggestions;
    }

    isCustomIcon(value) {
        if (value.startsWith("http") || value.startsWith("![[") || value.includes(".")) {
            return true;
        }
        if (/\p{Emoji}/u.test(value)) {
            return true;
        }
        return true;
    }

    renderSuggestion(item, el) {
        el.classList.add("pp-icon-suggestion");

        if (item.startsWith("Custom: ")) {
            const customValue = item.substring(8);
            el.createSpan({ text: "Custom icon", cls: "pp-icon-custom" });
            el.createSpan({ text: `"${customValue}"`, cls: "pp-icon-name" });
            return;
        }

        const iconSvg = getIcon(item);
        if (iconSvg) el.appendChild(iconSvg);
        el.createSpan({ text: item, cls: "pp-icon-name" });
    }

    onChooseSuggestion(item, evt) {
        let iconValue;

        if (item.startsWith("Custom: ")) {
            iconValue = item.substring(8);
        } else {
            iconValue = item;
        }

        if (this.targetItem instanceof TFile) {
            this.app.fileManager.processFrontMatter(this.targetItem, (fm) => { 
                fm[this.plugin.settings.iconProperty] = iconValue; 
            });
            // Clear cache for this file so it re-renders with new icon
            const oldKeys = Array.from(this.plugin.renderedFiles).filter(key => key.startsWith(this.targetItem.path));
            oldKeys.forEach(key => this.plugin.renderedFiles.delete(key));
        } else if (this.targetItem instanceof TFolder) { 
            this.plugin.settings.folderIcons[this.targetItem.path] = iconValue; 
            this.plugin.saveSettings(); 
        }
    }
}

class BannerSuggestModal extends SuggestModal {
    constructor(app, plugin, targetFile) { 
        super(app); 
        this.plugin = plugin; 
        this.targetFile = targetFile; 
    }

    getSuggestions(query) {
        const files = this.app.vault.getFiles();
        const ext = ["png", "jpg", "jpeg", "gif", "bmp", "svg", "webp"];

        const fileSuggestions = files.filter(f => 
            ext.includes(f.extension) && f.path.toLowerCase().includes(query.toLowerCase())
        );

        const suggestions = [...fileSuggestions];

        if (query && query.length > 0 && this.isImageLink(query)) {
            suggestions.unshift(`Custom: ${query}`);
        }

        return suggestions;
    }

    isImageLink(value) {
        if (value.startsWith("http") || value.startsWith("![[") || value.includes(".")) {
            return true;
        }
        return false;
    }

    renderSuggestion(item, el) {
        if (typeof item === 'string' && item.startsWith("Custom: ")) {
            const customValue = item.substring(8);
            el.createDiv({ text: "Custom image URL" });
            el.createDiv({ text: customValue, cls: "pp-suggestion-sub" });
        } else {
            el.createDiv({ text: item.name });
            el.createDiv({ text: item.path, cls: "pp-suggestion-sub" });
        }
    }

    onChooseSuggestion(item, evt) {
        let bannerValue;

        if (typeof item === 'string' && item.startsWith("Custom: ")) {
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

        this.app.fileManager.processFrontMatter(this.targetFile, (fm) => { 
            fm[this.plugin.settings.bannerProperty] = bannerValue; 
        });
    }
}

class BannerPositionModal extends Modal {
    constructor(app, plugin, targetFile) {
        super(app);
        this.plugin = plugin;
        this.targetFile = targetFile;
    }

    onOpen() {
        const { contentEl } = this;
        contentEl.empty();

        const fm = this.app.metadataCache.getFileCache(this.targetFile)?.frontmatter || {};
        const currentPos = fm[this.plugin.settings.bannerPositionProperty] || 50;

        const sliderContainer = contentEl.createDiv({ cls: "banner-position-slider" });
        const slider = sliderContainer.createEl("input", {
            type: "range",
            attr: { min: "0", max: "100", value: String(currentPos) }
        });

        const valueDisplay = sliderContainer.createEl("span", { 
            text: `${currentPos}%`,
            cls: "position-value"
        });

        slider.addEventListener("input", (e) => {
            const value = e.target.value;
            valueDisplay.textContent = `${value}%`;
        });

        slider.addEventListener("change", async (e) => {
            const value = parseInt(e.target.value);
            await this.app.fileManager.processFrontMatter(this.targetFile, (fm) => {
                fm[this.plugin.settings.bannerPositionProperty] = value;
            });
            this.plugin.debouncedUpdate();
            this.close();
        });

        const presets = contentEl.createDiv({ cls: "position-presets" });
        const positions = ["Top", "Center", "Bottom"];
        const values = [0, 50, 100];

        positions.forEach((label, index) => {
            const btn = presets.createEl("button", { text: label });
            btn.addEventListener("click", async () => {
                await this.app.fileManager.processFrontMatter(this.targetFile, (fm) => {
                    fm[this.plugin.settings.bannerPositionProperty] = values[index];
                });
                this.plugin.debouncedUpdate();
                this.close();
            });
        });
    }

    onClose() {
        const { contentEl } = this;
        contentEl.empty();
    }
}

class DefaultNoteSuggestModal extends SuggestModal {
    constructor(app, plugin, setting) {
        super(app);
        this.plugin = plugin;
        this.setting = setting;
    }

    getSuggestions(query) {
        const files = this.app.vault.getMarkdownFiles();

        if (!query) {
            return files.slice(0, 20);
        }

        const queryLower = query.toLowerCase();
        return files.filter(file => 
            file.name.toLowerCase().includes(queryLower) || 
            file.path.toLowerCase().includes(queryLower)
        ).slice(0, 20);
    }

    renderSuggestion(file, el) {
        el.createDiv({ text: file.name });
        el.createDiv({ 
            text: file.path, 
            cls: "pp-suggestion-sub" 
        });
    }

    onChooseSuggestion(file) {
        this.plugin.settings.defaultNotePath = file.path;
        this.plugin.saveSettings();
        this.setting.settingEl.parentElement.querySelector('.setting-item-description').textContent = `Current: ${file.name}`;
        new Notice(`Set "${file.name}" as default note`);
        this.close();
    }
}

class StyleshVaultSettingTab extends PluginSettingTab {
    constructor(app, plugin) { 
        super(app, plugin); 
        this.plugin = plugin; 
    }

    display() {
        const { containerEl } = this;
        containerEl.empty();
        containerEl.createEl("h2", { text: "Banners" });
        new Setting(containerEl).setName("Enable Banners").addToggle(t => t.setValue(this.plugin.settings.enableBanner).onChange(async v => { this.plugin.settings.enableBanner = v; await this.plugin.saveSettings(); }));
        new Setting(containerEl).setName("Banner Height").addText(t => t.setValue(String(this.plugin.settings.bannerHeight)).onChange(async v => { this.plugin.settings.bannerHeight = Number(v); await this.plugin.saveSettings(); }));

        containerEl.createEl("h2", { text: "Icons" });
        new Setting(containerEl).setName("Enable Icons").addToggle(t => t.setValue(this.plugin.settings.enableIcon).onChange(async v => { this.plugin.settings.enableIcon = v; await this.plugin.saveSettings(); }));
        new Setting(containerEl).setName("Icon Size").addText(t => t.setValue(String(this.plugin.settings.iconSize)).onChange(async v => { this.plugin.settings.iconSize = Number(v); await this.plugin.saveSettings(); }));

        containerEl.createEl("h2", { text: "Image Cache" });
        new Setting(containerEl)
            .setName("Enable Image Cache")
            .setDesc("Cache remote images locally for offline access")
            .addToggle(t => t.setValue(this.plugin.settings.enableCache).onChange(async v => { 
                this.plugin.settings.enableCache = v; 
                await this.plugin.saveSettings(); 
            }));
        new Setting(containerEl)
            .setName("Cache Expiry Days")
            .setDesc("How many days to keep cached images")
            .addText(t => t.setValue(String(this.plugin.settings.cacheExpiryDays)).onChange(async v => { 
                this.plugin.settings.cacheExpiryDays = Number(v); 
                await this.plugin.saveSettings(); 
            }));

        containerEl.createEl("h2", { text: "UI Mode" });
        new Setting(containerEl)
            .setName("UI Mode Property Key")
            .setDesc("Frontmatter key to force 'edit' or 'preview' mode. Use 'preview-force' or 'edit-force' to prevent user from changing the mode.")
            .addText(t => t.setValue(this.plugin.settings.uiProperty).onChange(async v => {
                this.plugin.settings.uiProperty = v;
                await this.plugin.saveSettings();
            }));

        containerEl.createEl("h2", { text: "hide scrollbar" });
        new Setting(containerEl)
            .setName("hide Scrollbars")
            .setDesc("enable to hide scrollbars")
            .addToggle(t => t
                .setValue(this.plugin.settings.hideScrollbars)
                .onChange(async v => {
                    this.plugin.settings.hideScrollbars = v;
                    await this.plugin.saveSettings();
                    this.plugin.updateScrollbarStyle();
                })
            );

        containerEl.createEl("h2", { text: "Default Note" });

        let currentNoteName = "None";
        if (this.plugin.settings.defaultNotePath) {
            const file = this.app.vault.getAbstractFileByPath(this.plugin.settings.defaultNotePath);
            if (file) {
                currentNoteName = file.name;
            }
        }

        const defaultNoteSetting = new Setting(containerEl)
            .setName("Default Note")
            .setDesc(`Note that opens automatically when Obsidian starts (Current: ${currentNoteName})`)
            .addButton(btn => btn
                .setButtonText("Choose Note")
                .setCta()
                .onClick(() => {
                    new DefaultNoteSuggestModal(this.app, this.plugin, defaultNoteSetting).open();
                }))
            .addButton(btn => btn
                .setButtonText("Clear")
                .setWarning()
                .onClick(async () => {
                    this.plugin.settings.defaultNotePath = "";
                    await this.plugin.saveSettings();
                    defaultNoteSetting.settingEl.parentElement.querySelector('.setting-item-description').textContent = 
                        "Note that opens automatically when Obsidian starts (Current: None)";
                    new Notice("Default note cleared");
                }));

        containerEl.createEl("h2", { text: "New Files" });

        new Setting(containerEl)
            .setName("Show all properties for new files")
            .setDesc("Temporarily show all hidden properties when a file is newly created")
            .addToggle(t => t
                .setValue(this.plugin.settings.showPropertiesOnCreate)
                .onChange(async v => {
                    this.plugin.settings.showPropertiesOnCreate = v;
                    await this.plugin.saveSettings();
                    this.plugin.updateHiddenPropertiesCSS();
                }));

        new Setting(containerEl)
            .setName("Grace period duration (seconds)")
            .setDesc("How many seconds to show all properties after file creation")
            .addText(t => t
                .setValue(String(this.plugin.settings.showPropertiesOnCreateDuration))
                .onChange(async v => {
                    const seconds = parseInt(v);
                    if (!isNaN(seconds) && seconds > 0) {
                        this.plugin.settings.showPropertiesOnCreateDuration = seconds;
                        await this.plugin.saveSettings();
                    }
                }));

        containerEl.createEl("h2", { text: "Hidden Properties" });

        new Setting(containerEl)
            .setName("Temporary View Timeout")
            .setDesc("How many seconds to show properties in temporary view")
            .addText(t => t
                .setValue(String(this.plugin.settings.temporaryViewTimeout))
                .onChange(async v => {
                    const seconds = parseInt(v);
                    if (!isNaN(seconds) && seconds > 0) {
                        this.plugin.settings.temporaryViewTimeout = seconds;
                        await this.plugin.saveSettings();
                    }
                }));

        const hiddenPropsContainer = containerEl.createDiv({ cls: "hidden-props-container" });

        const dropdownHeader = hiddenPropsContainer.createDiv({ cls: "hidden-props-dropdown-header" });
        dropdownHeader.createEl("h3", { text: "Hidden Properties" });

        const countSpan = dropdownHeader.createEl("span", { 
            cls: "hidden-props-count",
            text: `(${this.plugin.settings.hiddenProperties.length})`
        });

        const toggleIcon = dropdownHeader.createEl("span", { 
            cls: "hidden-props-toggle",
            text: "▼"
        });

        let isExpanded = false;
        const hiddenList = hiddenPropsContainer.createDiv({ cls: "hidden-props-list" });

        const updateHiddenList = () => {
            hiddenList.empty();

            if (this.plugin.settings.hiddenProperties.length === 0) {
                hiddenList.createEl("div", { 
                    text: "No hidden properties", 
                    cls: "hidden-props-empty" 
                });
            } else {
                this.plugin.settings.hiddenProperties.forEach(prop => {
                    const propItem = hiddenList.createDiv({ cls: "hidden-prop-item" });

                    propItem.createEl("span", { 
                        text: prop, 
                        cls: "hidden-prop-name" 
                    });

                    const buttonContainer = propItem.createDiv({ cls: "hidden-prop-buttons" });

                    const tempIcon = getIcon("square-dashed-mouse-pointer");

                    const showInTempBtn = buttonContainer.createEl("button", {
                        cls: "hidden-prop-show-temp",
                        attr: { title: "Show this property in temporary view" }
                    });

                    if (tempIcon) {
                        const clonedIcon = tempIcon.cloneNode(true);
                        showInTempBtn.appendChild(clonedIcon);
                    } else {
                        showInTempBtn.textContent = "T";
                    }

                    const removeBtn = buttonContainer.createEl("button", { 
                        cls: "hidden-prop-remove" 
                    });
                    removeBtn.innerHTML = "×";
                    removeBtn.title = "Unhide property permanently";

                    if (this.plugin.settings.temporaryHiddenProperties.includes(prop)) {
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

                    removeBtn.addEventListener("click", async (e) => {
                        e.stopPropagation();

                        this.plugin.settings.hiddenProperties.remove(prop);

                        if (this.plugin.settings.temporaryHiddenProperties.includes(prop)) {
                            this.plugin.settings.temporaryHiddenProperties.remove(prop);
                        }

                        await this.plugin.saveSettings();

                        updateHiddenList();
                        countSpan.textContent = `(${this.plugin.settings.hiddenProperties.length})`;
                        new Notice(`Property "${prop}" is now permanently visible`);
                    });
                });
            }

            toggleIcon.textContent = isExpanded ? "▲" : "▼";
        };

        updateHiddenList();

        dropdownHeader.addEventListener("click", () => {
            isExpanded = !isExpanded;
            if (isExpanded) {
                hiddenList.style.display = "block";
            } else {
                hiddenList.style.display = "none";
            }
            toggleIcon.textContent = isExpanded ? "▲" : "▼";
        });

        hiddenList.style.display = "none";
    }
}
```