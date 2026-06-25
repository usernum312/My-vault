---
cssclasses:
  - Cairo-Font
Categories:
  - "[[Tasks|Task]]"
---
# YouTube Download Feature — Patch Instructions

Apply the four changes below to `main.js` in order.
Each section shows the **exact text to find** and the **replacement text**.

---

## CHANGE 1 — Add download constants (after line 20, after the existing constants block)

**Find:**
```js
const DEFAULT_YOUTUBE_NOTES_FOLDER = 'YouTube Notes';
```

**Replace with:**
```js
const DEFAULT_YOUTUBE_NOTES_FOLDER = 'YouTube Notes';
const DEFAULT_VIDEO_DOWNLOAD_FOLDER = 'YouTube Videos';
const VIDEO_QUALITY_1080 = '1080';
const VIDEO_QUALITY_720  = '720';
const VIDEO_QUALITY_480  = '480';
const VIDEO_QUALITY_BEST = 'best';
```

---

## CHANGE 2 — Add download settings to DEFAULT_SETTINGS

**Find:**
```js
    // --- Timed notes visibility ---
    showTimedNotes: true,
    showSidebarTimedNoteButton: true,
    showWorkspaceTimedNoteButton: true,
};
```

**Replace with:**
```js
    // --- Timed notes visibility ---
    showTimedNotes: true,
    showSidebarTimedNoteButton: true,
    showWorkspaceTimedNoteButton: true,
    // --- Video download settings ---
    videoDownloadFolder: DEFAULT_VIDEO_DOWNLOAD_FOLDER,
    videoDownloadQuality: VIDEO_QUALITY_1080,
    showDownloadButton: true,
};
```

---

## CHANGE 3 — Add download UI button in renderHeader (transcript sidebar)

**Find:**
```js
        const btnContainer = header.createEl('div', { cls: 'yt-transcript__button-container' });

        // ---- Copy all button ----
```

**Replace with:**
```js
        const btnContainer = header.createEl('div', { cls: 'yt-transcript__button-container' });

        // ---- Download video button ----
        if (this.plugin.settings.showDownloadButton !== false) {
            const dlBtn = btnContainer.createEl('button', {
                cls: 'yt-transcript__download-btn',
                attr: {
                    'aria-label': 'Download video (Full HD)',
                    'title': 'Download video locally'
                }
            });
            (0, import_obsidian.setIcon)(dlBtn, 'download');
            dlBtn.createSpan({ text: 'Download' });
            dlBtn.addEventListener('click', () => {
                this.plugin.downloadVideo(url);
            });
        }

        // ---- Copy all button ----
```

---

## CHANGE 4 — Add downloadVideo method to UnifiedPlugin (inside the class, after saveDataState)

**Find:**
```js
    /** Alias used by the Youtnote settings tab path */
    async saveDataState() {
        await this.saveSettings();
    }
```

**Replace with:**
```js
    /** Alias used by the Youtnote settings tab path */
    async saveDataState() {
        await this.saveSettings();
    }

    // ================================================================
    // VIDEO DOWNLOAD
    // ================================================================

    async downloadVideo(url) {
        const { exec } = require('child_process');
        const path = require('path');
        const fs   = require('fs');

        if (!url) {
            new import_obsidian.Notice('No video URL to download.');
            return;
        }

        // Resolve absolute download folder
        const vaultBasePath = this.app.vault.adapter.basePath;
        const relFolder     = this.settings.videoDownloadFolder || DEFAULT_VIDEO_DOWNLOAD_FOLDER;
        const absFolder     = path.isAbsolute(relFolder)
            ? relFolder
            : path.join(vaultBasePath, relFolder);

        // Create folder if needed
        if (!fs.existsSync(absFolder)) {
            try { fs.mkdirSync(absFolder, { recursive: true }); }
            catch (e) {
                new import_obsidian.Notice(`Could not create download folder:\n${absFolder}`);
                return;
            }
        }

        // Build yt-dlp format selector based on quality setting
        const quality = this.settings.videoDownloadQuality || VIDEO_QUALITY_1080;
        let formatArg;
        if (quality === VIDEO_QUALITY_BEST) {
            formatArg = 'bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best';
        } else {
            // e.g. "bestvideo[height<=1080][ext=mp4]+bestaudio[ext=m4a]/best[height<=1080][ext=mp4]"
            formatArg = `bestvideo[height<=${quality}][ext=mp4]+bestaudio[ext=m4a]/best[height<=${quality}][ext=mp4]/best[height<=${quality}]`;
        }

        const outputTemplate = path.join(absFolder, '%(title)s.%(ext)s');
        // Escape single quotes in the URL for shell safety
        const safeUrl = url.replace(/'/g, "'\\''");

        const cmd = `yt-dlp --merge-output-format mp4 -f '${formatArg}' -o '${outputTemplate}' '${safeUrl}'`;

        new import_obsidian.Notice(`⬇️ Downloading video (${quality === VIDEO_QUALITY_BEST ? 'best quality' : quality + 'p'})…\nThis may take a minute.`, 6000);

        exec(cmd, { timeout: 300_000 }, (err, stdout, stderr) => {
            if (err) {
                console.error('[YT Download] Error:', err.message);
                console.error('[YT Download] stderr:', stderr);

                // Friendly error messages
                if (err.message.includes('yt-dlp') && err.message.includes('not found')) {
                    new import_obsidian.Notice(
                        '❌ yt-dlp not found.\n\nInstall it with:\n  brew install yt-dlp\n  or: pip install yt-dlp',
                        10000
                    );
                } else {
                    new import_obsidian.Notice(`❌ Download failed:\n${err.message.slice(0, 200)}`, 8000);
                }
                return;
            }
            new import_obsidian.Notice(`✅ Download complete!\nSaved to: ${relFolder}`, 7000);
        });
    }
```

---

## CHANGE 5 — Add Download settings section in UnifiedSettingTab.display()

**Find:**
```js
        new import_obsidian.Setting(containerEl).setName('Country')
            .addText(t => t.setValue(this.plugin.settings.country)
                .onChange(async v => { this.plugin.settings.country = v; await this.plugin.saveSettings(); }));
    }
}
```

**Replace with:**
```js
        new import_obsidian.Setting(containerEl).setName('Country')
            .addText(t => t.setValue(this.plugin.settings.country)
                .onChange(async v => { this.plugin.settings.country = v; await this.plugin.saveSettings(); }));

        // ---- Video Download section ----
        containerEl.createEl('h3', { text: 'Video Download' });
        containerEl.createEl('p', {
            text: 'Download YouTube videos locally using yt-dlp. Install yt-dlp first: brew install yt-dlp  (macOS) or  pip install yt-dlp  (all platforms).'
        });

        new import_obsidian.Setting(containerEl)
            .setName('Show download button')
            .setDesc('Show the "Download" button in the transcript sidebar header.')
            .addToggle(t => t.setValue(this.plugin.settings.showDownloadButton !== false)
                .onChange(async v => { this.plugin.settings.showDownloadButton = v; await this.plugin.saveSettings(); }));

        new import_obsidian.Setting(containerEl)
            .setName('Download quality')
            .setDesc('Preferred video resolution. Falls back to the next available quality if the selected one is unavailable.')
            .addDropdown(d => d
                .addOption(VIDEO_QUALITY_1080, '1080p Full HD')
                .addOption(VIDEO_QUALITY_720,  '720p HD')
                .addOption(VIDEO_QUALITY_480,  '480p SD')
                .addOption(VIDEO_QUALITY_BEST, 'Best available')
                .setValue(this.plugin.settings.videoDownloadQuality || VIDEO_QUALITY_1080)
                .onChange(async v => { this.plugin.settings.videoDownloadQuality = v; await this.plugin.saveSettings(); }));

        new import_obsidian.Setting(containerEl)
            .setName('Download folder')
            .setDesc('Where downloaded videos are saved. Use an absolute path (e.g. /Users/you/Videos) or a path relative to your vault root.')
            .addText(t => t
                .setPlaceholder(DEFAULT_VIDEO_DOWNLOAD_FOLDER)
                .setValue(this.plugin.settings.videoDownloadFolder || DEFAULT_VIDEO_DOWNLOAD_FOLDER)
                .onChange(async v => {
                    this.plugin.settings.videoDownloadFolder = v.trim() || DEFAULT_VIDEO_DOWNLOAD_FOLDER;
                    await this.plugin.saveSettings();
                }));
    }
}
```
