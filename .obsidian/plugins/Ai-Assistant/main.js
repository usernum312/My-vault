const { Plugin, ItemView, Modal, Notice, MarkdownView, MarkdownRenderer, MarkdownRenderChild, setIcon, PluginSettingTab } = require('obsidian');

const VIEW_TYPE = 'ai-sidebar';

/**
 * View-type identifier for the dedicated full-tab AI chat page.
 * Kept separate from VIEW_TYPE so both a sidebar leaf and a main-area tab
 * can coexist without conflicting, and Obsidian can restore each independently.
 */
const VIEW_TYPE_CHAT_PAGE = 'ai-chat-page';

const DEFAULT_SETTINGS = {
  baseUrl: "http://127.0.0.1:11434",
  localModel: "llama2",
  localEndpoint: "/v1/chat/completions",
  temperature: 0.7,
  max_tokens: 2048,
  autoCheckHealth: true,
  timeoutMs: 120000,
  showTokenCounter: true,
  shortcuts: {
    newConversation: 'Ctrl+Shift+N',
    saveConversation: 'Ctrl+Shift+S',
    settings: 'Ctrl+Shift+P',
    askSelection: 'Ctrl+Shift+A',
    editSelection: 'Ctrl+Shift+E'
  },
  conversationsFolder: "AI Conversations",
  currentMode: 'local',
  cloudApiType: 'openai',
  openaiApiKey: "",
  openaiModel: "gpt-3.5-turbo",
  openaiEndpoint: "https://api.openai.com/v1/chat/completions",
  geminiApiKey: "",
  geminiModel: "gemini-1.5-flash",
  geminiEndpoint: "https://generativelanguage.googleapis.com/v1beta/models",
  anthropicApiKey: "",
  anthropicModel: "claude-3-haiku-20240307",
  anthropicEndpoint: "https://api.anthropic.com/v1/messages",
  customApiKey: "",
  customModel: "",
  customEndpoint: "",
  customHeaders: "{}",
  customBodyTemplate: '{"messages": {{messages}}, "model": "{{model}}"}',
  inputPosition: "bottom",
  autoNameConversations: false,
  namingTemperature: 0.3,
  namingMaxTokens: 30,
  namingTimeoutMs: 10000,
  namingPromptTemplate: 'Based on this first message, generate a very short, concise title (maximum 5-6 words) for a conversation. The title should capture the main topic or intent. Return ONLY the title, no quotes, no explanations, no extra text, no punctuation at the end.\n\nFirst message: "{{message}}"\n\nConversation title:',
  namingProvider: 'default',
  namingModel: '',
  // Feature: allow AI responses to be written directly into the active note
  allowDirectEditing: false,
  // ---- File operations (create/edit/copy/move files in the vault) ----
  // 'disabled' | 'restricted' | 'full'
  fileOpsScope: 'disabled',
  // Vault-relative folders the AI is confined to when fileOpsScope === 'restricted'.
  // Any of these (and anything inside them) is allowed.
  fileOpsPaths: ['AI Files'],
  // Vault-relative folders excluded from access when fileOpsScope === 'full'.
  // Everything else in the vault is allowed.
  fileOpsExcludedPaths: [],
  // Where soul.md's content comes from: 'inline' (edited in Settings) or 'file' (a vault file)
  soulMdSource: 'inline',
  // Vault-relative path used when soulMdSource === 'file'
  soulMdFilePath: '',
  // Content used when soulMdSource === 'inline' (empty = use the built-in default)
  soulMdInline: '',
  markdownExportTemplate: '',   // Empty = use built-in default template
  // Image capabilities per provider (set by the user via the IMG button in Settings)
  imageCapabilities: {
    local:     { analysis: false, creation: false },
    openai:    { analysis: false, creation: false },
    gemini:    { analysis: false, creation: false },
    anthropic: { analysis: false, creation: false },
    custom:    { analysis: false, creation: false }
  },
  // Controls which shortcuts appear in the command-button dropdown menu
  shortcutsVisible: {
    newConversation:  true,
    renameConversation: true,
    saveConversation: true,
    openChatPage:     true,
    settings:         true,
    askSelection:     true,
    editSelection:    true
  },

};

// ==================== UTILITY FUNCTIONS ====================
const threeDots = (() => {
  if (!document.getElementById('three-dots-style')) {
    const style = document.createElement('style');
    style.id = 'three-dots-style';
    style.innerHTML = `
      .dots-animated::after {
        content: ' .';
        animation: dotsAnim 1.2s infinite;
      }
      @keyframes dotsAnim {
        0%   { content: ' .'; }
        33%  { content: ' ..'; }
        66%  { content: ' ...'; }
      }
    `;
    document.head.appendChild(style);
  }
  return () => '<span class="dots-animated"></span>';
})();

function trimContent(text, maxChars = 4000) {
  if (text.length <= maxChars) return text;
  return text.slice(0, maxChars) + "\n\n[Content truncated automatically...]";
}

function estimateTokens(text) {
  if (!text) return 0;
  return Math.ceil(text.length / 4);
}

/** Simple promise-based delay, used to pace AI requests (see AIFileEditor). */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * True if the first strong-directional character in `text` belongs to an
 * RTL script (Arabic, Hebrew, and related blocks). Used as a fallback where
 * dir="auto" isn't available/reliable; in the UI we mostly rely on
 * dir="auto" itself, which implements the same "first strong character"
 * rule natively and updates as streamed text grows.
 */
function isRTLText(text) {
  if (!text) return false;
  const rtlChar = /[\u0591-\u07FF\u0860-\u08FF\uFB1D-\uFDFF\uFE70-\uFEFF]/;
  // Skip over markdown punctuation/whitespace to find the first real letter
  const stripped = text.replace(/[`*_#>\-\[\]()!\s\d.,:;]/g, '');
  return rtlChar.test(stripped.charAt(0));
}

/**
 * Sets dir="auto" (+ matching alignment) on an element so RTL scripts
 * (Arabic, Hebrew, etc.) display correctly. Shared by ChatView (the main
 * chat) and the embedded ```ai code-block renderer, so AI output reads
 * correctly in either surface.
 */
function applyAutoTextDirection(el) {
  el.setAttribute('dir', 'auto');
  el.style.textAlign = 'start';
  el.style.unicodeBidi = 'plaintext';
}

// ==================== DIFF COMPUTER ====================

/**
 * Pure utility that computes a line-level diff between two strings using
 * the Myers / LCS algorithm and groups the result into display hunks
 * (contiguous changed blocks with surrounding context lines).
 */
class DiffComputer {
  /**
   * @param {string} originalText
   * @param {string} modifiedText
   * @returns {{type:'unchanged'|'added'|'removed', line:string}[]}
   */
  static computeLineDiff(originalText, modifiedText) {
    const origLines = originalText.split('\n');
    const modLines  = modifiedText.split('\n');
    const m = origLines.length;
    const n = modLines.length;

    // Build LCS table (cap at 600×600 to stay fast on large files)
    if (m > 600 || n > 600) {
      // Fall back to a simple whole-file replacement diff for huge files
      if (originalText === modifiedText) return origLines.map(l => ({ type: 'unchanged', line: l }));
      return [
        ...origLines.map(l => ({ type: 'removed', line: l })),
        ...modLines.map(l => ({ type: 'added',   line: l }))
      ];
    }

    const dp = Array.from({ length: m + 1 }, () => new Int32Array(n + 1));
    for (let i = 1; i <= m; i++) {
      for (let j = 1; j <= n; j++) {
        dp[i][j] = origLines[i - 1] === modLines[j - 1]
          ? dp[i - 1][j - 1] + 1
          : Math.max(dp[i - 1][j], dp[i][j - 1]);
      }
    }

    // Backtrack
    const result = [];
    let i = m, j = n;
    while (i > 0 || j > 0) {
      if (i > 0 && j > 0 && origLines[i - 1] === modLines[j - 1]) {
        result.unshift({ type: 'unchanged', line: origLines[i - 1] });
        i--; j--;
      } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
        result.unshift({ type: 'added', line: modLines[j - 1] });
        j--;
      } else {
        result.unshift({ type: 'removed', line: origLines[i - 1] });
        i--;
      }
    }
    return result;
  }

  /** True when the diff has at least one added or removed line. */
  static hasChanges(diff) {
    return diff.some(d => d.type !== 'unchanged');
  }

  /**
   * Groups a flat diff array into "hunks" — the same way `git diff -U3` does.
   * Each hunk contains the changed lines plus up to `context` unchanged lines
   * on either side, making the diff readable without the full file.
   *
   * @param {{type:string, line:string}[]} diff
   * @param {number} context  — unchanged lines to keep around each change
   * @returns {{lines:{type:string,line:string}[], hasChanges:boolean}[]}
   */
  static groupIntoHunks(diff, context = 3) {
    // Mark indices that are "near" a change
    const near = new Uint8Array(diff.length);
    diff.forEach((d, idx) => {
      if (d.type !== 'unchanged') {
        const lo = Math.max(0, idx - context);
        const hi = Math.min(diff.length - 1, idx + context);
        for (let k = lo; k <= hi; k++) near[k] = 1;
      }
    });

    const hunks = [];
    let current = null;
    diff.forEach((d, idx) => {
      if (near[idx]) {
        if (!current) current = { lines: [], hasChanges: false };
        current.lines.push(d);
        if (d.type !== 'unchanged') current.hasChanges = true;
      } else {
        if (current) { hunks.push(current); current = null; }
      }
    });
    if (current) hunks.push(current);
    return hunks;
  }
}

// ==================== CONTEXT MEMORY ====================

/**
 * Implements the "Invisible Metadata Injection" pattern for persistent
 * cross-turn context.
 *
 * HOW IT WORKS
 * ─────────────
 * After any turn that involved file-system operations the agent injects a
 * compact JSON block into the *stored* assistant message (in session.messages)
 * but NOT into the text that is rendered to the user:
 *
 *   <!-- SYSTEM_MEMORY: {"lastOp":"edit","touchedPaths":["Notes/foo.md"],...} -->
 *
 * Obsidian's MarkdownRenderer silently drops HTML comments so the chat UI
 * stays clean.  Because the raw content (comment included) is what
 * getMessagesForRequest() serialises and sends to the API, the model sees the
 * metadata on every subsequent turn and never has to ask the user for
 * information it already processed.
 *
 * WHAT IS STORED
 * ──────────────
 *  lastOp          – most recent operation type (read|list|search|create|edit|copy|move|rename)
 *  touchedPaths    – vault-relative paths of every file/folder touched or read this turn
 *  searchQuery     – last search query string (if the turn included a search op)
 *  searchGoal      – last search goal string
 *  opSummary       – short human-readable summary ("Edited Notes/foo.md") for the model
 *  ts              – Unix-ms timestamp so stale memories can be detected
 *
 * EXTRACTION
 * ──────────
 * extractFromOps() scans the raw @@FILE_OP@@ blocks in the AI's response
 * before they are stripped, so no information is lost in the cleaning step.
 *
 * mergeWithExisting() accumulates state across agent-loop iterations (e.g.
 * a turn that does list → read → edit should remember all three paths, not
 * just the last one).
 */
class ContextMemory {
  static TAG = 'SYSTEM_MEMORY';
  static COMMENT_RE = /<!--\s*SYSTEM_MEMORY:\s*(\{[\s\S]*?\})\s*-->/;

  // ── Build ────────────────────────────────────────────────────────────────

  /**
   * Scans a raw AI response (before FILE_OP stripping) and returns a fresh
   * memory object containing every piece of metadata worth retaining.
   *
   * @param {string} rawText  – unprocessed AI reply (may contain @@FILE_OP blocks)
   * @param {Object} [prior]  – existing memory from earlier loop iterations
   * @returns {Object|null}   – memory object, or null if nothing was found
   */
  static extractFromOps(rawText, prior = null) {
    const matches = [...rawText.matchAll(
      /@@FILE_OP:(create|edit|patch|copy|move|rename|list|read|search)\s*((?:\w+="[^"]*"\s*)*)@@/g
    )];

    if (!matches.length && !prior) return null;

    const touchedPaths = new Set(prior?.touchedPaths ?? []);
    let lastOp = prior?.lastOp ?? null;
    let searchQuery = prior?.searchQuery ?? null;
    let searchGoal  = prior?.searchGoal  ?? null;
    const summaryParts = [];

    for (const m of matches) {
      const op    = m[1];
      const attrs = ContextMemory._parseAttrs(m[2]);

      lastOp = op;

      if (attrs.path)  touchedPaths.add(attrs.path);
      if (attrs.to)    touchedPaths.add(attrs.to);
      if (attrs.query) searchQuery = attrs.query;
      if (attrs.goal)  searchGoal  = attrs.goal;

      switch (op) {
        case 'create': summaryParts.push(`Created ${attrs.path}`); break;
        case 'edit':   summaryParts.push(`Edited ${attrs.path}`);  break;
        case 'patch':  summaryParts.push(`Patched ${attrs.path}`); break;
        case 'copy':   summaryParts.push(`Copied ${attrs.path} → ${attrs.to}`); break;
        case 'move':
        case 'rename': summaryParts.push(`Moved ${attrs.path} → ${attrs.to}`); break;
        case 'read':   summaryParts.push(`Read ${attrs.path}`);    break;
        case 'list':   summaryParts.push(`Listed ${attrs.path || '/'}`); break;
        case 'search': summaryParts.push(`Searched for "${attrs.query}"`); break;
      }
    }

    // Nothing to record if there were no ops at all (non-file-ops turn)
    if (!matches.length && !prior) return null;

    const memory = {
      lastOp,
      touchedPaths: [...touchedPaths],
      ts: Date.now()
    };
    if (searchQuery) memory.searchQuery = searchQuery;
    if (searchGoal)  memory.searchGoal  = searchGoal;
    if (summaryParts.length) {
      memory.opSummary = summaryParts.join('; ');
    } else if (prior?.opSummary) {
      memory.opSummary = prior.opSummary;
    }

    return memory;
  }

  /** Merge a new memory snapshot with a prior one, accumulating touchedPaths. */
  static mergeWithExisting(existing, incoming) {
    if (!existing) return incoming;
    if (!incoming) return existing;
    return {
      ...existing,
      ...incoming,
      touchedPaths: [...new Set([...(existing.touchedPaths ?? []), ...(incoming.touchedPaths ?? [])])]
    };
  }

  // ── Serialise / deserialise ──────────────────────────────────────────────

  /** Wraps a memory object as an HTML comment string to embed in a message. */
  static encode(memory) {
    if (!memory) return '';
    try {
      return `\n<!-- ${ContextMemory.TAG}: ${JSON.stringify(memory)} -->`;
    } catch {
      return '';
    }
  }

  /**
   * Extracts and parses the memory comment from a stored message string.
   * Returns null if no comment is found or it cannot be parsed.
   */
  static decode(text) {
    if (!text) return null;
    const m = ContextMemory.COMMENT_RE.exec(text);
    if (!m) return null;
    try { return JSON.parse(m[1]); } catch { return null; }
  }

  /**
   * Strips the SYSTEM_MEMORY comment from text so it is never shown in the
   * rendered chat UI (Obsidian's MarkdownRenderer already drops comments,
   * but this ensures the raw string passed to textContent is also clean).
   */
  static strip(text) {
    if (!text) return text;
    return text.replace(/\n?<!-- SYSTEM_MEMORY:[\s\S]*?-->/g, '').trimEnd();
  }

  // ── Helpers ──────────────────────────────────────────────────────────────

  static _parseAttrs(attrsStr) {
    const attrs = {};
    const re = /(\w+)="([^"]*)"/g;
    let m;
    while ((m = re.exec(attrsStr))) attrs[m[1]] = m[2];
    return attrs;
  }
}

// ==================== VAULT FILE OPERATIONS ====================

/**
 * Default contents seeded into soul.md the first time file operations are
 * used. Read by the AI (via getFileOpsSystemMessage) before every request
 * where file operations are enabled, so the user can tune how the AI
 * behaves around file handling without touching plugin settings.
 */
const DEFAULT_SOUL_MD = `# soul.md — File handling principles

These are your personal guidelines for working with files in this vault.

- Only create, edit, move, copy, or rename a file when the user has clearly
  asked you to. If they ask for a script, snippet, note, or piece of writing
  without asking you to save it anywhere, just show it in the chat — do not
  create a file for it.
- If the user asks you to change something that already exists, edit that
  file rather than creating a duplicate.
- Use clear, descriptive file names, and put new files in a sensible folder
  given the context if the user hasn't specified one.
- Never touch a file the user didn't ask about.
- If you need to see file names or contents before acting (e.g. renaming
  files based on what's inside them), look them up yourself — don't ask the
  user to paste things you can check on your own.
- After performing a file operation, briefly confirm in your reply what you
  did (e.g. which file you created, edited, moved, or copied).
`;

/**
 * Normalizes a user/AI-supplied path into a clean, vault-relative path:
 * forward slashes, no leading slash, and ".." segments resolved away so a
 * path can never escape above the vault (or above a restricted folder).
 */
function normalizeVaultPath(rawPath) {
  const parts = String(rawPath || '')
    .replace(/\\/g, '/')
    .split('/')
    .filter(seg => seg.length > 0 && seg !== '.');

  const stack = [];
  for (const seg of parts) {
    if (seg === '..') stack.pop();
    else stack.push(seg);
  }
  return stack.join('/');
}

/**
 * Executes file-management operations (create/edit/copy/move/rename)
 * against the Obsidian vault on the AI's behalf, honoring the scope the
 * user configured in Settings → File Access:
 *   - 'disabled'   — no operations are permitted
 *   - 'restricted' — operations are confined to a single folder subtree
 *   - 'full'       — operations may target anywhere in the vault
 *
 * This is the only place that actually touches the vault for AI-driven
 * file operations, so every safety/scope check lives here.
 */
class VaultFileManager {
  constructor(plugin) {
    this.plugin = plugin;
    this.app = plugin.app;
    /**
     * Temporary per-request bypass set.  Populated by ChatView._getAssistantReply()
     * with the vault-relative paths that were attached when the user issued a
     * '✏ Edit instruction' command earlier in the same conversation.  Any path
     * in this set is allowed for the duration of that single AI turn even if it
     * would normally fall outside the configured scope.  Cleared immediately
     * after each AI request so it never leaks across turns or conversations.
     *
     * @type {Set<string>}
     */
    this.extraAllowedPaths = new Set();
  }

  get scope() {
    return this.plugin.settings.fileOpsScope || 'disabled';
  }

  /** Vault-relative folders the AI is confined to when scope === 'restricted'. */
  get allowedPaths() {
    return (this.plugin.settings.fileOpsPaths || [])
      .map(p => normalizeVaultPath(p))
      .filter(Boolean);
  }

  /** Vault-relative folders excluded from access when scope === 'full'. */
  get excludedPaths() {
    return (this.plugin.settings.fileOpsExcludedPaths || [])
      .map(p => normalizeVaultPath(p))
      .filter(Boolean);
  }

  /** True if `normalized` is a path the current scope permits touching. */
  isPathAllowed(normalized) {
    // Temporary session-unlock: files the user attached before issuing a
    // '✏ Edit instruction' command are always permitted for that AI turn,
    // regardless of the configured scope.
    if (this.extraAllowedPaths.has(normalized)) return true;

    if (this.scope === 'disabled') return false;
    if (this.scope === 'restricted') {
      const allowed = this.allowedPaths;
      return allowed.some(folder => normalized === folder || normalized.startsWith(folder + '/'));
    }
    // 'full' — allowed unless it falls under one of the excluded paths.
    const excluded = this.excludedPaths;
    return !excluded.some(folder => normalized === folder || normalized.startsWith(folder + '/'));
  }

  /** Normalizes `rawPath` and throws if it falls outside the allowed scope. */
  resolvePath(rawPath) {
    // Fast-path: if this path was session-unlocked via '✏ Edit instruction',
    // skip all scope checks — the user already consented when they attached
    // the file and issued the edit command.
    const normalizedEarly = normalizeVaultPath(rawPath);
    if (normalizedEarly && this.extraAllowedPaths.has(normalizedEarly)) {
      return normalizedEarly;
    }

    if (this.scope === 'disabled') {
      throw new Error('File operations are turned off in Settings → File Access.');
    }
    const normalized = normalizeVaultPath(rawPath);
    if (!normalized) throw new Error('A file path is required.');

    if (this.scope === 'restricted' && this.allowedPaths.length === 0) {
      throw new Error('No allowed paths are configured in Settings → File Access.');
    }
    if (!this.isPathAllowed(normalized)) {
      throw new Error(this.scope === 'restricted'
        ? `"${normalized}" is outside the allowed paths (${this.allowedPaths.join(', ') || 'none configured'}).`
        : `"${normalized}" is inside an excluded path and can't be touched.`);
    }
    return normalized;
  }

  async ensureParentFolder(path) {
    const idx = path.lastIndexOf('/');
    if (idx <= 0) return;
    const folder = path.slice(0, idx);
    if (!(await this.app.vault.adapter.exists(folder))) {
      await this.app.vault.createFolder(folder).catch(() => {});
    }
  }

  async create(rawPath, content) {
    const path = this.resolvePath(rawPath);
    if (await this.app.vault.adapter.exists(path)) {
      throw new Error(`"${path}" already exists (use an edit operation to modify it).`);
    }
    await this.ensureParentFolder(path);
    await this.app.vault.create(path, content ?? '');
    return path;
  }

  async edit(rawPath, content) {
    const path = this.resolvePath(rawPath);
    const file = this.app.vault.getAbstractFileByPath(path);
    if (!file) throw new Error(`"${path}" was not found.`);
    await this.app.vault.modify(file, content ?? '');
    return path;
  }

  /**
   * Replaces every occurrence of `search` with `replace` inside an existing
   * file.  Raises if the search string is not found (guards against silent
   * no-ops where the AI misspelled a target string).
   *
   * @param {string} rawPath   – vault-relative path to the file
   * @param {string} search    – exact text to find (literal, not a regex)
   * @param {string} replace   – text to substitute in its place
   * @returns {{ path: string, count: number }} – path written + number of replacements made
   */
  async patch(rawPath, search, replace) {
    const path = this.resolvePath(rawPath);
    const file = this.app.vault.getAbstractFileByPath(path);
    if (!file) throw new Error(`"${path}" was not found.`);
    const original = await this.app.vault.read(file);
    if (!original.includes(search)) {
      throw new Error(
        `Search string not found in "${path}". ` +
        `Make sure the text matches the file's content exactly (including whitespace and line endings).`
      );
    }
    // Replace ALL occurrences, just like a global find-and-replace.
    const count = original.split(search).length - 1;
    const updated = original.split(search).join(replace);
    return { path, original, updated, count };
  }

  async copy(rawFrom, rawTo) {
    const from = this.resolvePath(rawFrom);
    const to = this.resolvePath(rawTo);
    const file = this.app.vault.getAbstractFileByPath(from);
    if (!file) throw new Error(`"${from}" was not found.`);
    if (await this.app.vault.adapter.exists(to)) {
      throw new Error(`"${to}" already exists.`);
    }
    await this.ensureParentFolder(to);
    await this.app.vault.copy(file, to);
    return to;
  }

  /** Used for both "move" and "rename" operations — a rename is just a move within the same folder. */
  async move(rawFrom, rawTo) {
    const from = this.resolvePath(rawFrom);
    const to = this.resolvePath(rawTo);
    const file = this.app.vault.getAbstractFileByPath(from);
    if (!file) throw new Error(`"${from}" was not found.`);
    if (await this.app.vault.adapter.exists(to)) {
      throw new Error(`"${to}" already exists.`);
    }
    await this.ensureParentFolder(to);
    await this.app.vault.rename(file, to);
    return to;
  }

  /** Recursively (or not) walks a single folder, without scope filtering. */
  async _walkList(dir, recursive) {
    const MAX_ENTRIES = 400;
    const MAX_DEPTH = 6;
    const out = [];

    const walk = async (path, depth) => {
      if (out.length >= MAX_ENTRIES) return;
      let listing;
      try {
        listing = await this.app.vault.adapter.list(path);
      } catch {
        throw new Error(`"${path || '/'}" is not a folder, or doesn't exist.`);
      }
      for (const f of listing.files) {
        out.push({ path: f, type: 'file' });
        if (out.length >= MAX_ENTRIES) return;
      }
      for (const f of listing.folders) {
        out.push({ path: f, type: 'folder' });
        if (out.length >= MAX_ENTRIES) return;
        if (recursive && depth < MAX_DEPTH) await walk(f, depth + 1);
      }
    };

    await walk(dir, 0);
    return out;
  }

  /** Drops any entries that fall under an excluded path (only relevant in 'full' scope). */
  _filterExcluded(entries) {
    if (this.scope !== 'full') return entries;
    const excluded = this.excludedPaths;
    if (!excluded.length) return entries;
    return entries.filter(e => !excluded.some(folder => e.path === folder || e.path.startsWith(folder + '/')));
  }

  /**
   * Lists the contents of a vault folder, so the AI can discover file names
   * before acting on them instead of asking the user to paste them in.
   * With no path given: lists every allowed folder (restricted scope) or the
   * whole vault root minus excluded folders (full scope).
   */
  async list(rawPath, recursive = false) {
    if (this.scope === 'disabled') {
      throw new Error('File operations are turned off in Settings → File Access.');
    }

    if (!rawPath) {
      if (this.scope === 'restricted') {
        const allowed = this.allowedPaths;
        if (!allowed.length) throw new Error('No allowed paths are configured in Settings → File Access.');
        const out = [];
        for (const folder of allowed) out.push(...await this._walkList(folder, recursive));
        return out;
      }
      return this._filterExcluded(await this._walkList('', recursive));
    }

    const dir = this.resolvePath(rawPath);
    return this._filterExcluded(await this._walkList(dir, recursive));
  }

  /** Reads a file's content so the AI can inspect it before acting on it. */
  async read(rawPath) {
    const path = this.resolvePath(rawPath);
    const file = this.app.vault.getAbstractFileByPath(path);
    if (!file) throw new Error(`"${path}" was not found.`);
    const MAX_CHARS = 6000;
    const content = await this.app.vault.read(file);
    return content.length > MAX_CHARS
      ? content.slice(0, MAX_CHARS) + '\n\n[...truncated, file is longer...]'
      : content;
  }

  /**
   * Finds the file(s) that best match what the user is looking for, without
   * ever putting more than one file's content in front of the model at a
   * time:
   *   1. Cheap keyword-frequency pass across every file in scope — narrows
   *      hundreds of files down to a shortlist candidates.
   *   2. For each candidate, one isolated API call asks "how well does this
   *      match the goal?" and gets back a single 0-100 score. Only
   *      {path, score} is kept afterward — the file's content is discarded
   *      immediately, so scoring a dozen files doesn't pile a dozen files'
   *      worth of text into anyone's context.
   *   3. Candidates are ranked by that score, most-similar first.
   */
  async search(rawQuery, goal) {
    if (this.scope === 'disabled') {
      throw new Error('File operations are turned off in Settings → File Access.');
    }
    const query = (rawQuery || '').trim();
    if (!query) throw new Error('A search query is required.');
    const keywords = [...new Set(query.toLowerCase().split(/\s+/).filter(Boolean))];

    const MAX_SCAN = 300;
    const MAX_CANDIDATES = 12;

    const allEntries = await this.list('', true);
    const files = allEntries
      .filter(e => e.type === 'file' && /\.(md|txt|canvas)$/i.test(e.path))
      .slice(0, MAX_SCAN);

    // ---- Cheap keyword-frequency shortlist ----
    const scored = [];
    for (const f of files) {
      let content;
      try {
        content = await this.app.vault.adapter.read(f.path);
      } catch {
        continue;
      }
      const lower = content.toLowerCase();
      let hits = 0;
      for (const kw of keywords) hits += lower.split(kw).length - 1;
      if (f.path.toLowerCase().includes(keywords[0] || '')) hits += 5; // filename match counts extra
      if (hits > 0) scored.push({ path: f.path, hits, content });
    }
    scored.sort((a, b) => b.hits - a.hits);
    const candidates = scored.slice(0, MAX_CANDIDATES);

    if (!candidates.length) {
      return { results: [], scanned: files.length };
    }

    // ---- Per-candidate AI similarity scoring (content discarded after each) ----
    const graded = [];
    for (const c of candidates) {
      const snippet = c.content.length > 3000 ? c.content.slice(0, 3000) + '\n[...truncated...]' : c.content;
      let score = 0;
      try {
        let acc = '';
        const result = await this.plugin.apiManager.sendMessage({
          messages: [
            {
              role: 'system',
              content: 'You compare a single file\'s content against a stated goal. Respond with ONLY an integer from 0 to 100 — nothing else, no words, no punctuation — representing how well this file matches the goal.'
            },
            { role: 'user', content: `Goal: ${goal || query}\n\nFile path: ${c.path}\n\nFile content:\n${snippet}` }
          ],
          temperature: 0,
          max_tokens: 10,
          stream: true
        }, {
          onChunk: (chunk) => { if (chunk) acc += chunk; },
          timeoutMs: this.plugin.settings.timeoutMs
        });
        const raw = (result && result.final) ? result.final : acc;
        const match = raw.match(/\d{1,3}/);
        if (match) score = Math.max(0, Math.min(100, parseInt(match[0], 10)));
      } catch {
        score = 0;
      }
      // Only { path, score } survives past this point — c.content and snippet are dropped here.
      graded.push({ path: c.path, score });
    }

    graded.sort((a, b) => b.score - a.score);
    return { results: graded, scanned: files.length };
  }
}

/**
 * Matches AI-emitted file-operation blocks, e.g.:
 *   @@FILE_OP:create path="Folder/Note.md"@@
 *   ...file content...
 *   @@END_FILE_OP@@
 * Copy/move/rename carry no meaningful body but must still close with
 * @@END_FILE_OP@@. This syntax is deliberately terminal-flavored (per the
 * soul.md instructions the AI is given) but never shown to the user —
 * applyFileOps() strips every matched block out of the displayed text.
 */
const FILE_OP_REGEX = /@@FILE_OP:(create|edit|patch|copy|move|rename|list|read|search)\s*((?:\w+="[^"]*"\s*)*)@@\n?([\s\S]*?)@@END_FILE_OP@@\n?/g;

function parseFileOpAttrs(attrsStr) {
  const attrs = {};
  const re = /(\w+)="([^"]*)"/g;
  let m;
  while ((m = re.exec(attrsStr))) attrs[m[1]] = m[2];
  return attrs;
}

/**
 * Runs only the read-only ops (list/read/search) found in `text` — the ones
 * the AI uses to inspect the vault mid-task (e.g. "what files are in this
 * folder?" or "which file is about X?" before acting on one). Returns a
 * plain-text results block to feed back to the model, or null if the reply
 * contained no query ops at all.
 */
async function extractAndRunQueryOps(text, manager) {
  const matches = [...text.matchAll(FILE_OP_REGEX)].filter(m => m[1] === 'list' || m[1] === 'read' || m[1] === 'search');
  if (!matches.length) return null;

  const blocks = [];
  for (const match of matches) {
    const [, op, attrsStr] = match;
    const attrs = parseFileOpAttrs(attrsStr);
    try {
      if (op === 'list') {
        const entries = await manager.list(attrs.path, attrs.recursive === 'true');
        const listing = entries.length
          ? entries.map(e => `${e.type === 'folder' ? '📁' : '📄'} ${e.path}`).join('\n')
          : '(empty)';
        blocks.push(`Listing of "${attrs.path || '/'}" (${entries.length} item(s)):\n${listing}`);
      } else if (op === 'read') {
        const content = await manager.read(attrs.path);
        blocks.push(`Contents of "${attrs.path}":\n\`\`\`\n${content}\n\`\`\``);
      } else if (op === 'search') {
        const { results, scanned } = await manager.search(attrs.query, attrs.goal);
        if (!results.length) {
          blocks.push(`Search for "${attrs.query || ''}" scanned ${scanned} file(s) and found no keyword matches.`);
        } else {
          const ranked = results.map((r, i) => `${i + 1}. ${r.path} — ${r.score}% match`).join('\n');
          blocks.push(`Search for "${attrs.query || ''}" (goal: ${attrs.goal || attrs.query || ''}) — ${results.length} candidate(s) out of ${scanned} file(s) scanned, ranked by similarity:\n${ranked}\n\nRead the top match with a read operation to confirm before acting on it.`);
        }
      }
    } catch (e) {
      blocks.push(`⨉ ${op} failed${attrs.path ? ` for "${attrs.path}"` : ''}: ${e.message}`);
    }
  }
  return blocks.join('\n\n---\n\n');
}

/**
 * Scans `text` (a finished AI reply) for @@FILE_OP:...@@ blocks, executes
 * each one against the vault via `manager`, and returns the text with every
 * block replaced by a short human-readable confirmation/error line — so the
 * raw command syntax never reaches the chat UI.
 *
 * @returns {Promise<{cleanedText: string, notices: string[], ranAnyOp: boolean}>}
 */
/**
 * Scans `text` for @@FILE_OP:...@@ blocks and executes each one.
 *
 * Edit operations are treated specially: instead of writing to the vault
 * immediately, the original content is read first and the before/after pair
 * is collected into `pendingEdits` so the caller can show the DiffViewModal
 * and let the user review the change before it is applied.
 *
 * All other mutating operations (create/copy/move/rename) still execute
 * immediately, because they don't overwrite existing content and don't
 * benefit from a diff view.
 *
 * @returns {Promise<{cleanedText: string, notices: string[], ranAnyOp: boolean,
 *                    pendingEdits: Array<{path:string, file:TFile,
 *                                        originalContent:string, newContent:string}>}>}
 */
async function applyFileOps(text, manager) {
  const matches = [...text.matchAll(FILE_OP_REGEX)];
  if (!matches.length) return { cleanedText: text, notices: [], ranAnyOp: false, pendingEdits: [] };

  let cleaned = '';
  let lastIndex = 0;
  const notices = [];
  // Edit ops deferred for diff review — { path, file, originalContent, newContent }
  const pendingEdits = [];

  for (const match of matches) {
    cleaned += text.slice(lastIndex, match.index);
    lastIndex = match.index + match[0].length;

    const [, op, attrsStr, body] = match;
    const attrs = parseFileOpAttrs(attrsStr);
    const content = body.replace(/^\n/, '').replace(/\n$/, '');

    // list/read/search should already have been consumed by the agent loop
    // before we ever get here. Drop silently if one slips through.
    if (op === 'list' || op === 'read' || op === 'search') continue;

    let notice;
    try {
      switch (op) {
        case 'create': {
          const p = await manager.create(attrs.path, content);
          notice = `📄 Created file: ${p}`;
          break;
        }
        case 'edit': {
          // Resolve path and read original content BEFORE writing, so we can
          // show a diff and let the user approve the change.
          const path = manager.resolvePath(attrs.path);
          const file = manager.app.vault.getAbstractFileByPath(path);
          if (!file) throw new Error(`"${path}" was not found.`);
          const originalContent = await manager.app.vault.read(file);
          pendingEdits.push({ path, file, originalContent, newContent: content });
          // Placeholder in the chat text — the diff modal confirmation line
          // will be appended by _getAssistantReply after the modal is closed.
          notice = `✏️ Proposed edit to: ${path} — see diff review above`;
          break;
        }
        case 'patch': {
          // search/replace — diff-reviewed the same way as a full edit.
          // The body of the block is unused; search and replace come from attrs.
          const { path, original: originalContent, updated: newContent, count } =
            await manager.patch(attrs.path, attrs.search, attrs.replace ?? '');
          const file = manager.app.vault.getAbstractFileByPath(path);
          pendingEdits.push({ path, file, originalContent, newContent });
          notice = `🔍 Proposed patch to: ${path} (${count} replacement${count === 1 ? '' : 's'}) — see diff review above`;
          break;
        }
        case 'copy': {
          const p = await manager.copy(attrs.path, attrs.to);
          notice = `📋 Copied ${attrs.path} → ${p}`;
          break;
        }
        case 'move':
        case 'rename': {
          const p = await manager.move(attrs.path, attrs.to);
          notice = `📦 Moved ${attrs.path} → ${p}`;
          break;
        }
        default:
          notice = `⨉ Unknown file operation: ${op}`;
      }
    } catch (e) {
      notice = `⨉ File operation failed (${op} "${attrs.path || ''}"): ${e.message}`;
    }
    notices.push(notice);
    cleaned += `\n\n> ${notice}\n`;
  }
  cleaned += text.slice(lastIndex);
  return { cleanedText: cleaned.trim(), notices, ranAnyOp: true, pendingEdits };
}

// ==================== AI FILE EDITOR ====================

/**
 * Drives the AI-powered file editing pipeline.
 * For each attached file it:
 *   1. Reads the original content from the vault.
 *   2. Asks the active AI provider to return a completely rewritten version.
 *   3. Computes the line-level diff between original and AI output.
 *   4. Returns a FileDiff array that DiffViewModal can display.
 */
class AIFileEditor {
  constructor(plugin) {
    this.plugin = plugin;
  }

  /**
   * @param {import('obsidian').TFile[]} files
   * @param {string}   instruction  — the user's editing instruction
   * @param {Function} onProgress   — optional callback(statusText)
   * @param {Object}   options
   * @param {number}   options.delayMs     — pause between files (default 400ms)
   * @param {number}   options.maxRetries  — retries per file on transient errors (default 2)
   * @param {Function} options.isCancelled — optional () => boolean, checked before each file
   * @returns {Promise<FileDiff[]>}
   *
   * FileDiff shape:
   *   { file, originalContent, newContent, diff, selected }
   *
   * Files are always processed one at a time (never in parallel) and paced
   * with a short delay between requests. This is what keeps a "modify 30
   * files" instruction from firing a burst of large requests back-to-back,
   * which is what previously overwhelmed local models / tripped cloud rate
   * limits and made the whole pipeline crash instead of degrading gracefully.
   */
  async editFiles(files, instruction, onProgress, options = {}) {
    const {
      delayMs = 400,
      maxRetries = 2,
      isCancelled = () => false
    } = options;

    const results = [];
    const total = files.length;

    for (let i = 0; i < total; i++) {
      if (isCancelled()) {
        onProgress?.(`⏸ Stopped — processed ${i}/${total} files`);
        break;
      }

      const file = files[i];
      onProgress?.(`⏳ Processing ${i + 1}/${total}: ${file.basename}…`);

      let originalContent;
      try {
        originalContent = await this.plugin.app.vault.read(file);
      } catch (e) {
        onProgress?.(`⚠ Could not read ${file.basename}: ${e.message}`);
        continue;
      }

      let newContent = null;
      let chatMessage = '';
      let lastError = null;

      for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
          const editResult = await this._callAIForEdit(file, originalContent, instruction);
          newContent   = editResult.newContent;
          chatMessage  = editResult.chatMessage;
          lastError    = null;
          break;
        } catch (e) {
          lastError = e;
          const isTransient = /429|timeout|fetch|ECONNREFUSED|network|rate.?limit/i.test(e.message || '');
          if (isTransient && attempt < maxRetries) {
            const backoff = 800 * Math.pow(2, attempt); // 800ms, 1600ms, ...
            onProgress?.(`⏳ ${file.basename}: temporary error, retrying in ${Math.round(backoff / 1000)}s (attempt ${attempt + 2}/${maxRetries + 1})…`);
            await sleep(backoff);
            continue;
          }
          break; // non-transient error, or out of retries
        }
      }

      if (lastError) {
        onProgress?.(`⚠ AI error on ${file.basename}: ${lastError.message}`);
        results.push({
          file,
          originalContent,
          newContent: originalContent,
          diff: DiffComputer.computeLineDiff(originalContent, originalContent),
          selected: false,
          chatMessage: '',
          error: lastError.message
        });
      } else {
        const diff = DiffComputer.computeLineDiff(originalContent, newContent);
        results.push({
          file,
          originalContent,
          newContent,
          diff,
          selected: DiffComputer.hasChanges(diff), // pre-select only if there are actual changes
          chatMessage,   // natural-language summary from the AI for this file
          error: null
        });
      }

      // Pace requests — brief pause before moving to the next file so we
      // never fire large requests in an uninterrupted burst. Skipped after
      // the last file and after a cancellation check will catch on the
      // next loop iteration.
      if (i < total - 1 && !isCancelled()) {
        await sleep(delayMs);
      }
    }

    return results;
  }

  /**
   * Calls the AI with a structured-delimiter prompt so it can emit both a
   * short chat message (shown in the chat window) and the complete new file
   * content (written to the vault) in a single request.
   *
   * The response format the model is asked to follow:
   *
   *   <CHAT>
   *   Any natural-language commentary the user should see.
   *   </CHAT>
   *   <FILE>
   *   ...complete new file content, raw, no fences...
   *   </FILE>
   *
   * @returns {{ chatMessage: string, newContent: string }}
   */
  async _callAIForEdit(file, originalContent, instruction) {
    const trimmed = trimContent(originalContent, 6000);
    const systemPrompt = [
      'You are a precise file editor.',
      'When the user gives you a file and an editing instruction, you MUST respond using EXACTLY this format — no deviations:',
      '',
      '<CHAT>',
      'A brief, friendly message to show the user in the chat window. Describe what you changed and why, or note if nothing needed changing. 1–3 sentences.',
      '</CHAT>',
      '<FILE>',
      'The complete modified file content, raw. No markdown code fences. No preamble. Exactly as it should be saved to disk.',
      '</FILE>',
      '',
      'Both sections are mandatory. The <CHAT> section is the only place for any natural language. Everything inside <FILE>…</FILE> must be the raw file content and nothing else.',
      'If no changes are needed, return the original text verbatim inside <FILE>.</FILE>.'
    ].join('\n');

    const userMessage = [
      `File: ${file.path}`,
      '',
      '--- BEGIN FILE CONTENT ---',
      trimmed,
      '--- END FILE CONTENT ---',
      '',
      `Editing instruction: ${instruction}`
    ].join('\n');

    const result = await this.plugin.apiManager.sendMessage({
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user',   content: userMessage }
      ],
      temperature: 0.2,      // lower = more deterministic edits
      max_tokens:  this.plugin.settings.max_tokens,
      stream:      false
    }, { timeoutMs: this.plugin.settings.timeoutMs });

    if (!result?.final) throw new Error('Empty response from AI');

    return this._parseEditResponse(result.final.trim());
  }

  /**
   * Splits the AI's structured response into its chat message and file-content
   * parts. Falls back gracefully if the model ignored the format instruction.
   *
   * @param {string} raw  — the full AI response string
   * @returns {{ chatMessage: string, newContent: string }}
   */
  _parseEditResponse(raw) {
    const chatMatch = raw.match(/<CHAT>([\s\S]*?)<\/CHAT>/i);
    const fileMatch = raw.match(/<FILE>([\s\S]*?)<\/FILE>/i);

    if (chatMatch && fileMatch) {
      return {
        chatMessage: chatMatch[1].trim(),
        newContent:  this._stripCodeFence(fileMatch[1].trim())
      };
    }

    // Graceful fallback: model ignored the format — treat the whole response
    // as the file content (original behaviour) and surface no chat message.
    console.warn('AIFileEditor: response did not use <CHAT>/<FILE> delimiters; falling back to raw-content mode.');
    return {
      chatMessage: '',
      newContent:  this._stripCodeFence(raw)
    };
  }

  /** Remove ```markdown / ``` wrappers that some models add despite the prompt. */
  _stripCodeFence(text) {
    return text.replace(/^```[a-z]*\n?/i, '').replace(/\n?```$/i, '').trim();
  }
}

// ==================== DIFF VIEW MODAL ====================

/**
 * GitHub-style diff review modal.
 *
 * Shows every proposed file change with:
 *   • A checkbox per file (deselect to skip that file)
 *   • Colour-coded line diff — green additions, red deletions, grey context
 *   • "Apply Changes" and "Cancel" buttons
 *
 * On "Apply", it calls vault.modify() for every selected file and invokes
 * the onApply callback with the list of modified TFile objects.
 */
class DiffViewModal extends Modal {
  /**
   * @param {import('obsidian').App}    app
   * @param {import('obsidian').Plugin} plugin
   * @param {FileDiff[]}                fileDiffs
   * @param {Function}                  onApply   — called with applied TFile[]
   */
  constructor(app, plugin, fileDiffs, onApply) {
    super(app);
    this.plugin    = plugin;
    this.fileDiffs = fileDiffs;  // mutated in-place (selected flag)
    this.onApply   = onApply;
    this._appliedFileDiffs = null; // set once Apply Changes has run
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.style.padding    = '0';
    contentEl.style.display    = 'flex';
    contentEl.style.flexDirection = 'column';
    contentEl.style.height     = '80vh';
    contentEl.style.maxWidth   = '100%';
    contentEl.style.width      = '100%';

    // ── Header ────────────────────────────────────────────────────────────
    const header = contentEl.createDiv({ cls: 'ai-diff-header' });
    header.style.display        = 'flex';
    header.style.alignItems     = 'center';
    header.style.justifyContent = 'space-between';
    header.style.padding        = '16px 20px';
    header.style.borderBottom   = '1px solid var(--background-modifier-border)';
    header.style.flexShrink     = '0';
    header.style.gap            = '12px';

    const titleWrap = header.createDiv();
    titleWrap.style.display    = 'flex';
    titleWrap.style.alignItems = 'center';
    titleWrap.style.gap        = '10px';

    const titleIcon = titleWrap.createSpan();
    setIcon(titleIcon, 'git-compare');
    titleIcon.style.color = 'var(--text-accent)';

    const titleText = titleWrap.createEl('h2', { text: 'Review AI Changes' });
    titleText.style.margin   = '0';
    titleText.style.fontSize = '18px';

    const changedCount = this.fileDiffs.filter(d => DiffComputer.hasChanges(d.diff)).length;
    const subtitle = header.createDiv({
      text: `${changedCount} of ${this.fileDiffs.length} file${this.fileDiffs.length !== 1 ? 's' : ''} modified`
    });
    subtitle.style.fontSize = '13px';
    subtitle.style.color    = 'var(--text-muted)';

    // ── Scrollable diff body ──────────────────────────────────────────────
    const body = contentEl.createDiv({ cls: 'ai-diff-body' });
    body.style.flex      = '1';
    body.style.overflowY = 'auto';
    body.style.padding   = '16px 20px';

    this.fileDiffs.forEach(fd => this._renderFileDiff(body, fd));

    // ── Footer ────────────────────────────────────────────────────────────
    const footer = contentEl.createDiv({ cls: 'ai-diff-footer' });
    footer.style.display        = 'flex';
    footer.style.justifyContent = 'flex-end';
    footer.style.alignItems     = 'center';
    footer.style.gap            = '12px';
    footer.style.padding        = '14px 20px';
    footer.style.borderTop      = '1px solid var(--background-modifier-border)';
    footer.style.flexShrink     = '0';
    footer.style.background     = 'var(--background-primary)';
    this.footer = footer;

    const selectionHint = footer.createDiv({ cls: 'ai-diff-hint' });
    selectionHint.style.flex     = '1';
    selectionHint.style.fontSize = '12px';
    selectionHint.style.color    = 'var(--text-muted)';
    selectionHint.textContent    = 'Uncheck files you want to skip';
    this.selectionHint = selectionHint;

    const cancelBtn = footer.createEl('button', { text: 'Cancel' });
    cancelBtn.style.padding      = '8px 20px';
    cancelBtn.style.borderRadius = '6px';
    cancelBtn.style.border       = '1px solid var(--background-modifier-border)';
    cancelBtn.style.background   = 'transparent';
    cancelBtn.style.color        = 'var(--text-normal)';
    cancelBtn.style.cursor       = 'pointer';
    cancelBtn.style.fontSize     = '14px';
    this.cancelBtn = cancelBtn;

    const applyBtn = footer.createEl('button');
    applyBtn.style.padding      = '8px 20px';
    applyBtn.style.borderRadius = '6px';
    applyBtn.style.border       = 'none';
    applyBtn.style.background   = 'var(--interactive-accent)';
    applyBtn.style.color        = 'var(--text-on-accent)';
    applyBtn.style.cursor       = 'pointer';
    applyBtn.style.fontSize     = '14px';
    applyBtn.style.fontWeight   = '600';
    applyBtn.style.display      = 'flex';
    applyBtn.style.alignItems   = 'center';
    applyBtn.style.gap          = '6px';
    this.applyBtn = applyBtn;

    const applyIcon = applyBtn.createSpan();
    setIcon(applyIcon, 'check');
    applyBtn.createSpan().textContent = 'Apply Changes';

    cancelBtn.addEventListener('click', () => this.close());

    applyBtn.addEventListener('click', async () => {
      applyBtn.disabled      = true;
      applyBtn.style.opacity = '0.6';

      const applied = [];
      for (const fd of this.fileDiffs) {
        if (!fd.selected || !DiffComputer.hasChanges(fd.diff)) continue;
        try {
          await this.plugin.app.vault.modify(fd.file, fd.newContent);
          applied.push(fd);
        } catch (e) {
          new Notice(`⚠ Failed to write ${fd.file.basename}: ${e.message}`);
        }
      }

      if (applied.length > 0) {
        new Notice(`✓ Applied AI edits to ${applied.length} file${applied.length !== 1 ? 's' : ''}`);
        this.onApply?.(applied.map(fd => fd.file));
        // Keep the modal open, showing a Revert option, instead of closing
        // immediately — the user may want to undo the AI's changes.
        this._showAppliedState(applied);
      } else {
        new Notice('No changes applied');
        this.close();
      }
    });
  }

  /**
   * Switches the footer into its post-apply state: the file this.fileDiffs
   * were written to disk, and the user can now either close the review or
   * click "Return to Original" to restore each applied file's pre-AI
   * content (using the originalContent captured before the edit ran).
   * @param {FileDiff[]} appliedFileDiffs
   */
  _showAppliedState(appliedFileDiffs) {
    this._appliedFileDiffs = appliedFileDiffs;

    this.selectionHint.textContent = `✓ Applied to ${appliedFileDiffs.length} file${appliedFileDiffs.length !== 1 ? 's' : ''}`;

    this.applyBtn.remove();
    this.cancelBtn.textContent = 'Close';

    const revertBtn = this.footer.createEl('button', { cls: 'ai-diff-revert-btn' });
    revertBtn.style.padding      = '8px 20px';
    revertBtn.style.borderRadius = '6px';
    revertBtn.style.border       = '1px solid var(--background-modifier-border)';
    revertBtn.style.background   = 'var(--background-secondary)';
    revertBtn.style.color        = 'var(--text-normal)';
    revertBtn.style.cursor       = 'pointer';
    revertBtn.style.fontSize     = '14px';
    revertBtn.style.fontWeight   = '600';
    revertBtn.style.display      = 'flex';
    revertBtn.style.alignItems   = 'center';
    revertBtn.style.gap          = '6px';

    const revertIcon = revertBtn.createSpan();
    setIcon(revertIcon, 'undo-2');
    revertBtn.createSpan().textContent = 'Return to Original';

    revertBtn.addEventListener('click', async () => {
      revertBtn.disabled      = true;
      revertBtn.style.opacity = '0.6';

      let reverted = 0;
      for (const fd of this._appliedFileDiffs) {
        try {
          await this.plugin.app.vault.modify(fd.file, fd.originalContent);
          reverted++;
        } catch (e) {
          new Notice(`⚠ Failed to restore ${fd.file.basename}: ${e.message}`);
        }
      }

      if (reverted > 0) {
        new Notice(`↩ Restored ${reverted} file${reverted !== 1 ? 's' : ''} to their original content`);
      }
      this.close();
    });
  }

  /**
   * Renders a single file's diff section inside the body div.
   * @param {HTMLElement} body
   * @param {FileDiff}    fd
   */
  _renderFileDiff(body, fd) {
    const section = body.createDiv({ cls: 'ai-diff-file-section' });
    section.style.marginBottom   = '24px';
    section.style.border         = '1px solid var(--background-modifier-border)';
    section.style.borderRadius   = '8px';
    section.style.overflow       = 'hidden';

    // ── File header row ──────────────────────────────────────────────────
    const fileHeader = section.createDiv({ cls: 'ai-diff-file-header' });
    fileHeader.style.display        = 'flex';
    fileHeader.style.alignItems     = 'center';
    fileHeader.style.gap            = '10px';
    fileHeader.style.padding        = '10px 14px';
    fileHeader.style.background     = 'var(--background-secondary)';
    fileHeader.style.borderBottom   = '1px solid var(--background-modifier-border)';
    fileHeader.style.cursor         = 'pointer';
    fileHeader.style.userSelect     = 'none';

    // Checkbox — controls whether this file's changes get applied
    const cbWrap = fileHeader.createDiv();
    const cb = cbWrap.createEl('input', { type: 'checkbox' });
    cb.style.width  = '16px';
    cb.style.height = '16px';
    cb.style.cursor = 'pointer';
    cb.checked      = fd.selected;
    cb.addEventListener('change', (e) => { fd.selected = e.target.checked; });
    cb.addEventListener('click', e => e.stopPropagation());

    // File icon + path
    const fileIcon = fileHeader.createSpan();
    setIcon(fileIcon, fd.error ? 'alert-triangle' : 'file-text');
    fileIcon.style.color = fd.error ? 'var(--text-error)' : 'var(--text-muted)';

    const filePath = fileHeader.createSpan({ text: fd.file.path });
    filePath.style.fontFamily  = 'monospace';
    filePath.style.fontSize    = '13px';
    filePath.style.fontWeight  = '600';
    filePath.style.flex        = '1';
    filePath.style.overflow    = 'hidden';
    filePath.style.textOverflow = 'ellipsis';
    filePath.style.whiteSpace  = 'nowrap';

    // Change summary badge
    const addedCount   = fd.diff.filter(d => d.type === 'added').length;
    const removedCount = fd.diff.filter(d => d.type === 'removed').length;

    if (fd.error) {
      const errBadge = fileHeader.createSpan({ text: `⚠ ${fd.error}` });
      errBadge.style.fontSize = '12px';
      errBadge.style.color    = 'var(--text-error)';
    } else if (!DiffComputer.hasChanges(fd.diff)) {
      const noBadge = fileHeader.createSpan({ text: 'No changes' });
      noBadge.style.fontSize = '12px';
      noBadge.style.color    = 'var(--text-muted)';
    } else {
      if (addedCount > 0) {
        const addBadge = fileHeader.createSpan({ text: `+${addedCount}` });
        addBadge.style.color      = '#22c55e';
        addBadge.style.fontWeight = '700';
        addBadge.style.fontSize   = '13px';
        addBadge.style.marginLeft = '4px';
      }
      if (removedCount > 0) {
        const remBadge = fileHeader.createSpan({ text: `-${removedCount}` });
        remBadge.style.color      = '#ef4444';
        remBadge.style.fontWeight = '700';
        remBadge.style.fontSize   = '13px';
        remBadge.style.marginLeft = '4px';
      }
    }

    // Collapse chevron
    const chevron = fileHeader.createSpan();
    setIcon(chevron, 'chevron-down');
    chevron.style.color      = 'var(--text-muted)';
    chevron.style.flexShrink = '0';
    chevron.style.transition = 'transform 0.15s';

    // ── Diff content (collapsible) ───────────────────────────────────────
    const diffContent = section.createDiv({ cls: 'ai-diff-content' });
    diffContent.style.fontFamily  = 'monospace';
    diffContent.style.fontSize    = '13px';
    diffContent.style.lineHeight  = '1.6';
    diffContent.style.overflow    = 'auto';
    diffContent.style.maxHeight   = '400px';

    // Toggle collapse on header click
    let collapsed = false;
    fileHeader.addEventListener('click', () => {
      collapsed = !collapsed;
      diffContent.style.display = collapsed ? 'none' : '';
      chevron.style.transform   = collapsed ? 'rotate(-90deg)' : '';
    });

    if (fd.error || !DiffComputer.hasChanges(fd.diff)) {
      const msg = diffContent.createDiv();
      msg.style.padding = '16px';
      msg.style.color   = 'var(--text-muted)';
      msg.style.textAlign = 'center';
      msg.textContent   = fd.error ? `Error: ${fd.error}` : '✓ No changes — file content is identical';
      return;
    }

    // Render hunks with separators between them
    const hunks = DiffComputer.groupIntoHunks(fd.diff, 3);
    hunks.forEach((hunk, hunkIdx) => {
      if (hunkIdx > 0) {
        const sep = diffContent.createDiv({ cls: 'ai-diff-sep' });
        sep.style.padding    = '3px 14px';
        sep.style.background = 'var(--background-modifier-border)';
        sep.style.color      = 'var(--text-muted)';
        sep.style.fontSize   = '11px';
        sep.textContent      = '·· ·· ··';
      }

      hunk.lines.forEach(({ type, line }) => {
        const lineEl = diffContent.createDiv({ cls: `ai-diff-line ai-diff-${type}` });
        lineEl.style.padding     = '1px 14px 1px 28px';
        lineEl.style.position    = 'relative';
        lineEl.style.whiteSpace  = 'pre';
        lineEl.style.overflowX   = 'auto';

        const prefix = diffContent.createDiv({ cls: 'ai-diff-prefix' });
        // We'll use the lineEl itself for the prefix marker
        if (type === 'added') {
          lineEl.style.background = 'rgba(34,197,94,0.15)';
          lineEl.style.color      = '#16a34a';
          lineEl.style.paddingLeft = '28px';
          lineEl.style.position   = 'relative';
          // Prefix indicator positioned inside
          const marker = lineEl.createSpan({ text: '+' });
          marker.style.position = 'absolute';
          marker.style.left     = '8px';
          marker.style.color    = '#16a34a';
          marker.style.fontWeight = '700';
          marker.style.userSelect = 'none';
          lineEl.appendChild(document.createTextNode(line));
        } else if (type === 'removed') {
          lineEl.style.background  = 'rgba(239,68,68,0.15)';
          lineEl.style.color       = '#dc2626';
          lineEl.style.paddingLeft = '28px';
          lineEl.style.position    = 'relative';
          const marker = lineEl.createSpan({ text: '−' });
          marker.style.position   = 'absolute';
          marker.style.left       = '8px';
          marker.style.color      = '#dc2626';
          marker.style.fontWeight = '700';
          marker.style.userSelect = 'none';
          lineEl.appendChild(document.createTextNode(line));
        } else {
          lineEl.style.color       = 'var(--text-muted)';
          lineEl.style.paddingLeft = '28px';
          lineEl.style.position    = 'relative';
          const marker = lineEl.createSpan({ text: ' ' });
          marker.style.position   = 'absolute';
          marker.style.left       = '8px';
          marker.style.userSelect = 'none';
          lineEl.appendChild(document.createTextNode(line));
        }
      });
    });
  }

  onClose() {
    this.contentEl.empty();
  }
}

// ==================== CUSTOM ERROR CLASSES ====================

class NetworkError extends Error {
  constructor(statusCode, message, statusText) {
    super(message);
    this.name = 'NetworkError';
    this.statusCode = statusCode;
    this.statusText = statusText;
  }
}

class TimeoutError extends Error {
  constructor(message) {
    super(message);
    this.name = 'TimeoutError';
  }
}

class StreamingError extends Error {
  constructor(message) {
    super(message);
    this.name = 'StreamingError';
  }
}

class AuthenticationError extends Error {
  constructor(message, provider) {
    super(message);
    this.name = 'AuthenticationError';
    this.provider = provider;
  }
}

class RateLimitError extends Error {
  constructor(message, provider, retryAfter) {
    super(message);
    this.name = 'RateLimitError';
    this.provider = provider;
    this.retryAfter = retryAfter;
  }
}

/**
 * Thrown when a request was aborted because the user clicked the Stop
 * button, as opposed to an AbortError caused by a timeout or other cause.
 * Callers use this to distinguish "user cancelled — show partial text
 * gracefully" from "something actually went wrong — show an error".
 */
class UserAbortError extends Error {
  constructor(message = 'Request stopped by user') {
    super(message);
    this.name = 'UserAbortError';
  }
}

// ==================== NETWORK MANAGER ====================

class NetworkManager {
  constructor(plugin) {
    this.plugin = plugin;
    // requestId -> { controller: AbortController, userAborted: boolean }
    this.abortControllers = new Map();
    this.maxRetries = 3;
    this.retryDelay = 1000;
  }

  async fetchWithRetry(url, options, requestId = null) {
    const controller = new AbortController();
    let entry = null;
    if (requestId) {
      entry = { controller, userAborted: false };
      this.abortControllers.set(requestId, entry);
    }

    const timeoutMs = options.timeout || this.plugin.settings.timeoutMs || 120000;
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    let lastError;
    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      try {
        const response = await fetch(url, {
          ...options,
          signal: controller.signal,
          cache: 'no-cache',
          credentials: 'omit',
          mode: 'cors'
        });

        if (!response.ok) {
          const errorText = await response.text();
          
          if (response.status === 401 || response.status === 403) {
            throw new AuthenticationError(`Authentication failed: ${response.status}`, url);
          } else if (response.status === 429) {
            const retryAfter = response.headers.get('Retry-After') || 60;
            throw new RateLimitError(`Rate limit exceeded`, url, parseInt(retryAfter));
          } else {
            throw new NetworkError(response.status, errorText, response.statusText);
          }
        }

        clearTimeout(timeoutId);
        // NOTE: intentionally NOT removing the abort-controller entry here.
        // For streaming requests the response body is still being read
        // after this point, so the same controller/entry must stay
        // registered (and abortable) until the whole operation — including
        // the stream — finishes. BaseAIProvider.send() cleans it up in its
        // `finally` block once that's done.
        return response;
      } catch (error) {
        lastError = error;
        
        if (error.name === 'AbortError') {
          clearTimeout(timeoutId);
          const wasUserAbort = !!(entry && entry.userAborted);
          if (requestId) {
            this.abortControllers.delete(requestId);
          }
          if (wasUserAbort) {
            throw new UserAbortError();
          }
          throw new TimeoutError(`Request timeout after ${timeoutMs}ms`);
        }

        if (error instanceof AuthenticationError || error instanceof RateLimitError) {
          throw error;
        }

        if (this.shouldRetry(error, attempt)) {
          const delay = this.calculateBackoff(attempt);
          await new Promise(resolve => setTimeout(resolve, delay));
          continue;
        }
        
        break;
      }
    }

    clearTimeout(timeoutId);
    if (requestId) {
      this.abortControllers.delete(requestId);
    }

    throw this.normalizeError(lastError);
  }

  shouldRetry(error, attempt) {
    if (attempt >= this.maxRetries) return false;
    
    if (error.name === 'TypeError' && error.message.includes('fetch')) {
      return true;
    }
    
    if (error.name === 'NetworkError') {
      return [408, 429, 500, 502, 503, 504].includes(error.statusCode);
    }
    
    return false;
  }

  calculateBackoff(attempt) {
    return Math.min(1000 * Math.pow(2, attempt - 1) + Math.random() * 100, 30000);
  }

  normalizeError(error) {
    if (error.name === 'TypeError' && error.message.includes('fetch')) {
      return new NetworkError(0, 'Network connection failed. Please check your internet connection and ensure the AI service is running.', 'NETWORK_ERROR');
    }
    return error;
  }

  /**
   * Aborts a specific in-flight request. `viaUserAction` should be true
   * when this is a deliberate user-initiated cancellation (e.g. the Stop
   * button) so downstream code can tell it apart from a timeout-triggered
   * abort and react gracefully instead of showing an error.
   *
   * Important: when `viaUserAction` is true we deliberately do NOT remove
   * the map entry here. The abort() call rejects the in-flight fetch/reader
   * promise asynchronously, and the code that awaits it (fetchWithRetry's
   * catch, or StreamingHandler mid-stream) needs to still find this entry —
   * with userAborted already set — when it runs a moment later. Natural
   * cleanup removes the entry once that check has happened: fetchWithRetry
   * deletes it on its own AbortError path, and BaseAIProvider.send()'s
   * `finally` block calls abortRequest() again (without viaUserAction) once
   * the whole request/stream is done, which deletes it then.
   */
  abortRequest(requestId, viaUserAction = false) {
    const entry = this.abortControllers.get(requestId);
    if (entry) {
      if (viaUserAction) {
        entry.userAborted = true;
        entry.controller.abort();
      } else {
        entry.controller.abort();
        this.abortControllers.delete(requestId);
      }
    }
  }

  abortAllRequests() {
    this.abortControllers.forEach(entry => entry.controller.abort());
    this.abortControllers.clear();
  }
}

// ==================== STREAMING HANDLER ====================

class StreamingHandler {
  constructor() {
    this.buffer = '';
    this.chunkProcessors = new Map();

    this.registerChunkProcessor('openai', this.processOpenAIChunk.bind(this));
    this.registerChunkProcessor('local', this.processLocalChunk.bind(this));
    this.registerChunkProcessor('anthropic', this.processAnthropicChunk.bind(this));
    this.registerChunkProcessor('gemini', this.processGeminiChunk.bind(this));
    this.registerChunkProcessor('generic', this.processGenericChunk.bind(this));
  }

  registerChunkProcessor(provider, processor) {
    this.chunkProcessors.set(provider, processor);
  }

  async handleStreamingResponse(response, onChunk, provider = 'local', abortCtx = null) {
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    const processor = this.chunkProcessors.get(provider) || this.processGenericChunk.bind(this);

    let accumulatedText = '';
    let buffer = '';
    // Accumulate usage data found in stream chunks (provider-specific last chunk)
    let streamUsage = null;

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        const lines = buffer.split(/\r?\n/);
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.trim() === '') continue;

          // Try to extract usage from this line before passing to text processor
          const lineUsage = this._extractStreamUsage(line, provider);
          if (lineUsage) streamUsage = lineUsage;

          const text = processor(line);
          if (text && text.trim().length > 0) {
            accumulatedText += text;
            onChunk(text);
          }
        }
      }

      // Process any remaining data in the buffer
      if (buffer.trim()) {
        const lineUsage = this._extractStreamUsage(buffer, provider);
        if (lineUsage) streamUsage = lineUsage;

        const text = processor(buffer);
        if (text && text.trim().length > 0) {
          accumulatedText += text;
          onChunk(text);
        }
      }

      return { text: accumulatedText, usage: streamUsage };
    } catch (error) {
      // If the stream was cut short because the user hit Stop, the reader's
      // abort surfaces here (mid-body), not in fetchWithRetry — the headers
      // had already arrived. Detect that via the abort-controller entry and
      // return what we've accumulated so far instead of throwing, so the
      // chat UI keeps the partial text and never shows an error for this.
      const entry = (abortCtx && abortCtx.requestId)
        ? abortCtx.networkManager?.abortControllers.get(abortCtx.requestId)
        : null;
      if (error.name === 'AbortError' && entry?.userAborted) {
        return { text: accumulatedText, usage: streamUsage };
      }

      console.error('Streaming error:', error);
      throw new StreamingError('Stream interrupted: ' + error.message);
    }
  }

  /**
   * Tries to extract token-usage data from a single streaming line.
   * Each provider embeds usage differently in their last chunk(s).
   * Returns { inputTokens, outputTokens, totalTokens } or null.
   */
  _extractStreamUsage(line, provider) {
    try {
      let jsonStr = line;

      // All SSE streams use "data: {...}" — strip the prefix first
      if (line.startsWith('data: ')) {
        jsonStr = line.slice(6).trim();
        if (!jsonStr || jsonStr === '[DONE]') return null;
      }

      const parsed = JSON.parse(jsonStr);

      // OpenAI / local: usage object in the final streaming chunk
      if (parsed.usage && parsed.usage.prompt_tokens !== undefined) {
        return extractUsageFromResponse(parsed);
      }

      // Anthropic SSE events carry usage in message_start and message_delta
      if (provider === 'anthropic') {
        if (parsed.type === 'message_start' && parsed.message?.usage) {
          // Stash input_tokens; they aren't repeated in message_delta
          this._anthropicStreamInputTokens = parsed.message.usage.input_tokens ?? 0;
          return null; // Not a complete record yet
        }
        if (parsed.type === 'message_delta' && parsed.usage) {
          const inputTokens  = this._anthropicStreamInputTokens ?? 0;
          const outputTokens = parsed.usage.output_tokens ?? 0;
          const totalTokens  = inputTokens + outputTokens;
          this._anthropicStreamInputTokens = 0; // reset
          return { inputTokens, outputTokens, totalTokens };
        }
      }
    } catch {
      // Not parseable — not a usage-bearing chunk
    }
    return null;
  }

  /**
   * Shared helper: extract text from a parsed JSON chunk.
   * Checks all common AI response formats in priority order.
   */
  static extractContentFromParsed(parsed) {
    if (!parsed || parsed.finish_reason === 'stop') return '';
    return (
      parsed.message?.content                              // Ollama format
      || parsed.choices?.[0]?.delta?.content              // OpenAI streaming delta
      || parsed.choices?.[0]?.message?.content            // OpenAI non-streaming
      || parsed.choices?.[0]?.text                        // Legacy completions API
      || parsed.response                                  // Simple response format
      || parsed.content                                   // Direct content field
      || parsed.candidates?.[0]?.content?.parts?.[0]?.text // Gemini format
      || ''
    );
  }

  processLocalChunk(line) {
    // SSE format: "data: {...}"
    if (line.startsWith('data: ')) {
      const data = line.slice(6).trim();
      if (data === '[DONE]') return '';
      try {
        return StreamingHandler.extractContentFromParsed(JSON.parse(data));
      } catch {
        // Fall back to raw text for non-JSON SSE payloads (some local servers)
        if (data.length > 0 && !data.startsWith('{') && !data.startsWith('[')
            && data !== 'null' && data !== 'undefined') {
          return data;
        }
        return '';
      }
    }

    // Plain-text line (some local servers skip the SSE envelope entirely)
    if (!line.startsWith('{') && !line.startsWith('[') && line.length > 0
        && line !== 'null' && line !== 'undefined') {
      return line;
    }

    // Raw JSON without SSE prefix
    try {
      return StreamingHandler.extractContentFromParsed(JSON.parse(line));
    } catch {
      return '';
    }
  }

  processOpenAIChunk(line) {
    if (!line.startsWith('data: ')) return '';
    const data = line.slice(6).trim();
    if (data === '[DONE]') return '';
    try {
      return JSON.parse(data).choices?.[0]?.delta?.content || '';
    } catch {
      return '';
    }
  }

  processAnthropicChunk(line) {
    try {
      const parsed = JSON.parse(line);
      if (parsed.type === 'content_block_delta' && parsed.delta?.text) {
        return parsed.delta.text;
      }
    } catch {
      const match = line.match(/"text":"([^"]+)"/);
      return match ? match[1] : '';
    }
    return '';
  }

  processGeminiChunk(line) {
    try {
      return JSON.parse(line).candidates?.[0]?.content?.parts?.[0]?.text || '';
    } catch {
      return '';
    }
  }

  processGenericChunk(line) {
    try {
      return StreamingHandler.extractContentFromParsed(JSON.parse(line));
    } catch {
      // Return raw line if it looks like plain text, not a JSON fragment
      return (line.length > 0 && !line.startsWith('{')) ? line : '';
    }
  }
}

// ==================== MARKDOWN TEMPLATE ENGINE ====================

/**
 * Renders a user-defined template string into a final Markdown export.
 *
 * Supported tags (case-insensitive, enclosed in {{ }}):
 *
 *  {{title}}          — session name
 *  {{system_prompt}}  — system prompt block (only rendered when tag is present AND prompt exists)
 *  {{messages}}       — full message loop: role heading, attachments, content, separators
 *  {{ai_response}}    — all assistant messages (content only, joined with \n\n)
 *  {{us_question}}    — all user messages (content only, joined with \n\n)
 *  {{s-loop}} … {{e-loop}} — repeat inner template once per message pair;
 *                             inner tags {{ai_response}} / {{us_question}} resolve to
 *                             that pair's content; surrounding literal text gets a
 *                             "(N)" counter appended to the last word on each line.
 *
 * When no template (or an empty string) is supplied, a built-in default that
 * exactly reproduces the original exportToMarkdown output is used.
 */
class MarkdownTemplateEngine {

  // ── Default template ────────────────────────────────────────────────────

  static get DEFAULT_TEMPLATE() {
    return [
      '---',
      'Topic: {{title}}',
      'tags:',
      '  - Type/External-Content/Ai-Conversations',
      'icon: lucide-bot-message-square',
      '---',
      '',
      '# {{title}}',
      '',
      '{{system_prompt}}',
      '{{messages}}'
    ].join('\n');
  }

  // ── Public entry point ───────────────────────────────────────────────────

  /**
   * @param {string} template  - User template; empty/null → use DEFAULT_TEMPLATE
   * @param {Object} session   - Session object
   * @returns {string}
   */
  static render(template, session) {
    const tpl = (template && template.trim()) ? template : MarkdownTemplateEngine.DEFAULT_TEMPLATE;
    return MarkdownTemplateEngine._process(tpl, session);
  }

  // ── Core processor ───────────────────────────────────────────────────────

  static _process(tpl, session) {
    // 1. Handle {{S-loop}} … {{E-loop}} blocks first
    tpl = MarkdownTemplateEngine._renderLoops(tpl, session);

    // 2. Simple scalar replacements
    tpl = MarkdownTemplateEngine._replaceTag(tpl, 'title', session.name || '');

    // 3. {{system_prompt}} — only emits content when BOTH tag exists AND prompt is non-empty
    tpl = MarkdownTemplateEngine._replaceSystemPrompt(tpl, session);

    // 4. {{messages}} — full message loop
    tpl = MarkdownTemplateEngine._replaceTag(
      tpl, 'messages',
      MarkdownTemplateEngine._renderMessages(session.messages)
    );

    // 5. {{ai_response}} / {{us_question}} outside loops — all-at-once
    tpl = MarkdownTemplateEngine._replaceTag(
      tpl, 'ai_response',
      session.messages
        .filter(m => m.role === 'assistant')
        .map(m => m.content)
        .join('\n\n')
    );
    tpl = MarkdownTemplateEngine._replaceTag(
      tpl, 'us_question',
      session.messages
        .filter(m => m.role === 'user')
        .map(m => m.content)
        .join('\n\n')
    );

    return tpl;
  }

  // ── Tag replacement helper (case-insensitive) ────────────────────────────

  /** Replace ALL occurrences of {{tagName}} (case-insensitive) with value. */
  static _replaceTag(tpl, tagName, value) {
    const re = new RegExp(`\\{\\{\\s*${MarkdownTemplateEngine._escapeRe(tagName)}\\s*\\}\\}`, 'gi');
    return tpl.replace(re, value);
  }

  static _escapeRe(s) {
    return s.replace(/[-[\]/{}()*+?.\\^$|]/g, '\\$&');
  }

  // ── {{system_prompt}} ────────────────────────────────────────────────────

  static _replaceSystemPrompt(tpl, session) {
    const re = /\{\{\s*system_prompt\s*\}\}/gi;
    if (!re.test(tpl)) return tpl; // tag absent → never show prompt
    const block = session.systemPrompt
      ? `## System Prompt\n\`\`\`\n${session.systemPrompt}\n\`\`\`\n\n`
      : '';
    return tpl.replace(/\{\{\s*system_prompt\s*\}\}/gi, block);
  }

  // ── {{messages}} ─────────────────────────────────────────────────────────

  static _renderMessages(messages) {
    let out = '';
    messages.forEach((msg, index) => {
      const role = msg.role === 'user' ? 'User' : 'Assistant';
      const pairNumber = Math.floor(index / 2) + 1;

      out += `### ${role} (${pairNumber})\n\n`;

      if (msg.attachments && msg.attachments.length > 0) {
        out += `#### Attachments:\n`;
        msg.attachments.forEach(a => { out += `- [[${a.name}]]\n`; });
        out += '\n';
      }

      out += `${msg.content}\n\n`;

      if (index < messages.length - 1) {
        out += `---\n\n`;
      }
    });
    return out;
  }

  // ── {{S-loop}} … {{E-loop}} ───────────────────────────────────────────────

  static _renderLoops(tpl, session) {
    const loopRe = /\{\{\s*s-loop\s*\}\}([\s\S]*?)\{\{\s*e-loop\s*\}\}/gi;
    return tpl.replace(loopRe, (_match, inner) => {
      return MarkdownTemplateEngine._expandLoop(inner, session);
    });
  }

  /**
   * Pair up messages: index 0+1, 2+3, …
   * For each pair emit the inner template with per-pair substitutions and
   * a "(N)" counter appended inline to lines that contain literal text
   * before a tag on the same line.
   */
  static _expandLoop(inner, session) {
    const messages = session.messages;
    const pairs = [];

    // Build pairs: { user: msg|null, assistant: msg|null, pairIndex: N }
    for (let i = 0; i < messages.length; i += 2) {
      pairs.push({
        user:      messages[i]   || null,
        assistant: messages[i + 1] || null,
        pairIndex: Math.floor(i / 2) + 1
      });
    }

    return pairs.map(pair => {
      return MarkdownTemplateEngine._renderLoopIteration(inner, pair);
    }).join('');
  }

  static _renderLoopIteration(inner, pair) {
    const n = pair.pairIndex;

    // Replace {{us_question}} and {{ai_response}} with per-pair content
    let out = inner;
    out = MarkdownTemplateEngine._replaceTag(out, 'us_question', pair.user?.content ?? '');
    out = MarkdownTemplateEngine._replaceTag(out, 'ai_response', pair.assistant?.content ?? '');

    // Append "(N)" counter to lines that have literal text preceding a replaced tag,
    // OR to lines that contain only literal text (non-empty, non-whitespace-only lines
    // that are NOT themselves tag lines after substitution).
    //
    // Strategy: walk line by line; for each line that is non-empty after trimming
    // and does NOT start with the pair content itself, append " (N)".
    // More precisely: append counter to lines that contain visible text the user wrote
    // in the template (not lines that are purely the AI/user content).
    out = MarkdownTemplateEngine._appendCounters(out, n, pair);

    return out;
  }

  /**
   * Appends " (N)" to "label lines" — lines in the template that the user wrote
   * as literal labels/prefixes, distinguishing them from the substituted content lines.
   *
   * A label line is any non-empty line that:
   *   - Is NOT part of the pair's substituted content (user or assistant message body)
   *   - Is NOT purely whitespace
   */
  static _appendCounters(rendered, n, pair) {
    // Collect the actual content lines to exclude them from counter injection
    const userLines   = new Set((pair.user?.content  ?? '').split('\n'));
    const assistLines = new Set((pair.assistant?.content ?? '').split('\n'));

    return rendered.split('\n').map(line => {
      const trimmed = line.trim();
      if (!trimmed) return line;                         // blank → keep as-is
      if (userLines.has(line) || assistLines.has(line)) return line; // content line
      // Label line — append counter
      return `${line} (${n})`;
    }).join('\n');
  }
}

// ==================== SESSION MANAGER ====================

class SessionManager {
  /**
   * @param {Object[]} saved   - Persisted session array (may include stale temporaries)
   * @param {string|null} activeId - Previously active session ID to restore
   */
  constructor(saved = [], activeId = null) {
    this.sessions = (saved && saved.length) ? saved.filter(s => !s.isTemporary) : [];

    // Restore the saved active session; fall back to the first available one
    const restoredValid = activeId && this.sessions.find(s => s.id === activeId);
    this.activeId = restoredValid ? activeId : (this.sessions[0]?.id || null);
  }
  
  /**
   * Create a new regular session
   * @param {string} name - Session name (optional)
   * @param {string} sys - System prompt (optional)
   * @param {boolean} needsNaming - Whether this session needs auto-naming (default: false)
   * @returns {Object} The created session
   */
  create(name = null, sys = "", needsNaming = false) {
    this.deleteTemporary(); // Delete any existing temporary chat
    
    const id = Date.now().toString();
    const sessionName = name || this.generateDefaultName();
    
    const session = { 
      id, 
      name: sessionName, 
      systemPrompt: sys || "", 
      messages: [],
      isTemporary: false,
      needsNaming: needsNaming || (!name && this.sessions.length > 0), // Mark for auto-naming if no name provided and not the first session
      createdAt: Date.now(),
      lastModified: Date.now()
    };
    
    this.sessions.push(session);
    this.activeId = id;
    return session;
  }
  
  /**
   * Create a new temporary session
   * @param {string} name - Session name (optional)
   * @returns {Object} The created temporary session
   */
  createTemporary(name = null) {
    this.deleteTemporary(); // Delete any existing temporary chat
    
    const id = Date.now().toString() + '_temp';
    const session = {
      id,
      name: name || 'Temporary Chat',
      systemPrompt: "",
      messages: [],
      isTemporary: true,
      needsNaming: false, // Temporary chats don't need naming
      createdAt: Date.now(),
      lastModified: Date.now()
    };
    
    this.sessions.push(session);
    this.activeId = id;
    return session;
  }
  
  /**
   * Generate a default name for a new session
   * @returns {string} Default session name
   */
  generateDefaultName() {
    if (this.sessions.length === 0) {
      return 'Default Conversation';
    }
    
    // Count non-temporary sessions for numbering
    const regularSessions = this.sessions.filter(s => !s.isTemporary);
    return `Conversation ${regularSessions.length + 1}`;
  }
  
  /**
   * Delete any temporary session
   */
  deleteTemporary() {
    const tempSession = this.sessions.find(s => s.isTemporary);
    if (tempSession) {
      this.sessions = this.sessions.filter(s => !s.isTemporary);
      if (this.activeId === tempSession.id) {
        this.activeId = this.sessions.length ? this.sessions[0].id : null;
      }
    }
  }
  
  /**
   * Delete a session by ID
   * @param {string} id - Session ID to delete
   */
  delete(id) {
    this.sessions = this.sessions.filter(s => s.id !== id);
    if (this.activeId === id) {
      this.activeId = (this.sessions[0] && this.sessions[0].id) || null;
    }
  }
  
  /**
   * Switch to a different session
   * @param {string} id - Session ID to switch to
   */
  switchTo(id) {
    const targetSession = this.sessions.find(s => s.id === id);
    if (targetSession) {
      // If current active session is temporary and different from target, delete the temporary
      const currentActive = this.getActive();
      if (currentActive && currentActive.isTemporary && currentActive.id !== id) {
        this.deleteTemporary(); // This will delete only the temporary, target still exists
      }
      this.activeId = id;
      
      // Reset the needsNaming flag when switching to a session
      // This prevents auto-naming from triggering on switch
      if (targetSession.needsNaming) {
        // Only keep needsNaming if the session is truly empty
        targetSession.needsNaming = targetSession.messages.length === 0;
      }
    }
  }
  
  /**
   * Get the active session
   * @returns {Object|null} Active session or null
   */
  getActive() { 
    return this.sessions.find(s => s.id === this.activeId) || null; 
  }
  
  /**
   * Get a session by ID
   * @param {string} id - Session ID
   * @returns {Object|null} Session or null
   */
  getSession(id) {
    return this.sessions.find(s => s.id === id) || null;
  }
  
  /**
   * Update session name
   * @param {string} id - Session ID
   * @param {string} newName - New session name
   * @returns {boolean} Success status
   */
  updateName(id, newName) {
    const session = this.sessions.find(s => s.id === id);
    if (session && newName && newName.trim()) {
      session.name = newName.trim();
      session.lastModified = Date.now();
      session.needsNaming = false; // Clear naming flag when manually named
      return true;
    }
    return false;
  }
  
  /**
   * Mark a session as named (clear needsNaming flag)
   * @param {string} id - Session ID
   */
  markAsNamed(id) {
    const session = this.sessions.find(s => s.id === id);
    if (session) {
      session.needsNaming = false;
      session.lastModified = Date.now();
    }
  }
  
  /**
   * Check if a session needs auto-naming
   * @param {string} id - Session ID
   * @returns {boolean} Whether session needs naming
   */
  needsNaming(id) {
    const session = this.sessions.find(s => s.id === id);
    if (!session) return false;
    
    // Session needs naming if:
    // 1. It has the needsNaming flag set to true
    // 2. It has a default/generic name
    // 3. It has at least one message (so we have content to name from)
    // 4. It's not temporary
    return (
      !session.isTemporary &&
      session.messages.length > 0 &&
      (session.needsNaming || this.hasDefaultName(session.name))
    );
  }
  
  /**
   * Check if a name is a default/generic name
   * @param {string} name - Session name to check
   * @returns {boolean} Whether it's a default name
   */
  hasDefaultName(name) {
    const defaultPatterns = [
      /^Conversation \d+$/,
      /^Session \d+$/,
      /^New Conversation$/,
      /^Default Conversation$/,
      /^Temporary Chat$/
    ];
    
    return defaultPatterns.some(pattern => pattern.test(name));
  }
  
  /**
   * Get all sessions that need auto-naming
   * @returns {Array} Sessions that need naming
   */
  getSessionsNeedingNaming() {
    return this.sessions.filter(s => 
      !s.isTemporary && 
      s.messages.length > 0 && 
      (s.needsNaming || this.hasDefaultName(s.name))
    );
  }
  
  /**
   * Add a message to the active session
   * @param {string} role - Message role ('user' or 'assistant')
   * @param {string} content - Message content
   * @param {Array} attachments - File attachments (optional)
   */
  addMessage(role, content, attachments = [], meta = {}) {
    const s = this.getActive();
    if (!s) return;
    
    s.messages.push({ 
      role, 
      content,
      attachments: attachments || [],
      timestamp: Date.now(),
      ...meta
    });
    
    s.lastModified = Date.now();
  }
  
  /**
   * Edit a previously-sent user message and drop everything that came
   * after it. The AI must only ever see the context that *preceded* the
   * edited message (plus the new content) — not the original future replies,
   * since those answered a question that no longer exists in this form.
   *
   * @param {number} index - Index of the message in session.messages
   * @param {string} newContent - The edited text
   * @param {Array}  [newAttachments] - If provided, replaces the message's
   *   attachments (e.g. after the user removed one in the edit modal).
   *   If omitted, existing attachments are left untouched.
   * @returns {boolean} true if the edit was applied
   */
  editUserMessage(index, newContent, newAttachments) {
    const s = this.getActive();
    if (!s) return false;
    if (index < 0 || index >= s.messages.length) return false;
    if (s.messages[index].role !== 'user') return false;

    s.messages[index].content = newContent;
    if (newAttachments !== undefined) {
      s.messages[index].attachments = newAttachments;
    }
    s.messages[index].timestamp = Date.now();
    // Drop every message after the edited one — the "future" context.
    s.messages.length = index + 1;
    s.lastModified = Date.now();
    return true;
  }

  /**
   * Get messages formatted for API request
   * @param {number} maxMessages - Maximum number of recent messages to include
   * @returns {Array} Formatted messages
   */
  getMessagesForRequest(maxMessages = 10) {
    const s = this.getActive();
    if (!s) return [];
    
    const out = [];
    
    // Add system prompt if exists
    if (s.systemPrompt && s.systemPrompt.trim()) {
      out.push({ 
        role: "system", 
        content: s.systemPrompt 
      });
    }
    
    // Get recent messages
    const recent = s.messages.slice(-maxMessages);
    
    // Format messages with attachments
    const formattedMessages = recent.map(msg => {
      const hasImages = msg.attachments?.some(a => a.isImage);
      const hasFiles  = msg.attachments?.some(a => !a.isImage && a.content);

      // If there are images, build a multipart content array (OpenAI/Anthropic/Gemini style)
      if (hasImages) {
        const parts = [];

        // Text portion (message + any file attachments)
        let textContent = msg.content;
        if (hasFiles) {
          msg.attachments.filter(a => !a.isImage).forEach(a => {
            textContent += `\n\n[File content: ${a.name}]\n${a.content}`;
          });
        }
        if (textContent) {
          parts.push({ type: 'text', text: textContent });
        }

        // Image portions
        msg.attachments.filter(a => a.isImage).forEach(img => {
          // dataUrl = "data:<mimeType>;base64,<data>"
          const base64 = img.dataUrl.split(',')[1] ?? '';
          parts.push({
            type: 'image_url',
            image_url: { url: img.dataUrl },   // for OpenAI / generic
            // Anthropic-style fields (buildBody filters what it needs)
            _anthropic: { type: 'image', source: { type: 'base64', media_type: img.mimeType, data: base64 } },
            // Gemini-style
            _gemini:    { inlineData: { mimeType: img.mimeType, data: base64 } }
          });
        });

        return { role: msg.role, content: parts };
      }

      // No images — plain text (original behaviour)
      let fullContent = msg.content;
      if (hasFiles) {
        msg.attachments.filter(a => !a.isImage).forEach(a => {
          fullContent += `\n\n[File content: ${a.name}]\n${a.content}`;
        });
      }
      return { role: msg.role, content: fullContent };
    });
    
    return out.concat(formattedMessages);
  }
  
  /**
   * Clear all messages in the active session
   */
  clearActiveSession() {
    const s = this.getActive();
    if (s) {
      s.messages = [];
      s.lastModified = Date.now();
    }
  }
  
  /**
   * Get session statistics
   * @param {string} id - Session ID (optional, uses active if not provided)
   * @returns {Object} Session statistics
   */
  getStats(id = null) {
    const session = id ? this.getSession(id) : this.getActive();
    if (!session) return null;
    
    const userMessages = session.messages.filter(m => m.role === 'user').length;
    const assistantMessages = session.messages.filter(m => m.role === 'assistant').length;
    const totalAttachments = session.messages.reduce((sum, m) => sum + (m.attachments?.length || 0), 0);
    
    return {
      name: session.name,
      totalMessages: session.messages.length,
      userMessages,
      assistantMessages,
      totalAttachments,
      createdAt: session.createdAt,
      lastModified: session.lastModified,
      needsNaming: this.needsNaming(session.id),
      isTemporary: session.isTemporary
    };
  }
  
  /**
   * Export a session to Markdown format, optionally using a custom template.
   * @param {Object} session  - Session to export
   * @param {string} [template] - Optional template string; falls back to plugin setting, then default.
   * @returns {string} Markdown content
   */
  exportToMarkdown(session, template) {
    const tpl = template
      ?? (this.plugin?.settings?.markdownExportTemplate || '')
      ?? '';
    return MarkdownTemplateEngine.render(tpl, session);
  }
  
  /**
   * Get all sessions with optional filtering
   * @param {Object} filters - Optional filters
   * @returns {Array} Filtered sessions
   */
  getAllSessions(filters = {}) {
    let result = [...this.sessions];
    
    if (filters.excludeTemporary) {
      result = result.filter(s => !s.isTemporary);
    }
    
    if (filters.onlyTemporary) {
      result = result.filter(s => s.isTemporary);
    }
    
    if (filters.needsNaming) {
      result = result.filter(s => this.needsNaming(s.id));
    }
    
    if (filters.search) {
      const searchLower = filters.search.toLowerCase();
      result = result.filter(s => 
        s.name.toLowerCase().includes(searchLower) ||
        s.messages.some(m => m.content.toLowerCase().includes(searchLower))
      );
    }
    
    // Sort by last modified (newest first)
    result.sort((a, b) => (b.lastModified || 0) - (a.lastModified || 0));
    
    return result;
  }
  
  /**
   * Get session count
   * @param {boolean} excludeTemporary - Whether to exclude temporary sessions
   * @returns {number} Session count
   */
  getSessionCount(excludeTemporary = true) {
    if (excludeTemporary) {
      return this.sessions.filter(s => !s.isTemporary).length;
    }
    return this.sessions.length;
  }
  
  /**
   * Duplicate a session
   * @param {string} id - Session ID to duplicate
   * @param {string} newName - Name for the duplicated session (optional)
   * @returns {Object|null} New session or null
   */
  duplicate(id, newName = null) {
    const original = this.getSession(id);
    if (!original) return null;
    
    const newId = Date.now().toString();
    const duplicate = {
      ...original,
      id: newId,
      name: newName || `${original.name} (Copy)`,
      messages: [...original.messages], // Shallow copy is fine since messages are objects
      createdAt: Date.now(),
      lastModified: Date.now(),
      isTemporary: false,
      needsNaming: false
    };
    
    this.sessions.push(duplicate);
    return duplicate;
  }
  
  /**
   * Merge two sessions
   * @param {string} targetId - Target session ID
   * @param {string} sourceId - Source session ID to merge from
   * @returns {boolean} Success status
   */
  merge(targetId, sourceId) {
    const target = this.getSession(targetId);
    const source = this.getSession(sourceId);
    
    if (!target || !source || target.isTemporary || source.isTemporary) {
      return false;
    }
    
    // Add all messages from source to target
    target.messages.push(...source.messages);
    
    // Sort by timestamp if available
    target.messages.sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
    
    target.lastModified = Date.now();
    
    // Delete the source session
    this.delete(sourceId);
    
    return true;
  }
}

// ==================== USAGE EXTRACTION UTILITY ====================

/**
 * Extracts token usage from any API response JSON, covering all three
 * supported providers:
 *
 *  Gemini   → usageMetadata.promptTokenCount / candidatesTokenCount / totalTokenCount
 *  OpenAI   → usage.prompt_tokens / completion_tokens / total_tokens
 *  Anthropic→ usage.input_tokens / output_tokens  (no total_tokens field)
 *
 * Returns { inputTokens, outputTokens, totalTokens } (all numbers).
 * Falls back to zeros when the response doesn't include usage data
 * (e.g. streaming chunks, or providers that omit it).
 */
function extractUsageFromResponse(data) {
  if (!data) return { inputTokens: 0, outputTokens: 0, totalTokens: 0 };

  // Gemini
  if (data.usageMetadata) {
    const m = data.usageMetadata;
    const inputTokens  = m.promptTokenCount     ?? 0;
    const outputTokens = m.candidatesTokenCount ?? 0;
    const totalTokens  = m.totalTokenCount      ?? (inputTokens + outputTokens);
    return { inputTokens, outputTokens, totalTokens };
  }

  // OpenAI (prompt_tokens / completion_tokens / total_tokens)
  if (data.usage && data.usage.prompt_tokens !== undefined) {
    const inputTokens  = data.usage.prompt_tokens     ?? 0;
    const outputTokens = data.usage.completion_tokens ?? 0;
    const totalTokens  = data.usage.total_tokens      ?? (inputTokens + outputTokens);
    return { inputTokens, outputTokens, totalTokens };
  }

  // Anthropic (input_tokens / output_tokens — no total_tokens)
  if (data.usage && data.usage.input_tokens !== undefined) {
    const inputTokens  = data.usage.input_tokens  ?? 0;
    const outputTokens = data.usage.output_tokens ?? 0;
    const totalTokens  = inputTokens + outputTokens;
    return { inputTokens, outputTokens, totalTokens };
  }

  return { inputTokens: 0, outputTokens: 0, totalTokens: 0 };
}

/**
 * Estimates token usage locally when the API doesn't return usage metadata.
 * Uses the same simple char/4 heuristic as estimateTokens().
 *
 * @param {Array}  messages     - The messages array sent to the API
 * @param {string} responseText - The text the API returned
 * @returns {{ inputTokens, outputTokens, totalTokens, estimated: true }}
 */
function estimateUsageLocally(messages, responseText) {
  let inputTokens = 0;
  if (Array.isArray(messages)) {
    messages.forEach(m => {
      const content = Array.isArray(m.content)
        ? m.content.map(p => p.text || '').join('')
        : (m.content || '');
      inputTokens += estimateTokens(content);
    });
  }
  const outputTokens = estimateTokens(responseText || '');
  return {
    inputTokens,
    outputTokens,
    totalTokens: inputTokens + outputTokens,
    estimated: true
  };
}

// ==================== BASE AI PROVIDER ====================

class BaseAIProvider {
  constructor(plugin, providerName) {
    this.plugin = plugin;
    this.name = providerName;
    this.networkManager = new NetworkManager(plugin);
    this.streamingHandler = new StreamingHandler();
  }

  supportsStreaming() {
    return true;
  }

  async send(payload, opts = {}) {
    const requestId = this.generateRequestId();

    // Let the caller (typically the chat UI) capture the requestId and a
    // reference to this provider's NetworkManager the moment the request
    // starts, so a Stop button can abort this exact in-flight request later
    // via `networkManager.abortRequest(requestId, true)`.
    if (opts.onRequestStart) {
      opts.onRequestStart({ requestId, networkManager: this.networkManager });
    }
    
    try {
      const url = this.buildUrl(payload);
      const headers = this.buildHeaders();
      const body = this.buildBody(payload);
      
      if (payload.stream && this.supportsStreaming()) {
        return await this.sendStreamingRequest(url, headers, body, opts, requestId, payload);
      } else {
        return await this.sendNormalRequest(url, headers, body, opts, requestId, payload);
      }
    } catch (error) {
      return this.handleError(error);
    } finally {
      if (requestId) {
        this.networkManager.abortRequest(requestId);
      }
    }
  }

  async sendStreamingRequest(url, headers, body, opts, requestId, payload = {}) {
    const response = await this.networkManager.fetchWithRetry(url, {
      method: 'POST',
      headers,
      body,
      timeout: opts.timeoutMs
    }, requestId);

    if (!response.body) {
      throw new Error('Response body is not readable');
    }

    const streamResult = await this.streamingHandler.handleStreamingResponse(
      response,
      (chunk) => {
        if (opts.onChunk) {
          opts.onChunk(chunk);
        }
      },
      this.getStreamingFormat(),
      { networkManager: this.networkManager, requestId }
    );

    // handleStreamingResponse now returns { text, usage }
    const accumulatedText = typeof streamResult === 'string' ? streamResult : streamResult.text;
    let usage = (typeof streamResult === 'object' && streamResult.usage) ? streamResult.usage : null;

    // Fallback: if the service didn't report token usage, estimate locally
    if (!usage || usage.totalTokens === 0) {
      usage = estimateUsageLocally(payload.messages, accumulatedText);
      if (usage) usage.estimated = true;
    }

    if (usage && opts.onUsage) {
      opts.onUsage(usage);
    }

    return { final: accumulatedText, usage };
  }

  async sendNormalRequest(url, headers, body, opts, requestId, payload = {}) {
    const response = await this.networkManager.fetchWithRetry(url, {
      method: 'POST',
      headers,
      body,
      timeout: opts.timeoutMs
    }, requestId);

    try {
      const data = await response.json();
      const result = this.parseResponse(data);

      let usage = result.usage;

      // Fallback: if the service didn't report token usage, estimate locally
      if (!usage || usage.totalTokens === 0) {
        usage = estimateUsageLocally(payload.messages, result.final);
        if (usage) usage.estimated = true;
      }

      if (usage && opts.onUsage) {
        opts.onUsage(usage);
      }
      return { ...result, usage };
    } catch (error) {
      // The user may have hit Stop after headers arrived but while the
      // (non-streaming) body was still being read — same window as the
      // mid-stream case, just for a single JSON payload instead of chunks.
      const entry = requestId ? this.networkManager.abortControllers.get(requestId) : null;
      if (error.name === 'AbortError' && entry?.userAborted) {
        return { final: '', aborted: true };
      }
      throw error;
    }
  }

  generateRequestId() {
    return `${this.name}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  handleError(error) {
    // A user-initiated Stop should never surface as an error — the caller
    // (chat UI) treats an empty/partial `final` as a normal, graceful stop.
    if (error instanceof UserAbortError) {
      return { final: '', aborted: true };
    }

    console.error(`${this.name} error:`, error);
    
    if (error instanceof AuthenticationError) {
      throw new Error(`🔐 ${this.name} authentication failed. Please check your API key in settings.`);
    }
    
    if (error instanceof RateLimitError) {
      throw new Error(`⏳ ${this.name} rate limit exceeded. Please wait ${error.retryAfter} seconds and try again.`);
    }
    
    if (error instanceof NetworkError) {
      if (error.statusCode === 0) {
        throw new Error(`🌐 Cannot connect to ${this.name}. Please check if the service is running and accessible.`);
      }
      if (error.statusCode === 404) {
        throw new Error(`🔍 ${this.name} endpoint not found. Please check your URL configuration.`);
      }
      throw new Error(`🌐 ${this.name} network error (${error.statusCode}): ${error.message}`);
    }
    
    if (error instanceof TimeoutError) {
      throw new Error(`⏱️ ${this.name} request timed out. The service might be slow or unresponsive.`);
    }
    
    if (error instanceof StreamingError) {
      throw new Error(`📡 Streaming error with ${this.name}: ${error.message}`);
    }
    
    throw new Error(`${this.name} error: ${error.message}`);
  }

  buildUrl(payload) { throw new Error('Not implemented'); }
  buildHeaders() { throw new Error('Not implemented'); }
  buildBody(payload) { throw new Error('Not implemented'); }
  parseResponse(data) { throw new Error('Not implemented'); }
  getStreamingFormat() { return 'generic'; }
}

// ==================== LOCAL AI PROVIDER ====================

class LocalAIProvider extends BaseAIProvider {
  constructor(plugin) {
    super(plugin, 'LocalAI');
  }

  buildUrl(payload) {
    const base = this.plugin.settings.baseUrl.replace(/\/$/, "");
    const endpoint = this.plugin.settings.localEndpoint || '/v1/chat/completions';
    return base + endpoint;
  }

  buildHeaders() {
    return {
      'Content-Type': 'application/json',
      'Accept': 'application/json, text/plain, */*'
    };
  }

  buildBody(payload) {
    const body = {
      // payload.model lets callers override the model per-request (e.g. for auto-naming)
      model: payload.model || this.plugin.settings.localModel,
      messages: payload.messages,
      temperature: payload.temperature || this.plugin.settings.temperature,
      max_tokens: payload.max_tokens || this.plugin.settings.max_tokens,
      stream: payload.stream || false
    };

    return JSON.stringify(body);
  }

  parseResponse(data) {
    const usage = extractUsageFromResponse(data);
    if (data.choices && data.choices[0]) {
      if (data.choices[0].message) {
        return { final: data.choices[0].message.content, usage };
      }
      if (data.choices[0].text) {
        return { final: data.choices[0].text, usage };
      }
    }
    
    if (data.message) {
      return { final: data.message.content, usage };
    }
    
    if (data.response) {
      return { final: data.response, usage };
    }
    
    return { final: JSON.stringify(data), usage };
  }

  getStreamingFormat() {
    return 'local';
  }

  async checkHealth() {
    try {
      const base = this.plugin.settings.baseUrl.replace(/\/$/, "");
      
      const endpoints = ['/health', '/api/health', '/v1/health', '/'];
      
      for (const endpoint of endpoints) {
        try {
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 5000);
          
          const response = await fetch(base + endpoint, {
            method: 'GET',
            headers: { 'Content-Type': 'application/json' },
            signal: controller.signal
          });
          
          clearTimeout(timeoutId);
          
          if (response.ok) {
            try {
              const data = await response.json();
              if (data && (data.status === 'ok' || data.status === 'healthy' || data.ready === true)) {
                return { ok: true, message: '✓ Service is healthy' };
              }
            } catch {
              return { ok: true, message: '✓ Service is reachable' };
            }
          }
        } catch {
          continue;
        }
      }
      
      try {
        const testResponse = await this.send({
          messages: [{ role: 'user', content: 'test' }],
          max_tokens: 5,
          stream: false
        }, { timeoutMs: 5000 });
        
        if (testResponse && testResponse.final) {
          return { ok: true, message: '✓ Service is responding' };
        }
      } catch {
        // Ignore
      }
      
      return { ok: false, message: '⨉ Local AI service is not reachable' };
    } catch (error) {
      return { ok: false, message: `⨉ ${error.message}` };
    }
  }
}

// ==================== OPENAI PROVIDER ====================

class OpenAIProvider extends BaseAIProvider {
  constructor(plugin) {
    super(plugin, 'OpenAI');
  }

  buildUrl(payload) {
    return this.plugin.settings.openaiEndpoint || "https://api.openai.com/v1/chat/completions";
  }

  buildHeaders() {
    return {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${this.plugin.settings.openaiApiKey}`
    };
  }

  buildBody(payload) {
    // Normalize messages: convert our internal multipart format to OpenAI vision format
    const messages = payload.messages.map(msg => {
      if (!Array.isArray(msg.content)) return msg;
      // Already an array — map internal _anthropic/_gemini meta-fields out
      const content = msg.content.map(part => {
        if (part.type === 'text')      return { type: 'text', text: part.text };
        if (part.type === 'image_url') return { type: 'image_url', image_url: part.image_url };
        return part;
      });
      return { role: msg.role, content };
    });

    const body = {
      model: payload.model || this.plugin.settings.openaiModel || "gpt-3.5-turbo",
      messages,
      temperature: payload.temperature || this.plugin.settings.temperature,
      max_completion_tokens: payload.max_tokens || this.plugin.settings.max_tokens
    };

    if (payload.stream) {
      body.stream = true;
    }

    return JSON.stringify(body);
  }

  parseResponse(data) {
    const usage = extractUsageFromResponse(data);
    if (data.choices && data.choices[0] && data.choices[0].message) {
      return { final: data.choices[0].message.content, usage };
    }
    return { final: JSON.stringify(data), usage };
  }

  getStreamingFormat() {
    return 'openai';
  }

  async checkHealth() {
    try {
      const response = await fetch("https://api.openai.com/v1/models", {
        headers: { 'Authorization': `Bearer ${this.plugin.settings.openaiApiKey}` },
        signal: AbortSignal.timeout(10000)
      });
      
      if (response.status === 401) {
        return { ok: false, message: '⨉ Invalid API key' };
      }
      
      return { ok: response.ok, message: response.ok ? '✓ Connected to OpenAI' : `⨉ Error ${response.status}` };
    } catch (e) {
      return { ok: false, message: `⨉ ${e.message}` };
    }
  }
}

// ==================== GEMINI PROVIDER (NON-STREAMING) ====================

class GeminiProvider extends BaseAIProvider {
  constructor(plugin) {
    super(plugin, 'Gemini');
    this.lastRequestTime = 0;
    this.minDelay = 2000;
  }

  supportsStreaming() {
    return false;
  }

  async send(payload, opts) {
    await this.throttleRequests();
    return super.send(payload, opts);
  }

  buildUrl(payload) {
    // payload.model lets callers override the model per-request (e.g. for auto-naming)
    const modelName = payload.model || this.plugin.settings.geminiModel || "gemini-1.5-flash";
    return `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${this.plugin.settings.geminiApiKey}`;
  }

  buildHeaders() {
    return {
      'Content-Type': 'application/json'
    };
  }

  buildBody(payload) {
    const contents = this.convertToGeminiFormat(payload.messages);
    
    return JSON.stringify({
      contents: contents,
      generationConfig: {
        temperature: payload.temperature || this.plugin.settings.temperature,
        maxOutputTokens: payload.max_tokens || this.plugin.settings.max_tokens,
        topP: 0.8,
        topK: 40
      }
    });
  }

  parseResponse(data) {
    const usage = extractUsageFromResponse(data);
    if (data.candidates && data.candidates[0] && data.candidates[0].content) {
      return { final: data.candidates[0].content.parts[0].text, usage };
    }
    return { final: JSON.stringify(data), usage };
  }

  async throttleRequests() {
    const now = Date.now();
    const timeSinceLastRequest = now - this.lastRequestTime;
    
    if (timeSinceLastRequest < this.minDelay) {
      const delay = this.minDelay - timeSinceLastRequest;
      await new Promise(resolve => setTimeout(resolve, delay));
    }
    
    this.lastRequestTime = Date.now();
  }

  convertToGeminiFormat(messages) {
    const contents = [];
    let systemPrompt = '';
    
    for (const msg of messages) {
      if (msg.role === 'system') {
        systemPrompt = Array.isArray(msg.content)
          ? msg.content.map(p => p.text || '').join('')
          : msg.content;
      } else if (msg.role === 'user') {
        if (Array.isArray(msg.content)) {
          // Multipart (may include images)
          const parts = [];
          msg.content.forEach(part => {
            if (part.type === 'text') {
              const text = systemPrompt ? `[System: ${systemPrompt}]\n\n${part.text}` : part.text;
              parts.push({ text });
              systemPrompt = '';
            } else if (part.type === 'image_url' && part._gemini) {
              parts.push(part._gemini); // { inlineData: { mimeType, data } }
            }
          });
          if (systemPrompt) {
            // System prompt but no text part — prepend it
            parts.unshift({ text: `[System: ${systemPrompt}]` });
            systemPrompt = '';
          }
          contents.push({ role: 'user', parts });
        } else {
          const content = systemPrompt ? `[System: ${systemPrompt}]\n\n${msg.content}` : msg.content;
          contents.push({ role: 'user', parts: [{ text: content }] });
          systemPrompt = '';
        }
      } else if (msg.role === 'assistant') {
        const text = Array.isArray(msg.content)
          ? msg.content.map(p => p.text || '').join('')
          : msg.content;
        contents.push({ role: 'model', parts: [{ text }] });
      }
    }
    
    return contents;
  }

  async checkHealth() {
    try {
      const modelName = this.plugin.settings.geminiModel || "gemini-1.5-flash";
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}?key=${this.plugin.settings.geminiApiKey}`;
      
      const response = await fetch(url, {
        method: 'GET',
        signal: AbortSignal.timeout(10000)
      });
      
      if (response.status === 403 || response.status === 401) {
        return { ok: false, message: '⨉ Invalid API key' };
      }
      
      if (response.status === 429) {
        return { ok: false, message: '⏳ Rate limit exceeded. Please wait.' };
      }
      
      return { ok: response.ok, message: response.ok ? '✓ Connected to Gemini' : `⨉ Error ${response.status}` };
    } catch (e) {
      return { ok: false, message: `⨉ ${e.message}` };
    }
  }
}

// ==================== ANTHROPIC PROVIDER ====================

class AnthropicProvider extends BaseAIProvider {
  constructor(plugin) {
    super(plugin, 'Anthropic');
  }

  buildUrl(payload) {
    return this.plugin.settings.anthropicEndpoint || "https://api.anthropic.com/v1/messages";
  }

  buildHeaders() {
    return {
      'Content-Type': 'application/json',
      'x-api-key': this.plugin.settings.anthropicApiKey,
      'anthropic-version': '2023-06-01'
    };
  }

  buildBody(payload) {
    // Convert multipart messages to Anthropic vision format
    const normalizeContent = (msg) => {
      if (!Array.isArray(msg.content)) return msg.content;
      return msg.content.map(part => {
        if (part.type === 'text')      return { type: 'text', text: part.text };
        if (part.type === 'image_url') return part._anthropic; // pre-built Anthropic image block
        return part;
      });
    };

    const body = {
      model: payload.model || this.plugin.settings.anthropicModel || "claude-3-haiku-20240307",
      messages: payload.messages
        .filter(m => m.role !== 'system')
        .map(m => ({ role: m.role, content: normalizeContent(m) })),
      temperature: payload.temperature || this.plugin.settings.temperature,
      max_tokens: payload.max_tokens || this.plugin.settings.max_tokens
    };

    const systemMessage = payload.messages.find(m => m.role === 'system');
    if (systemMessage) {
      body.system = Array.isArray(systemMessage.content)
        ? systemMessage.content.map(p => p.text || '').join('')
        : systemMessage.content;
    }

    if (payload.stream) {
      body.stream = true;
    }

    return JSON.stringify(body);
  }

  parseResponse(data) {
    const usage = extractUsageFromResponse(data);
    if (data.content && data.content[0] && data.content[0].text) {
      return { final: data.content[0].text, usage };
    }
    return { final: JSON.stringify(data), usage };
  }

  getStreamingFormat() {
    return 'anthropic';
  }

  async checkHealth() {
    try {
      const response = await fetch("https://api.anthropic.com/v1/models", {
        method: 'GET',
        headers: { 'x-api-key': this.plugin.settings.anthropicApiKey },
        signal: AbortSignal.timeout(10000)
      });
      
      if (response.status === 401) {
        return { ok: false, message: '⨉ Invalid API key' };
      }
      
      return { ok: response.ok, message: response.ok ? '✓ Connected to Anthropic' : `⨉ Error ${response.status}` };
    } catch (e) {
      return { ok: false, message: `⨉ ${e.message}` };
    }
  }
}

// ==================== CUSTOM PROVIDER ====================

class CustomProvider extends BaseAIProvider {
  constructor(plugin) {
    super(plugin, 'Custom API');
  }

  buildUrl(payload) {
    return this.plugin.settings.customEndpoint;
  }

  buildHeaders() {
    let headers = { 'Content-Type': 'application/json' };
    
    try {
      const customHeaders = JSON.parse(this.plugin.settings.customHeaders || '{}');
      headers = { ...headers, ...customHeaders };
    } catch (e) {
      if (this.plugin.settings.customApiKey) {
        headers['Authorization'] = `Bearer ${this.plugin.settings.customApiKey}`;
      }
    }
    
    return headers;
  }

  buildBody(payload) {
    let bodyData = {
      model: payload.model || this.plugin.settings.customModel,
      messages: payload.messages,
      temperature: payload.temperature || this.plugin.settings.temperature || 0.7,
      max_tokens: payload.max_tokens || this.plugin.settings.max_tokens || 2048
    };

    try {
      if (this.plugin.settings.customBodyTemplate && this.plugin.settings.customBodyTemplate.includes('{{')) {
        let bodyStr = this.plugin.settings.customBodyTemplate
          .replace('{{model}}', JSON.stringify(this.plugin.settings.customModel))
          .replace('{{messages}}', JSON.stringify(payload.messages))
          .replace('{{temperature}}', (payload.temperature || this.plugin.settings.temperature || 0.7).toString())
          .replace('{{max_tokens}}', (payload.max_tokens || this.plugin.settings.max_tokens || 2048).toString());
        bodyData = JSON.parse(bodyStr);
      }
    } catch (e) {
      console.log("Using default body template");
    }

    return JSON.stringify(bodyData);
  }

  parseResponse(data) {
    const usage = extractUsageFromResponse(data);
    if (data.choices && data.choices[0] && data.choices[0].message) {
      return { final: data.choices[0].message.content, usage };
    } else if (data.choices && data.choices[0] && data.choices[0].text) {
      return { final: data.choices[0].text, usage };
    } else if (data.candidates && data.candidates[0] && data.candidates[0].content) {
      return { final: data.candidates[0].content.parts[0].text, usage };
    } else if (data.message && data.message.content) {
      return { final: data.message.content, usage };
    } else if (data.result) {
      return { final: data.result, usage };
    } else if (data.content) {
      return { final: data.content, usage };
    } else {
      return { final: JSON.stringify(data), usage };
    }
  }

  getStreamingFormat() {
    return 'generic';
  }

  async checkHealth() {
    try {
      const testResponse = await this.send({
        messages: [{ role: "user", content: "Say 'OK' in one word" }],
        temperature: 0.7,
        max_tokens: 10
      }, { timeoutMs: 15000 });
      
      return { 
        ok: true, 
        message: `✓ Connection successful. Response: "${testResponse.final.substring(0, 50)}..."` 
      };
    } catch (error) {
      return { 
        ok: false, 
        message: `⨉ ${error.message}` 
      };
    }
  }
}

// ==================== API MANAGER ====================

class APIManager {
  constructor(plugin) {
    this.plugin = plugin;
    this.providers = {
      openai: new OpenAIProvider(plugin),
      gemini: new GeminiProvider(plugin),
      anthropic: new AnthropicProvider(plugin),
      custom: new CustomProvider(plugin),
      local: new LocalAIProvider(plugin)
    };
  }
  
  async sendMessage(payload, opts = {}) {
  const mode = this.plugin.settings.currentMode;
  const apiType = mode === 'cloud' ? this.plugin.settings.cloudApiType : 'local';
  
  const provider = this.providers[apiType];
  if (!provider) {
    throw new Error(`Unknown API provider: ${apiType}`);
  }
  
  // Ensure stream is set to true in the payload if we want streaming
  if (opts.onChunk) {
    payload.stream = true;
  }

  // Inject onUsage handler to accumulate accurate token counts from the API response.
  // Counts are stored on the active SESSION so that switching or deleting a
  // conversation automatically reflects the correct totals in the counter.
  const originalOnUsage = opts.onUsage;
  opts.onUsage = (usage) => {
    if (usage && usage.totalTokens > 0) {
      const session = this.plugin._sessionManager.getActive();
      if (session) {
        if (!session.tokensSpent) session.tokensSpent = 0;
        session.tokensSpent += usage.totalTokens;
        session.lastRequestTokens = usage;
      }
      // Refresh token counter in all open chat views
      const allChatLeaves = [
        ...this.plugin.app.workspace.getLeavesOfType(VIEW_TYPE),
        ...this.plugin.app.workspace.getLeavesOfType(VIEW_TYPE_CHAT_PAGE)
      ];
      allChatLeaves.forEach(leaf => {
        if (leaf.view && typeof leaf.view._updateTokenCounter === 'function') {
          leaf.view._updateTokenCounter();
        }
      });
    }
    if (originalOnUsage) originalOnUsage(usage);
  };
  
  return await provider.send(payload, opts);
}
  
  /**
   * Send a message through a specific provider, bypassing the currently active one.
   * Used by generateConversationName to honour the user's namingProvider setting.
   * @param {string} providerKey  - One of: local | openai | gemini | anthropic | custom
   * @param {Object} payload      - Same shape as sendMessage payload
   * @param {Object} opts         - Same opts as sendMessage
   */
  async sendWithProvider(providerKey, payload, opts = {}) {
    const provider = this.providers[providerKey];
    if (!provider) throw new Error(`Unknown provider key: ${providerKey}`);
    if (opts.onChunk) payload.stream = true;
    return await provider.send(payload, opts);
  }

  async checkHealth() {
    const mode = this.plugin.settings.currentMode;
    const apiType = mode === 'cloud' ? this.plugin.settings.cloudApiType : 'local';
    
    const provider = this.providers[apiType];
    return provider ? await provider.checkHealth() : { ok: false, message: 'No provider selected' };
  }

  getCurrentProviderName() {
    const mode = this.plugin.settings.currentMode;
    if (mode === 'local') return 'Local AI';
    
    const names = {
      openai: 'OpenAI',
      gemini: 'Gemini',
      anthropic: 'Claude',
      custom: 'Custom API'
    };
    return names[this.plugin.settings.cloudApiType] || 'Cloud AI';
  }

  getCurrentProviderIcon() {
    if (this.plugin.settings.currentMode === 'local') return 'monitor-speaker';
    return 'server';
  }
}

// ==================== PROMPT MODAL ====================

// ==================== PROMPT MODAL ====================

/**
 * A styled replacement for the browser's native prompt() dialog.
 * Usage (async-callback pattern, works from non-async contexts):
 *   new PromptModal(app, { title, message, placeholder, initial }, (value) => { ... }).open();
 * `value` is null if the user cancelled, otherwise the trimmed string (may be empty).
 */
class PromptModal extends Modal {
  constructor(app, { title = 'Prompt', message = '', placeholder = '', initial = '' } = {}, onSubmit) {
    super(app);
    this._title       = title;
    this._message     = message;
    this._placeholder = placeholder;
    this._initial     = initial;
    this.onSubmit     = onSubmit;
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.style.padding         = '24px';
    contentEl.style.background      = 'var(--background-secondary)';
    contentEl.style.borderRadius    = '4px';

    // Title
    const titleEl = contentEl.createEl('h3', { text: this._title });
    titleEl.style.margin     = '0 0 12px';
    titleEl.style.fontSize   = '16px';
    titleEl.style.fontWeight = '600';
    titleEl.style.color      = 'var(--text-normal)';

    // Optional descriptive message
    if (this._message) {
      const msgEl = contentEl.createEl('p', { text: this._message });
      msgEl.style.margin    = '0 0 12px';
      msgEl.style.fontSize  = '13px';
      msgEl.style.color     = 'var(--text-muted)';
    }

    // Input field
    const input = contentEl.createEl('input', { type: 'text' });
    input.value            = this._initial;
    input.placeholder      = this._placeholder;
    input.style.width      = '100%';
    input.style.padding    = '8px 10px';
    input.style.fontSize   = '14px';
    input.style.border     = '1px solid var(--background-modifier-border)';
    input.style.borderRadius = '4px';
    input.style.background = 'var(--background-primary)';
    input.style.color      = 'var(--text-normal)';
    input.style.boxSizing  = 'border-box';
    input.style.marginBottom = '16px';
    input.style.display    = 'block';

    // Button row
    const btnRow = contentEl.createDiv();
    btnRow.style.display        = 'flex';
    btnRow.style.justifyContent = 'flex-end';
    btnRow.style.gap            = '8px';

    const cancelBtn = btnRow.createEl('button', { text: 'Cancel' });
    cancelBtn.style.padding         = '7px 16px';
    cancelBtn.style.borderRadius    = '4px';
    cancelBtn.style.border          = '1px solid var(--background-modifier-border)';
    cancelBtn.style.background      = 'transparent';
    cancelBtn.style.color           = 'var(--text-normal)';
    cancelBtn.style.cursor          = 'pointer';
    cancelBtn.style.fontSize        = '14px';

    const okBtn = btnRow.createEl('button', { text: 'OK' });
    okBtn.style.padding      = '7px 20px';
    okBtn.style.borderRadius = '4px';
    okBtn.style.border       = 'none';
    okBtn.style.background   = 'var(--interactive-accent)';
    okBtn.style.color        = 'var(--text-on-accent)';
    okBtn.style.cursor       = 'pointer';
    okBtn.style.fontSize     = '14px';
    okBtn.style.fontWeight   = '600';

    const submit = () => {
      const val = input.value;   // NOT trimmed here — callers decide
      this.close();
      this.onSubmit?.(val);
    };
    const cancel = () => {
      this.close();
      this.onSubmit?.(null);
    };

    okBtn.addEventListener('click', submit);
    cancelBtn.addEventListener('click', cancel);
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter')  { e.preventDefault(); submit(); }
      if (e.key === 'Escape') { e.preventDefault(); cancel(); }
    });

    // Auto-focus and select all text so the user can type immediately
    setTimeout(() => { input.focus(); input.select(); }, 30);
  }

  onClose() { this.contentEl.empty(); }
}

// ==================== EDIT MESSAGE MODAL ====================

/**
 * Multi-line editor for revising a previously-sent chat message.
 * Unlike PromptModal (single-line <input>), this uses a <textarea> so
 * longer messages remain readable and editable.
 */
class EditMessageModal extends Modal {
  constructor(app, { initial = '', attachments = [] } = {}, onSubmit) {
    super(app);
    this._initial = initial;
    // Work on a shallow copy so removing an attachment here doesn't mutate
    // the original message until the user actually saves.
    this._attachments = [...(attachments || [])];
    this.onSubmit = onSubmit;
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.style.padding      = '24px';
    contentEl.style.background   = 'var(--background-secondary)';
    contentEl.style.borderRadius = '4px';

    const titleEl = contentEl.createEl('h3', { text: 'Edit Message' });
    titleEl.style.margin     = '0 0 6px';
    titleEl.style.fontSize   = '16px';
    titleEl.style.fontWeight = '600';
    titleEl.style.color      = 'var(--text-normal)';

    const noteEl = contentEl.createEl('p', {
      text: 'Resending will use only the conversation up to this point — later replies will be regenerated.'
    });
    noteEl.style.margin   = '0 0 12px';
    noteEl.style.fontSize = '12px';
    noteEl.style.color    = 'var(--text-muted)';

    const textarea = contentEl.createEl('textarea');
    textarea.value             = this._initial;
    textarea.style.width       = '100%';
    textarea.style.minHeight   = '140px';
    textarea.style.padding     = '10px';
    textarea.style.fontSize    = '14px';
    textarea.style.lineHeight  = '1.5';
    textarea.style.border      = '1px solid var(--background-modifier-border)';
    textarea.style.borderRadius = '4px';
    textarea.style.background  = 'var(--background-primary)';
    textarea.style.color       = 'var(--text-normal)';
    textarea.style.boxSizing   = 'border-box';
    textarea.style.marginBottom = '12px';
    textarea.style.resize      = 'vertical';
    textarea.style.fontFamily  = 'inherit';

    // ── Attachments (if any) ──────────────────────────────────────────────
    // Previously the modal didn't show attachments at all, so editing a
    // message silently kept whatever was attached with no way to see or
    // remove it — it would just reappear after resend looking "stuck".
    const attachmentsWrap = contentEl.createDiv();
    attachmentsWrap.style.marginBottom = '16px';
    this._renderAttachmentChips(attachmentsWrap);

    const btnRow = contentEl.createDiv();
    btnRow.style.display        = 'flex';
    btnRow.style.justifyContent = 'flex-end';
    btnRow.style.gap            = '8px';

    const cancelBtn = btnRow.createEl('button', { text: 'Cancel' });
    cancelBtn.style.padding      = '7px 16px';
    cancelBtn.style.borderRadius = '4px';
    cancelBtn.style.border       = '1px solid var(--background-modifier-border)';
    cancelBtn.style.background   = 'transparent';
    cancelBtn.style.color        = 'var(--text-normal)';
    cancelBtn.style.cursor       = 'pointer';
    cancelBtn.style.fontSize     = '14px';

    const okBtn = btnRow.createEl('button', { text: 'Save & Resend' });
    okBtn.style.padding      = '7px 20px';
    okBtn.style.borderRadius = '4px';
    okBtn.style.border       = 'none';
    okBtn.style.background   = 'var(--interactive-accent)';
    okBtn.style.color        = 'var(--text-on-accent)';
    okBtn.style.cursor       = 'pointer';
    okBtn.style.fontSize     = '14px';
    okBtn.style.fontWeight   = '600';

    const submit = () => {
      const val = textarea.value;
      this.close();
      this.onSubmit?.({ text: val, attachments: this._attachments });
    };
    const cancel = () => {
      this.close();
      this.onSubmit?.(null);
    };

    okBtn.addEventListener('click', submit);
    cancelBtn.addEventListener('click', cancel);
    textarea.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') { e.preventDefault(); cancel(); }
      // Ctrl/Cmd+Enter submits; plain Enter inserts a newline as expected.
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); submit(); }
    });

    setTimeout(() => { textarea.focus(); textarea.setSelectionRange(textarea.value.length, textarea.value.length); }, 30);
  }

  /** Renders the current attachment list as removable chips. */
  _renderAttachmentChips(wrap) {
    wrap.empty();
    if (!this._attachments.length) return;

    const label = wrap.createDiv({ text: 'Attachments:' });
    label.style.fontSize   = '12px';
    label.style.color      = 'var(--text-muted)';
    label.style.marginBottom = '6px';

    const list = wrap.createDiv();
    list.style.display  = 'flex';
    list.style.flexWrap = 'wrap';
    list.style.gap      = '6px';

    this._attachments.forEach((att, i) => {
      const chip = list.createDiv();
      chip.style.display      = 'flex';
      chip.style.alignItems   = 'center';
      chip.style.gap          = '6px';
      chip.style.padding      = '5px 8px';
      chip.style.background   = 'var(--background-primary)';
      chip.style.border       = '1px solid var(--background-modifier-border)';
      chip.style.borderRadius = '6px';
      chip.style.fontSize     = '12px';
      chip.style.color        = 'var(--text-normal)';
      chip.style.maxWidth     = '220px';

      const nameEl = chip.createSpan({ text: att.name || 'Attachment' });
      nameEl.style.overflow     = 'hidden';
      nameEl.style.textOverflow = 'ellipsis';
      nameEl.style.whiteSpace   = 'nowrap';

      const removeBtn = chip.createEl('button', { text: '✕' });
      removeBtn.title              = 'Remove attachment';
      removeBtn.style.border       = 'none';
      removeBtn.style.background   = 'transparent';
      removeBtn.style.color        = 'var(--text-muted)';
      removeBtn.style.cursor       = 'pointer';
      removeBtn.style.fontSize     = '12px';
      removeBtn.style.lineHeight   = '1';
      removeBtn.style.padding      = '0 0 0 2px';
      removeBtn.addEventListener('click', () => {
        this._attachments.splice(i, 1);
        this._renderAttachmentChips(wrap); // re-render remaining chips
      });
    });
  }

  onClose() { this.contentEl.empty(); }
}

// ==================== SELECT TEXT MODAL ====================

/**
 * A read-only popup showing a message's full text in a selectable form.
 * Opened from the message actions menu's "Select Text" item — this exists
 * because user message bubbles otherwise have click-drag text selection
 * disabled (to keep long-press/right-click free for that same menu), so
 * this modal is the way to actually select/copy an arbitrary portion of
 * a user message's text.
 */
class SelectTextModal extends Modal {
  constructor(app, text) {
    super(app);
    this._text = text || '';
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.style.padding      = '24px';
    contentEl.style.background   = 'var(--background-secondary)';
    contentEl.style.borderRadius = '4px';
    
    const titleEl = contentEl.createEl('h3', { text: 'Select Text' });
    titleEl.style.margin     = '0 0 6px';
    titleEl.style.fontSize   = '16px';
    titleEl.style.fontWeight = '600';
    titleEl.style.color      = 'var(--text-normal)';

    const noteEl = contentEl.createEl('p', {
      text: 'Select any portion of the text below and copy it as usual.'
    });
    noteEl.style.margin   = '0 0 12px';
    noteEl.style.fontSize = '12px';
    noteEl.style.color    = 'var(--text-muted)';
    
    const textarea = contentEl.createEl('textarea');
    textarea.value    = this._text;
    textarea.readOnly = true;
    textarea.style.width        = '100%';
    textarea.style.minHeight    = '160px';
    textarea.style.maxHeight    = '50vh';
    textarea.style.padding      = '10px';
    textarea.style.fontSize     = '14px';
    textarea.style.lineHeight   = '1.5';
    textarea.style.border       = '1px solid var(--background-modifier-border)';
    textarea.style.borderRadius = '4px';
    textarea.style.background   = 'var(--background-primary)';
    textarea.style.color        = 'var(--text-normal)';
    textarea.style.boxSizing    = 'border-box';
    textarea.style.marginBottom = '12px';
    textarea.style.resize       = 'vertical';
    textarea.style.fontFamily   = 'inherit';
    textarea.style.whiteSpace   = 'pre-wrap';
    textarea.style.userSelect   = 'text';
    textarea.style.webkitUserSelect = 'text';
    
    // --- FIXES THE FOCUS BORDER/OUTLINE ---
    textarea.style.outline      = 'none'; 
    textarea.addEventListener('focus', () => {
      textarea.style.outline    = 'none';
      textarea.style.boxShadow  = 'none';
    });
    // ---------------------------------------

    const btnRow = contentEl.createDiv();
    btnRow.style.display        = 'flex';
    btnRow.style.justifyContent = 'flex-end';
    btnRow.style.gap            = '8px';

    // Auto-select has been removed. The text will now remain unselected 
    // until the user manually interacts with it.
  }

  onClose() { this.contentEl.empty(); }
}


// ==================== CONFIRM MODAL ====================

/**
 * A styled replacement for the browser's native confirm() dialog.
 * Usage:
 *   new ConfirmModal(app, { title, message, confirmLabel, danger }, (ok) => { ... }).open();
 */
class ConfirmModal extends Modal {
  constructor(app, { title = 'Confirm', message = '', confirmLabel = 'OK', danger = false } = {}, onSubmit) {
    super(app);
    this._title        = title;
    this._message      = message;
    this._confirmLabel = confirmLabel;
    this._danger       = danger;
    this.onSubmit      = onSubmit;
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.style.padding      = '24px';
    contentEl.style.background   = 'var(--background-secondary)';
    contentEl.style.borderRadius = '4px';

    // Title row with optional warning icon
    const titleRow = contentEl.createDiv();
    titleRow.style.display    = 'flex';
    titleRow.style.alignItems = 'center';
    titleRow.style.gap        = '8px';
    titleRow.style.marginBottom = '12px';

    if (this._danger) {
      const warnIcon = titleRow.createSpan();
      setIcon(warnIcon, 'alert-triangle');
      warnIcon.style.color     = 'var(--text-error)';
      warnIcon.style.flexShrink = '0';
    }

    const titleEl = titleRow.createEl('h3', { text: this._title });
    titleEl.style.margin     = '0';
    titleEl.style.fontSize   = '16px';
    titleEl.style.fontWeight = '600';
    titleEl.style.color      = this._danger ? 'var(--text-error)' : 'var(--text-normal)';

    // Message
    if (this._message) {
      const msgEl = contentEl.createEl('p', { text: this._message });
      msgEl.style.margin   = '0 0 20px';
      msgEl.style.fontSize = '14px';
      msgEl.style.color    = 'var(--text-normal)';
      msgEl.style.lineHeight = '1.5';
    }

    // Button row
    const btnRow = contentEl.createDiv();
    btnRow.style.display        = 'flex';
    btnRow.style.justifyContent = 'flex-end';
    btnRow.style.gap            = '8px';

    const cancelBtn = btnRow.createEl('button', { text: 'Cancel' });
    cancelBtn.style.padding      = '7px 16px';
    cancelBtn.style.borderRadius = '4px';
    cancelBtn.style.border       = '1px solid var(--background-modifier-border)';
    cancelBtn.style.background   = 'transparent';
    cancelBtn.style.color        = 'var(--text-normal)';
    cancelBtn.style.cursor       = 'pointer';
    cancelBtn.style.fontSize     = '14px';

    const okBtn = btnRow.createEl('button', { text: this._confirmLabel });
    okBtn.style.padding      = '7px 20px';
    okBtn.style.borderRadius = '4px';
    okBtn.style.border       = 'none';
    okBtn.style.background   = this._danger ? 'var(--text-error)' : 'var(--interactive-accent)';
    okBtn.style.color        = 'var(--text-on-accent)';
    okBtn.style.cursor       = 'pointer';
    okBtn.style.fontSize     = '14px';
    okBtn.style.fontWeight   = '600';

    cancelBtn.addEventListener('click', () => { this.close(); this.onSubmit?.(false); });
    okBtn.addEventListener('click',     () => { this.close(); this.onSubmit?.(true);  });

    // Keyboard: Enter = confirm, Escape = cancel
    this.scope.register([], 'Enter',  () => { this.close(); this.onSubmit?.(true);  return false; });
    this.scope.register([], 'Escape', () => { this.close(); this.onSubmit?.(false); return false; });
  }

  onClose() { this.contentEl.empty(); }
}

// ==================== ATTACH MODAL ====================

class AttachModal extends Modal {
  constructor(app, onSubmit, imageAnalysisEnabled = false) {
    super(app);
    this.onSubmit = onSubmit;
    this.imageAnalysisEnabled = imageAnalysisEnabled;
    this.selected        = new Set();  // selected file paths
    this.selectedFolders = new Set();  // selected folder paths
    this.selectedImages  = [];         // { name, dataUrl, mimeType }
    this.searchTerm      = '';
    this.selectedFiles   = [];
    this.activeTab       = 'files';    // 'files' | 'folders' | 'images'
  }

  async onOpen() {
    const { contentEl } = this;
    contentEl.empty();

    // ── Title ────────────────────────────────────────────────────────────
    const title = contentEl.createEl('h2', {
      text: '📎 Attach Files or Folders',
      cls: 'ai-attach-title'
    });
    title.style.textAlign  = 'center';
    title.style.margin     = '0 0 16px 0';
    title.style.fontSize   = '18px';
    title.style.fontWeight = '600';

    // ── Tab bar: Files | Folders | Images ─────────────────────────────────
    const tabBar = contentEl.createDiv({ cls: 'ai-attach-tab-bar' });
    tabBar.style.display        = 'flex';
    tabBar.style.gap            = '8px';
    tabBar.style.marginBottom   = '14px';

    const makeTab = (label, tabKey) => {
      const btn = tabBar.createEl('button', { text: label });
      btn.style.flex         = '1';
      btn.style.padding      = '8px 0';
      btn.style.borderRadius = '6px';
      btn.style.border       = '1px solid var(--background-modifier-border)';
      btn.style.cursor       = 'pointer';
      btn.style.fontSize     = '14px';
      btn.style.fontWeight   = '600';
      btn.style.transition   = 'background 0.15s';
      return btn;
    };

    const filesTab   = makeTab('📄 Files',   'files');
    const foldersTab = makeTab('📁 Folders', 'folders');
    const imagesTab  = this.imageAnalysisEnabled ? makeTab('🖼 Images', 'images') : null;

    const allTabs = [filesTab, foldersTab, ...(imagesTab ? [imagesTab] : [])];

    const applyTabStyles = () => {
      allTabs.forEach(t => {
        t.style.background = 'var(--background-secondary)';
        t.style.color      = 'var(--text-muted)';
      });
      const activeEl = this.activeTab === 'files' ? filesTab
                     : this.activeTab === 'folders' ? foldersTab
                     : imagesTab;
      if (activeEl) {
        activeEl.style.background = 'var(--interactive-accent)';
        activeEl.style.color      = 'var(--text-on-accent)';
      }
    };
    applyTabStyles();

    // ── Search bar (hidden on Images tab) ────────────────────────────────
    const searchRow  = contentEl.createDiv({ cls: 'ai-search-row' });
    const searchInput = searchRow.createEl('input', {
      type: 'text',
      placeholder: '🔍 Search...'
    });
    searchInput.style.width           = '100%';
    searchInput.style.padding         = '10px 14px';
    searchInput.style.borderRadius    = '8px';
    searchInput.style.border          = '1px solid var(--background-modifier-border)';
    searchInput.style.backgroundColor = 'var(--background-secondary)';
    searchInput.style.color           = 'var(--text-normal)';
    searchInput.style.fontSize        = '14px';
    searchInput.style.marginBottom    = '12px';

    // ── List container (files/folders) ────────────────────────────────────
    const container = contentEl.createDiv({ cls: 'ai-file-list-container' });
    container.style.maxHeight       = '280px';
    container.style.overflowY       = 'auto';
    container.style.border          = '1px solid var(--background-modifier-border)';
    container.style.borderRadius    = '8px';
    container.style.padding         = '8px';
    container.style.backgroundColor = 'var(--background-secondary)';
    container.style.marginBottom    = '14px';

    // ── Images panel (hidden unless Images tab is active) ─────────────────
    const imagesPanel = contentEl.createDiv({ cls: 'ai-images-panel' });
    imagesPanel.style.display       = 'none';
    imagesPanel.style.marginBottom  = '14px';

    // Image extensions considered as vault images
    const IMAGE_EXTS = new Set(['png','jpg','jpeg','gif','webp','bmp','svg','avif']);

    // Mime type map for vault images
    const EXT_MIME = {
      png:'image/png', jpg:'image/jpeg', jpeg:'image/jpeg',
      gif:'image/gif', webp:'image/webp', bmp:'image/bmp',
      svg:'image/svg+xml', avif:'image/avif'
    };

    // Load a vault TFile image → push into selectedImages, then re-render
    const loadVaultImage = async (tfile) => {
      if (this.selectedImages.find(i => i.name === tfile.name)) return; // deduplicate
      try {
        const buf      = await this.app.vault.readBinary(tfile);
        const ext      = tfile.extension.toLowerCase();
        const mimeType = EXT_MIME[ext] || 'image/png';
        const bytes  = new Uint8Array(buf);
        const CHUNK  = 8192;
        let binary   = '';
        for (let i = 0; i < bytes.length; i += CHUNK) {
          binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
        }
        const base64   = btoa(binary);
        const dataUrl  = `data:${mimeType};base64,${base64}`;
        this.selectedImages.push({ name: tfile.name, dataUrl, mimeType });
        renderImagesPanel();
      } catch (e) {
        new Notice(`Could not read image: ${tfile.name}`);
      }
    };

    // Vault image search state — lives outside renderImagesPanel so it persists across re-renders
    let vaultSearchTerm = '';

    const renderImagesPanel = () => {
      imagesPanel.empty();

      // ── Drop zone (device files) ─────────────────────────────────────────
      const dropZone = imagesPanel.createDiv({ cls: 'ai-img-dropzone' });
      dropZone.style.border        = '2px dashed var(--interactive-accent)';
      dropZone.style.borderRadius  = '10px';
      dropZone.style.padding       = '20px';
      dropZone.style.textAlign     = 'center';
      dropZone.style.cursor        = 'pointer';
      dropZone.style.background    = 'rgba(var(--interactive-accent-rgb),0.05)';
      dropZone.style.marginBottom  = '12px';
      dropZone.style.transition    = 'background 0.15s';

      const dzIcon = dropZone.createDiv();
      setIcon(dzIcon, 'image-plus');
      dzIcon.style.display        = 'flex';
      dzIcon.style.justifyContent = 'center';
      dzIcon.style.marginBottom   = '6px';
      dzIcon.style.opacity        = '0.7';

      const dzLabel = dropZone.createEl('p');
      dzLabel.style.margin     = '0 0 4px';
      dzLabel.style.color      = 'var(--text-normal)';
      dzLabel.style.fontSize   = '14px';
      dzLabel.style.fontWeight = '600';
      dzLabel.textContent      = 'Click or drop images from your device';

      const dzSub = dropZone.createEl('p');
      dzSub.style.margin    = '0';
      dzSub.style.color     = 'var(--text-muted)';
      dzSub.style.fontSize  = '12px';
      dzSub.textContent     = 'PNG, JPG, GIF, WebP — multiple allowed';

      // Hidden file input
      const fileInput = dropZone.createEl('input', { type: 'file' });
      fileInput.style.display = 'none';
      fileInput.accept        = 'image/png,image/jpeg,image/gif,image/webp';
      fileInput.multiple      = true;

      const loadDeviceFiles = async (fileList) => {
        for (const file of Array.from(fileList)) {
          if (!file.type.startsWith('image/')) continue;
          if (this.selectedImages.find(i => i.name === file.name)) continue;
          const dataUrl = await new Promise((res, rej) => {
            const r = new FileReader();
            r.onload  = () => res(r.result);
            r.onerror = rej;
            r.readAsDataURL(file);
          });
          this.selectedImages.push({ name: file.name, dataUrl, mimeType: file.type });
        }
        renderImagesPanel();
      };

      dropZone.addEventListener('click', () => fileInput.click());
      fileInput.addEventListener('change', () => loadDeviceFiles(fileInput.files));
      dropZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        dropZone.style.background = 'rgba(var(--interactive-accent-rgb),0.12)';
      });
      dropZone.addEventListener('dragleave', () => {
        dropZone.style.background = 'rgba(var(--interactive-accent-rgb),0.05)';
      });
      dropZone.addEventListener('drop', (e) => {
        e.preventDefault();
        dropZone.style.background = 'rgba(var(--interactive-accent-rgb),0.05)';
        loadDeviceFiles(e.dataTransfer.files);
      });

      // ── Vault image picker ───────────────────────────────────────────────
      const vaultSection = imagesPanel.createDiv({ cls: 'ai-vault-img-section' });
      vaultSection.style.marginBottom = '12px';

      // Section header row
      const vaultHeader = vaultSection.createDiv();
      vaultHeader.style.display        = 'flex';
      vaultHeader.style.alignItems     = 'center';
      vaultHeader.style.gap            = '8px';
      vaultHeader.style.marginBottom   = '8px';

      const vaultHeaderIcon = vaultHeader.createSpan();
      setIcon(vaultHeaderIcon, 'vault');
      vaultHeaderIcon.style.display    = 'inline-flex';
      vaultHeaderIcon.style.opacity    = '0.7';
      vaultHeaderIcon.style.flexShrink = '0';

      const vaultHeaderLabel = vaultHeader.createEl('span');
      vaultHeaderLabel.textContent  = 'From your vault';
      vaultHeaderLabel.style.fontSize   = '13px';
      vaultHeaderLabel.style.fontWeight = '600';
      vaultHeaderLabel.style.color      = 'var(--text-muted)';
      vaultHeaderLabel.style.flex       = '1';

      // Search box
      const vaultSearch = vaultHeader.createEl('input', { type: 'text', placeholder: '🔍 Search images…' });
      vaultSearch.value            = vaultSearchTerm;
      vaultSearch.style.padding    = '5px 10px';
      vaultSearch.style.borderRadius = '6px';
      vaultSearch.style.border     = '1px solid var(--background-modifier-border)';
      vaultSearch.style.background = 'var(--background-secondary)';
      vaultSearch.style.color      = 'var(--text-normal)';
      vaultSearch.style.fontSize   = '12px';
      vaultSearch.style.width      = '150px';
      vaultSearch.addEventListener('input', (e) => {
        vaultSearchTerm = e.target.value;
        renderImagesPanel();
      });

      // Get all vault image files
      const allVaultImages = (this.app.vault.getFiles?.() ?? this.app.vault.getAllLoadedFiles?.() ?? [])
        .filter(f => f.extension && IMAGE_EXTS.has(f.extension.toLowerCase()))
        .sort((a, b) => a.name.localeCompare(b.name));

      const filtered = vaultSearchTerm.trim()
        ? allVaultImages.filter(f => f.name.toLowerCase().includes(vaultSearchTerm.toLowerCase()))
        : allVaultImages;

      if (filtered.length === 0) {
        const empty = vaultSection.createEl('p');
        empty.textContent   = allVaultImages.length === 0
          ? 'No image files found in your vault.'
          : 'No images match your search.';
        empty.style.color     = 'var(--text-muted)';
        empty.style.fontSize  = '12px';
        empty.style.textAlign = 'center';
        empty.style.margin    = '8px 0';
      } else {
        // Scrollable list of vault images
        const listWrap = vaultSection.createDiv({ cls: 'ai-vault-img-list' });
        listWrap.style.maxHeight       = '180px';
        listWrap.style.overflowY       = 'auto';
        listWrap.style.border          = '1px solid var(--background-modifier-border)';
        listWrap.style.borderRadius    = '8px';
        listWrap.style.background      = 'var(--background-secondary)';
        listWrap.style.padding         = '4px';
        listWrap.style.display         = 'flex';
        listWrap.style.flexDirection   = 'column';
        listWrap.style.gap             = '2px';

        filtered.forEach(tfile => {
          const alreadyAdded = !!this.selectedImages.find(i => i.name === tfile.name);

          const row = listWrap.createDiv({ cls: 'ai-vault-img-row' });
          row.style.display       = 'flex';
          row.style.alignItems    = 'center';
          row.style.gap           = '8px';
          row.style.padding       = '6px 8px';
          row.style.borderRadius  = '6px';
          row.style.cursor        = alreadyAdded ? 'default' : 'pointer';
          row.style.transition    = 'background 0.1s';
          row.style.background    = alreadyAdded ? 'rgba(var(--interactive-accent-rgb),0.10)' : 'transparent';
          row.style.opacity       = alreadyAdded ? '0.6' : '1';

          if (!alreadyAdded) {
            row.addEventListener('mouseenter', () => row.style.background = 'var(--background-modifier-hover)');
            row.addEventListener('mouseleave', () => row.style.background = 'transparent');
          }

          // Thumbnail preview using vault resource path
          const previewImg = row.createEl('img');
          previewImg.src             = this.app.vault.getResourcePath(tfile);
          previewImg.style.width     = '36px';
          previewImg.style.height    = '36px';
          previewImg.style.objectFit = 'cover';
          previewImg.style.borderRadius = '4px';
          previewImg.style.border    = '1px solid var(--background-modifier-border)';
          previewImg.style.flexShrink = '0';
          previewImg.style.background = 'var(--background-primary)';

          // File info column
          const infoCol = row.createDiv();
          infoCol.style.flex        = '1';
          infoCol.style.minWidth    = '0';

          const nameSpan = infoCol.createEl('div');
          nameSpan.textContent      = tfile.name;
          nameSpan.style.fontSize   = '13px';
          nameSpan.style.fontWeight = '500';
          nameSpan.style.color      = 'var(--text-normal)';
          nameSpan.style.overflow   = 'hidden';
          nameSpan.style.textOverflow = 'ellipsis';
          nameSpan.style.whiteSpace = 'nowrap';

          const pathSpan = infoCol.createEl('div');
          pathSpan.textContent    = tfile.parent?.path || '/';
          pathSpan.style.fontSize = '11px';
          pathSpan.style.color    = 'var(--text-muted)';
          pathSpan.style.overflow = 'hidden';
          pathSpan.style.textOverflow = 'ellipsis';
          pathSpan.style.whiteSpace   = 'nowrap';

          // Add button or ✓ badge
          if (alreadyAdded) {
            const badge = row.createEl('span');
            badge.textContent      = '✓ Added';
            badge.style.fontSize   = '11px';
            badge.style.color      = 'var(--interactive-accent)';
            badge.style.fontWeight = '600';
            badge.style.flexShrink = '0';
          } else {
            const addBtn = row.createEl('button');
            addBtn.textContent         = '+ Add';
            addBtn.style.padding       = '3px 10px';
            addBtn.style.borderRadius  = '5px';
            addBtn.style.border        = '1px solid var(--interactive-accent)';
            addBtn.style.background    = 'transparent';
            addBtn.style.color         = 'var(--interactive-accent)';
            addBtn.style.fontSize      = '12px';
            addBtn.style.cursor        = 'pointer';
            addBtn.style.fontWeight    = '600';
            addBtn.style.flexShrink    = '0';
            addBtn.style.whiteSpace    = 'nowrap';

            const doAdd = (e) => {
              e.stopPropagation();
              loadVaultImage(tfile);   // async — re-renders when done
            };
            addBtn.addEventListener('click', doAdd);
            row.addEventListener('click', doAdd);
          }
        });
      }

      // ── Selected images thumbnail grid ────────────────────────────────────
      if (this.selectedImages.length > 0) {
        const gridLabel = imagesPanel.createEl('div');
        gridLabel.textContent      = `Selected (${this.selectedImages.length})`;
        gridLabel.style.fontSize   = '12px';
        gridLabel.style.fontWeight = '600';
        gridLabel.style.color      = 'var(--text-muted)';
        gridLabel.style.marginBottom = '6px';

        const grid = imagesPanel.createDiv({ cls: 'ai-img-grid' });
        grid.style.display             = 'grid';
        grid.style.gridTemplateColumns = 'repeat(auto-fill, minmax(90px, 1fr))';
        grid.style.gap                 = '10px';
        grid.style.maxHeight           = '160px';
        grid.style.overflowY           = 'auto';
        grid.style.border              = '1px solid var(--background-modifier-border)';
        grid.style.borderRadius        = '8px';
        grid.style.padding             = '10px';
        grid.style.background          = 'var(--background-secondary)';

        this.selectedImages.forEach((img, idx) => {
          const cell = grid.createDiv({ cls: 'ai-img-cell' });
          cell.style.position     = 'relative';
          cell.style.borderRadius = '6px';
          cell.style.overflow     = 'hidden';
          cell.style.border       = '1px solid var(--background-modifier-border)';
          cell.style.background   = 'var(--background-primary)';

          const thumb = cell.createEl('img');
          thumb.src              = img.dataUrl;
          thumb.style.width      = '100%';
          thumb.style.height     = '70px';
          thumb.style.objectFit  = 'cover';
          thumb.style.display    = 'block';

          const nameEl = cell.createEl('p');
          nameEl.textContent        = img.name;
          nameEl.style.margin       = '0';
          nameEl.style.padding      = '3px 4px';
          nameEl.style.fontSize     = '10px';
          nameEl.style.color        = 'var(--text-muted)';
          nameEl.style.overflow     = 'hidden';
          nameEl.style.textOverflow = 'ellipsis';
          nameEl.style.whiteSpace   = 'nowrap';

          // Remove button
          const rm = cell.createEl('button');
          rm.textContent          = '✕';
          rm.style.position       = 'absolute';
          rm.style.top            = '3px';
          rm.style.right          = '3px';
          rm.style.background     = 'rgba(0,0,0,0.55)';
          rm.style.color          = '#fff';
          rm.style.border         = 'none';
          rm.style.borderRadius   = '50%';
          rm.style.width          = '18px';
          rm.style.height         = '18px';
          rm.style.cursor         = 'pointer';
          rm.style.fontSize       = '10px';
          rm.style.display        = 'flex';
          rm.style.alignItems     = 'center';
          rm.style.justifyContent = 'center';
          rm.style.lineHeight     = '1';
          rm.addEventListener('click', (e) => {
            e.stopPropagation();
            this.selectedImages.splice(idx, 1);
            renderImagesPanel();
          });
        });
      }
    };

    // ── Button row ────────────────────────────────────────────────────────
    const buttonRow = contentEl.createDiv({ cls: 'ai-attach-btn-row' });
    buttonRow.style.display        = 'flex';
    buttonRow.style.justifyContent = 'center';
    buttonRow.style.gap            = '12px';
    buttonRow.style.marginTop      = '16px';

    const sendSel = buttonRow.createEl('button', {
      text: '📎 Attach Selected',
      cls: 'ai-attach-send-btn'
    });
    sendSel.style.padding         = '10px 24px';
    sendSel.style.borderRadius    = '8px';
    sendSel.style.border          = 'none';
    sendSel.style.backgroundColor = 'var(--interactive-accent)';
    sendSel.style.color           = 'var(--text-on-accent)';
    sendSel.style.cursor          = 'pointer';
    sendSel.style.fontSize        = '14px';
    sendSel.style.fontWeight      = '600';
    sendSel.style.minWidth        = '140px';

    const cancel = buttonRow.createEl('button', {
      text: 'Cancel',
      cls: 'ai-attach-cancel-btn'
    });
    cancel.style.padding         = '10px 24px';
    cancel.style.borderRadius    = '8px';
    cancel.style.border          = '1px solid var(--background-modifier-border)';
    cancel.style.backgroundColor = 'transparent';
    cancel.style.color           = 'var(--text-normal)';
    cancel.style.cursor          = 'pointer';
    cancel.style.fontSize        = '14px';
    cancel.style.minWidth        = '140px';

    // ── Helpers ───────────────────────────────────────────────────────────

    /**
     * Returns all TFolder objects from the vault (excluding the invisible root "/").
     */
    const getAllFolders = () => {
      return this.app.vault.getAllLoadedFiles()
        .filter(item => item.children !== undefined && item.path !== '/');
    };

    /**
     * Returns all markdown TFile objects whose path begins with folderPath + "/",
     * i.e. direct and recursive children of that folder.
     */
    const getFilesInFolder = (folderPath) => {
      return this.app.vault.getMarkdownFiles()
        .filter(f => f.path.startsWith(folderPath + '/'));
    };

    /** Render a file row with a checkbox. */
    const renderFileRow = (f) => {
      const row = container.createDiv({ cls: 'ai-file-row' });
      row.style.display         = 'flex';
      row.style.alignItems      = 'center';
      row.style.padding         = '10px 12px';
      row.style.borderRadius    = '6px';
      row.style.marginBottom    = '6px';
      row.style.backgroundColor = 'var(--background-primary)';
      row.style.border          = '1px solid var(--background-modifier-border)';
      row.style.cursor          = 'pointer';

      const cbWrap = row.createDiv({ cls: 'ai-checkbox-container' });
      cbWrap.style.marginRight = '12px';
      cbWrap.style.flexShrink  = '0';

      const cb = cbWrap.createEl('input', { type: 'checkbox', cls: 'ai-file-checkbox' });
      cb.style.width  = '18px';
      cb.style.height = '18px';
      cb.style.cursor = 'pointer';
      cb.checked = this.selected.has(f.path);

      cb.addEventListener('change', (e) => {
        e.stopPropagation();
        e.target.checked ? this.selected.add(f.path) : this.selected.delete(f.path);
      });

      const info     = row.createDiv({ cls: 'ai-file-info' });
      info.style.flex     = '1';
      info.style.minWidth = '0';

      const nameEl = info.createEl('div', { text: f.basename, cls: 'ai-file-name' });
      nameEl.style.fontWeight    = '600';
      nameEl.style.fontSize      = '14px';
      nameEl.style.color         = 'var(--text-normal)';
      nameEl.style.marginBottom  = '2px';
      nameEl.style.whiteSpace    = 'nowrap';
      nameEl.style.overflow      = 'hidden';
      nameEl.style.textOverflow  = 'ellipsis';

      const pathEl = info.createEl('div', { text: f.path, cls: 'ai-file-path' });
      pathEl.style.fontSize     = '12px';
      pathEl.style.color        = 'var(--text-muted)';
      pathEl.style.whiteSpace   = 'nowrap';
      pathEl.style.overflow     = 'hidden';
      pathEl.style.textOverflow = 'ellipsis';

      row.addEventListener('click', (e) => {
        if (e.target.type !== 'checkbox') {
          cb.checked = !cb.checked;
          cb.dispatchEvent(new Event('change', { bubbles: true }));
        }
      });
    };

    /** Render a folder row with a checkbox and a file-count badge. */
    const renderFolderRow = (folder) => {
      const filesInside = getFilesInFolder(folder.path);

      const row = container.createDiv({ cls: 'ai-folder-row' });
      row.style.display         = 'flex';
      row.style.alignItems      = 'center';
      row.style.padding         = '10px 12px';
      row.style.borderRadius    = '6px';
      row.style.marginBottom    = '6px';
      row.style.backgroundColor = 'var(--background-primary)';
      row.style.border          = '1px solid var(--background-modifier-border)';
      row.style.cursor          = 'pointer';

      const cbWrap = row.createDiv({ cls: 'ai-checkbox-container' });
      cbWrap.style.marginRight = '12px';
      cbWrap.style.flexShrink  = '0';

      const cb = cbWrap.createEl('input', { type: 'checkbox', cls: 'ai-folder-checkbox' });
      cb.style.width  = '18px';
      cb.style.height = '18px';
      cb.style.cursor = 'pointer';
      cb.checked = this.selectedFolders.has(folder.path);

      cb.addEventListener('change', (e) => {
        e.stopPropagation();
        e.target.checked
          ? this.selectedFolders.add(folder.path)
          : this.selectedFolders.delete(folder.path);
      });

      const info     = row.createDiv({ cls: 'ai-folder-info' });
      info.style.flex     = '1';
      info.style.minWidth = '0';

      const nameEl = info.createEl('div', {
        text: `📁 ${folder.name || folder.path}`,
        cls: 'ai-folder-name'
      });
      nameEl.style.fontWeight   = '600';
      nameEl.style.fontSize     = '14px';
      nameEl.style.color        = 'var(--text-normal)';
      nameEl.style.marginBottom = '2px';
      nameEl.style.whiteSpace   = 'nowrap';
      nameEl.style.overflow     = 'hidden';
      nameEl.style.textOverflow = 'ellipsis';

      const metaEl = info.createEl('div', {
        text: `${folder.path}  ·  ${filesInside.length} markdown file${filesInside.length !== 1 ? 's' : ''}`,
        cls: 'ai-folder-meta'
      });
      metaEl.style.fontSize     = '12px';
      metaEl.style.color        = 'var(--text-muted)';
      metaEl.style.whiteSpace   = 'nowrap';
      metaEl.style.overflow     = 'hidden';
      metaEl.style.textOverflow = 'ellipsis';

      row.addEventListener('click', (e) => {
        if (e.target.type !== 'checkbox') {
          cb.checked = !cb.checked;
          cb.dispatchEvent(new Event('change', { bubbles: true }));
        }
      });
    };

    // ── Render list based on active tab ───────────────────────────────────
    const renderList = () => {
      container.empty();
      const term = this.searchTerm.trim().toLowerCase();

      if (this.activeTab === 'files') {
        let files = this.app.vault.getMarkdownFiles();
        if (term) {
          files = files.filter(f =>
            f.path.toLowerCase().includes(term) ||
            f.basename.toLowerCase().includes(term)
          );
        }

        if (files.length === 0) {
          const empty = container.createDiv({
            cls: 'ai-empty-files',
            text: term ? 'No files match your search' : 'No markdown files found'
          });
          empty.style.textAlign = 'center';
          empty.style.padding   = '40px 20px';
          empty.style.color     = 'var(--text-muted)';
          empty.style.fontSize  = '14px';
          return;
        }

        files.forEach(renderFileRow);

      } else {
        // Folders tab
        let folders = getAllFolders();
        if (term) {
          folders = folders.filter(f => f.path.toLowerCase().includes(term));
        }

        if (folders.length === 0) {
          const empty = container.createDiv({
            cls: 'ai-empty-folders',
            text: term ? 'No folders match your search' : 'No folders found'
          });
          empty.style.textAlign = 'center';
          empty.style.padding   = '40px 20px';
          empty.style.color     = 'var(--text-muted)';
          empty.style.fontSize  = '14px';
          return;
        }

        folders.forEach(renderFolderRow);
      }
    };

    // ── Helper: show/hide panels based on active tab ───────────────────────
    const showActivePanel = () => {
      const isImages = this.activeTab === 'images';
      searchRow.style.display    = isImages ? 'none' : '';
      container.style.display    = isImages ? 'none' : '';
      imagesPanel.style.display  = isImages ? '' : 'none';
      if (isImages) renderImagesPanel();
      // Swap button label
      sendSel.textContent = isImages ? '🖼 Attach Images' : '📎 Attach Selected';
    };

    // ── Wire up tab switching ──────────────────────────────────────────────
    filesTab.addEventListener('click', () => {
      this.activeTab = 'files';
      this.searchTerm = '';
      searchInput.value = '';
      applyTabStyles();
      showActivePanel();
      renderList();
    });

    foldersTab.addEventListener('click', () => {
      this.activeTab = 'folders';
      this.searchTerm = '';
      searchInput.value = '';
      applyTabStyles();
      showActivePanel();
      renderList();
    });

    if (imagesTab) {
      imagesTab.addEventListener('click', () => {
        this.activeTab = 'images';
        applyTabStyles();
        showActivePanel();
      });
    }

    // ── Wire up search ────────────────────────────────────────────────────
    searchInput.addEventListener('input', (e) => {
      this.searchTerm = e.target.value;
      renderList();
    });

    // ── Attach Selected / Attach Images ───────────────────────────────────
    sendSel.addEventListener('click', () => {
      if (this.activeTab === 'images') {
        if (this.selectedImages.length === 0) {
          new Notice('No images selected');
          return;
        }
        this.onSubmit('images', this.selectedImages);
        this.close();
        return;
      }

      // Files / Folders mode
      const allMarkdown = this.app.vault.getMarkdownFiles();
      const byPath      = new Map(allMarkdown.map(f => [f.path, f]));

      const pickedPaths = new Set(this.selected);

      // Expand each selected folder into its constituent markdown files
      this.selectedFolders.forEach(folderPath => {
        getFilesInFolder(folderPath).forEach(f => pickedPaths.add(f.path));
      });

      const picked = [...pickedPaths]
        .map(p => byPath.get(p))
        .filter(Boolean);

      if (picked.length === 0) {
        new Notice('No files selected');
        return;
      }

      this.selectedFiles = picked;
      this.onSubmit('files', picked);
      this.close();
    });

    cancel.addEventListener('click', () => this.close());

    // Initial render
    showActivePanel();
    renderList();
  }

  onClose() {
    this.contentEl.empty();
  }
}
// ==================== IN-NOTE AI INTERACTIONS ====================

class InNoteAIInteractions {
  constructor(plugin) {
    this.plugin = plugin;
    this.floatingMenu = null;
    this.registerContextMenu();
    this.registerFloatingMenu();
    this.registerKeyboardShortcuts();
  }

  registerContextMenu() {
    this.plugin.registerEvent(
      this.plugin.app.workspace.on('editor-menu', (menu, editor, view) => {
        const selection = editor.getSelection();
        
        if (selection && selection.trim().length > 0) {
          menu.addSeparator();
          
          menu.addItem((item) => {
            item.setTitle('🤖 AI: Ask about selection')
                .setIcon('brain')
                .onClick(() => this.askAboutSelection(editor, selection));
          });

          menu.addItem((item) => {
            item.setTitle('✏️ AI: Edit/Improve selection')
                .setIcon('pencil')
                .onClick(() => this.editSelection(editor, selection));
          });

          menu.addItem((item) => {
            item.setTitle('📝 AI: Continue writing')
                .setIcon('quote')
                .onClick(() => this.continueWriting(editor, selection));
          });

          menu.addItem((item) => {
            item.setTitle('🌐 AI: Translate selection')
                .setIcon('languages')
                .onClick(() => this.translateSelection(editor, selection));
          });

          const submenu = menu.addItem((item) => {
            item.setTitle('🤖 AI: More options...')
                .setIcon('chevron-down');
          });

          submenu.setSubmenu((submenu) => {
            this.addMoreAIOptions(submenu, editor, selection);
          });
        }
      })
    );
  }

  registerFloatingMenu() {
    let timeoutId = null;
    
    this.plugin.registerEvent(
      this.plugin.app.workspace.on('editor-change', (editor) => {
        if (timeoutId) {
          clearTimeout(timeoutId);
        }
        
        timeoutId = setTimeout(() => {
          const selection = editor.getSelection();
          if (selection && selection.trim().length > 20) {
            this.showFloatingMenu(editor);
          } else {
            this.hideFloatingMenu();
          }
        }, 500);
      })
    );

    this.plugin.registerEvent(
      this.plugin.app.workspace.on('click', () => {
        this.hideFloatingMenu();
      })
    );
  }

  showFloatingMenu(editor) {
    this.hideFloatingMenu();

    const cursor = editor.getCursor('from');

    // `editor.charCoords()` was a CodeMirror 5 API. Obsidian's Editor now
    // wraps CodeMirror 6, which has no such method — calling it throws
    // "editor.charCoords is not a function". CM6 exposes position->screen
    // coordinates via `coordsAtPos(offset)` on the underlying EditorView
    // instead, so use that (falling back to the old API if it's ever
    // present, and bailing out quietly if neither is available).
    let coords = null;
    try {
      if (editor.cm && typeof editor.cm.coordsAtPos === 'function' && typeof editor.posToOffset === 'function') {
        const offset = editor.posToOffset(cursor);
        const cmCoords = editor.cm.coordsAtPos(offset);
        if (cmCoords) {
          coords = { top: cmCoords.top, left: cmCoords.left };
        }
      } else if (typeof editor.charCoords === 'function') {
        coords = editor.charCoords(cursor, 'screen');
      }
    } catch (e) {
      coords = null;
    }

    if (!coords) {
      // Couldn't resolve an on-screen position for the cursor — skip
      // showing the floating menu rather than throwing.
      return;
    }
    
    const menu = document.createElement('div');
    menu.className = 'ai-floating-menu';
    menu.style.position = 'fixed';
    menu.style.top = (coords.top - 50) + 'px';
    menu.style.left = coords.left + 'px';
    menu.style.zIndex = '1000';
    menu.style.display = 'flex';
    menu.style.gap = '8px';
    menu.style.padding = '8px';
    menu.style.background = 'var(--background-primary)';
    menu.style.border = '1px solid var(--background-modifier-border)';
    menu.style.borderRadius = '30px';
    menu.style.boxShadow = '0 4px 20px rgba(0,0,0,0.2)';
    menu.style.backdropFilter = 'blur(10px)';
    menu.style.animation = 'ai-float-in 0.2s ease';
    
    const buttons = [
      { icon: '🤖', title: 'Ask AI', action: () => this.askAboutSelection(editor, editor.getSelection()) },
      { icon: '✏️', title: 'Edit', action: () => this.editSelection(editor, editor.getSelection()) },
      { icon: '📝', title: 'Continue', action: () => this.continueWriting(editor, editor.getSelection()) },
      { icon: '🌐', title: 'Translate', action: () => this.translateSelection(editor, editor.getSelection()) }
    ];

    buttons.forEach(btn => {
      const button = menu.createEl('button', {
        text: btn.icon,
        cls: 'ai-floating-btn',
        attr: { title: btn.title }
      });
      button.style.width = '36px';
      button.style.height = '36px';
      button.style.borderRadius = '50%';
      button.style.border = 'none';
      button.style.background = 'var(--interactive-accent)';
      button.style.color = 'var(--text-on-accent)';
      button.style.fontSize = '18px';
      button.style.cursor = 'pointer';
      button.style.transition = 'all 0.2s ease';
      button.style.display = 'flex';
      button.style.alignItems = 'center';
      button.style.justifyContent = 'center';
      
      button.addEventListener('mouseenter', () => {
        button.style.transform = 'scale(1.1)';
        button.style.background = 'var(--interactive-accent-hover)';
      });
      
      button.addEventListener('mouseleave', () => {
        button.style.transform = 'scale(1)';
        button.style.background = 'var(--interactive-accent)';
      });
      
      button.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        btn.action();
        menu.remove();
      });
    });

    document.body.appendChild(menu);
    this.floatingMenu = menu;

    setTimeout(() => {
      const closeHandler = (e) => {
        if (menu && !menu.contains(e.target)) {
          menu.remove();
          document.removeEventListener('click', closeHandler);
        }
      };
      document.addEventListener('click', closeHandler);
    }, 100);
  }

  hideFloatingMenu() {
    if (this.floatingMenu) {
      this.floatingMenu.remove();
      this.floatingMenu = null;
    }
  }

  registerKeyboardShortcuts() {
    this.plugin.addCommand({
      id: 'ai-ask-selection',
      name: 'Ask AI about selected text',
      hotkeys: [{ modifiers: ['Ctrl', 'Shift'], key: 'A' }],
      editorCallback: (editor) => {
        const selection = editor.getSelection();
        if (selection && selection.trim().length > 0) {
          this.askAboutSelection(editor, selection);
        } else {
          new Notice('Please select some text first');
        }
      }
    });

    this.plugin.addCommand({
      id: 'ai-edit-selection',
      name: 'Edit selected text with AI',
      hotkeys: [{ modifiers: ['Ctrl', 'Shift'], key: 'E' }],
      editorCallback: (editor) => {
        const selection = editor.getSelection();
        if (selection && selection.trim().length > 0) {
          this.editSelection(editor, selection);
        } else {
          new Notice('Please select some text first');
        }
      }
    });

    this.plugin.addCommand({
      id: 'ai-continue-writing',
      name: 'Continue writing from cursor',
      hotkeys: [{ modifiers: ['Ctrl', 'Shift'], key: 'C' }],
      editorCallback: (editor) => {
        const cursor = editor.getCursor();
        const line = editor.getLine(cursor.line);
        const textBeforeCursor = line.substring(0, cursor.ch);
        const textAfterCursor = line.substring(cursor.ch);
        const context = textBeforeCursor + (textAfterCursor ? ' ' + textAfterCursor : '');
        
        if (context.trim().length > 0) {
          this.continueWriting(editor, context);
        } else {
          new Notice('No text context found at cursor');
        }
      }
    });
  }

  async askAboutSelection(editor, selection) {
    const prompt = await this.showPromptModal('What would you like to ask about this selection?');
    if (!prompt) return;

    const fullPrompt = `Context from my note:\n\n${selection}\n\nMy question: ${prompt}`;
    
    const cursor = editor.getCursor('to');
    editor.replaceRange('\n\n--- 🤖 AI Response ---\n\n', cursor);
    
    try {
      await this.streamAIResponse(fullPrompt, (chunk) => {
        editor.replaceRange(chunk, editor.getCursor());
      });
      
      editor.replaceRange('\n\n---\n\n', editor.getCursor());
    } catch (error) {
      editor.replaceRange(`\n\n⨉ Error: ${error.message}\n\n`, editor.getCursor());
      new Notice('AI Error: ' + error.message);
    }
  }

  async editSelection(editor, selection) {
    const prompt = await this.showPromptModal('How would you like to edit this text? (e.g., "make it formal", "summarize", "fix grammar")');
    if (!prompt) return;

    const fullPrompt = `Original text:\n\n${selection}\n\nInstructions: ${prompt}\n\nEdited version:`;
    
    const cursor = editor.getCursor('from');
    const to = editor.getCursor('to');
    const tempCursor = { line: cursor.line, ch: cursor.ch };
    
    editor.replaceRange('⏳ Editing...', cursor, to);
    
    try {
      let fullResponse = '';
      await this.streamAIResponse(fullPrompt, (chunk) => {
        fullResponse += chunk;
        editor.replaceRange(fullResponse, tempCursor, { 
          line: tempCursor.line, 
          ch: tempCursor.ch + 1000 
        });
      });
      
      editor.replaceRange(fullResponse, tempCursor, { 
        line: tempCursor.line, 
        ch: tempCursor.ch + 1000 
      });
    } catch (error) {
      editor.replaceRange(selection, tempCursor, { 
        line: tempCursor.line, 
        ch: tempCursor.ch + 1000 
      });
      new Notice('AI Error: ' + error.message);
    }
  }

  async continueWriting(editor, context) {
    const fullPrompt = `Continue the following text naturally:\n\n${context}\n\n`;
    
    const cursor = editor.getCursor('to');
    
    try {
      await this.streamAIResponse(fullPrompt, (chunk) => {
        editor.replaceRange(chunk, editor.getCursor());
      });
    } catch (error) {
      new Notice('AI Error: ' + error.message);
    }
  }

  async translateSelection(editor, selection) {
    const targetLanguage = await this.showPromptModal('Translate to which language?');
    if (!targetLanguage) return;

    const fullPrompt = `Translate the following text to ${targetLanguage}:\n\n${selection}\n\nTranslation:`;
    
    const cursor = editor.getCursor('from');
    const to = editor.getCursor('to');
    
    editor.replaceRange(`\n\n[${targetLanguage} translation]:\n`, cursor, to);
    
    try {
      await this.streamAIResponse(fullPrompt, (chunk) => {
        editor.replaceRange(chunk, editor.getCursor());
      });
      
      editor.replaceRange('\n\n', editor.getCursor());
    } catch (error) {
      new Notice('AI Error: ' + error.message);
    }
  }

  async summarizeText(editor, selection) {
    const fullPrompt = `Summarize the following text concisely:\n\n${selection}\n\nSummary:`;
    
    const cursor = editor.getCursor('to');
    editor.replaceRange('\n\n📝 Summary:\n\n', cursor);
    
    try {
      await this.streamAIResponse(fullPrompt, (chunk) => {
        editor.replaceRange(chunk, editor.getCursor());
      });
    } catch (error) {
      new Notice('AI Error: ' + error.message);
    }
  }

  async expandText(editor, selection) {
    const fullPrompt = `Expand and elaborate on the following text, adding more details and depth:\n\n${selection}\n\nExpanded version:`;
    
    const cursor = editor.getCursor('to');
    editor.replaceRange('\n\n🔍 Expanded:\n\n', cursor);
    
    try {
      await this.streamAIResponse(fullPrompt, (chunk) => {
        editor.replaceRange(chunk, editor.getCursor());
      });
    } catch (error) {
      new Notice('AI Error: ' + error.message);
    }
  }

  async generateQuestions(editor, selection) {
    const fullPrompt = `Generate 5 thoughtful questions based on this text:\n\n${selection}\n\nQuestions:`;
    
    const cursor = editor.getCursor('to');
    editor.replaceRange('\n\n? Questions:\n\n', cursor);
    
    try {
      await this.streamAIResponse(fullPrompt, (chunk) => {
        editor.replaceRange(chunk, editor.getCursor());
      });
    } catch (error) {
      new Notice('AI Error: ' + error.message);
    }
  }

  async extractKeywords(editor, selection) {
    const fullPrompt = `Extract the most important keywords and key phrases from this text:\n\n${selection}\n\nKeywords:`;
    
    const cursor = editor.getCursor('to');
    editor.replaceRange('\n\n🔑 Keywords:\n\n', cursor);
    
    try {
      await this.streamAIResponse(fullPrompt, (chunk) => {
        editor.replaceRange(chunk, editor.getCursor());
      });
    } catch (error) {
      new Notice('AI Error: ' + error.message);
    }
  }

  async changeTone(editor, selection, tone) {
    const toneMap = {
      professional: 'professional and formal',
      casual: 'casual and friendly',
      academic: 'academic and scholarly',
      poetic: 'poetic and literary',
      technical: 'technical and precise',
      simple: 'simple and easy to understand'
    };
    
    const fullPrompt = `Rewrite the following text in a ${toneMap[tone] || tone} tone:\n\n${selection}\n\nRewritten version:`;
    
    const cursor = editor.getCursor('from');
    const to = editor.getCursor('to');
    
    try {
      let fullResponse = '';
      await this.streamAIResponse(fullPrompt, (chunk) => {
        fullResponse += chunk;
        editor.replaceRange(fullResponse, cursor, to);
      });
    } catch (error) {
      new Notice('AI Error: ' + error.message);
    }
  }

  addMoreAIOptions(submenu, editor, selection) {
    submenu.addItem((item) => {
      item.setTitle('📊 Summarize')
          .setIcon('file-text')
          .onClick(() => this.summarizeText(editor, selection));
    });
    
    submenu.addItem((item) => {
      item.setTitle('🔍 Expand')
          .setIcon('plus-circle')
          .onClick(() => this.expandText(editor, selection));
    });
    
    submenu.addItem((item) => {
      item.setTitle('❓ Generate questions')
          .setIcon('help-circle')
          .onClick(() => this.generateQuestions(editor, selection));
    });
    
    submenu.addItem((item) => {
      item.setTitle('🔑 Extract keywords')
          .setIcon('key')
          .onClick(() => this.extractKeywords(editor, selection));
    });
    
    submenu.addSeparator();
    
    submenu.addItem((item) => {
      item.setTitle('Professional tone')
          .setIcon('briefcase')
          .onClick(() => this.changeTone(editor, selection, 'professional'));
    });
    
    submenu.addItem((item) => {
      item.setTitle('Casual tone')
          .setIcon('smile')
          .onClick(() => this.changeTone(editor, selection, 'casual'));
    });
    
    submenu.addItem((item) => {
      item.setTitle('Academic tone')
          .setIcon('graduation-cap')
          .onClick(() => this.changeTone(editor, selection, 'academic'));
    });
    
    submenu.addItem((item) => {
      item.setTitle('Technical tone')
          .setIcon('code')
          .onClick(() => this.changeTone(editor, selection, 'technical'));
    });
    
    submenu.addSeparator();
    
    submenu.addItem((item) => {
      item.setTitle('Copy to clipboard')
          .setIcon('copy')
          .onClick(() => {
            navigator.clipboard.writeText(selection);
            new Notice('Selection copied to clipboard');
          });
    });
  }

  async streamAIResponse(prompt, onChunk) {
    const session = this.plugin._sessionManager.getActive();
    
    if (session) {
      this.plugin._sessionManager.addMessage('user', prompt);
    }

    const result = await this.plugin.apiManager.sendMessage({
      messages: session ? this.plugin._sessionManager.getMessagesForRequest() : [{ role: 'user', content: prompt }],
      temperature: this.plugin.settings.temperature,
      max_tokens: this.plugin.settings.max_tokens,
      stream: true
    }, {
      onChunk: onChunk,
      timeoutMs: this.plugin.settings.timeoutMs
    });

    if (session && result.final) {
      this.plugin._sessionManager.addMessage('assistant', result.final);
      this.plugin.saveState();
    }

    return result.final;
  }

  async showPromptModal(placeholder) {
    return new Promise((resolve) => {
      const modal = new PromptModal(
        this.plugin.app,
        'AI Assistant',
        '',
        (result) => resolve(result)
      );
      
      modal.open();
    });
  }
}

// ==================== CHAT SIDEBAR VIEW ====================

class ChatView extends ItemView {
  constructor(leaf, plugin) {
    super(leaf);
    this.plugin = plugin;
    this.containerEl.addClass('ai-sidebar');
    this._streaming = true;
    this.pendingAttachments = [];
    // Set to a message index while the user is editing that message inline
    // in the main input box (instead of the old floating-modal flow).
    this._editingMessageIndex = null;
    this.isNamingInProgress = false; // Flag to prevent multiple naming attempts
    // Edit-mode state — toggled by the "Edit Files" button in the input area
    this.editMode = false;
    this._pendingEditFiles = []; // raw TFile refs kept parallel to pendingAttachments

    /**
     * Tracks files the user attached when they issued a '✏ Edit instruction'
     * command, keyed by session ID.  For the lifetime of that conversation the
     * AI is allowed to modify those files via natural-language requests even
     * when they fall outside the normally-permitted scope.
     *
     * Shape:  Map<sessionId: string, Set<normalizedVaultPath: string>>
     */
    this._sessionEditUnlockedFiles = new Map();

    // ── Stop/cancel generation state ─────────────────────────────────────
    // Whether an assistant response is currently being generated (drives
    // the Send button <-> Stop button swap in the input area).
    this._isGenerating = false;
    // Holds { requestId, networkManager } for the in-flight API request so
    // the Stop button can abort exactly that request.
    this._activeRequestInfo = null;
    // Set true for the duration of a request the user has asked to stop,
    // so completion handlers can tell a deliberate cancellation apart from
    // a genuine "no response" error.
    this._stopRequested = false;
  }

  getViewType() { return VIEW_TYPE; }
  getDisplayText() { return 'AI Assistant'; }
  getIcon() { return 'brain'; }

  async onOpen() {
    this.containerEl.empty();
    this.containerEl.addClass('ai-sidebar');
    this.containerEl.style.direction = 'ltr';
    this.containerEl.style.textAlign = 'left';
    this.containerEl.style.display = 'flex';
    this.containerEl.style.flexDirection = 'column';
    this.containerEl.style.height = '100%';
    this.containerEl.style.padding = '8px';
    this.containerEl.style.gap = '8px';
    this.containerEl.style.boxSizing = 'border-box';

    const topBar = this.containerEl.createDiv({ cls: 'ai-top-bar' });
    topBar.style.display = 'flex';
    topBar.style.justifyContent = 'flex-start';
    topBar.style.alignItems = 'center';
    topBar.style.height = '36px';
    topBar.style.width = '100%';
    topBar.style.gap = '8px';

    // Header buttons
    this.shortcutsBtn = topBar.createEl('button', {
      cls: 'ai-shortcuts-btn'
    });
    setIcon(this.shortcutsBtn, 'command');
    this.styleButton(this.shortcutsBtn);
    this.shortcutsBtn.title = 'Shortcuts';

    this.modeToggleBtn = topBar.createEl('button', {
      cls: 'ai-mode-toggle'
    });
    setIcon(this.modeToggleBtn, this.getProviderIcon());
    this.styleButton(this.modeToggleBtn);
    this.modeToggleBtn.title = this.getProviderInfo();

    this.tempChatBtn = topBar.createEl('button', {
      cls: 'ai-temp-chat-btn'
    });
    setIcon(this.tempChatBtn, 'message-square-dashed');
    this.styleButton(this.tempChatBtn);
    this.tempChatBtn.title = 'New Temporary Chat (unsaved)';

    // Reopen the most recent diff review — in case it was closed by mistake
    // before the user could apply/discard it. Hidden until one exists.
    this.diffReviewBtn = topBar.createEl('button', {
      cls: 'ai-diff-review-btn'
    });
    setIcon(this.diffReviewBtn, 'git-compare');
    this.styleButton(this.diffReviewBtn);
    this.diffReviewBtn.title = 'Reopen last diff review';
    this.diffReviewBtn.style.display = this.plugin.lastDiffReview ? 'flex' : 'none';

    this.tokenCounter = topBar.createDiv({ 
      cls: 'ai-token-counter'
    });
    this.tokenCounter.style.fontSize = '11px';
    this.tokenCounter.style.padding = '4px 8px';
    this.tokenCounter.style.borderRadius = '12px';
    this.tokenCounter.style.background = 'transparent';
    this.tokenCounter.style.color = 'var(--text-muted)';
    this.tokenCounter.style.border = '1px solid var(--background-modifier-border)';
    this.tokenCounter.style.display = 'flex';
    this.tokenCounter.style.alignItems = 'center';
    this.tokenCounter.style.justifyContent = 'center';
    this.tokenCounter.style.gap = '4px';
    this.tokenCounter.style.minWidth = '70px';
    this.tokenCounter.style.height = '24px';
    
    const tokenIcon = this.tokenCounter.createSpan();
    setIcon(tokenIcon, 'binary');
    tokenIcon.style.display = 'flex';
    
    const tokenText = this.tokenCounter.createSpan();
    tokenText.textContent = `0/${this.plugin.settings.max_tokens || 2048}`;
    tokenText.style.fontSize = '1em';
    tokenText.style.marginTop = '5px';
    tokenText.style.fontWeight = '500';
    this.updateTokenCounterVisibility();

    const spacer = topBar.createDiv({ cls: 'ai-top-spacer' });
    spacer.style.flex = '1';

    this.menuBtn = topBar.createEl('button', {
      cls: 'ai-menu-btn'
    });
    setIcon(this.menuBtn, 'menu');
    this.styleButton(this.menuBtn);
    this.menuBtn.title = 'Conversations';

    // Events
    this.modeToggleBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.toggleAIMode();
    });

    this.menuBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.toggleConversationPanel();
    });

    this.shortcutsBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.showShortcutsMenu();
    });

    this.tempChatBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.createTemporaryChat();
    });

    this.diffReviewBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const review = this.plugin.lastDiffReview;
      if (!review) return;
      new DiffViewModal(this.app, this.plugin, review.fileDiffs, review.onApply).open();
    });

    // Check preferred input position
    const inputPosition = this.plugin.settings.inputPosition || 'bottom';
    
    if (inputPosition === 'bottom') {
      // Default: chat at top, input at bottom
      await this.createChatArea();
      await this.createInputArea();
    } else {
      // Reversed: input at top, chat at bottom
      await this.createInputArea();
      await this.createChatArea();
    }

    this._renderMessages();
    this._streaming = true;
    
    // Always wire the input listener — accumulation runs unconditionally.
    // showTokenCounter only controls visibility, not whether data is tracked.
    this.inputEl.addEventListener('input', () => this._updateTokenCounter());
    setTimeout(() => this._updateTokenCounter(), 100);
  }

  // Method to create chat area
  async createChatArea() {
    this.chatEl = this.containerEl.createDiv({ cls: 'ai-chat' });
    this.chatEl.style.flex = '1';
    this.chatEl.style.overflowY = 'auto';
    this.chatEl.style.padding = '16px';
    this.chatEl.style.borderRadius = '8px';
    this.chatEl.style.background = 'var(--background-primary)';
    this.chatEl.style.border = '1px solid var(--background-modifier-border)';
    this.chatEl.style.margin = '4px 0';
    this.chatEl.style.display = 'flex';
    this.chatEl.style.flexDirection = 'column';

    // MarkdownRenderer.render() turns [[wikilinks]] into <a class="internal-link">
    // anchors, but doesn't wire up click-to-open behavior on its own — without
    // this handler, clicking one falls through to the browser's default anchor
    // navigation (an invalid "app://..." URL), which is what was crashing /
    // reloading the whole app. Delegate one listener instead of wiring each
    // bubble individually, since bubbles are re-created constantly.
    this.chatEl.addEventListener('click', (evt) => {
      const linkEl = evt.target.closest('a.internal-link');
      if (linkEl) {
        evt.preventDefault();
        const href = linkEl.getAttribute('data-href') || linkEl.getAttribute('href') || '';
        this.app.workspace.openLinkText(href, '', evt.ctrlKey || evt.metaKey);
        return;
      }
      const externalEl = evt.target.closest('a.external-link');
      if (externalEl) {
        evt.preventDefault();
        const href = externalEl.getAttribute('href');
        if (href) window.open(href, '_blank');
      }
    });
  }

  // Method to create input area
  async createInputArea() {
    const inputWrap = this.containerEl.createDiv({ cls: 'ai-input-wrap' });
    inputWrap.style.position = 'relative';
    inputWrap.style.width = '100%';
    inputWrap.style.marginTop = 'auto';
    inputWrap.style.paddingTop = '8px';
    inputWrap.style.borderTop = '1px solid var(--background-modifier-border)';
    
    // Shown while editing a previous message inline (instead of the old
    // floating EditMessageModal) — lets the user cancel back to a normal
    // new-message compose state.
    this.editingBanner = inputWrap.createDiv({ cls: 'ai-editing-banner' });
    this.editingBanner.style.display = 'none';
    this.editingBanner.style.position = 'absolute';
    this.editingBanner.style.right = '-10px';
    this.editingBanner.style.top = '4px';
    this.editingBanner.style.alignItems = 'center';
    this.editingBanner.style.background = 'none';
    this.editingBanner.style.fontSize = '10px';
    this.editingBanner.style.zIndex = '99';
    this.editingBanner.style.width = 'auto';
    
    const editingCancelBtn = this.editingBanner.createEl('button', { text: '×' });
    editingCancelBtn.style.background = 'none';
    editingCancelBtn.style.borderRadius = '4px';
    editingCancelBtn.style.fontSize = '16px';
    editingCancelBtn.style.cursor = 'pointer';
    editingCancelBtn.style.color = 'var(--text-muted)';
    editingCancelBtn.style.marginLeft = 'auto'; 
    editingCancelBtn.addEventListener('click', (e) => {
      e.preventDefault();
      this._cancelEditMessage();
    });

    this.inputEl = inputWrap.createEl('textarea', { 
      cls: 'ai-input',
      attr: { 
        placeholder: 'Type a message... (Shift+Enter send)',
        rows: '2'
      }
    });
    this.inputEl.style.width = '100%';
    this.inputEl.style.resize = 'vertical';
    this.inputEl.style.padding = '12px';
    this.inputEl.style.paddingBottom = '60px';
    this.inputEl.style.borderRadius = '8px';
    this.inputEl.style.border = '1px solid var(--background-modifier-border)';
    this.inputEl.style.background = 'var(--background-secondary)';
    this.inputEl.style.color = 'var(--text-normal)';
    this.inputEl.style.fontSize = '15px';
    this.inputEl.style.minHeight = '120px';
    this.inputEl.style.maxHeight = '300px';
    this.inputEl.style.lineHeight = '1.5';

    this.attachBtn = inputWrap.createEl('button', { 
      cls: 'ai-attach-btn floating-btn'
    });
    this.attachBtn.createSpan({ text: '+', attr: { style: 'display:flex;align-items:center;justify-content:center;line-height:1;pointer-events:none;padding-top:5px;' } });
    this.styleFloatingButton(this.attachBtn);
    this.attachBtn.style.bottom = '60px';
    this.attachBtn.title = 'Attach files or folders';

    // ── Edit-Files toggle button ─────────────────────────────────────────
    // Shown at the same level as the attach button but only becomes meaningful
    // when files are pending. Clicking it toggles the mode between Chat and
    // "Edit Files" so the user's next Send triggers the AI file-edit pipeline.
    this.editModeBtn = inputWrap.createEl('button', {
      cls: 'ai-edit-mode-btn floating-btn'
    });
    this.styleFloatingButton(this.editModeBtn);
    this.editModeBtn.style.bottom      = '60px';
    this.editModeBtn.style.right       = '60px';     // sit to the left of attach btn
    this.editModeBtn.style.background  = 'var(--background-secondary)';
    this.editModeBtn.style.border      = '1px solid var(--background-modifier-border)';
    this.editModeBtn.style.color       = 'var(--text-muted)';
    this.editModeBtn.style.fontSize    = '11px';
    this.editModeBtn.style.width       = '48px';
    this.editModeBtn.style.height      = '28px';
    this.editModeBtn.style.borderRadius = '14px';
    this.editModeBtn.style.boxShadow   = 'none';
    this.editModeBtn.style.display     = 'none';     // hidden until files attached
    this.editModeBtn.title             = 'Toggle: Edit attached files with AI';

    const _refreshEditModeBtn = () => {
      const hasFiles = this._pendingEditFiles.length > 0;
      this.editModeBtn.style.display = hasFiles ? 'flex' : 'none';
      if (this.editMode && hasFiles) {
        this.editModeBtn.style.background = 'var(--interactive-accent)';
        this.editModeBtn.style.color      = 'var(--text-on-accent)';
        this.editModeBtn.style.border     = 'none';
        this.editModeBtn.textContent      = '✏ Edit';
        this.inputEl.placeholder          = 'Describe the edits the AI should make to the attached files…';
        this.sendBtn.title                = 'Run AI file edits';
      } else {
        this.editModeBtn.style.background = 'var(--background-secondary)';
        this.editModeBtn.style.color      = 'var(--text-muted)';
        this.editModeBtn.style.border     = '1px solid var(--background-modifier-border)';
        this.editModeBtn.textContent      = '✏ Edit';
        this.inputEl.placeholder          = 'Type a message… (Shift+Enter to send)';
        this.sendBtn.title                = 'Send';
      }
    };

    // Expose refresher so _onAttach can call it after updating pendingEditFiles
    this._refreshEditModeBtn = _refreshEditModeBtn;

    this.editModeBtn.addEventListener('click', (e) => {
      e.preventDefault();
      if (this._pendingEditFiles.length === 0) {
        new Notice('Attach files or a folder first, then enable Edit Mode');
        return;
      }
      this.editMode = !this.editMode;
      _refreshEditModeBtn();
    });

    this.sendBtn = inputWrap.createEl('button', { 
      cls: 'ai-send-btn floating-btn' 
    });
    this.sendBtn.createSpan({ text: '➤', attr: { style: 'display:flex;align-items:center;justify-content:center;line-height:1;pointer-events:none;padding-top:5px;' } });
    this.styleFloatingButton(this.sendBtn);
    this.sendBtn.style.bottom = '15px';
    this.sendBtn.title = 'Send';

    this.sendBtn.addEventListener('click', (e) => {
      e.preventDefault();
      if (this._isGenerating) {
        this._stopGeneration();
      } else if (this._editingMessageIndex !== null) {
        this._onSendEditedMessage();
      } else if (this.editMode && this._pendingEditFiles.length > 0) {
        this._onEditSend();
      } else {
        this._onSend();
      }
    });
    
    this.attachBtn.addEventListener('click', (e) => {
      e.preventDefault();
      this._onAttach();
    });
    
    this.inputEl.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && e.shiftKey) {
        e.preventDefault();
        if (this._isGenerating) {
          // A response is already in progress — Shift+Enter shouldn't
          // start a second one; the user can use the Stop button instead.
          return;
        }
        if (this._editingMessageIndex !== null) {
          this._onSendEditedMessage();
        } else if (this.editMode && this._pendingEditFiles.length > 0) {
          this._onEditSend();
        } else {
          this._onSend();
        }
      }
    });

    // If a response is already generating (e.g. this input area is being
    // recreated by refreshLayout mid-stream), make sure the freshly-created
    // button reflects that immediately instead of defaulting to "Send".
    if (this._isGenerating) {
      this._setGeneratingState(true);
    }
  }
  
  async refreshLayout() {
    // Save references to current elements
    const oldChatEl = this.chatEl;
    const oldInputWrap = this.inputEl?.parentElement;
    
    // Remove old elements
    if (oldChatEl) oldChatEl.remove();
    if (oldInputWrap) oldInputWrap.remove();
    
    // Recreate based on new setting
    const inputPosition = this.plugin.settings.inputPosition || 'bottom';
    
    if (inputPosition === 'bottom') {
      await this.createChatArea();
      await this.createInputArea();
    } else {
      await this.createInputArea();
      await this.createChatArea();
    }
    
    // Re-render messages
    this._renderMessages();
  }

  // Helper methods for button styling
  styleButton(btn) {
    btn.style.background = 'transparent';
    btn.style.border = 'none';
    btn.style.cursor = 'pointer';
    btn.style.color = 'var(--text-normal)';
    btn.style.padding = '4px 8px';
    btn.style.borderRadius = '4px';
    btn.style.width = '32px';
    btn.style.height = '32px';
    btn.style.display = 'flex';
    btn.style.alignItems = 'center';
    btn.style.justifyContent = 'center';
  }

  styleFloatingButton(btn) {
    btn.style.position = 'absolute';
    btn.style.width = '36px';
    btn.style.height = '36px';
    btn.style.borderRadius = '50%';
    btn.style.border = 'none';
    btn.style.cursor = 'pointer';
    btn.style.display = 'flex';
    btn.style.alignItems = 'center';
    btn.style.justifyContent = 'center';
    btn.style.fontSize = '16px';
    btn.style.zIndex = '100';
    btn.style.boxShadow = '0 3px 10px rgba(0,0,0,0.2)';
    btn.style.right = '15px';
    btn.style.background = 'var(--interactive-accent)';
    btn.style.color = 'var(--text-on-accent)';
    // Use setProperty with !important to override Obsidian theme button padding
    btn.style.setProperty('padding', '0', 'important');
    btn.style.setProperty('padding-top', '0', 'important');
    btn.style.setProperty('padding-bottom', '0', 'important');
    btn.style.setProperty('padding-left', '0', 'important');
    btn.style.setProperty('padding-right', '0', 'important');
    btn.style.setProperty('line-height', '1', 'important');
    btn.style.setProperty('box-sizing', 'border-box', 'important');
  }

  // Method to create temporary chat
  createTemporaryChat() {
    this.plugin._sessionManager.createTemporary('Temporary Chat');
    this._renderMessages();
    this.plugin.saveState(); // Doesn't save temporary, only regular sessions
    new Notice('Temporary chat created (will be deleted when switching or closing)');
  }

  /**
   * Create a new conversation with optional auto-naming
   createNewConversation() {
    new PromptModal(this.app, {
      title: 'New Conversation',
      placeholder: 'Leave empty to auto-name after first message'
    }, (name) => {
      if (name === null) return;
      if (name.trim()) {
        this.plugin._sessionManager.create(name.trim());
        this._renderMessages();
        this.plugin.saveState();
        new Notice(`✓ Created conversation: ${name.trim()}`);
      } else {
        this.plugin._sessionManager.create('New Conversation');
        this._renderMessages();
        this.plugin.saveState();
        if (this.plugin.settings.autoNameConversations) {
          new Notice('Conversation will be auto-named after first message');
        } else {
          new Notice('✓ Created new conversation');
        }
      }
    }).open();
  }
  */
  createNewConversation() {
    this.plugin._sessionManager.create('New Conversation');
    this._renderMessages();
    this.plugin.saveState();
    this.toggleConversationPanel();
  }

  /**
   * Rename the current conversation
   */
  renameCurrentConversation() {
    const session = this.plugin._sessionManager.getActive();
    if (!session) {
      new Notice('No active conversation to rename');
      return;
    }
    new PromptModal(this.app, {
      title: 'Rename Conversation',
      placeholder: 'Conversation name',
      initial: session.name
    }, (newName) => {
      if (newName && newName.trim()) {
        session.name = newName.trim();
        this.plugin.saveState();
        new Notice(`✓ Conversation renamed to: ${session.name}`);
        this.plugin.refreshChatViews();
      }
    }).open();
  }

  /**
   * Show a temporary naming indicator in the UI
   */
  showNamingIndicator() {
    // Create or update naming indicator in the top bar
    if (!this.namingIndicator) {
      this.namingIndicator = this.containerEl.createDiv({ cls: 'ai-naming-indicator' });
      this.namingIndicator.style.marginLeft = '8px';
      this.namingIndicator.style.fontSize = '11px';
      this.namingIndicator.style.color = 'var(--text-muted)';
      
      const iconSpan = this.namingIndicator.createSpan();
      setIcon(iconSpan, 'loader');
      iconSpan.style.marginRight = '4px';
      iconSpan.style.animation = 'spin 1s linear infinite';
      
      const textSpan = this.namingIndicator.createSpan();
      textSpan.textContent = 'Naming conversation...';
      
      // Insert after the rename button
      const renameBtn = this.containerEl.querySelector('.ai-rename-btn');
      if (renameBtn && renameBtn.parentElement) {
        renameBtn.parentElement.insertBefore(this.namingIndicator, renameBtn.nextSibling);
      }
    }
    this.namingIndicator.style.display = 'flex';
  }

  /**
   * Hide the naming indicator
   */
  hideNamingIndicator() {
    if (this.namingIndicator) {
      this.namingIndicator.style.display = 'none';
    }
  }

  // ────────────────────────────────────────────────────────────────────────
  // CONVERSATION PANEL
  // ────────────────────────────────────────────────────────────────────────

  /**
   * Toggle the slide-in conversation panel.
   * Panel is 60% of the sidebar width, absolutely positioned on the right.
   */
  toggleConversationPanel() {
    // If panel already open, close it
    if (this._convPanel) {
      this._convPanel.remove();
      this._convPanel = null;
      return;
    }
    this._convPanel = this._buildConversationPanel();
    this.containerEl.appendChild(this._convPanel);

    // Close when clicking outside the panel
    const outsideClick = (e) => {
      if (this._convPanel && !this._convPanel.contains(e.target) && e.target !== this.menuBtn) {
        this._convPanel.remove();
        this._convPanel = null;
        document.removeEventListener('click', outsideClick);
      }
    };
    setTimeout(() => document.addEventListener('click', outsideClick), 10);
  }

  /**
   * Build and return the conversation panel DOM element.
   */
  _buildConversationPanel() {
    const panel = document.createElement('div');
    panel.className = 'ai-conv-panel';
    panel.style.position = 'absolute';
    panel.style.top = '0';
    panel.style.right = '0';
    panel.style.width = '60%';
    panel.style.height = '100%';
    panel.style.background = 'var(--background-primary)';
    panel.style.borderLeft = '1px solid var(--background-modifier-border)';
    panel.style.boxShadow = '-4px 0 16px rgba(0,0,0,0.15)';
    panel.style.zIndex = '500';
    panel.style.display = 'flex';
    panel.style.flexDirection = 'column';
    panel.style.overflowY = 'auto';

    // ── Header row ───────────────────────────────────────────────────────
    const header = panel.createDiv({ cls: 'ai-conv-panel-header' });
    header.style.display = 'flex';
    header.style.alignItems = 'center';
    header.style.justifyContent = 'space-between';
    header.style.padding = '12px 14px 8px';
    header.style.borderBottom = '1px solid var(--background-modifier-border)';
    header.style.flexShrink = '0';

    const title = header.createEl('span', { text: 'Conversations' });
    title.style.fontWeight = '700';
    title.style.fontSize = '14px';

    const newBtn = header.createEl('button');
    newBtn.style.background = 'transparent';
    newBtn.style.border = 'none';
    newBtn.style.cursor = 'pointer';
    newBtn.style.padding = '4px';
    newBtn.style.borderRadius = '4px';
    newBtn.style.color = 'var(--text-muted)';
    newBtn.title = 'New conversation';
    setIcon(newBtn, 'plus');
    newBtn.addEventListener('click', () => {
      this.createNewConversation();
      this._refreshConversationPanel();
    });

    // ── Session rows ─────────────────────────────────────────────────────
    const list = panel.createDiv({ cls: 'ai-conv-panel-list' });
    list.style.flex = '1';
    list.style.overflowY = 'auto';
    list.style.padding = '8px 6px';

    this._renderPanelRows(list);
    return panel;
  }

  /** Refresh just the row list inside the open panel (after any mutation). */
  _refreshConversationPanel() {
    if (!this._convPanel) return;
    const list = this._convPanel.querySelector('.ai-conv-panel-list');
    if (list) {
      list.empty();
      this._renderPanelRows(list);
    }
  }

  /** Render one row per session into the given list container. */
  _renderPanelRows(list) {
    const sessions = this.plugin._sessionManager.getAllSessions({ excludeTemporary: true });

    if (!sessions.length) {
      const empty = list.createEl('div', { text: 'No conversations yet' });
      empty.style.textAlign = 'center';
      empty.style.padding = '24px 12px';
      empty.style.color = 'var(--text-muted)';
      empty.style.fontSize = '13px';
      return;
    }

    sessions.forEach(session => {
      const isActive = this.plugin._sessionManager.activeId === session.id;

      const row = list.createDiv({ cls: 'ai-conv-panel-row' + (isActive ? ' active' : '') });
      row.style.display = 'flex';
      row.style.alignItems = 'center';
      row.style.padding = '9px 8px';
      row.style.borderRadius = '6px';
      row.style.marginBottom = '3px';
      row.style.cursor = 'pointer';
      row.style.background = isActive
        ? 'rgba(var(--interactive-accent-rgb), 0.12)'
        : 'transparent';
      row.style.border = isActive
        ? '1px solid var(--interactive-accent)'
        : '1px solid transparent';
      row.style.transition = 'background 0.15s';
      row.addEventListener('mouseenter', () => {
        if (!isActive) row.style.background = 'var(--background-secondary)';
      });
      row.addEventListener('mouseleave', () => {
        if (!isActive) row.style.background = 'transparent';
      });

      // ── Three-dots button ──────────────────────────────────────────────
      const dotsBtn = row.createEl('button', { cls: 'ai-conv-dots' });
      dotsBtn.style.background = 'transparent';
      dotsBtn.style.border = 'none';
      dotsBtn.style.cursor = 'pointer';
      dotsBtn.style.padding = '2px 4px';
      dotsBtn.style.borderRadius = '4px';
      dotsBtn.style.color = 'var(--text-muted)';
      dotsBtn.style.flexShrink = '0';
      dotsBtn.style.marginRight = '6px';
      dotsBtn.style.display = 'flex';
      dotsBtn.style.alignItems = 'center';
      dotsBtn.style.opacity = '0';
      dotsBtn.title = 'Options';
      setIcon(dotsBtn, 'more-vertical');
      row.addEventListener('mouseenter', () => { dotsBtn.style.opacity = '1'; });
      row.addEventListener('mouseleave', () => { dotsBtn.style.opacity = '0'; });

      dotsBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this._showConvContextMenu(e, session);
      });

      // ── Session name label ─────────────────────────────────────────────
      const nameEl = row.createEl('span');
      nameEl.textContent = session.name;
      nameEl.style.flex = '1';
      nameEl.style.fontSize = '13px';
      nameEl.style.fontWeight = isActive ? '600' : '400';
      nameEl.style.whiteSpace = 'nowrap';
      nameEl.style.overflow = 'hidden';
      nameEl.style.textOverflow = 'ellipsis';
      nameEl.style.color = isActive ? 'var(--text-normal)' : 'var(--text-muted)';

      // ── Message count badge ───────────────────────────────────────────
      const badge = row.createEl('span');
      badge.textContent = session.messages.length;
      badge.style.fontSize = '11px';
      badge.style.color = 'var(--text-faint)';
      badge.style.marginLeft = '6px';
      badge.style.flexShrink = '0';

      // ── Activate on row click ──────────────────────────────────────────
      row.addEventListener('click', (e) => {
        if (e.target === dotsBtn || dotsBtn.contains(e.target)) return;
        this.plugin._sessionManager.switchTo(session.id);
        this.plugin.saveState();
        this._renderMessages();
        this._refreshConversationPanel();
      });
    });
  }

  /**
   * Show the context menu (⋮) for a single conversation row.
   * Options: Change Name, Change Role, Duplicate, Delete, Save.
   */
  _showConvContextMenu(e, session) {
    // Remove any existing context menu
    document.querySelectorAll('.ai-conv-ctx-menu').forEach(m => m.remove());

    const menu = document.createElement('div');
    menu.className = 'ai-conv-ctx-menu';
    menu.style.position = 'fixed';
    menu.style.background = 'var(--background-primary)';
    menu.style.border = '1px solid var(--background-modifier-border)';
    menu.style.borderRadius = '8px';
    menu.style.padding = '6px';
    menu.style.minWidth = '170px';
    menu.style.boxShadow = '0 6px 20px rgba(0,0,0,0.2)';
    menu.style.zIndex = '9999';

    const makeItem = (icon, label, danger, onClick) => {
      const item = menu.createDiv({ cls: 'ai-conv-ctx-item' });
      item.style.display = 'flex';
      item.style.alignItems = 'center';
      item.style.gap = '8px';
      item.style.padding = '8px 10px';
      item.style.borderRadius = '5px';
      item.style.cursor = 'pointer';
      item.style.fontSize = '13px';
      item.style.color = danger ? 'var(--text-error)' : 'var(--text-normal)';
      item.style.transition = 'background 0.1s';
      item.addEventListener('mouseenter', () => {
        item.style.background = danger
          ? 'rgba(var(--background-modifier-error-rgb), 0.15)'
          : 'var(--background-secondary)';
      });
      item.addEventListener('mouseleave', () => { item.style.background = 'transparent'; });
      const ico = item.createSpan();
      setIcon(ico, icon);
      ico.style.display = 'flex';
      item.createSpan({ text: label });
      item.addEventListener('click', (ev) => {
        ev.stopPropagation();
        menu.remove();
        onClick();
      });
    };

    // Change Name
    makeItem('pencil', 'Change Name', false, () => {
      new PromptModal(this.app, {
        title: 'Rename Conversation',
        placeholder: 'Conversation name',
        initial: session.name
      }, (newName) => {
        if (newName?.trim()) {
          session.name = newName.trim();
          this.plugin.saveState();
          new Notice(`✓ Renamed to: ${session.name}`);
          this._refreshConversationPanel();
          this.plugin.refreshChatViews();
        }
      }).open();
    });

    // Change Role (system prompt)
    makeItem('user-cog', 'Change Role', false, () => {
      new PromptModal(this.app, {
        title: 'Change Role',
        message: 'Set a system prompt for this conversation. Leave empty to clear.',
        placeholder: 'You are a helpful assistant…',
        initial: session.systemPrompt || ''
      }, (newRole) => {
        if (newRole !== null) {
          session.systemPrompt = newRole.trim();
          this.plugin.saveState();
          new Notice(session.systemPrompt ? '✓ Role updated' : '✓ Role cleared');
        }
      }).open();
    });

    // Duplicate
    makeItem('copy', 'Duplicate', false, () => {
      new PromptModal(this.app, {
        title: 'Duplicate Conversation',
        placeholder: 'Name for the copy',
        initial: session.name + ' (Copy)'
      }, (newName) => {
        if (newName?.trim()) {
          const dup = this.plugin._sessionManager.duplicate(session.id, newName.trim());
          if (dup) {
            this.plugin.saveState();
            new Notice(`✓ Duplicated as: ${dup.name}`);
            this._refreshConversationPanel();
            this.plugin.refreshChatViews();
          }
        }
      }).open();
    });

    // Save to vault
    makeItem('save', 'Save to Vault', false, async () => {
      try {
      const file = await this.plugin.saveSessionToVault(session);

      // Interactive notification with an "Open Note" button
      const frag = document.createDocumentFragment();
      const container = frag.createDiv();
      container.style.display = 'flex';
      container.style.alignItems = 'center';
      container.style.gap = '12px';
      container.createSpan({ text: `✓ Saved: ${file.name}` });
      const btn = container.createEl('button', { text: 'Open Note', cls: 'mod-cta' });
      btn.style.padding = '2px 10px';
      btn.style.height = 'auto';
      btn.style.fontSize = '0.85em';
      btn.style.cursor = 'pointer';
      btn.addEventListener('click', () => this.plugin.app.workspace.getLeaf(true).openFile(file));
      new Notice(frag, 15000);
    } catch (error) {
      console.error('Error saving conversation:', error);
      new Notice(`⨉ Error saving conversation: ${error.message}`);
    }
    });

    // Separator
    const sep = menu.createDiv();
    sep.style.height = '1px';
    sep.style.background = 'var(--background-modifier-border)';
    sep.style.margin = '4px 0';

    // Delete
    makeItem('trash-2', 'Delete', true, () => {
      new ConfirmModal(this.app, {
        title: 'Delete Conversation',
        message: `Delete "${session.name}"? This cannot be undone.`,
        confirmLabel: 'Delete',
        danger: true
      }, (ok) => {
        if (!ok) return;
        this.plugin._sessionManager.delete(session.id);
        this.plugin.saveState();
        new Notice('Conversation deleted');
        this._renderMessages();
        this._refreshConversationPanel();
        this.plugin.refreshChatViews();
      }).open();
    });

    document.body.appendChild(menu);

    // Position near the click
    const x = Math.min(e.clientX, window.innerWidth - 185);
    const y = Math.min(e.clientY, window.innerHeight - menu.offsetHeight - 10);
    menu.style.left = x + 'px';
    menu.style.top = y + 'px';

    // Reposition after paint (offsetHeight is 0 before first paint)
    requestAnimationFrame(() => {
      const mh = menu.offsetHeight;
      const adjustedY = Math.min(e.clientY, window.innerHeight - mh - 10);
      menu.style.top = adjustedY + 'px';
    });

    const closeCtx = (ev) => {
      if (!menu.contains(ev.target)) {
        menu.remove();
        document.removeEventListener('click', closeCtx);
      }
    };
    setTimeout(() => document.addEventListener('click', closeCtx), 10);
  }

  async saveCurrentConversation() {
    const session = this.plugin._sessionManager.getActive();
    if (!session) {
      new Notice('No active conversation to save');
      return;
    }

    try {
      const file = await this.plugin.saveSessionToVault(session);

      // Interactive notification with an "Open Note" button
      const frag = document.createDocumentFragment();
      frag.createSpan({ text: `✓ Saved: ${file.name} ` });
      const btn = frag.createEl('button', { text: 'Open Note', cls: 'mod-cta' });
      btn.style.marginLeft = '10px';
      btn.style.padding = '2px 8px';
      btn.style.fontSize = '0.8em';
      btn.style.height = 'auto';
      btn.style.cursor = 'pointer';
      btn.addEventListener('click', () => this.app.workspace.getLeaf(true).openFile(file));
      new Notice(frag, 10000);
    } catch (error) {
      console.error('Error saving conversation:', error);
      new Notice(`⨉ Error saving conversation: ${error.message}`);
    }
  }

  updateTokenCounterVisibility() {
    if (!this.tokenCounter) return;

    if (this.plugin.settings.showTokenCounter) {
      this.tokenCounter.style.display = 'flex';
      // Refresh immediately so it shows the accumulated total from previous
      // requests, not zero — accumulation always runs regardless of this setting.
      this._updateTokenCounter();
    } else {
      this.tokenCounter.style.display = 'none';
    }
  }

  showShortcutsMenu() {
    const existingMenus = document.querySelectorAll('.ai-shortcuts-menu');
    existingMenus.forEach(menu => menu.remove());
    
    const menu = document.createElement('div');
    menu.className = 'ai-shortcuts-menu';
    menu.style.position = 'fixed';
    menu.style.background = 'var(--background-primary)';
    menu.style.border = '1px solid var(--background-modifier-border)';
    menu.style.borderRadius = '8px';
    menu.style.padding = '10px';
    menu.style.minWidth = '200px';
    menu.style.boxShadow = '0 8px 24px rgba(0,0,0,0.2)';
    menu.style.zIndex = '9999';
    menu.style.backdropFilter = 'blur(10px)';
    
    const allShortcuts = [
      { key: 'New Conversation',    visKey: 'newConversation',    shortcut: this.plugin.settings.shortcuts.newConversation,                   action: () => this.createNewConversation() },
      { key: 'Rename Conversation', visKey: 'renameConversation', shortcut: 'Ctrl+Shift+R',                                                    action: () => this.renameCurrentConversation() },
      { key: 'Save Conversation',   visKey: 'saveConversation',   shortcut: this.plugin.settings.shortcuts.saveConversation,                   action: () => this.saveCurrentConversation() },
      { key: 'Open Chat Page',      visKey: 'openChatPage',       shortcut: 'Ctrl+Shift+O',                                                    action: () => this.plugin.openChatPage() },
      { key: 'Settings',            visKey: 'settings',           shortcut: this.plugin.settings.shortcuts.settings,                           action: () => { new SettingsModal(this.app, this.plugin).open(); } },
      { key: 'Ask Selection',       visKey: 'askSelection',       shortcut: this.plugin.settings.shortcuts.askSelection   || 'Ctrl+Shift+A',   action: () => { new Notice('Use this shortcut in the editor with text selected'); } },
      { key: 'Edit Selection',      visKey: 'editSelection',      shortcut: this.plugin.settings.shortcuts.editSelection  || 'Ctrl+Shift+E',   action: () => { new Notice('Use this shortcut in the editor with text selected'); } }
    ];

    const vis = this.plugin.settings.shortcutsVisible ?? {};
    const shortcuts = allShortcuts.filter(item => vis[item.visKey] !== false);
    
    shortcuts.forEach(item => {
      const menuItem = document.createElement('div');
      menuItem.className = 'shortcut-item';
      menuItem.style.padding = '8px 12px';
      menuItem.style.cursor = 'pointer';
      menuItem.style.fontSize = '13px';
      menuItem.style.color = 'var(--text-normal)';
      menuItem.style.borderBottom = '1px solid var(--background-modifier-border)';
      menuItem.style.display = 'flex';
      menuItem.style.justifyContent = 'space-between';
      menuItem.style.alignItems = 'center';
      
      const keySpan = document.createElement('span');
      keySpan.className = 'shortcut-key';
      keySpan.style.fontWeight = '600';
      keySpan.textContent = item.key;
      
      const shortcutSpan = document.createElement('span');
      shortcutSpan.className = 'shortcut-value';
      shortcutSpan.style.fontFamily = 'monospace';
      shortcutSpan.style.fontSize = '12px';
      shortcutSpan.style.color = 'var(--text-muted)';
      shortcutSpan.style.background = 'var(--background-secondary)';
      shortcutSpan.style.padding = '2px 6px';
      shortcutSpan.style.borderRadius = '4px';
      shortcutSpan.style.border = '1px solid var(--background-modifier-border)';
      shortcutSpan.textContent = item.shortcut;
      
      menuItem.appendChild(keySpan);
      menuItem.appendChild(shortcutSpan);
      
      menuItem.addEventListener('click', () => {
        item.action();
        menu.remove();
      });
      
      menu.appendChild(menuItem);
    });
    
    document.body.appendChild(menu);
    
    const btnRect = this.shortcutsBtn.getBoundingClientRect();
    const menuRect = menu.getBoundingClientRect();
    
    let top = btnRect.bottom + 5;
    let left = btnRect.left;
    
    if (top + menuRect.height > window.innerHeight) {
      top = btnRect.top - menuRect.height - 5;
    }
    
    if (left + menuRect.width > window.innerWidth) {
      left = btnRect.right - menuRect.width;
    }
    
    menu.style.top = `${top}px`;
    menu.style.left = `${left}px`;
    
    const closeMenu = (e) => {
      if (!menu.contains(e.target) && e.target !== this.shortcutsBtn) {
        menu.remove();
        document.removeEventListener('click', closeMenu);
      }
    };
    
    setTimeout(() => {
      document.addEventListener('click', closeMenu);
    }, 10);
  }

  getProviderIcon() {
    return this.plugin.apiManager.getCurrentProviderIcon();
  }

  getProviderName() {
    return this.plugin.apiManager.getCurrentProviderName();
  }

  getProviderInfo() {
    if (this.plugin.settings.currentMode === 'local') {
      return `${this.plugin.settings.localModel} - Click to switch to cloud`;
    } else {
      return `${this.getProviderName()} - Click to switch to local`;
    }
  }

  toggleAIMode() {
    this.plugin.settings.currentMode = 
      this.plugin.settings.currentMode === 'local' ? 'cloud' : 'local';
    
    this.updateModeIndicator();
    
    // saveSettings() also propagates the new mode's icon/tooltip to every
    // other open chat view (sidebar + main page), keeping them in sync.
    this.plugin.saveSettings();
    new Notice(`Switched to ${this.getProviderName()}`);
    this._updateTokenCounter();
  }

  /** Refreshes this view's provider icon/tooltip to match current settings. */
  updateModeIndicator() {
    if (!this.modeToggleBtn) return;
    this.modeToggleBtn.empty();
    setIcon(this.modeToggleBtn, this.getProviderIcon());
    this.modeToggleBtn.title = this.getProviderInfo();
  }

  _updateTokenCounter() {
    // Always run — showTokenCounter only controls visibility of the widget,
    // not whether token data is tracked. If the counter element isn't visible
    // or doesn't exist yet, skip only the DOM update.
    if (!this.tokenCounter) return;
    if (!this.plugin.settings.showTokenCounter) return;

    const maxTokens = this.plugin.settings.max_tokens || 2048;

    // Read from the ACTIVE SESSION so the counter resets automatically when
    // the user switches to a different conversation or starts a new one.
    const session = this.plugin._sessionManager.getActive();
    const totalSpent = session?.tokensSpent || 0;
    const last = session?.lastRequestTokens || {};

    // Current input estimate (local — request not sent yet)
    const inputText = this.inputEl ? this.inputEl.value : '';
    const estimatedInput = estimateTokens(inputText);

    const providerName = this.getProviderName();

    if (this.tokenCounter) {
      this.tokenCounter.empty();
      const tokenIcon = this.tokenCounter.createSpan();
      setIcon(tokenIcon, 'binary');
      tokenIcon.style.display = 'flex';

      const tokenText = this.tokenCounter.createSpan();

      if (totalSpent > 0) {
        // Show accurate API-reported total tokens spent in this session.
        // If the last request used a local estimate, mark it with ~
        const session = this.plugin._sessionManager.getActive();
        const isEstimated = session?.lastRequestTokens?.estimated ?? false;
        const prefix = isEstimated ? '~' : '';
        tokenText.textContent = `${prefix}${totalSpent.toLocaleString()} tkns`;
        this.tokenCounter.title =
          `${providerName}\n` +
          `Session tokens${isEstimated ? ' (estimated)' : ' (API)'}: ${prefix}${totalSpent.toLocaleString()}\n` +
          `Last request — In: ${last.inputTokens ?? 0} | Out: ${last.outputTokens ?? 0} | Total: ${last.totalTokens ?? 0}${isEstimated ? ' (estimated)' : ''}\n` +
          `Current input estimate: ~${estimatedInput}\n` +
          `Max tokens per request: ${maxTokens}`;
      } else {
        // No requests in this session yet — show estimated input vs max
        tokenText.textContent = `~${estimatedInput}/${maxTokens}`;
        tokenText.style.fontSize = '1em';
        tokenText.style.marginTop = '5px';
        tokenText.style.fontWeight = '500';
        this.tokenCounter.title =
          `${providerName}\n` +
          `Estimated input tokens: ~${estimatedInput}\n` +
          `Max tokens per request: ${maxTokens}\n` +
          `(Accurate counts shown after first request)`;
      }

      // Colour hint based on last request total vs max
      const lastTotal = last.totalTokens ?? 0;
      if (lastTotal > maxTokens) {
        this.tokenCounter.style.color = 'var(--text-error)';
        this.tokenCounter.style.backgroundColor = 'rgba(var(--background-modifier-error-rgb), 0.2)';
      } else if (lastTotal > maxTokens * 0.8) {
        this.tokenCounter.style.color = 'var(--text-warning)';
        this.tokenCounter.style.backgroundColor = 'rgba(var(--background-modifier-warning-rgb), 0.2)';
      } else {
        this.tokenCounter.style.color = 'var(--text-muted)';
        this.tokenCounter.style.backgroundColor = 'transparent';
      }
    }
  }

  _renderMessages() {
    this.chatEl.empty();
    const s = this.plugin._sessionManager.getActive();
    if (!s) return;
    
    s.messages.forEach((m, idx) => this._appendBubble(m.role, m.content, m.attachments, idx));
    this.chatEl.scrollTop = this.chatEl.scrollHeight;

    // Refresh token counter so it reflects the newly active (or cleared) session
    this._updateTokenCounter();
  }

  /**
   * Builds the small "Copy" button shown under assistant responses.
   * Extracted so it can be attached both when messages are rendered from
   * saved history AND immediately after a streamed response finishes,
   * without needing a page refresh to appear.
   */
  /**
   * Sets an element's text direction to auto-detect RTL scripts (Arabic,
   * Hebrew, etc.). dir="auto" implements the Unicode "first strong
   * character" rule natively, and browsers re-evaluate it whenever the
   * element's text content changes — so this also keeps working correctly
   * as a streaming response grows.
   */
  _applyTextDirection(el, text) {
    applyAutoTextDirection(el);
  }

  _createResponseCopyBtn(text) {
    const copyBtn = document.createElement('button');
    copyBtn.className = 'ai-copy-btn';
    copyBtn.title = 'Copy response to clipboard';
    setIcon(copyBtn, 'copy');
    copyBtn.style.background = 'transparent';
    copyBtn.style.border = 'none';
    copyBtn.style.cursor = 'pointer';
    copyBtn.style.padding = '3px 6px';
    copyBtn.style.marginTop = '4px';
    copyBtn.style.color = 'var(--text-muted)';
    copyBtn.style.alignSelf = 'flex-end';
    copyBtn.style.display = 'flex';
    copyBtn.style.alignItems = 'center';
    copyBtn.style.gap = '4px';
    copyBtn.style.fontSize = '12px';
    copyBtn.style.borderRadius = '4px';
    copyBtn.style.opacity = '0.6';
    copyBtn.addEventListener('mouseenter', () => { copyBtn.style.opacity = '1'; });
    copyBtn.addEventListener('mouseleave', () => { copyBtn.style.opacity = '0.6'; });
    copyBtn.addEventListener('click', () => {
      navigator.clipboard.writeText(text);
      new Notice('✓ Copied to clipboard');
    });
    return copyBtn;
  }

  /**
   * Wires up "press and hold" (touch) and right-click (desktop) on a user
   * message bubble to open a small actions menu with Edit / Copy.
   *
   * Careful not to break ordinary text selection:
   *  - Desktop uses the native `contextmenu` event only, which fires
   *    independently of click-drag text selection.
   *  - Touch uses a timer that is cancelled the moment the finger moves
   *    more than a few pixels, so scrolling or drag-selecting text is
   *    never hijacked — only a genuine stationary long-press opens the menu.
   */
  _attachMessageActionHandlers(bubble, text, index, attachments = []) {
    bubble.style.cursor = 'pointer';

    // ── Desktop: right-click ────────────────────────────────────────────
    bubble.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      this._showMessageActionsMenu(e.clientX, e.clientY, text, index, attachments);
    });

    // ── Touch: press-and-hold ────────────────────────────────────────────
    let holdTimer = null;
    let startX = 0, startY = 0;
    const MOVE_CANCEL_THRESHOLD = 10; // px
    const HOLD_DURATION = 550; // ms

    const clearHold = () => {
      if (holdTimer) { clearTimeout(holdTimer); holdTimer = null; }
    };

    bubble.addEventListener('touchstart', (e) => {
      const t = e.touches[0];
      startX = t.clientX;
      startY = t.clientY;
      clearHold();
      holdTimer = setTimeout(() => {
        holdTimer = null;
        // Clear any in-progress native selection so the menu reads cleanly.
        window.getSelection?.()?.removeAllRanges?.();
        this._showMessageActionsMenu(startX, startY, text, index, attachments);
      }, HOLD_DURATION);
    }, { passive: true });

    bubble.addEventListener('touchmove', (e) => {
      const t = e.touches[0];
      if (Math.abs(t.clientX - startX) > MOVE_CANCEL_THRESHOLD ||
          Math.abs(t.clientY - startY) > MOVE_CANCEL_THRESHOLD) {
        clearHold(); // Finger is moving — likely scrolling or selecting, not holding
      }
    }, { passive: true });

    bubble.addEventListener('touchend', clearHold, { passive: true });
    bubble.addEventListener('touchcancel', clearHold, { passive: true });
  }

  /**
   * Shows a small floating menu with "Edit Message" and "Copy Message"
   * at the given screen coordinates.
   */
  _showMessageActionsMenu(x, y, text, index, attachments = []) {
    document.querySelectorAll('.ai-msg-ctx-menu').forEach(m => m.remove());

    const menu = document.createElement('div');
    menu.className = 'ai-msg-ctx-menu';
    menu.style.position = 'fixed';
    menu.style.background = 'var(--background-primary)';
    menu.style.border = '1px solid var(--background-modifier-border)';
    menu.style.borderRadius = '8px';
    menu.style.padding = '6px';
    menu.style.minWidth = '170px';
    menu.style.boxShadow = '0 6px 20px rgba(0,0,0,0.2)';
    menu.style.zIndex = '9999';

    const makeItem = (icon, label, onClick) => {
      const item = menu.createDiv({ cls: 'ai-msg-ctx-item' });
      item.style.display = 'flex';
      item.style.alignItems = 'center';
      item.style.gap = '8px';
      item.style.padding = '8px 10px';
      item.style.borderRadius = '5px';
      item.style.cursor = 'pointer';
      item.style.fontSize = '13px';
      item.style.color = 'var(--text-normal)';
      item.style.transition = 'background 0.1s';
      item.addEventListener('mouseenter', () => { item.style.background = 'var(--background-secondary)'; });
      item.addEventListener('mouseleave', () => { item.style.background = 'transparent'; });
      const ico = item.createSpan();
      setIcon(ico, icon);
      ico.style.display = 'flex';
      item.createSpan({ text: label });
      item.addEventListener('click', (ev) => {
        ev.stopPropagation();
        menu.remove();
        onClick();
      });
    };

    makeItem('pencil', 'Edit Message', () => {
      this._beginEditMessage(index, text, attachments);
    });

    makeItem('copy', 'Copy Message', () => {
      navigator.clipboard.writeText(text);
      new Notice('✓ Copied to clipboard');
    });

    makeItem('text-cursor-input', 'Select Text', () => {
      new SelectTextModal(this.app, text).open();
    });

    document.body.appendChild(menu);

    const menuX = Math.min(x, window.innerWidth - 185);
    menu.style.left = menuX + 'px';
    menu.style.top = y + 'px';

    requestAnimationFrame(() => {
      const mh = menu.offsetHeight;
      const adjustedY = Math.min(y, window.innerHeight - mh - 10);
      menu.style.top = Math.max(10, adjustedY) + 'px';
    });

    const closeCtx = (ev) => {
      if (!menu.contains(ev.target)) {
        menu.remove();
        document.removeEventListener('click', closeCtx);
        document.removeEventListener('touchstart', closeCtx);
      }
    };
    setTimeout(() => {
      document.addEventListener('click', closeCtx);
      document.addEventListener('touchstart', closeCtx);
    }, 10);
  }

  /**
   * Applies an edit to a previously-sent user message, discards the
   * conversation branch that followed it (the AI shouldn't "remember"
   * replies to a question that no longer exists in that form), then
   * resends using only the preceding context plus the edited message.
   */
  /**
   * Starts editing a previous user message inline, in the normal input box —
   * loading its text and attachments there so the user can attach/detach
   * files and edit normally, instead of a separate floating modal.
   */
  _beginEditMessage(index, text, attachments = []) {
    this._editingMessageIndex = index;
    this.pendingAttachments = [...(attachments || [])];
    this._pendingEditFiles = []; // this is unrelated to the "AI file edit" attach mode
    this.editMode = false;
    this._refreshEditModeBtn?.();

    this.inputEl.value = text || '';
    this.inputEl.focus();
    this.inputEl.setSelectionRange(this.inputEl.value.length, this.inputEl.value.length);
    this._updateTokenCounter?.();

    if (this.editingBanner) {
      this.editingBanner.style.display = 'flex';
      const count = this.pendingAttachments.length;
    }
    this.sendBtn.title = 'Save & Resend';
  }

  /** Cancels inline message editing and returns the input box to a normal compose state. */
  _cancelEditMessage() {
    this._editingMessageIndex = null;
    this.pendingAttachments = [];
    this.inputEl.value = '';
    this._updateTokenCounter?.();
    if (this.editingBanner) this.editingBanner.style.display = 'none';
    this.sendBtn.title = 'Send';
  }

  /** Commits an inline message edit (from the main input box) and resends it. */
  async _onSendEditedMessage() {
    const index = this._editingMessageIndex;
    const trimmed = this.inputEl.value.trim();
    const attachments = [...this.pendingAttachments];

    if (!trimmed && attachments.length === 0) {
      new Notice('Message cannot be empty');
      return;
    }

    this._cancelEditMessage(); // clear editing UI state before the resend starts streaming
    await this._editAndResend(index, trimmed, attachments);
  }

  async _editAndResend(index, newText, newAttachments) {
    const session = this.plugin._sessionManager.getActive();
    if (!session) return;

    const ok = this.plugin._sessionManager.editUserMessage(index, newText, newAttachments);
    if (!ok) { new Notice('⨉ Could not edit message'); return; }

    this.plugin.saveState();
    this._renderMessages(); // Rebuild the visible history up to the edited message
    this.plugin.refreshChatViews(this); // Keep sidebar/main page in sync too

    await this._generateAssistantResponse();
  }

  /**
   * Streams a fresh assistant reply for the current session state and
   * appends it to the chat. Shared by normal sending and by the
   * edit-and-resend flow so both get the same rendering, copy button,
   * error handling, and cross-view sync.
   */
  /**
   * Renders the in-progress streamed text as live Markdown instead of raw
   * text, so headings/bold/lists/etc. read properly *while* the response
   * is arriving rather than only after it finishes (previously the raw
   * "**", "#", "```" markers sat there unprocessed until the stream ended).
   *
   * Re-parsing full Markdown on every single token would be wasteful and
   * can visibly jank, so renders are throttled to roughly every 80ms —
   * fast enough to feel live, cheap enough not to strain slower devices.
   */
  _createStreamRenderer(streamingMsg) {
    const THROTTLE_MS = 80;
    // Maximum characters passed to MarkdownRenderer.render() in a single call.
    // MarkdownRenderer is synchronous and runs on the main thread; feeding it
    // very large strings (e.g. full file content inside a @@FILE_OP:edit@@ block)
    // causes multi-hundred-ms freezes. The cap keeps each render call fast.
    // finish() uses a higher cap so the complete final response is always shown.
    const RENDER_CAP_STREAMING = 8000;
    const RENDER_CAP_FINAL     = 32000;

    let lastRenderTime = 0;
    let scheduled = false;
    let pendingAcc = '';
    let rafPending = false;

    // All actual DOM work is deferred into a requestAnimationFrame callback so
    // it runs between paint frames and never blocks user input or the JS event
    // loop — even if the render itself takes longer than expected.
    const doRenderInRAF = (acc, cap) => {
      if (rafPending) return; // a frame is already queued with the latest acc
      rafPending = true;
      requestAnimationFrame(() => {
        rafPending = false;
        lastRenderTime = Date.now();
        const renderText = acc.length > cap
          ? acc.slice(0, cap) + '\u2026'
          : acc;
        streamingMsg.empty();
        MarkdownRenderer.render(this.app, renderText, streamingMsg, '', this.plugin);
        this._applyTextDirection(streamingMsg, acc);
      });
    };

    return {
      update: (acc) => {
        pendingAcc = acc;
        const elapsed = Date.now() - lastRenderTime;
        if (elapsed >= THROTTLE_MS) {
          doRenderInRAF(acc, RENDER_CAP_STREAMING);
        } else if (!scheduled) {
          scheduled = true;
          setTimeout(() => {
            scheduled = false;
            doRenderInRAF(pendingAcc, RENDER_CAP_STREAMING);
          }, THROTTLE_MS - elapsed);
        }
      },
      // Called once after streaming ends with the complete cleaned text.
      // Uses a higher cap so the full response is visible, and forces a new
      // RAF even if one is already pending (the final render must always run).
      finish: (finalAcc) => {
        rafPending = false; // allow a fresh frame even if one was in flight
        doRenderInRAF(finalAcc, RENDER_CAP_FINAL);
      }
    };
  }

  /**
   * Swaps the Send button's icon into a square "Stop" glyph (and back) to
   * reflect whether a response is currently being generated. The button
   * itself keeps its normal round shape and accent color — only the icon
   * inside changes. Called around every request made through
   * `_getAssistantReply`.
   */
  _setGeneratingState(isGenerating) {
    this._isGenerating = isGenerating;
    if (!this.sendBtn) return;

    if (isGenerating) {
      this.sendBtn.empty();
      this.sendBtn.createSpan({ text: '□', attr: { style: 'display:flex;align-items:center;justify-content:center;line-height:1;pointer-events:none;padding-top:5px;' } });
      this.sendBtn.title = 'Stop generating';
      this.sendBtn.classList.add('ai-send-btn-stop');
    } else {
      this.sendBtn.empty();
      this.sendBtn.createSpan({ text: '➤', attr: { style: 'display:flex;align-items:center;justify-content:center;line-height:1;pointer-events:none;padding-top:5px;' } });
      this.sendBtn.title = (this.editMode && this._pendingEditFiles.length > 0) ? 'Run AI file edits' : 'Send';
      this.sendBtn.classList.remove('ai-send-btn-stop');
      this._activeRequestInfo = null;
      this._stopRequested = false;
    }
  }

  /**
   * Called when the user clicks the Stop button while a response is being
   * generated. Immediately aborts the in-flight API request; the graceful
   * handling of whatever partial text had already arrived happens in
   * `_getAssistantReply` / the streaming plumbing, not here.
   */
  _stopGeneration() {
    if (!this._isGenerating) return;
    this._stopRequested = true;
    if (this._activeRequestInfo) {
      const { requestId, networkManager } = this._activeRequestInfo;
      networkManager.abortRequest(requestId, /* viaUserAction */ true);
    }
    // Reflect the stop immediately; _getAssistantReply's completion will
    // also call _setGeneratingState(false), but flipping it here too keeps
    // the button responsive even if the abort takes a moment to unwind.
    this.sendBtn.title = 'Stopping…';
  }

  /**
   * Gets the assistant's reply to `messages`, handling two cases:
   *  - File operations disabled: unchanged fast path — chunks stream live
   *    into `streamRenderer` as they arrive.
   *  - File operations enabled: the AI may need to look before it leaps
   *    (list a folder, read a file) before it can safely act — e.g. "rename
   *    these files based on their content" requires seeing them first. Raw
   *    replies in this mode may contain @@FILE_OP@@ syntax, so instead of
   *    streaming tokens straight into the bubble (which could flash that
   *    syntax on screen), we show a short status line, silently run any
   *    list/read ops the AI asks for, feed the results back, and repeat
   *    until it gives a real final answer (or we hit a safety cap) — then
   *    render that once, in full, with any create/edit/copy/move/rename
   *    ops applied and stripped out.
   *
   * @returns {Promise<{displayText: string, notices: string[]}|null>}
   */
  async _getAssistantReply(messages, streamingMsg, streamRenderer) {
    const fileOpsEnabled = this.plugin.settings.fileOpsScope && this.plugin.settings.fileOpsScope !== 'disabled';

    // ── Session-unlocked file bypass ─────────────────────────────────────
    // If the user previously used '✏ Edit instruction' in this conversation,
    // load the paths they attached at that time into vaultFileManager so the
    // AI can modify them for the duration of this request, even when they
    // would normally be outside the configured scope.
    const activeSession = this.plugin._sessionManager.getActive();
    const unlockedForSession = activeSession
      ? (this._sessionEditUnlockedFiles.get(activeSession.id) ?? new Set())
      : new Set();
    this.plugin.vaultFileManager.extraAllowedPaths = unlockedForSession;

    // Captures the {requestId, networkManager} for whatever request is
    // currently in flight, so the Stop button (_stopGeneration) can abort
    // exactly that request — whether it's streaming or a normal request.
    const onRequestStart = (info) => { this._activeRequestInfo = info; };

    if (!fileOpsEnabled) {
      let acc = '';
      let hasReceivedContent = false;
      const result = await this.plugin.apiManager.sendMessage({
        messages,
        temperature: this.plugin.settings.temperature,
        max_tokens: this.plugin.settings.max_tokens,
        stream: true
      }, {
        onChunk: (chunk) => {
          if (chunk && chunk.trim().length > 0) {
            acc += chunk;
            hasReceivedContent = true;
            streamRenderer.update(acc);
            this.chatEl.scrollTop = this.chatEl.scrollHeight;
          }
        },
        onRequestStart,
        timeoutMs: this.plugin.settings.timeoutMs
      });

      const finalText = (result && result.final) ? result.final : acc;
      if (!hasReceivedContent && finalText) {
        streamRenderer.finish(finalText);
        hasReceivedContent = true;
      }
      if (!hasReceivedContent && !finalText) {
        // Nothing arrived at all. If the user hit Stop before any tokens
        // (or, for a non-streaming provider, before the single response)
        // came back, this is an expected, silent no-op — not an error.
        this.plugin.vaultFileManager.extraAllowedPaths = new Set();
        return this._stopRequested ? { displayText: '', notices: [], stoppedEarly: true } : null;
      }

      const displayText = finalText || acc;
      streamRenderer.finish(displayText);
      this.plugin.vaultFileManager.extraAllowedPaths = new Set();
      return { displayText, notices: [] };
    }

    // ---- File-ops agent loop ----
    streamingMsg.innerHTML = '⏳ Thinking' + threeDots();
    let workingMessages = messages;
    let finalText = '';
    const MAX_ITERS = 6;

    // Accumulates ContextMemory metadata across all loop iterations so the
    // final saved message carries every file-path and op touched this turn.
    let accumulatedMemory = null;

    for (let i = 0; i < MAX_ITERS; i++) {
      let acc = '';
      // In file-ops mode we collect the full reply before deciding whether
      // to render it, because only the *final* iteration (the one that
      // contains no more query ops) should be streamed to the bubble.
      // Earlier iterations that consist entirely of list/read/search blocks
      // must not be streamed — they would flash raw @@FILE_OP@@ syntax and
      // internal AI command traffic to the user.
      //
      // We still update the bubble on each chunk during what may be a final
      // reply, but we defer that decision: if we later find the reply
      // contained only query ops we reset the bubble to the status line.
      let hasStreamedThisIter = false;
      const result = await this.plugin.apiManager.sendMessage({
        messages: workingMessages,
        temperature: this.plugin.settings.temperature,
        max_tokens: this.plugin.settings.max_tokens,
        stream: true
      }, {
        onChunk: (chunk) => {
          if (chunk) {
            acc += chunk;
            // Optimistically stream to the bubble so that genuine final
            // replies feel live. We reset the bubble below if it turns
            // out this was a query-only iteration. The render cap and
            // RAF scheduling are handled inside streamRenderer itself.
            streamRenderer.update(acc);
            hasStreamedThisIter = true;
            this.chatEl.scrollTop = this.chatEl.scrollHeight;
          }
        },
        onRequestStart,
        timeoutMs: this.plugin.settings.timeoutMs
      });
      finalText = (result && result.final) ? result.final : acc;

      // The user hit Stop mid-loop — stop iterating and surface whatever
      // partial text this round produced (may be empty), rather than
      // kicking off another request.
      if (this._stopRequested) break;

      if (!finalText) break;

      // Extract metadata from every @@FILE_OP@@ block *before* the text is
      // cleaned, so no path or operation information is lost in stripping.
      const iterMemory = ContextMemory.extractFromOps(finalText, accumulatedMemory);
      if (iterMemory) {
        accumulatedMemory = ContextMemory.mergeWithExisting(accumulatedMemory, iterMemory);
      }

      const queryBlock = await extractAndRunQueryOps(finalText, this.plugin.vaultFileManager);
      if (!queryBlock) break; // no list/read requests — this is the final answer

      if (i === MAX_ITERS - 1) {
        finalText += `\n\n_(Stopped after checking several files/folders — let me know if you'd like me to keep going.)_`;
        break;
      }

      // This was a query-only iteration (list/read/search) — reset the bubble
      // so any raw @@FILE_OP@@ syntax that was streamed optimistically above
      // is wiped from the UI before the next round.
      streamingMsg.empty();
      streamingMsg.textContent = '🔍 Checking your vault…';
      workingMessages = [
        ...workingMessages,
        { role: 'assistant', content: finalText },
        {
          role: 'user',
          content: `[Vault query results]\n\n${queryBlock}\n\nContinue the original request now that you have this information. Issue another list/read operation only if you still need more; otherwise complete the task.`
        }
      ];
    }

    if (!finalText) {
      this.plugin.vaultFileManager.extraAllowedPaths = new Set();
      return this._stopRequested ? { displayText: '', notices: [], stoppedEarly: true } : null;
    }

    const { cleanedText, notices, pendingEdits } = await applyFileOps(finalText, this.plugin.vaultFileManager);

    // Capture memory for any edit ops that applyFileOps deferred for diff review.
    if (pendingEdits && pendingEdits.length) {
      const editMemory = ContextMemory.extractFromOps(finalText, accumulatedMemory);
      if (editMemory) accumulatedMemory = ContextMemory.mergeWithExisting(accumulatedMemory, editMemory);
    }

    // Build the stored version: visible text + invisible metadata comment.
    const memoryTag = ContextMemory.encode(accumulatedMemory);
    const storedText = cleanedText + memoryTag;
    const displayText = cleanedText;

    streamRenderer.finish(displayText);

    // If any edit ops were deferred, open the diff review modal so the user
    // can inspect and approve the changes before they are written to the vault.
    // This matches the _onEditSend (Edit Mode) flow exactly.
    if (pendingEdits && pendingEdits.length > 0) {
      // Build FileDiff objects in the same shape DiffViewModal expects
      const fileDiffs = pendingEdits.map(pe => ({
        file:            pe.file,
        originalContent: pe.originalContent,
        newContent:      pe.newContent,
        diff:            DiffComputer.computeLineDiff(pe.originalContent, pe.newContent),
        selected:        true,
        chatMessage:     '',
        error:           null
      }));

      // Pre-select only files that actually have changes
      fileDiffs.forEach(fd => { fd.selected = DiffComputer.hasChanges(fd.diff); });

      const onDiffApply = (appliedFiles) => {
        if (!appliedFiles.length) return;
        // Deduplicate any prior diff-summary messages (same logic as _onEditSend)
        const activeSession = this.plugin._sessionManager.getActive();
        if (activeSession) {
          activeSession.messages = activeSession.messages.filter(m => !m.isDiffSummary);
        }
        const summary = [
          `✓ Applied AI edits to ${appliedFiles.length} file${appliedFiles.length !== 1 ? 's' : ''}:`,
          ...appliedFiles.map(f => `  **•** [[${f.path.slice(0, -3)}]]`)
        ].join('\n');
        this.plugin._sessionManager.addMessage('assistant', summary, [], { isDiffSummary: true });
        this.plugin.saveState();
        this._renderMessages();
        this.plugin.refreshChatViews(this);
      };

      this.plugin.setLastDiffReview(fileDiffs, onDiffApply);
      new DiffViewModal(this.app, this.plugin, fileDiffs, onDiffApply).open();
    }

    // Always clear the per-request bypass set after the turn completes so
    // it never bleeds into a different request, conversation, or session.
    this.plugin.vaultFileManager.extraAllowedPaths = new Set();

    return { displayText, storedText, notices, pendingEdits };
  }

  async _generateAssistantResponse() {
    const messages = this.plugin._sessionManager.getMessagesForRequest();

    // Give the AI file-operation instructions (syntax + scope + soul.md)
    // as an extra system message, only when the user has enabled it.
    // Also pass any session-unlocked paths so the AI knows it may modify them.
    const _activeForSys = this.plugin._sessionManager.getActive();
    const _unlockedForSys = _activeForSys
      ? (this._sessionEditUnlockedFiles.get(_activeForSys.id) ?? new Set())
      : new Set();
    const fileOpsMessage = await this.plugin.getFileOpsSystemMessage(_unlockedForSys);
    if (fileOpsMessage) {
      messages.unshift({ role: 'system', content: fileOpsMessage });
    }

    const msgContainer = this.chatEl.createDiv({ cls: `ai-msg-container assistant` });
    msgContainer.style.marginBottom = '16px';
    msgContainer.style.maxWidth = '88%';
    msgContainer.style.alignSelf = 'flex-end';

    const streamingMsg = msgContainer.createDiv({ cls: `ai-msg assistant` });
    streamingMsg.style.padding = '12px 16px';
    streamingMsg.style.borderRadius = '12px 12px 12px 4px';
    streamingMsg.style.border = '1px solid var(--background-modifier-border)';
    streamingMsg.style.background = 'var(--background-secondary)';
    streamingMsg.style.color = 'var(--text-normal)';
    streamingMsg.style.lineHeight = '1.5';
    streamingMsg.style.whiteSpace = 'pre-wrap';
    streamingMsg.style.wordBreak = 'break-word';
    streamingMsg.style.fontSize = '14px';
    streamingMsg.textContent = '';
    this._applyTextDirection(streamingMsg, '');

    this.chatEl.scrollTop = this.chatEl.scrollHeight;
    const streamRenderer = this._createStreamRenderer(streamingMsg);

    this._setGeneratingState(true);
    try {
      const reply = await this._getAssistantReply(messages, streamingMsg, streamRenderer);

      if (reply && reply.stoppedEarly && !reply.displayText) {
        // Stopped before any content arrived at all — nothing worth
        // keeping, so just remove the empty bubble rather than showing
        // an error or saving a blank assistant message.
        msgContainer.remove();
      } else if (reply) {
        reply.notices.forEach(n => new Notice(n));
        // Copy button gets the clean display text (no hidden comment).
        msgContainer.appendChild(this._createResponseCopyBtn(reply.displayText));

        // Persist storedText (clean text + invisible SYSTEM_MEMORY comment)
        // so the model retains file-path/op context across the pruning window.
        // Falls back to displayText on non-file-ops turns where storedText is
        // not set.
        const textToSave = reply.storedText ?? reply.displayText;
        this.plugin._sessionManager.addMessage('assistant', textToSave, []);
        this.plugin.saveState();
        this.plugin.refreshChatViews(this);
      } else {
        streamingMsg.textContent = '⨉ No response received';
      }
    } catch (e) {
      console.error("Chat Error:", e);

      let errorMessage = '⨉ Error occurred';
      if (e.message.includes('429')) {
        errorMessage = '⏳ Rate limit exceeded. Please wait a moment and try again Or Try changing the model.';
      } else if (e.message.includes('401') || e.message.includes('403')) {
        errorMessage = '🔐 Authentication failed. Please check your API key.';
      } else if (e.message.includes('timeout')) {
        errorMessage = '⏱️ Request timed out. Check your internet connection.';
      } else if (e.message.includes('fetch') || e.message.includes('Failed to fetch')) {
        errorMessage = '🌐 Cannot connect to Local AI. Please check if the server is running at ' + this.plugin.settings.baseUrl;
      } else {
        errorMessage = `⨉ Error: ${e.message}`;
      }

      streamingMsg.textContent = errorMessage;
      new Notice(errorMessage);

      const resendBtn = msgContainer.createEl('button', { cls: 'ai-resend-btn' });
      resendBtn.style.marginTop = '10px';
      resendBtn.style.padding = '6px 14px';
      resendBtn.style.borderRadius = '6px';
      resendBtn.style.border = '1px solid var(--background-modifier-border)';
      resendBtn.style.background = 'var(--background-primary)';
      resendBtn.style.color = 'var(--text-normal)';
      resendBtn.style.cursor = 'pointer';
      resendBtn.style.fontSize = '13px';
      resendBtn.style.display = 'flex';
      resendBtn.style.alignItems = 'center';
      resendBtn.style.gap = '6px';
      const rsIcon = resendBtn.createSpan();
      setIcon(rsIcon, 'refresh-cw');
      resendBtn.createSpan().textContent = 'Resend';

      resendBtn.addEventListener('click', () => {
        msgContainer.remove();
        this._generateAssistantResponse();
      });
    } finally {
      this._setGeneratingState(false);
    }
  }

  _appendBubble(role, text, attachments = [], index = -1) {
    const msgContainer = this.chatEl.createDiv({ cls: `ai-msg-container ${role}` });
    msgContainer.style.marginBottom = '16px';
    msgContainer.style.maxWidth = '88%';
    msgContainer.style.alignSelf = role === 'user' ? 'flex-start' : 'flex-end';
    
    const bubble = msgContainer.createDiv({ cls: `ai-msg ${role}` });
    bubble.style.padding = '12px 16px';
    bubble.style.borderRadius = role === 'user' ? '12px 12px 4px 12px' : '12px 12px 12px 4px';
    bubble.style.lineHeight = '1.5';
    bubble.style.whiteSpace = 'pre-wrap';
    bubble.style.wordBreak = 'break-word';
    bubble.style.fontSize = '14px';
    // Assistant text remains normally selectable. User bubbles are handled
    // differently: ordinary click-drag selection is turned off for them
    // (see the ".ai-msg.user" CSS rule) so long-press/right-click reliably
    // opens the actions menu instead of fighting with text selection. Users
    // can still select a user message's text via the "Select Text" option
    // in that menu, which opens it in a selectable popup.
    if (role === 'user') {
      bubble.style.userSelect = 'none';
      bubble.style.webkitUserSelect = 'none';
    } else {
      bubble.style.userSelect = 'text';
      bubble.style.webkitUserSelect = 'text';
    }
    // Automatically flip to RTL for Arabic/Hebrew (and other RTL scripts).
    // dir="auto" uses the browser's own "first strong character" detection,
    // so it adapts per-message regardless of the UI's own language.
    this._applyTextDirection(bubble, text);
    
    if (role === 'user') {
      bubble.style.background = 'var(--interactive-accent)';
      bubble.style.color = 'var(--text-on-accent)';
      bubble.textContent = text;

      // Press-and-hold (mobile) or right-click (desktop) opens a small
      // menu to edit or copy this message. Only attached to user messages
      // since those are the ones the user can meaningfully edit and resend.
      if (index >= 0) {
        this._attachMessageActionHandlers(bubble, text, index, attachments);
      }
    } else {
      bubble.style.border = '1px solid var(--background-modifier-border)';
      bubble.style.background = 'var(--background-secondary)';
      bubble.style.color = 'var(--text-normal)';
      // Strip the invisible SYSTEM_MEMORY comment before rendering so it
      // never appears in the chat UI, even when replaying saved history.
      // Obsidian's MarkdownRenderer already drops HTML comments, but
      // stripping here also keeps the copy-button text clean.
      const renderText = ContextMemory.strip(text);
      MarkdownRenderer.render(this.app, renderText, bubble, '', this.plugin);

      // Copy button — shown below each AI response; uses clean display text
      msgContainer.appendChild(this._createResponseCopyBtn(renderText));
    }
    
    if (attachments && attachments.length > 0) {
      const attachmentsContainer = msgContainer.createDiv({ cls: 'ai-attachments-container' });
      attachmentsContainer.style.marginTop = '8px';
      attachmentsContainer.style.padding = '10px';
      attachmentsContainer.style.background = 'rgba(var(--interactive-accent-rgb), 0.1)';
      attachmentsContainer.style.borderRadius = '8px';
      attachmentsContainer.style.border = '1px dashed var(--background-modifier-border)';
      
      attachmentsContainer.createEl('div', { 
        text: 'Attachments:', 
        cls: 'ai-attachments-title' 
      }).style.fontSize = '12px';
      
      attachments.forEach(attachment => {
        if (attachment.isImage && attachment.dataUrl) {
          // ── Image thumbnail ────────────────────────────────────────────
          const imgWrap = attachmentsContainer.createDiv({ cls: 'ai-attachment ai-attachment-img' });
          imgWrap.style.marginBottom  = '6px';
          imgWrap.style.borderRadius  = '8px';
          imgWrap.style.overflow      = 'hidden';
          imgWrap.style.border        = '1px solid var(--background-modifier-border)';
          imgWrap.style.display       = 'inline-block';
          imgWrap.style.maxWidth      = '180px';
          imgWrap.style.background    = 'var(--background-primary)';

          const thumb = imgWrap.createEl('img');
          thumb.src              = attachment.dataUrl;
          thumb.style.width      = '100%';
          thumb.style.maxHeight  = '120px';
          thumb.style.objectFit  = 'cover';
          thumb.style.display    = 'block';

          const nameEl = imgWrap.createEl('div', { text: attachment.name, cls: 'ai-attachment-name' });
          nameEl.style.fontSize     = '11px';
          nameEl.style.color        = 'var(--text-muted)';
          nameEl.style.padding      = '3px 6px';
          nameEl.style.overflow     = 'hidden';
          nameEl.style.textOverflow = 'ellipsis';
          nameEl.style.whiteSpace   = 'nowrap';
        } else {
          // ── File chip ──────────────────────────────────────────────────
          const attachmentEl = attachmentsContainer.createDiv({ cls: 'ai-attachment' });
          attachmentEl.style.display      = 'flex';
          attachmentEl.style.alignItems   = 'center';
          attachmentEl.style.padding      = '6px 8px';
          attachmentEl.style.background   = 'var(--background-primary)';
          attachmentEl.style.borderRadius = '6px';
          attachmentEl.style.marginBottom = '4px';
          attachmentEl.style.border       = '1px solid var(--background-modifier-border)';

          attachmentEl.createEl('div', {
            text: `${attachment.name}`,
            cls: 'ai-attachment-name'
          }).style.fontSize = '13px';
        }
      });
    }
    
    this.chatEl.scrollTop = this.chatEl.scrollHeight;
    return msgContainer;  // Return the outer container so callers can remove it on resend
  }

  async _onAttach() {
    // Determine if image analysis is enabled for the currently active provider
    const providerKey = this._activeProviderKey();
    const caps = this.plugin.settings.imageCapabilities?.[providerKey] || {};
    const imageAnalysisEnabled = !!caps.analysis;

    const modal = new AttachModal(this.app, async (choice, payload) => {
      if (!payload || !payload.length) {
        new Notice('Nothing selected');
        return;
      }

      // ── Image mode ──────────────────────────────────────────────────────
      if (choice === 'images') {
        // payload = [{ name, dataUrl, mimeType }, …]
        this.pendingAttachments = payload.map(img => ({
          name:     img.name,
          dataUrl:  img.dataUrl,
          mimeType: img.mimeType,
          isImage:  true
        }));
        this._pendingEditFiles = [];
        const count = this.pendingAttachments.length;
        new Notice(`✓ ${count} image${count !== 1 ? 's' : ''} ready to send`);
        this._refreshEditModeBtn?.();
        return;
      }

      // ── File / Folder mode ───────────────────────────────────────────────
      this.pendingAttachments = [];
      this._pendingEditFiles = [...payload];

      for (const f of payload) {
        try {
          const data = await this.app.vault.read(f);
          const trimmedContent = trimContent(data, 3500);
          this.pendingAttachments.push({
            name:    f.basename,
            path:    f.path,
            content: trimmedContent,
            isImage: false
          });
        } catch (e) {
          console.error(e);
          new Notice(`Error reading file: ${f.path}`);
        }
      }

      const attachmentCount = this.pendingAttachments.length;
      if (attachmentCount > 0) {
        new Notice(`✓ ${attachmentCount} file${attachmentCount > 1 ? 's' : ''} ready to attach`);
      }

      // Show/refresh the Edit Mode button now that files are loaded
      this._refreshEditModeBtn?.();
    }, imageAnalysisEnabled);
    modal.open();
  }

  /** Returns the settings key for the currently active provider. */
  _activeProviderKey() {
    const mode = this.plugin.settings.currentMode; // 'local' | 'cloud'
    if (mode === 'local') return 'local';
    const cloudType = this.plugin.settings.cloudApiType; // 'openai'|'gemini'|'anthropic'|'custom'
    return cloudType || 'openai';
  }


  async _onSend() {
    if (this._editingMessageIndex !== null) {
      return this._onSendEditedMessage();
    }

    const txt = this.inputEl.value.trim();
    if (!txt && this.pendingAttachments.length === 0) { 
      new Notice('Message is empty'); 
      return; 
    }
    
    let s = this.plugin._sessionManager.getActive();
    if (!s) { 
      this.plugin._sessionManager.create('New Conversation');
      s = this.plugin._sessionManager.getActive();
    }
    
    // Check if this is the first user message and conversation needs naming
    const isFirstMessage = s.messages.length === 0;
    const needsNaming = isFirstMessage && 
                        this.plugin.settings.autoNameConversations && 
                        !this.isNamingInProgress &&
                        (!s.name || s.name === 'New Conversation' || s.name === 'Default Conversation' || s.name.startsWith('Session '));
    
    // Add user message with attachments
    this.plugin._sessionManager.addMessage('user', txt, this.pendingAttachments);
    this.plugin.saveState();
    // Sync the sent message to any other open chat view (sidebar/main page)
    // right away, instead of waiting for the assistant's reply.
    this.plugin.refreshChatViews(this);
    
    // Display user message
    // Capture the user bubble so we can remove it on resend
    // Pass the message's index in the session so the long-press/right-click
    // edit menu is attached immediately (previously omitted, defaulting to
    // -1, so the menu only appeared after a full re-render such as
    // switching conversations and back).
    const userBubble = this._appendBubble('user', txt, this.pendingAttachments, s.messages.length - 1);

    // Clear input and attachments
    this.inputEl.value = '';
    const currentAttachments = [...this.pendingAttachments];
    this.pendingAttachments = [];

        // Auto-name the conversation if needed (Runs concurrently in the background)
    if (needsNaming) {
      this.isNamingInProgress = true;
      this.showNamingIndicator();

      this.plugin.generateConversationName(txt).then((generatedName) => {
        if (generatedName) {
          // Update the session name
          s.name = generatedName;
          this.plugin.saveState();
          new Notice(`✓ Conversation named: "${generatedName}"`);
        }
      }).catch((error) => {
        console.log("Auto-naming failed:", error);
        new Notice('Auto-naming failed — keeping default name', 3000);
      }).finally(() => {
        this.isNamingInProgress = false;
        this.hideNamingIndicator();
      });
    }

    const messages = this.plugin._sessionManager.getMessagesForRequest();
    // Pass session-unlocked paths so the AI is told it may modify them.
    const _unlockedForOnSend = s
      ? (this._sessionEditUnlockedFiles.get(s.id) ?? new Set())
      : new Set();
    const fileOpsMessage = await this.plugin.getFileOpsSystemMessage(_unlockedForOnSend);
    if (fileOpsMessage) {
      messages.unshift({ role: 'system', content: fileOpsMessage });
    }

    // Create an empty message container for streaming
    const msgContainer = this.chatEl.createDiv({ cls: `ai-msg-container assistant` });
    msgContainer.style.marginBottom = '16px';
    msgContainer.style.maxWidth = '88%';
    msgContainer.style.alignSelf = 'flex-end';
    
    const streamingMsg = msgContainer.createDiv({ cls: `ai-msg assistant` });
    streamingMsg.style.padding = '12px 16px';
    streamingMsg.style.borderRadius = '12px 12px 12px 4px';
    streamingMsg.style.border = '1px solid var(--background-modifier-border)';
    streamingMsg.style.background = 'var(--background-secondary)';
    streamingMsg.style.color = 'var(--text-normal)';
    streamingMsg.style.lineHeight = '1.5';
    streamingMsg.style.whiteSpace = 'pre-wrap';
    streamingMsg.style.wordBreak = 'break-word';
    streamingMsg.style.fontSize = '14px';
    streamingMsg.textContent = ''; // Start empty
    this._applyTextDirection(streamingMsg, '');
    const streamRenderer = this._createStreamRenderer(streamingMsg);
    
    this._setGeneratingState(true);
    try {
      const reply = await this._getAssistantReply(messages, streamingMsg, streamRenderer);

      if (reply && reply.stoppedEarly && !reply.displayText) {
        // Stopped before any content arrived at all — nothing worth
        // keeping, so just remove the empty bubble rather than showing
        // an error or saving a blank assistant message.
        msgContainer.remove();
      } else if (reply) {
        reply.notices.forEach(n => new Notice(n));

        // Copy button — previously only appeared after a manual refresh
        // because it was never attached to the live streaming bubble.
        // Always uses the clean display text (no hidden memory comment).
        msgContainer.appendChild(this._createResponseCopyBtn(reply.displayText));

        // Persist storedText (clean text + invisible SYSTEM_MEMORY comment)
        // so the model retains file-path/op context across the pruning window.
        // Falls back to displayText on non-file-ops turns where storedText is
        // not set.
        const textToSave = reply.storedText ?? reply.displayText;
        this.plugin._sessionManager.addMessage('assistant', textToSave, currentAttachments);
        this.plugin.saveState();
        // Sync the finished reply to any other open chat view.
        this.plugin.refreshChatViews(this);
      } else {
        // If no content at all, show an error
        streamingMsg.textContent = '⨉ No response received';
      }
      
    } catch (e) {
      console.error("Chat Error:", e);
      
      let errorMessage = '⨉ Error occurred';
      if (e.message.includes('429')) {
        errorMessage = '⏳ Rate limit exceeded. Please wait a moment and try again Or Try changing the model.';
      } else if (e.message.includes('401') || e.message.includes('403')) {
        errorMessage = '🔐 Authentication failed. Please check your API key.';
      } else if (e.message.includes('timeout')) {
        errorMessage = '⏱️ Request timed out. Check your internet connection.';
      } else if (e.message.includes('fetch') || e.message.includes('Failed to fetch')) {
        errorMessage = '🌐 Cannot connect to Local AI. Please check if the server is running at ' + this.plugin.settings.baseUrl;
      } else {
        errorMessage = `⨉ Error: ${e.message}`;
      }
      
      streamingMsg.textContent = errorMessage;
      new Notice(errorMessage);

      // ── Resend button ──────────────────────────────────────────────────
      const resendBtn = msgContainer.createEl('button', { cls: 'ai-resend-btn' });
      resendBtn.style.marginTop = '10px';
      resendBtn.style.padding = '6px 14px';
      resendBtn.style.borderRadius = '6px';
      resendBtn.style.border = '1px solid var(--background-modifier-border)';
      resendBtn.style.background = 'var(--background-primary)';
      resendBtn.style.color = 'var(--text-normal)';
      resendBtn.style.cursor = 'pointer';
      resendBtn.style.fontSize = '13px';
      resendBtn.style.display = 'flex';
      resendBtn.style.alignItems = 'center';
      resendBtn.style.gap = '6px';
      const rsIcon = resendBtn.createSpan();
      setIcon(rsIcon, 'refresh-cw');
      resendBtn.createSpan().textContent = 'Resend';

      resendBtn.addEventListener('click', () => {
        // Remove the error bubble and the user bubble from the DOM
        msgContainer.remove();
        if (userBubble) userBubble.remove();

        // Pop the last user message from session history so it isn't duplicated
        const activeSession = this.plugin._sessionManager.getActive();
        if (activeSession?.messages.length > 0) {
          const last = activeSession.messages[activeSession.messages.length - 1];
          if (last.role === 'user') activeSession.messages.pop();
        }

        // Restore the original text to the input and retry
        this.inputEl.value = txt;
        this.pendingAttachments = [...currentAttachments];
        this._onSend();
      });
    } finally {
      this._setGeneratingState(false);
    }
  }

  // ── AI File-Edit Pipeline ────────────────────────────────────────────────

  /**
   * Called when the user presses Send in Edit Mode.
   *
   * Flow:
   *   1. Validate that we have files and an instruction.
   *   2. Show a progress notice while the AI processes each file sequentially.
   *   3. Pass FileDiff[] to DiffViewModal for the user to review.
   *   4. On approval, vault.modify() is called inside DiffViewModal.apply().
   *   5. Post a short summary message in the chat thread so the conversation
   *      has a record of what the AI changed.
   */
  async _onEditSend() {
    const instruction = this.inputEl.value.trim();
    if (!instruction) {
      new Notice('Describe the edits you want the AI to make');
      return;
    }
    if (this._pendingEditFiles.length === 0) {
      new Notice('No files attached — use the + button to attach files or a folder');
      return;
    }

    // Capture state before clearing
    const files       = [...this._pendingEditFiles];
    const instruction_ = instruction;

    // Clear input immediately (same UX as normal send)
    this.inputEl.value      = '';
    this.pendingAttachments = [];
    this._pendingEditFiles  = [];
    this.editMode           = false;
    this._refreshEditModeBtn?.();

    // Show the user's instruction as a chat bubble so the thread makes sense
    const s = this.plugin._sessionManager.getActive()
      ?? (() => {
        this.plugin._sessionManager.create('New Conversation');
        return this.plugin._sessionManager.getActive();
      })();

    this.plugin._sessionManager.addMessage('user', `✏ Edit instruction:\n${instruction_}`, []);
    this._appendBubble('user', `✏ Edit instruction:\n${instruction_}`, [], s.messages.length - 1);
    this.plugin.saveState();

    // Record the attached files so subsequent natural-language requests in this
    // conversation can also modify them, even if they fall outside the
    // normally-permitted scope.  The set is keyed by session ID so switching
    // conversations never leaks permissions across them.
    {
      const sessionId = s.id;
      if (!this._sessionEditUnlockedFiles.has(sessionId)) {
        this._sessionEditUnlockedFiles.set(sessionId, new Set());
      }
      const unlockedSet = this._sessionEditUnlockedFiles.get(sessionId);
      for (const f of files) {
        const normalized = normalizeVaultPath(f.path);
        if (normalized) unlockedSet.add(normalized);
      }
    }

    // Progress indicator in the chat area
    const progressContainer = this.chatEl.createDiv({ cls: 'ai-msg-container assistant' });
    progressContainer.style.marginBottom = '12px';
    progressContainer.style.maxWidth     = '88%';
    progressContainer.style.alignSelf    = 'flex-end';

    const progressBubble = progressContainer.createDiv({ cls: 'ai-msg assistant' });
    progressBubble.style.padding         = '12px 16px';
    progressBubble.style.borderRadius    = '12px 12px 12px 4px';
    progressBubble.style.background      = 'var(--background-secondary)';
    progressBubble.style.color           = 'var(--text-muted)';
    progressBubble.style.fontSize        = '14px';
    progressBubble.style.fontStyle       = 'italic';
    progressBubble.style.display         = 'flex';
    progressBubble.style.alignItems      = 'center';
    progressBubble.style.justifyContent  = 'space-between';
    progressBubble.style.gap             = '10px';

    const progressText = progressBubble.createSpan();
    progressText.textContent = `⏳ Analysing ${files.length} file${files.length !== 1 ? 's' : ''}…`;

    // Only show a Stop control for batches big enough that cancelling is
    // actually useful — keeps the UI clean for single-file edits.
    let cancelled = false;
    if (files.length > 1) {
      const stopBtn = progressBubble.createEl('button', { text: 'Stop' });
      stopBtn.style.flexShrink   = '0';
      stopBtn.style.padding      = '4px 12px';
      stopBtn.style.fontSize     = '12px';
      stopBtn.style.fontStyle    = 'normal';
      stopBtn.style.borderRadius = '5px';
      stopBtn.style.border       = '1px solid var(--background-modifier-border)';
      stopBtn.style.background   = 'var(--background-primary)';
      stopBtn.style.color        = 'var(--text-normal)';
      stopBtn.style.cursor       = 'pointer';
      stopBtn.addEventListener('click', () => {
        cancelled = true;
        stopBtn.disabled = true;
        stopBtn.textContent = 'Stopping…';
      });
    }

    this.chatEl.scrollTop = this.chatEl.scrollHeight;

    let fileDiffs;
    try {
      const editor = new AIFileEditor(this.plugin);
      fileDiffs = await editor.editFiles(files, instruction_, (status) => {
        progressText.textContent = status;
        this.chatEl.scrollTop = this.chatEl.scrollHeight;
      }, {
        isCancelled: () => cancelled
      });
    } catch (e) {
      progressText.textContent = `⨉ Edit pipeline failed: ${e.message}`;
      progressBubble.style.color = 'var(--text-error)';
      new Notice(`AI edit failed: ${e.message}`);
      return;
    }

    // Remove the progress bubble — the DiffViewModal takes over from here
    progressContainer.remove();

    if (fileDiffs.length === 0) {
      new Notice('Stopped before any files were processed.');
      return;
    }

    const changedCount = fileDiffs.filter(d => DiffComputer.hasChanges(d.diff)).length;

    if (changedCount === 0) {
      // Nothing to review — surface a chat message and stop
      new Notice(`✓ AI reviewed ${files.length} file${files.length !== 1 ? 's' : ''} and found nothing to change for: _"${instruction_}"_`,);
      new Notice(`✓ AI reviewed ${files.length} file(s) and found nothing to change.`);
      return;
    }

    // Post per-file chat messages from the AI into the conversation thread.
    // Each FileDiff may carry a chatMessage the AI wrote alongside the edit.
    // Collect them into a single assistant bubble so the chat thread stays
    // readable without one bubble per file for large batches.
    const chatMessages = fileDiffs
      .filter(fd => fd.chatMessage)
      .map(fd => `**${fd.file.basename}:** ${fd.chatMessage}`);

    if (chatMessages.length > 0) {
      const combinedChat = chatMessages.join('\n\n');
      this.plugin._sessionManager.addMessage('assistant', combinedChat, []);
      this._appendBubble('assistant', combinedChat, []);
      this.plugin.saveState();
      this.chatEl.scrollTop = this.chatEl.scrollHeight;
    }

    // Open the diff review modal
    const onDiffApply = (appliedFiles) => {
      if (appliedFiles.length === 0) return;

      // Repeated Apply → Return to Original → Apply cycles (including via
      // the "reopen last diff review" button) previously kept adding a new
      // "✓ Applied AI edits..." message each time. Rather than tracking a
      // specific bubble/message object in memory — which breaks once a
      // *different* code path or view re-triggers this same callback —
      // tag every diff-summary message and always strip prior ones from
      // the session before adding the new one, then do a full re-render.
      // This is correct no matter which view or closure ends up calling it.
      const activeSession = this.plugin._sessionManager.getActive();
      if (activeSession) {
        activeSession.messages = activeSession.messages.filter(m => !m.isDiffSummary);
      }

      // Record the result in the conversation thread
      const summary = [
      `✓ Applied AI edits to ${appliedFiles.length} file${appliedFiles.length !== 1 ? 's' : ''}:`,
      ...appliedFiles.map(f => `  **•** [[${f.path.slice(0, -3)}]]`)
    ].join('\n');


      this.plugin._sessionManager.addMessage('assistant', summary, [], { isDiffSummary: true });
      this.plugin.saveState();

      // Re-render from the (now deduped) session data rather than manually
      // appending/removing DOM bubbles, so the view always matches what's
      // actually saved.
      this._renderMessages();
      this.plugin.refreshChatViews(this);
    };
    this.plugin.setLastDiffReview(fileDiffs, onDiffApply);
    new DiffViewModal(this.app, this.plugin, fileDiffs, onDiffApply).open();
  }
}


// ==================== CHAT PAGE VIEW (DEDICATED TAB) ====================

/**
 * A full-tab variant of ChatView that opens in the main content area.
 *
 * Inherits 100% of the UI and logic from ChatView.
 * The only differences are the three Obsidian identity methods below,
 * which give this view a distinct type/name/icon so that:
 *   - Both a sidebar leaf (ChatView) and a tab leaf (ChatPageView) can be
 *     open at the same time without conflicting.
 *   - Obsidian can restore each view independently after a restart.
 *   - refreshChatViews() and saveSettings() can target both with a
 *     single `instanceof ChatView` check (subclass satisfies the check).
 */
class ChatPageView extends ChatView {
  getViewType()    { return VIEW_TYPE_CHAT_PAGE; }
  getDisplayText() { return 'AI Chat'; }
  getIcon()        { return 'message-square'; }
}

// ==================== NAMING TEMPLATE MODAL ====================

/**
 * A dedicated modal for editing the auto-naming prompt template
 * and previewing results against a sample message.
 * Opened via the "Edit Template" button in Settings → Auto-Naming.
 */
class NamingTemplateModal extends Modal {
  constructor(app, plugin) {
    super(app);
    this.plugin = plugin;
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.style.padding = '24px';
    contentEl.style.minWidth = '560px';
    contentEl.style.maxWidth = '680px';

    // ── Header ──────────────────────────────────────────────────────────
    const header = contentEl.createEl('h2');
    header.style.display = 'flex';
    header.style.alignItems = 'center';
    header.style.gap = '10px';
    header.style.marginBottom = '20px';
    const hIcon = header.createSpan();
    setIcon(hIcon, 'type');
    header.appendChild(document.createTextNode('Auto-Naming Template'));

    // ── Template textarea ────────────────────────────────────────────────
    const templateLabel = contentEl.createEl('label', { text: 'Prompt Template:' });
    templateLabel.style.display = 'block';
    templateLabel.style.fontWeight = '600';
    templateLabel.style.marginBottom = '6px';

    const desc = contentEl.createEl('div', {
      text: '{{message}} is replaced with the first user message.'
    });
    desc.style.fontSize = '12px';
    desc.style.color = 'var(--text-muted)';
    desc.style.marginBottom = '10px';

    const textarea = contentEl.createEl('textarea');
    textarea.value = this.plugin.settings.namingPromptTemplate
      || 'Based on this first message, generate a very short, concise title (maximum 5-6 words) for a conversation. The title should capture the main topic or intent. Return ONLY the title, no quotes, no explanations, no extra text, no punctuation at the end.\n\nFirst message: "{{message}}"\n\nConversation title:';
    textarea.rows = 7;
    textarea.style.width = '100%';
    textarea.style.padding = '12px';
    textarea.style.borderRadius = '8px';
    textarea.style.border = '1px solid var(--background-modifier-border)';
    textarea.style.backgroundColor = 'var(--background-primary)';
    textarea.style.color = 'var(--text-normal)';
    textarea.style.fontFamily = 'monospace';
    textarea.style.fontSize = '13px';
    textarea.style.resize = 'vertical';
    textarea.style.marginBottom = '20px';

    // ── Provider + Model row ─────────────────────────────────────────────
    const providerRow = contentEl.createDiv();
    providerRow.style.display = 'flex';
    providerRow.style.gap = '16px';
    providerRow.style.marginBottom = '16px';

    // Provider dropdown
    const provWrap = providerRow.createDiv();
    provWrap.style.flex = '1';
    const provLabel = provWrap.createEl('label', { text: 'AI Provider for Naming:' });
    provLabel.style.display = 'block';
    provLabel.style.fontSize = '12px';
    provLabel.style.fontWeight = '600';
    provLabel.style.marginBottom = '6px';
    const providerSelect = provWrap.createEl('select');
    providerSelect.style.width = '100%';
    providerSelect.style.padding = '7px 10px';
    providerSelect.style.borderRadius = '6px';
    providerSelect.style.border = '1px solid var(--background-modifier-border)';
    providerSelect.style.backgroundColor = 'var(--background-secondary)';
    providerSelect.style.color = 'var(--text-normal)';
    providerSelect.style.fontSize = '13px';
    const providerOptions = [
      { value: 'default',   label: 'Default (use active provider)' },
      { value: 'local',     label: 'Local AI' },
      { value: 'openai',    label: 'OpenAI' },
      { value: 'gemini',    label: 'Gemini' },
      { value: 'anthropic', label: 'Anthropic (Claude)' },
      { value: 'custom',    label: 'Custom API' },
    ];
    const currentProvider = this.plugin.settings.namingProvider || 'default';
    providerOptions.forEach(({ value, label }) => {
      const opt = providerSelect.createEl('option', { value, text: label });
      if (value === currentProvider) opt.selected = true;
    });

    // Model text field
    const modelWrap = providerRow.createDiv();
    modelWrap.style.flex = '1';
    const modelLabel = modelWrap.createEl('label', { text: 'Model Override (optional):' });
    modelLabel.style.display = 'block';
    modelLabel.style.fontSize = '12px';
    modelLabel.style.fontWeight = '600';
    modelLabel.style.marginBottom = '6px';
    const modelInput = modelWrap.createEl('input', { type: 'text' });
    modelInput.value = this.plugin.settings.namingModel || '';
    modelInput.style.width = '100%';
    modelInput.style.padding = '7px 10px';
    modelInput.style.borderRadius = '6px';
    modelInput.style.border = '1px solid var(--background-modifier-border)';
    modelInput.style.backgroundColor = 'var(--background-secondary)';
    modelInput.style.color = 'var(--text-normal)';
    modelInput.style.fontSize = '13px';
    modelInput.style.fontFamily = 'monospace';

    // Update model placeholder text based on selected provider
    const PROVIDER_DEFAULTS = {
      default:   '(uses whatever the active provider has configured)',
      local:     this.plugin.settings.localModel || 'llama2',
      openai:    this.plugin.settings.openaiModel || 'gpt-3.5-turbo',
      gemini:    this.plugin.settings.geminiModel || 'gemini-1.5-flash',
      anthropic: this.plugin.settings.anthropicModel || 'claude-3-haiku-20240307',
      custom:    '(your custom model name)',
    };
    const updateModelPlaceholder = () => {
      modelInput.placeholder = PROVIDER_DEFAULTS[providerSelect.value]
        || '(provider default)';
    };
    providerSelect.addEventListener('change', updateModelPlaceholder);
    updateModelPlaceholder(); // Set on open

    // Hint below model field
    const modelHint = modelWrap.createEl('div', {
      text: "Leave empty to use the provider's configured model."
    });
    modelHint.style.fontSize = '11px';
    modelHint.style.color = 'var(--text-muted)';
    modelHint.style.marginTop = '5px';

    // ── Parameters row ───────────────────────────────────────────────────
    const paramsRow = contentEl.createDiv();
    paramsRow.style.display = 'flex';
    paramsRow.style.gap = '16px';
    paramsRow.style.marginBottom = '20px';

    const makeParamField = (label, key, type, min, max, step) => {
      const wrap = paramsRow.createDiv();
      wrap.style.flex = '1';
      const lbl = wrap.createEl('label', { text: label });
      lbl.style.display = 'block';
      lbl.style.fontSize = '12px';
      lbl.style.fontWeight = '600';
      lbl.style.marginBottom = '6px';
      const inp = wrap.createEl('input', { type });
      inp.value = this.plugin.settings[key] ?? '';
      if (type === 'range') {
        inp.min = min; inp.max = max; inp.step = step;
        const valDisplay = wrap.createEl('span', {
          text: ' ' + inp.value
        });
        valDisplay.style.fontSize = '12px';
        valDisplay.style.color = 'var(--text-muted)';
        inp.addEventListener('input', () => {
          valDisplay.textContent = ' ' + inp.value;
          this.plugin.settings[key] = parseFloat(inp.value);
        });
      } else {
        inp.style.width = '100%';
        inp.style.padding = '6px 10px';
        inp.style.borderRadius = '6px';
        inp.style.border = '1px solid var(--background-modifier-border)';
        inp.style.backgroundColor = 'var(--background-secondary)';
        inp.style.color = 'var(--text-normal)';
        inp.style.fontSize = '13px';
        inp.addEventListener('change', () => {
          this.plugin.settings[key] = parseFloat(inp.value);
        });
      }
      return inp;
    };

    makeParamField('Temperature', 'namingTemperature', 'number', 0, 1, 0.1);
    makeParamField('Max Tokens', 'namingMaxTokens', 'number', 5, 200, 1);
    makeParamField('Timeout (ms)', 'namingTimeoutMs', 'number', 1000, 60000, 1000);

    // ── Preview section ──────────────────────────────────────────────────
    const previewBox = contentEl.createDiv();
    previewBox.style.background = 'var(--background-secondary)';
    previewBox.style.borderRadius = '8px';
    previewBox.style.padding = '16px';
    previewBox.style.border = '1px solid var(--background-modifier-border)';
    previewBox.style.marginBottom = '20px';

    const previewTitle = previewBox.createEl('div', { text: 'Live Preview' });
    previewTitle.style.fontWeight = '600';
    previewTitle.style.marginBottom = '10px';

    const previewInput = previewBox.createEl('input', { type: 'text' });
    previewInput.placeholder = 'Enter a sample message to test naming…';
    previewInput.style.width = '100%';
    previewInput.style.padding = '8px 12px';
    previewInput.style.borderRadius = '6px';
    previewInput.style.border = '1px solid var(--background-modifier-border)';
    previewInput.style.backgroundColor = 'var(--background-primary)';
    previewInput.style.color = 'var(--text-normal)';
    previewInput.style.marginBottom = '10px';

    const previewResult = previewBox.createDiv();
    previewResult.style.fontSize = '14px';
    previewResult.style.minHeight = '32px';
    previewResult.style.color = 'var(--text-muted)';
    previewResult.textContent = 'Result will appear here…';

    const testBtn = previewBox.createEl('button');
    testBtn.style.padding = '7px 16px';
    testBtn.style.borderRadius = '6px';
    testBtn.style.border = '1px solid var(--background-modifier-border)';
    testBtn.style.background = 'var(--interactive-accent)';
    testBtn.style.color = 'var(--text-on-accent)';
    testBtn.style.cursor = 'pointer';
    testBtn.style.fontSize = '13px';
    const testIcon = testBtn.createSpan();
    setIcon(testIcon, 'play');
    testIcon.style.marginRight = '6px';
    testIcon.style.display = 'inline-flex';
    testIcon.style.verticalAlign = 'middle';
    testBtn.createSpan().textContent = 'Test Naming';

    testBtn.addEventListener('click', async () => {
      const msg = previewInput.value.trim();
      if (!msg) { new Notice('Enter a sample message first'); return; }
      testBtn.disabled = true;
      previewResult.textContent = 'Generating…';
      try {
        const result = await this.plugin.generateConversationName(msg);
        previewResult.textContent = result ? `"${result}"` : '(No result — check console)';
        previewResult.style.color = result ? 'var(--text-normal)' : 'var(--text-error)';
      } catch (e) {
        previewResult.textContent = '⨉ ' + e.message;
        previewResult.style.color = 'var(--text-error)';
      } finally {
        testBtn.disabled = false;
      }
    });

    // ── Reset to default button ─────────────────────────────────────────
    const resetBtn = contentEl.createEl('button', { text: 'Reset to Default' });
    resetBtn.style.padding = '7px 16px';
    resetBtn.style.borderRadius = '6px';
    resetBtn.style.border = '1px solid var(--background-modifier-border)';
    resetBtn.style.background = 'var(--background-secondary)';
    resetBtn.style.color = 'var(--text-normal)';
    resetBtn.style.cursor = 'pointer';
    resetBtn.style.fontSize = '13px';
    resetBtn.style.marginRight = '10px';
    resetBtn.addEventListener('click', () => {
      textarea.value = 'Based on this first message, generate a very short, concise title (maximum 5-6 words) for a conversation. The title should capture the main topic or intent. Return ONLY the title, no quotes, no explanations, no extra text, no punctuation at the end.\n\nFirst message: "{{message}}"\n\nConversation title:';
      new Notice('Template reset to default');
    });

    // ── Footer buttons ───────────────────────────────────────────────────
    const footer = contentEl.createDiv();
    footer.style.display = 'flex';
    footer.style.justifyContent = 'flex-end';
    footer.style.gap = '10px';
    footer.appendChild(resetBtn);

    const saveBtn = footer.createEl('button', { text: 'Save' });
    saveBtn.style.padding = '7px 20px';
    saveBtn.style.borderRadius = '6px';
    saveBtn.style.border = 'none';
    saveBtn.style.background = 'var(--interactive-accent)';
    saveBtn.style.color = 'var(--text-on-accent)';
    saveBtn.style.cursor = 'pointer';
    saveBtn.style.fontWeight = '600';
    saveBtn.style.fontSize = '13px';
    saveBtn.addEventListener('click', () => {
      this.plugin.settings.namingPromptTemplate = textarea.value;
      this.plugin.settings.namingProvider       = providerSelect.value;
      this.plugin.settings.namingModel          = modelInput.value.trim();
      this.plugin.saveSettings();
      new Notice('✓ Naming settings saved');
      this.close();
    });
  }
}

// ==================== SETTINGS MODAL ====================

class SettingsModal extends Modal {
  constructor(app, plugin) {
    super(app);
    this.plugin = plugin;
  }
  
  onOpen() {
    if (window.matchMedia('(orientation: landscape)').matches) {
     this.modalEl.style.width = '50%';
    }
    const { contentEl } = this;
    contentEl.empty();
    contentEl.style.minWidth = '100%';
    contentEl.style.maxWidth = '100%';
    const h2 = contentEl.createEl('h2');
    h2.style.display = 'flex';
    h2.style.alignItems = 'center';
    const h2Icon = h2.createSpan();
    setIcon(h2Icon, 'settings');
    h2Icon.style.marginRight = '8px';
    h2.appendChild(document.createTextNode('AI Assistant Settings'));
    
    const tabsContainer = contentEl.createDiv({ cls: 'ai-settings-tabs' });
    tabsContainer.style.display = 'flex';
    tabsContainer.style.gap = '8px';
    tabsContainer.style.marginBottom = '20px';
    tabsContainer.style.borderBottom = '1px solid var(--background-modifier-border)';
    tabsContainer.style.paddingBottom = '10px';
    tabsContainer.style.flexWrap = 'wrap';
    
    const localTab = tabsContainer.createEl('button', { cls: 'ai-tab-btn active' });
    const localIcon = localTab.createSpan();
    setIcon(localIcon, 'monitor-speaker');
    localIcon.style.marginRight = '6px';
    localIcon.style.display = 'inline-flex';
    localTab.appendChild(document.createTextNode('Local Model'));
    
    const cloudTab = tabsContainer.createEl('button', { cls: 'ai-tab-btn' });
    const cloudIcon = cloudTab.createSpan();
    setIcon(cloudIcon, 'server');
    cloudIcon.style.marginRight = '6px';
    cloudIcon.style.display = 'inline-flex';
    cloudTab.appendChild(document.createTextNode('Cloud Model'));
    
    const generalTab = tabsContainer.createEl('button', { cls: 'ai-tab-btn' });
    const generalIcon = generalTab.createSpan();
    setIcon(generalIcon, 'settings');
    generalIcon.style.marginRight = '6px';
    generalIcon.style.display = 'inline-flex';
    generalTab.appendChild(document.createTextNode('General'));
    
    const shortcutsTab = tabsContainer.createEl('button', { cls: 'ai-tab-btn' });
    const shortcutsIcon = shortcutsTab.createSpan();
    setIcon(shortcutsIcon, 'command');
    shortcutsIcon.style.marginRight = '6px';
    shortcutsIcon.style.display = 'inline-flex';
    shortcutsTab.appendChild(document.createTextNode('Shortcuts'));
    
    const conversationsTab = tabsContainer.createEl('button', { cls: 'ai-tab-btn' });
    const convIcon = conversationsTab.createSpan();
    setIcon(convIcon, 'message-square');
    convIcon.style.marginRight = '6px';
    convIcon.style.display = 'inline-flex';
    conversationsTab.appendChild(document.createTextNode('Conversations'));
    
    const namingTab = tabsContainer.createEl('button', { cls: 'ai-tab-btn' });
    const namingIcon = namingTab.createSpan();
    setIcon(namingIcon, 'type');
    namingIcon.style.marginRight = '6px';
    namingIcon.style.display = 'inline-flex';
    namingTab.appendChild(document.createTextNode('Auto-Naming'));

    const fileAccessTab = tabsContainer.createEl('button', { cls: 'ai-tab-btn' });
    const fileAccessIcon = fileAccessTab.createSpan();
    setIcon(fileAccessIcon, 'folder-cog');
    fileAccessIcon.style.marginRight = '6px';
    fileAccessIcon.style.display = 'inline-flex';
    fileAccessTab.appendChild(document.createTextNode('File Access'));
    
    [localTab, cloudTab, generalTab, shortcutsTab, conversationsTab, namingTab, fileAccessTab].forEach(tab => {
      tab.style.padding = '10px 16px';
      tab.style.border = 'none';
      tab.style.background = 'transparent';
      tab.style.color = 'var(--text-muted)';
      tab.style.cursor = 'pointer';
      tab.style.borderRadius = '6px';
      tab.style.fontSize = '14px';
      tab.style.display = 'flex';
      tab.style.alignItems = 'center';
    });
    
    const contentContainer = contentEl.createDiv({ cls: 'ai-settings-content' });
    contentContainer.style.maxHeight = '400px';
    contentContainer.style.overflowY = 'auto';
    contentContainer.style.paddingRight = '10px';
    contentContainer.style.marginBottom = '20px';
    
    this.showLocalSettings(contentContainer);
    
    localTab.addEventListener('click', () => {
      this.setActiveTab(localTab, [cloudTab, generalTab, shortcutsTab, conversationsTab, namingTab, fileAccessTab]);
      this.showLocalSettings(contentContainer);
    });
    
    cloudTab.addEventListener('click', () => {
      this.setActiveTab(cloudTab, [localTab, generalTab, shortcutsTab, conversationsTab, namingTab, fileAccessTab]);
      this.showCloudSettings(contentContainer);
    });
    
    generalTab.addEventListener('click', () => {
      this.setActiveTab(generalTab, [localTab, cloudTab, shortcutsTab, conversationsTab, namingTab, fileAccessTab]);
      this.showGeneralSettings(contentContainer);
    });
    
    shortcutsTab.addEventListener('click', () => {
      this.setActiveTab(shortcutsTab, [localTab, cloudTab, generalTab, conversationsTab, namingTab, fileAccessTab]);
      this.showShortcutsSettings(contentContainer);
    });
    
    conversationsTab.addEventListener('click', () => {
      this.setActiveTab(conversationsTab, [localTab, cloudTab, generalTab, shortcutsTab, namingTab, fileAccessTab]);
      this.showConversationsSettings(contentContainer);
    });
    
    namingTab.addEventListener('click', () => {
      this.setActiveTab(namingTab, [localTab, cloudTab, generalTab, shortcutsTab, conversationsTab, fileAccessTab]);
      this.showNamingSettings(contentContainer);
    });

    fileAccessTab.addEventListener('click', () => {
      this.setActiveTab(fileAccessTab, [localTab, cloudTab, generalTab, shortcutsTab, conversationsTab, namingTab]);
      this.showFileAccessSettings(contentContainer);
    });
  }

  setActiveTab(activeTab, otherTabs) {
    activeTab.classList.add('active');
    activeTab.style.background = 'var(--interactive-accent)';
    activeTab.style.color = 'var(--text-on-accent)';
    activeTab.style.fontWeight = '600';
    
    otherTabs.forEach(tab => {
      tab.classList.remove('active');
      tab.style.background = 'transparent';
      tab.style.color = 'var(--text-muted)';
      tab.style.fontWeight = 'normal';
    });
  }
  
  showLocalSettings(container) {
    container.empty();
    
    const section = container.createDiv({ cls: 'ai-settings-section' });
    section.style.background = 'var(--background-secondary)';
    section.style.borderRadius = '8px';
    section.style.padding = '20px';
    section.style.marginBottom = '20px';
    section.style.border = '1px solid var(--background-modifier-border)';
    
    const h3 = section.createEl('h3');
    h3.style.display = 'flex';
    h3.style.alignItems = 'center';
    const h3Icon = h3.createSpan();
    setIcon(h3Icon, 'monitor-speaker');
    h3Icon.style.marginRight = '8px';
    h3.appendChild(document.createTextNode('Local Model Configuration'));
    
    this.createInputField(section, 'Base URL:', 'baseUrl', this.plugin.settings.baseUrl, 'text', 'http://127.0.0.1:11434');
    this.createInputField(section, 'Endpoint:', 'localEndpoint', this.plugin.settings.localEndpoint, 'text', '/v1/chat/completions');
    this.createInputField(section, 'Model Name:', 'localModel', this.plugin.settings.localModel, 'text', 'llama2');
    
    this.createTestConnectionButton(section, () => new LocalAIProvider(this.plugin), 'local');
  }
  
  showCloudSettings(container) {
    container.empty();
    
    const apiTypeSection = container.createDiv({ cls: 'ai-settings-section' });
    apiTypeSection.style.background = 'var(--background-secondary)';
    apiTypeSection.style.borderRadius = '8px';
    apiTypeSection.style.padding = '20px';
    apiTypeSection.style.marginBottom = '20px';
    apiTypeSection.style.border = '1px solid var(--background-modifier-border)';
    
    const h3 = apiTypeSection.createEl('h3');
    h3.style.display = 'flex';
    h3.style.alignItems = 'center';
    const h3Icon = h3.createSpan();
    setIcon(h3Icon, 'server');
    h3Icon.style.marginRight = '8px';
    h3.appendChild(document.createTextNode('Cloud Provider Selection'));

    this.createAPITypeSelector(apiTypeSection);

    const settingsContainer = container.createDiv({ cls: 'ai-api-settings-container' });
    this.showSpecificAPISettings(settingsContainer);
  }

  createAPITypeSelector(container) {
    const row = container.createDiv({ cls: 'ai-api-type-selector' });
    row.style.display = 'flex';
    row.style.gap = '10px';
    row.style.marginBottom = '20px';
    row.style.flexWrap = 'wrap';

    const providers = [
      { id: 'openai', name: 'OpenAI', icon: 'cpu' },
      { id: 'gemini', name: 'Gemini', icon: 'sparkles' },
      { id: 'anthropic', name: 'Claude', icon: 'cloud' },
      { id: 'custom', name: 'Custom', icon: 'settings' }
    ];

    providers.forEach(provider => {
      const btn = row.createEl('button', {
        cls: `ai-provider-btn ${this.plugin.settings.cloudApiType === provider.id ? 'active' : ''}`
      });
      
      const iconSpan = btn.createSpan();
      setIcon(iconSpan, provider.icon);
      iconSpan.style.marginRight = '6px';
      iconSpan.style.display = 'inline-flex';
      iconSpan.style.verticalAlign = 'middle';
      
      const textSpan = btn.createSpan();
      textSpan.textContent = provider.name;
      textSpan.style.verticalAlign = 'middle';
      
      btn.style.flex = '1';
      btn.style.minWidth = '120px';
      btn.style.padding = '12px';
      btn.style.borderRadius = '8px';
      btn.style.border = '2px solid';
      btn.style.background = 'var(--background-secondary)';
      btn.style.color = 'var(--text-normal)';
      btn.style.cursor = 'pointer';
      btn.style.fontSize = '14px';
      btn.style.fontWeight = '600';
      
      if (this.plugin.settings.cloudApiType === provider.id) {
        btn.style.background = 'var(--background-primary)';
        btn.style.borderWidth = '3px';
      }

      btn.dataset.provider = provider.id;

      btn.addEventListener('click', () => {
        this.plugin.settings.cloudApiType = provider.id;
        
        document.querySelectorAll('.ai-provider-btn').forEach(b => {
          b.classList.remove('active');
          b.style.background = 'var(--background-secondary)';
          b.style.borderWidth = '2px';
        });
        
        btn.classList.add('active');
        btn.style.background = 'var(--background-primary)';
        btn.style.borderWidth = '3px';
        
        this.showSpecificAPISettings(document.querySelector('.ai-api-settings-container'));
      });
    });
  }

  showSpecificAPISettings(container) {
    container.empty();

    switch (this.plugin.settings.cloudApiType) {
      case 'openai':
        this.showOpenAISettings(container);
        break;
      case 'gemini':
        this.showGeminiSettings(container);
        break;
      case 'anthropic':
        this.showAnthropicSettings(container);
        break;
      case 'custom':
        this.showCustomSettings(container);
        break;
    }
  }

  showOpenAISettings(container) {
    const section = container.createDiv({ cls: 'ai-settings-section' });
    section.style.background = 'var(--background-secondary)';
    section.style.borderRadius = '8px';
    section.style.padding = '20px';
    section.style.marginBottom = '20px';
    section.style.border = '1px solid var(--background-modifier-border)';
    
    const h3 = section.createEl('h3');
    h3.style.display = 'flex';
    h3.style.alignItems = 'center';
    const h3Icon = h3.createSpan();
    setIcon(h3Icon, 'cpu');
    h3Icon.style.marginRight = '8px';
    h3.appendChild(document.createTextNode('OpenAI Configuration'));

    this.createInputField(section, 'API Key:', 'openaiApiKey', 
      this.plugin.settings.openaiApiKey, 'password');
    
    this.createInputField(section, 'Model:', 'openaiModel', 
      this.plugin.settings.openaiModel, 'text', 'gpt-3.5-turbo');
    
    this.createInputField(section, 'Custom Endpoint (optional):', 'openaiEndpoint', 
      this.plugin.settings.openaiEndpoint, 'text', 'https://api.openai.com/v1/chat/completions');
    
    this.createTestConnectionButton(section, () => new OpenAIProvider(this.plugin), 'openai');
  }
  
  showGeminiSettings(container) {
    const section = container.createDiv({ cls: 'ai-settings-section' });
    section.style.background = 'var(--background-secondary)';
    section.style.borderRadius = '8px';
    section.style.padding = '20px';
    section.style.marginBottom = '20px';
    section.style.border = '1px solid var(--background-modifier-border)';
    
    const h3 = section.createEl('h3');
    h3.style.display = 'flex';
    h3.style.alignItems = 'center';
    const h3Icon = h3.createSpan();
    setIcon(h3Icon, 'sparkles');
    h3Icon.style.marginRight = '8px';
    h3.appendChild(document.createTextNode('Google Gemini Configuration (Non-Streaming)'));
    
    this.createInputField(section, 'API Key:', 'geminiApiKey', 
      this.plugin.settings.geminiApiKey, 'password');
    
    this.createInputField(section, 'Model:', 'geminiModel', 
      this.plugin.settings.geminiModel, 'text', 'gemini-1.5-flash');
    
    this.createTestConnectionButton(section, () => new GeminiProvider(this.plugin), 'gemini');
  }

  showAnthropicSettings(container) {
    const section = container.createDiv({ cls: 'ai-settings-section' });
    section.style.background = 'var(--background-secondary)';
    section.style.borderRadius = '8px';
    section.style.padding = '20px';
    section.style.marginBottom = '20px';
    section.style.border = '1px solid var(--background-modifier-border)';
    
    const h3 = section.createEl('h3');
    h3.style.display = 'flex';
    h3.style.alignItems = 'center';
    const h3Icon = h3.createSpan();
    setIcon(h3Icon, 'cloud');
    h3Icon.style.marginRight = '8px';
    h3.appendChild(document.createTextNode('Anthropic Claude Configuration'));

    this.createInputField(section, 'API Key:', 'anthropicApiKey', 
      this.plugin.settings.anthropicApiKey, 'password');
    
    this.createInputField(section, 'Model:', 'anthropicModel', 
      this.plugin.settings.anthropicModel, 'text', 'claude-3-haiku-20240307');
    
    this.createTestConnectionButton(section, () => new AnthropicProvider(this.plugin), 'anthropic');
  }

  showCustomSettings(container) {
    const section = container.createDiv({ cls: 'ai-settings-section' });
    section.style.background = 'var(--background-secondary)';
    section.style.borderRadius = '8px';
    section.style.padding = '20px';
    section.style.marginBottom = '20px';
    section.style.border = '1px solid var(--background-modifier-border)';
    
    const h3 = section.createEl('h3');
    h3.style.display = 'flex';
    h3.style.alignItems = 'center';
    const h3Icon = h3.createSpan();
    setIcon(h3Icon, 'settings');
    h3Icon.style.marginRight = '8px';
    h3.appendChild(document.createTextNode('Custom API Configuration'));

    this.createInputField(section, 'API Key:', 'customApiKey', this.plugin.settings.customApiKey, 'password');
    this.createInputField(section, 'Model Name:', 'customModel', this.plugin.settings.customModel, 'text');
    this.createInputField(section, 'Endpoint URL:', 'customEndpoint', this.plugin.settings.customEndpoint, 'text');
    
    const row = section.createDiv({ cls: 'ai-settings-row' });
    row.style.marginBottom = '16px';
    
    row.createEl('label', { text: 'HTTP Headers (JSON):' }).style.display = 'block';
    
    const headersText = row.createEl('textarea', {
      text: this.plugin.settings.customHeaders || '{}',
      rows: 3
    });
    headersText.style.width = '100%';
    headersText.style.padding = '10px 14px';
    headersText.style.borderRadius = '8px';
    headersText.style.border = '1px solid var(--background-modifier-border)';
    headersText.style.backgroundColor = 'var(--background-primary)';
    headersText.style.color = 'var(--text-normal)';
    headersText.style.fontSize = '14px';
    headersText.style.fontFamily = 'monospace';
    headersText.addEventListener('change', (e) => {
      this.plugin.settings.customHeaders = e.target.value;
    });

    const row2 = section.createDiv({ cls: 'ai-settings-row' });
    row2.style.marginBottom = '16px';
    
    row2.createEl('label', { text: 'Body Template (JSON):' }).style.display = 'block';
    
    const templateText = row2.createEl('textarea', {
      text: this.plugin.settings.customBodyTemplate || '{"messages": {{messages}}, "model": "{{model}}"}',
      rows: 4
    });
    templateText.style.width = '100%';
    templateText.style.padding = '10px 14px';
    templateText.style.borderRadius = '8px';
    templateText.style.border = '1px solid var(--background-modifier-border)';
    templateText.style.backgroundColor = 'var(--background-primary)';
    templateText.style.color = 'var(--text-normal)';
    templateText.style.fontSize = '14px';
    templateText.style.fontFamily = 'monospace';
    templateText.addEventListener('change', (e) => {
      this.plugin.settings.customBodyTemplate = e.target.value;
    });

    this.createTestConnectionButton(section, () => new CustomProvider(this.plugin), 'custom');
  }

  showGeneralSettings(container) {
    container.empty();
    
    const section = container.createDiv({ cls: 'ai-settings-section' });
    section.style.background = 'var(--background-secondary)';
    section.style.borderRadius = '8px';
    section.style.padding = '20px';
    section.style.marginBottom = '20px';
    section.style.border = '1px solid var(--background-modifier-border)';
    
    const h3 = section.createEl('h3');
    h3.style.display = 'flex';
    h3.style.alignItems = 'center';
    const h3Icon = h3.createSpan();
    setIcon(h3Icon, 'settings');
    h3Icon.style.marginRight = '8px';
    h3.appendChild(document.createTextNode('General Settings'));
    
    this.createSliderField(section, 'Temperature:', 'temperature', this.plugin.settings.temperature, 0, 2, 0.1);
    this.createInputField(section, 'Max Tokens:', 'max_tokens', this.plugin.settings.max_tokens, 'number', '2048');
    this.createInputField(section, 'Conversations Folder:', 'conversationsFolder', this.plugin.settings.conversationsFolder, 'text', 'AI Conversations');
    this.createInputField(section, 'Timeout (ms):', 'timeoutMs', this.plugin.settings.timeoutMs, 'number', '120000');
    this.createCheckboxField(section, 'Auto-check health on startup:', 'autoCheckHealth', this.plugin.settings.autoCheckHealth);
    this.createCheckboxField(section, 'Show token counter:', 'showTokenCounter', this.plugin.settings.showTokenCounter);
    this.createCheckboxField(
      section,
      'Allow AI to edit notes directly (adds an "Apply to Note" button on every AI response):',
      'allowDirectEditing',
      this.plugin.settings.allowDirectEditing
    );
    this.createInputPositionSelector(section);
    this._createExportTemplateField(section);
  }

  _createExportTemplateField(container) {
    const row = container.createDiv({ cls: 'ai-settings-row' });
    row.style.marginBottom = '16px';

    const labelRow = row.createDiv();
    labelRow.style.display        = 'flex';
    labelRow.style.justifyContent = 'space-between';
    labelRow.style.alignItems     = 'baseline';
    labelRow.style.marginBottom   = '6px';

    labelRow.createEl('label', { text: 'Markdown Export Template:' }).style.fontWeight = '600';

    const resetBtn = labelRow.createEl('button', { text: 'Reset to default' });
    resetBtn.style.fontSize       = '12px';
    resetBtn.style.padding        = '2px 8px';
    resetBtn.style.cursor         = 'pointer';
    resetBtn.style.borderRadius   = '4px';
    resetBtn.style.border         = '1px solid var(--background-modifier-border)';
    resetBtn.style.background     = 'var(--background-secondary)';
    resetBtn.style.color          = 'var(--text-muted)';

    const hint = row.createEl('p');
    hint.style.fontSize   = '12px';
    hint.style.color      = 'var(--text-muted)';
    hint.style.marginTop  = '0';
    hint.style.marginBottom = '6px';
    hint.innerHTML =
      'Supported tags (case-insensitive): ' +
      '<code>{{title}}</code>, <code>{{system_prompt}}</code>, <code>{{messages}}</code>, ' +
      '<code>{{ai_response}}</code>, <code>{{us_question}}</code>, ' +
      '<code>{{S-loop}}</code> … <code>{{E-loop}}</code>. ' +
      'Leave empty to use the built-in default.';

    const textarea = row.createEl('textarea');
    textarea.value       = this.plugin.settings.markdownExportTemplate || '';
    textarea.placeholder = MarkdownTemplateEngine.DEFAULT_TEMPLATE;
    textarea.rows        = 14;
    textarea.style.width          = '100%';
    textarea.style.padding        = '10px 14px';
    textarea.style.borderRadius   = '8px';
    textarea.style.border         = '1px solid var(--background-modifier-border)';
    textarea.style.backgroundColor = 'var(--background-primary)';
    textarea.style.color          = 'var(--text-normal)';
    textarea.style.fontSize       = '13px';
    textarea.style.fontFamily     = 'var(--font-monospace)';
    textarea.style.resize         = 'vertical';
    textarea.style.boxSizing      = 'border-box';

    textarea.addEventListener('change', (e) => {
      this.plugin.settings.markdownExportTemplate = e.target.value;
    });

    resetBtn.addEventListener('click', () => {
      this.plugin.settings.markdownExportTemplate = '';
      textarea.value = '';
      new Notice('Export template reset to default.');
    });
  }

  showShortcutsSettings(container) {
    container.empty();
    
    const section = container.createDiv({ cls: 'ai-settings-section' });
    section.style.background    = 'var(--background-secondary)';
    section.style.borderRadius  = '8px';
    section.style.padding       = '20px';
    section.style.marginBottom  = '20px';
    section.style.border        = '1px solid var(--background-modifier-border)';
    
    const h3 = section.createEl('h3');
    h3.style.display    = 'flex';
    h3.style.alignItems = 'center';
    const h3Icon = h3.createSpan();
    setIcon(h3Icon, 'command');
    h3Icon.style.marginRight = '8px';
    h3.appendChild(document.createTextNode('Keyboard Shortcuts'));

    // Sub-heading that explains the toggle column
    const subHint = section.createDiv();
    subHint.style.fontSize    = '12px';
    subHint.style.color       = 'var(--text-muted)';
    subHint.style.marginBottom = '16px';
    subHint.style.marginTop   = '-4px';
    subHint.textContent       = 'Use the toggle on the right to show or hide each item in the ⌘ command menu.';

    this.createShortcutField(section, 'New Conversation:',    'newConversation',    this.plugin.settings.shortcuts.newConversation);
    this.createShortcutField(section, 'Save Conversation:',   'saveConversation',   this.plugin.settings.shortcuts.saveConversation);
    this.createShortcutField(section, 'Rename Conversation:', 'renameConversation', this.plugin.settings.shortcuts.renameConversation || 'Ctrl+Shift+R');
    this.createShortcutField(section, 'Open Settings:',       'settings',           this.plugin.settings.shortcuts.settings);
    this.createShortcutField(section, 'Open Chat Page:',      'openChatPage',       'Ctrl+Shift+O');
    this.createShortcutField(section, 'Ask Selection:',       'askSelection',       this.plugin.settings.shortcuts.askSelection  || 'Ctrl+Shift+A');
    this.createShortcutField(section, 'Edit Selection:',      'editSelection',      this.plugin.settings.shortcuts.editSelection || 'Ctrl+Shift+E');
    
    const info = section.createDiv({ cls: 'ai-shortcuts-info' });
    info.style.background   = 'var(--background-primary)';
    info.style.borderRadius = '8px';
    info.style.padding      = '12px';
    info.style.marginTop    = '16px';
    info.style.border       = '1px solid var(--background-modifier-border)';
    info.style.fontSize     = '12px';
    info.style.color        = 'var(--text-muted)';
    info.innerHTML = '<p><strong>Note:</strong> Use Ctrl for Windows/Linux, Cmd for Mac. Examples: Ctrl+Shift+N, Cmd+Shift+N</p>';
  }

  showFileAccessSettings(container) {
    container.empty();

    // ---- Scope section ----
    const scopeSection = container.createDiv({ cls: 'ai-settings-section' });
    scopeSection.style.background = 'var(--background-secondary)';
    scopeSection.style.borderRadius = '8px';
    scopeSection.style.padding = '20px';
    scopeSection.style.marginBottom = '20px';
    scopeSection.style.border = '1px solid var(--background-modifier-border)';

    const scopeH3 = scopeSection.createEl('h3');
    scopeH3.style.display = 'flex';
    scopeH3.style.alignItems = 'center';
    const scopeIcon = scopeH3.createSpan();
    setIcon(scopeIcon, 'folder-cog');
    scopeIcon.style.marginRight = '8px';
    scopeH3.appendChild(document.createTextNode('AI File Operations'));

    const scopeHint = scopeSection.createEl('p');
    scopeHint.style.fontSize = '13px';
    scopeHint.style.color = 'var(--text-muted)';
    scopeHint.style.marginTop = '0';
    scopeHint.textContent = 'Lets the AI create, edit, copy, move, or rename files in your vault when you explicitly ask it to — for example "save that script as tts.js" or "move my draft into the Projects folder".';

    const scopeRow = scopeSection.createDiv({ cls: 'ai-settings-row' });
    scopeRow.style.marginBottom = '16px';
    scopeRow.createEl('label', { text: 'Access level:' }).style.display = 'block';

    const scopeSelect = scopeRow.createEl('select');
    scopeSelect.style.width = '100%';
    scopeSelect.style.padding = '8px';
    scopeSelect.style.marginTop = '6px';
    scopeSelect.style.borderRadius = '6px';
    scopeSelect.style.border = '1px solid var(--background-modifier-border)';
    scopeSelect.style.backgroundColor = 'var(--background-primary)';
    scopeSelect.style.color = 'var(--text-normal)';

    [
      { value: 'disabled', text: 'Disabled — the AI cannot touch any files' },
      { value: 'restricted', text: 'Restricted — only inside paths you choose' },
      { value: 'full', text: 'Full vault access (with optional exceptions)' }
    ].forEach(opt => {
      const optEl = scopeSelect.createEl('option', { value: opt.value, text: opt.text });
      if ((this.plugin.settings.fileOpsScope || 'disabled') === opt.value) optEl.selected = true;
    });

    // Allowed paths (restricted mode) — one vault-relative path per line.
    // Anything inside any of these paths is allowed; everything else is rejected.
    const allowedRow = scopeSection.createDiv({ cls: 'ai-settings-row' });
    allowedRow.style.marginBottom = '4px';
    allowedRow.style.display = (this.plugin.settings.fileOpsScope === 'restricted') ? 'block' : 'none';
    allowedRow.createEl('label', { text: 'Allowed paths (one per line):' }).style.display = 'block';

    const allowedTextarea = allowedRow.createEl('textarea', {
      text: (this.plugin.settings.fileOpsPaths || []).join('\n'),
      attr: { rows: 4, placeholder: 'AI Files\nProjects/Scripts' }
    });
    allowedTextarea.style.width = '100%';
    allowedTextarea.style.padding = '10px 14px';
    allowedTextarea.style.marginTop = '6px';
    allowedTextarea.style.borderRadius = '8px';
    allowedTextarea.style.border = '1px solid var(--background-modifier-border)';
    allowedTextarea.style.backgroundColor = 'var(--background-primary)';
    allowedTextarea.style.color = 'var(--text-normal)';
    allowedTextarea.style.fontSize = '14px';
    allowedTextarea.style.fontFamily = 'monospace';
    allowedTextarea.style.boxSizing = 'border-box';
    allowedTextarea.addEventListener('change', (e) => {
      this.plugin.settings.fileOpsPaths = e.target.value.split('\n').map(s => s.trim()).filter(Boolean);
      this.plugin.saveSettings();
    });

    const allowedHint = allowedRow.createEl('p');
    allowedHint.style.fontSize = '12px';
    allowedHint.style.color = 'var(--text-muted)';
    allowedHint.style.marginBottom = '0';
    allowedHint.textContent = 'The AI can create, edit, copy, move, or search anything inside these folders (and their subfolders). Everything else in the vault is off-limits.';

    // Excluded paths (full-access mode) — one vault-relative path per line.
    // Everything is allowed except anything inside these paths.
    const excludedRow = scopeSection.createDiv({ cls: 'ai-settings-row' });
    excludedRow.style.marginBottom = '4px';
    excludedRow.style.marginTop = '12px';
    excludedRow.style.display = (this.plugin.settings.fileOpsScope === 'full') ? 'block' : 'none';
    excludedRow.createEl('label', { text: 'Excluded paths (optional, one per line):' }).style.display = 'block';

    const excludedTextarea = excludedRow.createEl('textarea', {
      text: (this.plugin.settings.fileOpsExcludedPaths || []).join('\n'),
      attr: { rows: 3, placeholder: 'Private\nFinances/Taxes' }
    });
    excludedTextarea.style.width = '100%';
    excludedTextarea.style.padding = '10px 14px';
    excludedTextarea.style.marginTop = '6px';
    excludedTextarea.style.borderRadius = '8px';
    excludedTextarea.style.border = '1px solid var(--background-modifier-border)';
    excludedTextarea.style.backgroundColor = 'var(--background-primary)';
    excludedTextarea.style.color = 'var(--text-normal)';
    excludedTextarea.style.fontSize = '14px';
    excludedTextarea.style.fontFamily = 'monospace';
    excludedTextarea.style.boxSizing = 'border-box';
    excludedTextarea.addEventListener('change', (e) => {
      this.plugin.settings.fileOpsExcludedPaths = e.target.value.split('\n').map(s => s.trim()).filter(Boolean);
      this.plugin.saveSettings();
    });

    const excludedHint = excludedRow.createEl('p');
    excludedHint.style.fontSize = '12px';
    excludedHint.style.color = 'var(--text-muted)';
    excludedHint.style.marginBottom = '0';
    excludedHint.textContent = 'Leave blank to give the AI access to your entire vault. Anything listed here (and its subfolders) will be invisible to it — it won\'t see these files in listings, searches, or reads.';

    scopeSelect.addEventListener('change', (e) => {
      this.plugin.settings.fileOpsScope = e.target.value;
      allowedRow.style.display = (e.target.value === 'restricted') ? 'block' : 'none';
      excludedRow.style.display = (e.target.value === 'full') ? 'block' : 'none';
      this.plugin.saveSettings();
    });

    // ---- soul.md section ----
    const soulSection = container.createDiv({ cls: 'ai-settings-section' });
    soulSection.style.background = 'var(--background-secondary)';
    soulSection.style.borderRadius = '8px';
    soulSection.style.padding = '20px';
    soulSection.style.marginBottom = '20px';
    soulSection.style.border = '1px solid var(--background-modifier-border)';

    const soulH3 = soulSection.createEl('h3');
    soulH3.style.display = 'flex';
    soulH3.style.alignItems = 'center';
    const soulIcon = soulH3.createSpan();
    setIcon(soulIcon, 'file-heart');
    soulIcon.style.marginRight = '8px';
    soulH3.appendChild(document.createTextNode('soul.md'));

    const soulHint = soulSection.createEl('p');
    soulHint.style.fontSize = '13px';
    soulHint.style.color = 'var(--text-muted)';
    soulHint.style.marginTop = '0';
    soulHint.textContent = 'Read by the AI before any file operation. Use it to describe how you want files created, named, organized, and handled.';

    const soulSourceRow = soulSection.createDiv({ cls: 'ai-settings-row' });
    soulSourceRow.style.marginBottom = '16px';
    soulSourceRow.createEl('label', { text: 'Source:' }).style.display = 'block';

    const soulSourceSelect = soulSourceRow.createEl('select');
    soulSourceSelect.style.width = '100%';
    soulSourceSelect.style.padding = '8px';
    soulSourceSelect.style.marginTop = '6px';
    soulSourceSelect.style.borderRadius = '6px';
    soulSourceSelect.style.border = '1px solid var(--background-modifier-border)';
    soulSourceSelect.style.backgroundColor = 'var(--background-primary)';
    soulSourceSelect.style.color = 'var(--text-normal)';

    [
      { value: 'inline', text: 'Edit here in Settings' },
      { value: 'file', text: 'Read from a file in my vault' }
    ].forEach(opt => {
      const optEl = soulSourceSelect.createEl('option', { value: opt.value, text: opt.text });
      if ((this.plugin.settings.soulMdSource || 'inline') === opt.value) optEl.selected = true;
    });

    const inlineRow = soulSection.createDiv({ cls: 'ai-settings-row' });
    inlineRow.style.display = (this.plugin.settings.soulMdSource === 'file') ? 'none' : 'block';
    inlineRow.style.marginBottom = '10px';

    const inlineTextarea = inlineRow.createEl('textarea', {
      text: this.plugin.settings.soulMdInline?.trim() ? this.plugin.settings.soulMdInline : DEFAULT_SOUL_MD,
      rows: 10
    });
    inlineTextarea.style.width = '100%';
    inlineTextarea.style.padding = '10px 14px';
    inlineTextarea.style.marginTop = '6px';
    inlineTextarea.style.borderRadius = '8px';
    inlineTextarea.style.border = '1px solid var(--background-modifier-border)';
    inlineTextarea.style.backgroundColor = 'var(--background-primary)';
    inlineTextarea.style.color = 'var(--text-normal)';
    inlineTextarea.style.fontSize = '13px';
    inlineTextarea.style.fontFamily = 'monospace';
    inlineTextarea.style.boxSizing = 'border-box';
    inlineTextarea.addEventListener('change', (e) => {
      this.plugin.settings.soulMdInline = e.target.value;
      this.plugin.saveSettings();
    });

    const fileRow = soulSection.createDiv({ cls: 'ai-settings-row' });
    fileRow.style.display = (this.plugin.settings.soulMdSource === 'file') ? 'block' : 'none';
    fileRow.createEl('label', { text: 'Vault path to soul.md:' }).style.display = 'block';

    const filePathInput = fileRow.createEl('input', {
      type: 'text',
      value: this.plugin.settings.soulMdFilePath || this.plugin.defaultSoulMdPath,
      placeholder: this.plugin.defaultSoulMdPath
    });
    filePathInput.style.width = '100%';
    filePathInput.style.padding = '10px 14px';
    filePathInput.style.marginTop = '6px';
    filePathInput.style.borderRadius = '8px';
    filePathInput.style.border = '1px solid var(--background-modifier-border)';
    filePathInput.style.backgroundColor = 'var(--background-primary)';
    filePathInput.style.color = 'var(--text-normal)';
    filePathInput.style.fontSize = '14px';
    filePathInput.style.boxSizing = 'border-box';
    filePathInput.addEventListener('change', (e) => {
      this.plugin.settings.soulMdFilePath = e.target.value.trim();
      this.plugin.saveSettings();
    });

    const fileHint = fileRow.createEl('p');
    fileHint.style.fontSize = '12px';
    fileHint.style.color = 'var(--text-muted)';
    fileHint.textContent = 'If this file doesn\'t exist yet, it will be created automatically with the default principles below the first time it\'s needed.';

    soulSourceSelect.addEventListener('change', (e) => {
      this.plugin.settings.soulMdSource = e.target.value;
      inlineRow.style.display = (e.target.value === 'file') ? 'none' : 'block';
      fileRow.style.display = (e.target.value === 'file') ? 'block' : 'none';
      this.plugin.saveSettings();
    });
  }

  showNamingSettings(container) {
    container.empty();
    
    const section = container.createDiv({ cls: 'ai-settings-section' });
    section.style.background = 'var(--background-secondary)';
    section.style.borderRadius = '8px';
    section.style.padding = '20px';
    section.style.marginBottom = '20px';
    section.style.border = '1px solid var(--background-modifier-border)';
    
    const h3 = section.createEl('h3');
    h3.style.display = 'flex';
    h3.style.alignItems = 'center';
    const h3Icon = h3.createSpan();
    setIcon(h3Icon, 'type');
    h3Icon.style.marginRight = '8px';
    h3.appendChild(document.createTextNode('Auto-Naming Settings'));
    
    // Auto-naming toggle
    this.createCheckboxField(section, 'Enable auto-naming of conversations', 'autoNameConversations', this.plugin.settings.autoNameConversations);
    
    // Model and Provider Inline Settings
    const modelSection = section.createDiv({ cls: 'ai-settings-subsection' });
    modelSection.style.marginTop = '20px';
    modelSection.style.padding = '16px';
    modelSection.style.background = 'var(--background-primary)';
    modelSection.style.borderRadius = '8px';
    modelSection.style.border = '1px solid var(--background-modifier-border)';

    // Provider Selection
    const providerWrap = modelSection.createDiv();
    providerWrap.style.marginBottom = '15px';
    const providerLabel = providerWrap.createEl('div', { text: 'Naming Provider', cls: 'ai-settings-label' });
    providerLabel.style.fontWeight = '600';
    providerLabel.style.marginBottom = '6px';

    const providerSelect = providerWrap.createEl('select');
    providerSelect.style.width = '100%';
    providerSelect.style.padding = '8px';
    providerSelect.style.borderRadius = '6px';
    providerSelect.style.border = '1px solid var(--background-modifier-border)';
    providerSelect.style.backgroundColor = 'var(--background-secondary)';
    providerSelect.style.color = 'var(--text-normal)';

    const providers = [
      { value: 'default', text: 'Default (Use Active Provider)' },
      { value: 'local', text: 'Local LLM' },
      { value: 'openai', text: 'OpenAI' },
      { value: 'gemini', text: 'Google Gemini' },
      { value: 'anthropic', text: 'Anthropic Claude' },
      { value: 'custom', text: 'Custom Provider' }
    ];
    providers.forEach(p => {
      const opt = providerSelect.createEl('option', { value: p.value, text: p.text });
      if (this.plugin.settings.namingProvider === p.value) opt.selected = true;
    });

    providerSelect.addEventListener('change', async () => {
      this.plugin.settings.namingProvider = providerSelect.value;
      if (typeof this.plugin.saveSettings === 'function') await this.plugin.saveSettings();
      updateModelPlaceholder();
    });

    // Model Input Field
    const modelWrap = modelSection.createDiv();
    const modelLabel = modelWrap.createEl('div', { text: 'Naming Model Name', cls: 'ai-settings-label' });
    modelLabel.style.fontWeight = '600';
    modelLabel.style.marginBottom = '6px';

    const modelInput = modelWrap.createEl('input', { type: 'text' });
    modelInput.style.width = '100%';
    modelInput.style.padding = '8px 12px';
    modelInput.style.borderRadius = '6px';
    modelInput.style.border = '1px solid var(--background-modifier-border)';
    modelInput.style.backgroundColor = 'var(--background-secondary)';
    modelInput.style.color = 'var(--text-normal)';
    modelInput.value = this.plugin.settings.namingModel || '';

    modelInput.addEventListener('input', async () => {
      this.plugin.settings.namingModel = modelInput.value;
      if (typeof this.plugin.saveSettings === 'function') await this.plugin.saveSettings();
    });

    // Dynamic Placeholder Updates
    const PROVIDER_DEFAULTS = {
      default:   '(uses whatever the active provider has configured)',
      local:     this.plugin.settings.localModel || 'llama2',
      openai:    this.plugin.settings.openaiModel || 'gpt-3.5-turbo',
      gemini:    this.plugin.settings.geminiModel || 'gemini-1.5-flash',
      anthropic: this.plugin.settings.anthropicModel || 'claude-3-haiku-20240307',
      custom:    '(your custom model name)',
    };
    
    const updateModelPlaceholder = () => {
      modelInput.placeholder = PROVIDER_DEFAULTS[providerSelect.value] || '(provider default)';
    };
    providerSelect.addEventListener('change', updateModelPlaceholder);
    updateModelPlaceholder();

    const modelHint = modelWrap.createEl('div', { text: "Leave empty to use the provider's configured model." });
    modelHint.style.fontSize = '11px';
    modelHint.style.color = 'var(--text-muted)';
    modelHint.style.marginTop = '5px';

    // Naming Prompt Template (Inline Textarea)
    const promptSection = section.createDiv({ cls: 'ai-settings-subsection' });
    promptSection.style.marginTop = '20px';
    promptSection.style.padding = '16px';
    promptSection.style.background = 'var(--background-primary)';
    promptSection.style.borderRadius = '8px';
    promptSection.style.border = '1px solid var(--background-modifier-border)';

    const promptLabelWrap = promptSection.createDiv();
    const promptLabelEl = promptLabelWrap.createEl('div', {
      text: 'Naming Prompt Template',
      cls: 'ai-settings-label'
    });
    promptLabelEl.style.fontWeight = '600';
    promptLabelEl.style.marginBottom = '4px';
    
    const promptDescEl = promptLabelWrap.createEl('div', {
      text: 'Customise the instructions used for auto-naming. The user message is inserted automatically — optionally use {{message}} to control exactly where it appears.'
    });
    promptDescEl.style.fontSize = '12px';
    promptDescEl.style.color = 'var(--text-muted)';
    promptDescEl.style.marginBottom = '12px';

    const promptTextarea = promptSection.createEl('textarea');
    promptTextarea.style.width = '100%';
    promptTextarea.style.height = '120px';
    promptTextarea.style.padding = '10px';
    promptTextarea.style.borderRadius = '6px';
    promptTextarea.style.border = '1px solid var(--background-modifier-border)';
    promptTextarea.style.backgroundColor = 'var(--background-secondary)';
    promptTextarea.style.color = 'var(--text-normal)';
    promptTextarea.style.fontFamily = 'var(--font-monospace)';
    promptTextarea.style.fontSize = '13px';
    promptTextarea.style.resize = 'vertical';
    
    const defaultPrompt = 'Based on this first message, generate a very short, concise title (maximum 5-6 words) for a conversation. The title should capture the main topic or intent. Return ONLY the title, no quotes, no explanations, no extra text.\n\nFirst message: "{{message}}"\n\nConversation title:';
    promptTextarea.value = this.plugin.settings.namingPromptTemplate || defaultPrompt;

    promptTextarea.addEventListener('input', async () => {
      this.plugin.settings.namingPromptTemplate = promptTextarea.value;
      if (typeof this.plugin.saveSettings === 'function') {
        await this.plugin.saveSettings();
      }
    });

    // Temperature for naming
    this.createSliderField(section, 'Naming Temperature (lower = more consistent):', 'namingTemperature', 
      this.plugin.settings.namingTemperature || 0.3, 0, 1, 0.1);
    
    // Max tokens for naming
    this.createInputField(section, 'Max Tokens for Naming:', 'namingMaxTokens', 
      this.plugin.settings.namingMaxTokens || 30, 'number', '30');
    
    // Naming timeout
    this.createInputField(section, 'Naming Timeout (ms):', 'namingTimeoutMs', 
      this.plugin.settings.namingTimeoutMs || 10000, 'number', '10000');
    
    // Preview section
    const previewSection = section.createDiv({ cls: 'ai-settings-subsection' });
    previewSection.style.marginTop = '20px';
    previewSection.style.padding = '16px';
    previewSection.style.background = 'var(--background-primary)';
    previewSection.style.borderRadius = '8px';
    previewSection.style.border = '1px solid var(--background-modifier-border)';
    
    const previewLabel = previewSection.createEl('div', { 
      text: 'Preview:',
      cls: 'ai-settings-label'
    });
    previewLabel.style.fontWeight = '600';
    previewLabel.style.marginBottom = '8px';
    
    const previewInput = previewSection.createEl('input', {
      type: 'text',
      placeholder: 'Enter a sample message to test naming...',
      cls: 'ai-naming-preview-input'
    });
    previewInput.style.width = '100%';
    previewInput.style.padding = '10px 14px';
    previewInput.style.borderRadius = '8px';
    previewInput.style.border = '1px solid var(--background-modifier-border)';
    previewInput.style.backgroundColor = 'var(--background-secondary)';
    previewInput.style.color = 'var(--text-normal)';
    previewInput.style.fontSize = '14px';
    previewInput.style.marginBottom = '10px';
    
    const previewBtn = previewSection.createEl('button', { cls: 'ai-preview-btn' });
    const previewIcon = previewBtn.createSpan();
    setIcon(previewIcon, 'play');
    previewIcon.style.marginRight = '6px';
    previewIcon.style.display = 'inline-flex';
    previewIcon.style.verticalAlign = 'middle';
    const previewText = previewBtn.createSpan();
    previewText.textContent = 'Test Naming';
    previewText.style.verticalAlign = 'middle';
    
    previewBtn.style.padding = '8px 16px';
    previewBtn.style.borderRadius = '6px';
    previewBtn.style.border = '1px solid var(--background-modifier-border)';
    previewBtn.style.background = 'var(--interactive-accent)';
    previewBtn.style.color = 'var(--text-on-accent)';
    previewBtn.style.cursor = 'pointer';
    previewBtn.style.fontSize = '13px';
    previewBtn.style.marginRight = '10px';
    
    const previewResult = previewSection.createDiv({ cls: 'ai-preview-result' });
    previewResult.style.marginTop = '12px';
    previewResult.style.padding = '12px';
    previewResult.style.borderRadius = '6px';
    previewResult.style.background = 'var(--background-secondary)';
    previewResult.style.border = '1px solid var(--background-modifier-border)';
    previewResult.style.fontSize = '14px';
    previewResult.style.minHeight = '40px';
    previewResult.style.display = 'none';
    
    previewBtn.addEventListener('click', async () => {
      const testMessage = previewInput.value.trim();
      if (!testMessage) {
        new Notice('Please enter a test message');
        return;
      }
      
      previewBtn.disabled = true;
      previewBtn.style.opacity = '0.5';
      previewResult.style.display = 'block';
      previewResult.textContent = 'Generating...';
      
      try {
        // Evaluate configured provider and model values
        const chosenProvider = this.plugin.settings.namingProvider || 'default';
        let targetProviderKey = chosenProvider;
        if (chosenProvider === 'default') {
          targetProviderKey = this.plugin.settings.currentMode === 'local' ? 'local' : this.plugin.settings.cloudApiType;
        }
        
        const provider = this.plugin.apiManager.providers[targetProviderKey];
        const prompt = (this.plugin.settings.namingPromptTemplate || defaultPrompt)
          .replace('{{message}}', testMessage);
        
        const sendOptions = {
          messages: [{ role: 'user', content: prompt }],
          temperature: this.plugin.settings.namingTemperature || 0.3,
          max_tokens: this.plugin.settings.namingMaxTokens || 30,
          stream: false
        };
        
        if (this.plugin.settings.namingModel) {
          sendOptions.model = this.plugin.settings.namingModel;
        }
        
        const result = await provider.send(sendOptions, {
          timeoutMs: this.plugin.settings.namingTimeoutMs || 10000
        });
        
        if (result && result.final) {
          let title = result.final.trim();
          title = title.replace(/^["']|["']$/g, '');
          title = title.replace(/[.!?]$/, '');
          previewResult.textContent = `Generated name: "${title}"`;
        } else {
          previewResult.textContent = 'Failed to generate name';
        }
      } catch (error) {
        previewResult.textContent = `Error: ${error.message}`;
      } finally {
        previewBtn.disabled = false;
        previewBtn.style.opacity = '1';
      }
    });
  }


  showConversationsSettings(container) {
  container.empty();
  
  const section = container.createDiv({ cls: 'ai-settings-section' });
  section.style.background = 'var(--background-secondary)';
  section.style.borderRadius = '8px';
  section.style.padding = '20px';
  section.style.marginBottom = '20px';
  section.style.border = '1px solid var(--background-modifier-border)';
  
  const h3 = section.createEl('h3');
  h3.style.display = 'flex';
  h3.style.alignItems = 'center';
  const h3Icon = h3.createSpan();
  setIcon(h3Icon, 'message-square');
  h3Icon.style.marginRight = '8px';
  h3.appendChild(document.createTextNode('Conversation Management'));
  
  // Stats summary
  const allSessions = this.plugin._sessionManager.getAllSessions({ excludeTemporary: true });
  const needsNaming = this.plugin._sessionManager.getSessionsNeedingNaming();
  
  const statsRow = section.createDiv({ cls: 'ai-stats-row' });
  statsRow.style.display = 'flex';
  statsRow.style.alignItems = 'center';
  statsRow.style.justifyContent = 'space-between';
  statsRow.style.marginBottom = '20px';
  statsRow.style.padding = '12px';
  statsRow.style.background = 'var(--background-primary)';
  statsRow.style.borderRadius = '8px';
  statsRow.style.border = '1px solid var(--background-modifier-border)';
  
  const statsText = statsRow.createDiv({ cls: 'ai-stats-text' });
  statsText.style.display = 'flex';
  statsText.style.gap = '20px';
  
  const totalStat = statsText.createDiv({ cls: 'ai-stat' });
  totalStat.innerHTML = `<strong>Total:</strong> ${allSessions.length}`;
  totalStat.style.fontSize = '14px';
  
  const namingStat = statsText.createDiv({ cls: 'ai-stat' });
  namingStat.innerHTML = `<strong>Need Naming:</strong> ${needsNaming.length}`;
  namingStat.style.fontSize = '14px';
  
  // Optional Name All button (only shows if there are conversations needing naming)
  if (needsNaming.length > 0) {
    const nameAllBtn = statsRow.createEl('button', { cls: 'ai-name-all-btn' });
    const nameIcon = nameAllBtn.createSpan();
    setIcon(nameIcon, 'type');
    nameIcon.style.marginRight = '4px';
    const nameText = nameAllBtn.createSpan();
    nameText.textContent = 'Name All';
    
    nameAllBtn.style.padding = '6px 12px';
    nameAllBtn.style.borderRadius = '6px';
    nameAllBtn.style.border = 'none';
    nameAllBtn.style.background = 'var(--interactive-accent)';
    nameAllBtn.style.color = 'var(--text-on-accent)';
    nameAllBtn.style.cursor = 'pointer';
    nameAllBtn.style.fontSize = '12px';
    nameAllBtn.style.display = 'flex';
    nameAllBtn.style.alignItems = 'center';
    
    nameAllBtn.addEventListener('click', async () => {
      nameAllBtn.disabled = true;
      nameAllBtn.style.opacity = '0.5';
      
      let named = 0;
      let failed = 0;
      
      for (const session of needsNaming) {
        if (session.messages.length > 0) {
          const firstUserMessage = session.messages.find(m => m.role === 'user');
          if (firstUserMessage) {
            try {
              const generatedName = await this.plugin.generateConversationName(firstUserMessage.content);
              if (generatedName) {
                session.name = generatedName;
                session.needsNaming = false;
                named++;
              } else {
                failed++;
              }
            } catch (error) {
              failed++;
            }
          }
        }
      }
      
      if (named > 0) {
        this.plugin.saveState();
        this.showConversationsSettings(container);
        new Notice(`✓ Named ${named} conversations${failed > 0 ? `, ${failed} failed` : ''}`);
        this.refreshChatViews();
      }
      
      nameAllBtn.disabled = false;
      nameAllBtn.style.opacity = '1';
    });
  }
  
  // Conversation List
  const sessionList = section.createDiv({ cls: 'ai-session-list' });
  sessionList.style.maxHeight = '300px';
  sessionList.style.overflowY = 'auto';
  sessionList.style.border = '1px solid var(--background-modifier-border)';
  sessionList.style.borderRadius = '8px';
  sessionList.style.padding = '8px';
  sessionList.style.marginBottom = '16px';
  sessionList.style.backgroundColor = 'var(--background-primary)';
  
  const sessions = this.plugin._sessionManager.getAllSessions({ excludeTemporary: true });
  
  if (sessions.length === 0) {
    const emptyMsg = sessionList.createDiv({ 
      cls: 'ai-empty-sessions',
      text: 'No conversations yet'
    });
    emptyMsg.style.textAlign = 'center';
    emptyMsg.style.padding = '40px 20px';
    emptyMsg.style.color = 'var(--text-muted)';
    emptyMsg.style.fontSize = '14px';
  } else {
    sessions.forEach(session => {
      const sessionRow = sessionList.createDiv({ 
        cls: `ai-session-row ${this.plugin._sessionManager.activeId === session.id ? 'active' : ''}` 
      });
      sessionRow.style.display = 'flex';
      sessionRow.style.justifyContent = 'space-between';
      sessionRow.style.alignItems = 'center';
      sessionRow.style.padding = '10px 12px';
      sessionRow.style.borderRadius = '6px';
      sessionRow.style.marginBottom = '6px';
      sessionRow.style.backgroundColor = 'var(--background-secondary)';
      sessionRow.style.border = '1px solid var(--background-modifier-border)';
      
      if (this.plugin._sessionManager.activeId === session.id) {
        sessionRow.style.backgroundColor = 'rgba(var(--interactive-accent-rgb), 0.1)';
        sessionRow.style.borderColor = 'var(--interactive-accent)';
      }
      
      // Session info
      const sessionInfo = sessionRow.createDiv({ cls: 'ai-session-info' });
      sessionInfo.style.flex = '1';
      sessionInfo.style.minWidth = '0';
      
      const nameSpan = sessionInfo.createEl('div', { cls: 'ai-session-name' });
      nameSpan.textContent = session.name;
      nameSpan.style.fontWeight = '600';
      nameSpan.style.fontSize = '14px';
      nameSpan.style.color = 'var(--text-normal)';
      nameSpan.style.marginBottom = '2px';
      nameSpan.style.whiteSpace = 'nowrap';
      nameSpan.style.overflow = 'hidden';
      nameSpan.style.textOverflow = 'ellipsis';
      
      const messageCount = sessionInfo.createEl('div', { 
        cls: 'ai-session-count',
        text: `${session.messages.length} message${session.messages.length !== 1 ? 's' : ''}` 
      });
      messageCount.style.fontSize = '12px';
      messageCount.style.color = 'var(--text-muted)';
      
      // Session actions
      const sessionActions = sessionRow.createDiv({ cls: 'ai-session-actions' });
      sessionActions.style.display = 'flex';
      sessionActions.style.gap = '6px';
      sessionActions.style.flexShrink = '0';
      
      // Copy button
      const duplicateBtn = sessionActions.createEl('button', { cls: 'ai-session-action-btn duplicate' });
      const duplicateIcon = duplicateBtn.createSpan();
      duplicateIcon.style.marginRight = '4px';
      duplicateIcon.style.display = 'inline-flex';
      duplicateIcon.style.verticalAlign = 'middle';
      const duplicateText = duplicateBtn.createSpan();
      duplicateText.textContent = 'duplicate';
      duplicateText.style.verticalAlign = 'middle';
      
      duplicateBtn.style.padding = '4px 8px';
      duplicateBtn.style.borderRadius = '4px';
      duplicateBtn.style.border = '1px solid var(--background-modifier-border)';
      duplicateBtn.style.backgroundColor = 'var(--background-secondary)';
      duplicateBtn.style.color = 'var(--text-normal)';
      duplicateBtn.style.cursor = 'pointer';
      duplicateBtn.style.fontSize = '11px';
      
      duplicateBtn.addEventListener('click', () => {
        new PromptModal(this.plugin.app, {
          title: 'Duplicate Conversation',
          placeholder: 'Name for the copy',
          initial: `${session.name} (Copy)`
        }, (newName) => {
          if (newName && newName.trim()) {
            const duplicate = this.plugin._sessionManager.duplicate(session.id, newName.trim());
            if (duplicate) {
              this.plugin.saveState();
              this.showConversationsSettings(container);
              new Notice(`✓ Copied to: ${duplicate.name}`);
              this.refreshChatViews();
            }
          }
        }).open();
      });
      
      // Activate button
      const switchBtn = sessionActions.createEl('button', {
        text: 'Activate',
        cls: 'ai-session-action-btn'
      });
      switchBtn.style.padding = '4px 8px';
      switchBtn.style.borderRadius = '4px';
      switchBtn.style.border = '1px solid var(--background-modifier-border)';
      switchBtn.style.backgroundColor = 'var(--background-secondary)';
      switchBtn.style.color = 'var(--text-normal)';
      switchBtn.style.cursor = 'pointer';
      switchBtn.style.fontSize = '11px';
      
      switchBtn.addEventListener('click', () => {
        this.plugin._sessionManager.switchTo(session.id);
        this.plugin.saveState();
        this.showConversationsSettings(container);
        new Notice(`Switched to conversation: ${session.name}`);
        this.refreshChatViews();
      });
      
      // Delete button
      const deleteBtn = sessionActions.createEl('button', {
        text: 'Delete',
        cls: 'ai-session-action-btn delete'
      });
      deleteBtn.style.padding = '4px 8px';
      deleteBtn.style.borderRadius = '4px';
      deleteBtn.style.border = '1px solid var(--text-error)';
      deleteBtn.style.backgroundColor = 'rgba(var(--background-modifier-error-rgb), 0.1)';
      deleteBtn.style.color = 'var(--text-error)';
      deleteBtn.style.cursor = 'pointer';
      deleteBtn.style.fontSize = '11px';
      
      deleteBtn.addEventListener('click', () => {
        new ConfirmModal(this.plugin.app, {
          title: 'Delete Conversation',
          message: `Delete "${session.name}"? This cannot be undone.`,
          confirmLabel: 'Delete',
          danger: true
        }, (ok) => {
          if (!ok) return;
          this.plugin._sessionManager.delete(session.id);
          this.plugin.saveState();
          this.showConversationsSettings(container);
          new Notice('Conversation deleted');
          this.refreshChatViews();
        }).open();
      });
    
      // Save button
      const saveBtn = sessionActions.createEl('button', { cls: 'ai-session-action-btn save' });
      const saveIcon = saveBtn.createSpan();
      setIcon(saveIcon, 'save');
      saveIcon.style.marginRight = '4px';
      saveIcon.style.display = 'inline-flex';
      saveIcon.style.verticalAlign = 'middle';
      const saveText = saveBtn.createSpan();
      saveText.textContent = 'Save';
      saveText.style.verticalAlign = 'middle';
      
      saveBtn.style.padding = '4px 8px';
      saveBtn.style.borderRadius = '4px';
      saveBtn.style.border = '1px solid #2e7d32';
      saveBtn.style.backgroundColor = 'rgba(46, 125, 50, 0.1)';
      saveBtn.style.color = '#2e7d32';
      saveBtn.style.cursor = 'pointer';
      saveBtn.style.fontSize = '11px';
      
      saveBtn.addEventListener('click', async () => {
        await this.saveConversationToFile(session);
      });
      
    });
  }
  
  // New conversation section
  const newSessionSection = section.createDiv({ cls: 'ai-new-session-section' });
  newSessionSection.style.display = 'flex';
  newSessionSection.style.gap = '10px';
  newSessionSection.style.marginBottom = '16px';
  
  const newSessionInput = newSessionSection.createEl('input', {
    type: 'text',
    placeholder: 'New conversation name (leave empty for auto-name)',
    cls: 'ai-new-session-input'
  });
  newSessionInput.style.flex = '1';
  newSessionInput.style.padding = '10px 14px';
  newSessionInput.style.borderRadius = '8px';
  newSessionInput.style.border = '1px solid var(--background-modifier-border)';
  newSessionInput.style.backgroundColor = 'var(--background-primary)';
  newSessionInput.style.color = 'var(--text-normal)';
  newSessionInput.style.fontSize = '14px';
  
  const newSessionBtn = newSessionSection.createEl('button', { cls: 'ai-new-session-btn' });
  const newIcon = newSessionBtn.createSpan();
  setIcon(newIcon, 'plus');
  newIcon.style.marginRight = '6px';
  newIcon.style.display = 'inline-flex';
  newIcon.style.verticalAlign = 'middle';
  const newText = newSessionBtn.createSpan();
  newText.textContent = 'New Conversation';
  newText.style.verticalAlign = 'middle';
  
  newSessionBtn.style.padding = '10px 16px';
  newSessionBtn.style.borderRadius = '8px';
  newSessionBtn.style.border = '1px solid var(--background-modifier-border)';
  newSessionBtn.style.backgroundColor = 'var(--interactive-accent)';
  newSessionBtn.style.color = 'var(--text-on-accent)';
  newSessionBtn.style.cursor = 'pointer';
  newSessionBtn.style.fontSize = '14px';
  
  newSessionBtn.addEventListener('click', () => {
    const name = newSessionInput.value.trim();
    
    if (name) {
      // User provided a name
      this.plugin._sessionManager.create(name);
      this.plugin.saveState();
      new Notice(`✓ Created conversation: ${name}`);
    } else {
      // User left it empty, create with default name
      const session = this.plugin._sessionManager.create('New Conversation', '', true);
      this.plugin.saveState();
      
      if (this.plugin.settings.autoNameConversations) {
        new Notice('Conversation created - will be auto-named after first message');
      } else {
        new Notice('✓ Created new conversation');
      }
    }
    
    this.showConversationsSettings(container);
    newSessionInput.value = '';
    this.refreshChatViews();
  });
  
  // Bottom buttons row
  const bottomButtonsRow = section.createDiv({ cls: 'ai-bottom-buttons-row' });
  bottomButtonsRow.style.display = 'flex';
  bottomButtonsRow.style.gap = '10px';
  bottomButtonsRow.style.marginTop = '16px';
  
  // Delete All button
  const clearAllBtn = bottomButtonsRow.createEl('button', { cls: 'ai-clear-all-btn' });
  const clearIcon = clearAllBtn.createSpan();
  setIcon(clearIcon, 'trash-2');
  clearIcon.style.marginRight = '6px';
  clearIcon.style.display = 'inline-flex';
  clearIcon.style.verticalAlign = 'middle';
  const clearText = clearAllBtn.createSpan();
  clearText.textContent = 'Delete All Conversations';
  clearText.style.verticalAlign = 'middle';
  
  clearAllBtn.style.flex = '1';
  clearAllBtn.style.padding = '12px';
  clearAllBtn.style.borderRadius = '8px';
  clearAllBtn.style.border = '1px solid var(--text-error)';
  clearAllBtn.style.backgroundColor = 'rgba(var(--background-modifier-error-rgb), 0.1)';
  clearAllBtn.style.color = 'var(--text-error)';
  clearAllBtn.style.cursor = 'pointer';
  clearAllBtn.style.fontSize = '14px';
  
  clearAllBtn.addEventListener('click', () => {
    new ConfirmModal(this.plugin.app, {
      title: 'Delete All Conversations',
      message: 'This will permanently delete every conversation. This cannot be undone.',
      confirmLabel: 'Delete All',
      danger: true
    }, (ok) => {
      if (!ok) return;
      this.plugin._sessionManager.sessions = [];
      this.plugin._sessionManager.create('Default Conversation');
      this.plugin.saveState();
      this.showConversationsSettings(container);
      new Notice('All conversations deleted');
      this.refreshChatViews();
    }).open();
  });
  
  // Export All button
  const exportAllBtn = bottomButtonsRow.createEl('button', { cls: 'ai-export-all-btn' });
  const exportIcon = exportAllBtn.createSpan();
  setIcon(exportIcon, 'download');
  exportIcon.style.marginRight = '6px';
  exportIcon.style.display = 'inline-flex';
  exportIcon.style.verticalAlign = 'middle';
  const exportText = exportAllBtn.createSpan();
  exportText.textContent = 'Export All';
  exportText.style.verticalAlign = 'middle';
  
  exportAllBtn.style.flex = '1';
  exportAllBtn.style.padding = '12px';
  exportAllBtn.style.borderRadius = '8px';
  exportAllBtn.style.border = '1px solid var(--background-modifier-border)';
  exportAllBtn.style.backgroundColor = 'var(--background-secondary)';
  exportAllBtn.style.color = 'var(--text-normal)';
  exportAllBtn.style.cursor = 'pointer';
  exportAllBtn.style.fontSize = '14px';
  
  exportAllBtn.addEventListener('click', async () => {
    const sessions = this.plugin._sessionManager.getAllSessions({ excludeTemporary: true });
    if (sessions.length === 0) {
      new Notice('No conversations to export');
      return;
    }
    
    exportAllBtn.disabled = true;
    exportAllBtn.style.opacity = '0.5';
    
    let exported = 0;
    let failed = 0;
    
    for (const session of sessions) {
      try {
        const content = this.plugin._sessionManager.exportToMarkdown(session);
        const folderPath = this.plugin.settings.conversationsFolder || 'AI Conversations';
        const baseName = session.name.replace(/[\\/:*?"<>|]/g, '_');
        
        const folderExists = await this.app.vault.adapter.exists(folderPath);
        if (!folderExists) {
          await this.app.vault.createFolder(folderPath);
        }
        
        const fullPath = await this.plugin.getUniqueFilePath(folderPath, baseName, 'md');
        await this.app.vault.create(fullPath, content);
        exported++;
      } catch (error) {
        console.error('Error exporting conversation:', error);
        failed++;
      }
    }
    
    new Notice(`✓ Exported ${exported} conversations${failed > 0 ? `, ${failed} failed` : ''}`);
    
    exportAllBtn.disabled = false;
    exportAllBtn.style.opacity = '1';
  });
}

  async saveConversationToFile(session) {
    try {
      const file = await this.plugin.saveSessionToVault(session);

      // Interactive notification with an "Open Note" button
      const frag = document.createDocumentFragment();
      const container = frag.createDiv();
      container.style.display = 'flex';
      container.style.alignItems = 'center';
      container.style.gap = '12px';
      container.createSpan({ text: `✓ Saved: ${file.name}` });
      const btn = container.createEl('button', { text: 'Open Note', cls: 'mod-cta' });
      btn.style.padding = '2px 10px';
      btn.style.height = 'auto';
      btn.style.fontSize = '0.85em';
      btn.style.cursor = 'pointer';
      btn.addEventListener('click', () => this.plugin.app.workspace.getLeaf(true).openFile(file));
      new Notice(frag, 15000);
    } catch (error) {
      console.error('Error saving conversation:', error);
      new Notice(`⨉ Error saving conversation: ${error.message}`);
    }
  }


  refreshChatViews() {
    // Delegate to the plugin-wide refresher so BOTH the sidebar (VIEW_TYPE)
    // and the dedicated main-area chat page (VIEW_TYPE_CHAT_PAGE) are kept
    // in sync — previously this only touched the sidebar, which is why
    // changes made from Settings never showed up on the main chat page.
    this.plugin.refreshChatViews();
  }
  
  /**
   * Creates a row containing:
   *   [IMG ▾]  [Test Connection ↺]
   *
   * The IMG button opens a small floating dropdown with two checkboxes:
   *   ☐ Image Analysis   ☐ Image Creation
   * These are persisted in settings.imageCapabilities[providerKey].
   *
   * @param {HTMLElement} container
   * @param {Function}    providerFactory  - zero-arg fn returning a provider instance
   * @param {string}      providerKey      - key into settings.imageCapabilities
   */
  createTestConnectionButton(container, providerFactory, providerKey = 'local') {

    // ── Outer row holding both buttons ──────────────────────────────────────
    const row = container.createDiv({ cls: 'ai-provider-action-row' });
    row.style.display    = 'flex';
    row.style.gap        = '8px';
    row.style.marginTop  = '10px';
    row.style.alignItems = 'stretch';
    row.style.position   = 'relative';  // anchor for the dropdown

    // ── IMG button ──────────────────────────────────────────────────────────
    const imgBtn = row.createEl('button', { cls: 'ai-img-cap-btn' });
    imgBtn.title = 'Configure image capabilities for this provider';

    const imgBtnInner = () => {
      imgBtn.empty();
      const caps = (this.plugin.settings.imageCapabilities?.[providerKey]) || {};
      const anyOn = caps.analysis || caps.creation;

      const iconSpan = imgBtn.createSpan();
      setIcon(iconSpan, 'image');
      iconSpan.style.display      = 'inline-flex';
      iconSpan.style.verticalAlign = 'middle';
      iconSpan.style.marginRight  = '5px';

      const label = imgBtn.createSpan();
      label.textContent        = 'IMG';
      label.style.verticalAlign = 'middle';
      label.style.fontSize     = '13px';
      label.style.fontWeight   = '600';

      const chevron = imgBtn.createSpan();
      chevron.textContent        = ' ▾';
      chevron.style.fontSize     = '10px';
      chevron.style.verticalAlign = 'middle';
      chevron.style.opacity      = '0.7';

      // Accent dot when any capability is on
      imgBtn.style.borderColor = anyOn
        ? 'var(--interactive-accent)'
        : 'var(--background-modifier-border)';
      imgBtn.style.color = anyOn
        ? 'var(--interactive-accent)'
        : 'var(--text-muted)';
    };

    imgBtn.style.padding      = '10px 12px';
    imgBtn.style.borderRadius = '8px';
    imgBtn.style.border       = '1px solid var(--background-modifier-border)';
    imgBtn.style.background   = 'var(--background-secondary)';
    imgBtn.style.cursor       = 'pointer';
    imgBtn.style.display      = 'flex';
    imgBtn.style.alignItems   = 'center';
    imgBtn.style.flexShrink   = '0';
    imgBtnInner();

    // ── Floating dropdown ───────────────────────────────────────────────────
    let dropdown = null;

    const closeDropdown = () => {
      if (dropdown) { dropdown.remove(); dropdown = null; }
    };

    imgBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (dropdown) { closeDropdown(); return; }

      // Position dropdown below the IMG button
      dropdown = document.body.createDiv({ cls: 'ai-img-cap-dropdown' });
      dropdown.style.position     = 'fixed';
      dropdown.style.zIndex       = '9999';
      dropdown.style.background   = 'var(--background-primary)';
      dropdown.style.border       = '1px solid var(--background-modifier-border)';
      dropdown.style.borderRadius = '10px';
      dropdown.style.boxShadow    = '0 8px 24px rgba(0,0,0,0.18)';
      dropdown.style.padding      = '14px 16px';
      dropdown.style.minWidth     = '210px';
      dropdown.style.display      = 'flex';
      dropdown.style.flexDirection = 'column';
      dropdown.style.gap          = '10px';

      // Position it below the button
      const rect = imgBtn.getBoundingClientRect();
      dropdown.style.top  = `${rect.bottom + 6}px`;
      dropdown.style.left = `${rect.left}px`;

      // Header
      const header = dropdown.createDiv();
      header.style.fontSize   = '11px';
      header.style.fontWeight = '700';
      header.style.color      = 'var(--text-muted)';
      header.style.letterSpacing = '0.06em';
      header.style.textTransform = 'uppercase';
      header.style.marginBottom = '2px';
      header.textContent = 'Image Capabilities';

      const makeCap = (label, capKey, icon) => {
        const item = dropdown.createDiv({ cls: 'ai-img-cap-item' });
        item.style.display     = 'flex';
        item.style.alignItems  = 'center';
        item.style.gap         = '10px';
        item.style.padding     = '8px 10px';
        item.style.borderRadius = '7px';
        item.style.cursor      = 'pointer';
        item.style.border      = '1px solid var(--background-modifier-border)';
        item.style.background  = 'var(--background-secondary)';
        item.style.transition  = 'background 0.15s';

        const cb = item.createEl('input', { type: 'checkbox' });
        cb.style.width        = '16px';
        cb.style.height       = '16px';
        cb.style.accentColor  = 'var(--interactive-accent)';
        cb.style.cursor       = 'pointer';
        cb.style.flexShrink   = '0';

        // Ensure nested settings object exists
        if (!this.plugin.settings.imageCapabilities) this.plugin.settings.imageCapabilities = {};
        if (!this.plugin.settings.imageCapabilities[providerKey])
          this.plugin.settings.imageCapabilities[providerKey] = { analysis: false, creation: false };

        cb.checked = !!this.plugin.settings.imageCapabilities[providerKey][capKey];

        const iconSpan = item.createSpan();
        iconSpan.style.display     = 'inline-flex';
        iconSpan.style.flexShrink  = '0';
        setIcon(iconSpan, icon);

        const txt = item.createSpan();
        txt.textContent  = label;
        txt.style.fontSize   = '13px';
        txt.style.fontWeight = '500';
        txt.style.color      = 'var(--text-normal)';
        txt.style.flex       = '1';

        const updateItem = () => {
          const on = cb.checked;
          item.style.background   = on ? 'rgba(var(--interactive-accent-rgb),0.12)' : 'var(--background-secondary)';
          item.style.borderColor  = on ? 'var(--interactive-accent)'                : 'var(--background-modifier-border)';
          txt.style.color         = on ? 'var(--interactive-accent)'                : 'var(--text-normal)';
        };
        updateItem();

        cb.addEventListener('change', () => {
          if (!this.plugin.settings.imageCapabilities[providerKey])
            this.plugin.settings.imageCapabilities[providerKey] = { analysis: false, creation: false };
          this.plugin.settings.imageCapabilities[providerKey][capKey] = cb.checked;
          this.plugin.saveSettings();
          updateItem();
          imgBtnInner();   // refresh accent on the IMG button
        });

        item.addEventListener('click', (ev) => {
          if (ev.target !== cb) { cb.checked = !cb.checked; cb.dispatchEvent(new Event('change')); }
        });
      };

      makeCap('Image Analysis',  'analysis',  'scan-eye');
      makeCap('Image Creation',  'creation',  'wand');

      // Close on outside click
      setTimeout(() => {
        document.addEventListener('click', closeDropdown, { once: true });
      }, 0);
    });

    // ── Test Connection button ──────────────────────────────────────────────
    const btn = row.createEl('button', { cls: 'ai-test-btn' });
    btn.style.flex        = '1';
    btn.style.padding     = '12px';
    btn.style.borderRadius = '8px';
    btn.style.border      = '1px solid var(--background-modifier-border)';
    btn.style.background  = 'var(--background-secondary)';
    btn.style.color       = 'var(--text-normal)';
    btn.style.cursor      = 'pointer';
    btn.style.fontSize    = '14px';

    const renderBtnContent = () => {
      btn.empty();
      const icon = btn.createSpan();
      setIcon(icon, 'refresh-cw');
      icon.style.marginRight  = '6px';
      icon.style.display      = 'inline-flex';
      icon.style.verticalAlign = 'middle';
      const text = btn.createSpan();
      text.textContent        = 'Test Connection';
      text.style.verticalAlign = 'middle';
    };
    renderBtnContent();

    btn.addEventListener('click', async () => {
      btn.disabled = true;
      btn.textContent = 'Testing...';
      try {
        const provider = providerFactory();
        const health = await provider.checkHealth();
        new Notice(health.message);
      } catch (e) {
        new Notice('⨉ Error: ' + e.message);
      } finally {
        btn.disabled = false;
        renderBtnContent();
      }
    });

    return btn;
  }

  createInputField(container, label, key, value, type = 'text', placeholder = '') {
    const row = container.createDiv({ cls: 'ai-settings-row' });
    row.style.marginBottom = '16px';
    
    row.createEl('label', { text: label }).style.display = 'block';
    
    const input = row.createEl('input', {
      type: type,
      value: value,
      placeholder: placeholder
    });
    input.style.width = '100%';
    input.style.padding = '10px 14px';
    input.style.borderRadius = '8px';
    input.style.border = '1px solid var(--background-modifier-border)';
    input.style.backgroundColor = 'var(--background-primary)';
    input.style.color = 'var(--text-normal)';
    input.style.fontSize = '14px';
    input.style.boxSizing = 'border-box';
    
    input.addEventListener('change', (e) => {
      this.plugin.settings[key] = type === 'number' ? parseInt(e.target.value) : e.target.value;
    });
    
    return input;
  }

  /**
   * Renders one shortcut row: label | text input | visibility toggle.
   *
   * @param {HTMLElement} container
   * @param {string}      label        - Human-readable name shown on the left
   * @param {string}      visKey       - Key in settings.shortcutsVisible AND settings.shortcuts
   * @param {string}      value        - Current key-combo string
   */
  createShortcutField(container, label, visKey, value) {
    const row = container.createDiv({ cls: 'ai-settings-row' });
    row.style.marginBottom  = '14px';
    row.style.display       = 'flex';
    row.style.flexDirection = 'column';
    row.style.gap           = '6px';

    // ── Top line: label + visibility toggle ─────────────────────────────
    const topLine = row.createDiv();
    topLine.style.display        = 'flex';
    topLine.style.justifyContent = 'space-between';
    topLine.style.alignItems     = 'center';

    topLine.createEl('label', { text: label }).style.fontWeight = '600';

    // Toggle pill
    const isVisible = (this.plugin.settings.shortcutsVisible ?? {})[visKey] !== false;

    const pill = topLine.createDiv({ cls: 'ai-shortcut-vis-pill' });
    pill.style.display         = 'flex';
    pill.style.alignItems      = 'center';
    pill.style.gap             = '6px';
    pill.style.cursor          = 'pointer';
    pill.style.userSelect      = 'none';
    pill.title                 = 'Show or hide this item in the ⌘ command menu';

    const pillLabel = pill.createSpan();
    pillLabel.style.fontSize = '12px';
    pillLabel.style.color    = 'var(--text-muted)';

    const track = pill.createDiv({ cls: 'ai-toggle-track' });
    track.style.width        = '34px';
    track.style.height       = '18px';
    track.style.borderRadius = '9px';
    track.style.position     = 'relative';
    track.style.transition   = 'background 0.2s';
    track.style.flexShrink   = '0';

    const thumb = track.createDiv({ cls: 'ai-toggle-thumb' });
    thumb.style.position     = 'absolute';
    thumb.style.top          = '2px';
    thumb.style.width        = '14px';
    thumb.style.height       = '14px';
    thumb.style.borderRadius = '50%';
    thumb.style.background   = '#fff';
    thumb.style.transition   = 'left 0.2s';
    thumb.style.boxShadow    = '0 1px 3px rgba(0,0,0,0.3)';

    const applyToggleState = (on) => {
      track.style.background = on ? 'var(--interactive-accent)' : 'var(--background-modifier-border)';
      thumb.style.left       = on ? '18px' : '2px';
      pillLabel.textContent  = on ? 'Shown' : 'Hidden';
      pillLabel.style.color  = on ? 'var(--interactive-accent)' : 'var(--text-muted)';
    };

    applyToggleState(isVisible);

    pill.addEventListener('click', async () => {
      if (!this.plugin.settings.shortcutsVisible) this.plugin.settings.shortcutsVisible = {};
      // Treat missing key as true (shown by default), then flip
      const current = this.plugin.settings.shortcutsVisible[visKey] !== false;
      this.plugin.settings.shortcutsVisible[visKey] = !current;
      applyToggleState(!current);
      if (typeof this.plugin.saveSettings === 'function') await this.plugin.saveSettings();
    });

    // ── Bottom line: key-combo text input ────────────────────────────────
    // 'openChatPage' has no editable shortcut (it's hardcoded in Obsidian)
    if (visKey !== 'openChatPage') {
      const input = row.createEl('input', {
        type: 'text',
        value: value,
        placeholder: 'Example: Ctrl+Shift+N'
      });
      input.style.width           = '100%';
      input.style.padding         = '10px 14px';
      input.style.borderRadius    = '8px';
      input.style.border          = '1px solid var(--background-modifier-border)';
      input.style.backgroundColor = 'var(--background-primary)';
      input.style.color           = 'var(--text-normal)';
      input.style.fontSize        = '14px';
      input.style.boxSizing       = 'border-box';

      input.addEventListener('change', async (e) => {
        this.plugin.settings.shortcuts[visKey] = e.target.value;
        if (typeof this.plugin.saveSettings === 'function') await this.plugin.saveSettings();
      });
    } else {
      // Read-only display for hardcoded shortcuts
      const hint = row.createDiv({ text: 'Ctrl+Shift+O  (hardcoded)' });
      hint.style.fontSize = '12px';
      hint.style.color    = 'var(--text-muted)';
      hint.style.padding  = '4px 0';
    }
  }
  
  createSliderField(container, label, key, value, min, max, step) {
    const row = container.createDiv({ cls: 'ai-settings-row' });
    row.style.marginBottom = '16px';
    
    const labelRow = row.createDiv({ style: 'display: flex; justify-content: space-between;' });
    labelRow.createEl('label', { text: label });
    const valueSpan = labelRow.createEl('span', { text: value, cls: 'ai-slider-value' });
    valueSpan.style.fontWeight = '600';
    valueSpan.style.color = 'var(--interactive-accent)';
    
    const slider = row.createEl('input', {
      type: 'range',
      value: value,
      min: min,
      max: max,
      step: step
    });
    slider.style.width = '100%';
    slider.style.height = '6px';
    slider.style.borderRadius = '3px';
    slider.style.background = 'var(--background-modifier-border)';
    
    slider.addEventListener('input', (e) => {
      const val = parseFloat(e.target.value);
      this.plugin.settings[key] = val;
      valueSpan.textContent = val.toFixed(1);
    });
    
    return slider;
  }
  
  createCheckboxField(container, label, key, checked) {
    const row = container.createDiv({ cls: 'ai-settings-row checkbox' });
    row.style.display = 'flex';
    row.style.alignItems = 'center';
    row.style.justifyContent = 'space-between'; // Better spacing for settings
    row.style.gap = '10px';
    row.style.marginBottom = '16px';
    row.style.cursor = 'pointer';

    const labelEl = row.createEl('label', { text: label });
    labelEl.style.cursor = 'pointer';
    labelEl.style.flex = '1';

    const checkbox = row.createEl('input', {
      type: 'checkbox'
    });
    
    // Explicitly set the checked state
    checkbox.checked = this.plugin.settings[key];
    
    checkbox.style.width = '18px';
    checkbox.style.height = '18px';
    checkbox.style.accentColor = 'var(--interactive-accent)';
    checkbox.style.cursor = 'pointer';
    
    // Toggle on row click for better UX
    row.addEventListener('click', () => {
      checkbox.checked = !checkbox.checked;
      this.plugin.settings[key] = checkbox.checked;
      this.plugin.saveSettings();
    });

    // Prevent double-toggle if clicking the checkbox itself
    checkbox.addEventListener('click', (e) => {
      e.stopPropagation();
      this.plugin.settings[key] = checkbox.checked;
      this.plugin.saveSettings();
    });
    
    return checkbox;
  }
  
  createInputPositionSelector(container) {
    const row = container.createDiv({ cls: 'ai-settings-row' });
    row.style.marginBottom = '16px';
    row.style.padding = '12px';
    row.style.background = 'var(--background-primary)';
    row.style.borderRadius = '8px';
    row.style.border = '1px solid var(--background-modifier-border)';
    
    const label = row.createEl('label', { text: 'Input Field Position:' });
    label.style.display = 'block';
    label.style.marginBottom = '8px';
    label.style.fontWeight = '600';
    
    const optionsRow = row.createDiv({ style: 'display: flex; gap: 20px;' });
    
    // Bottom option (default)
    const bottomOption = optionsRow.createDiv({ style: 'display: flex; align-items: center; gap: 6px;' });
    const bottomRadio = bottomOption.createEl('input', {
      type: 'radio',
      name: 'inputPosition',
      value: 'bottom',
      attr: { id: 'input-bottom' }
    });
    bottomRadio.checked = this.plugin.settings.inputPosition === 'bottom';
    bottomRadio.addEventListener('change', (e) => {
      if (e.target.checked) {
        this.plugin.settings.inputPosition = 'bottom';
      }
    });
    
    const bottomLabel = bottomOption.createEl('label', { 
      text: 'Bottom',
      attr: { for: 'input-bottom' }
    });
    bottomLabel.style.cursor = 'pointer';
    
    // Top option
    const topOption = optionsRow.createDiv({ style: 'display: flex; align-items: center; gap: 6px;' });
    const topRadio = topOption.createEl('input', {
      type: 'radio',
      name: 'inputPosition',
      value: 'top',
      attr: { id: 'input-top' }
    });
    topRadio.checked = this.plugin.settings.inputPosition === 'top';
    topRadio.addEventListener('change', (e) => {
      if (e.target.checked) {
        this.plugin.settings.inputPosition = 'top';
      }
    });
    
    const topLabel = topOption.createEl('label', { 
      text: 'Top',
      attr: { for: 'input-top' }
    });
    topLabel.style.cursor = 'pointer';
    
    const previewDiv = row.createDiv({ 
      style: 'margin-top: 12px; padding: 8px; background: var(--background-secondary); border-radius: 6px; font-size: 12px; color: var(--text-muted); display: flex; align-items: center; gap: 8px;' 
    });
    previewDiv.textContent = 'Preview: Input field will appear at the ' + 
      (this.plugin.settings.inputPosition === 'bottom' ? 'bottom' : 'top') + 
      ' of the sidebar';
  }
  
  onClose() {
    this.contentEl.empty();
  }
}

// ==================== AI CODE BLOCK PROCESSOR ====================

class AICodeBlockProcessor {
  constructor(plugin) {
    this.plugin = plugin;
    this.activeBlocks = new Map(); // Track active code blocks by ID
  }

  process(source, el, ctx) {
    // Parse the configuration from the code block
    const config = this.parseConfig(source);
    
    // Derive a stable ID from the block's position in its source file so that
    // the Data.json cache key survives re-renders, tab switches, and restarts.
    // A random ID (Date.now() + Math.random()) regenerates on every render,
    // making it impossible to look up previously saved cache entries.
    const sectionInfoForId = ctx.getSectionInfo(el);
    const lineStartForId = sectionInfoForId ? sectionInfoForId.lineStart : 0;
    const blockId = `ai-block-${ctx.sourcePath}:${lineStartForId}`;
    
    // Create container for the AI interface
    const container = el.createDiv({ cls: 'ai-codeblock-container' });
    container.setAttribute('data-block-id', blockId);
    
    // Initialize cache for this block
    const cache = this.initializeCache(config, blockId, source);
    
    // Get the current file path if available
    let filePath = '';
    try {
        const view = this.plugin.app.workspace.getActiveViewOfType(MarkdownView);
        if (view && view.file) {
            filePath = view.file.path;
        }
    } catch (e) {
        console.log('Could not get file path');
    }
    
    // Store block data with file reference
    this.activeBlocks.set(blockId, {
        id: blockId,
        config,
        cache,
        currentLoop: this.getCurrentLoopFromCache(cache, config),
        totalLoops: config.repeating === 'Loop' ? Infinity : parseInt(config.repeating) || 1,
        ctx,
        container,
        el,
        filePath,
        source
    });
    
    // Render the UI based on configuration
    this.renderBlock(blockId);
    
    // Return the blockId so the renderer can track it
    return blockId;
    }

  parseConfig(source) {
    const lines = source.split('\n').filter(line => line.trim());
    const config = {
      environment: 'Simple',
      systemPrompt: '',
      model: '',
      repeating: '1',
      moving: 'Arrow',
      memory: 'Current',
      caching: 'Data.json',
      emptyPlaceholder: 'Ask...',
      display: 'auto',   // 'auto' | 'fix Npx'
      cachedData: {}
    };

  // Parse cached data if present.  The cache is always written as a single
  // JSON line, so anchor with ^ / $ (multiline) rather than [\s\S]* which
  // is greedy and can bleed across block boundaries or into other config keys.
  const cachedDataMatch = source.match(/^cached data:\s*(\{.*\})\s*$/m);
  if (cachedDataMatch && cachedDataMatch[1]) {
    try {
      let jsonStr = cachedDataMatch[1].trim();
      jsonStr = jsonStr.replace(/,(\s*[}\]])/g, '$1');
      config.cachedData = JSON.parse(jsonStr);
    } catch (e) {
      console.error('Failed to parse cached data:', e);
      try {
        let fixedJson = cachedDataMatch[1]
          .replace(/\/\/.*$/gm, '')
          .replace(/\/\*[\s\S]*?\*\//g, '')
          .replace(/,(\s*[}\]])/g, '$1');
        config.cachedData = JSON.parse(fixedJson);
      } catch (e2) {
        console.error('Still failed to parse cached data:', e2);
      }
    }
  }

  // Parse configuration lines (excluding cached data line)
  lines.forEach(line => {
    if (line.trim().startsWith('cached data:')) return;
    
    const colonIndex = line.indexOf(':');
    if (colonIndex === -1) return;
    
    const key = line.substring(0, colonIndex).trim().toLowerCase();
    const value = line.substring(colonIndex + 1).trim();
    
    switch(key) {
      case 'environment':
        config.environment = value;
        break;
      case 'system prompt':
        config.systemPrompt = value;
        break;
      case 'model':
        config.model = this.parseModel(value);
        break;
      case 'repeating':
        config.repeating = this.parseRepeating(value);
        break;
      case 'moving':
        config.moving = this.parseMoving(value);
        break;
      case 'memory':
        config.memory = this.parseMemory(value);
        break;
      case 'caching':
        config.caching = this.parseCaching(value);
        break;
      case 'ask is empty': // New option for custom placeholder
        config.emptyPlaceholder = value;
        break;
      case 'display':
        config.display = this.parseDisplay(value);
        break;
    }
  });

    return config;
  }

  parseModel(value) {
    const lower = value.toLowerCase();
    if (lower.includes('local')) return 'local';
    if (lower.includes('gemini') || lower.includes('google')) return 'gemini';
    if (lower.includes('claude') || lower.includes('anthropic')) return 'anthropic';
    if (lower.includes('chatgpt') || lower.includes('openai')) return 'openai';
    if (lower.includes('custom')) return 'custom';
    return value;
  }

  parseRepeating(value) {
    const lower = value.toLowerCase();
    if (lower === 'loop') return 'Loop';
    const num = parseInt(value);
    if (!isNaN(num) && num > 0) return num.toString();
    return '1';
  }

  parseMoving(value) {
    const lower = value.toLowerCase();
    if (lower.includes('arrow')) return 'Arrow';
    if (lower.includes('flow')) return 'Flow';
    return 'Arrow';
  }

  parseMemory(value) {
    const lower = value.toLowerCase();
    if (lower === 'all') return 'All';
    const match = lower.match(/previous\s*\(?(\d+)\)?/);
    if (match) return `Previous (${match[1]})`;
    return 'Current';
  }

  parseCaching(value) {
    const lower = value.toLowerCase();
    if (lower.includes('temporary')) return 'Temporary';
    if (lower.includes('data.json')) return 'Data.json';
    return 'Code Block';
  }

  /**
   * Parses the Display parameter.
   *
   * Accepted syntax:
   *   Display: auto           → unrestricted height (default)
   *   Display: fix 300px      → fixed max-height of 300 px with scroll
   *   Display: fix 300        → same, unit added automatically
   *
   * Returns either the string `'auto'` or a CSS pixel value like `'300px'`.
   */
  parseDisplay(value) {
    const lower = value.trim().toLowerCase();
    if (lower === 'auto') return 'auto';

    // Match:  fix 300px  |  fix300px  |  fix 300  |  fix300
    const match = lower.match(/^fix\s*(\d+)(px)?$/);
    if (match) {
      const px = parseInt(match[1], 10);
      if (px > 0) return `${px}px`;
    }
    return 'auto';   // fall back gracefully for any unrecognised value
  }

  /**
   * Applies the parsed Display value to a response container element.
   *
   * `auto`   → keeps the existing natural height (no cap, no scroll bar)
   * `<Npx>`  → caps the element at N px and adds a scroll bar so long
   *             responses are still fully readable inside the fixed box.
   *
   * @param {HTMLElement} el
   * @param {string}      displayValue   return value of parseDisplay()
   */
  _applyDisplayMode(el, displayValue) {
    if (!displayValue || displayValue === 'auto') {
      // Natural height — nothing extra needed
      el.style.overflowY = 'visible';
      return;
    }
    // Fixed height mode
    el.style.maxHeight = displayValue;
    el.style.overflowY = 'auto';
    // Subtle inner shadow hints that the content is scrollable
    el.style.boxShadow = 'inset 0 -8px 8px -8px rgba(0,0,0,0.08)';
  }

  parseIOConfig(envString) {
    const match = envString.match(/separate\s+(input|output)\s+(.+)/i);
    if (match) {
      return {
        type: match[1].toLowerCase(),
        id: match[2].trim()
      };
    }
    return { type: 'unknown', id: '' };
  }

  initializeCache(config, blockId, source) {
    if (config.caching === 'Temporary') {
    return this.createNewEmptyCache(config);
  }
    let cache = {};
    
    // Try to parse cached data from the source
    if (source && source.includes('cached data:')) {
      try {
        const match = source.match(/^cached data:\s*(\{.*\})\s*$/m);
        if (match && match[1]) {
          let jsonStr = match[1].trim();
          jsonStr = jsonStr.replace(/,(\s*[}\]])/g, '$1');
          cache = JSON.parse(jsonStr);
        }
      } catch (e) {
        console.error('Failed to parse cached data:', e);
      }
    }
    
    // If no cache found and caching is set to Data.json, try loading from plugin data
    if (Object.keys(cache).length === 0 && config.caching === 'Data.json') {
      const saved = this.plugin.settings.codeBlockCache?.[blockId];
      if (saved) {
        cache = saved;
      }
    }
    
    // If still no cache, initialize based on repeating mode
    if (Object.keys(cache).length === 0) {
      if (config.repeating === 'Loop') {
        cache = { session_log: [] };
      } else {
        const numLoops = parseInt(config.repeating) || 1;
        cache = {};
        for (let i = 1; i <= numLoops; i++) {
          cache[`loop${i}`] = {};
        }
      }
    }
    
    return cache;
  }
  
  createNewEmptyCache(config) {
  if (config.repeating === 'Loop') {
    return { session_log: [] };
  } else {
    const numLoops = parseInt(config.repeating) || 1;
    const cache = {};
    for (let i = 1; i <= numLoops; i++) {
      cache[`loop${i}`] = {};
    }
    return cache;
  }
  }

  getCurrentLoopFromCache(cache, config) {
    if (config.repeating === 'Loop') {
      if (cache.session_log && cache.session_log.length > 0) {
        return cache.session_log.length + 1;
      }
      return 1;
    } else {
      const numLoops = parseInt(config.repeating) || 1;
      for (let i = numLoops; i >= 1; i--) {
        if (cache[`loop${i}`]?.[`res-${i}`]) {
          return i;
        }
      }
      return 1;
    }
  }

  renderBlock(blockId) {
    const block = this.activeBlocks.get(blockId);
    if (!block) return;
    
    const { container, config } = block;
    container.empty();
    
    // Check for separate IO environment first
    const env = config.environment.toLowerCase();
    if (env.startsWith('separate')) {
      this.renderSeparateIOEnvironment(block);
    } else if (env === 'simple') {
      this.renderSimpleEnvironment(block);
    } else if (env === 'full') {
      this.renderFullEnvironment(block);
    } else {
      this.renderSimpleEnvironment(block);
    }
  }

  // ==================== SIMPLE ENVIRONMENT ====================

  renderSimpleEnvironment(block) {
    const { container, config, currentLoop, totalLoops, cache, id } = block;
    
    container.style.display = 'flex';
    container.style.flexDirection = 'column';
    container.style.gap = '8px';
    container.style.padding = '0';
    container.style.margin = '8px 0';
    container.style.background = 'transparent';

    // Ask Input Area with embedded controls
    this.renderSimpleInput(block);

    // Separator line
    const line = container.createDiv({ cls: 'ai-simple-separator' });
    line.style.borderTop = '1px solid var(--background-modifier-border)';
    line.style.margin = '4px 0';

    // Response Area
    this.renderSimpleResponse(block);
  }

  renderSimpleInput(block) {
    const { container, config, currentLoop, totalLoops, cache } = block;
    
    const inputContainer = container.createDiv({ cls: 'ai-simple-input-wrapper' });
    inputContainer.style.position = 'relative';
    inputContainer.style.width = '100%';
    
    const input = inputContainer.createEl('textarea', {
      cls: 'ai-simple-input',
      attr: { 
        placeholder: config.emptyPlaceholder || 'Ask...',
        rows: '1'
      }
    });
    
    input.style.width = '100%';
    input.style.padding = '20px';
    input.style.paddingRight = '80px';
    input.style.borderRadius = '8px';
    input.style.border = '1px solid var(--background-modifier-border)';
    input.style.background = 'var(--background-secondary)';
    input.style.color = 'var(--text-normal)';
    input.style.fontSize = '14px';
    input.style.resize = 'none';
    input.style.boxSizing = 'border-box';
    
    // Navigation arrows (if multiple loops)
    if (config.repeating !== '1') {
      const prevBtn = inputContainer.createEl('button', { 
        text: '←',
        cls: 'ai-nav-arrow prev',
        attr: { title: 'Previous' }
      });
      prevBtn.style.position = 'absolute';
      prevBtn.style.left = '8px';
      prevBtn.style.top = '45%';
      prevBtn.style.transform = 'translateY(-50%)';
      prevBtn.style.width = '28px';
      prevBtn.style.height = '28px';
      prevBtn.style.borderRadius = '50%';
      prevBtn.style.border = '1px solid var(--background-modifier-border)';
      prevBtn.style.background = 'var(--background-primary)';
      prevBtn.style.color = 'var(--text-normal)';
      prevBtn.style.cursor = 'pointer';
      prevBtn.style.display = 'flex';
      prevBtn.style.alignItems = 'center';
      prevBtn.style.justifyContent = 'center';
      prevBtn.style.fontSize = '16px';
      prevBtn.style.padding = '0';
      prevBtn.style.zIndex = '2';
      prevBtn.style.boxShadow = '0 2px 4px rgba(0,0,0,0.1)';
      
      const nextBtn = inputContainer.createEl('button', { 
        text: '→',
        cls: 'ai-nav-arrow next',
        attr: { title: 'Next' }
      });
      nextBtn.style.position = 'absolute';
      nextBtn.style.right = '48px';
      nextBtn.style.top = '45%';
      nextBtn.style.transform = 'translateY(-50%)';
      nextBtn.style.width = '28px';
      nextBtn.style.height = '28px';
      nextBtn.style.borderRadius = '50%';
      nextBtn.style.border = '1px solid var(--background-modifier-border)';
      nextBtn.style.background = 'var(--background-primary)';
      nextBtn.style.color = 'var(--text-normal)';
      nextBtn.style.cursor = 'pointer';
      nextBtn.style.display = 'flex';
      nextBtn.style.alignItems = 'center';
      nextBtn.style.justifyContent = 'center';
      nextBtn.style.fontSize = '16px';
      nextBtn.style.padding = '0';
      nextBtn.style.zIndex = '2';
      nextBtn.style.boxShadow = '0 2px 4px rgba(0,0,0,0.1)';
      
      prevBtn.disabled = currentLoop <= 1;
      nextBtn.disabled = config.repeating !== 'Loop' && currentLoop >= totalLoops;
      
      prevBtn.style.opacity = prevBtn.disabled ? '0.3' : '1';
      nextBtn.style.opacity = nextBtn.disabled ? '0.3' : '1';
      
      prevBtn.addEventListener('click', () => {
        if (currentLoop > 1) {
          block.currentLoop--;
          this.renderBlock(block.id);
        }
      });
      
      nextBtn.addEventListener('click', () => {
        if (config.repeating === 'Loop' || currentLoop < totalLoops) {
          block.currentLoop++;
          this.renderBlock(block.id);
        }
      });
      
      [prevBtn, nextBtn].forEach(btn => {
        btn.addEventListener('mouseenter', () => {
          if (!btn.disabled) {
            btn.style.background = 'var(--interactive-accent)';
            btn.style.color = 'var(--text-on-accent)';
          }
        });
        btn.addEventListener('mouseleave', () => {
          if (!btn.disabled) {
            btn.style.background = 'var(--background-primary)';
            btn.style.color = 'var(--text-normal)';
          }
        });
      });
    }
    
    // Send button
    const sendBtn = inputContainer.createEl('button', { 
      text: '➤',
      cls: 'ai-send-btn',
      attr: { title: 'Send (Shift+Enter)' }
    });
    sendBtn.style.position = 'absolute';
    sendBtn.style.right = '12px';
    sendBtn.style.bottom = '24px';
    sendBtn.style.width = '32px';
    sendBtn.style.height = '32px';
    sendBtn.style.borderRadius = '50%';
    sendBtn.style.border = 'none';
    sendBtn.style.background = 'var(--interactive-accent)';
    sendBtn.style.color = 'var(--text-on-accent)';
    sendBtn.style.cursor = 'pointer';
    sendBtn.style.display = 'flex';
    sendBtn.style.alignItems = 'center';
    sendBtn.style.justifyContent = 'center';
    sendBtn.style.fontSize = '18px';
    sendBtn.style.padding = '0';
    sendBtn.style.zIndex = '2';
    sendBtn.style.boxShadow = '0 2px 4px rgba(0,0,0,0.2)';
    sendBtn.style.transition = 'transform 0.2s';
    
    sendBtn.addEventListener('mouseenter', () => {
      sendBtn.style.transform = 'scale(1.1)';
    });
    
    sendBtn.addEventListener('mouseleave', () => {
      sendBtn.style.transform = 'scale(1)';
    });
    
    if (config.repeating === 'Loop') {
      const entry = cache.session_log?.find(e => e.id === currentLoop);
      if (entry) {
        input.value = entry.ask || '';
      }
    } else {
      const loopKey = `loop${currentLoop}`;
      if (cache[loopKey]?.[`ask-${currentLoop}`]) {
        input.value = cache[loopKey][`ask-${currentLoop}`];
      }
    }
    
    sendBtn.addEventListener('click', () => {
      this.handleSimpleInput(block, input.value);
    });
    
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && e.shiftKey) {
        e.preventDefault();
        this.handleSimpleInput(block, input.value);
      }
    });
  }

  renderSimpleResponse(block) {
    const { container, config, currentLoop, cache } = block;
    
    const responseContainer = container.createDiv({ cls: 'ai-simple-response' });
    responseContainer.style.padding      = '12px';
    responseContainer.style.background   = 'var(--background-secondary)';
    responseContainer.style.borderRadius = '8px';
    responseContainer.style.minHeight    = '60px';
    responseContainer.style.border       = '1px solid var(--background-modifier-border)';
    responseContainer.style.fontSize     = '14px';
    responseContainer.style.lineHeight   = '1.6';
    responseContainer.style.position     = 'relative';
    this._applyDisplayMode(responseContainer, config.display);
    
    let responseText = '';
    if (config.repeating === 'Loop') {
      const entry = cache.session_log?.find(e => e.id === currentLoop);
      responseText = entry?.res || '';
    } else {
      const loopKey = `loop${currentLoop}`;
      responseText = cache[loopKey]?.[`res-${currentLoop}`] || '';
    }
    
    if (responseText) {
      applyAutoTextDirection(responseContainer);
      MarkdownRenderer.render(
        this.plugin.app,
        responseText,
        responseContainer,
        '',
        this.plugin
      );
      this._appendCodeblockCopyBtn(responseContainer, responseText);
    } else {
      responseContainer.textContent = '';
    }
  }

  // ==================== SEPARATE IO ENVIRONMENT ====================

  renderSeparateIOEnvironment(block) {
    const { container, config, cache, id } = block;
    
    container.style.display = 'flex';
    container.style.flexDirection = 'column';
    container.style.gap = '8px';
    container.style.padding = '0';
    container.style.margin = '8px 0';
    container.style.background = 'transparent';

    const ioConfig = this.parseIOConfig(config.environment);
    
    if (ioConfig.type === 'input') {
      this.renderSeparateInput(block, ioConfig.id);
    } else if (ioConfig.type === 'output') {
      this.renderSeparateOutput(block, ioConfig.id);
    }
  }

  renderSeparateInput(block, ioId) {
    const { container, config, cache } = block;
    
    const inputContainer = container.createDiv({ cls: 'ai-separate-input' });
    inputContainer.style.position = 'relative';
    inputContainer.style.width = '100%';
    
    const input = inputContainer.createEl('textarea', {
      cls: 'ai-separate-input-field',
      attr: { 
        placeholder: config.emptyPlaceholder || 'Ask...',
        rows: '1'
      }
    });
    
    input.style.width = '100%';
    input.style.padding = '12px';
    input.style.paddingRight = '48px';
    input.style.borderRadius = '8px';
    input.style.border = '1px solid var(--background-modifier-border)';
    input.style.background = 'var(--background-secondary)';
    input.style.color = 'var(--text-normal)';
    input.style.fontSize = '14px';
    input.style.resize = 'vertical';
    input.style.boxSizing = 'border-box';
    
    if (cache[ioId]?.ask) {
      input.value = cache[ioId].ask;
    }
    
    const sendBtn = inputContainer.createEl('button', { 
      text: '➤',
      cls: 'ai-send-btn',
      attr: { title: 'Send (Shift+Enter)' }
    });
    sendBtn.style.position = 'absolute';
    sendBtn.style.right = '12px';
    sendBtn.style.bottom = '30%';
    sendBtn.style.width = '32px';
    sendBtn.style.height = '32px';
    sendBtn.style.borderRadius = '50%';
    sendBtn.style.border = 'none';
    sendBtn.style.background = 'var(--interactive-accent)';
    sendBtn.style.color = 'var(--text-on-accent)';
    sendBtn.style.cursor = 'pointer';
    sendBtn.style.display = 'flex';
    sendBtn.style.alignItems = 'center';
    sendBtn.style.justifyContent = 'center';
    sendBtn.style.fontSize = '18px';
    sendBtn.style.padding = '0';
    sendBtn.style.zIndex = '2';
    sendBtn.style.boxShadow = '0 2px 4px rgba(0,0,0,0.2)';
    
    sendBtn.addEventListener('click', () => {
      this.handleSeparateInput(block, ioId, input.value);
    });
    
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && e.shiftKey) {
        e.preventDefault();
        this.handleSeparateInput(block, ioId, input.value);
      }
    });
  }

  renderSeparateOutput(block, ioId) {
    const { container, config, cache } = block;
    
    const outputContainer = container.createDiv({ cls: 'ai-separate-output' });
    outputContainer.style.width = '100%';
    
    const responseDiv = outputContainer.createDiv({ cls: 'ai-separate-response' });
    responseDiv.style.padding      = '12px';
    responseDiv.style.background   = 'var(--background-secondary)';
    responseDiv.style.borderRadius = '8px';
    responseDiv.style.minHeight    = '60px';
    responseDiv.style.border       = '1px solid var(--background-modifier-border)';
    responseDiv.style.fontSize     = '14px';
    responseDiv.style.lineHeight   = '1.6';
    responseDiv.style.position     = 'relative';
    this._applyDisplayMode(responseDiv, config.display);
    
    if (cache[ioId]?.res) {
      applyAutoTextDirection(responseDiv);
      MarkdownRenderer.render(
        this.plugin.app,
        cache[ioId].res,
        responseDiv,
        '',
        this.plugin
      );
      this._appendCodeblockCopyBtn(responseDiv, cache[ioId].res);
    } else {
      responseDiv.textContent = '';
    }
  }

  // ==================== FULL ENVIRONMENT ====================

  renderFullEnvironment(block) {
    const { container, config, currentLoop, totalLoops, cache, id } = block;
    
    container.style.display = 'flex';
    container.style.flexDirection = 'column';
    container.style.gap = '12px';
    container.style.padding = '16px';
    container.style.border = '1px solid var(--background-modifier-border)';
    container.style.borderRadius = '8px';
    container.style.background = 'var(--background-primary)';
    container.style.margin = '8px 0';

    if (config.repeating !== '1' && config.moving === 'Arrow') {
      this.renderFullNavigation(block);
    }

    this.renderFullInput(block);
    this.renderFullResponse(block);
  }

  renderFullNavigation(block) {
    const { container, config, currentLoop, totalLoops } = block;
    
    const navBar = container.createDiv({ cls: 'ai-nav-bar' });
    navBar.style.display = 'flex';
    navBar.style.justifyContent = 'space-between';
    navBar.style.alignItems = 'center';
    navBar.style.padding = '8px';
    navBar.style.background = 'var(--background-secondary)';
    navBar.style.borderRadius = '6px';
    navBar.style.marginBottom = '8px';

    const prevBtn = navBar.createEl('button', { text: '← Previous' });
    const counter = navBar.createSpan({ 
      text: `Loop ${currentLoop} / ${totalLoops === Infinity ? '∞' : totalLoops}` 
    });
    const nextBtn = navBar.createEl('button', { text: 'Next →' });

    [prevBtn, nextBtn].forEach(btn => {
      btn.style.padding = '4px 12px';
      btn.style.borderRadius = '4px';
      btn.style.border = '1px solid var(--background-modifier-border)';
      btn.style.background = 'var(--background-primary)';
      btn.style.cursor = 'pointer';
    });

    prevBtn.disabled = currentLoop <= 1;
    nextBtn.disabled = config.repeating !== 'Loop' && currentLoop >= totalLoops;

    prevBtn.addEventListener('click', () => {
      if (currentLoop > 1) {
        block.currentLoop--;
        this.renderBlock(block.id);
      }
    });

    nextBtn.addEventListener('click', () => {
      if (config.repeating === 'Loop' || currentLoop < totalLoops) {
        block.currentLoop++;
        this.renderBlock(block.id);
      }
    });
  }

  renderFullInput(block) {
    const { container, config, currentLoop, cache } = block;
    
    const inputContainer = container.createDiv({ cls: 'ai-full-input' });
    
    const label = inputContainer.createEl('div', { 
      text: `Ask ${currentLoop}:`,
      cls: 'ai-input-label'
    });
    label.style.fontWeight = '600';
    label.style.marginBottom = '4px';
    
    const input = inputContainer.createEl('textarea', {
      cls: 'ai-codeblock-input',
      attr: { 
        placeholder: config.emptyPlaceholder || 'Ask...',
        rows: '3'
      }
    });
    
    input.style.width = '100%';
    input.style.padding = '12px';
    input.style.borderRadius = '8px';
    input.style.border = '1px solid var(--background-modifier-border)';
    input.style.background = 'var(--background-secondary)';
    input.style.color = 'var(--text-normal)';
    input.style.fontSize = '14px';
    input.style.resize = 'vertical';
    
    if (config.repeating === 'Loop') {
      const entry = cache.session_log?.find(e => e.id === currentLoop);
      if (entry) {
        input.value = entry.ask || '';
      }
    } else {
      const loopKey = `loop${currentLoop}`;
      if (cache[loopKey]?.[`ask-${currentLoop}`]) {
        input.value = cache[loopKey][`ask-${currentLoop}`];
      }
    }
    
    const sendBtn = inputContainer.createEl('button', { 
      text: 'Send',
      cls: 'ai-codeblock-send'
    });
    sendBtn.style.marginTop = '8px';
    sendBtn.style.padding = '8px 16px';
    sendBtn.style.borderRadius = '6px';
    sendBtn.style.background = 'var(--interactive-accent)';
    sendBtn.style.color = 'var(--text-on-accent)';
    sendBtn.style.border = 'none';
    sendBtn.style.cursor = 'pointer';
    
    sendBtn.addEventListener('click', () => {
      this.handleFullInput(block, input.value);
    });
    
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && e.shiftKey) {
        e.preventDefault();
        this.handleFullInput(block, input.value);
      }
    });
  }

  renderFullResponse(block) {
    const { container, config, currentLoop, cache } = block;
    
    const responseContainer = container.createDiv({ cls: 'ai-full-response' });
    responseContainer.style.padding      = '16px';
    responseContainer.style.background   = 'var(--background-secondary)';
    responseContainer.style.borderRadius = '8px';
    responseContainer.style.minHeight    = '100px';
    responseContainer.style.position     = 'relative';
    this._applyDisplayMode(responseContainer, config.display);
    
    const label = responseContainer.createEl('div', { 
      text: `Response ${currentLoop}:`,
      cls: 'ai-response-label'
    });
    label.style.fontWeight = '600';
    label.style.marginBottom = '8px';
    
    const contentDiv = responseContainer.createDiv({ cls: 'ai-response-content' });
    contentDiv.style.fontSize = '14px';
    contentDiv.style.lineHeight = '1.6';
    
    let responseText = '';
    if (config.repeating === 'Loop') {
      const entry = cache.session_log?.find(e => e.id === currentLoop);
      responseText = entry?.res || '';
    } else {
      const loopKey = `loop${currentLoop}`;
      responseText = cache[loopKey]?.[`res-${currentLoop}`] || '';
    }
    
    if (responseText) {
      applyAutoTextDirection(contentDiv);
      MarkdownRenderer.render(
        this.plugin.app,
        responseText,
        contentDiv,
        '',
        this.plugin
      );
      this._appendCodeblockCopyBtn(responseContainer, responseText);
    } else {
      contentDiv.textContent = '';
    }
  }

  // ==================== COPY BUTTON HELPER ====================

  /**
   * Appends a small "Copy" button in the top-right corner of a response container.
   * The button is only visible on hover to keep the UI clean when idle.
   *
   * @param {HTMLElement} container  - The response div to attach the button to
   * @param {string}      text       - The raw markdown text to copy
   */
  _appendCodeblockCopyBtn(container, text) {
    if (getComputedStyle(container).position === 'static') {
      container.style.position = 'relative';
    }

    const btn = container.createEl('button', {
      cls: 'ai-codeblock-copy-btn',
      attr: { title: 'Copy response' }
    });
    btn.style.position     = 'absolute';
    btn.style.top          = '8px';
    btn.style.right        = '8px';
    btn.style.padding      = '3px 8px';
    btn.style.borderRadius = '4px';
    btn.style.border       = '1px solid var(--background-modifier-border)';
    btn.style.background   = 'var(--background-primary)';
    btn.style.color        = 'var(--text-muted)';
    btn.style.cursor       = 'pointer';
    btn.style.fontSize     = '11px';
    btn.style.display      = 'flex';
    btn.style.alignItems   = 'center';
    btn.style.gap          = '4px';
    btn.style.opacity      = '0';
    btn.style.transition   = 'opacity 0.15s';
    btn.style.zIndex       = '10';

    const icon = btn.createSpan();
    setIcon(icon, 'copy');
    icon.style.display = 'flex';
    btn.createSpan().textContent = 'Copy';

    container.addEventListener('mouseenter', () => { btn.style.opacity = '1'; });
    container.addEventListener('mouseleave', () => { btn.style.opacity = '0'; });

    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      navigator.clipboard.writeText(text).then(() => {
        const origHTML = btn.innerHTML;
        btn.textContent = '✓ Copied';
        btn.style.color = 'var(--interactive-accent)';
        setTimeout(() => {
          btn.innerHTML = origHTML;
          btn.style.color = 'var(--text-muted)';
        }, 1500);
      }).catch(() => new Notice('⨉ Could not copy to clipboard'));
    });
  }

  // ==================== HANDLER METHODS ====================

  async handleSimpleInput(block, userInput) {
    if (!userInput.trim()) {
      new Notice('Please enter a question');
      return;
    }
    
    const { config, currentLoop, cache } = block;
    const loadingDiv = this.showSimpleLoading(block);

    try {
      const messages = [{ role: 'user', content: userInput }];
      
      if (config.systemPrompt) {
        messages.unshift({ role: 'system', content: config.systemPrompt });
      }
      
      const provider = this.getProvider(config.model);
      if (!provider) {
        throw new Error(`Provider not found for model: ${config.model}`);
      }
      
      const result = await provider.send({
        messages: messages,
        temperature: this.plugin.settings.temperature,
        max_tokens: this.plugin.settings.max_tokens,
        stream: false
      }, {
        timeoutMs: this.plugin.settings.timeoutMs
      });

      loadingDiv?.remove();
      
      if (config.repeating === 'Loop') {
        if (!cache.session_log) cache.session_log = [];
        
        const existingIndex = cache.session_log.findIndex(e => e.id === currentLoop);
        if (existingIndex !== -1) {
          cache.session_log[existingIndex] = {
            id: currentLoop,
            ask: userInput,
            res: result.final
          };
        } else {
          cache.session_log.push({
            id: currentLoop,
            ask: userInput,
            res: result.final
          });
        }
        
        cache.session_log.sort((a, b) => a.id - b.id);
        block.currentLoop = cache.session_log.length + 1;
        
      } else {
        const loopKey = `loop${currentLoop}`;
        if (!cache[loopKey]) cache[loopKey] = {};
        cache[loopKey][`ask-${currentLoop}`] = userInput;
        cache[loopKey][`res-${currentLoop}`] = result.final;
      }
      
      block.cache = cache;
      this.renderBlock(block.id);
      
      await this.saveCache(block);
      
    } catch (error) {
      loadingDiv?.remove();
      console.error('AI Code Block Error:', error);
      this.showSimpleError(block, error.message);
    }
  }

  async handleSeparateInput(block, ioId, userInput) {
    if (!userInput.trim()) {
      new Notice('Please enter a question');
      return;
    }
    
    const { config, cache } = block;
    
    try {
      const loadingDiv = block.container.createDiv({ cls: 'ai-loading' });
      loadingDiv.style.padding = '4px';
      loadingDiv.style.textAlign = 'center';
      loadingDiv.style.color = 'var(--text-muted)';
      loadingDiv.style.fontSize = '12px';
      loadingDiv.innerHTML = '⏳ Thinking' + threeDots();
      
      const messages = [{ role: 'user', content: userInput }];
      
      if (config.systemPrompt) {
        messages.unshift({ role: 'system', content: config.systemPrompt });
      }
      
      const provider = this.getProvider(config.model);
      if (!provider) {
        throw new Error(`Provider not found for model: ${config.model}`);
      }
      
      const result = await provider.send({
        messages: messages,
        temperature: this.plugin.settings.temperature,
        max_tokens: this.plugin.settings.max_tokens,
        stream: false
      }, {
        timeoutMs: this.plugin.settings.timeoutMs
      });
      
      loadingDiv.remove();
      
      if (!cache[ioId]) {
        cache[ioId] = {};
      }
      cache[ioId].ask = userInput;
      cache[ioId].res = result.final;
      
      block.cache = cache;
      
      await this.saveCache(block);

      // Re-render every Separate Output block that shares the same ioId so the
      // output updates immediately.  Without this the output box stays blank
      // until the user navigates away and back, because the two blocks are
      // independent activeBlocks entries and the input block has no direct DOM
      // reference to the output block.
      for (const [, candidate] of this.activeBlocks) {
        if (candidate === block) continue;
        const candidateIO = this.parseIOConfig(candidate.config.environment);
        if (candidateIO.type === 'output' && candidateIO.id === ioId) {
          candidate.cache = cache; // share the updated cache object
          this.renderBlock(candidate.id);
        }
      }

      const inputField = block.container.querySelector('.ai-separate-input-field');
      if (inputField) {
        inputField.value = '';
      }
      
      new Notice(`✓ Answer saved for ID: ${ioId}`);
      
    } catch (error) {
      console.error('AI Separate IO Error:', error);
      const loadingDiv = block.container.querySelector('.ai-loading');
      if (loadingDiv) loadingDiv.remove();
      
      const errorDiv = block.container.createDiv({ cls: 'ai-error' });
      errorDiv.style.padding = '8px';
      errorDiv.style.marginTop = '4px';
      errorDiv.style.borderRadius = '4px';
      errorDiv.style.background = 'rgba(var(--background-modifier-error-rgb), 0.1)';
      errorDiv.style.color = 'var(--text-error)';
      errorDiv.style.border = '1px solid var(--text-error)';
      errorDiv.style.fontSize = '12px';
      errorDiv.textContent = `⨉ Error: ${error.message}`;
      
      setTimeout(() => errorDiv.remove(), 5000);
    }
  }

  async handleFullInput(block, userInput) {
    if (!userInput.trim()) {
      new Notice('Please enter a question');
      return;
    }
    
    const { config, currentLoop, cache } = block;
    const loadingDiv = this.showFullLoading(block);

    try {
      const messages = this.prepareMessages(block, userInput);
      
      const provider = this.getProvider(config.model);
      if (!provider) {
        throw new Error(`Provider not found for model: ${config.model}`);
      }
      
      const result = await provider.send({
        messages: messages,
        temperature: this.plugin.settings.temperature,
        max_tokens: this.plugin.settings.max_tokens,
        stream: false
      }, {
        timeoutMs: this.plugin.settings.timeoutMs
      });

      loadingDiv?.remove();
      this.storeResponse(block, userInput, result.final);
      
      if (config.repeating === 'Loop') {
        block.currentLoop = (cache.session_log?.length || 0) + 1;
      }
      
      this.renderBlock(block.id);
      await this.saveCache(block);
      
    } catch (error) {
      loadingDiv?.remove();
      console.error('AI Code Block Error:', error);
      this.showFullError(block, error.message);
    }
  }

  showSimpleLoading(block) {
    // Scope the lookup to this block's own container — document.querySelector
    // would return the first matching element on the entire page, which is the
    // wrong block whenever more than one ai code block exists in the vault.
    const { container } = block;
    const existing = container.querySelector('.ai-simple-loading');
    if (existing) existing.remove();
    const responseDiv = container.querySelector('.ai-simple-response');
    if (!responseDiv) return null;
    const loadingDiv = document.createElement('div');
    loadingDiv.className = 'ai-simple-loading';
    loadingDiv.innerHTML = '⏳ Thinking' + threeDots();
    responseDiv.appendChild(loadingDiv);
    // Returned so the caller can remove it once the response arrives
    return loadingDiv;
  }

  showSimpleError(block, errorMessage) {
    const { container } = block;
    const errorDiv = container.createDiv({ cls: 'ai-simple-error' });
    errorDiv.style.padding = '12px';
    errorDiv.style.marginTop = '8px';
    errorDiv.style.borderRadius = '6px';
    errorDiv.style.background = 'rgba(var(--background-modifier-error-rgb), 0.1)';
    errorDiv.style.color = 'var(--text-error)';
    errorDiv.style.border = '1px solid var(--text-error)';
    errorDiv.style.fontSize = '13px';
    errorDiv.textContent = `⨉ Error: ${errorMessage}`;
    
    setTimeout(() => { if (errorDiv.parentNode) errorDiv.remove(); }, 5000);
  }

  showFullLoading(block) {
    const { container } = block;
    const existing = container.querySelector('.ai-loading');
    if (existing) existing.remove();

    const loadingDiv = container.createDiv({ cls: 'ai-loading' });
    loadingDiv.style.padding      = '12px';
    loadingDiv.style.textAlign    = 'center';
    loadingDiv.style.color        = 'var(--text-muted)';
    loadingDiv.style.background   = 'var(--background-secondary)';
    loadingDiv.style.borderRadius = '6px';
    loadingDiv.style.marginTop    = '8px';
    loadingDiv.style.fontSize     = '14px';
    loadingDiv.style.fontStyle    = 'italic';
    loadingDiv.innerHTML        = '⏳ Thinking' + threeDots();
    return loadingDiv;
  }

  showFullError(block, errorMessage) {
    const { container } = block;
    const errorDiv = container.createDiv({ cls: 'ai-error' });
    errorDiv.style.padding = '8px';
    errorDiv.style.margin = '8px 0';
    errorDiv.style.borderRadius = '4px';
    errorDiv.style.background = 'rgba(var(--background-modifier-error-rgb), 0.1)';
    errorDiv.style.color = 'var(--text-error)';
    errorDiv.style.border = '1px solid var(--text-error)';
    errorDiv.textContent = `⨉ Error: ${errorMessage}`;
    setTimeout(() => errorDiv.remove(), 5000);
  }

  // ==================== COMMON METHODS ====================

  prepareMessages(block, userInput) {
    const { config, cache, currentLoop } = block;
    const messages = [];
    
    if (config.systemPrompt) {
      messages.push({ role: 'system', content: config.systemPrompt });
    }
    
    if (config.memory !== 'Current') {
      const contextMessages = this.getContextMessages(block);
      messages.push(...contextMessages);
    }
    
    messages.push({ role: 'user', content: userInput });
    
    return messages;
  }

  getContextMessages(block) {
    const { config, cache, currentLoop } = block;
    const contextMessages = [];
    
    if (config.memory === 'All') {
      if (config.repeating === 'Loop') {
        if (cache.session_log) {
          cache.session_log.forEach(entry => {
            contextMessages.push({ role: 'user', content: entry.ask });
            contextMessages.push({ role: 'assistant', content: entry.res });
          });
        }
      } else {
        for (let i = 1; i < currentLoop; i++) {
          const loopKey = `loop${i}`;
          if (cache[loopKey]?.[`ask-${i}`] && cache[loopKey]?.[`res-${i}`]) {
            contextMessages.push({ role: 'user', content: cache[loopKey][`ask-${i}`] });
            contextMessages.push({ role: 'assistant', content: cache[loopKey][`res-${i}`] });
          }
        }
      }
    } else if (config.memory.startsWith('Previous')) {
      const match = config.memory.match(/\((\d+)\)/);
      const n = match ? parseInt(match[1]) : 1;
      
      if (config.repeating === 'Loop' && cache.session_log) {
        const recent = cache.session_log.slice(-n);
        recent.forEach(entry => {
          contextMessages.push({ role: 'user', content: entry.ask });
          contextMessages.push({ role: 'assistant', content: entry.res });
        });
      } else {
        const start = Math.max(1, currentLoop - n);
        for (let i = start; i < currentLoop; i++) {
          const loopKey = `loop${i}`;
          if (cache[loopKey]?.[`ask-${i}`] && cache[loopKey]?.[`res-${i}`]) {
            contextMessages.push({ role: 'user', content: cache[loopKey][`ask-${i}`] });
            contextMessages.push({ role: 'assistant', content: cache[loopKey][`res-${i}`] });
          }
        }
      }
    }
    
    return contextMessages;
  }

  storeResponse(block, userInput, response) {
    const { config, currentLoop, cache } = block;
    
    if (config.repeating === 'Loop') {
      if (!cache.session_log) {
        cache.session_log = [];
      }
      
      const existingIndex = cache.session_log.findIndex(entry => entry.id === currentLoop);
      
      if (existingIndex !== -1) {
        cache.session_log[existingIndex] = {
          id: currentLoop,
          ask: userInput,
          res: response
        };
      } else {
        cache.session_log.push({
          id: currentLoop,
          ask: userInput,
          res: response
        });
      }
      
      cache.session_log.sort((a, b) => a.id - b.id);
      
    } else {
      const loopKey = `loop${currentLoop}`;
      if (!cache[loopKey]) {
        cache[loopKey] = {};
      }
      
      cache[loopKey][`ask-${currentLoop}`] = userInput;
      cache[loopKey][`res-${currentLoop}`] = response;
    }
  }

  getProvider(model) {
    if (model && model !== '') {
      const providerMap = {
        'local': 'local',
        'gemini': 'gemini',
        'google': 'gemini',
        'anthropic': 'anthropic',
        'claude': 'anthropic',
        'openai': 'openai',
        'chatgpt': 'openai',
        'custom': 'custom'
      };
      
      const modelLower = model.toLowerCase();
      let providerType = providerMap[modelLower];
      
      if (!providerType) {
        if (modelLower.includes('gemini') || modelLower.includes('google')) {
          providerType = 'gemini';
        } else if (modelLower.includes('claude') || modelLower.includes('anthropic')) {
          providerType = 'anthropic';
        } else if (modelLower.includes('gpt') || modelLower.includes('openai') || modelLower.includes('chatgpt')) {
          providerType = 'openai';
        } else if (modelLower.includes('local')) {
          providerType = 'local';
        } else {
          providerType = this.plugin.settings.currentMode === 'local' ? 'local' : this.plugin.settings.cloudApiType;
        }
      }
      
      const provider = this.plugin.apiManager.providers[providerType];
      if (!provider) {
        const mode = this.plugin.settings.currentMode;
        const apiType = mode === 'cloud' ? this.plugin.settings.cloudApiType : 'local';
        return this.plugin.apiManager.providers[apiType];
      }
      
      return provider;
    }
    
    const mode = this.plugin.settings.currentMode;
    const apiType = mode === 'cloud' ? this.plugin.settings.cloudApiType : 'local';
    return this.plugin.apiManager.providers[apiType];
  }

  // ==================== ROBUST CACHING METHODS ====================

  async saveCache(block) {
  const { config, id, cache } = block;

    if (config.caching === 'Temporary') {
    return; 
  }
    if (config.caching === 'Data.json') {
      // Store in settings.codeBlockCache (in-memory); persist via saveState()
      // which writes sessions + codeBlockCache together to conversations.json.
      if (!this.plugin.settings.codeBlockCache) {
        this.plugin.settings.codeBlockCache = {};
      }
      this.plugin.settings.codeBlockCache[id] = JSON.parse(JSON.stringify(cache));
      await this.plugin.saveState();            // → conversations.json, not data.json
      new Notice('✓ Cache saved to conversations file');
    } 
    else if (config.caching === 'Code Block') {
      await this.updateCodeBlockSource(block);
    }
  }

  async updateCodeBlockSource(block) {
    const { cache, ctx, el, config } = block;
    if (config && config.caching) {
      const cacheType = config.caching.toString().toLowerCase().trim();
      if (cacheType === 'temporary' || cacheType === 'مؤقت') {
        console.log('⏳ Temporary cache bypassed saving via config.');
        return true; 
      }
    }

    try {
      // Resolve the file from the block's own render context (ctx.sourcePath),
      // NOT from the active view.  getActiveViewOfType returns whatever file the
      // user is currently looking at, which may be a completely different note if
      // they switched tabs while the AI was thinking — causing the cache to be
      // written into the wrong file.
      const file = this.plugin.app.vault.getAbstractFileByPath(ctx.sourcePath);
      if (!file) {
        new Notice('⚠ Cannot save cache: source file not found.');
        return false;
      }
      
      const content = await this.plugin.app.vault.read(file);
      const lines = content.split('\n');
      
      // Use Obsidian's native Context API
      const sectionInfo = ctx.getSectionInfo(el);
      
      if (!sectionInfo) {
        new Notice('⚠ Cannot save cache: Code block context lost. Did you switch files?');
        return false;
      }
      
      const { lineStart, lineEnd } = sectionInfo;
      
      // Extract ONLY the lines strictly inside this specific code block
      const blockLines = lines.slice(lineStart + 1, lineEnd);
      const isTemporaryText = blockLines.some(line => {
        const cleanLine = line.toLowerCase().replace(/\s/g, '');
        return cleanLine.includes('caching:temporary') || cleanLine.includes('caching:مؤقت');
      });

      if (isTemporaryText) {
        console.log('⏳ Temporary cache bypassed saving via text reading.');
        return true;
      }

      // 4. Filter out ANY existing cache line cleanly.
      const cleanLines = blockLines.filter(line => 
        !line.trim().startsWith('cached data:')
      );
      
      // 5. Stringify cache to a SINGLE LINE
      const cacheJSON = JSON.stringify(cache);
      
      // 6. Append the new cache line
      cleanLines.push(`cached data: ${cacheJSON}`);
      
      // 7. Reconstruct the entire file seamlessly
      const newLines = [
        ...lines.slice(0, lineStart + 1), // File content up to ```ai
        ...cleanLines,                    // Updated code block contents
        ...lines.slice(lineEnd)           // File content after ```
      ];
      
      // Write safely back to the vault
      await this.plugin.app.vault.modify(file, newLines.join('\n'));
      
      new Notice('✓ Cache successfully saved to code block');
      return true;
      
    } catch (e) {
      console.error('Error saving cache to code block:', e);
      new Notice('⚠ Error saving cache: ' + e.message);
      return false;
    }
  }
}

class AiChatBlockRenderer extends MarkdownRenderChild {
    constructor(containerEl, plugin, source, ctx) {
        super(containerEl); 
        this.plugin = plugin;
        this.source = source;
        this.ctx = ctx;
        this.blockId = null;
        this.isProcessing = false;
    }

    async onload() {
        if (this.isProcessing) return;
        this.isProcessing = true;
        
        try {
            if (this.plugin.codeBlockProcessor) {
                this.blockId = await this.plugin.codeBlockProcessor.process(
                    this.source, 
                    this.containerEl, 
                    this.ctx
                );
            }
        } catch (error) {
            console.error('Error in AiChatBlockRenderer:', error);
            this.containerEl.empty();
            const errorDiv = this.containerEl.createDiv({ cls: 'ai-error' });
            errorDiv.style.padding = '12px';
            errorDiv.style.color = 'var(--text-error)';
            errorDiv.style.background = 'rgba(var(--background-modifier-error-rgb), 0.1)';
            errorDiv.style.borderRadius = '8px';
            errorDiv.textContent = `⚠ AI Block Error: ${error.message}`;
        } finally {
            this.isProcessing = false;
        }
    }

    onunload() {
        // Clean up the block from the processor
        if (this.blockId && this.plugin.codeBlockProcessor) {
            this.plugin.codeBlockProcessor.activeBlocks.delete(this.blockId);
        }
        
        // Remove all children from the container
        if (this.containerEl) {
            this.containerEl.empty();
        }
        
        // Clear references to prevent memory leaks
        this.plugin = null;
        this.ctx = null;
    }
}

// ==================== OBSIDIAN NATIVE SETTINGS TAB ====================

/**
 * Renders the plugin's full settings UI directly inside Obsidian's own
 * Settings panel (Settings → Community Plugins → AI Assistant ⚙).
 *
 * All UI code mirrors SettingsModal so the native tab is a true first-class
 * settings surface. SettingsModal is left untouched so the in-chat shortcut
 * continues to work exactly as before.
 */
class AIPluginSettingTab extends PluginSettingTab {
  constructor(app, plugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display() {
    const { containerEl } = this;
    containerEl.empty();

    const tabsContainer = containerEl.createDiv({ cls: 'ai-settings-tabs' });
    tabsContainer.style.display = 'flex';
    tabsContainer.style.gap = '8px';
    tabsContainer.style.marginBottom = '20px';
    tabsContainer.style.borderBottom = '1px solid var(--background-modifier-border)';
    tabsContainer.style.paddingBottom = '10px';
    tabsContainer.style.flexWrap = 'wrap';

    const localTab = tabsContainer.createEl('button', { cls: 'ai-tab-btn active' });
    const localIcon = localTab.createSpan();
    setIcon(localIcon, 'monitor-speaker');
    localIcon.style.marginRight = '6px';
    localIcon.style.display = 'inline-flex';
    localTab.appendChild(document.createTextNode('Local Model'));

    const cloudTab = tabsContainer.createEl('button', { cls: 'ai-tab-btn' });
    const cloudIcon = cloudTab.createSpan();
    setIcon(cloudIcon, 'server');
    cloudIcon.style.marginRight = '6px';
    cloudIcon.style.display = 'inline-flex';
    cloudTab.appendChild(document.createTextNode('Cloud Model'));

    const generalTab = tabsContainer.createEl('button', { cls: 'ai-tab-btn' });
    const generalIcon = generalTab.createSpan();
    setIcon(generalIcon, 'settings');
    generalIcon.style.marginRight = '6px';
    generalIcon.style.display = 'inline-flex';
    generalTab.appendChild(document.createTextNode('General'));

    const shortcutsTab = tabsContainer.createEl('button', { cls: 'ai-tab-btn' });
    const shortcutsIcon = shortcutsTab.createSpan();
    setIcon(shortcutsIcon, 'command');
    shortcutsIcon.style.marginRight = '6px';
    shortcutsIcon.style.display = 'inline-flex';
    shortcutsTab.appendChild(document.createTextNode('Shortcuts'));

    const conversationsTab = tabsContainer.createEl('button', { cls: 'ai-tab-btn' });
    const convIcon = conversationsTab.createSpan();
    setIcon(convIcon, 'message-square');
    convIcon.style.marginRight = '6px';
    convIcon.style.display = 'inline-flex';
    conversationsTab.appendChild(document.createTextNode('Conversations'));

    const namingTab = tabsContainer.createEl('button', { cls: 'ai-tab-btn' });
    const namingIcon = namingTab.createSpan();
    setIcon(namingIcon, 'type');
    namingIcon.style.marginRight = '6px';
    namingIcon.style.display = 'inline-flex';
    namingTab.appendChild(document.createTextNode('Auto-Naming'));

    const fileAccessTab = tabsContainer.createEl('button', { cls: 'ai-tab-btn' });
    const fileAccessIcon = fileAccessTab.createSpan();
    setIcon(fileAccessIcon, 'folder-cog');
    fileAccessIcon.style.marginRight = '6px';
    fileAccessIcon.style.display = 'inline-flex';
    fileAccessTab.appendChild(document.createTextNode('File Access'));

    [localTab, cloudTab, generalTab, shortcutsTab, conversationsTab, namingTab, fileAccessTab].forEach(tab => {
      tab.style.padding = '10px 16px';
      tab.style.border = 'none';
      tab.style.background = 'transparent';
      tab.style.color = 'var(--text-muted)';
      tab.style.cursor = 'pointer';
      tab.style.borderRadius = '6px';
      tab.style.fontSize = '14px';
      tab.style.display = 'flex';
      tab.style.alignItems = 'center';
    });

    const contentContainer = containerEl.createDiv({ cls: 'ai-settings-content' });
    contentContainer.style.paddingRight = '10px';
    contentContainer.style.marginBottom = '20px';

    this.showLocalSettings(contentContainer);

    localTab.addEventListener('click', () => {
      this.setActiveTab(localTab, [cloudTab, generalTab, shortcutsTab, conversationsTab, namingTab, fileAccessTab]);
      this.showLocalSettings(contentContainer);
    });
    cloudTab.addEventListener('click', () => {
      this.setActiveTab(cloudTab, [localTab, generalTab, shortcutsTab, conversationsTab, namingTab, fileAccessTab]);
      this.showCloudSettings(contentContainer);
    });
    generalTab.addEventListener('click', () => {
      this.setActiveTab(generalTab, [localTab, cloudTab, shortcutsTab, conversationsTab, namingTab, fileAccessTab]);
      this.showGeneralSettings(contentContainer);
    });
    shortcutsTab.addEventListener('click', () => {
      this.setActiveTab(shortcutsTab, [localTab, cloudTab, generalTab, conversationsTab, namingTab, fileAccessTab]);
      this.showShortcutsSettings(contentContainer);
    });
    conversationsTab.addEventListener('click', () => {
      this.setActiveTab(conversationsTab, [localTab, cloudTab, generalTab, shortcutsTab, namingTab, fileAccessTab]);
      this.showConversationsSettings(contentContainer);
    });
    namingTab.addEventListener('click', () => {
      this.setActiveTab(namingTab, [localTab, cloudTab, generalTab, shortcutsTab, conversationsTab, fileAccessTab]);
      this.showNamingSettings(contentContainer);
    });
    fileAccessTab.addEventListener('click', () => {
      this.setActiveTab(fileAccessTab, [localTab, cloudTab, generalTab, shortcutsTab, conversationsTab, namingTab]);
      this.showFileAccessSettings(contentContainer);
    });
  }

  setActiveTab(activeTab, otherTabs) {
    activeTab.classList.add('active');
    activeTab.style.background = 'var(--interactive-accent)';
    activeTab.style.color = 'var(--text-on-accent)';
    activeTab.style.fontWeight = '600';
    otherTabs.forEach(tab => {
      tab.classList.remove('active');
      tab.style.background = 'transparent';
      tab.style.color = 'var(--text-muted)';
      tab.style.fontWeight = 'normal';
    });
  }

  showLocalSettings(container) {
    container.empty();
    const section = container.createDiv({ cls: 'ai-settings-section' });
    section.style.background = 'var(--background-secondary)';
    section.style.borderRadius = '8px';
    section.style.padding = '20px';
    section.style.marginBottom = '20px';
    section.style.border = '1px solid var(--background-modifier-border)';
    const h3 = section.createEl('h3');
    h3.style.display = 'flex';
    h3.style.alignItems = 'center';
    const h3Icon = h3.createSpan();
    setIcon(h3Icon, 'monitor-speaker');
    h3Icon.style.marginRight = '8px';
    h3.appendChild(document.createTextNode('Local Model Configuration'));
    this.createInputField(section, 'Base URL:', 'baseUrl', this.plugin.settings.baseUrl, 'text', 'http://127.0.0.1:11434');
    this.createInputField(section, 'Endpoint:', 'localEndpoint', this.plugin.settings.localEndpoint, 'text', '/v1/chat/completions');
    this.createInputField(section, 'Model Name:', 'localModel', this.plugin.settings.localModel, 'text', 'llama2');
    this.createTestConnectionButton(section, () => new LocalAIProvider(this.plugin), 'local');
  }

  showCloudSettings(container) {
    container.empty();
    const apiTypeSection = container.createDiv({ cls: 'ai-settings-section' });
    apiTypeSection.style.background = 'var(--background-secondary)';
    apiTypeSection.style.borderRadius = '8px';
    apiTypeSection.style.padding = '20px';
    apiTypeSection.style.marginBottom = '20px';
    apiTypeSection.style.border = '1px solid var(--background-modifier-border)';
    const h3 = apiTypeSection.createEl('h3');
    h3.style.display = 'flex';
    h3.style.alignItems = 'center';
    const h3Icon = h3.createSpan();
    setIcon(h3Icon, 'server');
    h3Icon.style.marginRight = '8px';
    h3.appendChild(document.createTextNode('Cloud Provider Selection'));
    this.createAPITypeSelector(apiTypeSection);
    const settingsContainer = container.createDiv({ cls: 'ai-api-settings-container' });
    this.showSpecificAPISettings(settingsContainer);
  }

  createAPITypeSelector(container) {
    const row = container.createDiv({ cls: 'ai-api-type-selector' });
    row.style.display = 'flex';
    row.style.gap = '10px';
    row.style.marginBottom = '20px';
    row.style.flexWrap = 'wrap';
    const providers = [
      { id: 'openai', name: 'OpenAI', icon: 'cpu' },
      { id: 'gemini', name: 'Gemini', icon: 'sparkles' },
      { id: 'anthropic', name: 'Claude', icon: 'cloud' },
      { id: 'custom', name: 'Custom', icon: 'settings' }
    ];
    providers.forEach(provider => {
      const btn = row.createEl('button', {
        cls: `ai-provider-btn ${this.plugin.settings.cloudApiType === provider.id ? 'active' : ''}`
      });
      const iconSpan = btn.createSpan();
      setIcon(iconSpan, provider.icon);
      iconSpan.style.marginRight = '6px';
      iconSpan.style.display = 'inline-flex';
      iconSpan.style.verticalAlign = 'middle';
      const textSpan = btn.createSpan();
      textSpan.textContent = provider.name;
      textSpan.style.verticalAlign = 'middle';
      btn.style.flex = '1';
      btn.style.minWidth = '120px';
      btn.style.padding = '12px';
      btn.style.borderRadius = '8px';
      btn.style.border = '2px solid';
      btn.style.background = 'var(--background-secondary)';
      btn.style.color = 'var(--text-normal)';
      btn.style.cursor = 'pointer';
      btn.style.fontSize = '14px';
      btn.style.fontWeight = '600';
      if (this.plugin.settings.cloudApiType === provider.id) {
        btn.style.background = 'var(--background-primary)';
        btn.style.borderWidth = '3px';
      }
      btn.dataset.provider = provider.id;
      btn.addEventListener('click', () => {
        this.plugin.settings.cloudApiType = provider.id;
        document.querySelectorAll('.ai-provider-btn').forEach(b => {
          b.classList.remove('active');
          b.style.background = 'var(--background-secondary)';
          b.style.borderWidth = '2px';
        });
        btn.classList.add('active');
        btn.style.background = 'var(--background-primary)';
        btn.style.borderWidth = '3px';
        this.showSpecificAPISettings(document.querySelector('.ai-api-settings-container'));
      });
    });
  }

  showSpecificAPISettings(container) {
    container.empty();
    switch (this.plugin.settings.cloudApiType) {
      case 'openai':    this.showOpenAISettings(container);    break;
      case 'gemini':    this.showGeminiSettings(container);    break;
      case 'anthropic': this.showAnthropicSettings(container); break;
      case 'custom':    this.showCustomSettings(container);    break;
    }
  }

  showOpenAISettings(container) {
    const section = container.createDiv({ cls: 'ai-settings-section' });
    section.style.background = 'var(--background-secondary)';
    section.style.borderRadius = '8px';
    section.style.padding = '20px';
    section.style.marginBottom = '20px';
    section.style.border = '1px solid var(--background-modifier-border)';
    const h3 = section.createEl('h3');
    h3.style.display = 'flex';
    h3.style.alignItems = 'center';
    const h3Icon = h3.createSpan();
    setIcon(h3Icon, 'cpu');
    h3Icon.style.marginRight = '8px';
    h3.appendChild(document.createTextNode('OpenAI Configuration'));
    this.createInputField(section, 'API Key:', 'openaiApiKey', this.plugin.settings.openaiApiKey, 'password');
    this.createInputField(section, 'Model:', 'openaiModel', this.plugin.settings.openaiModel, 'text', 'gpt-3.5-turbo');
    this.createInputField(section, 'Custom Endpoint (optional):', 'openaiEndpoint', this.plugin.settings.openaiEndpoint, 'text', 'https://api.openai.com/v1/chat/completions');
    this.createTestConnectionButton(section, () => new OpenAIProvider(this.plugin), 'openai');
  }

  showGeminiSettings(container) {
    const section = container.createDiv({ cls: 'ai-settings-section' });
    section.style.background = 'var(--background-secondary)';
    section.style.borderRadius = '8px';
    section.style.padding = '20px';
    section.style.marginBottom = '20px';
    section.style.border = '1px solid var(--background-modifier-border)';
    const h3 = section.createEl('h3');
    h3.style.display = 'flex';
    h3.style.alignItems = 'center';
    const h3Icon = h3.createSpan();
    setIcon(h3Icon, 'sparkles');
    h3Icon.style.marginRight = '8px';
    h3.appendChild(document.createTextNode('Google Gemini Configuration (Non-Streaming)'));
    this.createInputField(section, 'API Key:', 'geminiApiKey', this.plugin.settings.geminiApiKey, 'password');
    this.createInputField(section, 'Model:', 'geminiModel', this.plugin.settings.geminiModel, 'text', 'gemini-1.5-flash');
    this.createTestConnectionButton(section, () => new GeminiProvider(this.plugin), 'gemini');
  }

  showAnthropicSettings(container) {
    const section = container.createDiv({ cls: 'ai-settings-section' });
    section.style.background = 'var(--background-secondary)';
    section.style.borderRadius = '8px';
    section.style.padding = '20px';
    section.style.marginBottom = '20px';
    section.style.border = '1px solid var(--background-modifier-border)';
    const h3 = section.createEl('h3');
    h3.style.display = 'flex';
    h3.style.alignItems = 'center';
    const h3Icon = h3.createSpan();
    setIcon(h3Icon, 'cloud');
    h3Icon.style.marginRight = '8px';
    h3.appendChild(document.createTextNode('Anthropic Claude Configuration'));
    this.createInputField(section, 'API Key:', 'anthropicApiKey', this.plugin.settings.anthropicApiKey, 'password');
    this.createInputField(section, 'Model:', 'anthropicModel', this.plugin.settings.anthropicModel, 'text', 'claude-3-haiku-20240307');
    this.createTestConnectionButton(section, () => new AnthropicProvider(this.plugin), 'anthropic');
  }

  showCustomSettings(container) {
    const section = container.createDiv({ cls: 'ai-settings-section' });
    section.style.background = 'var(--background-secondary)';
    section.style.borderRadius = '8px';
    section.style.padding = '20px';
    section.style.marginBottom = '20px';
    section.style.border = '1px solid var(--background-modifier-border)';
    const h3 = section.createEl('h3');
    h3.style.display = 'flex';
    h3.style.alignItems = 'center';
    const h3Icon = h3.createSpan();
    setIcon(h3Icon, 'settings');
    h3Icon.style.marginRight = '8px';
    h3.appendChild(document.createTextNode('Custom API Configuration'));
    this.createInputField(section, 'API Key:', 'customApiKey', this.plugin.settings.customApiKey, 'password');
    this.createInputField(section, 'Model Name:', 'customModel', this.plugin.settings.customModel, 'text');
    this.createInputField(section, 'Endpoint URL:', 'customEndpoint', this.plugin.settings.customEndpoint, 'text');
    const row = section.createDiv({ cls: 'ai-settings-row' });
    row.style.marginBottom = '16px';
    row.createEl('label', { text: 'HTTP Headers (JSON):' }).style.display = 'block';
    const headersText = row.createEl('textarea', { text: this.plugin.settings.customHeaders || '{}', rows: 3 });
    headersText.style.width = '100%';
    headersText.style.padding = '10px 14px';
    headersText.style.borderRadius = '8px';
    headersText.style.border = '1px solid var(--background-modifier-border)';
    headersText.style.backgroundColor = 'var(--background-primary)';
    headersText.style.color = 'var(--text-normal)';
    headersText.style.fontSize = '14px';
    headersText.style.fontFamily = 'monospace';
    headersText.addEventListener('change', (e) => { this.plugin.settings.customHeaders = e.target.value; });
    const row2 = section.createDiv({ cls: 'ai-settings-row' });
    row2.style.marginBottom = '16px';
    row2.createEl('label', { text: 'Body Template (JSON):' }).style.display = 'block';
    const templateText = row2.createEl('textarea', {
      text: this.plugin.settings.customBodyTemplate || '{"messages": {{messages}}, "model": "{{model}}"}',
      rows: 4
    });
    templateText.style.width = '100%';
    templateText.style.padding = '10px 14px';
    templateText.style.borderRadius = '8px';
    templateText.style.border = '1px solid var(--background-modifier-border)';
    templateText.style.backgroundColor = 'var(--background-primary)';
    templateText.style.color = 'var(--text-normal)';
    templateText.style.fontSize = '14px';
    templateText.style.fontFamily = 'monospace';
    templateText.addEventListener('change', (e) => { this.plugin.settings.customBodyTemplate = e.target.value; });
    this.createTestConnectionButton(section, () => new CustomProvider(this.plugin), 'custom');
  }

  showGeneralSettings(container) {
    container.empty();
    const section = container.createDiv({ cls: 'ai-settings-section' });
    section.style.background = 'var(--background-secondary)';
    section.style.borderRadius = '8px';
    section.style.padding = '20px';
    section.style.marginBottom = '20px';
    section.style.border = '1px solid var(--background-modifier-border)';
    const h3 = section.createEl('h3');
    h3.style.display = 'flex';
    h3.style.alignItems = 'center';
    const h3Icon = h3.createSpan();
    setIcon(h3Icon, 'settings');
    h3Icon.style.marginRight = '8px';
    h3.appendChild(document.createTextNode('General Settings'));
    this.createSliderField(section, 'Temperature:', 'temperature', this.plugin.settings.temperature, 0, 2, 0.1);
    this.createInputField(section, 'Max Tokens:', 'max_tokens', this.plugin.settings.max_tokens, 'number', '2048');
    this.createInputField(section, 'Conversations Folder:', 'conversationsFolder', this.plugin.settings.conversationsFolder, 'text', 'AI Conversations');
    this.createInputField(section, 'Timeout (ms):', 'timeoutMs', this.plugin.settings.timeoutMs, 'number', '120000');
    this.createCheckboxField(section, 'Auto-check health on startup:', 'autoCheckHealth', this.plugin.settings.autoCheckHealth);
    this.createCheckboxField(section, 'Show token counter:', 'showTokenCounter', this.plugin.settings.showTokenCounter);
    this.createCheckboxField(
      section,
      'Allow AI to edit notes directly (adds an "Apply to Note" button on every AI response):',
      'allowDirectEditing',
      this.plugin.settings.allowDirectEditing
    );
    this.createInputPositionSelector(section);
    this._createExportTemplateField(section);
  }

  _createExportTemplateField(container) {
    const row = container.createDiv({ cls: 'ai-settings-row' });
    row.style.marginBottom = '16px';
    const labelRow = row.createDiv();
    labelRow.style.display = 'flex';
    labelRow.style.justifyContent = 'space-between';
    labelRow.style.alignItems = 'baseline';
    labelRow.style.marginBottom = '6px';
    labelRow.createEl('label', { text: 'Markdown Export Template:' }).style.fontWeight = '600';
    const resetBtn = labelRow.createEl('button', { text: 'Reset to default' });
    resetBtn.style.fontSize = '12px';
    resetBtn.style.padding = '2px 8px';
    resetBtn.style.cursor = 'pointer';
    resetBtn.style.borderRadius = '4px';
    resetBtn.style.border = '1px solid var(--background-modifier-border)';
    resetBtn.style.background = 'var(--background-secondary)';
    resetBtn.style.color = 'var(--text-muted)';
    const hint = row.createEl('p');
    hint.style.fontSize = '12px';
    hint.style.color = 'var(--text-muted)';
    hint.style.marginTop = '0';
    hint.style.marginBottom = '6px';
    hint.innerHTML =
      'Supported tags (case-insensitive): ' +
      '<code>{{title}}</code>, <code>{{system_prompt}}</code>, <code>{{messages}}</code>, ' +
      '<code>{{ai_response}}</code>, <code>{{us_question}}</code>, ' +
      '<code>{{S-loop}}</code> \u2026 <code>{{E-loop}}</code>. ' +
      'Leave empty to use the built-in default.';
    const textarea = row.createEl('textarea');
    textarea.value = this.plugin.settings.markdownExportTemplate || '';
    textarea.placeholder = MarkdownTemplateEngine.DEFAULT_TEMPLATE;
    textarea.rows = 14;
    textarea.style.width = '100%';
    textarea.style.padding = '10px 14px';
    textarea.style.borderRadius = '8px';
    textarea.style.border = '1px solid var(--background-modifier-border)';
    textarea.style.backgroundColor = 'var(--background-primary)';
    textarea.style.color = 'var(--text-normal)';
    textarea.style.fontSize = '13px';
    textarea.style.fontFamily = 'var(--font-monospace)';
    textarea.style.resize = 'vertical';
    textarea.style.boxSizing = 'border-box';
    textarea.addEventListener('change', (e) => { this.plugin.settings.markdownExportTemplate = e.target.value; });
    resetBtn.addEventListener('click', () => {
      this.plugin.settings.markdownExportTemplate = '';
      textarea.value = '';
      new Notice('Export template reset to default.');
    });
  }

  showShortcutsSettings(container) {
    container.empty();
    const section = container.createDiv({ cls: 'ai-settings-section' });
    section.style.background = 'var(--background-secondary)';
    section.style.borderRadius = '8px';
    section.style.padding = '20px';
    section.style.marginBottom = '20px';
    section.style.border = '1px solid var(--background-modifier-border)';
    const h3 = section.createEl('h3');
    h3.style.display = 'flex';
    h3.style.alignItems = 'center';
    const h3Icon = h3.createSpan();
    setIcon(h3Icon, 'command');
    h3Icon.style.marginRight = '8px';
    h3.appendChild(document.createTextNode('Keyboard Shortcuts'));
    const subHint = section.createDiv();
    subHint.style.fontSize = '12px';
    subHint.style.color = 'var(--text-muted)';
    subHint.style.marginBottom = '16px';
    subHint.style.marginTop = '-4px';
    subHint.textContent = 'Use the toggle on the right to show or hide each item in the \u2318 command menu.';
    this.createShortcutField(section, 'New Conversation:',    'newConversation',    this.plugin.settings.shortcuts.newConversation);
    this.createShortcutField(section, 'Save Conversation:',   'saveConversation',   this.plugin.settings.shortcuts.saveConversation);
    this.createShortcutField(section, 'Rename Conversation:', 'renameConversation', this.plugin.settings.shortcuts.renameConversation || 'Ctrl+Shift+R');
    this.createShortcutField(section, 'Open Settings:',       'settings',           this.plugin.settings.shortcuts.settings);
    this.createShortcutField(section, 'Open Chat Page:',      'openChatPage',       'Ctrl+Shift+O');
    this.createShortcutField(section, 'Ask Selection:',       'askSelection',       this.plugin.settings.shortcuts.askSelection  || 'Ctrl+Shift+A');
    this.createShortcutField(section, 'Edit Selection:',      'editSelection',      this.plugin.settings.shortcuts.editSelection || 'Ctrl+Shift+E');
    const info = section.createDiv({ cls: 'ai-shortcuts-info' });
    info.style.background = 'var(--background-primary)';
    info.style.borderRadius = '8px';
    info.style.padding = '12px';
    info.style.marginTop = '16px';
    info.style.border = '1px solid var(--background-modifier-border)';
    info.style.fontSize = '12px';
    info.style.color = 'var(--text-muted)';
    info.innerHTML = '<p><strong>Note:</strong> Use Ctrl for Windows/Linux, Cmd for Mac. Examples: Ctrl+Shift+N, Cmd+Shift+N</p>';
  }

  showFileAccessSettings(container) {
    container.empty();
    const scopeSection = container.createDiv({ cls: 'ai-settings-section' });
    scopeSection.style.background = 'var(--background-secondary)';
    scopeSection.style.borderRadius = '8px';
    scopeSection.style.padding = '20px';
    scopeSection.style.marginBottom = '20px';
    scopeSection.style.border = '1px solid var(--background-modifier-border)';
    const scopeH3 = scopeSection.createEl('h3');
    scopeH3.style.display = 'flex';
    scopeH3.style.alignItems = 'center';
    const scopeIcon = scopeH3.createSpan();
    setIcon(scopeIcon, 'folder-cog');
    scopeIcon.style.marginRight = '8px';
    scopeH3.appendChild(document.createTextNode('AI File Operations'));
    const scopeHint = scopeSection.createEl('p');
    scopeHint.style.fontSize = '13px';
    scopeHint.style.color = 'var(--text-muted)';
    scopeHint.style.marginTop = '0';
    scopeHint.textContent = 'Lets the AI create, edit, copy, move, or rename files in your vault when you explicitly ask it to.';
    const scopeRow = scopeSection.createDiv({ cls: 'ai-settings-row' });
    scopeRow.style.marginBottom = '16px';
    scopeRow.createEl('label', { text: 'Access level:' }).style.display = 'block';
    const scopeSelect = scopeRow.createEl('select');
    scopeSelect.style.width = '100%';
    scopeSelect.style.padding = '8px';
    scopeSelect.style.marginTop = '6px';
    scopeSelect.style.borderRadius = '6px';
    scopeSelect.style.border = '1px solid var(--background-modifier-border)';
    scopeSelect.style.backgroundColor = 'var(--background-primary)';
    scopeSelect.style.color = 'var(--text-normal)';
    [
      { value: 'disabled',   text: 'Disabled \u2014 the AI cannot touch any files' },
      { value: 'restricted', text: 'Restricted \u2014 only inside paths you choose' },
      { value: 'full',       text: 'Full vault access (with optional exceptions)' }
    ].forEach(opt => {
      const optEl = scopeSelect.createEl('option', { value: opt.value, text: opt.text });
      if ((this.plugin.settings.fileOpsScope || 'disabled') === opt.value) optEl.selected = true;
    });
    const allowedRow = scopeSection.createDiv({ cls: 'ai-settings-row' });
    allowedRow.style.marginBottom = '4px';
    allowedRow.style.display = (this.plugin.settings.fileOpsScope === 'restricted') ? 'block' : 'none';
    allowedRow.createEl('label', { text: 'Allowed paths (one per line):' }).style.display = 'block';
    const allowedTextarea = allowedRow.createEl('textarea', {
      text: (this.plugin.settings.fileOpsPaths || []).join('\n'),
      attr: { rows: 4, placeholder: 'AI Files\nProjects/Scripts' }
    });
    allowedTextarea.style.width = '100%';
    allowedTextarea.style.padding = '10px 14px';
    allowedTextarea.style.marginTop = '6px';
    allowedTextarea.style.borderRadius = '8px';
    allowedTextarea.style.border = '1px solid var(--background-modifier-border)';
    allowedTextarea.style.backgroundColor = 'var(--background-primary)';
    allowedTextarea.style.color = 'var(--text-normal)';
    allowedTextarea.style.fontSize = '14px';
    allowedTextarea.style.fontFamily = 'monospace';
    allowedTextarea.style.boxSizing = 'border-box';
    allowedTextarea.addEventListener('change', (e) => {
      this.plugin.settings.fileOpsPaths = e.target.value.split('\n').map(s => s.trim()).filter(Boolean);
      this.plugin.saveSettings();
    });
    const allowedHint = allowedRow.createEl('p');
    allowedHint.style.fontSize = '12px';
    allowedHint.style.color = 'var(--text-muted)';
    allowedHint.style.marginBottom = '0';
    allowedHint.textContent = 'The AI can create, edit, copy, move, or search anything inside these folders. Everything else is off-limits.';
    const excludedRow = scopeSection.createDiv({ cls: 'ai-settings-row' });
    excludedRow.style.marginBottom = '4px';
    excludedRow.style.marginTop = '12px';
    excludedRow.style.display = (this.plugin.settings.fileOpsScope === 'full') ? 'block' : 'none';
    excludedRow.createEl('label', { text: 'Excluded paths (optional, one per line):' }).style.display = 'block';
    const excludedTextarea = excludedRow.createEl('textarea', {
      text: (this.plugin.settings.fileOpsExcludedPaths || []).join('\n'),
      attr: { rows: 3, placeholder: 'Private\nFinances/Taxes' }
    });
    excludedTextarea.style.width = '100%';
    excludedTextarea.style.padding = '10px 14px';
    excludedTextarea.style.marginTop = '6px';
    excludedTextarea.style.borderRadius = '8px';
    excludedTextarea.style.border = '1px solid var(--background-modifier-border)';
    excludedTextarea.style.backgroundColor = 'var(--background-primary)';
    excludedTextarea.style.color = 'var(--text-normal)';
    excludedTextarea.style.fontSize = '14px';
    excludedTextarea.style.fontFamily = 'monospace';
    excludedTextarea.style.boxSizing = 'border-box';
    excludedTextarea.addEventListener('change', (e) => {
      this.plugin.settings.fileOpsExcludedPaths = e.target.value.split('\n').map(s => s.trim()).filter(Boolean);
      this.plugin.saveSettings();
    });
    const excludedHint = excludedRow.createEl('p');
    excludedHint.style.fontSize = '12px';
    excludedHint.style.color = 'var(--text-muted)';
    excludedHint.style.marginBottom = '0';
    excludedHint.textContent = 'Leave blank to give the AI access to your entire vault. Anything listed here will be invisible to it.';
    scopeSelect.addEventListener('change', (e) => {
      this.plugin.settings.fileOpsScope = e.target.value;
      allowedRow.style.display  = (e.target.value === 'restricted') ? 'block' : 'none';
      excludedRow.style.display = (e.target.value === 'full')       ? 'block' : 'none';
      this.plugin.saveSettings();
    });
    // soul.md section
    const soulSection = container.createDiv({ cls: 'ai-settings-section' });
    soulSection.style.background = 'var(--background-secondary)';
    soulSection.style.borderRadius = '8px';
    soulSection.style.padding = '20px';
    soulSection.style.marginBottom = '20px';
    soulSection.style.border = '1px solid var(--background-modifier-border)';
    const soulH3 = soulSection.createEl('h3');
    soulH3.style.display = 'flex';
    soulH3.style.alignItems = 'center';
    const soulIcon = soulH3.createSpan();
    setIcon(soulIcon, 'file-heart');
    soulIcon.style.marginRight = '8px';
    soulH3.appendChild(document.createTextNode('soul.md'));
    const soulHint = soulSection.createEl('p');
    soulHint.style.fontSize = '13px';
    soulHint.style.color = 'var(--text-muted)';
    soulHint.style.marginTop = '0';
    soulHint.textContent = 'Read by the AI before any file operation. Use it to describe how you want files created, named, organized, and handled.';
    const soulSourceRow = soulSection.createDiv({ cls: 'ai-settings-row' });
    soulSourceRow.style.marginBottom = '16px';
    soulSourceRow.createEl('label', { text: 'Source:' }).style.display = 'block';
    const soulSourceSelect = soulSourceRow.createEl('select');
    soulSourceSelect.style.width = '100%';
    soulSourceSelect.style.padding = '8px';
    soulSourceSelect.style.marginTop = '6px';
    soulSourceSelect.style.borderRadius = '6px';
    soulSourceSelect.style.border = '1px solid var(--background-modifier-border)';
    soulSourceSelect.style.backgroundColor = 'var(--background-primary)';
    soulSourceSelect.style.color = 'var(--text-normal)';
    [
      { value: 'inline', text: 'Edit here in Settings' },
      { value: 'file',   text: 'Read from a file in my vault' }
    ].forEach(opt => {
      const optEl = soulSourceSelect.createEl('option', { value: opt.value, text: opt.text });
      if ((this.plugin.settings.soulMdSource || 'inline') === opt.value) optEl.selected = true;
    });
    const inlineRow = soulSection.createDiv({ cls: 'ai-settings-row' });
    inlineRow.style.display = (this.plugin.settings.soulMdSource === 'file') ? 'none' : 'block';
    inlineRow.style.marginBottom = '10px';
    const inlineTextarea = inlineRow.createEl('textarea', {
      text: this.plugin.settings.soulMdInline?.trim() ? this.plugin.settings.soulMdInline : DEFAULT_SOUL_MD,
      rows: 10
    });
    inlineTextarea.style.width = '100%';
    inlineTextarea.style.padding = '10px 14px';
    inlineTextarea.style.marginTop = '6px';
    inlineTextarea.style.borderRadius = '8px';
    inlineTextarea.style.border = '1px solid var(--background-modifier-border)';
    inlineTextarea.style.backgroundColor = 'var(--background-primary)';
    inlineTextarea.style.color = 'var(--text-normal)';
    inlineTextarea.style.fontSize = '13px';
    inlineTextarea.style.fontFamily = 'monospace';
    inlineTextarea.style.boxSizing = 'border-box';
    inlineTextarea.addEventListener('change', (e) => {
      this.plugin.settings.soulMdInline = e.target.value;
      this.plugin.saveSettings();
    });
    const fileRow = soulSection.createDiv({ cls: 'ai-settings-row' });
    fileRow.style.display = (this.plugin.settings.soulMdSource === 'file') ? 'block' : 'none';
    fileRow.createEl('label', { text: 'Vault path to soul.md:' }).style.display = 'block';
    const filePathInput = fileRow.createEl('input', {
      type: 'text',
      value: this.plugin.settings.soulMdFilePath || this.plugin.defaultSoulMdPath,
      placeholder: this.plugin.defaultSoulMdPath
    });
    filePathInput.style.width = '100%';
    filePathInput.style.padding = '10px 14px';
    filePathInput.style.marginTop = '6px';
    filePathInput.style.borderRadius = '8px';
    filePathInput.style.border = '1px solid var(--background-modifier-border)';
    filePathInput.style.backgroundColor = 'var(--background-primary)';
    filePathInput.style.color = 'var(--text-normal)';
    filePathInput.style.fontSize = '14px';
    filePathInput.style.boxSizing = 'border-box';
    filePathInput.addEventListener('change', (e) => {
      this.plugin.settings.soulMdFilePath = e.target.value.trim();
      this.plugin.saveSettings();
    });
    const fileHint = fileRow.createEl('p');
    fileHint.style.fontSize = '12px';
    fileHint.style.color = 'var(--text-muted)';
    fileHint.textContent = "If this file doesn't exist yet, it will be created automatically with the default principles the first time it's needed.";
    soulSourceSelect.addEventListener('change', (e) => {
      this.plugin.settings.soulMdSource = e.target.value;
      inlineRow.style.display = (e.target.value === 'file') ? 'none' : 'block';
      fileRow.style.display   = (e.target.value === 'file') ? 'block' : 'none';
      this.plugin.saveSettings();
    });
  }

  showNamingSettings(container) {
    container.empty();
    const section = container.createDiv({ cls: 'ai-settings-section' });
    section.style.background = 'var(--background-secondary)';
    section.style.borderRadius = '8px';
    section.style.padding = '20px';
    section.style.marginBottom = '20px';
    section.style.border = '1px solid var(--background-modifier-border)';
    const h3 = section.createEl('h3');
    h3.style.display = 'flex';
    h3.style.alignItems = 'center';
    const h3Icon = h3.createSpan();
    setIcon(h3Icon, 'type');
    h3Icon.style.marginRight = '8px';
    h3.appendChild(document.createTextNode('Auto-Naming Settings'));
    this.createCheckboxField(section, 'Enable auto-naming of conversations', 'autoNameConversations', this.plugin.settings.autoNameConversations);
    const modelSection = section.createDiv({ cls: 'ai-settings-subsection' });
    modelSection.style.marginTop = '20px';
    modelSection.style.padding = '16px';
    modelSection.style.background = 'var(--background-primary)';
    modelSection.style.borderRadius = '8px';
    modelSection.style.border = '1px solid var(--background-modifier-border)';
    const providerWrap = modelSection.createDiv();
    providerWrap.style.marginBottom = '15px';
    const providerLabel = providerWrap.createEl('div', { text: 'Naming Provider', cls: 'ai-settings-label' });
    providerLabel.style.fontWeight = '600';
    providerLabel.style.marginBottom = '6px';
    const providerSelect = providerWrap.createEl('select');
    providerSelect.style.width = '100%';
    providerSelect.style.padding = '8px';
    providerSelect.style.borderRadius = '6px';
    providerSelect.style.border = '1px solid var(--background-modifier-border)';
    providerSelect.style.backgroundColor = 'var(--background-secondary)';
    providerSelect.style.color = 'var(--text-normal)';
    [
      { value: 'default',   text: 'Default (Use Active Provider)' },
      { value: 'local',     text: 'Local LLM' },
      { value: 'openai',    text: 'OpenAI' },
      { value: 'gemini',    text: 'Google Gemini' },
      { value: 'anthropic', text: 'Anthropic Claude' },
      { value: 'custom',    text: 'Custom Provider' }
    ].forEach(p => {
      const opt = providerSelect.createEl('option', { value: p.value, text: p.text });
      if (this.plugin.settings.namingProvider === p.value) opt.selected = true;
    });
    providerSelect.addEventListener('change', async () => {
      this.plugin.settings.namingProvider = providerSelect.value;
      if (typeof this.plugin.saveSettings === 'function') await this.plugin.saveSettings();
      updateModelPlaceholder();
    });
    const modelWrap = modelSection.createDiv();
    const modelLabel = modelWrap.createEl('div', { text: 'Naming Model Name', cls: 'ai-settings-label' });
    modelLabel.style.fontWeight = '600';
    modelLabel.style.marginBottom = '6px';
    const modelInput = modelWrap.createEl('input', { type: 'text' });
    modelInput.style.width = '100%';
    modelInput.style.padding = '8px 12px';
    modelInput.style.borderRadius = '6px';
    modelInput.style.border = '1px solid var(--background-modifier-border)';
    modelInput.style.backgroundColor = 'var(--background-secondary)';
    modelInput.style.color = 'var(--text-normal)';
    modelInput.value = this.plugin.settings.namingModel || '';
    modelInput.addEventListener('input', async () => {
      this.plugin.settings.namingModel = modelInput.value;
      if (typeof this.plugin.saveSettings === 'function') await this.plugin.saveSettings();
    });
    const PROVIDER_DEFAULTS = {
      default:   '(uses whatever the active provider has configured)',
      local:     this.plugin.settings.localModel     || 'llama2',
      openai:    this.plugin.settings.openaiModel    || 'gpt-3.5-turbo',
      gemini:    this.plugin.settings.geminiModel    || 'gemini-1.5-flash',
      anthropic: this.plugin.settings.anthropicModel || 'claude-3-haiku-20240307',
      custom:    '(your custom model name)',
    };
    const updateModelPlaceholder = () => {
      modelInput.placeholder = PROVIDER_DEFAULTS[providerSelect.value] || '(provider default)';
    };
    providerSelect.addEventListener('change', updateModelPlaceholder);
    updateModelPlaceholder();
    const modelHint = modelWrap.createEl('div', { text: "Leave empty to use the provider's configured model." });
    modelHint.style.fontSize = '11px';
    modelHint.style.color = 'var(--text-muted)';
    modelHint.style.marginTop = '5px';
    const promptSection = section.createDiv({ cls: 'ai-settings-subsection' });
    promptSection.style.marginTop = '20px';
    promptSection.style.padding = '16px';
    promptSection.style.background = 'var(--background-primary)';
    promptSection.style.borderRadius = '8px';
    promptSection.style.border = '1px solid var(--background-modifier-border)';
    const promptLabelWrap = promptSection.createDiv();
    const promptLabelEl = promptLabelWrap.createEl('div', { text: 'Naming Prompt Template', cls: 'ai-settings-label' });
    promptLabelEl.style.fontWeight = '600';
    promptLabelEl.style.marginBottom = '4px';
    const promptDescEl = promptLabelWrap.createEl('div', {
      text: 'Customise the instructions used for auto-naming. The user message is inserted automatically \u2014 optionally use {{message}} to control exactly where it appears.'
    });
    promptDescEl.style.fontSize = '12px';
    promptDescEl.style.color = 'var(--text-muted)';
    promptDescEl.style.marginBottom = '12px';
    const promptTextarea = promptSection.createEl('textarea');
    promptTextarea.style.width = '100%';
    promptTextarea.style.height = '120px';
    promptTextarea.style.padding = '10px';
    promptTextarea.style.borderRadius = '6px';
    promptTextarea.style.border = '1px solid var(--background-modifier-border)';
    promptTextarea.style.backgroundColor = 'var(--background-secondary)';
    promptTextarea.style.color = 'var(--text-normal)';
    promptTextarea.style.fontFamily = 'var(--font-monospace)';
    promptTextarea.style.fontSize = '13px';
    promptTextarea.style.resize = 'vertical';
    const defaultPrompt = 'Based on this first message, generate a very short, concise title (maximum 5-6 words) for a conversation. The title should capture the main topic or intent. Return ONLY the title, no quotes, no explanations, no extra text.\n\nFirst message: "{{message}}"\n\nConversation title:';
    promptTextarea.value = this.plugin.settings.namingPromptTemplate || defaultPrompt;
    promptTextarea.addEventListener('input', async () => {
      this.plugin.settings.namingPromptTemplate = promptTextarea.value;
      if (typeof this.plugin.saveSettings === 'function') await this.plugin.saveSettings();
    });
    this.createSliderField(section, 'Naming Temperature (lower = more consistent):', 'namingTemperature', this.plugin.settings.namingTemperature || 0.3, 0, 1, 0.1);
    this.createInputField(section, 'Max Tokens for Naming:', 'namingMaxTokens', this.plugin.settings.namingMaxTokens || 30, 'number', '30');
    this.createInputField(section, 'Naming Timeout (ms):', 'namingTimeoutMs', this.plugin.settings.namingTimeoutMs || 10000, 'number', '10000');
    const previewSection = section.createDiv({ cls: 'ai-settings-subsection' });
    previewSection.style.marginTop = '20px';
    previewSection.style.padding = '16px';
    previewSection.style.background = 'var(--background-primary)';
    previewSection.style.borderRadius = '8px';
    previewSection.style.border = '1px solid var(--background-modifier-border)';
    const previewLabel = previewSection.createEl('div', { text: 'Preview:', cls: 'ai-settings-label' });
    previewLabel.style.fontWeight = '600';
    previewLabel.style.marginBottom = '8px';
    const previewInput = previewSection.createEl('input', {
      type: 'text', placeholder: 'Enter a sample message to test naming...', cls: 'ai-naming-preview-input'
    });
    previewInput.style.width = '100%';
    previewInput.style.padding = '10px 14px';
    previewInput.style.borderRadius = '8px';
    previewInput.style.border = '1px solid var(--background-modifier-border)';
    previewInput.style.backgroundColor = 'var(--background-secondary)';
    previewInput.style.color = 'var(--text-normal)';
    previewInput.style.fontSize = '14px';
    previewInput.style.marginBottom = '10px';
    const previewBtn = previewSection.createEl('button', { cls: 'ai-preview-btn' });
    const previewIcon = previewBtn.createSpan();
    setIcon(previewIcon, 'play');
    previewIcon.style.marginRight = '6px';
    previewIcon.style.display = 'inline-flex';
    previewIcon.style.verticalAlign = 'middle';
    previewBtn.createSpan().textContent = 'Test Naming';
    previewBtn.style.padding = '8px 16px';
    previewBtn.style.borderRadius = '6px';
    previewBtn.style.border = '1px solid var(--background-modifier-border)';
    previewBtn.style.background = 'var(--interactive-accent)';
    previewBtn.style.color = 'var(--text-on-accent)';
    previewBtn.style.cursor = 'pointer';
    previewBtn.style.fontSize = '13px';
    previewBtn.style.marginRight = '10px';
    const previewResult = previewSection.createDiv({ cls: 'ai-preview-result' });
    previewResult.style.marginTop = '12px';
    previewResult.style.padding = '12px';
    previewResult.style.borderRadius = '6px';
    previewResult.style.background = 'var(--background-secondary)';
    previewResult.style.border = '1px solid var(--background-modifier-border)';
    previewResult.style.fontSize = '14px';
    previewResult.style.minHeight = '40px';
    previewResult.style.display = 'none';
    previewBtn.addEventListener('click', async () => {
      const testMessage = previewInput.value.trim();
      if (!testMessage) { new Notice('Please enter a test message'); return; }
      previewBtn.disabled = true;
      previewBtn.style.opacity = '0.5';
      previewResult.style.display = 'block';
      previewResult.textContent = 'Generating...';
      try {
        const chosenProvider = this.plugin.settings.namingProvider || 'default';
        let targetProviderKey = chosenProvider;
        if (chosenProvider === 'default') {
          targetProviderKey = this.plugin.settings.currentMode === 'local' ? 'local' : this.plugin.settings.cloudApiType;
        }
        const provider = this.plugin.apiManager.providers[targetProviderKey];
        const prompt = (this.plugin.settings.namingPromptTemplate || defaultPrompt).replace('{{message}}', testMessage);
        const sendOptions = {
          messages: [{ role: 'user', content: prompt }],
          temperature: this.plugin.settings.namingTemperature || 0.3,
          max_tokens: this.plugin.settings.namingMaxTokens || 30,
          stream: false
        };
        if (this.plugin.settings.namingModel) sendOptions.model = this.plugin.settings.namingModel;
        const result = await provider.send(sendOptions, { timeoutMs: this.plugin.settings.namingTimeoutMs || 10000 });
        if (result && result.final) {
          let title = result.final.trim().replace(/^["']|["']$/g, '').replace(/[.!?]$/, '');
          previewResult.textContent = `Generated name: "${title}"`;
        } else {
          previewResult.textContent = 'Failed to generate name';
        }
      } catch (error) {
        previewResult.textContent = `Error: ${error.message}`;
      } finally {
        previewBtn.disabled = false;
        previewBtn.style.opacity = '1';
      }
    });
  }

  showConversationsSettings(container) {
    container.empty();
    const section = container.createDiv({ cls: 'ai-settings-section' });
    section.style.background = 'var(--background-secondary)';
    section.style.borderRadius = '8px';
    section.style.padding = '20px';
    section.style.marginBottom = '20px';
    section.style.border = '1px solid var(--background-modifier-border)';
    const h3 = section.createEl('h3');
    h3.style.display = 'flex';
    h3.style.alignItems = 'center';
    const h3Icon = h3.createSpan();
    setIcon(h3Icon, 'message-square');
    h3Icon.style.marginRight = '8px';
    h3.appendChild(document.createTextNode('Conversation Management'));
    const allSessions = this.plugin._sessionManager.getAllSessions({ excludeTemporary: true });
    const needsNaming = this.plugin._sessionManager.getSessionsNeedingNaming();
    const statsRow = section.createDiv({ cls: 'ai-stats-row' });
    statsRow.style.display = 'flex';
    statsRow.style.alignItems = 'center';
    statsRow.style.justifyContent = 'space-between';
    statsRow.style.marginBottom = '20px';
    statsRow.style.padding = '12px';
    statsRow.style.background = 'var(--background-primary)';
    statsRow.style.borderRadius = '8px';
    statsRow.style.border = '1px solid var(--background-modifier-border)';
    const statsText = statsRow.createDiv({ cls: 'ai-stats-text' });
    statsText.style.display = 'flex';
    statsText.style.gap = '20px';
    const totalStat = statsText.createDiv({ cls: 'ai-stat' });
    totalStat.innerHTML = `<strong>Total:</strong> ${allSessions.length}`;
    totalStat.style.fontSize = '14px';
    const namingStat = statsText.createDiv({ cls: 'ai-stat' });
    namingStat.innerHTML = `<strong>Need Naming:</strong> ${needsNaming.length}`;
    namingStat.style.fontSize = '14px';
    if (needsNaming.length > 0) {
      const nameAllBtn = statsRow.createEl('button', { cls: 'ai-name-all-btn' });
      const nameIcon = nameAllBtn.createSpan();
      setIcon(nameIcon, 'type');
      nameIcon.style.marginRight = '4px';
      nameAllBtn.createSpan().textContent = 'Name All';
      nameAllBtn.style.padding = '6px 12px';
      nameAllBtn.style.borderRadius = '6px';
      nameAllBtn.style.border = 'none';
      nameAllBtn.style.background = 'var(--interactive-accent)';
      nameAllBtn.style.color = 'var(--text-on-accent)';
      nameAllBtn.style.cursor = 'pointer';
      nameAllBtn.style.fontSize = '12px';
      nameAllBtn.style.display = 'flex';
      nameAllBtn.style.alignItems = 'center';
      nameAllBtn.addEventListener('click', async () => {
        nameAllBtn.disabled = true;
        nameAllBtn.style.opacity = '0.5';
        let named = 0, failed = 0;
        for (const session of needsNaming) {
          if (session.messages.length > 0) {
            const firstUserMessage = session.messages.find(m => m.role === 'user');
            if (firstUserMessage) {
              try {
                const generatedName = await this.plugin.generateConversationName(firstUserMessage.content);
                if (generatedName) { session.name = generatedName; session.needsNaming = false; named++; }
                else { failed++; }
              } catch { failed++; }
            }
          }
        }
        if (named > 0) {
          this.plugin.saveState();
          this.showConversationsSettings(container);
          new Notice(`\u2713 Named ${named} conversations${failed > 0 ? `, ${failed} failed` : ''}`);
          this.refreshChatViews();
        }
        nameAllBtn.disabled = false;
        nameAllBtn.style.opacity = '1';
      });
    }
    const sessionList = section.createDiv({ cls: 'ai-session-list' });
    sessionList.style.maxHeight = '300px';
    sessionList.style.overflowY = 'auto';
    sessionList.style.border = '1px solid var(--background-modifier-border)';
    sessionList.style.borderRadius = '8px';
    sessionList.style.padding = '8px';
    sessionList.style.marginBottom = '16px';
    sessionList.style.backgroundColor = 'var(--background-primary)';
    const sessions = this.plugin._sessionManager.getAllSessions({ excludeTemporary: true });
    if (sessions.length === 0) {
      const emptyMsg = sessionList.createDiv({ cls: 'ai-empty-sessions', text: 'No conversations yet' });
      emptyMsg.style.textAlign = 'center';
      emptyMsg.style.padding = '40px 20px';
      emptyMsg.style.color = 'var(--text-muted)';
      emptyMsg.style.fontSize = '14px';
    } else {
      sessions.forEach(session => {
        const sessionRow = sessionList.createDiv({
          cls: `ai-session-row ${this.plugin._sessionManager.activeId === session.id ? 'active' : ''}`
        });
        sessionRow.style.display = 'flex';
        sessionRow.style.justifyContent = 'space-between';
        sessionRow.style.alignItems = 'center';
        sessionRow.style.padding = '10px 12px';
        sessionRow.style.borderRadius = '6px';
        sessionRow.style.marginBottom = '6px';
        sessionRow.style.backgroundColor = 'var(--background-secondary)';
        sessionRow.style.border = '1px solid var(--background-modifier-border)';
        if (this.plugin._sessionManager.activeId === session.id) {
          sessionRow.style.backgroundColor = 'rgba(var(--interactive-accent-rgb), 0.1)';
          sessionRow.style.borderColor = 'var(--interactive-accent)';
        }
        const sessionInfo = sessionRow.createDiv({ cls: 'ai-session-info' });
        sessionInfo.style.flex = '1';
        sessionInfo.style.minWidth = '0';
        const nameSpan = sessionInfo.createEl('div', { cls: 'ai-session-name' });
        nameSpan.textContent = session.name;
        nameSpan.style.fontWeight = '600';
        nameSpan.style.fontSize = '14px';
        nameSpan.style.color = 'var(--text-normal)';
        nameSpan.style.marginBottom = '2px';
        nameSpan.style.whiteSpace = 'nowrap';
        nameSpan.style.overflow = 'hidden';
        nameSpan.style.textOverflow = 'ellipsis';
        const messageCount = sessionInfo.createEl('div', {
          cls: 'ai-session-count',
          text: `${session.messages.length} message${session.messages.length !== 1 ? 's' : ''}`
        });
        messageCount.style.fontSize = '12px';
        messageCount.style.color = 'var(--text-muted)';
        const sessionActions = sessionRow.createDiv({ cls: 'ai-session-actions' });
        sessionActions.style.display = 'flex';
        sessionActions.style.gap = '6px';
        sessionActions.style.flexShrink = '0';
        const duplicateBtn = sessionActions.createEl('button', { cls: 'ai-session-action-btn duplicate', text: 'duplicate' });
        duplicateBtn.style.padding = '4px 8px';
        duplicateBtn.style.borderRadius = '4px';
        duplicateBtn.style.border = '1px solid var(--background-modifier-border)';
        duplicateBtn.style.backgroundColor = 'var(--background-secondary)';
        duplicateBtn.style.color = 'var(--text-normal)';
        duplicateBtn.style.cursor = 'pointer';
        duplicateBtn.style.fontSize = '11px';
        duplicateBtn.addEventListener('click', () => {
          new PromptModal(this.plugin.app, {
            title: 'Duplicate Conversation',
            placeholder: 'Name for the copy',
            initial: `${session.name} (Copy)`
          }, (newName) => {
            if (newName && newName.trim()) {
              const duplicate = this.plugin._sessionManager.duplicate(session.id, newName.trim());
              if (duplicate) {
                this.plugin.saveState();
                this.showConversationsSettings(container);
                new Notice(`\u2713 Copied to: ${duplicate.name}`);
                this.refreshChatViews();
              }
            }
          }).open();
        });
        const switchBtn = sessionActions.createEl('button', { text: 'Activate', cls: 'ai-session-action-btn' });
        switchBtn.style.padding = '4px 8px';
        switchBtn.style.borderRadius = '4px';
        switchBtn.style.border = '1px solid var(--background-modifier-border)';
        switchBtn.style.backgroundColor = 'var(--background-secondary)';
        switchBtn.style.color = 'var(--text-normal)';
        switchBtn.style.cursor = 'pointer';
        switchBtn.style.fontSize = '11px';
        switchBtn.addEventListener('click', () => {
          this.plugin._sessionManager.switchTo(session.id);
          this.plugin.saveState();
          this.showConversationsSettings(container);
          new Notice(`Switched to conversation: ${session.name}`);
          this.refreshChatViews();
        });
        const deleteBtn = sessionActions.createEl('button', { text: 'Delete', cls: 'ai-session-action-btn delete' });
        deleteBtn.style.padding = '4px 8px';
        deleteBtn.style.borderRadius = '4px';
        deleteBtn.style.border = '1px solid var(--text-error)';
        deleteBtn.style.backgroundColor = 'rgba(var(--background-modifier-error-rgb), 0.1)';
        deleteBtn.style.color = 'var(--text-error)';
        deleteBtn.style.cursor = 'pointer';
        deleteBtn.style.fontSize = '11px';
        deleteBtn.addEventListener('click', () => {
          new ConfirmModal(this.plugin.app, {
            title: 'Delete Conversation',
            message: `Delete "${session.name}"? This cannot be undone.`,
            confirmLabel: 'Delete',
            danger: true
          }, (ok) => {
            if (!ok) return;
            this.plugin._sessionManager.delete(session.id);
            this.plugin.saveState();
            this.showConversationsSettings(container);
            new Notice('Conversation deleted');
            this.refreshChatViews();
          }).open();
        });
        const saveBtn = sessionActions.createEl('button', { cls: 'ai-session-action-btn save' });
        const saveIcon = saveBtn.createSpan();
        setIcon(saveIcon, 'save');
        saveIcon.style.marginRight = '4px';
        saveIcon.style.display = 'inline-flex';
        saveIcon.style.verticalAlign = 'middle';
        saveBtn.createSpan().textContent = 'Save';
        saveBtn.style.padding = '4px 8px';
        saveBtn.style.borderRadius = '4px';
        saveBtn.style.border = '1px solid #2e7d32';
        saveBtn.style.backgroundColor = 'rgba(46, 125, 50, 0.1)';
        saveBtn.style.color = '#2e7d32';
        saveBtn.style.cursor = 'pointer';
        saveBtn.style.fontSize = '11px';
        saveBtn.addEventListener('click', async () => { await this.saveConversationToFile(session); });
      });
    }
    const newSessionSection = section.createDiv({ cls: 'ai-new-session-section' });
    newSessionSection.style.display = 'flex';
    newSessionSection.style.gap = '10px';
    newSessionSection.style.marginBottom = '16px';
    const newSessionInput = newSessionSection.createEl('input', {
      type: 'text', placeholder: 'New conversation name (leave empty for auto-name)', cls: 'ai-new-session-input'
    });
    newSessionInput.style.flex = '1';
    newSessionInput.style.padding = '10px 14px';
    newSessionInput.style.borderRadius = '8px';
    newSessionInput.style.border = '1px solid var(--background-modifier-border)';
    newSessionInput.style.backgroundColor = 'var(--background-primary)';
    newSessionInput.style.color = 'var(--text-normal)';
    newSessionInput.style.fontSize = '14px';
    const newSessionBtn = newSessionSection.createEl('button', { cls: 'ai-new-session-btn' });
    const newIcon = newSessionBtn.createSpan();
    setIcon(newIcon, 'plus');
    newIcon.style.marginRight = '6px';
    newIcon.style.display = 'inline-flex';
    newIcon.style.verticalAlign = 'middle';
    newSessionBtn.createSpan().textContent = 'New Conversation';
    newSessionBtn.style.padding = '10px 16px';
    newSessionBtn.style.borderRadius = '8px';
    newSessionBtn.style.border = '1px solid var(--background-modifier-border)';
    newSessionBtn.style.backgroundColor = 'var(--interactive-accent)';
    newSessionBtn.style.color = 'var(--text-on-accent)';
    newSessionBtn.style.cursor = 'pointer';
    newSessionBtn.style.fontSize = '14px';
    newSessionBtn.addEventListener('click', () => {
      const name = newSessionInput.value.trim();
      if (name) {
        this.plugin._sessionManager.create(name);
        this.plugin.saveState();
        new Notice(`\u2713 Created conversation: ${name}`);
      } else {
        this.plugin._sessionManager.create('New Conversation', '', true);
        this.plugin.saveState();
        new Notice(this.plugin.settings.autoNameConversations
          ? 'Conversation created - will be auto-named after first message'
          : '\u2713 Created new conversation');
      }
      this.showConversationsSettings(container);
      newSessionInput.value = '';
      this.refreshChatViews();
    });
    const bottomButtonsRow = section.createDiv({ cls: 'ai-bottom-buttons-row' });
    bottomButtonsRow.style.display = 'flex';
    bottomButtonsRow.style.gap = '10px';
    bottomButtonsRow.style.marginTop = '16px';
    const clearAllBtn = bottomButtonsRow.createEl('button', { cls: 'ai-clear-all-btn' });
    const clearIcon = clearAllBtn.createSpan();
    setIcon(clearIcon, 'trash-2');
    clearIcon.style.marginRight = '6px';
    clearIcon.style.display = 'inline-flex';
    clearIcon.style.verticalAlign = 'middle';
    clearAllBtn.createSpan().textContent = 'Delete All Conversations';
    clearAllBtn.style.flex = '1';
    clearAllBtn.style.padding = '12px';
    clearAllBtn.style.borderRadius = '8px';
    clearAllBtn.style.border = '1px solid var(--text-error)';
    clearAllBtn.style.backgroundColor = 'rgba(var(--background-modifier-error-rgb), 0.1)';
    clearAllBtn.style.color = 'var(--text-error)';
    clearAllBtn.style.cursor = 'pointer';
    clearAllBtn.style.fontSize = '14px';
    clearAllBtn.addEventListener('click', () => {
      new ConfirmModal(this.plugin.app, {
        title: 'Delete All Conversations',
        message: 'This will permanently delete every conversation. This cannot be undone.',
        confirmLabel: 'Delete All',
        danger: true
      }, (ok) => {
        if (!ok) return;
        this.plugin._sessionManager.sessions = [];
        this.plugin._sessionManager.create('Default Conversation');
        this.plugin.saveState();
        this.showConversationsSettings(container);
        new Notice('All conversations deleted');
        this.refreshChatViews();
      }).open();
    });
    const exportAllBtn = bottomButtonsRow.createEl('button', { cls: 'ai-export-all-btn' });
    const exportIcon = exportAllBtn.createSpan();
    setIcon(exportIcon, 'download');
    exportIcon.style.marginRight = '6px';
    exportIcon.style.display = 'inline-flex';
    exportIcon.style.verticalAlign = 'middle';
    exportAllBtn.createSpan().textContent = 'Export All';
    exportAllBtn.style.flex = '1';
    exportAllBtn.style.padding = '12px';
    exportAllBtn.style.borderRadius = '8px';
    exportAllBtn.style.border = '1px solid var(--background-modifier-border)';
    exportAllBtn.style.backgroundColor = 'var(--background-secondary)';
    exportAllBtn.style.color = 'var(--text-normal)';
    exportAllBtn.style.cursor = 'pointer';
    exportAllBtn.style.fontSize = '14px';
    exportAllBtn.addEventListener('click', async () => {
      const sessions = this.plugin._sessionManager.getAllSessions({ excludeTemporary: true });
      if (sessions.length === 0) { new Notice('No conversations to export'); return; }
      exportAllBtn.disabled = true;
      exportAllBtn.style.opacity = '0.5';
      let exported = 0, failed = 0;
      for (const session of sessions) {
        try {
          const folderPath = this.plugin.settings.conversationsFolder || 'AI Conversations';
          const baseName = session.name.replace(/[\\/:*?"<>|]/g, '_');
          const folderExists = await this.app.vault.adapter.exists(folderPath);
          if (!folderExists) await this.app.vault.createFolder(folderPath);
          const fullPath = await this.plugin.getUniqueFilePath(folderPath, baseName, 'md');
          await this.app.vault.create(fullPath, this.plugin._sessionManager.exportToMarkdown(session));
          exported++;
        } catch (error) {
          console.error('Error exporting conversation:', error);
          failed++;
        }
      }
      new Notice(`\u2713 Exported ${exported} conversations${failed > 0 ? `, ${failed} failed` : ''}`);
      exportAllBtn.disabled = false;
      exportAllBtn.style.opacity = '1';
    });
  }

  async saveConversationToFile(session) {
    try {
      const file = await this.plugin.saveSessionToVault(session);
      const frag = document.createDocumentFragment();
      const container = frag.createDiv();
      container.style.display = 'flex';
      container.style.alignItems = 'center';
      container.style.gap = '12px';
      container.createSpan({ text: `\u2713 Saved: ${file.name}` });
      const btn = container.createEl('button', { text: 'Open Note', cls: 'mod-cta' });
      btn.style.padding = '2px 10px';
      btn.style.height = 'auto';
      btn.style.fontSize = '0.85em';
      btn.style.cursor = 'pointer';
      btn.addEventListener('click', () => this.plugin.app.workspace.getLeaf(true).openFile(file));
      new Notice(frag, 15000);
    } catch (error) {
      console.error('Error saving conversation:', error);
      new Notice(`\u2a09 Error saving conversation: ${error.message}`);
    }
  }

  refreshChatViews() {
    this.plugin.refreshChatViews();
  }

  createTestConnectionButton(container, providerFactory, providerKey = 'local') {
    const row = container.createDiv({ cls: 'ai-provider-action-row' });
    row.style.display = 'flex';
    row.style.gap = '8px';
    row.style.marginTop = '10px';
    row.style.alignItems = 'stretch';
    row.style.position = 'relative';
    const imgBtn = row.createEl('button', { cls: 'ai-img-cap-btn' });
    imgBtn.title = 'Configure image capabilities for this provider';
    const imgBtnInner = () => {
      imgBtn.empty();
      const caps = (this.plugin.settings.imageCapabilities?.[providerKey]) || {};
      const anyOn = caps.analysis || caps.creation;
      const iconSpan = imgBtn.createSpan();
      setIcon(iconSpan, 'image');
      iconSpan.style.display = 'inline-flex';
      iconSpan.style.verticalAlign = 'middle';
      iconSpan.style.marginRight = '5px';
      const label = imgBtn.createSpan();
      label.textContent = 'IMG';
      label.style.verticalAlign = 'middle';
      label.style.fontSize = '13px';
      label.style.fontWeight = '600';
      const chevron = imgBtn.createSpan();
      chevron.textContent = ' \u25be';
      chevron.style.fontSize = '10px';
      chevron.style.verticalAlign = 'middle';
      chevron.style.opacity = '0.7';
      imgBtn.style.borderColor = anyOn ? 'var(--interactive-accent)' : 'var(--background-modifier-border)';
      imgBtn.style.color = anyOn ? 'var(--interactive-accent)' : 'var(--text-muted)';
    };
    imgBtn.style.padding = '10px 12px';
    imgBtn.style.borderRadius = '8px';
    imgBtn.style.border = '1px solid var(--background-modifier-border)';
    imgBtn.style.background = 'var(--background-secondary)';
    imgBtn.style.cursor = 'pointer';
    imgBtn.style.display = 'flex';
    imgBtn.style.alignItems = 'center';
    imgBtn.style.flexShrink = '0';
    imgBtnInner();
    let dropdown = null;
    const closeDropdown = () => { if (dropdown) { dropdown.remove(); dropdown = null; } };
    imgBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (dropdown) { closeDropdown(); return; }
      dropdown = document.body.createDiv({ cls: 'ai-img-cap-dropdown' });
      dropdown.style.position = 'fixed';
      dropdown.style.zIndex = '9999';
      dropdown.style.background = 'var(--background-primary)';
      dropdown.style.border = '1px solid var(--background-modifier-border)';
      dropdown.style.borderRadius = '10px';
      dropdown.style.boxShadow = '0 8px 24px rgba(0,0,0,0.18)';
      dropdown.style.padding = '14px 16px';
      dropdown.style.minWidth = '210px';
      dropdown.style.display = 'flex';
      dropdown.style.flexDirection = 'column';
      dropdown.style.gap = '10px';
      const rect = imgBtn.getBoundingClientRect();
      dropdown.style.top = `${rect.bottom + 6}px`;
      dropdown.style.left = `${rect.left}px`;
      const header = dropdown.createDiv();
      header.style.fontSize = '11px';
      header.style.fontWeight = '700';
      header.style.color = 'var(--text-muted)';
      header.style.letterSpacing = '0.06em';
      header.style.textTransform = 'uppercase';
      header.style.marginBottom = '2px';
      header.textContent = 'Image Capabilities';
      const makeCap = (label, capKey, icon) => {
        const item = dropdown.createDiv({ cls: 'ai-img-cap-item' });
        item.style.display = 'flex';
        item.style.alignItems = 'center';
        item.style.gap = '10px';
        item.style.padding = '8px 10px';
        item.style.borderRadius = '7px';
        item.style.cursor = 'pointer';
        item.style.border = '1px solid var(--background-modifier-border)';
        item.style.background = 'var(--background-secondary)';
        item.style.transition = 'background 0.15s';
        const cb = item.createEl('input', { type: 'checkbox' });
        cb.style.width = '16px';
        cb.style.height = '16px';
        cb.style.accentColor = 'var(--interactive-accent)';
        cb.style.cursor = 'pointer';
        cb.style.flexShrink = '0';
        if (!this.plugin.settings.imageCapabilities) this.plugin.settings.imageCapabilities = {};
        if (!this.plugin.settings.imageCapabilities[providerKey])
          this.plugin.settings.imageCapabilities[providerKey] = { analysis: false, creation: false };
        cb.checked = !!this.plugin.settings.imageCapabilities[providerKey][capKey];
        const iconSpan = item.createSpan();
        iconSpan.style.display = 'inline-flex';
        iconSpan.style.flexShrink = '0';
        setIcon(iconSpan, icon);
        const txt = item.createSpan();
        txt.textContent = label;
        txt.style.fontSize = '13px';
        txt.style.fontWeight = '500';
        txt.style.color = 'var(--text-normal)';
        txt.style.flex = '1';
        const updateItem = () => {
          const on = cb.checked;
          item.style.background = on ? 'rgba(var(--interactive-accent-rgb),0.12)' : 'var(--background-secondary)';
          item.style.borderColor = on ? 'var(--interactive-accent)' : 'var(--background-modifier-border)';
          txt.style.color = on ? 'var(--interactive-accent)' : 'var(--text-normal)';
        };
        updateItem();
        cb.addEventListener('change', () => {
          if (!this.plugin.settings.imageCapabilities[providerKey])
            this.plugin.settings.imageCapabilities[providerKey] = { analysis: false, creation: false };
          this.plugin.settings.imageCapabilities[providerKey][capKey] = cb.checked;
          this.plugin.saveSettings();
          updateItem();
          imgBtnInner();
        });
        item.addEventListener('click', (ev) => {
          if (ev.target !== cb) { cb.checked = !cb.checked; cb.dispatchEvent(new Event('change')); }
        });
      };
      makeCap('Image Analysis', 'analysis', 'scan-eye');
      makeCap('Image Creation',  'creation',  'wand');
      setTimeout(() => { document.addEventListener('click', closeDropdown, { once: true }); }, 0);
    });
    const btn = row.createEl('button', { cls: 'ai-test-btn' });
    btn.style.flex = '1';
    btn.style.padding = '12px';
    btn.style.borderRadius = '8px';
    btn.style.border = '1px solid var(--background-modifier-border)';
    btn.style.background = 'var(--background-secondary)';
    btn.style.color = 'var(--text-normal)';
    btn.style.cursor = 'pointer';
    btn.style.fontSize = '14px';
    const renderBtnContent = () => {
      btn.empty();
      const icon = btn.createSpan();
      setIcon(icon, 'refresh-cw');
      icon.style.marginRight = '6px';
      icon.style.display = 'inline-flex';
      icon.style.verticalAlign = 'middle';
      btn.createSpan().textContent = 'Test Connection';
    };
    renderBtnContent();
    btn.addEventListener('click', async () => {
      btn.disabled = true;
      btn.textContent = 'Testing...';
      try {
        const provider = providerFactory();
        const health = await provider.checkHealth();
        new Notice(health.message);
      } catch (e) {
        new Notice('\u2a09 Error: ' + e.message);
      } finally {
        btn.disabled = false;
        renderBtnContent();
      }
    });
    return btn;
  }

  createInputField(container, label, key, value, type = 'text', placeholder = '') {
    const row = container.createDiv({ cls: 'ai-settings-row' });
    row.style.marginBottom = '16px';
    row.createEl('label', { text: label }).style.display = 'block';
    const input = row.createEl('input', { type, value, placeholder });
    input.style.width = '100%';
    input.style.padding = '10px 14px';
    input.style.borderRadius = '8px';
    input.style.border = '1px solid var(--background-modifier-border)';
    input.style.backgroundColor = 'var(--background-primary)';
    input.style.color = 'var(--text-normal)';
    input.style.fontSize = '14px';
    input.style.boxSizing = 'border-box';
    input.addEventListener('change', (e) => {
      this.plugin.settings[key] = type === 'number' ? parseInt(e.target.value) : e.target.value;
    });
    return input;
  }

  createShortcutField(container, label, visKey, value) {
    const row = container.createDiv({ cls: 'ai-settings-row' });
    row.style.marginBottom = '14px';
    row.style.display = 'flex';
    row.style.flexDirection = 'column';
    row.style.gap = '6px';
    const topLine = row.createDiv();
    topLine.style.display = 'flex';
    topLine.style.justifyContent = 'space-between';
    topLine.style.alignItems = 'center';
    topLine.createEl('label', { text: label }).style.fontWeight = '600';
    const isVisible = (this.plugin.settings.shortcutsVisible ?? {})[visKey] !== false;
    const pill = topLine.createDiv({ cls: 'ai-shortcut-vis-pill' });
    pill.style.display = 'flex';
    pill.style.alignItems = 'center';
    pill.style.gap = '6px';
    pill.style.cursor = 'pointer';
    pill.style.userSelect = 'none';
    pill.title = 'Show or hide this item in the \u2318 command menu';
    const pillLabel = pill.createSpan();
    pillLabel.style.fontSize = '12px';
    pillLabel.style.color = 'var(--text-muted)';
    const track = pill.createDiv({ cls: 'ai-toggle-track' });
    track.style.width = '34px';
    track.style.height = '18px';
    track.style.borderRadius = '9px';
    track.style.position = 'relative';
    track.style.transition = 'background 0.2s';
    track.style.flexShrink = '0';
    const thumb = track.createDiv({ cls: 'ai-toggle-thumb' });
    thumb.style.position = 'absolute';
    thumb.style.top = '2px';
    thumb.style.width = '14px';
    thumb.style.height = '14px';
    thumb.style.borderRadius = '50%';
    thumb.style.background = '#fff';
    thumb.style.transition = 'left 0.2s';
    thumb.style.boxShadow = '0 1px 3px rgba(0,0,0,0.3)';
    const applyToggleState = (on) => {
      track.style.background = on ? 'var(--interactive-accent)' : 'var(--background-modifier-border)';
      thumb.style.left = on ? '18px' : '2px';
      pillLabel.textContent = on ? 'Shown' : 'Hidden';
      pillLabel.style.color = on ? 'var(--interactive-accent)' : 'var(--text-muted)';
    };
    applyToggleState(isVisible);
    pill.addEventListener('click', async () => {
      if (!this.plugin.settings.shortcutsVisible) this.plugin.settings.shortcutsVisible = {};
      const current = this.plugin.settings.shortcutsVisible[visKey] !== false;
      this.plugin.settings.shortcutsVisible[visKey] = !current;
      applyToggleState(!current);
      if (typeof this.plugin.saveSettings === 'function') await this.plugin.saveSettings();
    });
    if (visKey !== 'openChatPage') {
      const input = row.createEl('input', { type: 'text', value, placeholder: 'Example: Ctrl+Shift+N' });
      input.style.width = '100%';
      input.style.padding = '10px 14px';
      input.style.borderRadius = '8px';
      input.style.border = '1px solid var(--background-modifier-border)';
      input.style.backgroundColor = 'var(--background-primary)';
      input.style.color = 'var(--text-normal)';
      input.style.fontSize = '14px';
      input.style.boxSizing = 'border-box';
      input.addEventListener('change', async (e) => {
        this.plugin.settings.shortcuts[visKey] = e.target.value;
        if (typeof this.plugin.saveSettings === 'function') await this.plugin.saveSettings();
      });
    } else {
      const hint = row.createDiv({ text: 'Ctrl+Shift+O  (hardcoded)' });
      hint.style.fontSize = '12px';
      hint.style.color = 'var(--text-muted)';
      hint.style.padding = '4px 0';
    }
  }

  createSliderField(container, label, key, value, min, max, step) {
    const row = container.createDiv({ cls: 'ai-settings-row' });
    row.style.marginBottom = '16px';
    const labelRow = row.createDiv({ style: 'display: flex; justify-content: space-between;' });
    labelRow.createEl('label', { text: label });
    const valueSpan = labelRow.createEl('span', { text: value, cls: 'ai-slider-value' });
    valueSpan.style.fontWeight = '600';
    valueSpan.style.color = 'var(--interactive-accent)';
    const slider = row.createEl('input', { type: 'range', value, min, max, step });
    slider.style.width = '100%';
    slider.style.height = '6px';
    slider.style.borderRadius = '3px';
    slider.style.background = 'var(--background-modifier-border)';
    slider.addEventListener('input', (e) => {
      const val = parseFloat(e.target.value);
      this.plugin.settings[key] = val;
      valueSpan.textContent = val.toFixed(1);
    });
    return slider;
  }

  createCheckboxField(container, label, key, checked) {
    const row = container.createDiv({ cls: 'ai-settings-row checkbox' });
    row.style.display = 'flex';
    row.style.alignItems = 'center';
    row.style.justifyContent = 'space-between';
    row.style.gap = '10px';
    row.style.marginBottom = '16px';
    row.style.cursor = 'pointer';
    const labelEl = row.createEl('label', { text: label });
    labelEl.style.cursor = 'pointer';
    labelEl.style.flex = '1';
    const checkbox = row.createEl('input', { type: 'checkbox' });
    checkbox.checked = this.plugin.settings[key];
    checkbox.style.width = '18px';
    checkbox.style.height = '18px';
    checkbox.style.accentColor = 'var(--interactive-accent)';
    checkbox.style.cursor = 'pointer';
    row.addEventListener('click', () => {
      checkbox.checked = !checkbox.checked;
      this.plugin.settings[key] = checkbox.checked;
      this.plugin.saveSettings();
    });
    checkbox.addEventListener('click', (e) => {
      e.stopPropagation();
      this.plugin.settings[key] = checkbox.checked;
      this.plugin.saveSettings();
    });
    return checkbox;
  }

  createInputPositionSelector(container) {
    const row = container.createDiv({ cls: 'ai-settings-row' });
    row.style.marginBottom = '16px';
    row.style.padding = '12px';
    row.style.background = 'var(--background-primary)';
    row.style.borderRadius = '8px';
    row.style.border = '1px solid var(--background-modifier-border)';
    const label = row.createEl('label', { text: 'Input Field Position:' });
    label.style.display = 'block';
    label.style.marginBottom = '8px';
    label.style.fontWeight = '600';
    const optionsRow = row.createDiv({ style: 'display: flex; gap: 20px;' });
    const bottomOption = optionsRow.createDiv({ style: 'display: flex; align-items: center; gap: 6px;' });
    const bottomRadio = bottomOption.createEl('input', { type: 'radio', name: 'inputPosition', value: 'bottom', attr: { id: 'input-bottom' } });
    bottomRadio.checked = this.plugin.settings.inputPosition === 'bottom';
    bottomRadio.addEventListener('change', (e) => { if (e.target.checked) this.plugin.settings.inputPosition = 'bottom'; });
    const bottomLabel = bottomOption.createEl('label', { text: 'Bottom', attr: { for: 'input-bottom' } });
    bottomLabel.style.cursor = 'pointer';
    const topOption = optionsRow.createDiv({ style: 'display: flex; align-items: center; gap: 6px;' });
    const topRadio = topOption.createEl('input', { type: 'radio', name: 'inputPosition', value: 'top', attr: { id: 'input-top' } });
    topRadio.checked = this.plugin.settings.inputPosition === 'top';
    topRadio.addEventListener('change', (e) => { if (e.target.checked) this.plugin.settings.inputPosition = 'top'; });
    const topLabel = topOption.createEl('label', { text: 'Top', attr: { for: 'input-top' } });
    topLabel.style.cursor = 'pointer';
    const previewDiv = row.createDiv({
      style: 'margin-top: 12px; padding: 8px; background: var(--background-secondary); border-radius: 6px; font-size: 12px; color: var(--text-muted); display: flex; align-items: center; gap: 8px;'
    });
    previewDiv.textContent = 'Preview: Input field will appear at the ' +
      (this.plugin.settings.inputPosition === 'bottom' ? 'bottom' : 'top') + ' of the sidebar';
  }
}

// ==================== MAIN PLUGIN ====================

module.exports = class AIPlugin extends Plugin {
  /**
   * Shared helper: ensures the target folder exists, picks a unique filename,
   * and writes the session's markdown to the vault.
   * Used by saveCurrentConversation (ChatView), saveConversationToFile (SettingsModal),
   * and saveCurrentConversationFromAnywhere (AIPlugin).
   * @param {Object} session - Session object to export
   * @returns {TFile} The created Obsidian file
   */
  async saveSessionToVault(session) {
    const content = this._sessionManager.exportToMarkdown(session);
    const folderPath = this.settings.conversationsFolder || 'AI Conversations';
    const baseName = session.name.replace(/[\\/:*?"<>|]/g, '_');

    if (!(await this.app.vault.adapter.exists(folderPath))) {
      await this.app.vault.createFolder(folderPath);
    }

    const fullPath = await this.getUniqueFilePath(folderPath, baseName, 'md');
    return await this.app.vault.create(fullPath, content);
  }

  async getUniqueFilePath(folderPath, baseName, extension = 'md') {
    let counter = 1;
    let fileName = `${baseName}.${extension}`;
    let fullPath = folderPath ? `${folderPath}/${fileName}` : fileName;
    
    if (await this.app.vault.adapter.exists(fullPath)) {
        new Notice(`File already exists, copy from conversation '${fileName}'`);
        
        while (await this.app.vault.adapter.exists(fullPath)) {
            fileName = `${baseName} (${counter}).${extension}`;
            fullPath = folderPath ? `${folderPath}/${fileName}` : fileName;
            counter++;
        }
    }
    
    return fullPath;
  }

  /**
   * Generate a conversation name based on the first message using AI
   * @param {string} firstMessage - The first user message in the conversation
   * @returns {Promise<string|null>} - Generated name or null if failed
   */
  /**
   * Generate a conversation name for the first user message using AI.
   *
   * Provider routing:
   *   settings.namingProvider === 'default'  → use the currently active provider
   *   settings.namingProvider === 'openai'   → always use OpenAI
   *   ... etc.
   *
   * Model routing:
   *   settings.namingModel is non-empty → inject into payload so buildBody picks it up
   *   settings.namingModel is empty     → each provider falls back to its own settings model
   *
   * @param {string} firstMessage
   * @returns {Promise<string|null>} cleaned title, or null on failure / disabled
   */
  async generateConversationName(firstMessage) {
    if (!firstMessage?.trim()) return null;
    if (!this.settings.autoNameConversations) return null;

    // Truncate to avoid excessive token usage
    const messagePreview = firstMessage.length > 500
      ? firstMessage.substring(0, 500) + '...'
      : firstMessage;

    // Build prompt: use the user's custom instructions if provided,
    // but always inject the message ourselves — never rely on the user
    // having written a placeholder correctly in their template.
    const PLACEHOLDER = '{{message}}';
    const rawTemplate = (this.settings.namingPromptTemplate
      || DEFAULT_SETTINGS.namingPromptTemplate).trim();

    let prompt;
    if (rawTemplate.includes(PLACEHOLDER)) {
      // Template has the placeholder — replace it normally
      prompt = rawTemplate.replace(PLACEHOLDER, messagePreview);
    } else {
      // No placeholder found: strip any accidental leftover variable-style
      // tokens the user might have typed (${messagePreview}, {{messagePreview}}, etc.)
      // then append the message ourselves so the AI always receives it.
      const cleanedTemplate = rawTemplate
        .replace(/\$\{[^}]*\}/g, '')          // remove ${...} JS template tokens
        .replace(/\{\{[^}]*\}\}/g, '')         // remove any other {{...}} tokens
        .trim();
      prompt = `${cleanedTemplate}\n\nMessage: "${messagePreview}"`;
    }

    const payload = {
      messages:   [{ role: 'user', content: prompt }],
      temperature: this.settings.namingTemperature ?? 0.3,
      max_tokens:  this.settings.namingMaxTokens   ?? 30,
      stream: false
    };

    // Inject the custom model if the user specified one
    const namingModel = (this.settings.namingModel || '').trim();
    if (namingModel) payload.model = namingModel;

    const opts = { timeoutMs: this.settings.namingTimeoutMs ?? 10000 };

    try {
      const providerKey = (this.settings.namingProvider || 'default').trim();
      const result = providerKey === 'default'
        ? await this.apiManager.sendMessage(payload, opts)            // active provider
        : await this.apiManager.sendWithProvider(providerKey, payload, opts); // specific

      if (result?.final) {
        let title = result.final.trim()
          .replace(/^["'`]|["'`]$/g, '')   // strip surrounding quotes
          .replace(/[.!?]$/, '')               // strip trailing punctuation
          .replace(/\s+/g, ' ')               // collapse whitespace
          .trim();

        if (title.length > 50) title = title.substring(0, 50) + '...';
        if (title.length > 0) return title;
      }
    } catch (error) {
      console.log('Error generating conversation name:', error);
    }

    return null;
  }

  async onload() {
  this.loadCSS();
  await this.loadSettings();
  
  // Load sessions: prefer conversations.json; fall back to legacy data.json on first run
  let convEnvelope = await this.loadConversations();
  if (!convEnvelope) {
    // First run after the update — migrate from old data.json format
    const legacyData = await this.loadData();
    if (legacyData?.sessions?.length) {
      convEnvelope = {
        sessions: legacyData.sessions,
        activeId: null,
        codeBlockCache: legacyData.codeBlockCache || {}
      };
      // Will be persisted to conversations.json on the next saveState() call
    }
  }

  // Restore code-block cache into settings (initializeCache reads from here)
  if (convEnvelope?.codeBlockCache) {
    this.settings.codeBlockCache = convEnvelope.codeBlockCache;
  }

  const savedSessions = convEnvelope?.sessions;
  const savedActiveId  = convEnvelope?.activeId || null;

  this._sessionManager = (savedSessions && savedSessions.length)
    ? new SessionManager(savedSessions, savedActiveId)
    : new SessionManager();
  if (!this._sessionManager.sessions.length) this._sessionManager.create('Default Conversation', '');

  this.apiManager = new APIManager(this);
  this.vaultFileManager = new VaultFileManager(this);
  this.inNoteAI = new InNoteAIInteractions(this);
  this.networkManager = new NetworkManager(this);

  // Register the AI code block processor
  this.codeBlockProcessor = new AICodeBlockProcessor(this);
  this.registerMarkdownCodeBlockProcessor('ai', (source, el, ctx) => {
    const renderer = new AiChatBlockRenderer(el, this, source, ctx);
        ctx.addChild(renderer);
  });

  this.registerView(VIEW_TYPE, (leaf) => new ChatView(leaf, this));

  // Register the dedicated full-tab chat page view.
  // Uses a distinct VIEW_TYPE so it can coexist with the sidebar view.
  this.registerView(VIEW_TYPE_CHAT_PAGE, (leaf) => new ChatPageView(leaf, this));

  // Whenever a chat view (sidebar or main-page tab) becomes the active leaf,
  // resync its DOM from the shared session state. Views that stay open in
  // the background can otherwise go stale relative to whichever view last
  // sent/received a message or changed a setting — this is what caused
  // messages, attachments, and settings to look "out of sync" between the
  // sidebar and the main page.
  this.registerEvent(
    this.app.workspace.on('active-leaf-change', (leaf) => {
      if (leaf && leaf.view instanceof ChatView) {
        leaf.view._renderMessages();
        leaf.view.updateTokenCounterVisibility();
        leaf.view.updateModeIndicator?.();
        leaf.view._updateTokenCounter?.();
      }
    })
  );

  // Ribbon shortcuts
  this.addRibbonIcon('brain', 'AI Assistant', () => {
    this.openSidebar();
  });

  this.addRibbonIcon('message-square', 'Open AI Chat Page', () => {
    this.openChatPage();
  });

  // Commands 
  this.addCommand({
    id: 'ai-open-sidebar',
    name: 'Open AI Assistant Sidebar',
    callback: async () => this.openSidebar()
  });

  this.addCommand({
    id: 'ai-open-chat-page',
    name: 'Open AI Chat Page (dedicated tab)',
    callback: async () => this.openChatPage()
  });
  
  this.addCommand({
    id: 'ai-reply-in-note',
    name: 'Stream AI response in current note',
    editorCallback: (editor) => this.replyInNote(editor)
  });

  this.addCommand({
    id: 'ai-new-conversation',
    name: 'New Conversation',
    hotkeys: [{ modifiers: ["Ctrl", "Shift"], key: "N" }],
    callback: () => {
      const activeView = this.app.workspace.getActiveViewOfType(ChatView);
      if (activeView) {
        activeView.createNewConversation();
      } else {
        new PromptModal(this.app, {
          title: 'New Conversation',
          placeholder: 'Leave empty to auto-name after first message'
        }, (name) => {
          if (name === null) return;
          if (name.trim()) {
            this._sessionManager.create(name.trim());
            this.saveState();
            new Notice(`✓ Created conversation: ${name.trim()}`);
          } else {
            this._sessionManager.create('New Conversation');
            this.saveState();
            if (this.settings.autoNameConversations) {
              new Notice('Conversation will be auto-named after first message');
            } else {
              new Notice('✓ Created new conversation');
            }
          }
        }).open();
      }
    }
  });

  this.addCommand({
    id: 'ai-save-conversation',
    name: 'Save Current Conversation',
    hotkeys: [{ modifiers: ["Ctrl", "Shift"], key: "S" }],
    callback: () => {
      const activeView = this.app.workspace.getActiveViewOfType(ChatView);
      if (activeView) {
        activeView.saveCurrentConversation();
      } else {
        this.saveCurrentConversationFromAnywhere();
      }
    }
  });

  // Add command to manually rename current conversation
  this.addCommand({
    id: 'ai-rename-conversation',
    name: 'Rename Current Conversation',
    hotkeys: [{ modifiers: ["Ctrl", "Shift"], key: "R" }],
    callback: () => {
      const session = this._sessionManager.getActive();
      if (!session) {
        new Notice('No active conversation to rename');
        return;
      }
      new PromptModal(this.app, {
        title: 'Rename Conversation',
        placeholder: 'Conversation name',
        initial: session.name
      }, (newName) => {
        if (newName && newName.trim()) {
          session.name = newName.trim();
          this.saveState();
          new Notice(`✓ Conversation renamed to: ${session.name}`);
          this.refreshChatViews();
        }
      }).open();
    }
  });

  // Add command to create a new AI code block
  this.addCommand({
    id: 'ai-insert-codeblock',
    name: 'Insert AI Code Block',
    editorCallback: (editor) => {
      const template = '```ai\nEnvironment: Full\nSystem Prompt: You are a helpful assistant\nModel: \nRepeating: 1\nMoving: Arrow\nMemory: Current\nCaching: Code Block\nDisplay: auto\n```';
      editor.replaceSelection(template);
    }
  });

  this.addSettingTab(new AIPluginSettingTab(this.app, this));

  if (this.settings.autoCheckHealth) {
    setTimeout(() => this.checkHealthAndNotify(), 3000);
  }
  }

  /**
   * Refresh all open chat views (both sidebar and dedicated page tabs).
   * ChatPageView extends ChatView, so instanceof ChatView catches both.
   *
   * @param {ChatView|null} excludeView - Optional view instance to skip
   *   (typically the view that just performed the action and whose DOM is
   *   already up to date), so we don't do redundant re-render work on it.
   */
  /** Stores the most recent diff review so it can be reopened later if the modal was closed by mistake, and shows the reopen button in every open chat view. */
  setLastDiffReview(fileDiffs, onApply) {
    this.lastDiffReview = { fileDiffs, onApply };
    const allChatLeaves = [
      ...this.app.workspace.getLeavesOfType(VIEW_TYPE),
      ...this.app.workspace.getLeavesOfType(VIEW_TYPE_CHAT_PAGE)
    ];
    allChatLeaves.forEach(leaf => {
      if (leaf.view instanceof ChatView && leaf.view.diffReviewBtn) {
        leaf.view.diffReviewBtn.style.display = 'flex';
      }
    });
  }

  refreshChatViews(excludeView = null) {
    const allChatLeaves = [
      ...this.app.workspace.getLeavesOfType(VIEW_TYPE),
      ...this.app.workspace.getLeavesOfType(VIEW_TYPE_CHAT_PAGE)
    ];
    allChatLeaves.forEach(leaf => {
      if (leaf.view instanceof ChatView && leaf.view !== excludeView) {
        leaf.view._renderMessages();
        leaf.view.updateTokenCounterVisibility();
        leaf.view.updateModeIndicator?.();
        leaf.view._updateTokenCounter?.();
      }
    });
  }

  loadCSS() {
    const styleEl = document.createElement('style');
    styleEl.id = 'ai-plugin-css';
    styleEl.textContent = `
      /* --- Modal Styling --- */
      .ai-custom-modal .modal-content { margin-top: 10px; }
      .ai-custom-modal input[type="text"] { width: 100%; margin-bottom: 15px; }
      .ai-modal-btn-container { display: flex; justify-content: flex-end; gap: 10px; margin-top: 20px; }
      
      /* The specific button style you requested */
      .ai-modal-btn-container button.mod-cta {
        background-color: var(--interactive-accent) !important;
        color: var(--text-on-accent) !important;
        border-radius: 4px !important;
        border: none;
        padding: 6px 16px;
      }

      /* --- Global modal polish: 4 px radius + vault secondary background ---
           Targets every Obsidian modal: custom Plugin Modals, and the
           browser-native prompt() / confirm() dialogs Obsidian wraps.       */
      .modal-container .modal,
      .prompt-dialog,
      .dialog {
        border-radius: 4px !important;
        background-color: var(--background-secondary) !important;
      }

      /* --- Sidebar Layout Fixes --- */
      .ai-chat { 
        padding: 10px 8px !important; /* Reduced horizontal padding */
      }
      
      .ai-msg-container { 
        max-width: 98% !important; /* Use almost full width */
        width: 98%;
        margin-bottom: 12px !important;
      }
      
      .ai-msg {
        padding: 10px 12px !important; /* Compact but readable padding */
        width: 100%;
        box-shadow: 0 1px 3px rgba(0,0,0,0.1);
        -webkit-user-select: text !important;
        user-select: text !important;
        -webkit-touch-callout: default !important;
      }

      .ai-msg * {
        -webkit-user-select: text !important;
        user-select: text !important;
      }

      /* User message bubbles are intentionally NOT selectable via normal
         click-drag — long-press/right-click opens the actions menu instead,
         which offers "Select Text" (a popup with a selectable copy of the
         text) alongside Edit/Copy. This must come after the ".ai-msg *" rule
         above so it wins the cascade despite matching !important specificity. */
      .ai-msg.user,
      .ai-msg.user * {
        -webkit-user-select: none !important;
        user-select: none !important;
        -webkit-touch-callout: none !important;
      }

      .ai-msg.assistant {
        align-self: stretch !important; /* Make AI responses fill the width */
      }

      /* Obsidian adds its own "Copy" button to fenced code blocks rendered
         via MarkdownRenderer. Inside AI responses it's shrunk down and
         re-anchored so it sits fully inside the code block's corner —
         previously its height stretched with oversized top/bottom padding,
         which made it stick out half above / half below the block. */
      .ai-msg .copy-code-button,
      .ai-simple-response .copy-code-button,
      .ai-separate-response .copy-code-button,
      .ai-response-content .copy-code-button {
        position: absolute !important;
        top: 6px !important;
        right: 6px !important;
        bottom: auto !important;
        left: auto !important;
        height: auto !important;
        min-height: 0 !important;
        max-height: none !important;
        font-size: 9px !important;
        line-height: 1.2 !important;
        padding: 2px 6px !important;
        margin: 0 !important;
        border-radius: 4px !important;
        box-sizing: border-box !important;
      }

      /* Give fenced code blocks inside AI responses a visible border so
         they read as distinct, self-contained blocks rather than blending
         into the surrounding bubble. Applied everywhere AI markdown is
         rendered: the main chat and the embedded ai-block widget. */
      .ai-msg pre,
      .ai-simple-response pre,
      .ai-separate-response pre,
      .ai-response-content pre {
        padding: 10px 10px !important;
        position: relative; /* keeps the copy button correctly anchored */
      }

      /* --- Animation & Refinement --- */
      .ai-msg-container { animation: ai-fade-in 0.2s ease; }
      @keyframes ai-fade-in { from { opacity: 0; } to { opacity: 1; } }
      
      .ai-naming-indicator { display: inline-flex; align-items: center; gap: 4px; font-size: 11px; color: var(--text-muted); }

      /* Override Obsidian's global button padding so the icon stays centred */
      button.floating-btn,
      button.ai-send-btn,
      button.ai-attach-btn {
        padding: 0 !important;
        padding-top: 0 !important;
        padding-bottom: 0 !important;
        padding-left: 0 !important;
        padding-right: 0 !important;
        margin: 0 !important;
        line-height: 1 !important;
        box-sizing: border-box !important;
      }
    `;
    document.head.appendChild(styleEl);
  }

  async checkHealthAndNotify() {
    const health = await this.apiManager.checkHealth();
    if (!health.ok) {
      new Notice(`${health.message}`);
    }
  }

  async saveCurrentConversationFromAnywhere() {
    const session = this._sessionManager.getActive();
    if (!session) {
      new Notice('No active conversation to save');
      return;
    }

    try {
      const file = await this.saveSessionToVault(session);
      new Notice(`✓ Conversation saved to: ${file.path}`);
    } catch (error) {
      console.error('Error saving conversation:', error);
      new Notice(`⨉ Error saving conversation: ${error.message}`);
    }
  }

  async replyInNote(editor) {
    const selection = editor.getSelection().trim();
    const prompt = selection.length ? selection : editor.getValue();
    
    const s = this._sessionManager.getActive();
    if (s) {
      this._sessionManager.addMessage('user', prompt);
    }
    
    editor.replaceSelection("\n\n--- 🤖 AI Response ---\n\n");
    
    try {
      await this.apiManager.sendMessage({
        messages: s ? this._sessionManager.getMessagesForRequest() : [{ role: 'user', content: prompt }],
        temperature: this.settings.temperature,
        max_tokens: this.settings.max_tokens,
        stream: true
      }, {
        onChunk: (chunk) => {
          editor.replaceSelection(chunk);
        },
        timeoutMs: this.settings.timeoutMs
      });
      
      editor.replaceSelection("\n\n---\n\n");
      new Notice('✓ Response completed');
    } catch (e) {
      editor.replaceSelection(`\n\n⨉ Error: ${e.message}\n\n`);
      new Notice('AI Error: ' + e.message);
    }
  }

  async openSidebar() {
    let leaf = this.app.workspace.getRightLeaf(false);
    if (!leaf) leaf = this.app.workspace.getRightLeaf(true);
    await leaf.setViewState({ type: VIEW_TYPE, active: true });
    this.app.workspace.revealLeaf(leaf);
  }

  /**
   * Open the dedicated AI Chat page in a main-area tab.
   *
   * If a tab with VIEW_TYPE_CHAT_PAGE is already open, reveals it instead
   * of creating a duplicate — mirrors Obsidian's own convention for unique
   * views (e.g. the Graph view).
   */
  async openChatPage() {
    const existing = this.app.workspace.getLeavesOfType(VIEW_TYPE_CHAT_PAGE);
    if (existing.length > 0) {
      // Bring the already-open tab into focus
      this.app.workspace.revealLeaf(existing[0]);
      return;
    }

    // No existing tab — open a fresh one in the main content area
    const leaf = this.app.workspace.getLeaf('tab');
    await leaf.setViewState({ type: VIEW_TYPE_CHAT_PAGE, active: true });
    this.app.workspace.revealLeaf(leaf);
  }

  // ==================== CONVERSATION STORAGE ====================

  /** Absolute path to the dedicated conversations file inside the plugin directory. */
  get conversationsFilePath() {
    return `${this.manifest.dir}/conversations.json`;
  }

  /**
   * Persist sessions, the active session ID, and code-block cache to conversations.json.
   * Keeping all conversation-related state in one place out of data.json (settings-only).
   */
  async saveConversations() {
    const nonTemporary = this._sessionManager.sessions.filter(s => !s.isTemporary);
    const envelope = {
      sessions: nonTemporary,
      activeId: this._sessionManager.activeId,
      codeBlockCache: this.settings.codeBlockCache || {}
    };
    try {
      await this.app.vault.adapter.write(
        this.conversationsFilePath,
        JSON.stringify(envelope, null, 2)
      );
    } catch (e) {
      console.error('Error saving conversations to conversations.json:', e);
    }
  }

  /**
   * Load the conversations envelope from conversations.json.
   * Handles three cases:
   *   null              — file missing (first run, caller will migrate from data.json)
   *   Array             — legacy format written by v1 of this plugin (sessions only)
   *   Object (envelope) — current format { sessions, activeId, codeBlockCache }
   */
  async loadConversations() {
    try {
      const raw = await this.app.vault.adapter.read(this.conversationsFilePath);
      const parsed = JSON.parse(raw);

      // Normalise legacy array format to the current envelope shape
      if (Array.isArray(parsed)) {
        return { sessions: parsed, activeId: null, codeBlockCache: {} };
      }
      return {
        sessions: parsed.sessions || [],
        activeId: parsed.activeId || null,
        codeBlockCache: parsed.codeBlockCache || {}
      };
    } catch {
      return null; // File missing or unparseable — caller handles migration
    }
  }

  /**
   * Save state: persists settings to data.json and sessions to conversations.json.
   * Only non-temporary sessions are saved.
   */
  async saveState() {
    // codeBlockCache belongs in conversations.json (saved by saveConversations),
    // not in data.json (the plugin's settings/metadata file).  Strip it here so
    // it never leaks into the frontmatter-equivalent settings storage.
    const { codeBlockCache, ...settingsToSave } = this.settings;
    await this.saveData(settingsToSave);
    await this.saveConversations();
  }

  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData() || {});

    // Migrate the old single-folder setting (fileOpsFolder) to the new
    // multi-path fileOpsPaths array, the first time this loads post-update.
    if (this.settings.fileOpsFolder && (!this.settings.fileOpsPaths || this.settings.fileOpsPaths.length === 0)) {
      this.settings.fileOpsPaths = [this.settings.fileOpsFolder];
    }
    delete this.settings.fileOpsFolder;
  }

  // ==================== FILE OPERATIONS (soul.md + system prompt) ====================

  /** Vault-relative path used when soulMdSource === 'file' and the user hasn't set one. */
  get defaultSoulMdPath() {
    return `${this.settings.conversationsFolder || 'AI Conversations'}/soul.md`;
  }

  /**
   * Resolves soul.md's content, either from the inline settings textarea or
   * from a vault file — creating that file with the default content the
   * first time it's needed so the user has something to edit.
   */
  async getSoulMdContent() {
    if (this.settings.soulMdSource === 'file') {
      const path = this.settings.soulMdFilePath?.trim() || this.defaultSoulMdPath;
      try {
        return await this.app.vault.adapter.read(path);
      } catch {
        try {
          const idx = path.lastIndexOf('/');
          if (idx > 0) {
            const folder = path.slice(0, idx);
            if (!(await this.app.vault.adapter.exists(folder))) {
              await this.app.vault.createFolder(folder);
            }
          }
          await this.app.vault.create(path, DEFAULT_SOUL_MD);
        } catch (e) {
          console.error('Could not seed soul.md:', e);
        }
        return DEFAULT_SOUL_MD;
      }
    }
    return this.settings.soulMdInline?.trim() ? this.settings.soulMdInline : DEFAULT_SOUL_MD;
  }

  /**
   * Builds the extra system message describing the AI's file-operation
   * capabilities and current scope, plus soul.md's contents. Returns null
   * when file operations are disabled, so callers can skip injecting it.
   */
  /**
   * @param {Set<string>} [unlockedPaths] – vault-relative paths that were
   *   attached when the user issued a '✏ Edit instruction' command earlier
   *   in the current conversation.  When non-empty the AI is told it may
   *   also edit those files via natural-language requests.
   */
  async getFileOpsSystemMessage(unlockedPaths = new Set()) {
    if (!this.settings.fileOpsScope || this.settings.fileOpsScope === 'disabled') return null;

    const excludedPaths = (this.settings.fileOpsExcludedPaths || []).filter(Boolean);
    const allowedPaths = (this.settings.fileOpsPaths || []).filter(Boolean);

    const scopeDesc = this.settings.fileOpsScope === 'full'
      ? (excludedPaths.length
          ? `You have access to the entire vault, except for these excluded paths (and anything inside them): ${excludedPaths.join(', ')}.`
          : 'You currently have access to the entire vault.')
      : `You may currently only create, edit, copy, move, list, or read files inside these paths (and anything inside them): ${allowedPaths.join(', ') || '(not configured)'}. Anything outside these paths will be rejected.`;

    // Tell the AI about any session-unlocked files so it knows it can modify
    // them even if they are outside the normally-permitted scope.
    const unlockedList = [...unlockedPaths];
    const unlockedDesc = unlockedList.length
      ? `\nIn addition, the following file${unlockedList.length !== 1 ? 's were' : ' was'} attached by the user earlier in this conversation when they issued an '✏ Edit instruction' command.  You are temporarily permitted to read and edit ${unlockedList.length !== 1 ? 'them' : 'it'} for the remainder of this conversation, even if ${unlockedList.length !== 1 ? 'they fall' : 'it falls'} outside the paths listed above:\n${unlockedList.map(p => `  - ${p}`).join('\n')}`
      : '';

    const soul = await this.getSoulMdContent();

    return [
      '# File operations',
      scopeDesc + unlockedDesc,
      'To perform a file operation, include a block using exactly this syntax anywhere in your reply. It is executed automatically and is never shown to the user as raw text — it is replaced with a short confirmation line, so never explain the syntax itself to the user.',
      '',
      '@@FILE_OP:create path="Folder/Note.md"@@',
      '...full file content...',
      '@@END_FILE_OP@@',
      '',
      'Other operations use the same wrapper:',
      '- edit — path is an existing file, body is its complete new content (replaces the whole file).',
      '- patch — path is an existing file, search is the exact text to find, replace is the text to substitute. Replaces ALL occurrences. Leave the body empty. Use this instead of edit when you only need to change a small section and want to avoid rewriting the whole file. Example: @@FILE_OP:patch path="Notes/todo.md" search="old text" replace="new text"@@@@END_FILE_OP@@',
      '- copy — path is the source, to is the destination; leave the body empty.',
      '- move / rename — path is the source, to is the destination; leave the body empty.',
      '- list — path is a folder (omit path to list every allowed root at once); add recursive="true" to include subfolders; leave the body empty. Example: @@FILE_OP:list path="Folder"@@@@END_FILE_OP@@',
      '- read — path is a file whose content you want to see; leave the body empty. Example: @@FILE_OP:read path="Folder/Note.md"@@@@END_FILE_OP@@',
      '- search — query is one or more keywords, goal describes in your own words what you\'re trying to find (used to judge relevance, not just keyword-match); leave the body empty. Returns the best-matching file(s) with a similarity percentage, already narrowed down for you — read the top match to confirm before acting on it. Example: @@FILE_OP:search query="invoice pdf generator" goal="find the script that generates PDF invoices so I can rename it descriptively"@@@@END_FILE_OP@@',
      'Always close every block with @@END_FILE_OP@@, even when there is no content between the tags.',
      '',
      'IMPORTANT — when you need information you don\'t have yet (e.g. you must see file names or contents before you can rename, edit, or organize them, or you need to find which file matches a description), reply with ONLY list/read/search operations and nothing else. The results will be sent back to you automatically, and you can then continue — issuing more list/read/search ops if you still need more, or the actual create/edit/copy/move/rename ops once you have what you need. Never ask the user to paste file names or contents you can look up yourself. Prefer search over list+read-everything when you\'re looking for a specific file by topic rather than by exact name.',
      '',
      '# soul.md (your file-handling principles)',
      soul
    ].join('\n');
  }
  
  async saveSettings() { 
    await this.saveData(this.settings);
    // Refresh both sidebar leaves and dedicated page tab leaves.
    // ChatPageView extends ChatView, so instanceof ChatView catches both.
    const allChatLeaves = [
      ...this.app.workspace.getLeavesOfType(VIEW_TYPE),
      ...this.app.workspace.getLeavesOfType(VIEW_TYPE_CHAT_PAGE)
    ];
    allChatLeaves.forEach(leaf => {
      if (leaf.view instanceof ChatView) {
        leaf.view.updateTokenCounterVisibility();
        leaf.view.refreshLayout();
        // Keep the provider mode icon/tooltip in sync across every open
        // view — e.g. toggling local/cloud mode from one view (sidebar or
        // main page) previously only updated that view's own button.
        leaf.view.updateModeIndicator?.();
      }
    });
  }

  onunload() {
    // Clean up all active code blocks
    if (this.codeBlockProcessor && this.codeBlockProcessor.activeBlocks) {
        this.codeBlockProcessor.activeBlocks.clear();
    }
    
    // Delete any temporary conversation when unloading the plugin
    if (this._sessionManager) {
        this._sessionManager.deleteTemporary();
    }
    
    // Remove CSS
    const styleEl = document.getElementById('ai-plugin-css');
    if (styleEl) {
        styleEl.remove();
    }
    
    // Detach both the sidebar view and the dedicated page tab view
    this.app.workspace.detachLeavesOfType(VIEW_TYPE);
    this.app.workspace.detachLeavesOfType(VIEW_TYPE_CHAT_PAGE);
    
    // Abort any pending network requests
    if (this.networkManager) {
        this.networkManager.abortAllRequests();
    }
  }
}