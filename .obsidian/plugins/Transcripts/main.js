'use strict';

var import_obsidian = require('obsidian');

// ====================================================================
// 1. CONSTANTS
// ====================================================================
const DISPLAY_SIDEBAR = 'sidebar';
const DISPLAY_NOTE = 'note';
const TEMPLATE_MINIMAL = 'minimal';
const TEMPLATE_STANDARD = 'standard';
const TEMPLATE_RICH = 'rich';
const DEFAULT_TIMESTAMP_MOD = 5;
const DEFAULT_TRANSCRIPT_FOLDER = 'Transcripts';

const YOUTUBE_TITLE_REGEX = /<meta\s+name="title"\s+content="([^"]*)\">/;
const YOUTUBE_VIDEOID_REGEX = /<link\s+rel="canonical"\s+href="([^"]*)\">/;

const VIEW_TYPE_YTRANSCRIPT = 'transcript-view';

// ====================================================================
// 2. ERROR CLASS
// ====================================================================
class YoutubeTranscriptError extends Error {
    constructor(err) {
        if (!(err instanceof Error)) {
            super('');
            return;
        }
        if (err.message.includes('ERR_INVALID_URL')) {
            super('Invalid YouTube URL');
        } else {
            super(err.message);
        }
    }
}

// ====================================================================
// 3. XML / HTML UTILS
// ====================================================================
function decodeHtmlEntities(text) {
    return text
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/&apos;/g, "'")
        .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(parseInt(code, 10)))
        .replace(/&#x([a-fA-F0-9]+);/g, (_, code) => String.fromCharCode(parseInt(code, 16)))
        .replace(/\n/g, ' ')
        .trim();
}

function parseTranscriptXml(xmlContent) {
    const lines = [];
    // Primary pattern: <text start="..." dur="...">
    const textMatches = xmlContent.matchAll(/<text\s+start="([^"]+)"\s+dur="([^"]+)"[^>]*>([\s\S]*?)<\/text>/g);
    for (const match of textMatches) {
        const startSeconds = parseFloat(match[1]);
        const durationSeconds = parseFloat(match[2]);
        const text = decodeHtmlEntities(match[3].replace(/<[^>]+>/g, ''));
        if (text) {
            lines.push({
                text,
                offset: Math.round(startSeconds * 1e3),
                duration: Math.round(durationSeconds * 1e3)
            });
        }
    }
    // Fallback: <p t="..." d="..."> (older transcripts)
    if (lines.length === 0) {
        const pMatches = xmlContent.matchAll(/<p\s+t="(\d+)"\s+d="(\d+)"[^>]*>([\s\S]*?)<\/p>/g);
        for (const match of pMatches) {
            const offset = parseInt(match[1], 10);
            const duration = parseInt(match[2], 10);
            const text = decodeHtmlEntities(match[3].replace(/<[^>]+>/g, ''));
            if (text) {
                lines.push({ text, offset, duration });
            }
        }
    }
    return lines;
}

// ====================================================================
// 4. CHAPTER EXTRACTION
// ====================================================================
function extractChapters(playerData) {
    // 4.1 Try engagement panels (most common)
    const engagementPanels = playerData?.engagementPanels;
    if (engagementPanels) {
        const macroMarkersPanel = engagementPanels.find(p => p.macroMarkersListRenderer);
        if (macroMarkersPanel) {
            const markers = macroMarkersPanel.macroMarkersListRenderer.contents;
            return markers.map(marker => {
                const renderer = marker.macroMarkersListItemRenderer;
                return {
                    title: renderer.title.simpleText,
                    startMillis: parseFloat(renderer.timeRangeStartMillis)
                };
            });
        }
    }

    // 4.2 Fallback: parse description (standard timestamps like "0:00 - Intro")
    const description = playerData?.videoDetails?.shortDescription;
    if (description) {
        return extractChaptersFromDescription(description);
    }

    return [];
}

function extractChaptersFromDescription(description) {
    const lines = description.split('\n');
    const chapters = [];
    const regex = /^(\d{1,2}):(\d{2})(?::(\d{2}))?\s*[-–—]?\s*(.+)/;
    for (const line of lines) {
        const match = line.trim().match(regex);
        if (match) {
            const h = match[3] ? parseInt(match[1]) : 0;
            const m = match[3] ? parseInt(match[2]) : parseInt(match[1]);
            const s = match[3] ? parseInt(match[3]) : parseInt(match[2]);
            const title = match[4].trim();
            chapters.push({ title, startMillis: (h * 3600 + m * 60 + s) * 1000 });
        }
    }
    return chapters;
}

function assignLinesToChapters(lines, chapters) {
    if (!chapters.length) {
        return lines.map(line => ({ ...line, chapterTitle: '' }));
    }
    const sorted = [...chapters].sort((a, b) => a.startMillis - b.startMillis);
    const INF = Number.MAX_SAFE_INTEGER;
    return lines.map(line => {
        let chapterTitle = '';
        for (let i = sorted.length - 1; i >= 0; i--) {
            if (line.offset >= sorted[i].startMillis) {
                chapterTitle = sorted[i].title;
                break;
            }
        }
        return { ...line, chapterTitle };
    });
}

// ====================================================================
// 5. YOUTUBE TRANSCRIPT API (WITH CHAPTERS & USER API KEY)
// ====================================================================
class YoutubeTranscript {
    static setApiKey(apiKey) {
        this._apiKey = apiKey;
        this._playerUrl = `https://www.youtube.com/youtubei/v1/player?key=${apiKey || ''}`;
    }

    static getApiKey() {
        return this._apiKey || '';
    }

    static fetchTranscript(url, config) {
        if (!this._playerUrl) {
            this._playerUrl = `https://www.youtube.com/youtubei/v1/player?key=${this.getApiKey()}`;
        }
        return this._fetchTranscriptImpl(url, config);
    }
}

YoutubeTranscript._playerUrl = '';
YoutubeTranscript.INNERTUBE_CONTEXT = {
    client: {
        clientName: "IOS",
        clientVersion: "20.10.38",
        hl: "en",
        gl: "US"
    }
};

YoutubeTranscript._fetchTranscriptImpl = async function(url, config) {
    try {
        const videoId = this.extractVideoIdFromUrl(url);
        if (!videoId) {
            throw new YoutubeTranscriptError(new Error('Invalid YouTube URL - could not extract video ID'));
        }

        console.log(`🎬 Fetching transcript for video: ${videoId}`);
        const playerData = await this.fetchPlayerData(videoId, config);
        const title = playerData?.videoDetails?.title || 'Unknown';
        const captionsData = playerData?.captions?.playerCaptionsTracklistRenderer;
        if (!captionsData?.captionTracks) {
            throw new YoutubeTranscriptError(new Error('No captions available for this video'));
        }

        const langCode = config?.lang || 'en';
        const captionTrack = this.findCaptionTrack(captionsData.captionTracks, langCode);
        if (!captionTrack) {
            const availableLangs = captionsData.captionTracks.map(t => t.languageCode).join(', ');
            throw new YoutubeTranscriptError(new Error(`No transcript found for language '${langCode}'. Available: ${availableLangs}`));
        }

        const transcriptUrl = captionTrack.baseUrl;
        const lines = await this.fetchTranscriptFromUrl(transcriptUrl);

        // Chapters
        const chapters = extractChapters(playerData);
        const linesWithChapters = assignLinesToChapters(lines, chapters);

        return {
            title: this.decodeHTML(title),
            lines: linesWithChapters,
            chapters
        };
    } catch (err) {
        if (err instanceof YoutubeTranscriptError) throw err;
        throw new YoutubeTranscriptError(err);
    }
};

YoutubeTranscript.extractVideoIdFromUrl = function(url) {
    const patterns = [
        /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/v\/)([a-zA-Z0-9_-]{11})/,
        /^([a-zA-Z0-9_-]{11})$/
    ];
    for (const pattern of patterns) {
        const match = url.match(pattern);
        if (match) return match[1];
    }
    return null;
};

YoutubeTranscript.fetchPlayerData = async function(videoId, config) {
    const context = {
        ...this.INNERTUBE_CONTEXT,
        client: {
            ...this.INNERTUBE_CONTEXT.client,
            hl: config?.lang || 'en',
            gl: config?.country || 'US'
        }
    };
    const requestBody = { context, videoId };

    if (!this._playerUrl) {
        this._playerUrl = `https://www.youtube.com/youtubei/v1/player?key=${this.getApiKey()}`;
    }

    const response = await (0, import_obsidian.requestUrl)({
        url: this._playerUrl,
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'User-Agent': 'com.google.ios.youtube/20.10.38 (iPhone16,2; U; CPU iOS 17_5_1 like Mac OS X)'
        },
        body: JSON.stringify(requestBody)
    });
    const data = JSON.parse(response.text);
    const playabilityStatus = data.playabilityStatus;
    if (playabilityStatus) {
        console.log(`📊 Playability status: ${playabilityStatus.status}`);
        if (playabilityStatus.status === 'ERROR') {
            throw new Error(playabilityStatus.reason || 'Video unavailable');
        }
        if (playabilityStatus.status === 'LOGIN_REQUIRED') {
            throw new Error('This video requires login to view');
        }
        if (playabilityStatus.status === 'UNPLAYABLE') {
            throw new Error(playabilityStatus.reason || 'Video is unplayable');
        }
    }
    return data;
};

YoutubeTranscript.findCaptionTrack = function(captionTracks, langCode) {
    let track = captionTracks.find(t => t.languageCode === langCode);
    if (track) return track;
    track = captionTracks.find(t => t.languageCode.startsWith(langCode + '-'));
    if (track) return track;
    track = captionTracks.find(t => langCode.startsWith(t.languageCode + '-'));
    if (track) return track;
    if (captionTracks.length > 0) {
        console.log(`⚠️ Language '${langCode}' not found, falling back to '${captionTracks[0].languageCode}'`);
        return captionTracks[0];
    }
    return null;
};

YoutubeTranscript.fetchTranscriptFromUrl = async function(transcriptUrl) {
    const response = await (0, import_obsidian.requestUrl)({
        url: transcriptUrl,
        method: 'GET',
        headers: { 'Accept-Language': 'en-US,en;q=0.9' }
    });
    if (response.text.length === 0) {
        throw new Error('Received empty transcript response');
    }
    return parseTranscriptXml(response.text);
};

YoutubeTranscript.decodeHTML = function(text) {
    return text
        .replace(/&#39;/g, "'")
        .replace(/&amp;/g, '&')
        .replace(/&quot;/g, '"')
        .replace(/&apos;/g, "'")
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(parseInt(code, 10)))
        .replace(/\\n/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
};

// ====================================================================
// 6. TIMESTAMP UTILS
// ====================================================================
function millisecondsToTimestamp(ms) {
    if (ms < 0) return '00:00';
    const pad = n => String(Math.floor(n)).padStart(2, '0');
    const s = 1000;
    const m = 60 * s;
    const h = 60 * m;
    const hours = Math.floor(ms / h);
    const minutes = Math.floor((ms - hours * h) / m);
    const seconds = Math.floor((ms - hours * h - minutes * m) / s);
    const parts = hours ? [hours, minutes, seconds] : [minutes, seconds];
    return parts.map(pad).join(':');
}

// ====================================================================
// 7. TRANSCRIPT BLOCK GROUPING
// ====================================================================
function groupTranscriptByInterval(lines, intervalMs) {
    const blocks = [];
    let currentQuote = '';
    let currentOffset = 0;
    lines.forEach((line, index) => {
        if (index === 0) {
            currentOffset = line.offset;
            currentQuote = line.text + ' ';
            return;
        }
        if (index % intervalMs === 0) {
            blocks.push({
                quote: currentQuote.trim(),
                quoteTimeOffset: currentOffset,
                chapterTitle: line.chapterTitle || ''
            });
            currentQuote = '';
            currentOffset = line.offset;
        }
        currentQuote += line.text + ' ';
    });
    if (currentQuote.trim() !== '') {
        blocks.push({
            quote: currentQuote.trim(),
            quoteTimeOffset: currentOffset,
            chapterTitle: lines[lines.length - 1]?.chapterTitle || ''
        });
    }
    return blocks;
}

// ====================================================================
// 8. SAFE HIGHLIGHTING (NO innerHTML)
// ====================================================================
function applySafeSearchHighlight(containerElement, searchTerm) {
    if (!searchTerm) return;
    const treeWalker = document.createTreeWalker(containerElement, NodeFilter.SHOW_TEXT);
    const textNodes = [];
    while (treeWalker.nextNode()) {
        textNodes.push(treeWalker.currentNode);
    }
    const lowerTerm = searchTerm.toLowerCase();
    textNodes.forEach(node => {
        const parent = node.parentNode;
        if (!parent) return;
        const text = node.textContent;
        const lowerText = text.toLowerCase();
        if (!lowerText.includes(lowerTerm)) return;

        const fragment = document.createDocumentFragment();
        let lastIndex = 0;
        let idx = lowerText.indexOf(lowerTerm);
        while (idx !== -1) {
            if (idx > lastIndex) {
                fragment.appendChild(document.createTextNode(text.slice(lastIndex, idx)));
            }
            const mark = document.createElement('span');
            mark.className = 'yt-transcript__highlight';
            mark.textContent = text.slice(idx, idx + searchTerm.length);
            fragment.appendChild(mark);
            lastIndex = idx + searchTerm.length;
            idx = lowerText.indexOf(lowerTerm, lastIndex);
        }
        if (lastIndex < text.length) {
            fragment.appendChild(document.createTextNode(text.slice(lastIndex)));
        }
        parent.replaceChild(fragment, node);
    });
}

// ====================================================================
// 9. TRANSCRIPT FORMATTER (WITH CHAPTERS, INCLUDING MINIMAL WITH CHAPTERS)
// ====================================================================
class TranscriptFormatter {
    static format(transcript, url, options) {
        if (!transcript?.lines?.length) return '';
        const normalized = this._normalizeOptions(options);
        switch (normalized.template) {
            case TEMPLATE_MINIMAL:
                return this._formatMinimal(transcript, normalized);
            case TEMPLATE_STANDARD:
                return this._formatStandard(transcript, url, normalized);
            case TEMPLATE_RICH:
                return this._formatRich(transcript, url, normalized);
            default:
                return this._formatStandard(transcript, url, normalized);
        }
    }

    static _normalizeOptions(options) {
        return {
            timestampMod: Math.max(1, Math.floor(options?.timestampMod)) || DEFAULT_TIMESTAMP_MOD,
            template: options?.template || TEMPLATE_STANDARD,
            showChapters: options?.showChapters !== undefined ? options.showChapters : true
        };
    }

    static _formatMinimal(transcript, options) {
        const lines = transcript.lines.filter(line => line.text.trim().length > 0);
        if (!options.showChapters || !transcript.chapters?.length) {
            return lines.map(line => line.text.trim()).join(' ');
        }
        const chapterMap = new Map();
        lines.forEach(line => {
            const chapter = line.chapterTitle || 'No Chapter';
            if (!chapterMap.has(chapter)) chapterMap.set(chapter, []);
            chapterMap.get(chapter).push(line.text.trim());
        });
        let output = '';
        for (const [chapter, texts] of chapterMap.entries()) {
            output += `#### ${chapter}\n\n`;
            output += texts.join(' ') + '\n\n';
        }
        return output.trim();
    }

    static _formatStandard(transcript, url, options) {
        const blocks = groupTranscriptByInterval(transcript.lines, options.timestampMod);
        if (blocks.length === 0) return '';
        return this._formatBlocksWithChapters(blocks, url, options.showChapters);
    }

    static _formatRich(transcript, url, options) {
        const title = transcript.title?.trim() || 'YouTube Transcript';
        const today = new Date().toISOString().split('T')[0];
        const header = [
            `### ${title}`,
            '',
            `#### Watch The Video`,
            `![](${url})`,
            '',
            `#### About The Video`,
            `**VeTitle**: *${title}*`,
            `**Source**: ${url}`,
            `**Retrieved**: **🗓️ ${today}**`,
            '',
            `#### The Content`,
            ''
        ].join('\n');
        const body = this._formatStandard(transcript, url, options);
        return header + body;
    }

    static _formatBlocksWithChapters(blocks, url, showChapters) {
        if (!showChapters) {
            return blocks.map(block => this._formatBlock(block, url)).join('\n');
        }
        const chapterMap = new Map();
        blocks.forEach(block => {
            const chapter = block.chapterTitle || 'No Chapter';
            if (!chapterMap.has(chapter)) chapterMap.set(chapter, []);
            chapterMap.get(chapter).push(block);
        });
        let output = '';
        for (const [chapter, chapterBlocks] of chapterMap.entries()) {
            output += `#### ${chapter}\n\n`;
            chapterBlocks.forEach(block => {
                output += this._formatBlock(block, url) + '\n\n';
            });
            output += '\n';
        }
        return output.trim();
    }

    static _formatBlock(block, url) {
        const timestampStr = millisecondsToTimestamp(block.quoteTimeOffset);
        const timestampUrl = url ? URLDetector.buildTimestampUrl(url, block.quoteTimeOffset) : '#';
        return `###### [${timestampStr}](${timestampUrl})\n${block.quote}`;
    }
}

// ====================================================================
// 10. URL DETECTION & CLEANING
// ====================================================================
class URLDetector {
    static cleanYouTubeUrl(url) {
        if (!url || typeof url !== 'string') return url;
        try {
            const urlObj = new URL(url);
            if (urlObj.searchParams.has('si')) {
                urlObj.searchParams.delete('si');
                if (urlObj.searchParams.toString() === '') {
                    urlObj.search = '';
                }
                return urlObj.toString();
            }
            return url;
        } catch {
            return url.replace(/\?si=[^&]*(?:&|$)/, '').replace(/\?$/, '');
        }
    }

    static isValidYouTubeUrl(url) {
        if (!url) return false;
        const cleaned = this.cleanYouTubeUrl(url);
        try {
            const urlObj = new URL(cleaned);
            const hostname = urlObj.hostname.toLowerCase();
            if (!this.YOUTUBE_DOMAINS.includes(hostname)) return false;
            if (hostname.includes('youtube.com')) {
                return urlObj.pathname === '/watch' && urlObj.searchParams.has('v');
            }
            if (hostname.includes('youtu.be')) {
                const parts = urlObj.pathname.split('/');
                return parts.length >= 2 && parts[1].length > 0;
            }
            return false;
        } catch {
            return false;
        }
    }

    static extractYouTubeUrlFromText(text) {
        if (!text) return null;
        const urlRegex = /https?:\/\/[^\s<>"{}|\\^`[\]]+/gi;
        const matches = text.match(urlRegex);
        if (!matches) return null;
        for (const match of matches) {
            const cleaned = this.cleanYouTubeUrl(match);
            if (this.isValidYouTubeUrl(cleaned)) return cleaned;
        }
        return null;
    }

    static buildTimestampUrl(url, offsetMs) {
        try {
            const urlObj = new URL(url);
            urlObj.searchParams.set('t', Math.max(0, Math.floor(offsetMs / 1000)).toString());
            return urlObj.toString();
        } catch {
            return url;
        }
    }
}
URLDetector.YOUTUBE_DOMAINS = [
    'youtube.com', 'www.youtube.com', 'm.youtube.com', 'mobile.youtube.com',
    'music.youtube.com', 'youtu.be', 'www.youtu.be'
];

// ====================================================================
// 11. PROMPT MODAL
// ====================================================================
class YouTubeUrlPromptModal extends import_obsidian.Modal {
    constructor(initialValue) {
        super(app);
        this.submitted = false;
        this.initialValue = initialValue || '';
        this.value = this.initialValue;
    }

    onOpen() {
        this.titleEl.setText('YouTube URL');
        const textInput = new import_obsidian.TextComponent(this.contentEl);
        textInput.inputEl.style.width = '100%';
        textInput.setValue(this.initialValue);
        textInput.onChange(value => this.value = value);
        textInput.inputEl.focus();
        textInput.inputEl.select();

        textInput.inputEl.addEventListener('keydown', evt => {
            if (evt.key === 'Enter') {
                evt.preventDefault();
                this.resolveAndClose();
            }
        });

        const buttonDiv = this.modalEl.createDiv({ cls: 'modal-button-container' });
        new import_obsidian.ButtonComponent(buttonDiv)
            .setButtonText('Submit')
            .setCta()
            .onClick(() => this.resolveAndClose());
    }

    resolveAndClose() {
        this.submitted = true;
        this.close();
    }

    onClose() {
        this.contentEl.empty();
        if (this.submitted) {
            this.resolve?.(this.value.trim());
        } else {
            this.resolve?.(null);
        }
    }

    openAndGetValue(resolve) {
        this.resolve = resolve;
        this.open();
    }
}

// ====================================================================
// 12. EDITOR HELPERS
// ====================================================================
class EditorExtensions {
    static getSelectedText(editor) {
        if (!editor.somethingSelected()) {
            const wordBoundaries = this.getWordBoundaries(editor);
            editor.setSelection(wordBoundaries[0], wordBoundaries[1]);
        }
        return editor.getSelection();
    }

    static getWordBoundaries(editor) {
        const cursor = editor.getCursor();
        const lineText = editor.getLine(cursor.line);
        const urlRegex = /https?:\/\/\S+/gi;
        let match;
        while ((match = urlRegex.exec(lineText)) !== null) {
            if (cursor.ch >= match.index && cursor.ch <= match.index + match[0].length) {
                return [
                    { line: cursor.line, ch: match.index },
                    { line: cursor.line, ch: match.index + match[0].length }
                ];
            }
        }
        return [
            { line: cursor.line, ch: 0 },
            { line: cursor.line, ch: lineText.length }
        ];
    }
}

// ====================================================================
// 13. INSERT TRANSCRIPT COMMAND
// ====================================================================
class InsertTranscriptCommand {
    constructor(plugin) {
        this.plugin = plugin;
    }

    async execute(editor) {
        await this._executeWithOptions(editor, {});
    }

    async _executeWithOptions(editor, options) {
        try {
            const url = await this._promptForYouTubeUrl(editor);
            if (!url || !URLDetector.isValidYouTubeUrl(url)) return;

            const transcript = await YoutubeTranscript.fetchTranscript(url, {
                lang: this.plugin.settings.lang,
                country: this.plugin.settings.country
            });
            if (!transcript?.lines?.length) {
                new import_obsidian.Notice('No transcript found for this video.');
                return;
            }

            const formatOptions = {
                template: options.template || TEMPLATE_STANDARD,
                timestampMod: options.timestampMod || this.plugin.settings.timestampMod || DEFAULT_TIMESTAMP_MOD,
                showChapters: this.plugin.settings.showChapters !== false
            };
            const formatted = TranscriptFormatter.format(transcript, url, formatOptions);
            if (!formatted) return;

            const cursor = editor.getCursor();
            editor.replaceRange(formatted, cursor);
            new import_obsidian.Notice('Transcript inserted.');
        } catch (err) {
            new import_obsidian.Notice(`Error: ${err.message}`);
        }
    }

    async _promptForYouTubeUrl(editor) {
        const detected = await this._detectUrl(editor);
        const modal = new YouTubeUrlPromptModal(detected);
        const result = await new Promise(resolve => modal.openAndGetValue(resolve));
        if (!result) return null;
        return URLDetector.cleanYouTubeUrl(result);
    }

    async _detectUrl(editor) {
        if (editor.somethingSelected()) {
            const sel = editor.getSelection();
            const url = URLDetector.extractYouTubeUrlFromText(sel);
            if (url) return url;
        }
        try {
            const clip = await navigator.clipboard.readText();
            const clipUrl = URLDetector.extractYouTubeUrlFromText(clip);
            if (clipUrl) return clipUrl;
        } catch { /* ignore */ }
        return null;
    }
}

// ====================================================================
// 14. TRANSCRIPT VIEW (SIDEBAR) – ICONS FIXED
// ====================================================================
class TranscriptView extends import_obsidian.ItemView {
    constructor(leaf, plugin) {
        super(leaf);
        this.plugin = plugin;
        this.isDataLoaded = false;
        this.dataContainerEl = null;
        this.loaderContainerEl = null;
        this.errorContainerEl = null;
    }

    getViewType() { return VIEW_TYPE_YTRANSCRIPT; }
    getDisplayText() { return 'YouTube Transcript'; }
    getIcon() { return 'scroll'; }

    async onOpen() {
        this.contentEl.empty();
        this.contentEl.createEl('h4', { text: 'Transcript' });
    }

    async onClose() {
        const leafIndex = this.getLeafIndex();
        this.plugin.settings.leafUrls.splice(leafIndex, 1);
        await this.plugin.saveSettings();
    }

    getLeafIndex() {
        return this.app.workspace.getLeavesOfType(VIEW_TYPE_YTRANSCRIPT)
            .findIndex(leaf => leaf === this.leaf);
    }

    renderLoader() {
        if (this.loaderContainerEl) {
            this.loaderContainerEl.empty();
            this.loaderContainerEl.createEl('div', { text: 'Loading...' });
        }
    }

    renderVideoTitle(title) {
        const el = this.contentEl.createEl('div', { cls: 'yt-transcript__title' });
        el.textContent = title;
        el.style.fontWeight = 'bold';
        el.style.marginBottom = '20px';
    }

    renderHeader(url, data, timestampMod) {
        const header = this.contentEl.createEl('div', { cls: 'yt-transcript__header' });

        if (this.plugin.settings.showSearchBar) {
            const searchInput = header.createEl('input', {
                cls: 'yt-transcript__search-input',
                type: 'text',
                placeholder: 'Search...'
            });
            searchInput.addEventListener('input', e => {
                this.renderTranscriptBlocks(url, data, timestampMod, e.target.value);
            });
        }

        const btnContainer = header.createEl('div', { cls: 'yt-transcript__button-container' });

        // ---- Copy all button ----
        if (this.plugin.settings.showCopyAllButton) {
            const copyBtn = btnContainer.createEl('button', {
                cls: 'yt-transcript__icon-button',
                attr: { 'aria-label': 'Copy transcript', 'title': 'Copy transcript' }
            });
            (0, import_obsidian.setIcon)(copyBtn, 'copy');
            copyBtn.addEventListener('click', () => this.copyFullTranscript(url, data, timestampMod));
        }

        // ---- Create note button ----
        if (this.plugin.settings.showCreateNoteButton) {
            const noteBtn = btnContainer.createEl('button', {
                cls: 'yt-transcript__icon-button',
                attr: { 'aria-label': 'Create new note with transcript', 'title': 'Create new note with transcript' }
            });
            (0, import_obsidian.setIcon)(noteBtn, 'file-plus');
            noteBtn.addEventListener('click', () => this.createOrOpenTranscriptNote(url, data, timestampMod));
        }
    }

    async renderTranscriptBlocks(url, data, timestampMod, searchTerm = '') {
        if (!this.dataContainerEl) return;
        this.dataContainerEl.empty();

        const blocks = groupTranscriptByInterval(data.lines, timestampMod);
        const filtered = blocks.filter(b => b.quote.toLowerCase().includes(searchTerm.toLowerCase()));

        let currentChapter = null;
        filtered.forEach(block => {
            if (block.chapterTitle && block.chapterTitle !== currentChapter) {
                currentChapter = block.chapterTitle;
                const chHeading = this.dataContainerEl.createEl('h4', { cls: 'yt-transcript__chapter' });
                chHeading.textContent = currentChapter;
            }

            const blockEl = this.dataContainerEl.createEl('div', { cls: 'yt-transcript__transcript-block' });
            blockEl.draggable = true;

            const link = blockEl.createEl('a', {
                text: millisecondsToTimestamp(block.quoteTimeOffset),
                href: URLDetector.buildTimestampUrl(url, block.quoteTimeOffset)
            });
            link.style.marginBottom = '5px';

            const span = blockEl.createEl('span', { text: block.quote, title: 'Click to copy' });
            span.addEventListener('click', () => {
                navigator.clipboard.writeText(block.quote);
                new import_obsidian.Notice('Copied to clipboard');
            });

            applySafeSearchHighlight(span, searchTerm);

            blockEl.addEventListener('dragstart', e => {
                e.dataTransfer.setData('text/html', blockEl.innerHTML);
            });

            blockEl.addEventListener('contextmenu', e => {
                const menu = new import_obsidian.Menu();
                menu.addItem(item => item.setTitle('Copy block').onClick(() => {
                    navigator.clipboard.writeText(block.quote);
                }));
                menu.showAtPosition({ x: e.clientX, y: e.clientY });
            });
        });

        if (filtered.length === 0 && searchTerm) {
            this.dataContainerEl.createEl('div', {
                text: `No results found for "${searchTerm}"`,
                cls: 'yt-transcript__no-results'
            });
        }
    }

    async copyFullTranscript(url, data, timestampMod) {
        const blocks = groupTranscriptByInterval(data.lines, timestampMod);
        const formatted = TranscriptFormatter._formatBlocksWithChapters(blocks, url, true);
        await navigator.clipboard.writeText(formatted);
        new import_obsidian.Notice('Transcript copied to clipboard');
    }

    async createOrOpenTranscriptNote(url, data, timestampMod) {
        const folder = this.plugin.settings.transcriptFolder || DEFAULT_TRANSCRIPT_FOLDER;
        await this._ensureFolderExists(folder);
        const safeTitle = (data.title || 'Untitled').replace(/[\\/:*?"<>|#]/g, '-').trim();
        const fileName = `${folder}/${safeTitle} - Transcript.md`;
        const today = new Date().toISOString().split('T')[0];
        const content = `### ${data.title}\n\n` +
            `#### Watch The Video\n![](${url})\n\n` +
            `#### About The Video\n**VeTitle**: *${data.title}*\n**Source**: ${url}\n**Retrieved**: **🗓️ ${today}**\n\n` +
            `#### The Content\n` +
            TranscriptFormatter._formatStandard(data, url, { timestampMod, showChapters: true });

        try {
            const existing = this.app.vault.getAbstractFileByPath(fileName);
            if (existing) {
                await this.app.workspace.getLeaf(false).openFile(existing);
                new import_obsidian.Notice('Transcript note already exists. Opening...');
            } else {
                const file = await this.app.vault.create(fileName, content);
                await this.app.workspace.getLeaf(false).openFile(file);
                new import_obsidian.Notice(`Created transcript note: ${fileName}`);
            }
        } catch (e) {
            new import_obsidian.Notice('Error creating note: ' + e.message);
        }
    }

    async _ensureFolderExists(folderPath) {
        if (!this.app.vault.getAbstractFileByPath(folderPath)) {
            await this.app.vault.createFolder(folderPath);
        }
    }

    async setEphemeralState(state) {
        if (this.isDataLoaded) return;
        const leafIndex = this.getLeafIndex();
        let cleanUrl = state.url ? URLDetector.cleanYouTubeUrl(state.url) : state.url;
        if (cleanUrl) {
            this.plugin.settings.leafUrls[leafIndex] = cleanUrl;
            await this.plugin.saveSettings();
        }
        const { lang, country, timestampMod, leafUrls } = this.plugin.settings;
        const url = leafUrls[leafIndex];
        try {
            if (!this.loaderContainerEl) {
                this.loaderContainerEl = this.contentEl.createEl('div');
            }
            this.renderLoader();

            const data = await YoutubeTranscript.fetchTranscript(url, { lang, country });
            if (!data) throw new Error('No data');

            this.isDataLoaded = true;
            this.loaderContainerEl.empty();
            this.renderVideoTitle(data.title);
            this.renderHeader(url, data, timestampMod);

            if (!this.dataContainerEl) {
                this.dataContainerEl = this.contentEl.createEl('div');
            } else {
                this.dataContainerEl.empty();
            }

            if (this.errorContainerEl) this.errorContainerEl.empty();

            if (!data.lines.length) {
                this.dataContainerEl.createEl('h4', { text: 'No transcript found' });
                this.dataContainerEl.createEl('div', {
                    text: 'Adjust language/country in settings or try a different video.'
                });
            } else {
                this.renderTranscriptBlocks(url, data, timestampMod);
            }
        } catch (err) {
            if (this.loaderContainerEl) this.loaderContainerEl.empty();
            if (!this.errorContainerEl) {
                this.errorContainerEl = this.contentEl.createEl('h5');
            } else {
                this.errorContainerEl.empty();
            }
            this.errorContainerEl.createEl('div', { text: 'Error loading transcript' });
            const msgEl = this.errorContainerEl.createEl('div', {
                text: err.message || 'Unknown error',
                style: 'color: var(--text-muted); font-size: var(--font-ui-small)'
            });
        }
    }
}

// ====================================================================
// 15. PLUGIN MAIN
// ====================================================================
const DEFAULT_SETTINGS = {
    timestampMod: DEFAULT_TIMESTAMP_MOD,
    lang: 'en',
    country: 'EN',
    leafUrls: [],
    displayLocation: DISPLAY_SIDEBAR,
    autoExtract: false,
    showSearchBar: true,
    showCopyAllButton: true,
    showCreateNoteButton: true,
    transcriptFolder: DEFAULT_TRANSCRIPT_FOLDER,
    apiKey: '',
    showChapters: true
};

class YTranscriptPlugin extends import_obsidian.Plugin {
    async onload() {
        await this.loadSettings();
        YoutubeTranscript.setApiKey(this.settings.apiKey);

        this.insertTranscriptCmd = new InsertTranscriptCommand(this);
        this.modifyTimeout = null;
        this.processedFiles = new Set();

        this.registerView(VIEW_TYPE_YTRANSCRIPT, leaf => new TranscriptView(leaf, this));

        // --- Commands ---
        this.addCommand({
            id: 'transcript-from-text',
            name: 'Get YouTube transcript from selected url',
            editorCallback: (editor) => {
                let url = EditorExtensions.getSelectedText(editor).trim();
                url = URLDetector.cleanYouTubeUrl(url);
                this.openTranscript(url);
            }
        });

        this.addCommand({
            id: 'transcript-from-prompt',
            name: 'Get YouTube transcript from url prompt',
            callback: async () => {
                const modal = new YouTubeUrlPromptModal();
                modal.openAndGetValue(url => {
                    if (url) this.openTranscript(URLDetector.cleanYouTubeUrl(url));
                });
            }
        });

        this.addCommand({
            id: 'insert-youtube-transcript',
            name: 'Insert YouTube transcript',
            editorCallback: async (editor) => {
                await this.insertTranscriptCmd.execute(editor);
            }
        });

        this.addCommand({
            id: 'open-transcript-in-sidebar',
            name: 'Open transcript in sidebar (force sidebar)',
            editorCallback: (editor) => {
                let url = EditorExtensions.getSelectedText(editor).trim();
                this.forceSidebarTranscript(URLDetector.cleanYouTubeUrl(url));
            }
        });

        this.addCommand({
            id: 'insert-transcript-under-link',
            name: 'Insert transcript under link',
            editorCallback: async (editor) => {
                await this.insertTranscriptUnderLink(editor);
            }
        });

        // "No timeline" command – now respects chapters
        this.addCommand({
            id: 'create-transcript-note-from-prompt',
            name: 'Create transcript note from URL prompt (no timestamps)',
            callback: async () => {
                const modal = new YouTubeUrlPromptModal();
                modal.openAndGetValue(async (rawUrl) => {
                    if (!rawUrl) return;
                    const url = URLDetector.cleanYouTubeUrl(rawUrl);
                    if (!URLDetector.isValidYouTubeUrl(url)) {
                        new import_obsidian.Notice('Invalid YouTube URL');
                        return;
                    }
                    try {
                        const transcript = await YoutubeTranscript.fetchTranscript(url, {
                            lang: this.settings.lang,
                            country: this.settings.country
                        });
                        const formatted = TranscriptFormatter.format(transcript, url, {
                            template: TEMPLATE_MINIMAL,
                            showChapters: this.settings.showChapters
                        });
                        const safeTitle = (transcript.title || 'Untitled').replace(/[\\/:*?"<>|#]/g, '-').trim();
                        const folder = this.settings.transcriptFolder || DEFAULT_TRANSCRIPT_FOLDER;
                        await this._ensureFolder(folder);
                        const fileName = `${folder}/${safeTitle} - Transcript (no timestamps).md`;
                        const today = new Date().toISOString().split('T')[0];
                        const content = `### ${transcript.title}\n\n` +
                            `#### About The Video\n**VeTitle**: *${transcript.title}*\n**Source**: ${url}\n**Retrieved**: **🗓️${today}**\n\n` +
                            `#### Transcript\n${formatted}`;
                        const existing = this.app.vault.getAbstractFileByPath(fileName);
                        if (existing) {
                            new import_obsidian.Notice(`Transcript already exists at: ${fileName}`);
                            const leaf = this.app.workspace.getLeaf(false);
                            await leaf.openFile(existing);
                        } else {
                            const file = await this.app.vault.create(fileName, content);
                            new import_obsidian.Notice(`Created new transcript note: ${fileName}`);
                            const leaf = this.app.workspace.getLeaf(false);
                            await leaf.openFile(file);
                        }
                    } catch (err) {
                        new import_obsidian.Notice(`Error: ${err.message || 'Failed'}`);
                    }
                });
            }
        });

        // Auto‑extract on file modification
        this.registerEvent(
            this.app.vault.on('modify', (file) => {
                if (file.extension === 'md') {
                    clearTimeout(this.modifyTimeout);
                    this.modifyTimeout = setTimeout(() => {
                        this._processAutoExtractForFile(file);
                    }, 1000);
                }
            })
        );

        this.addSettingTab(new YTranscriptSettingTab(this.app, this));
    }

    onunload() {
        this.app.workspace.detachLeavesOfType(VIEW_TYPE_YTRANSCRIPT);
        clearTimeout(this.modifyTimeout);
    }

    async loadSettings() {
        this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    }

    async saveSettings() {
        await this.saveData(this.settings);
        YoutubeTranscript.setApiKey(this.settings.apiKey);
    }

    openTranscript(url) {
        if (this.settings.displayLocation === DISPLAY_NOTE) {
            this._insertTranscriptInActiveNote(url);
        } else {
            this.forceSidebarTranscript(url);
        }
    }

    async _insertTranscriptInActiveNote(url) {
        const view = this.app.workspace.getActiveViewOfType(import_obsidian.MarkdownView);
        if (!view) {
            new import_obsidian.Notice('No active note found');
            return;
        }
        const editor = view.editor;
        const transcript = await YoutubeTranscript.fetchTranscript(url, {
            lang: this.settings.lang,
            country: this.settings.country
        });
        const formatted = TranscriptFormatter.format(transcript, url, {
            template: TEMPLATE_RICH,
            timestampMod: this.settings.timestampMod,
            showChapters: this.settings.showChapters
        });
        editor.replaceRange(formatted, editor.getCursor());
        new import_obsidian.Notice('Transcript inserted in note');
    }

    forceSidebarTranscript(url) {
        const leaf = this.app.workspace.getRightLeaf(false);
        leaf.setViewState({ type: VIEW_TYPE_YTRANSCRIPT });
        this.app.workspace.revealLeaf(leaf);
        leaf.setEphemeralState({ url });
    }

    async insertTranscriptUnderLink(editor) {
        const selected = editor.getSelection();
        const rawUrl = URLDetector.extractYouTubeUrlFromText(selected);
        const url = rawUrl ? URLDetector.cleanYouTubeUrl(rawUrl) : null;
        if (!url) {
            new import_obsidian.Notice('No YouTube URL found in selection');
            return;
        }
        const transcript = await YoutubeTranscript.fetchTranscript(url, {
            lang: this.settings.lang,
            country: this.settings.country
        });
        const formatted = TranscriptFormatter.format(transcript, url, {
            template: TEMPLATE_RICH,
            timestampMod: this.settings.timestampMod,
            showChapters: this.settings.showChapters
        });
        const cursor = editor.getCursor();
        const line = editor.getLine(cursor.line);
        const linkEnd = line.indexOf(rawUrl) + rawUrl.length;
        editor.replaceRange('\n\n' + formatted + '\n', { line: cursor.line, ch: linkEnd });
        new import_obsidian.Notice('Transcript inserted under link');
    }

    async _processAutoExtractForFile(file) {
        if (!this.settings.autoExtract) return;
        if (this.processedFiles.has(file.path)) return;
        const content = await this.app.vault.read(file);
        const scriptLinks = this._findScriptMarkdownLinks(content);
        if (!scriptLinks.length) return;
        this.processedFiles.add(file.path);
        await new Promise(r => setTimeout(r, 100));
        await this._createTranscriptNotesForLinks(file, scriptLinks);
    }

    _findScriptMarkdownLinks(content) {
        const links = [];
        const mdPattern = /\[script\]\((https?:\/\/[^\s<>"{}|\\^`[\]]+)\)/gi;
        let match;
        while ((match = mdPattern.exec(content)) !== null) {
            const url = URLDetector.cleanYouTubeUrl(match[1]);
            if (URLDetector.isValidYouTubeUrl(url)) {
                links.push({ url, type: 'markdown', fullMatch: match[0], index: match.index });
            }
        }
        const imgPattern = /!\[script\]\((https?:\/\/[^\s<>"{}|\\^`[\]]+)\)/gi;
        while ((match = imgPattern.exec(content)) !== null) {
            const url = URLDetector.cleanYouTubeUrl(match[1]);
            if (URLDetector.isValidYouTubeUrl(url)) {
                links.push({ url, type: 'image', fullMatch: match[0], index: match.index });
            }
        }
        return links;
    }

    async _createTranscriptNotesForLinks(file, scriptLinks) {
        if (!this.settings.autoExtract) return;
        const folder = this.settings.transcriptFolder || DEFAULT_TRANSCRIPT_FOLDER;
        await this._ensureFolder(folder);
        const created = [];
        for (const link of scriptLinks) {
            try {
                const transcript = await YoutubeTranscript.fetchTranscript(link.url, {
                    lang: this.settings.lang,
                    country: this.settings.country
                });
                const safeTitle = (transcript.title || 'Transcript').replace(/[\\/:*?"<>|#]/g, '-').trim();
                const fileName = `${folder}/${safeTitle} - Transcript.md`;
                const existing = this.app.vault.getAbstractFileByPath(fileName);
                let isNew = false;
                if (!existing) {
                    const content = TranscriptFormatter.format(transcript, link.url, {
                        template: TEMPLATE_RICH,
                        timestampMod: this.settings.timestampMod,
                        showChapters: this.settings.showChapters
                    });
                    const newFile = await this.app.vault.create(fileName, content);
                    isNew = true;
                    created.push({ file: newFile, title: transcript.title, link, isNew });
                } else {
                    created.push({ file: existing, title: transcript.title, link, isNew: false });
                }
            } catch (err) {
                console.error(`Failed transcript for ${link.url}:`, err);
            }
        }
        if (created.length) {
            let newContent = await this.app.vault.read(file);
            created.sort((a, b) => b.link.index - a.link.index);
            created.forEach(({ file: tFile, link }) => {
                const display = tFile.path.includes(' - Transcript.md') ? 'View Transcript' : 'Transcript';
                const replacement = `${link.fullMatch} [[${tFile.path}|${display}]]`;
                newContent = newContent.replace(link.fullMatch, replacement);
            });
            if (newContent !== await this.app.vault.read(file)) {
                await this.app.vault.modify(file, newContent);
                new import_obsidian.Notice(`Transcript links updated`);
            }
        }
    }

    async _ensureFolder(path) {
        if (!this.app.vault.getAbstractFileByPath(path)) {
            await this.app.vault.createFolder(path);
        }
    }
}

// ====================================================================
// 16. SETTINGS TAB
// ====================================================================
class YTranscriptSettingTab extends import_obsidian.PluginSettingTab {
    constructor(app, plugin) {
        super(app, plugin);
        this.plugin = plugin;
    }

    display() {
        const { containerEl } = this;
        containerEl.empty();
        containerEl.createEl('h2', { text: 'YouTube Transcript Settings' });

        new import_obsidian.Setting(containerEl)
            .setName('YouTube API Key')
            .setDesc('Enter your personal YouTube Data API key. Without it, transcript fetching may eventually fail due to quota limits.')
            .addText(text => text
                .setPlaceholder('Enter API key')
                .setValue(this.plugin.settings.apiKey || '')
                .onChange(async (value) => {
                    this.plugin.settings.apiKey = value.trim();
                    await this.plugin.saveSettings();
                }));

        new import_obsidian.Setting(containerEl)
            .setName('Display location')
            .addDropdown(dropdown => dropdown
                .addOption(DISPLAY_SIDEBAR, 'Sidebar')
                .addOption(DISPLAY_NOTE, 'Below video in note')
                .setValue(this.plugin.settings.displayLocation)
                .onChange(async (value) => {
                    this.plugin.settings.displayLocation = value;
                    await this.plugin.saveSettings();
                }));

        new import_obsidian.Setting(containerEl)
            .setName('Auto extract transcript')
            .setDesc('Automatically create transcript notes when you paste [script](url) or ![script](url) links.')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.autoExtract)
                .onChange(async (value) => {
                    this.plugin.settings.autoExtract = value;
                    await this.plugin.saveSettings();
                }));

        new import_obsidian.Setting(containerEl)
            .setName('Transcript folder')
            .addText(text => text
                .setPlaceholder(DEFAULT_TRANSCRIPT_FOLDER)
                .setValue(this.plugin.settings.transcriptFolder)
                .onChange(async (value) => {
                    this.plugin.settings.transcriptFolder = value || DEFAULT_TRANSCRIPT_FOLDER;
                    await this.plugin.saveSettings();
                }));

        new import_obsidian.Setting(containerEl)
            .setName('Show chapters')
            .setDesc('Display video chapters as headings in transcripts (when available).')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.showChapters)
                .onChange(async (value) => {
                    this.plugin.settings.showChapters = value;
                    await this.plugin.saveSettings();
                }));

        containerEl.createEl('h3', { text: 'Sidebar Customization' });
        new import_obsidian.Setting(containerEl)
            .setName('Show search bar')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.showSearchBar)
                .onChange(async (value) => {
                    this.plugin.settings.showSearchBar = value;
                    await this.plugin.saveSettings();
                }));

        new import_obsidian.Setting(containerEl)
            .setName('Show copy all button')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.showCopyAllButton)
                .onChange(async (value) => {
                    this.plugin.settings.showCopyAllButton = value;
                    await this.plugin.saveSettings();
                }));

        new import_obsidian.Setting(containerEl)
            .setName('Show create note button')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.showCreateNoteButton)
                .onChange(async (value) => {
                    this.plugin.settings.showCreateNoteButton = value;
                    await this.plugin.saveSettings();
                }));

        new import_obsidian.Setting(containerEl)
            .setName('Timestamp interval')
            .setDesc('Number of transcript lines between timestamps.')
            .addText(text => text
                .setValue(this.plugin.settings.timestampMod.toString())
                .onChange(async (value) => {
                    const v = parseInt(value);
                    this.plugin.settings.timestampMod = isNaN(v) ? DEFAULT_TIMESTAMP_MOD : v;
                    await this.plugin.saveSettings();
                }));

        new import_obsidian.Setting(containerEl)
            .setName('Language')
            .addText(text => text
                .setValue(this.plugin.settings.lang)
                .onChange(async (value) => {
                    this.plugin.settings.lang = value;
                    await this.plugin.saveSettings();
                }));

        new import_obsidian.Setting(containerEl)
            .setName('Country')
            .addText(text => text
                .setValue(this.plugin.settings.country)
                .onChange(async (value) => {
                    this.plugin.settings.country = value;
                    await this.plugin.saveSettings();
                }));
    }
}

module.exports = YTranscriptPlugin;