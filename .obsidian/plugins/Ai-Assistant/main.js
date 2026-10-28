const { Plugin, ItemView, Modal, FuzzySuggestModal, Notice, MarkdownView, MarkdownRenderer, MarkdownRenderChild, setIcon, PluginSettingTab, requestUrl, parseYaml, getAllTags, Platform } = require('obsidian');

const VIEW_TYPE = 'ai-sidebar';

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
  aiFolder: "",              // vault folder the AI owns (soul.md, memory.md, user.md, Skills, Commands, Agents); empty = not set
  soulInjection: true,       // inject soul.md as layer 1 (only does anything once aiFolder is set)
  skillsEnabled: true,       // Skills/ in the AI folder (inactive until aiFolder is set)
  slashCommandsEnabled: true, // Commands/ in the AI folder, "/" autocomplete (inactive until aiFolder is set)
  mentionsEnabled: true,     // @note, @folder, #tag in the message input
  memoryEnabled: false,      // memory.md / user.md as layer 3, and the update_memory tool (inactive until aiFolder is set)
  chatSearchEnabled: false,  // keyword search over past conversations (FR-2.2)
  // What the search reads: 'sessions' (the chat list), 'saved' (notes in the Conversations Folder) or 'both'
  chatSearchSource: 'sessions',
  contextCompression: false, // summarize the earliest messages near the context limit (FR-2.4)
  contextCompressionThreshold: 80, // % of the model's context window at which that starts
  skillSuggestion: false,    // offer to save a multi-step task as a draft skill (FR-2.3)
  webSearchEnabled: false,   // web search (FR-3.4): built-in tool of the provider, or an external service
  webSearchSource: 'auto',   // 'auto' | 'builtin' | 'external'
  webSearchService: '',      // 'brave' | 'tavily' | 'searxng' (its key lives in the secret storage, never here)
  searxngUrl: '',            // address of your SearXNG server (no key)
  mcpEnabled: false,         // MCP client (FR-1.5)
  mcpServers: [],            // [{ id, name, transport: 'http'|'stdio', url, command, args, enabled }] — tokens live in the secret storage
  subagentsEnabled: true,    // Agents/ in the AI folder and the delegate tool (inactive until aiFolder is set)
  hooksEnabled: false,       // event hooks (FR-1.6); the hooks themselves live in `hooks`
  hooks: [],                 // [{ id, event, kind: 'command'|'skill', name }] — in the settings, never in the vault
  planModeAvailable: true,   // "/plan": the AI writes a plan and waits for approval before changing anything (FR-3.1)
  permissionAllowFolders: [], // folders where a tool or file operation set to Ask runs without asking (FR-3.5)
  conversationBranching: false, // edit/branch a message without losing what followed (FR-3.3)
  editingMessage: 'branch',  // with branching on: 'branch' (keep the old version as a branch) or 'overwrite' (delete what followed)
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
  // Per-provider model overrides for auto-naming.
  // Keyed by provider id ('local'|'openai'|'gemini'|'anthropic'|'custom').
  // 'default' has no entry because it always delegates to the active provider's own model.
  namingModels: { local: '', openai: '', gemini: '', anthropic: '', custom: '' },
  // ---- File operations (create/edit/copy/move files in the vault) ----
  // 'disabled' | 'restricted' | 'full'
  fileOpsScope: 'disabled',
  // Vault-relative folders the AI is confined to when fileOpsScope === 'restricted'.
  // Any of these (and anything inside them) is allowed.
  fileOpsPaths: ['AI Files'],
  // Vault-relative folders excluded from access when fileOpsScope === 'full'.
  // Everything else in the vault is allowed.
  fileOpsExcludedPaths: [],
  // Controls when the full file-operation guidelines (scope + @@FILE_OP@@ syntax + file handling principles)
  // are injected into the context window:
  //   'always'    — prepended to every message (zero extra latency, higher token cost per turn).
  //   'on-demand' — a classifier instruction is appended to the first user message of each
  //                 session. The model then embeds <!-- NEED_FILE_OPS --> or
  //                 <!-- NO_FILE_OPS --> in every reply. Guidelines are injected only when
  //                 NEED_FILE_OPS is detected — saving tokens on conversational turns with
  //                 zero extra network requests (signal is read from the previous reply).
  fileOpsGuidelinesMode: 'on-demand',
  // The user's own file handling principles, edited in Settings (empty = built-in default).
  // Plain settings text only — nothing is read from or written to the vault for it.
  fileHandlingPrinciples: '',
  markdownExportTemplate: '',   // Empty = use built-in default template
  // Image capabilities per provider (set by the user via the IMG button in Settings)
  imageCapabilities: {
    local:     { analysis: false, creation: false },
    openai:    { analysis: false, creation: false },
    gemini:    { analysis: false, creation: false },
    anthropic: { analysis: false, creation: false },
    custom:    { analysis: false, creation: false }
  },
  // Auto-scroll the chat to the bottom while streaming AI responses
  autoScrollOnStream: true,
  // Diff review: treat lines that differ only in whitespace (indentation, trailing
  // spaces, repeated spaces, CRLF/LF) as unchanged so only real edits are highlighted.
  ignoreWhitespaceInDiff: true,
  // Selected reasoning-effort level per provider ('' = don't send). The allowed
  // values are never hard-coded: they come from the model catalog cache.
  reasoningEffort: { openai: '', gemini: '', anthropic: '' },
  // Ask providers for reasoning text (when a reasoning level is selected) and show it in chat
  showReasoning: true,
  // Keep API keys in Obsidian's secure storage instead of data.json (when available)
  useSecureKeyStorage: true,
  // Diff review: fold long unchanged stretches, keeping N lines of context
  collapseUnchangedInDiff: true,
  // Number of lines a user message must exceed before it is auto-collapsed (minimum 1).
  // The feature itself is switched on/off by messageCollapseEnabled (unset = on when the old value was > 0).
  messageCollapseLines: 5,
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

  /**
   * Configurable states for the model-toggle button in the toolbar.
   * Each entry defines one "stop" the button cycles through on click.
   *
   * Fields per state:
   *   label        {string}  – Human-readable name shown in notices/tooltips.
   *   providerKey  {string}  – One of: 'local' | 'openai' | 'gemini' | 'anthropic' | 'custom'
   *   obsidianIcon {string}  – Obsidian/Lucide icon name shown on the button.
   *                            whenever this state is active (empty = use whatever is in Settings).
   *
   * The active state index is stored separately in toggleStateIndex so it
   * survives settings reloads without the array needing a 'current' flag.
   * Up to 5 states are supported.
   */
  toggleStates: [
    { label: 'Local',  providerKey: 'local',  obsidianIcon: 'monitor-speaker' },
    { label: 'Cloud',  providerKey: 'openai', obsidianIcon: 'server' },
  ],
  /** Index into toggleStates that is currently active (0-based). */
  toggleStateIndex: 0,

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

function estimateTokens(text) {
  if (!text) return 0;
  return Math.ceil(text.length / 4);
}

/** How many of the most recent messages are sent to the model with each request. */
const REQUEST_WINDOW_MESSAGES = 10;

/** Simple promise-based delay, used to pace AI requests (see AIFileEditor). */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Returns the ratio (0–1) of strong-directional characters in `text` that
 * belong to an RTL script (Arabic, Hebrew, and related Unicode blocks).
 * Only letters/digits count — punctuation, whitespace, and markdown syntax
 * are ignored so that a mostly-Arabic response with some English punctuation
 * still registers as RTL.
 */
function rtlRatio(text) {
  if (!text) return 0;
  const rtlChar  = /[\u0591-\u07FF\u0860-\u08FF\uFB1D-\uFDFF\uFE70-\uFEFF]/;
  const ltrChar  = /[A-Za-z\u00C0-\u024F\u0370-\u03FF\u0400-\u04FF]/;
  // Strip markdown syntax / punctuation / whitespace so they don't dilute the count
  const stripped = text.replace(/[`*_#>\-\[\]()!\s\d.,:;"']/g, '');
  if (!stripped.length) return 0;
  let rtlCount = 0, total = 0;
  for (const ch of stripped) {
    if (rtlChar.test(ch))      { rtlCount++; total++; }
    else if (ltrChar.test(ch)) { total++; }
  }
  return total === 0 ? 0 : rtlCount / total;
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

/** Minimum fraction of RTL characters required to force right-alignment. */
const RTL_ALIGN_THRESHOLD = 0.50;

/**
 * Sets dir="auto" (+ matching alignment) on an element so RTL scripts
 * (Arabic, Hebrew, etc.) display correctly. Shared by ChatView (the main
 * chat) and the embedded ```ai code-block renderer, so AI output reads
 * correctly in either surface.
 *
 * When ≥80 % of the strong-directional characters in `text` are RTL the
 * function also forces `text-align: right` on the element AND every
 * descendant block element so that rendered Markdown (paragraphs, list
 * items, headings, etc.) all align to the right — matching the reading
 * direction of the language.
 */
function applyAutoTextDirection(el, text) {
  el.setAttribute('dir', 'auto');
  el.style.unicodeBidi = 'plaintext';

  const ratio = rtlRatio(text || el.textContent || '');
  if (ratio >= RTL_ALIGN_THRESHOLD) {
    // Force right-alignment on the container and every block-level child
    // that the Markdown renderer may have injected (p, li, h1–h6, blockquote…).
    el.style.setProperty('text-align', 'right', 'important');
    el.querySelectorAll('p, li, h1, h2, h3, h4, h5, h6, blockquote, td, th, dt, dd')
      .forEach(child => child.style.setProperty('text-align', 'right', 'important'));
  } else {
    el.style.textAlign = 'start';
  }
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
  static computeLineDiff(originalText, modifiedText, options = {}) {
    const origLines = originalText.split('\n');
    const modLines  = modifiedText.split('\n');

    // Compare lines ignoring a trailing "\r" so CRLF/LF differences don't
    // make every line look modified.
    // With options.ignoreWhitespace, lines that differ only in leading/trailing
    // or repeated whitespace are also treated as equal.
    const key = options.ignoreWhitespace
      ? (l => l.trim().replace(/\s+/g, ' '))
      : (l => (l.endsWith('\r') ? l.slice(0, -1) : l));
    const eq  = (a, b) => key(a) === key(b);

    const m = origLines.length;
    const n = modLines.length;

    // 1) Trim common prefix / suffix — usually removes 99% of the file.
    let start = 0;
    while (start < m && start < n && eq(origLines[start], modLines[start])) start++;
    let endA = m, endB = n;
    while (endA > start && endB > start && eq(origLines[endA - 1], modLines[endB - 1])) { endA--; endB--; }

    const result = [];
    for (let i = 0; i < start; i++) result.push({ type: 'unchanged', line: origLines[i] });

    // 2) Myers O(ND) diff on the differing middle section only.
    const midOps = DiffComputer._myers(origLines.slice(start, endA), modLines.slice(start, endB), eq);
    for (const op of midOps) result.push(op);

    for (let i = endA; i < m; i++) result.push({ type: 'unchanged', line: origLines[i] });
    return result;
  }

  /**
   * Myers shortest-edit-script diff. Fast when the number of changes is small,
   * regardless of file length. Falls back to "remove all / add all" only for
   * the middle block if the edit distance is extremely large.
   */
  static _myers(a, b, eq) {
    const N = a.length, M = b.length;
    if (N === 0 && M === 0) return [];
    if (N === 0) return b.map(l => ({ type: 'added',   line: l }));
    if (M === 0) return a.map(l => ({ type: 'removed', line: l }));

    const MAX_D  = Math.min(N + M, 3000);
    const offset = N + M + 1;
    const v      = new Int32Array(2 * offset + 2);
    const trace  = [];
    let foundD   = -1;

    outer:
    for (let d = 0; d <= MAX_D; d++) {
      trace.push(v.slice(offset - d, offset + d + 1));
      for (let k = -d; k <= d; k += 2) {
        let x;
        if (k === -d || (k !== d && v[offset + k - 1] < v[offset + k + 1])) x = v[offset + k + 1];
        else x = v[offset + k - 1] + 1;
        let y = x - k;
        while (x < N && y < M && eq(a[x], b[y])) { x++; y++; }
        v[offset + k] = x;
        if (x >= N && y >= M) { foundD = d; break outer; }
      }
    }

    if (foundD < 0) {
      // Too different — treat the middle block as a replacement.
      return [
        ...a.map(l => ({ type: 'removed', line: l })),
        ...b.map(l => ({ type: 'added',   line: l }))
      ];
    }

    // Backtrack (push + reverse is O(n), unlike repeated unshift)
    const ops = [];
    let x = N, y = M;
    for (let d = foundD; d > 0; d--) {
      const vp = trace[d];
      const k  = x - y;
      const prevK = (k === -d || (k !== d && vp[k - 1 + d] < vp[k + 1 + d])) ? k + 1 : k - 1;
      const prevX = vp[prevK + d];
      const prevY = prevX - prevK;
      while (x > prevX && y > prevY) { ops.push({ type: 'unchanged', line: a[x - 1] }); x--; y--; }
      if (x === prevX) { ops.push({ type: 'added',   line: b[y - 1] }); y--; }
      else             { ops.push({ type: 'removed', line: a[x - 1] }); x--; }
    }
    while (x > 0 && y > 0) { ops.push({ type: 'unchanged', line: a[x - 1] }); x--; y--; }
    return ops.reverse();
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
  static _tokenize(str) {
    return str.match(/[\p{L}\p{N}_]+|\s+|[^\s\p{L}\p{N}_]/gu) || [];
  }

  /**
   * Intra-line diff between a removed line and the line that replaced it.
   * Returns segments for both sides ({text, changed}) plus a 0-1 similarity score
   * used to skip highlighting when the two lines have almost nothing in common.
   */
  static wordDiff(oldLine, newLine, ignoreWhitespace = false) {
    const a = DiffComputer._tokenize(oldLine);
    const b = DiffComputer._tokenize(newLine);
    if (a.length > 1500 || b.length > 1500) return null;

    const isWs = t => /^\s+$/.test(t);
    const eq = (x, y) => x === y || (ignoreWhitespace && isWs(x) && isWs(y));
    const ops = DiffComputer._myers(a, b, eq);

    const oldSegs = [], newSegs = [];
    const push = (arr, text, changed) => {
      const last = arr[arr.length - 1];
      if (last && last.changed === changed) last.text += text; else arr.push({ text, changed });
    };
    let ia = 0, ib = 0, keptChars = 0, totalChars = 0;
    for (const op of ops) {
      if (op.type === 'unchanged') {
        push(oldSegs, a[ia], false); push(newSegs, b[ib], false);
        if (!isWs(a[ia])) keptChars += a[ia].length;
        ia++; ib++;
      } else if (op.type === 'removed') {
        push(oldSegs, a[ia++], true);
      } else {
        push(newSegs, b[ib++], true);
      }
    }
    for (const t of a) if (!isWs(t)) totalChars += t.length;
    for (const t of b) if (!isWs(t)) totalChars += t.length;
    const similarity = totalChars ? (2 * keptChars) / totalChars : 1;
    return { oldSegs, newSegs, similarity };
  }

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
 * Default file handling principles, shown in Settings until the user writes
 * their own. Given to the AI (via getFileOpsSystemMessage) with every request
 * where file operations are in play.
 */
const DEFAULT_FILE_HANDLING_PRINCIPLES = `# File handling principles

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

    // The AI folder holds the AI's identity and memory; those only change through the approval flow (FR-L2).
    if (this.plugin.settings.aiFolder && this.plugin.aiFolder.contains(normalized)) return false;

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
    if (this.plugin.settings.aiFolder && this.plugin.aiFolder.contains(normalized)) {
      throw new Error(`"${normalized}" is in the AI folder, which file operations can't touch.`);
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
   * Applies SEARCH/REPLACE patches (see PatchEngine) to an existing file.
   * Nothing is written here — the caller gets before/after text for diff review.
   * Throws a single Error listing every failing block (atomic: no partial result).
   *
   * @param {string} rawPath        – vault-relative path
   * @param {Array}  patches        – parsed PatchEngine patches
   * @param {string} [baseContent]  – use this instead of re-reading the file
   *                                  (lets several patches to one file chain)
   */
  async patch(rawPath, patches, baseContent = null) {
    const path = this.resolvePath(rawPath);
    const file = this.app.vault.getAbstractFileByPath(path);
    if (!file) throw new Error(`"${path}" was not found.`);
    if (!patches || !patches.length) {
      throw new Error('No valid SEARCH/REPLACE blocks were found in the patch body.');
    }
    const original = baseContent ?? await this.app.vault.read(file);
    const res = PatchEngine.apply(original, patches);
    if (res.errors.length) {
      const err = new Error(res.errors.join(' | '));
      err.patchErrors = res.errors;
      err.patchPath = path;
      throw err;
    }
    return { path, original, updated: res.content, count: PatchEngine.totalCount(res.results) };
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
 * principles the AI is given) but never shown to the user —
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
async function extractAndRunQueryOps(text, manager, opts = {}) {
  const matches = [...text.matchAll(FILE_OP_REGEX)].filter(m => m[1] === 'list' || m[1] === 'read' || m[1] === 'search');
  if (!matches.length) return null;

  const blocks = [];
  for (const match of matches) {
    const [, op, attrsStr] = match;
    const attrs = parseFileOpAttrs(attrsStr);
    if (manager.plugin && typeof manager.plugin.fileOpPermission === 'function') {
      const verdict = await manager.plugin.fileOpPermission(op, attrs, opts.signal);
      if (!verdict.allowed) {
        blocks.push(`⨉ ${op} not allowed${attrs.path ? ` for "${attrs.path}"` : ''}: ${verdict.byUser ? 'the user did not allow it' : 'turned off in the permission rules'}.`);
        continue;
      }
    }
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
 * Dry-runs every patch op in `text` (reads the vault, writes nothing) and
 * returns a feedback string for the AI describing each failure, or null if
 * every patch applies cleanly. Used by the chat agent loop so a bad patch
 * triggers a self-correction round instead of a hard failure.
 */
async function validatePatchOps(text, manager, { allowRewriteOp = true } = {}) {
  const matches = [...text.matchAll(FILE_OP_REGEX)].filter(m => m[1] === 'patch');
  if (!matches.length) return null;
  const virtual = new Map(); // path -> content after earlier patches in the same reply
  const problems = [];
  for (const m of matches) {
    const attrs = parseFileOpAttrs(m[2]);
    try {
      const patches = (attrs.search !== undefined) ? PatchEngine.fromLegacyAttrs(attrs) : PatchEngine.parse(m[3]);
      const path = manager.resolvePath(attrs.path);
      const { updated } = await manager.patch(attrs.path, patches, virtual.get(path) ?? null);
      virtual.set(path, updated);
    } catch (e) {
      const errs = e.patchErrors || [e.message];
      problems.push(PatchEngine.buildFeedback(attrs.path || '(no path)', errs, { allowRewriteOp }));
    }
  }
  return problems.length ? problems.join('\n\n') : null;
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
async function applyFileOps(text, manager, opts = {}) {
  const matches = [...text.matchAll(FILE_OP_REGEX)];
  if (!matches.length) return { cleanedText: text, notices: [], ranAnyOp: false, pendingEdits: [] };

  // beforeFileWrite hooks run once, before the first file is created, copied or moved
  if (!opts.readOnly && manager.plugin && manager.plugin.hooks && manager.plugin.hooks.has('beforeFileWrite')) {
    const operations = matches.filter(m => ['create', 'copy', 'move', 'rename'].includes(m[1])).map(m => {
      const a = parseFileOpAttrs(m[2]);
      return { operation: m[1], path: a.path, ...(a.to ? { to: a.to } : {}) };
    });
    if (operations.length) await manager.plugin.hooks.fire('beforeFileWrite', { operations }, { signal: opts.signal });
  }

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

    // Plan mode: nothing may change yet. The operation is held back and the reply says so.
    if (opts.readOnly) {
      const held = `📝 Plan mode: not done yet — ${op}${attrs.path ? ` "${attrs.path}"` : ''}`;
      notices.push(held);
      cleaned += `\n\n> ${held}\n`;
      continue;
    }

    // Permission rules (FR-3.5): Allow runs, Deny skips, Ask shows a prompt first.
    if (manager.plugin && typeof manager.plugin.fileOpPermission === 'function') {
      const verdict = await manager.plugin.fileOpPermission(op, attrs, opts.signal);
      if (!verdict.allowed) {
        const skipped = `🚫 Not done — ${verdict.byUser ? 'you did not allow it' : 'turned off in the permission rules'}: ${op}${attrs.path ? ` "${attrs.path}"` : ''}`;
        notices.push(skipped);
        cleaned += `\n\n> ${skipped}\n`;
        continue;
      }
    }

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
          const prior = pendingEdits.find(pe => pe.path === path);
          if (prior) {
            prior.newContent = content; // later full rewrite supersedes earlier ops on the same file
          } else {
            const originalContent = await manager.app.vault.read(file);
            pendingEdits.push({ path, file, originalContent, newContent: content });
          }
          notice = `✏️ Proposed edit to: ${path} — see diff review above`;
          break;
        }
        case 'patch': {
          // SEARCH/REPLACE blocks in the body (new format) or the legacy
          // search="…" replace="…" attributes (treated as replace-all).
          const patches = (attrs.search !== undefined)
            ? PatchEngine.fromLegacyAttrs(attrs)
            : PatchEngine.parse(body);
          const resolved = manager.resolvePath(attrs.path);
          // Chain onto earlier pending edits of the same file in this reply.
          const prior = pendingEdits.find(pe => pe.path === resolved);
          const { path, original, updated, count } =
            await manager.patch(attrs.path, patches, prior ? prior.newContent : null);
          if (prior) {
            prior.newContent = updated;
          } else {
            const file = manager.app.vault.getAbstractFileByPath(path);
            pendingEdits.push({ path, file, originalContent: original, newContent: updated });
          }
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

// ==================== PATCH ENGINE ====================

/**
 * Shared SEARCH/REPLACE patch engine, used by BOTH the chat `@@FILE_OP:patch@@`
 * operation and the "✏ Edit instruction" pipeline (AIFileEditor).
 *
 * Two house syntaxes are taught to the AI (both parse everywhere, plus an XML form):
 *
 *   Chat file operations (@@FILE_OP:patch@@ body):
 *     @@PATCH occurrence=all word=yes@@
 *     @@FIND@@
 *     exact existing text (one word, part of a line, or many lines)
 *     @@WITH@@
 *     replacement text (any number of lines; empty to delete)
 *     @@END_PATCH@@
 *
 *   Edit-instruction pipeline:
 *     <<<<<<< SEARCH_ALL WORD
 *     exact existing text
 *     =======
 *     replacement text
 *     >>>>>>> REPLACE
 *
 *   Also accepted: <patch occurrence="all" whole-word="true"><find>…</find><replace>…</replace></patch>
 *
 * Occurrence options (default `once` = the text must be unique):
 *   once | all | first | last | <n> (the n-th, 1-based)
 * Modifier:
 *   word  — match whole identifiers only (renaming `count` never touches `counter`).
 *
 * Matching tiers (first one that finds something wins):
 *   1. exact text
 *   2. line-based, ignoring trailing whitespace and CRLF/LF differences
 *   3. line-based, ignoring indentation (replacement is re-indented to fit)
 *
 * Patching is atomic per file: if any block fails, nothing is changed and
 * every error is returned with a hint so the AI can correct itself.
 */
class PatchEngine {
  // Syntax A (Edit instruction pipeline):  <<<<<<< SEARCH_ALL WORD / ======= / >>>>>>> REPLACE
  static BLOCK_RE = /(?<![^\n])<{3,9}[ \t]*(SEARCH(?:_ALL|_FIRST|_LAST|_NTH[ =:]?\d+)?)((?:[ \t,]+WORD)?)[ \t]*\r?\n([\s\S]*?)(?<![^\n])={5,}[ \t]*\r?\n([\s\S]*?)(?<![^\n])>{3,9}[ \t]*REPLACE/g;
  // Syntax B (chat @@FILE_OP:patch@@):      @@PATCH occurrence=all word=yes@@ / @@FIND@@ / @@WITH@@ / @@END_PATCH@@
  static AT_RE = /@@PATCH([^\n@]*)@@[ \t]*\r?\n@@FIND@@[ \t]*\r?\n([\s\S]*?)(?<![^\n])@@WITH@@[ \t]*\r?\n([\s\S]*?)(?<![^\n])@@END_PATCH@@/g;
  // Syntax C (accepted everywhere):         <patch occurrence="all" whole-word="true"><find>…</find><replace>…</replace></patch>
  static XML_RE = /<patch\b([^>]*)>\s*<find>([\s\S]*?)<\/find>\s*<replace>([\s\S]*?)<\/replace>\s*<\/patch>/gi;

  /**
   * Turns an options string such as `occurrence=all word=yes`, `all, word`,
   * `occurrence="3" whole-word="true"` or `SEARCH_NTH=2` into { mode, nth, word }.
   */
  static _parseOptions(str) {
    const o = { mode: 'unique', nth: 0, word: false };
    const applyOcc = (val) => {
      val = String(val || '').toLowerCase().replace(/^["']|["']$/g, '');
      let m;
      if (val === 'all' || val === 'every')                                    o.mode = 'all';
      else if (val === 'first')                                                o.mode = 'first';
      else if (val === 'last')                                                 o.mode = 'last';
      else if (['once', 'one', 'unique', 'single', 'only'].includes(val))      o.mode = 'unique';
      else if ((m = val.match(/^(?:nth)?[:=]?(\d+)$/)))                        { o.mode = 'nth'; o.nth = parseInt(m[1], 10); }
    };
    for (const tok of String(str || '').toLowerCase().split(/[\s,;]+/).filter(Boolean)) {
      const eq = tok.indexOf('=');
      const k = eq > -1 ? tok.slice(0, eq) : tok;
      const v = eq > -1 ? tok.slice(eq + 1).replace(/^["']|["']$/g, '') : null;
      if (['occurrence', 'occurrences', 'occur', 'mode', 'nth', 'match'].includes(k) && v !== null) applyOcc(v);
      else if (['word', 'whole-word', 'wholeword', 'whole_word', 'whole'].includes(k)) {
        o.word = v === null ? true : !['no', 'false', '0', 'off'].includes(v);
      } else if (v === null) applyOcc(k); // bare token: all / first / last / once / 3
    }
    return o;
  }

  /** Parses every patch block found in `body`, in any of the supported syntaxes, in document order. */
  static parse(body) {
    const text = body || '';
    const found = [];
    const stripNl  = s => s.replace(/\r?\n$/, '');
    const stripXml = s => s.replace(/^\r?\n/, '').replace(/\r?\n$/, '');
    let m;

    let re = new RegExp(PatchEngine.BLOCK_RE.source, 'g');
    while ((m = re.exec(text))) {
      const modeStr = m[1].toUpperCase().replace(/^SEARCH_?/, '').replace(/[ =:]+/g, '=');
      const opts = PatchEngine._parseOptions(`${modeStr} ${m[2].trim() ? 'word' : ''}`);
      found.push({ index: m.index, p: { ...opts, search: stripNl(m[3]), replace: stripNl(m[4]) } });
    }

    re = new RegExp(PatchEngine.AT_RE.source, 'g');
    while ((m = re.exec(text))) {
      found.push({ index: m.index, p: { ...PatchEngine._parseOptions(m[1]), search: stripNl(m[2]), replace: stripNl(m[3]) } });
    }

    re = new RegExp(PatchEngine.XML_RE.source, 'gi');
    while ((m = re.exec(text))) {
      found.push({ index: m.index, p: { ...PatchEngine._parseOptions(m[1]), search: stripXml(m[2]), replace: stripXml(m[3]) } });
    }

    return found.sort((x, y) => x.index - y.index).map(x => x.p);
  }

  /** Converts the legacy search="…" replace="…" attribute form (replaced ALL occurrences). */
  static fromLegacyAttrs(attrs) {
    return [{ mode: 'all', nth: 0, word: false, search: attrs.search ?? '', replace: attrs.replace ?? '' }];
  }

  static _isWordChar(ch) { return !!ch && /[\p{L}\p{N}_$]/u.test(ch); }

  /** All non-overlapping exact occurrences of `search` in `text`. */
  static _exactSpans(text, search, word) {
    const spans = [];
    let from = 0, idx;
    const first = search[0], last = search[search.length - 1];
    while ((idx = text.indexOf(search, from)) !== -1) {
      const end = idx + search.length;
      from = end;
      if (word) {
        if (PatchEngine._isWordChar(first) && PatchEngine._isWordChar(text[idx - 1])) continue;
        if (PatchEngine._isWordChar(last)  && PatchEngine._isWordChar(text[end]))     continue;
      }
      spans.push({ start: idx, end, replaceXform: null });
    }
    return spans;
  }

  /**
   * Line-aligned tolerant matching. `level` 1 ignores trailing whitespace
   * (+ CRLF); level 2 also ignores indentation.
   */
  static _fuzzySpans(text, search, level) {
    const norm = level === 1 ? (s => s.replace(/[ \t\r]+$/, '')) : (s => s.trim());
    const sLinesRaw = search.replace(/\r\n/g, '\n').split('\n');
    while (sLinesRaw.length && sLinesRaw[0].trim() === '') sLinesRaw.shift();
    while (sLinesRaw.length && sLinesRaw[sLinesRaw.length - 1].trim() === '') sLinesRaw.pop();
    if (!sLinesRaw.length) return [];
    const sLines = sLinesRaw.map(norm);

    const lines = text.split('\n');
    const offsets = [];
    let pos = 0;
    for (const l of lines) { offsets.push(pos); pos += l.length + 1; }

    const spans = [];
    for (let i = 0; i + sLines.length <= lines.length; i++) {
      let ok = true;
      for (let j = 0; j < sLines.length; j++) {
        if (norm(lines[i + j]) !== sLines[j]) { ok = false; break; }
      }
      if (!ok) continue;
      const lastIdx = i + sLines.length - 1;
      const span = {
        start: offsets[i],
        end: offsets[lastIdx] + lines[lastIdx].replace(/\r$/, '').length,
        replaceXform: null
      };
      const crlf = lines[i + sLines.length - 1].endsWith('\r') || lines[i].endsWith('\r');
      const fileIndent = (lines[i].match(/^[ \t]*/) || [''])[0];
      const searchIndent = (sLinesRaw[0].match(/^[ \t]*/) || [''])[0];
      span.replaceXform = (rep) => {
        let out = rep;
        if (level === 2 && fileIndent !== searchIndent) {
          out = rep.split('\n').map(l => {
            if (!l.trim()) return l;
            if (fileIndent.startsWith(searchIndent)) return fileIndent.slice(searchIndent.length) + l;
            if (searchIndent.startsWith(fileIndent)) {
              const drop = searchIndent.slice(fileIndent.length);
              return l.startsWith(drop) ? l.slice(drop.length) : l;
            }
            return l;
          }).join('\n');
        }
        return crlf ? out.replace(/\r?\n/g, '\r\n') : out;
      };
      spans.push(span);
      i += sLines.length - 1; // non-overlapping
    }
    return spans;
  }

  static _dice(a, b) {
    if (a.length < 2 || b.length < 2) return a === b ? 1 : 0;
    const grams = new Map();
    for (let i = 0; i < a.length - 1; i++) { const g = a.slice(i, i + 2); grams.set(g, (grams.get(g) || 0) + 1); }
    let hit = 0;
    for (let i = 0; i < b.length - 1; i++) {
      const g = b.slice(i, i + 2);
      const c = grams.get(g);
      if (c > 0) { hit++; grams.set(g, c - 1); }
    }
    return (2 * hit) / (a.length + b.length - 2);
  }

  /** Finds the file line most similar to the first search line, to help the AI self-correct. */
  static _closestHint(text, search) {
    const target = (search.split('\n').find(l => l.trim()) || '').trim();
    if (!target) return '';
    const lines = text.split('\n');
    let best = -1, bestScore = 0;
    const cap = Math.min(lines.length, 6000);
    for (let i = 0; i < cap; i++) {
      const t = lines[i].trim();
      if (!t) continue;
      const sc = PatchEngine._dice(target, t);
      if (sc > bestScore) { bestScore = sc; best = i; }
    }
    if (best < 0 || bestScore < 0.5) return '';
    return ` The closest line in the file is line ${best + 1}: "${lines[best].trim().slice(0, 120)}".`;
  }

  /**
   * Applies `patches` to `content`.
   * @returns {{ content: string, errors: string[], results: Array<{index:number,count:number,tier:string}> }}
   *          On any error `content` is the untouched original (atomic).
   */
  static apply(content, patches) {
    const errors = [];
    const results = [];
    let working = content;

    patches.forEach((p, idx) => {
      const label = `Block ${idx + 1}`;
      if (!p.search || !p.search.trim()) {
        errors.push(`${label}: the SEARCH text is empty — include the existing text (or a nearby anchor line) you want to change.`);
        return;
      }

      // Tier 1 → 3 until something matches
      let spans = PatchEngine._exactSpans(working, p.search, p.word);
      let tier = 'exact';
      if (!spans.length && !p.word) {
        spans = PatchEngine._fuzzySpans(working, p.search, 1); tier = 'whitespace-tolerant';
        if (!spans.length) { spans = PatchEngine._fuzzySpans(working, p.search, 2); tier = 'indent-tolerant'; }
      }

      if (!spans.length) {
        errors.push(`${label}: SEARCH text not found in the file${p.word ? ' (as a whole word)' : ''}. It must be copied exactly from the file.${PatchEngine._closestHint(working, p.search)}`);
        return;
      }

      let chosen;
      switch (p.mode) {
        case 'all':   chosen = spans; break;
        case 'first': chosen = [spans[0]]; break;
        case 'last':  chosen = [spans[spans.length - 1]]; break;
        case 'nth':
          if (!p.nth || p.nth < 1 || p.nth > spans.length) {
            errors.push(`${label}: SEARCH_NTH=${p.nth} is out of range — the text occurs ${spans.length} time(s).`);
            return;
          }
          chosen = [spans[p.nth - 1]];
          break;
        default:
          if (spans.length > 1) {
            errors.push(`${label}: SEARCH text occurs ${spans.length} times, so it is ambiguous. Add surrounding lines to make it unique, or use SEARCH_ALL / SEARCH_FIRST / SEARCH_LAST / SEARCH_NTH=n.`);
            return;
          }
          chosen = spans;
      }

      // Apply back-to-front so earlier offsets stay valid.
      for (const s of [...chosen].sort((a, b) => b.start - a.start)) {
        const rep = s.replaceXform ? s.replaceXform(p.replace) : p.replace;
        working = working.slice(0, s.start) + rep + working.slice(s.end);
      }
      results.push({ index: idx, count: chosen.length, tier });
    });

    if (errors.length) return { content, errors, results: [] };

    // Keep CRLF files consistently CRLF.
    if (content.includes('\r\n') && !/(^|[^\r])\n/.test(content)) {
      working = working.replace(/\r?\n/g, '\r\n');
    }
    return { content: working, errors: [], results };
  }

  /** Human-readable total of replacements made. */
  static totalCount(results) { return results.reduce((n, r) => n + r.count, 0); }

  /** Text shown to the AI when a patch fails, telling it exactly how to recover. */
  static buildFeedback(path, errors, { allowRewriteOp = true } = {}) {
    return [
      `The patch for "${path}" could NOT be applied, and NOTHING was changed:`,
      ...errors.map(e => `  • ${e}`),
      '',
      'Fix the failing block(s) by copying the SEARCH text verbatim from the file' +
        (allowRewriteOp ? ', or give up on patching and replace the whole file with an edit operation containing its complete new content.' : '.')
    ].join('\n');
  }
}

// ==================== AI FILE EDITOR ====================

/**
 * Drives the AI-powered file editing pipeline.
 * For each attached file it:
 *   1. Reads the original content from the vault.
 *   2. Asks the active AI provider for targeted SEARCH/REPLACE patches, or —
 *      when the change is broad — a completely rewritten version.
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
    this._sessionId = options.sessionId || null;   // lets the pipeline's requests count in the token counter

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
      let editMode = 'rewrite';
      let patchCount = 0;
      let lastError = null;

      for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
          const editResult = await this._callAIForEdit(file, originalContent, instruction);
          newContent   = editResult.newContent;
          chatMessage  = editResult.chatMessage;
          editMode     = editResult.mode;
          patchCount   = editResult.patchCount || 0;
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
        const diff = DiffComputer.computeLineDiff(originalContent, newContent, { ignoreWhitespace: this.plugin.settings.ignoreWhitespaceInDiff !== false });
        results.push({
          file,
          originalContent,
          newContent,
          diff,
          selected: DiffComputer.hasChanges(diff), // pre-select only if there are actual changes
          chatMessage,   // natural-language summary from the AI for this file
          editMode,      // 'patch' | 'rewrite' | 'none'
          patchCount,
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
   * Calls the AI to edit one file. The model chooses between two output modes:
   *
   *   PATCH mode  — for targeted changes. The model emits one or more
   *                 SEARCH/REPLACE blocks; only those spans are changed and
   *                 the rest of the file is guaranteed untouched.
   *
   *       <CHAT>…short summary…</CHAT>
   *       <PATCH>
   *       <<<<<<< SEARCH
   *       exact existing text
   *       =======
   *       replacement text
   *       >>>>>>> REPLACE
   *       </PATCH>
   *
   *   REWRITE mode — for restructures / changes touching most of the file.
   *                 The model returns the complete new file.
   *
   *       <CHAT>…short summary…</CHAT>
   *       <FILE>…complete new file…</FILE>
   *
   * If a patch can't be applied (search text not found / ambiguous), the
   * failure is fed back to the model so it can correct the patch or fall back
   * to a full rewrite. As a last resort a forced full-rewrite request is made.
   *
   * @returns {{ chatMessage: string, newContent: string,
   *             mode: 'patch'|'rewrite'|'none', patchCount: number }}
   */
  async _callAIForEdit(file, originalContent, instruction) {
    const systemPrompt = [
      'You are a precise file editor.',
      'You receive a file and an editing instruction. Respond using EXACTLY one of the two formats below — no other text outside the tags.',
      '',
      'FORMAT A — PATCH (preferred whenever the change is local, e.g. fixing, inserting, replacing or deleting specific passages):',
      '<CHAT>',
      'A brief, friendly 1–3 sentence message for the user describing what you changed and why.',
      '</CHAT>',
      '<PATCH>',
      '<<<<<<< SEARCH',
      'exact text currently in the file (copied verbatim, including whitespace)',
      '=======',
      'the text that should replace it',
      '>>>>>>> REPLACE',
      '</PATCH>',
      '',
      'PATCH rules:',
      '- A <PATCH> may contain several SEARCH/REPLACE blocks. They are applied top to bottom. Each block can replace a single word, part of a line, several adjacent lines, or a whole paragraph with any number of new lines.',
      '- Copy the SEARCH text verbatim from the file. Keep blocks as small as possible — never repeat large unchanged regions. Quotes and code are fine inside blocks.',
      '- By default SEARCH must occur exactly ONCE in the file; add 1–3 surrounding lines to make it unique. You can instead choose how occurrences are handled:',
      '    "<<<<<<< SEARCH_ALL"     replace EVERY occurrence (renaming a variable, global find & replace)',
      '    "<<<<<<< SEARCH_FIRST"   replace only the first occurrence',
      '    "<<<<<<< SEARCH_LAST"    replace only the last occurrence',
      '    "<<<<<<< SEARCH_NTH=3"   replace only the 3rd occurrence',
      '- Add " WORD" after the mode (e.g. "<<<<<<< SEARCH_ALL WORD") to match whole identifiers only, so renaming `count` does not touch `counter`.',
      '- To delete text leave the REPLACE side empty. To insert text, SEARCH for a nearby anchor line and put anchor + new text in REPLACE.',
      '- The divider line must be exactly "=======" and the closing line exactly ">>>>>>> REPLACE". Never wrap the blocks in markdown code fences.',
      '',
      'FORMAT B — FULL REWRITE (use only when you are restructuring, translating, reformatting, or otherwise changing most of the file, or when the user explicitly asks you to rewrite it):',
      '<CHAT>',
      'A brief 1–3 sentence message for the user.',
      '</CHAT>',
      '<FILE>',
      'The complete modified file content, raw. No markdown code fences. No preamble.',
      '</FILE>',
      '',
      'If no changes are needed, return <CHAT> explaining so and an empty <PATCH></PATCH>.'
    ].join('\n');

    const userMessage = [
      `File: ${file.path}`,
      '',
      '--- BEGIN FILE CONTENT ---',
      originalContent,
      '--- END FILE CONTENT ---',
      '',
      `Editing instruction: ${instruction}`
    ].join('\n');

    const messages = [
      { role: 'system', content: systemPrompt },
      { role: 'user',   content: userMessage }
    ];

    const MAX_PATCH_ATTEMPTS = 2;
    let lastFailure = '';

    for (let attempt = 0; attempt < MAX_PATCH_ATTEMPTS; attempt++) {
      const raw = await this._sendEditRequest(messages);
      const parsed = this._parseEditResponse(raw, originalContent);

      if (parsed.mode === 'rewrite' || parsed.mode === 'none') return parsed;

      // PATCH mode — apply to the original text. A malformed <PATCH> section
      // counts as a failed application so the model gets a chance to retry.
      const applied = parsed.mode === 'invalid'
        ? { content: originalContent, errors: [parsed.error], results: [] }
        : PatchEngine.apply(originalContent, parsed.patches);
      if (applied.errors.length === 0) {
        return {
          chatMessage: parsed.chatMessage,
          newContent:  applied.content,
          mode:        'patch',
          patchCount:  parsed.patches.length
        };
      }

      // Feed the failure back so the model can correct itself.
      lastFailure = applied.errors.map(e => `  • ${e}`).join('\n');
      console.warn('AIFileEditor: patch could not be applied —', lastFailure);
      messages.push({ role: 'assistant', content: raw });
      messages.push({
        role: 'user',
        content: [
          'Some of your SEARCH/REPLACE blocks could not be applied, so NOTHING was changed:',
          lastFailure,
          '',
          'Reply again in the same format with corrected <PATCH> blocks (copy the SEARCH text verbatim from the file, and make it unique),',
          'or, if that is impractical, use FORMAT B and return the complete file inside <FILE>.'
        ].join('\n')
      });
    }

    // Last resort: force a complete rewrite so the user still gets a result.
    console.warn('AIFileEditor: patch retries exhausted; falling back to full rewrite.');
    const rewriteMessages = [
      {
        role: 'system',
        content: [
          'You are a precise file editor.',
          'Respond using EXACTLY this format:',
          '<CHAT>',
          'A brief 1–3 sentence message for the user.',
          '</CHAT>',
          '<FILE>',
          'The complete modified file content, raw. No markdown code fences. No preamble.',
          '</FILE>',
          'If no changes are needed, return the original text verbatim inside <FILE>.'
        ].join('\n')
      },
      messages[1]
    ];
    const raw = await this._sendEditRequest(rewriteMessages);
    const parsed = this._parseEditResponse(raw, originalContent);
    if (parsed.mode === 'invalid') throw new Error(parsed.error);
    if (parsed.mode === 'patch') {
      // Model ignored the instruction again — one more try at applying, else fail loudly.
      const applied = PatchEngine.apply(originalContent, parsed.patches);
      if (applied.errors.length) throw new Error(`Could not apply AI patch: ${applied.errors[0]}`);
      return { chatMessage: parsed.chatMessage, newContent: applied.content, mode: 'patch', patchCount: parsed.patches.length };
    }
    return parsed;
  }

  async _sendEditRequest(messages) {
    const result = await this.plugin.apiManager.sendMessage({
      messages,
      temperature: 0.2,      // lower = more deterministic edits
      max_tokens:  this.plugin.settings.max_tokens,
      stream:      false
    }, { timeoutMs: this.plugin.settings.timeoutMs, sessionId: this._sessionId || undefined, turnOnly: true });

    if (!result?.final) throw new Error('Empty response from AI');
    return result.final.trim();
  }

  /**
   * Splits the AI's structured response into chat message + either a list of
   * SEARCH/REPLACE patches or a full-file rewrite.
   *
   * @returns {{ mode:'patch', chatMessage:string, patches:Array }
   *         | { mode:'rewrite', chatMessage:string, newContent:string, patchCount:0 }
   *         | { mode:'none', chatMessage:string, newContent:string, patchCount:0 }}
   */
  _parseEditResponse(raw, originalContent = '') {
    const chatMatch  = raw.match(/<CHAT>([\s\S]*?)<\/CHAT>/i);
    const fileMatch  = raw.match(/<FILE>([\s\S]*?)<\/FILE>/i);
    const patchMatch = raw.match(/<PATCH>([\s\S]*?)<\/PATCH>/i);
    const chatMessage = chatMatch ? chatMatch[1].trim() : '';

    // A full rewrite wins if both are (mistakenly) present.
    if (fileMatch) {
      return {
        mode: 'rewrite',
        chatMessage,
        newContent: this._stripCodeFence(fileMatch[1].trim()),
        patchCount: 0
      };
    }

    // Parse blocks from everything except the <CHAT> section, so patches are
    // found whether or not the model wrapped them in <PATCH>…</PATCH>, and in
    // whichever supported block syntax it chose.
    const patches = PatchEngine.parse(raw.replace(/<CHAT>[\s\S]*?<\/CHAT>/i, ''));
    if (patches.length > 0) return { mode: 'patch', chatMessage, patches };

    if (patchMatch) {
      // A <PATCH> section with something in it but no parseable block is a
      // malformed patch (not "nothing to change") — report it so the model can retry.
      if (patchMatch[1].trim()) {
        return { mode: 'invalid', chatMessage, patchCount: 0,
                 error: 'The <PATCH> section did not contain any valid SEARCH/REPLACE block.' };
      }
      // Empty <PATCH></PATCH> == "nothing to change"
      return { mode: 'none', chatMessage, newContent: originalContent, patchCount: 0 };
    }

    // Model ignored the format entirely — treat the whole response as the new
    // file content (legacy behaviour) so we degrade gracefully.
    console.warn('AIFileEditor: response had no <PATCH>/<FILE> section; falling back to raw-content mode.');
    return { mode: 'rewrite', chatMessage: '', newContent: this._stripCodeFence(raw), patchCount: 0 };
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
      const planned = this.fileDiffs.filter(fd => fd.selected && DiffComputer.hasChanges(fd.diff));
      if (planned.length && this.plugin.hooks && this.plugin.hooks.has('beforeFileWrite')) {
        await this.plugin.hooks.fire('beforeFileWrite', { operations: planned.map(fd => ({ operation: 'edit', path: fd.file.path })) });
      }
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

    const diff = fd.diff;
    const ignoreWs = this.plugin.settings.ignoreWhitespaceInDiff !== false;
    // Folding is a user setting, but a huge unfolded diff would freeze the UI, so very
    // large diffs are always folded.
    const fold = this.plugin.settings.collapseUnchangedInDiff !== false || diff.length > 5000;
    const CONTEXT = 3;

    // Pair each removed line with the added line that replaced it (for word-level highlighting)
    const pairOf = new Map();
    for (let i = 0; i < diff.length;) {
      if (diff[i].type !== 'removed') { i++; continue; }
      const r0 = i; while (i < diff.length && diff[i].type === 'removed') i++;
      const a0 = i; while (i < diff.length && diff[i].type === 'added') i++;
      const n = Math.min(a0 - r0, i - a0);
      for (let k = 0; k < n; k++) { pairOf.set(r0 + k, a0 + k); pairOf.set(a0 + k, r0 + k); }
    }
    const segCache = new Map();
    const getSegments = (idx) => {
      if (!pairOf.has(idx)) return null;
      const other = pairOf.get(idx);
      const remIdx = diff[idx].type === 'removed' ? idx : other;
      const addIdx = diff[idx].type === 'added'   ? idx : other;
      let r = segCache.get(remIdx);
      if (r === undefined) {
        r = DiffComputer.wordDiff(diff[remIdx].line, diff[addIdx].line, ignoreWs);
        segCache.set(remIdx, r);
      }
      if (!r || r.similarity < 0.4) return null;      // too different → plain full-line colour
      return diff[idx].type === 'removed' ? r.oldSegs : r.newSegs;
    };

    const renderLine = (container, idx) => {
      const { type, line } = diff[idx];
      const lineEl = container.createDiv({ cls: `ai-diff-line ai-diff-${type}` });
      lineEl.style.padding      = '1px 14px 1px 28px';
      lineEl.style.position     = 'relative';
      lineEl.style.whiteSpace   = 'pre';
      lineEl.style.overflowX    = 'auto';

      const marker = lineEl.createSpan({ text: type === 'added' ? '+' : type === 'removed' ? '−' : ' ' });
      marker.style.position   = 'absolute';
      marker.style.left       = '8px';
      marker.style.userSelect = 'none';

      let strong = null;
      if (type === 'added') {
        lineEl.style.background = 'rgba(34,197,94,0.15)';
        lineEl.style.color      = '#16a34a';
        marker.style.color      = '#16a34a';
        marker.style.fontWeight = '700';
        strong = 'rgba(34,197,94,0.45)';
      } else if (type === 'removed') {
        lineEl.style.background = 'rgba(239,68,68,0.15)';
        lineEl.style.color      = '#dc2626';
        marker.style.color      = '#dc2626';
        marker.style.fontWeight = '700';
        strong = 'rgba(239,68,68,0.45)';
      } else {
        lineEl.style.color = 'var(--text-muted)';
      }

      const segments = strong ? getSegments(idx) : null;
      if (!segments) {
        lineEl.appendChild(document.createTextNode(line));
      } else {
        segments.forEach(seg => {
          if (!seg.changed) { lineEl.appendChild(document.createTextNode(seg.text)); return; }
          const hl = lineEl.createSpan({ text: seg.text });
          hl.style.background   = strong;     // darker shade only where the words differ
          hl.style.borderRadius = '3px';
        });
      }
    };

    // Which lines stay visible: every change plus CONTEXT unchanged lines around it
    const near = new Uint8Array(diff.length);
    if (fold) {
      diff.forEach((d, idx) => {
        if (d.type === 'unchanged') return;
        const lo = Math.max(0, idx - CONTEXT), hi = Math.min(diff.length - 1, idx + CONTEXT);
        for (let k = lo; k <= hi; k++) near[k] = 1;
      });
    } else {
      near.fill(1);
    }

    for (let i = 0; i < diff.length;) {
      if (near[i]) { renderLine(diffContent, i); i++; continue; }
      let j = i; while (j < diff.length && !near[j]) j++;
      this._renderGap(diffContent, i, j, renderLine);
      i = j;
    }
  }

  /**
   * A fold marker standing in for diff[start..end) unchanged lines.
   * Clicking reveals them in chunks (or all at once when the stretch is reasonably small).
   */
  _renderGap(container, start, end, renderLine) {
    const CHUNK = 100, MAX_ALL = 3000;
    const sep = container.createDiv({ cls: 'ai-diff-sep' });
    sep.style.display      = 'flex';
    sep.style.alignItems   = 'center';
    sep.style.gap          = '14px';
    sep.style.padding      = '4px 14px';
    sep.style.background   = 'var(--background-secondary)';
    sep.style.color        = 'var(--text-muted)';
    sep.style.fontSize     = '12px';
    sep.style.fontFamily   = 'var(--font-interface)';
    sep.style.borderTop    = '1px solid var(--background-modifier-border)';
    sep.style.borderBottom = '1px solid var(--background-modifier-border)';

    const label = sep.createSpan();
    const mkLink = (text) => {
      const l = sep.createSpan({ text });
      l.style.cursor = 'pointer';
      l.style.color  = 'var(--text-accent)';
      l.style.fontWeight = '600';
      return l;
    };
    const moreLink = mkLink(`Show ${CHUNK} more`);
    const allLink  = mkLink('Show all');

    let from = start;
    const refresh = () => {
      const left = end - from;
      if (left <= 0) { sep.remove(); return; }
      label.textContent = `⋯ ${left.toLocaleString()} unchanged line${left !== 1 ? 's' : ''} hidden`;
      moreLink.style.display = left > CHUNK ? '' : 'none';
      allLink.style.display  = left <= MAX_ALL ? '' : 'none';
    };
    const reveal = (count) => {
      const stop = Math.min(end, from + count);
      const tmp = document.createElement('div');
      for (let k = from; k < stop; k++) renderLine(tmp, k);
      while (tmp.firstChild) container.insertBefore(tmp.firstChild, sep);
      from = stop;
      refresh();
    };
    moreLink.addEventListener('click', (e) => { e.stopPropagation(); reveal(CHUNK); });
    allLink.addEventListener('click',  (e) => { e.stopPropagation(); reveal(end - from); });
    refresh();
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
 * A request that reached the provider but was refused. `kind` is derived from what the
 * provider itself said (error code/type/message), NOT just the HTTP status — some
 * gateways answer "429" for a retired model, so the status alone is misleading.
 */
class ApiError extends Error {
  constructor({ status = 0, kind = 'unknown', providerMessage = '', retryAfter = 0, model = '' } = {}) {
    super(providerMessage || `HTTP ${status}`);
    this.name = 'ApiError';
    this.status = status;
    this.kind = kind;
    this.providerMessage = providerMessage;
    this.retryAfter = retryAfter;
    this.model = model;
  }
  /** Worth repeating automatically (transient only). */
  get retryable() {
    if (this.kind === 'server') return true;
    if (this.kind === 'rate_limit') return !this.retryAfter || this.retryAfter <= 30;
    return false;
  }
}

function parseProviderError(text) {
  const out = { message: '', code: '', type: '', status: '' };
  let j = null;
  try { j = JSON.parse(text); } catch (_) {}
  if (Array.isArray(j)) j = j[0];
  const e = j && (j.error ?? j);
  if (e && typeof e === 'object') {
    out.message = String(e.message ?? e.detail ?? e.error_description ?? '');
    out.code    = String(e.code ?? '');
    out.type    = String(e.type ?? '');
    out.status  = String(e.status ?? '');
  } else if (typeof e === 'string') {
    out.message = e;
  }
  if (!out.message) out.message = String(text || '').trim().slice(0, 300);
  return out;
}

function classifyApiError(status, info) {
  const hay = `${info.code} ${info.type} ${info.status} ${info.message}`.toLowerCase();

  // The request carried tool definitions the endpoint or model refuses (checked before the
  // model check below, which would otherwise read "model does not support tools" as a retired model)
  if (/\b(tools?|tool[ _-]?(choice|use|calls?)|function[ _-]?calling|functions?)\b/.test(hay) &&
      /(not[ _-]?(supported|enabled|available|allowed)|unsupported|does not support|doesn'?t support|unknown (parameter|field)|unrecognized (parameter|field|request argument)|extra inputs? are not permitted|requires? --)/.test(hay)) {
    return 'tool_unsupported';
  }

  // The model itself is the problem (checked FIRST, whatever the HTTP status says)
  if (/model/.test(hay) &&
      /(not[ _-]?found|does not exist|not supported|unsupported|deprecated|decommission|retired|no longer|unavailable|invalid[ _-]?model|unknown model|not available|not have access|no access|access to (the )?model)/.test(hay)) {
    return 'model_unavailable';
  }
  if (/api[ _-]?key (is )?(not valid|invalid)|invalid[ _-]?api[ _-]?key|incorrect api key|unauthenticated|authentication_error/.test(hay) || status === 401) return 'auth';
  if (/context[ _-]?length|maximum context|too many tokens|prompt is too long|context_length_exceeded|exceeds the (maximum|limit)/.test(hay)) return 'context_too_long';
  if (/per[ _-]?(minute|second)|requests? per|retry (in|after)|rate[ _-]?limit/.test(hay) && !/insufficient_quota/.test(hay)) return 'rate_limit';
  if (/insufficient_quota|exceeded your current quota|billing|credit balance|out of credits|payment required/.test(hay) || status === 402) return 'quota';
  if (status === 403) return 'auth';
  if (status === 429) return 'rate_limit';
  if (status === 404) return 'endpoint';
  if (status === 408 || status === 529 || status >= 500) return 'server';
  if (status === 400 || status === 422) return 'bad_request';
  return 'unknown';
}

function parseRetryAfter(headerValue) {
  if (!headerValue) return 0;
  const n = Number(headerValue);
  if (Number.isFinite(n)) return Math.max(0, Math.ceil(n));
  const t = Date.parse(headerValue);
  return Number.isFinite(t) ? Math.max(0, Math.ceil((t - Date.now()) / 1000)) : 0;
}

function modelFromRequest(url, body) {
  try { const m = JSON.parse(body || '{}').model; if (typeof m === 'string' && m) return m; } catch (_) {}
  const m = /\/models\/([^:/?]+)/.exec(String(url || ''));
  return m ? decodeURIComponent(m[1]) : '';
}


// ── Conversation title carried inside the chat model's own reply ─────────────
// When the dedicated naming request fails, the chat model is asked to append the
// title to its normal answer, hidden in an HTML comment:  <!-- @@conv name: Title@@ -->
const CONV_NAME_TAG_RE = /<!--\s*@@\s*conv\s*name\s*:\s*([\s\S]*?)\s*@@\s*-->/i;

function cleanConvTitle(raw) {
  let t = String(raw || '')
    .replace(/<[^>]*>/g, '')
    .replace(/\*\*|__|~~|`/g, '')
    .replace(/^["'“”‘’«»\s]+|["'“”‘’«»\s]+$/g, '')
    .replace(/\s+/g, ' ')
    .replace(/[.,:;!?،؛۔…]+$/g, '')
    .trim();
  if (t.length > 60) t = t.slice(0, 57).trimEnd() + '…';
  return t.length >= 2 ? t : '';
}

function extractConvNameTag(text) {
  const m = CONV_NAME_TAG_RE.exec(text || '');
  return m ? cleanConvTitle(m[1]) : '';
}

/** Removes the hidden title tag (and an unfinished one at the very end). */
function stripConvNameTag(text) {
  if (!text) return text;
  return text
    .replace(new RegExp(CONV_NAME_TAG_RE.source, 'gi'), '')
    .replace(/<!--\s*@@[\s\S]*$/, '')
    .trimEnd();
}

/** Same, plus the first characters of a tag still arriving while streaming. */
function stripConvNameTagLive(text) {
  return text ? stripConvNameTag(text).replace(/<!?-{0,2}$/, '') : text;
}

/** Last-resort title: the first ~3 words of the first line of the reply. */
function titleFromFirstWords(replyText, count = 3) {
  if (!replyText) return '';
  const cleaned = String(replyText)
    .replace(/```[\s\S]*?```/g, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/^[-*>•]+\s+/gm, '')
    .replace(/\*\*|__|~~|`/g, '');
  const firstLine = cleaned.split(/\n+/).map(l => l.trim()).find(l => l.length > 0) || '';
  return cleanConvTitle(firstLine.split(/\s+/).slice(0, count).join(' '));
}

/** One place that turns any thrown error into the short message shown in chat. */
function friendlyErrorMessage(e, plugin) {
  if (e && e.userFacing) return e.message;
  const m = String(e?.message || '');
  if (/timeout|timed out/i.test(m)) return '⏱️ Request timed out. Check your internet connection.';
  if (/Failed to fetch|fetch/i.test(m)) return '🌐 Cannot connect to Local AI. Please check if the server is running at ' + (plugin?.settings?.baseUrl || '');
  return `⨉ Error: ${m || 'Unknown error'}`;
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
          const info = parseProviderError(errorText);
          const kind = classifyApiError(response.status, info);

          if (kind === 'auth') {
            const authErr = new AuthenticationError(`Authentication failed: ${response.status}`, url);
            authErr.providerMessage = info.message;
            throw authErr;
          }
          throw new ApiError({
            status: response.status,
            kind,
            providerMessage: info.message,
            retryAfter: parseRetryAfter(response.headers.get('retry-after')),
            model: modelFromRequest(url, options.body)
          });
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
          if (requestId && !wasUserAbort) {
            // Only clean up immediately for timeout-triggered aborts.
            // For user-initiated aborts we intentionally leave the entry in
            // the map so that the streaming catch block (which may run just
            // after this) can still find it and check entry.userAborted
            // before deciding whether to surface an error. The entry is
            // removed by BaseAIProvider.send()'s finally block once the
            // whole request/stream is fully settled.
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
          const delay = (error instanceof ApiError && error.retryAfter)
            ? Math.min(error.retryAfter * 1000, 30000)
            : this.calculateBackoff(attempt);
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
    
    if (error instanceof ApiError) return error.retryable;

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

  async handleStreamingResponse(response, onChunk, provider = 'local', abortCtx = null, onReasoning = null, toolOpts = null) {
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    const processor = this.chunkProcessors.get(provider) || this.processGenericChunk.bind(this);

    let accumulatedText = '';
    let buffer = '';
    // Accumulate usage data found in stream chunks (provider-specific last chunk)
    let streamUsage = null;
    let reasoningText = '';
    const takeReasoning = (line) => {
      const r = this._extractReasoning(line, provider);
      if (r) { reasoningText += r; if (onReasoning) onReasoning(r); }
    };
    // Tool calls are only collected when the request actually carried tools.
    const toolCollector = (toolOpts && toolOpts.enabled)
      ? new ToolCallCollector(provider === 'anthropic' ? 'anthropic' : 'openai')
      : null;

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

          takeReasoning(line);
          if (toolCollector) toolCollector.feed(line);

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

        takeReasoning(buffer);
        if (toolCollector) toolCollector.feed(buffer);

        const text = processor(buffer);
        if (text && text.trim().length > 0) {
          accumulatedText += text;
          onChunk(text);
        }
      }

      return {
        text: accumulatedText, usage: streamUsage, reasoning: reasoningText,
        ...(toolCollector ? toolCollector.result() : {})
      };
    } catch (error) {
      // If the stream was cut short because the user hit Stop, the reader's
      // abort surfaces here (mid-body), not in fetchWithRetry — the headers
      // had already arrived. Detect that via the abort-controller entry and
      // return what we've accumulated so far instead of throwing, so the
      // chat UI keeps the partial text and never shows an error for this.
      if (error.name === 'AbortError') {
        const networkManager = abortCtx?.networkManager;
        const requestId = abortCtx?.requestId;
        const entry = (networkManager && requestId)
          ? networkManager.abortControllers.get(requestId)
          : null;

        // Primary check: the map entry is still present and flagged as user-aborted.
        if (entry?.userAborted) {
          return { text: accumulatedText, usage: streamUsage, reasoning: reasoningText };
        }

        // Fallback for a race condition: the entry was already deleted from the
        // map (fetchWithRetry's catch ran first) before we got here, but
        // this is still a user-abort because fetchWithRetry would only delete
        // the entry on a timeout (non-user) abort — user-abort entries are now
        // intentionally kept alive until the finally block. If we reach here
        // with no entry and no requestId, there's no abort controller tracking
        // this request at all (e.g. it's a health/naming call), so treat any
        // AbortError as non-fatal and return accumulated text.
        if (!requestId || !networkManager) {
          return { text: accumulatedText, usage: streamUsage, reasoning: reasoningText };
        }

        // Entry was present but userAborted is false → this was a timeout abort
        // mid-stream, not a user stop. Fall through so callers see the error.
      }

      console.error('Streaming error:', error);
      throw new StreamingError('Stream interrupted: ' + error.message);
    }
  }

  /**
   * Pulls *reasoning* text (not the answer) out of one streaming line.
   *  - OpenAI-compatible servers (DeepSeek, Ollama, LM Studio, gateways):
   *      choices[0].delta.reasoning_content  |  delta.reasoning
   *  - Anthropic: content_block_delta with delta.type === "thinking_delta"
   */
  _extractReasoning(line, provider) {
    try {
      let jsonStr = line.trim();
      if (jsonStr.startsWith('data:')) jsonStr = jsonStr.slice(5).trim();
      if (!jsonStr || jsonStr === '[DONE]' || jsonStr[0] !== '{') return '';
      const parsed = JSON.parse(jsonStr);

      if (parsed.type === 'content_block_delta' && parsed.delta?.type === 'thinking_delta') {
        return parsed.delta.thinking || '';
      }
      const d = parsed.choices?.[0]?.delta;
      if (d) return d.reasoning_content || d.reasoning || '';
      if (parsed.message?.thinking) return parsed.message.thinking;      // Ollama native
    } catch (_) { /* not a JSON line */ }
    return '';
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
      const raw = line.startsWith('data:') ? line.slice(5).trim() : line;
      if (raw.startsWith('event:')) return '';
      const parsed = JSON.parse(raw);
      if (parsed.type === 'content_block_delta' && parsed.delta?.type === 'text_delta') {
        return parsed.delta.text || '';
      }
      if (parsed.type === 'content_block_delta' && parsed.delta?.text) {
        return parsed.delta.text;
      }
      return '';
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
      lastModified: Date.now(),
      // ── FIX 1: Draft persistence ──────────────────────────────────────────
      // The user's unsent text and pending attachment metadata are stored
      // directly on the session object so they survive layout refreshes,
      // panel toggles, and session switches. Each session carries its own
      // independent draft; switching sessions restores the right draft in the
      // input box automatically. Attachment content is NOT stored here (it is
      // large and transient); only the metadata (name, path, isImage, …) is
      // persisted so the pill-row can be rebuilt. The actual file data is
      // re-read from the vault on the next send (matching the existing flow).
      input: "",
      // pendingAttachmentsMeta stores lightweight descriptors for the pill
      // preview bar: { name, path, isImage, mimeType (images only) }.
      // Full content / dataUrl is intentionally omitted to keep save payloads
      // small; the content is re-read from the vault when the message is sent.
      pendingAttachmentsMeta: []
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
      lastModified: Date.now(),
      // ── FIX 1: Draft persistence (mirrors the regular-session fields) ─────
      input: "",
      pendingAttachmentsMeta: []
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
    if (this.onSessionRemoved) this.onSessionRemoved(id);
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
  
  // ── Context compression (FR-2.4) ───────────────────────────────────────────
  //
  // A summary is a field on the message it ends with: msg.summary = { text, count, createdAt }.
  // Requests then send the summary instead of that message and everything before it; the messages
  // stay in the conversation, so removing the field ("Undo") restores the full history exactly.
  // It lives on a node, so a branch that does not contain that message has no summary.

  /** Index of the newest message that carries a summary, or -1. */
  summaryCutoff(s = this.getActive()) {
    if (!s) return -1;
    for (let i = s.messages.length - 1; i >= 0; i--) if (s.messages[i].summary) return i;
    return -1;
  }

  /**
   * What the next summary would replace: everything after the current summary except the newest
   * COMPRESSION_KEEP_RECENT messages, ending on a reply so the verbatim part starts with the user.
   * Null when that is fewer than COMPRESSION_MIN_MESSAGES messages.
   */
  compressionPlan(s = this.getActive()) {
    if (!s) return null;
    const prev = this.summaryCutoff(s);
    const from = prev + 1;
    let to = s.messages.length - 1 - COMPRESSION_KEEP_RECENT;
    while (to >= from && s.messages[to + 1] && s.messages[to + 1].role !== 'user') to--;
    if (to - from + 1 < COMPRESSION_MIN_MESSAGES) return null;
    return { from, to, previous: prev >= 0 ? s.messages[prev].summary.text : '', node: s.messages[to] };
  }

  /** One summary per branch: a new one replaces (and already contains) the old. */
  setSummary(s, node, text) {
    if (s.messages.includes(node)) s.messages.forEach(m => { if (m !== node) delete m.summary; });
    node.summary = { text, count: s.messages.indexOf(node) + 1, createdAt: Date.now() };
    s.lastRequestTokens = null;
    s.lastModified = Date.now();
  }

  clearSummary(index, s = this.getActive()) {
    if (!s || !s.messages[index] || !s.messages[index].summary) return false;
    delete s.messages[index].summary;
    s.lastRequestTokens = null;
    s.lastModified = Date.now();
    return true;
  }

  // ── Conversation branching (FR-3.3) ────────────────────────────────────────
  //
  // Every message is a node: { id, parentId, seq, fork?, selChild?, …the usual message fields }.
  //
  //   session.messages       the ACTIVE branch, root → leaf. Everything that reads a conversation
  //                          (requests, token counts, naming, file operations, diff review, the
  //                          renderer) keeps reading this array and so only ever sees one branch.
  //   session.inactiveNodes  every other node: the other branches, and empty-branch markers.
  //                          Absent until a session is first branched, so conversations that never
  //                          branch are stored exactly as before.
  //   session.activeLeafId   set only while the active branch is an empty-branch marker (a branch
  //                          made with "Branch" that has no message yet).
  //
  // parentId is the truth: a path is the chain of parents, siblings are nodes with the same parent
  // (a missing parent = a root). seq orders siblings (older → newer). `fork` on a node says how it
  // became a sibling: 'edit' (an edited copy of a message) or 'branch' (a branch from a message);
  // it decides where the "‹ 2/3 ›" arrows are drawn. selChild remembers which child was last active
  // so switching back lands on the same leaf. Legacy conversations (no ids) become a parent chain
  // the first time they are branched.

  _newNodeId() {
    return 'm' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  _nextSeq(s) {
    s.seqCounter = (s.seqCounter || 0) + 1;
    return s.seqCounter;
  }

  /** Gives every message an id/parent/seq and makes the active branch a proper parent chain. Idempotent. */
  ensureTree(s) {
    if (!s) return;
    if (!s.inactiveNodes) s.inactiveNodes = [];
    let max = s.seqCounter || 0;
    for (const n of s.inactiveNodes) max = Math.max(max, n.seq || 0);
    for (const m of s.messages) max = Math.max(max, m.seq || 0);
    s.seqCounter = max;
    s.messages.forEach((m, i) => {
      if (!m.id) m.id = this._newNodeId();
      if (!m.seq) m.seq = this._nextSeq(s);
      m.parentId = i === 0 ? null : s.messages[i - 1].id;
    });
  }

  _allNodes(s) { return [...s.messages, ...(s.inactiveNodes || [])]; }

  /** Children of a node (or the roots for null), oldest first. Empty-branch markers included. */
  childrenOf(s, parentId) {
    const pid = parentId || null;
    return this._allNodes(s).filter(n => (n.parentId || null) === pid).sort((a, b) => (a.seq || 0) - (b.seq || 0));
  }

  /** The empty-branch marker the active branch currently ends in, or null. */
  _activePlaceholder(s) {
    if (!s || !s.activeLeafId || !s.inactiveNodes) return null;
    return s.inactiveNodes.find(n => n.id === s.activeLeafId && n.placeholder) || null;
  }

  /** Drops nodes whose parent chain no longer reaches the active branch or a root (after something was deleted). */
  _pruneOrphans(s) {
    if (!s.inactiveNodes || !s.inactiveNodes.length) return;
    const ok = new Set(s.messages.map(m => m.id));
    let grew = true;
    while (grew) {
      grew = false;
      for (const n of s.inactiveNodes) {
        if (!ok.has(n.id) && (!n.parentId || ok.has(n.parentId))) { ok.add(n.id); grew = true; }
      }
    }
    s.inactiveNodes = s.inactiveNodes.filter(n => ok.has(n.id));
    if (s.activeLeafId && !s.inactiveNodes.some(n => n.id === s.activeLeafId)) delete s.activeLeafId;
  }

  hasBranches(s = this.getActive()) {
    return !!s && !!s.inactiveNodes && s.inactiveNodes.length > 0;
  }

  /**
   * The "‹ n/total ›" controls to draw for the message at `index` of the active branch:
   *   at: 'message' — the message has edited siblings (arrows go below it)
   *   at: 'parent'  — the branches continue from this message (arrows go below it as well)
   * Either may be null; each is { pos, total, prevId, nextId } (ids are null at the ends).
   */
  forkInfo(index, s = this.getActive()) {
    const out = { sibling: null, continuation: null };
    if (!s || !s.inactiveNodes || !s.inactiveNodes.length) return out;
    const node = s.messages[index];
    if (!node || !node.id) return out;
    const describe = (list, current) => {
      const i = list.findIndex(n => n.id === current);
      if (i < 0 || list.length < 2) return null;
      return { pos: i + 1, total: list.length, prevId: i > 0 ? list[i - 1].id : null, nextId: i < list.length - 1 ? list[i + 1].id : null };
    };
    const kindOf = (list) => (list.reduce((a, b) => ((b.seq || 0) >= (a.seq || 0) ? b : a)).fork === 'edit' ? 'edit' : 'branch');

    const sibs = this.childrenOf(s, node.parentId);
    if (sibs.length > 1 && kindOf(sibs) === 'edit') out.sibling = describe(sibs, node.id);

    const kids = this.childrenOf(s, node.id);
    if (kids.length > 1 && kindOf(kids) === 'branch') {
      const next = s.messages[index + 1];
      const ph = this._activePlaceholder(s);
      const active = next ? next.id : (ph && ph.parentId === node.id ? ph.id : null);
      if (active) out.continuation = describe(kids, active);
    }
    return out;
  }

  /** Makes the branch through `nodeId` the active one (continuing down to the last-used leaf). */
  switchToBranch(nodeId) {
    const s = this.getActive();
    if (!s) return false;
    this.ensureTree(s);
    const byId = new Map(this._allNodes(s).map(n => [n.id, n]));
    const target = byId.get(nodeId);
    if (!target) return false;

    const path = [];
    for (let n = target; n; n = n.parentId ? byId.get(n.parentId) : null) path.unshift(n);
    // continue below the target: the child used last, else the newest
    let tip = target;
    for (;;) {
      const kids = this.childrenOf(s, tip.id);
      if (!kids.length) break;
      // the child used last; failing that the newest real message (an empty branch only if nothing else is there)
      tip = kids.find(k => k.id === tip.selChild) || [...kids].reverse().find(k => !k.placeholder) || kids[kids.length - 1];
      path.push(tip);
    }
    const marker = tip.placeholder ? path.pop() : null;
    const onPath = new Set(path.map(n => n.id));
    s.inactiveNodes = this._allNodes(s).filter(n => !onPath.has(n.id));
    s.messages = path;
    path.forEach((n, i) => { if (path[i + 1]) n.selChild = path[i + 1].id; else if (marker) n.selChild = marker.id; });
    if (marker) s.activeLeafId = marker.id; else delete s.activeLeafId;
    s.lastRequestTokens = null;
    s.lastModified = Date.now();
    return true;
  }

  /**
   * "Branch": a new branch that holds every message up to and including `index`, unchanged, and is
   * empty after that. What followed stays in the branch it was in. Returns the empty-branch marker.
   */
  createBranchFrom(index) {
    const s = this.getActive();
    if (!s || index < 0 || index >= s.messages.length) return null;
    this.ensureTree(s);
    const node = s.messages[index];
    const existing = s.inactiveNodes.find(n => n.placeholder && n.parentId === node.id);
    if (existing) { this.switchToBranch(existing.id); return existing; }
    s.inactiveNodes.push(...s.messages.splice(index + 1));
    const marker = { id: this._newNodeId(), parentId: node.id, seq: this._nextSeq(s), fork: 'branch', placeholder: true };
    s.inactiveNodes.push(marker);
    node.selChild = marker.id;
    s.activeLeafId = marker.id;
    s.lastRequestTokens = null;
    s.lastModified = Date.now();
    return marker;
  }

  /** Whether "Branch" would create something: not on the last message of a branch with nothing else after it. */
  canBranchFrom(index, s = this.getActive()) {
    if (!s || index < 0 || index >= s.messages.length) return false;
    if (index < s.messages.length - 1) return true;
    const node = s.messages[index];
    if (!node.id || !s.inactiveNodes) return false;
    return s.inactiveNodes.some(n => n.parentId === node.id && !(n.placeholder && n.id === s.activeLeafId));
  }

  /** Removes the last message of the active branch (and anything hanging below it). */
  removeLastMessage() {
    const s = this.getActive();
    if (!s || !s.messages.length) return false;
    s.messages.pop();
    this._pruneOrphans(s);
    s.lastRequestTokens = null;
    s.lastModified = Date.now();
    return true;
  }

  /**
   * Removes the messages of the active branch that match `pred` (diff summaries). Branches that
   * started below a removed message are re-attached to its parent instead of being lost.
   */
  removeMessagesWhere(pred) {
    const s = this.getActive();
    if (!s) return;
    const doomed = s.messages.filter(pred);
    if (!doomed.length) return;
    if (this.hasBranches(s)) {
      this.ensureTree(s);
      for (const d of doomed) {
        for (const n of s.inactiveNodes) if (n.parentId === d.id) n.parentId = d.parentId || null;
      }
    }
    s.messages = s.messages.filter(m => !pred(m));
    if (this.hasBranches(s)) this.ensureTree(s);
    s.lastModified = Date.now();
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
    
    const msg = { 
      role, 
      content,
      attachments: attachments || [],
      timestamp: Date.now(),
      ...meta
    };
    // A session that has branches keeps its tree in step; any other session is stored exactly as before.
    if (this.hasBranches(s)) {
      this.ensureTree(s);
      const marker = this._activePlaceholder(s);
      const last = s.messages[s.messages.length - 1];
      msg.id = this._newNodeId();
      msg.seq = this._nextSeq(s);
      if (marker) {
        // the first message of an empty branch takes the marker's place
        msg.parentId = marker.parentId;
        msg.fork = 'branch';
        s.inactiveNodes = s.inactiveNodes.filter(n => n.id !== marker.id);
        delete s.activeLeafId;
      } else {
        msg.parentId = last ? last.id : null;
      }
      const parent = s.messages.find(m => m.id === msg.parentId);
      if (parent) parent.selChild = msg.id;
    }
    s.messages.push(msg);
    
    s.lastModified = Date.now();
    return msg;
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
  /** Removes the message at `index` and everything after it. */
  truncateFrom(index) {
    const s = this.getActive();
    if (!s || index < 0 || index >= s.messages.length) return false;
    s.messages.length = index;
    this._pruneOrphans(s);
    s.lastRequestTokens = null;
    s.lastModified = Date.now();
    return true;
  }

  /**
   * Edits a user message. mode 'overwrite' (the original behaviour) replaces it and deletes
   * everything after it, other branches below it included. mode 'branch' leaves the old message and
   * what followed it in place as a branch and continues from an edited copy.
   */
  editUserMessage(index, newContent, newAttachments, mode = 'overwrite') {
    const s = this.getActive();
    if (!s) return false;
    if (index < 0 || index >= s.messages.length) return false;
    if (s.messages[index].role !== 'user') return false;

    if (mode === 'branch') {
      this.ensureTree(s);
      const old = s.messages[index];
      s.inactiveNodes.push(...s.messages.splice(index));          // the old message and everything after it
      const edited = {
        role: 'user', content: newContent,
        attachments: newAttachments !== undefined ? newAttachments : (old.attachments || []),
        timestamp: Date.now(),
        id: this._newNodeId(), parentId: old.parentId || null, seq: this._nextSeq(s), fork: 'edit'
      };
      s.messages.push(edited);
      const parent = s.messages[index - 1];
      if (parent) parent.selChild = edited.id;
      delete s.activeLeafId;
      s.lastRequestTokens = null;
      s.lastModified = Date.now();
      return true;
    }

    s.messages[index].content = newContent;
    if (newAttachments !== undefined) {
      s.messages[index].attachments = newAttachments;
    }
    s.messages[index].timestamp = Date.now();
    // The old measurement belonged to the old text/attachments. Remove it so
    // the message is re-measured when the new reply arrives (until then it is
    // counted with a local estimate).
    delete s.messages[index].tokens;
    delete s.messages[index].tokensEstimated;
    // Drop every message after the edited one — the "future" context. Their
    // token counts disappear with them, because the session total is always
    // derived from the messages that remain.
    s.messages.length = index + 1;
    delete s.messages[index].selChild;
    this._pruneOrphans(s);
    s.lastRequestTokens = null;
    s.lastModified = Date.now();
    return true;
  }

  // ── Per-message token accounting ───────────────────────────────────────
  //
  // Every stored message carries its own `tokens` value (and `tokensEstimated`
  // when that value is a local guess instead of an API-reported number). The
  // conversation total is simply the sum over the messages that still exist,
  // so editing, truncating or deleting messages automatically gives a correct
  // total — nothing has to be "subtracted" afterwards.

  /** Tokens for one message: measured value if known, otherwise a local estimate. */
  messageTokens(msg) {
    if (!msg) return 0;
    if (typeof msg.tokens === 'number') return { tokens: msg.tokens, estimated: !!msg.tokensEstimated };
    let text = typeof msg.content === 'string' ? msg.content : '';
    (msg.attachments || []).forEach(a => {
      if (a && !a.isImage && typeof a.content === 'string') text += a.content;
    });
    return { tokens: estimateTokens(text), estimated: true };
  }

  /**
   * Sum of the tokens of the first `limit` messages of a session
   * (all messages when `limit` is omitted).
   * @returns {{ total: number, estimated: boolean }}
   */
  getSessionTokens(session = this.getActive(), limit = null) {
    if (!session) return { total: 0, estimated: false };
    const msgs = limit === null ? session.messages : session.messages.slice(0, limit);
    let total = 0, estimated = false;
    msgs.forEach(m => {
      const r = this.messageTokens(m);
      total += r.tokens;
      if (r.estimated) estimated = true;
    });
    return { total, estimated };
  }

  /** Start collecting API usage for one user→assistant turn of a session. */
  beginTurn(sessionId) {
    if (!this._turns) this._turns = new Map();
    this._turns.set(sessionId, { calls: 0, firstInput: null, input: 0, output: 0, estimated: false });
  }

  /** Called for every API response belonging to the running turn. */
  recordTurnUsage(sessionId, usage) {
    const turn = this._turns?.get(sessionId);
    if (!turn || !usage) return;
    if (turn.firstInput === null) turn.firstInput = usage.inputTokens || 0;
    turn.input  += usage.inputTokens  || 0;
    turn.output += usage.outputTokens || 0;
    if (usage.estimated) turn.estimated = true;
    turn.calls++;
  }

  /**
   * Store the measured cost of an "✏ Edit instruction" turn on its user message:
   * every request of the pipeline (one or more per file, retries included) counts —
   * prompt with the file contents, plus everything the model wrote.
   */
  applyEditTurnTokens(sessionId, msg) {
    const turn = this._turns?.get(sessionId);
    this._turns?.delete(sessionId);
    if (!turn || !msg || turn.calls === 0) return;
    msg.tokens = turn.input + turn.output;
    msg.tokensEstimated = turn.estimated;
  }

  /** Forget the running turn (request failed or was cancelled). */
  discardTurn(sessionId) {
    this._turns?.delete(sessionId);
  }

  /**
   * Store the measured tokens on the two messages that make up a finished turn.
   * Call right after the assistant reply was added with addMessage().
   *
   *  assistant.tokens = everything the model generated during the turn
   *  user.tokens      = prompt size of the turn's first request, minus the
   *                     tokens of the earlier messages that were part of that
   *                     same request (i.e. only what this message added)
   */
  applyTurnTokens(session, sessionId) {
    const turn = this._turns?.get(sessionId);
    this._turns?.delete(sessionId);
    if (!session || session.id !== sessionId || !turn || turn.calls === 0) return;

    const msgs = session.messages;
    const asst = msgs[msgs.length - 1];
    const userIdx = msgs.length - 2;
    const user = msgs[userIdx];
    if (!asst || asst.role !== 'assistant') return;

    asst.tokens = turn.output;
    asst.tokensEstimated = turn.estimated;

    if (user && user.role === 'user') {
      // Messages that were sent together with this user message.
      const from = Math.max(0, userIdx - (REQUEST_WINDOW_MESSAGES - 1));
      let prior = 0;
      for (let i = from; i < userIdx; i++) {
        const m = msgs[i];
        // An edit turn's measured total includes file contents that are not part of the chat context
        prior += (m && m.inEditTurn) ? estimateTokens(typeof m.content === 'string' ? m.content : '') : this.messageTokens(m).tokens;
      }
      user.tokens = Math.max(0, (turn.firstInput || 0) - prior);
      user.tokensEstimated = turn.estimated;
    }
  }

  /**
   * Get messages formatted for API request
   * @param {number} maxMessages - Maximum number of recent messages to include
   * @returns {Array} Formatted messages
   */
  getMessagesForRequest(maxMessages = REQUEST_WINDOW_MESSAGES) {
    const s = this.getActive();
    if (!s) return [];
    
    const out = [];
    
    // System layers (soul, Role, …) — each one its own message, in the order defined by PromptAssembler
    if (this.promptAssembler) {
      this.promptAssembler.baseLayers(s).forEach(l => out.push({ role: 'system', content: l.content }));
    } else if (s.systemPrompt && s.systemPrompt.trim()) {
      out.push({ role: "system", content: s.systemPrompt });
    }
    
    // Get recent messages — after a summary, only those that come after the summarized part
    let recent = s.messages.slice(-maxMessages);
    const cut = this.summaryCutoff(s);
    if (cut >= 0) {
      const after = s.messages.length - 1 - cut;
      recent = s.messages.slice(Math.max(s.messages.length - maxMessages, cut + 1));
      out.push({
        role: 'system',
        content: `Summary of the earlier part of this conversation (its first ${cut + 1} messages are not repeated; the ${after} messages after this summary are verbatim):\n${s.messages[cut].summary.text}`
      });
    }
    
    // Format messages with attachments
    const formattedMessages = recent.map(msg => {
      const hasImages = msg.attachments?.some(a => a.isImage);
      // hasFiles: any non-image attachment, regardless of scope (content may be null for metadata-only)
      const hasFiles  = msg.attachments?.some(a => !a.isImage && (a.content || a.metadata || a.name));

      /**
       * Serialises a single non-image file attachment into a text block that
       * is appended to the message content sent to the AI.
       *
       * Scope rules (file name is always shown):
       *  'full'     → metadata (if present) + body
       *  'body'     → body only
       *  'metadata' → metadata only (no body)
       */
      const serializeFileAttachment = (a) => {
        const scope = a.scope || 'full';
        let block = `\n\n[Attached file: ${a.name}]`;
        
        // Include frontmatter metadata when scope is 'metadata'
        if (scope === 'metadata') {
          const metaLines = Object.entries(a.metadata)
            .map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(', ') : v}`)
            .join('\n');
          block += `\n[Metadata]\n---\n${metaLines}\n---`;
        }
        // Include body when scope is 'body'
        if (scope === 'body') {
          const body = a.content.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, '');
          block += `\n[Content]\n${body}`;
        }
        // Include everything when scope is 'full'
        if (scope !== 'body' && scope !== 'metadata') {
          block = `\n\n[File content: ${a.name}]\n${a.content}`;
        }
        return block;
      };

      // If there are images, build a multipart content array (OpenAI/Anthropic/Gemini style)
      if (hasImages) {
        const parts = [];

        // Text portion (message + any file attachments)
        let textContent = msg.content;
        if (hasFiles) {
          msg.attachments.filter(a => !a.isImage).forEach(a => {
            textContent += serializeFileAttachment(a);
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

      // No images — plain text (original behaviour, now scope-aware)
      let fullContent = msg.content;
      if (hasFiles) {
        msg.attachments.filter(a => !a.isImage).forEach(a => {
          fullContent += serializeFileAttachment(a);
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
      delete s.inactiveNodes;
      delete s.activeLeafId;
      delete s.planState;
      s.lastModified = Date.now();
      if (this.onSessionRemoved) this.onSessionRemoved(s.id);     // nothing left to search in it
    }
  }

  // ── FIX 1: Draft persistence helpers ───────────────────────────────────────
  //
  // saveDraft() and loadDraft() are the single integration points for draft
  // auto-save. ChatView calls saveDraft() on every input event and after every
  // attachment change, then calls loadDraft() whenever the active session
  // changes (switchTo, create, refreshLayout). Because the draft lives on the
  // session object it is automatically persisted with plugin.saveState() and
  // never leaks across sessions (Fix 3 synergy).

  /**
   * Persist the current input text and attachment metadata to the active
   * session object. Called continuously as the user types or attaches files.
   *
   * @param {string}   inputText          – current value of the input textarea
   * @param {Array}    pendingAttachments  – the full pendingAttachments array;
   *   only lightweight metadata (name, path, isImage, mimeType) is stored,
   *   NOT the file content / dataUrl, to keep the save payload small.
   */
  saveDraft(inputText, pendingAttachments = [], sessionId = null) {
    const s = sessionId ? this.getSession(sessionId) : this.getActive();
    if (!s) return;
    s.input = inputText || '';
    // Store only the metadata needed to rebuild the pill-preview bar.
    // Content is intentionally omitted — it is re-read from the vault on send.
    s.pendingAttachmentsMeta = (pendingAttachments || []).map(a => ({
      name:     a.name,
      path:     a.path     || null,
      isImage:  !!a.isImage,
      mimeType: a.mimeType || null,
      // dataUrl and content are deliberately excluded to keep the stored
      // session object lightweight; they are re-read from the vault on send.
      scope:    a.scope    || 'full'
    }));
  }

  /**
   * Load the saved draft for the currently active session.
   *
   * @returns {{ input: string, pendingAttachmentsMeta: Array }}
   *   input                – saved text to restore to the textarea
   *   pendingAttachmentsMeta – saved attachment metadata for the pill bar
   */
  loadDraft() {
    const s = this.getActive();
    if (!s) return { input: '', pendingAttachmentsMeta: [] };
    return {
      input:                 s.input                 || '',
      pendingAttachmentsMeta: s.pendingAttachmentsMeta || []
    };
  }

  /**
   * Clear the draft for the active session (called after a message is sent
   * so the input box starts empty for the next message).
   */
  clearDraft() {
    const s = this.getActive();
    if (!s) return;
    s.input = '';
    s.pendingAttachmentsMeta = [];
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
      messages: original.messages.map(m => ({ ...m })),
      ...(original.inactiveNodes ? { inactiveNodes: original.inactiveNodes.map(n => ({ ...n })) } : {}),
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

    // Branches of either conversation come along; the active branch becomes one chain again.
    if (source.inactiveNodes && source.inactiveNodes.length) {
      target.inactiveNodes = [...(target.inactiveNodes || []), ...source.inactiveNodes];
    }
    if (target.inactiveNodes && target.inactiveNodes.length) this.ensureTree(target);
    
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
 *  Gemini   → usageMetadata.promptTokenCount / candidatesTokenCount / thoughtsTokenCount /
 *             toolUsePromptTokenCount / totalTokenCount
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
    // Gemini reports the model's "thinking" tokens in their own field (thoughtsTokenCount) and the
    // tokens of tool results such as Google Search in another (toolUsePromptTokenCount). Both are
    // billed and are part of totalTokenCount, so they must be counted — thinking as output,
    // tool results as input.
    const inputTokens = (m.promptTokenCount ?? 0) + (m.toolUsePromptTokenCount ?? 0);
    let outputTokens  = (m.candidatesTokenCount ?? 0) + (m.thoughtsTokenCount ?? 0);
    // The API's own total is the source of truth: if the parts do not add up to it, the
    // difference is output the API did not itemise.
    if (m.totalTokenCount !== undefined && inputTokens + outputTokens !== m.totalTokenCount) {
      outputTokens = Math.max(0, m.totalTokenCount - inputTokens);
    }
    const totalTokens = m.totalTokenCount ?? (inputTokens + outputTokens);
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

// ==================== TOOL CALLING: NEUTRAL FORMAT & PROVIDER SERIALIZERS ====================
//
// While an agent turn runs, the loop keeps its working conversation in a provider-neutral shape:
//   assistant turn with tool calls : { role:'assistant', content, toolCalls:[{ id, name, args, parseError? }], raw? }
//   tool result                    : { role:'tool', toolCallId, name, content, isError }
// `raw` is the provider's own copy of the assistant turn (Anthropic content blocks incl. signed
// thinking, Gemini parts incl. thought signatures). Those must be sent back unchanged on the
// next step, so each serializer below prefers `raw` when it was produced by the same provider.
// Messages without these fields pass through every serializer untouched.

/** Parses a tool-call argument payload (JSON text or an already-parsed object). */
function parseToolArguments(raw) {
  if (raw === undefined || raw === null || raw === '') return { args: {} };
  if (typeof raw === 'object') return Array.isArray(raw) ? { args: {}, parseError: 'Arguments must be a JSON object.' } : { args: raw };
  try {
    const v = JSON.parse(raw);
    if (v && typeof v === 'object' && !Array.isArray(v)) return { args: v };
    return { args: {}, parseError: 'Arguments must be a JSON object.' };
  } catch (_) {
    return { args: null, parseError: 'Arguments were not valid JSON.' };
  }
}

function newToolCallId(prefix = 'call') {
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

/** Text of one system message (a string, or the text parts of a multipart one). */
function systemMessageText(m) {
  return Array.isArray(m.content) ? m.content.map(p => p.text || '').join('') : (m.content || '');
}

/** Texts of every system message, in order, empty ones dropped — one entry per prompt layer. */
function systemLayerTexts(messages) {
  return messages.filter(m => m.role === 'system').map(systemMessageText).filter(t => t && t.trim());
}

/**
 * For servers whose chat templates accept a single system message (most local and custom
 * endpoints): all layers become one system message, in order, separated by blank lines.
 */
function mergeSystemMessages(messages) {
  const texts = systemLayerTexts(messages);
  if (messages.filter(m => m.role === 'system').length < 2) return messages;
  const out = [];
  let placed = false;
  for (const m of messages) {
    if (m.role !== 'system') { out.push(m); continue; }
    if (!placed) { placed = true; if (texts.length) out.push({ role: 'system', content: texts.join('\n\n') }); }
  }
  return out;
}

/** OpenAI-style (OpenAI, local servers, custom endpoints) messages. */
function toOpenAIMessages(messages) {
  return messages.map(m => {
    if (m.role === 'assistant' && Array.isArray(m.toolCalls) && m.toolCalls.length) {
      return {
        role: 'assistant',
        content: m.content || '',
        tool_calls: m.toolCalls.map(tc => ({
          id: tc.id, type: 'function',
          function: { name: tc.name, arguments: JSON.stringify(tc.args || {}) }
        }))
      };
    }
    if (m.role === 'tool') return { role: 'tool', tool_call_id: m.toolCallId, content: m.content };
    return m;
  });
}

/** tool_calls found in an OpenAI-style (or Ollama-native) response message. */
function extractOpenAIToolCalls(message) {
  const list = message && Array.isArray(message.tool_calls) ? message.tool_calls : [];
  return list.map(t => {
    const fn = t.function || t;
    return fn && fn.name ? { id: t.id || newToolCallId(), name: fn.name, ...parseToolArguments(fn.arguments) } : null;
  }).filter(Boolean);
}

function toolDefsToOpenAI(tools) {
  return tools.map(t => ({ type: 'function', function: { name: t.name, description: t.description, parameters: t.parameters } }));
}

function toolDefsToAnthropic(tools) {
  return tools.map(t => ({ name: t.name, description: t.description, input_schema: t.parameters }));
}

/** Gemini accepts an OpenAPI subset of JSON Schema: drop what it rejects, map oneOf to anyOf. */
function toGeminiSchema(schema) {
  if (!schema || typeof schema !== 'object') return schema;
  const KEEP = ['type', 'format', 'title', 'description', 'nullable', 'enum', 'required', 'minItems', 'maxItems',
                'minimum', 'maximum', 'minLength', 'maxLength', 'pattern', 'default'];
  const out = {};
  for (const [k, v] of Object.entries(schema)) {
    if (KEEP.includes(k)) out[k] = v;
    else if (k === 'properties' && v && typeof v === 'object') {
      out.properties = {};
      for (const [pk, pv] of Object.entries(v)) out.properties[pk] = toGeminiSchema(pv);
    }
    else if (k === 'items') out.items = toGeminiSchema(v);
    else if ((k === 'anyOf' || k === 'oneOf') && Array.isArray(v)) out.anyOf = v.map(toGeminiSchema);
  }
  if (Array.isArray(out.type)) {
    const real = out.type.filter(t => t !== 'null');
    if (out.type.includes('null')) out.nullable = true;
    out.type = real[0] || 'string';
  }
  return out;
}

function toolDefsToGemini(tools) {
  return [{
    functionDeclarations: tools.map(t => {
      const decl = { name: t.name, description: t.description };
      // Gemini rejects an OBJECT schema with no properties, so a tool without parameters omits it.
      if (t.parameters && t.parameters.properties && Object.keys(t.parameters.properties).length) {
        decl.parameters = toGeminiSchema(t.parameters);
      }
      return decl;
    })
  }];
}

/** Anthropic messages (system messages are handled by the caller). */
function toAnthropicMessages(messages, normalizeContent) {
  const out = [];
  for (const m of messages) {
    if (m.role === 'system') continue;
    if (m.role === 'tool') {
      const block = { type: 'tool_result', tool_use_id: m.toolCallId, content: m.content || '' };
      if (m.isError) block.is_error = true;
      const last = out[out.length - 1];
      if (last && last._toolResults) last.content.push(block);          // results of one step share one user turn
      else out.push({ role: 'user', content: [block], _toolResults: true });
      continue;
    }
    if (m.role === 'assistant' && Array.isArray(m.toolCalls) && m.toolCalls.length) {
      let content;
      if (m.raw && m.raw.provider === 'anthropic' && Array.isArray(m.raw.blocks)) {
        content = m.raw.blocks;
      } else {
        content = [];
        if (m.content) content.push({ type: 'text', text: m.content });
        m.toolCalls.forEach(tc => content.push({ type: 'tool_use', id: tc.id, name: tc.name, input: tc.args || {} }));
      }
      out.push({ role: 'assistant', content });
      continue;
    }
    out.push({ role: m.role, content: normalizeContent(m) });
  }
  return out.map(({ _toolResults, ...rest }) => rest);
}

/**
 * Collects tool calls from a streaming response, line by line, next to (not inside) the text
 * processors. Only created when the request actually carried tools, so ordinary chats pay nothing.
 *   'openai'    – OpenAI-style deltas (OpenAI, local servers, custom), plus Ollama's native message form
 *   'anthropic' – content_block_* events; the finished content blocks are kept for replay
 */
class ToolCallCollector {
  constructor(format) {
    this.format = format;
    this.slots = [];      // openai: [{ id, name, args, argsObj }]
    this.blocks = [];     // anthropic: content blocks by index
  }

  feed(line) {
    let s = line.trim();
    if (s.startsWith('data:')) s = s.slice(5).trim();
    if (!s || s === '[DONE]' || s[0] !== '{') return;
    let p;
    try { p = JSON.parse(s); } catch (_) { return; }
    if (this.format === 'anthropic') this._feedAnthropic(p); else this._feedOpenAI(p);
  }

  _feedOpenAI(p) {
    const choice = p.choices && p.choices[0];
    const list = (choice && choice.delta && choice.delta.tool_calls)
              || (choice && choice.message && choice.message.tool_calls)
              || (p.message && p.message.tool_calls);
    if (!Array.isArray(list)) return;
    for (const t of list) {
      const fn = t.function || {};
      let i = typeof t.index === 'number' ? t.index : (t.id ? this.slots.length : Math.max(0, this.slots.length - 1));
      if (!this.slots[i]) this.slots[i] = { id: '', name: '', args: '', argsObj: null };
      const slot = this.slots[i];
      if (t.id && !slot.id) slot.id = t.id;
      if (fn.name && !slot.name) slot.name = fn.name;
      if (typeof fn.arguments === 'string') slot.args += fn.arguments;
      else if (fn.arguments && typeof fn.arguments === 'object') slot.argsObj = fn.arguments;
    }
  }

  _feedAnthropic(p) {
    if (p.type === 'content_block_start' && p.content_block) {
      const b = { ...p.content_block };
      if (b.type === 'tool_use' || b.type === 'server_tool_use') b._json = '';
      if (b.type === 'thinking') { b.thinking = b.thinking || ''; b.signature = b.signature || ''; }
      if (b.type === 'text') b.text = b.text || '';
      this.blocks[p.index] = b;
    } else if (p.type === 'content_block_delta' && this.blocks[p.index]) {
      const b = this.blocks[p.index], d = p.delta || {};
      if (d.type === 'text_delta') b.text = (b.text || '') + (d.text || '');
      else if (d.type === 'thinking_delta') b.thinking = (b.thinking || '') + (d.thinking || '');
      else if (d.type === 'signature_delta') b.signature = (b.signature || '') + (d.signature || '');
      else if (d.type === 'input_json_delta') b._json = (b._json || '') + (d.partial_json || '');
      else if (d.type === 'citations_delta' && d.citation) b.citations = [...(b.citations || []), d.citation];
    }
  }

  /** @returns {{ toolCalls: Array, raw?: Object }} */
  result() {
    if (this.format === 'anthropic') {
      const toolCalls = [];
      const blocks = [];
      for (const b of this.blocks) {
        if (!b) continue;
        const { _json, ...clean } = b;
        if (b.type === 'tool_use' || b.type === 'server_tool_use') {
          const parsed = parseToolArguments(_json);
          clean.input = parsed.args || {};
          if (b.type === 'tool_use') toolCalls.push({ id: b.id, name: b.name, ...parsed });
        }
        if (clean.type === 'text' && !clean.text) continue;      // the API rejects empty text blocks
        blocks.push(clean);
      }
      return { toolCalls, raw: toolCalls.length ? { provider: 'anthropic', blocks } : undefined, ...anthropicSearchInfo(blocks) };
    }
    const toolCalls = this.slots.filter(s => s && s.name).map(s => ({
      id: s.id || newToolCallId(), name: s.name, ...parseToolArguments(s.argsObj ?? s.args)
    }));
    return { toolCalls };
  }
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

  /** Whether this provider can be given tool definitions (native function calling). */
  supportsTools() {
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

  _userError(message, kind = 'unknown') {
    const err = new Error(message);
    err.userFacing = true;
    err.kind = kind;
    return err;
  }

  _providerSaid(msg) {
    const clean = String(msg || '').replace(/\s+/g, ' ').trim();
    return clean ? `\nProvider said: "${clean.slice(0, 220)}"` : '';
  }

  _describeApiError(e) {
    const p = this.name === 'LocalAI' ? 'Local AI' : this.name;
    const model = e.model ? `"${e.model}"` : 'the selected model';
    const said = this._providerSaid(e.providerMessage);
    switch (e.kind) {
      case 'model_unavailable': return `🤖 ${p} can't use ${model} — it may have been retired, renamed, or your key has no access to it. Choose another model in Settings.${said}`;
      case 'rate_limit':        return `⏳ ${p} is rate-limiting requests${e.retryAfter ? ` — wait about ${e.retryAfter}s` : ''} and try again.${said}`;
      case 'quota':             return `💳 ${p}: your quota or credit balance is used up. Check your plan and billing.${said}`;
      case 'context_too_long':  return `📏 The conversation is too long for ${model}. Start a new chat or shorten the history.${said}`;
      case 'tool_unsupported':  return `🧰 ${p} does not accept tools for ${model}.${said}`;
      case 'server':            return `🛠️ ${p} is having trouble right now (HTTP ${e.status}). Try again in a moment.${said}`;
      case 'endpoint':          return `🔍 ${p} endpoint not found (HTTP 404). Check the URL in Settings.${said}`;
      case 'bad_request':       return `⚠️ ${p} rejected the request (HTTP ${e.status}).${said}`;
      default:                  return `⨉ ${p} error (HTTP ${e.status}).${said}`;
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
      { networkManager: this.networkManager, requestId },
      opts.onReasoning || null,
      { enabled: !!((payload.tools && payload.tools.length) || payload.builtinSearch) }
    );

    // handleStreamingResponse now returns { text, usage, reasoning }
    const accumulatedText = typeof streamResult === 'string' ? streamResult : streamResult.text;
    const streamedReasoning = (typeof streamResult === 'object' && streamResult.reasoning) ? streamResult.reasoning : '';
    let usage = (typeof streamResult === 'object' && streamResult.usage) ? streamResult.usage : null;

    // Fallback: if the service didn't report token usage, estimate locally
    if (!usage || usage.totalTokens === 0) {
      usage = estimateUsageLocally(payload.messages, accumulatedText);
      if (usage) usage.estimated = true;
    }

    if (usage && payload.model) usage.model = payload.model;
    if (usage && opts.onUsage) {
      opts.onUsage(usage);
    }

    const toolCalls = (typeof streamResult === 'object' && streamResult.toolCalls && streamResult.toolCalls.length)
      ? streamResult.toolCalls : undefined;
    return {
      final: accumulatedText, usage, reasoning: streamedReasoning, toolCalls, raw: toolCalls ? streamResult.raw : undefined,
      ...(streamResult && streamResult.sources && streamResult.sources.length ? { sources: streamResult.sources } : {}),
      ...(streamResult && streamResult.searchError ? { searchError: streamResult.searchError } : {})
    };
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

      if (usage && payload.model) usage.model = payload.model;
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
    // Raw AbortError = timeout controller fired (not user-stop). Treat as
    // silent non-result so naming / health calls don't produce console noise.
    if (error && error.name === 'AbortError') {
      return { final: '', aborted: true };
    }

    // A refusal of tool definitions is handled silently by the agent loop (it retries without tools).
    if (!(error instanceof ApiError && error.kind === 'tool_unsupported')) console.error(`${this.name} error:`, error);

    if (error instanceof ApiError) {
      throw this._userError(this._describeApiError(error), error.kind);
    }

    if (error instanceof AuthenticationError) {
      throw this._userError(`🔐 ${this.name} authentication failed. Please check your API key in settings.${this._providerSaid(error.providerMessage)}`, 'auth');
    }

    if (error instanceof RateLimitError) {
      throw this._userError(`⏳ ${this.name} rate limit exceeded. Please wait ${error.retryAfter} seconds and try again.`, 'rate_limit');
    }

    if (error instanceof NetworkError) {
      if (error.statusCode === 0) {
        throw this._userError(`🌐 Cannot connect to ${this.name}. Please check if the service is running and accessible.`, 'network');
      }
      throw this._userError(`🌐 ${this.name} network error (${error.statusCode}): ${error.message}`, 'network');
    }

    if (error instanceof TimeoutError) {
      throw this._userError(`⏱️ ${this.name} request timed out. The service might be slow or unresponsive.`, 'timeout');
    }

    if (error instanceof StreamingError) {
      throw this._userError(`📡 Streaming error with ${this.name}: ${error.message}`, 'stream');
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
      messages: toOpenAIMessages(mergeSystemMessages(payload.messages)),
      // Use ?? instead of || so that an explicit 0 (e.g. temperature: 0 for the
      // intent classifier) is not treated as falsy and replaced by the user's setting.
      temperature: payload.temperature ?? this.plugin.settings.temperature,
      max_tokens: payload.max_tokens ?? this.plugin.settings.max_tokens,
      stream: payload.stream ?? false
    };
    if (payload.tools && payload.tools.length) {
      body.tools = toolDefsToOpenAI(payload.tools);
      if (payload.toolChoice === 'none') body.tool_choice = 'none';
    }

    return JSON.stringify(body);
  }

  parseResponse(data) {
    const usage = extractUsageFromResponse(data);
    if (data.choices && data.choices[0]) {
      if (data.choices[0].message) {
        const toolCalls = extractOpenAIToolCalls(data.choices[0].message);
        if (toolCalls.length) return { final: data.choices[0].message.content || '', usage, toolCalls };
        return { final: data.choices[0].message.content, usage };
      }
      if (data.choices[0].text) {
        return { final: data.choices[0].text, usage };
      }
    }
    
    if (data.message) {
      const toolCalls = extractOpenAIToolCalls(data.message);      // Ollama's native /api/chat shape
      if (toolCalls.length) return { final: data.message.content || '', usage, toolCalls };
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
    const messages = toOpenAIMessages(payload.messages).map(msg => {
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
      temperature: payload.temperature ?? this.plugin.settings.temperature,
      max_completion_tokens: payload.max_tokens ?? this.plugin.settings.max_tokens
    };

    if (payload.stream) {
      body.stream = true;
    }
    if (payload.tools && payload.tools.length) {
      body.tools = toolDefsToOpenAI(payload.tools);
      if (payload.toolChoice === 'none') body.tool_choice = 'none';
    }

    // Streaming responses only include the real token usage when it is requested.
    // Official endpoint only: other OpenAI-compatible servers may reject the field.
    const _ep = (this.plugin.settings.openaiEndpoint || '').trim();
    if (body.stream && (!_ep || /^https:\/\/api\.openai\.com\//i.test(_ep))) body.stream_options = { include_usage: true };

    const effort = this.plugin.getReasoningEffort('openai', body.model);
    if (effort) body.reasoning_effort = effort;

    return JSON.stringify(body);
  }

  parseResponse(data) {
    const usage = extractUsageFromResponse(data);
    if (data.choices && data.choices[0] && data.choices[0].message) {
      const msg = data.choices[0].message;
      const toolCalls = extractOpenAIToolCalls(msg);
      return { final: msg.content || (toolCalls.length ? '' : msg.content), usage, reasoning: msg.reasoning_content || msg.reasoning || '', ...(toolCalls.length ? { toolCalls } : {}) };
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
    const modelName = payload.model || this.plugin.settings.geminiModel || "gemini-1.5-flash";

    const generationConfig = {
      temperature: payload.temperature ?? this.plugin.settings.temperature,
      maxOutputTokens: payload.max_tokens ?? this.plugin.settings.max_tokens,
      topP: 0.8,
      topK: 40
    };
    const effort = this.plugin.getReasoningEffort('gemini', modelName);
    if (effort) {
      generationConfig.thinkingConfig = { thinkingLevel: effort };
      if (this.plugin.settings.showReasoning !== false) generationConfig.thinkingConfig.includeThoughts = true;
    }

    const body = { contents: contents, generationConfig };
    if (payload.builtinSearch) {
      // Google Search cannot share a request with function declarations (Gemini 3+ can, as a preview
      // through another API), so a search request carries the search tool alone.
      body.tools = [{ google_search: {} }];
    } else if (payload.tools && payload.tools.length) {
      body.tools = toolDefsToGemini(payload.tools);
      if (payload.toolChoice === 'none') body.toolConfig = { functionCallingConfig: { mode: 'NONE' } };
    }
    return JSON.stringify(body);
  }

  parseResponse(data) {
    const usage = extractUsageFromResponse(data);
    if (data.candidates && data.candidates[0] && data.candidates[0].content) {
      // With includeThoughts the first part may be a "thought" summary, not the answer
      const parts = data.candidates[0].content.parts || [];
      const answer = parts.filter(x => !x.thought && typeof x.text === 'string').map(x => x.text).join('');
      const thoughts = parts.filter(x => x.thought && typeof x.text === 'string').map(x => x.text).join('\n');
      const calls = parts.filter(x => x.functionCall && x.functionCall.name);
      if (calls.length) {
        return {
          final: answer, usage, reasoning: thoughts,
          toolCalls: calls.map(x => ({
            id: x.functionCall.id || newToolCallId('gemini_call'),
            name: x.functionCall.name,
            ...parseToolArguments(x.functionCall.args)
          })),
          // Gemini 3 insists on getting its thought signatures back, so the parts are kept as received
          raw: { provider: 'gemini', parts }
        };
      }
      const sources = geminiSearchSources(data.candidates[0]);
      return { final: answer || (parts[0] && parts[0].text) || '', usage, reasoning: thoughts, ...(sources.length ? { sources } : {}) };
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
        // Gemini gets the system text as a prefix of the next user turn, so the layers are joined
        // in order (previously the last one replaced the others).
        const text = systemMessageText(msg);
        if (text && text.trim()) systemPrompt = systemPrompt ? `${systemPrompt}\n\n${text}` : text;
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
      } else if (msg.role === 'assistant' && Array.isArray(msg.toolCalls) && msg.toolCalls.length) {
        let parts;
        if (msg.raw && msg.raw.provider === 'gemini' && Array.isArray(msg.raw.parts)) {
          // drop bare thought summaries; keep everything that carries a signature or content
          parts = msg.raw.parts.filter(x => !(x.thought === true && !x.thoughtSignature));
        } else {
          parts = [];
          if (msg.content) parts.push({ text: msg.content });
          msg.toolCalls.forEach(tc => parts.push({ functionCall: { name: tc.name, args: tc.args || {} } }));
        }
        contents.push({ role: 'model', parts });
      } else if (msg.role === 'tool') {
        const fr = { name: msg.name, response: msg.isError ? { error: msg.content } : { result: msg.content } };
        if (msg.toolCallId && !String(msg.toolCallId).startsWith('gemini_call_')) fr.id = msg.toolCallId;
        const last = contents[contents.length - 1];
        if (last && last._toolResults) last.parts.push({ functionResponse: fr });   // all results of a step go in one turn
        else contents.push({ role: 'user', parts: [{ functionResponse: fr }], _toolResults: true });
      } else if (msg.role === 'assistant') {
        const text = Array.isArray(msg.content)
          ? msg.content.map(p => p.text || '').join('')
          : msg.content;
        contents.push({ role: 'model', parts: [{ text }] });
      }
    }
    
    return contents.map(({ _toolResults, ...rest }) => rest);
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
      messages: toAnthropicMessages(payload.messages, normalizeContent),
      temperature: payload.temperature ?? this.plugin.settings.temperature,
      max_tokens: payload.max_tokens ?? this.plugin.settings.max_tokens
    };
    // the provider's own search is a server tool: it can sit next to ordinary tools in the same request
    const anthropicTools = [
      ...(payload.tools && payload.tools.length ? toolDefsToAnthropic(payload.tools) : []),
      ...(payload.builtinSearch ? [{ type: 'web_search_20250305', name: 'web_search', max_uses: WEB_SEARCH_BUILTIN_MAX_USES }] : [])
    ];
    if (anthropicTools.length) {
      body.tools = anthropicTools;
      if (payload.toolChoice === 'none') body.tool_choice = { type: 'none' };
    }

    // Every system layer is sent: a single one as plain text (as before), several as separate blocks.
    const systemTexts = systemLayerTexts(payload.messages);
    if (systemTexts.length === 1) body.system = systemTexts[0];
    else if (systemTexts.length > 1) body.system = systemTexts.map(text => ({ type: 'text', text }));

    if (payload.stream) {
      body.stream = true;
    }

    const effort = this.plugin.getReasoningEffort('anthropic', body.model);
    if (effort) {
      body.output_config = { effort };
      // Thinking text is only returned when thinking is switched on explicitly
      if (this.plugin.settings.showReasoning !== false) {
        body.thinking = { type: 'adaptive', display: 'summarized' };
        delete body.temperature;          // not allowed together with thinking
      }
    }

    return JSON.stringify(body);
  }

  parseResponse(data) {
    const usage = extractUsageFromResponse(data);
    if (Array.isArray(data.content) && data.content.length) {
      // With thinking enabled, content[0] is a "thinking" block — collect text blocks separately
      const answer = data.content.filter(b => b.type === 'text' && b.text).map(b => b.text).join('');
      const thoughts = data.content.filter(b => b.type === 'thinking' && b.thinking).map(b => b.thinking).join('\n');
      const toolUses = data.content.filter(b => b.type === 'tool_use' && b.name);
      const searched = anthropicSearchInfo(data.content);
      if (toolUses.length) {
        return {
          final: answer, usage, reasoning: thoughts, ...searched,
          toolCalls: toolUses.map(b => ({ id: b.id, name: b.name, ...parseToolArguments(b.input) })),
          raw: { provider: 'anthropic', blocks: data.content.filter(b => !(b.type === 'text' && !b.text)) }
        };
      }
      if (answer) return { final: answer, usage, reasoning: thoughts, ...searched };
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

  _usesBodyTemplate() {
    const t = this.plugin.settings.customBodyTemplate;
    return !!(t && t.includes('{{'));
  }

  /** A hand-written body template has no place for tool definitions, so tools stay off. */
  supportsTools() {
    return !this._usesBodyTemplate();
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
    const wireMessages = toOpenAIMessages(mergeSystemMessages(payload.messages));
    let bodyData = {
      model: payload.model || this.plugin.settings.customModel,
      messages: wireMessages,
      temperature: payload.temperature ?? this.plugin.settings.temperature ?? 0.7,
      max_tokens: payload.max_tokens ?? this.plugin.settings.max_tokens ?? 2048
    };
    if (payload.tools && payload.tools.length && !this._usesBodyTemplate()) {
      bodyData.tools = toolDefsToOpenAI(payload.tools);
      if (payload.toolChoice === 'none') bodyData.tool_choice = 'none';
    }

    try {
      if (this.plugin.settings.customBodyTemplate && this.plugin.settings.customBodyTemplate.includes('{{')) {
        let bodyStr = this.plugin.settings.customBodyTemplate
          .replace('{{model}}', JSON.stringify(this.plugin.settings.customModel))
          .replace('{{messages}}', JSON.stringify(wireMessages))
          .replace('{{temperature}}', (payload.temperature ?? this.plugin.settings.temperature ?? 0.7).toString())
          .replace('{{max_tokens}}', (payload.max_tokens ?? this.plugin.settings.max_tokens ?? 2048).toString());
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
      const msg = data.choices[0].message;
      const toolCalls = extractOpenAIToolCalls(msg);
      return { final: msg.content || (toolCalls.length ? '' : msg.content), usage, reasoning: msg.reasoning_content || msg.reasoning || '', ...(toolCalls.length ? { toolCalls } : {}) };
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

// Settings fields holding API keys → name used inside Obsidian's SecretStorage
const SECRET_FIELDS = {
  openaiApiKey: 'openai-key',
  geminiApiKey: 'gemini-key',
  anthropicApiKey: 'anthropic-key',
  customApiKey: 'custom-key'
};

// ==================== MODEL CATALOG (metadata-category.json) ====================

const MODEL_CATALOG_URL = 'https://models.dev/api.json';
// Our provider id -> provider slug used by the catalog. Local/custom have no catalog entry.
const CATALOG_PROVIDER_SLUGS = { openai: 'openai', anthropic: 'anthropic', gemini: 'google' };
const CATALOG_TTL_MS = 7 * 24 * 60 * 60 * 1000;           // model metadata: 7 days
const AVAILABLE_TTL_MS = {                                  // per-key model list
  openai: 24 * 3600 * 1000, anthropic: 24 * 3600 * 1000, gemini: 24 * 3600 * 1000,
  local: 5 * 60 * 1000, custom: 60 * 60 * 1000
};

/**
 * Disk cache stored in <plugin dir>/metadata-category.json so the model list
 * and model metadata (name, context limits, reasoning options …) are fetched
 * once and reused instead of being requested every time Settings is opened.
 *
 * File shape:
 *   {
 *     "fetchedAt": <ms>,                       // when `data` was downloaded
 *     "data": { "<provider>": { id, name, api, models: { "<model id>": { id, name,
 *                reasoning, reasoning_options:[{type:"effort",values:[…]}], limit, cost … } } } },
 *     "available": { "<provider>": { fetchedAt, sig, models:[ids] } }   // what THIS key can use
 *   }
 */
class ModelCatalog {
  constructor(plugin) {
    this.plugin = plugin;
    this._state = null;
    this._loading = null;
    this._download = null;
  }

  get path() { return `${this.plugin.manifest.dir}/metadata-category.json`; }

  async _load() {
    if (this._state) return this._state;
    if (!this._loading) {
      this._loading = (async () => {
        let st = { fetchedAt: 0, lastAttempt: 0, failCount: 0, data: {}, available: {}, toolSupport: {}, searchSupport: {}, failed: {} };
        try {
          const parsed = JSON.parse(await this.plugin.app.vault.adapter.read(this.path));
          st = { fetchedAt: parsed.fetchedAt || 0, lastAttempt: parsed.lastAttempt || 0, failCount: parsed.failCount || 0, data: parsed.data || {}, available: parsed.available || {}, toolSupport: parsed.toolSupport || {}, searchSupport: parsed.searchSupport || {}, failed: parsed.failed || {} };
        } catch (_) { /* missing or corrupt file → start empty */ }
        this._state = st;
        return st;
      })();
    }
    return this._loading;
  }

  async _save() {
    try {
      await this.plugin.app.vault.adapter.write(this.path, JSON.stringify(this._state));
    }
    catch (e) { console.error('Error saving metadata-category.json:', e); }
  }

  /** Short non-reversible fingerprint so a changed key/endpoint invalidates the cached list. */
  static signature(providerId, st) {
    const parts = ({
      openai:    [st.openaiApiKey, st.openaiEndpoint],
      anthropic: [st.anthropicApiKey],
      gemini:    [st.geminiApiKey],
      local:     [st.baseUrl, st.localEndpoint],
      custom:    [st.customApiKey, st.customEndpoint]
    })[providerId] || [];
    let h = 5381;
    for (const ch of parts.join('|')) h = ((h << 5) + h + ch.charCodeAt(0)) | 0;
    return String(h >>> 0);
  }

  /**
   * Makes sure model metadata is available. Downloads it only when the cache is
   * empty/stale (or `force`), and never when `cacheOnly` is set.
   */
  async ensureCatalog({ force = false, cacheOnly = false } = {}) {
    const st = await this._load();
    const fresh = Object.keys(st.data).length > 0;
    if ((fresh && !force) || cacheOnly) return st.data;

    // A failed (or empty) attempt is not repeated every time Settings is opened: wait 1h, then 6h,
    // then 24h between tries. A manual refresh skips the wait. The last attempt is stored in the
    // file, so restarting Obsidian does not reset it.
    if (!force && st.lastAttempt) return st.data;

    if (!this._download) {
      this._download = (async () => {
        let ok = false;
        try {
          const res = await requestUrl({ url: MODEL_CATALOG_URL, method: 'GET', throw: false });
          if (res.status >= 200 && res.status < 300) {
            const json = res.json;
            const root = (json && json.data && !json.openai) ? json.data : json;   // tolerate a {data:{…}} wrapper
            const data = {};
            for (const slug of new Set(Object.values(CATALOG_PROVIDER_SLUGS))) {
              if (root?.[slug]) data[slug] = root[slug];
            }
            if (Object.keys(data).length) {
              st.data = data;
              st.fetchedAt = Date.now();
              ok = true;
            }
          }
        } catch (e) { /* offline or blocked: handled by the back-off below */ }
        finally {
          st.lastAttempt = Date.now();
          st.failCount = ok ? 0 : (st.failCount || 0) + 1;
          await this._save();
          this._download = null;
        }
      })();
    }
    await this._download;
    return st.data;
  }

  /** Synchronous lookup (call ensureCatalog/_load first). */
  getModelMeta(providerId, modelId) {
    const slug = CATALOG_PROVIDER_SLUGS[providerId];
    return (slug && modelId) ? (this._state?.data?.[slug]?.models?.[modelId] || null) : null;
  }

  nameFor(providerId, modelId) {
    const n = this.getModelMeta(providerId, modelId)?.name;
    return (n && n !== modelId) ? n : '';
  }

  /** Effort levels the model itself declares (empty array = no selectable effort). */
  effortValues(providerId, modelId) {
    const opts = this.getModelMeta(providerId, modelId)?.reasoning_options;
    if (!Array.isArray(opts)) return [];
    const eff = opts.find(o => o && o.type === 'effort' && Array.isArray(o.values));
    return eff ? eff.values.filter(v => typeof v === 'string' && v) : [];
  }

  /**
   * Whether tool definitions should be sent to this model. The catalog's own `tool_call`
   * flag wins when it says false; otherwise a refusal remembered from an earlier request
   * (see markToolsRefused) turns tools off for that model. Unknown means "try".
   */
  toolsAllowed(providerId, modelId) {
    if (this.getModelMeta(providerId, modelId)?.tool_call === false) return false;
    return this._state?.toolSupport?.[`${providerId}:${modelId}`] !== false;
  }

  /** Whether the provider's built-in search tool may be sent for this model (false once it was refused). */
  searchAllowed(providerId, modelId) {
    return !(this._state && this._state.searchSupport && this._state.searchSupport[`${providerId}:${modelId}`] === false);
  }

  /** Marks (or clears) a refusal in memory; saveSearchState() makes it last. */
  setSearchRefused(providerId, modelId, refused) {
    if (!this._state) return;
    if (!this._state.searchSupport) this._state.searchSupport = {};
    if (refused) this._state.searchSupport[`${providerId}:${modelId}`] = false;
    else delete this._state.searchSupport[`${providerId}:${modelId}`];
  }

  async saveSearchState() { await this._load(); await this._save(); }

  /** Remember (in the plugin folder) that a model refused tool definitions. */
  async markToolsRefused(providerId, modelId) {
    const st = await this._load();
    if (!st.toolSupport) st.toolSupport = {};
    st.toolSupport[`${providerId}:${modelId}`] = false;
    await this._save();
  }

  /**
   * A model-list request that failed recently for this exact key/endpoint, or null.
   * A rejected key is remembered until the key changes; other failures (server down, offline)
   * for 2 minutes (local/custom servers) or 30 minutes (cloud). The Fetch button always retries.
   */
  async recentFailure(providerId, sig) {
    const st = await this._load();
    const f = st.failed[providerId];
    if (!f || f.sig !== sig) return null;
    return f;
  }

  async rememberFailure(providerId, sig, message) {
    const st = await this._load();
    st.failed[providerId] = { sig, message, at: Date.now(), permanent: /^Invalid API key/i.test(message) };
    await this._save();
  }

  async clearFailure(providerId) {
    const st = await this._load();
    delete st.failed[providerId];
  }

  async getAvailable(providerId, sig) {
    const st = await this._load();
    const e = st.available[providerId];
    return (e && e.sig === sig && Array.isArray(e.models)) ? e.models : null;
  }

  async setAvailable(providerId, sig, models) {
    const st = await this._load();
    st.available[providerId] = { fetchedAt: Date.now(), sig, models };
    await this._save();
  }
}

// ==================== REASONING PANEL ====================

/**
 * Collapsible "reasoning" block shown above an assistant bubble.
 * Created lazily on the first reasoning chunk, collapsed by default.
 */
class ReasoningPanel {
  constructor(anchorEl, initialText = '', live = false) {
    this.anchor = anchorEl;
    this.text = '';
    this.details = document.createElement('details');
    this.details.className = 'ai-reasoning';
    this.details.style.cssText = [
      'margin-bottom:8px', 'padding:8px 12px', 'border-radius:8px',
      'border:1px solid var(--background-modifier-border)',
      'background:var(--background-primary)', 'font-size:12.5px'
    ].join(';');

    this.summary = this.details.createEl('summary');
    this.summary.style.cssText = 'cursor:pointer;color:var(--text-muted);font-weight:600;user-select:none;';

    this.body = this.details.createDiv();
    this.body.style.cssText = [
      'margin-top:8px', 'color:var(--text-muted)', 'white-space:pre-wrap',
      'word-break:break-word', 'line-height:1.5', 'max-height:280px', 'overflow-y:auto',
      'border-top:1px solid var(--background-modifier-border)', 'padding-top:8px'
    ].join(';');

    if (anchorEl && anchorEl.parentElement) anchorEl.parentElement.insertBefore(this.details, anchorEl);
    this.live = live;
    if (initialText) this.append(initialText);
    this._label();
  }

  _label() {
    this.summary.textContent = this.live
      ? '💭 Thinking…'
      : `💭 Reasoning (${this.text.length.toLocaleString()} characters)`;
  }

  append(delta) {
    if (!delta) return;
    this.text += delta;
    this.body.textContent = this.text;
    if (this.live) this.body.scrollTop = this.body.scrollHeight;
  }

  finish() { this.live = false; this._label(); }
  remove() { this.details.remove(); }
}

// ==================== MODEL LISTER ====================

/**
 * Asks each provider's own API which models the entered key can use.
 * Nothing here is hard-coded: the list always comes from the live response.
 */
class ModelLister {
  static async _get(url, headers = {}) {
    const res = await requestUrl({ url, method: 'GET', headers, throw: false });
    if (res.status < 200 || res.status >= 300) {
      let detail = '';
      try { const j = res.json; detail = j?.error?.message || (typeof j?.error === 'string' ? j.error : ''); } catch (_) {}
      const msg = (res.status === 401 || res.status === 403) ? 'Invalid API key or access denied' : `HTTP ${res.status}`;
      throw new Error(detail ? `${msg} — ${detail}` : msg);
    }
    try { return res.json; } catch (_) { throw new Error('Unexpected (non-JSON) response'); }
  }

  /** Turns ".../chat/completions" into ".../models"; returns null if it can't. */
  static _modelsUrlFromEndpoint(endpoint) {
    const clean = (endpoint || '').trim().replace(/\/+$/, '');
    if (!clean) return null;
    if (/\/chat\/completions$/.test(clean)) return clean.replace(/\/chat\/completions$/, '/models');
    if (/\/completions$/.test(clean))       return clean.replace(/\/completions$/, '/models');
    return null;
  }

  static _idsFromOpenAIShape(json) {
    const arr = Array.isArray(json?.data) ? json.data : (Array.isArray(json) ? json : []);
    return arr.map(m => (typeof m === 'string' ? m : m?.id)).filter(Boolean);
  }

  /** @returns {Promise<string[]>} sorted, de-duplicated model ids */
  static async list(providerId, plugin) {
    const st = plugin.settings;
    let ids = [];

    if (providerId === 'openai') {
      if (!st.openaiApiKey) throw new Error('Enter the API key first');
      const url = this._modelsUrlFromEndpoint(st.openaiEndpoint) || 'https://api.openai.com/v1/models';
      ids = this._idsFromOpenAIShape(await this._get(url, { Authorization: `Bearer ${st.openaiApiKey}` }));

    } else if (providerId === 'anthropic') {
      if (!st.anthropicApiKey) throw new Error('Enter the API key first');
      let afterId = null;
      for (let page = 0; page < 10; page++) {
        const url = 'https://api.anthropic.com/v1/models?limit=1000' + (afterId ? `&after_id=${encodeURIComponent(afterId)}` : '');
        const json = await this._get(url, {
          'x-api-key': st.anthropicApiKey,
          'anthropic-version': '2023-06-01'
        });
        ids.push(...this._idsFromOpenAIShape(json));
        if (json?.has_more && json?.last_id) afterId = json.last_id; else break;
      }

    } else if (providerId === 'gemini') {
      if (!st.geminiApiKey) throw new Error('Enter the API key first');
      let pageToken = null;
      for (let page = 0; page < 10; page++) {
        const url = 'https://generativelanguage.googleapis.com/v1beta/models?pageSize=1000' +
                    (pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : '');
        const json = await this._get(url, { 'x-goog-api-key': st.geminiApiKey });
        for (const m of (json?.models || [])) {
          // Only models that can actually be used for chat (generateContent)
          const methods = m.supportedGenerationMethods;
          if (Array.isArray(methods) && !methods.includes('generateContent')) continue;
          if (m.name) ids.push(String(m.name).replace(/^models\//, ''));
        }
        if (json?.nextPageToken) pageToken = json.nextPageToken; else break;
      }

    } else if (providerId === 'local') {
      const base = (st.baseUrl || '').trim().replace(/\/+$/, '');
      if (!base) throw new Error('Enter the Base URL first');
      const tried = [];
      const candidates = [];
      const fromEndpoint = this._modelsUrlFromEndpoint(base + (st.localEndpoint || ''));
      if (fromEndpoint) candidates.push(fromEndpoint);
      candidates.push(base + '/v1/models', base + '/models', base + '/api/tags');
      let lastErr = null;
      for (const url of [...new Set(candidates)]) {
        try {
          const json = await this._get(url);
          ids = Array.isArray(json?.models)
            ? json.models.map(m => m?.name || m?.model).filter(Boolean)   // Ollama /api/tags
            : this._idsFromOpenAIShape(json);                              // OpenAI-compatible
          if (ids.length) { lastErr = null; break; }
        } catch (e) { lastErr = e; tried.push(url); }
      }
      if (!ids.length && lastErr) throw new Error(`Could not reach the local server (${lastErr.message})`);

    } else if (providerId === 'custom') {
      const url = this._modelsUrlFromEndpoint(st.customEndpoint);
      if (!url) throw new Error('Custom endpoint does not look OpenAI-compatible (…/chat/completions), so its model list cannot be derived');
      const headers = {};
      try { Object.assign(headers, JSON.parse(st.customHeaders || '{}')); } catch (_) {}
      if (st.customApiKey && !headers.Authorization && !headers.authorization) headers.Authorization = `Bearer ${st.customApiKey}`;
      ids = this._idsFromOpenAIShape(await this._get(url, headers));

    } else {
      throw new Error(`Unknown provider: ${providerId}`);
    }

    return [...new Set(ids)].sort((a, b) => a.localeCompare(b));
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
  
  /** Provider key of the currently selected mode: local | openai | gemini | anthropic | custom. */
  activeApiType() {
    return this.plugin.settings.currentMode === 'cloud' ? this.plugin.settings.cloudApiType : 'local';
  }

  async sendMessage(payload, opts = {}) {
  const apiType = this.activeApiType();
  
  const provider = this.providers[apiType];
  if (!provider) {
    throw new Error(`Unknown API provider: ${apiType}`);
  }
  
  // Ensure stream is set to true in the payload if we want streaming,
  // but respect the per-provider streaming toggle from settings.
  if (opts.onChunk) {
    const streamingEnabled = this.plugin.settings.streamingEnabled ?? {};
    const providerStreamKey = apiType; // matches providerKey used in settings UI
    const streamingAllowed = streamingEnabled[providerStreamKey] !== false; // default on
    payload.stream = streamingAllowed;
  }

  // Inject onUsage handler to accumulate accurate token counts from the API response.
  // Counts are stored on the active SESSION so that switching or deleting a
  // conversation automatically reflects the correct totals in the counter.
  const originalOnUsage = opts.onUsage;
  opts.onUsage = (usage) => {
    // Only requests that pass opts.sessionId feed the conversation's token counter:
    // chat turns and "✏ Edit instruction" turns. Auxiliary requests such as
    // auto-naming do not belong to any message, so they must not inflate it.
    if (usage && usage.totalTokens > 0 && opts.sessionId) {
      const sm = this.plugin._sessionManager;
      const session = sm.getSession(opts.sessionId);
      if (session) {
        const modelUsed = usage.model || payload.model || this.plugin.getConfiguredModel(apiType);
        usage.providerKey = apiType;
        usage.model = modelUsed;
        // turnOnly: a file-edit request is counted, but it is not the conversation's context
        if (!opts.turnOnly) session.lastRequestTokens = usage;
        sm.recordTurnUsage(opts.sessionId, usage);

        if (!opts.turnOnly) this.plugin.checkContextUsage(session, apiType, modelUsed, usage);
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
    // Prefer the label from the active toggle state when available.
    const states = this.plugin.settings.toggleStates;
    const idx    = this.plugin.settings.toggleStateIndex ?? 0;
    if (states && states[idx] && states[idx].label) return states[idx].label;

    // Fallback to the legacy mode/cloudApiType pair.
    const mode = this.plugin.settings.currentMode;
    if (mode === 'local') return 'Local AI';
    const names = {
      openai: 'OpenAI', gemini: 'Gemini', anthropic: 'Claude', custom: 'Custom API'
    };
    return names[this.plugin.settings.cloudApiType] || 'Cloud AI';
  }

  getCurrentProviderIcon() {
    // Return the obsidianIcon of the active toggle state when available.
    const states = this.plugin.settings.toggleStates;
    const idx    = this.plugin.settings.toggleStateIndex ?? 0;
    if (states && states[idx] && states[idx].obsidianIcon) return states[idx].obsidianIcon;

    // Fallback.
    if (this.plugin.settings.currentMode === 'local') return 'monitor-speaker';
    return 'server';
  }
}

// ==================== TOOL REGISTRY, PERMISSIONS & EXECUTION ====================
//
// FR-0.1 / FR-0.2. The registry is the single list of tools the model may call, whatever their
// origin. Nothing registers itself: later features (skills, subagents, MCP, web search, …) call
// plugin.toolRegistry.register() when they are switched on, and an empty registry means no tool
// definitions are sent and the chat behaves exactly as before.
//
//   register({ name, description, parameters, handler, permission, source, title?, isAvailable? })
//     name        letters/digits/_/-, starts with a letter or _, max 64 (valid for all three providers)
//     parameters  JSON Schema of type "object" (defaults to no parameters)
//     handler     async (args, ctx) => string | object | { content, isError }
//                 ctx = { signal, app, plugin, sessionId } — long work must watch ctx.signal
//     permission  'read' | 'write' | 'external' — what the tool can touch (used by the permission rules)
//     source      'builtin' | 'skill' | 'mcp'

const TOOL_PERMISSION_CLASSES = ['read', 'write', 'external'];
const TOOL_SOURCES = ['builtin', 'skill', 'mcp'];
const TOOL_NAME_RE = /^[A-Za-z_][A-Za-z0-9_-]{0,63}$/;
const TOOL_RESULT_MAX_CHARS = 30000;
const TOOL_ARGS_PREVIEW_CHARS = 600;

class ToolRegistry {
  constructor(plugin) {
    this.plugin = plugin;
    this._tools = new Map();
  }

  /** @returns {Function} unregisters this tool */
  register(def) {
    if (!def || typeof def !== 'object') throw new Error('Tool definition is required.');
    if (!TOOL_NAME_RE.test(def.name || '')) throw new Error(`Invalid tool name "${def.name}".`);
    const describe = () => (typeof def.description === 'function' ? def.description() : def.description);
    if (typeof describe() !== 'string' || !describe().trim()) throw new Error(`Tool "${def.name}" needs a description.`);
    if (typeof def.handler !== 'function') throw new Error(`Tool "${def.name}" needs a handler function.`);
    if (!TOOL_PERMISSION_CLASSES.includes(def.permission)) throw new Error(`Tool "${def.name}": permission must be one of ${TOOL_PERMISSION_CLASSES.join(', ')}.`);
    if (!TOOL_SOURCES.includes(def.source)) throw new Error(`Tool "${def.name}": source must be one of ${TOOL_SOURCES.join(', ')}.`);
    const schema = () => (typeof def.parameters === 'function' ? def.parameters() : def.parameters) || { type: 'object', properties: {} };
    if (schema().type !== 'object') throw new Error(`Tool "${def.name}": parameters must be a JSON Schema of type "object".`);
    if (this._tools.has(def.name)) throw new Error(`A tool named "${def.name}" is already registered.`);

    const tool = {
      name: def.name,
      title: def.title || def.name,
      handler: def.handler,
      permission: def.permission,
      source: def.source,
      defaultPolicy: ['allow', 'ask', 'deny'].includes(def.defaultPolicy) ? def.defaultPolicy : 'ask',
      // optional: (args) → the vault paths a call touches, so folder rules (FR-3.5) can apply to it
      paths: typeof def.paths === 'function' ? def.paths : null,
      policyKey: def.policyKey || null,            // share another rule's setting (e.g. file_read) instead of having one of its own
      policyTitle: def.policyTitle || null,        // how that shared rule is named in the permission settings
      subagentOnly: def.subagentOnly === true,     // offered to subagents only, not to the chat
      isAvailable: typeof def.isAvailable === 'function' ? def.isAvailable : null
    };
    // description and parameters may be functions, so a tool can list what exists right now (agents, …)
    Object.defineProperty(tool, 'description', { enumerable: true, get: () => String(describe()).trim() });
    Object.defineProperty(tool, 'parameters', { enumerable: true, get: schema });
    this._tools.set(tool.name, tool);
    return () => { if (this._tools.get(tool.name) === tool) this._tools.delete(tool.name); };
  }

  unregister(name) { return this._tools.delete(name); }

  /** Removes every tool of one source (e.g. when MCP is switched off). */
  unregisterSource(source) {
    for (const [name, t] of this._tools) if (t.source === source) this._tools.delete(name);
  }

  clear() { this._tools.clear(); }

  get(name) { return this._tools.get(name) || null; }

  list() { return [...this._tools.values()]; }

  /**
   * Provider-neutral definitions to send with a request: { name, description, parameters }.
   * Empty when nothing is registered, when the catalog or an earlier refusal says the model
   * takes no tools, or when the provider cannot carry them (custom body template).
   */
  defsFor(apiType, model, { readOnly = false, forSubagent = false } = {}) {
    if (!this._tools.size) return [];
    const catalog = this.plugin.modelCatalog;
    if (catalog && !catalog.toolsAllowed(apiType, model)) return [];
    const provider = this.plugin.apiManager && this.plugin.apiManager.providers && this.plugin.apiManager.providers[apiType];
    if (provider && typeof provider.supportsTools === 'function' && !provider.supportsTools()) return [];
    return this.list()
      .filter(t => !t.isAvailable || t.isAvailable({ apiType, model }))
      .filter(t => !readOnly || t.permission === 'read')          // plan mode: nothing that changes anything
      .filter(t => forSubagent || !t.subagentOnly)
      .map(t => ({ name: t.name, description: t.description, parameters: t.parameters }));
  }
}

/**
 * Decides whether one tool call may run. Policy per tool name comes from
 * settings.toolPermissions[name] ('allow' | 'ask' | 'deny'); anything unset uses the tool's
 * own default (a tool registers 'allow' only for harmless reads of the user's own files), else 'ask'.
 * (The settings UI, path scopes and the safe-file whitelist arrive with FR-3.5.)
 */
class ToolPermissionGate {
  constructor(plugin) { this.plugin = plugin; }

  policyFor(tool) {
    const v = this.plugin.settings.toolPermissions && this.plugin.settings.toolPermissions[tool.policyKey || tool.name];
    return (v === 'allow' || v === 'deny' || v === 'ask') ? v : (tool.defaultPolicy || 'ask');
  }

  /** True when `path` is the folder or inside one of the folders where "Ask" becomes "Allow" (settings.permissionAllowFolders). */
  _inAllowedFolder(path) {
    const p = normalizeVaultPath(String(path || '')).toLowerCase();
    if (!p) return false;
    return (this.plugin.settings.permissionAllowFolders || []).some(f => {
      const folder = normalizeVaultPath(String(f || '')).toLowerCase();
      return !!folder && (p === folder || p.startsWith(folder + '/'));
    });
  }

  /**
   * Allow / Ask / Deny for one call. A tool set to Deny is never run. A tool set to Ask runs without
   * asking when every path it touches is inside a folder the user listed as always allowed.
   * @returns {Promise<{allowed: boolean, reason?: string, byUser?: boolean}>}
   */
  async check(tool, args, signal) {
    let policy = this.policyFor(tool);
    if (policy === 'deny') return { allowed: false, reason: 'This tool is turned off in the permission rules.' };
    if (policy === 'ask' && typeof tool.paths === 'function') {
      let paths = [];
      try { paths = tool.paths(args) || []; } catch (_) { paths = []; }
      if (paths.length && paths.every(p => this._inAllowedFolder(p))) policy = 'allow';
    }
    if (policy === 'allow') return { allowed: true };
    const ok = await this._ask(tool, args, signal);
    return ok ? { allowed: true } : { allowed: false, reason: 'The user did not allow this tool call.', byUser: true };
  }

  _ask(tool, args, signal) {
    return new Promise((resolve) => {
      let settled = false;
      let modal = null;
      const onAbort = () => { settle(false); try { modal && modal.close(); } catch (_) {} };
      const settle = (ok) => {
        if (settled) return;
        settled = true;
        if (signal) signal.removeEventListener('abort', onAbort);
        resolve(!!ok);
      };
      if (signal && signal.aborted) return settle(false);

      let argText = '';
      try { argText = JSON.stringify(args, null, 2); } catch (_) { argText = String(args); }
      if (argText.length > TOOL_ARGS_PREVIEW_CHARS) argText = argText.slice(0, TOOL_ARGS_PREVIEW_CHARS) + ' …';
      const message = `${tool.description.slice(0, 200)}\n\nSource: ${tool.source}\nArguments: ${argText}`;

      modal = new ConfirmModal(this.plugin.app, { title: `Allow "${tool.title}"?`, message, confirmLabel: 'Allow' }, (ok) => settle(ok));
      // ConfirmModal only reports its two buttons and Enter/Esc; a click outside or the close
      // button must also count as "no". The answer callback runs right after close(), so the
      // fallback is deferred to let a real answer win.
      const baseClose = modal.onClose.bind(modal);
      modal.onClose = () => { baseClose(); setTimeout(() => settle(false), 0); };
      if (signal) signal.addEventListener('abort', onAbort, { once: true });
      modal.open();
      const p = modal.contentEl.querySelector('p');
      if (p) { p.style.whiteSpace = 'pre-wrap'; p.style.wordBreak = 'break-word'; }
    });
  }
}

/** Resolves/rejects with `promise`, but rejects at once with UserAbortError when `signal` aborts. */
function raceAbort(promise, signal) {
  if (!signal) return promise;
  if (signal.aborted) return Promise.reject(new UserAbortError());
  return new Promise((resolve, reject) => {
    const onAbort = () => reject(new UserAbortError());
    signal.addEventListener('abort', onAbort, { once: true });
    promise.then(
      v => { signal.removeEventListener('abort', onAbort); resolve(v); },
      e => { signal.removeEventListener('abort', onAbort); reject(e); }
    );
  });
}

/** Runs the tool calls of one model step: validate → permission → execute → tool messages. */
class ToolExecutor {
  constructor(plugin) {
    this.plugin = plugin;
    this.gate = new ToolPermissionGate(plugin);
  }

  /**
   * @param {Array}  calls   [{ id, name, args, parseError? }]
   * @param {Object} opts    { signal, isStopped(), onStatus(title), sessionId, readOnly (plan mode: only read tools run) }
   * @returns {Promise<{ messages: Array, stopped: boolean }>} one `role:'tool'` message per call
   */
  async runCalls(calls, { signal, isStopped = () => false, onStatus = null, sessionId = null, readOnly = false } = {}) {
    const messages = [];
    for (const call of calls) {
      if (isStopped() || (signal && signal.aborted)) return { messages, stopped: true };
      const tool = this.plugin.toolRegistry.get(call.name);
      if (onStatus) onStatus(tool ? tool.title : call.name);
      const res = await this._runOne(call, tool, { signal, sessionId, readOnly });
      if (res.stopped) return { messages, stopped: true };
      messages.push({ role: 'tool', toolCallId: call.id, name: call.name, content: res.content, isError: !!res.isError, ...(res.sources ? { sources: res.sources } : {}) });
    }
    return { messages, stopped: !!isStopped() };
  }

  async _runOne(call, tool, { signal, sessionId, readOnly = false }) {
    const fail = (content) => ({ content, isError: true });
    if (!tool) return fail(`Unknown tool "${call.name}".`);
    if (readOnly && tool.permission !== 'read') return fail('Plan mode is on, so this was not done. Put it in the plan instead.');
    if (call.parseError || !call.args) return fail(call.parseError || 'Arguments were not valid JSON.');
    const problem = ToolExecutor.validateArgs(tool.parameters, call.args);
    if (problem) return fail(problem);

    let verdict;
    try { verdict = await this.gate.check(tool, call.args, signal); }
    catch (_) { verdict = { allowed: false, reason: 'The permission check failed.' }; }
    if (signal && signal.aborted) return { stopped: true };
    if (!verdict.allowed) return fail(verdict.reason || 'Not allowed.');

    try {
      const ctx = { signal, app: this.plugin.app, plugin: this.plugin, sessionId, readOnly };
      const out = await raceAbort(Promise.resolve().then(() => tool.handler(call.args, ctx)), signal);
      return ToolExecutor.normalizeOutput(out);
    } catch (e) {
      if ((signal && signal.aborted) || e instanceof UserAbortError) return { stopped: true };
      const msg = String((e && e.message) || e || 'The tool failed.').replace(/\s+/g, ' ').trim().slice(0, 300);
      return fail(`Tool error: ${msg}`);
    }
  }

  /** Small structural check so the model gets a precise, fixable message instead of a crash. */
  static validateArgs(schema, args) {
    if (!args || typeof args !== 'object' || Array.isArray(args)) return 'Arguments must be a JSON object.';
    for (const key of (schema && schema.required) || []) {
      if (args[key] === undefined) return `Missing required argument "${key}".`;
    }
    const props = (schema && schema.properties) || {};
    for (const [key, spec] of Object.entries(props)) {
      const v = args[key];
      if (v === undefined || !spec || typeof spec.type !== 'string') continue;
      const ok = ({
        string: typeof v === 'string',
        number: typeof v === 'number' && Number.isFinite(v),
        integer: Number.isInteger(v),
        boolean: typeof v === 'boolean',
        array: Array.isArray(v),
        object: !!v && typeof v === 'object' && !Array.isArray(v)
      })[spec.type];
      if (ok === false) return `Argument "${key}" must be of type ${spec.type}.`;
      if (Array.isArray(spec.enum) && !spec.enum.includes(v)) return `Argument "${key}" must be one of: ${spec.enum.join(', ')}.`;
    }
    return '';
  }

  static normalizeOutput(out) {
    let isError = false;
    let content = out;
    if (out && typeof out === 'object' && !Array.isArray(out) && 'content' in out) {
      isError = !!out.isError;
      content = out.content;
    }
    if (content === undefined || content === null) content = '';
    if (typeof content !== 'string') {
      try { content = JSON.stringify(content); } catch (_) { content = String(content); }
    }
    if (content.length > TOOL_RESULT_MAX_CHARS) {
      content = content.slice(0, TOOL_RESULT_MAX_CHARS) + `\n[truncated ${content.length - TOOL_RESULT_MAX_CHARS} characters]`;
    }
    const sources = out && typeof out === 'object' && Array.isArray(out.sources) ? out.sources : undefined;
    return { content: content || '(no output)', isError, ...(sources ? { sources } : {}) };
  }
}

// ==================== AI FOLDER & PROMPT LAYERS ====================
//
// FR-F1…F8, FR-1.3, §5. One setting (settings.aiFolder) names the vault folder the AI owns:
//
//   <AI folder>/ soul.md  memory.md  user.md  Skills/  Commands/  Agents/
//
// Picking a folder creates only what is missing, silently, and never overwrites, moves or deletes
// anything. With no folder chosen every feature that needs it stays inactive and nothing is created.

const AI_FOLDER_SUBFOLDERS = ['Skills', 'Commands', 'Agents'];
const AI_FOLDER_FILES = {
  'soul.md':   '<!-- Who the AI is and how it speaks. Keep it short; no tool or file rules. -->',
  'memory.md': '<!-- What the AI remembers across conversations. Changes need your approval. -->',
  'user.md':   '<!-- What the AI knows about you. Changes need your approval. -->'
};

class AIFolder {
  constructor(plugin) {
    this.plugin = plugin;
    this._cache = new Map();
  }

  /** Normalized vault path of the chosen folder, or '' when none is set. */
  get path() { return normalizeVaultPath(this.plugin.settings.aiFolder || ''); }

  get active() { return !!this.path; }

  child(name) { return `${this.path}/${name}`; }

  /** True if the (already normalized) vault path is the AI folder or lies inside it. */
  contains(normalizedPath) {
    const root = this.path.toLowerCase();
    const p = String(normalizedPath || '').toLowerCase();
    return !!root && (p === root || p.startsWith(root + '/'));
  }

  /**
   * Creates whatever is missing in the chosen folder. Existing items are never touched.
   * @returns {Promise<{ created: string[], failed: string[] }>}
   */
  async ensureStructure() {
    const result = { created: [], failed: [] };
    if (!this.active) return result;
    const vault = this.plugin.app.vault;
    const exists = (p) => vault.adapter.exists(p);

    const ensureFolder = async (path) => {
      if (await exists(path)) return;
      try { await vault.createFolder(path); result.created.push(path); }
      catch (_) { if (!(await exists(path))) result.failed.push(path); }
    };
    const ensureFile = async (path, text) => {
      if (await exists(path)) return;
      try { await vault.create(path, text + '\n'); result.created.push(path); }
      catch (_) { if (!(await exists(path))) result.failed.push(path); }
    };

    // The folder itself (and any missing parents), then its contents.
    let walked = '';
    for (const seg of this.path.split('/')) { walked = walked ? `${walked}/${seg}` : seg; await ensureFolder(walked); }
    for (const name of AI_FOLDER_SUBFOLDERS) await ensureFolder(this.child(name));
    for (const [name, text] of Object.entries(AI_FOLDER_FILES)) await ensureFile(this.child(name), text);
    return result;
  }

  /** A file of the AI folder without HTML comments (the template line is one), or '' when absent or empty. Cached by mtime/size. */
  async readText(name) {
    if (!this.active) return '';
    const path = this.child(name);
    const file = this.plugin.app.vault.getAbstractFileByPath(path);
    if (!this._cache) this._cache = new Map();
    if (!file || file.children !== undefined) { this._cache.delete(path); return ''; }
    const mtime = file.stat ? file.stat.mtime : 0;
    const size = file.stat ? file.stat.size : 0;
    const c = this._cache.get(path);
    if (c && c.mtime === mtime && c.size === size) return c.text;
    const raw = await this.plugin.app.vault.cachedRead(file);
    const text = String(raw || '').replace(/<!--[\s\S]*?-->[ \t]*\r?\n?/g, '').trim();
    this._cache.set(path, { mtime, size, text });
    return text;
  }

  readSoul() { return this.readText('soul.md'); }
}

/**
 * Builds the system layers of a chat request (§5). Each layer is its own system message, in this order:
 *   1 soul · 2 Role · 3 memory · 4 skill index · 5 task modules (file operations, plan mode, tools)
 * No layer is ever appended to another or to user text. Layers 3 and 4 arrive with their features.
 */
class PromptAssembler {
  constructor(plugin) {
    this.plugin = plugin;
    this._soul = '';
  }

  /** Reads what needs the vault; call before a request is built (cheap: unchanged files are not re-read). */
  async refresh() {
    const s = this.plugin.settings;
    this._soul = (s.soulInjection !== false && s.aiFolder)
      ? await this.plugin.aiFolder.readSoul().catch(() => '')
      : '';
    if (s.memoryEnabled || this.plugin._persistentMemory) {
      const mem = this.plugin.persistentMemory;
      await mem.refresh().catch(() => {});
      if (mem.enabled) mem.ensureToolRegistered();
    }
    if (s.aiFolder || this.plugin._skills) {
      const lib = this.plugin.skills;
      await lib.refresh().catch(() => {});
      if (lib.enabled) lib.ensureToolRegistered();
    }
    if (s.webSearchEnabled) this.plugin.webSearch.ensureToolsRegistered();
    if (s.mcpEnabled || this.plugin._mcp) await this.plugin.mcp.syncForTurn();
    if (s.aiFolder || this.plugin._agents) {
      const agents = this.plugin.agents;
      await agents.refresh().catch(() => {});
      if (agents.enabled) agents.ensureToolRegistered();
    }
  }

  /** The skill index only helps if the model can actually call load_skill on this request. */
  _canLoadSkills() {
    const registry = this.plugin._toolRegistry;
    if (!registry || !this.plugin.apiManager) return false;
    const apiType = this.plugin.apiManager.activeApiType();
    return registry.defsFor(apiType, this.plugin.getConfiguredModel(apiType)).some(d => d.name === 'load_skill');
  }

  /** Layers 1–4 for this session as [{ id, content }], in order. */
  baseLayers(session) {
    const layers = [];
    if (this._soul) layers.push({ id: 'soul', content: this._soul });
    if (session && session.systemPrompt && session.systemPrompt.trim()) {
      layers.push({ id: 'role', content: session.systemPrompt });
    }
    const memory = this.plugin._persistentMemory && this.plugin._persistentMemory.layerText();
    if (memory) layers.push({ id: 'memory', content: memory });
    if (this.plugin._skills && this.plugin._skills.hasSkills() && this._canLoadSkills()) {
      layers.push({ id: 'skills', content: this.plugin._skills.indexText() });
    }
    return layers;
  }

  /** Layer 5: a task module goes after every base layer and after task modules already added. */
  addTaskLayer(messages, content) {
    let i = 0;
    while (i < messages.length && messages[i].role === 'system') i++;
    messages.splice(i, 0, { role: 'system', content });
  }
}

/** Folder chooser for the AI folder setting (Obsidian's own fuzzy picker; works on touch screens). */
class AIFolderPickerModal extends FuzzySuggestModal {
  constructor(app, onChoose) {
    super(app);
    this.onChoose = onChoose;
    this.setPlaceholder('Choose the AI folder…');
  }
  getItems() { return this.app.vault.getAllLoadedFiles().filter(f => f.children !== undefined && f.path !== '/'); }
  getItemText(folder) { return folder.path; }
  onChooseItem(folder) { this.onChoose(folder); }
}

// ==================== SKILLS & SLASH COMMANDS ====================
//
// FR-1.1 / FR-1.2. Both live in the AI folder and are read lazily (one tree walk per request or
// keystroke, a file is only re-read when its mtime/size changed):
//
//   Skills/<skill-name>/SKILL.md   → only "name: description" enters the prompt (layer 4); the body
//                                    is loaded by the model (load_skill tool) or by the user (/name)
//   Commands/<name>.md             → /name expands to the file's text; {{selection}} and {{note}}
//                                    are filled from the note the user was last working in

/** Splits `---` YAML front matter from the body. Unparsable front matter is treated as absent. */
function parseFrontmatter(text) {
  const src = String(text || '');
  const m = /^---[ \t]*\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/.exec(src);
  if (!m) return { data: {}, body: src };
  let data = {};
  try { data = parseYaml(m[1]) || {}; } catch (_) { data = {}; }
  if (typeof data !== 'object' || Array.isArray(data)) data = {};
  return { data, body: src.slice(m[0].length) };
}

function collapseToLine(text, max) {
  const t = String(text || '').replace(/\s+/g, ' ').trim();
  return t.length > max ? t.slice(0, max - 1).trimEnd() + '…' : t;
}

function firstTextLine(body) {
  for (const line of String(body || '').split(/\r?\n/)) {
    const t = line.replace(/^#+\s*/, '').trim();
    if (t) return t;
  }
  return '';
}

class SkillLibrary {
  constructor(plugin) {
    this.plugin = plugin;
    this._cache = new Map();     // skill name (folder) → { path, mtime, size, description }
  }

  get enabled() { return this.plugin.settings.skillsEnabled !== false && this.plugin.aiFolder.active; }

  hasSkills() { return this.enabled && this._cache.size > 0; }

  list() {
    if (!this.enabled) return [];
    return [...this._cache.entries()]
      .map(([name, e]) => ({ name, description: e.description }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  find(name) {
    const want = String(name || '').trim().toLowerCase();
    if (!this.enabled || !want) return null;
    for (const [n, e] of this._cache) if (n.toLowerCase() === want) return { name: n, ...e };
    return null;
  }

  /** Walks Skills/ and re-reads only the SKILL.md files that changed. */
  async refresh() {
    if (!this.enabled) { this._cache.clear(); return; }
    const vault = this.plugin.app.vault;
    const root = vault.getAbstractFileByPath(this.plugin.aiFolder.child('Skills'));
    const seen = new Set();
    for (const dir of (root && root.children) || []) {
      if (dir.children === undefined) continue;                       // loose files are not skills
      const file = vault.getAbstractFileByPath(`${dir.path}/SKILL.md`);
      if (!file || file.children !== undefined) continue;
      seen.add(dir.name);
      const mtime = file.stat ? file.stat.mtime : 0;
      const size = file.stat ? file.stat.size : 0;
      const hit = this._cache.get(dir.name);
      if (hit && hit.path === file.path && hit.mtime === mtime && hit.size === size) continue;
      let parsed;
      try { parsed = parseFrontmatter(await vault.cachedRead(file)); } catch (_) { seen.delete(dir.name); continue; }
      const description = String(parsed.data.description || '').trim() || firstTextLine(parsed.body);
      this._cache.set(dir.name, { path: file.path, mtime, size, description });
    }
    for (const name of [...this._cache.keys()]) if (!seen.has(name)) this._cache.delete(name);
  }

  /** Layer 4: names and one-line descriptions, never bodies. */
  indexText() {
    const skills = this.list();
    if (!skills.length) return '';
    const lines = skills.map(s => s.description ? `- ${s.name}: ${collapseToLine(s.description, 200)}` : `- ${s.name}`);
    return 'Skills you can load when one fits the task (use the load_skill tool with the skill name):\n' + lines.join('\n');
  }

  /** The skill's instructions (front matter removed), read fresh from the vault. */
  async load(name) {
    const hit = this.find(name);
    if (!hit) return null;
    const file = this.plugin.app.vault.getAbstractFileByPath(hit.path);
    if (!file || file.children !== undefined) return null;
    const { body } = parseFrontmatter(await this.plugin.app.vault.cachedRead(file));
    return { name: hit.name, body: body.trim() };
  }

  /** Adds the load_skill tool to the registry (once). It is only offered while there are skills to load. */
  ensureToolRegistered() {
    const registry = this.plugin.toolRegistry;
    if (registry.get('load_skill')) return;
    registry.register({
      name: 'load_skill',
      title: 'Load skill',
      description: 'Loads the full instructions of one of the available skills. Call it when a skill fits the user\'s task, then follow what it says.',
      parameters: {
        type: 'object',
        properties: { name: { type: 'string', description: 'The skill\'s name, exactly as listed.' } },
        required: ['name']
      },
      permission: 'read',
      source: 'builtin',
      defaultPolicy: 'allow',          // reads only the user's own skill files
      isAvailable: () => this.hasSkills(),
      handler: async ({ name }) => {
        const skill = await this.load(name);
        if (!skill) {
          const names = this.list().map(s => s.name).join(', ') || 'none';
          return { content: `No skill named "${name}". Available: ${names}.`, isError: true };
        }
        return skill.body || '(This skill has no instructions.)';
      }
    });
  }
}

class CommandLibrary {
  constructor(plugin) {
    this.plugin = plugin;
    this._cache = new Map();     // command name → { path, mtime, size, description }
  }

  get enabled() { return this.plugin.settings.slashCommandsEnabled !== false && this.plugin.aiFolder.active; }

  list() {
    if (!this.enabled) return [];
    return [...this._cache.entries()]
      .map(([name, e]) => ({ name, description: e.description }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  find(name) {
    const want = String(name || '').trim().toLowerCase();
    if (!this.enabled || !want) return null;
    for (const [n, e] of this._cache) if (n.toLowerCase() === want) return { name: n, ...e };
    return null;
  }

  /** Lists Commands/*.md; a name must be one word without slashes so "/name rest" is unambiguous. */
  async refresh() {
    if (!this.enabled) { this._cache.clear(); return; }
    const vault = this.plugin.app.vault;
    const root = vault.getAbstractFileByPath(this.plugin.aiFolder.child('Commands'));
    const seen = new Set();
    for (const file of (root && root.children) || []) {
      if (file.children !== undefined || !/\.md$/i.test(file.name)) continue;
      const name = file.name.replace(/\.md$/i, '');
      if (!/^[^\s/\\]+$/.test(name)) continue;
      seen.add(name);
      const mtime = file.stat ? file.stat.mtime : 0;
      const size = file.stat ? file.stat.size : 0;
      const hit = this._cache.get(name);
      if (hit && hit.path === file.path && hit.mtime === mtime && hit.size === size) continue;
      let parsed;
      try { parsed = parseFrontmatter(await vault.cachedRead(file)); } catch (_) { seen.delete(name); continue; }
      const description = String(parsed.data.description || '').trim() || firstTextLine(parsed.body);
      this._cache.set(name, { path: file.path, mtime, size, description });
    }
    for (const name of [...this._cache.keys()]) if (!seen.has(name)) this._cache.delete(name);
  }

  /** The command's template text (front matter removed), read fresh from the vault. */
  async template(name) {
    const hit = this.find(name);
    if (!hit) return null;
    const file = this.plugin.app.vault.getAbstractFileByPath(hit.path);
    if (!file || file.children !== undefined) return null;
    return parseFrontmatter(await this.plugin.app.vault.cachedRead(file)).body.trim();
  }

  /** Which of {{selection}} / {{note}} the template uses. */
  static variablesIn(template) {
    const used = new Set();
    String(template).replace(/\{\{\s*(selection|note)\s*\}\}/g, (_, k) => { used.add(k); return ''; });
    return used;
  }

  static fill(template, values) {
    return String(template).replace(/\{\{\s*(selection|note)\s*\}\}/g, (_, k) => values[k] || '');
  }
}

/**
 * Autocomplete popup under/over the chat input. A subclass says which word is being typed
 * (_match), whether the feature is on (_enabled), what to refresh first (_prepare) and what to
 * list (_items → [{ label, kind, description, insert }]). Arrow keys move, Enter/Tab or a tap
 * insert, Escape closes, Shift+Enter still sends. Shows nothing while the feature is off.
 */
class InputMenu {
  constructor(inputEl, anchorEl, below = false, canShow = null) {
    this.inputEl = inputEl;
    this.anchorEl = anchorEl;
    this.below = below;
    this.canShow = canShow;          // optional: () => boolean, e.g. off while composing a file-edit instruction
    this.el = null;
    this.items = [];
    this.active = 0;
    this._seq = 0;
    inputEl.addEventListener('input', () => { this._onInput(); });
    inputEl.addEventListener('keydown', (e) => this._onKey(e));
    inputEl.addEventListener('blur', () => setTimeout(() => this.close(), 150));
  }

  get isOpen() { return !!this.el && this.el.style.display !== 'none'; }

  /** Subclass hooks. */
  _match() { return null; }          // → { start, end, query, ... } — the word at the caret, offsets into inputEl.value
  _enabled() { return true; }
  async _prepare() {}
  _items(match) { return []; }

  _caret() {
    const v = this.inputEl.value;
    return typeof this.inputEl.selectionStart === 'number' ? this.inputEl.selectionStart : v.length;
  }

  async _onInput() {
    const m = this._match();
    if (!m || !this._enabled() || (this.canShow && !this.canShow())) return this.close();
    const seq = ++this._seq;
    await this._prepare();
    if (seq !== this._seq) return;
    const now = this._match();
    if (!now) return;
    const items = this._items(now);
    if (!items.length) return this.close();
    this.items = items;
    this.active = 0;
    this._render();
  }

  _onKey(e) {
    if (!this.isOpen) return;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault(); e.stopImmediatePropagation();
      const n = this.items.length;
      this.active = (this.active + (e.key === 'ArrowDown' ? 1 : n - 1)) % n;
      this._render();
    } else if ((e.key === 'Enter' && !e.shiftKey) || e.key === 'Tab') {
      e.preventDefault(); e.stopImmediatePropagation();
      this.select(this.items[this.active]);
    } else if (e.key === 'Escape') {
      e.preventDefault(); e.stopImmediatePropagation();
      this.close();
    } else if (e.key === 'Enter') {
      this.close();                       // Shift+Enter sends the message as usual
    }
  }

  _render() {
    if (!this.el) {
      this.el = this.anchorEl.createDiv({ cls: 'ai-input-menu' });
      const st = this.el.style;
      st.position = 'absolute'; st.insetInlineStart = '0'; st.insetInlineEnd = '0';
      if (this.below) st.top = 'calc(100% + 4px)'; else st.bottom = 'calc(100% + 4px)';
      st.maxHeight = '40vh'; st.overflowY = 'auto'; st.zIndex = '100';
      st.background = 'var(--background-primary)';
      st.border = '1px solid var(--background-modifier-border)';
      st.borderRadius = '8px'; st.boxShadow = 'var(--shadow-s)';
      this.el.setAttribute('role', 'listbox');
    }
    this.el.style.display = 'block';
    this.el.empty();
    this.items.forEach((item, i) => {
      const row = this.el.createDiv({ cls: 'ai-input-menu-item' });
      const st = row.style;
      st.display = 'flex'; st.alignItems = 'center'; st.gap = '8px';
      st.minHeight = '44px'; st.padding = '6px 12px'; st.cursor = 'pointer'; st.boxSizing = 'border-box';
      st.background = i === this.active ? 'var(--background-modifier-hover)' : 'transparent';
      row.setAttribute('role', 'option');
      row.setAttribute('aria-selected', i === this.active ? 'true' : 'false');
      const name = row.createEl('span', { text: item.label });
      name.style.fontWeight = '600'; name.style.flexShrink = '0'; name.style.maxWidth = '55%';
      name.style.overflow = 'hidden'; name.style.textOverflow = 'ellipsis'; name.style.whiteSpace = 'nowrap';
      name.setAttribute('dir', 'auto');
      const kind = row.createEl('span', { text: item.kind });
      kind.style.fontSize = '11px'; kind.style.color = 'var(--text-muted)'; kind.style.flexShrink = '0';
      const desc = row.createEl('span', { text: collapseToLine(item.description, 80) });
      desc.setAttribute('dir', 'auto');
      desc.style.color = 'var(--text-muted)'; desc.style.fontSize = '12px'; desc.style.flex = '1';
      desc.style.minWidth = '0'; desc.style.overflow = 'hidden'; desc.style.textOverflow = 'ellipsis'; desc.style.whiteSpace = 'nowrap';
      // mousedown keeps the focus in the textarea; the click then picks the item (works for touch too)
      row.addEventListener('mousedown', (e) => e.preventDefault());
      row.addEventListener('click', () => this.select(item));
      if (i === this.active && row.scrollIntoView) row.scrollIntoView({ block: 'nearest' });
    });
  }

  /** Replaces the word at the caret (including the rest of a half-typed word) with the item's text. */
  select(item) {
    const m = this._match();
    if (!item || !m) return this.close();
    const v = this.inputEl.value;
    const before = v.slice(0, m.start);
    let after = v.slice(m.end);
    if (item.insert.endsWith(' ') && after.startsWith(' ')) after = after.slice(1);
    this.inputEl.value = before + item.insert + after;
    const caret = before.length + item.insert.length;
    if (this.inputEl.setSelectionRange) this.inputEl.setSelectionRange(caret, caret);
    this.close();
    this.inputEl.dispatchEvent(new Event('input', { bubbles: true }));    // keep draft/token counters in step
    if (this.inputEl.focus) this.inputEl.focus();
  }

  close() {
    this._seq++;
    if (this.el) this.el.style.display = 'none';
  }
}

/** "/" — commands and skills (FR-1.1, FR-1.2). */
class SlashMenu extends InputMenu {
  constructor(plugin, inputEl, anchorEl, below = false, canShow = null) {
    super(inputEl, anchorEl, below, canShow);
    this.plugin = plugin;
  }

  _match() {
    const v = this.inputEl.value;
    const caret = this._caret();
    const m = /^\/([^\s/]*)$/.exec(v.slice(0, caret));
    if (!m) return null;
    return { start: 0, end: caret + /^[^\s]*/.exec(v.slice(caret))[0].length, query: m[1] };
  }

  _enabled() { return this.plugin.slashEnabled(); }
  async _prepare() { await this.plugin.refreshSlashSources(); }

  _items(match) {
    return this.plugin.slashItems(match.query).map(i => ({
      label: `/${i.name}`, kind: i.kind, description: i.description, insert: `/${i.name} `
    }));
  }
}

/** "@" notes and folders, "#" tags (FR-3.2). */
class MentionMenu extends InputMenu {
  constructor(plugin, inputEl, anchorEl, below = false, canShow = null) {
    super(inputEl, anchorEl, below, canShow);
    this.plugin = plugin;
  }

  /** "#word" or "@words" at the caret, only after whitespace or at the start of the input. */
  _match() {
    const v = this.inputEl.value;
    const caret = this._caret();
    const head = v.slice(0, caret);
    const tail = (re) => re.exec(v.slice(caret))[0].length;
    const tag = /(^|\s)#([\p{L}\p{N}_/-]*)$/u.exec(head);
    if (tag) {
      const start = tag.index + tag[1].length;
      return { kind: '#', start, end: caret + tail(/^[\p{L}\p{N}_/-]*/u), query: tag[2] };
    }
    const at = head.lastIndexOf('@');
    if (at >= 0 && (at === 0 || /\s/.test(head[at - 1]))) {
      const query = head.slice(at + 1);
      if (query.length <= 60 && !/[[\]\n]/.test(query) && !/^\s/.test(query)) {
        return { kind: '@', start: at, end: caret + tail(/^[^\s[\]]*/), query };
      }
    }
    return null;
  }

  _enabled() { return this.plugin.mentions.enabled; }

  _items(match) { return this.plugin.mentions.suggest(match.kind, match.query); }
}

// ==================== MENTIONS ====================
//
// FR-3.2. "@" suggests notes and folders, "#" suggests tags; choosing one writes
//   @[[Note]]  @[[Folder/Sub/]]  #tag
// into the message. On send, what those point at is attached to the message (read-only, a
// snapshot, like any attached file). Only the text the user typed is scanned: a note pulled in by
// {{note}} or an attached file may contain tags and links without that meaning "add these too".

const MENTION_NOTE_MAX_CHARS = 20000;     // per note; longer notes are cut and say so
const MENTION_TOTAL_MAX_CHARS = 60000;    // across everything one message mentions
const MENTION_MAX_NOTES = 25;             // per folder or tag
const MENTION_SUGGESTIONS = 30;

class MentionService {
  constructor(plugin) { this.plugin = plugin; }

  get enabled() { return this.plugin.settings.mentionsEnabled !== false; }

  _inAIFolder(path) { return !!this.plugin.settings.aiFolder && this.plugin.aiFolder.contains(path); }

  /** Autocomplete entries for "@query" (kind '@': notes and folders) or "#query" (kind '#': tags). */
  suggest(kind, query) {
    const { vault, metadataCache } = this.plugin.app;
    const q = String(query || '').toLowerCase();

    if (kind === '#') {
      const tags = (metadataCache.getTags && metadataCache.getTags()) || {};
      return Object.entries(tags)
        .filter(([tag]) => tag.slice(1).toLowerCase().includes(q))
        .sort((a, b) => {
          const pa = a[0].slice(1).toLowerCase().startsWith(q) ? 0 : 1, pb = b[0].slice(1).toLowerCase().startsWith(q) ? 0 : 1;
          return pa - pb || b[1] - a[1] || a[0].localeCompare(b[0]);
        })
        .slice(0, MENTION_SUGGESTIONS)
        .map(([tag, n]) => ({ label: tag, kind: 'tag', description: `${n} ${n === 1 ? 'note' : 'notes'}`, insert: `${tag} ` }));
    }

    // every word typed has to appear somewhere in the path
    const terms = q.split(/\s+/).filter(Boolean);
    const matches = (path) => { const p = path.toLowerCase(); return terms.every(t => p.includes(t)); };
    const rank = (name) => (terms[0] && name.toLowerCase().startsWith(terms[0])) ? 0 : 1;
    const entries = [];
    for (const f of vault.getMarkdownFiles()) {
      if (!this._inAIFolder(f.path) && matches(f.path)) entries.push({ file: f, order: 0, rank: rank(f.basename), time: f.stat ? f.stat.mtime : 0, name: f.basename });
    }
    for (const f of vault.getAllLoadedFiles()) {
      if (f.children !== undefined && f.path !== '/' && !this._inAIFolder(f.path) && matches(f.path)) entries.push({ file: f, order: 1, rank: rank(f.name), time: 0, name: f.name });
    }
    return entries
      .sort((a, b) => a.rank - b.rank || a.order - b.order || b.time - a.time || a.name.localeCompare(b.name))
      .slice(0, MENTION_SUGGESTIONS)
      .map(({ file, order }) => {
        if (order === 1) return { label: file.name, kind: 'folder', description: file.path, insert: `@[[${file.path}/]] ` };
        const link = metadataCache.fileToLinktext ? metadataCache.fileToLinktext(file, '') : file.path.replace(/\.md$/i, '');
        const parent = file.parent && file.parent.path !== '/' ? file.parent.path : '';
        return { label: file.basename, kind: 'note', description: parent, insert: `@[[${link}]] ` };
      });
  }

  /**
   * What the message's mentions point at, as attachments (same shape as attached files).
   * Skips anything already attached. Whatever could not be included is listed in one extra
   * "Mentions" attachment so the model can tell the user instead of guessing.
   * @returns {Promise<{ attachments: Array, notFound: string[] }>}
   */
  async resolve(text, existing = []) {
    const out = { attachments: [], notFound: [] };
    if (!this.enabled || !text || !/@\[\[|#/.test(text)) return out;
    const { vault, metadataCache } = this.plugin.app;
    const have = new Set((existing || []).map(a => a.path).filter(Boolean));
    const groups = [];                      // { source, files, total, direct }
    const seenTokens = new Set();
    const notes = [];                       // lines for the "Mentions" attachment

    const mdFilesUnder = (folder) => {
      const found = [];
      const walk = (node) => { for (const c of node.children || []) { if (c.children !== undefined) walk(c); else if (c.extension === 'md') found.push(c); } };
      walk(folder);
      return found.sort((a, b) => a.path.localeCompare(b.path));
    };

    const re = /@\[\[([^\]\n]+)\]\]|(^|\s)#([\p{L}\p{N}_/-]+)/gu;
    let m;
    while ((m = re.exec(text))) {
      if (m[1] !== undefined) {
        const inner = m[1].trim();
        const key = '@' + inner.toLowerCase();
        if (seenTokens.has(key)) continue;
        seenTokens.add(key);
        const source = `@[[${inner}]]`;
        const folderPath = normalizeVaultPath(inner.replace(/\/+$/, ''));
        const asFolder = vault.getAbstractFileByPath(folderPath);
        if (inner.endsWith('/') || (asFolder && asFolder.children !== undefined && !metadataCache.getFirstLinkpathDest(inner, ''))) {
          if (!asFolder || asFolder.children === undefined) { out.notFound.push(inner); continue; }
          const files = mdFilesUnder(asFolder);
          groups.push({ source, files: files.slice(0, MENTION_MAX_NOTES), total: files.length, direct: false });
        } else {
          const link = inner.split('|')[0].split('#')[0].trim();
          const file = metadataCache.getFirstLinkpathDest(link, '') || vault.getAbstractFileByPath(normalizeVaultPath(link));
          if (!file || file.children !== undefined) { out.notFound.push(inner); continue; }
          if (file.extension !== 'md') { notes.push(`Not included (not a note): ${file.path}`); continue; }
          groups.push({ source, files: [file], total: 1, direct: true });
        }
      } else {
        const tag = m[3];
        if (!/\D/.test(tag)) continue;                       // "#123" is not a tag
        const wanted = '#' + tag.toLowerCase();
        const known = Object.keys((metadataCache.getTags && metadataCache.getTags()) || {})
          .some(t => { const l = t.toLowerCase(); return l === wanted || l.startsWith(wanted + '/'); });
        if (!known) continue;                                // plain text, not a tag of this vault
        const key = wanted;
        if (seenTokens.has(key)) continue;
        seenTokens.add(key);
        const files = vault.getMarkdownFiles()
          .filter(f => (getAllTags(metadataCache.getFileCache(f)) || []).some(t => { const l = t.toLowerCase(); return l === wanted || l.startsWith(wanted + '/'); }))
          .sort((a, b) => (b.stat ? b.stat.mtime : 0) - (a.stat ? a.stat.mtime : 0));
        groups.push({ source: `#${tag}`, files: files.slice(0, MENTION_MAX_NOTES), total: files.length, direct: false });
      }
    }

    // Read what fits; the rest is reported, not silently dropped.
    let used = 0;
    const cut = [];
    for (const g of groups) {
      let included = 0;
      for (const f of g.files) {
        if (have.has(f.path)) { included++; continue; }
        let content;
        try { content = await vault.cachedRead(f); } catch (_) { continue; }
        if (content.length > MENTION_NOTE_MAX_CHARS) {
          content = content.slice(0, MENTION_NOTE_MAX_CHARS) + `\n[… cut: ${content.length - MENTION_NOTE_MAX_CHARS} more characters]`;
          cut.push(f.path);
        }
        if (used + content.length > MENTION_TOTAL_MAX_CHARS) continue;
        used += content.length;
        have.add(f.path);
        included++;
        out.attachments.push({ name: g.direct ? f.basename : f.path, path: f.path, content, metadata: null, scope: 'full', isImage: false, mention: true });
      }
      if (included < g.total) notes.push(`${g.source}: ${included} of ${g.total} notes included (size limit).`);
    }
    if (cut.length) notes.push(`Cut to ${MENTION_NOTE_MAX_CHARS} characters: ${cut.slice(0, 5).join(', ')}${cut.length > 5 ? ` and ${cut.length - 5} more` : ''}`);
    for (const nf of out.notFound) notes.push(`Not found: ${nf}`);
    if (notes.length) out.attachments.push({ name: 'Mentions', path: null, content: notes.join('\n'), metadata: null, scope: 'full', isImage: false, mention: true });
    return out;
  }
}

// ==================== PERSISTENT MEMORY ====================
//
// FR-2.1 / FR-L2. memory.md and user.md in the AI folder are injected as layer 3 when memory is on.
// The model can propose changes with the update_memory tool, but nothing is ever written until the
// user approves the change in the diff review (the same one used for AI file edits).

const MEMORY_FILES = { memory: 'memory.md', user: 'user.md' };
const MEMORY_MAX_CHARS = 6000;          // a file this large is not grown further; the model has to remove or shorten first
const MEMORY_ENTRY_MAX_CHARS = 500;
const MEMORY_MAX_OPERATIONS = 10;

/**
 * Applies add / replace / remove operations to the text of memory.md or user.md, line by line.
 * Pure: returns the new text or a short error the model can act on.
 * @returns {{ content: string, changed: boolean, error?: string }}
 */
function applyMemoryOperations(content, operations, maxChars = MEMORY_MAX_CHARS) {
  const clean = (t) => String(t == null ? '' : t).replace(/<!--|-->/g, ' ').replace(/\s+/g, ' ').trim();
  const key = (line) => line.replace(/^\s*[-*]\s+/, '').trim().toLowerCase();
  let lines = String(content || '').replace(/\r\n/g, '\n').split('\n');
  while (lines.length && lines[lines.length - 1] === '') lines.pop();

  const find = (needle) => {
    const n = clean(needle).toLowerCase();
    if (!n) return { error: 'A "match" is needed to find the entry.' };
    const hits = lines.map((l, i) => (l.toLowerCase().includes(n) ? i : -1)).filter(i => i >= 0);
    if (!hits.length) return { error: `No entry contains "${clean(needle)}".` };
    if (hits.length > 1) return { error: `"${clean(needle)}" matches ${hits.length} entries; use a longer, more specific match.` };
    return { index: hits[0] };
  };

  for (const op of operations) {
    const action = op && op.action;
    const text = clean(op && op.text);
    if (action === 'add') {
      if (!text) return { content, changed: false, error: 'An "add" needs "text".' };
      if (text.length > MEMORY_ENTRY_MAX_CHARS) return { content, changed: false, error: `An entry is limited to ${MEMORY_ENTRY_MAX_CHARS} characters; shorten it.` };
      if (!lines.some(l => key(l) === text.toLowerCase())) lines.push(`- ${text}`);
    } else if (action === 'replace') {
      if (!text) return { content, changed: false, error: 'A "replace" needs the new "text".' };
      if (text.length > MEMORY_ENTRY_MAX_CHARS) return { content, changed: false, error: `An entry is limited to ${MEMORY_ENTRY_MAX_CHARS} characters; shorten it.` };
      const f = find(op.match); if (f.error) return { content, changed: false, error: f.error };
      lines[f.index] = /^\s*[-*]\s+/.test(lines[f.index]) ? `- ${text}` : text;
    } else if (action === 'remove') {
      const f = find(op.match); if (f.error) return { content, changed: false, error: f.error };
      lines.splice(f.index, 1);
    } else {
      return { content, changed: false, error: `Unknown action "${action}". Use add, replace or remove.` };
    }
  }

  const next = lines.join('\n') + '\n';
  const before = String(content || '').replace(/\r\n/g, '\n');
  if (next.length > maxChars && next.length > before.length) {
    return { content, changed: false, error: `That would make the file ${next.length} characters; the limit is ${maxChars}. Remove or shorten entries first.` };
  }
  return { content: next, changed: next !== before.replace(/\n*$/, '\n') && next !== before };
}

class PersistentMemory {
  constructor(plugin) {
    this.plugin = plugin;
    this._text = '';
  }

  get enabled() { return this.plugin.settings.memoryEnabled === true && this.plugin.aiFolder.active; }

  /** Reads both files (unchanged ones come from the cache) into the text of layer 3. */
  async refresh() {
    if (!this.enabled) { this._text = ''; return; }
    const af = this.plugin.aiFolder;
    const [memory, user] = await Promise.all([af.readText('memory.md').catch(() => ''), af.readText('user.md').catch(() => '')]);
    const parts = [];
    if (memory) parts.push(`What you remember from earlier conversations (memory.md):\n${memory}`);
    if (user) parts.push(`What you know about the user (user.md):\n${user}`);
    this._text = parts.join('\n\n');
  }

  layerText() { return this.enabled ? this._text : ''; }

  /** Adds update_memory to the registry (once); it is only offered while memory is on. */
  ensureToolRegistered() {
    const registry = this.plugin.toolRegistry;
    if (registry.get('update_memory')) return;
    registry.register({
      name: 'update_memory',
      title: 'Update memory',
      description:
        'Proposes a change to what you remember across conversations. The user reviews every change and can decline it; nothing is saved without their approval. ' +
        'Use file "memory" for lasting facts and context worth keeping (projects, decisions, how the user likes to work) and file "user" for facts about the user (name, role, languages, preferences). ' +
        'Only for lasting, useful information the user shared or asked you to remember, never for passwords or secrets. Keep entries to one short line each and replace or remove outdated ones instead of adding near-duplicates.',
      parameters: {
        type: 'object',
        properties: {
          file: { type: 'string', enum: ['memory', 'user'], description: '"memory" or "user".' },
          operations: {
            type: 'array',
            description: 'One or more changes to this file.',
            items: {
              type: 'object',
              properties: {
                action: { type: 'string', enum: ['add', 'replace', 'remove'] },
                text: { type: 'string', description: 'The entry to add, or the new text for a replace. One short line.' },
                match: { type: 'string', description: 'For replace and remove: a distinctive part of the existing entry.' }
              },
              required: ['action']
            }
          }
        },
        required: ['file', 'operations']
      },
      permission: 'write',
      source: 'builtin',
      defaultPolicy: 'allow',          // it only proposes: the review below is the approval (FR-L2)
      isAvailable: () => this.enabled,
      handler: (args, ctx) => this._propose(args, ctx)
    });
  }

  async _propose({ file, operations }, ctx) {
    const fileName = MEMORY_FILES[file];
    if (!fileName) return { content: 'The file must be "memory" or "user".', isError: true };
    if (!Array.isArray(operations) || !operations.length) return { content: 'Give at least one operation.', isError: true };
    if (operations.length > MEMORY_MAX_OPERATIONS) return { content: `At most ${MEMORY_MAX_OPERATIONS} operations at a time.`, isError: true };

    const { vault } = this.plugin.app;
    const path = this.plugin.aiFolder.child(fileName);
    let tfile = vault.getAbstractFileByPath(path);
    if (tfile && tfile.children !== undefined) return { content: `${fileName} is a folder.`, isError: true };
    const original = tfile ? await vault.read(tfile) : '';

    const result = applyMemoryOperations(original, operations);
    if (result.error) return { content: result.error, isError: true };
    if (!result.changed) return 'No change needed: that is already recorded.';

    if (!tfile) tfile = await vault.create(path, AI_FOLDER_FILES[fileName] + '\n');       // a missing template file may be recreated (FR-F)
    const verdict = await this.plugin.reviewFileChange(tfile, original, result.content, ctx && ctx.signal);
    return verdict === 'approved'
      ? `Saved to ${fileName}.`
      : `The user declined this change to ${fileName}. Do not propose it again in this conversation.`;
  }
}

// ==================== CHAT HISTORY SEARCH ====================
//
// FR-2.2. A keyword index (BM25) over past conversations, kept in the plugin folder as
// chat-index.json. No embeddings, no requests: it only runs on this device. Before a message is
// sent, the best matches from OTHER parts of the history become one short digest layer.

const CHAT_INDEX_VERSION = 1;
const CHAT_DIGEST_MAX_CONVERSATIONS = 3;
const CHAT_DIGEST_MAX_CHARS = 1500;
const CHAT_SNIPPET_CHARS = 220;
const CHAT_QUERY_MAX_TERMS = 12;
const CHAT_MIN_COVERAGE = 0.3;        // a match must reach this share of the best score the query could get
const CHAT_NOTE_PASSAGE_CHARS = 700;    // saved notes are indexed in passages of about this size
const CHAT_NOTE_MAX_BYTES = 1500000;    // bigger notes are skipped
const CHAT_NOTE_MAX_PASSAGES = 600;
const CHAT_NOTES_PER_REFRESH = 40;      // new/changed notes read per search, so the first indexing never stalls a send
const CHAT_MIN_SINGLE_IDF = 1.2;      // a query of one meaningful word needs that word to be fairly rare

/** Splits a saved note into passages of roughly CHAT_NOTE_PASSAGE_CHARS (front matter removed). Deterministic. */
function chunkNoteText(text) {
  const body = String(text || '').replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, '');
  const paras = body.split(/\n\s*\n/).map(p => p.trim()).filter(Boolean);
  const out = [];
  let cur = '';
  const push = () => { if (cur) { out.push(cur); cur = ''; } };
  for (const p of paras) {
    if (p.length > CHAT_NOTE_PASSAGE_CHARS * 2) {           // a very long paragraph: cut it up
      push();
      for (let i = 0; i < p.length; i += CHAT_NOTE_PASSAGE_CHARS) out.push(p.slice(i, i + CHAT_NOTE_PASSAGE_CHARS));
      continue;
    }
    if (cur && cur.length + p.length > CHAT_NOTE_PASSAGE_CHARS) push();
    cur = cur ? cur + '\n\n' + p : p;
  }
  push();
  return out.slice(0, CHAT_NOTE_MAX_PASSAGES);
}

/** Lower-cases and folds Arabic spelling variants (diacritics, alef, ya, ta marbuta) so they match each other. */
function foldSearchText(text) {
  return String(text || '').toLowerCase()
    .replace(/[\u064B-\u065F\u0670\u0640]/g, '')          // Arabic diacritics and tatweel
    .replace(/[\u0622\u0623\u0625]/g, '\u0627')            // alef variants
    .replace(/\u0649/g, '\u064A')                          // alef maqsura → ya
    .replace(/\u0629/g, '\u0647');                         // ta marbuta → ha
}

// folded the same way as the text, or the Arabic ones would never match
const SEARCH_STOPWORDS = new Set((
  'the and for are but not you your with this that have has had was were will would can could should from they them their what when where which who whom how why ' +
  'about into than then there here also just like some any all one out our its it is in on at of to be as an or if so do does did me my we us i ' +
  'في من على إلى الى عن مع هذا هذه ذلك التي الذي ان أن إن كان كانت يكون هو هي هم ما لا لم لن قد كل بعد قبل او أو ثم'
).split(/\s+/).map(foldSearchText));

/** Folds, drops stopwords, light plural handling. */
function searchTokens(text) {
  const t = foldSearchText(text);
  const out = [];
  for (const m of t.matchAll(/[\p{L}\p{N}]+/gu)) {
    let w = m[0];
    if (w.length < 2) continue;
    if (/^[\u0600-\u06FF]/.test(w) && w.length > 4 && w.startsWith('\u0627\u0644')) w = w.slice(2);     // Arabic "al-"
    else if (/^[a-z]+$/.test(w) && w.length > 3) {
      if (w.endsWith('ies')) w = w.slice(0, -3) + 'y';
      else if (w.endsWith('s') && !/(ss|us|is)$/.test(w)) w = w.slice(0, -1);
    }
    if (SEARCH_STOPWORDS.has(w)) continue;
    out.push(w);
  }
  return out;
}

function plainMessageText(m) {
  const c = Array.isArray(m.content) ? m.content.map(p => p.text || '').join(' ') : (m.content || '');
  return String(c).replace(/<!--[\s\S]*?-->/g, ' ').trim();
}

class ChatSearchIndex {
  constructor(plugin) {
    this.plugin = plugin;
    this._sessions = null;       // sessionId → { sig, docs: [{ r, role, ts, len, tf }] }
    this._inv = null;            // term → [[sessionId, docIdx, tf], …]; built on demand
    this._stats = null;          // { N, avgdl, df }
    this._dirty = false;
    this._saveTimer = null;
  }

  get path() { return `${this.plugin.manifest.dir}/chat-index.json`; }

  async _load() {
    if (this._sessions) return;
    this._sessions = new Map();
    try {
      const parsed = JSON.parse(await this.plugin.app.vault.adapter.read(this.path));
      if (parsed && parsed.v === CHAT_INDEX_VERSION && parsed.sessions) {
        for (const [id, s] of Object.entries(parsed.sessions)) this._sessions.set(id, s);
      }
    } catch (_) { /* no index yet */ }
  }

  _signature(s) {
    let len = 0;
    const nodes = [...s.messages, ...(s.inactiveNodes || [])];
    for (const m of nodes) len += typeof m.content === 'string' ? m.content.length : 0;
    return `${nodes.length}:${len}:${s.lastModified || 0}`;
  }

  /** Which sources the user chose: the chat list, the saved notes, or both. */
  _source() {
    const v = this.plugin.settings.chatSearchSource;
    return v === 'saved' || v === 'both' ? v : 'sessions';
  }

  /** Index entries of saved notes use the key "f:<vault path>"; conversations use their id. */
  _isNoteKey(key) { return key.startsWith('f:'); }

  /** Indexes every conversation (and, if chosen, saved note) that is new or changed and forgets deleted ones. */
  async refresh() {
    await this._load();
    const source = this._source();
    const live = source === 'saved' ? [] : this.plugin._sessionManager.sessions.filter(s => !s.isTemporary && s.messages && s.messages.length);
    const ids = new Set(live.map(s => s.id));
    for (const id of [...this._sessions.keys()]) if (!this._isNoteKey(id) && !ids.has(id)) { this._sessions.delete(id); this._dirty = true; }
    await this._refreshNotes(source !== 'sessions');
    for (const s of live) {
      const sig = this._signature(s);
      const hit = this._sessions.get(s.id);
      if (hit && hit.sig === sig) continue;
      const docs = [];
      [...s.messages, ...(s.inactiveNodes || [])].forEach((m, r) => {
        if (m.placeholder || m.isDiffSummary || (m.role !== 'user' && m.role !== 'assistant')) return;
        const terms = searchTokens(plainMessageText(m));
        if (!terms.length) return;
        const tf = {};
        for (const t of terms) tf[t] = (tf[t] || 0) + 1;
        docs.push({ r, role: m.role === 'user' ? 'u' : 'a', ts: m.timestamp || 0, len: terms.length, tf });
      });
      this._sessions.set(s.id, { sig, docs });
      this._dirty = true;
    }
    if (this._dirty) { this._inv = null; this._stats = null; this._scheduleSave(); }
  }

  /** Passages of one saved note, ready for the index. */
  _noteDocs(text, ts) {
    const docs = [];
    chunkNoteText(text).forEach((passage, r) => {
      const terms = searchTokens(passage);
      if (!terms.length) return;
      const tf = {};
      for (const t of terms) tf[t] = (tf[t] || 0) + 1;
      docs.push({ r, role: 'n', ts: ts || 0, len: terms.length, tf });
    });
    return docs;
  }

  /**
   * Keeps the index of the notes in the Conversations Folder up to date: new or changed notes are
   * read (a limited number per call), notes that no longer exist — or everything, once the source
   * no longer includes saved notes — are dropped.
   */
  async _refreshNotes(wanted) {
    const vault = this.plugin.app.vault;
    const folder = (this.plugin.settings.conversationsFolder || 'AI Conversations').replace(/\/+$/, '');
    const files = wanted ? vault.getMarkdownFiles().filter(f => f.path.startsWith(folder + '/')) : [];
    const keep = new Set(files.map(f => 'f:' + f.path));
    for (const id of [...this._sessions.keys()]) if (this._isNoteKey(id) && !keep.has(id)) { this._sessions.delete(id); this._dirty = true; }

    let budget = CHAT_NOTES_PER_REFRESH;
    for (const f of files) {
      const key = 'f:' + f.path;
      const sig = `${f.stat.mtime}:${f.stat.size}`;
      const hit = this._sessions.get(key);
      if (hit && hit.sig === sig) continue;
      if (budget-- <= 0) break;
      let docs = [];
      if (f.stat.size <= CHAT_NOTE_MAX_BYTES) {
        try { docs = this._noteDocs(await vault.cachedRead(f), f.stat.mtime); } catch (_) { continue; }
      }
      this._sessions.set(key, { sig, kind: 'note', docs });
      this._dirty = true;
    }
  }

  /** A saved note was deleted or moved away (a folder takes everything under it along). */
  async forgetNote(path) {
    await this._load();
    let changed = false;
    for (const id of [...this._sessions.keys()]) {
      if (this._isNoteKey(id) && (id === 'f:' + path || id.startsWith('f:' + path + '/'))) { this._sessions.delete(id); changed = true; }
    }
    if (changed) { this._dirty = true; this._inv = null; this._stats = null; this._scheduleSave(); }
  }

  /** Drops one conversation from the index right away (it was deleted or emptied). */
  async forget(sessionId) {
    await this._load();
    if (this._sessions.delete(sessionId)) {
      this._dirty = true; this._inv = null; this._stats = null;
      this._scheduleSave();
    }
  }

  /**
   * Removes entries of conversations that no longer exist — for example ones deleted before
   * deletions were passed on to the index. Cheap; runs once when the plugin starts.
   */
  async prune() {
    await this._load();
    const live = new Set(this.plugin._sessionManager.sessions
      .filter(s => !s.isTemporary && s.messages && s.messages.length).map(s => s.id));
    let changed = false;
    for (const id of [...this._sessions.keys()]) {
      const gone = this._isNoteKey(id) ? !this.plugin.app.vault.getAbstractFileByPath(id.slice(2)) : !live.has(id);
      if (gone) { this._sessions.delete(id); changed = true; }
    }
    if (changed) { this._dirty = true; this._inv = null; this._stats = null; this._scheduleSave(); }
  }

  _scheduleSave() {
    if (this._saveTimer) return;
    this._saveTimer = setTimeout(() => { this._saveTimer = null; this.flush(); }, 5000);
    if (this._saveTimer && this._saveTimer.unref) this._saveTimer.unref();
  }

  async flush() {
    if (!this._dirty || !this._sessions) return;
    this._dirty = false;
    try {
      const sessions = {};
      for (const [id, s] of this._sessions) sessions[id] = s;
      await this.plugin.app.vault.adapter.write(this.path, JSON.stringify({ v: CHAT_INDEX_VERSION, sessions }));
    } catch (_) { this._dirty = true; }
  }

  _build() {
    if (this._inv) return;
    const inv = new Map();
    let N = 0, total = 0;
    for (const [sid, s] of this._sessions) {
      s.docs.forEach((d, i) => {
        N++; total += d.len;
        for (const [t, f] of Object.entries(d.tf)) {
          let list = inv.get(t);
          if (!list) inv.set(t, list = []);
          list.push([sid, i, f]);
        }
      });
    }
    this._inv = inv;
    this._stats = { N, avgdl: N ? total / N : 1 };
  }

  /**
   * BM25 over every indexed message.
   * @param {string}   query
   * @param {Function} [skip]  (sessionId, doc) → true to leave a message out
   * @returns {Array<{ sid, doc, score, matched }>} best first
   */
  search(query, skip = null) {
    this._build();
    const { N, avgdl } = this._stats;
    const terms = [...new Set(searchTokens(query))];
    if (!N || !terms.length) return [];
    const idf = new Map();
    for (const t of terms) { const df = (this._inv.get(t) || []).length; if (df) idf.set(t, Math.log(1 + (N - df + 0.5) / (df + 0.5))); }
    const ranked = [...idf.entries()].sort((a, b) => b[1] - a[1]).slice(0, CHAT_QUERY_MAX_TERMS);
    const k1 = 1.2, b = 0.75;
    const scores = new Map();
    for (const [t, w] of ranked) {
      for (const [sid, i, tf] of this._inv.get(t)) {
        const doc = this._sessions.get(sid).docs[i];
        if (skip && skip(sid, doc)) continue;
        const key = sid + '\u0000' + i;
        let e = scores.get(key);
        if (!e) scores.set(key, e = { sid, doc, score: 0, matched: new Set() });
        e.score += w * (tf * (k1 + 1)) / (tf + k1 * (1 - b + b * doc.len / avgdl));
        e.matched.add(t);
      }
    }
    const out = [...scores.values()].map(e => ({ sid: e.sid, doc: e.doc, score: e.score, matched: [...e.matched] })).sort((x, y) => y.score - x.score);
    // what the query itself is worth, for judging how good the best match is
    Object.defineProperty(out, 'query', { value: { idf: new Map(ranked), total: ranked.reduce((n, [, w]) => n + w, 0), words: terms.length } });
    return out;
  }

  /** The digest line for a hit inside a saved note, or '' when it cannot be used. */
  async _noteLine(h, day, openNames) {
    const vault = this.plugin.app.vault;
    const f = vault.getAbstractFileByPath(h.sid.slice(2));
    if (!f || f.extension === undefined) return '';
    if (openNames && openNames.has(f.basename.replace(/ \(\d+\)$/, ''))) return '';       // same conversation is searched in the chat list
    const entry = this._sessions.get(h.sid);
    if (!entry || entry.sig !== `${f.stat.mtime}:${f.stat.size}`) return '';                // note changed since it was indexed
    let text;
    try { text = await vault.cachedRead(f); } catch (_) { return ''; }
    const passage = chunkNoteText(text)[h.doc.r];
    if (!passage) return '';
    return `- saved note "${collapseToLine(f.basename, 60)}"${day ? ` (${day})` : ''} — ${this._snippet(passage, h.matched)}`;
  }

  /** Window of the message around the first matched word. */
  _snippet(text, matched) {
    const flat = text.replace(/\s+/g, ' ').trim();
    const lower = flat.toLowerCase();
    let at = -1;
    for (const t of matched) { const i = lower.indexOf(t); if (i >= 0 && (at < 0 || i < at)) at = i; }
    const start = Math.max(0, (at < 0 ? 0 : at) - 70);
    const out = flat.slice(start, start + CHAT_SNIPPET_CHARS);
    return (start > 0 ? '…' : '') + out + (start + CHAT_SNIPPET_CHARS < flat.length ? '…' : '');
  }

  /**
   * A short digest of the best matches for `query` outside the part of `current` that is already
   * being sent. Empty when nothing matches well enough.
   */
  async digest(query, current) {
    await this.refresh();
    const q = String(query || '').replace(/```[\s\S]*?```/g, ' ').replace(/https?:\/\/\S+/g, ' ').replace(/@\[\[[^\]]*\]\]/g, ' ').slice(0, 600);
    const inWindow = (sid, doc) => {
      if (!current || sid !== current.id) return false;
      return doc.r >= Math.max(0, current.messages.length - REQUEST_WINDOW_MESSAGES) && doc.r < current.messages.length;
    };
    const hits = this.search(q, inWindow);
    if (!hits.length) return '';
    const { idf, total, words } = hits.query;
    const good = hits.filter(h => h.score >= CHAT_MIN_COVERAGE * total &&
      (h.matched.length >= 2 || (words === 1 && (idf.get(h.matched[0]) || 0) >= CHAT_MIN_SINGLE_IDF)));
    if (!good.length) return '';

    const seen = new Set();
    const lines = [];
    let size = 0;
    // With both sources, a note that is just the saved copy of a conversation in the chat list is skipped
    const openNames = this._source() === 'both'
      ? new Set(this.plugin._sessionManager.sessions.filter(x => !x.isTemporary && x.messages && x.messages.length)
          .map(x => String(x.name || '').replace(/[\\/:*?"<>|]/g, '_')))
      : null;
    for (const h of good) {
      if (seen.has(h.sid)) continue;
      const day = h.doc.ts ? new Date(h.doc.ts).toISOString().slice(0, 10) : '';
      let line;
      if (this._isNoteKey(h.sid)) {
        line = await this._noteLine(h, day, openNames);
        if (!line) continue;
      } else {
        const s = this.plugin._sessionManager.getSession(h.sid);
        const node = s && [...s.messages, ...(s.inactiveNodes || [])][h.doc.r];
        if (!node) continue;
        line = `- "${collapseToLine(s.name || 'Untitled', 60)}"${day ? ` (${day})` : ''} — ${h.doc.role === 'u' ? 'you said' : 'the AI said'}: ${this._snippet(plainMessageText(node), h.matched)}`;
      }
      seen.add(h.sid);
      if (size + line.length > CHAT_DIGEST_MAX_CHARS) break;
      lines.push(line); size += line.length;
      if (lines.length >= CHAT_DIGEST_MAX_CONVERSATIONS) break;
    }
    if (!lines.length) return '';
    return 'Possibly relevant parts of earlier conversations (found by keyword search of the chat history; use them only if they help):\n' + lines.join('\n');
  }
}

// ==================== CONTEXT COMPRESSION & SKILL SUGGESTION ====================
//
// FR-2.4. When a conversation nears the model's context window (the catalog's limit, so only for
// models that have one), the earliest messages are summarized. Nothing is deleted: the summary is
// a field on the message it ends with, requests send the summary in place of those messages, and
// "Undo" simply removes the field.
//
// FR-2.3. After a task that took several steps, the chat offers to turn the procedure into a draft
// skill. Nothing is drafted until the user says yes, and nothing is saved until they have edited it.

const COMPRESSION_KEEP_RECENT = 6;          // the newest messages always stay verbatim
const COMPRESSION_MIN_MESSAGES = 4;         // not worth a request for fewer
const COMPRESSION_MESSAGE_MAX_CHARS = 3000;
const COMPRESSION_TRANSCRIPT_MAX_CHARS = 60000;
const SKILL_OFFER_MIN_STEPS = 3;            // tool calls + vault lookups + proposed file edits in one reply

class ContextCompressor {
  constructor(plugin) {
    this.plugin = plugin;
    this._busy = new Set();
  }

  get enabled() { return this.plugin.settings.contextCompression === true; }

  /** Share of the context window (0.3–0.95) at which compression starts. */
  get threshold() {
    const t = Number(this.plugin.settings.contextCompressionThreshold);
    return Math.min(95, Math.max(30, Number.isFinite(t) && t > 0 ? t : 80)) / 100;
  }

  /** Needs the catalog's limit for the model, so local and custom models are never compressed. */
  due(session) {
    const info = this.plugin.getContextInfo(session && session.lastRequestTokens);
    return !!info && info.ratio >= this.threshold;
  }

  _transcript(session, plan) {
    const lines = [];
    let size = 0;
    for (let i = plan.to; i >= plan.from; i--) {            // newest first, so the length cap drops the oldest
      const m = session.messages[i];
      let text = plainMessageText(m);
      const files = (m.attachments || []).filter(a => a && a.name).map(a => a.name);
      if (!text && !files.length) continue;
      if (text.length > COMPRESSION_MESSAGE_MAX_CHARS) text = text.slice(0, COMPRESSION_MESSAGE_MAX_CHARS) + ' […]';
      const line = `${m.role === 'user' ? 'User' : 'Assistant'}: ${text}${files.length ? ` [attached: ${files.join(', ')}]` : ''}`;
      if (size + line.length > COMPRESSION_TRANSCRIPT_MAX_CHARS) { lines.unshift('(Earlier messages left out for length.)'); break; }
      lines.unshift(line);
      size += line.length;
    }
    return lines.join('\n\n');
  }

  async _summarize(session, plan) {
    const system =
      'You condense the earlier part of a conversation so an AI assistant can carry on with it. ' +
      'Write a faithful summary in the same language as the conversation: what the user wants and has decided, facts and preferences they gave, ' +
      'what was done (files or notes touched, results), and anything still open. Short paragraphs or bullets, no preamble, nothing invented, about 300 words at most.';
    const user = (plan.previous ? `Summary so far:\n${plan.previous}\n\nNewer messages to fold in:\n\n` : 'Conversation to summarize:\n\n') + this._transcript(session, plan);
    const result = await this.plugin.apiManager.sendMessage({
      messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
      temperature: 0.2, max_tokens: 1200, stream: false
    }, { timeoutMs: this.plugin.settings.timeoutMs });
    const text = String((result && result.final) || '').trim();
    if (!text) throw new Error('The model returned no summary.');
    return text;
  }

  /**
   * Summarizes the earliest messages of a conversation if it is at the threshold.
   * @returns {Promise<'compressed'|'skipped'|'failed'>}
   */
  async run(sessionId) {
    if (!this.enabled || this._busy.has(sessionId)) return 'skipped';
    const sm = this.plugin._sessionManager;
    const session = sm.getSession(sessionId);
    if (!session || !this.due(session)) return 'skipped';
    if ((session.compressionPausedUntil || 0) > session.messages.length) return 'skipped';   // after a failure or an Undo
    const plan = sm.compressionPlan(session);
    if (!plan) return 'skipped';
    this._busy.add(sessionId);
    try {
      const text = await this._summarize(session, plan);
      sm.setSummary(session, plan.node, text);
      session.ctxWarnLevel = 0;
      this.plugin.saveState();
      this.plugin.refreshChatViews();
      return 'compressed';
    } catch (e) {
      session.compressionPausedUntil = session.messages.length + 4;
      if (!(e instanceof UserAbortError)) {
        new Notice(`Couldn't summarize earlier messages. ${String(friendlyErrorMessage(e, this.plugin)).split('\n')[0]}`);
      }
      return 'failed';
    } finally {
      this._busy.delete(sessionId);
    }
  }
}

/** "My Skill Name!" → "my-skill-name"; '' when nothing usable is left. */
function skillNameFrom(text) {
  return String(text || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60).replace(/-+$/g, '');
}

class SkillDrafter {
  constructor(plugin) { this.plugin = plugin; }

  get enabled() {
    return this.plugin.settings.skillSuggestion === true && this.plugin.aiFolder.active && this.plugin.skills.enabled;
  }

  /** Worth offering: it took several steps and was not itself a skill being run. */
  eligible(reply) {
    return this.enabled && !!reply && !reply.stoppedEarly && !!reply.displayText && (reply.steps || 0) >= SKILL_OFFER_MIN_STEPS;
  }

  /** Asks the model for a draft SKILL.md based on the task just finished. */
  async draft({ task, answer, trace }) {
    const system =
      'You write reusable skills for an AI assistant. A skill is a SKILL.md file: YAML front matter with "name" (lowercase letters, digits and hyphens) and ' +
      '"description" (one sentence: what it does and when to use it), then Markdown instructions: a short numbered procedure, then tips and pitfalls. ' +
      'Base it on the task below but make it general: no personal data or one-off values. Reply with the file content only.';
    const user =
      `The user's request:\n${String(task || '').slice(0, 2000)}\n\nSteps taken:\n${(trace || []).slice(0, 30).join('\n') || '(not recorded)'}\n\nThe final answer:\n${String(answer || '').slice(0, 3000)}`;
    const result = await this.plugin.apiManager.sendMessage({
      messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
      temperature: 0.3, max_tokens: 1500, stream: false
    }, { timeoutMs: this.plugin.settings.timeoutMs });
    const raw = String((result && result.final) || '').trim().replace(/^```(?:markdown|md)?\s*\n/, '').replace(/\n```\s*$/, '');
    if (!raw) throw new Error('The model returned no draft.');
    const { data, body } = parseFrontmatter(raw);
    const heading = (/^#\s+(.+)$/m.exec(body) || [])[1];
    return {
      name: skillNameFrom(data.name || heading || String(task || '').split(/\s+/).slice(0, 4).join(' ')) || 'new-skill',
      description: collapseToLine(data.description || firstTextLine(body), 300),
      body: body.trim()
    };
  }

  /** Writes Skills/<name>/SKILL.md. Never overwrites: an existing skill of that name is an error. */
  async save(draft) {
    const name = skillNameFrom(draft.name);
    if (!name) throw new Error('Give the skill a name (letters, numbers and hyphens).');
    const description = collapseToLine(draft.description, 300);
    if (!description) throw new Error('Add a one-line description.');
    const body = String(draft.body || '').trim();
    if (!body) throw new Error('The instructions are empty.');
    if (!this.plugin.aiFolder.active) throw new Error('Choose an AI folder first.');

    const { vault } = this.plugin.app;
    const skillsDir = this.plugin.aiFolder.child('Skills');
    const dir = `${skillsDir}/${name}`;
    if (await vault.adapter.exists(dir)) throw new Error(`A skill named "${name}" already exists. Choose another name.`);
    if (!(await vault.adapter.exists(skillsDir))) await vault.createFolder(skillsDir);
    await vault.createFolder(dir);
    await vault.create(`${dir}/SKILL.md`, `---\nname: ${name}\ndescription: ${JSON.stringify(description)}\n---\n\n${body}\n`);
    await this.plugin.skills.refresh().catch(() => {});
    return { name, path: `${dir}/SKILL.md` };
  }
}

/** Edit a drafted skill before it is saved. Nothing is written until "Save skill". */
class SkillDraftModal extends Modal {
  constructor(app, draft, onSave) {
    super(app);
    this.draft = { ...draft };
    this.onSave = onSave;          // async (draft) → throws an Error with a short message when it cannot save
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.style.padding = '20px';
    const title = contentEl.createEl('h3', { text: 'Save as a skill' });
    title.style.margin = '0 0 12px';

    const field = (label, el) => { const l = contentEl.createEl('label', { text: label }); l.style.display = 'block'; l.style.fontWeight = '600'; l.style.margin = '10px 0 4px'; return el; };
    const style = (el) => { el.style.width = '100%'; el.style.boxSizing = 'border-box'; el.style.padding = '8px'; el.style.borderRadius = '6px'; el.style.border = '1px solid var(--background-modifier-border)'; el.style.background = 'var(--background-primary)'; el.style.color = 'var(--text-normal)'; return el; };

    this.nameEl = style(field('Name', contentEl.createEl('input', { attr: { type: 'text' } })));
    this.nameEl.value = this.draft.name;
    this.descEl = style(field('Description', contentEl.createEl('input', { attr: { type: 'text' } })));
    this.descEl.value = this.draft.description;
    this.bodyEl = style(field('Instructions', contentEl.createEl('textarea')));
    this.bodyEl.value = this.draft.body;
    this.bodyEl.rows = 12;
    this.bodyEl.style.minHeight = '220px';
    this.bodyEl.style.fontFamily = 'var(--font-monospace)';
    this.bodyEl.setAttribute('dir', 'auto');

    this.errorEl = contentEl.createDiv();
    this.errorEl.style.color = 'var(--text-error)';
    this.errorEl.style.fontSize = '13px';
    this.errorEl.style.minHeight = '18px';
    this.errorEl.style.marginTop = '8px';

    const row = contentEl.createDiv();
    row.style.display = 'flex'; row.style.justifyContent = 'flex-end'; row.style.gap = '8px'; row.style.marginTop = '8px';
    const cancel = row.createEl('button', { text: 'Cancel' });
    cancel.style.minHeight = '36px';
    cancel.addEventListener('click', () => this.close());
    this.saveBtn = row.createEl('button', { text: 'Save skill', cls: 'mod-cta' });
    this.saveBtn.style.minHeight = '36px';
    this.saveBtn.addEventListener('click', () => this._save());
  }

  async _save() {
    this.saveBtn.disabled = true;
    this.errorEl.textContent = '';
    try {
      await this.onSave({ name: this.nameEl.value, description: this.descEl.value, body: this.bodyEl.value });
      this.close();
    } catch (e) {
      this.errorEl.textContent = String((e && e.message) || e).split('\n')[0];
      this.saveBtn.disabled = false;
    }
  }
}

// ==================== PERMISSIONS FOR FILE OPERATIONS & PLAN MODE ====================
//
// FR-3.5. File operations are checked by the same rules as tools. Each kind of operation is a
// named "tool" with a default, so the permission settings can list and change them:
//   reading, creating, copying and editing are on by default (they cannot overwrite anything, and
//   edits are only ever proposed in the diff review); moving and renaming ask first.
// FR-3.1. Plan mode: the AI plans first and nothing is changed until the user approves.

const FILE_OP_TOOLS = {
  file_read:   { title: 'Read files',          description: 'Lists, reads and searches files and folders in your vault.', permission: 'read',  defaultPolicy: 'allow' },
  file_create: { title: 'Create files',        description: 'Creates new files in your vault. It never overwrites an existing file.', permission: 'write', defaultPolicy: 'allow' },
  file_copy:   { title: 'Copy files',          description: 'Copies a file to a new place. It never overwrites an existing file.', permission: 'write', defaultPolicy: 'allow' },
  file_edit:   { title: 'Edit files',          description: 'Proposes changes to existing files. You review every change before it is applied.', permission: 'write', defaultPolicy: 'allow' },
  file_move:   { title: 'Move or rename files', description: 'Moves or renames existing files.', permission: 'write', defaultPolicy: 'ask' }
};
const FILE_OP_TOOL_OF = {
  list: 'file_read', read: 'file_read', search: 'file_read',
  create: 'file_create', copy: 'file_copy', edit: 'file_edit', patch: 'file_edit', move: 'file_move', rename: 'file_move'
};

const PLAN_MODE_RULES =
  'Plan mode is on: the user wants to review a plan before anything is changed.\n' +
  '- Change nothing in this reply: do not create, edit, move, copy or delete files or notes, and do not call tools that write or change anything.\n' +
  '- You may look things up first (list, read or search files) if that makes the plan more accurate.\n' +
  '- Reply with a short numbered plan: each step says what you will do and to which files or notes, in order. Point out anything risky or unclear.\n' +
  '- End by asking the user to approve the plan or tell you what to change. Nothing happens until they approve.';
const PLAN_APPROVED_MESSAGE = 'Plan approved. Please go ahead and carry it out.';
const PLAN_DEFAULT_REQUEST = 'Make a step-by-step plan for the task we are discussing.';

// ==================== SUBAGENTS, VAULT TOOLS & EVENT HOOKS ====================
//
// FR-1.4 / FR-1.6. Both run a model on its own, without a chat bubble, through AgentRunner: a small
// headless loop (model call → tool calls → permission check → result back) that stops at an
// iteration limit and when the user presses Stop.
//
//   Agents/<name>.md   front matter: description, tools (allowed tool names), model (optional);
//                      body: the agent's own prompt. The main agent hands it a task with the
//                      delegate tool and gets the agent's answer back as the tool result.
//   hooks              configured in the plugin settings (never in the vault, so nothing synced into
//                      the vault can register one). A hook runs a command or skill when an event
//                      happens; every run is checked against the "Run hooks" permission (default
//                      Ask). There is no way to run JavaScript.

const SUBAGENT_MAX_ITERATIONS = 6;
const HOOK_MAX_ITERATIONS = 4;
const SUBAGENT_NOTE = 'You were called by another assistant to do one task, and you do not see its conversation. Reply with the result only; it is passed back to that assistant.';
const HOOK_NOTE = 'This runs automatically because of an event, not because the user wrote a message. Do only what the instructions above ask, using your tools if they help, and reply with a one-line result (or nothing).';
const HOOK_EVENTS = {
  beforeFileWrite: 'Before the AI writes files',
  afterResponseGenerated: 'After a reply is written',
  onPluginLoad: 'When the plugin loads'
};
const HOOK_TOOL = {
  name: 'hook_run', title: 'Run hooks', permission: 'write', source: 'builtin', defaultPolicy: 'ask',
  description: 'Runs a command or skill automatically when an event happens: before the AI writes files, after a reply is written, or when the plugin loads.'
};

/** Selection and text of the note the user was last working in (unsaved edits included). */
async function getNoteContextFor(app) {
  const ws = app.workspace;
  let view = null;
  const recent = ws.getMostRecentLeaf && ws.getMostRecentLeaf(ws.rootSplit);
  if (recent && recent.view instanceof MarkdownView) view = recent.view;
  const file = ws.getActiveFile && ws.getActiveFile();
  if (!view && file) {
    view = ws.getLeavesOfType('markdown').map(l => l.view).find(v => v.file && v.file.path === file.path) || null;
  }
  if (view && view.editor) {
    return { selection: view.editor.getSelection() || '', note: view.editor.getValue() || '', hasNote: true };
  }
  if (file && file.extension === 'md') {
    return { selection: '', note: await app.vault.cachedRead(file), hasNote: true };
  }
  return { selection: '', note: '', hasNote: false };
}

class AgentRunner {
  constructor(plugin) { this.plugin = plugin; }

  /**
   * One self-contained model run. Resolves with the final text.
   * @param {Object}   o
   * @param {string[]} [o.system]       system messages, in order
   * @param {string}   o.user           the task
   * @param {string[]|null} [o.tools]   allow-list of tool names; null = every tool the chat has; [] = none
   * @param {boolean}  [o.forSubagent]  include the subagent-only vault tools
   * @param {string[]} [o.exclude]      tool names never offered (e.g. delegate)
   * @param {string}   [o.model]        model to use instead of the selected one (same provider)
   * @param {boolean}  [o.readOnly]     only tools that read (plan mode)
   * @param {AbortSignal} [o.signal]    Stop
   */
  async run({ system = [], user, tools = null, forSubagent = false, exclude = [], model = null, maxIterations = 4, signal = null, readOnly = false }) {
    const plugin = this.plugin;
    const api = plugin.apiManager;
    const apiType = api.activeApiType();
    const modelName = model || plugin.getConfiguredModel(apiType);

    let defs = plugin._toolRegistry ? plugin._toolRegistry.defsFor(apiType, modelName, { readOnly, forSubagent }) : [];
    if (Array.isArray(tools)) { const allow = new Set(tools); defs = defs.filter(d => allow.has(d.name)); }
    defs = defs.filter(d => !exclude.includes(d.name));

    const messages = [...system.filter(Boolean).map(content => ({ role: 'system', content })), { role: 'user', content: user }];
    let active = null;                                   // the request in flight, so Stop can cancel it
    const onAbort = () => { if (active) active.networkManager.abortRequest(active.requestId, true); };
    if (signal) signal.addEventListener('abort', onAbort, { once: true });

    try {
      for (let i = 0; i < maxIterations; i++) {
        if (signal && signal.aborted) throw new UserAbortError();
        const last = i === maxIterations - 1;
        const send = (toolDefs) => api.sendMessage({
          messages, temperature: 0.3, max_tokens: plugin.settings.max_tokens, stream: false,
          ...(model ? { model } : {}),
          tools: toolDefs && toolDefs.length ? toolDefs : undefined,
          toolChoice: (toolDefs && toolDefs.length && last) ? 'none' : undefined
        }, { timeoutMs: plugin.settings.timeoutMs, onRequestStart: (info) => { active = info; } });

        let result;
        try {
          result = await send(defs);
        } catch (e) {
          if (defs.length && e && e.kind === 'tool_unsupported') {         // this model takes no tools: remember, go on without
            defs = [];
            plugin.modelCatalog.markToolsRefused(apiType, modelName).catch(() => {});
            result = await send(null);
          } else throw e;
        }
        if (result && result.aborted) throw new UserAbortError();
        const text = String((result && result.final) || '').trim();
        if (!result || !result.toolCalls || !result.toolCalls.length || last || !defs.length) return text;

        const run = await plugin.toolExecutor.runCalls(result.toolCalls, { signal, readOnly, sessionId: null });
        if (run.stopped) throw new UserAbortError();
        messages.push({ role: 'assistant', content: text, toolCalls: result.toolCalls, raw: result.raw }, ...run.messages);
      }
      return '';
    } finally {
      if (signal) signal.removeEventListener('abort', onAbort);
    }
  }
}

class AgentLibrary {
  constructor(plugin) {
    this.plugin = plugin;
    this._cache = new Map();     // agent name → { path, mtime, size, description }
  }

  get enabled() { return this.plugin.settings.subagentsEnabled !== false && this.plugin.aiFolder.active; }

  hasAgents() { return this.enabled && this._cache.size > 0; }

  list() {
    if (!this.enabled) return [];
    return [...this._cache.entries()].map(([name, e]) => ({ name, description: e.description })).sort((a, b) => a.name.localeCompare(b.name));
  }

  find(name) {
    const want = String(name || '').trim().toLowerCase();
    if (!this.enabled || !want) return null;
    for (const [n, e] of this._cache) if (n.toLowerCase() === want) return { name: n, ...e };
    return null;
  }

  /** Lists Agents/*.md (one-word names). */
  async refresh() {
    if (!this.enabled) { this._cache.clear(); return; }
    const vault = this.plugin.app.vault;
    const root = vault.getAbstractFileByPath(this.plugin.aiFolder.child('Agents'));
    const seen = new Set();
    for (const file of (root && root.children) || []) {
      if (file.children !== undefined || !/\.md$/i.test(file.name)) continue;
      const name = file.name.replace(/\.md$/i, '');
      if (!/^[^\s/\\]+$/.test(name)) continue;
      seen.add(name);
      const mtime = file.stat ? file.stat.mtime : 0;
      const size = file.stat ? file.stat.size : 0;
      const hit = this._cache.get(name);
      if (hit && hit.path === file.path && hit.mtime === mtime && hit.size === size) continue;
      let parsed;
      try { parsed = parseFrontmatter(await vault.cachedRead(file)); } catch (_) { seen.delete(name); continue; }
      const description = String(parsed.data.description || '').trim() || firstTextLine(parsed.body);
      this._cache.set(name, { path: file.path, mtime, size, description });
    }
    for (const name of [...this._cache.keys()]) if (!seen.has(name)) this._cache.delete(name);
  }

  /** The agent's definition, read fresh from the vault. */
  async load(name) {
    const hit = this.find(name);
    if (!hit) return null;
    const file = this.plugin.app.vault.getAbstractFileByPath(hit.path);
    if (!file || file.children !== undefined) return null;
    const { data, body } = parseFrontmatter(await this.plugin.app.vault.cachedRead(file));
    // a YAML list, or a plain "a, b, c" / "[a, b, c]"
    const tools = (Array.isArray(data.tools) ? data.tools : String(data.tools || '').replace(/^\s*\[|\]\s*$/g, '').split(','))
      .map(t => String(t).trim().replace(/^["']|["']$/g, '')).filter(Boolean);
    return { name: hit.name, description: hit.description, tools, model: String(data.model || '').trim(), prompt: body.trim() };
  }

  /** Adds delegate (offered only while there are agents) and the read-only vault tools agents can be given. */
  ensureToolRegistered() {
    const registry = this.plugin.toolRegistry;
    const plugin = this.plugin;
    const fileOpsOn = () => !!plugin.settings.fileOpsScope && plugin.settings.fileOpsScope !== 'disabled';

    if (!registry.get('delegate')) {
      registry.register({
        name: 'delegate',
        title: 'Delegate to an agent',
        description: () =>
          'Hands a self-contained task to one of your specialised agents and returns its answer. The agent does not see this conversation, so put everything it needs in "task". Agents:\n' +
          this.list().map(a => `- ${a.name}: ${collapseToLine(a.description, 160)}`).join('\n'),
        parameters: () => ({
          type: 'object',
          properties: {
            agent: { type: 'string', enum: this.list().map(a => a.name), description: 'Which agent to use.' },
            task: { type: 'string', description: 'The task, with all the context the agent needs.' }
          },
          required: ['agent', 'task']
        }),
        permission: 'read',            // its own tool calls are checked one by one, and only read tools run in plan mode
        source: 'builtin',
        defaultPolicy: 'ask',
        isAvailable: () => this.hasAgents(),
        handler: async ({ agent, task }, ctx) => {
          const def = await this.load(agent);
          if (!def) return { content: `No agent named "${agent}". Available: ${this.list().map(a => a.name).join(', ') || 'none'}.`, isError: true };
          if (!def.prompt) return { content: `The agent "${def.name}" has no instructions.`, isError: true };
          const answer = await plugin.agentRunner.run({
            system: [def.prompt, SUBAGENT_NOTE], user: task, tools: def.tools, forSubagent: true, exclude: ['delegate'],
            model: def.model || null, maxIterations: SUBAGENT_MAX_ITERATIONS, signal: ctx && ctx.signal, readOnly: !!(ctx && ctx.readOnly)
          });
          return answer || '(The agent returned no answer.)';
        }
      });
    }

    const vaultTool = (name, title, description, properties, required, handler, paths) => {
      if (registry.get(name)) return;
      registry.register({
        name, title, description, parameters: { type: 'object', properties, required },
        permission: 'read', source: 'builtin', defaultPolicy: 'allow', policyKey: 'file_read', subagentOnly: true,
        isAvailable: () => fileOpsOn(), paths, handler
      });
    };
    const manager = () => plugin.vaultFileManager;
    vaultTool('list_folder', 'List folder', 'Lists the files and folders in a vault folder.',
      { path: { type: 'string', description: 'Folder path; leave empty for the vault root.' }, recursive: { type: 'boolean', description: 'Include subfolders.' } }, [],
      async ({ path, recursive }) => {
        const entries = await manager().list(path || '', recursive === true);
        return entries.length ? entries.map(e => `${e.type === 'folder' ? '📁' : '📄'} ${e.path}`).join('\n') : '(empty)';
      }, (a) => [a.path].filter(Boolean));
    vaultTool('read_note', 'Read note', 'Returns the text of one file in the vault.',
      { path: { type: 'string', description: 'Path of the file.' } }, ['path'],
      async ({ path }) => manager().read(path), (a) => [a.path].filter(Boolean));
    vaultTool('search_notes', 'Search notes', 'Finds files in the vault that match a topic or keywords, best match first.',
      { query: { type: 'string', description: 'Keywords to look for.' }, goal: { type: 'string', description: 'What you are looking for, in a sentence (optional).' } }, ['query'],
      async ({ query, goal }) => {
        const { results, scanned } = await manager().search(query, goal);
        return results.length
          ? `${results.length} candidate(s) out of ${scanned} file(s):\n` + results.map((r, i) => `${i + 1}. ${r.path} — ${r.score}% match`).join('\n')
          : `No matches among ${scanned} file(s).`;
      });
  }
}

class HookService {
  constructor(plugin) {
    this.plugin = plugin;
    this._running = new Set();
    this._depth = 0;
    this._warned = new Set();
  }

  get enabled() { return this.plugin.settings.hooksEnabled === true; }

  /** Hooks that are complete: a known event, a kind, and a name. */
  list() {
    const hooks = Array.isArray(this.plugin.settings.hooks) ? this.plugin.settings.hooks : [];
    return hooks.filter(h => h && HOOK_EVENTS[h.event] && (h.kind === 'command' || h.kind === 'skill') && h.name);
  }

  has(event) { return this.enabled && this.list().some(h => h.event === event); }

  _describe(event, payload) {
    const cut = (t, n) => { const s = String(t || ''); return s.length > n ? s.slice(0, n) + ' […]' : s; };
    if (event === 'afterResponseGenerated') return `Event: afterResponseGenerated\nThe user wrote:\n${cut(payload.user, 2000)}\n\nThe AI replied:\n${cut(payload.response, 4000)}`;
    if (event === 'beforeFileWrite') {
      const ops = (payload.operations || []).map(o => `- ${o.operation} ${o.path}${o.to ? ` → ${o.to}` : ''}`).join('\n');
      return `Event: beforeFileWrite\nThe AI is about to:\n${ops || '(unknown)'}`;
    }
    return 'Event: onPluginLoad (Obsidian has just started)';
  }

  /**
   * Runs every hook of this event, one after another, and resolves when they are done. A hook run
   * never starts another event, and the same hook never runs twice at once.
   */
  async fire(event, payload = {}, { signal = null, readOnly = false } = {}) {
    if (!this.has(event) || this._depth > 0) return;
    for (const hook of this.list().filter(h => h.event === event)) {
      if (this._running.has(hook.id)) continue;
      this._running.add(hook.id);
      this._depth++;
      try { await this._runOne(hook, event, payload, { signal, readOnly }); }
      finally { this._depth--; this._running.delete(hook.id); }
    }
  }

  async _runOne(hook, event, payload, { signal, readOnly }) {
    const plugin = this.plugin;
    try {
      // The user's say-so: Ask (default) shows a prompt for this run, Allow runs it, Deny skips it.
      const verdict = await plugin.toolExecutor.gate.check(HOOK_TOOL, { event, [hook.kind]: hook.name }, signal);
      if (!verdict.allowed) return;

      await plugin.refreshSlashSources();
      let content = null;
      if (hook.kind === 'command') {
        const template = await plugin.commands.template(hook.name);
        if (template) { const ctx = await plugin.getNoteContext(); content = CommandLibrary.fill(template, ctx); }
      } else {
        const skill = await plugin.skills.load(hook.name);
        content = skill && skill.body;
      }
      if (!content) {
        if (!this._warned.has(hook.id)) { this._warned.add(hook.id); new Notice(`Hook "${hook.name}": the ${hook.kind} was not found.`); }
        return;
      }
      const text = await plugin.agentRunner.run({ system: [content, HOOK_NOTE], user: this._describe(event, payload), maxIterations: HOOK_MAX_ITERATIONS, signal, readOnly });
      if (text) new Notice(`Hook "${hook.name}": ${collapseToLine(text, 300)}`);
    } catch (e) {
      if (e instanceof UserAbortError) return;
      new Notice(`Hook "${hook.name}" failed. ${String(friendlyErrorMessage(e, plugin)).split('\n')[0]}`);
    }
  }
}

// ==================== WEB SEARCH & PAGE FETCH ====================
//
// FR-3.4. One setting decides where a search comes from:
//   built-in  the provider's own search tool, switched on per request (Gemini: google_search,
//             Anthropic: the web_search server tool). The provider returns the sources.
//   external  the user's own search service (Brave, Tavily or SearXNG) through two registry tools,
//             web_search and fetch_page, called with requestUrl. Local and custom endpoints and
//             OpenAI (whose Chat Completions API has no search tool) use this path.
//   none      the tool is simply not offered; the model is told, so the answer says so.
// Auto = built-in where the provider has one and has not refused it for that model, else external.

const WEB_SEARCH_SERVICES = {
  brave:   { label: 'Brave Search API', secret: 'brave-search-key', needsKey: true },
  tavily:  { label: 'Tavily',           secret: 'tavily-key',       needsKey: true },
  searxng: { label: 'SearXNG (your own server)', secret: null,      needsKey: false }
};
const WEB_SEARCH_RESULTS = 6;
const WEB_SEARCH_BUILTIN_MAX_USES = 5;
const FETCH_PAGE_MAX_INPUT = 800000;       // characters of HTML looked at
const FETCH_PAGE_MAX_CHARS = 12000;        // characters of text handed back
const WEB_SOURCES_MAX = 10;

/** http(s) URL or null — links shown under an answer must never be javascript: or similar. */
function safeHttpUrl(u) {
  try { const x = new URL(String(u)); return (x.protocol === 'http:' || x.protocol === 'https:') ? x.href : null; } catch (_) { return null; }
}

/** Hosts a model must not be able to reach through fetch_page: this machine and private networks. */
function isPrivateHost(hostname) {
  const h = String(hostname || '').toLowerCase().replace(/^\[|\]$/g, '');
  if (!h || h === 'localhost' || h.endsWith('.localhost') || h.endsWith('.local') || h.endsWith('.internal') || h.endsWith('.lan')) return true;
  if (h === '::1' || h === '::' || /^f[cd][0-9a-f]{2}:/.test(h) || /^fe80:/.test(h) || /^::ffff:/.test(h)) return true;
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(h);
  if (m) {
    const [a, b] = [Number(m[1]), Number(m[2])];
    return a === 0 || a === 10 || a === 127 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127);
  }
  return !h.includes('.') && !h.includes(':');           // bare host names ("intranet") are local too
}

function decodeHtmlEntities(s) {
  const named = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', ndash: '–', mdash: '—', hellip: '…', rsquo: '’', lsquo: '‘', ldquo: '“', rdquo: '”', copy: '©' };
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => {
    if (e[0] === '#') { const n = e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10); try { return String.fromCodePoint(n); } catch (_) { return ' '; } }
    return Object.prototype.hasOwnProperty.call(named, e.toLowerCase()) ? named[e.toLowerCase()] : m;
  });
}

/** Removes whole <tag>…</tag> blocks in one linear pass (an unclosed tag removes the rest). */
function stripHtmlBlocks(html, tags) {
  let s = html;
  for (const tag of tags) {
    let lower = s.toLowerCase();
    let out = '', from = 0, i;
    const open = '<' + tag;
    while ((i = lower.indexOf(open, from)) >= 0) {
      const next = lower[i + open.length];
      if (next !== undefined && !/[\s>/]/.test(next)) { out += s.slice(from, i + open.length); from = i + open.length; continue; }   // <scripture>, not <script>
      out += s.slice(from, i) + ' ';
      const close = lower.indexOf('</' + tag, i);
      if (close < 0) { from = s.length; break; }
      const end = lower.indexOf('>', close);
      from = end < 0 ? s.length : end + 1;
    }
    s = out + s.slice(from);
  }
  return s;
}

const HTML_BLOCK_CLOSE = new Set(['p', 'div', 'section', 'article', 'tr', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'blockquote', 'pre', 'table', 'ul', 'ol', 'dd', 'dt']);

/** Replaces tags by line breaks or spaces in one linear pass; a "<" that is not a tag stays as text. */
function htmlTagsToText(s) {
  let out = '', i = 0, nextGt = -2;
  const n = s.length;
  while (i < n) {
    const lt = s.indexOf('<', i);
    if (lt < 0) { out += s.slice(i); break; }
    out += s.slice(i, lt);
    if (nextGt !== -1 && nextGt < lt) nextGt = s.indexOf('>', lt + 1);      // looked up once per ">" , not once per "<"
    if (nextGt < 0 || nextGt - lt > 2000) { out += '<'; i = lt + 1; continue; }
    const tag = s.slice(lt + 1, nextGt);
    const m = /^(\/?)([a-z][a-z0-9]*)/i.exec(tag);
    if (!m) { out += '<'; i = lt + 1; continue; }
    const name = m[2].toLowerCase(), closing = m[1] === '/';
    if (name === 'br' || name === 'hr') out += '\n';
    else if (!closing && name === 'li') out += '\n- ';
    else if (closing && HTML_BLOCK_CLOSE.has(name)) out += '\n';
    else out += ' ';
    i = nextGt + 1;
  }
  return out;
}

/** Removes <!-- … --> comments; an unclosed one removes the rest. Linear. */
function stripHtmlComments(s) {
  let out = '', from = 0, i;
  while ((i = s.indexOf('<!--', from)) >= 0) {
    out += s.slice(from, i) + ' ';
    const end = s.indexOf('-->', i + 4);
    if (end < 0) return out;
    from = end + 3;
  }
  return out + s.slice(from);
}

/** Readable text of an HTML page: no scripts, menus or footers; headings and list items on their own lines. Linear in the page size. */
function htmlToReadable(html) {
  let s = String(html || '').slice(0, FETCH_PAGE_MAX_INPUT);
  let title = '';
  const ti = s.search(/<title[\s>]/i);
  if (ti >= 0) {
    const open = s.indexOf('>', ti);
    const close = open < 0 ? -1 : s.toLowerCase().indexOf('</title', open);
    if (open >= 0 && close >= 0) title = decodeHtmlEntities(s.slice(open + 1, close)).replace(/\s+/g, ' ').trim();
  }
  s = stripHtmlComments(s);
  s = stripHtmlBlocks(s, ['script', 'style', 'noscript', 'svg', 'template', 'head', 'title', 'nav', 'footer', 'aside', 'form', 'iframe', 'button', 'select']);
  // the main content if the page marks it
  const lower = s.toLowerCase();
  for (const tag of ['main', 'article']) {
    const o = lower.indexOf('<' + tag);
    if (o < 0 || !/[\s>]/.test(lower[o + tag.length + 1] || '>')) continue;
    const gt = lower.indexOf('>', o);
    const c = lower.lastIndexOf('</' + tag);
    if (gt >= 0 && c > gt && c - gt > 400) { s = s.slice(gt + 1, c); break; }
  }
  s = decodeHtmlEntities(htmlTagsToText(s));
  const text = s.split('\n').map(l => l.replace(/[ \t\u00a0]+/g, ' ').trim()).join('\n').replace(/\n{3,}/g, '\n\n').trim();
  return { title, text };
}

class WebSearch {
  constructor(plugin) { this.plugin = plugin; }

  get enabled() { return this.plugin.settings.webSearchEnabled === true; }

  /** Gemini and Anthropic have a search tool of their own, unless they refused it for this model before. */
  builtinCapable(apiType, model) {
    return (apiType === 'gemini' || apiType === 'anthropic') && this.plugin.modelCatalog.searchAllowed(apiType, model);
  }

  externalConfigured() {
    const s = this.plugin.settings;
    const svc = WEB_SEARCH_SERVICES[s.webSearchService];
    if (!svc) return false;
    if (s.webSearchService === 'searxng') return !!safeHttpUrl(s.searxngUrl);
    return !!this.plugin.getSecret(svc.secret);
  }

  /** @returns {{ mode: 'builtin'|'external'|'none', reason?: string }} */
  plan(apiType, model) {
    if (!this.enabled) return { mode: 'none', reason: 'off' };
    const source = this.plugin.settings.webSearchSource || 'auto';
    const builtin = this.builtinCapable(apiType, model);
    const external = this.externalConfigured();
    if (source === 'builtin') return builtin ? { mode: 'builtin' } : { mode: 'none', reason: 'builtin-unavailable' };
    if (source === 'external') return external ? { mode: 'external' } : { mode: 'none', reason: 'not-configured' };
    if (builtin) return { mode: 'builtin' };
    return external ? { mode: 'external' } : { mode: 'none', reason: 'not-configured' };
  }

  /** One short instruction for turns where search is on but cannot be used, so the answer says so. */
  unavailableNote(apiType, model) {
    const p = this.plan(apiType, model);
    if (p.mode !== 'none' || p.reason === 'off') return '';
    return 'Web search is switched on in the plugin but is not ' + (p.reason === 'not-configured' ? 'set up' : 'available') +
      ' for this model, so you cannot search the web here. If the user needs something from the web, say so in one short sentence and answer from what you know.';
  }

  /** Runs a search with the chosen service. @returns {Promise<Array<{title, url, snippet}>>} */
  async search(query, count = WEB_SEARCH_RESULTS) {
    const s = this.plugin.settings;
    const n = Math.min(10, Math.max(1, Math.floor(Number(count)) || WEB_SEARCH_RESULTS));
    const q = String(query || '').trim();
    if (!q) throw new Error('The search needs a query.');
    const svcName = s.webSearchService;
    const svc = WEB_SEARCH_SERVICES[svcName];
    if (!svc || !this.externalConfigured()) throw new Error('Web search is not set up.');

    let req;
    if (svcName === 'brave') {
      req = { url: `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(q)}&count=${n}`, method: 'GET', headers: { Accept: 'application/json', 'X-Subscription-Token': this.plugin.getSecret(svc.secret) } };
    } else if (svcName === 'tavily') {
      req = { url: 'https://api.tavily.com/search', method: 'POST', contentType: 'application/json', headers: { Authorization: `Bearer ${this.plugin.getSecret(svc.secret)}` }, body: JSON.stringify({ query: q, max_results: n }) };
    } else {
      req = { url: `${safeHttpUrl(s.searxngUrl).replace(/\/+$/, '')}/search?q=${encodeURIComponent(q)}&format=json`, method: 'GET', headers: { Accept: 'application/json' } };
    }
    let res;
    try { res = await requestUrl({ ...req, throw: false }); }
    catch (e) { throw new Error(`${svc.label} could not be reached.`); }
    if (res.status === 401 || res.status === 403) {
      throw new Error(svcName === 'searxng'
        ? `${svc.label} refused the request (${res.status}); JSON output may be switched off on that server.`
        : `${svc.label} refused the request (${res.status}). Check the key.`);
    }
    if (res.status === 429) throw new Error(`${svc.label} says too many requests. Try again in a moment.`);
    if (res.status >= 400) throw new Error(`${svc.label} returned ${res.status}.`);
    let json;
    try { json = res.json; } catch (_) { throw new Error(`${svc.label} did not return JSON.`); }
    const raw = svcName === 'brave' ? ((json && json.web && json.web.results) || []) : ((json && json.results) || []);
    return raw.map(r => ({ title: String(r.title || '').trim(), url: safeHttpUrl(r.url), snippet: String(r.description || r.content || '').replace(/\s+/g, ' ').trim().slice(0, 400) }))
      .filter(r => r.url).slice(0, n);
  }

  /** Fetches one page and returns its readable text, size-capped. */
  async fetchPage(url, maxChars = FETCH_PAGE_MAX_CHARS) {
    const safe = safeHttpUrl(url);
    if (!safe) throw new Error('Only http and https addresses can be fetched.');
    if (isPrivateHost(new URL(safe).hostname)) throw new Error('Addresses on this computer or a private network are not fetched.');
    let res;
    try {
      res = await requestUrl({ url: safe, method: 'GET', throw: false,
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; ObsidianAIAssistant)', Accept: 'text/html,application/xhtml+xml,text/plain,application/json;q=0.8,*/*;q=0.5' } });
    } catch (e) { throw new Error('The page could not be reached.'); }
    if (res.status >= 400) throw new Error(`The page returned ${res.status}.`);
    const type = String((res.headers && (res.headers['content-type'] || res.headers['Content-Type'])) || '').toLowerCase();
    if (type && !/(text\/|json|xml|html)/.test(type)) throw new Error(`That is not a text page (${type.split(';')[0]}).`);
    const body = String(res.text || '');
    let title = '', text;
    if (!type || /html|xml/.test(type)) ({ title, text } = htmlToReadable(body));
    else text = body.replace(/\r\n/g, '\n').trim();
    const cap = Math.min(FETCH_PAGE_MAX_CHARS, Math.max(500, Math.floor(Number(maxChars)) || FETCH_PAGE_MAX_CHARS));
    const cut = text.length > cap;
    return { url: safe, title, text: cut ? text.slice(0, cap) + `\n[… cut: ${text.length - cap} more characters]` : text };
  }

  /** web_search and fetch_page, offered only while the external path is the one in use. */
  ensureToolsRegistered() {
    const registry = this.plugin.toolRegistry;
    const external = ({ apiType, model } = {}) => this.plan(apiType, model).mode === 'external';
    if (!registry.get('web_search')) {
      registry.register({
        name: 'web_search', title: 'Web search',
        description: 'Searches the web and returns the top results (title, address and a snippet). Use fetch_page to read one of them.',
        parameters: { type: 'object', properties: { query: { type: 'string', description: 'What to search for.' }, count: { type: 'integer', description: 'How many results (1–10, default 6).' } }, required: ['query'] },
        permission: 'read', source: 'builtin', defaultPolicy: 'allow', isAvailable: external,
        handler: async ({ query, count }) => {
          const results = await this.search(query, count);
          if (!results.length) return `No results for "${query}".`;
          return { content: results.map((r, i) => `${i + 1}. ${r.title || r.url}\n   ${r.url}\n   ${r.snippet}`).join('\n\n'), sources: results.map(r => ({ url: r.url, title: r.title })) };
        }
      });
    }
    if (!registry.get('fetch_page')) {
      registry.register({
        name: 'fetch_page', title: 'Fetch web page',
        description: 'Fetches a web page and returns its readable text (cut to a size limit). Only public http and https addresses.',
        parameters: { type: 'object', properties: { url: { type: 'string', description: 'The page address.' } }, required: ['url'] },
        permission: 'read', source: 'builtin', defaultPolicy: 'ask', isAvailable: external,
        handler: async ({ url }) => {
          const page = await this.fetchPage(url);
          return { content: `${page.title ? page.title + '\n' : ''}${page.url}\n\n${page.text}`, sources: [{ url: page.url, title: page.title }] };
        }
      });
    }
  }
}

/**
 * Sources and in-band errors from Anthropic's web_search server tool, read from a response's content
 * blocks: the pages the answer cites, or, if it cites none, the pages the search returned.
 */
function anthropicSearchInfo(blocks) {
  const cited = [], returned = [];
  const seenCited = new Set(), seenReturned = new Set();
  let error = null;
  const add = (list, seen, url, title) => { const u = safeHttpUrl(url); if (u && !seen.has(u)) { seen.add(u); list.push({ url: u, title: String(title || '').trim() }); } };
  for (const b of blocks || []) {
    if (!b) continue;
    if (b.type === 'text' && Array.isArray(b.citations)) b.citations.forEach(c => add(cited, seenCited, c.url, c.title));
    else if (b.type === 'web_search_tool_result') {
      if (Array.isArray(b.content)) b.content.forEach(r => add(returned, seenReturned, r.url, r.title));
      else if (b.content && b.content.error_code) error = b.content.error_code;
    }
  }
  const sources = (cited.length ? cited : returned).slice(0, WEB_SOURCES_MAX);
  // only what is present, so a response that did not search looks exactly as before
  return { ...(sources.length ? { sources } : {}), ...(error ? { searchError: error } : {}) };
}

/** Sources of a Gemini grounded answer. */
function geminiSearchSources(candidate) {
  const chunks = (candidate && candidate.groundingMetadata && candidate.groundingMetadata.groundingChunks) || [];
  const out = []; const seen = new Set();
  for (const c of chunks) {
    const u = safeHttpUrl(c && c.web && c.web.uri);
    if (u && !seen.has(u)) { seen.add(u); out.push({ url: u, title: String((c.web && c.web.title) || '').trim() }); }
  }
  return out.slice(0, WEB_SOURCES_MAX);
}

// ==================== MCP CLIENT ====================
//
// FR-1.5. Connects to MCP servers and puts their tools in the tool registry (source 'mcp').
//   remote  Streamable HTTP (a POST per message; the answer is JSON or a short event stream), on every platform
//   local   a program started on this computer and spoken to over stdin/stdout, desktop only
// Configured in the plugin settings (settings.mcpServers), tokens in the secret storage. Tools of one
// server share one permission rule ("MCP server: <name>", default Ask) and run only after it allows.
// Not implemented: the older HTTP+SSE transport, and servers that insist on the newest, handshake-free
// protocol revision (they must still accept "initialize").

const MCP_PROTOCOL_VERSION = '2025-06-18';
const MCP_REQUEST_TIMEOUT_MS = 30000;
const MCP_CONNECT_TIMEOUT_MS = 10000;
const MCP_RETRY_MS = 60000;
const MCP_FIRST_TURN_WAIT_MS = 5000;

function withTimeout(promise, ms, message) {
  let timer;
  return Promise.race([
    promise,
    new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(message)), ms); if (timer.unref) timer.unref(); })
  ]).finally(() => clearTimeout(timer));
}

/** Messages in a text/event-stream body (each event's data lines are one JSON message). */
function parseSseMessages(text) {
  const out = [];
  for (const event of String(text || '').split(/\r?\n\r?\n/)) {
    const data = event.split(/\r?\n/).filter(l => l.startsWith('data:')).map(l => l.slice(5).replace(/^ /, '')).join('\n');
    if (!data) continue;
    try { out.push(JSON.parse(data)); } catch (_) { /* not a JSON message */ }
  }
  return out;
}

/** "a b 'c d'" → ['a', 'b', 'c d'] */
function splitCommandLine(text) {
  const out = []; const re = /"([^"]*)"|'([^']*)'|(\S+)/g; let m;
  while ((m = re.exec(String(text || '')))) out.push(m[1] !== undefined ? m[1] : (m[2] !== undefined ? m[2] : m[3]));
  return out;
}

/** The text of a tools/call result. */
function mcpResultToText(result) {
  const parts = Array.isArray(result && result.content) ? result.content : [];
  const lines = parts.map(p => {
    if (!p) return '';
    if (p.type === 'text') return String(p.text || '');
    if (p.type === 'image' || p.type === 'audio') return `[${p.type}: ${p.mimeType || 'unknown type'} — not shown]`;
    if (p.type === 'resource' && p.resource) return p.resource.text ? String(p.resource.text) : `[resource: ${p.resource.uri || 'unnamed'}]`;
    if (p.type === 'resource_link') return `[resource: ${p.uri || p.name || 'link'}]`;
    return '';
  }).filter(Boolean);
  return lines.join('\n');
}

class McpHttpClient {
  constructor(plugin, server) {
    this.plugin = plugin;
    this.server = server;
    this.session = null;
    this.protocol = MCP_PROTOCOL_VERSION;
    this.timeoutMs = MCP_REQUEST_TIMEOUT_MS;
    this._id = 0;
    this.dead = false;
  }

  _headers(initializing) {
    const h = { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' };
    const token = this.plugin.getSecret(`mcp-token-${this.server.id}`);
    if (token) h.Authorization = `Bearer ${token}`;
    if (this.session) h['Mcp-Session-Id'] = this.session;
    if (!initializing) h['MCP-Protocol-Version'] = this.protocol;
    return h;
  }

  /** Sends one message; resolves with the response to it (null for a notification). */
  async _post(message, initializing = false) {
    let res;
    try {
      res = await withTimeout(requestUrl({ url: this.server.url, method: 'POST', headers: this._headers(initializing), body: JSON.stringify(message), throw: false }),
        this.timeoutMs, 'The server did not answer in time.');
    } catch (e) {
      throw new Error(e && e.message === 'The server did not answer in time.' ? e.message : 'The server could not be reached.');
    }
    const headers = res.headers || {};
    const sid = headers['mcp-session-id'] || headers['Mcp-Session-Id'];
    if (sid) this.session = sid;
    if (res.status === 202 || res.status === 204) return null;
    if (res.status === 401 || res.status === 403) throw new Error(`The server refused the token (${res.status}). Check the token.`);
    if (res.status === 404 && this.session) { this.dead = true; throw new Error('The server ended the session. It will reconnect.'); }
    if (res.status >= 400) throw new Error(`The server returned ${res.status}.`);
    if (message.id === undefined) return null;
    const type = String(headers['content-type'] || headers['Content-Type'] || '').toLowerCase();
    let messages;
    if (type.includes('text/event-stream')) messages = parseSseMessages(res.text);
    else { try { messages = [].concat(res.json); } catch (_) { throw new Error('The server did not answer with JSON.'); } }
    const answer = messages.find(m => m && m.id === message.id);
    if (!answer) throw new Error('The server sent no answer to the request.');
    return answer;
  }

  async request(method, params, initializing = false) {
    const id = ++this._id;
    const answer = await this._post({ jsonrpc: '2.0', id, method, params }, initializing);
    if (answer.error) throw new Error(String(answer.error.message || 'The server reported an error.'));
    return answer.result;
  }

  async notify(method, params) { await this._post({ jsonrpc: '2.0', method, ...(params ? { params } : {}) }); }

  async connect() {
    const init = await this.request('initialize', { protocolVersion: MCP_PROTOCOL_VERSION, capabilities: {}, clientInfo: { name: 'obsidian-ai-assistant', version: '1' } }, true);
    this.protocol = (init && init.protocolVersion) || MCP_PROTOCOL_VERSION;
    await this.notify('notifications/initialized');
    return init;
  }

  async listTools() {
    const tools = []; let cursor;
    for (let page = 0; page < 20; page++) {
      const r = await this.request('tools/list', cursor ? { cursor } : {});
      tools.push(...((r && r.tools) || []));
      cursor = r && r.nextCursor;
      if (!cursor) break;
    }
    return tools;
  }

  async callTool(name, args) { return this.request('tools/call', { name, arguments: args || {} }); }

  async close() {
    if (!this.session) return;
    try { await requestUrl({ url: this.server.url, method: 'DELETE', headers: this._headers(false), throw: false }); } catch (_) { /* best effort */ }
  }
}

class McpStdioClient {
  constructor(plugin, server) {
    this.plugin = plugin;
    this.server = server;
    this.timeoutMs = MCP_REQUEST_TIMEOUT_MS;
    this.child = null;
    this.dead = false;
    this._id = 0;
    this._pending = new Map();
    this._stderr = '';
  }

  _fail(error) {
    this.dead = true;
    for (const p of this._pending.values()) { clearTimeout(p.timer); p.reject(error); }
    this._pending.clear();
  }

  _onLine(line) {
    let msg;
    try { msg = JSON.parse(line); } catch (_) { return; }
    if (msg && msg.id !== undefined && this._pending.has(msg.id)) {
      const p = this._pending.get(msg.id);
      this._pending.delete(msg.id);
      clearTimeout(p.timer);
      if (msg.error) p.reject(new Error(String(msg.error.message || 'The server reported an error.'))); else p.resolve(msg.result);
    }
  }

  _send(message) {
    if (this.dead || !this.child || !this.child.stdin || !this.child.stdin.writable) throw new Error('The local server is not running.');
    this.child.stdin.write(JSON.stringify(message) + '\n');
  }

  request(method, params) {
    const id = ++this._id;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { this._pending.delete(id); reject(new Error('The server did not answer in time.')); }, this.timeoutMs);
      if (timer.unref) timer.unref();
      this._pending.set(id, { resolve, reject, timer, method });
      try { this._send({ jsonrpc: '2.0', id, method, params }); } catch (e) { clearTimeout(timer); this._pending.delete(id); reject(e); }
    });
  }

  async notify(method, params) { this._send({ jsonrpc: '2.0', method, ...(params ? { params } : {}) }); }

  async connect() {
    if (!Platform.isDesktop || typeof require !== 'function') throw new Error('Local servers run on desktop only.');
    const command = String(this.server.command || '').trim();
    if (!command) throw new Error('No command is set.');
    const { spawn } = require('child_process');
    let child;
    try {
      child = spawn(command, splitCommandLine(this.server.args), { stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true, shell: typeof process !== 'undefined' && process.platform === 'win32' });
    } catch (e) { throw new Error(`Could not start "${command}".`); }
    this.child = child;
    let buffer = '';
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (chunk) => {
      buffer += chunk;
      let nl;
      while ((nl = buffer.indexOf('\n')) >= 0) { const line = buffer.slice(0, nl).trim(); buffer = buffer.slice(nl + 1); if (line) this._onLine(line); }
    });
    child.stderr.setEncoding('utf8');
    child.stderr.on('data', (d) => { this._stderr = (this._stderr + d).slice(-300); });
    child.on('error', (e) => this._fail(new Error(`Could not start "${command}": ${e.message}`)));
    child.on('exit', (code) => this._fail(new Error(`The local server stopped (exit ${code}).${this._stderr.trim() ? ' ' + this._stderr.trim().split('\n').pop() : ''}`)));

    const init = await this.request('initialize', { protocolVersion: MCP_PROTOCOL_VERSION, capabilities: {}, clientInfo: { name: 'obsidian-ai-assistant', version: '1' } });
    await this.notify('notifications/initialized');
    return init;
  }

  async listTools() {
    const tools = []; let cursor;
    for (let page = 0; page < 20; page++) {
      const r = await this.request('tools/list', cursor ? { cursor } : {});
      tools.push(...((r && r.tools) || []));
      cursor = r && r.nextCursor;
      if (!cursor) break;
    }
    return tools;
  }

  async callTool(name, args) { return this.request('tools/call', { name, arguments: args || {} }); }

  /** Tells the server to stop working on a request (best effort). */
  cancelLast() {
    const ids = [...this._pending.keys()];
    const id = ids[ids.length - 1];
    if (id !== undefined) { try { this._send({ jsonrpc: '2.0', method: 'notifications/cancelled', params: { requestId: id, reason: 'Stopped by the user' } }); } catch (_) { /* gone */ } }
  }

  closeSync() {
    this.dead = true;
    try { if (this.child) { this.child.stdin.end(); this.child.kill(); } } catch (_) { /* already gone */ }
  }

  async close() { this.closeSync(); }
}

class McpManager {
  constructor(plugin) {
    this.plugin = plugin;
    this._servers = new Map();      // id → { client, sig, tools: [registry names], status, error, count, retryAt, told }
    this._syncing = null;
  }

  get enabled() { return this.plugin.settings.mcpEnabled === true; }

  _configured() {
    const list = Array.isArray(this.plugin.settings.mcpServers) ? this.plugin.settings.mcpServers : [];
    return list.filter(s => s && s.id && s.enabled !== false && ((s.transport === 'http' && safeHttpUrl(s.url)) || (s.transport === 'stdio' && String(s.command || '').trim())));
  }

  _sig(server) {
    return [server.transport, server.url || '', server.command || '', server.args || '', server.name || '', this.plugin.getSecret(`mcp-token-${server.id}`)].join('|');
  }

  /** { state: 'connected'|'failed'|'off'|'desktop-only'|'connecting', tools?, error? } */
  status(id) {
    const server = (this.plugin.settings.mcpServers || []).find(s => s && s.id === id);
    if (!this.enabled || !server || server.enabled === false) return { state: 'off' };
    if (server.transport === 'stdio' && !Platform.isDesktop) return { state: 'desktop-only' };
    const rec = this._servers.get(id);
    if (!rec) return { state: 'connecting' };
    return rec.status === 'connected' ? { state: 'connected', tools: rec.count } : { state: 'failed', error: rec.error };
  }

  /** Makes the connections match the settings. Safe to call often: nothing happens unless something changed. */
  sync() {
    if (!this._syncing) this._syncing = this._sync().finally(() => { this._syncing = null; });
    return this._syncing;
  }

  /** For a chat turn: connect, but do not keep the user waiting long for a slow server. */
  async syncForTurn() {
    await withTimeout(this.sync(), MCP_FIRST_TURN_WAIT_MS, 'slow').catch(() => {});
  }

  async _sync() {
    if (!this.enabled) { await this.shutdown(); return; }
    const wanted = new Map(this._configured().filter(s => s.transport === 'http' || Platform.isDesktop).map(s => [s.id, s]));
    for (const [id, rec] of [...this._servers]) {
      if (!wanted.has(id) || rec.sig !== this._sig(wanted.get(id))) await this._drop(id);
    }
    await Promise.all([...wanted.values()].map(async (server) => {
      const rec = this._servers.get(server.id);
      if (rec && (rec.status === 'connected' ? !(rec.client && rec.client.dead) : Date.now() < rec.retryAt)) return;
      if (rec) await this._drop(server.id, true);
      await this._connect(server);
    }));
  }

  async _drop(id, keepFailure = false) {
    const rec = this._servers.get(id);
    if (!rec) return;
    for (const name of rec.tools || []) this.plugin.toolRegistry.unregister(name);
    try { await rec.client.close(); } catch (_) { /* closing is best effort */ }
    if (!keepFailure) this._servers.delete(id);
  }

  async _connect(server) {
    const client = server.transport === 'http' ? new McpHttpClient(this.plugin, server) : new McpStdioClient(this.plugin, server);
    const rec = { client, sig: this._sig(server), tools: [], status: 'connecting', error: '', count: 0, retryAt: 0 };
    this._servers.set(server.id, rec);
    try {
      await withTimeout(client.connect(), MCP_CONNECT_TIMEOUT_MS, 'The server did not answer in time.');
      const tools = await withTimeout(client.listTools(), MCP_CONNECT_TIMEOUT_MS, 'The server did not list its tools in time.');
      this._registerTools(server, rec, tools);
      rec.status = 'connected';
      rec.count = rec.tools.length;
    } catch (e) {
      rec.status = 'failed';
      rec.error = String((e && e.message) || e).split('\n')[0].slice(0, 200);
      rec.retryAt = Date.now() + MCP_RETRY_MS;
      try { await client.close(); } catch (_) { /* already gone */ }
      new Notice(`MCP server "${server.name || server.id}": couldn't connect. ${rec.error}`);
    }
  }

  _registerTools(server, rec, tools) {
    const registry = this.plugin.toolRegistry;
    const slug = (t) => String(t || '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
    const serverSlug = slug(server.name || server.id) || 'server';
    for (const tool of tools) {
      if (!tool || !tool.name) continue;
      let name = `mcp_${serverSlug}_${slug(tool.name) || 'tool'}`;
      if (name.length > 64) { let h = 0; for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0; name = name.slice(0, 56) + '_' + h.toString(36).slice(0, 7); }
      for (let n = 2; registry.get(name); n++) name = name.slice(0, 60) + '_' + n;
      const schema = tool.inputSchema && tool.inputSchema.type === 'object' ? tool.inputSchema : { type: 'object', properties: {} };
      try {
        registry.register({
          name, title: `${server.name || server.id}: ${tool.name}`,
          description: `[${server.name || server.id}] ${String(tool.description || tool.name).trim()}`,
          parameters: schema,
          permission: tool.annotations && tool.annotations.readOnlyHint === true ? 'read' : 'external',
          source: 'mcp', defaultPolicy: 'ask',
          policyKey: `mcp:${server.id}`, policyTitle: `MCP server: ${server.name || server.id}`,
          handler: (args, ctx) => this.call(server.id, tool.name, args, ctx && ctx.signal)
        });
        rec.tools.push(name);
      } catch (_) { /* a tool the registry cannot take is skipped */ }
    }
  }

  /** Runs one tool on its server; the answer comes back as the tool result. */
  async call(id, toolName, args, signal) {
    const rec = this._servers.get(id);
    if (!rec || rec.status !== 'connected' || (rec.client && rec.client.dead)) {
      this.sync().catch(() => {});                  // reconnect for next time
      return { content: 'This MCP server is not connected right now.', isError: true };
    }
    let onAbort = null;
    if (signal && rec.client.cancelLast) { onAbort = () => rec.client.cancelLast(); signal.addEventListener('abort', onAbort, { once: true }); }
    try {
      const result = await rec.client.callTool(toolName, args);
      const text = mcpResultToText(result);
      return result && result.isError ? { content: text || 'The tool reported an error.', isError: true } : (text || '(no output)');
    } finally {
      if (onAbort) signal.removeEventListener('abort', onAbort);
    }
  }

  async shutdown() {
    for (const id of [...this._servers.keys()]) await this._drop(id);
  }

  /** Closes one server and connects it again (the "Reconnect" button). */
  async reconnect(id) {
    await this._drop(id);
    return this.sync();
  }

  /** On unload: stop local programs at once. */
  shutdownSync() {
    for (const rec of this._servers.values()) { if (rec.client && rec.client.closeSync) rec.client.closeSync(); }
    this.plugin.toolRegistry.unregisterSource('mcp');
    this._servers.clear();
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
  constructor(app, onSubmit, imageAnalysisEnabled = false, activeFilePath = null) {
    super(app);
    this.onSubmit = onSubmit;
    this.imageAnalysisEnabled = imageAnalysisEnabled;
    this.activeFilePath  = activeFilePath; // path of currently open file — sorted to top
    this.selected        = new Set();  // selected file paths
    this.selectedFolders = new Set();  // selected folder paths
    this.selectedImages  = [];         // { name, dataUrl, mimeType }
    this.searchTerm      = '';
    this.selectedFiles   = [];
    this.activeTab       = 'files';    // 'files' | 'folders' | 'images'
    // What portion of each file to send to the AI.
    // 'full' = body + metadata (default), 'metadata' = metadata only, 'body' = body only.
    // File name is always included regardless of scope.
    this.contentScope    = 'full';
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

    // ── Content scope selector (files/folders tabs only) ─────────────────
    // Lets the user choose how much of each file to send to the AI.
    // The file name is always included regardless of the choice.
    const scopeRow = contentEl.createDiv({ cls: 'ai-attach-scope-row' });
    scopeRow.style.display        = 'flex';
    scopeRow.style.alignItems     = 'center';
    scopeRow.style.gap            = '6px';
    scopeRow.style.marginBottom   = '12px';

    const scopeLabel = scopeRow.createEl('span');
    scopeLabel.textContent      = 'Content scope:';
    scopeLabel.style.fontSize   = '12px';
    scopeLabel.style.color      = 'var(--text-muted)';
    scopeLabel.style.flexShrink = '0';

    const scopeOptions = [
      { value: 'full',     label: 'Full (body + metadata)' },
      { value: 'body',     label: 'Body only' },
      { value: 'metadata', label: 'Metadata only' },
    ];

    const scopeBtnGroup = scopeRow.createDiv({ cls: 'ai-attach-scope-group' });
    scopeBtnGroup.style.display       = 'flex';
    scopeBtnGroup.style.flex          = '1';
    scopeBtnGroup.style.borderRadius  = '6px';
    scopeBtnGroup.style.overflow      = 'hidden';
    scopeBtnGroup.style.border        = '1px solid var(--background-modifier-border)';

    const applyScopeBtnStyles = () => {
      scopeBtnGroup.querySelectorAll('.ai-scope-btn').forEach(b => {
        const isActive = b.dataset.scope === this.contentScope;
        b.style.background = isActive ? 'var(--interactive-accent)' : 'var(--background-secondary)';
        b.style.color      = isActive ? 'var(--text-on-accent)' : 'var(--text-muted)';
        b.style.fontWeight = isActive ? '600' : '400';
      });
    };

    scopeOptions.forEach(({ value, label }) => {
      const btn = scopeBtnGroup.createEl('button', { cls: 'ai-scope-btn' });
      btn.textContent       = label;
      btn.dataset.scope     = value;
      btn.style.flex        = '1';
      btn.style.padding     = '5px 4px';
      btn.style.border      = 'none';
      btn.style.borderRight = '1px solid var(--background-modifier-border)';
      btn.style.cursor      = 'pointer';
      btn.style.fontSize    = '11px';
      btn.style.transition  = 'background 0.12s';
      btn.title             = value === 'full'
        ? 'Send file body and frontmatter metadata to the AI (file name always included)'
        : value === 'body'
          ? 'Send only the file body — no frontmatter metadata (file name always included)'
          : 'Send only frontmatter metadata — no body text (file name always included)';
      btn.addEventListener('click', () => {
        this.contentScope = value;
        applyScopeBtnStyles();
      });
    });
    // Remove the trailing border on the last button
    const lastScopeBtn = scopeBtnGroup.lastElementChild;
    if (lastScopeBtn) lastScopeBtn.style.borderRight = 'none';

    applyScopeBtnStyles();

    // Hide scope selector on the Images tab (it only applies to text files)
    const updateScopeRowVisibility = () => {
      scopeRow.style.display = this.activeTab === 'images' ? 'none' : 'flex';
    };

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

    // Renders only the filtered vault image list into `container`, leaving the
    // search input, drop zone and selected-grid untouched.  Called on every
    // keystroke so the search input keeps focus and the keyboard stays open.
    const renderVaultList = (container) => {
      container.empty();

      const allVaultImages = (this.app.vault.getFiles?.() ?? this.app.vault.getAllLoadedFiles?.() ?? [])
        .filter(f => f.extension && IMAGE_EXTS.has(f.extension.toLowerCase()))
        .sort((a, b) => a.name.localeCompare(b.name));

      const filtered = vaultSearchTerm.trim()
        ? allVaultImages.filter(f => f.name.toLowerCase().includes(vaultSearchTerm.toLowerCase()))
        : allVaultImages;

      if (filtered.length === 0) {
        const empty = container.createEl('p');
        empty.textContent   = allVaultImages.length === 0
          ? 'No image files found in your vault.'
          : 'No images match your search.';
        empty.style.color     = 'var(--text-muted)';
        empty.style.fontSize  = '12px';
        empty.style.textAlign = 'center';
        empty.style.margin    = '8px 0';
        return;
      }

      // Scrollable list of vault images
      const listWrap = container.createDiv({ cls: 'ai-vault-img-list' });
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
    };

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

      // Search box — wired to renderVaultList only (not the full panel)
      // so the input element is never destroyed while the user is typing,
      // preventing mobile keyboards from dismissing on every keystroke.
      const vaultSearch = vaultHeader.createEl('input', { type: 'text', placeholder: '🔍 Search images…' });
      vaultSearch.value            = vaultSearchTerm;
      vaultSearch.style.padding    = '5px 10px';
      vaultSearch.style.borderRadius = '6px';
      vaultSearch.style.border     = '1px solid var(--background-modifier-border)';
      vaultSearch.style.background = 'var(--background-secondary)';
      vaultSearch.style.color      = 'var(--text-normal)';
      vaultSearch.style.fontSize   = '12px';
      vaultSearch.style.width      = '150px';

      // Persistent container for the filtered list — only this div is cleared
      // and rebuilt on each keystroke, not the whole panel.
      const vaultListContainer = vaultSection.createDiv({ cls: 'ai-vault-list-container' });

      vaultSearch.addEventListener('input', (e) => {
        vaultSearchTerm = e.target.value;
        renderVaultList(vaultListContainer);
      });

      // Initial render of the list
      renderVaultList(vaultListContainer);

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
      const isActive = this.activeFilePath && f.path === this.activeFilePath;
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

      const nameRow = info.createDiv();
      nameRow.style.display    = 'flex';
      nameRow.style.alignItems = 'center';
      nameRow.style.gap        = '6px';
      nameRow.style.marginBottom = '2px';

      const nameEl = nameRow.createEl('div', { text: f.basename, cls: 'ai-file-name' });
      nameEl.style.fontWeight    = '600';
      nameEl.style.fontSize      = '14px';
      nameEl.style.color         = isActive ? 'var(--text-accent)' : 'var(--text-normal)';
      nameEl.style.whiteSpace    = 'nowrap';
      nameEl.style.overflow      = 'hidden';
      nameEl.style.textOverflow  = 'ellipsis';

      if (isActive) {
        const badge = nameRow.createEl('span', { text: 'opened' });
        badge.style.fontSize      = '10px';
        badge.style.padding       = '1px 5px';
        badge.style.borderRadius  = '4px';
        badge.style.flexShrink    = '0';
        badge.style.letterSpacing = '0.03em';
        badge.style.color         = 'var(--text-muted)'
      }

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

        // Sort: currently-open file first, then the rest in their default order
        if (this.activeFilePath) {
          files = [
            ...files.filter(f => f.path === this.activeFilePath),
            ...files.filter(f => f.path !== this.activeFilePath)
          ];
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
      updateScopeRowVisibility();
    });

    foldersTab.addEventListener('click', () => {
      this.activeTab = 'folders';
      this.searchTerm = '';
      searchInput.value = '';
      applyTabStyles();
      showActivePanel();
      renderList();
      updateScopeRowVisibility();
    });

    if (imagesTab) {
      imagesTab.addEventListener('click', () => {
        this.activeTab = 'images';
        applyTabStyles();
        showActivePanel();
        updateScopeRowVisibility();
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
      this.onSubmit('files', picked, this.contentScope);
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
            item.setTitle('AI: Ask about selection')
                .setIcon('brain')
                .onClick(() => this.askAboutSelection(editor, selection));
          });

          menu.addItem((item) => {
            item.setTitle('AI: Edit/Improve selection')
                .setIcon('pencil')
                .onClick(() => this.editSelection(editor, selection));
          });

          menu.addItem((item) => {
            item.setTitle('AI: Continue writing')
                .setIcon('quote')
                .onClick(() => this.continueWriting(editor, selection));
          });

          menu.addItem((item) => {
            item.setTitle('AI: Translate selection')
                .setIcon('languages')
                .onClick(() => this.translateSelection(editor, selection));
          });

          const submenu = menu.addItem((item) => {
            item.setTitle('AI: More options...')
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

    await this.plugin.refreshPromptLayers();
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
    this._pendingNamingFulfilled = false; // Set when primary naming succeeds; clears fallback
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

    /**
     * Per-turn flag: when true the next API request (via _generateAssistantResponse)
     * will have the full file-operation guidelines (scope description + @@FILE_OP@@
     * syntax + file handling principles) injected as a system message.  The flag is consumed
     * (reset to false) immediately after the guidelines are prepended, so
     * subsequent turns do NOT carry the heavyweight payload.
     *
     * Used only by the edit/retry path (_editAndResend, resend button in
     * _generateAssistantResponse).  Normal sends (_onSend) handle injection
     * inline and do not rely on this flag.
     *
     * In 'on-demand' mode the intent decision is made by reading the
     * <!-- NEED_FILE_OPS --> / <!-- NO_FILE_OPS --> tag the model embeds in
     * its previous reply (planted via _fileOpsClassifierInstruction on the
     * first turn) — no separate network request is needed.
     *
     * The lightweight <!-- SYSTEM_MEMORY: {...} --> comment left by
     * ContextMemory in previous assistant messages already gives the model
     * enough continuity between file-op turns without repeating the full guide.
     */
    this._pendingFileOpsInject = false;

    // ── FIX 3: Per-session generation state ──────────────────────────────────
    //
    // Problem: _isGenerating, _activeRequestInfo, and _stopRequested were
    // single scalar properties on the ChatView instance, so starting a
    // generation in Session A and then switching to Session B left the
    // Stop button active (and the input locked) in the new session.
    //
    // Solution: store these three values in Maps keyed by sessionId.
    // Helper methods _getSessionGenerating(), _setSessionGenerating(), and
    // _getActiveSessionGenerating() centralise the lookup so none of the
    // existing call-sites need to know about the Map.
    //
    // The legacy scalar properties are kept as pass-through properties that
    // always read/write the ACTIVE session's entry, preserving the full
    // existing call-graph while making the state per-session.

    /**
     * Maps sessionId → { isGenerating, activeRequestInfo, stopRequested }
     * @type {Map<string, {isGenerating: boolean, activeRequestInfo: object|null, stopRequested: boolean}>}
     */
    this._sessionGeneratingState = new Map();

    // ── FIX 2: In-memory edit-draft cache ────────────────────────────────────
    //
    // Problem: closing an edit modal (or cancelling inline edit) discards the
    // user's half-written changes, and re-opening edit mode resets to the
    // original message text.
    //
    // Solution: whenever the user opens edit mode for a message we store the
    // current (possibly-edited) text and attachments in a Map keyed by
    // `${sessionId}-${messageIndex}`. If the user closes edit mode without
    // explicitly sending, the draft is retained in this Map. Re-opening edit
    // mode for that same message restores the cached draft instead of the
    // original text. The cache entry is cleared on a successful send.
    //
    // This is intentionally an in-memory cache (not persisted to disk) because
    // edit drafts are ephemeral and session-local; they do not need to survive
    // a plugin reload.
    /**
     * @type {Map<string, {text: string, attachments: Array}>}
     * Key format: `${sessionId}-${messageIndex}`
     */
    this._editDraftCache = new Map();

    // ── Stop/cancel generation state ─────────────────────────────────────
    // These are now backed by _sessionGeneratingState (see Fix 3 above).
    // The scalar properties below are kept for backward compatibility with
    // existing code that reads/writes them directly; they are wired to always
    // operate on the currently active session's entry via Object.defineProperty
    // further down in _setGeneratingState.
    this._isGenerating = false;
    this._activeRequestInfo = null;
    this._stopRequested = false;
  }

  // ── FIX 3: Per-session generation state helpers ───────────────────────────

  /**
   * Returns (initialising if absent) the generation-state record for a session.
   * @param {string} sessionId
   * @returns {{ isGenerating: boolean, activeRequestInfo: object|null, stopRequested: boolean }}
   */
  // ── Reasoning (collapsible "thinking" block above the answer) ───────────
  _resetReasoning(sessionId) {
    const gs = this._getSessionGenState(sessionId);
    gs.reasoningPanel = null;
  }

  _pushReasoning(streamingMsg, sessionId, delta) {
    if (!delta) return;
    const gs = this._getSessionGenState(sessionId);
    if (!gs.reasoningPanel) gs.reasoningPanel = new ReasoningPanel(streamingMsg, '', true);
    gs.reasoningPanel.append(delta);
    this._scheduleScrollToBottom(true);
  }

  /** For providers that return reasoning only with the final response (non-streaming). */
  _ensureReasoning(streamingMsg, sessionId, fullText) {
    const gs = this._getSessionGenState(sessionId);
    if (fullText && (!gs.reasoningPanel || !gs.reasoningPanel.text)) this._pushReasoning(streamingMsg, sessionId, fullText);
  }

  /** Finalises the live panel and returns the meta to store on the assistant message. */
  _reasoningMeta(sessionId) {
    const gs = this._getSessionGenState(sessionId);
    const panel = gs.reasoningPanel;
    gs.reasoningPanel = null;
    if (!panel) return {};
    panel.finish();
    return panel.text ? { reasoning: panel.text } : {};
  }

  _getSessionGenState(sessionId) {
    if (!sessionId) return { isGenerating: false, activeRequestInfo: null, stopRequested: false };
    if (!this._sessionGeneratingState.has(sessionId)) {
      this._sessionGeneratingState.set(sessionId, {
        isGenerating:      false,
        activeRequestInfo: null,
        stopRequested:     false,
        toolAbort:         null     // AbortController for tool calls running in this session's turn
      });
    }
    return this._sessionGeneratingState.get(sessionId);
  }

  /**
   * Returns the generation-state record for the CURRENTLY active session.
   * Falls back to a throwaway object if there is no active session (e.g.
   * during initial construction before any session exists).
   */
  _activeGenState() {
    const id = this.plugin?._sessionManager?.activeId;
    return this._getSessionGenState(id);
  }

  getViewType() { return VIEW_TYPE; }
  getDisplayText() { return 'AI Assistant'; }
  getIcon() { return 'brain'; }

  // ── FIX 1: Debounced draft persistence ────────────────────────────────────
  //
  // _saveDraftDebounced() is called on every keystroke and every attachment
  // change. It batches rapid updates into a single SessionManager.saveDraft()
  // call 150 ms after the last change, then calls plugin.saveState() to flush
  // the updated session to disk. This keeps the disk write rate low without
  // losing any content.

  _saveDraftDebounced() {
    if (this._saveDraftTimer) clearTimeout(this._saveDraftTimer);
    // Remember WHICH session this draft belongs to. If the user switches
    // conversation before the timer fires, the input box then shows another
    // session's draft and must not be written into it.
    const sessionId = this.plugin._sessionManager.activeId;
    this._saveDraftTimer = setTimeout(() => {
      this._saveDraftTimer = null;
      // Do not overwrite the draft while the user is editing a sent message
      // inline — the inline-edit flow has its own state management.
      if (this._editingMessageIndex !== null) return;
      if (this.plugin._sessionManager.activeId !== sessionId) return;
      const text = this.inputEl ? this.inputEl.value : '';
      this.plugin._sessionManager.saveDraft(text, this.pendingAttachments, sessionId);
      // Flush to disk so the draft survives a plugin reload.
      this.plugin.saveState();
    }, 150);
  }

  /**
   * Empties the compose area for good after a message has been sent: input
   * text, attachment list, preview pills AND the persisted session draft.
   * Any pending debounced save is cancelled first so it cannot write the old
   * content back. Previously only some send paths did all of this, so the
   * sent text/attachments could reappear the next time the draft was restored
   * (layout refresh, session switch, other open chat view, plugin reload).
   */
  _resetComposer() {
    if (this._saveDraftTimer) {
      clearTimeout(this._saveDraftTimer);
      this._saveDraftTimer = null;
    }
    this.plugin._sessionManager.clearDraft();
    if (this.inputEl) this.inputEl.value = '';
    this.pendingAttachments = [];
    this._pendingEditFiles = [];
    this.editMode = false;
    this._refreshEditModeBtn?.();   // clears the preview pills
    this._updateTokenCounter?.();
  }

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
    this.styleButton(this.modeToggleBtn);
    // Render initial icon via the shared helper so the configured icon is
    // respected even before the user clicks the button for the first time.
    {
      const _states = this.plugin.settings.toggleStates;
      const _idx    = this.plugin.settings.toggleStateIndex ?? 0;
      const _state  = _states?.[_idx];
      this._applyToggleIcon(
        this.modeToggleBtn,
        _state?.obsidianIcon ?? this.getProviderIcon()
      );
    }
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
    //
    // FIX 1: Also save the draft on every keystroke so the text is never
    // lost due to layout refreshes, panel toggles, or session switches.
    this.inputEl.addEventListener('input', () => {
      this._updateTokenCounter();
      // Persist the current draft text (attachment list is saved separately
      // whenever pendingAttachments changes, via _saveDraftDebounced).
      this._saveDraftDebounced();
    });
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
    const inputPosition = this.plugin.settings.inputPosition || 'bottom';

    const inputWrap = this.containerEl.createDiv({ cls: 'ai-input-wrap' });
    inputWrap.style.position = 'relative';
    inputWrap.style.width = '100%';
    inputWrap.style.marginTop = 'auto';
    inputWrap.style.paddingTop = '8px';
    inputWrap.style.borderTop = '1px solid var(--background-modifier-border)';

    // ── Pending-attachment preview bar ────────────────────────────────────
    // Lives OUTSIDE inputWrap so it cannot affect the height of the
    // relative-positioned container that the absolute-positioned buttons
    // (Send, Attach, EditMode) are anchored to.  Appearing / disappearing
    // here never shifts those buttons.
    //
    // Position-aware:
    //   input=bottom → bar inserted BEFORE inputWrap (above the compose box)
    //   input=top    → bar inserted AFTER  inputWrap (below the compose box)
    // Either way it's a sibling of inputWrap, not a child.
    this.attachPreviewBar = this.containerEl.createDiv({ cls: 'ai-attach-preview-bar' });
    this.attachPreviewBar.style.display     = 'none'; // flex when populated
    this.attachPreviewBar.style.flexWrap    = 'nowrap';   // single-row, scrollable
    this.attachPreviewBar.style.overflowX   = 'auto';
    this.attachPreviewBar.style.overflowY   = 'hidden';
    this.attachPreviewBar.style.alignItems  = 'center';
    this.attachPreviewBar.style.gap         = '4px';
    this.attachPreviewBar.style.padding     = '2px 2px';
    this.attachPreviewBar.style.width       = '75%';
    this.attachPreviewBar.style.boxSizing   = 'border-box';
    this.attachPreviewBar.style.zIndex      = '9';
    this.attachPreviewBar.style.background  = 'var(--background-secondary)';
    
    this.attachPreviewBar.style.backdropFilter = 'blur(12px)';
    this.attachPreviewBar.style.WebkitBackdropFilter = 'blur(12px)';
    // Thin separator line — direction depends on position
    if (inputPosition === 'bottom') {
      this.attachPreviewBar.style.position = 'absolute';
      this.attachPreviewBar.style.bottom = '25px';
      // Move it to just before inputWrap (which was just created above)
      this.containerEl.insertBefore(this.attachPreviewBar, inputWrap);
    } else {
      this.attachPreviewBar.style.marginTop  = '-55px';
      // Leave it after inputWrap — containerEl.createDiv appended it there
    }

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
    this.attachBtn.createSpan({ text: '+', attr: { style: 'display:flex;align-items:center;justify-content:center;line-height:1;pointer-events:none;padding-top:5px;font-size:1.1em;' } });
    this.styleFloatingButton(this.attachBtn);
    this.attachBtn.style.bottom = '15px';
    this.attachBtn.style.right = '55px';
    this.attachBtn.title = 'Attach files or folders';

    // ── Edit-Files toggle button ─────────────────────────────────────────
    // Shown at the same level as the attach button but only becomes meaningful
    // when files are pending. Clicking it toggles the mode between Chat and
    // "Edit Files" so the user's next Send triggers the AI file-edit pipeline.
    this.editModeBtn = inputWrap.createEl('button', {
      cls: 'ai-edit-mode-btn floating-btn'
    });
    this.styleFloatingButton(this.editModeBtn);
    this.editModeBtn.style.bottom      = '18px';
    this.editModeBtn.style.right       = '95px';     // sit to the left of attach btn
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
      // ── Attachment preview bar ─────────────────────────────────────────
      const pending = this.pendingAttachments || [];
      this.attachPreviewBar.empty();
      if (pending.length > 0) {
        this.attachPreviewBar.style.display = 'flex';

        // Static paperclip label — plain text, no colour
        const label = this.attachPreviewBar.createEl('span');
        label.textContent      = '📎';
        label.style.fontSize   = '12px';
        label.style.flexShrink = '0';
        label.style.color      = 'var(--text-muted)';
        label.style.marginRight = '2px';

        // One pill per attachment — plain border, no background fill
        pending.forEach((att, idx) => {
          const pill = this.attachPreviewBar.createDiv();
          pill.style.display       = 'inline-flex';
          pill.style.alignItems    = 'center';
          pill.style.gap           = '3px';
          pill.style.padding       = '0px 5px 0px 7px';
          pill.style.borderRadius  = '4px';
          pill.style.border        = '1px solid var(--background-modifier-border)';
          pill.style.background    = 'var(--background-primary)';
          pill.style.fontSize      = '12px';
          pill.style.lineHeight    = '20px';
          pill.style.color         = 'var(--text-normal)';
          pill.style.maxWidth      = '180px';
          pill.style.whiteSpace    = 'nowrap';
          pill.title               = att.name || 'file';

          const nameSpan = pill.createEl('span');
          nameSpan.textContent      = att.name || 'file';
          nameSpan.style.overflow   = 'hidden';
          nameSpan.style.textOverflow = 'ellipsis';

          const xBtn = pill.createEl('button');
          xBtn.textContent             = '×';
          xBtn.title                   = 'Remove';
          xBtn.style.background        = 'none';
          xBtn.style.border            = 'none';
          xBtn.style.cursor            = 'pointer';
          xBtn.style.padding           = '0';
          xBtn.style.fontSize          = '12px';
          xBtn.style.lineHeight        = '1';
          xBtn.style.color             = 'var(--text-muted)';
          xBtn.style.flexShrink        = '0';
          xBtn.style.marginLeft        = '1px';
          xBtn.addEventListener('mouseenter', () => { xBtn.style.color = 'var(--text-normal)'; });
          xBtn.addEventListener('mouseleave', () => { xBtn.style.color = 'var(--text-muted)'; });
          xBtn.addEventListener('click', (e) => {
            e.preventDefault();
            this.pendingAttachments.splice(idx, 1);
            // Keep _pendingEditFiles in sync
            if (this._pendingEditFiles.length === this.pendingAttachments.length + 1) {
              this._pendingEditFiles.splice(idx, 1);
            }
            if (this.pendingAttachments.length === 0) this.editMode = false;
            _refreshEditModeBtn();
            // FIX 1: Persist the updated attachment list to the session draft.
            this._saveDraftDebounced();
          });
        });
      } else {
        this.attachPreviewBar.style.display = 'none';
      }

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
      // FIX 3: Check the ACTIVE session's generating state — not the legacy
      // scalar — so the Stop button only fires for THIS session's request.
      if (this._activeGenState().isGenerating) {
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
        // FIX 3: Check the ACTIVE session's generating state — not the legacy
        // scalar — so Shift+Enter is only blocked when THIS session is busy.
        if (this._activeGenState().isGenerating) {
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

    // "/" autocomplete for commands and skills (silent unless the AI folder is set and they are on)
    // (not while composing a file-edit instruction: that path does not expand commands)
    this.slashMenu = new SlashMenu(this.plugin, this.inputEl, inputWrap, inputPosition === 'top', () => !this.editMode);
    // "@" notes/folders and "#" tags
    this.mentionMenu = new MentionMenu(this.plugin, this.inputEl, inputWrap, inputPosition === 'top', () => !this.editMode);

    // If a response is already generating (e.g. this input area is being
    // recreated by refreshLayout mid-stream), make sure the freshly-created
    // button reflects that immediately instead of defaulting to "Send".
    // FIX 3: Check the ACTIVE session's generating state, not the legacy scalar.
    if (this._activeGenState().isGenerating) {
      this._setGeneratingState(true);
    }
  }
  
  async refreshLayout() {
    // FIX 1: Save the current draft immediately (without the debounce delay)
    // before tearing down the input element, so the text and attachments are
    // persisted and can be restored by _renderMessages after the rebuild.
    if (this._editingMessageIndex === null) {
      const text = this.inputEl ? this.inputEl.value : '';
      this.plugin._sessionManager.saveDraft(text, this.pendingAttachments);
      this.plugin.saveState();
    }

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
    // FIX 1: Flush the departing session's draft before switching away from it.
    if (this._editingMessageIndex === null) {
      const currentText = this.inputEl ? this.inputEl.value : '';
      this.plugin._sessionManager.saveDraft(currentText, this.pendingAttachments);
    }
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
    // FIX 1: Flush the departing session's draft before switching away from it.
    if (this._editingMessageIndex === null) {
      const currentText = this.inputEl ? this.inputEl.value : '';
      this.plugin._sessionManager.saveDraft(currentText, this.pendingAttachments);
    }
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
        // FIX 1: Flush the departing session's draft immediately (before the
        // debounce fires) so its text and attachments are saved to the session
        // object before switchTo() changes which session is "active".
        if (this._editingMessageIndex === null) {
          const currentText = this.inputEl ? this.inputEl.value : '';
          this.plugin._sessionManager.saveDraft(currentText, this.pendingAttachments);
        }
        this.plugin._sessionManager.switchTo(session.id);
        this.plugin.saveState();
        this._renderMessages();  // restores the new session's draft via _restoreSessionDraft
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
    const states = this.plugin.settings.toggleStates;
    const idx    = this.plugin.settings.toggleStateIndex ?? 0;
    const cur    = states?.[idx];
    const next   = states?.[(idx + 1) % (states?.length || 1)];
    if (!cur) return 'Click to switch model';
    const nextLabel = next ? next.label : cur.label;
    return `${cur.label} — click to switch to ${nextLabel}`;
  }

  toggleAIMode() {
    const states = this.plugin.settings.toggleStates;
    if (!states || states.length === 0) return;

    // Advance to next state (wraps around)
    const nextIdx = ((this.plugin.settings.toggleStateIndex ?? 0) + 1) % states.length;
    this.plugin.settings.toggleStateIndex = nextIdx;

    // Apply the new state's providerKey to the runtime mode/cloudApiType pair
    const state = states[nextIdx];
    if (state.providerKey === 'local') {
      this.plugin.settings.currentMode = 'local';
    } else {
      this.plugin.settings.currentMode  = 'cloud';
      this.plugin.settings.cloudApiType = state.providerKey;
    }

    this.updateModeIndicator();

    // saveSettings() propagates the new mode to every other open chat view.
    this.plugin.saveSettings();
    new Notice(`Switched to ${state.label}`);
    this._updateTokenCounter();
  }

  /**
   * Renders a Lucide/Obsidian icon into `btnEl`.
   * Clears any previous content first so repeated calls stay idempotent.
   */
  _applyToggleIcon(btnEl, iconName) {
    btnEl.empty();
    setIcon(btnEl, iconName || 'cpu');
  }

  /** Refreshes this view's provider icon/tooltip to match current settings. */
  updateModeIndicator() {
    if (!this.modeToggleBtn) return;
    const states = this.plugin.settings.toggleStates;
    const idx    = this.plugin.settings.toggleStateIndex ?? 0;
    const state  = states?.[idx];
    this._applyToggleIcon(
      this.modeToggleBtn,
      state?.obsidianIcon ?? this.getProviderIcon()
    );
    this.modeToggleBtn.title = this.getProviderInfo();
  }

  _updateTokenCounter() {
    // Always run — showTokenCounter only controls visibility of the widget,
    // not whether token data is tracked. If the counter element isn't visible
    // or doesn't exist yet, skip only the DOM update.
    if (!this.tokenCounter) return;
    if (!this.plugin.settings.showTokenCounter) return;

    const maxTokens = this.plugin.settings.max_tokens || 2048;
    const sm = this.plugin._sessionManager;

    // The total is derived from the per-message token values of the ACTIVE
    // session, so it follows the conversation: switching, editing or truncating
    // messages is reflected immediately and nothing needs to be subtracted.
    const session = sm.getActive();
    const last = session?.lastRequestTokens || {};

    // Current input estimate (local — request not sent yet)
    const inputText = this.inputEl ? this.inputEl.value : '';
    const estimatedInput = estimateTokens(inputText);

    let total, estimated;
    const editingIdx = this._editingMessageIndex;
    if (editingIdx !== null && editingIdx !== undefined && session) {
      // Editing an old message: only the messages BEFORE it still count, plus
      // the text being typed. Everything after it will be discarded on resend.
      const before = sm.getSessionTokens(session, editingIdx);
      total = before.total + estimatedInput;
      estimated = true;
    } else {
      ({ total, estimated } = sm.getSessionTokens(session));
    }

    const providerName = this.getProviderName();

    if (this.tokenCounter) {
      this.tokenCounter.empty();
      const tokenIcon = this.tokenCounter.createSpan();
      setIcon(tokenIcon, 'binary');
      tokenIcon.style.display = 'flex';

      const tokenText = this.tokenCounter.createSpan();

      if (total > 0 && session?.messages?.length) {
        // Prefix with ~ whenever part of the number is a local estimate
        // (legacy messages, a message being edited, providers without usage data).
        const prefix = estimated ? '~' : '';
        tokenText.textContent = `${prefix}${total.toLocaleString()} tkns`;
        this.tokenCounter.title =
          `${providerName}\n` +
          (editingIdx !== null && editingIdx !== undefined
            ? `Context before the edited message + your new text: ${prefix}${total.toLocaleString()}\n`
            : `Conversation tokens${estimated ? ' (partly estimated)' : ' (API)'}: ${prefix}${total.toLocaleString()}\n`) +
          (last.totalTokens !== undefined
            ? `Last request — In: ${last.inputTokens ?? 0} | Out: ${last.outputTokens ?? 0} | Total: ${last.totalTokens ?? 0}${last.estimated ? ' (estimated)' : ''}\n`
            : '') +
          `Current input estimate: ~${estimatedInput}\n` +
          `Max tokens per request: ${maxTokens}`;
      } else {
        // Empty conversation — show estimated input vs max
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

      // Extra tooltip line: context-window usage (from the model catalog)
      const ctx = this.plugin.getContextInfo(last);
      if (ctx) {
        this.tokenCounter.title += `\nContext window: ${Math.round(ctx.ratio * 100)}% of ${ctx.limit.toLocaleString()} tokens (${last.model})`;
      }

      // Colour hint: context-window usage when known, otherwise last request vs max tokens
      const lastTotal = last.totalTokens ?? 0;
      if (ctx ? ctx.ratio >= 0.95 : lastTotal > maxTokens) {
        this.tokenCounter.style.color = 'var(--text-error)';
        this.tokenCounter.style.backgroundColor = 'rgba(var(--background-modifier-error-rgb), 0.2)';
      } else if (ctx ? ctx.ratio >= 0.8 : lastTotal > maxTokens * 0.8) {
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
    
    s.messages.forEach((m, idx) => {
      this._appendBubble(m.role, m.content, m.attachments, idx);
      if (m.role === 'assistant' && m.reasoning) {
        const bubble = this.chatEl.lastElementChild?.querySelector('.ai-msg');
        if (bubble) new ReasoningPanel(bubble, m.reasoning, false);
      }
    });
    this._scheduleScrollToBottom();

    // ── FIX 1: Restore draft for the newly active session ─────────────────
    // Every session stores its own unsent text and attachment metadata.
    // When the user switches sessions (or the view is rebuilt) we restore the
    // draft so typing is never lost due to navigation or layout refreshes.
    this._restoreSessionDraft();

    // ── FIX 3: Restore the correct generating-state for the active session ─
    // If the user switched to a session that is/was generating, the Send
    // button must reflect THAT session's state rather than leaking the
    // previous session's state.
    this._syncGeneratingStateToUI();

    // Refresh token counter so it reflects the newly active (or cleared) session
    this._updateTokenCounter();
  }

  /**
   * FIX 1: Restore the saved draft (text + attachments metadata) from the
   * active session into the input box and the pending-attachments preview bar.
   *
   * Lightweight: only the metadata pill-bar is rebuilt here. The full file
   * content is NOT re-read at this point — it is re-read from the vault only
   * when the user actually sends the message (matching the normal attach flow).
   */
  _restoreSessionDraft() {
    if (!this.inputEl) return;
    // While a sent message is being edited the input box holds the edit (text and attachments).
    // A layout refresh or re-render must not replace it with the compose draft — that wiped
    // the edit while the editing banner stayed on screen. _cancelEditMessage ends the edit
    // first, then restores the draft, so it is unaffected.
    if (this._editingMessageIndex !== null && this._editingMessageIndex !== undefined) {
      this._updateTokenCounter?.();
      return;
    }
    const { input, pendingAttachmentsMeta } = this.plugin._sessionManager.loadDraft();

    // Restore text
    this.inputEl.value = input || '';
    this._updateTokenCounter?.();

    // Rebuild pendingAttachments from the saved metadata so the pill bar and
    // the internal array match. Content / dataUrl are set to null here; they
    // are re-read from the vault when the message is eventually sent.
    this.pendingAttachments = (pendingAttachmentsMeta || []).map(meta => ({
      name:     meta.name,
      path:     meta.path     || null,
      isImage:  !!meta.isImage,
      mimeType: meta.mimeType || null,
      // Content intentionally null — will be re-read from vault on send.
      content:  null,
      dataUrl:  null,
      scope:    meta.scope    || 'full'
    }));

    // Refresh the pill preview bar to show the restored attachments.
    this._refreshEditModeBtn?.();
  }

  /**
   * FIX 3: Sync the Send/Stop button and the legacy scalar properties to
   * reflect the ACTIVE session's generation state. Called whenever the active
   * session changes so the UI always matches the session on screen.
   */
  _syncGeneratingStateToUI() {
    const genState = this._activeGenState();

    // Keep legacy scalars in sync so existing code that reads them directly
    // sees the correct values for the current session.
    this._isGenerating      = genState.isGenerating;
    this._activeRequestInfo = genState.activeRequestInfo;
    this._stopRequested     = genState.stopRequested;

    if (!this.sendBtn) return;

    if (genState.isGenerating) {
      this.sendBtn.empty();
      this.sendBtn.createSpan({ text: '□', attr: { style: 'display:flex;align-items:center;justify-content:center;line-height:1;pointer-events:none;padding-top:5px;' } });
      this.sendBtn.title = 'Stop generating';
      this.sendBtn.classList.add('ai-send-btn-stop');
    } else {
      this.sendBtn.empty();
      this.sendBtn.createSpan({ text: '➤', attr: { style: 'display:flex;align-items:center;justify-content:center;line-height:1;pointer-events:none;padding-top:5px;' } });
      this.sendBtn.title = (this.editMode && this._pendingEditFiles.length > 0) ? 'Run AI file edits' : 'Send';
      this.sendBtn.classList.remove('ai-send-btn-stop');
    }
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
    applyAutoTextDirection(el, text);
  }

  _createResponseCopyBtn(text) {
    const copyBtn = document.createElement('button');
    copyBtn.className = 'ai-copy-btn';
    copyBtn.title = 'Copy response to clipboard';
    setIcon(copyBtn, 'copy');
    copyBtn.style.background = 'transparent';
    copyBtn.style.border = 'none';
    copyBtn.style.cursor = 'pointer';
    copyBtn.style.padding = '4px 9px';
    copyBtn.style.marginTop = '-40px';
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
  _attachMessageActionHandlers(bubble, text, index, attachments = [], role = 'user') {
    if (role === 'user') bubble.style.cursor = 'pointer';

    // ── Desktop: right-click ────────────────────────────────────────────
    bubble.addEventListener('contextmenu', (e) => {
      // On a reply the browser's own menu stays when text is selected (copy etc.)
      if (role !== 'user' && window.getSelection && String(window.getSelection()).length) return;
      e.preventDefault();
      this._showMessageActionsMenu(e.clientX, e.clientY, text, index, attachments, role);
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
        this._showMessageActionsMenu(startX, startY, text, index, attachments, role);
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
  _showMessageActionsMenu(x, y, text, index, attachments = [], role = 'user') {
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

    if (role === 'user') {
      makeItem('pencil', 'Edit Message', () => {
        this._beginEditMessage(index, text, attachments);
      });
    }

    // Branch from this message without editing it (only with conversation branching on)
    if (this.plugin.settings.conversationBranching && this.plugin._sessionManager.canBranchFrom(index)) {
      makeItem('git-branch', 'Branch', () => this._branchFromMessage(index));
    }

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
    // Already editing another message? Park that work-in-progress first
    // (_cancelEditMessage caches it and restores the compose draft).
    if (this._editingMessageIndex !== null) {
      this._cancelEditMessage();
    }
    // Flush the unsent compose draft before the input box is reused for the
    // edit, so it can be restored afterwards even if the debounce hadn't fired.
    if (this._saveDraftTimer) { clearTimeout(this._saveDraftTimer); this._saveDraftTimer = null; }
    this.plugin._sessionManager.saveDraft(this.inputEl ? this.inputEl.value : '', this.pendingAttachments);

    this._editingMessageIndex = index;
    this._pendingEditFiles = []; // this is unrelated to the "AI file edit" attach mode
    this.editMode = false;

    // ── FIX 2: Restore cached edit draft if one exists ────────────────────
    // When the user previously opened this edit, typed something, and then
    // cancelled or clicked away, their in-progress text and attachments were
    // saved in _editDraftCache. Re-opening edit mode for the same message
    // restores that cached work-in-progress instead of resetting to the
    // original committed text.
    const sessionId = this.plugin._sessionManager.activeId;
    const cacheKey  = `${sessionId}-${index}`;
    const cached    = this._editDraftCache.get(cacheKey);

    const sentMsg = this.plugin._sessionManager.getActive()?.messages?.[index];

    if (cached) {
      // Restore the cached draft (user's in-progress edit)
      this.inputEl.value     = cached.text;
      this.pendingAttachments = [...(cached.attachments || [])];
      if (cached.editFiles && cached.editFiles.length) this._restoreEditFiles(cached.editFiles, !!cached.editMode, true);
    } else if (sentMsg && Array.isArray(sentMsg.editFiles) && sentMsg.editFiles.length) {
      // An "✏ Edit instruction": show only what the user wrote, and bring back its files
      this.inputEl.value     = (text || '').replace(/^✏ Edit instruction:\s*/, '');
      this.pendingAttachments = [...(attachments || [])];
      this._restoreEditFiles(sentMsg.editFiles, true, false);
    } else {
      // No cached draft — start from the committed message (original behaviour)
      this.inputEl.value     = text || '';
      this.pendingAttachments = [...(attachments || [])];
    }

    // Draw the attachment pills AFTER pendingAttachments has been filled.
    // (This used to run before the assignment above, so the message's
    // attachments were loaded but never shown in the preview bar.)
    this._refreshEditModeBtn?.();

    this.inputEl.focus();
    this.inputEl.setSelectionRange(this.inputEl.value.length, this.inputEl.value.length);
    this._updateTokenCounter?.();

    if (this.editingBanner) {
      this.editingBanner.style.display = 'flex';
    }
    this.sendBtn.title = 'Save & Resend';
  }

  /**
   * Puts the files of an "✏ Edit instruction" back in the input box (as chips + the edit list).
   * @param {string[]} paths   vault paths remembered on the message
   * @param {boolean}  editOn  switch ✏ Edit on
   * @param {boolean}  chipsAlreadyThere  the chips were restored from a cached draft
   */
  _restoreEditFiles(paths, editOn, chipsAlreadyThere) {
    const files = (paths || [])
      .map(p => this.app.vault.getAbstractFileByPath(p))
      .filter(f => f && f.extension !== undefined);            // files only; deleted ones are skipped
    this._pendingEditFiles = files;
    this.editMode = editOn && files.length > 0;
    this._refreshEditModeBtn?.();
    if (chipsAlreadyThere || !files.length) return;

    (async () => {
      const have = new Set((this.pendingAttachments || []).filter(a => !a.isImage).map(a => a.path));
      const entries = [];
      for (const f of files) {
        if (have.has(f.path)) continue;
        try {
          entries.push({ name: f.basename, path: f.path, content: await this.app.vault.read(f), metadata: null, scope: 'full', isImage: false });
        } catch (e) { console.error(e); }
      }
      if (this._editingMessageIndex === null) return;           // the user already left edit mode
      this.pendingAttachments = [...(this.pendingAttachments || []).filter(a => a.isImage), ...(this.pendingAttachments || []).filter(a => !a.isImage), ...entries];
      this._refreshEditModeBtn?.();
    })();
  }

  /** Cancels inline message editing and returns the input box to a normal compose state. */
  _cancelEditMessage(discardDraft = false) {
    // ── FIX 2: Persist the in-progress edit to the cache before clearing ───
    // If the user had typed anything (or changed attachments) since opening
    // the edit, save that work-in-progress so it can be restored the next
    // time they open edit mode for this message.
    // discardDraft = true when the edit was just committed: nothing to keep.
    if (this._editingMessageIndex !== null && !discardDraft) {
      const sessionId = this.plugin._sessionManager.activeId;
      const cacheKey  = `${sessionId}-${this._editingMessageIndex}`;
      const currentText = this.inputEl ? this.inputEl.value : '';
      // Only cache if the user actually changed something — no point caching
      // an empty box or the exact original text (which _beginEditMessage
      // already provides as the default fallback).
      if (currentText.trim() || this.pendingAttachments.length > 0) {
        this._editDraftCache.set(cacheKey, {
          text:        currentText,
          attachments: [...this.pendingAttachments],
          editFiles:   this._pendingEditFiles.map(f => f.path),
          editMode:    this.editMode
        });
      } else {
        // Nothing worth caching — remove any stale entry for this message.
        this._editDraftCache.delete(cacheKey);
      }
    }

    this._editingMessageIndex = null;
    this.pendingAttachments = [];
    this._pendingEditFiles = [];
    this.editMode = false;
    this._refreshEditModeBtn?.(); // clears preview-bar pills and hides the bar
    this.inputEl.value = '';
    this._updateTokenCounter?.();
    if (this.editingBanner) this.editingBanner.style.display = 'none';
    this.sendBtn.title = 'Send';

    // FIX 1: Restore the compose-mode draft so the input box shows the
    // unsent text the user had before entering edit mode.
    this._restoreSessionDraft();
  }

  /** Commits an inline message edit (from the main input box) and resends it. */
  /** The note the user was last working in: its selection and text (unsaved edits included). */
  _getNoteContext() { return getNoteContextFor(this.app); }

  /** Chat history search: earlier conversations that match this message, as a short task layer for this turn only. */
  async _addHistoryDigestLayer(messages) {
    const digest = await this.plugin.historyDigestFor(this.plugin._sessionManager.getActive());
    if (digest) this.plugin.promptAssembler.addTaskLayer(messages, digest);
  }

  /** If the message being answered invoked a skill (/skill-name), load its instructions for this turn as a task layer. */
  async _addInvokedSkillLayer(messages) {
    const session = this.plugin._sessionManager.getActive();
    const last = session && [...session.messages].reverse().find(m => m.role === 'user');
    if (!last || !last.invokedSkill) return;
    const skill = await this.plugin.skills.load(last.invokedSkill);
    if (skill && skill.body) {
      this.plugin.promptAssembler.addTaskLayer(messages,
        `The user invoked the skill "${skill.name}" for this message. Follow these instructions:\n\n${skill.body}`);
    }
  }

  async _onSendEditedMessage() {
    const index = this._editingMessageIndex;
    let trimmed = this.inputEl.value.trim();
    const attachments = [...this.pendingAttachments];

    if (!trimmed && attachments.length === 0) {
      new Notice('Message cannot be empty');
      return;
    }

    // ── "✏ Edit" toggled on while editing a sent message ────────────────────
    // The edited message becomes an "✏ Edit instruction" that runs the file-edit pipeline on
    // the attached files (instead of re-sending a plain message). Nothing is touched until the
    // instruction and the files have been read, so a mistake cannot lose the user's work.
    if (this.editMode && this._pendingEditFiles.length > 0) {
      const instruction = trimmed.replace(/^✏ Edit instruction:\s*/, '').trim();
      if (!instruction) {
        new Notice('Describe the edits you want the AI to make');
        return;
      }
      const editFiles = [...this._pendingEditFiles];
      this._editDraftCache.delete(`${this.plugin._sessionManager.activeId}-${index}`);
      this._cancelEditMessage(true);     // clears the editing UI and brings back the unsent draft
      await this._onEditSend({ instruction, files: editFiles, replaceIndex: index });
      return;
    }

    // "/command" or "/skill" at the start of the edited text expands like in a new message.
    let invokedSkill = null;
    let mentionSource = trimmed;
    const slash = await this.plugin.resolveSlash(trimmed, () => this._getNoteContext());
    if (slash === false) return;
    if (slash) { trimmed = slash.text; invokedSkill = slash.skill || null; mentionSource = slash.mentionText || ''; }
    attachments.push(...await this.plugin.resolveMentions(mentionSource, attachments));

    // ── FIX 2: Clear the cached draft for this message on successful send ──
    // The edit is being committed, so the WIP cache entry is no longer needed.
    const sessionId = this.plugin._sessionManager.activeId;
    const cacheKey  = `${sessionId}-${index}`;
    this._editDraftCache.delete(cacheKey);

    // discardDraft=true so _cancelEditMessage does not re-cache the text that
    // was just committed. index/trimmed/attachments were captured above.
    this._cancelEditMessage(true); // clear editing UI state before the resend starts streaming
    await this._editAndResend(index, trimmed, attachments, invokedSkill);
  }

  async _editAndResend(index, newText, newAttachments, invokedSkill = null) {
    const session = this.plugin._sessionManager.getActive();
    if (!session) return;

    const ok = this.plugin._sessionManager.editUserMessage(index, newText, newAttachments, this._editMode());
    if (!ok) { new Notice('⨉ Could not edit message'); return; }
    if (invokedSkill) session.messages[index].invokedSkill = invokedSkill;
    else delete session.messages[index].invokedSkill;

    this.plugin.saveState();
    this._renderMessages(); // Rebuild the visible history up to the edited message
    this.plugin.refreshChatViews(this); // Keep sidebar/main page in sync too

    // Determine whether the full file-ops guidelines need to be injected for
    // this re-sent message.  In 'on-demand' mode we read the classifier signal
    // from the most recent assistant reply in the session (the model embeds
    // <!-- NEED_FILE_OPS --> or <!-- NO_FILE_OPS --> there) so no extra
    // network round-trip is needed.  The keyword heuristic fires as a fallback
    // when no prior reply exists yet.
    const _fileOpsEnabledResend = this.plugin.settings.fileOpsScope && this.plugin.settings.fileOpsScope !== 'disabled';
    if (_fileOpsEnabledResend) {
      const _resendMsgs = session.messages;
      const _lastAsst = [..._resendMsgs].reverse().find(m => m.role === 'assistant');
      const _prevReply = typeof _lastAsst?.content === 'string' ? _lastAsst.content : null;
      this._pendingFileOpsInject = await this._checkFileOpIntent(newText, _prevReply);
    }

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
  /**
   * Schedules a single scroll-to-bottom on `chatEl` using requestAnimationFrame
   * so multiple calls within the same frame are collapsed into one.  This
   * prevents the repeated synchronous layout reads (`scrollHeight`) that happen
   * when scrollTop is set on every streaming chunk, which is the primary cause
   * of UI freezes and scroll-lock during long responses.
   *
   * Safe to call as often as needed — redundant calls before the frame fires
   * are simply no-ops.
   */
  /**
   * @param {boolean} [duringStream=false] – pass `true` when called from an
   *   onChunk handler so the call is gated by the autoScrollOnStream setting.
   *   Structural scrolls (initial render, bubble append, etc.) omit this flag
   *   and always fire regardless of the setting.
   */
  _scheduleScrollToBottom(duringStream = false) {
    if (duringStream && !this.plugin.settings.autoScrollOnStream) return;
    if (this._scrollRafPending) return;
    this._scrollRafPending = true;
    requestAnimationFrame(() => {
      this._scrollRafPending = false;
      if (this.chatEl) {
        this.chatEl.scrollTop = this.chatEl.scrollHeight;
      }
    });
  }

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
        acc = stripConvNameTagLive(acc);
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
      // Uses a higher cap so the full response is visible.
      //
      // IMPORTANT: this renders IMMEDIATELY/synchronously rather than via
      // requestAnimationFrame. rAF callbacks are paused by the OS/Electron
      // whenever the window or tab is not visible/focused (e.g. the user
      // switched to another app or pane while the response was finishing).
      // The network request would complete fine (200 OK), the message would
      // be saved to the session, but the queued rAF paint would never fire —
      // so the bubble stayed stuck showing partial/old content until
      // something else (like a session switch) forced a full re-render.
      // Since this is a one-shot final paint (not part of the
      // frame-batched streaming loop), there's no benefit to deferring it.
      finish: (finalAcc) => {
        rafPending = false; // cancel any stale pending frame from update()
        scheduled = false;
        lastRenderTime = Date.now();
        const renderText = finalAcc.length > RENDER_CAP_FINAL
          ? finalAcc.slice(0, RENDER_CAP_FINAL) + '\u2026'
          : finalAcc;
        streamingMsg.empty();
        MarkdownRenderer.render(this.app, renderText, streamingMsg, '', this.plugin);
        this._applyTextDirection(streamingMsg, finalAcc);
      }
    };
  }

  /**
   * Swaps the Send button's icon into a square "Stop" glyph (and back) to
   * reflect whether a response is currently being generated. The button
   * itself keeps its normal round shape and accent color — only the icon
   * inside changes. Called around every request made through
   * `_getAssistantReply`.
   *
   * FIX 3: Generation state is now stored per-session so switching sessions
   * shows the correct button state for THAT session rather than leaking the
   * previous session's generating state into the new one.
   *
   * @param {boolean} isGenerating
   * @param {string}  [forSessionId] – the session this state belongs to.
   *   Defaults to the currently active session. Pass explicitly when the
   *   caller knows the session (e.g. _onSend, _generateAssistantResponse)
   *   to ensure the state is stored on the right bucket even if the user
   *   switches sessions mid-generation.
   */
  _setGeneratingState(isGenerating, forSessionId = null) {
    // ── FIX 3: Persist state on the session that OWNS this request ───────
    const ownerSessionId = forSessionId || this.plugin?._sessionManager?.activeId;
    const genState = this._getSessionGenState(ownerSessionId);
    genState.isGenerating = isGenerating;

    if (!isGenerating) {
      // Clear request tracking when done so the Stop button is never
      // erroneously active on a session that has finished generating.
      genState.activeRequestInfo = null;
      genState.stopRequested     = false;
      genState.toolAbort         = null;
    }

    // ── Sync legacy scalar properties to the ACTIVE session's values ─────
    // Other code paths (e.g. createInputArea's initial state check) read the
    // scalar _isGenerating directly. Keep them in sync with whichever session
    // is currently visible.
    const activeGenState = this._activeGenState();
    this._isGenerating      = activeGenState.isGenerating;
    this._activeRequestInfo = activeGenState.activeRequestInfo;
    this._stopRequested     = activeGenState.stopRequested;

    // ── Only update the button when the affected session is the active one ─
    // If the user has already switched to a different session, don't flip the
    // button back to "Stop" (or "Send") for the wrong session.
    if (ownerSessionId !== this.plugin?._sessionManager?.activeId) return;

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
    }
  }

  /**
   * Called when the user clicks the Stop button while a response is being
   * generated. Immediately aborts the in-flight API request; the graceful
   * handling of whatever partial text had already arrived happens in
   * `_getAssistantReply` / the streaming plumbing, not here.
   *
   * FIX 3: Reads from the active session's generation state so the Stop
   * button only aborts the request that belongs to the current session.
   */
  _stopGeneration() {
    // FIX 3: Use the active session's state, not the legacy scalar.
    const genState = this._activeGenState();
    if (!genState.isGenerating) return;
    genState.stopRequested = true;
    // Keep legacy scalar in sync for any code that still reads it directly.
    this._stopRequested = true;
    if (genState.activeRequestInfo) {
      const { requestId, networkManager } = genState.activeRequestInfo;
      networkManager.abortRequest(requestId, /* viaUserAction */ true);
    }
    // A running tool (or a permission prompt waiting for an answer) is cancelled the same way.
    if (genState.toolAbort) genState.toolAbort.abort();
    // Reflect the stop immediately; _getAssistantReply's completion will
    // also call _setGeneratingState(false), but flipping it here too keeps
    // the button responsive even if the abort takes a moment to unwind.
    if (this.sendBtn) this.sendBtn.title = 'Stopping…';
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
    this._replyConvName = '';
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
    //
    // FIX 3: Store activeRequestInfo on the owning session's state bucket
    // (not just on the legacy scalar) so _stopGeneration always finds the
    // right request even after a session switch.
    const _replyOwnerSessionId = this.plugin._sessionManager.activeId;
    // Plan mode: look things up and write the plan, but change nothing (FR-3.1)
    const planning = this.plugin.isPlanning(activeSession);
    const onRequestStart = (info) => {
      // Update the per-session bucket
      const gs = this._getSessionGenState(_replyOwnerSessionId);
      gs.activeRequestInfo = info;
      // Keep the legacy scalar in sync for the active session
      if (_replyOwnerSessionId === this.plugin._sessionManager.activeId) {
        this._activeRequestInfo = info;
      }
    };

    // Tools registered by features (FR-0.1) join this turn only when the registry has something
    // the active model can take; otherwise nothing below differs from a tool-less chat.
    const apiType = this.plugin.apiManager.activeApiType();
    const toolModel = this.plugin.getConfiguredModel(apiType);
    let toolDefs = this.plugin._toolRegistry ? this.plugin._toolRegistry.defsFor(apiType, toolModel, { readOnly: planning }) : [];
    // Web search (FR-3.4): the provider's own tool for this request, or the external service's tools (already in toolDefs)
    let useBuiltin = this.plugin.webSearch.plan(apiType, toolModel).mode === 'builtin';

    if (!fileOpsEnabled && !toolDefs.length && !useBuiltin) {
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
            this._scheduleScrollToBottom(true);
          }
        },
        onReasoning: (d) => this._pushReasoning(streamingMsg, _replyOwnerSessionId, d),
        onRequestStart,
        sessionId: _replyOwnerSessionId,
        timeoutMs: this.plugin.settings.timeoutMs
      });
      if (result && result.reasoning) this._ensureReasoning(streamingMsg, _replyOwnerSessionId, result.reasoning);

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
        // FIX 3: Read stopRequested from the owning session's bucket.
        const _wasStoppedA = this._getSessionGenState(_replyOwnerSessionId).stopRequested;
        return _wasStoppedA ? { displayText: '', notices: [], stoppedEarly: true } : null;
      }

      this._replyConvName = extractConvNameTag(finalText || acc);
      const displayText = this._stripFileOpSignalTag(stripConvNameTag(finalText || acc));
      streamRenderer.finish(displayText);
      this.plugin.vaultFileManager.extraAllowedPaths = new Set();
      return { displayText, notices: [] };
    }

    // ---- Agent loop: file-operation lookups (text protocol) and registry tools (native tool calls) ----
    streamingMsg.innerHTML = '⏳ Thinking' + threeDots();
    let workingMessages = messages;
    let finalText = '';
    const MAX_ITERS = 8;
    let patchFailRounds = 0;
    // What this reply took (tool calls, vault lookups), for the "save as a skill?" offer
    let taskSteps = 0;
    const taskTrace = [];
    // Pages the answer is based on (from the provider's search or the search tools), shown as links under it
    const taskSources = new Map();
    const addSources = (list) => (list || []).forEach(x => {
      const u = safeHttpUrl(x && x.url);
      if (u && !taskSources.has(u) && taskSources.size < WEB_SOURCES_MAX) taskSources.set(u, { url: u, title: String((x && x.title) || '').trim() });
    });
    // Gemini's search tool cannot share a request with function tools, so a search request carries no others
    const toolsFor = (builtin) => ((builtin && apiType === 'gemini') ? null : (toolDefs.length ? toolDefs : null));
    // One controller per turn: Stop aborts it, which cancels a running tool and closes a pending permission prompt.
    const toolAbort = new AbortController();
    this._getSessionGenState(_replyOwnerSessionId).toolAbort = toolAbort;

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
      // The last round may no longer call tools, so the model has to answer in text. The tool
      // definitions stay in the request (Anthropic requires them whenever the history has tool calls).
      const callModel = (tools, builtin) => this.plugin.apiManager.sendMessage({
        messages: workingMessages,
        temperature: this.plugin.settings.temperature,
        max_tokens: this.plugin.settings.max_tokens,
        stream: true,
        tools: tools || undefined,
        toolChoice: (tools && i === MAX_ITERS - 1) ? 'none' : undefined,
        builtinSearch: builtin || undefined
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
            this._scheduleScrollToBottom(true);
          }
        },
        onReasoning: (d) => this._pushReasoning(streamingMsg, _replyOwnerSessionId, d),
        onRequestStart,
        sessionId: _replyOwnerSessionId,
        timeoutMs: this.plugin.settings.timeoutMs
      });
      let result;
      let searchExperiment = false;
      for (;;) {
        try {
          result = await callModel(toolsFor(useBuiltin), useBuiltin);
          break;
        } catch (e) {
          const kind = e && e.kind;
          // The provider may not take its built-in search tool for this model. Leave it out and see: if
          // the request then goes through, remember that (plugin folder, not the vault) and use the
          // external service for this model from now on; if it fails the same way, it was not the search.
          if (useBuiltin && (kind === 'tool_unsupported' || kind === 'bad_request' || kind === 'model_unavailable')) {
            useBuiltin = false;
            searchExperiment = true;
            this.plugin.modelCatalog.setSearchRefused(apiType, toolModel, true);
            toolDefs = this.plugin._toolRegistry ? this.plugin._toolRegistry.defsFor(apiType, toolModel, { readOnly: planning }) : [];
            acc = '';
            continue;
          }
          // The endpoint refused the tool definitions: remember that for this model (plugin folder,
          // not the vault), and answer this turn without tools.
          if (toolDefs.length && kind === 'tool_unsupported') {
            toolDefs = [];
            if (searchExperiment) { this.plugin.modelCatalog.setSearchRefused(apiType, toolModel, false); searchExperiment = false; }
            this.plugin.modelCatalog.markToolsRefused(apiType, toolModel).catch(() => {});
            acc = '';
            continue;
          }
          if (searchExperiment) this.plugin.modelCatalog.setSearchRefused(apiType, toolModel, false);
          throw e;
        }
      }
      if (searchExperiment) this.plugin.modelCatalog.saveSearchState().catch(() => {});
      if (result && result.sources) addSources(result.sources);
      if (result && result.searchError) new Notice(`Web search didn't work (${result.searchError}).`);
      if (result && result.reasoning) this._ensureReasoning(streamingMsg, _replyOwnerSessionId, result.reasoning);
      finalText = (result && result.final) ? result.final : acc;

      // The user hit Stop mid-loop — stop iterating and surface whatever
      // partial text this round produced (may be empty), rather than
      // kicking off another request.
      // FIX 3: Read stopRequested from the owning session's bucket.
      if (this._getSessionGenState(_replyOwnerSessionId).stopRequested) break;

      // The model asked for tools: check permission, run them, hand the results back, ask again.
      // (Never on the last round — it was sent with tool calls switched off.)
      if (result && result.toolCalls && result.toolCalls.length && toolDefs.length && i < MAX_ITERS - 1) {
        streamingMsg.empty();
        streamingMsg.textContent = '🔧 Working…';
        const toolRun = await this.plugin.toolExecutor.runCalls(result.toolCalls, {
          signal: toolAbort.signal,
          isStopped: () => this._getSessionGenState(_replyOwnerSessionId).stopRequested,
          sessionId: _replyOwnerSessionId,
          readOnly: planning,
          onStatus: (title) => { streamingMsg.textContent = `🔧 ${title}…`; }
        });
        if (toolRun.stopped) break;     // Stop pressed: keep whatever text this round produced
        toolRun.messages.forEach(m => { if (m.sources) addSources(m.sources); });
        result.toolCalls.forEach((c, k) => {
          taskSteps++;
          const argText = (() => { try { return JSON.stringify(c.args); } catch (_) { return ''; } })();
          taskTrace.push(`${c.name}(${argText.length > 120 ? argText.slice(0, 120) + '…' : argText}) → ${toolRun.messages[k] && toolRun.messages[k].isError ? 'error' : 'ok'}`);
        });
        workingMessages = [
          ...workingMessages,
          { role: 'assistant', content: finalText, toolCalls: result.toolCalls, raw: result.raw },
          ...toolRun.messages
        ];
        finalText = '';
        continue;
      }

      if (!finalText) break;

      // Tools only (file operations off): there is nothing to look up, this is the answer.
      if (!fileOpsEnabled) break;

      // Extract metadata from every @@FILE_OP@@ block *before* the text is
      // cleaned, so no path or operation information is lost in stripping.
      const iterMemory = ContextMemory.extractFromOps(finalText, accumulatedMemory);
      if (iterMemory) {
        accumulatedMemory = ContextMemory.mergeWithExisting(accumulatedMemory, iterMemory);
      }

      const queryBlock = await extractAndRunQueryOps(finalText, this.plugin.vaultFileManager, { signal: toolAbort.signal });

      // Dry-run any patch ops. If one can't be applied, hand the exact errors
      // back to the AI (instead of failing outright) so it can fix the patch or
      // switch to a full-file edit. Nothing is written during this check.
      let patchFeedback = null;
      if (!planning && i < MAX_ITERS - 1 && patchFailRounds < 3) {
        patchFeedback = await validatePatchOps(finalText, this.plugin.vaultFileManager);
        if (patchFeedback) patchFailRounds++;
      }

      if (!queryBlock && !patchFeedback) break; // nothing to look up or fix — this is the final answer

      if (i === MAX_ITERS - 1) {
        finalText += `\n\n_(Stopped after checking several files/folders — let me know if you'd like me to keep going.)_`;
        break;
      }

      // This was a query-only iteration (list/read/search) — reset the bubble
      // so any raw @@FILE_OP@@ syntax that was streamed optimistically above
      // is wiped from the UI before the next round.
      streamingMsg.empty();
      if (queryBlock) { taskSteps++; taskTrace.push('looked up files in the vault'); }
      streamingMsg.textContent = (patchFeedback && !queryBlock) ? '🔧 Fixing the patch…' : '🔍 Checking your vault…';
      const feedbackParts = [];
      if (queryBlock) {
        feedbackParts.push(`[Vault query results]\n\n${queryBlock}\n\nContinue the original request now that you have this information. Issue another list/read operation only if you still need more; otherwise complete the task.`);
      }
      if (patchFeedback) {
        feedbackParts.push(
          `[Patch errors]\n\n${patchFeedback}\n\n` +
          (patchFailRounds >= 3
            ? 'Patching has failed repeatedly. For each failing file, use an edit operation containing the COMPLETE new file content instead of a patch. Nothing from your previous reply was applied, so re-send every operation the task needs.'
            : 'Nothing from your previous reply was applied. Re-send your COMPLETE reply — including every other operation it contained — with the failing patch corrected.')
        );
      }
      workingMessages = [
        ...workingMessages,
        { role: 'assistant', content: finalText },
        { role: 'user', content: feedbackParts.join('\n\n---\n\n') }
      ];
    }

    if (!finalText) {
      this.plugin.vaultFileManager.extraAllowedPaths = new Set();
      // FIX 3: Read stopRequested from the owning session's bucket.
      const _wasStoppedB = this._getSessionGenState(_replyOwnerSessionId).stopRequested;
      return _wasStoppedB ? { displayText: '', notices: [], stoppedEarly: true } : null;
    }

    // Strip the embedded classifier signal tag before any further processing
    // so it never appears in displayed text, stored messages, or FILE_OP blocks.
    this._replyConvName = extractConvNameTag(finalText);
    finalText = this._stripFileOpSignalTag(stripConvNameTag(finalText));

    const { cleanedText, notices, pendingEdits } = fileOpsEnabled
      ? await applyFileOps(finalText, this.plugin.vaultFileManager, { readOnly: planning, signal: toolAbort.signal })
      : { cleanedText: finalText, notices: [], pendingEdits: [] };

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
        diff:            DiffComputer.computeLineDiff(pe.originalContent, pe.newContent, { ignoreWhitespace: this.plugin.settings.ignoreWhitespaceInDiff !== false }),
        selected:        true,
        chatMessage:     '',
        error:           null
      }));

      // Pre-select only files that actually have changes
      fileDiffs.forEach(fd => { fd.selected = DiffComputer.hasChanges(fd.diff); });

      const onDiffApply = (appliedFiles) => {
        if (!appliedFiles.length) return;
        // Deduplicate any prior diff-summary messages (same logic as _onEditSend)
        this.plugin._sessionManager.removeMessagesWhere(m => m.isDiffSummary);
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

    const proposed = pendingEdits ? pendingEdits.length : 0;
    return {
      displayText, storedText, notices, pendingEdits,
      sources: [...taskSources.values()],
      steps: taskSteps + proposed,
      trace: proposed ? [...taskTrace, `proposed edits to ${proposed} file${proposed !== 1 ? 's' : ''}`] : taskTrace
    };
  }

  async _generateAssistantResponse() {
    await this.plugin.refreshPromptLayers();
    const messages = this.plugin._sessionManager.getMessagesForRequest();
    await this._addInvokedSkillLayer(messages);
    await this._addHistoryDigestLayer(messages);
    this._addPlanLayer(messages);
    this._addWebSearchNoteLayer(messages);

    // ── File-ops guidelines injection (edit/retry path) ──────────────────
    // This path is taken by _editAndResend and the resend/retry button.
    // Both callers run _checkFileOpIntent() on the relevant user message and
    // set _pendingFileOpsInject before arriving here, so this block only
    // needs to read the flag and inject accordingly.
    //
    // Exception: 'always' mode — the callers set the flag via _checkFileOpIntent
    // which returns true immediately, so 'always' is already handled uniformly.
    //
    // The <!-- SYSTEM_MEMORY: {...} --> comment embedded by ContextMemory in
    // prior assistant messages carries file-path/op continuity across turns
    // where the full guidelines are not re-injected.
    const _activeForSys = this.plugin._sessionManager.getActive();
    const _unlockedForSys = _activeForSys
      ? (this._sessionEditUnlockedFiles.get(_activeForSys.id) ?? new Set())
      : new Set();
    if (this._pendingFileOpsInject) {
      const fileOpsMessage = await this.plugin.getFileOpsSystemMessage(_unlockedForSys);
      if (fileOpsMessage) {
        this.plugin.promptAssembler.addTaskLayer(messages, fileOpsMessage);
      }
      this._pendingFileOpsInject = false;
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

    this._scheduleScrollToBottom();
    const streamRenderer = this._createStreamRenderer(streamingMsg);

    // FIX 3: Capture the session ID that owns THIS response before any async
    // work so the state is stored and cleared on the right session bucket.
    const _genOwnerSessionId = this.plugin._sessionManager.activeId;

    this._setGeneratingState(true, _genOwnerSessionId);
    this.plugin._sessionManager.beginTurn(_genOwnerSessionId);
    this._resetReasoning(_genOwnerSessionId);
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
        this._offerSkill(msgContainer, reply);

        // Persist storedText (clean text + invisible SYSTEM_MEMORY comment)
        // so the model retains file-path/op context across the pruning window.
        // Falls back to displayText on non-file-ops turns where storedText is
        // not set.
        const textToSave = reply.storedText ?? reply.displayText;
        this.plugin._sessionManager.addMessage('assistant', textToSave, [], { ...this._reasoningMeta(_genOwnerSessionId), ...(reply.sources && reply.sources.length ? { sources: reply.sources } : {}) });
        this.plugin._sessionManager.applyTurnTokens(this.plugin._sessionManager.getActive(), _genOwnerSessionId);
        // now that the reply is part of the conversation: what hangs below it
        this._renderPlanApproval(msgContainer);
        this._renderSources(msgContainer, reply.sources);
        this._fireResponseHook(reply);
        this.plugin.saveState();
        this.plugin.refreshChatViews(this);
      } else {
        streamingMsg.textContent = '⨉ No response received';
      }
    } catch (e) {
      console.error("Chat Error:", e);

      const errorMessage = friendlyErrorMessage(e, this.plugin);

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

      resendBtn.addEventListener('click', async () => {
        msgContainer.remove();
        // Re-check intent from the last user message so a retry after a
        // network error still injects the guidelines when needed.
        // In 'on-demand' mode we read the signal from the most recent
        // assistant reply — no extra network round-trip.
        const _retrySession = this.plugin._sessionManager.getActive();
        const _retryMsgs = _retrySession?.messages ?? [];
        const _lastUser = [..._retryMsgs].reverse().find(m => m.role === 'user');
        const _lastAsst = [..._retryMsgs].reverse().find(m => m.role === 'assistant');
        const _fileOpsEnabledRetry = this.plugin.settings.fileOpsScope && this.plugin.settings.fileOpsScope !== 'disabled';
        if (_fileOpsEnabledRetry && _lastUser) {
          const _lastContent = typeof _lastUser.content === 'string'
            ? _lastUser.content
            : (_lastUser.content?.[0]?.text ?? '');
          const _prevReply = typeof _lastAsst?.content === 'string' ? _lastAsst.content : null;
          this._pendingFileOpsInject = await this._checkFileOpIntent(_lastContent, _prevReply);
        }
        this._generateAssistantResponse();
      });
    } finally {
      // FIX 3: Release generating state on the session that OWNS this request.
      this._setGeneratingState(false, _genOwnerSessionId);
      this.plugin.compression.run(_genOwnerSessionId).catch(() => {});
      this.plugin._sessionManager.discardTurn(_genOwnerSessionId);
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
    if (role === 'user') {
      bubble.style.background = 'var(--interactive-accent)';
      bubble.style.color = 'var(--text-on-accent)';

      // ── Collapsible long-message support (Gemini-style) ──────────────────
      // Determine whether this message is long enough to warrant collapsing.
      // We use the configured threshold (default 5 lines). 0 = disabled.
      const collapseEnabled = this.plugin.settings.messageCollapseEnabled ?? ((this.plugin.settings.messageCollapseLines ?? 5) > 0);
      const collapseThreshold = Math.max(1, this.plugin.settings.messageCollapseLines || 5);
      // Estimate line count: split on newlines, then account for ~80-char
      // wrap width so a single long paragraph still triggers the threshold.
      const estimatedLines = text.split('\n').reduce((acc, line) => {
        return acc + Math.max(1, Math.ceil((line.length || 1) / 80));
      }, 0);
      const shouldCollapse = collapseEnabled && estimatedLines > collapseThreshold;

      if (shouldCollapse) {
        bubble.classList.add('is-collapsible', 'is-collapsed');

        // ── Text wrapper ─────────────────────────────────────────────────────
        // Collapsed display: line breaks are stripped so the text renders as
        // one continuous wrapped paragraph (single block). max-height clips it
        // to exactly 2 lines (font 14px × line-height 1.5 = 21px/line → 42px).
        // Expanded display: original text (with \n) is restored and the height
        // limit is removed, so the full message appears with its line breaks.
        const collapsedText = text.replace(/\s*\n\s*/g, ' ').trim();

        const textWrap = bubble.createEl('div', { cls: 'ai-msg-text-wrap' });
        textWrap.textContent = collapsedText;
        // Single-block in collapsed state: normal wrapping, no pre-wrap
        textWrap.style.whiteSpace = 'normal';
        textWrap.style.wordBreak  = 'break-word';

        // ── Gradient fade — anchored to trailing end of the last visible line.
        //    Lives inside textWrap so overflow:hidden clips it perfectly.
        //    Covers ~40% of the bubble width (≈ 3 short words).
        //    Direction flips for RTL so the fade appears at the left (trailing) end.
        const isRTL = rtlRatio(text) >= RTL_ALIGN_THRESHOLD;
        const fadeDir = isRTL ? 'to left' : 'to right';
        const fadeEl = textWrap.createEl('div', { cls: 'ai-msg-fade' });
        fadeEl.style.background =
          `linear-gradient(${fadeDir}, transparent 0%, var(--interactive-accent) 70%)`;
        // RTL: anchor fade to left edge instead of right
        if (isRTL) { fadeEl.style.right = 'auto'; fadeEl.style.left = '0'; }

        // ── Chevron button — absolutely positioned inside textWrap, at the
        //    trailing corner of the last visible line, on top of the fade.
        //    For LTR: bottom-right. For RTL: bottom-left.
        const chevronBtn = textWrap.createEl('div', { cls: 'ai-msg-chevron-btn' });
        if (isRTL) { chevronBtn.style.right = 'auto'; chevronBtn.style.left = '9px'; }
        chevronBtn.innerHTML = `<svg viewBox="0 0 24 24"><polyline points="6 9 12 15 18 9"/></svg>`;

        const toggleCollapse = (e) => {
          e.stopPropagation();
          if (bubble.classList.contains('is-collapsed')) {
            // Expand: restore original text with line breaks
            bubble.classList.replace('is-collapsed', 'is-expanded');
            textWrap.textContent = text;
            textWrap.style.whiteSpace = 'pre-wrap';
            textWrap.appendChild(fadeEl);
            textWrap.appendChild(chevronBtn);
          } else {
            // Collapse: single-block condensed text
            bubble.classList.replace('is-expanded', 'is-collapsed');
            textWrap.textContent = collapsedText;
            textWrap.style.whiteSpace = 'normal';
            textWrap.appendChild(fadeEl);
            textWrap.appendChild(chevronBtn);
          }
        };
        bubble.addEventListener('click', toggleCollapse);
        chevronBtn.addEventListener('click', toggleCollapse);

        this._applyTextDirection(bubble, text);
      } else {
        const textSpan = bubble.createEl('span', { cls: 'ai-msg-text' });
        textSpan.textContent = text;
        this._applyTextDirection(bubble, text);
      }

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
      // Apply direction AFTER MarkdownRenderer so the child <p>/<li>/etc.
      // elements injected by the renderer are already present and get
      // the !important inline styles applied to them individually.
      this._applyTextDirection(bubble, renderText);

      // Copy button — shown below each AI response; uses clean display text
      msgContainer.appendChild(this._createResponseCopyBtn(renderText));

      // With branching on, a reply has the same press-and-hold / right-click menu (Branch, Copy, Select Text)
      if (index >= 0 && this.plugin.settings.conversationBranching) {
        this._attachMessageActionHandlers(bubble, renderText, index, attachments, 'assistant');
      }
    }
    
    if (attachments && attachments.length > 0) {
      // Single scrollable row of filename pills — identical style to the
      // pre-send preview bar.  No image thumbnails; filenames only for both
      // images and documents so the layout is compact and consistent.
      const attachmentsContainer = msgContainer.createDiv({ cls: 'ai-attachments-container' });
      attachmentsContainer.style.display    = 'flex';
      attachmentsContainer.style.flexWrap   = 'nowrap';
      attachmentsContainer.style.overflowX  = 'auto';
      attachmentsContainer.style.overflowY  = 'hidden';
      attachmentsContainer.style.alignItems = 'center';
      attachmentsContainer.style.gap        = '4px';
      attachmentsContainer.style.marginTop  = '6px';
      attachmentsContainer.style.padding    = '4px 2px';
      attachmentsContainer.style.borderTop  = '1px solid var(--background-modifier-border)';
      attachmentsContainer.style.width      = '100%';
      attachmentsContainer.style.boxSizing  = 'border-box';

      // Static paperclip label
      const label = attachmentsContainer.createEl('span');
      label.textContent       = '📎';
      label.style.fontSize    = '12.4px';
      label.style.flexShrink  = '0';
      label.style.color       = 'var(--text-muted)';
      label.style.marginRight = '2px';

      attachments.forEach(attachment => {
        const pill = attachmentsContainer.createDiv({ cls: 'ai-attachment' });
        pill.style.display       = 'inline-flex';
        pill.style.alignItems    = 'center';
        pill.style.flexShrink    = '0';
        pill.style.padding       = '2px 8px';
        pill.style.borderRadius  = '4px';
        pill.style.border        = '1px solid var(--background-modifier-border)';
        pill.style.background    = 'var(--background-primary)';
        pill.style.fontSize      = '12.4px';
        pill.style.color         = 'var(--text-normal)';
        pill.style.maxWidth      = '180px';
        pill.style.whiteSpace    = 'nowrap';
        pill.style.overflow      = 'hidden';
        pill.style.textOverflow  = 'ellipsis';
        pill.title               = attachment.name || 'file';
        pill.textContent         = attachment.name || 'file';
      });
    }
    
    // "‹ 2/3 ›" where this message is a fork point (shown whenever branches exist, whatever the setting)
    if (index >= 0) {
      this._renderBranchControls(msgContainer, index); this._renderSummaryMarker(msgContainer, index); this._renderPlanApproval(msgContainer, index);
      if (role === 'assistant') {
        const session = this.plugin._sessionManager.getActive();
        const stored = session && session.messages[index];
        if (stored && stored.sources) this._renderSources(msgContainer, stored.sources);
      }
    }

    this._scheduleScrollToBottom();
    return msgContainer;  // Return the outer container so callers can remove it on resend
  }

  // ── Context compression UI (FR-2.4) ──────────────────────────────────────

  /** Below the last summarized message: say so, and let the user read or undo the summary. */
  _renderSummaryMarker(container, index) {
    const sm = this.plugin._sessionManager;
    const session = sm.getActive();
    if (!session || sm.summaryCutoff(session) !== index) return;

    const row = container.createDiv({ cls: 'ai-summary-marker' });
    row.style.display = 'flex';
    row.style.alignItems = 'center';
    row.style.flexWrap = 'wrap';
    row.style.gap = '4px 8px';
    row.style.marginTop = '6px';
    row.style.paddingTop = '4px';
    row.style.borderTop = '1px dashed var(--background-modifier-border)';
    row.style.color = 'var(--text-muted)';
    row.style.fontSize = '12px';
    row.createSpan({ text: 'Messages above are summarized for the AI.' });
    const link = (text, onClick) => {
      const b = row.createEl('button', { text, attr: { type: 'button' } });
      b.style.minHeight = '36px'; b.style.padding = '0 8px'; b.style.border = 'none'; b.style.background = 'transparent';
      b.style.color = 'var(--text-accent)'; b.style.cursor = 'pointer'; b.style.fontSize = '12px'; b.style.boxShadow = 'none';
      b.addEventListener('click', (e) => { e.stopPropagation(); onClick(); });
    };
    link('Review', () => this._reviewSummary(index));
    link('Undo', () => this._undoSummary(index));
  }

  _reviewSummary(index) {
    const session = this.plugin._sessionManager.getActive();
    const msg = session && session.messages[index];
    if (!msg || !msg.summary) return;
    const after = session.messages.length - 1 - index;
    const modal = new ConfirmModal(this.app, {
      title: 'Conversation summary',
      message:
        `${msg.summary.text}\n\n—\nThe first ${index + 1} messages are replaced by this summary when the AI is sent the conversation. ` +
        `The ${after} messages after it, your instructions, memory and skills are sent as they are. Nothing was deleted from this chat.`,
      confirmLabel: 'Undo summary'
    }, () => this._undoSummary(index));
    modal.open();
    const p = modal.contentEl.querySelector('p');
    if (p) { p.style.whiteSpace = 'pre-wrap'; p.style.wordBreak = 'break-word'; p.style.maxHeight = '50vh'; p.style.overflowY = 'auto'; }
  }

  /** Removes the summary: the full history goes back into requests. It is not redone for the next few messages. */
  _undoSummary(index) {
    const sm = this.plugin._sessionManager;
    const session = sm.getActive();
    if (!sm.clearSummary(index)) return;
    session.compressionPausedUntil = session.messages.length + 10;
    this.plugin.saveState();
    this._renderMessages();
    this.plugin.refreshChatViews(this);
  }

  // ── Plan mode UI (FR-3.1) ─────────────────────────────────────────────────

  /** afterResponseGenerated hooks run in the background; they never delay or block the chat. */
  _fireResponseHook(reply) {
    const hooks = this.plugin.hooks;
    if (!hooks.has('afterResponseGenerated')) return;
    const session = this.plugin._sessionManager.getActive();
    const lastUser = session && [...session.messages].reverse().find(m => m.role === 'user');
    hooks.fire('afterResponseGenerated', { user: lastUser && lastUser.content, response: reply.displayText },
      { readOnly: this.plugin.isPlanning(session) }).catch(() => {});
  }

  /** Web search is on but cannot be used for this model: tell the model, so the answer says so in a sentence. */
  _addWebSearchNoteLayer(messages) {
    const apiType = this.plugin.apiManager.activeApiType();
    const note = this.plugin.webSearch.unavailableNote(apiType, this.plugin.getConfiguredModel(apiType));
    if (note) this.plugin.promptAssembler.addTaskLayer(messages, note);
  }

  /** "Sources" links under an answer that used the web (the provider's search or the search tools). */
  _renderSources(container, sources) {
    const list = (sources || []).map(x => ({ url: safeHttpUrl(x && x.url), title: String((x && x.title) || '').trim() })).filter(x => x.url);
    if (!list.length) return;
    const row = container.createDiv({ cls: 'ai-sources' });
    row.style.display = 'flex';
    row.style.flexWrap = 'wrap';
    row.style.alignItems = 'center';
    row.style.gap = '2px 12px';
    row.style.marginTop = '6px';
    row.style.fontSize = '12px';
    row.style.color = 'var(--text-muted)';
    row.createSpan({ text: 'Sources:' });
    list.slice(0, WEB_SOURCES_MAX).forEach(src => {
      let host = ''; try { host = new URL(src.url).hostname.replace(/^www\./, ''); } catch (_) { /* keep empty */ }
      const label = collapseToLine(src.title || host || src.url, 48);
      const a = row.createEl('a', { text: label, href: src.url, cls: 'external-link' });
      a.setAttribute('target', '_blank');
      a.setAttribute('rel', 'noopener');
      a.setAttribute('title', src.url);
      a.style.minHeight = '28px';
      a.style.display = 'inline-flex';
      a.style.alignItems = 'center';
    });
  }

  /** While a plan awaits approval, every request carries the plan rules (a task layer; not stored). */
  _addPlanLayer(messages) {
    if (this.plugin.isPlanning(this.plugin._sessionManager.getActive())) {
      this.plugin.promptAssembler.addTaskLayer(messages, PLAN_MODE_RULES);
    }
  }

  /** Under the newest reply of a conversation in plan mode: approve it, or leave plan mode. Drawn from the saved state, so it survives a redraw or restart. */
  _renderPlanApproval(container, index) {
    const session = this.plugin._sessionManager.getActive();
    if (!this.plugin.isPlanning(session)) return;
    const last = session.messages.length - 1;
    const i = index === undefined ? last : index;
    if (i !== last || !session.messages[i] || session.messages[i].role !== 'assistant') return;

    const row = container.createDiv({ cls: 'ai-plan-approval' });
    row.style.display = 'flex';
    row.style.alignItems = 'center';
    row.style.flexWrap = 'wrap';
    row.style.gap = '4px 8px';
    row.style.marginTop = '6px';
    row.style.color = 'var(--text-muted)';
    row.style.fontSize = '12px';
    row.createSpan({ text: 'Plan mode: nothing has been changed. Approve the plan to let the AI carry it out, or tell it what to change.' });
    const button = (text, cls, onClick) => {
      const b = row.createEl('button', { text, cls, attr: { type: 'button' } });
      b.style.minHeight = '36px'; b.style.padding = '0 12px'; b.style.cursor = 'pointer';
      b.addEventListener('click', (e) => { e.stopPropagation(); onClick(); });
    };
    button('Approve plan', 'mod-cta', () => this._approvePlan(row));
    button('Cancel plan mode', '', () => this._cancelPlan(row));
  }

  async _approvePlan(row) {
    if (this._branchingBusy()) return;
    const session = this.plugin._sessionManager.getActive();
    if (!session) return;
    delete session.planState;
    this.plugin.saveState();
    if (row) row.remove();
    await this._onSend(PLAN_APPROVED_MESSAGE);
  }

  _cancelPlan(row) {
    const session = this.plugin._sessionManager.getActive();
    if (session) delete session.planState;
    this.plugin.saveState();
    if (row) row.remove();
  }

  // ── Skill suggestion UI (FR-2.3) ──────────────────────────────────────────

  /** After a multi-step reply: offer, never force, to turn the procedure into a skill. Nothing happens unless the user says yes. */
  _offerSkill(msgContainer, reply) {
    const drafter = this.plugin.skillDrafter;
    if (!drafter.eligible(reply)) return;
    const session = this.plugin._sessionManager.getActive();
    const lastUser = session && [...session.messages].reverse().find(m => m.role === 'user');
    if (!lastUser || lastUser.invokedSkill) return;                  // a skill that was run is already a skill

    const row = msgContainer.createDiv({ cls: 'ai-skill-offer' });
    row.style.display = 'flex';
    row.style.alignItems = 'center';
    row.style.flexWrap = 'wrap';
    row.style.gap = '4px 8px';
    row.style.marginTop = '6px';
    row.style.color = 'var(--text-muted)';
    row.style.fontSize = '12px';
    row.createSpan({ text: 'That took several steps. Save the procedure as a skill?' });
    const button = (text, onClick) => {
      const b = row.createEl('button', { text, attr: { type: 'button' } });
      b.style.minHeight = '36px'; b.style.padding = '0 10px'; b.style.cursor = 'pointer'; b.style.fontSize = '12px';
      b.addEventListener('click', (e) => { e.stopPropagation(); onClick(b); });
      return b;
    };
    button('Draft skill', async (btn) => {
      btn.disabled = true;
      const label = btn.textContent;
      btn.textContent = 'Drafting…';
      try {
        const draft = await drafter.draft({ task: lastUser.content, answer: reply.displayText, trace: reply.trace });
        new SkillDraftModal(this.app, draft, async (edited) => { await drafter.save(edited); row.remove(); new Notice(`Saved as skill "${skillNameFrom(edited.name)}".`); }).open();
      } catch (e) {
        new Notice(`Couldn't draft a skill. ${String(friendlyErrorMessage(e, this.plugin)).split('\n')[0]}`);
      } finally {
        btn.disabled = false;
        btn.textContent = label;
      }
    });
    button('Not now', () => row.remove());
  }

  // ── Conversation branching UI (FR-3.3) ───────────────────────────────────

  _renderBranchControls(container, index) {
    const info = this.plugin._sessionManager.forkInfo(index);
    for (const fork of [info.sibling, info.continuation]) {
      if (fork) this._appendBranchControl(container, fork, index);
    }
  }

  /** The small "‹ 2/3 ›" control. The arrows have a phone-sized touch area and are inert at either end. */
  _appendBranchControl(container, fork, anchorIndex) {
    const row = container.createDiv({ cls: 'ai-branch-nav' });
    row.setAttribute('dir', 'ltr');                       // reads "‹ 2/3 ›" in RTL chats too
    row.style.display = 'flex';
    row.style.alignItems = 'center';
    row.style.gap = '2px';
    row.style.marginTop = '2px';
    row.style.color = 'var(--text-muted)';
    row.style.fontSize = '12px';
    row.style.userSelect = 'none';

    const arrow = (glyph, label, targetId) => {
      const btn = row.createEl('button', { text: glyph, attr: { 'aria-label': label, type: 'button' } });
      btn.style.minWidth = '40px';
      btn.style.minHeight = '36px';
      btn.style.padding = '0';
      btn.style.fontSize = '18px';
      btn.style.lineHeight = '1';
      btn.style.border = 'none';
      btn.style.background = 'transparent';
      btn.style.color = 'inherit';
      btn.style.boxShadow = 'none';
      if (targetId) {
        btn.style.cursor = 'pointer';
        btn.addEventListener('click', (e) => { e.stopPropagation(); this._switchBranch(targetId, anchorIndex); });
      } else {
        btn.disabled = true;
        btn.style.opacity = '0.3';
      }
    };
    arrow('‹', 'Previous branch', fork.prevId);
    const count = row.createEl('span', { text: `${fork.pos}/${fork.total}` });
    count.style.fontVariantNumeric = 'tabular-nums';
    count.style.minWidth = '28px';
    count.style.textAlign = 'center';
    arrow('›', 'Next branch', fork.nextId);
  }

  /** Branches must not change while a reply is being written: it would land in the wrong branch. */
  _branchingBusy() {
    if (this._activeGenState().isGenerating) { new Notice('Wait for the reply to finish.'); return true; }
    return false;
  }

  _afterBranchChange(anchorIndex) {
    this.plugin.saveState();
    this._renderMessages();
    this.plugin.refreshChatViews(this);
    // keep the message that has the arrows where the user was looking
    const anchor = this.chatEl.children[anchorIndex];
    if (anchor && anchor.scrollIntoView) requestAnimationFrame(() => anchor.scrollIntoView({ block: 'center' }));
  }

  _switchBranch(nodeId, anchorIndex) {
    if (this._branchingBusy()) return;
    if (this.plugin._sessionManager.switchToBranch(nodeId)) this._afterBranchChange(anchorIndex);
  }

  /** "Branch": continue from this message in a new branch; what came after it stays where it is. */
  _branchFromMessage(index) {
    if (this._branchingBusy()) return;
    if (!this.plugin._sessionManager.createBranchFrom(index)) return;
    this._afterBranchChange(index);
    if (this.inputEl) this.inputEl.focus();
  }

  /** How an edited message is stored: a branch beside the old one, or replacing it (the original behaviour). */
  _editMode() {
    const st = this.plugin.settings;
    return (st.conversationBranching && st.editingMessage !== 'overwrite') ? 'branch' : 'overwrite';
  }

  async _onAttach() {
    // Determine if image analysis is enabled for the currently active provider
    const providerKey = this._activeProviderKey();
    const caps = this.plugin.getImageCaps(providerKey);
    const imageAnalysisEnabled = !!caps.analysis;

    const activeFile = this.app.workspace.getActiveFile?.();
    const activeFilePath = activeFile ? activeFile.path : null;

    const modal = new AttachModal(this.app, async (choice, payload, contentScope = 'full') => {
      if (!payload || !payload.length) {
        new Notice('Nothing selected');
        return;
      }

      // ── Image mode ──────────────────────────────────────────────────────
      if (choice === 'images') {
        // payload = [{ name, dataUrl, mimeType }, …]
        // MERGE into existing attachments — don't overwrite files already queued
        const newImages = payload.map(img => ({
          name:     img.name,
          dataUrl:  img.dataUrl,
          mimeType: img.mimeType,
          isImage:  true
        }));
        this.pendingAttachments = [...(this.pendingAttachments || []), ...newImages];
        const count = newImages.length;
        new Notice(`✓ ${count} image${count !== 1 ? 's' : ''} added`);
        this._refreshEditModeBtn?.();
        // FIX 1: Save draft after attachment change so images aren't lost on
        // session switch or layout refresh.
        this._saveDraftDebounced();
        return;
      }

      // ── File / Folder mode ───────────────────────────────────────────────
      // MERGE: keep any images already queued, append new file entries
      const existingImages = (this.pendingAttachments || []).filter(a => a.isImage);
      const newFiles = [];
      const newEditFiles = [...payload];
      // Also merge _pendingEditFiles, avoiding exact-path duplicates
      const existingEditPaths = new Set((this._pendingEditFiles || []).map(f => f.path));
      const mergedEditFiles = [
        ...(this._pendingEditFiles || []),
        ...payload.filter(f => !existingEditPaths.has(f.path))
      ];
      this._pendingEditFiles = mergedEditFiles;

      // Only read files that aren't already queued (avoid duplicate content)
      const alreadyQueuedPaths = new Set(
        (this.pendingAttachments || []).filter(a => !a.isImage).map(a => a.path)
      );
      for (const f of payload) {
        if (alreadyQueuedPaths.has(f.path)) continue;
        try {
          // ── Build content according to the chosen scope ─────────────────
          // The file name is always present (stored in `name`/`path`).
          // 'full'     → body + frontmatter metadata
          // 'body'     → body only (strip YAML frontmatter block)
          // 'metadata' → frontmatter metadata only (no body)
          let content = null;       // body text to send (null = omit body)
          let metadata = null;      // structured metadata to send (null = omit)

          if (contentScope !== 'metadata') {
            // Read body (needed for 'full' and 'body')
            const raw = await this.app.vault.read(f);
            if (contentScope === 'body') {
              // Strip YAML frontmatter (--- ... ---) from the top
              content = raw.replace(/^---[\s\S]*?---\n?/, '').trimStart();
            } else {
              // 'full' — keep everything as-is
              content = raw;
            }
          }

          if (contentScope !== 'body') {
            // Read frontmatter metadata via Obsidian's metadata cache
            // (available for 'full' and 'metadata' scopes)
            const cache = this.app.metadataCache?.getFileCache?.(f);
            const fm = cache?.frontmatter;
            if (fm) {
              // Exclude the internal `position` key Obsidian injects
              const { position: _pos, ...cleanFm } = fm;
              if (Object.keys(cleanFm).length > 0) {
                metadata = cleanFm;
              }
            }
          }

          newFiles.push({
            name:     f.basename,
            path:     f.path,
            content,          // null when scope === 'metadata'
            metadata,         // null when scope === 'body'
            scope:    contentScope,
            isImage:  false
          });
        } catch (e) {
          console.error(e);
          new Notice(`Error reading file: ${f.path}`);
        }
      }

      // Merge: images first, then previously-queued files, then newly-added files
      this.pendingAttachments = [...existingImages,
        ...(this.pendingAttachments || []).filter(a => !a.isImage),
        ...newFiles
      ];

      const attachmentCount = newFiles.length;
      if (attachmentCount > 0) {
        new Notice(`✓ ${attachmentCount} file${attachmentCount > 1 ? 's' : ''} added`);
      }

      // Show/refresh the Edit Mode button now that files are loaded
      this._refreshEditModeBtn?.();
      // FIX 1: Save draft after attachment change so files aren't lost on
      // session switch or layout refresh.
      this._saveDraftDebounced();
    }, imageAnalysisEnabled, activeFilePath);
    modal.open();
  }

  /** Returns the settings key for the currently active provider. */
  _activeProviderKey() {
    const mode = this.plugin.settings.currentMode; // 'local' | 'cloud'
    if (mode === 'local') return 'local';
    const cloudType = this.plugin.settings.cloudApiType; // 'openai'|'gemini'|'anthropic'|'custom'
    return cloudType || 'openai';
  }


  /**
   * Extracts the `NEED_FILE_OPS` / `NO_FILE_OPS` classifier signal that the
   * model embeds inside an HTML comment at the end of its reply when the
   * embedded classifier instruction has been active for this session.
   *
   * The model is instructed to write exactly one of:
   *   <!-- NEED_FILE_OPS -->
   *   <!-- NO_FILE_OPS -->
   * anywhere in its response (typically at the very end).
   *
   * Returns:
   *   true   – NEED_FILE_OPS found
   *   false  – NO_FILE_OPS found
   *   null   – no signal present (classifier instruction was not in effect,
   *             or the model omitted the tag)
   *
   * @param {string} text – raw assistant reply text
   * @returns {boolean|null}
   */
  _extractFileOpSignalFromReply(text) {
    if (!text) return null;
    // Case-insensitive scan; the model may produce minor whitespace/case variation
    const upper = text.toUpperCase();
    // Check for the negative signal first to avoid a false positive when both
    // substrings are somehow present (shouldn't happen, but defensive).
    if (upper.includes('<!-- NO_FILE_OPS -->') || upper.includes('<!--NO_FILE_OPS-->')) return false;
    if (upper.includes('<!-- NEED_FILE_OPS -->') || upper.includes('<!--NEED_FILE_OPS-->')) return true;
    return null;
  }

  /** Appends text to the last user message of an API payload (string or multi-part content). */
  _appendToLastUserMessage(messages, text) {
    const idx = messages.map(m => m.role).lastIndexOf('user');
    if (idx === -1) return;
    const entry = messages[idx];
    if (typeof entry.content === 'string') {
      messages[idx] = { ...entry, content: entry.content + text };
    } else if (Array.isArray(entry.content)) {
      const t = entry.content.findIndex(p => p.type === 'text');
      if (t !== -1) {
        const parts = [...entry.content];
        parts[t] = { ...parts[t], text: parts[t].text + text };
        messages[idx] = { ...entry, content: parts };
      }
    }
  }

  /**
   * Strips the embedded classifier comment tag from an assistant reply so it
   * is never visible to the user or stored in the session history in its raw
   * form (ContextMemory comments are a separate mechanism and are kept).
   *
   * @param {string} text – raw assistant reply text
   * @returns {string}    – text with the classifier tag removed
   */
  _stripFileOpSignalTag(text) {
    if (!text) return text;
    return text
      .replace(/<!--\s*NEED_FILE_OPS\s*-->/gi, '')
      .replace(/<!--\s*NO_FILE_OPS\s*-->/gi, '')
      .trim();
  }

  /**
   * Returns the classifier instruction appended to the very first user
   * message in a session when `on-demand` mode is active.  The model will
   * include <!-- NEED_FILE_OPS --> or <!-- NO_FILE_OPS --> in every
   * subsequent reply so we can decide whether to inject the full file-ops
   * guidelines without a separate round-trip.
   */
  get _fileOpsClassifierInstruction() {
    return (
      '\n\n[System note — answer with NEED_FILE_OPS if the user wants to ' +
      'create, edit, rename, move, copy, patch, or delete a file or folder. ' +
      'Otherwise answer with NO_FILE_OPS. ' +
      'Reply with one of those two phrases only at the end of each response, ' +
      'hidden inside an HTML comment tag <!-- ... -->.]'
    );
  }

  /**
   * Intent detection: determines whether the current turn needs the full
   * file-operation guidelines injected into the context window.
   *
   * Behaviour depends on `settings.fileOpsGuidelinesMode`:
   *
   *  'always'    — returns true immediately (no analysis needed).
   *
   *  'on-demand' — reads the classifier signal that the model embeds as an
   *                HTML comment in its previous reply.  The signal is planted
   *                by appending `_fileOpsClassifierInstruction` to the very
   *                first user message of each session (done in `_onSend`).
   *                Because the instruction persists in the conversation
   *                history, the model echoes a signal in every reply for the
   *                rest of the session — zero extra network round-trips.
   *
   *                Fallback chain when the embedded signal is absent (e.g.
   *                on the very first turn, on retry before any reply exists,
   *                or when a small model omits the tag):
   *                  1. Embedded HTML-comment signal — primary path (no cost)
   *                  2. English keyword heuristic    — fast local check
   *                  3. true (safe default)          — a false positive
   *                     (extra tokens) beats a false negative (file op broken)
   *
   * @param {string}       txt          – the user's raw outgoing message
   * @param {string|null}  [prevReply]  – most recent assistant reply (used to
   *                                      read the embedded classifier signal)
   * @returns {Promise<boolean>}
   */
  async _checkFileOpIntent(txt, prevReply = null) {
    if (!txt) return false;

    const mode = this.plugin.settings.fileOpsGuidelinesMode || 'on-demand';

    // ── 'always' mode: inject unconditionally, no analysis needed ────────
    if (mode === 'always') return true;

    // ── 'on-demand' mode: read signal embedded in previous reply ─────────
    // The signal is planted by appending _fileOpsClassifierInstruction to the
    // first user message of the session (see _onSend).  From that point on
    // every assistant reply carries <!-- NEED_FILE_OPS --> or
    // <!-- NO_FILE_OPS --> so we never need a separate API call.
    //
    // NOTE: this method is only called for turn 2+ (when prevReply exists) or
    // from the edit/retry paths.  The first-message path in _onSend handles
    // its own keyword-only check and never calls this method.
    if (prevReply !== null) {
      const signal = this._extractFileOpSignalFromReply(prevReply);
      if (signal !== null) return signal;
      // Signal absent: model omitted the tag — fall through to keyword check.
      console.warn('[FileOps] Classifier tag missing from previous reply; trying keyword fallback.');
    }

    // ── Keyword heuristic fallback ────────────────────────────────────────
    // Fires when:
    //   • The model omitted the tag on a later turn (rare, small/local models)
    //   • edit/retry paths where no prior reply is available
    // English-only; returns false (not inject) when no keywords match —
    // by turn 2+ the classifier instruction is active so a missing tag most
    // likely means NO file ops were needed, making false-negative unlikely.
    const t = txt.toLowerCase();
    const actionRe = /\b(edit|modify|update|change|patch|fix|rewrite|create|write|delete|remove|rename|move|copy|append|insert|replace|refactor|overwrite|add)\b/;
    const targetRe = /\b(file|note|document|doc|folder|vault|\.md)\b/;
    if (actionRe.test(t) && targetRe.test(t)) return true;

    // No signal, no keywords → do not inject.
    // The classifier instruction is already in the conversation history so
    // the next reply will carry the correct tag; we prefer a potential
    // missed injection over spuriously sending the full file handling principles + guidelines.
    return false;
  }

  /** @param {string} [overrideText] send this text instead of the input box (used when a plan is approved); the draft stays untouched */
  async _onSend(overrideText) {
    const fromInput = typeof overrideText !== 'string';
    if (fromInput && this._editingMessageIndex !== null) {
      return this._onSendEditedMessage();
    }

    let txt = (fromInput ? this.inputEl.value : overrideText).trim();
    if (!txt && fromInput && this.pendingAttachments.length === 0) { 
      new Notice('Message is empty'); 
      return; 
    }

    // A message that starts with "/name" is a command or skill: send what it expands to.
    let invokedSkill = null;
    let planRequested = false;
    let mentionSource = txt;
    const slash = fromInput ? await this.plugin.resolveSlash(txt, () => this._getNoteContext()) : null;
    if (slash === false) return;
    if (slash) { txt = slash.text; invokedSkill = slash.skill || null; planRequested = !!slash.plan; mentionSource = slash.mentionText || ''; }

    // @notes, @folders and #tags the user typed travel with the message as attached context.
    const mentioned = fromInput ? await this.plugin.resolveMentions(mentionSource, this.pendingAttachments) : [];
    const attachmentsToSend = fromInput ? [...this.pendingAttachments, ...mentioned] : [];
    
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
    
    // FIX 3: Capture the session ID that OWNS this request BEFORE any async
    // work. If the user switches sessions mid-generation the generating state
    // must still be stored on—and cleared from—the session that started it.
    const ownerSessionId = s.id;

    // "/plan": from now on this conversation plans first and changes nothing until the user approves
    if (planRequested) s.planState = 'planning';

    // Add user message with attachments
    this.plugin._sessionManager.addMessage('user', txt, attachmentsToSend, invokedSkill ? { invokedSkill } : {});

    // Start collecting the real token usage of this turn (stored per message
    // once the reply is complete — see SessionManager.applyTurnTokens).
    this.plugin._sessionManager.beginTurn(ownerSessionId);
    this._resetReasoning(ownerSessionId);

    // FIX 1: Clear the stored draft now that the message has been committed,
    // so the next compose starts with a clean slate for this session.
    if (fromInput) this.plugin._sessionManager.clearDraft();
    if (this._saveDraftTimer) { clearTimeout(this._saveDraftTimer); this._saveDraftTimer = null; }

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
    const userBubble = this._appendBubble('user', txt, attachmentsToSend, s.messages.length - 1);

    // Clear input and attachments (text, pills, draft, token estimate)
    const currentAttachments = fromInput ? [...this.pendingAttachments] : [];
    if (fromInput) this._resetComposer();

        // Auto-name the conversation if needed (Runs concurrently in the background)
    if (needsNaming) {
      this.isNamingInProgress = true;
      this.showNamingIndicator();

      this._pendingNamingFulfilled = false;
      this._primaryNamingPromise = this.plugin.generateConversationName(txt).then((generatedName) => {
        if (generatedName) {
          s.name = generatedName;
          this.plugin.saveState();
          new Notice(`✓ Conversation named: "${generatedName}"`);
          this._pendingNamingFulfilled = true; // primary naming succeeded
        }
        // If null, the title comes from the chat model's own reply (see below)
      }).catch((error) => {
        // AbortErrors are silent — view teardown, not a real failure
        if (error.name !== 'AbortError' && !(error instanceof UserAbortError)) {
          console.log("Auto-naming failed:", error);
        }
        // Fallback will run after the reply arrives
      }).finally(() => {
        this.isNamingInProgress = false;
        this.hideNamingIndicator();
      });
    }

    await this.plugin.refreshPromptLayers();
    const messages = this.plugin._sessionManager.getMessagesForRequest();
    await this._addInvokedSkillLayer(messages);
    await this._addHistoryDigestLayer(messages);
    this._addPlanLayer(messages);
    this._addWebSearchNoteLayer(messages);

    // Pass session-unlocked paths so the AI is told it may modify them.
    const _unlockedForOnSend = s
      ? (this._sessionEditUnlockedFiles.get(s.id) ?? new Set())
      : new Set();

    // ── File-ops guidelines injection ──────────────────────────────────────
    //
    // 'always' mode  — inject unconditionally on every turn.
    //
    // 'on-demand' mode (zero extra requests):
    //   • First user message of the session: append the embedded classifier
    //     instruction to the last user message in the API payload so the model
    //     starts tagging every reply with <!-- NEED_FILE_OPS --> or
    //     <!-- NO_FILE_OPS -->.  The instruction is sent only once; because it
    //     lives in the conversation history the model follows it for the rest
    //     of the session.  Also run the keyword heuristic on `txt` as a
    //     safety net in case this very first message is a file-ops request.
    //   • Subsequent messages: read the embedded signal from the most recent
    //     assistant reply — no extra network round-trip needed.
    //
    // The assistant bubble is created first so the user sees the UI respond
    // instantly.  In 'always' mode the intent check is synchronous so there
    // is never a visible gap.

    // Create the assistant bubble up-front
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
    const streamRenderer = this._createStreamRenderer(streamingMsg);

    // Lock the send button before any async work so the UI responds instantly.
    // FIX 3: Pass ownerSessionId so the state is always stored on the correct
    // session bucket, even if the user switches sessions during the async work.
    this._setGeneratingState(true, ownerSessionId);
    this._scheduleScrollToBottom();

    // ── Intent detection & guidelines injection ───────────────────────────
    const _fileOpsEnabledOnSend = this.plugin.settings.fileOpsScope && this.plugin.settings.fileOpsScope !== 'disabled';
    if (_fileOpsEnabledOnSend) {
      const _mode = this.plugin.settings.fileOpsGuidelinesMode || 'on-demand';

      // ── on-demand: embed classifier instruction once, then read signal ──
      if (_mode === 'on-demand') {
        // Collect the session messages that existed BEFORE this turn was added.
        // addMessage('user', ...) was already called above, so the session now
        // has the new user message in it.  We need to distinguish:
        //   • First turn  (only 1 user message in session, no assistant reply yet)
        //   • Later turns (at least one assistant reply exists to read the tag from)
        const _msgs = s ? s.messages : [];
        const _lastAssistant = [..._msgs].reverse().find(m => m.role === 'assistant');
        const _prevReplyRaw = typeof _lastAssistant?.content === 'string'
          ? _lastAssistant.content
          : null;

        // Count how many user messages exist INCLUDING the one just added.
        const _isFirstUserMsg = _msgs.filter(m => m.role === 'user').length === 1;

        if (_isFirstUserMsg) {
          // ── First message of the session ─────────────────────────────────
          // There is no prior assistant reply to read a classifier tag from,
          // so we CANNOT decide intent yet.  Instead:
          //   1. Append the classifier instruction to the outgoing user message
          //      (not stored, so the chat history stays clean) so the model
          //      starts tagging every reply from this point on.
          //   2. Do NOT inject the file-ops guidelines this turn — we will
          //      read the signal from the AI's reply on the next turn.
          //
          // Edge case: if the keyword heuristic strongly suggests a file-op
          // request (English action + file target words), inject this turn as
          // a safety net so the user isn't left with a broken first request.
          const _lastUserIdx = messages.map(m => m.role).lastIndexOf('user');
          if (_lastUserIdx !== -1) {
            const _entry = messages[_lastUserIdx];
            if (typeof _entry.content === 'string') {
              messages[_lastUserIdx] = {
                ..._entry,
                content: _entry.content + this._fileOpsClassifierInstruction
              };
            } else if (Array.isArray(_entry.content)) {
              const _textIdx = _entry.content.findIndex(p => p.type === 'text');
              if (_textIdx !== -1) {
                const _newParts = [..._entry.content];
                _newParts[_textIdx] = {
                  ..._newParts[_textIdx],
                  text: _newParts[_textIdx].text + this._fileOpsClassifierInstruction
                };
                messages[_lastUserIdx] = { ..._entry, content: _newParts };
              }
            }
          }

          // Keyword-only check (no safe-default fallback) for the first turn:
          // inject only when the message clearly mentions file operations.
          const _t = txt.toLowerCase();
          const _actionRe = /\b(edit|modify|update|change|patch|fix|rewrite|create|write|delete|remove|rename|move|copy|append|insert|replace|refactor|overwrite|add)\b/;
          const _targetRe = /\b(file|note|document|doc|folder|vault|\.md)\b/;
          if (_actionRe.test(_t) && _targetRe.test(_t)) {
            const fileOpsMsg = await this.plugin.getFileOpsSystemMessage(_unlockedForOnSend);
            if (fileOpsMsg) {
              this.plugin.promptAssembler.addTaskLayer(messages, fileOpsMsg);
            }
          }
          // No injection and no fallback otherwise — wait for the signal.

        } else {
          // ── Second message onward ─────────────────────────────────────────
          // A previous assistant reply exists; read the embedded classifier tag
          // from it.  The keyword heuristic fires only if the model omitted the
          // tag (small/local models occasionally do); the safe-default also
          // applies here because by this point the classifier instruction is
          // firmly in the model's context and the safe default is a last resort,
          // not the normal path.
          const _needsGuidelines = await this._checkFileOpIntent(txt, _prevReplyRaw);
          if (_needsGuidelines) {
            const fileOpsMsg = await this.plugin.getFileOpsSystemMessage(_unlockedForOnSend);
            if (fileOpsMsg) {
              this.plugin.promptAssembler.addTaskLayer(messages, fileOpsMsg);
            }
          }
        }
      } else {
        // ── 'always' mode: inject unconditionally ────────────────────────
        const _needsGuidelines = await this._checkFileOpIntent(txt, null);
        if (_needsGuidelines) {
          const fileOpsMsg = await this.plugin.getFileOpsSystemMessage(_unlockedForOnSend);
          if (fileOpsMsg) {
            this.plugin.promptAssembler.addTaskLayer(messages, fileOpsMsg);
          }
        }
      }
    }

    // _pendingFileOpsInject was used by _generateAssistantResponse (the
    // edit/retry path); _onSend handles injection inline above and does not
    // rely on the flag, but we still clear it to avoid a stale true value
    // leaking into a subsequent _generateAssistantResponse call.
    this._pendingFileOpsInject = false;

    // ── Naming fallback, step 1 ────────────────────────────────────────────
    // The dedicated naming request has already been started (it has its own
    // timeout). Wait for its outcome: only if it FAILED is the hidden-title
    // instruction added to this message, so the chat model names the conversation.
    let _stoppedWhileNaming = false;
    if (needsNaming && this._primaryNamingPromise) {
      await this._primaryNamingPromise.catch(() => {});
      if (this._getSessionGenState(ownerSessionId).stopRequested) {
        _stoppedWhileNaming = true;
      } else if (!this._pendingNamingFulfilled) {
        this._appendToLastUserMessage(messages, this.plugin.buildNamingInReplyInstruction(txt));
      }
    }

    try {
      const reply = _stoppedWhileNaming
        ? { displayText: '', notices: [], stoppedEarly: true }
        : await this._getAssistantReply(messages, streamingMsg, streamRenderer);
      const convNameFromReply = this._replyConvName;
      this._replyConvName = '';

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
        this._offerSkill(msgContainer, reply);

        // Persist storedText (clean text + invisible SYSTEM_MEMORY comment)
        // so the model retains file-path/op context across the pruning window.
        // Falls back to displayText on non-file-ops turns where storedText is
        // not set.
        const textToSave = reply.storedText ?? reply.displayText;
        // Attachments belong to the user message only — pass [] here so the
        // assistant bubble never renders a second copy of the attachment row.
        this.plugin._sessionManager.addMessage('assistant', textToSave, [], { ...this._reasoningMeta(ownerSessionId), ...(reply.sources && reply.sources.length ? { sources: reply.sources } : {}) });
        this.plugin._sessionManager.applyTurnTokens(this.plugin._sessionManager.getActive(), ownerSessionId);
        // now that the reply is part of the conversation: what hangs below it
        this._renderPlanApproval(msgContainer);
        this._renderSources(msgContainer, reply.sources);
        this._fireResponseHook(reply);
        this.plugin.saveState();
        // Sync the finished reply to any other open chat view.
        this.plugin.refreshChatViews(this);

        // ── Naming fallback, step 2 ────────────────────────────────────────
        // Reached only when the dedicated naming request did not produce a name:
        //   1) use the title the chat model hid in its reply (<!-- @@conv name: … @@ -->)
        //   2) otherwise take the first ~3 words of the reply's first line.
        if (needsNaming && reply.displayText) {
          (async () => {
            try {
              if (this._primaryNamingPromise) await this._primaryNamingPromise.catch(() => {});
              if (this._pendingNamingFulfilled) return;               // dedicated request worked
              const title = convNameFromReply || titleFromFirstWords(reply.displayText);
              if (title && (s.name === 'New Conversation' || s.name === 'Default Conversation' || s.name.startsWith('Session '))) {
                s.name = title;
                this.plugin.saveState();
                new Notice(`✓ Conversation named: "${title}"`);
                this.plugin.refreshChatViews(this);
              }
            } catch (err) {
              if (err && err.name !== 'AbortError' && !(err instanceof UserAbortError)) {
                console.log('Fallback naming failed:', err);
              }
            } finally {
              this._pendingNamingFulfilled = false;
              this._primaryNamingPromise = null;
            }
          })();
        } else {
          this._pendingNamingFulfilled = false;
        }
      } else {
        // If no content at all, show an error
        streamingMsg.textContent = '⨉ No response received';
      }
      
    } catch (e) {
      console.error("Chat Error:", e);
      
      const errorMessage = friendlyErrorMessage(e, this.plugin);
      
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
          if (last.role === 'user') this.plugin._sessionManager.removeLastMessage();
        }

        // Restore the original text to the input and retry.
        // _onSend() re-runs the full flow including the embedded-classifier
        // logic, so no extra intent check is needed here.
        this.inputEl.value = txt;
        this.pendingAttachments = [...currentAttachments];
        this._onSend();
      });
    } finally {
      // FIX 3: Clear state on the session that OWNS this request, not the
      // current active session (which may have changed if the user switched).
      this._setGeneratingState(false, ownerSessionId);
      // No-op when the turn was already applied; drops it after errors/stops.
      this.plugin._sessionManager.discardTurn(ownerSessionId);
      // Near the context limit? Summarize the earliest messages in the background (off by default).
      this.plugin.compression.run(ownerSessionId).catch(() => {});
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
  /**
   * @param {Object} [opts]  Used when editing an already-sent message: the caller has
   *   already read the instruction and the files, and `replaceIndex` is the message to
   *   turn into this "✏ Edit instruction" (the branching setting decides whether the old
   *   version is kept as a branch or overwritten).
   */
  async _onEditSend(opts = {}) {
    const instruction = (opts.instruction !== undefined ? opts.instruction : this.inputEl.value).trim();
    if (!instruction) {
      new Notice('Describe the edits you want the AI to make');
      return;
    }
    const files = [...(opts.files || this._pendingEditFiles)];
    if (files.length === 0) {
      new Notice('No files attached — use the + button to attach files or a folder');
      return;
    }

    // Capture state before clearing
    const instruction_ = instruction;

    // Clear input immediately (same UX as normal send). _resetComposer also
    // wipes the persisted session draft — this path used to skip that, so the
    // instruction and attached files came back on the next draft restore.
    // (When editing a sent message the composer was already reset by the caller.)
    if (opts.replaceIndex === undefined) this._resetComposer();

    // Show the user's instruction as a chat bubble so the thread makes sense
    const s = this.plugin._sessionManager.getActive()
      ?? (() => {
        this.plugin._sessionManager.create('New Conversation');
        return this.plugin._sessionManager.getActive();
      })();

    // The attached files are remembered on the message, so editing it later brings them back.
    const editMeta = { editFiles: files.map(f => f.path), inEditTurn: true };
    const instructionText = `✏ Edit instruction:\n${instruction_}`;
    let instructionMsg;
    if (opts.replaceIndex !== undefined) {
      const ok = this.plugin._sessionManager.editUserMessage(opts.replaceIndex, instructionText, [], this._editMode());
      if (!ok) { new Notice('⨉ Could not edit message'); return; }
      instructionMsg = s.messages[opts.replaceIndex];
      Object.assign(instructionMsg, editMeta);
      delete instructionMsg.invokedSkill;
      this.plugin.saveState();
      this._renderMessages();
      this.plugin.refreshChatViews(this);
    } else {
      this.plugin._sessionManager.addMessage('user', instructionText, [], editMeta);
      instructionMsg = s.messages[s.messages.length - 1];
      this._appendBubble('user', instructionText, [], s.messages.length - 1);
      this.plugin.saveState();
    }

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

    this._scheduleScrollToBottom();

    // Every request of the pipeline (file contents + instruction in, the model's answer out)
    // is measured and stored on the instruction message, so the token counter includes it.
    const sm = this.plugin._sessionManager;
    sm.beginTurn(s.id);
    const settleTokens = () => {
      sm.applyEditTurnTokens(s.id, instructionMsg);
      this.plugin.saveState();
      this._updateTokenCounter?.();
    };

    let fileDiffs;
    try {
      const editor = new AIFileEditor(this.plugin);
      fileDiffs = await editor.editFiles(files, instruction_, (status) => {
        progressText.textContent = status;
        this._scheduleScrollToBottom();
      }, {
        isCancelled: () => cancelled,
        sessionId: s.id
      });
    } catch (e) {
      settleTokens();
      progressText.textContent = `⨉ Edit pipeline failed: ${e.message}`;
      progressBubble.style.color = 'var(--text-error)';
      new Notice(`AI edit failed: ${e.message}`);
      return;
    }
    settleTokens();

    // Remove the progress bubble — the DiffViewModal takes over from here
    progressContainer.remove();

    if (fileDiffs.length === 0) {
      new Notice('Stopped before any files were processed.');
      return;
    }

    const changedCount = fileDiffs.filter(d => DiffComputer.hasChanges(d.diff)).length;

    // The AI's own short message for each file (what it found, or why nothing changes)
    const chatMessages = fileDiffs
      .filter(fd => fd.chatMessage)
      .map(fd => `**${fd.file.basename}**${fd.editMode === 'patch' ? ` _(patched, ${fd.patchCount} edit${fd.patchCount === 1 ? '' : 's'})_` : fd.editMode === 'rewrite' ? ' _(rewritten)_' : ''}: ${fd.chatMessage}`);

    if (changedCount === 0) {
      // Nothing to review — show what the AI said in the chat, since there is no diff to open
      const text = chatMessages.length > 0
        ? chatMessages.join('\n\n')
        : `✓ I reviewed ${files.length} file${files.length !== 1 ? 's' : ''} and found nothing to change.`;
      this.plugin._sessionManager.addMessage('assistant', text, [], { tokens: 0, inEditTurn: true });
      this._appendBubble('assistant', text, []);
      this.plugin.saveState();
      this._scheduleScrollToBottom();
      return;
    }

    // Post per-file chat messages from the AI into the conversation thread.
    // Each FileDiff may carry a chatMessage the AI wrote alongside the edit.
    // Collect them into a single assistant bubble so the chat thread stays
    // readable without one bubble per file for large batches.
    if (chatMessages.length > 0) {
      const combinedChat = chatMessages.join('\n\n');
      this.plugin._sessionManager.addMessage('assistant', combinedChat, [], { tokens: 0, inEditTurn: true });
      this._appendBubble('assistant', combinedChat, []);
      this.plugin.saveState();
      this._scheduleScrollToBottom();
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
      this.plugin._sessionManager.removeMessagesWhere(m => m.isDiffSummary);

      // Record the result in the conversation thread
      const summary = [
      `✓ Applied AI edits to ${appliedFiles.length} file${appliedFiles.length !== 1 ? 's' : ''}:`,
      ...appliedFiles.map(f => `  **•** [[${f.path.slice(0, -3)}]]`)
    ].join('\n');


      this.plugin._sessionManager.addMessage('assistant', summary, [], { isDiffSummary: true, tokens: 0, inEditTurn: true });
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

    // Model text field — hidden when provider is 'default' (active provider owns the model)
    const modelWrap = providerRow.createDiv();
    modelWrap.style.flex = '1';
    const modelLabel = modelWrap.createEl('label', { text: 'Model Override (optional):' });
    modelLabel.style.display = 'block';
    modelLabel.style.fontSize = '12px';
    modelLabel.style.fontWeight = '600';
    modelLabel.style.marginBottom = '6px';
    const modelInput = modelWrap.createEl('input', { type: 'text' });
    modelInput.style.width = '100%';
    modelInput.style.padding = '7px 10px';
    modelInput.style.borderRadius = '6px';
    modelInput.style.border = '1px solid var(--background-modifier-border)';
    modelInput.style.backgroundColor = 'var(--background-secondary)';
    modelInput.style.color = 'var(--text-normal)';
    modelInput.style.fontSize = '13px';
    modelInput.style.fontFamily = 'monospace';

    // Hint below model field
    const modelHint = modelWrap.createEl('div', {
      text: "Leave empty to use the provider's configured model."
    });
    modelHint.style.fontSize = '11px';
    modelHint.style.color = 'var(--text-muted)';
    modelHint.style.marginTop = '5px';

    // Per-provider placeholder defaults and value sync
    const PROVIDER_DEFAULTS = {
      local:     this.plugin.settings.localModel || 'llama2',
      openai:    this.plugin.settings.openaiModel || 'gpt-3.5-turbo',
      gemini:    this.plugin.settings.geminiModel || 'gemini-1.5-flash',
      anthropic: this.plugin.settings.anthropicModel || 'claude-3-haiku-20240307',
      custom:    '(your custom model name)',
    };

    const syncModelField = () => {
      const selectedProvider = providerSelect.value;
      const isDefault = selectedProvider === 'default';
      // Hide the entire model column when 'default' is chosen — no override makes sense there
      modelWrap.style.display = isDefault ? 'none' : '';
      if (!isDefault) {
        modelInput.value = (this.plugin.settings.namingModels || {})[selectedProvider] || '';
        modelInput.placeholder = PROVIDER_DEFAULTS[selectedProvider] || '(provider default)';
      }
    };

    providerSelect.addEventListener('change', syncModelField);
    syncModelField(); // Set on open

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
      // Persist the model override for the currently selected provider only.
      // 'default' has no per-provider override — the active provider's own model is used.
      const selectedProvider = providerSelect.value;
      if (selectedProvider !== 'default') {
        if (!this.plugin.settings.namingModels) this.plugin.settings.namingModels = {};
        this.plugin.settings.namingModels[selectedProvider] = modelInput.value.trim();
      }
      this.plugin.saveSettings();
      new Notice('✓ Naming settings saved');
      this.close();
    });
  }
}

// ==================== SETTINGS MODAL ====================


// ==================== SETTINGS MIXIN ====================
/**
 * Shared settings UI methods used by both SettingsModal (in-chat shortcut)
 * and AIPluginSettingTab (Obsidian's native Settings panel).
 * Applied via Object.assign(this, SettingsMixin) in each class constructor.
 */
const SettingsMixin = {

  /**
   * Builds the full tabbed settings UI into `rootEl`.
   * @param {HTMLElement} rootEl     - Element to render into (contentEl or containerEl)
   * @param {boolean}     scrollable - When true, caps the content panel height and adds
   *                                   overflow scrolling (used by the modal; the native
   *                                   settings tab handles its own scrolling).
   */
  buildSettingsUI(rootEl, { scrollable = false } = {}) {
    const tabsContainer = rootEl.createDiv({ cls: 'ai-settings-tabs' });
    tabsContainer.style.display = 'flex';
    tabsContainer.style.gap = '8px';
    tabsContainer.style.marginBottom = '20px';
    tabsContainer.style.borderBottom = '1px solid var(--background-modifier-border)';
    tabsContainer.style.paddingBottom = '10px';
    tabsContainer.style.flexWrap = 'wrap';

    const makeTab = (icon, label, active = false) => {
      const tab = tabsContainer.createEl('button', { cls: 'ai-tab-btn' + (active ? ' active' : '') });
      const iconSpan = tab.createSpan();
      setIcon(iconSpan, icon);
      iconSpan.style.marginRight = '6px';
      iconSpan.style.display = 'inline-flex';
      tab.appendChild(document.createTextNode(label));
      tab.style.padding = '10px 16px';
      tab.style.border = 'none';
      tab.style.background = 'transparent';
      tab.style.color = 'var(--text-muted)';
      tab.style.cursor = 'pointer';
      tab.style.borderRadius = '6px';
      tab.style.fontSize = '14px';
      tab.style.display = 'flex';
      tab.style.alignItems = 'center';
      return tab;
    };

    const localTab         = makeTab('monitor-speaker', 'Local Model',   true);
    const cloudTab         = makeTab('server',          'Cloud Model');
    const generalTab       = makeTab('settings',        'General');
    const conversationsTab = makeTab('message-square',  'Conversations');
    const namingTab        = makeTab('type',            'Auto-Naming');
    const fileAccessTab    = makeTab('folder-cog',      'File Access');
    const agentTab         = makeTab('bot',             'Agent');
    const shortcutsTab     = makeTab('command',         'Shortcuts');
    const toggleBtnTab     = makeTab('repeat',          'Toggle Button');
    const allTabs = [localTab, cloudTab, generalTab, conversationsTab, namingTab,
                     fileAccessTab, agentTab, shortcutsTab, toggleBtnTab];

    const contentContainer = rootEl.createDiv({ cls: 'ai-settings-content' });
    if (scrollable) {
      contentContainer.style.maxHeight = '400px';
      contentContainer.style.overflowY = 'auto';
    }
    contentContainer.style.paddingRight = '10px';
    contentContainer.style.marginBottom = '20px';

    this.showLocalSettings(contentContainer);
    this.setActiveTab(localTab, allTabs.filter(t => t !== localTab));

    const wire = (tab, showFn) => {
      tab.addEventListener('click', () => {
        this.setActiveTab(tab, allTabs.filter(t => t !== tab));
        showFn.call(this, contentContainer);
      });
    };
    wire(localTab,         this.showLocalSettings);
    wire(cloudTab,         this.showCloudSettings);
    wire(generalTab,       this.showGeneralSettings);
    wire(conversationsTab, this.showConversationsSettings);
    wire(namingTab,        this.showNamingSettings);
    wire(fileAccessTab,    this.showFileAccessSettings);
    wire(agentTab,         this.showAgentSettings);
    wire(shortcutsTab,     this.showShortcutsSettings);
    wire(toggleBtnTab,     this.showToggleButtonSettings);
  },

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
},

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
  
  const localBaseInput = this.createInputField(section, 'Base URL:', 'baseUrl', this.plugin.settings.baseUrl, 'text', 'http://127.0.0.1:11434');
  const localEpInput   = this.createInputField(section, 'Endpoint:', 'localEndpoint', this.plugin.settings.localEndpoint, 'text', '/v1/chat/completions');
  this.createModelField(section, 'Model Name:', 'localModel', 'llama2', 'local', [localBaseInput, localEpInput]);
  
  this.createTestConnectionButton(section, () => new LocalAIProvider(this.plugin), 'local');
},

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
},

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
},

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
},

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

  const openaiKeyInput = this.createInputField(section, 'API Key:', 'openaiApiKey', 
    this.plugin.settings.openaiApiKey, 'password');
  
  const openaiEpInput = this.createInputField(section, 'Custom Endpoint (optional):', 'openaiEndpoint', 
    this.plugin.settings.openaiEndpoint, 'text', 'https://api.openai.com/v1/chat/completions');

  this.createModelField(section, 'Model:', 'openaiModel', 'gpt-3.5-turbo', 'openai', [openaiKeyInput, openaiEpInput]);
  
  this.createTestConnectionButton(section, () => new OpenAIProvider(this.plugin), 'openai');
},

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
  
  const geminiKeyInput = this.createInputField(section, 'API Key:', 'geminiApiKey', 
    this.plugin.settings.geminiApiKey, 'password');
  
  this.createModelField(section, 'Model:', 'geminiModel', 'gemini-1.5-flash', 'gemini', [geminiKeyInput]);
  
  this.createTestConnectionButton(section, () => new GeminiProvider(this.plugin), 'gemini');
},

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

  const anthropicKeyInput = this.createInputField(section, 'API Key:', 'anthropicApiKey', 
    this.plugin.settings.anthropicApiKey, 'password');
  
  this.createModelField(section, 'Model:', 'anthropicModel', 'claude-3-haiku-20240307', 'anthropic', [anthropicKeyInput]);
  
  this.createTestConnectionButton(section, () => new AnthropicProvider(this.plugin), 'anthropic');
},

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

  const customKeyInput = this.createInputField(section, 'API Key:', 'customApiKey', this.plugin.settings.customApiKey, 'password');
  const customEpInput  = this.createInputField(section, 'Endpoint URL:', 'customEndpoint', this.plugin.settings.customEndpoint, 'text');
  this.createModelField(section, 'Model Name:', 'customModel', '', 'custom', [customKeyInput, customEpInput]);
  
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
},

/** A titled settings card (the look every tab shares). Returns the card element. */
_settingsCard(container, icon, title, hint) {
  const card = container.createDiv({ cls: 'ai-settings-section' });
  card.style.background = 'var(--background-secondary)';
  card.style.borderRadius = '8px';
  card.style.padding = '20px';
  card.style.marginBottom = '20px';
  card.style.border = '1px solid var(--background-modifier-border)';

  const h3 = card.createEl('h3');
  h3.style.display = 'flex';
  h3.style.alignItems = 'center';
  const h3Icon = h3.createSpan();
  setIcon(h3Icon, icon);
  h3Icon.style.marginRight = '8px';
  h3.appendChild(document.createTextNode(title));

  if (hint) {
    const p = card.createEl('p');
    p.style.fontSize = '13px';
    p.style.color = 'var(--text-muted)';
    p.style.marginTop = '0';
    p.textContent = hint;
  }
  return card;
},

/** General: only what applies to the plugin as a whole. */
showGeneralSettings(container) {
  container.empty();

  const section = this._settingsCard(container, 'settings', 'General Settings');
  this.createSliderField(section, 'Temperature:', 'temperature', this.plugin.settings.temperature, 0, 2, 0.1);
  this.createInputField(section, 'Max Tokens:', 'max_tokens', this.plugin.settings.max_tokens, 'number', '2048');
  this.createInputField(section, 'Timeout (ms):', 'timeoutMs', this.plugin.settings.timeoutMs, 'number', '120000');
  this.createToggleButton(section, 'Auto-check health on startup:', 'autoCheckHealth', this.plugin.settings.autoCheckHealth, true);
  this.createToggleButton(section, 'Show token counter:', 'showTokenCounter', this.plugin.settings.showTokenCounter);
  this.createToggleButton(section, 'Auto-scroll chat while streaming responses:', 'autoScrollOnStream', this.plugin.settings.autoScrollOnStream);
  this.createToggleButton(section, 'Request and show the model\'s reasoning when a reasoning level is selected:', 'showReasoning', this.plugin.settings.showReasoning);
  this.createToggleButton(section, 'Mentions: @note, @folder and #tag in the message box:', 'mentionsEnabled', this.plugin.settings.mentionsEnabled);
  if (this.plugin._secretStorage()) {
    this.createToggleButton(section, 'Store API keys in Obsidian secure storage instead of data.json:', 'useSecureKeyStorage', this.plugin.settings.useSecureKeyStorage);
  }
  this.createInputPositionSelector(section);
  const stg = this.plugin.settings;
  if (stg.messageCollapseEnabled === undefined) stg.messageCollapseEnabled = (stg.messageCollapseLines ?? 5) > 0;
  if (!(stg.messageCollapseLines >= 1)) stg.messageCollapseLines = 1;
  const collapseSlider = this.createSliderField(section, 'Collapse user messages longer than N lines:', 'messageCollapseLines', stg.messageCollapseLines, 1, 20, 1);
  const collapseRow = collapseSlider.parentElement;
  collapseRow.style.display = stg.messageCollapseEnabled ? '' : 'none';
  this.createToggleButton(section, 'Collapse long user messages:', 'messageCollapseEnabled', stg.messageCollapseEnabled, false, (on) => {
    collapseRow.style.display = on ? '' : 'none';
  });
  section.insertBefore(section.lastElementChild, collapseRow);
},

/** Agent: the AI folder and everything the AI can use or do beyond plain chat. */
showAgentSettings(container) {
  container.empty();

  const folder = this._settingsCard(container, 'bot', 'AI Folder & Abilities',
    'One folder holds everything the AI owns: soul.md, memory.md, user.md, Skills, Commands and Agents. Pick it first — most switches below need it.');
  this._createAIFolderField(folder);
  this.createToggleButton(folder, 'Use soul.md as the AI\'s identity in every chat (needs an AI folder):', 'soulInjection', this.plugin.settings.soulInjection);
  this.createToggleButton(folder, 'Skills from the AI folder (needs an AI folder):', 'skillsEnabled', this.plugin.settings.skillsEnabled);
  this.createToggleButton(folder, 'Slash commands from the AI folder (needs an AI folder):', 'slashCommandsEnabled', this.plugin.settings.slashCommandsEnabled);
  this.createToggleButton(folder, 'Subagents from the AI folder: the AI can hand tasks to your agents (needs an AI folder):', 'subagentsEnabled', this.plugin.settings.subagentsEnabled);
  this.createToggleButton(folder, 'Persistent memory: memory.md and user.md, changes only with your approval (needs an AI folder):', 'memoryEnabled', this.plugin.settings.memoryEnabled);
  this.createToggleButton(folder, 'Skill suggestion: after a multi-step task, offer to save it as a skill (needs an AI folder):', 'skillSuggestion', this.plugin.settings.skillSuggestion);

  const tools = this._settingsCard(container, 'plug', 'Tools & Integrations');
  let mcpRow = null;
  this.createToggleButton(tools, 'MCP servers: give the AI extra tools from MCP servers (each one asks before it runs):', 'mcpEnabled',
    this.plugin.settings.mcpEnabled, false, (on) => { if (mcpRow) mcpRow.style.display = on ? 'block' : 'none'; this.plugin.mcp.sync().catch(() => {}); });
  mcpRow = this._createMcpSection(tools);
  let searchRow = null;
  this.createToggleButton(tools, 'Web search: let the AI look things up on the web:', 'webSearchEnabled',
    this.plugin.settings.webSearchEnabled, false, (on) => { if (searchRow) searchRow.style.display = on ? 'block' : 'none'; });
  searchRow = this._createWebSearchSection(tools);
  let hooksRow = null;
  this.createToggleButton(tools, 'Event hooks: run a command or skill before file writes, after replies, or when the plugin loads:', 'hooksEnabled',
    this.plugin.settings.hooksEnabled, false, (on) => { if (hooksRow) hooksRow.style.display = on ? 'block' : 'none'; });
  hooksRow = this._createHooksSection(tools);

  this._createPermissionsSection(container, 'tools');
},

/** Conversations tab: how chats are stored, edited and kept within the context window. */
_createConversationOptions(container) {
  const section = this._settingsCard(container, 'sliders-horizontal', 'Conversation Options');
  this.createInputField(section, 'Conversations Folder:', 'conversationsFolder', this.plugin.settings.conversationsFolder, 'text', 'AI Conversations');
  this._createExportTemplateField(section);
  let editingRow = null;
  this.createToggleButton(section, 'Conversation branching (edit or branch a message and keep what followed):', 'conversationBranching',
    this.plugin.settings.conversationBranching, false, (on) => {
      if (editingRow) editingRow.style.display = on ? 'block' : 'none';
      // reply bubbles get (or lose) their Branch menu
      this.plugin.app.workspace.getLeavesOfType(VIEW_TYPE).concat(this.plugin.app.workspace.getLeavesOfType(VIEW_TYPE_CHAT_PAGE))
        .forEach(leaf => { if (leaf.view instanceof ChatView) leaf.view._renderMessages(); });
    });
  editingRow = this._createEditingMessageField(section);
  let searchSourceRow = null;
  this.createToggleButton(section, 'Chat history search: bring relevant parts of earlier chats into context (searched on this device):', 'chatSearchEnabled',
    this.plugin.settings.chatSearchEnabled, false, (on) => { if (searchSourceRow) searchSourceRow.style.display = on ? 'block' : 'none'; });
  searchSourceRow = this._createSelectField(section, 'Search in:', 'chatSearchSource', [
    { value: 'sessions', text: 'Conversations in the chat list' },
    { value: 'saved',    text: 'Saved conversation notes (in the Conversations Folder)' },
    { value: 'both',     text: 'Both — Conversations & Saved Conversations' }
  ], 'sessions', !!this.plugin.settings.chatSearchEnabled);
  let thresholdRow = null;
  this.createToggleButton(section, 'Context compression: summarize the earliest messages near the model\'s context limit (cloud models only):', 'contextCompression',
    this.plugin.settings.contextCompression, false, (on) => { if (thresholdRow) thresholdRow.style.display = on ? 'block' : 'none'; });
  thresholdRow = this._createSelectField(section, 'Start summarizing at:', 'contextCompressionThreshold',
    [50, 60, 70, 80, 90].map(v => ({ value: String(v), text: `${v}% of the context window` })), '80', !!this.plugin.settings.contextCompression, (v) => Number(v));
},

/** File Access tab: how proposed changes are reviewed, and planning before any change. */
_createReviewCard(container) {
  const section = this._settingsCard(container, 'git-compare', 'Reviewing & Planning Changes');
  this.createToggleButton(section, 'Ignore whitespace-only differences in diff review:', 'ignoreWhitespaceInDiff', this.plugin.settings.ignoreWhitespaceInDiff);
  this.createToggleButton(section, 'Fold unchanged lines in diff review (show only changes + context):', 'collapseUnchangedInDiff', this.plugin.settings.collapseUnchangedInDiff);
  this.createToggleButton(section, 'Plan mode: type /plan and the AI writes a plan, then waits for your approval before changing anything:', 'planModeAvailable', this.plugin.settings.planModeAvailable);
},

/** FR-1.5: the MCP servers. Tokens go to the secret storage, never into the settings. */
_createMcpSection(container) {
  const plugin = this.plugin;
  const wrap = container.createDiv({ cls: 'ai-settings-row' });
  wrap.style.marginBottom = '16px';
  wrap.style.display = plugin.settings.mcpEnabled ? 'block' : 'none';

  const style = (el) => { el.style.width = '100%'; el.style.boxSizing = 'border-box'; el.style.padding = '8px'; el.style.marginTop = '4px'; el.style.borderRadius = '6px'; el.style.border = '1px solid var(--background-modifier-border)'; el.style.backgroundColor = 'var(--background-primary)'; el.style.color = 'var(--text-normal)'; return el; };
  const small = (el, text) => { el.style.fontSize = '12px'; el.style.color = 'var(--text-muted)'; el.style.marginTop = '4px'; el.textContent = text; return el; };
  const btn = (parent, text, onClick) => { const b = parent.createEl('button', { text, attr: { type: 'button' } }); b.style.minHeight = '36px'; b.style.padding = '0 12px'; b.style.cursor = 'pointer'; b.addEventListener('click', onClick); return b; };
  let timer = null;
  const resync = () => { clearTimeout(timer); timer = setTimeout(() => { plugin.mcp.sync().catch(() => {}).then(() => render()); }, 600); };
  const save = () => plugin.saveSettings();
  const statusText = (id) => {
    const st = plugin.mcp.status(id);
    return ({ connected: `Connected — ${st.tools} tool${st.tools === 1 ? '' : 's'}`, failed: `Not connected: ${st.error}`, off: 'Off', 'desktop-only': 'Local servers run on desktop only', connecting: 'Not connected yet' })[st.state];
  };

  const render = () => {
    wrap.empty();
    wrap.createEl('label', { text: 'MCP servers' }).style.display = 'block';
    small(wrap.createEl('div'), 'Each tool a server offers asks before it runs, unless you allow that server under Permissions.');
    if (!Array.isArray(plugin.settings.mcpServers)) plugin.settings.mcpServers = [];
    const servers = plugin.settings.mcpServers;

    servers.forEach((server, i) => {
      const card = wrap.createDiv();
      card.style.border = '1px solid var(--background-modifier-border)'; card.style.borderRadius = '8px'; card.style.padding = '10px'; card.style.margin = '8px 0';
      const field = (label, attrs, value, onChange) => {
        const l = card.createEl('label', { text: label }); l.style.display = 'block'; l.style.marginTop = '8px';
        const input = style(card.createEl('input', { attr: attrs }));
        input.value = value || '';
        input.addEventListener('change', () => { onChange(input.value.trim(), input); });
        return input;
      };
      field('Name', { type: 'text', placeholder: 'My server' }, server.name, (v) => { server.name = v; save(); resync(); });
      if (server.transport === 'http') {
        field('Address', { type: 'text', placeholder: 'https://example.com/mcp' }, server.url, (v) => { server.url = v; save(); resync(); });
        const saved = !!plugin.getSecret(`mcp-token-${server.id}`);
        const tokenInput = field('Token (optional)', { type: 'password', autocomplete: 'off', placeholder: saved ? '•••••••• (saved)' : 'Paste a token' }, '', (v, input) => {
          if (v) { plugin.setSecret(`mcp-token-${server.id}`, v); input.value = ''; resync(); render(); }
        });
        if (saved) btn(card, 'Remove token', () => { plugin.setSecret(`mcp-token-${server.id}`, ''); resync(); render(); }).style.marginTop = '6px';
        if (!plugin.secretsArePersistent()) small(card.createEl('div'), 'This version of Obsidian has no secure storage, so the token is kept only until Obsidian closes.');
      } else {
        field('Command', { type: 'text', placeholder: 'npx' }, server.command, (v) => { server.command = v; save(); resync(); });
        field('Arguments', { type: 'text', placeholder: '-y @example/mcp-server' }, server.args, (v) => { server.args = v; save(); resync(); });
        small(card.createEl('div'), 'A local server starts a program on this computer.');
      }
      const status = card.createEl('div'); small(status, statusText(server.id)); status.style.marginTop = '8px';
      const row = card.createDiv(); row.style.display = 'flex'; row.style.gap = '8px'; row.style.marginTop = '8px'; row.style.flexWrap = 'wrap';
      btn(row, server.enabled === false ? 'Off' : 'On', () => { server.enabled = server.enabled === false; save(); resync(); render(); });
      btn(row, 'Reconnect', () => { plugin.mcp.reconnect(server.id).catch(() => {}).then(() => render()); });
      btn(row, 'Remove', () => { servers.splice(i, 1); plugin.setSecret(`mcp-token-${server.id}`, ''); save(); resync(); render(); });
    });

    const add = wrap.createDiv(); add.style.display = 'flex'; add.style.gap = '8px'; add.style.flexWrap = 'wrap';
    const newServer = (transport) => ({ id: 'mcp' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), name: '', transport, url: '', command: '', args: '', enabled: true });
    btn(add, 'Add remote server', () => { servers.push(newServer('http')); save(); render(); });
    if (Platform.isDesktop) btn(add, 'Add local server', () => { servers.push(newServer('stdio')); save(); render(); });
  };
  render();
  return wrap;
},

/** FR-3.4: where web searches come from, and the key or address of the external service. */
_createWebSearchSection(container) {
  const plugin = this.plugin;
  const wrap = container.createDiv({ cls: 'ai-settings-row' });
  wrap.style.marginBottom = '16px';
  wrap.style.display = plugin.settings.webSearchEnabled ? 'block' : 'none';

  const style = (el) => { el.style.width = '100%'; el.style.boxSizing = 'border-box'; el.style.padding = '8px'; el.style.marginTop = '4px'; el.style.borderRadius = '6px'; el.style.border = '1px solid var(--background-modifier-border)'; el.style.backgroundColor = 'var(--background-primary)'; el.style.color = 'var(--text-normal)'; return el; };
  const note = (el, text) => { el.style.fontSize = '12px'; el.style.color = 'var(--text-muted)'; el.style.marginTop = '4px'; el.textContent = text; return el; };
  const field = (label) => { const l = wrap.createEl('label', { text: label }); l.style.display = 'block'; l.style.marginTop = '10px'; };
  const choose = (label, options, current, onChange) => {
    field(label);
    const sel = style(wrap.createEl('select'));
    options.forEach(([value, text]) => { const o = sel.createEl('option', { value, text }); if (value === current) o.selected = true; });
    sel.addEventListener('change', () => onChange(sel.value));
    return sel;
  };

  const render = () => {
    wrap.empty();
    const s = plugin.settings;
    const source = s.webSearchSource || 'auto';
    choose('Search source:', [['auto', 'Auto — built-in for Gemini and Claude, your service for the rest'], ['builtin', 'Built-in only'], ['external', 'External only']], source, (v) => { s.webSearchSource = v; plugin.saveSettings(); render(); });

    let serviceLabel = '';
    if (source !== 'builtin') {
      const svcName = s.webSearchService || '';
      choose('External search service:', [['', 'Not set'], ...Object.entries(WEB_SEARCH_SERVICES).map(([k, v]) => [k, v.label])], svcName, (v) => { s.webSearchService = v; plugin.saveSettings(); render(); });
      const svc = WEB_SEARCH_SERVICES[svcName];
      serviceLabel = svc ? svc.label : '';
      if (svc && svc.needsKey) {
        field(`${svc.label} key:`);
        const saved = !!plugin.getSecret(svc.secret);
        const input = style(wrap.createEl('input', { attr: { type: 'password', autocomplete: 'off', placeholder: saved ? '•••••••• (saved)' : 'Paste your key' } }));
        input.addEventListener('change', () => { if (input.value.trim()) { plugin.setSecret(svc.secret, input.value.trim()); input.value = ''; render(); } });
        if (saved) {
          const clear = wrap.createEl('button', { text: 'Remove key', attr: { type: 'button' } });
          clear.style.minHeight = '36px'; clear.style.marginTop = '6px'; clear.style.cursor = 'pointer';
          clear.addEventListener('click', () => { plugin.setSecret(svc.secret, ''); render(); });
        }
        if (!plugin.secretsArePersistent()) note(wrap.createEl('div'), 'This version of Obsidian has no secure storage, so the key is kept only until Obsidian closes.');
      } else if (svcName === 'searxng') {
        field('Server address:');
        const url = style(wrap.createEl('input', { attr: { type: 'text', placeholder: 'https://search.example.org' } }));
        url.value = s.searxngUrl || '';
        url.addEventListener('change', () => { s.searxngUrl = url.value.trim(); plugin.saveSettings(); });
        note(wrap.createEl('div'), 'The server must have JSON output switched on.');
      }
    }

    const where = source === 'builtin'
      ? 'Searches are made by Gemini or Claude themselves.'
      : `Your search queries are sent to ${serviceLabel || 'the service you choose'}${source === 'auto' ? '; Gemini and Claude use their own built-in search instead' : ''}.`;
    note(wrap.createEl('div'), where + (source !== 'external' ? ' On Gemini, a built-in search turns the other tools off for that request.' : ''));
  };
  render();
  return wrap;
},

/** FR-1.6: the list of hooks. They live in the plugin settings, never in the vault. */
_createHooksSection(container) {
  const plugin = this.plugin;
  const wrap = container.createDiv({ cls: 'ai-settings-row' });
  wrap.style.marginBottom = '16px';
  wrap.style.display = plugin.settings.hooksEnabled ? 'block' : 'none';

  const style = (el) => { el.style.padding = '8px'; el.style.borderRadius = '6px'; el.style.border = '1px solid var(--background-modifier-border)'; el.style.backgroundColor = 'var(--background-primary)'; el.style.color = 'var(--text-normal)'; return el; };
  const select = (parent, options, current, onChange) => {
    const el = style(parent.createEl('select'));
    el.style.minHeight = '36px';
    options.forEach(([value, text]) => { const o = el.createEl('option', { value, text }); if (value === current) o.selected = true; });
    el.addEventListener('change', () => onChange(el.value));
    return el;
  };
  const save = () => plugin.saveSettings();

  const render = () => {
    wrap.empty();
    wrap.createEl('label', { text: 'Hooks' }).style.display = 'block';
    const hint = wrap.createEl('div');
    hint.style.fontSize = '12px'; hint.style.color = 'var(--text-muted)'; hint.style.marginBottom = '6px';
    hint.textContent = 'Each hook runs a command or skill from your AI folder when the event happens. Every run asks you first, unless "Run hooks" is set to Allow under Permissions. Hooks cannot run code.';
    if (!Array.isArray(plugin.settings.hooks)) plugin.settings.hooks = [];
    const hooks = plugin.settings.hooks;

    hooks.forEach((hook, i) => {
      const row = wrap.createDiv();
      row.style.display = 'flex'; row.style.flexWrap = 'wrap'; row.style.gap = '6px'; row.style.alignItems = 'center'; row.style.marginBottom = '8px';
      select(row, Object.entries(HOOK_EVENTS), hook.event, (v) => { hook.event = v; save(); });
      select(row, [['skill', 'Skill'], ['command', 'Command']], hook.kind, (v) => { hook.kind = v; hook.name = ''; save(); render(); });
      const names = (hook.kind === 'command' ? plugin.commands.list() : plugin.skills.list()).map(x => x.name);
      if (hook.name && !names.includes(hook.name)) names.push(hook.name);
      select(row, [['', 'Choose…'], ...names.map(n => [n, n])], hook.name || '', (v) => { hook.name = v; save(); });
      const remove = row.createEl('button', { text: 'Remove', attr: { type: 'button' } });
      remove.style.minHeight = '36px'; remove.style.padding = '0 12px'; remove.style.cursor = 'pointer';
      remove.addEventListener('click', () => { hooks.splice(i, 1); save(); render(); });
    });

    const add = wrap.createEl('button', { text: 'Add hook', attr: { type: 'button' } });
    add.style.minHeight = '36px'; add.style.padding = '0 14px'; add.style.cursor = 'pointer';
    add.addEventListener('click', () => {
      hooks.push({ id: 'h' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), event: 'afterResponseGenerated', kind: 'skill', name: '' });
      save();
      render();
    });
  };
  render();
  // the command and skill lists are read from the vault; fill them in as soon as they are known
  plugin.refreshSlashSources().then(render).catch(() => {});
  return wrap;
},

/** FR-3.5: Ask / Allow / Deny for every tool and kind of file operation, plus folders where Ask runs without asking. */
/** @param {'file'|'tools'} [which] 'file' = file operations only, 'tools' = everything else, omitted = all */
_createPermissionsSection(container, which) {
  const plugin = this.plugin;
  plugin.registerFeatureTools();

  const card = container.createDiv({ cls: 'ai-settings-section' });
  card.style.background = 'var(--background-secondary)';
  card.style.borderRadius = '8px';
  card.style.padding = '20px';
  card.style.marginBottom = '20px';
  card.style.border = '1px solid var(--background-modifier-border)';
  const h3 = card.createEl('h3');
  h3.style.display = 'flex';
  h3.style.alignItems = 'center';
  const icon = h3.createSpan();
  setIcon(icon, 'shield');
  icon.style.marginRight = '8px';
  h3.appendChild(document.createTextNode(which === 'file' ? 'File Permissions' : which === 'tools' ? 'Tool Permissions' : 'Permissions'));

  const rows = [];
  if (which !== 'tools' && plugin.settings.fileOpsScope && plugin.settings.fileOpsScope !== 'disabled') {
    for (const [name, t] of Object.entries(FILE_OP_TOOLS)) rows.push({ name, title: t.title, description: t.description, defaultPolicy: t.defaultPolicy });
  }
  const shown = new Set();
  for (const t of (which === 'file' ? [] : plugin.toolRegistry.list())) {
    if (t.policyKey && FILE_OP_TOOLS[t.policyKey]) continue;            // shares the "Read files" rule above
    const key = t.policyKey || t.name;
    if (shown.has(key)) continue;                                        // one rule for all tools of an MCP server
    shown.add(key);
    rows.push({ name: key, title: t.policyTitle || t.title,
      description: t.policyTitle ? 'Applies to every tool of this server.' : t.description, defaultPolicy: t.defaultPolicy });
  }
  if (which !== 'file' && plugin.settings.hooksEnabled) rows.push({ name: HOOK_TOOL.name, title: HOOK_TOOL.title, description: HOOK_TOOL.description, defaultPolicy: HOOK_TOOL.defaultPolicy });

  const hint = (el, text) => { el.style.fontSize = '12px'; el.style.color = 'var(--text-muted)'; el.textContent = text; return el; };
  if (!rows.length) {
    hint(card.createEl('p'), which === 'file'
      ? 'Turn on AI File Operations above to choose what the AI may do with your files.'
      : which === 'tools'
        ? 'Nothing needs permission yet. Tools such as MCP servers, web search and subagents appear here once they are switched on.'
        : 'Nothing needs permission right now. File operations and tools appear here once their features are switched on.');
    return;
  }
  hint(card.createEl('p'), 'Choose what the AI may do without asking. "Ask" shows a prompt each time; "Deny" never allows it.');

  rows.forEach(r => {
    const row = card.createDiv({ cls: 'ai-settings-row' });
    row.style.marginBottom = '14px';
    row.createEl('label', { text: r.title }).style.display = 'block';
    hint(row.createEl('div'), r.description);
    const select = row.createEl('select');
    select.style.width = '100%'; select.style.padding = '8px'; select.style.marginTop = '4px'; select.style.borderRadius = '6px';
    select.style.border = '1px solid var(--background-modifier-border)'; select.style.backgroundColor = 'var(--background-primary)'; select.style.color = 'var(--text-normal)';
    const current = (plugin.settings.toolPermissions && plugin.settings.toolPermissions[r.name]) || r.defaultPolicy;
    [['ask', 'Ask'], ['allow', 'Allow'], ['deny', 'Deny']].forEach(([value, text]) => {
      const el = select.createEl('option', { value, text });
      if (current === value) el.selected = true;
    });
    select.addEventListener('change', () => {
      if (!plugin.settings.toolPermissions) plugin.settings.toolPermissions = {};
      plugin.settings.toolPermissions[r.name] = select.value;
      plugin.saveSettings();
    });
  });

  if (which === 'tools') return;       // the folder allow-list belongs with the file permissions

  const folderRow = card.createDiv({ cls: 'ai-settings-row' });
  folderRow.createEl('label', { text: 'Always allow in these folders' }).style.display = 'block';
  hint(folderRow.createEl('div'), 'One folder per line. Anything set to Ask runs without asking when it only touches files in these folders.');
  const area = folderRow.createEl('textarea');
  area.rows = 3;
  area.style.width = '100%'; area.style.padding = '8px'; area.style.marginTop = '4px'; area.style.boxSizing = 'border-box';
  area.style.border = '1px solid var(--background-modifier-border)'; area.style.backgroundColor = 'var(--background-primary)'; area.style.color = 'var(--text-normal)';
  area.value = (plugin.settings.permissionAllowFolders || []).join('\n');
  area.addEventListener('change', () => {
    plugin.settings.permissionAllowFolders = area.value.split('\n').map(l => normalizeVaultPath(l.trim())).filter(Boolean);
    plugin.saveSettings();
  });
},

_createEditingMessageField(container) {
  return this._createSelectField(container, 'Editing a message:', 'editingMessage', [
    { value: 'branch', text: 'Create a branch — keep the old version and what followed' },
    { value: 'overwrite', text: 'Overwrite — replace it and delete what followed' }
  ], 'branch', !!this.plugin.settings.conversationBranching);
},

/** A labelled drop-down bound to a setting. `parse` turns the chosen text into the stored value. */
_createSelectField(container, label, key, options, fallback, visible = true, parse = null) {
  const row = container.createDiv({ cls: 'ai-settings-row' });
  row.style.marginBottom = '16px';
  row.style.display = visible ? 'block' : 'none';
  row.createEl('label', { text: label }).style.display = 'block';

  const select = row.createEl('select');
  select.style.width = '100%';
  select.style.padding = '8px';
  select.style.marginTop = '6px';
  select.style.borderRadius = '6px';
  select.style.border = '1px solid var(--background-modifier-border)';
  select.style.backgroundColor = 'var(--background-primary)';
  select.style.color = 'var(--text-normal)';
  const current = String(this.plugin.settings[key] === undefined || this.plugin.settings[key] === null || this.plugin.settings[key] === '' ? fallback : this.plugin.settings[key]);
  options.forEach(opt => {
    const el = select.createEl('option', { value: opt.value, text: opt.text });
    if (current === opt.value) el.selected = true;
  });
  select.addEventListener('change', () => {
    this.plugin.settings[key] = parse ? parse(select.value) : select.value;
    this.plugin.saveSettings();
  });
  return row;
},

_createAIFolderField(container) {
  const row = container.createDiv({ cls: 'ai-settings-row' });
  row.style.marginBottom = '16px';

  const labelRow = row.createDiv();
  labelRow.style.display        = 'flex';
  labelRow.style.justifyContent = 'space-between';
  labelRow.style.alignItems     = 'center';
  labelRow.style.gap            = '10px';
  labelRow.style.marginBottom   = '6px';
  labelRow.createEl('label', { text: 'AI Folder:' }).style.fontWeight = '600';

  const pickBtn = labelRow.createEl('button', { text: 'Choose folder…' });
  pickBtn.style.minHeight    = '36px';
  pickBtn.style.padding      = '4px 14px';
  pickBtn.style.cursor       = 'pointer';
  pickBtn.style.borderRadius = '4px';
  pickBtn.style.border       = '1px solid var(--background-modifier-border)';
  pickBtn.style.background   = 'var(--background-secondary)';
  pickBtn.style.color        = 'var(--text-normal)';

  const current = row.createDiv();
  current.style.fontSize     = '13px';
  current.style.marginBottom = '4px';
  current.style.wordBreak    = 'break-word';
  const showCurrent = () => {
    const path = this.plugin.settings.aiFolder;
    current.textContent = path || 'Not set';
    current.style.color = path ? 'var(--text-normal)' : 'var(--text-muted)';
  };
  showCurrent();

  const hint = row.createEl('p');
  hint.style.fontSize   = '12px';
  hint.style.color      = 'var(--text-muted)';
  hint.style.margin     = '0';
  hint.textContent =
    'Everything the AI owns lives here: soul.md, memory.md, user.md, Skills, Commands and Agents. ' +
    'Choosing a folder creates what is missing and never changes what exists. Without one, those features stay off.';

  pickBtn.addEventListener('click', () => {
    new AIFolderPickerModal(this.plugin.app, async (folder) => {
      this.plugin.settings.aiFolder = folder.path;
      showCurrent();
      await this.plugin.saveSettings();
      const { failed } = await this.plugin.aiFolder.ensureStructure();
      if (failed.length) new Notice(`Couldn't create ${failed.length} item${failed.length !== 1 ? 's' : ''} in the AI folder. Check the folder's name and permissions.`);
    }).open();
  });
},

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
},

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
},

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
    this.plugin.saveSettings(); // backend-only: no UI re-render needed
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
    this.plugin.saveSettings(); // backend-only: no UI re-render needed
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
    this.plugin.saveSettings(); // backend-only: no UI re-render needed
  });

  // ── Guidelines injection mode toggle ──────────────────────────────────
  // Mirrors the shortcutsVisible pill pattern: track + thumb + text label.
  const guidesModeRow = scopeSection.createDiv({ cls: 'ai-settings-row' });
  guidesModeRow.style.marginTop = '20px';
  guidesModeRow.style.paddingTop = '16px';
  guidesModeRow.style.borderTop = '1px solid var(--background-modifier-border)';

  // Top line: label + pill toggle
  const guidesTopLine = guidesModeRow.createDiv();
  guidesTopLine.style.display        = 'flex';
  guidesTopLine.style.justifyContent = 'space-between';
  guidesTopLine.style.alignItems     = 'center';

  guidesTopLine.createEl('label', { text: 'Guidelines injection' }).style.fontWeight = '600';

  // Pill: 'Always' (true/on) ↔ 'On demand' (false/off)
  const _guidesModeIsAlways = (this.plugin.settings.fileOpsGuidelinesMode || 'on-demand') === 'always';

  const guidesPill = guidesTopLine.createDiv({ cls: 'ai-shortcut-vis-pill' });
  guidesPill.style.display    = 'flex';
  guidesPill.style.alignItems = 'center';
  guidesPill.style.gap        = '6px';
  guidesPill.style.cursor     = 'pointer';
  guidesPill.style.userSelect = 'none';
  guidesPill.title            = 'Choose when file-operation guidelines are sent to the AI';

  const guidesLabel = guidesPill.createSpan();
  guidesLabel.style.fontSize = '12px';

  const guidesTrack = guidesPill.createDiv({ cls: 'ai-toggle-track' });
  guidesTrack.style.width        = '34px';
  guidesTrack.style.height       = '18px';
  guidesTrack.style.borderRadius = '9px';
  guidesTrack.style.position     = 'relative';
  guidesTrack.style.transition   = 'background 0.2s';
  guidesTrack.style.flexShrink   = '0';

  const guidesThumb = guidesTrack.createDiv({ cls: 'ai-toggle-thumb' });
  guidesThumb.style.position     = 'absolute';
  guidesThumb.style.top          = '2px';
  guidesThumb.style.width        = '14px';
  guidesThumb.style.height       = '14px';
  guidesThumb.style.borderRadius = '50%';
  guidesThumb.style.background   = '#fff';
  guidesThumb.style.transition   = 'left 0.2s';
  guidesThumb.style.boxShadow    = '0 1px 3px rgba(0,0,0,0.3)';

  const applyGuidesModeState = (isAlways) => {
    guidesTrack.style.background = isAlways
      ? 'var(--interactive-accent)'
      : 'var(--background-modifier-border)';
    guidesThumb.style.left      = isAlways ? '18px' : '2px';
    guidesLabel.textContent     = isAlways ? 'Always' : 'On demand';
    guidesLabel.style.color     = isAlways
      ? 'var(--interactive-accent)'
      : 'var(--text-muted)';
  };

  applyGuidesModeState(_guidesModeIsAlways);

  guidesPill.addEventListener('click', async () => {
    const current = (this.plugin.settings.fileOpsGuidelinesMode || 'on-demand') === 'always';
    this.plugin.settings.fileOpsGuidelinesMode = current ? 'on-demand' : 'always';
    applyGuidesModeState(!current);
    await this.plugin.saveSettings();
  });

  // Description shown below the toggle
  const guidesHint = guidesModeRow.createEl('p');
  guidesHint.style.fontSize    = '12px';
  guidesHint.style.color       = 'var(--text-muted)';
  guidesHint.style.marginTop   = '8px';
  guidesHint.style.marginBottom = '0';
  guidesHint.textContent = [
    'Always — file-operation guidelines (scope rules, syntax, file handling principles) are prepended to',
    'every message. Zero extra latency; higher token cost per turn.',
    '\n',
    'On demand — a classifier instruction is embedded in the first message of each session.',
    'The AI tags every reply with NEED_FILE_OPS or NO_FILE_OPS (hidden in an HTML comment)',
    'so guidelines are injected only when needed — with zero extra network requests.',
    'Keeps context lean on conversational turns at the cost of one small round-trip.'
  ].join(' ');

  // ---- File handling principles section ----
  const principlesSection = container.createDiv({ cls: 'ai-settings-section' });
  principlesSection.style.background = 'var(--background-secondary)';
  principlesSection.style.borderRadius = '8px';
  principlesSection.style.padding = '20px';
  principlesSection.style.marginBottom = '20px';
  principlesSection.style.border = '1px solid var(--background-modifier-border)';

  const principlesH3 = principlesSection.createEl('h3');
  principlesH3.style.display = 'flex';
  principlesH3.style.alignItems = 'center';
  const principlesIcon = principlesH3.createSpan();
  setIcon(principlesIcon, 'file-cog');
  principlesIcon.style.marginRight = '8px';
  principlesH3.appendChild(document.createTextNode('File handling principles'));

  const principlesHint = principlesSection.createEl('p');
  principlesHint.style.fontSize = '13px';
  principlesHint.style.color = 'var(--text-muted)';
  principlesHint.style.marginTop = '0';
  principlesHint.textContent = 'Read by the AI before any file operation. Use it to describe how you want files created, named, organized, and handled.';

  const principlesTextarea = principlesSection.createEl('textarea', {
    text: this.plugin.settings.fileHandlingPrinciples?.trim() ? this.plugin.settings.fileHandlingPrinciples : DEFAULT_FILE_HANDLING_PRINCIPLES,
    rows: 10
  });
  principlesTextarea.style.width = '100%';
  principlesTextarea.style.padding = '10px 14px';
  principlesTextarea.style.marginTop = '6px';
  principlesTextarea.style.borderRadius = '8px';
  principlesTextarea.style.border = '1px solid var(--background-modifier-border)';
  principlesTextarea.style.backgroundColor = 'var(--background-primary)';
  principlesTextarea.style.color = 'var(--text-normal)';
  principlesTextarea.style.fontSize = '13px';
  principlesTextarea.style.fontFamily = 'monospace';
  principlesTextarea.style.boxSizing = 'border-box';
  principlesTextarea.addEventListener('change', (e) => {
    this.plugin.settings.fileHandlingPrinciples = e.target.value;
    this.plugin.saveSettings();
  });

  this._createReviewCard(container);
  this._createPermissionsSection(container, 'file');
},

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
  this.createToggleButton(section, 'Enable auto-naming of conversations', 'autoNameConversations', this.plugin.settings.autoNameConversations, true);
  
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
    syncModelField();
  });

  // Model Input Field — hidden when provider is 'default' (active provider owns the model)
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

  const modelHint = modelWrap.createEl('div', { text: "Leave empty to use the provider's configured model." });
  modelHint.style.fontSize = '11px';
  modelHint.style.color = 'var(--text-muted)';
  modelHint.style.marginTop = '5px';

  // Dynamic Placeholder + value updates — keyed per provider
  const PROVIDER_DEFAULTS = {
    local:     this.plugin.settings.localModel || 'llama2',
    openai:    this.plugin.settings.openaiModel || 'gpt-3.5-turbo',
    gemini:    this.plugin.settings.geminiModel || 'gemini-1.5-flash',
    anthropic: this.plugin.settings.anthropicModel || 'claude-3-haiku-20240307',
    custom:    '(your custom model name)',
  };

  const syncModelField = () => {
    const selectedProvider = providerSelect.value;
    const isDefault = selectedProvider === 'default';
    // Hide the entire model row when 'default' is chosen — no override makes sense there
    modelWrap.style.display = isDefault ? 'none' : '';
    if (!isDefault) {
      modelInput.value = (this.plugin.settings.namingModels || {})[selectedProvider] || '';
      modelInput.placeholder = PROVIDER_DEFAULTS[selectedProvider] || '(provider default)';
    }
  };

  modelInput.addEventListener('input', async () => {
    const selectedProvider = providerSelect.value;
    if (selectedProvider === 'default') return; // safety guard
    if (!this.plugin.settings.namingModels) this.plugin.settings.namingModels = {};
    this.plugin.settings.namingModels[selectedProvider] = modelInput.value;
    if (typeof this.plugin.saveSettings === 'function') await this.plugin.saveSettings();
  });

  providerSelect.addEventListener('change', syncModelField);
  syncModelField();

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
      
      // Only apply a model override when a specific (non-default) provider is chosen.
      if (chosenProvider !== 'default') {
        const overrideModel = ((this.plugin.settings.namingModels || {})[targetProviderKey] || '').trim();
        if (overrideModel) sendOptions.model = overrideModel;
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
},

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

this._createConversationOptions(container);
},

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
},

refreshChatViews() {
  // Delegate to the plugin-wide refresher so BOTH the sidebar (VIEW_TYPE)
  // and the dedicated main-area chat page (VIEW_TYPE_CHAT_PAGE) are kept
  // in sync — previously this only touched the sidebar, which is why
  // changes made from Settings never showed up on the main chat page.
  this.plugin.refreshChatViews();
},

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
    this.plugin.applyImageCapabilityDefaults(providerKey);
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

  (this._imgRefreshers = this._imgRefreshers || {})[providerKey] = imgBtnInner;

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
        this.plugin.saveSettings(); // backend-only: no UI re-render needed
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

  // ── Streaming toggle button ─────────────────────────────────────────────
  const streamBtn = row.createEl('button', { cls: 'ai-stream-toggle-btn' });
  streamBtn.title = 'Toggle streaming for this provider';

  const renderStreamBtn = () => {
    streamBtn.empty();
    if (!this.plugin.settings.streamingEnabled) this.plugin.settings.streamingEnabled = {};
    const isEnabled = this.plugin.settings.streamingEnabled[providerKey] !== false; // default on

    const iconSpan = streamBtn.createSpan();
    setIcon(iconSpan, 'activity');
    iconSpan.style.display      = 'inline-flex';
    iconSpan.style.verticalAlign = 'middle';
    iconSpan.style.marginRight  = '5px';

    const label = streamBtn.createSpan();
    label.textContent        = 'Stream';
    label.style.verticalAlign = 'middle';
    label.style.fontSize     = '13px';
    label.style.fontWeight   = '600';

    streamBtn.style.borderColor = isEnabled
      ? 'var(--interactive-accent)'
      : 'var(--background-modifier-border)';
    streamBtn.style.color = isEnabled
      ? 'var(--interactive-accent)'
      : 'var(--text-muted)';
    streamBtn.title = isEnabled
      ? 'Streaming ON — click to disable'
      : 'Streaming OFF — click to enable';
  };

  streamBtn.style.padding      = '10px 12px';
  streamBtn.style.borderRadius = '8px';
  streamBtn.style.border       = '1px solid var(--background-modifier-border)';
  streamBtn.style.background   = 'var(--background-secondary)';
  streamBtn.style.cursor       = 'pointer';
  streamBtn.style.display      = 'flex';
  streamBtn.style.alignItems   = 'center';
  streamBtn.style.flexShrink   = '0';
  renderStreamBtn();

  streamBtn.addEventListener('click', () => {
    if (!this.plugin.settings.streamingEnabled) this.plugin.settings.streamingEnabled = {};
    const current = this.plugin.settings.streamingEnabled[providerKey] !== false;
    this.plugin.settings.streamingEnabled[providerKey] = !current;
    this.plugin.saveSettings(); // backend-only: no UI re-render needed
    renderStreamBtn();
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
},

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
},

createModelField(container, label, key, placeholder, providerId, triggerInputs = []) {
  const input = this.createInputField(container, label, key, this.plugin.settings[key] ?? '', 'text', placeholder);
  const row = input.parentElement;
  row.style.position = 'relative';
  input.setAttribute('autocomplete', 'off');

  // Model changed → apply the catalog's image defaults (only ever switches things on)
  const applyImageDefaults = () => {
    if (this.plugin.applyImageCapabilityDefaults(providerId)) this._imgRefreshers?.[providerId]?.();
  };
  input.addEventListener('change', applyImageDefaults);

  this.plugin._modelCache = this.plugin._modelCache || {};
  const getModels = () => this.plugin._modelCache[providerId] || [];

  // ── Suggestion panel ────────────────────────────────────────────────
  const panel = row.createDiv({ cls: 'ai-model-suggestions' });
  panel.style.display         = 'none';
  panel.style.position        = 'absolute';
  panel.style.left            = '0';
  panel.style.right           = '0';
  panel.style.zIndex          = '50';
  panel.style.maxHeight       = '240px';
  panel.style.overflowY       = 'auto';
  panel.style.background      = 'var(--background-primary)';
  panel.style.border          = '1px solid var(--background-modifier-border)';
  panel.style.borderRadius    = '8px';
  panel.style.padding         = '6px';
  panel.style.boxShadow       = '0 6px 20px rgba(0,0,0,0.2)';
  panel.style.boxSizing       = 'border-box';

  const hidePanel = () => { panel.style.display = 'none'; };
  const showPanel = () => {
    const models = getModels();
    const q = input.value.trim().toLowerCase();
    const exact = models.some(m => m.toLowerCase() === q);
    const list = (!q || exact) ? models : models.filter(m => m.toLowerCase().includes(q));
    panel.empty();
    if (!list.length) { hidePanel(); return; }
    panel.style.top = (input.offsetTop + input.offsetHeight + 2) + 'px';
    list.forEach(m => {
      const item = panel.createDiv();
      item.createSpan({ text: m });
      const friendly = this.plugin.modelCatalog.nameFor(providerId, m);
      if (friendly) {
        const nm = item.createSpan({ text: `  ·  ${friendly}` });
        nm.style.color = 'var(--text-muted)';
        nm.style.fontWeight = '400';
      }
      item.style.padding = '8px 10px';
      item.style.borderRadius = '5px';
      item.style.cursor = 'pointer';
      item.style.fontSize = '13px';
      item.style.color = 'var(--text-normal)';
      item.style.transition = 'background 0.1s';
      if (m === input.value) { item.style.color = 'var(--text-accent)'; item.style.fontWeight = '600'; }
      item.addEventListener('mouseenter', () => { item.style.background = 'var(--background-secondary)'; });
      item.addEventListener('mouseleave', () => { item.style.background = 'transparent'; });
      item.addEventListener('mousedown', (e) => {
        e.preventDefault();
        input.value = m;
        input.dispatchEvent(new Event('change'));
        hidePanel();
      });
    });
    panel.style.display = 'block';
  };

  input.addEventListener('focus', showPanel);
  input.addEventListener('input', showPanel);
  input.addEventListener('blur',  () => setTimeout(hidePanel, 120));

  // ── Status line + manual refresh ────────────────────────────────────
  const bar = row.createDiv();
  bar.style.display    = 'flex';
  bar.style.alignItems = 'center';
  bar.style.gap        = '10px';
  bar.style.marginTop  = '6px';

  const refreshBtn = bar.createEl('button', { text: '↻ Fetch available models' });
  refreshBtn.style.fontSize = '12px';
  refreshBtn.style.padding  = '4px 10px';
  refreshBtn.style.cursor   = 'pointer';

  const status = bar.createSpan();
  status.style.fontSize = '12px';
  status.style.color    = 'var(--text-muted)';

  const setStatus = (text, isError = false) => {
    status.textContent = text;
    status.style.color = isError ? 'var(--text-error)' : 'var(--text-muted)';
  };

  let token = 0;
  let renderReasoning = () => {};
  const load = async (manual) => {
    const myToken = ++token;
    refreshBtn.disabled = true;
    setStatus('Fetching models…');
    try {
      const cat = this.plugin.modelCatalog;
      const sig = ModelCatalog.signature(providerId, this.plugin.settings);

      // 1) Use the on-disk cache unless the user explicitly refreshed
      let models = manual ? null : await cat.getAvailable(providerId, sig);
      let fromCache = !!models;

      // 2) Otherwise ask the provider and remember the answer — a failed attempt is remembered
      //    too, so opening Settings again does not repeat it (the Fetch button always does)
      if (!models) {
        if (!manual) {
          const failure = await cat.recentFailure(providerId, sig);
          if (failure) {
            if (myToken === token) setStatus(`⚠ ${failure.message} — press “Fetch available models” to try again`, true);
            return;
          }
        }
        try {
          models = await ModelLister.list(providerId, this.plugin);
        } catch (err) {
          const m = err?.message || String(err);
          if (!/first/i.test(m)) await cat.rememberFailure(providerId, sig, m);   // "enter the key first" never reached the network
          const kept = await cat.getAvailable(providerId, sig);
          if (kept && myToken === token) this.plugin._modelCache[providerId] = kept;
          throw err;
        }
        await cat.clearFailure(providerId);
        await cat.setAvailable(providerId, sig, models);
      }
      if (myToken !== token) return;

      // 3) Model metadata (names, reasoning options) — only for providers the catalog covers,
      //    and only downloaded when stale (see the back-off in ensureCatalog)
      if (CATALOG_PROVIDER_SLUGS[providerId]) await cat.ensureCatalog({ force: manual && !fromCache });
      if (myToken !== token) return;

      this.plugin._modelCache[providerId] = models;
      setStatus(models.length
        ? `✓ ${models.length} models available${fromCache ? ' (cached)' : ''} — click the field to choose`
        : 'No models were returned for this key');
      renderReasoning();
      applyImageDefaults();
      if (document.activeElement === input) showPanel();
    } catch (e) {
      if (myToken !== token) return;
      const msg = e?.message || String(e);
      // Quietly hint when auto-loading without a key; show real errors otherwise
      setStatus(manual || !/first/i.test(msg) ? `⚠ ${msg}` : msg, manual || !/first/i.test(msg));
    } finally {
      if (myToken === token) refreshBtn.disabled = false;
    }
  };

  refreshBtn.addEventListener('click', (e) => { e.preventDefault(); load(true); });

  // Re-fetch whenever the API key / URL fields change (their own handlers ran first)
  triggerInputs.filter(Boolean).forEach(el => el.addEventListener('change', () => {
    delete this.plugin._modelCache[providerId];
    load(false);
  }));

  // Reasoning-effort selector (only shown when the catalog lists effort levels for this model)
  renderReasoning = this.createReasoningField(container, providerId, input);

  // Initial state
  if (getModels().length) { setStatus(`✓ ${getModels().length} models available — click the field to choose`); renderReasoning(); }
  else load(false);

  return input;
},

createReasoningField(container, providerId, modelInput) {
  const DEFAULT_LABEL = 'Default (not sent — provider decides)';
  const row = container.createDiv({ cls: 'ai-settings-row' });
  row.style.marginBottom = '16px';

  row.createEl('label', { text: 'Reasoning effort:' }).style.display = 'block';

  // ── Trigger (looks like the other inputs, themed with Obsidian variables) ──
  const trigger = row.createDiv();
  trigger.setAttribute('role', 'button');
  trigger.setAttribute('tabindex', '0');
  trigger.style.display         = 'flex';
  trigger.style.alignItems      = 'center';
  trigger.style.justifyContent  = 'space-between';
  trigger.style.gap             = '10px';
  trigger.style.width           = '100%';
  trigger.style.padding         = '10px 14px';
  trigger.style.borderRadius    = '8px';
  trigger.style.border          = '1px solid var(--background-modifier-border)';
  trigger.style.background      = 'var(--background-primary)';
  trigger.style.color           = 'var(--text-normal)';
  trigger.style.fontSize        = '14px';
  trigger.style.boxSizing       = 'border-box';
  trigger.style.cursor          = 'pointer';
  trigger.style.userSelect      = 'none';
  trigger.style.transition      = 'border-color 0.15s, opacity 0.15s';

  const triggerText = trigger.createSpan();
  const chevron = trigger.createSpan();
  chevron.style.display = 'flex';
  chevron.style.color = 'var(--text-muted)';
  setIcon(chevron, 'chevron-down');

  const hint = row.createDiv();
  hint.style.fontSize  = '12px';
  hint.style.color     = 'var(--text-muted)';
  hint.style.marginTop = '4px';

  const state = { values: [], current: '' };
  let menu = null;
  let teardown = null;

  const closeMenu = () => {
    if (menu) { menu.remove(); menu = null; }
    if (teardown) { teardown(); teardown = null; }
    trigger.style.borderColor = 'var(--background-modifier-border)';
  };

  const updateTrigger = () => {
    triggerText.textContent = state.current || DEFAULT_LABEL;
    const hasChoices = state.values.length > 0;
    trigger.style.opacity = hasChoices ? '1' : '0.6';
    trigger.style.cursor  = hasChoices ? 'pointer' : 'default';
    chevron.style.visibility = hasChoices ? 'visible' : 'hidden';
  };

  const choose = async (value) => {
    state.current = value;
    this.plugin.settings.reasoningEffort = this.plugin.settings.reasoningEffort || {};
    this.plugin.settings.reasoningEffort[providerId] = value;
    updateTrigger();
    await this.plugin.saveSettings();
  };

  const openMenu = () => {
    if (menu || !state.values.length) return;
    const rect = trigger.getBoundingClientRect();

    // Same look as the plugin's other floating menus
    menu = document.body.createDiv({ cls: 'ai-reasoning-menu' });
    menu.style.position     = 'fixed';
    menu.style.zIndex       = '9999';
    menu.style.left         = `${rect.left}px`;
    menu.style.width        = `${rect.width}px`;
    menu.style.maxHeight    = '260px';
    menu.style.overflowY    = 'auto';
    menu.style.boxSizing    = 'border-box';
    menu.style.padding      = '6px';
    menu.style.background   = 'var(--background-primary)';
    menu.style.border       = '1px solid var(--background-modifier-border)';
    menu.style.borderRadius = '8px';
    menu.style.boxShadow    = '0 6px 20px rgba(0,0,0,0.2)';

    // Open upward if there isn't room below
    const below = window.innerHeight - rect.bottom;
    if (below < 220 && rect.top > below) { menu.style.bottom = `${window.innerHeight - rect.top + 6}px`; }
    else                                 { menu.style.top    = `${rect.bottom + 6}px`; }

    const addItem = (value, label) => {
      const selected = value === state.current;
      const item = menu.createDiv();
      item.style.display        = 'flex';
      item.style.alignItems     = 'center';
      item.style.justifyContent = 'space-between';
      item.style.gap            = '8px';
      item.style.padding        = '8px 10px';
      item.style.borderRadius   = '5px';
      item.style.cursor         = 'pointer';
      item.style.fontSize       = '13px';
      item.style.color          = selected ? 'var(--text-accent)' : 'var(--text-normal)';
      item.style.fontWeight     = selected ? '600' : '400';
      item.style.transition     = 'background 0.1s';
      item.createSpan({ text: label });
      if (selected) { const ck = item.createSpan(); ck.style.display = 'flex'; setIcon(ck, 'check'); }
      item.addEventListener('mouseenter', () => { item.style.background = 'var(--background-secondary)'; });
      item.addEventListener('mouseleave', () => { item.style.background = 'transparent'; });
      item.addEventListener('click', (ev) => { ev.stopPropagation(); closeMenu(); choose(value); });
    };
    addItem('', DEFAULT_LABEL);
    state.values.forEach(v => addItem(v, v));

    trigger.style.borderColor = 'var(--interactive-accent)';

    const onDocDown = (ev) => { if (!menu.contains(ev.target) && !trigger.contains(ev.target)) closeMenu(); };
    const onKey     = (ev) => { if (ev.key === 'Escape') closeMenu(); };
    const onScroll  = (ev) => { if (!menu || !menu.contains(ev.target)) closeMenu(); };
    document.addEventListener('mousedown', onDocDown, true);
    document.addEventListener('keydown', onKey, true);
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', closeMenu);
    teardown = () => {
      document.removeEventListener('mousedown', onDocDown, true);
      document.removeEventListener('keydown', onKey, true);
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', closeMenu);
    };
  };

  trigger.addEventListener('click', () => { menu ? closeMenu() : openMenu(); });
  trigger.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); menu ? closeMenu() : openMenu(); }
  });

  const render = async () => {
    const cat = this.plugin.modelCatalog;
    const hasKey = providerId === 'openai' ? !!this.plugin.settings.openaiApiKey
                 : providerId === 'anthropic' ? !!this.plugin.settings.anthropicApiKey
                 : providerId === 'gemini' ? !!this.plugin.settings.geminiApiKey : false;
    await cat.ensureCatalog({ cacheOnly: !hasKey });

    const modelId = modelInput.value.trim();
    const values = cat.effortValues(providerId, modelId);

    const settings = this.plugin.settings;
    settings.reasoningEffort = settings.reasoningEffort || {};
    let current = settings.reasoningEffort[providerId] || '';
    if (current && !values.includes(current)) {      // model changed → old level no longer valid
      current = '';
      settings.reasoningEffort[providerId] = '';
      this.plugin.saveSettings();
    }

    closeMenu();
    state.values = values;
    state.current = current;
    updateTrigger();
    hint.textContent = values.length
      ? 'Levels come from this model\'s own metadata.'
      : (modelId
          ? 'This model doesn\'t list selectable reasoning levels — the provider default is used.'
          : 'Choose a model to see its reasoning levels.');
  };

  modelInput.addEventListener('change', render);
  updateTrigger();
  render();
  return render;
},

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
    // backend-only: visibility changes only affect the shortcuts dropdown, not the chat layout
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
},

createSliderField(container, label, key, value, min, max, step) {
  const row = container.createDiv({ cls: 'ai-settings-row' });
  row.style.marginBottom = '16px';
  
  const labelRow = row.createDiv({ style: 'display: flex; justify-content: space-between;' });
  labelRow.createEl('label', { text: label });
  // Display integers without a trailing .0 when the step is a whole number
  const displayValue = (step % 1 === 0) ? String(Math.round(value)) : String(value);
  const valueSpan = labelRow.createEl('span', { text: displayValue, cls: 'ai-slider-value' });
  valueSpan.style.fontWeight = '600';
  valueSpan.style.color = 'var(--interactive-accent)';
  
  const slider = row.createEl('input', {
    type: 'range',
    value: value,
    attr: {
      min: min,
      max: max,
      step: step
    }
  });
  slider.style.width = '100%';
  slider.style.height = '6px';
  slider.style.borderRadius = '3px';
  slider.style.background = 'var(--background-modifier-border)';
  
  slider.addEventListener('input', (e) => {
    const val = parseFloat(e.target.value);
    this.plugin.settings[key] = val;
    // Show integers cleanly (no trailing .0) when the step is a whole number
    valueSpan.textContent = (step % 1 === 0) ? String(Math.round(val)) : val.toFixed(1);
  });
  
  return slider;
},

createToggleButton(container, label, key, checked, quiet = false, onChange = null) {
  const row = container.createDiv({ cls: 'ai-settings-row toggle-row' });
  row.style.display = 'flex';
  row.style.alignItems = 'center';
  row.style.justifyContent = 'space-between';
  row.style.gap = '10px';
  row.style.marginBottom = '16px';
  row.style.cursor = 'pointer';

  const labelEl = row.createEl('label', { text: label });
  labelEl.style.cursor = 'pointer';
  labelEl.style.flex = '1';

  const toggleTrack = row.createDiv({ cls: 'ai-toggle-track' });
  toggleTrack.style.width = '42px';
  toggleTrack.style.height = '22px';
  toggleTrack.style.borderRadius = '11px';
  toggleTrack.style.position = 'relative';
  toggleTrack.style.transition = 'background-color 0.2s ease';
  toggleTrack.style.flexShrink = '0';

  const toggleThumb = toggleTrack.createDiv({ cls: 'ai-toggle-thumb' });
  toggleThumb.style.width = '16px';
  toggleThumb.style.height = '16px';
  toggleThumb.style.borderRadius = '50%';
  toggleThumb.style.backgroundColor = 'var(--text-on-accent, #ffffff)';
  toggleThumb.style.position = 'absolute';
  toggleThumb.style.top = '3px';
  toggleThumb.style.transition = 'left 0.2s ease';

  const updateToggleUI = (isSwitchedOn) => {
    if (isSwitchedOn) {
      toggleTrack.style.backgroundColor = 'var(--interactive-accent)';
      toggleThumb.style.left = '23px';
    } else {
      toggleTrack.style.backgroundColor = 'var(--background-modifier-border, #4a4a4a)';
      toggleThumb.style.left = '3px';
    }
  };

  let isChecked = Boolean(this.plugin.settings[key]);
  updateToggleUI(isChecked);

  const persist = () => quiet
    ? this.plugin.saveSettings()
    : this.plugin.saveSettings();

  row.addEventListener('click', () => {
    isChecked = !isChecked;
    this.plugin.settings[key] = isChecked;
    updateToggleUI(isChecked);
    persist();
    if (onChange) onChange(isChecked);
  });

  return {
    get checked() { return isChecked; },
    set checked(val) {
      isChecked = Boolean(val);
      updateToggleUI(isChecked);
    }
  };
},

createInputPositionSelector(container) {
  const row = container.createDiv({ cls: 'ai-settings-row' });
  row.style.marginBottom  = '16px';
  row.style.background    = 'var(--background-primary)';
  row.style.display       = 'flex';
  row.style.justifyContent = 'space-between';
  row.style.alignItems     = 'center';

  // Label
  const label = row.createEl('label', { text: 'Input Field Position:' });

  // Toggle pill
  const isTop = this.plugin.settings.inputPosition === 'top';

  const pill = row.createDiv({ cls: 'ai-shortcut-vis-pill' });
  pill.style.display    = 'flex';
  pill.style.alignItems = 'center';
  pill.style.gap        = '6px';
  pill.style.cursor     = 'pointer';
  pill.style.userSelect = 'none';

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

  const applyToggleState = (topActive) => {
    track.style.background = topActive ? 'var(--interactive-accent)' : 'var(--background-modifier-border)';
    thumb.style.left       = topActive ? '18px' : '2px';
    pillLabel.textContent  = topActive ? 'Top' : 'Bottom';
    pillLabel.style.color  = topActive ? 'var(--interactive-accent)' : 'var(--text-muted)';
  };

  applyToggleState(isTop);

  pill.addEventListener('click', async () => {
    // Switch state: 'top' if currently 'bottom', and vice versa
    const newPosition = this.plugin.settings.inputPosition === 'top' ? 'bottom' : 'top';
    this.plugin.settings.inputPosition = newPosition;
    
    applyToggleState(newPosition === 'top');
    
    await this.plugin.saveSettings();

    // Rebuild every open chat view so the new layout takes effect immediately
    [...this.plugin.app.workspace.getLeavesOfType(VIEW_TYPE),
     ...this.plugin.app.workspace.getLeavesOfType(VIEW_TYPE_CHAT_PAGE)]
      .forEach(leaf => { if (leaf.view?.onOpen) leaf.view.onOpen(); });
  });
},

// ── Toggle Button settings ────────────────────────────────────────────────
/**
 * Renders the "Toggle Button" tab in the Settings panel.
 * Lets the user configure each state (label, provider, Lucide icon, default
 * model) and add or remove optional states 3–5.
 * Maximum of 5 states supported.
 */
showToggleButtonSettings(container) {
  container.empty();

  const PROVIDER_OPTIONS = [
    { key: 'local',     label: 'Local (Ollama / LM Studio)' },
    { key: 'openai',    label: 'OpenAI'                      },
    { key: 'gemini',    label: 'Gemini'                      },
    { key: 'anthropic', label: 'Claude (Anthropic)'          },
    { key: 'custom',    label: 'Custom API'                  },
  ];

  // Ordinal labels for up to 5 states
  const ORDINALS = ['① First', '② Second', '③ Third', '④ Fourth', '⑤ Fifth'];

  const inputStyle = {
    width: '100%', padding: '8px 12px', borderRadius: '6px', boxSizing: 'border-box',
    border: '1px solid var(--background-modifier-border)',
    backgroundColor: 'var(--background-secondary)', color: 'var(--text-normal)', fontSize: '14px'
  };

  const section = container.createDiv({ cls: 'ai-settings-section' });
  section.style.background   = 'var(--background-secondary)';
  section.style.borderRadius = '8px';
  section.style.padding      = '20px';
  section.style.marginBottom = '20px';
  section.style.border       = '1px solid var(--background-modifier-border)';

  // ── Header ──────────────────────────────────────────────────────────────
  const h3 = section.createEl('h3');
  h3.style.display    = 'flex';
  h3.style.alignItems = 'center';
  const h3Icon = h3.createSpan();
  setIcon(h3Icon, 'repeat');
  h3Icon.style.marginRight = '8px';
  h3.appendChild(document.createTextNode('Toggle Button States'));

  // ── Per-state editor ─────────────────────────────────────────────────────
  const statesWrap = section.createDiv();

  const renderStates = () => {
    statesWrap.empty();
    const states = this.plugin.settings.toggleStates;

    states.forEach((state, idx) => {
      const isOptional = idx >= 2;                   // states 0 & 1 are permanent
      const isActive   = (this.plugin.settings.toggleStateIndex ?? 0) === idx;

      const card = statesWrap.createDiv({ cls: 'ai-toggle-state-card' });
      card.style.border       = '1px solid var(--background-modifier-border)';
      card.style.borderRadius = '8px';
      card.style.padding      = '14px 16px';
      card.style.marginBottom = '14px';
      card.style.background   = 'var(--background-primary)';

      // ── Card header ──────────────────────────────────────────────────────
      const cardHeader = card.createDiv();
      cardHeader.style.display        = 'flex';
      cardHeader.style.alignItems     = 'center';
      cardHeader.style.justifyContent = 'space-between';
      cardHeader.style.marginBottom   = '12px';

      const stateTitle = cardHeader.createEl('strong', {
        text: `${ORDINALS[idx] ?? `State ${idx + 1}`} state${isOptional ? ' (optional)' : ''}`
      });
      stateTitle.style.fontSize = '14px';

      if (isActive) {
        const badge = cardHeader.createEl('span', { text: 'Active' });
        badge.style.fontSize     = '11px';
        badge.style.padding      = '2px 8px';
        badge.style.borderRadius = '10px';
        badge.style.background   = 'var(--interactive-accent)';
        badge.style.color        = 'var(--text-on-accent)';
        badge.style.fontWeight   = '600';
      }

      // ── Label ────────────────────────────────────────────────────────────
      const labelRow = card.createDiv({ cls: 'ai-settings-row' });
      labelRow.style.marginBottom = '10px';
      labelRow.createEl('label', { text: 'Label (shown in notice on switch):' }).style.display = 'block';
      const labelInput = labelRow.createEl('input', {
        type: 'text', value: state.label ?? '',
        placeholder: 'e.g. Local, GPT-4o, Fast Cloud …'
      });
      Object.assign(labelInput.style, inputStyle);
      labelInput.addEventListener('change', async (e) => {
        this.plugin.settings.toggleStates[idx].label = e.target.value;
        await this.plugin.saveSettings();
        renderStates();
      });

      // ── Provider selector ─────────────────────────────────────────────────
      const provRow = card.createDiv({ cls: 'ai-settings-row' });
      provRow.style.marginBottom = '10px';
      provRow.createEl('label', { text: 'Provider to activate:' }).style.display = 'block';
      const provSelect = provRow.createEl('select');
      Object.assign(provSelect.style, inputStyle);
      PROVIDER_OPTIONS.forEach(opt => {
        const o = provSelect.createEl('option', { text: opt.label, value: opt.key });
        if (opt.key === (state.providerKey ?? 'local')) o.selected = true;
      });
      provSelect.addEventListener('change', async (e) => {
        this.plugin.settings.toggleStates[idx].providerKey = e.target.value;
        await this.plugin.saveSettings();
      });

      // ── Lucide icon name ──────────────────────────────────────────────────
      const iconRow = card.createDiv({ cls: 'ai-settings-row' });
      iconRow.style.marginBottom = '4px';
      const iconLabel = iconRow.createEl('label');
      iconLabel.style.display = 'block';
      iconLabel.appendChild(document.createTextNode('Button icon '));
      const iconLink = iconLabel.createEl('a', { text: '(browse Lucide icons ↗)', href: 'https://lucide.dev/icons' });
      iconLink.style.fontSize = '12px';
      iconLink.style.color    = 'var(--text-accent)';
      const iconInput = iconRow.createEl('input', {
        type: 'text', value: state.obsidianIcon ?? '',
        placeholder: 'e.g. monitor-speaker, server, cpu, sparkles, brain …'
      });
      Object.assign(iconInput.style, inputStyle);

      // Live icon preview
      const previewWrap = iconRow.createDiv();
      previewWrap.style.display    = 'flex';
      previewWrap.style.alignItems = 'center';
      previewWrap.style.gap        = '6px';
      previewWrap.style.marginTop  = '6px';
      const previewLabel = previewWrap.createEl('span', { text: 'Preview:' });
      previewLabel.style.fontSize = '12px';
      previewLabel.style.color    = 'var(--text-muted)';
      const previewIcon = previewWrap.createDiv();
      previewIcon.style.width      = '18px';
      previewIcon.style.height     = '18px';
      previewIcon.style.display    = 'flex';
      previewIcon.style.alignItems = 'center';
      const refreshPreview = (name) => {
        previewIcon.empty();
        try { setIcon(previewIcon, name || 'cpu'); } catch { /* unknown icon — ignore */ }
      };
      refreshPreview(state.obsidianIcon);
      iconInput.addEventListener('input',  (e) => refreshPreview(e.target.value));
      iconInput.addEventListener('change', async (e) => {
        this.plugin.settings.toggleStates[idx].obsidianIcon = e.target.value;
        await this.plugin.saveSettings();
      });

      // ── Remove button (optional states 2–4 only) ──────────────────────────
      if (isOptional) {
        const removeBtnWrap = card.createDiv();
        removeBtnWrap.style.marginTop  = '12px';
        removeBtnWrap.style.textAlign  = 'right';
        const removeBtn = removeBtnWrap.createEl('button', {
          text: `✕ Remove ${ORDINALS[idx]?.toLowerCase() ?? `state ${idx + 1}`} state`
        });
        removeBtn.style.padding      = '6px 14px';
        removeBtn.style.borderRadius = '6px';
        removeBtn.style.border       = '1px solid var(--text-error)';
        removeBtn.style.background   = 'rgba(var(--background-modifier-error-rgb),0.1)';
        removeBtn.style.color        = 'var(--text-error)';
        removeBtn.style.cursor       = 'pointer';
        removeBtn.style.fontSize     = '13px';
        removeBtn.addEventListener('click', async () => {
          this.plugin.settings.toggleStates.splice(idx, 1);
          // If the active state was at or beyond this index, clamp to 0
          if ((this.plugin.settings.toggleStateIndex ?? 0) >= this.plugin.settings.toggleStates.length) {
            this.plugin.settings.toggleStateIndex = 0;
          }
          await this.plugin.saveSettings();
          renderStates();
        });
      }
    }); // end states.forEach

    // ── Add state button (shown while fewer than 5 states exist) ────────────
    if (states.length < 5) {
      const addWrap = statesWrap.createDiv();
      addWrap.style.textAlign = 'center';
      addWrap.style.marginTop = '4px';
      const nextOrdinal = ORDINALS[states.length]?.split(' ')[1]?.toLowerCase() ?? `${states.length + 1}th`;
      const addBtn = addWrap.createEl('button', { text: `+ Add ${nextOrdinal} state` });
      addBtn.style.padding      = '8px 20px';
      addBtn.style.borderRadius = '8px';
      addBtn.style.border       = '1px solid var(--interactive-accent)';
      addBtn.style.background   = 'transparent';
      addBtn.style.color        = 'var(--interactive-accent)';
      addBtn.style.cursor       = 'pointer';
      addBtn.style.fontSize     = '14px';
      addBtn.style.fontWeight   = '600';
      addBtn.addEventListener('click', async () => {
        this.plugin.settings.toggleStates.push({
          label: 'Custom', providerKey: 'openai', obsidianIcon: 'cpu'
        });
        await this.plugin.saveSettings();
        renderStates();
      });
    }
  }; // end renderStates

  renderStates();
},

}; // end SettingsMixin

class SettingsModal extends Modal {
  constructor(app, plugin) {
    super(app);
    this.plugin = plugin;
    Object.assign(this, SettingsMixin);
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
    this.buildSettingsUI(contentEl, { scrollable: true });
  }

  onClose() {
    this.contentEl.empty();
  }
}

// ==================== AI CODE BLOCK PROCESSOR ====================

class AICodeBlockProcessor {
  constructor(plugin) {
    this.plugin = plugin;
    this.activeBlocks = new Map(); // Track active code blocks by stable ID

    // Guards against re-attempting a stable-id injection (or a config write)
    // multiple times concurrently for the same block, and against retry-storms
    // if a write keeps failing (e.g. read-only vault).
    this._idInjectionInFlight = new Set();
    this._idInjectionFailed = new Set();
  }

  // ==================== CONFIG KEY ALIASES ====================

  // Maps every accepted spelling of a config key to the canonical config
  // field it should populate. This is what lets `env:`, `mode:`, `type:` and
  // `environment:` all mean the same thing, etc. Matching against this map
  // always happens against an already-lower-cased, whitespace-collapsed key
  // (see parseConfig), so lookups here are inherently case-insensitive —
  // `Environment:`, `ENV:` and `env:` all resolve the same way.
  static KEY_ALIASES = {
    'environment': 'environment', 'env': 'environment', 'mode': 'environment', 'type': 'environment',

    'moving': 'moving', 'mov': 'moving', 'navigation': 'moving', 'nav': 'moving', 'arrows': 'moving',

    'caching': 'caching', 'cache': 'caching', 'store': 'caching', 'storage': 'caching',

    'system prompt': 'systemPrompt', 'system': 'systemPrompt', 'prompt': 'systemPrompt', 'sys': 'systemPrompt',

    'ask is empty': 'emptyPlaceholder', 'placeholder': 'emptyPlaceholder', 'empty': 'emptyPlaceholder', 'hint': 'emptyPlaceholder',

    'memory': 'memory', 'mem': 'memory', 'history': 'memory', 'ctx': 'memory',

    'repeating': 'repeating', 'repeat': 'repeating', 'loops': 'repeating', 'loop': 'repeating',

    'model': 'model', 'modal': 'model', 'prvider': 'model',
    'display': 'display','view': 'display',

    // The permanent block identifier (see _ensureStableId). Users can also
    // set this by hand if they want to intentionally share/rename an id.
    'id': 'id', 'block id': 'id', 'uuid': 'id'
  };

  // ==================== ENTRY POINT ====================

  process(source, el, ctx) {
    const config = this.parseConfig(source);
    config._sourcePath = ctx.sourcePath;

    // A position-derived id is unstable (it changes whenever text is added
    // or removed above the block), but it's the only thing we can compute
    // before a permanent id has been assigned, and it doubles as the key
    // under which pre-existing blocks may have their cache saved from
    // before this id system existed.
    const sectionInfo = ctx.getSectionInfo(el);
    const lineStart = sectionInfo ? sectionInfo.lineStart : 0;
    const legacyBlockId = `ai-block-${ctx.sourcePath}:${lineStart}`;
    config._legacyBlockId = legacyBlockId;

    let blockId;
    if (config.id) {
      blockId = `ai-block-${config.id}`;
      // A permanent id just took effect for this block (e.g. this is the
      // render right after injection completed). Drop the now-superseded
      // legacy-keyed entry so it doesn't linger in the map forever.
      if (blockId !== legacyBlockId) {
        this.activeBlocks.delete(legacyBlockId);
      }
    } else {
      blockId = legacyBlockId;
      // Fire-and-forget: try to permanently stamp this block with a real id
      // so future renders never again depend on its line position. Errors
      // are handled internally; this never throws and never blocks the
      // current render.
      this._ensureStableId(ctx, el);
    }

    const container = el.createDiv({ cls: 'ai-codeblock-container' });
    container.setAttribute('data-block-id', blockId);

    const cache = this.initializeCache(config, blockId);

    // Preserve in-session UI state (which turn is being viewed, whether a
    // request is in flight, any not-yet-persisted Flow-mode turn) across a
    // re-render that WE triggered ourselves (id injection, inline cache
    // save) instead of snapping back to a blank slate.
    const existing = this.activeBlocks.get(blockId);

    this.activeBlocks.set(blockId, {
      id: blockId,
      config,
      cache,
      currentLoop: existing ? existing.currentLoop : this.getCurrentLoopFromCache(cache, config),
      isLoading: existing ? existing.isLoading : false,
      _pendingFlow: existing ? existing._pendingFlow : null,
      ctx,
      container,
      el,
      source
    });

    this.renderBlock(blockId);
    return blockId;
  }

  /**
   * Generates a short random id and writes `id: <value>` into the code
   * block's own source so the block can be identified independently of
   * where it sits in the file. Safe to call repeatedly: an in-flight guard
   * prevents duplicate concurrent writes, and a failure is remembered so we
   * don't retry forever against e.g. a read-only vault.
   */
  async _ensureStableId(ctx, el) {
    if (!ctx.sourcePath) return;

    const sectionInfo = ctx.getSectionInfo(el);
    if (!sectionInfo) return; // Can't safely locate the block right now.

    const guardKey = `${ctx.sourcePath}::${sectionInfo.lineStart}`;
    if (this._idInjectionInFlight.has(guardKey) || this._idInjectionFailed.has(guardKey)) return;
    this._idInjectionInFlight.add(guardKey);

    try {
      const file = this.plugin.app.vault.getAbstractFileByPath(ctx.sourcePath);
      if (!file) return;

      const content = await this.plugin.app.vault.read(file);
      const lines = content.split('\n');
      const { lineStart, lineEnd } = sectionInfo;
      const blockLines = lines.slice(lineStart + 1, lineEnd);

      // Someone else (another in-flight call, or the user) may have already
      // added an id while we were reading the file — bail out rather than
      // adding a second one.
      if (blockLines.some(line => /^\s*(?:id|block id|uuid)\s*:/i.test(line))) return;

      const newId = this._generateId();
      const updatedBlockLines = [`id: ${newId}`, ...blockLines];
      const newLines = [
        ...lines.slice(0, lineStart + 1),
        ...updatedBlockLines,
        ...lines.slice(lineEnd)
      ];

      await this.plugin.app.vault.modify(file, newLines.join('\n'));
      // Obsidian will re-invoke this processor with the updated source;
      // config.id will be set on that render and this method won't be
      // called again for this block.
    } catch (e) {
      console.error('[AI Assistant] Failed to assign a stable block id:', e);
      this._idInjectionFailed.add(guardKey);
    } finally {
      this._idInjectionInFlight.delete(guardKey);
    }
  }

  _generateId() {
    // crypto.randomUUID() output is already lowercase hex, which keeps it
    // consistent with the lowercase-normalized ids users can type by hand
    // (see parseConfig's 'id' case).
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
      return crypto.randomUUID().replace(/-/g, '').slice(0, 12);
    }
    return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`.toLowerCase();
  }

  // ==================== CONFIG PARSING ====================

  parseConfig(source) {
    const config = {
      environment: 'Simple',
      systemPrompt: '',
      model: '',
      memory: 'All',
      moving: 'Arrows',
      repeating: 'loop',
      caching: 'Plugin Data',
      emptyPlaceholder: 'Ask...',
      display: 'auto',   // 'auto' | 'fix Npx'
      id: '',
      cachedData: {}
    };

    // Cached data is written as a JSON blob that may legitimately span many
    // lines (pretty-printed or just long). Extract it with a balanced-brace
    // scan rather than a single-line regex so it never breaks or bleeds into
    // the surrounding config.
    const { json: cachedJson, raw: cachedRaw } = this._extractCachedDataBlock(source);
    if (cachedJson) {
      config.cachedData = this._safeParseJson(cachedJson);
    }

    // Remove the ENTIRE cached-data block (marker + however many lines its
    // JSON body spans) before splitting into lines for key/value parsing.
    // Filtering only lines that literally start with "cached data:" (the
    // old approach) left every other line of a multi-line JSON body in
    // place, where they'd get misread as config keys.
    const sourceWithoutCache = cachedRaw ? source.replace(cachedRaw, '') : source;
    const lines = sourceWithoutCache.split('\n').map(l => l.trim()).filter(Boolean);

    lines.forEach(line => {
      const colonIndex = line.indexOf(':');
      if (colonIndex === -1) return;

      // Both the key AND its casing are normalized here (lower-cased,
      // internal whitespace collapsed) before the alias lookup, so
      // "Environment:", "ENV:" and "  env  :" all resolve identically.
      const rawKey = line.substring(0, colonIndex).trim().toLowerCase().replace(/\s+/g, ' ');
      const value = line.substring(colonIndex + 1).trim();
      const canonicalKey = AICodeBlockProcessor.KEY_ALIASES[rawKey];
      if (!canonicalKey || !value) return;

      switch (canonicalKey) {
        case 'environment': config.environment = value ?? config.environment; break;
        case 'systemPrompt': config.systemPrompt = value ?? config.systemPrompt; break;
        case 'model': config.model = this.parseModel(value) ?? config.model; break;
        case 'repeating': config.repeating = this.parseRepeating(value) ?? config.repeating; break;
        case 'moving': config.moving = this.parseMoving(value) ?? config.moving; break;
        case 'memory': config.memory = this.parseMemory(value) ?? config.memory; break;
        case 'caching': config.caching = this.parseCaching(value) ?? config.caching; break;
        case 'emptyPlaceholder': config.emptyPlaceholder = value ?? config.emptyPlaceholder; break;
        case 'display': config.display = this.parseDisplay(value) ?? config.display; break;
        // Normalized to lowercase so a typo'd-case id (e.g. "MyId" vs
        // "myid") still resolves to the same block instead of silently
        // forking into two unrelated blocks/caches.
        case 'id': config.id = value.replace(/\s+/g, '').toLowerCase(); break;
      }
    });

    return config;
  }

  /**
   * Finds a `cached data:` marker and extracts the JSON object that follows
   * it using a balanced-brace scan (respecting quoted strings), so the JSON
   * may safely span multiple lines and contain braces inside string values.
   * Returns { json, raw } where `raw` is the full matched text (marker +
   * JSON) as it appears in `source`, or { json: null, raw: null } if no
   * cached data block is present.
   */
  _extractCachedDataBlock(source) {
    const markerRe = /^[ \t]*cached data:[ \t]*/im;
    const markerMatch = markerRe.exec(source);
    if (!markerMatch) return { json: null, raw: null };

    const afterMarker = source.slice(markerMatch.index + markerMatch[0].length);
    const braceStart = afterMarker.indexOf('{');
    if (braceStart === -1) return { json: null, raw: null };

    let depth = 0, inString = false, escape = false, endIdx = -1;
    for (let i = braceStart; i < afterMarker.length; i++) {
      const ch = afterMarker[i];
      if (inString) {
        if (escape) escape = false;
        else if (ch === '\\') escape = true;
        else if (ch === '"') inString = false;
        continue;
      }
      if (ch === '"') { inString = true; continue; }
      if (ch === '{') depth++;
      else if (ch === '}') {
        depth--;
        if (depth === 0) { endIdx = i; break; }
      }
    }
    if (endIdx === -1) return { json: null, raw: null };

    const json = afterMarker.slice(braceStart, endIdx + 1);
    const raw = source.slice(markerMatch.index, markerMatch.index + markerMatch[0].length + endIdx + 1);
    return { json, raw };
  }

  _safeParseJson(jsonStr) {
    try {
      return JSON.parse(jsonStr.replace(/,(\s*[}\]])/g, '$1'));
    } catch (e) {
      try {
        const cleaned = jsonStr
          .replace(/\/\/.*$/gm, '')
          .replace(/\/\*[\s\S]*?\*\//g, '')
          .replace(/,(\s*[}\]])/g, '$1');
        return JSON.parse(cleaned);
      } catch (e2) {
        console.error('[AI Assistant] Failed to parse cached data:', e2);
        return {};
      }
    }
  }

  parseModel(value) {
    const lower = value.toLowerCase();
    if (lower.includes('local')) return 'local';
    if (lower.includes('gemini') || lower.includes('google')) return 'gemini';
    if (lower.includes('claude') || lower.includes('anthropic')) return 'anthropic';
    if (lower.includes('chatgpt') || lower.includes('openai')) return 'openai';
    if (lower.includes('custom')) return 'custom';
  }

  parseRepeating(value) {
    const lower = value.toLowerCase();
    if (lower === 'loop') return 'Loop';
    const num = parseInt(value);
    if (!isNaN(num) && num > 0) return num.toString();
  }

  parseMoving(value) {
    const lower = value.toLowerCase();
    if (lower.includes('flow')) return 'Flow';
    if (lower.includes('arrow') || lower.includes('button')) return 'Arrows'; // 'arrow'/'arrows'/'buttons' legacy + current spellings
  }

  parseMemory(value) {
    const lower = value.toLowerCase();
    if (lower === 'all') return 'All';
    const match = lower.match(/previous\s*\(?(\d+)\)?/);
    if (match) return `Previous (${match[1]})`;
  }

  parseCaching(value) {
    const lower = value.toLowerCase();
    if (lower.includes('temp')) return 'Temporary'; // temp, temporary
    if (lower.includes('code') || lower.includes('block')) return 'Code Block'; // codeblock, code block
    if (lower.includes('conversation') || lower.includes('plugin') || lower.includes('data.json') || lower.includes('storage') || lower.includes('store')) return 'Plugin Data';
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

    const match = lower.match(/^fix\s*(\d+)(px)?$/);
    if (match) {
      const px = parseInt(match[1], 10);
      if (px > 0) return `${px}px`;
    }
  }

  /**
   * Applies the parsed Display value to a response container element.
   */
  _applyDisplayMode(el, displayValue) {
    if (!displayValue || displayValue === 'auto') {
      el.style.overflowY = 'visible';
      return;
    }
    el.style.maxHeight = displayValue;
    el.style.overflowY = 'auto';
    el.style.boxShadow = 'inset 0 -8px 8px -8px rgba(0,0,0,0.08)';
  }

  parseIOConfig(envString) {
    const match = (envString || '').match(/separate\s+(input|output)\s+(.+)/i);
    if (match) {
      return {
        type: match[1].toLowerCase(),
        // Lowercased so "separate input MyId" and "separate output myid"
        // still pair up instead of silently becoming two unrelated blocks.
        id: match[2].trim().toLowerCase()
      };
    }
    return { type: 'unknown', id: '' };
  }

  // ==================== CACHE INITIALIZATION ====================

  /**
   * Resolves the storage key persisted-cache lookups should use for a
   * "Plugin Data" cached block. Separate Input/Output blocks that share the
   * same IO id are meant to be two windows onto the *same* saved answer, so
   * they're keyed by (file, ioId) instead of by their own individual block
   * id — otherwise the input block and output block would each persist
   * their own independent copy and drift out of sync after a reload.
   */
  _pluginDataKey(config, blockId) {
    const ioConf = this.parseIOConfig(config.environment);
    if (ioConf.type !== 'unknown' && ioConf.id) {
      return `io::${config._sourcePath || ''}::${ioConf.id}`;
    }
    return blockId;
  }

  initializeCache(config, blockId) {
    if (config.caching === 'Temporary') {
      return this.createNewEmptyCache(config);
    }

    let cache = {};

    if (config.cachedData && Object.keys(config.cachedData).length > 0) {
      cache = config.cachedData;
    } else if (config.caching === 'Plugin Data') {
      const storageKey = this._pluginDataKey(config, blockId);
      const saved = this.plugin.settings.codeBlockCache?.[storageKey];
      if (saved) {
        cache = saved;
      } else {
        // One-time migration: this block may have previously been saved
        // under the old, position-derived id, before a stable id existed.
        const legacy = config._legacyBlockId && this.plugin.settings.codeBlockCache?.[config._legacyBlockId];
        if (legacy) {
          cache = legacy;
          delete this.plugin.settings.codeBlockCache[config._legacyBlockId];
          this.plugin.settings.codeBlockCache[storageKey] = legacy;
          this.plugin.saveState?.();
        }
      }
    }

    if (Object.keys(cache).length === 0) {
      cache = this.createNewEmptyCache(config);
    }

    return cache;
  }

  createNewEmptyCache(config) {
    const ioConf = this.parseIOConfig(config.environment);
    if (ioConf.type !== 'unknown') {
      return {}; // Separate IO blocks use a `cache[ioId] = {ask, res}` shape.
    }
    if (config.repeating === 'Loop') {
      return {}; // Grows dynamically as loop1, loop2, ... entries are answered.
    }
    const numLoops = parseInt(config.repeating) || 1;
    const cache = {};
    for (let i = 1; i <= numLoops; i++) {
      cache[`loop${i}`] = {};
    }
    return cache;
  }

  getCurrentLoopFromCache(cache, config) {
    const maxAnswered = this._maxAnsweredLoop(cache);
    if (config.repeating === 'Loop') {
      return maxAnswered + 1;
    }
    const numLoops = parseInt(config.repeating) || 1;
    for (let i = numLoops; i >= 1; i--) {
      if (cache[`loop${i}`]?.[`res-${i}`]) {
        return i;
      }
    }
    return 1;
  }

  /**
   * Highest `loopN` index that has any content, across BOTH fixed-count and
   * Loop (open-ended) blocks — they share the exact same `loopN: {ask-N,
   * res-N}` cache shape, so this one helper covers both instead of a
   * separate array-based structure for Loop mode.
   */
  _maxAnsweredLoop(cache) {
    let max = 0;
    Object.keys(cache).forEach(key => {
      const m = key.match(/^loop(\d+)$/);
      if (!m) return;
      const n = parseInt(m[1], 10);
      if (cache[key]?.[`ask-${n}`] || cache[key]?.[`res-${n}`]) {
        max = Math.max(max, n);
      }
    });
    return max;
  }

  // ==================== NAVIGATION (shared by Arrows + Flow) ====================

  /**
   * The navigable range for the current turn: [min, max]. For fixed
   * `repeating: N` this is always [1, N]. For `Loop` mode it's [1, answered
   * turns + 1] — the "+1" slot is where a brand new question is composed —
   * so users can never arrow/click past the end into permanently empty air.
   */
  _navBounds(block) {
    const { config, cache } = block;
    if (config.repeating === 'Loop') {
      return { min: 1, max: this._maxAnsweredLoop(cache) + 1 };
    }
    const total = parseInt(config.repeating) || 1;
    return { min: 1, max: total };
  }

  _goToLoop(block, newLoop) {
    const { min, max } = this._navBounds(block);
    const clamped = Math.min(Math.max(newLoop, min), max);
    if (clamped === block.currentLoop) return;
    block.currentLoop = clamped;
    this.renderBlock(block.id);
  }

  /** Ordered list of every answered turn, for the Flow transcript and memory context. */
  _entriesList(block) {
    const { config, cache } = block;
    const entries = [];
    const total = config.repeating === 'Loop' ? this._maxAnsweredLoop(cache) : (parseInt(config.repeating) || 1);
    for (let i = 1; i <= total; i++) {
      const ask = cache[`loop${i}`]?.[`ask-${i}`];
      const res = cache[`loop${i}`]?.[`res-${i}`];
      if (ask || res) entries.push({ id: i, ask, res });
    }
    return entries;
  }

  // ==================== TOP-LEVEL RENDER DISPATCH ====================

  renderBlock(blockId) {
    const block = this.activeBlocks.get(blockId);
    if (!block) return;

    const { container, config } = block;
    container.empty();

    const env = config.environment.toLowerCase();
    if (env.startsWith('separate')) {
      this.renderSeparateIOEnvironment(block);
    } else if (env === 'full') {
      this.renderFullEnvironment(block);
    } else {
      // 'simple' and any unrecognized environment fall back to Simple.
      this.renderSimpleEnvironment(block);
    }
  }

  // ==================== SIMPLE ENVIRONMENT ====================

  renderSimpleEnvironment(block) {
    const { container, config } = block;

    container.style.display = 'flex';
    container.style.flexDirection = 'column';
    container.style.gap = '8px';
    container.style.padding = '0';
    container.style.margin = '8px 0';
    container.style.background = 'transparent';

    const multiTurn = config.repeating !== '1';
    const isFlow = multiTurn && config.moving === 'Flow';

    if (isFlow) {
      // Flow always composes into the newest open turn — there's no
      // separate "navigate to an old turn to edit it" step, it's a
      // straight, forward-only conversation.
      block.currentLoop = this._navBounds(block).max;
      this.renderSimpleInput(block);

      const line = container.createDiv({ cls: 'ai-simple-separator' });
      line.style.borderTop = '1px solid var(--background-modifier-border)';
      line.style.margin = '4px 0';

      this.renderFlowTranscript(block, (ask) => this.handleSimpleInput(block, ask));
      return;
    }

    this.renderSimpleInput(block);

    const line = container.createDiv({ cls: 'ai-simple-separator' });
    line.style.borderTop = '1px solid var(--background-modifier-border)';
    line.style.margin = '4px 0';

    this.renderSimpleResponse(block);
  }

  renderSimpleInput(block) {
    const { container, config, currentLoop, cache, isLoading } = block;
    const multiTurn = config.repeating !== '1';
    const isFlow = multiTurn && config.moving === 'Flow';

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
    input.disabled = isLoading;
    if (isLoading) input.style.opacity = '0.6';

    // Navigation arrows — only in Arrows mode. Flow mode has no separate
    // "current turn" to navigate to; it always composes the next one.
    if (multiTurn && config.moving === 'Arrows') {
      const { prevBtn, nextBtn } = this._createArrowButtons(block, inputContainer);
      prevBtn.style.left = '8px';
      nextBtn.style.right = '48px';
    }

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
    sendBtn.style.cursor = isLoading ? 'default' : 'pointer';
    sendBtn.style.display = 'flex';
    sendBtn.style.alignItems = 'center';
    sendBtn.style.justifyContent = 'center';
    sendBtn.style.fontSize = '18px';
    sendBtn.style.padding = '0';
    sendBtn.style.zIndex = '2';
    sendBtn.style.boxShadow = '0 2px 4px rgba(0,0,0,0.2)';
    sendBtn.style.transition = 'transform 0.2s';
    sendBtn.disabled = isLoading;
    sendBtn.style.opacity = isLoading ? '0.5' : '1';

    sendBtn.addEventListener('mouseenter', () => { if (!sendBtn.disabled) sendBtn.style.transform = 'scale(1.1)'; });
    sendBtn.addEventListener('mouseleave', () => { sendBtn.style.transform = 'scale(1)'; });

    // Flow mode always starts from an empty box — the last thing you typed
    // has already moved into the transcript above by the time this renders.
    if (!isFlow) {
      const loopKey = `loop${currentLoop}`;
      if (cache[loopKey]?.[`ask-${currentLoop}`]) {
        input.value = cache[loopKey][`ask-${currentLoop}`];
      }
    }

    sendBtn.addEventListener('click', () => this.handleSimpleInput(block, input.value));
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
    {
      const loopKey = `loop${currentLoop}`;
      responseText = cache[loopKey]?.[`res-${currentLoop}`] || '';
    }

    if (responseText) {
      MarkdownRenderer.render(
        this.plugin.app,
        responseText,
        responseContainer,
        block.ctx?.sourcePath || '',
        this.plugin
      );
      applyAutoTextDirection(responseContainer, responseText);
      this._appendCodeblockCopyBtn(responseContainer, responseText);
    } else {
      responseContainer.textContent = '';
    }
  }

  // ==================== FLOW TRANSCRIPT (shared by Simple + Full) ====================

  /**
   * What `moving: Flow` actually renders: a running conversation. Each turn
   * you send moves straight into this area as a question bubble followed by
   * the AI's reply, exactly like a chat — not a separate clickable list of
   * past questions (that was the old design). The composing box stays
   * empty and ready for the next question the whole time; see
   * renderSimpleInput/renderFullInput skipping their prefill in Flow mode.
   *
   * `onRetry(ask)` is called if a turn fails and the user taps "Retry".
   */
  renderFlowTranscript(block, onRetry) {
    const { container, config } = block;
    const entries = this._entriesList(block);

    const transcript = container.createDiv({ cls: 'ai-flow-transcript' });
    transcript.style.display = 'flex';
    transcript.style.flexDirection = 'column';
    transcript.style.gap = '14px';
    transcript.style.padding = '14px';
    transcript.style.background = 'var(--background-secondary)';
    transcript.style.borderRadius = '10px';
    transcript.style.border = '1px solid var(--background-modifier-border)';
    transcript.style.position = 'relative';
    this._applyDisplayMode(transcript, config.display);

    const addTurn = (ask) => {
      const turn = transcript.createDiv({ cls: 'ai-flow-turn' });
      turn.style.display = 'flex';
      turn.style.flexDirection = 'column';
      turn.style.gap = '6px';
      turn.style.paddingBottom = '10px';
      turn.style.borderBottom = '1px solid var(--background-modifier-border)';

      const qText = turn.createDiv({ cls: 'ai-flow-question' });
      qText.style.backgroundColor = 'var(--interactive-normal)';
      qText.style.maxWidth = '50%';
      qText.style.fontSize = '13px';
      qText.style.padding = '8px 12px';
      qText.style.borderRadius = '14px';
      qText.style.wordBreak = 'break-word';
      qText.style.whiteSpace = 'pre-wrap';
      qText.textContent = ask || '';

      return turn;
    };

    if (entries.length === 0 && !block._pendingFlow) {
      const empty = transcript.createDiv({ cls: 'ai-flow-empty' });
      empty.textContent = 'Ask a question to get started.';
      empty.style.color = 'var(--text-muted)';
      empty.style.fontStyle = 'italic';
      empty.style.fontSize = '13px';
    }

    entries.forEach(entry => {
      const turn = addTurn(entry.ask);
      if (entry.res) {
        const aRow = turn.createDiv({ cls: 'ai-flow-answer-row' });
        aRow.style.fontSize = '14px';
        aRow.style.lineHeight = '1.6';
        MarkdownRenderer.render(this.plugin.app, entry.res, aRow, block.ctx?.sourcePath || '', this.plugin);
        applyAutoTextDirection(aRow, entry.res);
      }
    });

    // The turn currently in flight (or that just failed) — shown
    // optimistically the instant it's sent, before any reply exists.
    if (block._pendingFlow) {
      const turn = addTurn(block._pendingFlow.ask);
      if (block.isLoading) {
        const thinking = turn.createDiv({ cls: 'ai-flow-thinking' });
        thinking.style.color = 'var(--text-muted)';
        thinking.style.fontSize = '13px';
        thinking.innerHTML = '⏳ Thinking' + threeDots();
      } else if (block._pendingFlow.error) {
        const errRow = turn.createDiv({ cls: 'ai-flow-error-row' });
        errRow.style.display = 'flex';
        errRow.style.alignItems = 'center';
        errRow.style.gap = '8px';

        const errText = errRow.createSpan({ text: `⨉ ${block._pendingFlow.error}` });
        errText.style.color = 'var(--text-error)';
        errText.style.fontSize = '12px';

        const retryBtn = errRow.createEl('button', { text: 'Retry' });
        retryBtn.style.fontSize = '11px';
        retryBtn.style.padding = '2px 8px';
        retryBtn.style.borderRadius = '4px';
        retryBtn.style.border = '1px solid var(--background-modifier-border)';
        retryBtn.style.background = 'var(--background-primary)';
        retryBtn.style.cursor = 'pointer';
        retryBtn.addEventListener('click', () => {
          const ask = block._pendingFlow?.ask;
          block._pendingFlow = null;
          if (ask) onRetry(ask);
        });
      }
    }

    if (entries.length > 0) {
      const fullText = entries.map(e => `Q: ${e.ask}\nA: ${e.res || ''}`).join('\n\n');
      this._appendCodeblockCopyBtn(transcript, fullText);
    }
  }

  // ==================== SEPARATE IO ENVIRONMENT ====================

  renderSeparateIOEnvironment(block) {
    const { container, config } = block;

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
    const { container, config, cache, isLoading } = block;

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
    input.disabled = isLoading;
    if (isLoading) input.style.opacity = '0.6';

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
    sendBtn.style.cursor = isLoading ? 'default' : 'pointer';
    sendBtn.style.display = 'flex';
    sendBtn.style.alignItems = 'center';
    sendBtn.style.justifyContent = 'center';
    sendBtn.style.fontSize = '18px';
    sendBtn.style.padding = '0';
    sendBtn.style.zIndex = '2';
    sendBtn.style.boxShadow = '0 2px 4px rgba(0,0,0,0.2)';
    sendBtn.disabled = isLoading;
    sendBtn.style.opacity = isLoading ? '0.5' : '1';

    sendBtn.addEventListener('click', () => this.handleSeparateInput(block, ioId, input.value));
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && e.shiftKey) {
        e.preventDefault();
        this.handleSeparateInput(block, ioId, input.value);
      }
    });

    if (isLoading) {
      const loadingDiv = inputContainer.createDiv({ cls: 'ai-loading' });
      loadingDiv.style.padding = '4px 2px 0';
      loadingDiv.style.textAlign = 'left';
      loadingDiv.style.color = 'var(--text-muted)';
      loadingDiv.style.fontSize = '12px';
      loadingDiv.innerHTML = '⏳ Thinking' + threeDots();
    }
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
      MarkdownRenderer.render(
        this.plugin.app,
        cache[ioId].res,
        responseDiv,
        block.ctx?.sourcePath || '',
        this.plugin
      );
      applyAutoTextDirection(responseDiv, cache[ioId].res);
      this._appendCodeblockCopyBtn(responseDiv, cache[ioId].res);
    } else {
      responseDiv.textContent = '';
    }
  }

  /**
   * Every OTHER active block, in the SAME file, configured as a Separate
   * Output with a matching IO id. Scoping by file as well as id is what
   * stops two unrelated notes that both happen to use e.g. `myId` from
   * bleeding their answers into each other.
   */
  _ioSyncCandidates(block, ioId) {
    const out = [];
    for (const [, candidate] of this.activeBlocks) {
      if (candidate === block) continue;
      if (candidate.ctx?.sourcePath !== block.ctx?.sourcePath) continue;
      const candidateIO = this.parseIOConfig(candidate.config.environment);
      if (candidateIO.type === 'output' && candidateIO.id === ioId) out.push(candidate);
    }
    return out;
  }

  // ==================== FULL ENVIRONMENT ====================

  renderFullEnvironment(block) {
    const { container, config } = block;

    container.style.display = 'flex';
    container.style.flexDirection = 'column';
    container.style.gap = '12px';
    container.style.padding = '16px';
    container.style.border = '1px solid var(--background-modifier-border)';
    container.style.borderRadius = '8px';
    container.style.background = 'var(--background-primary)';
    container.style.margin = '8px 0';

    const multiTurn = config.repeating !== '1';
    const isFlow = multiTurn && config.moving === 'Flow';

    if (multiTurn && config.moving === 'Arrows') {
      this.renderFullNavigation(block);
    }

    if (isFlow) {
      block.currentLoop = this._navBounds(block).max;
      this.renderFullInput(block);
      this.renderFlowTranscript(block, (ask) => this.handleFullInput(block, ask));
      return;
    }

    this.renderFullInput(block);
    this.renderFullResponse(block);
  }

  renderFullNavigation(block) {
    const { container, currentLoop } = block;
    const { min, max } = this._navBounds(block);

    const navBar = container.createDiv({ cls: 'ai-nav-bar' });
    navBar.style.display = 'flex';
    navBar.style.justifyContent = 'space-between';
    navBar.style.alignItems = 'center';
    navBar.style.padding = '8px';
    navBar.style.background = 'var(--background-secondary)';
    navBar.style.borderRadius = '6px';
    navBar.style.marginBottom = '8px';

    const prevBtn = navBar.createEl('button', { text: '← Previous' });
    const counter = navBar.createSpan({ text: `Turn ${currentLoop} / ${max}` });
    const nextBtn = navBar.createEl('button', { text: 'Next →' });

    [prevBtn, nextBtn].forEach(btn => {
      btn.style.padding = '4px 12px';
      btn.style.borderRadius = '4px';
      btn.style.border = '1px solid var(--background-modifier-border)';
      btn.style.background = 'var(--background-primary)';
      btn.style.cursor = 'pointer';
    });

    prevBtn.disabled = currentLoop <= min;
    nextBtn.disabled = currentLoop >= max;
    prevBtn.style.opacity = prevBtn.disabled ? '0.4' : '1';
    nextBtn.style.opacity = nextBtn.disabled ? '0.4' : '1';

    prevBtn.addEventListener('click', () => this._goToLoop(block, block.currentLoop - 1));
    nextBtn.addEventListener('click', () => this._goToLoop(block, block.currentLoop + 1));
  }

  /** Shared prev/next circular icon buttons used inside the Simple input wrapper. */
  _createArrowButtons(block, parentEl) {
    const { currentLoop } = block;
    const { min, max } = this._navBounds(block);

    const makeBtn = (text, title, cls) => {
      const btn = parentEl.createEl('button', { text, cls: `ai-nav-arrow ${cls}`, attr: { title } });
      btn.style.position = 'absolute';
      btn.style.top = '45%';
      btn.style.transform = 'translateY(-50%)';
      btn.style.width = '28px';
      btn.style.height = '28px';
      btn.style.borderRadius = '50%';
      btn.style.border = '1px solid var(--background-modifier-border)';
      btn.style.background = 'var(--background-primary)';
      btn.style.color = 'var(--text-normal)';
      btn.style.cursor = 'pointer';
      btn.style.display = 'flex';
      btn.style.alignItems = 'center';
      btn.style.justifyContent = 'center';
      btn.style.fontSize = '16px';
      btn.style.padding = '0';
      btn.style.zIndex = '2';
      btn.style.boxShadow = '0 2px 4px rgba(0,0,0,0.1)';
      return btn;
    };

    const prevBtn = makeBtn('←', 'Previous', 'prev');
    const nextBtn = makeBtn('→', 'Next', 'next');

    prevBtn.disabled = currentLoop <= min;
    nextBtn.disabled = currentLoop >= max;
    prevBtn.style.opacity = prevBtn.disabled ? '0.3' : '1';
    nextBtn.style.opacity = nextBtn.disabled ? '0.3' : '1';

    prevBtn.addEventListener('click', () => this._goToLoop(block, block.currentLoop - 1));
    nextBtn.addEventListener('click', () => this._goToLoop(block, block.currentLoop + 1));

    [prevBtn, nextBtn].forEach(btn => {
      btn.addEventListener('mouseenter', () => {
        if (!btn.disabled) { btn.style.background = 'var(--interactive-accent)'; btn.style.color = 'var(--text-on-accent)'; }
      });
      btn.addEventListener('mouseleave', () => {
        if (!btn.disabled) { btn.style.background = 'var(--background-primary)'; btn.style.color = 'var(--text-normal)'; }
      });
    });

    return { prevBtn, nextBtn };
  }

  renderFullInput(block) {
    const { container, config, currentLoop, cache, isLoading } = block;
    const multiTurn = config.repeating !== '1';
    const isFlow = multiTurn && config.moving === 'Flow';

    const inputContainer = container.createDiv({ cls: 'ai-full-input' });

    const label = inputContainer.createEl('div', { text: `Ask ${currentLoop}:`, cls: 'ai-input-label' });
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
    input.disabled = isLoading;
    if (isLoading) input.style.opacity = '0.6';

    // Flow mode always starts from an empty box — the question that was
    // just asked has already moved into the transcript above.
    if (!isFlow) {
      const loopKey = `loop${currentLoop}`;
      if (cache[loopKey]?.[`ask-${currentLoop}`]) {
        input.value = cache[loopKey][`ask-${currentLoop}`];
      }
    }

    const sendBtn = inputContainer.createEl('button', { text: isLoading ? 'Sending…' : 'Send', cls: 'ai-codeblock-send' });
    sendBtn.style.marginTop = '8px';
    sendBtn.style.padding = '8px 16px';
    sendBtn.style.borderRadius = '6px';
    sendBtn.style.background = 'var(--interactive-accent)';
    sendBtn.style.color = 'var(--text-on-accent)';
    sendBtn.style.border = 'none';
    sendBtn.style.cursor = isLoading ? 'default' : 'pointer';
    sendBtn.disabled = isLoading;
    sendBtn.style.opacity = isLoading ? '0.6' : '1';

    sendBtn.addEventListener('click', () => this.handleFullInput(block, input.value));
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

    const label = responseContainer.createEl('div', { text: `Response ${currentLoop}:`, cls: 'ai-response-label' });
    label.style.fontWeight = '600';
    label.style.marginBottom = '8px';

    const contentDiv = responseContainer.createDiv({ cls: 'ai-response-content' });
    contentDiv.style.fontSize = '14px';
    contentDiv.style.lineHeight = '1.6';

    let responseText = '';
    {
      const loopKey = `loop${currentLoop}`;
      responseText = cache[loopKey]?.[`res-${currentLoop}`] || '';
    }

    if (responseText) {
      MarkdownRenderer.render(
        this.plugin.app,
        responseText,
        contentDiv,
        block.ctx?.sourcePath || '',
        this.plugin
      );
      applyAutoTextDirection(contentDiv, responseText);
      this._appendCodeblockCopyBtn(responseContainer, responseText);
    } else {
      contentDiv.textContent = '';
    }
  }

  // ==================== COPY BUTTON HELPER ====================

  /**
   * Appends a small "Copy" button in the top-right corner of a response
   * container. It's hidden by default and only appears when the person
   * taps/clicks anywhere in the response, then fades itself back out a
   * couple of seconds later on its own — rather than the old CSS
   * `:hover`-based reveal, which on touch devices has no real "un-hover"
   * moment and so could get stuck showing until the person tapped
   * somewhere else entirely.
   */
  _appendCodeblockCopyBtn(container, text) {
    if (!container.style.position) {
      container.style.position = 'relative';
    }

    const stickyBar = document.createElement('div');
    stickyBar.className            = 'ai-codeblock-sticky-bar';
    stickyBar.style.position       = 'sticky';
    stickyBar.style.top            = '0px';
    stickyBar.style.height         = '0px';
    stickyBar.style.overflow       = 'visible';
    stickyBar.style.zIndex         = '10';
    stickyBar.style.display        = 'flex';
    stickyBar.style.justifyContent = 'flex-end';
    stickyBar.style.pointerEvents  = 'none';
    container.prepend(stickyBar);

    const btn = document.createElement('button');
    btn.className = 'ai-codeblock-copy-btn';
    btn.title     = 'Copy response';
    stickyBar.appendChild(btn);

    btn.style.opacity       = '0';
    btn.style.pointerEvents = 'none';
    btn.style.transition    = 'opacity 0.15s';
    btn.style.marginTop     = '4px';
    btn.style.marginRight   = '4px';
    btn.style.padding       = '3px 8px';
    btn.style.borderRadius  = '4px';
    btn.style.border        = '1px solid var(--background-modifier-border)';
    btn.style.background    = 'var(--background-primary)';
    btn.style.color         = 'var(--text-muted)';
    btn.style.cursor        = 'pointer';
    btn.style.fontSize      = '11px';
    btn.style.display       = 'flex';
    btn.style.alignItems    = 'center';
    btn.style.gap           = '4px';

    const icon = document.createElement('span');
    btn.appendChild(icon);
    setIcon(icon, 'copy');
    icon.style.display = 'flex';

    const label = document.createElement('span');
    label.textContent = 'Copy';
    btn.appendChild(label);

    const AUTO_HIDE_MS = 2200;
    let hideTimer = null;
    const reveal = () => {
      btn.style.opacity = '1';
      btn.style.pointerEvents = 'auto';
      if (hideTimer) clearTimeout(hideTimer);
      hideTimer = setTimeout(() => {
        btn.style.opacity = '0';
        btn.style.pointerEvents = 'none';
        hideTimer = null;
      }, AUTO_HIDE_MS);
    };

    container.addEventListener('click', (e) => {
      if (e.target?.closest && e.target.closest('.ai-codeblock-copy-btn')) return; // handled below
      reveal();
    });

    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      reveal(); // keep it visible (and reset the auto-hide clock) while they're using it
      navigator.clipboard.writeText(text).then(() => {
        const prevLabel = label.textContent;
        label.textContent = 'Copied!';
        btn.style.color = 'var(--interactive-accent)';
        setTimeout(() => {
          label.textContent = prevLabel;
          btn.style.color = 'var(--text-muted)';
        }, 1200);
      }).catch(() => new Notice('⨉ Could not copy to clipboard'));
    });
  }

  // ==================== LOADING STATE ====================

  _setLoading(block, isLoading) {
    block.isLoading = isLoading;
  }

  // ==================== HANDLER METHODS ====================

  async handleSimpleInput(block, userInput) {
    if (block.isLoading) {
      new Notice('Please wait for the current response to finish.');
      return;
    }
    if (!userInput.trim()) {
      new Notice('Please enter a question');
      return;
    }

    const { config, cache } = block;
    const multiTurn = config.repeating !== '1';
    const isFlow = multiTurn && config.moving === 'Flow';

    this._setLoading(block, true);
    if (isFlow) {
      // Show the question in the transcript immediately, before the reply
      // arrives, the way a chat app would.
      block._pendingFlow = { ask: userInput, error: null };
    }
    this.renderBlock(block.id); // Immediately disables the input + send button.
    if (!isFlow) this.showSimpleLoading(block);

    try {
      const messages = [{ role: 'user', content: userInput }];
      if (config.systemPrompt) {
        messages.unshift({ role: 'system', content: config.systemPrompt });
      }

      const provider = this.getProvider(config.model);
      if (!provider) throw new Error(`Provider not found for model: ${config.model}`);

      const result = await provider.send({
        messages: messages,
        temperature: this.plugin.settings.temperature,
        max_tokens: this.plugin.settings.max_tokens,
        stream: false
      }, {
        timeoutMs: this.plugin.settings.timeoutMs
      });

      // A timed-out or aborted request comes back as a *successful* promise
      // resolving to an empty response, not a thrown error — treat it as a
      // failure here rather than silently caching a blank answer.
      if (result.aborted || !result.final) {
        throw new Error('The request timed out or was stopped before a response arrived.');
      }

      const currentLoop = block.currentLoop;
      const loopKey = `loop${currentLoop}`;
      const wasAnswered = !!(cache[loopKey]?.[`ask-${currentLoop}`] || cache[loopKey]?.[`res-${currentLoop}`]);

      if (!cache[loopKey]) cache[loopKey] = {};
      cache[loopKey][`ask-${currentLoop}`] = userInput;
      cache[loopKey][`res-${currentLoop}`] = result.final;

      // Only jump to a fresh blank turn when this WAS the newest turn —
      // editing an earlier turn should keep you right where you are,
      // instead of yanking you forward to an unrelated empty slot.
      if (config.repeating === 'Loop' && !wasAnswered) {
        block.currentLoop = currentLoop + 1;
      }

      if (isFlow) block._pendingFlow = null;
      block.cache = cache;
      this._setLoading(block, false);
      this.renderBlock(block.id);
      await this.saveCache(block);

    } catch (error) {
      console.error('AI Code Block Error:', error);
      this._setLoading(block, false);
      if (isFlow) {
        if (block._pendingFlow) block._pendingFlow.error = error.message;
        this.renderBlock(block.id); // shows the question bubble + inline error + Retry
      } else {
        this.renderBlock(block.id);
        this.showSimpleError(block, error.message);
      }
    }
  }

  async handleSeparateInput(block, ioId, userInput) {
    if (block.isLoading) {
      new Notice('Please wait for the current response to finish.');
      return;
    }
    if (!userInput.trim()) {
      new Notice('Please enter a question');
      return;
    }

    const { config, cache } = block;

    this._setLoading(block, true);
    this.renderBlock(block.id); // Disables this block's own input + send button.

    try {
      const messages = [{ role: 'user', content: userInput }];
      if (config.systemPrompt) {
        messages.unshift({ role: 'system', content: config.systemPrompt });
      }

      const provider = this.getProvider(config.model);
      if (!provider) throw new Error(`Provider not found for model: ${config.model}`);

      const result = await provider.send({
        messages: messages,
        temperature: this.plugin.settings.temperature,
        max_tokens: this.plugin.settings.max_tokens,
        stream: false
      }, {
        timeoutMs: this.plugin.settings.timeoutMs
      });

      if (result.aborted || !result.final) {
        throw new Error('The request timed out or was stopped before a response arrived.');
      }

      if (!cache[ioId]) cache[ioId] = {};
      cache[ioId].ask = userInput;
      cache[ioId].res = result.final;
      block.cache = cache;

      this._setLoading(block, false);
      this.renderBlock(block.id);
      await this.saveCache(block);

      // Push the shared cache + a save + a re-render to every matching
      // Output block in this same file, so persistence and the on-screen
      // result both stay in sync immediately (scoped to this file only —
      // see _ioSyncCandidates).
      const candidates = this._ioSyncCandidates(block, ioId);
      for (const candidate of candidates) {
        candidate.cache = cache;
        await this.saveCache(candidate);
        this.renderBlock(candidate.id);
      }

      new Notice(`✓ Answer saved for ID: ${ioId}`);

    } catch (error) {
      console.error('AI Separate IO Error:', error);
      this._setLoading(block, false);
      this.renderBlock(block.id);

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
    if (block.isLoading) {
      new Notice('Please wait for the current response to finish.');
      return;
    }
    if (!userInput.trim()) {
      new Notice('Please enter a question');
      return;
    }

    const { config, cache } = block;
    const multiTurn = config.repeating !== '1';
    const isFlow = multiTurn && config.moving === 'Flow';

    this._setLoading(block, true);
    if (isFlow) {
      block._pendingFlow = { ask: userInput, error: null };
    }
    this.renderBlock(block.id);
    if (!isFlow) this.showFullLoading(block);

    try {
      const messages = this.prepareMessages(block, userInput);
      const provider = this.getProvider(config.model);
      if (!provider) throw new Error(`Provider not found for model: ${config.model}`);

      const result = await provider.send({
        messages: messages,
        temperature: this.plugin.settings.temperature,
        max_tokens: this.plugin.settings.max_tokens,
        stream: false
      }, {
        timeoutMs: this.plugin.settings.timeoutMs
      });

      if (result.aborted || !result.final) {
        throw new Error('The request timed out or was stopped before a response arrived.');
      }

      const { isNewEntry } = this.storeResponse(block, userInput, result.final);
      if (config.repeating === 'Loop' && isNewEntry) {
        block.currentLoop = block.currentLoop + 1;
      }

      if (isFlow) block._pendingFlow = null;
      this._setLoading(block, false);
      this.renderBlock(block.id);
      await this.saveCache(block);

    } catch (error) {
      console.error('AI Code Block Error:', error);
      this._setLoading(block, false);
      if (isFlow) {
        if (block._pendingFlow) block._pendingFlow.error = error.message;
        this.renderBlock(block.id);
      } else {
        this.renderBlock(block.id);
        this.showFullError(block, error.message);
      }
    }
  }

  showSimpleLoading(block) {
    // Scoped to this block's own container — a document-wide query would
    // return the first matching element on the whole page, which is the
    // wrong block whenever more than one AI code block exists in the vault.
    const { container } = block;
    const responseDiv = container.querySelector('.ai-simple-response');
    if (!responseDiv) return null;
    const loadingDiv = document.createElement('div');
    loadingDiv.className = 'ai-simple-loading';
    loadingDiv.innerHTML = '⏳ Thinking' + threeDots();
    responseDiv.appendChild(loadingDiv);
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
    const loadingDiv = container.createDiv({ cls: 'ai-loading' });
    loadingDiv.style.padding      = '12px';
    loadingDiv.style.textAlign    = 'center';
    loadingDiv.style.color        = 'var(--text-muted)';
    loadingDiv.style.background   = 'var(--background-secondary)';
    loadingDiv.style.borderRadius = '6px';
    loadingDiv.style.marginTop    = '8px';
    loadingDiv.style.fontSize     = '14px';
    loadingDiv.style.fontStyle    = 'italic';
    loadingDiv.innerHTML          = '⏳ Thinking' + threeDots();
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
    const { config } = block;
    const messages = [];

    if (config.systemPrompt) {
      messages.push({ role: 'system', content: config.systemPrompt });
    }
    if (config.memory !== 'Current') {
      messages.push(...this.getContextMessages(block));
    }
    messages.push({ role: 'user', content: userInput });

    return messages;
  }

  getContextMessages(block) {
    const { config, cache, currentLoop } = block;
    const contextMessages = [];
    const upperBound = currentLoop - 1; // every turn strictly before the one being composed now

    const pushIfAnswered = (i) => {
      const loopKey = `loop${i}`;
      if (cache[loopKey]?.[`ask-${i}`] && cache[loopKey]?.[`res-${i}`]) {
        contextMessages.push({ role: 'user', content: cache[loopKey][`ask-${i}`] });
        contextMessages.push({ role: 'assistant', content: cache[loopKey][`res-${i}`] });
      }
    };

    if (config.memory === 'All') {
      for (let i = 1; i <= upperBound; i++) pushIfAnswered(i);
    } else if (config.memory.startsWith('Previous')) {
      const match = config.memory.match(/\((\d+)\)/);
      const n = match ? parseInt(match[1]) : 1;
      const start = Math.max(1, upperBound - n + 1);
      for (let i = start; i <= upperBound; i++) pushIfAnswered(i);
    }

    return contextMessages;
  }

  /** Returns { isNewEntry } so callers can decide whether it's appropriate to auto-advance currentLoop. */
  storeResponse(block, userInput, response) {
    const { config, currentLoop, cache } = block;
    const loopKey = `loop${currentLoop}`;
    const wasAnswered = !!(cache[loopKey]?.[`ask-${currentLoop}`] || cache[loopKey]?.[`res-${currentLoop}`]);

    if (!cache[loopKey]) cache[loopKey] = {};
    cache[loopKey][`ask-${currentLoop}`] = userInput;
    cache[loopKey][`res-${currentLoop}`] = response;

    return { isNewEntry: config.repeating === 'Loop' && !wasAnswered };
  }

  getProvider(model) {
    if (model && model !== '') {
      const providerMap = {
        'local': 'local', 'gemini': 'gemini', 'google': 'gemini',
        'anthropic': 'anthropic', 'claude': 'anthropic',
        'openai': 'openai', 'chatgpt': 'openai', 'custom': 'custom'
      };

      const modelLower = model.toLowerCase();
      let providerType = providerMap[modelLower];

      if (!providerType) {
        if (modelLower.includes('gemini') || modelLower.includes('google')) providerType = 'gemini';
        else if (modelLower.includes('claude') || modelLower.includes('anthropic')) providerType = 'anthropic';
        else if (modelLower.includes('gpt') || modelLower.includes('openai') || modelLower.includes('chatgpt')) providerType = 'openai';
        else if (modelLower.includes('local')) providerType = 'local';
        else providerType = this.plugin.settings.currentMode === 'local' ? 'local' : this.plugin.settings.cloudApiType;
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

    if (config.caching === 'Temporary') return;

    if (config.caching === 'Plugin Data') {
      // In-memory now; persisted to conversations.json (not data.json) the
      // next time saveState() flushes.
      if (!this.plugin.settings.codeBlockCache) {
        this.plugin.settings.codeBlockCache = {};
      }
      const storageKey = this._pluginDataKey(config, id);
      this.plugin.settings.codeBlockCache[storageKey] = JSON.parse(JSON.stringify(cache));
      await this.plugin.saveState();
    } else if (config.caching === 'Code Block') {
      await this.updateCodeBlockSource(block);
    }
  }

  async updateCodeBlockSource(block) {
    const { cache, ctx, el, config } = block;

    try {
      // Resolve the file from the block's own render context (ctx.sourcePath),
      // NOT the active view — the active view can be a different file
      // entirely if the user switched tabs while the AI was thinking, which
      // would otherwise write the cache into the wrong note.
      const file = this.plugin.app.vault.getAbstractFileByPath(ctx.sourcePath);
      if (!file) {
        new Notice('⚠ Cannot save cache: source file not found.');
        return false;
      }

      const content = await this.plugin.app.vault.read(file);
      const lines = content.split('\n');
      const sectionInfo = ctx.getSectionInfo(el);

      if (!sectionInfo) {
        new Notice('⚠ Cannot save cache: code block context lost. Did you switch files?');
        return false;
      }

      const { lineStart, lineEnd } = sectionInfo;
      const blockLines = lines.slice(lineStart + 1, lineEnd);

      // Strip out any existing cached-data block (which may itself span
      // several lines) using the same balanced-brace extraction as parsing,
      // rather than only lines literally starting with "cached data:".
      const blockSource = blockLines.join('\n');
      const { raw: existingCachedRaw } = this._extractCachedDataBlock(blockSource);
      const cleanedBlockSource = existingCachedRaw ? blockSource.replace(existingCachedRaw, '') : blockSource;
      const cleanLines = cleanedBlockSource.split('\n').filter(line => line.trim());

      cleanLines.push(`cached data: ${JSON.stringify(cache)}`);

      const newLines = [
        ...lines.slice(0, lineStart + 1),
        ...cleanLines,
        ...lines.slice(lineEnd)
      ];

      await this.plugin.app.vault.modify(file, newLines.join('\n'));
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
        this._unloaded = false;
    }

    async onload() {
        if (this.isProcessing) return;
        this.isProcessing = true;

        try {
            if (this.plugin?.codeBlockProcessor) {
                const blockId = await this.plugin.codeBlockProcessor.process(
                    this.source,
                    this.containerEl,
                    this.ctx
                );

                if (this._unloaded) {
                    // Unloaded while process() was running (e.g. the note was
                    // closed before the first render finished) — clean up the
                    // entry we just created instead of leaving it orphaned.
                    this.plugin?.codeBlockProcessor?.activeBlocks?.delete(blockId);
                    return;
                }
                this.blockId = blockId;
            }
        } catch (error) {
            if (this._unloaded || !this.containerEl) return;
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
        this._unloaded = true;

        // Only remove this block's entry from the processor's registry if it
        // still belongs to THIS renderer instance. A file write we made
        // ourselves (stable-id injection, inline cache save) makes Obsidian
        // mount a brand-new AiChatBlockRenderer for the same blockId before
        // this old instance's unload fires; blindly deleting by id would
        // wipe out that newer, live entry out from under it. Comparing the
        // stored container element tells the two apart.
        if (this.blockId && this.plugin?.codeBlockProcessor) {
            const current = this.plugin.codeBlockProcessor.activeBlocks.get(this.blockId);
            if (current && current.el === this.containerEl) {
                this.plugin.codeBlockProcessor.activeBlocks.delete(this.blockId);
            }
        }

        if (this.containerEl) {
            this.containerEl.empty();
        }

        this.plugin = null;
        this.ctx = null;
    }
}


// ==================== OBSIDIAN NATIVE SETTINGS TAB ====================

/**
 * Renders the plugin's settings UI directly inside Obsidian's own Settings
 * panel (Settings → Community Plugins → AI Assistant ⚙).
 *
 * All settings logic lives in SettingsMixin above; both this class and
 * SettingsModal apply it via Object.assign, giving a single source of truth
 * for every tab and every input field.
 */
class AIPluginSettingTab extends PluginSettingTab {
  constructor(app, plugin) {
    super(app, plugin);
    this.plugin = plugin;
    Object.assign(this, SettingsMixin);
  }

  display() {
    const { containerEl } = this;
    containerEl.empty();
    this.buildSettingsUI(containerEl, { scrollable: false });
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
   *   settings.namingModels[provider] is non-empty → inject into payload so buildBody picks it up
   *   settings.namingModels[provider] is empty     → provider falls back to its own configured model
   *   settings.namingProvider === 'default'        → no override; active provider uses its own model
   *
   * @param {string} firstMessage
   * @returns {Promise<string|null>} cleaned title, or null on failure / disabled
   */
  /**
   * The naming prompt (the template the user edits in Settings) with the message filled in.
   * Shared by the dedicated naming request and by the "title inside the chat reply" fallback,
   * so both always use exactly the same instructions.
   */
  buildNamingPrompt(firstMessage) {
    // Truncate to avoid excessive token usage
    const messagePreview = firstMessage.length > 2500
      ? firstMessage.substring(0, 2500) + '...'
      : firstMessage;

    // Build prompt: use the user's custom instructions if provided,
    // but always inject the message ourselves — never rely on the user
    // having written a placeholder correctly in their template.
    const PLACEHOLDER = '{{message}}';
    const rawTemplate = (this.settings.namingPromptTemplate
      || DEFAULT_SETTINGS.namingPromptTemplate).trim();

    if (rawTemplate.includes(PLACEHOLDER)) {
      // Template has the placeholder — replace it normally
      return rawTemplate.replace(PLACEHOLDER, messagePreview);
    } else {
      // No placeholder found: strip any accidental leftover variable-style
      // tokens the user might have typed (${messagePreview}, {{messagePreview}}, etc.)
      // then append the message ourselves so the AI always receives it.
      const cleanedTemplate = rawTemplate
        .replace(/\$\{[^}]*\}/g, '')          // remove ${...} JS template tokens
        .replace(/\{\{[^}]*\}\}/g, '')         // remove any other {{...}} tokens
        .trim();
      return `${cleanedTemplate}\n\nMessage: "${messagePreview}"`;
    }
  }

  /**
   * Appended to the first user message when the dedicated naming request failed:
   * the user's own naming prompt, followed only by HOW to hand the title back.
   */
  buildNamingInReplyInstruction(firstMessage) {
    return (
      '\n\n[System note — for this first message only.\n' +
      this.buildNamingPrompt(firstMessage) + '\n\n' +
      'Do NOT reply with only the title: answer the user\'s message above normally. ' +
      'Then, at the very end of your reply, add the title hidden inside an HTML comment exactly like this: ' +
      '<!-- @@conv name: Title here@@ -->. Do not show the title anywhere else and never mention this note.]'
    );
  }

  async generateConversationName(firstMessage) {
    if (!firstMessage?.trim()) return null;
    if (!this.settings.autoNameConversations) return null;

    const prompt = this.buildNamingPrompt(firstMessage);

    const payload = {
      messages:   [{ role: 'user', content: prompt }],
      temperature: this.settings.namingTemperature ?? 0.3,
      max_tokens:  this.settings.namingMaxTokens   ?? 30,
      stream: false
    };

    // Inject the per-provider model override if the user specified one.
    // 'default' has no override — it delegates entirely to the active provider's own model.
    const resolvedProviderForModel = (this.settings.namingProvider || 'default').trim();
    if (resolvedProviderForModel !== 'default') {
      const namingModel = ((this.settings.namingModels || {})[resolvedProviderForModel] || '').trim();
      if (namingModel) payload.model = namingModel;
    }

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
      // AbortError = view was torn down or timeout fired — not a real failure.
      if (error.name === 'AbortError' || error instanceof UserAbortError) {
        return null;
      }
      console.log('Error generating conversation name:', error);
    }

    return null;
  }

  async onload() {
  // Silently suppress unhandled AbortError rejections — these come from
  // fetch/stream operations that were cancelled (user stop, timeout, view
  // teardown) and are fully expected. They are not real failures.
  this._abortErrorSilencer = (event) => {
    const err = event.reason;
    if (err && (err.name === 'AbortError' || err instanceof UserAbortError)) {
      event.preventDefault();
    }
  };
  window.addEventListener('unhandledrejection', this._abortErrorSilencer);

  this.loadCSS();
  await this.loadSettings();
  if (this._pendingSecretMigration) { this._pendingSecretMigration = false; await this.saveSettings(); }   // move old plain-text keys
  this.modelCatalog._load().catch(() => {});   // warm the metadata cache from disk
  
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
  this._sessionManager.promptAssembler = this.promptAssembler;
  // Deleting or emptying a conversation also removes it from the chat-history index,
  // and anything left over from earlier deletions is cleaned up now.
  this._sessionManager.onSessionRemoved = (id) => { this.chatSearch.forget(id).catch(() => {}); };
  this.chatSearch.prune().catch(() => {});
  // A saved note that is deleted, or moved away, leaves the chat-history index at once.
  const noteGone = (path) => {
    if (this.settings.chatSearchEnabled && this.settings.chatSearchSource !== 'sessions') this.chatSearch.forgetNote(path).catch(() => {});
  };
  this.registerEvent(this.app.vault.on('delete', (f) => noteGone(f.path)));
  this.registerEvent(this.app.vault.on('rename', (f, oldPath) => noteGone(oldPath)));

  this.apiManager = new APIManager(this);
  this.vaultFileManager = new VaultFileManager(this);
  this.inNoteAI = new InNoteAIInteractions(this);
  this.networkManager = new NetworkManager(this);

  // Register the AI code block processor.
  // Wrapped in a try-catch because Obsidian throws if the language tag is
  // already in its internal registry — which can happen when the plugin is
  // disabled and re-enabled without a full app restart (the previous
  // processor entry may not have been flushed yet).  Catching that specific
  // error lets the plugin continue loading normally; any other error is
  // re-thrown so real bugs still surface.
  this.codeBlockProcessor = new AICodeBlockProcessor(this);
  try {
    this.registerMarkdownCodeBlockProcessor('ai', (source, el, ctx) => {
      const renderer = new AiChatBlockRenderer(el, this, source, ctx);
      ctx.addChild(renderer);
    });
  } catch (e) {
    if (e?.message?.includes('already registered')) {
      console.warn('[Ai-Assistant] Code-block processor for "ai" is already registered — skipping re-registration. Disable and re-enable the plugin, or restart Obsidian, if rendering stops working.');
    } else {
      throw e;
    }
  }

  this.registerView(VIEW_TYPE, (leaf) => new ChatView(leaf, this));

  // Register the dedicated full-tab chat page view.
  // Uses a distinct VIEW_TYPE so it can coexist with the sidebar view.
  this.registerView(VIEW_TYPE_CHAT_PAGE, (leaf) => new ChatPageView(leaf, this));

  // onPluginLoad hooks (off unless event hooks are on): once Obsidian has finished starting
  if (this.settings.hooksEnabled) {
    this.app.workspace.onLayoutReady(() => { this.hooks.fire('onPluginLoad').catch(() => {}); });
  }

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
        background-color: transparent;
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
        overflow-x: auto !important;  /* long lines scroll; never overflow the bubble */
        max-width: 100% !important;
        white-space: pre !important;  /* preserve indentation without wrapping */
        word-break: normal !important;
        word-wrap: normal !important;
        box-sizing: border-box !important;
      }

      /* Inline code should still wrap gently */
      .ai-msg code:not(pre code),
      .ai-simple-response code:not(pre code),
      .ai-separate-response code:not(pre code),
      .ai-response-content code:not(pre code) {
        word-break: break-word !important;
        white-space: pre-wrap !important;
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

      /* Attachment chips — neutralise Obsidian's default button sizing so
         the × remove button doesn't stretch the pill's height */
      .ai-attach-preview-bar div > button {
        padding: 0 !important;
        margin: 0 0 0 1px !important;
        min-height: 0 !important;
        min-width: 0 !important;
        height: auto !important;
        line-height: 1 !important;
        font-size: 12px !important;
        background: none !important;
        border: none !important;
        box-shadow: none !important;
      }

      /* Pin the chip itself to a compact fixed height */
      .ai-attach-preview-bar div {
        height: 29px !important;
        box-sizing: border-box !important;
      }

      /* ── Collapsible user message bubbles (Gemini-style) ─────────────────── */

      .ai-msg.user.is-collapsible {
        cursor: pointer;
      }

      /* Text wrapper — position:relative lets the fade overlay anchor to it. */
      .ai-msg-text-wrap {
        position: relative;
      }

      /* Collapsed: clip to exactly 2 lines.
         14px font × 1.5 line-height = 21px per line → 42px for 2 lines.
         overflow:hidden does the clipping; the condensed (no-\n) text wraps
         naturally as a single block so max-height truncates it cleanly. */
      .ai-msg.user.is-collapsed .ai-msg-text-wrap {
        max-height: 42px !important;
        overflow: hidden !important;
      }

      /* Expanded: no height limit, full text visible */
      .ai-msg.user.is-expanded .ai-msg-text-wrap {
        max-height: none !important;
        overflow: visible !important;
      }

      /* Fade overlay: anchored to the bottom-right of textWrap (bottom-left
         for RTL). Covers ~40% width × 1 line height so only the last few
         words dissolve. background gradient direction is set inline in JS
         so it correctly flips for RTL. RTL left/right anchoring also set inline. */
      .ai-msg-fade {
        position: absolute;
        bottom: 0;
        right: 0;
        width: 35%;   /* wide enough to cover ~3 words + the 20px chevron btn */
        height: 21px; /* one line: 14px × 1.5 */
        pointer-events: none;
      }

      /* Hide fade when expanded */
      .ai-msg.user.is-expanded .ai-msg-fade {
        display: none;
      }

      /* Chevron button — absolutely positioned at the trailing bottom corner of
         textWrap (LTR: bottom-right; RTL: bottom-left, set inline in JS).
         It sits on top of the fade gradient, right next to the last visible words. */
      .ai-msg-chevron-btn {
        position: absolute;
        bottom: 0;
        right: 12px;
        display: flex;
        align-items: center;
        justify-content: center;
        width: 20px;
        height: 20px;
        border-radius: 50%;
        background: rgba(255,255,255,0.18);
        cursor: pointer;
        flex-shrink: 0;
        transition: background 0.15s ease;
        z-index: 1;
      }
      .ai-msg-chevron-btn:hover {
        background: rgba(255,255,255,0.32);
      }
      .ai-msg-chevron-btn svg {
        width: 13px;
        height: 13px;
        stroke: var(--text-on-accent);
        fill: none;
        stroke-width: 2.5;
        stroke-linecap: round;
        stroke-linejoin: round;
        transition: transform 0.2s ease;
        display: block;
      }
      /* Flip chevron upward when expanded */
      .ai-msg.user.is-expanded .ai-msg-chevron-btn svg {
        transform: rotate(180deg);
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
      await this.refreshPromptLayers();
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

  /** Tool registry (FR-0.1). Created on first use; nothing is registered by default. */
  get toolRegistry() {
    if (!this._toolRegistry) this._toolRegistry = new ToolRegistry(this);
    return this._toolRegistry;
  }

  get toolExecutor() {
    if (!this._toolExecutor) this._toolExecutor = new ToolExecutor(this);
    return this._toolExecutor;
  }

  /** The AI folder (soul.md, memory.md, user.md, Skills, Commands, Agents). Inactive until settings.aiFolder is set. */
  get aiFolder() {
    if (!this._aiFolder) this._aiFolder = new AIFolder(this);
    return this._aiFolder;
  }

  get promptAssembler() {
    if (!this._promptAssembler) this._promptAssembler = new PromptAssembler(this);
    return this._promptAssembler;
  }

  get skills() {
    if (!this._skills) this._skills = new SkillLibrary(this);
    return this._skills;
  }

  get commands() {
    if (!this._commands) this._commands = new CommandLibrary(this);
    return this._commands;
  }

  get mentions() {
    if (!this._mentions) this._mentions = new MentionService(this);
    return this._mentions;
  }

  get compression() {
    if (!this._compression) this._compression = new ContextCompressor(this);
    return this._compression;
  }

  get agents() {
    if (!this._agents) this._agents = new AgentLibrary(this);
    return this._agents;
  }

  get agentRunner() {
    if (!this._agentRunner) this._agentRunner = new AgentRunner(this);
    return this._agentRunner;
  }

  get hooks() {
    if (!this._hooks) this._hooks = new HookService(this);
    return this._hooks;
  }

  get mcp() {
    if (!this._mcp) this._mcp = new McpManager(this);
    return this._mcp;
  }

  getNoteContext() { return getNoteContextFor(this.app); }

  get webSearch() {
    if (!this._webSearch) this._webSearch = new WebSearch(this);
    return this._webSearch;
  }

  // ── Named secrets (search keys, MCP tokens) ───────────────────────────────
  // In Obsidian's secure storage when it exists; otherwise only in memory until Obsidian closes.
  // Never in data.json or in any vault file.
  getSecret(name) {
    const ss = this._secretStorage();
    if (ss) { try { return ss.getSecret(this._secretId(name)) || ''; } catch (_) { /* fall through */ } }
    return (this._sessionSecrets && this._sessionSecrets[name]) || '';
  }

  /** @returns {boolean} true if it was stored durably */
  setSecret(name, value) {
    const v = String(value || '');
    const ss = this._secretStorage();
    if (ss) { try { ss.setSecret(this._secretId(name), v); return true; } catch (_) { /* fall back to memory */ } }
    if (!this._sessionSecrets) this._sessionSecrets = {};
    this._sessionSecrets[name] = v;
    return false;
  }

  secretsArePersistent() { return !!this._secretStorage(); }

  /**
   * Permission check for one file operation (FR-3.5), using the same rules as tools:
   * the setting for its kind (file_read, file_create, file_copy, file_edit, file_move), then the
   * folders the user listed as always allowed, else Ask.
   * @returns {Promise<{allowed: boolean, reason?: string, byUser?: boolean}>}
   */
  async fileOpPermission(op, attrs = {}, signal) {
    const name = FILE_OP_TOOL_OF[op];
    if (!name) return { allowed: true };
    const base = FILE_OP_TOOLS[name];
    const tool = { name, title: base.title, description: base.description, permission: base.permission, source: 'builtin', defaultPolicy: base.defaultPolicy,
      paths: (a) => [a.path, a.to].filter(Boolean) };
    const args = { operation: op, ...(attrs.path ? { path: attrs.path } : {}), ...(attrs.to ? { to: attrs.to } : {}) };
    return this.toolExecutor.gate.check(tool, args, signal);
  }

  /** Registers the tools of every feature that is switched on, so the permission settings can list them. */
  registerFeatureTools() {
    const s = this.settings;
    if (s.aiFolder && s.memoryEnabled) this.persistentMemory.ensureToolRegistered();
    if (s.aiFolder && s.skillsEnabled !== false) this.skills.ensureToolRegistered();
    if (s.aiFolder && s.subagentsEnabled !== false) this.agents.ensureToolRegistered();
    if (s.webSearchEnabled) this.webSearch.ensureToolsRegistered();
  }

  planModeAvailable() { return this.settings.planModeAvailable !== false; }

  /** True while this conversation is waiting for the user to approve a plan. */
  isPlanning(session) { return !!session && session.planState === 'planning' && this.planModeAvailable(); }

  get skillDrafter() {
    if (!this._skillDrafter) this._skillDrafter = new SkillDrafter(this);
    return this._skillDrafter;
  }

  get persistentMemory() {
    if (!this._persistentMemory) this._persistentMemory = new PersistentMemory(this);
    return this._persistentMemory;
  }

  get chatSearch() {
    if (!this._chatSearch) this._chatSearch = new ChatSearchIndex(this);
    return this._chatSearch;
  }

  /** Short digest of earlier conversations relevant to the message being answered ('' when search is off or nothing fits). */
  async historyDigestFor(session) {
    if (!this.settings.chatSearchEnabled || !session) return '';
    const last = [...session.messages].reverse().find(m => m.role === 'user');
    return last ? this.chatSearch.digest(plainMessageText(last), session).catch(() => '') : '';
  }

  /**
   * Shows a proposed change to one vault file in the diff review and resolves 'approved' once it
   * has been applied there, or 'declined' when it is cancelled, closed, or Stop is pressed.
   */
  reviewFileChange(file, originalContent, newContent, signal) {
    return new Promise((resolve) => {
      let done = false;
      let modal = null;
      const onAbort = () => { finish('declined'); try { modal && modal.close(); } catch (_) {} };
      const finish = (verdict) => {
        if (done) return;
        done = true;
        if (signal) signal.removeEventListener('abort', onAbort);
        resolve(verdict);
      };
      if (signal && signal.aborted) return finish('declined');
      const fileDiff = {
        file, originalContent, newContent,
        diff: DiffComputer.computeLineDiff(originalContent, newContent, { ignoreWhitespace: false }),
        selected: true, chatMessage: '', error: null
      };
      modal = new DiffViewModal(this.app, this, [fileDiff], () => finish('approved'));
      // The review stays open after Apply (for "Return to Original"), so closing it only counts as a
      // refusal if nothing was applied; the deferral lets a real Apply win.
      const baseClose = typeof modal.onClose === 'function' ? modal.onClose.bind(modal) : null;
      modal.onClose = () => { if (baseClose) baseClose(); setTimeout(() => finish('declined'), 0); };
      if (signal) signal.addEventListener('abort', onAbort, { once: true });
      modal.open();
    });
  }

  /** Attachments for the @notes, @folders and #tags in what the user typed; one short notice if something was not found. */
  async resolveMentions(text, existing = []) {
    const { attachments, notFound } = await this.mentions.resolve(text, existing);
    if (notFound.length) {
      new Notice(notFound.length === 1 ? `Couldn't find "${notFound[0]}".` : `Couldn't find ${notFound.length} mentioned notes or folders.`);
    }
    return attachments;
  }

  /** True when "/" has something to offer: AI folder set and commands or skills switched on. */
  slashEnabled() {
    return this.planModeAvailable() || (this.aiFolder.active && (this.commands.enabled || this.skills.enabled));
  }

  async refreshSlashSources() {
    await Promise.all([this.commands.refresh(), this.skills.refresh()].map(p => p.catch(() => {})));
  }

  /** Autocomplete entries for "/query": commands first-class, skills unless a command has the same name. */
  slashItems(query) {
    const q = String(query || '').toLowerCase();
    const commands = this.commands.list().map(c => ({ kind: 'command', ...c }));
    const builtIn = (this.planModeAvailable() && !commands.some(c => c.name.toLowerCase() === 'plan'))
      ? [{ kind: 'built-in', name: 'plan', description: 'Write a plan and wait for your approval before anything is changed' }] : [];
    const taken = new Set([...commands, ...builtIn].map(c => c.name.toLowerCase()));
    const skills = this.skills.list().filter(s => !taken.has(s.name.toLowerCase())).map(s => ({ kind: 'skill', ...s }));
    return [...commands, ...builtIn, ...skills]
      .filter(i => i.name.toLowerCase().includes(q))
      .sort((a, b) => {
        const pa = a.name.toLowerCase().startsWith(q) ? 0 : 1, pb = b.name.toLowerCase().startsWith(q) ? 0 : 1;
        return pa - pb || a.name.localeCompare(b.name);
      })
      .slice(0, 30);
  }

  /**
   * Turns a message that starts with "/name" into what is actually sent.
   *   command → { text, mentionText }    the command's template with {{selection}} / {{note}} filled in
   *                                       (anything typed after the name is added below it)
   *   skill   → { text, skill }          the typed text (or a one-line request); the skill is loaded for this turn
   *   /plan   → { text, plan: true }     the typed text; the conversation goes into plan mode (nothing changes until approved)
   *   other   → null                     not a command or skill, the text is sent as typed
   *   false   → a short notice was shown (nothing selected / no note open) and nothing should be sent
   * @param {Function} getNote async () => { selection, note, hasNote } for the note the user was last in
   */
  async resolveSlash(text, getNote) {
    const m = /^\/([^\s/]+)(?:\s+([\s\S]*))?$/.exec(text || '');
    if (!m || !this.slashEnabled()) return null;
    await this.refreshSlashSources();
    const name = m[1], rest = (m[2] || '').trim();

    const command = this.commands.find(name);
    if (command) {
      const template = await this.commands.template(command.name);
      if (!template) return null;
      const used = CommandLibrary.variablesIn(template);
      const values = { selection: '', note: '' };
      if (used.size) {
        const ctx = await getNote();
        if (used.has('selection') && !(ctx.selection || '').trim()) { new Notice('Select some text in a note first.'); return false; }
        if (used.has('note') && !ctx.hasNote) { new Notice('Open a note first.'); return false; }
        values.selection = ctx.selection || '';
        values.note = ctx.note || '';
      }
      const filled = CommandLibrary.fill(template, values).trim();
      // mentionText = what the user (and the template) wrote, before {{note}}/{{selection}} were filled in
      return { text: rest ? `${filled}\n\n${rest}` : filled, mentionText: rest ? `${template}\n\n${rest}` : template };
    }

    // built-in /plan (a command of the same name in the AI folder wins, above)
    if (name.toLowerCase() === 'plan' && this.planModeAvailable()) return { text: rest || PLAN_DEFAULT_REQUEST, plan: true, mentionText: rest };

    const skill = this.skills.find(name);
    if (skill) return { text: rest || `Use the "${skill.name}" skill.`, skill: skill.name, mentionText: rest };
    return null;
  }

  /** Call before building a chat request: loads the layers that live in the vault. Free when no AI folder is set. */
  async refreshPromptLayers() {
    if (this.settings.aiFolder || this.settings.webSearchEnabled || this.settings.mcpEnabled || this._promptAssembler) await this.promptAssembler.refresh();
  }

  /** Lazily created disk cache for model lists + model metadata (metadata-category.json). */
  get modelCatalog() {
    if (!this._modelCatalog) this._modelCatalog = new ModelCatalog(this);
    return this._modelCatalog;
  }

  /**
   * The reasoning-effort value to send for a provider, or '' when none should be sent.
   * Only returned if it is still one of the levels the catalog declares for that model,
   * and only for the model configured in Settings (not per-request overrides like naming).
   */
  getReasoningEffort(providerId, modelUsed) {
    const st = this.settings;
    const effort = st.reasoningEffort?.[providerId];
    if (!effort) return '';
    const configured = ({ openai: st.openaiModel, anthropic: st.anthropicModel, gemini: st.geminiModel })[providerId];
    const model = modelUsed || configured;
    if (!model || model !== configured) return '';
    return this.modelCatalog.effortValues(providerId, model).includes(effort) ? effort : '';
  }

  /**
   * Initial values for "Image Analysis" / "Image Creation" come from the model catalog:
   * vision support turns analysis ON, image-output support turns creation ON.
   * It never turns anything OFF and never hides anything — unknown or incomplete
   * metadata (local models, gateways) leaves the user's choice untouched.
   * Applied once per model, so a later manual change is respected.
   * @returns {boolean} true when a value was changed
   */
  applyImageCapabilityDefaults(providerKey) {
    const model = this.getConfiguredModel(providerKey);
    const mod = model ? this.modelCatalog.getModelMeta(providerKey, model)?.modalities : null;
    if (!mod) return false;

    const st = this.settings;
    if (!st.imageCapabilities) st.imageCapabilities = {};
    const caps = st.imageCapabilities[providerKey] || (st.imageCapabilities[providerKey] = { analysis: false, creation: false });
    if (caps.catalogDefaultsFor === model) return false;
    caps.catalogDefaultsFor = model;

    if (Array.isArray(mod.input)  && mod.input.includes('image'))  caps.analysis = true;
    if (Array.isArray(mod.output) && mod.output.includes('image')) caps.creation = true;

    clearTimeout(this._capSaveTimer);
    this._capSaveTimer = setTimeout(() => {
      this.saveData(this._settingsForDisk(this.settings)).catch(e => console.error(e));
    }, 600);
    return true;
  }

  getImageCaps(providerKey) {
    this.applyImageCapabilityDefaults(providerKey);
    return this.settings.imageCapabilities?.[providerKey] || {};
  }

  /** The model name currently configured for a provider key. */
  getConfiguredModel(providerKey) {
    const st = this.settings;
    return ({ local: st.localModel, openai: st.openaiModel, gemini: st.geminiModel,
              anthropic: st.anthropicModel, custom: st.customModel })[providerKey] || '';
  }

  /** {limit, used, ratio} for the last request, or null when the model's context size is unknown. */
  getContextInfo(last) {
    if (!last || !last.model) return null;
    const limit = this.modelCatalog.getModelMeta(last.providerKey, last.model)?.limit?.context;
    if (!limit) return null;
    const used = (last.inputTokens || 0) + (last.outputTokens || 0);
    return { limit, used, ratio: used / limit };
  }

  /** One-time warnings at 80% and 95% of the model's context window. */
  checkContextUsage(session, providerKey, model, usage) {
    const info = this.getContextInfo({ ...usage, providerKey, model });
    if (!info) return;
    if (info.ratio < 0.5) session.ctxWarnLevel = 0;            // conversation shrank again
    const level = info.ratio >= 0.95 ? 95 : info.ratio >= 0.8 ? 80 : 0;
    if (level > (session.ctxWarnLevel || 0)) {
      session.ctxWarnLevel = level;
      new Notice(
        `⚠️ This conversation uses ${usage.estimated ? '~' : ''}${Math.round(info.ratio * 100)}% of ${model}'s context window ` +
        `(${info.used.toLocaleString()} / ${info.limit.toLocaleString()} tokens). Consider starting a new chat.`,
        9000
      );
    }
  }

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
    await this.saveData(this._settingsForDisk(settingsToSave));
    await this.saveConversations();
  }

  // ── API-key protection (Obsidian SecretStorage, available since 1.11.4) ──
  _secretStorage() {
    const ss = this.app && this.app.secretStorage;
    return (ss && typeof ss.getSecret === 'function' && typeof ss.setSecret === 'function') ? ss : null;
  }

  /** Per-vault id so two vaults on a device never overwrite each other's keys. */
  _secretId(name) {
    const vault = String(this.app.vault.getName() || 'vault').toLowerCase()
      .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'vault';
    return `ai-assistant-${vault}-${name}`;
  }

  /** Copies stored secrets into memory; flags plain-text keys left by older versions for migration. */
  _hydrateSecrets() {
    const ss = this._secretStorage();
    if (!ss || this.settings.useSecureKeyStorage === false) return;
    for (const [field, name] of Object.entries(SECRET_FIELDS)) {
      let stored = null;
      try { stored = ss.getSecret(this._secretId(name)); } catch (_) {}
      if (stored) this.settings[field] = stored;
      else if (this.settings[field]) this._pendingSecretMigration = true;
    }
  }

  /** What actually goes into data.json: keys blanked when they live in SecretStorage. */
  _settingsForDisk(src) {
    const out = { ...src };
    const ss = this._secretStorage();
    if (!ss) return out;
    const secure = this.settings.useSecureKeyStorage !== false;
    for (const [field, name] of Object.entries(SECRET_FIELDS)) {
      const id = this._secretId(name);
      const wanted = secure ? (this.settings[field] || '') : '';
      try {
        if ((ss.getSecret(id) || '') !== wanted) ss.setSecret(id, wanted);
        if (secure) out[field] = '';
      } catch (e) {
        console.error('SecretStorage write failed — keeping the key in data.json:', e);
      }
    }
    return out;
  }

  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData() || {});
    this._hydrateSecrets();

    // Migrate the old single-folder setting (fileOpsFolder) to the new
    // multi-path fileOpsPaths array, the first time this loads post-update.
    if (this.settings.fileOpsFolder && (!this.settings.fileOpsPaths || this.settings.fileOpsPaths.length === 0)) {
      this.settings.fileOpsPaths = [this.settings.fileOpsFolder];
    }
    delete this.settings.fileOpsFolder;

    // ── Migration: the old "soul.md" setting → fileHandlingPrinciples ────────
    // Content is carried over (from the settings text, or from the vault file if that
    // was the chosen source). The vault file itself is never touched or deleted.
    if ('soulMdSource' in this.settings || 'soulMdInline' in this.settings || 'soulMdFilePath' in this.settings) {
      if (!this.settings.fileHandlingPrinciples) {
        let migrated = '';
        if (this.settings.soulMdSource === 'file') {
          const oldPath = (this.settings.soulMdFilePath || '').trim()
            || `${this.settings.conversationsFolder || 'AI Conversations'}/soul.md`;
          try { migrated = await this.app.vault.adapter.read(oldPath); } catch (_) { /* file missing */ }
        }
        if (!(migrated && migrated.trim()) && this.settings.soulMdInline && this.settings.soulMdInline.trim()) {
          migrated = this.settings.soulMdInline;
        }
        if (migrated && migrated.trim()) this.settings.fileHandlingPrinciples = migrated;
      }
      delete this.settings.soulMdSource;
      delete this.settings.soulMdInline;
      delete this.settings.soulMdFilePath;
    }

    // Migrate the old flat namingModel string to the new per-provider namingModels map.
    // Preserve the value under whichever non-default provider was active at save time.
    if (typeof this.settings.namingModel === 'string') {
      const oldModel = this.settings.namingModel.trim();
      if (oldModel) {
        this.settings.namingModels = Object.assign(
          {}, DEFAULT_SETTINGS.namingModels, this.settings.namingModels || {}
        );
        const savedProvider = (this.settings.namingProvider || 'default');
        if (savedProvider !== 'default') {
          this.settings.namingModels[savedProvider] = oldModel;
        }
      }
      delete this.settings.namingModel;
    }

    // Ensure the namingModels map always has all provider keys (safe forward-compat).
    this.settings.namingModels = Object.assign(
      {}, DEFAULT_SETTINGS.namingModels, this.settings.namingModels || {}
    );

    // ── Toggle-states migration ────────────────────────────────────────────
    // If the user has no toggleStates yet (first load after this update),
    // synthesise sensible defaults from the legacy currentMode / cloudApiType
    // values so the button keeps working exactly as before.
    if (!Array.isArray(this.settings.toggleStates) || this.settings.toggleStates.length === 0) {
      const localState = {
        label: 'Local', providerKey: 'local', obsidianIcon: 'monitor-speaker'
      };
      const cloudProvider = this.settings.cloudApiType || 'openai';
      const cloudLabels   = { openai: 'OpenAI', gemini: 'Gemini', anthropic: 'Claude', custom: 'Custom' };
      const cloudState    = {
        label: cloudLabels[cloudProvider] || 'Cloud',
        providerKey: cloudProvider,
        obsidianIcon: 'server'
      };
      this.settings.toggleStates = [localState, cloudState];

      // Align toggleStateIndex with the mode that was active before.
      this.settings.toggleStateIndex = this.settings.currentMode === 'cloud' ? 1 : 0;
    }

    // Ensure each state object has all expected keys (forward-compat + migration
    // from the old iconUrl field which has been removed).
    this.settings.toggleStates = this.settings.toggleStates.map(s => ({
      label:        s.label        ?? 'State',
      providerKey:  s.providerKey  ?? 'local',
      obsidianIcon: s.obsidianIcon ?? 'cpu'
      // iconUrl is intentionally dropped here — no longer stored
    }));

    // Clamp to valid range (max 5 states).
    if (this.settings.toggleStates.length > 5) {
      this.settings.toggleStates = this.settings.toggleStates.slice(0, 5);
    }
    const maxIdx = this.settings.toggleStates.length - 1;
    if (typeof this.settings.toggleStateIndex !== 'number' ||
        this.settings.toggleStateIndex < 0 ||
        this.settings.toggleStateIndex > maxIdx) {
      this.settings.toggleStateIndex = 0;
    }

    // Keep legacy currentMode / cloudApiType in sync with the active state
    // so all existing code that reads those two fields keeps working.
    const _activeState = this.settings.toggleStates[this.settings.toggleStateIndex];
    if (_activeState) {
      if (_activeState.providerKey === 'local') {
        this.settings.currentMode = 'local';
        this.settings.currentMode  = 'cloud';
        this.settings.cloudApiType = _activeState.providerKey;
      }
    }
  }

  // ==================== FILE OPERATIONS (file handling principles + system prompt) ====================

  /** The user's file handling principles (Settings text), or the built-in default when empty. */
  getFileHandlingPrinciples() {
    return this.settings.fileHandlingPrinciples?.trim() ? this.settings.fileHandlingPrinciples : DEFAULT_FILE_HANDLING_PRINCIPLES;
  }

  /**
   * Builds the extra system message describing the AI's file-operation
   * capabilities and current scope, plus the user's file handling principles. Returns null
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

    const principles = this.getFileHandlingPrinciples();

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
      '- patch — path is an existing file; the body holds one or more PATCH blocks. Prefer this over edit whenever you only need to change part of a file. A block can change a single word, part of a line, several adjacent lines, or replace a whole paragraph with any number of new lines. Quotes and code are safe inside blocks. Syntax:',
      '    @@FILE_OP:patch path=\"Notes/todo.md\"@@',
      '    @@PATCH occurrence=all word=yes@@',
      '    @@FIND@@',
      '    exact existing text, copied verbatim (one word, part of a line, or many lines)',
      '    @@WITH@@',
      '    replacement text (any number of lines; leave empty to delete)',
      '    @@END_PATCH@@',
      '    @@END_FILE_OP@@',
      '    Options on the @@PATCH line (both optional):',
      '      occurrence=once    (default) the FIND text must appear exactly once — add 1–3 surrounding lines to make it unique',
      '      occurrence=all     replace EVERY occurrence (rename a variable, global find & replace)',
      '      occurrence=first | last | 3     replace only the first / last / 3rd occurrence',
      '      word=yes           match whole identifiers only, so renaming count does not touch counter or discount',
      '    Put several @@PATCH…@@END_PATCH@@ blocks inside one patch operation to change several places; they are applied top to bottom. If a patch cannot be applied you will be told why and can retry, or fall back to edit with the complete file content.',
      '- copy — path is the source, to is the destination; leave the body empty.',
      '- move / rename — path is the source, to is the destination; leave the body empty.',
      '- list — path is a folder (omit path to list every allowed root at once); add recursive="true" to include subfolders; leave the body empty. Example: @@FILE_OP:list path="Folder"@@@@END_FILE_OP@@',
      '- read — path is a file whose content you want to see; leave the body empty. Example: @@FILE_OP:read path="Folder/Note.md"@@@@END_FILE_OP@@',
      '- search — query is one or more keywords, goal describes in your own words what you\'re trying to find (used to judge relevance, not just keyword-match); leave the body empty. Returns the best-matching file(s) with a similarity percentage, already narrowed down for you — read the top match to confirm before acting on it. Example: @@FILE_OP:search query="invoice pdf generator" goal="find the script that generates PDF invoices so I can rename it descriptively"@@@@END_FILE_OP@@',
      'Always close every block with @@END_FILE_OP@@, even when there is no content between the tags.',
      '',
      'IMPORTANT — when you need information you don\'t have yet (e.g. you must see file names or contents before you can rename, edit, or organize them, or you need to find which file matches a description), reply with ONLY list/read/search operations and nothing else. The results will be sent back to you automatically, and you can then continue — issuing more list/read/search ops if you still need more, or the actual create/edit/copy/move/rename ops once you have what you need. Never ask the user to paste file names or contents you can look up yourself. Prefer search over list+read-everything when you\'re looking for a specific file by topic rather than by exact name.',
      principles
    ].join('\n');
  }
  
  async saveSettings() {
    // Keep legacy currentMode / cloudApiType in sync with the active toggle
    // state so all existing send/request code that reads those fields is correct.
    const _states = this.settings.toggleStates;
    const _idx    = this.settings.toggleStateIndex ?? 0;
    const _active = _states?.[_idx];
    if (_active) {
      if (_active.providerKey === 'local') {
        this.settings.currentMode = 'local';
      } else {
        this.settings.currentMode  = 'cloud';
        this.settings.cloudApiType = _active.providerKey;
      }
    }

    await this.saveData(this._settingsForDisk(this.settings));
    // Refresh both sidebar leaves and dedicated page tab leaves.
    // ChatPageView extends ChatView, so instanceof ChatView catches both.
    const allChatLeaves = [
      ...this.app.workspace.getLeavesOfType(VIEW_TYPE),
      ...this.app.workspace.getLeavesOfType(VIEW_TYPE_CHAT_PAGE)
    ];
    allChatLeaves.forEach(leaf => {
      if (leaf.view instanceof ChatView) {
        leaf.view.updateTokenCounterVisibility();
        leaf.view.updateModeIndicator?.();
      }
    });
  }

  /**
   * Persist settings to disk without triggering any UI re-render.
   * Use this for backend-only options (imageCapabilities, autoNameConversations,
   * autoCheckHealth, fileOpsScope, shortcutsVisible) so the chat component is
   * never unnecessarily rebuilt when those values change.
   */

  onunload() {
    // Remove the AbortError silencer
    if (this._abortErrorSilencer) {
      window.removeEventListener('unhandledrejection', this._abortErrorSilencer);
    }

    // Clean up all active code blocks
    if (this.codeBlockProcessor && this.codeBlockProcessor.activeBlocks) {
        this.codeBlockProcessor.activeBlocks.clear();
    }
    
    // Delete any temporary conversation when unloading the plugin
    if (this._sessionManager) {
        this._sessionManager.deleteTemporary();
    }
    // Write pending index changes (they are normally saved a few seconds after the last change)
    if (this._chatSearch) this._chatSearch.flush().catch(() => {});
    
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

    // Stop local MCP servers, then drop every registered tool (their handlers belong to this plugin instance)
    if (this._mcp) this._mcp.shutdownSync();
    if (this._toolRegistry) this._toolRegistry.clear();
  }
}