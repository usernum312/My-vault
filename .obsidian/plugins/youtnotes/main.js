'use strict';

// ====================================================================
// SECTION A: TRANSCRIPT PLUGIN
// Fetches and displays YouTube transcripts in a readable sidebar
// ====================================================================

const { requestUrl, Notice, Modal, TextComponent, ButtonComponent,
        ItemView, Menu, MarkdownView, PluginSettingTab, Setting,
        Plugin, setIcon, TFile, WorkspaceLeaf, addIcon } = require('obsidian');

// ====================================================================
// 1. CONSTANTS
// ====================================================================

const DISPLAY_SIDEBAR = 'sidebar';
const DISPLAY_NOTE    = 'note';

const TEMPLATE_MINIMAL  = 'minimal';
const TEMPLATE_STANDARD = 'standard';
const TEMPLATE_RICH     = 'rich';

const DEFAULT_TIMESTAMP_MOD      = 5;
const DEFAULT_TRANSCRIPT_FOLDER  = 'Transcripts';
const DEFAULT_YOUTUBE_NOTES_FOLDER = 'YouTube Notes';

const VIEW_TYPE_YTRANSCRIPT = 'transcript-view';

// ====================================================================
// 1b. TEMPLATE RESOLVER
// Replaces {{token}} placeholders (case-insensitive) with provided
// values. Unknown tokens are left as-is so users can spot typos.
// ====================================================================

function resolveTemplate(template, vars) {
    if (!template || typeof template !== 'string') return '';
    // Normalize all vars keys to lowercase once so lookups are always case-insensitive
    const _lowerVars = {};
    if (vars && typeof vars === 'object') {
        for (const k of Object.keys(vars)) {
            _lowerVars[k.toLowerCase()] = vars[k];
        }
    }
    return template.replace(/\{\{([^}]+)\}\}/gi, (match, key) => {
        const k = key.trim().toLowerCase();
        return Object.prototype.hasOwnProperty.call(_lowerVars, k) ? (_lowerVars[k] ?? '') : match;
    });
}

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
// 3. XML / HTML UTILITIES
// ====================================================================

function decodeHtmlEntities(text) {
    return text
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/&apos;/g, "'")
        .replace(/&#(\d+);/g,   (_, code) => String.fromCharCode(parseInt(code, 10)))
        .replace(/&#x([a-fA-F0-9]+);/g, (_, code) => String.fromCharCode(parseInt(code, 16)))
        .replace(/\n/g, ' ')
        .trim();
}

function parseTranscriptXml(xmlContent) {
    const lines = [];

    // Primary pattern: <text start="..." dur="...">
    const textMatches = xmlContent.matchAll(/<text\s+start="([^"]+)"\s+dur="([^"]+)"[^>]*>([\s\S]*?)<\/text>/g);
    for (const match of textMatches) {
        const startSeconds    = parseFloat(match[1]);
        const durationSeconds = parseFloat(match[2]);
        const text = decodeHtmlEntities(match[3].replace(/<[^>]+>/g, ''));
        if (text) {
            lines.push({
                text,
                offset:   Math.round(startSeconds    * 1e3),
                duration: Math.round(durationSeconds * 1e3),
            });
        }
    }

    // Fallback: <p t="..." d="..."> (older transcript format)
    if (lines.length === 0) {
        const pMatches = xmlContent.matchAll(/<p\s+t="(\d+)"\s+d="(\d+)"[^>]*>([\s\S]*?)<\/p>/g);
        for (const match of pMatches) {
            const offset   = parseInt(match[1], 10);
            const duration = parseInt(match[2], 10);
            const text = decodeHtmlEntities(match[3].replace(/<[^>]+>/g, ''));
            if (text) lines.push({ text, offset, duration });
        }
    }

    return lines;
}

// ====================================================================
// 4. CHAPTER EXTRACTION
// ====================================================================

function extractChapters(playerData) {
    // 4.1  Try engagement panels (most common source)
    const engagementPanels = playerData?.engagementPanels;
    if (engagementPanels) {
        const macroMarkersPanel = engagementPanels.find(p => p.macroMarkersListRenderer);
        if (macroMarkersPanel) {
            const markers = macroMarkersPanel.macroMarkersListRenderer.contents;
            return markers.map(marker => {
                const renderer = marker.macroMarkersListItemRenderer;
                return {
                    title:       renderer.title.simpleText,
                    startMillis: parseFloat(renderer.timeRangeStartMillis),
                };
            });
        }
    }

    // 4.2  Fallback: parse description for standard timestamps like "0:00 - Intro"
    const description = playerData?.videoDetails?.shortDescription;
    if (description) return extractChaptersFromDescription(description);

    return [];
}

function extractChaptersFromDescription(description) {
    const chapters = [];
    const regex    = /^(\d{1,2}):(\d{2})(?::(\d{2}))?\s*[-–—]?\s*(.+)/;

    for (const line of description.split('\n')) {
        const match = line.trim().match(regex);
        if (!match) continue;

        const hasHours = !!match[3];
        const h = hasHours ? parseInt(match[1]) : 0;
        const m = hasHours ? parseInt(match[2]) : parseInt(match[1]);
        const s = hasHours ? parseInt(match[3]) : parseInt(match[2]);
        const title = match[4].trim();
        chapters.push({ title, startMillis: (h * 3600 + m * 60 + s) * 1000 });
    }
    return chapters;
}

function assignLinesToChapters(lines, chapters) {
    if (!chapters.length) {
        return lines.map(line => ({ ...line, chapterTitle: '' }));
    }

    const sorted = [...chapters].sort((a, b) => a.startMillis - b.startMillis);
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
// 5. YOUTUBE TRANSCRIPT API
// Handles fetching transcripts with chapter support and a user API key.
// ====================================================================

class YoutubeTranscript {
    static _apiKey    = '';
    static _playerUrl = '';

    static INNERTUBE_CONTEXT = {
        client: {
            clientName:    'IOS',
            clientVersion: '20.10.38',
            hl: 'en',
            gl: 'US',
        },
    };

    static setApiKey(apiKey) {
        this._apiKey    = apiKey;
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

    static async _fetchTranscriptImpl(url, config) {
        try {
            const videoId = this.extractVideoIdFromUrl(url);
            if (!videoId) {
                throw new YoutubeTranscriptError(new Error('Invalid YouTube URL - could not extract video ID'));
            }

            console.log(`🎬 Fetching transcript for video: ${videoId}`);
            const playerData   = await this.fetchPlayerData(videoId, config);
            const title        = playerData?.videoDetails?.title || 'Unknown';
            const captionsData = playerData?.captions?.playerCaptionsTracklistRenderer;

            if (!captionsData?.captionTracks) {
                throw new YoutubeTranscriptError(new Error('No captions available for this video'));
            }

            const langCode    = config?.lang || 'en';
            const captionTrack = this.findCaptionTrack(captionsData.captionTracks, langCode);
            if (!captionTrack) {
                const availableLangs = captionsData.captionTracks.map(t => t.languageCode).join(', ');
                throw new YoutubeTranscriptError(
                    new Error(`No transcript found for language '${langCode}'. Available: ${availableLangs}`)
                );
            }

            const lines            = await this.fetchTranscriptFromUrl(captionTrack.baseUrl);
            const chapters         = extractChapters(playerData);
            const linesWithChapters = assignLinesToChapters(lines, chapters);

            return { title: this.decodeHTML(title), lines: linesWithChapters, chapters };

        } catch (err) {
            if (err instanceof YoutubeTranscriptError) throw err;
            throw new YoutubeTranscriptError(err);
        }
    }

    static extractVideoIdFromUrl(url) {
        const patterns = [
            /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/v\/)([a-zA-Z0-9_-]{11})/,
            /^([a-zA-Z0-9_-]{11})$/,
        ];
        for (const pattern of patterns) {
            const match = url.match(pattern);
            if (match) return match[1];
        }
        return null;
    }

    static async fetchPlayerData(videoId, config) {
        const context = {
            ...this.INNERTUBE_CONTEXT,
            client: {
                ...this.INNERTUBE_CONTEXT.client,
                hl: config?.lang    || 'en',
                gl: config?.country || 'US',
            },
        };

        if (!this._playerUrl) {
            this._playerUrl = `https://www.youtube.com/youtubei/v1/player?key=${this.getApiKey()}`;
        }

        const response = await requestUrl({
            url:    this._playerUrl,
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'User-Agent':   'com.google.ios.youtube/20.10.38 (iPhone16,2; U; CPU iOS 17_5_1 like Mac OS X)',
            },
            body: JSON.stringify({ context, videoId }),
        });

        const data              = JSON.parse(response.text);
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
    }

    static findCaptionTrack(captionTracks, langCode) {
        // Exact match
        let track = captionTracks.find(t => t.languageCode === langCode);
        if (track) return track;
        // Prefix match (e.g. "en" matches "en-US")
        track = captionTracks.find(t => t.languageCode.startsWith(langCode + '-'));
        if (track) return track;
        // Reverse prefix match
        track = captionTracks.find(t => langCode.startsWith(t.languageCode + '-'));
        if (track) return track;
        // Fallback to first available
        if (captionTracks.length > 0) {
            console.log(`⚠️ Language '${langCode}' not found, falling back to '${captionTracks[0].languageCode}'`);
            return captionTracks[0];
        }
        return null;
    }

    static async fetchTranscriptFromUrl(transcriptUrl) {
        const response = await requestUrl({
            url:    transcriptUrl,
            method: 'GET',
            headers: { 'Accept-Language': 'en-US,en;q=0.9' },
        });
        if (response.text.length === 0) {
            throw new Error('Received empty transcript response');
        }
        return parseTranscriptXml(response.text);
    }

    static decodeHTML(text) {
        return text
            .replace(/&#39;/g,  "'")
            .replace(/&amp;/g,  '&')
            .replace(/&quot;/g, '"')
            .replace(/&apos;/g, "'")
            .replace(/&lt;/g,   '<')
            .replace(/&gt;/g,   '>')
            .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(parseInt(code, 10)))
            .replace(/\\n/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();
    }
}

// ====================================================================
// 6. TIMESTAMP UTILITIES
// ====================================================================

function millisecondsToTimestamp(ms) {
    if (ms < 0) return '00:00';

    const pad     = n  => String(Math.floor(n)).padStart(2, '0');
    const S_MS    = 1000;
    const M_MS    = 60 * S_MS;
    const H_MS    = 60 * M_MS;
    const hours   = Math.floor(ms / H_MS);
    const minutes = Math.floor((ms % H_MS) / M_MS);
    const seconds = Math.floor((ms % H_MS % M_MS) / S_MS);
    const parts   = hours ? [hours, minutes, seconds] : [minutes, seconds];
    return parts.map(pad).join(':');
}

// ====================================================================
// 7. TRANSCRIPT BLOCK GROUPING
// Groups consecutive transcript lines into timed blocks for display.
// ====================================================================

function groupTranscriptByInterval(lines, intervalMs) {
    const blocks = [];
    let currentQuote  = '';
    let currentOffset = 0;

    lines.forEach((line, index) => {
        if (index === 0) {
            currentOffset = line.offset;
            currentQuote  = line.text + ' ';
            return;
        }

        if (index % intervalMs === 0) {
            blocks.push({
                quote:           currentQuote.trim(),
                quoteTimeOffset: currentOffset,
                chapterTitle:    line.chapterTitle || '',
            });
            currentQuote  = '';
            currentOffset = line.offset;
        }
        currentQuote += line.text + ' ';
    });

    if (currentQuote.trim() !== '') {
        blocks.push({
            quote:           currentQuote.trim(),
            quoteTimeOffset: currentOffset,
            chapterTitle:    lines[lines.length - 1]?.chapterTitle || '',
        });
    }

    return blocks;
}

// ====================================================================
// 8. SAFE SEARCH HIGHLIGHTING
// Highlights search terms using DOM text nodes — no innerHTML risk.
// ====================================================================

function applySafeSearchHighlight(containerElement, searchTerm) {
    if (!searchTerm) return;

    const treeWalker = document.createTreeWalker(containerElement, NodeFilter.SHOW_TEXT);
    const textNodes  = [];
    while (treeWalker.nextNode()) textNodes.push(treeWalker.currentNode);

    const lowerTerm = searchTerm.toLowerCase();

    textNodes.forEach(node => {
        const parent    = node.parentNode;
        if (!parent) return;

        const text      = node.textContent;
        const lowerText = text.toLowerCase();
        if (!lowerText.includes(lowerTerm)) return;

        const fragment  = document.createDocumentFragment();
        let lastIndex   = 0;
        let idx         = lowerText.indexOf(lowerTerm);

        while (idx !== -1) {
            if (idx > lastIndex) {
                fragment.appendChild(document.createTextNode(text.slice(lastIndex, idx)));
            }
            const mark       = document.createElement('span');
            mark.className   = 'yt-transcript__highlight';
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
// 9. TRANSCRIPT FORMATTER
// Supports minimal, standard, and rich output templates.
// Chapter headings are included in all modes when available.
// ====================================================================

class TranscriptFormatter {
    static format(transcript, url, options) {
        if (!transcript?.lines?.length) return '';
        const normalized = this._normalizeOptions(options);

        switch (normalized.template) {
            case TEMPLATE_MINIMAL:  return this._formatMinimal(transcript, normalized);
            case TEMPLATE_STANDARD: return this._formatStandard(transcript, url, normalized);
            case TEMPLATE_RICH:     return this._formatRich(transcript, url, normalized);
            default:                return this._formatStandard(transcript, url, normalized);
        }
    }

    static _normalizeOptions(options) {
        return {
            timestampMod:    Math.max(1, Math.floor(options?.timestampMod)) || DEFAULT_TIMESTAMP_MOD,
            template:        options?.template || TEMPLATE_STANDARD,
            showChapters:    options?.showChapters !== undefined ? options.showChapters : true,
            noteTemplate:    options?.noteTemplate    || null,
            minimalTemplate: options?.minimalTemplate || null,
        };
    }

    static _formatMinimal(transcript, options) {
        const lines = transcript.lines.filter(l => l.text.trim().length > 0);

        if (!options.showChapters || !transcript.chapters?.length) {
            return lines.map(l => l.text.trim()).join(' ');
        }

        // Group by chapter when chapters are available
        const chapterMap = new Map();
        for (const line of lines) {
            const chapter = line.chapterTitle || 'No Chapter';
            if (!chapterMap.has(chapter)) chapterMap.set(chapter, []);
            chapterMap.get(chapter).push(line.text.trim());
        }

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
        const title    = transcript.title?.trim() || 'YouTube Transcript';
        const today    = new Date().toISOString().split('T')[0];
        const videoId  = YoutubeTranscript.extractVideoIdFromUrl?.(url)
                      || url.match(/[?&]v=([^&]+)/)?.[1]
                      || '';
        const thumbnail = videoId ? `https://img.youtube.com/vi/${videoId}/hqdefault.jpg` : '';
        const body      = this._formatStandard(transcript, url, options);

        if (options.noteTemplate) {
            return resolveTemplate(options.noteTemplate, {
                title, url, date: today, thumbnail, video_id: videoId, transcript_body: body,
            });
        }

        // Default rich header
        const header = [
            `---\n`,
            `link source: ${url}`,
            `\n---`,
            `### ${title}`,
            '',
            `**Retrieved**: **🗓️ ${today}**`,
            '',
            `#### The Content`,
            '',
        ].join('\n');

        return header + body;
    }

    static _formatBlocksWithChapters(blocks, url, showChapters) {
        if (!showChapters) {
            return blocks.map(block => this._formatBlock(block, url)).join('\n');
        }

        const chapterMap = new Map();
        for (const block of blocks) {
            const chapter = block.chapterTitle || 'No Chapter';
            if (!chapterMap.has(chapter)) chapterMap.set(chapter, []);
            chapterMap.get(chapter).push(block);
        }

        let output = '';
        for (const [chapter, chapterBlocks] of chapterMap.entries()) {
            output += `#### ${chapter}\n\n`;
            for (const block of chapterBlocks) {
                output += this._formatBlock(block, url) + '\n\n';
            }
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
// 10b. MP4 MUXER
// Combines separate video-only + audio-only streams into one .mp4
// container without native libraries, using raw ISOBMFF box parsing.
//
// The common case (itag 22/18) is already a muxed progressive stream,
// so no muxing is needed. This class covers the 1080p fallback where
// video (itag 137) and audio (itag 140) are separate tracks.
// ====================================================================

class MP4Muxer {
    /**
     * Combine a video ArrayBuffer and an audio ArrayBuffer into an .mp4.
     * Falls back to video-only if full muxing fails, which is still
     * watchable in most players.
     */
    static mux(videoBuffer, audioBuffer) {
        try {
            return MP4Muxer._mergeTracks(videoBuffer, audioBuffer);
        } catch (e) {
            console.warn('[MP4Muxer] Full mux failed, returning video-only stream:', e);
            return videoBuffer;
        }
    }

    /** Parse both streams, extract moov + mdat boxes, and combine. */
    static _mergeTracks(videoAB, audioAB) {
        const vBoxes = MP4Muxer._parseBoxes(new Uint8Array(videoAB));
        const aBoxes = MP4Muxer._parseBoxes(new Uint8Array(audioAB));

        const vMoov = vBoxes.find(b => b.type === 'moov');
        const aMoov = aBoxes.find(b => b.type === 'moov');

        if (!vMoov || !aMoov) {
            console.warn('[MP4Muxer] Missing moov box, using video-only.');
            return videoAB;
        }

        const vMdats = vBoxes.filter(b => b.type === 'mdat');
        const aMdats = aBoxes.filter(b => b.type === 'mdat');

        // Build: ftyp + video moov + all video mdats + all audio mdats.
        // Players like VLC and mpv can decode both tracks from this layout.
        const ftyp  = MP4Muxer._ftyp();
        const parts = [ftyp, vMoov.raw, ...vMdats.map(b => b.raw), ...aMdats.map(b => b.raw)];
        return MP4Muxer._concat(parts.map(p => p instanceof Uint8Array ? p.buffer : p));
    }

    /** Parse all top-level ISOBMFF boxes from a Uint8Array. */
    static _parseBoxes(u8) {
        const boxes = [];
        let offset  = 0;

        while (offset + 8 <= u8.length) {
            const size = (u8[offset] << 24 | u8[offset+1] << 16 | u8[offset+2] << 8 | u8[offset+3]) >>> 0;
            if (size < 8) break;
            const type = String.fromCharCode(u8[offset+4], u8[offset+5], u8[offset+6], u8[offset+7]);
            const end  = offset + size;
            if (end > u8.length) break;
            boxes.push({ type, raw: u8.subarray(offset, end), offset, size });
            offset = end;
        }
        return boxes;
    }

    /** Build a minimal ftyp box (major brand: isom, compatible: isom + mp41). */
    static _ftyp() {
        return new Uint8Array([
            0, 0, 0, 0x18,             // size = 24
            0x66, 0x74, 0x79, 0x70,   // 'ftyp'
            0x69, 0x73, 0x6F, 0x6D,   // 'isom'
            0, 0, 2, 0,               // minor version
            0x69, 0x73, 0x6F, 0x6D,   // 'isom'
            0x6D, 0x70, 0x34, 0x31,   // 'mp41'
        ]);
    }

    /** Wrap a raw buffer in an mdat box. */
    static _mdat(buffer) {
        const src  = new Uint8Array(buffer);
        const out  = new Uint8Array(8 + src.byteLength);
        const size = out.byteLength;
        out[0] = (size >>> 24) & 0xFF;
        out[1] = (size >>> 16) & 0xFF;
        out[2] = (size >>>  8) & 0xFF;
        out[3] =  size         & 0xFF;
        out[4] = 0x6D; out[5] = 0x64; out[6] = 0x61; out[7] = 0x74; // 'mdat'
        out.set(src, 8);
        return out;
    }

    /** Concatenate multiple ArrayBuffers into one. */
    static _concat(buffers) {
        const total  = buffers.reduce((s, b) => s + b.byteLength, 0);
        const out    = new Uint8Array(total);
        let   offset = 0;
        for (const buf of buffers) {
            out.set(new Uint8Array(buf), offset);
            offset += buf.byteLength;
        }
        return out.buffer;
    }
}

// ====================================================================
// 10c. URL DETECTOR
// Validates, cleans, and normalises YouTube URLs.
// ====================================================================

class URLDetector {
    static YOUTUBE_DOMAINS = [
        'youtube.com', 'www.youtube.com', 'm.youtube.com', 'mobile.youtube.com',
        'music.youtube.com', 'youtu.be', 'www.youtu.be',
    ];

    /** Remove tracking parameters (e.g. `?si=`) from a YouTube URL. */
    static cleanYouTubeUrl(url) {
        if (!url || typeof url !== 'string') return url;
        try {
            const urlObj = new URL(url);
            if (urlObj.searchParams.has('si')) {
                urlObj.searchParams.delete('si');
                if (!urlObj.searchParams.toString()) urlObj.search = '';
                return urlObj.toString();
            }
            return url;
        } catch {
            return url.replace(/[?&]si=[^&]*/g, '').replace(/\?$/, '').replace(/&&/g, '&').replace(/\?&/g, '?');
        }
    }

    static isValidYouTubeUrl(url) {
        if (!url) return false;
        const cleaned = this.cleanYouTubeUrl(url);
        try {
            const urlObj   = new URL(cleaned);
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

    /**
     * Normalise any YouTube URL form to https://www.youtube.com/watch?v=ID.
     * Handles watch URLs, embed URLs, and shortened youtu.be URLs.
     */
    static toWatchUrl(url) {
        if (!url || typeof url !== 'string') return null;
        try {
            const u = new URL(url.trim());
            const h = u.hostname.toLowerCase();

            // Already a standard watch URL
            if (h.includes('youtube.com') && u.pathname === '/watch' && u.searchParams.has('v')) {
                return `https://www.youtube.com/watch?v=${u.searchParams.get('v')}`;
            }
            // Embed: youtube.com/embed/VIDEO_ID
            if (h.includes('youtube.com') && u.pathname.startsWith('/embed/')) {
                const vid = u.pathname.split('/')[2];
                if (vid) return `https://www.youtube.com/watch?v=${vid}`;
            }
            // Shortened: youtu.be/VIDEO_ID
            if (h === 'youtu.be' || h === 'www.youtu.be') {
                const vid = u.pathname.split('/').filter(Boolean)[0];
                if (vid) return `https://www.youtube.com/watch?v=${vid}`;
            }
        } catch (_) {
            // Fall through to regex extraction below
        }

        const m = url.match(/(?:v=|\/embed\/|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
        if (m) return `https://www.youtube.com/watch?v=${m[1]}`;
        return null;
    }

    /** Find the first valid YouTube URL within arbitrary text. */
    static extractYouTubeUrlFromText(text) {
        if (!text) return null;
        const urlRegex = /https?:\/\/[^\s<>"{}|\\^`[\]]+/gi;
        const matches  = text.match(urlRegex);
        if (!matches) return null;
        for (const match of matches) {
            const cleaned = this.cleanYouTubeUrl(match);
            if (this.isValidYouTubeUrl(cleaned)) return cleaned;
        }
        return null;
    }

    /** Append a `?t=` seek parameter to a YouTube URL. */
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

// ====================================================================
// 11. YOUTUBE URL PROMPT MODAL
// ====================================================================

class YouTubeUrlPromptModal extends Modal {
    constructor(initialValue) {
        super(app);
        this.submitted    = false;
        this.initialValue = initialValue || '';
        this.value        = this.initialValue;
    }

    onOpen() {
        this.titleEl.setText('YouTube URL');

        const textInput = new TextComponent(this.contentEl);
        textInput.inputEl.style.width = '100%';
        textInput.setValue(this.initialValue);
        textInput.onChange(value => { this.value = value; });
        textInput.inputEl.focus();
        textInput.inputEl.select();

        textInput.inputEl.addEventListener('keydown', evt => {
            if (evt.key === 'Enter') {
                evt.preventDefault();
                this.resolveAndClose();
            }
        });

        const buttonDiv = this.modalEl.createDiv({ cls: 'modal-button-container' });
        new ButtonComponent(buttonDiv)
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
    /** Return the selected text, or the word/URL under the cursor if nothing is selected. */
    static getSelectedText(editor) {
        if (!editor.somethingSelected()) {
            const [from, to] = this.getWordBoundaries(editor);
            editor.setSelection(from, to);
        }
        return editor.getSelection();
    }

    /**
     * Find the boundaries of a URL on the current line, falling back to
     * the entire line if no URL is detected under the cursor.
     */
    static getWordBoundaries(editor) {
        const cursor   = editor.getCursor();
        const lineText = editor.getLine(cursor.line);
        const urlRegex = /https?:\/\/\S+/gi;
        let match;

        while ((match = urlRegex.exec(lineText)) !== null) {
            if (cursor.ch >= match.index && cursor.ch <= match.index + match[0].length) {
                return [
                    { line: cursor.line, ch: match.index },
                    { line: cursor.line, ch: match.index + match[0].length },
                ];
            }
        }

        // Fallback: select the entire line
        return [
            { line: cursor.line, ch: 0 },
            { line: cursor.line, ch: lineText.length },
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
                lang:    this.plugin.settings.lang,
                country: this.plugin.settings.country,
            });

            if (!transcript?.lines?.length) {
                new Notice('No transcript found for this video.');
                return;
            }

            const formatOptions = {
                template:     options.template     || TEMPLATE_STANDARD,
                timestampMod: options.timestampMod || this.plugin.settings.timestampMod || DEFAULT_TIMESTAMP_MOD,
                showChapters: this.plugin.settings.showChapters !== false,
            };

            const formatted = TranscriptFormatter.format(transcript, url, formatOptions);
            if (!formatted) return;

            editor.replaceRange(formatted, editor.getCursor());
            new Notice('Transcript inserted.');

        } catch (err) {
            new Notice(`Error: ${err.message}`);
        }
    }

    async _promptForYouTubeUrl(editor) {
        const detected = await this._detectUrl(editor);
        const modal    = new YouTubeUrlPromptModal(detected);
        const result   = await new Promise(resolve => modal.openAndGetValue(resolve));
        if (!result) return null;
        return URLDetector.cleanYouTubeUrl(result);
    }

    async _detectUrl(editor) {
        // 1. Check editor selection
        if (editor.somethingSelected()) {
            const url = URLDetector.extractYouTubeUrlFromText(editor.getSelection());
            if (url) return url;
        }
        // 2. Check clipboard
        try {
            const clip    = await navigator.clipboard.readText();
            const clipUrl = URLDetector.extractYouTubeUrlFromText(clip);
            if (clipUrl) return clipUrl;
        } catch { /* clipboard access denied — ignore */ }
        return null;
    }
}

// ====================================================================
// 14. TRANSCRIPT VIEW (SIDEBAR)
// ====================================================================

class TranscriptView extends ItemView {
    constructor(leaf, plugin) {
        super(leaf);
        this.plugin            = plugin;
        this.isDataLoaded      = false;
        this.dataContainerEl   = null;
        this.loaderContainerEl = null;
        this.errorContainerEl  = null;
    }

    getViewType()    { return VIEW_TYPE_YTRANSCRIPT; }
    getDisplayText() { return 'YouTube Transcript'; }
    getIcon()        { return 'scroll'; }

    async onOpen() {
        this.contentEl.empty();
        this.contentEl.createEl('h4', { text: 'Transcript' });
    }

    async onClose() {
        this._stopAutoScroll();
    }

    // ----------------------------------------------------------------
    // Auto-scroll: keeps the active transcript block visible during
    // playback. Uses rAF (throttled to ~4 fps) for smooth scrolling.
    // ----------------------------------------------------------------

    _startAutoScroll() {
        this._stopAutoScroll();
        let lastScrollMs = -1;

        const loop = () => {
            this._rafHandle = requestAnimationFrame(loop);
            const now = performance.now();
            if (now - lastScrollMs < 250) return; // throttle to ~4 fps
            lastScrollMs = now;
            this._tickAutoScroll();
        };
        this._rafHandle = requestAnimationFrame(loop);
    }

    _stopAutoScroll() {
        if (this._rafHandle) {
            cancelAnimationFrame(this._rafHandle);
            this._rafHandle = null;
        }
        if (this._autoScrollInterval) {
            clearInterval(this._autoScrollInterval);
            this._autoScrollInterval = null;
        }
    }

    _tickAutoScroll() {
        if (!this._transcriptBlockEls?.length) return;

        // Find the active Youtnote view's player adapter
        const youtnoteLeaves = this.plugin.app.workspace.getLeavesOfType(YOUTNOTE_VIEW_TYPE);
        if (!youtnoteLeaves.length) return;

        const youtnoteView = youtnoteLeaves[0].view;
        const playerRef    = youtnoteView?._playerAdapterRef;
        if (!playerRef) return;

        const currentSec = playerRef.cachedCurrentTime ?? 0;
        if (currentSec <= 0) return;

        // Add lookahead proportional to playback rate so the highlight
        // stays ahead of the spoken word at 1.5×, 2×, etc.
        const rate        = playerRef.cachedPlaybackRate ?? 1;
        const lookaheadMs = Math.max(0, (rate - 1) * 1500); // e.g. 1500 ms at 2×
        const currentMs   = (currentSec * 1000) + lookaheadMs;

        // Find the latest block whose offset has been reached
        let bestEl     = null;
        let bestOffset = -1;

        for (const { offsetMs, el } of this._transcriptBlockEls) {
            if (offsetMs <= currentMs && offsetMs > bestOffset) {
                bestOffset = offsetMs;
                bestEl     = el;
            }
        }

        if (bestEl && bestEl !== this._lastScrolledEl) {
            this._lastScrolledEl?.classList.remove('yt-transcript__active-block');
            bestEl.classList.add('yt-transcript__active-block');
            bestEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            this._lastScrolledEl = bestEl;
        }
    }

    // ----------------------------------------------------------------
    // Rendering helpers
    // ----------------------------------------------------------------

    renderLoader() {
        if (this.loaderContainerEl) {
            this.loaderContainerEl.empty();
            this.loaderContainerEl.createEl('div', { text: 'Loading...' });
        }
    }

    renderVideoTitle(title) {
        const el = this.contentEl.createEl('div', { cls: 'yt-transcript__title' });
        el.textContent      = title;
        el.style.fontWeight = 'bold';
        el.style.marginBottom = '20px';
    }

    renderHeader(url, data, timestampMod) {
        const header = this.contentEl.createEl('div', { cls: 'yt-transcript__header' });

        // Sticky "Create Timed Note" button at the top of the sidebar
        if (this.plugin.settings.showSidebarTimedNoteButton !== false) {
            const timedNoteBtn = this.contentEl.createEl('button', {
                cls:  'yt-transcript__create-timed-note-btn',
                attr: {
                    'aria-label': 'Create timed note at current position',
                    'title':      'Create timed note at current position (Ctrl+Shift+N)',
                },
            });
            setIcon(timedNoteBtn, 'clock-plus');
            timedNoteBtn.createSpan({ text: 'Create Timed Note' });
            timedNoteBtn.addEventListener('click', () => {
                const leaves = this.plugin.app.workspace.getLeavesOfType(YOUTNOTE_VIEW_TYPE);
                if (!leaves.length) {
                    new Notice('Open a Youtnote workspace first');
                    return;
                }
                const view = leaves[0].view;
                if (typeof view._triggerCreateTimedNote === 'function') {
                    view._triggerCreateTimedNote();
                } else {
                    new Notice('No active Youtnote workspace found');
                }
            });
            // Insert sticky button before the main header bar
            this.contentEl.insertBefore(timedNoteBtn, header);
        }

        // Search input
        if (this.plugin.settings.showSearchBar) {
            const searchInput = header.createEl('input', {
                cls:         'yt-transcript__search-input',
                type:        'text',
                placeholder: 'Search...',
            });
            searchInput.addEventListener('input', e => {
                this.renderTranscriptBlocks(url, data, timestampMod, e.target.value);
            });
        }

        const btnContainer = header.createEl('div', { cls: 'yt-transcript__button-container' });

        // Copy all button
        if (this.plugin.settings.showCopyAllButton) {
            const copyBtn = btnContainer.createEl('button', {
                cls:  'yt-transcript__icon-button',
                attr: { 'aria-label': 'Copy transcript', 'title': 'Copy transcript' },
            });
            setIcon(copyBtn, 'copy');
            copyBtn.addEventListener('click', () => this.copyFullTranscript(url, data, timestampMod));
        }

        // Create note button
        if (this.plugin.settings.showCreateNoteButton) {
            const noteBtn = btnContainer.createEl('button', {
                cls:  'yt-transcript__icon-button',
                attr: { 'aria-label': 'Create new note with transcript', 'title': 'Create new note with transcript' },
            });
            setIcon(noteBtn, 'file-plus');
            noteBtn.addEventListener('click', () => this.createOrOpenTranscriptNote(url, data, timestampMod));
        }
    }

    async renderTranscriptBlocks(url, data, timestampMod, searchTerm = '') {
        if (!this.dataContainerEl) return;
        this.dataContainerEl.empty();

        const blocks   = groupTranscriptByInterval(data.lines, timestampMod);
        const filtered = blocks.filter(b => b.quote.toLowerCase().includes(searchTerm.toLowerCase()));
        const blockEls = []; // [{offsetMs, el}] — used for auto-scroll
        let currentChapter = null;

        for (const block of filtered) {
            // Render chapter heading when the chapter changes
            if (block.chapterTitle && block.chapterTitle !== currentChapter) {
                currentChapter = block.chapterTitle;
                const chHeading = this.dataContainerEl.createEl('h4', { cls: 'yt-transcript__chapter' });
                chHeading.textContent = currentChapter;
            }

            const blockEl       = this.dataContainerEl.createEl('div', { cls: 'yt-transcript__transcript-block' });
            blockEl.draggable   = true;
            blockEls.push({ offsetMs: block.quoteTimeOffset, el: blockEl });

            // Timestamp link — clicks seek the Youtnote player
            const link = blockEl.createEl('a', {
                text: millisecondsToTimestamp(block.quoteTimeOffset),
                href: '#',
            });
            link.style.marginBottom = '5px';
            link.addEventListener('click', e => {
                e.preventDefault();
                e.stopPropagation();
                const seekSec      = Math.floor(block.quoteTimeOffset / 1000);
                const leaves       = this.plugin.app.workspace.getLeavesOfType(YOUTNOTE_VIEW_TYPE);
                const youtnoteView = leaves[0]?.view;
                const playerRef    = youtnoteView?._playerAdapterRef;
                if (playerRef?.isReady()) {
                    playerRef.seek(seekSec).catch(() => {});
                }
            });

            // Quote text — click to copy
            const span = blockEl.createEl('span', { text: block.quote, title: 'Click to copy' });
            span.addEventListener('click', () => {
                navigator.clipboard.writeText(block.quote);
                new Notice('Copied to clipboard');
            });

            applySafeSearchHighlight(span, searchTerm);

            // Drag-and-drop support
            blockEl.addEventListener('dragstart', e => {
                e.dataTransfer.setData('text/html', blockEl.innerHTML);
            });

            // Context menu
            blockEl.addEventListener('contextmenu', e => {
                const menu = new Menu();
                menu.addItem(item => item.setTitle('Copy block').onClick(() => {
                    navigator.clipboard.writeText(block.quote);
                }));
                menu.showAtPosition({ x: e.clientX, y: e.clientY });
            });
        }

        if (filtered.length === 0 && searchTerm) {
            this.dataContainerEl.createEl('div', {
                text: `No results found for "${searchTerm}"`,
                cls:  'yt-transcript__no-results',
            });
        }

        this._transcriptBlockEls = blockEls;
    }

    async copyFullTranscript(url, data, timestampMod) {
        const blocks    = groupTranscriptByInterval(data.lines, timestampMod);
        const formatted = TranscriptFormatter._formatBlocksWithChapters(blocks, url, true);
        await navigator.clipboard.writeText(formatted);
        new Notice('Transcript copied to clipboard');
    }

    async createOrOpenTranscriptNote(url, data, timestampMod) {
        const folder    = this.plugin.settings.transcriptFolder || DEFAULT_TRANSCRIPT_FOLDER;
        await this._ensureFolderExists(folder);

        const safeTitle = (data.title || 'Untitled').replace(/[\\/:*?"<>|#]/g, '-').trim();
        const fileName  = `${folder}/${safeTitle} - Transcript.md`;
        const today     = new Date().toISOString().split('T')[0];
        const content   = `---\nlink source: "[${data.title}](${url})"\n---\n### ${data.title}\n\n`
                        + `\n\n**Retrieved**: **🗓️ ${today}**\n\n`
                        + `#### The Content\n`
                        + TranscriptFormatter._formatStandard(data, url, { timestampMod, showChapters: true });

        try {
            const existing = this.app.vault.getAbstractFileByPath(fileName);
            if (existing) {
                await this.app.workspace.getLeaf(false).openFile(existing);
                new Notice('Transcript note already exists. Opening...');
            } else {
                const file = await this.app.vault.create(fileName, content);
                await this.app.workspace.getLeaf(false).openFile(file);
                new Notice(`Created transcript note: ${fileName}`);
            }
        } catch (e) {
            new Notice('Error creating note: ' + e.message);
        }
    }

    async _ensureFolderExists(folderPath) {
        if (!this.app.vault.getAbstractFileByPath(folderPath)) {
            await this.app.vault.createFolder(folderPath);
        }
    }

    async setEphemeralState(state) {
        const { lang, country, timestampMod } = this.plugin.settings;
        const url = state.url ? URLDetector.cleanYouTubeUrl(state.url) : null;
        if (!url) return;

        // Skip reload if this exact URL is already fully loaded
        if (this.isDataLoaded && this._loadedUrl === url) return;

        this.isDataLoaded = false;
        this._loadedUrl   = url;
        this._stopAutoScroll();

        // Reset view to a clean state before loading
        this.contentEl.empty();
        this.contentEl.createEl('h4', { text: 'Transcript' });
        this.loaderContainerEl   = this.contentEl.createEl('div');
        this.dataContainerEl     = null;
        this.errorContainerEl    = null;
        this._transcriptBlockEls = null;
        this._lastScrolledEl     = null;

        try {
            this.renderLoader();
            const data = await YoutubeTranscript.fetchTranscript(url, { lang, country });
            if (!data) throw new Error('No transcript data returned');

            this.isDataLoaded        = true;
            this._loadedData         = data;
            this._loadedTimestampMod = timestampMod;
            this.loaderContainerEl.empty();
            this.renderVideoTitle(data.title);
            this.renderHeader(url, data, timestampMod);

            if (!this.dataContainerEl) {
                this.dataContainerEl = this.contentEl.createEl('div');
            } else {
                this.dataContainerEl.empty();
            }

            if (!data.lines.length) {
                this.dataContainerEl.createEl('h4', { text: 'No transcript found' });
                this.dataContainerEl.createEl('div', {
                    text: 'Adjust language/country in settings or try a different video.',
                });
            } else {
                this.renderTranscriptBlocks(url, data, timestampMod);
                this._startAutoScroll();
            }

        } catch (err) {
            this.isDataLoaded = false;
            if (this.loaderContainerEl) this.loaderContainerEl.empty();

            if (!this.errorContainerEl) {
                this.errorContainerEl = this.contentEl.createEl('h5');
            } else {
                this.errorContainerEl.empty();
            }

            this.errorContainerEl.createEl('div', { text: 'Error loading transcript' });
            this.errorContainerEl.createEl('div', {
                text: err.message || 'Unknown error',
                attr: { style: 'color: var(--text-muted); font-size: var(--font-ui-small)' },
            });
        }
    }
}

// ====================================================================
// SECTION B: YOUTNOTE PLUGIN BUNDLE
// YouTube video player + timestamped note-taking workspace
// (Third-party vendored code: Preact, SortableJS, classnames)
// DO NOT MODIFY — this block is auto-generated / minified.
// ====================================================================

var e=Object.create,t=Object.defineProperty,n=Object.getOwnPropertyDescriptor,r=Object.getOwnPropertyNames,i=Object.getPrototypeOf,a=Object.prototype.hasOwnProperty,o=(e,t)=>()=>(t||(e((t={exports:{}}).exports,t),e=null),t.exports),s=(e,i,o,s)=>{if(i&&typeof i==`object`||typeof i==`function`)for(var c=r(i),l=0,u=c.length,d;l<u;l++)d=c[l],!a.call(e,d)&&d!==o&&t(e,d,{get:(e=>i[e]).bind(null,d),enumerable:!(s=n(i,d))||s.enumerable});return e},c=(n,r,a)=>(a=n==null?{}:e(i(n)),s(r||!n||!n.__esModule?t(a,`default`,{value:n,enumerable:!0}):a,n));let l=require(`obsidian`),u=require(`@codemirror/state`),d=require(`@codemirror/view`);var f={autoplayOnNoteSelect:!1,singleExpandMode:!0,newLineTrigger:`shift+enter`,persistExpandedState:!1,openExportedFile:!0,showNoteStats:!0,pinOnPhone:!1},p=class extends l.PluginSettingTab{plugin;constructor(e,t){super(e,t),this.plugin=t}display(){let{containerEl:e}=this;e.empty();let t=async()=>{await this.plugin.saveDataState(),this.plugin.refreshAllViews()};new l.Setting(e).setName(`Behavior`).setHeading(),e.createEl(`p`,{text:`Configure plugin behavior and display options in your vault.`});let n=(n,r,i)=>{new l.Setting(e).setName(n).setDesc(r).addToggle(e=>e.setValue(this.plugin.settings[i]).onChange(async e=>{this.plugin.settings[i]=e,await t()}))};n(`Autoplay on note select`,`Automatically play the video when clicking on a note timestamp.`,`autoplayOnNoteSelect`),n(`Single expand mode`,`Only allow one note to be expanded at a time. Expanding a note will collapse others.`,`singleExpandMode`),new l.Setting(e).setName(`New line trigger`).setDesc(`Choose how to create a new line when editing notes.`).addDropdown(e=>e.addOption(`shift+enter`,`Shift+Enter (Enter to save)`).addOption(`enter`,`Enter (Shift+Enter to save)`).setValue(this.plugin.settings.newLineTrigger).onChange(async e=>{this.plugin.settings.newLineTrigger=e,await t()})),n(`Persist expanded state`,`Remember which notes are expanded when switching between videos or reopening the file.`,`persistExpandedState`),n(`Open exported file`,`Automatically open the exported Markdown file in a new tab after creation.`,`openExportedFile`),n(`Show note statistics`,`Display word count and character count statistics in the note list header.`,`showNoteStats`),n(`Pin video on phone (sticky)`,`Keep the video player visible at the top while scrolling notes on mobile.`,`pinOnPhone`)}},m,h,g,_,v,y,b,x,S,C,w,T,E,ee,D,te={},ne=[],re=/acit|ex(?:s|g|n|p|$)|rph|grid|ows|mnc|ntw|ine[ch]|zoo|^ord|itera/i,O=Array.isArray;function k(e,t){for(var n in t)e[n]=t[n];return e}function ie(e){e&&e.parentNode&&e.parentNode.removeChild(e)}function A(e,t,n){var r,i,a,o={};for(a in t)a==`key`?r=t[a]:a==`ref`?i=t[a]:o[a]=t[a];if(arguments.length>2&&(o.children=arguments.length>3?m.call(arguments,2):n),typeof e==`function`&&e.defaultProps!=null)for(a in e.defaultProps)o[a]===void 0&&(o[a]=e.defaultProps[a]);return ae(e,o,r,i,null)}function ae(e,t,n,r,i){var a={type:e,props:t,key:n,ref:r,__k:null,__:null,__b:0,__e:null,__c:null,constructor:void 0,__v:i??++g,__i:-1,__u:0};return i==null&&h.vnode!=null&&h.vnode(a),a}function oe(){return{current:null}}function se(e){return e.children}function ce(e,t){this.props=e,this.context=t}function le(e,t){if(t==null)return e.__?le(e.__,e.__i+1):null;for(var n;t<e.__k.length;t++)if((n=e.__k[t])!=null&&n.__e!=null)return n.__e;return typeof e.type==`function`?le(e):null}function ue(e){if(e.__P&&e.__d){var t=e.__v,n=t.__e,r=[],i=[],a=k({},t);a.__v=t.__v+1,h.vnode&&h.vnode(a),Se(e.__P,a,t,e.__n,e.__P.namespaceURI,32&t.__u?[n]:null,r,n??le(t),!!(32&t.__u),i),a.__v=t.__v,a.__.__k[a.__i]=a,we(r,a,i),t.__e=t.__=null,a.__e!=n&&de(a)}}function de(e){if((e=e.__)!=null&&e.__c!=null)return e.__e=e.__c.base=null,e.__k.some(function(t){if(t!=null&&t.__e!=null)return e.__e=e.__c.base=t.__e}),de(e)}function fe(e){(!e.__d&&(e.__d=!0)&&_.push(e)&&!pe.__r++||v!=h.debounceRendering)&&((v=h.debounceRendering)||y)(pe)}function pe(){try{for(var e,t=1;_.length;)_.length>t&&_.sort(b),e=_.shift(),t=_.length,ue(e)}finally{_.length=pe.__r=0}}function me(e,t,n,r,i,a,o,s,c,l,u){var d,f,p,m,h,g,_,v=r&&r.__k||ne,y=t.length;for(c=he(n,t,v,c,y),d=0;d<y;d++)(p=n.__k[d])!=null&&(f=p.__i!=-1&&v[p.__i]||te,p.__i=d,g=Se(e,p,f,i,a,o,s,c,l,u),m=p.__e,p.ref&&f.ref!=p.ref&&(f.ref&&De(f.ref,null,p),u.push(p.ref,p.__c||m,p)),h==null&&m!=null&&(h=m),(_=!!(4&p.__u))||f.__k===p.__k?(c=ge(p,c,e,_),_&&f.__e&&(f.__e=null)):typeof p.type==`function`&&g!==void 0?c=g:m&&(c=m.nextSibling),p.__u&=-7);return n.__e=h,c}function he(e,t,n,r,i){var a,o,s,c,l,u=n.length,d=u,f=0;for(e.__k=Array(i),a=0;a<i;a++)(o=t[a])!=null&&typeof o!=`boolean`&&typeof o!=`function`?(typeof o==`string`||typeof o==`number`||typeof o==`bigint`||o.constructor==String?o=e.__k[a]=ae(null,o,null,null,null):O(o)?o=e.__k[a]=ae(se,{children:o},null,null,null):o.constructor===void 0&&o.__b>0?o=e.__k[a]=ae(o.type,o.props,o.key,o.ref?o.ref:null,o.__v):e.__k[a]=o,c=a+f,o.__=e,o.__b=e.__b+1,s=null,(l=o.__i=ve(o,n,c,d))!=-1&&(d--,(s=n[l])&&(s.__u|=2)),s==null||s.__v==null?(l==-1&&(i>u?f--:i<u&&f++),typeof o.type!=`function`&&(o.__u|=4)):l!=c&&(l==c-1?f--:l==c+1?f++:(l>c?f--:f++,o.__u|=4))):e.__k[a]=null;if(d)for(a=0;a<u;a++)(s=n[a])!=null&&!(2&s.__u)&&(s.__e==r&&(r=le(s)),Oe(s,s));return r}function ge(e,t,n,r){var i,a;if(typeof e.type==`function`){for(i=e.__k,a=0;i&&a<i.length;a++)i[a]&&(i[a].__=e,t=ge(i[a],t,n,r));return t}e.__e!=t&&(r&&(t&&e.type&&!t.parentNode&&(t=le(e)),n.insertBefore(e.__e,t||null)),t=e.__e);do t&&=t.nextSibling;while(t!=null&&t.nodeType==8);return t}function _e(e,t){return t||=[],e==null||typeof e==`boolean`||(O(e)?e.some(function(e){_e(e,t)}):t.push(e)),t}function ve(e,t,n,r){var i,a,o,s=e.key,c=e.type,l=t[n],u=l!=null&&(2&l.__u)==0;if(l===null&&s==null||u&&s==l.key&&c==l.type)return n;if(r>+!!u){for(i=n-1,a=n+1;i>=0||a<t.length;)if((l=t[o=i>=0?i--:a++])!=null&&!(2&l.__u)&&s==l.key&&c==l.type)return o}return-1}function ye(e,t,n){t[0]==`-`?e.setProperty(t,n??``):e[t]=n==null?``:typeof n!=`number`||re.test(t)?n:n+`px`}function be(e,t,n,r,i){var a,o;n:if(t==`style`)if(typeof n==`string`)e.style.cssText=n;else{if(typeof r==`string`&&(e.style.cssText=r=``),r)for(t in r)n&&t in n||ye(e.style,t,``);if(n)for(t in n)r&&n[t]==r[t]||ye(e.style,t,n[t])}else if(t[0]==`o`&&t[1]==`n`)a=t!=(t=t.replace(w,`$1`)),o=t.toLowerCase(),t=o in e||t==`onFocusOut`||t==`onFocusIn`?o.slice(2):t.slice(2),e.l||={},e.l[t+a]=n,n?r?n[C]=r[C]:(n[C]=T,e.addEventListener(t,a?ee:E,a)):e.removeEventListener(t,a?ee:E,a);else{if(i==`http://www.w3.org/2000/svg`)t=t.replace(/xlink(H|:h)/,`h`).replace(/sName$/,`s`);else if(t!=`width`&&t!=`height`&&t!=`href`&&t!=`list`&&t!=`form`&&t!=`tabIndex`&&t!=`download`&&t!=`rowSpan`&&t!=`colSpan`&&t!=`role`&&t!=`popover`&&t in e)try{e[t]=n??``;break n}catch{}typeof n==`function`||(n==null||!1===n&&t[4]!=`-`?e.removeAttribute(t):e.setAttribute(t,t==`popover`&&n==1?``:n))}}function xe(e){return function(t){if(this.l){var n=this.l[t.type+e];if(t[S]==null)t[S]=T++;else if(t[S]<n[C])return;return n(h.event?h.event(t):t)}}}function Se(e,t,n,r,i,a,o,s,c,l){var u,d,f,p,m,g,_,v,y,b,x,S,C,w,T,E=t.type;if(t.constructor!==void 0)return null;128&n.__u&&(c=!!(32&n.__u),a=[s=t.__e=n.__e]),(u=h.__b)&&u(t);n:if(typeof E==`function`)try{if(v=t.props,y=E.prototype&&E.prototype.render,b=(u=E.contextType)&&r[u.__c],x=u?b?b.props.value:u.__:r,n.__c?_=(d=t.__c=n.__c).__=d.__E:(y?t.__c=d=new E(v,x):(t.__c=d=new ce(v,x),d.constructor=E,d.render=ke),b&&b.sub(d),d.state||={},d.__n=r,f=d.__d=!0,d.__h=[],d._sb=[]),y&&d.__s==null&&(d.__s=d.state),y&&E.getDerivedStateFromProps!=null&&(d.__s==d.state&&(d.__s=k({},d.__s)),k(d.__s,E.getDerivedStateFromProps(v,d.__s))),p=d.props,m=d.state,d.__v=t,f)y&&E.getDerivedStateFromProps==null&&d.componentWillMount!=null&&d.componentWillMount(),y&&d.componentDidMount!=null&&d.__h.push(d.componentDidMount);else{if(y&&E.getDerivedStateFromProps==null&&v!==p&&d.componentWillReceiveProps!=null&&d.componentWillReceiveProps(v,x),t.__v==n.__v||!d.__e&&d.shouldComponentUpdate!=null&&!1===d.shouldComponentUpdate(v,d.__s,x)){t.__v!=n.__v&&(d.props=v,d.state=d.__s,d.__d=!1),t.__e=n.__e,t.__k=n.__k,t.__k.some(function(e){e&&(e.__=t)}),ne.push.apply(d.__h,d._sb),d._sb=[],d.__h.length&&o.push(d);break n}d.componentWillUpdate!=null&&d.componentWillUpdate(v,d.__s,x),y&&d.componentDidUpdate!=null&&d.__h.push(function(){d.componentDidUpdate(p,m,g)})}if(d.context=x,d.props=v,d.__P=e,d.__e=!1,S=h.__r,C=0,y)d.state=d.__s,d.__d=!1,S&&S(t),u=d.render(d.props,d.state,d.context),ne.push.apply(d.__h,d._sb),d._sb=[];else do d.__d=!1,S&&S(t),u=d.render(d.props,d.state,d.context),d.state=d.__s;while(d.__d&&++C<25);d.state=d.__s,d.getChildContext!=null&&(r=k(k({},r),d.getChildContext())),y&&!f&&d.getSnapshotBeforeUpdate!=null&&(g=d.getSnapshotBeforeUpdate(p,m)),w=u!=null&&u.type===se&&u.key==null?Te(u.props.children):u,s=me(e,O(w)?w:[w],t,n,r,i,a,o,s,c,l),d.base=t.__e,t.__u&=-161,d.__h.length&&o.push(d),_&&(d.__E=d.__=null)}catch(e){if(t.__v=null,c||a!=null)if(e.then){for(t.__u|=c?160:128;s&&s.nodeType==8&&s.nextSibling;)s=s.nextSibling;a[a.indexOf(s)]=null,t.__e=s}else{for(T=a.length;T--;)ie(a[T]);Ce(t)}else t.__e=n.__e,t.__k=n.__k,e.then||Ce(t);h.__e(e,t,n)}else a==null&&t.__v==n.__v?(t.__k=n.__k,t.__e=n.__e):s=t.__e=Ee(n.__e,t,n,r,i,a,o,c,l);return(u=h.diffed)&&u(t),128&t.__u?void 0:s}function Ce(e){e&&(e.__c&&(e.__c.__e=!0),e.__k&&e.__k.some(Ce))}function we(e,t,n){for(var r=0;r<n.length;r++)De(n[r],n[++r],n[++r]);h.__c&&h.__c(t,e),e.some(function(t){try{e=t.__h,t.__h=[],e.some(function(e){e.call(t)})}catch(e){h.__e(e,t.__v)}})}function Te(e){return typeof e!=`object`||!e||e.__b>0?e:O(e)?e.map(Te):k({},e)}function Ee(e,t,n,r,i,a,o,s,c){var l,u,d,f,p,g,_,v=n.props||te,y=t.props,b=t.type;if(b==`svg`?i=`http://www.w3.org/2000/svg`:b==`math`?i=`http://www.w3.org/1998/Math/MathML`:i||=`http://www.w3.org/1999/xhtml`,a!=null){for(l=0;l<a.length;l++)if((p=a[l])&&`setAttribute`in p==!!b&&(b?p.localName==b:p.nodeType==3)){e=p,a[l]=null;break}}if(e==null){if(b==null)return document.createTextNode(y);e=document.createElementNS(i,b,y.is&&y),s&&=(h.__m&&h.__m(t,a),!1),a=null}if(b==null)v===y||s&&e.data==y||(e.data=y);else{if(a&&=m.call(e.childNodes),!s&&a!=null)for(v={},l=0;l<e.attributes.length;l++)v[(p=e.attributes[l]).name]=p.value;for(l in v)p=v[l],l==`dangerouslySetInnerHTML`?d=p:l==`children`||l in y||l==`value`&&`defaultValue`in y||l==`checked`&&`defaultChecked`in y||be(e,l,null,p,i);for(l in y)p=y[l],l==`children`?f=p:l==`dangerouslySetInnerHTML`?u=p:l==`value`?g=p:l==`checked`?_=p:s&&typeof p!=`function`||v[l]===p||be(e,l,p,v[l],i);if(u)s||d&&(u.__html==d.__html||u.__html==e.innerHTML)||(e.innerHTML=u.__html),t.__k=[];else if(d&&(e.innerHTML=``),me(t.type==`template`?e.content:e,O(f)?f:[f],t,n,r,b==`foreignObject`?`http://www.w3.org/1999/xhtml`:i,a,o,a?a[0]:n.__k&&le(n,0),s,c),a!=null)for(l=a.length;l--;)ie(a[l]);s||(l=`value`,b==`progress`&&g==null?e.removeAttribute(`value`):g!=null&&(g!==e[l]||b==`progress`&&!g||b==`option`&&g!=v[l])&&be(e,l,g,v[l],i),l=`checked`,_!=null&&_!=e[l]&&be(e,l,_,v[l],i))}return e}function De(e,t,n){try{if(typeof e==`function`){var r=typeof e.__u==`function`;r&&e.__u(),r&&t==null||(e.__u=e(t))}else e.current=t}catch(e){h.__e(e,n)}}function Oe(e,t,n){var r,i;if(h.unmount&&h.unmount(e),(r=e.ref)&&(r.current&&r.current!=e.__e||De(r,null,t)),(r=e.__c)!=null){if(r.componentWillUnmount)try{r.componentWillUnmount()}catch(e){h.__e(e,t)}r.base=r.__P=null}if(r=e.__k)for(i=0;i<r.length;i++)r[i]&&Oe(r[i],t,n||typeof e.type!=`function`);n||ie(e.__e),e.__c=e.__=e.__e=void 0}function ke(e,t,n){return this.constructor(e,n)}function Ae(e,t,n){var r,i,a,o;t==document&&(t=document.documentElement),h.__&&h.__(e,t),i=(r=typeof n==`function`)?null:n&&n.__k||t.__k,a=[],o=[],Se(t,e=(!r&&n||t).__k=A(se,null,[e]),i||te,te,t.namespaceURI,!r&&n?[n]:i?null:t.firstChild?m.call(t.childNodes):null,a,!r&&n?n:i?i.__e:t.firstChild,r,o),we(a,e,o)}function je(e,t){Ae(e,t,je)}function Me(e,t,n){var r,i,a,o,s=k({},e.props);for(a in e.type&&e.type.defaultProps&&(o=e.type.defaultProps),t)a==`key`?r=t[a]:a==`ref`?i=t[a]:s[a]=t[a]===void 0&&o!=null?o[a]:t[a];return arguments.length>2&&(s.children=arguments.length>3?m.call(arguments,2):n),ae(e.type,s,r||e.key,i||e.ref,null)}function Ne(e){function t(e){var n,r;return this.getChildContext||(n=new Set,(r={})[t.__c]=this,this.getChildContext=function(){return r},this.componentWillUnmount=function(){n=null},this.shouldComponentUpdate=function(e){this.props.value!=e.value&&n.forEach(function(e){e.__e=!0,fe(e)})},this.sub=function(e){n.add(e);var t=e.componentWillUnmount;e.componentWillUnmount=function(){n&&n.delete(e),t&&t.call(e)}}),e.children}return t.__c=`__cC`+ D++,t.__=e,t.Provider=t.__l=(t.Consumer=function(e,t){return e.children(t)}).contextType=t,t}m=ne.slice,h={__e:function(e,t,n,r){for(var i,a,o;t=t.__;)if((i=t.__c)&&!i.__)try{if((a=i.constructor)&&a.getDerivedStateFromError!=null&&(i.setState(a.getDerivedStateFromError(e)),o=i.__d),i.componentDidCatch!=null&&(i.componentDidCatch(e,r||{}),o=i.__d),o)return i.__E=i}catch(t){e=t}throw e}},g=0,ce.prototype.setState=function(e,t){var n=this.__s!=null&&this.__s!=this.state?this.__s:this.__s=k({},this.state);typeof e==`function`&&(e=e(k({},n),this.props)),e&&k(n,e),e!=null&&this.__v&&(t&&this._sb.push(t),fe(this))},ce.prototype.forceUpdate=function(e){this.__v&&(this.__e=!0,e&&this.__h.push(e),fe(this))},ce.prototype.render=se,_=[],y=typeof Promise==`function`?Promise.prototype.then.bind(Promise.resolve()):setTimeout,b=function(e,t){return e.__v.__b-t.__v.__b},pe.__r=0,x=Math.random().toString(8),S=`__d`+x,C=`__a`+x,w=/(PointerCapture)$|Capture$/i,T=0,E=xe(!1),ee=xe(!0),D=0;var Pe,j,Fe,Ie,Le=0,Re=[],M=h,ze=M.__b,Be=M.__r,Ve=M.diffed,He=M.__c,Ue=M.unmount,We=M.__;function Ge(e,t){M.__h&&M.__h(j,e,Le||t),Le=0;var n=j.__H||={__:[],__h:[]};return e>=n.__.length&&n.__.push({}),n.__[e]}function N(e){return Le=1,Ke(ot,e)}function Ke(e,t,n){var r=Ge(Pe++,2);if(r.t=e,!r.__c&&(r.__=[n?n(t):ot(void 0,t),function(e){var t=r.__N?r.__N[0]:r.__[0],n=r.t(t,e);t!==n&&(r.__N=[n,r.__[1]],r.__c.setState({}))}],r.__c=j,!j.__f)){var i=function(e,t,n){if(!r.__c.__H)return!0;var i=r.__c.__H.__.filter(function(e){return e.__c});if(i.every(function(e){return!e.__N}))return!a||a.call(this,e,t,n);var o=r.__c.props!==e;return i.some(function(e){if(e.__N){var t=e.__[0];e.__=e.__N,e.__N=void 0,t!==e.__[0]&&(o=!0)}}),a&&a.call(this,e,t,n)||o};j.__f=!0;var a=j.shouldComponentUpdate,o=j.componentWillUpdate;j.componentWillUpdate=function(e,t,n){if(this.__e){var r=a;a=void 0,i(e,t,n),a=r}o&&o.call(this,e,t,n)},j.shouldComponentUpdate=i}return r.__N||r.__}function P(e,t){var n=Ge(Pe++,3);!M.__s&&at(n.__H,t)&&(n.__=e,n.u=t,j.__H.__h.push(n))}function qe(e,t){var n=Ge(Pe++,4);!M.__s&&at(n.__H,t)&&(n.__=e,n.u=t,j.__h.push(n))}function F(e){return Le=5,Ye(function(){return{current:e}},[])}function Je(e,t,n){Le=6,qe(function(){if(typeof e==`function`){var n=e(t());return function(){e(null),n&&typeof n==`function`&&n()}}if(e)return e.current=t(),function(){return e.current=null}},n==null?n:n.concat(e))}function Ye(e,t){var n=Ge(Pe++,7);return at(n.__H,t)&&(n.__=e(),n.__H=t,n.__h=e),n.__}function Xe(e,t){return Le=8,Ye(function(){return e},t)}function Ze(e){var t=j.context[e.__c],n=Ge(Pe++,9);return n.c=e,t?(n.__??(n.__=!0,t.sub(j)),t.props.value):e.__}function Qe(e,t){M.useDebugValue&&M.useDebugValue(t?t(e):e)}function $e(){var e=Ge(Pe++,11);if(!e.__){for(var t=j.__v;t!==null&&!t.__m&&t.__!==null;)t=t.__;var n=t.__m||=[0,0];e.__=`P`+n[0]+`-`+ n[1]++}return e.__}function et(){for(var e;e=Re.shift();){var t=e.__H;if(e.__P&&t)try{t.__h.some(rt),t.__h.some(it),t.__h=[]}catch(n){t.__h=[],M.__e(n,e.__v)}}}M.__b=function(e){j=null,ze&&ze(e)},M.__=function(e,t){e&&t.__k&&t.__k.__m&&(e.__m=t.__k.__m),We&&We(e,t)},M.__r=function(e){Be&&Be(e),Pe=0;var t=(j=e.__c).__H;t&&(Fe===j?(t.__h=[],j.__h=[],t.__.some(function(e){e.__N&&(e.__=e.__N),e.u=e.__N=void 0})):(t.__h.some(rt),t.__h.some(it),t.__h=[],Pe=0)),Fe=j},M.diffed=function(e){Ve&&Ve(e);var t=e.__c;t&&t.__H&&(t.__H.__h.length&&(Re.push(t)!==1&&Ie===M.requestAnimationFrame||((Ie=M.requestAnimationFrame)||nt)(et)),t.__H.__.some(function(e){e.u&&(e.__H=e.u),e.u=void 0})),Fe=j=null},M.__c=function(e,t){t.some(function(e){try{e.__h.some(rt),e.__h=e.__h.filter(function(e){return!e.__||it(e)})}catch(n){t.some(function(e){e.__h&&=[]}),t=[],M.__e(n,e.__v)}}),He&&He(e,t)},M.unmount=function(e){Ue&&Ue(e);var t,n=e.__c;n&&n.__H&&(n.__H.__.some(function(e){try{rt(e)}catch(e){t=e}}),n.__H=void 0,t&&M.__e(t,n.__v))};var tt=typeof requestAnimationFrame==`function`;function nt(e){var t,n=function(){clearTimeout(r),tt&&cancelAnimationFrame(t),setTimeout(e)},r=setTimeout(n,35);tt&&(t=requestAnimationFrame(n))}function rt(e){var t=j,n=e.__c;typeof n==`function`&&(e.__c=void 0,n()),j=t}function it(e){var t=j;e.__c=e.__(),j=t}function at(e,t){return!e||e.length!==t.length||t.some(function(t,n){return t!==e[n]})}function ot(e,t){return typeof t==`function`?t(e):t}function st(e,t){for(var n in t)e[n]=t[n];return e}function ct(e,t){for(var n in e)if(n!==`__source`&&!(n in t))return!0;for(var r in t)if(r!==`__source`&&e[r]!==t[r])return!0;return!1}function lt(e,t){var n=t(),r=N({t:{__:n,u:t}}),i=r[0].t,a=r[1];return qe(function(){i.__=n,i.u=t,ut(i)&&a({t:i})},[e,n,t]),P(function(){return ut(i)&&a({t:i}),e(function(){ut(i)&&a({t:i})})},[e]),n}function ut(e){try{return!((t=e.__)===(n=e.u())&&(t!==0||1/t==1/n)||t!=t&&n!=n)}catch{return!0}var t,n}function dt(e){e()}function ft(e){return e}function pt(){return[!1,dt]}var mt=qe;function ht(e,t){this.props=e,this.context=t}function gt(e,t){function n(e){var n=this.props.ref;return n!=e.ref&&n&&(typeof n==`function`?n(null):n.current=null),t?!t(this.props,e)||n!=e.ref:ct(this.props,e)}function r(t){return this.shouldComponentUpdate=n,A(e,t)}return r.displayName=`Memo(`+(e.displayName||e.name)+`)`,r.__f=r.prototype.isReactComponent=!0,r.type=e,r}(ht.prototype=new ce).isPureReactComponent=!0,ht.prototype.shouldComponentUpdate=function(e,t){return ct(this.props,e)||ct(this.state,t)};var _t=h.__b;h.__b=function(e){e.type&&e.type.__f&&e.ref&&(e.props.ref=e.ref,e.ref=null),_t&&_t(e)};var vt=typeof Symbol<`u`&&Symbol.for&&Symbol.for(`react.forward_ref`)||3911;function yt(e){function t(t){var n=st({},t);return delete n.ref,e(n,t.ref||null)}return t.$$typeof=vt,t.render=e,t.prototype.isReactComponent=t.__f=!0,t.displayName=`ForwardRef(`+(e.displayName||e.name)+`)`,t}var bt=function(e,t){return e==null?null:_e(_e(e).map(t))},xt={map:bt,forEach:bt,count:function(e){return e?_e(e).length:0},only:function(e){var t=_e(e);if(t.length!==1)throw`Children.only`;return t[0]},toArray:_e},St=h.__e;h.__e=function(e,t,n,r){if(e.then){for(var i,a=t;a=a.__;)if((i=a.__c)&&i.__c)return t.__e??(t.__e=n.__e,t.__k=n.__k),i.__c(e,t)}St(e,t,n,r)};var Ct=h.unmount;function wt(e,t,n){return e&&(e.__c&&e.__c.__H&&(e.__c.__H.__.forEach(function(e){typeof e.__c==`function`&&e.__c()}),e.__c.__H=null),(e=st({},e)).__c!=null&&(e.__c.__P===n&&(e.__c.__P=t),e.__c.__e=!0,e.__c=null),e.__k=e.__k&&e.__k.map(function(e){return wt(e,t,n)})),e}function Tt(e,t,n){return e&&n&&(e.__v=null,e.__k=e.__k&&e.__k.map(function(e){return Tt(e,t,n)}),e.__c&&e.__c.__P===t&&(e.__e&&n.appendChild(e.__e),e.__c.__e=!0,e.__c.__P=n)),e}function Et(){this.__u=0,this.o=null,this.__b=null}function Dt(e){var t=e.__&&e.__.__c;return t&&t.__a&&t.__a(e)}function Ot(e){var t,n,r,i=null;function a(a){if(t||(t=e()).then(function(e){e&&(i=e.default||e),r=!0},function(e){n=e,r=!0}),n)throw n;if(!r)throw t;return i?A(i,a):null}return a.displayName=`Lazy`,a.__f=!0,a}function kt(){this.i=null,this.l=null}h.unmount=function(e){var t=e.__c;t&&(t.__z=!0),t&&t.__R&&t.__R(),t&&32&e.__u&&(e.type=null),Ct&&Ct(e)},(Et.prototype=new ce).__c=function(e,t){var n=t.__c,r=this;r.o??=[],r.o.push(n);var i=Dt(r.__v),a=!1,o=function(){a||r.__z||(a=!0,n.__R=null,i?i(c):c())};n.__R=o;var s=n.__P;n.__P=null;var c=function(){if(!--r.__u){if(r.state.__a){var e=r.state.__a;r.__v.__k[0]=Tt(e,e.__c.__P,e.__c.__O)}var t;for(r.setState({__a:r.__b=null});t=r.o.pop();)t.__P=s,t.forceUpdate()}};r.__u++||32&t.__u||r.setState({__a:r.__b=r.__v.__k[0]}),e.then(o,o)},Et.prototype.componentWillUnmount=function(){this.o=[]},Et.prototype.render=function(e,t){if(this.__b){if(this.__v.__k){var n=document.createElement(`div`),r=this.__v.__k[0].__c;this.__v.__k[0]=wt(this.__b,n,r.__O=r.__P)}this.__b=null}var i=t.__a&&A(se,null,e.fallback);return i&&(i.__u&=-33),[A(se,null,t.__a?null:e.children),i]};var At=function(e,t,n){if(++n[1]===n[0]&&e.l.delete(t),e.props.revealOrder&&(e.props.revealOrder[0]!==`t`||!e.l.size))for(n=e.i;n;){for(;n.length>3;)n.pop()();if(n[1]<n[0])break;e.i=n=n[2]}};function jt(e){return this.getChildContext=function(){return e.context},e.children}function Mt(e){var t=this,n=e.h;if(t.componentWillUnmount=function(){Ae(null,t.v),t.v=null,t.h=null},t.h&&t.h!==n&&t.componentWillUnmount(),!t.v){for(var r=t.__v;r!==null&&!r.__m&&r.__!==null;)r=r.__;t.h=n,t.v={nodeType:1,parentNode:n,childNodes:[],__k:{__m:r.__m},contains:function(){return!0},namespaceURI:n.namespaceURI,insertBefore:function(e,n){this.childNodes.push(e),t.h.insertBefore(e,n)},removeChild:function(e){this.childNodes.splice(this.childNodes.indexOf(e)>>>1,1),t.h.removeChild(e)}}}Ae(A(jt,{context:t.context},e.__v),t.v)}function Nt(e,t){var n=A(Mt,{__v:e,h:t});return n.containerInfo=t,n}(kt.prototype=new ce).__a=function(e){var t=this,n=Dt(t.__v),r=t.l.get(e);return r[0]++,function(i){var a=function(){t.props.revealOrder?(r.push(i),At(t,e,r)):i()};n?n(a):a()}},kt.prototype.render=function(e){this.i=null,this.l=new Map;var t=_e(e.children);e.revealOrder&&e.revealOrder[0]===`b`&&t.reverse();for(var n=t.length;n--;)this.l.set(t[n],this.i=[1,0,this.i]);return e.children},kt.prototype.componentDidUpdate=kt.prototype.componentDidMount=function(){var e=this;this.l.forEach(function(t,n){At(e,n,t)})};var Pt=typeof Symbol<`u`&&Symbol.for&&Symbol.for(`react.element`)||60103,Ft=/^(?:accent|alignment|arabic|baseline|cap|clip(?!PathU)|color|dominant|fill|flood|font|glyph(?!R)|horiz|image(!S)|letter|lighting|marker(?!H|W|U)|overline|paint|pointer|shape|stop|strikethrough|stroke|text(?!L)|transform|underline|unicode|units|v|vector|vert|word|writing|x(?!C))[A-Z]/,It=/^on(Ani|Tra|Tou|BeforeInp|Compo)/,Lt=/[A-Z0-9]/g,Rt=typeof document<`u`,zt=function(e){return(typeof Symbol<`u`&&typeof Symbol()==`symbol`?/fil|che|rad/:/fil|che|ra/).test(e)};function Bt(e,t,n){return t.__k??(t.textContent=``),Ae(e,t),typeof n==`function`&&n(),e?e.__c:null}function Vt(e,t,n){return je(e,t),typeof n==`function`&&n(),e?e.__c:null}ce.prototype.isReactComponent=!0,[`componentWillMount`,`componentWillReceiveProps`,`componentWillUpdate`].forEach(function(e){Object.defineProperty(ce.prototype,e,{configurable:!0,get:function(){return this[`UNSAFE_`+e]},set:function(t){Object.defineProperty(this,e,{configurable:!0,writable:!0,value:t})}})});var Ht=h.event;h.event=function(e){return Ht&&(e=Ht(e)),e.persist=function(){},e.isPropagationStopped=function(){return this.cancelBubble},e.isDefaultPrevented=function(){return this.defaultPrevented},e.nativeEvent=e};var Ut,Wt={configurable:!0,get:function(){return this.class}},Gt=h.vnode;h.vnode=function(e){typeof e.type==`string`&&function(e){var t=e.props,n=e.type,r={},i=n.indexOf(`-`)==-1;for(var a in t){var o=t[a];if(!(a===`value`&&`defaultValue`in t&&o==null||Rt&&a===`children`&&n===`noscript`||a===`class`||a===`className`)){var s=a.toLowerCase();a===`defaultValue`&&`value`in t&&t.value==null?a=`value`:a===`download`&&!0===o?o=``:s===`translate`&&o===`no`?o=!1:s[0]===`o`&&s[1]===`n`?s===`ondoubleclick`?a=`ondblclick`:s!==`onchange`||n!==`input`&&n!==`textarea`||zt(t.type)?s===`onfocus`?a=`onfocusin`:s===`onblur`?a=`onfocusout`:It.test(a)&&(a=s):s=a=`oninput`:i&&Ft.test(a)?a=a.replace(Lt,`-$&`).toLowerCase():o===null&&(o=void 0),s===`oninput`&&r[a=s]&&(a=`oninputCapture`),r[a]=o}}n==`select`&&(r.multiple&&Array.isArray(r.value)&&(r.value=_e(t.children).forEach(function(e){e.props.selected=r.value.indexOf(e.props.value)!=-1})),r.defaultValue!=null&&(r.value=_e(t.children).forEach(function(e){e.props.selected=r.multiple?r.defaultValue.indexOf(e.props.value)!=-1:r.defaultValue==e.props.value}))),t.class&&!t.className?(r.class=t.class,Object.defineProperty(r,`className`,Wt)):t.className&&(r.class=r.className=t.className),e.props=r}(e),e.$$typeof=Pt,Gt&&Gt(e)};var Kt=h.__r;h.__r=function(e){Kt&&Kt(e),Ut=e.__c};var qt=h.diffed;h.diffed=function(e){qt&&qt(e);var t=e.props,n=e.__e;n!=null&&e.type===`textarea`&&`value`in t&&t.value!==n.value&&(n.value=t.value==null?``:t.value),Ut=null};var Jt={ReactCurrentDispatcher:{current:{readContext:function(e){return Ut.__n[e.__c].props.value},useCallback:Xe,useContext:Ze,useDebugValue:Qe,useDeferredValue:ft,useEffect:P,useId:$e,useImperativeHandle:Je,useInsertionEffect:mt,useLayoutEffect:qe,useMemo:Ye,useReducer:Ke,useRef:F,useState:N,useSyncExternalStore:lt,useTransition:pt}}};function Yt(e){return A.bind(null,e)}function Xt(e){return!!e&&e.$$typeof===Pt}function Zt(e){return Xt(e)&&e.type===se}function Qt(e){return!!e&&typeof e.displayName==`string`&&e.displayName.indexOf(`Memo(`)==0}function $t(e){return Xt(e)?Me.apply(null,arguments):e}function en(e){return!!e.__k&&(Ae(null,e),!0)}function tn(e){return e&&(e.base||e.nodeType===1&&e)||null}var nn={useState:N,useId:$e,useReducer:Ke,useEffect:P,useLayoutEffect:qe,useInsertionEffect:mt,useTransition:pt,useDeferredValue:ft,useSyncExternalStore:lt,startTransition:dt,useRef:F,useImperativeHandle:Je,useMemo:Ye,useCallback:Xe,useContext:Ze,useDebugValue:Qe,version:`18.3.1`,Children:xt,render:Bt,hydrate:Vt,unmountComponentAtNode:en,createPortal:Nt,createElement:A,createContext:Ne,createFactory:Yt,cloneElement:$t,createRef:oe,Fragment:se,isValidElement:Xt,isElement:Xt,isFragment:Zt,isMemo:Qt,findDOMNode:tn,Component:ce,PureComponent:ht,memo:gt,forwardRef:yt,flushSync:function(e,t){var n=h.debounceRendering;h.debounceRendering=function(e){return e()};var r=e(t);return h.debounceRendering=n,r},unstable_batchedUpdates:function(e,t){return e(t)},StrictMode:se,Suspense:Et,SuspenseList:kt,lazy:Ot,__SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED:Jt};function rn(e){return{render:function(t){Bt(t,e)},unmount:function(){en(e)}}}var an=c(o(((e,t)=>{(function(){"use strict";var e={}.hasOwnProperty;function n(){for(var e=``,t=0;t<arguments.length;t++){var n=arguments[t];n&&(e=i(e,r(n)))}return e}function r(t){if(typeof t==`string`||typeof t==`number`)return t;if(typeof t!=`object`)return``;if(Array.isArray(t))return n.apply(null,t);if(t.toString!==Object.prototype.toString&&!t.toString.toString().includes(`[native code]`))return t.toString();var r=``;for(var a in t)e.call(t,a)&&t[a]&&(r=i(r,a));return r}function i(e,t){return t?e?e+` `+t:e+t:e}t!==void 0&&t.exports?(n.default=n,t.exports=n):typeof define==`function`&&typeof define.amd==`object`&&define.amd?define(`classnames`,[],function(){return n}):window.classNames=n})()}))());function on(e,t,n){return(t=pn(t))in e?Object.defineProperty(e,t,{value:n,enumerable:!0,configurable:!0,writable:!0}):e[t]=n,e}function sn(){return sn=Object.assign?Object.assign.bind():function(e){for(var t=1;t<arguments.length;t++){var n=arguments[t];for(var r in n)({}).hasOwnProperty.call(n,r)&&(e[r]=n[r])}return e},sn.apply(null,arguments)}function cn(e,t){var n=Object.keys(e);if(Object.getOwnPropertySymbols){var r=Object.getOwnPropertySymbols(e);t&&(r=r.filter(function(t){return Object.getOwnPropertyDescriptor(e,t).enumerable})),n.push.apply(n,r)}return n}function ln(e){for(var t=1;t<arguments.length;t++){var n=arguments[t]==null?{}:arguments[t];t%2?cn(Object(n),!0).forEach(function(t){on(e,t,n[t])}):Object.getOwnPropertyDescriptors?Object.defineProperties(e,Object.getOwnPropertyDescriptors(n)):cn(Object(n)).forEach(function(t){Object.defineProperty(e,t,Object.getOwnPropertyDescriptor(n,t))})}return e}function un(e,t){if(e==null)return{};var n,r,i=dn(e,t);if(Object.getOwnPropertySymbols){var a=Object.getOwnPropertySymbols(e);for(r=0;r<a.length;r++)n=a[r],t.indexOf(n)===-1&&{}.propertyIsEnumerable.call(e,n)&&(i[n]=e[n])}return i}function dn(e,t){if(e==null)return{};var n={};for(var r in e)if({}.hasOwnProperty.call(e,r)){if(t.indexOf(r)!==-1)continue;n[r]=e[r]}return n}function fn(e,t){if(typeof e!=`object`||!e)return e;var n=e[Symbol.toPrimitive];if(n!==void 0){var r=n.call(e,t||`default`);if(typeof r!=`object`)return r;throw TypeError(`@@toPrimitive must return a primitive value.`)}return(t===`string`?String:Number)(e)}function pn(e){var t=fn(e,`string`);return typeof t==`symbol`?t:t+``}function mn(e){"@babel/helpers - typeof";return mn=typeof Symbol==`function`&&typeof Symbol.iterator==`symbol`?function(e){return typeof e}:function(e){return e&&typeof Symbol==`function`&&e.constructor===Symbol&&e!==Symbol.prototype?`symbol`:typeof e},mn(e)}var hn=`1.15.7`;function gn(e){if(typeof window<`u`&&window.navigator)return!!navigator.userAgent.match(e)}var _n=gn(/(?:Trident.*rv[ :]?11\.|msie|iemobile|Windows Phone)/i),vn=gn(/Edge/i),yn=gn(/firefox/i),bn=gn(/safari/i)&&!gn(/chrome/i)&&!gn(/android/i),xn=gn(/iP(ad|od|hone)/i),Sn=gn(/chrome/i)&&gn(/android/i),Cn={capture:!1,passive:!1};function I(e,t,n){e.addEventListener(t,n,!_n&&Cn)}function L(e,t,n){e.removeEventListener(t,n,!_n&&Cn)}function wn(e,t){if(t){if(t[0]===`>`&&(t=t.substring(1)),e)try{if(e.matches)return e.matches(t);if(e.msMatchesSelector)return e.msMatchesSelector(t);if(e.webkitMatchesSelector)return e.webkitMatchesSelector(t)}catch{return!1}return!1}}function Tn(e){return e.host&&e!==document&&e.host.nodeType&&e.host!==e?e.host:e.parentNode}function En(e,t,n,r){if(e){n||=document;do{if(t!=null&&(t[0]===`>`?e.parentNode===n&&wn(e,t):wn(e,t))||r&&e===n)return e;if(e===n)break}while(e=Tn(e))}return null}var Dn=/\s+/g;function On(e,t,n){e&&t&&(e.classList?e.classList[n?`add`:`remove`](t):e.className=((` `+e.className+` `).replace(Dn,` `).replace(` `+t+` `,` `)+(n?` `+t:``)).replace(Dn,` `))}function R(e,t,n){var r=e&&e.style;if(r){if(n===void 0)return document.defaultView&&document.defaultView.getComputedStyle?n=document.defaultView.getComputedStyle(e,``):e.currentStyle&&(n=e.currentStyle),t===void 0?n:n[t];!(t in r)&&t.indexOf(`webkit`)===-1&&(t=`-webkit-`+t),r[t]=n+(typeof n==`string`?``:`px`)}}function kn(e,t){var n=``;if(typeof e==`string`)n=e;else do{var r=R(e,`transform`);r&&r!==`none`&&(n=r+` `+n)}while(!t&&(e=e.parentNode));var i=window.DOMMatrix||window.WebKitCSSMatrix||window.CSSMatrix||window.MSCSSMatrix;return i&&new i(n)}function An(e,t,n){if(e){var r=e.getElementsByTagName(t),i=0,a=r.length;if(n)for(;i<a;i++)n(r[i],i);return r}return[]}function jn(){return document.scrollingElement||document.documentElement}function z(e,t,n,r,i){if(!(!e.getBoundingClientRect&&e!==window)){var a,o,s,c,l,u,d;if(e!==window&&e.parentNode&&e!==jn()?(a=e.getBoundingClientRect(),o=a.top,s=a.left,c=a.bottom,l=a.right,u=a.height,d=a.width):(o=0,s=0,c=window.innerHeight,l=window.innerWidth,u=window.innerHeight,d=window.innerWidth),(t||n)&&e!==window&&(i||=e.parentNode,!_n))do if(i&&i.getBoundingClientRect&&(R(i,`transform`)!==`none`||n&&R(i,`position`)!==`static`)){var f=i.getBoundingClientRect();o-=f.top+parseInt(R(i,`border-top-width`)),s-=f.left+parseInt(R(i,`border-left-width`)),c=o+a.height,l=s+a.width;break}while(i=i.parentNode);if(r&&e!==window){var p=kn(i||e),m=p&&p.a,h=p&&p.d;p&&(o/=h,s/=m,d/=m,u/=h,c=o+u,l=s+d)}return{top:o,left:s,bottom:c,right:l,width:d,height:u}}}function Mn(e,t,n){for(var r=Rn(e,!0),i=z(e)[t];r;){var a=z(r)[n],o=void 0;if(o=n===`top`||n===`left`?i>=a:i<=a,!o)return r;if(r===jn())break;r=Rn(r,!1)}return!1}function Nn(e,t,n,r){for(var i=0,a=0,o=e.children;a<o.length;){if(o[a].style.display!==`none`&&o[a]!==X.ghost&&(r||o[a]!==X.dragged)&&En(o[a],n.draggable,e,!1)){if(i===t)return o[a];i++}a++}return null}function Pn(e,t){for(var n=e.lastElementChild;n&&(n===X.ghost||R(n,`display`)===`none`||t&&!wn(n,t));)n=n.previousElementSibling;return n||null}function Fn(e,t){var n=0;if(!e||!e.parentNode)return-1;for(;e=e.previousElementSibling;)e.nodeName.toUpperCase()!==`TEMPLATE`&&e!==X.clone&&(!t||wn(e,t))&&n++;return n}function In(e){var t=0,n=0,r=jn();if(e)do{var i=kn(e),a=i.a,o=i.d;t+=e.scrollLeft*a,n+=e.scrollTop*o}while(e!==r&&(e=e.parentNode));return[t,n]}function Ln(e,t){for(var n in e)if(e.hasOwnProperty(n)){for(var r in t)if(t.hasOwnProperty(r)&&t[r]===e[n][r])return Number(n)}return-1}function Rn(e,t){if(!e||!e.getBoundingClientRect)return jn();var n=e,r=!1;do if(n.clientWidth<n.scrollWidth||n.clientHeight<n.scrollHeight){var i=R(n);if(n.clientWidth<n.scrollWidth&&(i.overflowX==`auto`||i.overflowX==`scroll`)||n.clientHeight<n.scrollHeight&&(i.overflowY==`auto`||i.overflowY==`scroll`)){if(!n.getBoundingClientRect||n===document.body)return jn();if(r||t)return n;r=!0}}while(n=n.parentNode);return jn()}function zn(e,t){if(e&&t)for(var n in t)t.hasOwnProperty(n)&&(e[n]=t[n]);return e}function Bn(e,t){return Math.round(e.top)===Math.round(t.top)&&Math.round(e.left)===Math.round(t.left)&&Math.round(e.height)===Math.round(t.height)&&Math.round(e.width)===Math.round(t.width)}var Vn;function Hn(e,t){return function(){if(!Vn){var n=arguments,r=this;n.length===1?e.call(r,n[0]):e.apply(r,n),Vn=setTimeout(function(){Vn=void 0},t)}}}function Un(){clearTimeout(Vn),Vn=void 0}function Wn(e,t,n){e.scrollLeft+=t,e.scrollTop+=n}function Gn(e){var t=window.Polymer,n=window.jQuery||window.Zepto;return t&&t.dom?t.dom(e).cloneNode(!0):n?n(e).clone(!0)[0]:e.cloneNode(!0)}function Kn(e,t,n){var r={};return Array.from(e.children).forEach(function(i){if(!(!En(i,t.draggable,e,!1)||i.animated||i===n)){var a=z(i);r.left=Math.min(r.left??1/0,a.left),r.top=Math.min(r.top??1/0,a.top),r.right=Math.max(r.right??-1/0,a.right),r.bottom=Math.max(r.bottom??-1/0,a.bottom)}}),r.width=r.right-r.left,r.height=r.bottom-r.top,r.x=r.left,r.y=r.top,r}var B=`Sortable`+new Date().getTime();function qn(){var e=[],t;return{captureAnimationState:function(){e=[],this.options.animation&&[].slice.call(this.el.children).forEach(function(t){if(!(R(t,`display`)===`none`||t===X.ghost)){e.push({target:t,rect:z(t)});var n=ln({},e[e.length-1].rect);if(t.thisAnimationDuration){var r=kn(t,!0);r&&(n.top-=r.f,n.left-=r.e)}t.fromRect=n}})},addAnimationState:function(t){e.push(t)},removeAnimationState:function(t){e.splice(Ln(e,{target:t}),1)},animateAll:function(n){var r=this;if(!this.options.animation){clearTimeout(t),typeof n==`function`&&n();return}var i=!1,a=0;e.forEach(function(e){var t=0,n=e.target,o=n.fromRect,s=z(n),c=n.prevFromRect,l=n.prevToRect,u=e.rect,d=kn(n,!0);d&&(s.top-=d.f,s.left-=d.e),n.toRect=s,n.thisAnimationDuration&&Bn(c,s)&&!Bn(o,s)&&(u.top-s.top)/(u.left-s.left)===(o.top-s.top)/(o.left-s.left)&&(t=Yn(u,c,l,r.options)),Bn(s,o)||(n.prevFromRect=o,n.prevToRect=s,t||=r.options.animation,r.animate(n,u,s,t)),t&&(i=!0,a=Math.max(a,t),clearTimeout(n.animationResetTimer),n.animationResetTimer=setTimeout(function(){n.animationTime=0,n.prevFromRect=null,n.fromRect=null,n.prevToRect=null,n.thisAnimationDuration=null},t),n.thisAnimationDuration=t)}),clearTimeout(t),i?t=setTimeout(function(){typeof n==`function`&&n()},a):typeof n==`function`&&n(),e=[]},animate:function(e,t,n,r){if(r){R(e,`transition`,``),R(e,`transform`,``);var i=kn(this.el),a=i&&i.a,o=i&&i.d,s=(t.left-n.left)/(a||1),c=(t.top-n.top)/(o||1);e.animatingX=!!s,e.animatingY=!!c,R(e,`transform`,`translate3d(`+s+`px,`+c+`px,0)`),this.forRepaintDummy=Jn(e),R(e,`transition`,`transform `+r+`ms`+(this.options.easing?` `+this.options.easing:``)),R(e,`transform`,`translate3d(0,0,0)`),typeof e.animated==`number`&&clearTimeout(e.animated),e.animated=setTimeout(function(){R(e,`transition`,``),R(e,`transform`,``),e.animated=!1,e.animatingX=!1,e.animatingY=!1},r)}}}}function Jn(e){return e.offsetWidth}function Yn(e,t,n,r){return Math.sqrt((t.top-e.top)**2+(t.left-e.left)**2)/Math.sqrt((t.top-n.top)**2+(t.left-n.left)**2)*r.animation}var Xn=[],Zn={initializeByDefault:!0},Qn={mount:function(e){for(var t in Zn)Zn.hasOwnProperty(t)&&!(t in e)&&(e[t]=Zn[t]);Xn.forEach(function(t){if(t.pluginName===e.pluginName)throw`Sortable: Cannot mount plugin ${e.pluginName} more than once`}),Xn.push(e)},pluginEvent:function(e,t,n){var r=this;this.eventCanceled=!1,n.cancel=function(){r.eventCanceled=!0};var i=e+`Global`;Xn.forEach(function(r){t[r.pluginName]&&(t[r.pluginName][i]&&t[r.pluginName][i](ln({sortable:t},n)),t.options[r.pluginName]&&t[r.pluginName][e]&&t[r.pluginName][e](ln({sortable:t},n)))})},initializePlugins:function(e,t,n,r){for(var i in Xn.forEach(function(r){var i=r.pluginName;if(!(!e.options[i]&&!r.initializeByDefault)){var a=new r(e,t,e.options);a.sortable=e,a.options=e.options,e[i]=a,sn(n,a.defaults)}}),e.options)if(e.options.hasOwnProperty(i)){var a=this.modifyOption(e,i,e.options[i]);a!==void 0&&(e.options[i]=a)}},getEventProperties:function(e,t){var n={};return Xn.forEach(function(r){typeof r.eventProperties==`function`&&sn(n,r.eventProperties.call(t[r.pluginName],e))}),n},modifyOption:function(e,t,n){var r;return Xn.forEach(function(i){e[i.pluginName]&&i.optionListeners&&typeof i.optionListeners[t]==`function`&&(r=i.optionListeners[t].call(e[i.pluginName],n))}),r}};function $n(e){var t=e.sortable,n=e.rootEl,r=e.name,i=e.targetEl,a=e.cloneEl,o=e.toEl,s=e.fromEl,c=e.oldIndex,l=e.newIndex,u=e.oldDraggableIndex,d=e.newDraggableIndex,f=e.originalEvent,p=e.putSortable,m=e.extraEventProperties;if(t||=n&&n[B],t){var h,g=t.options,_=`on`+r.charAt(0).toUpperCase()+r.substr(1);window.CustomEvent&&!_n&&!vn?h=new CustomEvent(r,{bubbles:!0,cancelable:!0}):(h=document.createEvent(`Event`),h.initEvent(r,!0,!0)),h.to=o||n,h.from=s||n,h.item=i||n,h.clone=a,h.oldIndex=c,h.newIndex=l,h.oldDraggableIndex=u,h.newDraggableIndex=d,h.originalEvent=f,h.pullMode=p?p.lastPutMode:void 0;var v=ln(ln({},m),Qn.getEventProperties(r,t));for(var y in v)h[y]=v[y];n&&n.dispatchEvent(h),g[_]&&g[_].call(t,h)}}var er=[`evt`],V=function(e,t){var n=arguments.length>2&&arguments[2]!==void 0?arguments[2]:{},r=n.evt,i=un(n,er);Qn.pluginEvent.bind(X)(e,t,ln({dragEl:U,parentEl:W,ghostEl:G,rootEl:K,nextEl:tr,lastDownEl:nr,cloneEl:q,cloneHidden:rr,dragStarted:vr,putSortable:J,activeSortable:X.active,originalEvent:r,oldIndex:ir,oldDraggableIndex:or,newIndex:ar,newDraggableIndex:sr,hideGhostForTarget:Ir,unhideGhostForTarget:Lr,cloneNowHidden:function(){rr=!0},cloneNowShown:function(){rr=!1},dispatchSortableEvent:function(e){H({sortable:t,name:e,originalEvent:r})}},i))};function H(e){$n(ln({putSortable:J,cloneEl:q,targetEl:U,rootEl:K,oldIndex:ir,oldDraggableIndex:or,newIndex:ar,newDraggableIndex:sr},e))}var U,W,G,K,tr,nr,q,rr,ir,ar,or,sr,cr,J,lr=!1,ur=!1,dr=[],fr,pr,mr,hr,gr,_r,vr,yr,br,xr=!1,Sr=!1,Cr,Y,wr=[],Tr=!1,Er=[],Dr=typeof document<`u`,Or=xn,kr=vn||_n?`cssFloat`:`float`,Ar=Dr&&!Sn&&!xn&&`draggable`in document.createElement(`div`),jr=function(){if(Dr){if(_n)return!1;var e=document.createElement(`x`);return e.style.cssText=`pointer-events:auto`,e.style.pointerEvents===`auto`}}(),Mr=function(e,t){var n=R(e),r=parseInt(n.width)-parseInt(n.paddingLeft)-parseInt(n.paddingRight)-parseInt(n.borderLeftWidth)-parseInt(n.borderRightWidth),i=Nn(e,0,t),a=Nn(e,1,t),o=i&&R(i),s=a&&R(a),c=o&&parseInt(o.marginLeft)+parseInt(o.marginRight)+z(i).width,l=s&&parseInt(s.marginLeft)+parseInt(s.marginRight)+z(a).width;if(n.display===`flex`)return n.flexDirection===`column`||n.flexDirection===`column-reverse`?`vertical`:`horizontal`;if(n.display===`grid`)return n.gridTemplateColumns.split(` `).length<=1?`vertical`:`horizontal`;if(i&&o.float&&o.float!==`none`){var u=o.float===`left`?`left`:`right`;return a&&(s.clear===`both`||s.clear===u)?`vertical`:`horizontal`}return i&&(o.display===`block`||o.display===`flex`||o.display===`table`||o.display===`grid`||c>=r&&n[kr]===`none`||a&&n[kr]===`none`&&c+l>r)?`vertical`:`horizontal`},Nr=function(e,t,n){var r=n?e.left:e.top,i=n?e.right:e.bottom,a=n?e.width:e.height,o=n?t.left:t.top,s=n?t.right:t.bottom,c=n?t.width:t.height;return r===o||i===s||r+a/2===o+c/2},Pr=function(e,t){var n;return dr.some(function(r){var i=r[B].options.emptyInsertThreshold;if(!(!i||Pn(r))){var a=z(r),o=e>=a.left-i&&e<=a.right+i,s=t>=a.top-i&&t<=a.bottom+i;if(o&&s)return n=r}}),n},Fr=function(e){function t(e,n){return function(r,i,a,o){var s=r.options.group.name&&i.options.group.name&&r.options.group.name===i.options.group.name;if(e==null&&(n||s))return!0;if(e==null||e===!1)return!1;if(n&&e===`clone`)return e;if(typeof e==`function`)return t(e(r,i,a,o),n)(r,i,a,o);var c=(n?r:i).options.group.name;return e===!0||typeof e==`string`&&e===c||e.join&&e.indexOf(c)>-1}}var n={},r=e.group;(!r||mn(r)!=`object`)&&(r={name:r}),n.name=r.name,n.checkPull=t(r.pull,!0),n.checkPut=t(r.put),n.revertClone=r.revertClone,e.group=n},Ir=function(){!jr&&G&&R(G,`display`,`none`)},Lr=function(){!jr&&G&&R(G,`display`,``)};Dr&&!Sn&&document.addEventListener(`click`,function(e){if(ur)return e.preventDefault(),e.stopPropagation&&e.stopPropagation(),e.stopImmediatePropagation&&e.stopImmediatePropagation(),ur=!1,!1},!0);var Rr=function(e){if(U){e=e.touches?e.touches[0]:e;var t=Pr(e.clientX,e.clientY);if(t){var n={};for(var r in e)e.hasOwnProperty(r)&&(n[r]=e[r]);n.target=n.rootEl=t,n.preventDefault=void 0,n.stopPropagation=void 0,t[B]._onDragOver(n)}}},zr=function(e){U&&U.parentNode[B]._isOutsideThisEl(e.target)};function X(e,t){if(!(e&&e.nodeType&&e.nodeType===1))throw`Sortable: \`el\` must be an HTMLElement, not ${{}.toString.call(e)}`;this.el=e,this.options=t=sn({},t),e[B]=this;var n={group:null,sort:!0,disabled:!1,store:null,handle:null,draggable:/^[uo]l$/i.test(e.nodeName)?`>li`:`>*`,swapThreshold:1,invertSwap:!1,invertedSwapThreshold:null,removeCloneOnHide:!0,direction:function(){return Mr(e,this.options)},ghostClass:`sortable-ghost`,chosenClass:`sortable-chosen`,dragClass:`sortable-drag`,ignore:`a, img`,filter:null,preventOnFilter:!0,animation:0,easing:null,setData:function(e,t){e.setData(`Text`,t.textContent)},dropBubble:!1,dragoverBubble:!1,dataIdAttr:`data-id`,delay:0,delayOnTouchOnly:!1,touchStartThreshold:(Number.parseInt?Number:window).parseInt(window.devicePixelRatio,10)||1,forceFallback:!1,fallbackClass:`sortable-fallback`,fallbackOnBody:!1,fallbackTolerance:0,fallbackOffset:{x:0,y:0},supportPointer:X.supportPointer!==!1&&`PointerEvent`in window&&(!bn||xn),emptyInsertThreshold:5};for(var r in Qn.initializePlugins(this,e,n),n)!(r in t)&&(t[r]=n[r]);for(var i in Fr(t),this)i.charAt(0)===`_`&&typeof this[i]==`function`&&(this[i]=this[i].bind(this));this.nativeDraggable=t.forceFallback?!1:Ar,this.nativeDraggable&&(this.options.touchStartThreshold=1),t.supportPointer?I(e,`pointerdown`,this._onTapStart):(I(e,`mousedown`,this._onTapStart),I(e,`touchstart`,this._onTapStart)),this.nativeDraggable&&(I(e,`dragover`,this),I(e,`dragenter`,this)),dr.push(this.el),t.store&&t.store.get&&this.sort(t.store.get(this)||[]),sn(this,qn())}X.prototype={constructor:X,_isOutsideThisEl:function(e){!this.el.contains(e)&&e!==this.el&&(yr=null)},_getDirection:function(e,t){return typeof this.options.direction==`function`?this.options.direction.call(this,e,t,U):this.options.direction},_onTapStart:function(e){if(e.cancelable){var t=this,n=this.el,r=this.options,i=r.preventOnFilter,a=e.type,o=e.touches&&e.touches[0]||e.pointerType&&e.pointerType===`touch`&&e,s=(o||e).target,c=e.target.shadowRoot&&(e.path&&e.path[0]||e.composedPath&&e.composedPath()[0])||s,l=r.filter;if(Yr(n),!U&&!(/mousedown|pointerdown/.test(a)&&e.button!==0||r.disabled)&&!c.isContentEditable&&!(!this.nativeDraggable&&bn&&s&&s.tagName.toUpperCase()===`SELECT`)&&(s=En(s,r.draggable,n,!1),!(s&&s.animated)&&nr!==s)){if(ir=Fn(s),or=Fn(s,r.draggable),typeof l==`function`){if(l.call(this,e,s,this)){H({sortable:t,rootEl:c,name:`filter`,targetEl:s,toEl:n,fromEl:n}),V(`filter`,t,{evt:e}),i&&e.preventDefault();return}}else if(l&&(l=l.split(`,`).some(function(r){if(r=En(c,r.trim(),n,!1),r)return H({sortable:t,rootEl:r,name:`filter`,targetEl:s,fromEl:n,toEl:n}),V(`filter`,t,{evt:e}),!0}),l)){i&&e.preventDefault();return}r.handle&&!En(c,r.handle,n,!1)||this._prepareDragStart(e,o,s)}}},_prepareDragStart:function(e,t,n){var r=this,i=r.el,a=r.options,o=i.ownerDocument,s;if(n&&!U&&n.parentNode===i){var c=z(n);if(K=i,U=n,W=U.parentNode,tr=U.nextSibling,nr=n,cr=a.group,X.dragged=U,fr={target:U,clientX:(t||e).clientX,clientY:(t||e).clientY},gr=fr.clientX-c.left,_r=fr.clientY-c.top,this._lastX=(t||e).clientX,this._lastY=(t||e).clientY,U.style[`will-change`]=`all`,s=function(){if(V(`delayEnded`,r,{evt:e}),X.eventCanceled){r._onDrop();return}r._disableDelayedDragEvents(),!yn&&r.nativeDraggable&&(U.draggable=!0),r._triggerDragStart(e,t),H({sortable:r,name:`choose`,originalEvent:e}),On(U,a.chosenClass,!0)},a.ignore.split(`,`).forEach(function(e){An(U,e.trim(),Hr)}),I(o,`dragover`,Rr),I(o,`mousemove`,Rr),I(o,`touchmove`,Rr),a.supportPointer?(I(o,`pointerup`,r._onDrop),!this.nativeDraggable&&I(o,`pointercancel`,r._onDrop)):(I(o,`mouseup`,r._onDrop),I(o,`touchend`,r._onDrop),I(o,`touchcancel`,r._onDrop)),yn&&this.nativeDraggable&&(this.options.touchStartThreshold=4,U.draggable=!0),V(`delayStart`,this,{evt:e}),a.delay&&(!a.delayOnTouchOnly||t)&&(!this.nativeDraggable||!(vn||_n))){if(X.eventCanceled){this._onDrop();return}a.supportPointer?(I(o,`pointerup`,r._disableDelayedDrag),I(o,`pointercancel`,r._disableDelayedDrag)):(I(o,`mouseup`,r._disableDelayedDrag),I(o,`touchend`,r._disableDelayedDrag),I(o,`touchcancel`,r._disableDelayedDrag)),I(o,`mousemove`,r._delayedDragTouchMoveHandler),I(o,`touchmove`,r._delayedDragTouchMoveHandler),a.supportPointer&&I(o,`pointermove`,r._delayedDragTouchMoveHandler),r._dragStartTimer=setTimeout(s,a.delay)}else s()}},_delayedDragTouchMoveHandler:function(e){var t=e.touches?e.touches[0]:e;Math.max(Math.abs(t.clientX-this._lastX),Math.abs(t.clientY-this._lastY))>=Math.floor(this.options.touchStartThreshold/(this.nativeDraggable&&window.devicePixelRatio||1))&&this._disableDelayedDrag()},_disableDelayedDrag:function(){U&&Hr(U),clearTimeout(this._dragStartTimer),this._disableDelayedDragEvents()},_disableDelayedDragEvents:function(){var e=this.el.ownerDocument;L(e,`mouseup`,this._disableDelayedDrag),L(e,`touchend`,this._disableDelayedDrag),L(e,`touchcancel`,this._disableDelayedDrag),L(e,`pointerup`,this._disableDelayedDrag),L(e,`pointercancel`,this._disableDelayedDrag),L(e,`mousemove`,this._delayedDragTouchMoveHandler),L(e,`touchmove`,this._delayedDragTouchMoveHandler),L(e,`pointermove`,this._delayedDragTouchMoveHandler)},_triggerDragStart:function(e,t){t||=e.pointerType==`touch`&&e,!this.nativeDraggable||t?this.options.supportPointer?I(document,`pointermove`,this._onTouchMove):t?I(document,`touchmove`,this._onTouchMove):I(document,`mousemove`,this._onTouchMove):(I(U,`dragend`,this),I(K,`dragstart`,this._onDragStart));try{document.selection?Xr(function(){document.selection.empty()}):window.getSelection().removeAllRanges()}catch{}},_dragStarted:function(e,t){if(lr=!1,K&&U){V(`dragStarted`,this,{evt:t}),this.nativeDraggable&&I(document,`dragover`,zr);var n=this.options;!e&&On(U,n.dragClass,!1),On(U,n.ghostClass,!0),X.active=this,e&&this._appendGhost(),H({sortable:this,name:`start`,originalEvent:t})}else this._nulling()},_emulateDragOver:function(){if(pr){this._lastX=pr.clientX,this._lastY=pr.clientY,Ir();for(var e=document.elementFromPoint(pr.clientX,pr.clientY),t=e;e&&e.shadowRoot&&(e=e.shadowRoot.elementFromPoint(pr.clientX,pr.clientY),e!==t);)t=e;if(U.parentNode[B]._isOutsideThisEl(e),t)do{if(t[B]){var n=void 0;if(n=t[B]._onDragOver({clientX:pr.clientX,clientY:pr.clientY,target:e,rootEl:t}),n&&!this.options.dragoverBubble)break}e=t}while(t=Tn(t));Lr()}},_onTouchMove:function(e){if(fr){var t=this.options,n=t.fallbackTolerance,r=t.fallbackOffset,i=e.touches?e.touches[0]:e,a=G&&kn(G,!0),o=G&&a&&a.a,s=G&&a&&a.d,c=Or&&Y&&In(Y),l=(i.clientX-fr.clientX+r.x)/(o||1)+(c?c[0]-wr[0]:0)/(o||1),u=(i.clientY-fr.clientY+r.y)/(s||1)+(c?c[1]-wr[1]:0)/(s||1);if(!X.active&&!lr){if(n&&Math.max(Math.abs(i.clientX-this._lastX),Math.abs(i.clientY-this._lastY))<n)return;this._onDragStart(e,!0)}if(G){a?(a.e+=l-(mr||0),a.f+=u-(hr||0)):a={a:1,b:0,c:0,d:1,e:l,f:u};var d=`matrix(${a.a},${a.b},${a.c},${a.d},${a.e},${a.f})`;R(G,`webkitTransform`,d),R(G,`mozTransform`,d),R(G,`msTransform`,d),R(G,`transform`,d),mr=l,hr=u,pr=i}e.cancelable&&e.preventDefault()}},_appendGhost:function(){if(!G){var e=this.options.fallbackOnBody?document.body:K,t=z(U,!0,Or,!0,e),n=this.options;if(Or){for(Y=e;R(Y,`position`)===`static`&&R(Y,`transform`)===`none`&&Y!==document;)Y=Y.parentNode;Y!==document.body&&Y!==document.documentElement?(Y===document&&(Y=jn()),t.top+=Y.scrollTop,t.left+=Y.scrollLeft):Y=jn(),wr=In(Y)}G=U.cloneNode(!0),On(G,n.ghostClass,!1),On(G,n.fallbackClass,!0),On(G,n.dragClass,!0),R(G,`transition`,``),R(G,`transform`,``),R(G,`box-sizing`,`border-box`),R(G,`margin`,0),R(G,`top`,t.top),R(G,`left`,t.left),R(G,`width`,t.width),R(G,`height`,t.height),R(G,`opacity`,`0.8`),R(G,`position`,Or?`absolute`:`fixed`),R(G,`zIndex`,`100000`),R(G,`pointerEvents`,`none`),X.ghost=G,e.appendChild(G),R(G,`transform-origin`,gr/parseInt(G.style.width)*100+`% `+_r/parseInt(G.style.height)*100+`%`)}},_onDragStart:function(e,t){var n=this,r=e.dataTransfer,i=n.options;if(V(`dragStart`,this,{evt:e}),X.eventCanceled){this._onDrop();return}V(`setupClone`,this),X.eventCanceled||(q=Gn(U),q.removeAttribute(`id`),q.draggable=!1,q.style[`will-change`]=``,this._hideClone(),On(q,this.options.chosenClass,!1),X.clone=q),n.cloneId=Xr(function(){V(`clone`,n),!X.eventCanceled&&(n.options.removeCloneOnHide||K.insertBefore(q,U),n._hideClone(),H({sortable:n,name:`clone`}))}),!t&&On(U,i.dragClass,!0),t?(ur=!0,n._loopId=setInterval(n._emulateDragOver,50)):(L(document,`mouseup`,n._onDrop),L(document,`touchend`,n._onDrop),L(document,`touchcancel`,n._onDrop),r&&(r.effectAllowed=`move`,i.setData&&i.setData.call(n,r,U)),I(document,`drop`,n),R(U,`transform`,`translateZ(0)`)),lr=!0,n._dragStartId=Xr(n._dragStarted.bind(n,t,e)),I(document,`selectstart`,n),vr=!0,window.getSelection().removeAllRanges(),bn&&R(document.body,`user-select`,`none`)},_onDragOver:function(e){var t=this.el,n=e.target,r,i,a,o=this.options,s=o.group,c=X.active,l=cr===s,u=o.sort,d=J||c,f,p=this,m=!1;if(Tr)return;function h(o,s){V(o,p,ln({evt:e,isOwner:l,axis:f?`vertical`:`horizontal`,revert:a,dragRect:r,targetRect:i,canSort:u,fromSortable:d,target:n,completed:_,onMove:function(n,i){return Vr(K,t,U,r,n,z(n),e,i)},changed:v},s))}function g(){h(`dragOverAnimationCapture`),p.captureAnimationState(),p!==d&&d.captureAnimationState()}function _(r){return h(`dragOverCompleted`,{insertion:r}),r&&(l?c._hideClone():c._showClone(p),p!==d&&(On(U,J?J.options.ghostClass:c.options.ghostClass,!1),On(U,o.ghostClass,!0)),J!==p&&p!==X.active?J=p:p===X.active&&J&&(J=null),d===p&&(p._ignoreWhileAnimating=n),p.animateAll(function(){h(`dragOverAnimationComplete`),p._ignoreWhileAnimating=null}),p!==d&&(d.animateAll(),d._ignoreWhileAnimating=null)),(n===U&&!U.animated||n===t&&!n.animated)&&(yr=null),!o.dragoverBubble&&!e.rootEl&&n!==document&&(U.parentNode[B]._isOutsideThisEl(e.target),!r&&Rr(e)),!o.dragoverBubble&&e.stopPropagation&&e.stopPropagation(),m=!0}function v(){ar=Fn(U),sr=Fn(U,o.draggable),H({sortable:p,name:`change`,toEl:t,newIndex:ar,newDraggableIndex:sr,originalEvent:e})}if(e.preventDefault!==void 0&&e.cancelable&&e.preventDefault(),n=En(n,o.draggable,t,!0),h(`dragOver`),X.eventCanceled)return m;if(U.contains(e.target)||n.animated&&n.animatingX&&n.animatingY||p._ignoreWhileAnimating===n)return _(!1);if(ur=!1,c&&!o.disabled&&(l?u||(a=W!==K):J===this||(this.lastPutMode=cr.checkPull(this,c,U,e))&&s.checkPut(this,c,U,e))){if(f=this._getDirection(e,n)===`vertical`,r=z(U),h(`dragOverValid`),X.eventCanceled)return m;if(a)return W=K,g(),this._hideClone(),h(`revert`),X.eventCanceled||(tr?K.insertBefore(U,tr):K.appendChild(U)),_(!0);var y=Pn(t,o.draggable);if(!y||Gr(e,f,this)&&!y.animated){if(y===U)return _(!1);if(y&&t===e.target&&(n=y),n&&(i=z(n)),Vr(K,t,U,r,n,i,e,!!n)!==!1)return g(),y&&y.nextSibling?t.insertBefore(U,y.nextSibling):t.appendChild(U),W=t,v(),_(!0)}else if(y&&Wr(e,f,this)){var b=Nn(t,0,o,!0);if(b===U)return _(!1);if(n=b,i=z(n),Vr(K,t,U,r,n,i,e,!1)!==!1)return g(),t.insertBefore(U,b),W=t,v(),_(!0)}else if(n.parentNode===t){i=z(n);var x=0,S,C=U.parentNode!==t,w=!Nr(U.animated&&U.toRect||r,n.animated&&n.toRect||i,f),T=f?`top`:`left`,E=Mn(n,`top`,`top`)||Mn(U,`top`,`top`),ee=E?E.scrollTop:void 0;yr!==n&&(S=i[T],xr=!1,Sr=!w&&o.invertSwap||C),x=Kr(e,n,i,f,w?1:o.swapThreshold,o.invertedSwapThreshold==null?o.swapThreshold:o.invertedSwapThreshold,Sr,yr===n);var D;if(x!==0){var te=Fn(U);do te-=x,D=W.children[te];while(D&&(R(D,`display`)===`none`||D===G))}if(x===0||D===n)return _(!1);yr=n,br=x;var ne=n.nextElementSibling,re=!1;re=x===1;var O=Vr(K,t,U,r,n,i,e,re);if(O!==!1)return(O===1||O===-1)&&(re=O===1),Tr=!0,setTimeout(Ur,30),g(),re&&!ne?t.appendChild(U):n.parentNode.insertBefore(U,re?ne:n),E&&Wn(E,0,ee-E.scrollTop),W=U.parentNode,S!==void 0&&!Sr&&(Cr=Math.abs(S-z(n)[T])),v(),_(!0)}if(t.contains(U))return _(!1)}return!1},_ignoreWhileAnimating:null,_offMoveEvents:function(){L(document,`mousemove`,this._onTouchMove),L(document,`touchmove`,this._onTouchMove),L(document,`pointermove`,this._onTouchMove),L(document,`dragover`,Rr),L(document,`mousemove`,Rr),L(document,`touchmove`,Rr)},_offUpEvents:function(){var e=this.el.ownerDocument;L(e,`mouseup`,this._onDrop),L(e,`touchend`,this._onDrop),L(e,`pointerup`,this._onDrop),L(e,`pointercancel`,this._onDrop),L(e,`touchcancel`,this._onDrop),L(document,`selectstart`,this)},_onDrop:function(e){var t=this.el,n=this.options;if(ar=Fn(U),sr=Fn(U,n.draggable),V(`drop`,this,{evt:e}),W=U&&U.parentNode,ar=Fn(U),sr=Fn(U,n.draggable),X.eventCanceled){this._nulling();return}lr=!1,Sr=!1,xr=!1,clearInterval(this._loopId),clearTimeout(this._dragStartTimer),Zr(this.cloneId),Zr(this._dragStartId),this.nativeDraggable&&(L(document,`drop`,this),L(t,`dragstart`,this._onDragStart)),this._offMoveEvents(),this._offUpEvents(),bn&&R(document.body,`user-select`,``),R(U,`transform`,``),e&&(vr&&(e.cancelable&&e.preventDefault(),!n.dropBubble&&e.stopPropagation()),G&&G.parentNode&&G.parentNode.removeChild(G),(K===W||J&&J.lastPutMode!==`clone`)&&q&&q.parentNode&&q.parentNode.removeChild(q),U&&(this.nativeDraggable&&L(U,`dragend`,this),Hr(U),U.style[`will-change`]=``,vr&&!lr&&On(U,J?J.options.ghostClass:this.options.ghostClass,!1),On(U,this.options.chosenClass,!1),H({sortable:this,name:`unchoose`,toEl:W,newIndex:null,newDraggableIndex:null,originalEvent:e}),K===W?ar!==ir&&ar>=0&&(H({sortable:this,name:`update`,toEl:W,originalEvent:e}),H({sortable:this,name:`sort`,toEl:W,originalEvent:e})):(ar>=0&&(H({rootEl:W,name:`add`,toEl:W,fromEl:K,originalEvent:e}),H({sortable:this,name:`remove`,toEl:W,originalEvent:e}),H({rootEl:W,name:`sort`,toEl:W,fromEl:K,originalEvent:e}),H({sortable:this,name:`sort`,toEl:W,originalEvent:e})),J&&J.save()),X.active&&((ar==null||ar===-1)&&(ar=ir,sr=or),H({sortable:this,name:`end`,toEl:W,originalEvent:e}),this.save()))),this._nulling()},_nulling:function(){V(`nulling`,this),K=U=W=G=tr=q=nr=rr=fr=pr=vr=ar=sr=ir=or=yr=br=J=cr=X.dragged=X.ghost=X.clone=X.active=null;var e=this.el;Er.forEach(function(t){e.contains(t)&&(t.checked=!0)}),Er.length=mr=hr=0},handleEvent:function(e){switch(e.type){case`drop`:case`dragend`:this._onDrop(e);break;case`dragenter`:case`dragover`:U&&(this._onDragOver(e),Br(e));break;case`selectstart`:e.preventDefault();break}},toArray:function(){for(var e=[],t,n=this.el.children,r=0,i=n.length,a=this.options;r<i;r++)t=n[r],En(t,a.draggable,this.el,!1)&&e.push(t.getAttribute(a.dataIdAttr)||Jr(t));return e},sort:function(e,t){var n={},r=this.el;this.toArray().forEach(function(e,t){var i=r.children[t];En(i,this.options.draggable,r,!1)&&(n[e]=i)},this),t&&this.captureAnimationState(),e.forEach(function(e){n[e]&&(r.removeChild(n[e]),r.appendChild(n[e]))}),t&&this.animateAll()},save:function(){var e=this.options.store;e&&e.set&&e.set(this)},closest:function(e,t){return En(e,t||this.options.draggable,this.el,!1)},option:function(e,t){var n=this.options;if(t===void 0)return n[e];var r=Qn.modifyOption(this,e,t);r===void 0?n[e]=t:n[e]=r,e===`group`&&Fr(n)},destroy:function(){V(`destroy`,this);var e=this.el;e[B]=null,L(e,`mousedown`,this._onTapStart),L(e,`touchstart`,this._onTapStart),L(e,`pointerdown`,this._onTapStart),this.nativeDraggable&&(L(e,`dragover`,this),L(e,`dragenter`,this)),Array.prototype.forEach.call(e.querySelectorAll(`[draggable]`),function(e){e.removeAttribute(`draggable`)}),this._onDrop(),this._disableDelayedDragEvents(),dr.splice(dr.indexOf(this.el),1),this.el=e=null},_hideClone:function(){if(!rr){if(V(`hideClone`,this),X.eventCanceled)return;R(q,`display`,`none`),this.options.removeCloneOnHide&&q.parentNode&&q.parentNode.removeChild(q),rr=!0}},_showClone:function(e){if(e.lastPutMode!==`clone`){this._hideClone();return}if(rr){if(V(`showClone`,this),X.eventCanceled)return;U.parentNode==K&&!this.options.group.revertClone?K.insertBefore(q,U):tr?K.insertBefore(q,tr):K.appendChild(q),this.options.group.revertClone&&this.animate(U,q),R(q,`display`,``),rr=!1}}};function Br(e){e.dataTransfer&&(e.dataTransfer.dropEffect=`move`),e.cancelable&&e.preventDefault()}function Vr(e,t,n,r,i,a,o,s){var c,l=e[B],u=l.options.onMove,d;return window.CustomEvent&&!_n&&!vn?c=new CustomEvent(`move`,{bubbles:!0,cancelable:!0}):(c=document.createEvent(`Event`),c.initEvent(`move`,!0,!0)),c.to=t,c.from=e,c.dragged=n,c.draggedRect=r,c.related=i||t,c.relatedRect=a||z(t),c.willInsertAfter=s,c.originalEvent=o,e.dispatchEvent(c),u&&(d=u.call(l,c,o)),d}function Hr(e){e.draggable=!1}function Ur(){Tr=!1}function Wr(e,t,n){var r=z(Nn(n.el,0,n.options,!0)),i=Kn(n.el,n.options,G),a=10;return t?e.clientX<i.left-a||e.clientY<r.top&&e.clientX<r.right:e.clientY<i.top-a||e.clientY<r.bottom&&e.clientX<r.left}function Gr(e,t,n){var r=z(Pn(n.el,n.options.draggable)),i=Kn(n.el,n.options,G),a=10;return t?e.clientX>i.right+a||e.clientY>r.bottom&&e.clientX>r.left:e.clientY>i.bottom+a||e.clientX>r.right&&e.clientY>r.top}function Kr(e,t,n,r,i,a,o,s){var c=r?e.clientY:e.clientX,l=r?n.height:n.width,u=r?n.top:n.left,d=r?n.bottom:n.right,f=!1;if(!o){if(s&&Cr<l*i){if(!xr&&(br===1?c>u+l*a/2:c<d-l*a/2)&&(xr=!0),xr)f=!0;else if(br===1?c<u+Cr:c>d-Cr)return-br}else if(c>u+l*(1-i)/2&&c<d-l*(1-i)/2)return qr(t)}return f||=o,f&&(c<u+l*a/2||c>d-l*a/2)?c>u+l/2?1:-1:0}function qr(e){return Fn(U)<Fn(e)?1:-1}function Jr(e){for(var t=e.tagName+e.className+e.src+e.href+e.textContent,n=t.length,r=0;n--;)r+=t.charCodeAt(n);return r.toString(36)}function Yr(e){Er.length=0;for(var t=e.getElementsByTagName(`input`),n=t.length;n--;){var r=t[n];r.checked&&Er.push(r)}}function Xr(e){return setTimeout(e,0)}function Zr(e){return clearTimeout(e)}Dr&&I(document,`touchmove`,function(e){(X.active||lr)&&e.cancelable&&e.preventDefault()}),X.utils={on:I,off:L,css:R,find:An,is:function(e,t){return!!En(e,t,e,!1)},extend:zn,throttle:Hn,closest:En,toggleClass:On,clone:Gn,index:Fn,nextTick:Xr,cancelNextTick:Zr,detectDirection:Mr,getChild:Nn,expando:B},X.get=function(e){return e[B]},X.mount=function(){for(var e=arguments.length,t=Array(e),n=0;n<e;n++)t[n]=arguments[n];t[0].constructor===Array&&(t=t[0]),t.forEach(function(e){if(!e.prototype||!e.prototype.constructor)throw`Sortable: Mounted plugin must be a constructor function, not ${{}.toString.call(e)}`;e.utils&&(X.utils=ln(ln({},X.utils),e.utils)),Qn.mount(e)})},X.create=function(e,t){return new X(e,t)},X.version=hn;var Z=[],Qr,$r,ei=!1,ti,ni,ri,ii;function ai(){function e(){for(var e in this.defaults={scroll:!0,forceAutoScrollFallback:!1,scrollSensitivity:30,scrollSpeed:10,bubbleScroll:!0},this)e.charAt(0)===`_`&&typeof this[e]==`function`&&(this[e]=this[e].bind(this))}return e.prototype={dragStarted:function(e){var t=e.originalEvent;this.sortable.nativeDraggable?I(document,`dragover`,this._handleAutoScroll):this.options.supportPointer?I(document,`pointermove`,this._handleFallbackAutoScroll):t.touches?I(document,`touchmove`,this._handleFallbackAutoScroll):I(document,`mousemove`,this._handleFallbackAutoScroll)},dragOverCompleted:function(e){var t=e.originalEvent;!this.options.dragOverBubble&&!t.rootEl&&this._handleAutoScroll(t)},drop:function(){this.sortable.nativeDraggable?L(document,`dragover`,this._handleAutoScroll):(L(document,`pointermove`,this._handleFallbackAutoScroll),L(document,`touchmove`,this._handleFallbackAutoScroll),L(document,`mousemove`,this._handleFallbackAutoScroll)),si(),oi(),Un()},nulling:function(){ri=$r=Qr=ei=ii=ti=ni=null,Z.length=0},_handleFallbackAutoScroll:function(e){this._handleAutoScroll(e,!0)},_handleAutoScroll:function(e,t){var n=this,r=(e.touches?e.touches[0]:e).clientX,i=(e.touches?e.touches[0]:e).clientY,a=document.elementFromPoint(r,i);if(ri=e,t||this.options.forceAutoScrollFallback||vn||_n||bn){ci(e,this.options,a,t);var o=Rn(a,!0);ei&&(!ii||r!==ti||i!==ni)&&(ii&&si(),ii=setInterval(function(){var a=Rn(document.elementFromPoint(r,i),!0);a!==o&&(o=a,oi()),ci(e,n.options,a,t)},10),ti=r,ni=i)}else{if(!this.options.bubbleScroll||Rn(a,!0)===jn()){oi();return}ci(e,this.options,Rn(a,!1),!1)}}},sn(e,{pluginName:`scroll`,initializeByDefault:!0})}function oi(){Z.forEach(function(e){clearInterval(e.pid)}),Z=[]}function si(){clearInterval(ii)}var ci=Hn(function(e,t,n,r){if(t.scroll){var i=(e.touches?e.touches[0]:e).clientX,a=(e.touches?e.touches[0]:e).clientY,o=t.scrollSensitivity,s=t.scrollSpeed,c=jn(),l=!1,u;$r!==n&&($r=n,oi(),Qr=t.scroll,u=t.scrollFn,Qr===!0&&(Qr=Rn(n,!0)));var d=0,f=Qr;do{var p=f,m=z(p),h=m.top,g=m.bottom,_=m.left,v=m.right,y=m.width,b=m.height,x=void 0,S=void 0,C=p.scrollWidth,w=p.scrollHeight,T=R(p),E=p.scrollLeft,ee=p.scrollTop;p===c?(x=y<C&&(T.overflowX===`auto`||T.overflowX===`scroll`||T.overflowX===`visible`),S=b<w&&(T.overflowY===`auto`||T.overflowY===`scroll`||T.overflowY===`visible`)):(x=y<C&&(T.overflowX===`auto`||T.overflowX===`scroll`),S=b<w&&(T.overflowY===`auto`||T.overflowY===`scroll`));var D=x&&(Math.abs(v-i)<=o&&E+y<C)-(Math.abs(_-i)<=o&&!!E),te=S&&(Math.abs(g-a)<=o&&ee+b<w)-(Math.abs(h-a)<=o&&!!ee);if(!Z[d])for(var ne=0;ne<=d;ne++)Z[ne]||(Z[ne]={});(Z[d].vx!=D||Z[d].vy!=te||Z[d].el!==p)&&(Z[d].el=p,Z[d].vx=D,Z[d].vy=te,clearInterval(Z[d].pid),(D!=0||te!=0)&&(l=!0,Z[d].pid=setInterval(function(){r&&this.layer===0&&X.active._onTouchMove(ri);var t=Z[this.layer].vy?Z[this.layer].vy*s:0,n=Z[this.layer].vx?Z[this.layer].vx*s:0;typeof u==`function`&&u.call(X.dragged.parentNode[B],n,t,e,ri,Z[this.layer].el)!==`continue`||Wn(Z[this.layer].el,n,t)}.bind({layer:d}),24))),d++}while(t.bubbleScroll&&f!==c&&(f=Rn(f,!1)));ei=l}},30),li=function(e){var t=e.originalEvent,n=e.putSortable,r=e.dragEl,i=e.activeSortable,a=e.dispatchSortableEvent,o=e.hideGhostForTarget,s=e.unhideGhostForTarget;if(t){var c=n||i;o();var l=t.changedTouches&&t.changedTouches.length?t.changedTouches[0]:t,u=document.elementFromPoint(l.clientX,l.clientY);s(),c&&!c.el.contains(u)&&(a(`spill`),this.onSpill({dragEl:r,putSortable:n}))}};function ui(){}ui.prototype={startIndex:null,dragStart:function(e){var t=e.oldDraggableIndex;this.startIndex=t},onSpill:function(e){var t=e.dragEl,n=e.putSortable;this.sortable.captureAnimationState(),n&&n.captureAnimationState();var r=Nn(this.sortable.el,this.startIndex,this.options);r?this.sortable.el.insertBefore(t,r):this.sortable.el.appendChild(t),this.sortable.animateAll(),n&&n.animateAll()},drop:li},sn(ui,{pluginName:`revertOnSpill`});function di(){}di.prototype={onSpill:function(e){var t=e.dragEl,n=e.putSortable||this.sortable;n.captureAnimationState(),t.parentNode&&t.parentNode.removeChild(t),n.animateAll()},drop:li},sn(di,{pluginName:`removeOnSpill`}),X.mount(new ai),X.mount(di,ui);var Q={UNSTARTED:-1,ENDED:0,PLAYING:1,PAUSED:2,BUFFERING:3,CUED:5},fi=`https://www.youtube-nocookie.com`,pi=class{iframeElement;videoId;onReadyCallback;onErrorCallback;destroyed=!1;ready=!1;ownerWindow;cachedCurrentTime=0;cachedDuration=0;cachedPlayerState=Q.UNSTARTED;cachedMuted=!1;cachedPlaybackRate=1;boundMessageHandler;pendingLoadErrorHandler=null;pendingAutoPause=null;constructor(e,t,n,r){this.iframeElement=e,this.videoId=t,this.onReadyCallback=n,this.onErrorCallback=r,this.ownerWindow=e.ownerDocument.defaultView??window,this.boundMessageHandler=this.handleMessage.bind(this),this.ownerWindow.addEventListener(`message`,this.boundMessageHandler),e.src=`${fi}/embed/${t}?enablejsapi=1`,e.addEventListener(`load`,this.onIframeLoad,{once:!0})}onIframeLoad=()=>{if(this.destroyed)return;let e=this.iframeElement.contentWindow;e&&e.postMessage(JSON.stringify({event:`listening`,id:1}),fi)};sendCommand(e,t=[]){let n=this.iframeElement.contentWindow;n&&n.postMessage(JSON.stringify({event:`command`,func:e,args:t}),fi)}handleMessage(e){if(!(e.source==null?e.origin===fi:e.source===this.iframeElement.contentWindow)||this.destroyed)return;let t;try{t=typeof e.data==`string`?JSON.parse(e.data):e.data}catch{return}switch(t.event){case`onReady`:console.debug(`[PlayerAdapter] Player ready for video:`,this.videoId),this.ready=!0,this.onReadyCallback(),(()=>{const _sec=this._postLoadSeekSec,_rate=this._postLoadSeekRate;if(_sec&&_sec>2){this._postLoadSeekSec=null;window.setTimeout(()=>{this.seek(_sec).catch(()=>{});if(_rate&&_rate!==1){this.sendCommand(`setPlaybackRate`,[_rate]);this._postLoadSeekRate=null;}},800);}else if(_rate&&_rate!==1){this._postLoadSeekRate=null;window.setTimeout(()=>this.sendCommand(`setPlaybackRate`,[_rate]),800);}})();break;case`onStateChange`:{let e=t.info;this.cachedPlayerState=e,this.handleStateChange(e);break}case`infoDelivery`:case`initialDelivery`:{let e=t.info;e&&typeof e==`object`&&(typeof e.currentTime==`number`&&(this.cachedCurrentTime=e.currentTime),typeof e.duration==`number`&&e.duration>0&&(this.cachedDuration=e.duration),typeof e.playerState==`number`&&(this.cachedPlayerState=e.playerState),typeof e.muted==`boolean`&&(this.cachedMuted=e.muted),typeof e.playbackRate==`number`&&e.playbackRate>0&&(this.cachedPlaybackRate=e.playbackRate));break}case`onError`:{let e=typeof t.info==`number`?t.info:-1;if(console.error(`[PlayerAdapter] Player error for video:`,this.videoId,`Error code:`,e),this.pendingLoadErrorHandler){let t=this.pendingLoadErrorHandler;this.pendingLoadErrorHandler=null,t(e);return}this.onErrorCallback&&this.onErrorCallback(e);break}}}isReady(){return this.ready}async waitForReady(e=5e3){if(this.isReady())return!0;let t=Date.now();for(;Date.now()-t<e;){if(this.isReady())return!0;await new Promise(e=>window.setTimeout(e,50))}return this.isReady()}async loadVideo(e){if(!await this.waitForReady()){console.warn(`[PlayerAdapter] Cannot load video - player not ready after waiting`);return}return console.debug(`[PlayerAdapter] Loading new video:`,e),this.videoId=e,this.ready=!1,this.cachedPlayerState=Q.CUED,this.cachedDuration=0,new Promise((t,n)=>{var r=!1,i=this.cachedMuted,_self=this,a=function(){if(r)return;r=!0;_self.pendingLoadErrorHandler=null;i||_self.sendCommand(`unMute`);_self.ready=!0;var _sec=_self._postLoadSeekSec,_rate=_self._postLoadSeekRate;if(_sec&&_sec>2){_self._postLoadSeekSec=null;_self._postLoadSeekRate=null;window.setTimeout(function(){_self.seek(_sec).catch(function(){});if(_rate&&_rate!==1)_self.sendCommand(`setPlaybackRate`,[_rate]);},600);}t();},o=function(e){if(r)return;r=!0;_self.pendingLoadErrorHandler=null;i||_self.sendCommand(`unMute`);_self.ready=!0;n(Error(String(e)));};_self.pendingLoadErrorHandler=function(e){window.clearInterval(s);window.clearTimeout(c);o(e);};i||_self.sendCommand(`mute`);_self.sendCommand(`loadVideoById`,[e]);var s=window.setInterval(function(){var t=_self.cachedPlayerState;t===Q.PLAYING?(_self.sendCommand(`pauseVideo`),window.clearInterval(s),window.clearTimeout(c),console.debug(`[PlayerAdapter] Video loaded and ready:`,e),a()):(t===Q.PAUSED||t===Q.ENDED)&&(window.clearInterval(s),window.clearTimeout(c),console.debug(`[PlayerAdapter] Video loaded and ready:`,e),a());},100),c=window.setTimeout(function(){window.clearInterval(s);console.warn(`[PlayerAdapter] Video load timeout, marking as ready anyway`);a();},5e3);})}destroy(){this.destroyed=!0,this.pendingLoadErrorHandler=null,this.ownerWindow.removeEventListener(`message`,this.boundMessageHandler),this.ready=!1,console.debug(`[PlayerAdapter] Destroyed player for video:`,this.videoId)}async seek(e){let t=0;for(;t<10&&!(this.isReady()&&await this.getPlayerState()!==Q.BUFFERING);)t++,await new Promise(e=>window.setTimeout(e,100));if(!this.isReady()){console.warn(`[PlayerAdapter] Player not ready for seek after waiting`);return}try{console.debug(`[PlayerAdapter] Seeking to:`,e),this.sendCommand(`seekTo`,[e,!0]),this.cachedCurrentTime=e,await new Promise(e=>window.setTimeout(e,200));let t=await this.getCurrentTime();Math.abs(t-e)>2&&(console.warn(`[PlayerAdapter] Seek verification failed. Expected:`,e,`Got:`,t,`Retrying...`),this.sendCommand(`seekTo`,[e,!0]),this.cachedCurrentTime=e)}catch(e){console.error(`[PlayerAdapter] Error seeking to timestamp:`,e)}}getCurrentTime(){return Promise.resolve(this.cachedCurrentTime)}getDuration(){return Promise.resolve(this.cachedDuration)}play(){try{this.sendCommand(`playVideo`)}catch(e){console.error(`Error playing video:`,e)}return Promise.resolve()}pause(){try{this.sendCommand(`pauseVideo`)}catch(e){console.error(`Error pausing video:`,e)}return Promise.resolve()}async seekAndPause(e){if(await this.seek(e),!this.isReady())return;let t=this.cachedPlayerState;if(t===Q.PLAYING||t===Q.BUFFERING){this.sendCommand(`pauseVideo`);return}if(t===Q.PAUSED||t===Q.ENDED){this.sendCommand(`pauseVideo`);return}if(t===Q.UNSTARTED||t===Q.CUED){await this.waitForAutoPause(e);return}this.sendCommand(`pauseVideo`)}getPlayerState(){return Promise.resolve(this.cachedPlayerState)}clearPendingAutoPause(e){if(!this.pendingAutoPause)return;let t=this.pendingAutoPause;this.pendingAutoPause=null,window.clearTimeout(t.timeoutId),t.restoreMute&&this.sendCommand(`unMute`),e&&t.resolve()}async waitForAutoPause(e){return new Promise(t=>{this.clearPendingAutoPause(!1);let n=!1;this.cachedMuted||(this.sendCommand(`mute`),n=!0);let r=window.setTimeout(()=>{this.pendingAutoPause?.timeoutId===r&&this.clearPendingAutoPause(!0)},2e3);this.pendingAutoPause={timestamp:e,resolve:t,timeoutId:r,restoreMute:n}})}handleStateChange(e){if(!this.pendingAutoPause)return;let t=e===Q.PLAYING,n=e===Q.PAUSED||e===Q.ENDED;if(t){let e=this.pendingAutoPause;this.sendCommand(`pauseVideo`),this.sendCommand(`seekTo`,[e.timestamp,!0]),this.clearPendingAutoPause(!0)}else n&&this.clearPendingAutoPause(!0)}},mi=class extends l.Modal{title;message;constructor(e,t,n){super(e),this.title=t,this.message=n}onOpen(){let{contentEl:e}=this;e.empty(),e.addClass(`youtnote-plugin__base-modal`),e.createDiv({cls:`youtnote-plugin__base-modal-title`}).setText(this.title),e.createDiv({cls:`youtnote-plugin__base-modal-message`}).setText(this.message);let t=e.createDiv({cls:`youtnote-plugin__base-modal-buttons`});this.renderButtons(t)}onClose(){let{contentEl:e}=this;e.empty()}},hi=class extends mi{buttonText;constructor(e,t,n,r=`OK`){super(e,t,n),this.buttonText=r}renderButtons(e){let t=e.createEl(`button`,{text:this.buttonText,cls:`youtnote-plugin__alert-ok`});t.addEventListener(`click`,()=>{this.close()}),t.focus()}},gi=class extends mi{onConfirm;confirmText;cancelText;constructor(e,t,n,r,i=`Confirm`,a=`Cancel`){super(e,t,n),this.onConfirm=r,this.confirmText=i,this.cancelText=a}renderButtons(e){e.createEl(`button`,{text:this.cancelText,cls:`youtnote-plugin__confirm-cancel`}).addEventListener(`click`,()=>{this.close()});let t=e.createEl(`button`,{text:this.confirmText,cls:`youtnote-plugin__confirm-confirm mod-warning`});t.addEventListener(`click`,()=>{this.onConfirm(),this.close()}),t.focus()}},_i=0;Array.isArray;function $(e,t,n,r,i,a){t||={};var o,s,c=t;if(`ref`in c)for(s in c={},t)s==`ref`?o=t[s]:c[s]=t[s];var l={type:e,props:c,key:n,ref:o,__k:null,__:null,__b:0,__e:null,__c:null,constructor:void 0,__v:--_i,__i:-1,__u:0,__source:i,__self:a};if(typeof e==`function`&&(o=e.defaultProps))for(s in o)c[s]===void 0&&(c[s]=o[s]);return h.vnode&&h.vnode(l),l}var vi=nn.memo(({app:e,video:t,isActive:n,onSelect:r,onDelete:i})=>{let a=F(null),o=F(null),s=F(null);P(()=>{a.current&&(a.current.empty(),(0,l.setIcon)(a.current,`trash`)),o.current&&(o.current.empty(),(0,l.setIcon)(o.current,`copy`)),s.current&&(s.current.empty(),(0,l.setIcon)(s.current,`grip-vertical`))},[]);let c=()=>{new gi(e,`Delete video?`,`Do you really want to delete this video and all its notes?`,()=>i(t.id),`Delete`,`Cancel`).open()},u=async()=>{try{await navigator.clipboard.writeText(t.url),new l.Notice(`Video URL was copied to the clipboard!`,2e3)}catch(e){console.error(`Failed to copy URL:`,e),new l.Notice(`Failed to copy video URL!`,2e3)}},d=e=>{e.stopPropagation(),c()},f=async e=>{e.stopPropagation(),await u()};return $(`div`,{className:(0,an.default)(`youtnote-plugin__video-item`,{"youtnote-plugin__active":n}),onClick:()=>r(t.id),onContextMenu:e=>{e.preventDefault(),e.stopPropagation(),r(t.id);let n=new l.Menu;n.addItem(e=>{e.setTitle(`Copy URL`).setIcon(`copy`).onClick(()=>{u()})}),n.addSeparator(),n.addItem(e=>{e.setTitle(`Delete video`).setIcon(`trash`).onClick(()=>{c()});let t=e;t.dom?.classList.add(`mod-warning`,`mod-danger`),t.iconEl?.classList.add(`mod-warning`,`mod-danger`)}),n.showAtMouseEvent(e.nativeEvent)},children:[$(`span`,{ref:s,className:`youtnote-plugin__drag-handle`}),t.thumbnail&&$(`img`,{src:t.thumbnail,alt:t.title}),$(`span`,{className:`youtnote-plugin__video-title`,children:t.title||t.url}),$(`button`,{ref:o,className:`youtnote-plugin__video-copy-btn`,onClick:e=>{f(e)},"aria-label":`Copy video URL`}),$(`button`,{ref:a,className:`youtnote-plugin__video-delete-btn`,onClick:d,"aria-label":`Delete video`})]})});vi.displayName=`VideoListItem`;var yi=null;function bi(e){if(yi)return yi;if(!e.embedRegistry?.embedByExtension?.md)return console.error(`[Youtnote] embedRegistry.embedByExtension.md is not available`),null;let t=createDiv();t.hide(),activeDocument.body.appendChild(t);try{let n=e.embedRegistry.embedByExtension.md({app:e,containerEl:t,state:{}},null,``);if(n.load(),`editable`in n&&(n.editable=!0),typeof n.showEditor==`function`&&n.showEditor(),n.editMode){let e=n.editMode,t=Object.getPrototypeOf(e),r=(t==null?null:Object.getPrototypeOf(t))?.constructor??e.constructor;r!=null&&(yi=r)}n.unload()}catch(e){console.error(`[Youtnote] Failed to extract MarkdownEditor class:`,e)}finally{t.remove()}return yi||console.error(`[Youtnote] MarkdownEditor class extraction returned null`),yi}var xi=()=>{},Si=null,Ci=null,wi=null;function Ti(e,t){return{app:e.app,showSearch:xi,toggleMode:xi,onMarkdownScroll:xi,getMode:()=>`source`,scroll:0,editMode:null,get editor(){return t()},get file(){return e.file},get path(){return e.file?.path??``}}}var Ei=({app:e,view:t,value:n,onChange:r,onSave:i,onBlur:a,newLineTrigger:o})=>{let s=F(null),c=F(null),f=F(!1),p=F(i),m=F(r),h=F(o);return P(()=>{p.current=i,m.current=r,h.current=o},[i,r,o]),P(()=>{if(!s.current)return;let r=s.current,i=t.plugin;i.MarkdownEditor||=bi(e);let a=i.MarkdownEditor;if(!a){console.error(`[Youtnote] MarkdownEditor class not available`);return}class o extends a{updateBottomPadding(){}onUpdate(e,t){if(super.onUpdate(e,t),t){let e=this.get();m.current(e)}}buildLocalExtensions(){let n=super.buildLocalExtensions();if((!Si||!Ci||!wi)&&(Si=u.Prec,Ci=d.EditorView,wi=d.keymap),n.push(Si.highest(Ci.domEventHandlers({focus:()=>(t.activeEditor=g,window.setTimeout(()=>{let t=e.workspace;t.activeEditor=g,l.Platform.isMobile&&e.mobileToolbar?.update()}),!0),blur:()=>(l.Platform.isMobile&&e.mobileToolbar?.update(),!0)}))),!l.Platform.isMobile){let e=(e,t)=>()=>(h.current===`enter`?t||e:!(t||e))?(f.current=!0,p.current(),!0):!1;n.push(Si.highest(wi.of([{key:`Enter`,run:e(!1,!1),shift:e(!1,!0)},{key:`Mod-Enter`,run:e(!0,!1),shift:e(!0,!0)}])))}return n}}let g=Ti(t,()=>_.editor),_=i.addChild(new o(e,r,g));g.editMode=_,c.current=_,_.set(n||``),window.setTimeout(()=>{_.editor?.focus(),l.Platform.isMobile&&window.setTimeout(()=>{r.scrollIntoView({block:`center`,behavior:`smooth`})},100)},50);let v=()=>{r.scrollIntoView({block:`center`,behavior:`smooth`})};return l.Platform.isMobile&&activeWindow.addEventListener(`keyboardDidShow`,v),()=>{if(l.Platform.isMobile){activeWindow.removeEventListener(`keyboardDidShow`,v),t.activeEditor===g&&(t.activeEditor=null);let n=e.workspace;n.activeEditor===g&&(n.activeEditor=null,e.mobileToolbar?.update())}i.removeChild(_),c.current=null}},[e,t]),$(`div`,{ref:s,className:`youtnote-plugin__obsidian-editor-container`,onBlur:e=>{!f.current&&a&&!e.currentTarget.contains(e.relatedTarget)&&a(),f.current=!1},tabIndex:-1})};function Di(e,t=0){let n=Math.floor(e/3600),r=Math.floor(e%3600/60),i=Math.floor(e%60),a=e=>e.toString().padStart(2,`0`);return t>=3600?`${n}:${a(r)}:${a(i)}`:t>=60?`${r}:${a(i)}`:t===0?n>0?`${n}:${a(r)}:${a(i)}`:r>0?`${r}:${a(i)}`:`${i}`:`${i}`}var Oi=new Set([`youtube.com`,`m.youtube.com`,`music.youtube.com`,`youtu.be`,`youtube-nocookie.com`,`www.youtube.com`,`www.youtu.be`,`www.youtube-nocookie.com`]),ki=/^[A-Za-z0-9_-]{11}$/;function Ai(e){return ki.test(e)}function ji(e){let t=e.trim();if(!t)return null;try{return new URL(t)}catch(e){console.error(`Error parsing URL:`,e);try{return new URL(`https://${t}`)}catch(e){return console.error(`Error parsing URL:`,e),null}}}function Mi(e){let t=e.trim();if(!t)return null;if(Ai(t))return t;let n=ji(t);if(!n)return null;let r=n.hostname.toLowerCase();if(!Oi.has(r))return null;let i=null;return r.includes(`youtu.be`)?i=n.pathname.split(`/`).filter(Boolean)[0]||null:n.pathname===`/watch`?i=n.searchParams.get(`v`):(n.pathname.startsWith(`/shorts/`)||n.pathname.startsWith(`/live/`)||n.pathname.startsWith(`/embed/`))&&(i=n.pathname.split(`/`)[2]||null),i&&Ai(i)?i:null}function Ni(e){let t=Mi(e);return t?`https://www.youtube.com/watch?v=${t}`:null}function Pi(e){let t=e.split(`
`);if(t[0]?.trim()!==`---`)return!1;for(let e=1;e<t.length;e++){let n=t[e].trim();if(n===`---`)return!1;if(/^youtnote\s*:\s*true\s*$/i.test(n))return!0}return!1}function Fi(e){let t=ji(e);return t?t.protocol===`http:`||t.protocol===`https:`:!1}function Ii(e,t){let n=e.trim();if(!n)return{seconds:0,error:`Empty input`};if(!/^[\d.:]+$/.test(n))return{seconds:0,error:`Invalid format: only numbers and colons allowed`};if(!n.includes(`:`)){let e=parseFloat(n);return isNaN(e)?{seconds:0,error:`Invalid number format`}:e<0?{seconds:0,error:`Time cannot be negative`}:t>0&&e>t?{seconds:t,error:`Time exceeds video duration (max: ${Di(t)})`}:{seconds:Math.floor(e)}}let r=n.split(`:`);if(r.some(e=>e.trim()===``))return{seconds:0,error:`Invalid format: empty segment`};if(r.length>3)return{seconds:0,error:`Invalid format: too many segments`};let i=r.map(e=>{let t=parseFloat(e);return isNaN(t)?null:t});if(i.some(e=>e===null))return{seconds:0,error:`Invalid format: non-numeric segment`};if(i.some(e=>e<0))return{seconds:0,error:`Time segments cannot be negative`};let a=0;for(let e=0;e<i.length;e++){let t=i.length-1-e,n=60**e;a+=i[t]*n}return a=Math.floor(a),a<0?{seconds:0,error:`Time cannot be negative`}:t>0&&a>t?{seconds:t,error:`Time exceeds video duration (max: ${Di(t)})`}:{seconds:a}}function Li(e){return e.reduce((e,t)=>{let n=t.trim();return n?e+n.split(/\s+/).filter(e=>e.length>0).length:e},0)}function Ri(e){return e.reduce((e,t)=>e+t.length,0)}var zi=nn.memo(({app:e,body:t,sourcePath:n,onDoubleClick:r,isExpanded:i})=>{let a=F(null),o=F(null);return P(()=>{if(a.current)return o.current||=new l.Component,a.current.empty(),l.MarkdownRenderer.render(e,t,a.current,n,o.current),()=>{o.current?.unload(),o.current=null}},[e,t,n]),$(`div`,{ref:a,className:`youtnote-plugin__markdown-note-body`,onDoubleClick:r,onClick:t=>{i&&t.stopPropagation();let r=t.target;if(r.tagName===`A`){t.preventDefault(),t.stopPropagation();let i=r.getAttribute(`href`);i&&(r.classList.contains(`internal-link`)?e.workspace.openLinkText(i,n,t.ctrlKey||t.metaKey):Fi(i)&&activeWindow.open(i,`_blank`,`noopener,noreferrer`))}}})});zi.displayName=`MarkdownNoteBody`;var Bi=nn.memo(({app:e,view:t,note:n,isExpanded:r,isActive:i,isEditing:a,editingTimestampId:o,editTimestampValue:s,timestampError:c,editNoteBody:u,maxDuration:d,newLineTrigger:f,onToggleExpand:p,onSelect:m,onStartEdit:h,onSaveEdit:g,onBodyChange:_,onStartTimestampEdit:v,onSaveTimestampEdit:y,onCancelTimestampEdit:b,onTimestampChange:x,onDelete:S})=>{let C=o===n.id,w=e=>{e.stopPropagation();let t=Di(n.timestampSec,d);v(n.id,t)},T=()=>{h(n.id,n.bodyMarkdown)},E=()=>{new gi(e,`Delete note?`,`Do you really want to delete this note?`,()=>S(n.id),`Delete`,`Cancel`).open()},ee=e=>{e.stopPropagation(),E()},D=e=>{e.stopPropagation(),h(n.id,n.bodyMarkdown)},te=e=>{e.preventDefault(),e.stopPropagation(),g()},ne=e=>{if(C||l.Platform.isMobile&&a)return;e.preventDefault(),e.stopPropagation(),m(n.id,n.timestampSec);let t=new l.Menu;t.addItem(e=>{e.setTitle(`Edit note`).setIcon(`pencil`).onClick(()=>{h(n.id,n.bodyMarkdown)})}),t.addItem(e=>{e.setTitle(`Edit timestamp`).setIcon(`clock`).onClick(()=>{let e=Di(n.timestampSec,d);v(n.id,e)})}),t.addSeparator(),t.addItem(e=>{e.setTitle(`Delete note`).setIcon(`trash`).onClick(()=>{E()});let t=e;t.dom?.classList.add(`mod-warning`,`mod-danger`),t.iconEl?.classList.add(`mod-warning`,`mod-danger`)}),t.showAtMouseEvent(e.nativeEvent)},re=F(null),O=F(null),k=F(null),ie=F(null),A=F(null),ae=F(!1),oe=F(!1);return P(()=>{re.current&&(re.current.empty(),(0,l.setIcon)(re.current,r?`chevron-down`:`chevron-right`))},[r]),P(()=>{O.current&&(O.current.empty(),(0,l.setIcon)(O.current,`pencil`))},[r,a]),P(()=>{k.current&&(k.current.empty(),(0,l.setIcon)(k.current,`trash`))},[r,a]),P(()=>{ie.current&&(ie.current.empty(),(0,l.setIcon)(ie.current,`check`))},[a]),P(()=>{if(C&&A.current&&!ae.current){A.current.textContent=s,A.current.focus();let e=activeDocument.createRange();e.selectNodeContents(A.current);let t=activeWindow.getSelection();t?.removeAllRanges(),t?.addRange(e),ae.current=!0}else C||(ae.current=!1)},[C,s]),$(`div`,{className:(0,an.default)(`youtnote-plugin__note-card`,{expanded:r,"youtnote-plugin__active-note":i}),onClick:e=>{if(e.target.tagName===`A`||e.target.closest(`a`))return;p(e,n.id,n.timestampSec)},onContextMenu:ne,children:[$(`div`,{className:`youtnote-plugin__note-header`,children:[$(`span`,{className:`youtnote-plugin__note-header-icon`,ref:re}),C?$(`div`,{className:`youtnote-plugin__timestamp-editor`,onClick:e=>e.stopPropagation(),children:[$(`span`,{ref:A,className:(0,an.default)(`youtnote-plugin__timestamp`,`youtnote-plugin__timestamp-editing`,{"youtnote-plugin__has-error":c}),contentEditable:!0,suppressContentEditableWarning:!0,onInput:e=>x(e.currentTarget.textContent||``),onBlur:()=>{if(oe.current){oe.current=!1;return}y(n.id)},onKeyDown:e=>{e.key===`Enter`&&(e.preventDefault(),e.currentTarget.blur()),e.key===`Escape`&&(e.preventDefault(),oe.current=!0,e.currentTarget.blur(),b())}}),c&&$(`span`,{className:`youtnote-plugin__timestamp-error`,"aria-label":c,children:`⚠`})]}):n.h6Label?$(`span`,{className:`youtnote-plugin__timestamp youtnote-plugin__h6-label`,"aria-label":n.h6Label,children:n.h6Label}):$(`span`,{className:`youtnote-plugin__timestamp`,onClick:e=>e.stopPropagation(),onDoubleClick:w,"aria-label":`Double click to edit`,children:Di(n.timestampSec,d)})]}),a?$(`div`,{className:`youtnote-plugin__note-editor-container`,onClick:e=>e.stopPropagation(),children:[$(Ei,{app:e,view:t,value:u,onChange:_,onSave:g,onBlur:g,newLineTrigger:f})]}):$(zi,{app:e,body:n.bodyMarkdown,sourcePath:t.file?.path??``,onDoubleClick:T,isExpanded:r}),r&&$(`div`,{className:`youtnote-plugin__note-actions`,children:[$(`button`,{ref:O,onClick:D,"aria-label":`Edit note`,disabled:a}),$(`button`,{ref:k,onClick:ee,"aria-label":`Delete note`,disabled:a})]})]})});Bi.displayName=`NoteListItem`;var Vi=({app:e,view:t,settings:n,videos:r,notes:i,activeVideoId:a,setActiveVideoId:o,onUpdateVideos:s,onUpdateNotes:c,onExportSingleVideo:u,onExportAllVideos:d})=>{let f=Ye(()=>i.filter(e=>e.videoId===a),[i,a]),p=Ye(()=>r.find(e=>e.id===a),[r,a]),m=p?.url??null,h=Ye(()=>{let e=f.map(e=>e.bodyMarkdown);return{words:Li(e),characters:Ri(e)}},[f]),g=F(null),_=F(null),v=F(null),y=F(null),b=F(null),x=F(null),S=F(null),[C,w]=N(!0),T=F(null),E=F(0),[ee,D]=N(``),[te,ne]=N(!1),[re,O]=N(new Set),[k,ie]=N(null),[A,ae]=N(null),[oe,ce]=N(null),[le,ue]=N(``),[de,fe]=N(null),[pe,me]=N(``),[he,ge]=N(null),_e=`youtnote-plugin__notes-left-pane-width`,ve=F(null),[ye,be]=N(50),xe=F(ye),[Se,Ce]=N(!1),we=l.Platform.isMobile&&n.pinOnPhone;P(()=>{n.persistExpandedState||O(new Set)},[a,n.persistExpandedState]),P(()=>{n.singleExpandMode&&re.size>1&&O(e=>{let t=new Set;if(k&&e.has(k))t.add(k);else{let n=Array.from(e)[0];n&&t.add(n)}return t})},[n.singleExpandMode,k]);let Te=F(r);P(()=>{Te.current=r},[r]),P(()=>{xe.current=ye},[ye]),P(()=>{let t=!0;return(()=>{try{let n=e.loadLocalStorage(_e);if(!t)return;if(n){let e=Number.parseFloat(n);Number.isNaN(e)||(be(e),xe.current=e)}}catch(e){console.error(`Failed to load pane width from local storage:`,e)}})(),()=>{t=!1}},[e,_e]),P(()=>{b.current&&(0,l.setIcon)(b.current,`file-down`),x.current&&(0,l.setIcon)(x.current,`file-down`),S.current&&(0,l.setIcon)(S.current,`list-plus`)},[a,f.length,r.length,i.length]),P(()=>{if(y.current){let e=X.create(y.current,{handle:`.youtnote-plugin__drag-handle`,animation:150,forceFallback:!0,fallbackOnBody:!0,onEnd:e=>{let t=e.oldIndex,n=e.newIndex;if(t!==n){let e=[...Te.current],[r]=e.splice(t,1);e.splice(n,0,r),s(e)}}});return()=>{e.destroy()}}},[s]),P(()=>{let t=++E.current,n=()=>E.current===t,r=()=>{T.current&&=(window.clearTimeout(T.current),null)},i=()=>{r(),T.current=window.setTimeout(()=>{n()&&(new hi(e,``,``).open(),w(!0),T.current=null)},1e4)},o=g.current,c=Te.current.find(e=>e.id===a);if(!c||!o)return w(!0),!c&&_.current&&_.current.pause(),()=>{r()};v.current!==o&&_.current&&(_.current.destroy(),_.current=null),v.current=o;let l=Mi(c.url);if(!l)return w(!0),()=>{r()};let u=_.current,d=async(e,t)=>{try{let n=await e.getDuration(),r=Te.current.find(e=>e.id===t);r&&n>0&&n!==r.durationSec&&s(Te.current.map(e=>e.id===t?{...e,durationSec:n}:e))}catch(e){console.warn(`Could not fetch video duration`,e)}},f=!1,p=()=>{f||(f=!0,r(),new hi(e,`Video cannot be played in Obsidian`,`This video has embedding disabled by its creator and cannot be played within Obsidian. You can still add notes with manually added timestamps, but you'll need to watch the video on YouTube directly.`).open(),w(!0))};if(u&&u.isReady())console.debug(`[YoutnoteView] Loading new video in existing player`),i(),u.loadVideo(l).then(()=>{n()&&(r(),d(u,c.id).then(()=>{n()&&w(!0)}))}).catch(e=>{if(!n())return;let t=e instanceof Error?Number(e.message):typeof e==`number`?e:-1;if(t===101||t===150){p();return}console.warn(`[YoutnoteView] Failed to load video in existing player`,e),r(),w(!0)});else{u&&(console.debug(`[YoutnoteView] Existing adapter not ready, destroying before re-creating`),u.destroy(),_.current=null),console.debug(`[YoutnoteView] Creating new player adapter`),w(!1);let e=new pi(o,l,()=>{!n()||f||e.loadVideo(l).then(()=>{n()&&(r(),d(e,c.id).then(()=>{n()&&w(!0)}))}).catch(e=>{if(!n())return;let t=e instanceof Error?Number(e.message):typeof e==`number`?e:-1;t===101||t===150?p():(r(),w(!0))})},e=>{(e===101||e===150)&&p()});_.current=e,v.current=o,i()}return()=>{r()}},[a,m]),P(()=>()=>{_.current&&(_.current.destroy(),_.current=null,v.current=null),T.current&&=(window.clearTimeout(T.current),null)},[]);let Ee=async e=>{let t=_.current;t&&(n.autoplayOnNoteSelect?(await t.seek(e),await t.play()):await t.seekAndPause(e))},De=async(e,t,r)=>{e.target.closest(`.youtnote-plugin__note-actions`)||e.target.closest(`.youtnote-plugin__timestamp-editor`)||(O(e=>{let r=new Set(e);return r.has(t)?r.delete(t):(n.singleExpandMode&&r.clear(),r.add(t)),r}),ie(t),await Ee(r))},Oe=async(e,t)=>{ie(e),await Ee(t)},ke=async()=>{if(!a)return;let e=0,t=_.current;if(t&&t.isReady())try{e=await t.getCurrentTime()||0}catch(e){console.warn(`Could not get current time from player adapter`,e)}let r=Math.floor(e),o=crypto.randomUUID(),s={id:o,videoId:a,timestampSec:r,bodyMarkdown:``,createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()};c([...i,s].sort((e,t)=>e.timestampSec-t.timestampSec)),t._pendingNewNoteId=o,ae(o),ie(null),O(e=>{let t=new Set(e);return n.singleExpandMode&&t.clear(),t.add(o),t}),ce(o),ue(``)};
if(t&&t._triggerCreateTimedNote!==ke){t._triggerCreateTimedNote=ke;}
let _showTimedNotes=n.showTimedNotes!==false,_visibleNotes=_showTimedNotes?f:[];let Ae=async t=>{if(t.preventDefault(),!ee||te)return;let n=Mi(ee);if(!n){new hi(e,`Invalid URL`,`The URL you provided is not a valid YouTube URL.`).open();return}let i=Ni(ee);if(!i){new hi(e,`Invalid URL`,`The URL you provided is not a valid YouTube URL.`).open();return}let a=r.find(e=>Mi(e.url)===n);if(a){new hi(e,`Video duplication`,`This video already exists in your list.`).open(),window.setTimeout(()=>{if(o(a.id),y.current){let e=y.current.querySelectorAll(`.youtnote-plugin__video-item`),t=r.findIndex(e=>e.id===a.id);t!==-1&&e[t]&&e[t].scrollIntoView({behavior:`smooth`,block:`nearest`})}},100),D(``);return}ne(!0);try{let e=await(0,l.requestUrl)({url:`https://www.youtube.com/oembed?url=${encodeURIComponent(i)}&format=json`});if(e.status!==200)throw Error(`Video not found or unavailable`);let t=e.json,n=Mi(i);
                // Try thumbnails in descending quality order; skip any that don't exist (404)
                // Minimum acceptable resolution: 480×360 (hqdefault). Lower quality is rejected.
                const _thumbQualities=[`maxresdefault`,`sddefault`,`hqdefault`];
                let _thumb=``;
                for(const _q of _thumbQualities){
                    const _url=`https://img.youtube.com/vi/${n??``}/${_q}.jpg`;
                    try{
                        const _r=await(0,l.requestUrl)({url:_url,method:`HEAD`});
                        // YouTube returns a 120x90 placeholder for missing thumbnails with status 200,
                        // but content-length ~1-2KB. Real thumbnails are larger. Use size as signal.
                        const _len=parseInt(_r.headers?.['content-length']||'0',10);
                        if(_r.status===200&&(_len===0||_len>2000)){_thumb=_url;break;}
                    }catch(_e){/* skip */}
                }
                if(!_thumb){
                    // Fallback: use oembed thumbnail_url only if it appears to be hq or better
                    const _oembed=t.thumbnail_url||``;
                    const _isLowRes=_oembed.includes(`default.jpg`)&&!_oembed.includes(`hq`)&&!_oembed.includes(`mq`)&&!_oembed.includes(`sd`)&&!_oembed.includes(`maxres`);
                    _thumb=(!_oembed||_isLowRes)?`https://img.youtube.com/vi/${n??``}/hqdefault.jpg`:_oembed;
                }
                let a={id:`video-${n??crypto.randomUUID()}`,url:i,title:t.title||`YouTube Video (${n??``})`,thumbnail:_thumb,durationSec:0};s([...r,a]),D(``),o(a.id),window.setTimeout(()=>{y.current&&(y.current.scrollTop=y.current.scrollHeight)},100)}catch(t){console.error(`Error fetching YouTube metadata:`,t),new hi(e,`Unable to add video`,`The video may not exist, be private, be unavailable or be with invalid ID.`).open()}finally{ne(!1)}},je=()=>{oe&&(t._pendingNewNoteId=null,c(i.map(e=>e.id===oe?{...e,bodyMarkdown:le,updatedAt:new Date().toISOString()}:e).sort((e,t)=>e.timestampSec-t.timestampSec)),ie(oe),ce(null))},Me=e=>{if(me(e),e.trim()){let t=Ii(e,p?.durationSec||0);t.error?ge(t.error):ge(null)}else ge(null)},Ne=async e=>{if(!pe.trim()){fe(null),ge(null);return}let t=Ii(pe,p?.durationSec||0);if(t.error){ge(t.error);return}c(i.map(n=>n.id===e?{...n,timestampSec:t.seconds,updatedAt:new Date().toISOString()}:n).sort((e,t)=>e.timestampSec-t.timestampSec)),fe(null),ge(null),O(t=>{let r=new Set(t);return n.singleExpandMode&&r.clear(),r.add(e),r}),ie(e);let r=_.current;r&&(n.autoplayOnNoteSelect?(await r.seek(t.seconds),await r.play()):await r.seekAndPause(t.seconds))},Pe=()=>{fe(null),ge(null)},j=e=>{c(i.filter(t=>t.id!==e))},Fe=e=>{let t=r.filter(t=>t.id!==e);s(t),a===e&&o(t.length>0?t[0].id:null)},Ie=()=>{if(!a)return;let t=new Map;f.forEach(e=>{let n=t.get(e.timestampSec)||[];n.push(e),t.set(e.timestampSec,n)});let r=[];if(t.forEach(e=>{if(e.length<=1)return;let[t,...n]=e;r.push({primary:t,duplicates:n})}),!r.length){new hi(e,`No duplicates`,`No notes with duplicate timestamps found!`).open();return}let o=r.map(e=>Di(e.primary.timestampSec,p?.durationSec||0)),s=o.length?`: ${o.map(e=>`(${e})`).join(`, `)}`:``;new gi(e,`Merge duplicates?`,`Found ${r.length} group(s) of notes with duplicate timestamps${s}. Do you really want to merge them?`,()=>{let e=new Date().toISOString(),t=new Set,a=new Map,o=r.map(e=>e.primary.id);if(r.forEach(({primary:e,duplicates:n})=>{let r=[e,...n].map(e=>e.bodyMarkdown).join(`

`);a.set(e.id,r),n.forEach(e=>t.add(e.id))}),c(i.map(t=>a.has(t.id)?{...t,bodyMarkdown:a.get(t.id)||t.bodyMarkdown,updatedAt:e}:t).filter(e=>!t.has(e.id)).sort((e,t)=>e.timestampSec-t.timestampSec)),o.length){let[e]=o;ie(e),O(t=>{if(n.singleExpandMode){let t=new Set;return t.add(e),t}let r=new Set(t);return o.forEach(e=>r.add(e)),r})}new l.Notice(`Merged ${o.length} group(s) of duplicates`,2e3)},`Merge`,`Cancel`).open()},Le=e=>{e.preventDefault(),Ce(!0)};P(()=>{let t=e=>{if(!Se||!ve.current)return;let t=ve.current.getBoundingClientRect(),n=t.width,r=(e.clientX-t.left)/n*100;r=Math.max(25,Math.min(75,r)),be(r)},n=()=>{Se&&(Ce(!1),e.saveLocalStorage(_e,xe.current.toString()))};return Se&&(activeDocument.addEventListener(`mousemove`,t),activeDocument.addEventListener(`mouseup`,n)),()=>{activeDocument.removeEventListener(`mousemove`,t),activeDocument.removeEventListener(`mouseup`,n)}},[e,Se,_e]);let Re=$(`div`,{className:`youtnote-plugin__player-container`,children:[$(`iframe`,{ref:g,className:(0,an.default)(`youtnote-plugin__iframe`,{"youtnote-plugin__iframe-hidden":!p}),allow:`autoplay`}),!p&&$(`div`,{className:`youtnote-plugin__empty-state`,children:r.length===0?`Add a video to get started`:`Select a video`}),p&&!C&&$(`div`,{className:`youtnote-plugin__loading-container`,children:[$(`div`,{className:`youtnote-plugin__dot-pulse`}),$(`div`,{className:`youtnote-plugin__loading-text`,children:`Loading video player...`})]})]});return $(`div`,{ref:ve,className:(0,an.default)(`youtnote-plugin__plugin-container`,{"youtnote-plugin__iframe-sticky":we,"youtnote-plugin__is-resizing":Se,"youtnote-plugin__disabled":!C}),children:[$(`div`,{className:`youtnote-plugin__video-pane`,style:{width:`${ye}%`},children:[Re,$(`div`,{className:`youtnote-plugin__video-list-header`,children:[$(`div`,{className:`youtnote-plugin__video-list-header-content`,children:[`Videos: `,$(`span`,{children:r.length})]}),r.length>0&&i.length>0&&n.showExportAllButton!==false&&$(`button`,{ref:x,className:`youtnote-plugin__export-btn`,onClick:()=>{d()},"aria-label":`Export the notes of all videos as Markdown`})]}),$(`div`,{className:`youtnote-plugin__video-list`,ref:y,children:r.map(t=>$(vi,{app:e,video:t,isActive:a===t.id,onSelect:o,onDelete:Fe},t.id))}),$(`form`,{className:`youtnote-plugin__add-video-form`,onSubmit:e=>{Ae(e)},children:[$(`input`,{type:`url`,className:`youtnote-plugin__add-video-input`,placeholder:`YouTube URL...`,value:ee,onChange:e=>D(e.target.value),disabled:te}),$(`button`,{ref:e=>{e&&(e.empty(),(0,l.setIcon)(e,te?`hourglass`:`plus`))},type:`submit`,className:`youtnote-plugin__add-btn youtnote-plugin__add-video-submit`,disabled:te})]})]}),$(`div`,{className:`youtnote-plugin__resize-handle`,onMouseDown:Le,children:$(`div`,{className:`youtnote-plugin__resize-handle-line`})}),$(`div`,{className:`youtnote-plugin__notes-pane`,style:{width:`${100-ye}%`},children:[$(`div`,{className:`youtnote-plugin__note-list-header`,children:[$(`div`,{className:`youtnote-plugin__note-list-header-content`,children:[`Notes: `,$(`span`,{children:f.length}),n.showNoteStats&&f.length>0&&$(se,{children:[` • `,`Total words: `,$(`span`,{children:h.words}),` • `,`Total characters: `,$(`span`,{children:h.characters})]})]}),a&&$(`div`,{className:`youtnote-plugin__note-list-header-actions`,children:$(`div`,{className:`youtnote-plugin__note-list-action-btns-container`,children:[f.length>0&&n.showMergeDuplicatesButton!==false&&$(`button`,{ref:S,className:`youtnote-plugin__merge-notes-btn`,onClick:Ie,"aria-label":`Merge notes with the same timestamp`}),f.length>0&&n.showExportVideoButton!==false&&$(`button`,{ref:b,className:`youtnote-plugin__export-btn`,onClick:()=>{u(a)},"aria-label":`Export the notes of selected video as Markdown`})]})})]}),!_showTimedNotes&&$(`div`,{className:`youtnote-plugin__timed-notes-hidden-msg`,children:`Timed notes are hidden. Click the eye icon to show them.`}),$(`div`,{className:`youtnote-plugin__notes-list`,children:_visibleNotes.map(r=>$(`div`,{ref:r.id===A?e=>{e&&(e.scrollIntoView({behavior:`smooth`,block:`start`}),ae(null))}:void 0,children:$(Bi,{app:e,view:t,note:r,isExpanded:re.has(r.id),isActive:k===r.id,isEditing:oe===r.id,editingTimestampId:de,editTimestampValue:pe,timestampError:he,editNoteBody:le,maxDuration:p?.durationSec||0,newLineTrigger:n.newLineTrigger,onToggleExpand:(e,t,n)=>{De(e,t,n)},onSelect:(e,t)=>{Oe(e,t)},onStartEdit:(e,t)=>{ce(e),ue(t)},onSaveEdit:je,onBodyChange:ue,onStartTimestampEdit:(e,t)=>{fe(e),me(t)},onSaveTimestampEdit:e=>{Ne(e)},onCancelTimestampEdit:Pe,onTimestampChange:Me,onDelete:j})},r.id))}),n.showWorkspaceTimedNoteButton!==false&&$(`button`,{ref:e=>{e&&(e.empty(),(0,l.setIcon)(e,`plus`))},className:`youtnote-plugin__add-btn youtnote-plugin__add-note-btn`,onClick:()=>{ke()}})]})]})};function Hi(e){let t=new Map;for(let n of e){let e=t.get(n.videoId);e?e.push(n):t.set(n.videoId,[n])}return t.forEach(e=>{e.sort((e,t)=>e.timestampSec-t.timestampSec)}),t}function _parseFrontmatter(lines) {
    const fm = {};
    if (lines[0]?.trim() !== '---') return fm;
    let i = 1;
    while (i < lines.length) {
        const line = lines[i];
        if (line.trim() === '---') break;
        const kv = line.match(/^([^:]+):\s*(.*)$/);
        if (kv) {
            const key = kv[1].trim().toLowerCase();
            const val = kv[2].trim();
            if (val === '') {
                // Possible YAML list: collect subsequent "  - item" lines
                const list = [];
                let j = i + 1;
                while (j < lines.length && lines[j].match(/^\s+-\s+/)) {
                    list.push(lines[j].replace(/^\s+-\s+/, '').trim());
                    j++;
                }
                if (list.length > 0) {
                    fm[key] = list;
                    i = j;
                    continue;
                }
            }
            fm[key] = val;
        }
        i++;
    }
    return fm;
}
function Ui(e){
    let videos=[],notes=[],r=e.split(`\n`);
    let curVideo=null,curNote=null,inFrontmatter=false,fmDone=false,fmLineCount=0;
    let pendingLines=[]; // body lines buffered before the first timestamp of a video section

    const finalizeNote=()=>{
        if(curNote&&curNote.videoId&&curNote.timestampSec!==undefined&&curNote.bodyMarkdown!==undefined){
            curNote.bodyMarkdown=curNote.bodyMarkdown.trim();
            notes.push(curNote);
        }
        curNote=null;
    };

    // Parse frontmatter for all video URLs
    const fm=_parseFrontmatter(r);
    const rawUrls=fm['link source']||fm['link_source']||null;
    const rawList=Array.isArray(rawUrls)?rawUrls:(rawUrls?[rawUrls]:[]);

    // Unwrap wiki links [label](url), quoted URLs "url" or 'url', plain URLs
    // Also extracts the label if present
    function _unwrapUrl(raw) {
        if (!raw) return { url: raw, label: null };
        let s = raw.trim();
        // Strip surrounding double or single quotes first
        if ((s[0] === '"' && s[s.length-1] === '"') || (s[0] === "'" && s[s.length-1] === "'")) {
            s = s.slice(1, -1).trim();
        }
        // Markdown/wiki link: [label](url)
        const wikiM = s.match(/^\[([^\]]*?)\]\((.+?)\)$/);
        if (wikiM) return { url: wikiM[2].trim(), label: wikiM[1].trim() || null };
        return { url: s, label: null };
    }

    const unwrapped = rawList.map(_unwrapUrl);
    const urlList = unwrapped.map(u => u.url);
    // Labels from frontmatter link source entries (e.g. "part 1", "part 2")
    const linkLabels = unwrapped.map(u => u.label ? u.label.toLowerCase() : null);

    // Pre-build video stubs from frontmatter URLs
    const fmVideos=[];
    for(let _fi=0;_fi<urlList.length;_fi++){
        const u=urlList[_fi];
        const vid=Mi(u);
        if(vid) fmVideos.push({id:`video-${vid}`,url:u,title:linkLabels[_fi]||``,durationSec:0,thumbnail:`https://img.youtube.com/vi/${vid}/hqdefault.jpg`,_label:linkLabels[_fi]||null});
    }

    // Walk lines: skip frontmatter, match # headings to video stubs, collect notes
    let videoIdx=0;
    let foundFmEnd=false;

    // For a single-video note (with or without a label/alias), there will never be a
    // heading to trigger video matching. Pre-set curVideo so body lines and timestamps
    // are captured directly, regardless of whether the link has an alias name.
    const _singleVideo = fmVideos.length===1;
    if(_singleVideo){ curVideo=fmVideos[0]; videos.push(fmVideos[0]); videoIdx=1; }

    // Determine up-front whether this file has real timestamp headings OR H6-label headings.
    // If not, any body lines are freeform content — not timed notes — and must
    // never be converted into timestampSec:0 notes that would overwrite them.
    const _hasAnyTimestampHeading = /^######\s*\[[\d:]+\]/m.test(e) || /^######\s+(?!\[[\d:]+\]).+/m.test(e);

    for(let i=0;i<r.length;i++){
        const line=r[i];
        // Skip frontmatter block
        if(!foundFmEnd){
            if(line.trim()===`---`&&i===0){inFrontmatter=true;continue;}
            if(inFrontmatter){if(line.trim()===`---`){inFrontmatter=false;foundFmEnd=true;}continue;}
            if(i===0&&line.trim()!==`---`){foundFmEnd=true;}
        }

        // End-video sentinel (kept for backward compatibility — silently consumed)
        if(line.trim()===`<!-- end-video -->`){
            if(pendingLines.length>0&&curVideo){
                const body=pendingLines.join(`\n`).trim();
                if(body){curNote={id:`note-${curVideo.id}-0`,videoId:curVideo.id,timestampSec:0,bodyMarkdown:body,createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()};}
            }
            pendingLines=[];
            finalizeNote();curVideo=null;videoIdx++;continue;
        }

        // Any heading (H1–H6) can start a video section.
        // Priority: if link labels exist, match by containment (case-insensitive).
        // Fallback: H1 only (legacy behaviour).
        // IMPORTANT: check timestamp regex BEFORE heading regex so that
        // '###### [54:09]' is never mistaken for a section heading.
        const _isTimestampLine=/^######\s*\[[\d:]+\]/.test(line);
        const _isH6LabelLine=/^######\s+(?!\[[\d:]+\]).+/.test(line);
        const headingM=(_isTimestampLine||_isH6LabelLine)?null:line.match(/^(#{1,6})\s+(.+)$/);
        if(headingM&&fmVideos.length>0){
            const headingText=headingM[2].trim().toLowerCase();
            const labelIdx=fmVideos.findIndex(v=>v._label&&headingText.includes(v._label.toLowerCase()));
            if(labelIdx!==-1){
                // Flush pending buffer before switching video
                if(_hasAnyTimestampHeading&&pendingLines.length>0){const body=pendingLines.join(`\n`).trim();if(body){if(curNote){curNote.bodyMarkdown=(curNote.bodyMarkdown?curNote.bodyMarkdown+`\n`+body:body);}else if(curVideo){curNote={id:`note-${curVideo.id}-0`,videoId:curVideo.id,timestampSec:0,bodyMarkdown:body,createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()};}}}
                pendingLines=[];
                finalizeNote();
                const stub=fmVideos[labelIdx];
                stub.title=headingM[2].trim();
                if(!videos.find(v=>v.id===stub.id))videos.push(stub);
                curVideo=stub;
                videoIdx=labelIdx+1;
                continue;
            }
            // Single-video: body headings (e.g. ## Notes) are section headings in the
            // user's note, NOT video titles. Never overwrite curVideo.title from a body
            // heading — the title (if any) came from the frontmatter link source label.
            if(_singleVideo && curVideo){
                // Just buffer/finalize pending lines and continue; do NOT touch curVideo.title
                if(_hasAnyTimestampHeading&&pendingLines.length>0){const body=pendingLines.join(`\n`).trim();if(body){if(curNote){curNote.bodyMarkdown=(curNote.bodyMarkdown?curNote.bodyMarkdown+`\n`+body:body);}else if(curVideo){curNote={id:`note-${curVideo.id}-0`,videoId:curVideo.id,timestampSec:0,bodyMarkdown:body,createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()};}}}
                pendingLines=[];
                finalizeNote();
                // curVideo.title intentionally NOT updated — preserve the link source label
                continue;
            }
            // Legacy H1-only match when no labels or no label match found
            if(headingM[1]==='#'){
                if(_hasAnyTimestampHeading&&pendingLines.length>0){const body=pendingLines.join(`\n`).trim();if(body){if(curNote){curNote.bodyMarkdown=(curNote.bodyMarkdown?curNote.bodyMarkdown+`\n`+body:body);}else if(curVideo){curNote={id:`note-${curVideo.id}-0`,videoId:curVideo.id,timestampSec:0,bodyMarkdown:body,createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()};}}}
                pendingLines=[];
                finalizeNote();
                const title=headingM[2].trim();
                const stub=fmVideos[videoIdx]||fmVideos[fmVideos.length-1];
                stub.title=title.replace(/^Notes From\s+/i,'');
                if(!videos.find(v=>v.id===stub.id))videos.push(stub);
                curVideo=stub;
                continue;
            }
        } else if(headingM&&headingM[1]==='#'&&fmVideos.length===0){
            // Legacy: no frontmatter videos, H1 only
            if(_hasAnyTimestampHeading&&pendingLines.length>0){const body=pendingLines.join(`\n`).trim();if(body){if(curNote){curNote.bodyMarkdown=(curNote.bodyMarkdown?curNote.bodyMarkdown+`\n`+body:body);}else if(curVideo){curNote={id:`note-${curVideo.id}-0`,videoId:curVideo.id,timestampSec:0,bodyMarkdown:body,createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()};}}}
            pendingLines=[];
            finalizeNote();
        }

        // Legacy video link line [title](url) — only used when no frontmatter URLs
        if(fmVideos.length===0){
            const ll=line.match(/^\[(.*)\]\((.+)\)$/);
            if(ll&&ll[2]!==`timestamp`){
                const vid=Mi(ll[2]);
                if(vid){
                    if(_hasAnyTimestampHeading&&pendingLines.length>0){const body=pendingLines.join(`\n`).trim();if(body){if(curNote){curNote.bodyMarkdown=(curNote.bodyMarkdown?curNote.bodyMarkdown+`\n`+body:body);}else if(curVideo){curNote={id:`note-${curVideo.id}-0`,videoId:curVideo.id,timestampSec:0,bodyMarkdown:body,createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()};}}}
                    pendingLines=[];
                    finalizeNote();
                    curVideo={id:`video-${vid}`,title:ll[1],url:ll[2],durationSec:0,thumbnail:`https://img.youtube.com/vi/${vid}/hqdefault.jpg`};
                    videos.push(curVideo);
                    continue;
                }
            }
        }

        // Timestamp line: new format "###### [HH:MM:SS]" or legacy "[HH:MM:SS](timestamp)"
        // Timestamp line: ###### [HH:MM:SS] or legacy [HH:MM:SS](timestamp)
        const ts=line.match(/^######\s*\[([\d:]+)\](?:\([^)]*\))?$/) || line.match(/^\[([\d:]+)\]\(timestamp\)/);
        if(ts&&curVideo){
            const secs=Ii(ts[1],0).seconds;
            const noteId=`note-${curVideo.id}-${secs}`;
            // Prepend buffered pre-timestamp lines to this note's body
            const pending=pendingLines.join(`\n`).trim();
            pendingLines=[];
            finalizeNote();
            curNote={id:noteId,videoId:curVideo.id,timestampSec:secs,bodyMarkdown:pending,createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()};
            continue;
        }

        // H6-label line: ###### Some Title (no timestamp brackets) — treated as a titled note
        if(_isH6LabelLine&&curVideo){
            const h6Label=line.replace(/^######\s+/,'').trim();
            const noteId=`note-${curVideo.id}-h6-${h6Label.toLowerCase().replace(/\s+/g,'-').replace(/[^a-z0-9-]/g,'')}`;
            const pending=pendingLines.join(`\n`).trim();
            pendingLines=[];
            finalizeNote();
            curNote={id:noteId,videoId:curVideo.id,timestampSec:0,h6Label,bodyMarkdown:pending,createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()};
            continue;
        }

        // Body line: append to open note, or buffer until a timestamp appears
        if(curNote){
            curNote.bodyMarkdown+=(curNote.bodyMarkdown?`\n`:``)+line;
        } else if(curVideo){
            pendingLines.push(line);
        }
    }

    if(_hasAnyTimestampHeading && pendingLines.length>0&&curVideo){
        const body=pendingLines.join(`\n`).trim();
        if(body){
            if(curNote){curNote.bodyMarkdown=(curNote.bodyMarkdown?curNote.bodyMarkdown+`\n`+body:body);}
            else{curNote={id:`note-${curVideo.id}-0`,videoId:curVideo.id,timestampSec:0,bodyMarkdown:body,createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()};}
        }
    }
    pendingLines=[];
    finalizeNote();

    // (Single-video notes are fully handled in the main loop via _singleVideo pre-set.)
    // Multi-video notes require heading markers — if none matched, videos stay empty.

    return{videos,notes};
}
function Wi(videos, notes, _originalContent) {
    const notesByVideoId = Hi(notes);
    const lines = [];

    // ── Frontmatter ──────────────────────────────────────────────
    // If we have original content, update frontmatter non-destructively
    // (add missing required props, never delete existing ones)
    if (_originalContent && typeof _originalContent === 'string') {
        const fmMatch = _originalContent.match(/^(---[\s\S]*?\n---)([\s\S]*)$/);
        if (fmMatch) {
            let fmBlock = fmMatch[1];
            const afterFm = fmMatch[2];

            // Add youtnote: true if missing
            if (!/^youtnote\s*:/m.test(fmBlock)) {
                fmBlock = fmBlock.replace(/\n---$/, '\nyoutnote: true\n---');
            }
            // Add banner if missing and we have a thumbnail
            const _thumb = videos[0]?.thumbnail || '';
            if (_thumb && !/^banner\s*:/m.test(fmBlock)) {
                fmBlock = fmBlock.replace(/\n---$/, `\nbanner: "${_thumb}"\n---`);
            }
            // Add link source if missing and we have videos
            if (videos.length > 0 && !/^link[_ ]source\s*:/m.test(fmBlock)) {
                const _toWikiLink = v => v.title ? `"[${v.title}](${v.url})"` : v.url;
                const urlLines = videos.length === 1
                    ? `link source: ${_toWikiLink(videos[0])}`
                    : `link source:\n${videos.map(v => `  - ${_toWikiLink(v)}`).join('\n')}`;
                fmBlock = fmBlock.replace(/\n---$/, `\n${urlLines}\n---`);
            }

            // Sync link source block to match current videos list.
            // This handles: new video added, video removed, title acquired, plain URL → wiki link upgrade.
            // Strategy: replace the entire link source entry (single or YAML-list) with fresh content.
            //
            // IMPORTANT: only rewrite the link source if the video actually has a NEW title that
            // wasn't already captured from the frontmatter label (v._label). This prevents two bugs:
            //   1. A body heading like "## Notes" being written back as the link name.
            //   2. A user-set link name like "[My Title](url)" being stripped to a bare URL
            //      just because video.title is empty (no title fetched yet from YouTube).
            if (videos.length > 0 && /^link[_ ]source\s*:/m.test(fmBlock)) {
                // Only rewrite an entry if the video has a title that differs from its _label
                // (meaning a real title was fetched from YouTube and is worth persisting).
                // If title is empty or equals the already-stored label, leave that entry alone.
                const _needsUpdate = videos.some(v => v.title && v.title !== (v._label || ''));
                if (_needsUpdate) {
                    const _toWikiLink = v => v.title ? `"[${v.title}](${v.url})"` : (v._label ? `"[${v._label}](${v.url})"` : v.url);
                    // Build what the entry SHOULD look like
                    const _newLinkSource = videos.length === 1
                        ? `link source: ${_toWikiLink(videos[0])}`
                        : `link source:\n${videos.map(v => `  - ${_toWikiLink(v)}`).join('\n')}`;

                    // Remove the existing link source key + any following YAML list items,
                    // then insert the fresh block in its place.
                    // Match: "link source: <value>" OR "link source:\n  - item\n  - item..."
                    fmBlock = fmBlock.replace(
                        /^link[_ ]source\s*:.*(?:\n[ \t]+-[ \t]+.+)*/m,
                        _newLinkSource
                    );
                }
                // else: no fetched title to upgrade → leave the existing link source exactly as-is
            }

            // Lazy-resolve any remaining {{placeholders}} in the frontmatter block
            // using current video data. Only lines that still contain a {{token}} are
            // touched — user-set values (banner, icon, status, etc.) are never overwritten.
            if (videos.length > 0 && /\{\{[^}]+\}\}/.test(fmBlock)) {
                const _pv  = videos[0];
                const _vid = typeof Mi === 'function' ? Mi(_pv.url) : null;
                const _fmVars = { date: new Date().toISOString().split('T')[0] };
                if (_pv.title)     _fmVars['title']     = _pv.title;
                if (_pv.url)       _fmVars['url']        = _pv.url;
                if (_vid)          _fmVars['video_id']   = _vid;
                if (_pv.thumbnail) _fmVars['thumbnail']  = _pv.thumbnail;
                fmBlock = fmBlock
                    .split('\n')
                    .map(line => /\{\{[^}]+\}\}/.test(line) ? resolveTemplate(line, _fmVars) : line)
                    .join('\n');
            }

            // Always go through _serializeStructured which now handles all cases:
            // - If the body has existing timestamp headings, it preserves freeform preamble
            //   and only replaces the timed-note section.
            // - If the body has NO timestamp headings (freeform / non-standard note),
            //   it preserves the entire body and only appends new timed notes.
            // This means non-standard notes are never overwritten or wiped.
            return _serializeStructured(fmBlock, afterFm, videos, notes, notesByVideoId);
        }
    }

    // ── Standard serialization (new files or fully structured files) ──
    lines.push('---');
    lines.push('youtnote: true');

    const primaryThumbnail = videos[0]?.thumbnail || '';
    if (primaryThumbnail) lines.push(`banner: "${primaryThumbnail}"`);
    if (videos.length === 1) {
        const _v0 = videos[0];
        const _linkEntry = _v0.title ? `"[${_v0.title}](${_v0.url})"` : _v0.url;
        lines.push(`link source: ${_linkEntry}`);
    } else if (videos.length > 1) {
        lines.push('link source:');
        for (const video of videos) {
            const _linkEntry = video.title ? `"[${video.title}](${video.url})"` : video.url;
            lines.push(`  - ${_linkEntry}`);
        }
    }
    lines.push('---');

    // ── Video sections ───────────────────────────────────────────
    const _multiVideo = videos.length > 1;
    for (const video of videos) {
        // Only write a section heading for multi-video notes
        if (_multiVideo) { lines.push(`# ${video.title || video.url}`); lines.push(''); }

        const videoNotes = notesByVideoId.get(video.id) || [];
        for (const note of videoNotes) {
            const timestamp = Di(note.timestampSec, 0);
            lines.push(note.h6Label ? `###### ${note.h6Label}` : `###### [${timestamp}]`);
            lines.push(note.bodyMarkdown);
            lines.push('');
        }

        if (_multiVideo) lines.push('');
    }

    return lines.join('\n').trim() + '\n';
}

function _serializeStructured(fmBlock, afterFm, videos, notes, notesByVideoId) {
    const _multiVideo = videos.length > 1;

    // Detect whether the existing body has timestamp headings or H6-label headings we manage
    const hasTimestampHeadings = /^######\s*\[[\d:]+\]/m.test(afterFm || '') || /^######\s+(?!\[[\d:]+\]).+/m.test(afterFm || '');

    if (hasTimestampHeadings && !_multiVideo) {
        // Single-video structured note: preserve everything before the first
        // timestamp heading, then re-emit timed notes after it.
        const firstTsIdx = (afterFm || '').search(/^######\s*(?:\[[\d:]+\]|(?!\[[\d:]+\]).+)/m);
        const preamble = firstTsIdx > 0 ? afterFm.slice(0, firstTsIdx) : '';
        const lines = [fmBlock];
        if (preamble.trim()) lines.push(preamble.trimEnd(), '');
        const videoNotes = notesByVideoId.get(videos[0]?.id) || [];
        for (const note of videoNotes) {
            lines.push(note.h6Label ? `###### ${note.h6Label}` : `###### [${Di(note.timestampSec, 0)}]`);
            lines.push(note.bodyMarkdown);
            lines.push('');
        }
        return lines.join('\n').trim() + '\n';
    }

    if (hasTimestampHeadings && _multiVideo) {
        // Multi-video: rebuild sections delimited by # headings
        const lines = [fmBlock];
        for (const video of videos) {
            lines.push(`# ${video.title || video.url}`);
            lines.push('');
            const videoNotes = notesByVideoId.get(video.id) || [];
            for (const note of videoNotes) {
                lines.push(note.h6Label ? `###### ${note.h6Label}` : `###### [${Di(note.timestampSec, 0)}]`);
                lines.push(note.bodyMarkdown);
                lines.push('');
            }
            lines.push('');
        }
        return lines.join('\n').trim() + '\n';
    }

    // No existing timestamp headings — body is freeform.
    // Preserve it entirely and append any new timed notes at the end.
    // If the body still contains {{var}} placeholders and we now have video data, resolve them.
    const allNotes = [];
    for (const video of videos) {
        const videoNotes = notesByVideoId.get(video.id) || [];
        allNotes.push(...videoNotes);
    }
    allNotes.sort((a, b) => a.timestampSec - b.timestampSec);

    // Build template vars once — only defined if data is actually available
    const _hasTplVars = videos.length > 0 && /\{\{[^}]+\}\}/.test((fmBlock || '') + (afterFm || ''));
    let _tplVars = null;
    if (_hasTplVars) {
        const _pv  = videos[0];
        const _vid = typeof Mi === 'function' ? Mi(_pv.url) : null;
        _tplVars   = { date: new Date().toISOString().split('T')[0] };
        if (_pv.title)     _tplVars['title']     = _pv.title;
        if (_pv.url)       _tplVars['url']        = _pv.url;
        if (_vid)          _tplVars['video_id']   = _vid;
        if (_pv.thumbnail) _tplVars['thumbnail']  = _pv.thumbnail;
    }

    // Lazy frontmatter resolution: only fill {{placeholder}} tokens in the fm block.
    // Lines where the user has already supplied a real value are never overwritten.
    // Special metadata keys controlled by code (banner, status, youtnote) are only
    // filled when the fm line still contains a {{...}} token — user-set solid values win.
    let resolvedFmBlock = fmBlock;
    if (_tplVars && /\{\{[^}]+\}\}/.test(fmBlock)) {
        resolvedFmBlock = fmBlock
            .split('\n')
            .map(line => {
                // Only touch lines that still contain at least one {{placeholder}}
                if (!/\{\{[^}]+\}\}/.test(line)) return line;
                return resolveTemplate(line, _tplVars);
            })
            .join('\n');
    }

    const lines = [resolvedFmBlock];
    let bodyTrimmed = (afterFm || '').replace(/^\n/, '');
    // Lazy template resolution: fill in placeholders that are now satisfied by video data
    if (_tplVars && bodyTrimmed && /\{\{[^}]+\}\}/.test(bodyTrimmed)) {
        bodyTrimmed = resolveTemplate(bodyTrimmed, _tplVars);
    }
    if (bodyTrimmed) lines.push(bodyTrimmed.trimEnd());
    if (allNotes.length > 0) {
        lines.push('');
        for (const note of allNotes) {
            lines.push(note.h6Label ? `###### ${note.h6Label}` : `###### [${Di(note.timestampSec, 0)}]`);
            lines.push(note.bodyMarkdown);
            lines.push('');
        }
    }
    return lines.join('\n').trim() + '\n';
}
function Gi(videos, notes, _exportOpts) {
    const notesByVideoId = Hi(notes);
    const lines = [];
    const headerTpl = _exportOpts?.headerTemplate || null;
    const noteTpl   = _exportOpts?.noteTemplate   || null;

    for (const video of videos) {
        const videoId = Mi(video.url);
        const headerLine = headerTpl
            ? resolveTemplate(headerTpl, { title: video.title || video.url, url: video.url, video_id: videoId || '', thumbnail: video.thumbnail || '' })
            : `"[${video.title || video.url}](${video.url})"`;
        lines.push(headerLine);
        lines.push('');

        const videoNotes = notesByVideoId.get(video.id) || [];

        for (const note of videoNotes) {
            const timestamp = Di(note.timestampSec, 0);
            const timestampUrl = videoId
                ? `https://youtu.be/${videoId}?t=${Math.floor(note.timestampSec)}`
                : video.url;
            const noteLine = noteTpl
                ? resolveTemplate(noteTpl, { timestamp, timestamp_url: timestampUrl, body: note.bodyMarkdown, video_id: videoId || '', url: video.url, title: video.title || '', thumbnail: video.thumbnail || '' })
                : `###### [${timestamp}](${timestampUrl})\n${note.bodyMarkdown}`;
            lines.push(noteLine);
            lines.push('');
        }

        lines.push('');
    }

    return lines.join('\n').trim() + '\n';
}function Ki(videos, notes, _exportOpts) { return Gi(videos, notes, _exportOpts); }
function qi(video, notes, _exportOpts) { return Gi([video], notes, _exportOpts); }var Ji=`youtnote-view`,Yi=class extends l.TextFileView{root=null;plugin;activeEditor=null;videos=[];notes=[];activeVideoId=null;constructor(e,t){super(e),this.plugin=t}getViewType(){return Ji}getDisplayText(){return this.file?this.file.basename:`Youtnote`}getIcon(){return`youtnote`}canAcceptExtension(e){return e===`md`}async onLoadFile(e){if(!await this.plugin.isYoutnoteFile(e)){window.setTimeout(()=>{this.leaf.setViewState({type:`markdown`,state:{file:e.path},popstate:!0})},0);return}return super.onLoadFile(e)}getState(){return{...super.getState(),file:this.file?.path}}getViewData(){var _raw=Wi(this.videos,this.notes,this._originalContent);var _ad=this._playerAdapterRef;var _pos=Math.floor(_ad&&_ad.cachedCurrentTime||0);var _rt=_ad&&_ad.cachedPlaybackRate||1;if(_pos<=2){this._originalContent=_raw;return _raw;}var _fe=_raw.indexOf('\n---\n',4);if(_fe===-1){this._originalContent=_raw;return _raw;}var _fm=_raw.slice(0,_fe);var _rs=_raw.slice(_fe);if(/^playback-position:/m.test(_fm))_fm=_fm.replace(/^playback-position:\s*\d+/m,`playback-position: ${_pos}`);else _fm+=`\nplayback-position: ${_pos}`;if(_rt!==1){if(/^playback-rate:/m.test(_fm))_fm=_fm.replace(/^playback-rate:\s*[\d.]+/m,`playback-rate: ${_rt}`);else _fm+=`\nplayback-rate: ${_rt}`;}var _out=_fm+_rs;this._originalContent=_out;return _out;}setViewData(e,_cl){var _fmM=e.match(/^---[\s\S]*?\n---/);if(_fmM){var _pm=_fmM[0].match(/^playback-position:\s*(\d+)/m);if(_pm)this._savedSeekSec=parseInt(_pm[1],10);var _rm=_fmM[0].match(/^playback-rate:\s*([\d.]+)/m);if(_rm)this._savedSeekRate=parseFloat(_rm[1]);}
// Store original raw content for non-destructive serialization
this._originalContent=e;
var t=Ui(e);this.videos=t.videos,this.notes=t.notes,this.activeVideoId&&!this.videos.find(e=>e.id===this.activeVideoId)&&(this.activeVideoId=null),!this.activeVideoId&&this.videos.length>0&&(this.activeVideoId=this.videos[0].id),this._viewDataReady=true;this.render();if(typeof this._onViewDataChanged==='function')this._onViewDataChanged();}clear(){this.videos=[],this.notes=[],this.activeVideoId=null,this._viewDataReady=false,this.render()}onOpen(){this.contentEl.empty();this.root=rn(this.contentEl);this._btnExport=this.addAction(`file-down`,`Export as Markdown`,()=>{(async()=>{if(!this.file)return;let e=Ki(this.videos,this.notes,{headerTemplate:this.plugin.settings.youtnoteExportHeaderTemplate,noteTemplate:this.plugin.settings.youtnoteExportNoteTemplate}),t=`${this.file.basename} - Export`;await this.createExportFile(t,e)})()});this._btnMarkdown=this.addAction(`file-text`,`Open as Markdown`,()=>{this.plugin.youtnoteFileModes[this.leaf.id??this.file?.path??``]=`markdown`,this.plugin.setMarkdownView(this.leaf)});this.applyHeaderButtonVisibility();this.render();return Promise.resolve()}onClose(){return this.root?.unmount(),Promise.resolve()}applyHeaderButtonVisibility(){
    const s=this.plugin.settings;
    const show=(el,v)=>{if(el){el.style.display=v?'':'none';}};
    show(this._btnExport,    s.showExportButton    !== false);
    show(this._btnMarkdown,  s.showMarkdownButton  !== false);
    show(this._btnTranscript,s.showTranscriptButton!== false);
};handleUpdateVideos=e=>{this.videos=e,this.render(),this._viewDataReady&&this.requestSave();};handleUpdateNotes=e=>{this.notes=e,this.render(),!this._pendingNewNoteId&&this.requestSave();};handleSetActiveVideoId=e=>{
    this.activeVideoId=e;
    this.render();
    // When active video changes, sync transcript to the new video if autoSyncTranscript is on
    if (this.plugin.settings.autoSyncTranscript) {
        const activeVideo = this.videos.find(v => v.id === e);
        if (activeVideo?.url) {
            const clean = URLDetector.toWatchUrl(activeVideo.url);
            if (clean) {
                this.plugin.forceSidebarTranscript(clean);
            }
        }
    }
};handleExportSingleVideo=async e=>{let t=this.videos.find(t=>t.id===e);if(!t)return;let n=qi(t,this.notes,{headerTemplate:this.plugin.settings.youtnoteExportHeaderTemplate,noteTemplate:this.plugin.settings.youtnoteExportNoteTemplate}),r=Mi(t.url),i=r?`Youtnote-${r}-Export`:`Youtnote-${e}-Export`;await this.createExportFile(i,n)};handleExportAllVideos=async()=>{if(!this.file)return;let e=Ki(this.videos,this.notes,{headerTemplate:this.plugin.settings.youtnoteExportHeaderTemplate,noteTemplate:this.plugin.settings.youtnoteExportNoteTemplate}),t=`${this.file.basename} - Export`;await this.createExportFile(t,e)};refresh(){this.render()}async createExportFile(e,t){if(!this.file)return;let n=this.file.parent,r=`${e}.md`,i=n?`${n.path}/${r}`:r,a=1;for(;await this.plugin.app.vault.adapter.exists(i);)r=`${e} ${a}.md`,i=n?`${n.path}/${r}`:r,a++;let o=await this.plugin.app.vault.create(i,t);this.plugin.settings.openExportedFile?await this.plugin.app.workspace.getLeaf(`tab`).openFile(o):new l.Notice(`Exported file created: ${r}`,2e3)}render(){this.root&&this.root.render(A(Vi,{app:this.plugin.app,view:this,settings:{...this.plugin.settings},videos:this.videos,notes:this.notes,activeVideoId:this.activeVideoId,setActiveVideoId:this.handleSetActiveVideoId,onUpdateVideos:this.handleUpdateVideos,onUpdateNotes:this.handleUpdateNotes,onExportSingleVideo:this.handleExportSingleVideo,onExportAllVideos:this.handleExportAllVideos}))}};(0,l.addIcon)(`youtnote`,`<svg width="100" height="100" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" version="1.1" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><g transform="matrix(.56089 0 0 .56089 -36.616 -39.765)" fill="currentColor" stroke="none"><path d="m66.15 84.515 10.278 16.819v8.7213h5.2912v-8.7213l10.278-16.819h-6.311l-6.6122 10.82-6.6122-10.82z"/><path d="m94.186 84.515v17.13l-6.1466-6.3207-3.1559 5.1645 9.3025 9.566h5.2912v-25.54z"/><path d="m79.684 74.528c-1.0073 0-1.2989 0.97735-1.2873 1.8722h-0.67954c-2.0338 0-3.7052 1.6693-3.7052 3.7031v0.22428h-0.13074c-1.7856 0-3.2901 1.2884-3.6308 2.9791h2.2112c0.25656-0.51797 0.7859-0.86196 1.4196-0.86196h25.783c0.89778 0 1.5875 0.69024 1.5875 1.588v20.987c1.2478-0.59803 2.1172-1.8754 2.1172-3.3424v-0.22427h0.13126c2.0338 0 3.7031-1.6714 3.7031-3.7052v-17.644c0-2.0338-1.6693-3.7031-3.7031-3.7031h-14.541c-0.28984-0.81167-0.89855-1.8722-2.1017-1.8722zm-1.9668 3.9894h25.783c0.89778 0 1.5875 0.68817 1.5875 1.586v17.644c0 0.89778-0.68972 1.588-1.5875 1.588h-0.13126v-15.303c0-2.0338-1.6709-3.7052-3.7047-3.7052h-23.535v-0.22428c0-0.89778 0.69024-1.586 1.588-1.586z"/></g></svg>`);var Xi=e=>{if(e&&typeof e==`object`&&`file`in e){let t=e.file;if(typeof t==`string`)return t}},Zi=(e,t)=>e.id??t,Qi=class extends l.Plugin{settings;MarkdownEditor=null;youtnoteFileModes={};didFinishOnload=!1;async onload(){await this.loadDataState(),this.MarkdownEditor=bi(this.app),this.registerView(Ji,e=>new Yi(e,this)),this.addCommand({id:`create-file`,name:`Create new file`,callback:async()=>{let e=this.app.workspace.getActiveFile()?.parent?.path||``,t=`Youtnote Untitled`,n=`${t}.md`,r=e?`${e}/${n}`:n,i=1;for(;await this.app.vault.adapter.exists(r);)n=`${t} ${i}.md`,r=e?`${e}/${n}`:n,i++;let a=await this.app.vault.create(r,`---
youtnote: true
---

`),o=this.app.workspace.getLeaf(!0);await o.openFile(a),this.youtnoteFileModes[o.id??a.path]=Ji,await this.setYoutnoteView(o)}}),this.addCommand({id:`open-as-view`,name:`Open as view`,callback:()=>{let e=this.app.workspace.getLeaf(!1);e&&e.view.getViewType()===`markdown`&&(this.youtnoteFileModes[e.id??e.view.file?.path??``]=Ji,this.setYoutnoteView(e))}}),this.addSettingTab(new p(this.app,this)),this.register(this.monkeyPatchLeafSetViewState()),this.registerEvent(this.app.workspace.on(`file-menu`,(e,t)=>{(async()=>{t instanceof l.TFile&&t.extension===`md`&&await this.isYoutnoteFile(t)&&e.addItem(e=>{e.setTitle(`Open as youtnote view`).setIcon(`youtnote`).setSection(`pane`).onClick(()=>{let e=this.app.workspace.getLeavesOfType(`markdown`);for(let n of e)if(n.view.file?.path===t.path){this.youtnoteFileModes[n.id??t.path]=Ji,this.setYoutnoteView(n);return}this.app.workspace.getLeaf(!0).setViewState({type:Ji,state:{file:t.path},active:!0})})})})()}));let e=!1,t=null,n=()=>{this.app.workspace.iterateAllLeaves(e=>{if(e.view.getViewType()===`markdown`){let t=e.view,n=t.file,r=t.youtnoteActionEl,i=t.youtnoteActionFilePath;if(!n||n.extension!==`md`){r&&(r.remove(),t.youtnoteActionEl=null,t.youtnoteActionFilePath=null);return}let a=this.isYoutnoteFileFromCache(n);if(i===n.path&&r?.isConnected)return;r&&(r.remove(),t.youtnoteActionEl=null,t.youtnoteActionFilePath=null),a&&(t.youtnoteActionEl=t.addAction(`youtnote`,`Open as youtnote view`,()=>{this.youtnoteFileModes[e.id??n.path]=Ji,this.setYoutnoteView(e)}),t.youtnoteActionFilePath=n.path)}})},r=()=>{e||(e=!0,t=window.requestAnimationFrame(()=>{e=!1,t=null,n()}))};this.registerEvent(this.app.workspace.on(`layout-change`,r)),r(),this.register(()=>{t!==null&&(activeWindow.cancelAnimationFrame(t),t=null,e=!1)}),this.addRibbonIcon(`youtnote`,`Create new youtnote`,()=>{this.app.commands.executeCommandById(`${this.manifest.id}:create-file`)}),(function(){var _plugin=this;var _origHM=pi.prototype.handleMessage;pi.prototype.handleMessage=function(e){if(!this._viewRegistered){try{var _leaves=_plugin.app.workspace.getLeavesOfType(Ji);for(var _i=0;_i<_leaves.length;_i++){var _leaf=_leaves[_i];var _v=_leaf&&_leaf.view;if(_v&&this.iframeElement&&_v.contentEl&&_v.contentEl.contains(this.iframeElement)){_v._playerAdapterRef=this;this._viewRegistered=true;if(_v._savedSeekSec>2){this._postLoadSeekSec=_v._savedSeekSec;this._postLoadSeekRate=_v._savedSeekRate||null;}break;}}}catch(_e){}}_origHM.call(this,e);};var _positions=new Map();this.registerEvent(this.app.workspace.on('active-leaf-change',function(leaf){var _allLeaves=_plugin.app.workspace.getLeavesOfType(Ji);for(var _i=0;_i<_allLeaves.length;_i++){var _leaf=_allLeaves[_i];var _v=_leaf&&_leaf.view;if(!_v||_leaf===leaf)continue;var _a=_v._playerAdapterRef;if(!_a)continue;var _pos=_a.cachedCurrentTime||0;var _rate=_a.cachedPlaybackRate||1;if(_pos>2){_positions.set(_v.activeVideoId,{sec:_pos,rate:_rate});_v._savedSeekSec=_pos;_v._savedSeekRate=_rate;try{if(_v.requestSave)_v.requestSave();}catch(_e){}}}if(leaf&&leaf.view&&leaf.view.getViewType&&leaf.view.getViewType()===Ji){var _v=leaf.view;var _mem=_positions.get(_v.activeVideoId);if(_mem&&_mem.sec>2){_v._savedSeekSec=_mem.sec;_v._savedSeekRate=_mem.rate;var _a=_v._playerAdapterRef;if(_a&&_a.isReady()){_a.seek(_mem.sec).catch(function(){});if(_mem.rate&&_mem.rate!==1)_a.sendCommand(`setPlaybackRate`,[_mem.rate]);}else if(_a){_a._postLoadSeekSec=_mem.sec;_a._postLoadSeekRate=_mem.rate;}}}}));}).call(this),this.didFinishOnload=!0}onunload(){this.didFinishOnload=!1}async loadDataState(){let e=await this.loadData()??{};this.settings=Object.assign({},f,e.settings||{})}async saveDataState(){let e={settings:this.settings};await this.saveData(e)}isYoutnoteFileFromCache(e){return this.app.metadataCache.getFileCache(e)?.frontmatter?.youtnote===!0}async isYoutnoteFile(e){return this.isYoutnoteFileFromCache(e)?!0:Pi(await this.app.vault.cachedRead(e))}async setMarkdownView(e){const _s=e.view.getState();if(!_s?.file)return;await e.setViewState({type:`markdown`,state:_s,popstate:!0})}async setYoutnoteView(e){const _s=e.view.getState();if(!_s?.file)return;await e.setViewState({type:Ji,state:_s,popstate:!0})}monkeyPatchLeafSetViewState=()=>{let e=l.WorkspaceLeaf.prototype,t=e.setViewState,n=e.detach;return l.WorkspaceLeaf.prototype.setViewState=(e=>function(n,r){if(!e.didFinishOnload)return t.call(this,n,r);let i=n.state?.file,a=i?Zi(this,i):Zi(this);if(i&&i.length>0&&a&&n.type===`markdown`&&e.youtnoteFileModes[a]!==`markdown`&&e.app.metadataCache.getCache(i)?.frontmatter?.youtnote===!0){let o={...n,type:Ji};return e.youtnoteFileModes[a]=Ji,t.call(this,o,r)}return t.call(this,n,r)})(this),l.WorkspaceLeaf.prototype.detach=(e=>function(){let t=Xi(this.view?.getState()),r=Zi(this,t);return r&&e.youtnoteFileModes[r]&&delete e.youtnoteFileModes[r],n.apply(this)})(this),()=>{l.WorkspaceLeaf.prototype.setViewState=t,l.WorkspaceLeaf.prototype.detach=n}};refreshAllViews(){this.app.workspace.getLeavesOfType(Ji).forEach(e=>{e.view instanceof Yi&&e.view.refresh()})}};
// ====================================================================

// ====================================================================
// SECTION C: UNIFIED SETTINGS DEFAULTS
// ====================================================================

// NOTE: YOUTNOTE_VIEW_TYPE is defined inside the bundled Section B as `Ji`.
// We alias it here so Section A code can reference it cleanly.
const YOUTNOTE_VIEW_TYPE = 'youtnote-view';

const DEFAULT_SETTINGS = {
    // --- Transcript settings ---
    timestampMod:     DEFAULT_TIMESTAMP_MOD,
    lang:             'en',
    country:          'US',
    displayLocation:  DISPLAY_SIDEBAR,
    autoExtract:      false,
    showSearchBar:    true,
    showCopyAllButton:    true,
    showCreateNoteButton: true,
    transcriptFolder: DEFAULT_TRANSCRIPT_FOLDER,
    apiKey:           '',
    showChapters:     true,

    // --- Youtnote settings ---
    youtubeNotesFolder:  DEFAULT_YOUTUBE_NOTES_FOLDER,
    autoplayOnNoteSelect: false,
    singleExpandMode:     true,
    newLineTrigger:      'shift+enter',
    persistExpandedState: false,
    openExportedFile:    true,
    showNoteStats:       true,
    pinOnPhone:          false,

    // --- Integration settings ---
    autoSyncTranscript:      true,
    clearTranscriptOnLeave:  false,

    // --- Header button visibility ---
    showExportButton:    true,
    showMarkdownButton:  true,
    showTranscriptButton: true,

    // --- Workspace button visibility ---
    showExportAllButton:       true,
    showExportVideoButton:     true,
    showMergeDuplicatesButton: true,

    // --- Timed notes visibility ---
    showTimedNotes:               true,
    showSidebarTimedNoteButton:   true,
    showWorkspaceTimedNoteButton: true,

    // --- Note templates ---
    // Default template for newly-created (untitled) YouNotes.
    // May contain a full frontmatter block (--- ... ---) followed by body text, or body only.
    // {{var}} placeholders are left as-is until the matching data is available —
    // in both frontmatter fields AND body. User-set values are never overwritten.
    youtnoteNewNoteTemplate: `---
banner: "{{thumbnail}}"
status:
icon:
---

# {{title}}

> {{url}}

## Notes

`,

    // Rich transcript note (with timestamps) — saved as a file
    transcriptNoteTemplate: `---
link source: {{url}}
banner: "{{thumbnail}}"
retrieved: {{date}}
---
### {{title}}

**Retrieved**: 🗓️ {{date}}

#### The Content

{{transcript_body}}`,

    // Minimal transcript note (no timestamps, plain text)
    transcriptMinimalTemplate: `### {{title}}

**Source**: {{url}}
**Retrieved**: {{date}}

#### Transcript
{{transcript_body}}`,

    // Youtnote export — per-video header line
    youtnoteExportHeaderTemplate: `[{{title}}]({{url}})`,

    // Youtnote export — each timed note row
    youtnoteExportNoteTemplate: `###### [{{timestamp}}]({{timestamp_url}})
{{body}}`,
};

// ====================================================================
// SECTION D: UNIFIED SETTINGS TAB
// ====================================================================

class UnifiedSettingTab extends PluginSettingTab {
    constructor(app, plugin) {
        super(app, plugin);
        this.plugin = plugin;
    }

    display() {
        const { containerEl } = this;
        containerEl.empty();
        containerEl.createEl('h2', { text: 'YouTube Notes + Transcript' });

        // ---- Integration ----
        containerEl.createEl('h3', { text: 'Integration' });

        this._addToggle(containerEl,
            'Auto-sync transcript on video switch',
            'Automatically open/refresh the transcript sidebar when you select a different video in the Youtnote workspace.',
            'autoSyncTranscript'
        );
        this._addToggle(containerEl,
            'Clear transcript when leaving workspace',
            'Automatically close the transcript sidebar whenever you leave a Youtnote workspace.',
            'clearTranscriptOnLeave'
        );

        // ---- Video Notes (Youtnote) ----
        containerEl.createEl('h3', { text: 'Video Notes (Youtnote)' });
        containerEl.createEl('p', { text: 'Configure the video player and note-taking workspace.' });

        this._addToggle(containerEl, 'Autoplay on note select',   'Automatically play the video when clicking on a note timestamp.', 'autoplayOnNoteSelect');
        this._addToggle(containerEl, 'Single expand mode',        'Only allow one note to be expanded at a time.',                   'singleExpandMode');

        containerEl.createEl('h4', { text: 'Header buttons' });
        this._addToggle(containerEl, 'Show export button',               'Show the "Export as Markdown" button in the note header.', 'showExportButton');
        this._addToggle(containerEl, 'Show open as Markdown button',     'Show the "Open as Markdown" button in the note header.',   'showMarkdownButton');
        this._addToggle(containerEl, 'Show transcript button',           'Show the "Open transcript" button in the note header.',    'showTranscriptButton');

        containerEl.createEl('h4', { text: 'Workspace buttons' });
        this._addToggle(containerEl, 'Show export all videos button',    "Show the button that exports all videos' notes as Markdown.",           'showExportAllButton');
        this._addToggle(containerEl, 'Show export selected video button',"Show the button that exports the selected video's notes as Markdown.",  'showExportVideoButton');
        this._addToggle(containerEl, 'Show merge duplicates button',     'Show the button that merges notes with the same timestamp.',            'showMergeDuplicatesButton');

        new Setting(containerEl)
            .setName('YouTube Notes folder')
            .setDesc('Folder where new Youtnote files are created.')
            .addText(t => t.setPlaceholder(DEFAULT_YOUTUBE_NOTES_FOLDER)
                .setValue(this.plugin.settings.youtubeNotesFolder)
                .onChange(async v => {
                    this.plugin.settings.youtubeNotesFolder = v || DEFAULT_YOUTUBE_NOTES_FOLDER;
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName('New line trigger')
            .setDesc('Choose how to create a new line when editing notes.')
            .addDropdown(d => d
                .addOption('shift+enter', 'Shift+Enter (Enter to save)')
                .addOption('enter',       'Enter (Shift+Enter to save)')
                .setValue(this.plugin.settings.newLineTrigger)
                .onChange(async v => {
                    this.plugin.settings.newLineTrigger = v;
                    await this.plugin.saveSettings();
                    this.plugin.refreshAllViews();
                }));

        this._addToggle(containerEl, 'Persist expanded state',       'Remember which notes are expanded when switching videos.',                   'persistExpandedState');
        this._addToggle(containerEl, 'Open exported file',           'Automatically open the exported Markdown file after creation.',              'openExportedFile');
        this._addToggle(containerEl, 'Show note statistics',         'Display word count and character count in the note list header.',            'showNoteStats');
        this._addToggle(containerEl, 'Pin video on phone (sticky)', 'Keep the video player visible at the top while scrolling on mobile.',        'pinOnPhone');

        containerEl.createEl('h4', { text: 'Timed notes' });
        this._addToggle(containerEl, 'Show timed notes',                                    'Show or hide timed notes in the workspace notes panel. Can also be toggled via the command palette.', 'showTimedNotes');
        this._addToggle(containerEl, 'Show "Create Timed Note" button in transcript sidebar','Show the sticky button at the top of the transcript sidebar for quickly adding timed notes.',         'showSidebarTimedNoteButton');
        this._addToggle(containerEl, 'Show "Add note" button in workspace',                 'Show the + button at the bottom of the notes pane for adding timed notes.',                          'showWorkspaceTimedNoteButton');

        // ---- Transcript Sidebar ----
        containerEl.createEl('h3', { text: 'Transcript Sidebar' });

        new Setting(containerEl)
            .setName('YouTube API Key')
            .setDesc('Personal YouTube Data API key. Without it transcript fetching may hit quota limits.')
            .addText(t => t.setPlaceholder('Enter API key')
                .setValue(this.plugin.settings.apiKey || '')
                .onChange(async v => {
                    this.plugin.settings.apiKey = v.trim();
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName('Transcript display location')
            .addDropdown(d => d
                .addOption(DISPLAY_SIDEBAR, 'Sidebar')
                .addOption(DISPLAY_NOTE,    'Below video in note')
                .setValue(this.plugin.settings.displayLocation)
                .onChange(async v => {
                    this.plugin.settings.displayLocation = v;
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName('Auto-extract transcript')
            .setDesc('Automatically create transcript notes when you paste [script](url) links.')
            .addToggle(t => t.setValue(this.plugin.settings.autoExtract)
                .onChange(async v => {
                    this.plugin.settings.autoExtract = v;
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName('Transcript folder')
            .addText(t => t.setPlaceholder(DEFAULT_TRANSCRIPT_FOLDER)
                .setValue(this.plugin.settings.transcriptFolder)
                .onChange(async v => {
                    this.plugin.settings.transcriptFolder = v || DEFAULT_TRANSCRIPT_FOLDER;
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName('Show chapters')
            .setDesc('Display video chapters as headings in transcripts when available.')
            .addToggle(t => t.setValue(this.plugin.settings.showChapters)
                .onChange(async v => {
                    this.plugin.settings.showChapters = v;
                    await this.plugin.saveSettings();
                }));

        containerEl.createEl('h4', { text: 'Sidebar controls' });

        new Setting(containerEl).setName('Show search bar')
            .addToggle(t => t.setValue(this.plugin.settings.showSearchBar)
                .onChange(async v => { this.plugin.settings.showSearchBar = v; await this.plugin.saveSettings(); }));

        new Setting(containerEl).setName('Show copy all button')
            .addToggle(t => t.setValue(this.plugin.settings.showCopyAllButton)
                .onChange(async v => { this.plugin.settings.showCopyAllButton = v; await this.plugin.saveSettings(); }));

        new Setting(containerEl).setName('Show create note button')
            .addToggle(t => t.setValue(this.plugin.settings.showCreateNoteButton)
                .onChange(async v => { this.plugin.settings.showCreateNoteButton = v; await this.plugin.saveSettings(); }));

        new Setting(containerEl)
            .setName('Timestamp interval')
            .setDesc('Number of transcript lines between timestamps.')
            .addText(t => t.setValue(this.plugin.settings.timestampMod.toString())
                .onChange(async v => {
                    const n = parseInt(v);
                    this.plugin.settings.timestampMod = isNaN(n) ? DEFAULT_TIMESTAMP_MOD : n;
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl).setName('Language')
            .addText(t => t.setValue(this.plugin.settings.lang)
                .onChange(async v => { this.plugin.settings.lang = v; await this.plugin.saveSettings(); }));

        new Setting(containerEl).setName('Country')
            .addText(t => t.setValue(this.plugin.settings.country)
                .onChange(async v => { this.plugin.settings.country = v; await this.plugin.saveSettings(); }));

        // ---- Note Templates ----
        containerEl.createEl('h3', { text: 'Note Templates' });
        containerEl.createEl('p', {
            text: 'Customise the Markdown output for each note type using the variables listed below each editor. Variables are not case-sensitive ({{Title}} and {{title}} are the same).',
        });

        this._addTemplateField(containerEl,
            'New YouNote template',
            'Content inserted when a new YouNote is created. Can include a full frontmatter block (--- ... ---) followed by body text, or body text only. Use {{var}} placeholders anywhere — in frontmatter fields or in the body — they stay raw until the matching data (e.g. video title) is available, then fill in automatically. User-set values (banner, icon, status, etc.) are never overwritten by resolved placeholders.',
            'youtnoteNewNoteTemplate',
            DEFAULT_SETTINGS.youtnoteNewNoteTemplate,
            [
                ['title',     'Video title (filled in once a video is loaded)'],
                ['url',       'Full YouTube watch URL'],
                ['video_id',  'YouTube video ID'],
                ['thumbnail', 'Thumbnail image URL (used for banner etc.)'],
                ['date',      "Today's date (YYYY-MM-DD, resolved immediately)"],
            ]
        );

        this._addTemplateField(containerEl,
            'Transcript note (with timestamps)',
            'Used when creating a transcript note file or inserting a transcript into a note.',
            'transcriptNoteTemplate',
            DEFAULT_SETTINGS.transcriptNoteTemplate,
            [
                ['title',           'Video title'],
                ['url',             'Full YouTube watch URL'],
                ['date',            "Today's date (YYYY-MM-DD)"],
                ['thumbnail',       'Thumbnail image URL (best available quality)'],
                ['video_id',        'YouTube video ID (e.g. dQw4w9WgXcQ)'],
                ['transcript_body', 'The formatted transcript text with timestamps'],
            ]
        );

        this._addTemplateField(containerEl,
            'Transcript note (no timestamps / minimal)',
            'Used by the "Create transcript note from URL prompt (no timestamps)" command.',
            'transcriptMinimalTemplate',
            DEFAULT_SETTINGS.transcriptMinimalTemplate,
            [
                ['title',           'Video title'],
                ['url',             'Full YouTube watch URL'],
                ['date',            "Today's date (YYYY-MM-DD)"],
                ['thumbnail',       'Thumbnail image URL'],
                ['video_id',        'YouTube video ID'],
                ['transcript_body', 'The plain transcript text (no timestamps)'],
            ]
        );

        this._addTemplateField(containerEl,
            'Youtnote export — video header',
            'One line rendered per video when exporting notes. Used in both single-video and multi-video exports.',
            'youtnoteExportHeaderTemplate',
            DEFAULT_SETTINGS.youtnoteExportHeaderTemplate,
            [
                ['title',     'Video title'],
                ['url',       'Full YouTube watch URL'],
                ['video_id',  'YouTube video ID'],
                ['thumbnail', 'Thumbnail image URL'],
            ]
        );

        this._addTemplateField(containerEl,
            'Youtnote export — timed note row',
            'Rendered for each individual timed note when exporting. Use \\n in the template to add line breaks.',
            'youtnoteExportNoteTemplate',
            DEFAULT_SETTINGS.youtnoteExportNoteTemplate,
            [
                ['timestamp',     'Formatted timestamp (e.g. 1:23:45)'],
                ['timestamp_url', 'YouTube URL with ?t= seek parameter'],
                ['body',          'The note body (Markdown)'],
                ['video_id',      'YouTube video ID'],
                ['url',           'Video URL'],
                ['title',         'Video title'],
                ['thumbnail',     'Thumbnail image URL'],
            ]
        );
    }

    // ----------------------------------------------------------------
    // Private helpers
    // ----------------------------------------------------------------

    /** Create a toggle setting that auto-saves and optionally refreshes views. */
    _addToggle(containerEl, name, desc, key, refreshViews = true) {
        return new Setting(containerEl)
            .setName(name)
            .setDesc(desc)
            .addToggle(t => t.setValue(this.plugin.settings[key])
                .onChange(async v => {
                    this.plugin.settings[key] = v;
                    await this.plugin.saveSettings();
                    if (refreshViews) this.plugin.refreshAllViews();
                }));
    }

    /** Create a textarea-based template editor with a variable legend and reset button. */
    _addTemplateField(containerEl, name, desc, settingKey, defaultValue, variables) {
        const wrapper = containerEl.createDiv({ cls: 'yt-template-setting' });
        wrapper.createEl('h4', { text: name });
        if (desc) wrapper.createEl('p', { text: desc, cls: 'setting-item-description' });

        const textarea  = wrapper.createEl('textarea', { cls: 'yt-template-textarea' });
        const lineCount = (textarea.value.match(/\n/g) || []).length;
        textarea.value  = this.plugin.settings[settingKey] || defaultValue;
        textarea.rows   = Math.min(16, lineCount + 3);
        textarea.style.cssText = [
            'width:100%', 'font-family:var(--font-monospace)', 'font-size:12px',
            'resize:vertical', 'padding:8px', 'box-sizing:border-box',
            'border-radius:4px', 'border:1px solid var(--background-modifier-border)',
            'background:var(--background-primary)', 'color:var(--text-normal)',
        ].join(';');

        textarea.addEventListener('input', async () => {
            this.plugin.settings[settingKey] = textarea.value;
            await this.plugin.saveSettings();
        });

        // Reset button
        const btnRow  = wrapper.createDiv({ cls: 'yt-template-btn-row' });
        btnRow.style.cssText = 'display:flex;gap:8px;margin-top:4px;';
        const resetBtn = btnRow.createEl('button', { text: '↺ Reset to default', cls: 'mod-muted' });
        resetBtn.style.cssText = 'font-size:12px;cursor:pointer;';
        resetBtn.addEventListener('click', async () => {
            this.plugin.settings[settingKey] = defaultValue;
            textarea.value = defaultValue;
            textarea.rows  = Math.min(16, (defaultValue.match(/\n/g) || []).length + 3);
            await this.plugin.saveSettings();
        });

        // Variable legend (collapsible)
        const legend   = wrapper.createEl('details', { cls: 'yt-template-legend' });
        legend.style.cssText   = 'margin-top:6px;font-size:12px;color:var(--text-muted);';
        const summary  = legend.createEl('summary', { text: 'Available variables' });
        summary.style.cursor   = 'pointer';
        const table    = legend.createEl('table');
        table.style.cssText    = 'margin-top:6px;width:100%;border-collapse:collapse;';

        for (const [token, meaning] of variables) {
            const tr      = table.createEl('tr');
            const tdToken = tr.createEl('td');
            tdToken.createEl('code', { text: `{{${token}}}` });
            tdToken.style.cssText  = 'padding:2px 8px 2px 0;white-space:nowrap;';
            const tdMeaning = tr.createEl('td', { text: meaning });
            tdMeaning.style.cssText = 'padding:2px 0;color:var(--text-muted);';
        }
    }
}

// ====================================================================
// SECTION E: UNIFIED PLUGIN
// ====================================================================

/**
 * Unwrap a wiki-link `[label](url)` or quoted `"url"` / `'url'` value
 * that may appear in YAML frontmatter. Also handles YAML arrays.
 */
function _unwrapLinkSourceUrl(raw) {
    if (!raw) return null;

    if (Array.isArray(raw)) {
        for (const entry of raw) {
            const u = _unwrapLinkSourceUrl(entry);
            if (u) return u;
        }
        return null;
    }

    let s = String(raw).trim();

    // Strip surrounding quotes
    if ((s[0] === '"' && s[s.length-1] === '"') ||
        (s[0] === "'" && s[s.length-1] === "'")) {
        s = s.slice(1, -1).trim();
    }

    // Markdown/wiki link: [label](url)
    const wikiMatch = s.match(/^\[.*?\]\((.+?)\)$/);
    if (wikiMatch) return wikiMatch[1].trim();

    return s;
}

class UnifiedPlugin extends Plugin {
    // Shared state
    settings = {};

    // Youtnote-specific
    MarkdownEditor     = null;
    youtnoteFileModes  = {};
    didFinishOnload    = false;

    // Transcript-specific
    insertTranscriptCmd = null;
    modifyTimeout       = null;
    processedFiles      = new Set();

    async onload() {
        await this.loadSettings();
        YoutubeTranscript.setApiKey(this.settings.apiKey);

        // ---- Transcript plugin init ----
        this.insertTranscriptCmd = new InsertTranscriptCommand(this);
        this.registerView(VIEW_TYPE_YTRANSCRIPT, leaf => new TranscriptView(leaf, this));

        // ---- Youtnote plugin init ----
        // bi() is defined in the Section B bundle and extracts the MarkdownEditor class
        this.MarkdownEditor = bi(this.app);
        this.registerView(YOUTNOTE_VIEW_TYPE, e => new Yi(e, this));

        // ================================================================
        // Yi.prototype PATCHES — file-based playback position persistence
        // ================================================================

        // Patch getViewData: inject `playback-position` into frontmatter before save
        const origGetViewData = Yi.prototype.getViewData;
        Yi.prototype.getViewData = function() {
            const raw      = origGetViewData.call(this);
            const adapter  = this._playerAdapterRef;
            const position = Math.floor(adapter?.cachedCurrentTime ?? 0);
            const rate     = adapter?.cachedPlaybackRate ?? 1;

            if (position <= 2) return raw;

            const fmEnd = raw.indexOf('\n---\n', 4);
            if (fmEnd === -1) return raw;

            let fmBlock   = raw.slice(0, fmEnd);
            const afterFm = raw.slice(fmEnd);

            // Update or insert `playback-position`
            if (/^playback-position:/m.test(fmBlock)) {
                fmBlock = fmBlock.replace(/^playback-position:\s*[^\n]*/m, `playback-position: ${position}`);
            } else {
                fmBlock += `\nplayback-position: ${position}`;
            }

            // Update or insert `playback rate` (only when not 1×)
            if (rate !== 1) {
                if (/^playback rate:/m.test(fmBlock)) {
                    fmBlock = fmBlock.replace(/^playback rate:\s*[^\n]*/m, `playback rate: ${rate}`);
                } else {
                    fmBlock += `\nplayback rate: ${rate}`;
                }
            }

            return fmBlock + afterFm;
        };

        // Patch setViewData: extract `playback-position` and schedule seek
        const origSetViewData = Yi.prototype.setViewData;
        Yi.prototype.setViewData = function(data, clear) {
            const fmMatch = data.match(/^---[\s\S]*?\n---/);
            if (fmMatch) {
                const posMatch  = fmMatch[0].match(/^playback-position:\s*(\d+)/m);
                if (posMatch)  this._pendingSeekSec      = parseInt(posMatch[1],  10);
                const rateMatch = fmMatch[0].match(/^playback rate:\s*([\d.]+)/m);
                if (rateMatch) this._pendingPlaybackRate = parseFloat(rateMatch[1]);
            }
            origSetViewData.call(this, data, clear);
        };

        // ---- Transcript commands ----
        this.addCommand({
            id:   'transcript-from-text',
            name: 'Get YouTube transcript from selected url',
            editorCallback: (editor) => {
                const url = EditorExtensions.getSelectedText(editor).trim();
                this.openTranscript(URLDetector.cleanYouTubeUrl(url));
            },
        });

        this.addCommand({
            id:   'transcript-from-prompt',
            name: 'Get YouTube transcript from url prompt',
            callback: async () => {
                const modal = new YouTubeUrlPromptModal();
                modal.openAndGetValue(url => {
                    if (url) this.openTranscript(URLDetector.cleanYouTubeUrl(url));
                });
            },
        });

        this.addCommand({
            id:   'insert-youtube-transcript',
            name: 'Insert YouTube transcript',
            editorCallback: async (editor) => { await this.insertTranscriptCmd.execute(editor); },
        });

        this.addCommand({
            id:   'open-transcript-in-sidebar',
            name: 'Open transcript in sidebar (force sidebar)',
            editorCallback: (editor) => {
                const url = EditorExtensions.getSelectedText(editor).trim();
                this.forceSidebarTranscript(URLDetector.cleanYouTubeUrl(url));
            },
        });

        this.addCommand({
            id:   'insert-transcript-under-link',
            name: 'Insert transcript under link',
            editorCallback: async (editor) => { await this.insertTranscriptUnderLink(editor); },
        });

        this.addCommand({
            id:   'create-transcript-note-from-prompt',
            name: 'Create transcript note from URL prompt (no timestamps)',
            callback: async () => {
                const modal = new YouTubeUrlPromptModal();
                modal.openAndGetValue(async (rawUrl) => {
                    if (!rawUrl) return;
                    const url = URLDetector.toWatchUrl(rawUrl);
                    if (!url) { new Notice('Invalid YouTube URL — could not extract video ID.'); return; }

                    try {
                        const transcript = await YoutubeTranscript.fetchTranscript(url, {
                            lang:    this.settings.lang,
                            country: this.settings.country,
                        });
                        const formatted  = TranscriptFormatter.format(transcript, url, {
                            template:    TEMPLATE_MINIMAL,
                            showChapters: this.settings.showChapters,
                        });
                        const safeTitle  = (transcript.title || 'Untitled').replace(/[\\/:*?"<>|#]/g, '-').trim();
                        const folder     = this.settings.transcriptFolder || DEFAULT_TRANSCRIPT_FOLDER;
                        await this._ensureFolder(folder);

                        const fileName   = `${folder}/${safeTitle} - Transcript (no timestamps).md`;
                        const today      = new Date().toISOString().split('T')[0];
                        const videoId    = YoutubeTranscript.extractVideoIdFromUrl?.(url)
                                        || url.match(/[?&]v=([^&]+)/)?.[1]
                                        || '';
                        const thumbnail  = videoId ? `https://img.youtube.com/vi/${videoId}/hqdefault.jpg` : '';
                        const minTpl     = this.settings.transcriptMinimalTemplate;
                        const content    = minTpl
                            ? resolveTemplate(minTpl, { title: transcript.title, url, date: today, thumbnail, video_id: videoId, transcript_body: formatted })
                            : `### ${transcript.title}\n\n#### About The Video\n**Source**: ${url}\n**Retrieved**: ${today}\n\n#### Transcript\n${formatted}`;

                        const existing = this.app.vault.getAbstractFileByPath(fileName);
                        if (existing) {
                            new Notice(`Transcript already exists: ${fileName}`);
                            await this.app.workspace.getLeaf(false).openFile(existing);
                        } else {
                            const file = await this.app.vault.create(fileName, content);
                            new Notice(`Created: ${fileName}`);
                            await this.app.workspace.getLeaf(false).openFile(file);
                        }
                    } catch (err) {
                        new Notice(`Error: ${err.message || 'Failed'}`);
                    }
                });
            },
        });

        // ---- Youtnote commands ----
        this.addCommand({
            id:   'create-file',
            name: 'Create new Youtnote file',
            callback: async () => {
                const notesFolder = this.settings.youtubeNotesFolder || DEFAULT_YOUTUBE_NOTES_FOLDER;
                await this._ensureFolder(notesFolder);

                let name = 'Youtnote Untitled', fname = `${name}.md`;
                let path = `${notesFolder}/${fname}`, i = 1;
                while (await this.app.vault.adapter.exists(path)) {
                    fname = `${name} ${i}.md`;
                    path  = `${notesFolder}/${fname}`;
                    i++;
                }

                const _today = new Date().toISOString().split('T')[0];
                const _noteTpl = this.settings.youtnoteNewNoteTemplate || DEFAULT_SETTINGS.youtnoteNewNoteTemplate;
                // Resolve only vars we actually have right now (date); everything else stays as {{placeholder}}
                const _resolvedTpl = resolveTemplate(_noteTpl, { date: _today });

                // Check whether the user's template contains its own frontmatter block
                const _tplFmMatch = _resolvedTpl.match(/^(---\n[\s\S]*?\n---)([\s\S]*)$/);
                let _initialContent;
                if (_tplFmMatch) {
                    // Template has a frontmatter block — use it directly, injecting youtnote:true if absent
                    let _tplFm   = _tplFmMatch[1];
                    const _tplBody = _tplFmMatch[2];
                    if (!/^youtnote\s*:/m.test(_tplFm)) {
                        _tplFm = _tplFm.replace(/\n---$/, '\nyoutnote: true\n---');
                    }
                    _initialContent = _tplFm + _tplBody;
                } else {
                    // Template is body-only — wrap with a minimal frontmatter
                    _initialContent = `---\nyoutnote: true\n---\n\n${_resolvedTpl}`;
                }
                const created = await this.app.vault.create(path, _initialContent);
                const leaf    = this.app.workspace.getLeaf(true);
                await leaf.openFile(created);
                this.youtnoteFileModes[leaf.id ?? created.path] = YOUTNOTE_VIEW_TYPE;
                await this.setYoutnoteView(leaf);
            },
        });

        this.addCommand({
            id:   'open-as-youtnote-view',
            name: 'Open current file as Youtnote view',
            callback: () => {
                const leaf = this.app.workspace.getLeaf(false);
                if (leaf && leaf.view.getViewType() === 'markdown') {
                    this.youtnoteFileModes[leaf.id ?? leaf.view.file?.path ?? ''] = YOUTNOTE_VIEW_TYPE;
                    this.setYoutnoteView(leaf);
                }
            },
        });

        // ---- Integration command ----
        this.addCommand({
            id:   'open-transcript-for-youtnote-video',
            name: 'Open transcript for active Youtnote video',
            callback: () => { this._openTranscriptForActiveYoutnoteVideo(); },
        });

        // ---- Timed note commands ----
        this.addCommand({
            id:      'create-timed-note',
            name:    'Create timed note at current video position',
            hotkeys: [{ modifiers: ['Mod', 'Shift'], key: 'n' }],
            callback: () => {
                const leaves = this.app.workspace.getLeavesOfType(YOUTNOTE_VIEW_TYPE);
                if (!leaves.length) {
                    new Notice('Open a Youtnote workspace first');
                    return;
                }
                const view = leaves[0].view;
                if (typeof view._triggerCreateTimedNote === 'function') {
                    view._triggerCreateTimedNote();
                } else {
                    new Notice('No active Youtnote workspace found');
                }
            },
        });

        this.addCommand({
            id:   'toggle-timed-notes-visibility',
            name: 'Toggle timed notes visibility',
            callback: async () => {
                this.settings.showTimedNotes = !this.settings.showTimedNotes;
                await this.saveSettings();
                this.refreshAllViews();
                const state = this.settings.showTimedNotes ? 'visible' : 'hidden';
                new Notice(`Timed notes are now ${state}`);
            },
        });

        // ================================================================
        // ACTIVE LEAF CHANGE — position save/restore & transcript auto-sync
        // ================================================================

        this._playbackPositions = new Map();
        let _prevYoutnoteLeaf   = null;

        this.registerEvent(this.app.workspace.on('active-leaf-change', (leaf) => {
            // --- Save position when leaving a Youtnote leaf ---
            if (_prevYoutnoteLeaf && _prevYoutnoteLeaf !== leaf) {
                const prevView   = _prevYoutnoteLeaf.view;
                const newType    = leaf?.view?.getViewType?.();
                const isTranscript = newType === VIEW_TYPE_YTRANSCRIPT;
                const isYoutnote   = newType === YOUTNOTE_VIEW_TYPE;

                // Clear transcript sidebar only when truly leaving the Youtnote context
                if (this.settings.clearTranscriptOnLeave && !isTranscript && !isYoutnote) {
                    this.app.workspace.getLeavesOfType(VIEW_TYPE_YTRANSCRIPT)
                        .forEach(l => l.detach());
                }

                if (prevView?.getViewType?.() === YOUTNOTE_VIEW_TYPE && prevView.activeVideoId) {
                    const playerRef = prevView._playerAdapterRef;
                    if (playerRef && typeof playerRef.cachedCurrentTime === 'number'
                            && playerRef.cachedCurrentTime > 2) {
                        const pos  = playerRef.cachedCurrentTime;
                        const rate = playerRef.cachedPlaybackRate ?? 1;
                        this._playbackPositions.set(prevView.activeVideoId, pos);
                        if (!this._playbackRates) this._playbackRates = new Map();
                        this._playbackRates.set(prevView.activeVideoId, rate);
                        try { prevView.requestSave?.(); } catch (e) {}
                    }
                }
            }

            // --- Restore position and sync transcript when entering a Youtnote leaf ---
            if (leaf?.view?.getViewType?.() === YOUTNOTE_VIEW_TYPE) {
                _prevYoutnoteLeaf = leaf;
                const view        = leaf.view;

                // Prefer in-memory map (same session), fall back to file frontmatter value
                const inMemory  = view.activeVideoId ? this._playbackPositions.get(view.activeVideoId) : null;
                const fromFile  = view._pendingSeekSec;
                const savedSec  = (inMemory && inMemory > 2) ? inMemory
                                : (fromFile && fromFile > 2) ? fromFile : null;
                const savedRate = view._pendingPlaybackRate || null;

                view._pendingSeekSec      = null;
                view._pendingPlaybackRate = null;

                if (savedSec || savedRate) {
                    const playerRef = view._playerAdapterRef;
                    if (playerRef) {
                        if (savedSec)  playerRef._postLoadSeekSec  = savedSec;
                        if (savedRate) playerRef._postLoadSeekRate = savedRate;
                    }
                    // If adapter not yet registered, store on view for handleMessage to pick up
                    if (!playerRef) {
                        view._pendingSeekSec      = savedSec;
                        view._pendingPlaybackRate = savedRate;
                    }
                }

                // Auto-sync transcript — prefer active video URL, fall back to frontmatter
                if (this.settings.autoSyncTranscript) {
                    const file = view.file;
                    if (file) {
                        const activeVideoUrl = view.videos?.find(v => v.id === view.activeVideoId)?.url;
                        const fm      = this.app.metadataCache.getFileCache(file)?.frontmatter;
                        const fmRaw   = fm?.['link source'] || fm?.['link_source'];
                        const fmUrl   = _unwrapLinkSourceUrl(fmRaw);

                        let bodyUrl = null;
                        if (!activeVideoUrl && !fmUrl) {
                            try {
                                const cached = this.app.vault.cachedRead(file);
                                if (cached && typeof cached === 'string') {
                                    bodyUrl = URLDetector.extractYouTubeUrlFromText(cached);
                                } else if (cached?.then) {
                                    cached.then(text => {
                                        const u = URLDetector.extractYouTubeUrlFromText(text);
                                        if (u) {
                                            const c = URLDetector.toWatchUrl(u);
                                            if (c) this.forceSidebarTranscript(c);
                                        }
                                    }).catch(() => {});
                                }
                            } catch (_e) {}
                        }

                        const rawUrl = activeVideoUrl || fmUrl || bodyUrl;
                        if (rawUrl) {
                            const clean = URLDetector.toWatchUrl(rawUrl);
                            if (clean) this.forceSidebarTranscript(clean);
                        }
                    }
                }
            } else {
                _prevYoutnoteLeaf = null;
            }
        }));

        // ---- Schedule "Open Transcript" button on all Youtnote views ----
        let btnScheduled = false;
        const scheduleBtn = () => {
            if (!btnScheduled) {
                btnScheduled = true;
                window.requestAnimationFrame(() => {
                    btnScheduled = false;
                    this._ensureTranscriptButtonsOnYoutnoteViews();
                });
            }
        };
        this.registerEvent(this.app.workspace.on('layout-change', scheduleBtn));
        scheduleBtn();

        // ---- Inject toolbar button into markdown views for .youtnote files ----
        let mdScheduled = false, mdFrame = null;
        const scheduleMd = () => {
            if (!mdScheduled) {
                mdScheduled = true;
                mdFrame = window.requestAnimationFrame(() => {
                    mdScheduled = false;
                    mdFrame     = null;
                    this.app.workspace.iterateAllLeaves(leaf => {
                        if (leaf.view.getViewType() !== 'markdown') return;
                        const view = leaf.view, file = view.file;

                        if (!file || file.extension !== 'md') {
                            if (view.youtnoteActionEl) {
                                view.youtnoteActionEl.remove();
                                view.youtnoteActionEl      = null;
                                view.youtnoteActionFilePath = null;
                            }
                            return;
                        }

                        const isYN = this.isYoutnoteFileFromCache(file);
                        if (view.youtnoteActionFilePath === file.path && view.youtnoteActionEl?.isConnected) return;

                        if (view.youtnoteActionEl) {
                            view.youtnoteActionEl.remove();
                            view.youtnoteActionEl      = null;
                            view.youtnoteActionFilePath = null;
                        }

                        if (isYN) {
                            view.youtnoteActionEl = view.addAction('youtnote', 'Open as Youtnote view', () => {
                                this.youtnoteFileModes[leaf.id ?? file.path] = YOUTNOTE_VIEW_TYPE;
                                this.setYoutnoteView(leaf);
                            });
                            view.youtnoteActionFilePath = file.path;
                        }
                    });
                });
            }
        };
        this.registerEvent(this.app.workspace.on('layout-change', scheduleMd));
        scheduleMd();
        this.register(() => {
            if (mdFrame !== null) { activeWindow.cancelAnimationFrame(mdFrame); mdFrame = null; mdScheduled = false; }
        });

        // ---- File context menu ----
        this.registerEvent(this.app.workspace.on('file-menu', (menu, file) => {
            (async () => {
                if (file instanceof TFile && file.extension === 'md' && await this.isYoutnoteFile(file)) {
                    menu.addItem(item => {
                        item.setTitle('Open as Youtnote view').setIcon('youtnote').setSection('pane').onClick(() => {
                            const leaves = this.app.workspace.getLeavesOfType('markdown');
                            for (const l of leaves) {
                                if (l.view.file?.path === file.path) {
                                    this.youtnoteFileModes[l.id ?? file.path] = YOUTNOTE_VIEW_TYPE;
                                    this.setYoutnoteView(l);
                                    return;
                                }
                            }
                            this.app.workspace.getLeaf(true).setViewState({
                                type:   YOUTNOTE_VIEW_TYPE,
                                state:  { file: file.path },
                                active: true,
                            });
                        });
                    });
                }
            })();
        }));

        // ---- Auto-extract transcripts on file modify ----
        this.registerEvent(this.app.vault.on('modify', (file) => {
            if (file.extension === 'md') {
                clearTimeout(this.modifyTimeout);
                this.modifyTimeout = setTimeout(() => { this._processAutoExtractForFile(file); }, 1000);
            }
        }));

        // ---- Sync transcript when frontmatter `link source` changes ----
        this.registerEvent(this.app.metadataCache.on('changed', (file) => {
            if (!this.settings.autoSyncTranscript) return;
            const activeLeaf = this.app.workspace.activeLeaf;
            if (!activeLeaf || activeLeaf.view?.file?.path !== file.path) return;
            if (activeLeaf.view?.getViewType?.() !== YOUTNOTE_VIEW_TYPE) return;

            const activeView     = this.app.workspace.activeLeaf?.view;
            const activeVideoUrl = activeView?.videos?.find(v => v.id === activeView?.activeVideoId)?.url;
            const fm      = this.app.metadataCache.getFileCache(file)?.frontmatter;
            const fmRaw   = fm?.['link source'] || fm?.['link_source'];
            const rawUrl  = activeVideoUrl || _unwrapLinkSourceUrl(fmRaw);
            if (!rawUrl) return;
            const clean = URLDetector.toWatchUrl(rawUrl);
            if (clean) this.forceSidebarTranscript(clean);
        }));

        // ---- Ribbon icon ----
        this.addRibbonIcon('youtnote', 'Create new Youtnote', () => {
            this.app.commands.executeCommandById(`${this.manifest.id}:create-file`);
        });

        // ---- Settings tab ----
        this.addSettingTab(new UnifiedSettingTab(this.app, this));

        // ================================================================
        // PLAYER ADAPTER PATCHES
        // Patch `pi` (PlayerAdapter from Section B bundle) to register
        // itself on the owning Yi view and apply pending seek/rate after load.
        // ================================================================

        const plugin = this;
        const origHandleMessage = pi.prototype.handleMessage;
        const origLoadVideo     = pi.prototype.loadVideo;

        // Patch loadVideo: apply any pending seek/rate AFTER the video
        // is confirmed loaded, avoiding the buffering race condition.
        pi.prototype.loadVideo = async function(videoId) {
            const result   = await origLoadVideo.call(this, videoId);
            const seekSec  = this._postLoadSeekSec;
            const seekRate = this._postLoadSeekRate;
            this._postLoadSeekSec  = null;
            this._postLoadSeekRate = null;
            if (seekSec && seekSec > 2) {
                try { await this.seekTo(seekSec); } catch (e) {}
            }
            if (seekRate && seekRate !== 1) {
                this.sendCommand('setPlaybackRate', [seekRate]);
            }
            return result;
        };

        // Patch handleMessage: register the adapter on the owning Yi view,
        // and stage pending seek/rate before the original handler executes.
        pi.prototype.handleMessage = function(e) {
            if (!this._registeredOnView) {
                try {
                    // Attempt registration on every message until the iframe is found
                    const leaves = plugin.app.workspace.getLeavesOfType(YOUTNOTE_VIEW_TYPE);
                    for (const leaf of leaves) {
                        const view = leaf.view;
                        if (view && this.iframeElement && leaf.view.contentEl.contains(this.iframeElement)) {
                            view._playerAdapterRef   = this;
                            this._registeredOnView  = true;
                            // Stage seek/rate from view pending fields
                            const seekSec  = view._pendingSeekSec;
                            const seekRate = view._pendingPlaybackRate;
                            view._pendingSeekSec      = null;
                            view._pendingPlaybackRate = null;
                            if (seekSec  && seekSec  > 2) this._postLoadSeekSec  = seekSec;
                            if (seekRate && seekRate !== 1) this._postLoadSeekRate = seekRate;
                            break;
                        }
                    }
                } catch (err) { /* silent — registration will retry on next message */ }
            }
            origHandleMessage.call(this, e);
        };

        this.didFinishOnload = true;
    }

    onunload() {
        this.app.workspace.detachLeavesOfType(VIEW_TYPE_YTRANSCRIPT);
        clearTimeout(this.modifyTimeout);
        this.didFinishOnload = false;
    }

    // ================================================================
    // SETTINGS
    // ================================================================

    async loadSettings() {
        const data = await this.loadData() ?? {};
        // Handle old Youtnote data format: { settings: { ... } }
        const youtnoteOld = (data.settings && typeof data.settings === 'object') ? data.settings : {};
        this.settings = Object.assign({}, DEFAULT_SETTINGS, youtnoteOld, data);
        if (this.settings.settings) delete this.settings.settings;
    }

    async saveSettings() {
        await this.saveData(this.settings);
        YoutubeTranscript.setApiKey(this.settings.apiKey);
    }

    /** Alias used by the Youtnote settings tab. */
    async saveDataState() {
        await this.saveSettings();
    }

    // ================================================================
    // TRANSCRIPT METHODS
    // ================================================================

    openTranscript(url) {
        if (this.settings.displayLocation === DISPLAY_NOTE) {
            this._insertTranscriptInActiveNote(url);
        } else {
            this.forceSidebarTranscript(url);
        }
    }

    forceSidebarTranscript(url) {
        const clean = URLDetector.toWatchUrl(url) || URLDetector.cleanYouTubeUrl(url);
        if (!clean) return;

        // Debounce: suppress duplicate calls for the SAME URL within 500 ms.
        // Different URLs always pass through immediately.
        if (this._lastTranscriptUrl === clean && this._lastTranscriptTime
                && (Date.now() - this._lastTranscriptTime) < 500) return;
        this._lastTranscriptUrl  = clean;
        this._lastTranscriptTime = Date.now();

        // Always reuse a single transcript leaf; detach any extras
        const existingLeaves = this.app.workspace.getLeavesOfType(VIEW_TYPE_YTRANSCRIPT);
        for (let i = 1; i < existingLeaves.length; i++) existingLeaves[i].detach();

        const leaf = existingLeaves[0] ?? this.app.workspace.getRightLeaf(false);
        leaf.setViewState({ type: VIEW_TYPE_YTRANSCRIPT }).then(() => {
            this.app.workspace.revealLeaf(leaf);
            leaf.setEphemeralState({ url: clean });
        });
    }

    async _insertTranscriptInActiveNote(url) {
        const view = this.app.workspace.getActiveViewOfType(MarkdownView);
        if (!view) { new Notice('No active note found'); return; }

        const transcript = await YoutubeTranscript.fetchTranscript(url, {
            lang:    this.settings.lang,
            country: this.settings.country,
        });
        const formatted  = TranscriptFormatter.format(transcript, url, {
            template:      TEMPLATE_RICH,
            timestampMod:  this.settings.timestampMod,
            showChapters:  this.settings.showChapters,
            noteTemplate:  this.settings.transcriptNoteTemplate,
        });
        view.editor.replaceRange(formatted, view.editor.getCursor());
        new Notice('Transcript inserted in note');
    }

    async insertTranscriptUnderLink(editor) {
        const selected = editor.getSelection();
        const rawUrl   = URLDetector.extractYouTubeUrlFromText(selected);
        const url      = rawUrl ? URLDetector.cleanYouTubeUrl(rawUrl) : null;
        if (!url) { new Notice('No YouTube URL found in selection'); return; }

        const transcript = await YoutubeTranscript.fetchTranscript(url, {
            lang:    this.settings.lang,
            country: this.settings.country,
        });
        const formatted  = TranscriptFormatter.format(transcript, url, {
            template:     TEMPLATE_RICH,
            timestampMod: this.settings.timestampMod,
            showChapters: this.settings.showChapters,
            noteTemplate: this.settings.transcriptNoteTemplate,
        });

        const cursor  = editor.getCursor();
        const line    = editor.getLine(cursor.line);
        const linkEnd = line.indexOf(rawUrl) + rawUrl.length;
        editor.replaceRange('\n\n' + formatted + '\n', { line: cursor.line, ch: linkEnd });
        new Notice('Transcript inserted under link');
    }

    async _processAutoExtractForFile(file) {
        if (!this.settings.autoExtract) return;
        if (this.processedFiles.has(file.path)) return;

        const content     = await this.app.vault.read(file);
        const scriptLinks = this._findScriptMarkdownLinks(content);
        if (!scriptLinks.length) return;

        this.processedFiles.add(file.path);
        await new Promise(r => setTimeout(r, 100));
        await this._createTranscriptNotesForLinks(file, scriptLinks);
    }

    _findScriptMarkdownLinks(content) {
        const links  = [];
        const mdPat  = /\[script\]\((https?:\/\/[^\s<>"{}|\\^`[\]]+)\)/gi;
        const imgPat = /!\[script\]\((https?:\/\/[^\s<>"{}|\\^`[\]]+)\)/gi;

        let match;
        while ((match = mdPat.exec(content)) !== null) {
            const url = URLDetector.cleanYouTubeUrl(match[1]);
            if (URLDetector.isValidYouTubeUrl(url)) {
                links.push({ url, type: 'markdown', fullMatch: match[0], index: match.index });
            }
        }
        while ((match = imgPat.exec(content)) !== null) {
            const url = URLDetector.cleanYouTubeUrl(match[1]);
            if (URLDetector.isValidYouTubeUrl(url)) {
                links.push({ url, type: 'image', fullMatch: match[0], index: match.index });
            }
        }
        return links;
    }

    async _createTranscriptNotesForLinks(file, scriptLinks) {
        if (!this.settings.autoExtract) return;
        const folder  = this.settings.transcriptFolder || DEFAULT_TRANSCRIPT_FOLDER;
        await this._ensureFolder(folder);

        const created = [];
        for (const link of scriptLinks) {
            try {
                const transcript = await YoutubeTranscript.fetchTranscript(link.url, {
                    lang:    this.settings.lang,
                    country: this.settings.country,
                });
                const safeTitle = (transcript.title || 'Transcript').replace(/[\\/:*?"<>|#]/g, '-').trim();
                const fileName  = `${folder}/${safeTitle} - Transcript.md`;
                const existing  = this.app.vault.getAbstractFileByPath(fileName);

                if (!existing) {
                    const c = TranscriptFormatter.format(transcript, link.url, {
                        template:     TEMPLATE_RICH,
                        timestampMod: this.settings.timestampMod,
                        showChapters: this.settings.showChapters,
                        noteTemplate: this.settings.transcriptNoteTemplate,
                    });
                    const newFile = await this.app.vault.create(fileName, c);
                    created.push({ file: newFile, link });
                } else {
                    created.push({ file: existing, link });
                }
            } catch (err) {
                console.error(`Failed transcript for ${link.url}:`, err);
            }
        }

        if (created.length) {
            let newContent = await this.app.vault.read(file);
            // Sort descending by index so replacements don't shift earlier offsets
            created.sort((a, b) => b.link.index - a.link.index);
            created.forEach(({ file: tFile, link }) => {
                const display = tFile.path.includes(' - Transcript.md') ? 'View Transcript' : 'Transcript';
                newContent = newContent.replace(link.fullMatch, `${link.fullMatch} [[${tFile.path}|${display}]]`);
            });
            if (newContent !== await this.app.vault.read(file)) {
                await this.app.vault.modify(file, newContent);
                new Notice('Transcript links updated');
            }
        }
    }

    async _ensureFolder(path) {
        if (!this.app.vault.getAbstractFileByPath(path)) {
            await this.app.vault.createFolder(path);
        }
    }

    // ================================================================
    // YOUTNOTE METHODS
    // ================================================================

    isYoutnoteFileFromCache(file) {
        return this.app.metadataCache.getFileCache(file)?.frontmatter?.youtnote === true;
    }

    async isYoutnoteFile(file) {
        if (this.isYoutnoteFileFromCache(file)) return true;
        return Pi(await this.app.vault.cachedRead(file));
    }

    async setMarkdownView(leaf) {
        const state = leaf.view.getState();
        if (!state?.file) return;
        await leaf.setViewState({ type: 'markdown', state, popstate: true });
    }

    async setYoutnoteView(leaf) {
        const state = leaf.view.getState();
        if (!state?.file) return;
        await leaf.setViewState({ type: YOUTNOTE_VIEW_TYPE, state, popstate: true });
    }

    refreshAllViews() {
        this.app.workspace.getLeavesOfType(YOUTNOTE_VIEW_TYPE).forEach(leaf => {
            const v = leaf.view;
            if (v instanceof Yi && v.root) {
                v.root.render(A(Vi, {
                    app:              this.app,
                    view:             v,
                    settings:         { ...this.settings },
                    videos:           v.videos,
                    notes:            v.notes,
                    activeVideoId:    v.activeVideoId,
                    setActiveVideoId: v.handleSetActiveVideoId,
                    onUpdateVideos:   v.handleUpdateVideos,
                    onUpdateNotes:    v.handleUpdateNotes,
                    onExportSingleVideo: v.handleExportSingleVideo,
                    onExportAllVideos:   v.handleExportAllVideos,
                }));
                if (typeof v.applyHeaderButtonVisibility === 'function') {
                    v.applyHeaderButtonVisibility();
                }
            }
        });
    }

    monkeyPatchLeafSetViewState = () => {
        const plugin           = this;
        const origSetViewState = WorkspaceLeaf.prototype.setViewState;
        const origDetach       = WorkspaceLeaf.prototype.detach;

        WorkspaceLeaf.prototype.setViewState = function(state, eState) {
            if (!plugin.didFinishOnload) return origSetViewState.call(this, state, eState);

            const filePath = state.state?.file;
            const leafId   = filePath ? Zi(this, filePath) : Zi(this);

            if (filePath && filePath.length > 0 && leafId
                    && state.type === 'markdown'
                    && plugin.youtnoteFileModes[leafId] !== 'markdown'
                    && plugin.app.metadataCache.getCache(filePath)?.frontmatter?.youtnote === true) {
                plugin.youtnoteFileModes[leafId] = YOUTNOTE_VIEW_TYPE;
                return origSetViewState.call(this, { ...state, type: YOUTNOTE_VIEW_TYPE }, eState);
            }
            return origSetViewState.call(this, state, eState);
        };

        WorkspaceLeaf.prototype.detach = function() {
            const filePath = Xi(this.view?.getState());
            const leafId   = Zi(this, filePath);
            if (leafId && plugin.youtnoteFileModes[leafId]) delete plugin.youtnoteFileModes[leafId];
            return origDetach.apply(this);
        };

        return () => {
            WorkspaceLeaf.prototype.setViewState = origSetViewState;
            WorkspaceLeaf.prototype.detach       = origDetach;
        };
    };

    // ================================================================
    // INTEGRATION METHODS
    // ================================================================

    _openTranscriptForActiveYoutnoteVideo() {
        const leaf = this.app.workspace.activeLeaf;
        if (leaf?.view?.getViewType() !== YOUTNOTE_VIEW_TYPE) {
            new Notice('Open a Youtnote file first');
            return;
        }

        const view  = leaf.view;
        const file  = view.file;
        const activeVideoUrl = view.videos?.find(v => v.id === view.activeVideoId)?.url;
        const fm    = file ? this.app.metadataCache.getFileCache(file)?.frontmatter : null;
        const fmRaw = fm?.['link source'] || fm?.['link_source'];
        const rawUrl = activeVideoUrl || _unwrapLinkSourceUrl(fmRaw);

        if (!rawUrl) { new Notice('No video URL found. Make sure a video is loaded.'); return; }
        const clean = URLDetector.toWatchUrl(rawUrl);
        if (!clean) { new Notice('Invalid YouTube URL — could not extract video ID.'); return; }
        this.forceSidebarTranscript(clean);
    }

    _ensureTranscriptButtonsOnYoutnoteViews() {
        this.app.workspace.getLeavesOfType(YOUTNOTE_VIEW_TYPE).forEach(leaf => {
            const view = leaf.view;
            if (!view || view._transcriptBtnAdded) return;

            view._btnTranscript = view.addAction('scroll', 'Open transcript for this video', () => {
                const file          = view.file;
                const fm            = file ? this.app.metadataCache.getFileCache(file)?.frontmatter : null;
                const activeVideoUrl = view.videos?.find(v => v.id === view.activeVideoId)?.url;
                const fmRaw         = fm?.['link source'] || fm?.['link_source'];
                const rawUrl        = activeVideoUrl || _unwrapLinkSourceUrl(fmRaw);

                if (rawUrl) {
                    const clean = URLDetector.toWatchUrl(rawUrl);
                    if (clean) this.forceSidebarTranscript(clean);
                    else new Notice('Invalid YouTube URL');
                } else {
                    new Notice('No video URL found. Make sure a video is loaded.');
                }
            });

            view._transcriptBtnAdded = true;
            if (typeof view.applyHeaderButtonVisibility === 'function') {
                view.applyHeaderButtonVisibility();
            }

            // Hook: called by setViewData when the note content changes.
            // Handles transcript sync and optional clear on note switch.
            const plugin = this;
            view._onViewDataChanged = function() {
                const v = this;

                if (plugin.settings.clearTranscriptOnLeave) {
                    plugin.app.workspace.getLeavesOfType(VIEW_TYPE_YTRANSCRIPT)
                        .forEach(l => l.detach());
                }

                if (plugin.settings.autoSyncTranscript) {
                    const file = v.file;
                    if (file) {
                        const activeVideoUrl = v.videos?.find(vid => vid.id === v.activeVideoId)?.url;
                        const fm    = plugin.app.metadataCache.getFileCache(file)?.frontmatter;
                        const fmRaw = fm?.['link source'] || fm?.['link_source'];
                        const rawUrl = activeVideoUrl || _unwrapLinkSourceUrl(fmRaw);

                        if (rawUrl) {
                            const clean = URLDetector.toWatchUrl(rawUrl);
                            if (clean) plugin.forceSidebarTranscript(clean);
                        } else {
                            // Non-standard note: scan cached content for a URL
                            try {
                                const cached = plugin.app.vault.cachedRead(file);
                                if (cached?.then) {
                                    cached.then(text => {
                                        const u = URLDetector.extractYouTubeUrlFromText(text);
                                        if (u) {
                                            const c = URLDetector.toWatchUrl(u);
                                            if (c) plugin.forceSidebarTranscript(c);
                                        }
                                    }).catch(() => {});
                                }
                            } catch (_e) {}
                        }
                    }
                }
            }.bind(view);
        });
    }
}

module.exports = UnifiedPlugin;