hybjuvar __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/main.ts
var main_exports = {};
__export(main_exports, {
  default: () => YTranscriptPlugin
});
module.exports = __toCommonJS(main_exports);

// buffer-polyfill.js
if (typeof Buffer === "undefined") {
  globalThis.Buffer = {
    from: function(data) {
      if (data instanceof Uint8Array) {
        let binary = "";
        for (let i = 0; i < data.length; i++) {
          binary += String.fromCharCode(data[i]);
        }
        return {
          toString: function(encoding) {
            if (encoding === "base64") {
              return btoa(binary);
            }
            return binary;
          }
        };
      }
      return {
        toString: function(encoding) {
          if (encoding === "base64") {
            return btoa(String(data));
          }
          return String(data);
        }
      };
    }
  };
}

// src/main.ts
var import_obsidian4 = require("obsidian");

// src/transcript-view.ts
var import_obsidian2 = require("obsidian");

// src/youtube-transcript.ts
var import_obsidian = require("obsidian");

// src/types.ts
var YoutubeTranscriptError = class extends Error {
  constructor(err) {
    if (!(err instanceof Error)) {
      super("");
      return;
    }
    if (err.message.includes("ERR_INVALID_URL")) {
      super("Invalid YouTube URL");
    } else {
      super(err.message);
    }
  }
};

// src/api-parser.ts
var YOUTUBE_TITLE_REGEX = new RegExp(
  /<meta\s+name="title"\s+content="([^"]*)\">/
);
var YOUTUBE_VIDEOID_REGEX = new RegExp(
  /<link\s+rel="canonical"\s+href="([^"]*)\">/
);
function decodeHtmlEntities(text) {
  return text.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&apos;/g, "'").replace(
    /&#(\d+);/g,
    (_, code) => String.fromCharCode(parseInt(code, 10))
  ).replace(
    /&#x([a-fA-F0-9]+);/g,
    (_, code) => String.fromCharCode(parseInt(code, 16))
  ).replace(/\n/g, " ").trim();
}
function parseTranscriptXml(xmlContent) {
  const lines = [];
  const textMatches = xmlContent.matchAll(
    /<text\s+start="([^"]+)"\s+dur="([^"]+)"[^>]*>([\s\S]*?)<\/text>/g
  );
  for (const match of textMatches) {
    const startSeconds = parseFloat(match[1]);
    const durationSeconds = parseFloat(match[2]);
    const text = decodeHtmlEntities(match[3].replace(/<[^>]+>/g, ""));
    if (text) {
      lines.push({
        text,
        offset: Math.round(startSeconds * 1e3),
        duration: Math.round(durationSeconds * 1e3)
      });
    }
  }
  if (lines.length === 0) {
    const pMatches = xmlContent.matchAll(
      /<p\s+t="(\d+)"\s+d="(\d+)"[^>]*>([\s\S]*?)<\/p>/g
    );
    for (const match of pMatches) {
      const offset = parseInt(match[1], 10);
      const duration = parseInt(match[2], 10);
      const text = decodeHtmlEntities(match[3].replace(/<[^>]+>/g, ""));
      if (text) {
        lines.push({
          text,
          offset,
          duration
        });
      }
    }
  }
  return lines;
}

// src/youtube-transcript.ts
var _YoutubeTranscript = class _YoutubeTranscript {
  static async getTranscript(url, config) {
    var _a, _b, _c, _d, _e, _f;
    try {
      const videoId = this.extractVideoIdFromUrl(url);
      if (!videoId) {
        throw new YoutubeTranscriptError(
          new Error(
            "Invalid YouTube URL - could not extract video ID"
          )
        );
      }
      console.log(`🎬 Fetching transcript for video: ${videoId}`);
      const playerData = await this.fetchPlayerData(videoId, config);
      const title = ((_a = playerData.videoDetails) == null ? void 0 : _a.title) || "Unknown";
      const captionsData = (_b = playerData.captions) == null ? void 0 : _b.playerCaptionsTracklistRenderer;
      if (!captionsData || !captionsData.captionTracks) {
        throw new YoutubeTranscriptError(
          new Error("No captions available for this video")
        );
      }
      console.log(
        `📝 Found ${captionsData.captionTracks.length} caption track(s)`
      );
      const langCode = (config == null ? void 0 : config.lang) || "en";
      const captionTrack = this.findCaptionTrack(
        captionsData.captionTracks,
        langCode
      );
      if (!captionTrack) {
        const availableLangs = captionsData.captionTracks.map((t) => t.languageCode).join(", ");
        throw new YoutubeTranscriptError(
          new Error(
            `No transcript found for language '${langCode}'. Available: ${availableLangs}`
          )
        );
      }
      const trackName = ((_e = (_d = (_c = captionTrack.name) == null ? void 0 : _c.runs) == null ? void 0 : _d[0]) == null ? void 0 : _e.text) || ((_f = captionTrack.name) == null ? void 0 : _f.simpleText) || captionTrack.languageCode;
      console.log(
        `🔄 Using caption track: ${trackName} (${captionTrack.languageCode})`
      );
      const transcriptUrl = captionTrack.baseUrl;
      console.log(
        `📥 Fetching transcript from: ${transcriptUrl.substring(0, 80)}...`
      );
      const lines = await this.fetchTranscriptFromUrl(transcriptUrl);
      console.log(
        `✅ Successfully fetched ${lines.length} transcript lines`
      );
      return {
        title: this.decodeHTML(title),
        lines
      };
    } catch (err) {
      if (err instanceof YoutubeTranscriptError) {
        throw err;
      }
      throw new YoutubeTranscriptError(err);
    }
  }
  
  /**
   * Extract video ID from various YouTube URL formats
   */
  static extractVideoIdFromUrl(url) {
    const patterns = [
      /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/v\/)([a-zA-Z0-9_-]{11})/,
      /^([a-zA-Z0-9_-]{11})$/
      // Just the video ID
    ];
    for (const pattern of patterns) {
      const match = url.match(pattern);
      if (match) {
        return match[1];
      }
    }
    return null;
  }
  
  /**
   * Fetches player data from YouTube's InnerTube API using ANDROID client
   */
  static async fetchPlayerData(videoId, config) {
    const context = {
      ..._YoutubeTranscript.INNERTUBE_CONTEXT,
      client: {
        ..._YoutubeTranscript.INNERTUBE_CONTEXT.client,
        hl: (config == null ? void 0 : config.lang) || "en",
        gl: (config == null ? void 0 : config.country) || "US"
      }
    };
    const requestBody = {
      context,
      videoId
    };
    console.log(`🔄 Calling InnerTube Player API with IOS client...`);
    const response = await (0, import_obsidian.requestUrl)({
      url: _YoutubeTranscript.INNERTUBE_PLAYER_URL,
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "User-Agent": "com.google.ios.youtube/20.10.38 (iPhone16,2; U; CPU iOS 17_5_1 like Mac OS X)"
      },
      body: JSON.stringify(requestBody)
    });
    const data = JSON.parse(response.text);
    const playabilityStatus = data.playabilityStatus;
    if (playabilityStatus) {
      console.log(`📊 Playability status: ${playabilityStatus.status}`);
      if (playabilityStatus.status === "ERROR") {
        throw new Error(
          playabilityStatus.reason || "Video unavailable"
        );
      }
      if (playabilityStatus.status === "LOGIN_REQUIRED") {
        throw new Error("This video requires login to view");
      }
      if (playabilityStatus.status === "UNPLAYABLE") {
        throw new Error(
          playabilityStatus.reason || "Video is unplayable"
        );
      }
    }
    return data;
  }
  
  /**
   * Finds the best matching caption track for the requested language
   */
  static findCaptionTrack(captionTracks, langCode) {
    let track = captionTracks.find((t) => t.languageCode === langCode);
    if (track) return track;
    track = captionTracks.find(
      (t) => t.languageCode.startsWith(langCode + "-")
    );
    if (track) return track;
    track = captionTracks.find(
      (t) => langCode.startsWith(t.languageCode + "-")
    );
    if (track) return track;
    if (captionTracks.length > 0) {
      console.log(
        `⚠️ Language '${langCode}' not found, falling back to '${captionTracks[0].languageCode}'`
      );
      return captionTracks[0];
    }
    return null;
  }
  
  /**
   * Fetches transcript XML from the caption track URL
   */
  static async fetchTranscriptFromUrl(transcriptUrl) {
    const response = await (0, import_obsidian.requestUrl)({
      url: transcriptUrl,
      method: "GET",
      headers: {
        "Accept-Language": "en-US,en;q=0.9"
      }
    });
    console.log(
      `📄 Transcript response length: ${response.text.length} bytes`
    );
    if (response.text.length === 0) {
      throw new Error("Received empty transcript response");
    }
    return parseTranscriptXml(response.text);
  }
  
  /**
   * Decodes HTML entities in a text string
   */
  static decodeHTML(text) {
    return text.replace(/&#39;/g, "'").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(
      /&#(\d+);/g,
      (_, code) => String.fromCharCode(parseInt(code, 10))
    ).replace(/\\n/g, " ").replace(/\s+/g, " ").trim();
  }
};
// YouTube's public InnerTube API key
_YoutubeTranscript.INNERTUBE_API_KEY = "AIzaSyAO_FJ2SlqU8Q4STEHLGCilw_Y9_11qcW8";
_YoutubeTranscript.INNERTUBE_PLAYER_URL = `https://www.youtube.com/youtubei/v1/player?key=${_YoutubeTranscript.INNERTUBE_API_KEY}`;
// Use IOS client - ANDROID client no longer returns captions (early 2026).
// IOS client returns caption track URLs that work without PO tokens.
_YoutubeTranscript.INNERTUBE_CONTEXT = {
  client: {
    clientName: "IOS",
    clientVersion: "20.10.38",
    hl: "en",
    gl: "US"
  }
};
var YoutubeTranscript = _YoutubeTranscript;

// src/timestampt-utils.ts
var formatTimestamp = (t) => {
  if (t < 0) return "00:00";
  const fnum = (n) => `${n | 0}`.padStart(2, "0");
  const s = 1e3;
  const m = 60 * s;
  const h = 60 * m;
  const hours = Math.floor(t / h);
  const minutes = Math.floor((t - hours * h) / m);
  const seconds = Math.floor((t - hours * h - minutes * m) / s);
  const time = hours ? [hours, minutes, seconds] : [minutes, seconds];
  return time.map(fnum).join(":");
};

// src/render-utils.ts
var highlightText = (div, searchValue) => {
  const content = div.innerHTML;
  const highlightedContent = content.replace(
    new RegExp(searchValue, "gi"),
    '<span class="yt-transcript__highlight">$&</span>'
  );
  div.innerHTML = highlightedContent;
};
var getTranscriptBlocks = (data, timestampMod) => {
  const transcriptBlocks = [];
  let quote = "";
  let quoteTimeOffset = 0;
  data.forEach((line, i) => {
    if (i === 0) {
      quoteTimeOffset = line.offset;
      quote += line.text + " ";
      return;
    }
    if (i % timestampMod == 0) {
      transcriptBlocks.push({
        quote,
        quoteTimeOffset
      });
      quote = "";
      quoteTimeOffset = line.offset;
    }
    quote += line.text + " ";
  });
  if (quote !== "") {
    transcriptBlocks.push({
      quote,
      quoteTimeOffset
    });
  }
  return transcriptBlocks;
};

// src/transcript-view.js
var TRANSCRIPT_TYPE_VIEW = "transcript-view";
var TranscriptView = class extends import_obsidian2.ItemView {
  constructor(leaf, plugin) {
    super(leaf);
    this.videoData = [];
    this.plugin = plugin;
    this.isDataLoaded = false;
  }
  
  async onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.createEl("h4", { text: "Transcript" });
  }
  
  async onClose() {
    const leafIndex = this.getLeafIndex();
    this.plugin.settings.leafUrls.splice(leafIndex, 1);
    await this.plugin.saveSettings();
  }
  
  /**
   * Gets the leaf index out of all of the open leaves
   */
  getLeafIndex() {
    const leaves = this.app.workspace.getLeavesOfType(TRANSCRIPT_TYPE_VIEW);
    return leaves.findIndex((leaf) => leaf === this.leaf);
  }
  
  /**
   * Adds a div with loading text to the view content
   */
  renderLoader() {
    if (this.loaderContainerEl) {
      this.loaderContainerEl.createEl("div", {
        text: "Loading..."
      });
    }
  }
  
  /**
   * Creates the header toolbar with search and action buttons
   */
  renderHeaderToolbar(url, data, timestampMod) {
    const headerContainer = this.contentEl.createEl("div", { 
      cls: "yt-transcript__header" 
    });
    
    headerContainer.style.display = "flex";
    headerContainer.style.alignItems = "center";
    headerContainer.style.gap = "10px";
    headerContainer.style.marginBottom = "20px";
    headerContainer.style.padding = "10px";
    headerContainer.style.backgroundColor = "var(--background-secondary)";
    headerContainer.style.borderRadius = "5px";
    headerContainer.style.top = "0";
    
    // Search field
    if (this.plugin.settings.showSearchBar) {
      this.renderSearchInput(headerContainer, url, data, timestampMod);
    }
    
    // Buttons
    const buttonContainer = headerContainer.createEl("div", {
      cls: "yt-transcript__button-container"
    });
    buttonContainer.style.display = "flex";
    buttonContainer.style.gap = "8px";
    buttonContainer.style.marginLeft = "auto";
    
    if (this.plugin.settings.showCopyAllButton) {
      this.renderCopyAllButton(buttonContainer, url, data, timestampMod);
    }
    
    if (this.plugin.settings.showCreateNoteButton) {
      this.renderCreateNoteButton(buttonContainer, url, data, timestampMod);
    }
  }

  /**
   * Adds a simple search input to the view content
   */
  renderSearchInput(container, url, data, timestampMod) {
    const searchInputEl = container.createEl("input", {
      cls: "yt-transcript__search-input"
    });
    searchInputEl.type = "text";
    searchInputEl.placeholder = "Search...";
    searchInputEl.style.flex = "1";
    searchInputEl.style.height = "34px";
    searchInputEl.style.minWidth = "150px";
    searchInputEl.style.padding = "6px 8px";
    searchInputEl.style.borderRadius = "4px";
    searchInputEl.style.border = "1px solid var(--background-modifier-border)";
    searchInputEl.style.backgroundColor = "var(--background-primary)";
    
    searchInputEl.addEventListener("input", (e) => {
      const searchFilter = e.target.value;
      this.renderTranscriptionBlocks(url, data, timestampMod, searchFilter);
    });
  }

  /**
   * Renders the copy all button as an icon
   */
  renderCopyAllButton(container, url, data, timestampMod) {
    const copyButton = container.createEl("button", {
      cls: "yt-transcript__icon-button",
      attr: {
        'aria-label': 'Copy transcript',
        'title': 'Copy transcript'
      }
    });
    
    copyButton.style.display = "flex";
    copyButton.style.alignItems = "center";
    copyButton.style.justifyContent = "center";
    copyButton.style.width = "36px";
    copyButton.style.height = "36px";
    copyButton.style.padding = "6px";
    copyButton.style.backgroundColor = "var(--background-primary)";
    copyButton.style.color = "var(--text-on-accent)";
    copyButton.style.border = "1px solid var(--background-modifier-border)";
    copyButton.style.borderRadius = "4px";
    copyButton.style.cursor = "pointer";
    
    // Use setIcon from Obsidian API
    (0, import_obsidian2.setIcon)(copyButton, "copy");
    
    copyButton.addEventListener("click", () => {
      this.copyAllToClipboard(url, data, timestampMod);
    });
    
    // Hover effect
    copyButton.addEventListener("mouseenter", () => {
      copyButton.style.opacity = "0.8";
    });
    copyButton.addEventListener("mouseleave", () => {
      copyButton.style.opacity = "1";
    });
  }

  /**
   * Renders the create note button as an icon
   */
  renderCreateNoteButton(container, url, data, timestampMod) {
    const noteButton = container.createEl("button", {
      cls: "yt-transcript__icon-button",
      attr: {
        'aria-label': 'Create new note with transcript',
        'title': 'Create new note with transcript'
      }
    });
    
    noteButton.style.display = "flex";
    noteButton.style.alignItems = "center";
    noteButton.style.justifyContent = "center";
    noteButton.style.width = "36px";
    noteButton.style.height = "36px";
    noteButton.style.padding = "6px";
    noteButton.style.backgroundColor = "var(--background-primary)";
    noteButton.style.color = "var(--text-on-accent)";
    noteButton.style.border = "1px solid var(--background-modifier-border)";
    noteButton.style.borderRadius = "4px";
    noteButton.style.cursor = "pointer";
    
    // Use setIcon from Obsidian API
    (0, import_obsidian2.setIcon)(noteButton, "file-plus");
    
    noteButton.addEventListener("click", async () => {
      const today = new Date().toISOString().split("T")[0];
      const blocks = getTranscriptBlocks(data.lines, timestampMod);
      const content = `#### ${data.title}\n\n##### Watch The Video\n![](${url})\n\n##### About The Video\n**VeTitle**: *${data.title}*\n**Source**: ${url}\n**Retrieved**: **🗓️ ${today}**\n\n##### The Content\n${this.formatContentToPaste(url, blocks)}`;
      await this.createNewNoteWithTranscript(data.title, content);
    });
    
    // Hover effect
    noteButton.addEventListener("mouseenter", () => {
      noteButton.style.opacity = "0.8";
    });
    noteButton.addEventListener("mouseleave", () => {
      noteButton.style.opacity = "1";
    });
  }
  
  /**
   * Adds a div with the video title to the view content
   */
  renderVideoTitle(title) {
    const titleEl = this.contentEl.createEl("div");
    titleEl.innerHTML = title;
    titleEl.style.fontWeight = "bold";
    titleEl.style.marginBottom = "20px";
  }
  
  formatContentToPaste(url, blocks) {
    return blocks.map((block) => {
      const { quote, quoteTimeOffset } = block;
      const href = url + "&t=" + Math.floor(quoteTimeOffset / 1e3);
      const formattedBlock = `###### [${formatTimestamp(
        quoteTimeOffset
      )}](${href})\n${quote}`;
      return formattedBlock;
    }).join("\n");
  }

  copyAllToClipboard(url, data, timestampMod) {
    const blocks = getTranscriptBlocks(data.lines, timestampMod);
    const formattedContent = this.formatContentToPaste(url, blocks);
    navigator.clipboard.writeText(formattedContent);
    new import_obsidian2.Notice('Transcript copied to clipboard!');
  }

  /**
   * Ensures that the specified folder exists, creates it if it doesn't
   */
  async ensureFolderExists(folderPath) {
    const vault = this.plugin.app.vault;
    
    // Check if folder exists
    const folder = vault.getAbstractFileByPath(folderPath);
    
    // If folder doesn't exist, create it
    if (!folder) {
      try {
        await vault.createFolder(folderPath);
        console.log(`Created folder: ${folderPath}`);
      } catch (error) {
        console.error(`Error creating folder ${folderPath}:`, error);
      }
    }
  }

  async createNewNoteWithTranscript(title, content) {
  const fileName = `${title.replace(/[\\/:*?"<>|#]/g, '-')} - Transcript.md`;
  
  // Get the configured folder from plugin settings
  const folderPath = this.plugin.settings.transcriptFolder || "Transcripts";
  
  // Ensure the folder exists
  await this.ensureFolderExists(folderPath);
  
  // Construct full file path
  const filePath = `${folderPath}/${fileName}`;
  
  try {
    // Check if file already exists
    const existingFile = this.plugin.app.vault.getAbstractFileByPath(filePath);
    
    if (existingFile) {
      // File exists, just open it
      new import_obsidian2.Notice(`Opening existing transcript: ${fileName}`);
      
      // Open the existing note
      const leaf = this.plugin.app.workspace.getLeaf(false);
      await leaf.openFile(existingFile);
      
      return existingFile;
    } else {
      // File doesn't exist, create new one
      const file = await this.plugin.app.vault.create(filePath, content);
      new import_obsidian2.Notice(`Transcript saved as ${fileName} in ${folderPath}`);
      
      // Open the new note
      const leaf = this.plugin.app.workspace.getLeaf(false);
      await leaf.openFile(file);
      
      return file;
    }
  } catch (error) {
    new import_obsidian2.Notice('Error with note: ' + error.message);
    return null;
  }
  }

  /**
   * Add transcription blocks to the view content
   */
  renderTranscriptionBlocks(url, data, timestampMod, searchValue) {
    const dataContainerEl = this.dataContainerEl;
    if (dataContainerEl) {
      dataContainerEl.empty();

      const transcriptBlocks = getTranscriptBlocks(
        data.lines,
        timestampMod
      );
      const filteredBlocks = transcriptBlocks.filter(
        (block) => block.quote.toLowerCase().includes(searchValue.toLowerCase())
      );
      
      filteredBlocks.forEach((block) => {
        const { quote, quoteTimeOffset } = block;
        const blockContainerEl = createEl("div", {
          cls: "yt-transcript__transcript-block"
        });
        blockContainerEl.draggable = true;
        
        const linkEl = createEl("a", {
          text: formatTimestamp(quoteTimeOffset),
          attr: {
            href: url + "&t=" + Math.floor(quoteTimeOffset / 1e3)
          }
        });
        linkEl.style.marginBottom = "5px";
        
        const span = dataContainerEl.createEl("span", {
          text: quote,
          title: "Click to copy"
        });
        span.addEventListener("click", (event) => {
          const target = event.target;
          if (target !== null) {
            navigator.clipboard.writeText(target.textContent || "");
          }
        });
        
        if (searchValue !== "") highlightText(span, searchValue);
        blockContainerEl.appendChild(linkEl);
        blockContainerEl.appendChild(span);
        
        blockContainerEl.addEventListener(
          "dragstart",
          (event) => {
            if (event.dataTransfer) {
              event.dataTransfer.setData(
                "text/html",
                blockContainerEl.innerHTML
              );
            }
          }
        );
        
        blockContainerEl.addEventListener(
          "contextmenu",
          (event) => {
            const menu = new import_obsidian2.Menu();
            menu.addItem(
              (item) => item.setTitle("Copy").onClick(() => {
                navigator.clipboard.writeText(
                  this.formatContentToPaste(
                    url,
                    filteredBlocks
                  )
                );
              })
            );
            menu.showAtPosition({
              x: event.clientX,
              y: event.clientY
            });
          }
        );
        
        dataContainerEl.appendChild(blockContainerEl);
      });
      
      // No results message
      if (filteredBlocks.length === 0 && searchValue !== "") {
        const noResultsEl = dataContainerEl.createEl("div", {
          text: `No results found for "${searchValue}"`,
          cls: "yt-transcript__no-results"
        });
        noResultsEl.style.padding = "20px";
        noResultsEl.style.textAlign = "center";
        noResultsEl.style.color = "var(--text-muted)";
      }
    }
  }
  
  /**
   * Sets the state of the view
   */
  async setEphemeralState(state) {
    if (this.isDataLoaded) return;
    const leafIndex = this.getLeafIndex();
    if (state.url) {
      this.plugin.settings.leafUrls[leafIndex] = state.url;
      await this.plugin.saveSettings();
    }
    const { lang, country, timestampMod, leafUrls } = this.plugin.settings;
    const url = leafUrls[leafIndex];
    try {
      if (!this.loaderContainerEl) {
        this.loaderContainerEl = this.contentEl.createEl("div");
      } else {
        this.loaderContainerEl.empty();
      }
      this.renderLoader();
      const data = await YoutubeTranscript.getTranscript(url, {
        lang,
        country
      });
      if (!data) throw new Error();
      this.isDataLoaded = true;
      this.loaderContainerEl.empty();
      this.renderVideoTitle(data.title);
      
      // Add header with toolbar
      this.renderHeaderToolbar(url, data, timestampMod);
      
      if (!this.dataContainerEl) {
        this.dataContainerEl = this.contentEl.createEl("div");
      } else {
        this.dataContainerEl.empty();
      }
      if (this.errorContainerEl) {
        this.errorContainerEl.empty();
      }
      if (data.lines.length === 0) {
        this.dataContainerEl.createEl("h4", {
          text: "No transcript found"
        });
        this.dataContainerEl.createEl("div", {
          text: "Please check if video contains any transcript or try adjust language and country in plugin settings."
        });
      } else {
        this.renderTranscriptionBlocks(url, data, timestampMod, "");
      }
    } catch (err) {
      let errorMessage = "";
      if (err instanceof YoutubeTranscriptError) {
        errorMessage = err.message;
      }
      if (this.loaderContainerEl) {
        this.loaderContainerEl.empty();
      }
      if (!this.errorContainerEl) {
        this.errorContainerEl = this.contentEl.createEl("h5");
      } else {
        this.errorContainerEl.empty();
      }
      const titleEl = this.errorContainerEl.createEl("div", {
        text: "Error loading transcript"
      });
      titleEl.style.marginBottom = "5px";
      const messageEl = this.errorContainerEl.createEl("div", {
        text: errorMessage
      });
      messageEl.style.color = "var(--text-muted)";
      messageEl.style.fontSize = "var(--font-ui-small)";
    }
  }
  
  getViewType() {
    return TRANSCRIPT_TYPE_VIEW;
  }
  
  getDisplayText() {
    return "YouTube Transcript";
  }
  
  getIcon() {
    return "scroll";
  }
};

// src/prompt-modal.ts
var import_obsidian3 = require("obsidian");
var PromptModal = class extends import_obsidian3.Modal {
  constructor(initialValue) {
    super(app);
    this.submitted = false;
    this.initialValue = initialValue;
    this.value = initialValue || "";
  }
  
  listenInput(evt) {
    if (evt.key === "Enter") {
      evt.preventDefault();
      this.enterCallback(evt);
    }
  }
  
  onOpen() {
    this.titleEl.setText("YouTube URL");
    this.createForm();
  }
  
  onClose() {
    this.contentEl.empty();
    if (!this.submitted) {
      this.reject();
    }
  }
  
  createForm() {
    const textInput = new import_obsidian3.TextComponent(this.contentEl);
    textInput.inputEl.style.width = "100%";
    textInput.onChange((value) => this.value = value);
    textInput.inputEl.addEventListener(
      "keydown",
      (evt) => this.enterCallback(evt)
    );
    if (this.initialValue) {
      textInput.setValue(this.initialValue);
      textInput.inputEl.select();
    }
    textInput.inputEl.focus();
    const buttonDiv = this.modalEl.createDiv();
    buttonDiv.addClass("modal-button-container");
    const submitButton = new import_obsidian3.ButtonComponent(buttonDiv);
    submitButton.buttonEl.addClass("mod-cta");
    submitButton.setButtonText("Submit").onClick((evt) => {
      this.resolveAndClose(evt);
    });
  }
  
  enterCallback(evt) {
    if (evt.key === "Enter") {
      this.resolveAndClose(evt);
    }
  }
  
  resolveAndClose(evt) {
    this.submitted = true;
    evt.preventDefault();
    this.resolve(this.value);
    this.close();
  }
  
  async openAndGetValue(resolve, reject) {
    this.resolve = resolve;
    this.reject = reject;
    this.open();
  }
};

// src/url-utils.ts
var UrlPattern = /(https?:\/\/(?:www\.|(?!www))[a-zA-Z0-9][a-zA-Z0-9-]+[a-zA-Z0-9]\.[^\s]{2,}|www\.[a-zA-Z0-9][a-zA-Z0-9-]+[a-zA-Z0-9]\.[^\s]{2,}|https?:\/\/(?:www\.|(?!www))[a-zA-Z0-9]+\.[^\s]{2,}|www\.[a-zA-Z0-9]+\.[^\s]{2,})/gi;
function _getLinkNearestCursor(textLine, cursorPosition, linksInLine) {
  if (cursorPosition > textLine.length)
    throw new Error("Cursor out of the line");
  if (!linksInLine || linksInLine.length < 1)
    throw new Error("No links found");
  for (let i = 0; i < linksInLine.length; i++) {
    const link = linksInLine[i];
    const index = linksInLine.length > i + 1 ? textLine.indexOf(linksInLine[i + 1]) : textLine.length;
    if (cursorPosition <= index) return link;
  }
  throw new Error("Unexpected");
}
function getUrlFromText(lineText, cursorPosition) {
  var _a;
  const url = _getLinkNearestCursor(
    lineText,
    cursorPosition,
    (_a = lineText.match(UrlPattern)) != null ? _a : []
  );
  return [lineText.indexOf(url), lineText.indexOf(url) + url.length];
}

// editor-extensions.ts
var EditorExtensions = class {
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
    const urlPosition = getUrlFromText(lineText, cursor.ch);
    return [
      { line: cursor.line, ch: urlPosition[0] },
      { line: cursor.line, ch: urlPosition[1] }
    ];
  }
};

// src/url-detection.ts
var URLDetector = class {
  /**
   * Checks if the provided URL is a valid YouTube URL
   */
  static isValidYouTubeUrl(url) {
    if (!url || typeof url !== "string") {
      return false;
    }
    try {
      const urlObj = new URL(url);
      const hostname = urlObj.hostname.toLowerCase();
      const isYouTubeDomain = this.YOUTUBE_DOMAINS.includes(hostname);
      if (!isYouTubeDomain) {
        return false;
      }
      if (hostname.includes("youtube.com")) {
        return urlObj.pathname === "/watch" && urlObj.searchParams.has("v");
      }
      if (hostname.includes("youtu.be")) {
        const pathParts = urlObj.pathname.split("/");
        return pathParts.length >= 2 && pathParts[1].length > 0;
      }
      return false;
    } catch (error) {
      return false;
    }
  }
  
  /**
   * Extracts the first valid YouTube URL found in the provided text
   */
  static extractYouTubeUrlFromText(text) {
    if (!text || typeof text !== "string") {
      return null;
    }
    const urlRegex = /https?:\/\/[^\s<>"{}|\\^`[\]]+/gi;
    const matches = text.match(urlRegex);
    if (!matches) {
      return null;
    }
    for (const match of matches) {
      if (this.isValidYouTubeUrl(match)) {
        return match;
      }
    }
    return null;
  }
  
  /**
   * Creates a YouTube URL with a timestamp parameter
   */
  static buildTimestampUrl(url, offsetMs) {
    if (!url || typeof url !== "string") {
      return "";
    }
    try {
      const urlObj = new URL(url);
      const seconds = Math.max(0, Math.floor(offsetMs / 1e3));
      urlObj.searchParams.set("t", seconds.toString());
      return urlObj.toString();
    } catch (error) {
      return url;
    }
  }
};
// YouTube URL patterns to match various formats
URLDetector.YOUTUBE_URL_PATTERNS = [
  /https?:\/\/(?:www\.)?youtube\.com\/watch\?v=[\w-]+(?:[&?][\w=&-]*)?/gi,
  /https?:\/\/(?:www\.)?youtu\.be\/[\w-]+(?:[?][\w=&-]*)?/gi,
  /https?:\/\/(?:m\.)?youtube\.com\/watch\?v=[\w-]+(?:[&?][\w=&-]*)?/gi,
  /https?:\/\/(?:mobile\.)?youtube\.com\/watch\?v=[\w-]+(?:[&?][\w=&-]*)?/gi,
  /https?:\/\/(?:music\.)?youtube\.com\/watch\?v=[\w-]+(?:[&?][\w=&-]*)?/gi
];
// More comprehensive regex for matching YouTube URLs
URLDetector.YOUTUBE_DOMAINS = [
  "youtube.com",
  "www.youtube.com",
  "m.youtube.com",
  "mobile.youtube.com",
  "music.youtube.com",
  "youtu.be",
  "www.youtu.be"
];

// src/transcript-formatter.ts
var TranscriptFormatter = class {
  /**
   * Formats a transcript response according to the specified template and options
   */
  static format(transcript, url, options) {
    if (!transcript || !transcript.lines || !Array.isArray(transcript.lines)) {
      return "";
    }
    if (transcript.lines.length === 0) {
      return "";
    }
    const normalizedOptions = this.normalizeOptions(options);
    const template = normalizedOptions.template || "standard";
    switch (template) {
      case "minimal":
        return this.formatMinimalTemplate(
          transcript,
          url,
          normalizedOptions
        );
      case "standard":
        return this.formatStandardTemplate(
          transcript,
          url,
          normalizedOptions
        );
      case "rich":
        return this.formatRichTemplate(
          transcript,
          url,
          normalizedOptions
        );
      default:
        return this.formatStandardTemplate(
          transcript,
          url,
          normalizedOptions
        );
    }
  }
  
  /**
   * Convenience method to format transcript with minimal template
   */
  static formatMinimal(transcript, url, options) {
    return this.format(transcript, url, {
      ...options,
      template: "minimal"
    });
  }
  
  /**
   * Convenience method to format transcript with standard template
   */
  static formatStandard(transcript, url, options) {
    return this.format(transcript, url, {
      ...options,
      template: "standard"
    });
  }
  
  /**
   * Convenience method to format transcript with rich template
   */
  static formatRich(transcript, url, options) {
    return this.format(transcript, url, {
      ...options,
      template: "rich"
    });
  }
  
  /**
   * Normalizes and validates formatting options
   */
  static normalizeOptions(options) {
    const normalized = {
      timestampMod: Math.max(1, Math.floor(options.timestampMod)) || 5,
      template: options.template || "standard"
    };
    if (options.timestampMod <= 0) {
      normalized.timestampMod = 1;
    }
    return normalized;
  }
  
  /**
   * Formats transcript as plain text without timestamps
   */
  static formatMinimalTemplate(transcript, url, options) {
    return transcript.lines.map((line) => line.text.trim()).filter((text) => text.length > 0).join(" ");
  }
  
  /**
   * Formats transcript with clickable timestamps
   */
  static formatStandardTemplate(transcript, url, options) {
    const blocks = getTranscriptBlocks(
      transcript.lines,
      options.timestampMod
    );
    if (blocks.length === 0) {
      return "";
    }
    return blocks.map((block) => {
      const { quote, quoteTimeOffset } = block;
      const timestampStr = formatTimestamp(quoteTimeOffset);
      const timestampUrl = url ? URLDetector.buildTimestampUrl(url, quoteTimeOffset) : "#";
      return `###### [${timestampStr}](${timestampUrl})\n${quote.trim()}`;
    }).join("\n");
  }
  
  /**
   * Formats transcript with metadata header and clickable timestamps
   */
  static formatRichTemplate(transcript, url, options) {
    const title = transcript.title && transcript.title.trim() ? transcript.title.trim() : "YouTube Transcript";
    const today = new Date().toISOString().split("T")[0];
    const sourceUrl = url || "Unknown";
    const header = [
      ``,
      `#### ${title}\n`,
      `##### Watch The Video\n![](${url})\n`,
      `##### About The Video`,
      `**VeTitle**: *${title}*`,
      `**Source**: ${sourceUrl}`,
      `**Retrieved**: **🗓️ ${today}**\n`,
      `##### The Content`,
      ""
    ].join("\n");
    const standardContent = this.formatStandardTemplate(
      transcript,
      url,
      options
    );
    return header + standardContent;
  }
};

// src/commands/insert-transcript.ts
var InsertTranscriptCommand = class {
  constructor(plugin) {
    this.plugin = plugin;
  }
  
  /**
   * Executes the insert transcript command with default settings
   */
  async execute(editor) {
    await this.executeWithOptions(editor, {});
  }
  
  /**
   * Executes the insert transcript command with custom options
   */
  async executeWithOptions(editor, options) {
    try {
      const url = await this.getYouTubeUrlWithConfirmation(editor);
      if (!url) {
        return;
      }
      if (!URLDetector.isValidYouTubeUrl(url)) {
        return;
      }
      const transcriptConfig = this.createTranscriptConfig();
      const transcript = await YoutubeTranscript.getTranscript(
        url,
        transcriptConfig
      );
      if (!transcript || !transcript.lines || transcript.lines.length === 0) {
        return;
      }
      const formatOptions = this.mergeFormatOptions(options);
      const formattedContent = TranscriptFormatter.format(
        transcript,
        url,
        formatOptions
      );
      if (!formattedContent || formattedContent.trim().length === 0) {
        return;
      }
      const cursor = editor.getCursor();
      editor.replaceRange(formattedContent, cursor);
    } catch (error) {
      console.error("Insert transcript failed:", error);
    }
  }
  
  /**
   * Gets YouTube URL with user confirmation via prompt
   */
  async getYouTubeUrlWithConfirmation(editor) {
    const detectedUrl = await this.detectYouTubeUrl(editor);
    try {
      const prompt = new PromptModal(detectedUrl || undefined);
      const userUrl = await new Promise((resolve, reject) => {
        prompt.openAndGetValue(resolve, reject);
      });
      return userUrl.trim() || null;
    } catch (error) {
      return null;
    }
  }
  
  /**
   * Detects YouTube URL from selection or clipboard
   */
  async detectYouTubeUrl(editor) {
    const selectionUrl = this.getUrlFromSelection(editor);
    if (selectionUrl) {
      return selectionUrl;
    }
    const clipboardUrl = await this.getUrlFromClipboard();
    if (clipboardUrl) {
      return clipboardUrl;
    }
    return null;
  }
  
  /**
   * Gets URL from current editor selection
   */
  getUrlFromSelection(editor) {
    try {
      const selectedText = editor.somethingSelected() ? editor.getSelection() : EditorExtensions.getSelectedText(editor);
      return URLDetector.extractYouTubeUrlFromText(selectedText);
    } catch (error) {
      return null;
    }
  }
  
  /**
   * Gets URL from system clipboard
   */
  async getUrlFromClipboard() {
    try {
      const clipboardText = await navigator.clipboard.readText();
      return URLDetector.extractYouTubeUrlFromText(clipboardText);
    } catch (error) {
      return null;
    }
  }
  
  /**
   * Creates transcript config from plugin settings
   */
  createTranscriptConfig() {
    return {
      lang: this.plugin.settings ? this.plugin.settings.lang : undefined,
      country: this.plugin.settings ? this.plugin.settings.country : undefined
    };
  }
  
  /**
   * Merges user options with plugin settings
   */
  mergeFormatOptions(options) {
    return {
      template: options.template || "standard",
      timestampMod: options.timestampMod || (this.plugin.settings ? this.plugin.settings.timestampMod : 5) || 5
    };
  }
};

// src/main.ts
var DEFAULT_SETTINGS = {
  timestampMod: 5,
  lang: "en",
  country: "EN",
  leafUrls: [],
  displayLocation: "sidebar",
  autoExtract: false,
  showSearchBar: true,
  showCopyAllButton: true,
  showCreateNoteButton: true,
  transcriptFolder: "Transcripts"
};

var YTranscriptPlugin = class extends import_obsidian4.Plugin {
  async onload() {
    await this.loadSettings();
    this.insertTranscriptCommand = new InsertTranscriptCommand(this);
    this.modifyTimeout = null;
    this.processedFiles = new Set(); // Track processed files in this session
    
    this.registerView(
      TRANSCRIPT_TYPE_VIEW,
      (leaf) => new TranscriptView(leaf, this)
    );
    
    // Existing commands
    this.addCommand({
      id: "transcript-from-text",
      name: "Get YouTube transcript from selected url",
      editorCallback: (editor, _) => {
        const url = EditorExtensions.getSelectedText(editor).trim();
        this.openView(url);
      }
    });
    
    this.addCommand({
      id: "transcript-from-prompt",
      name: "Get YouTube transcript from url prompt",
      callback: async () => {
        const prompt = new PromptModal();
        const url = await new Promise(
          (resolve) => prompt.openAndGetValue(resolve, () => {})
        );
        if (url) {
          this.openView(url);
        }
      }
    });
    
    this.addCommand({
      id: "insert-youtube-transcript",
      name: "Insert YouTube transcript",
      editorCallback: async (editor, _) => {
        await this.insertTranscriptCommand.execute(editor);
      }
    });
    
    // New commands
    this.addCommand({
      id: "open-transcript-in-sidebar",
      name: "Open transcript in sidebar (force sidebar)",
      editorCallback: (editor, _) => {
        const url = EditorExtensions.getSelectedText(editor).trim();
        this.forceOpenInSidebar(url);
      }
    });
    
    this.addCommand({
      id: "insert-transcript-under-link",
      name: "Insert transcript under link",
      editorCallback: async (editor, _) => {
        await this.insertTranscriptUnderLink(editor);
      }
    });
    
    this.addCommand({
  id: "create-transcript-note-from-prompt",
  name: "Create transcript note from URL prompt (without timeline)",
  callback: async () => {
    const prompt = new PromptModal();
    const url = await new Promise(
      (resolve) => prompt.openAndGetValue(resolve, () => {})
    );
    if (url && URLDetector.isValidYouTubeUrl(url)) {
      try {
        // Fetch transcript
        const transcript = await YoutubeTranscript.getTranscript(url, {
          lang: this.settings.lang,
          country: this.settings.country
        });
        
        // Format transcript without timestamps (minimal template)
        const formattedContent = TranscriptFormatter.format(transcript, url, {
          template: "minimal",
          timestampMod: this.settings.timestampMod
        });
        
        // Create safe filename from video title
        const safeTitle = transcript.title
          .replace(/[\\/:*?"<>|#]/g, '-')
          .replace(/\s+/g, ' ')
          .trim();
        
        const fileName = `${safeTitle} - Transcript.md`;
        
        // Get configured folder
        const folderPath = this.settings.transcriptFolder || "Transcripts";
        
        // Ensure folder exists
        await this.ensureFolderExists(folderPath);
        
        // Create full file path
        const filePath = `${folderPath}/${fileName}`;
        
        // Create the note with metadata header (without timestamps)
        const today = new Date().toISOString().split("T")[0];
        const noteContent = [
          `### ${transcript.title}`,
          ``,
          `##### About The Video`,
          `**VeTitle**: *${transcript.title}*`,
          `**Source**: ${url}`,
          `**Retrieved**: **🗓️${today}️**`,
          ``,
          `##### Transcript`,
          ``,
          formattedContent
        ].join("\n");
        
        // Check if file already exists
        const existingFile = this.app.vault.getAbstractFileByPath(filePath);
        
        if (existingFile) {
          new import_obsidian4.Notice(`Transcript already exists at: ${filePath}`);
          // Optionally open the existing file
          const leaf = this.app.workspace.getLeaf(false);
          await leaf.openFile(existingFile);
        } else {
          // Create new note
          const file = await this.app.vault.create(filePath, noteContent);
          new import_obsidian4.Notice(`Created new transcript note: ${fileName}`);
          
          // Open the new note
          const leaf = this.app.workspace.getLeaf(false);
          await leaf.openFile(file);
        }
        
      } catch (error) {
        console.error("Error creating transcript note:", error);
        new import_obsidian4.Notice(`Error: ${error.message || 'Failed to create transcript note'}`);
      }
    } else if (url) {
      new import_obsidian4.Notice('Invalid YouTube URL');
    }
  }
});
    
    this.addSettingTab(new YTranslateSettingTab(this.app, this));
    
    // File modification event for auto-extract with debounce
    this.registerEvent(
      this.app.vault.on('modify', async (file) => {
        if (file.extension === 'md') {
          // Add debounce to prevent multiple rapid executions
          clearTimeout(this.modifyTimeout);
          this.modifyTimeout = setTimeout(() => {
            this.checkAndExtractSpecificLinks(file);
          }, 1000); // Wait 1 second after last modification
        }
      })
    );
  }
  
  async forceOpenInSidebar(url) {
    const leaf = this.app.workspace.getRightLeaf(false);
    await leaf.setViewState({
      type: TRANSCRIPT_TYPE_VIEW
    });
    this.app.workspace.revealLeaf(leaf);
    leaf.setEphemeralState({
      url
    });
    new import_obsidian4.Notice('Opening transcript in sidebar');
  }
  
  async insertTranscriptUnderLink(editor) {
    try {
      const selectedText = editor.getSelection();
      const url = URLDetector.extractYouTubeUrlFromText(selectedText);
      
      if (!url) {
        new import_obsidian4.Notice('No YouTube URL found in selection');
        return;
      }
      
      const transcript = await YoutubeTranscript.getTranscript(url, {
        lang: this.settings.lang,
        country: this.settings.country
      });
      
      const formattedContent = TranscriptFormatter.format(transcript, url, {
        template: "rich",
        timestampMod: this.settings.timestampMod
      });
      
      const cursor = editor.getCursor();
      const line = editor.getLine(cursor.line);
      const linkEndPos = line.indexOf(url) + url.length;
      
      const insertionPoint = {
        line: cursor.line,
        ch: linkEndPos
      };
      
      editor.replaceRange('\n\n' + formattedContent + '\n', insertionPoint);
      new import_obsidian4.Notice('Transcript inserted under link');
      
    } catch (error) {
      new import_obsidian4.Notice('Error: ' + error.message);
    }
  }
  
  async checkAndExtractSpecificLinks(file) {
    // Check if autoExtract is enabled
    if (!this.settings.autoExtract) return;

    // Check if this file was already processed in this session
    if (this.processedFiles.has(file.path)) return;

    const content = await this.app.vault.read(file);
    
    // Find specific links that contain "script" in the text
    const scriptLinks = this.extractScriptLinks(content);
    
    if (scriptLinks.length === 0) return;
    
    // Add to processed set to prevent reprocessing
    this.processedFiles.add(file.path);
    
    // Add a small delay to prevent race conditions
    await new Promise(resolve => setTimeout(resolve, 100));
    
    // Always create separate notes for all script links
    await this.createTranscriptNotesForScriptLinks(file, scriptLinks);
  }
  
  extractScriptLinks(content) {
    const scriptLinks = [];
    
    // Only match links that are exactly [script](url) or ![script](url)
    const markdownLinkPattern = /\[script\]\((https?:\/\/[^\s<>"{}|\\^`[\]]+)\)/gi;
    let match;
    
    while ((match = markdownLinkPattern.exec(content)) !== null) {
      const url = match[1];
      if (URLDetector.isValidYouTubeUrl(url)) {
        scriptLinks.push({
          url: url,
          type: 'markdown',
          fullMatch: match[0],
          index: match.index
        });
      }
    }
    
    const imageLinkPattern = /!\[script\]\((https?:\/\/[^\s<>"{}|\\^`[\]]+)\)/gi;
    
    while ((match = imageLinkPattern.exec(content)) !== null) {
      const url = match[1];
      if (URLDetector.isValidYouTubeUrl(url)) {
        scriptLinks.push({
          url: url,
          type: 'image',
          fullMatch: match[0],
          index: match.index
        });
      }
    }
    
    return scriptLinks;
  }
  
  /**
   * Ensures that the specified folder exists, creates it if it doesn't
   */
  async ensureFolderExists(folderPath) {
    const vault = this.app.vault;
    
    // Check if folder exists
    const folder = vault.getAbstractFileByPath(folderPath);
    
    // If folder doesn't exist, create it
    if (!folder) {
      try {
        await vault.createFolder(folderPath);
        console.log(`Created folder: ${folderPath}`);
      } catch (error) {
        console.error(`Error creating folder ${folderPath}:`, error);
      }
    }
  }
  
  async createTranscriptNotesForScriptLinks(file, scriptLinks) {
    // Check if autoExtract is still enabled
    if (!this.settings.autoExtract) return;
    
    const createdNotes = [];
    
    // Get the configured transcript folder
    const transcriptFolder = this.settings.transcriptFolder || "Transcripts";
    
    // Ensure the transcript folder exists
    await this.ensureFolderExists(transcriptFolder);
    
    for (const scriptLink of scriptLinks) {
      try {
        const transcript = await YoutubeTranscript.getTranscript(scriptLink.url, {
          lang: this.settings.lang,
          country: this.settings.country
        });
        
        // Create a safe filename from the video title - remove # and other problematic characters
        const safeTitle = transcript.title
            .replace(/[\\/:*?"<>|#]/g, '-') // Added # to the replacement list
            .replace(/\s+/g, ' ') // Normalize spaces
            .trim();
        
        // Create the full file path
        const fileName = `${transcriptFolder}/${safeTitle} - Transcript.md`;
        
        // Check if transcript file already exists
        let transcriptFile = this.app.vault.getAbstractFileByPath(fileName);
        let isNew = false;
        
        if (!transcriptFile) {
          // Create new transcript note if it doesn't exist
          const formattedContent = TranscriptFormatter.format(transcript, scriptLink.url, {
            template: "rich",
            timestampMod: this.settings.timestampMod
          });
          
          transcriptFile = await this.app.vault.create(fileName, formattedContent);
          isNew = true;
          console.log(`✅ Created new transcript: ${fileName}`);
        } else {
          console.log(`📖 Found existing transcript: ${fileName}`);
        }
        
        createdNotes.push({ 
          file: transcriptFile, 
          title: transcript.title, 
          scriptLink,
          isNew
        });
        
      } catch (error) {
        console.error(`❌ Failed to process transcript for ${scriptLink.url}:`, error);
        new import_obsidian4.Notice(`Failed to process transcript: ${error.message}`);
      }
    }
    
    // Replace script links with links to the transcript notes
    if (createdNotes.length > 0) {
      let modifiedContent = await this.app.vault.read(file);
      
      // Sort by index in reverse order to avoid messing up indices
      createdNotes.sort((a, b) => b.scriptLink.index - a.scriptLink.index);
      
      createdNotes.forEach(({ file: transcriptFile, scriptLink, isNew }) => {
        // Get the file path
        const filePath = transcriptFile.path;
        
        // Different display text based on whether it's new or existing
        const displayText = isNew ? "View Transcript" : "Existing Transcript";
        
        // Create the replacement text - use the full file path
        // Obsidian will handle this correctly
        const replacement = `${scriptLink.fullMatch} [[${filePath}|${displayText}]]`;
        
        // Replace only the first occurrence (should be unique per link)
        modifiedContent = modifiedContent.replace(scriptLink.fullMatch, replacement);
      });
      
      // Only modify if content actually changed
      if (modifiedContent !== await this.app.vault.read(file)) {
        await this.app.vault.modify(file, modifiedContent);
        
        const newCount = createdNotes.filter(n => n.isNew).length;
        const existingCount = createdNotes.filter(n => !n.isNew).length;
        
        let message = '';
        if (newCount > 0) message += `✅ Created ${newCount} new transcript note(s)`;
        if (existingCount > 0) message += `${newCount > 0 ? ' and ' : ''}📖 Linked to ${existingCount} existing transcript(s)`;
        
        new import_obsidian4.Notice(message || 'Transcript links updated');
      }
    }
  }
  
  async openView(url) {
    // Check display settings
    if (this.settings.displayLocation === "note") {
      // Display in current note
      const activeView = this.app.workspace.getActiveViewOfType(import_obsidian4.MarkdownView);
      if (activeView) {
        const editor = activeView.editor;
        try {
          const transcript = await YoutubeTranscript.getTranscript(url, {
            lang: this.settings.lang,
            country: this.settings.country
          });
          
          const formattedContent = TranscriptFormatter.format(transcript, url, {
            template: "rich",
            timestampMod: this.settings.timestampMod
          });
          
          const cursor = editor.getCursor();
          editor.replaceRange(formattedContent, cursor);
          new import_obsidian4.Notice('Transcript inserted in note');
        } catch (error) {
          new import_obsidian4.Notice('Error fetching transcript: ' + error.message);
        }
      } else {
        new import_obsidian4.Notice('No active note to insert transcript');
      }
    } else {
      // Display in sidebar (default)
      const leaf = this.app.workspace.getRightLeaf(false);
      await leaf.setViewState({
        type: TRANSCRIPT_TYPE_VIEW
      });
      this.app.workspace.revealLeaf(leaf);
      leaf.setEphemeralState({
        url
      });
    }
  }
  
  onunload() {
    this.app.workspace.detachLeavesOfType(TRANSCRIPT_TYPE_VIEW);
    clearTimeout(this.modifyTimeout);
  }
  
  async loadSettings() {
    this.settings = Object.assign(
      {},
      DEFAULT_SETTINGS,
      await this.loadData()
    );
  }
  
  async saveSettings() {
    await this.saveData(this.settings);
  }
};

var YTranslateSettingTab = class extends import_obsidian4.PluginSettingTab {
  constructor(app, plugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display() {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.createEl("h2", { text: "Settings for YTranscript" });

    new import_obsidian4.Setting(containerEl)
      .setName("Display location")
      .setDesc("Where to display the transcript")
      .addDropdown(dropdown => dropdown
        .addOption("sidebar", "Sidebar")
        .addOption("note", "Below video in note")
        .setValue(this.plugin.settings.displayLocation)
        .onChange(async (value) => {
          this.plugin.settings.displayLocation = value;
          await this.plugin.saveSettings();
        })
      );

    new import_obsidian4.Setting(containerEl)
      .setName("Auto extract transcript")
      .setDesc("Automatically extract transcript when finding [script](url) or ![script](url) links")
      .addToggle(toggle => toggle
        .setValue(this.plugin.settings.autoExtract)
        .onChange(async (value) => {
          this.plugin.settings.autoExtract = value;
          await this.plugin.saveSettings();
        })
      );

    // Transcript folder setting
    new import_obsidian4.Setting(containerEl)
      .setName("Transcript folder")
      .setDesc("Folder where transcript notes will be saved")
      .addText(text => text
        .setPlaceholder("Transcripts")
        .setValue(this.plugin.settings.transcriptFolder)
        .onChange(async (value) => {
          this.plugin.settings.transcriptFolder = value || "Transcripts";
          await this.plugin.saveSettings();
        })
      );

    containerEl.createEl("h3", { text: "Sidebar Interface Customization" });

    new import_obsidian4.Setting(containerEl)
      .setName("Show search bar")
      .setDesc("Display search bar in the sidebar")
      .addToggle(toggle => toggle
        .setValue(this.plugin.settings.showSearchBar)
        .onChange(async (value) => {
          this.plugin.settings.showSearchBar = value;
          await this.plugin.saveSettings();
          this.display();
        })
      );

    new import_obsidian4.Setting(containerEl)
      .setName("Show copy all button")
      .setDesc("Display copy all button in the sidebar")
      .addToggle(toggle => toggle
        .setValue(this.plugin.settings.showCopyAllButton)
        .onChange(async (value) => {
          this.plugin.settings.showCopyAllButton = value;
          await this.plugin.saveSettings();
          this.display();
        })
      );

    new import_obsidian4.Setting(containerEl)
      .setName("Show create note button")
      .setDesc("Display create note button in the sidebar")
      .addToggle(toggle => toggle
        .setValue(this.plugin.settings.showCreateNoteButton)
        .onChange(async (value) => {
          this.plugin.settings.showCreateNoteButton = value;
          await this.plugin.saveSettings();
          this.display();
        })
      );

    new import_obsidian4.Setting(containerEl)
      .setName("Timestamp interval")
      .setDesc("Indicates how often timestamp should occur in text (1 - every line, 10 - every 10 lines)")
      .addText(
        (text) => text.setValue(this.plugin.settings.timestampMod.toString()).onChange(async (value) => {
          const v = Number.parseInt(value);
          this.plugin.settings.timestampMod = Number.isNaN(v) ? 5 : v;
          await this.plugin.saveSettings();
        })
      );

    new import_obsidian4.Setting(containerEl)
      .setName("Language")
      .setDesc("Preferred transcript language")
      .addText(
        (text) => text.setValue(this.plugin.settings.lang).onChange(async (value) => {
          this.plugin.settings.lang = value;
          await this.plugin.saveSettings();
        })
      );

    new import_obsidian4.Setting(containerEl)
      .setName("Country")
      .setDesc("Preferred transcript country code")
      .addText(
        (text) => text.setValue(this.plugin.settings.country).onChange(async (value) => {
          this.plugin.settings.country = value;
          await this.plugin.saveSettings();
        })
      );
  }
};