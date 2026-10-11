---
Topic:
  - ready for start working
link pages:
  - "[[Quests]]"
cssclasses:
  - rm-hr-star
Translate: true
icon: lucide-list-start
---
# PRD — AI Assistant for Obsidian: Agent Capabilities Upgrade

## 0. How to read this document

You are a senior full-stack engineer who specializes in Obsidian plugins. This PRD describes an upgrade to my existing plugin. I am attaching its `main.js`.

- Keep code clean, identifiers.
- Requirement IDs (FR-x) are binding. Acceptance criteria (AC) are how I will test.
- **Build on the existing code; do not rewrite it.** Verify every statement in section 3 against the attached file before relying on it.

---

## 1. Overview

### 1.1 Problem
The plugin is a capable chat assistant with vault file operations, but it lacks what modern AI development tools offer: reusable skills, project-style context, memory, delegation, external tools, safe planning, conversation branching and automation.

### 1.2 Goal
Add these capabilities while keeping the plugin predictable, quiet and safe for a personal vault.

### 1.3 Non-goals
- No cloud backend, accounts or telemetry.
- No new AI provider integrations beyond what is needed for tool calling.
- No redesign of the existing chat UI, diff review, settings layout or model catalog.
- No feature, setting, notice or button that is not listed in this document. Unless one of the targeted features needs it to function correctly.

### 1.4 Target user
A single power user who keeps knowledge in an Obsidian vault, uses desktop and possibly mobile, writes in Arabic and English (RTL support must keep working), and wants full control over what the AI reads and writes.

---

## 2. Product principles (non-negotiable)

P1. **Build only what is listed.** If you believe something extra is valuable, mention it in one line and ask first. Do not propose alternative designs for features that are already described here.
P2. **Quiet by default.** No `Notice` popups and no console logs for routine internals (retries, cache hits, folder creation, background work). Errors are short, accurate and say what to do.
P3. **Every feature has a toggle** in the General settings tab, with the default stated in section 7. When a toggle is off the feature costs nothing: no requests, no tokens, no UI.
P4. **Vault safety.** Anything that modifies, moves or deletes existing vault files goes through explicit user confirmation or non-destructive staging (reuse the diff review flow). Creating a missing file or folder inside the AI folder is allowed. Never overwrite or delete user content silently.
P5. **Minimal change.** Reuse existing helpers (settings builders, `requestUrl`, secret storage, model catalog, diff modal). Deliver patches, never the whole file.
P6. **No mixing of concerns** in the system prompt (section 5).
P7. **Secrets** (API keys, MCP tokens, search-service keys, voice-service keys) are stored in `app.secretStorage` when available, never in vault files or logs.

---

## 3. Current state (verify in the attached file)

- Single `main.js` (~16k lines): sidebar and full-page chat views; providers: local, OpenAI, Gemini, Anthropic, custom; per-provider model picker.
- `metadata-category.json` in the plugin folder: cache of model lists and model metadata (names, limits, modalities, reasoning options).
- API keys kept in `app.secretStorage` when available.
- Vault file operations through a text protocol (`@@FILE_OP@@` blocks), assembled by `getFileOpsSystemMessage`, with a diff review modal (`DiffViewModal`).
- Settings section **File handling principles**: one plain text field (`fileHandlingPrinciples`) describing how the AI should handle files. It is not a vault file and unrelated to personality. Injected only on turns involving file operations.
- Per-session **Role** field (`session.systemPrompt`): free text written by the user.
- Editing a sent message currently deletes every message after it (`editUserMessage`).
- Collapsible reasoning panel, auto-naming of conversations, `conversations.json` storage, RTL handling, token counter with context-window warnings.

---

## 4. The AI folder

### 4.1 Concept
One setting, **AI folder**: the user picks a single vault folder. Everything the AI owns lives there. There are no separate path settings for individual features.

### 4.2 Structure
Created automatically, only for items that are missing:

    <AI folder>/
      soul.md      the AI's identity
      memory.md    persistent memory
      user.md      what the AI knows about the user
      Skills/      <skill-name>/SKILL.md
      Commands/    slash commands, one .md file each
      Agents/      subagent definitions, one .md file each

### 4.3 Requirements
FR-F1. Selecting the folder is the user's confirmation. Create the missing structure immediately, silently, without an extra popup.
FR-F2. Never overwrite, move or delete anything that already exists. Re-selecting a folder only fills in what is missing.
FR-F3. If no folder is chosen, every feature that needs it stays inactive. Do not create a default folder.
FR-F4. If the user picks another folder later, create the missing structure there and leave the old folder untouched.
FR-F5. Any other feature that needs vault files stores them inside this folder, in a subfolder named after the feature. Ask me before adding any new top-level item beyond 4.2.
FR-F6. **Not part of this folder:** the place where the AI saves the user's notes. It remains a separate, existing setting that the user chooses freely.
FR-F7. Internal caches (`metadata-category.json`, chat search index, remembered built-in-search failures) stay in the plugin folder, not in the vault.
FR-F8. Files created from templates must be short and contain only a one-line comment explaining their purpose.

AC: choose a folder → all items in 4.2 exist; delete `memory.md` and re-select → only it is recreated; nothing else changes; no notice is shown.

---

## 5. Prompt layers

The system prompt is assembled from separate layers. They are never merged into each other or into user text.

| # | Layer | Source | Injected |
|---|-------|--------|----------|
| 1 | soul | `soul.md` | Always; kept short; contains no tool or file rules |
| 2 | Role | `session.systemPrompt` | Always; the plugin never appends to, rewrites or injects into it |
| 3 | Memory | `memory.md`, `user.md` | When memory is enabled |
| 4 | Skill index | `Skills/` | Names + one-line descriptions only |
| 5 | Task modules | file handling principles + file-operation protocol; plan-mode rules; tool schemas | Only on turns that need them |

FR-L1. File handling principles must never be mixed into Role or soul, and soul must never receive file rules.
FR-L2. Any AI-proposed change to `soul.md`, `memory.md` or `user.md` requires explicit user approval before writing.

---

## 6. Functional requirements

### Phase 0 — Foundation (build first)
FR-0.1. **Tool registry:** name, description, JSON schema, handler, permission class, source (built-in, skill, MCP).
FR-0.2. **Agent loop:** model call → tool calls → permission check → execution → result back to the model. Iteration limit, and a Stop button that always works.
FR-0.3. Decide and justify: keep the text protocol or use native function calling per provider (OpenAI, Anthropic, Gemini); define behavior for local models without tool support.
AC: a built-in test tool can be registered, called by the model, permission-checked, and stopped mid-loop.

### Phase 1 — Extensibility
FR-1.1 **Skills.** Read `Skills/<skill-name>/SKILL.md`. Only name + description enter the context. The full body loads only when the model requests it (for example a `load_skill` tool) or the user invokes the skill.
AC: with 20 skills present, the base prompt contains 20 short entries and no bodies.

FR-1.2 **Slash commands.** Commands backed by `.md` files in `Commands/` (e.g. `/translate`, `/summarize`, `/fix`). Template variables: `{{selection}}`, `{{note}}`. Autocomplete when typing `/`.

FR-1.3 **soul.md.** Injected automatically as layer 1 (see section 5).

FR-1.4 **Subagents.** Definitions in `Agents/` (vault search, translation, review). Each has its own prompt, allowed tools and model choice. The main agent can delegate; results return as a tool result.

FR-1.5 **MCP client.** Connect to MCP servers and expose their tools through the registry. Remote (HTTP) servers on all platforms; stdio servers on desktop only (guard with `Platform.isDesktop`). Tokens stored in `secretStorage`.

FR-1.6 **Event hooks.** Events: `beforeFileWrite`, `afterResponseGenerated`, `onPluginLoad`. Hooks must not run arbitrary JavaScript from the vault; they may run commands or skills, with explicit user approval.

### Phase 2 — Memory & context
FR-2.1 **Persistent memory.** Maintain `memory.md` and `user.md`. The AI may propose updates; the user approves before anything is written.
FR-2.2 **Chat history search.** Keyword search (BM25-style) over past conversations. Index stored in the plugin folder; no embeddings API. Inject a short synthesized summary of the hits.
FR-2.3 **Skill suggestion.** After a complex task, offer (never force) to save the procedure as a draft skill in `Skills/`, editable before saving.
FR-2.4 **Auto context compression.** When the conversation nears the model's context limit (threshold configurable, default 80%), summarize the earliest messages. State what stays verbatim; the user can review or undo the summary. Use the limits already in the model catalog.

### Phase 3 — UX & execution safety
FR-3.1 **Plan mode.** The model writes a step-by-step plan and waits for approval before any file is changed.

FR-3.2 **Mentions.** `@Note`, `@Folder`, `#tag` autocomplete in the input; mentioned content is added as context.

FR-3.3 **Conversation branching** (implement exactly this; do not propose another design — no forking into a new conversation, no checkpoints):

  Settings (General tab):
  - *Conversation branching*: on/off.
  - *Editing a message*: shown only when branching is on. **Create a branch** (default when branching is on) or **Overwrite** (today's behavior: the edited message replaces the old one and everything after it is deleted).

  Two ways to create a branch, both in the long-press menu of a message, next to "Edit":
  - **Edit** (when the setting is "Create a branch"): nothing is deleted. The messages that followed the old version are kept as a branch; a new branch is created containing all earlier messages plus the edited message.
  - **Branch** (new menu item, only when branching is on): creates a branch starting at the chosen message **without editing it**. The new branch holds all messages up to and including that message, unchanged, and the input is ready for the next message. The messages after it stay in the original branch.

  Navigation:
  - Everything stays inside the **same conversation**.
  - Where two paths diverge, show two small arrows below the message ("‹ 2/3 ›"). For an edit they appear below the edited message; for a plain branch, below the message it started from, so they are reachable before the user types anything.
  - Left arrow: the previous branch (the earlier version and every message beneath it). The user can keep chatting there and add messages.
  - Right arrow: back toward the newer branch with its own messages.

  Behavior:
  - Only the active branch is sent to the model. Token counters, auto-naming, context compression, file operations and diff review all operate on the active branch.
  - Existing conversations in `conversations.json` load unchanged as a single branch.
  - Turning the setting off must lose nothing.

  Suggested data model (the implementer may refine and must justify): messages become nodes with `id` and `parentId`; a session stores `activeLeafId`; the active path is the chain from the root to the active leaf; legacy linear arrays migrate to a parent chain on load.

  AC: edit message 3 of 6 → both versions reachable via arrows, each with its own later messages; send a message in the old branch → it appears only there; "Branch" on message 4 → new branch with messages 1–4 and an empty continuation; setting off → all content still readable.

FR-3.4 **Web search & page fetch (hybrid).**
  Settings (General tab):
  - *Web search*: on/off. Default: off.
  - *Search source* (shown when on): **Auto** (default) / **Built-in only** / **External only**.
  - *External search service* (shown when the source can use it): Brave Search API, Tavily, or SearXNG (self-hosted URL, no key). The user picks one. Its key is stored in `secretStorage`. One line under the setting states that queries are sent to the chosen service.

  Behavior in **Auto**:
  - OpenAI, Anthropic, Gemini: use the provider's own built-in web search tool, enabled per request. No extra key.
  - Local and custom endpoints: use the external service.
  - Any model where the provider rejects the built-in tool: use the external service for that model from then on. Detect it with the existing API error classification; remember the result in the plugin folder (not the vault); show no popup.
  - If the external service is needed but not configured, the search tool is simply unavailable for that model and the answer says so in one short sentence.

  External path (depends on Phase 0):
  - Registry tools `web_search` (returns top N results: title, URL, snippet) and `fetch_page` (fetches a URL with `requestUrl` and returns cleaned readable text, size-capped).
  - Built-in path needs no registry tools: the provider returns the results.

  Both paths show the sources as links under the answer.
  Do not guess provider API details: verify from current documentation how to enable each built-in tool and whether the API the plugin uses for that provider supports it, and report anything that requires a different endpoint.

  AC: Gemini + Auto → answer with sources and no external key; local model + Auto + Tavily configured → answer with sources via `web_search`; local model + no service configured → one-sentence explanation, no error popup; setting off → no search tool is sent in any request.

FR-3.5 **Permissions.** `Ask` / `Allow` / `Deny` per tool, scoped by path where relevant, with a whitelist for safe file operations. Default: `Ask`.

FR-3.6 **Scheduled tasks.** Run tasks on a timer or when Obsidian opens. Define what happens to runs missed while Obsidian was closed. Tasks that write files must use staging.

FR-3.7 **Interactive rendering.** Mermaid and tables through `MarkdownRenderer`. Sanitized HTML only inside a sandboxed `iframe`, never via `innerHTML`.

FR-3.8 **Voice (advanced, user-configured).**
  Two independent features, each off by default: *Speech-to-text* (microphone button) and *Text-to-speech* (read aloud).

  Philosophy: the plugin ships no voice service and recommends none. The user is expected to choose a service and write the request themselves, from the API URL to the headers and the request body. If the user is not ready for that, the plugin uses the default (TTS only) or does nothing (STT).

  Custom request editor (one for each feature), with these fields:
  - URL, HTTP method.
  - Headers as JSON. Values may reference stored secrets with `{{secret:NAME}}`; the secret itself is typed in a password field and kept in `secretStorage`.
  - Body mode: JSON / multipart form / raw, plus a body template.
  - Language code (optional), and how to read the response.

  Speech-to-text:
  - Placeholders: `{{audio_base64}}`, `{{audio_file}}` (a file part in multipart), `{{audio_mime}}`, `{{language}}`.
  - Response: a path to the transcript string (for example `text` or `results[0].alternatives[0].transcript`).

  Text-to-speech:
  - Placeholders: `{{text}}`, `{{voice}}`, `{{language}}`.
  - Response: either audio bytes (played directly) or a JSON path to base64 audio plus its MIME type.
  - Default when no custom request is configured: the device's built-in `speechSynthesis` voices (free, no setup).

  **Microphone button** (shown in the chat input only when speech-to-text is on and the configuration is complete: URL, body template and response path):
  - Clean, polished and theme-aware (Obsidian CSS variables), icon `mic`, touch target of at least 40px, keyboard accessible, RTL-safe.
  - Three visible states: idle; recording (subtle pulse, stop icon, elapsed time); transcribing (spinner).
  - One click starts recording, the next click stops and sends the audio to the configured endpoint. The transcript is inserted at the cursor in the input box and is never sent automatically.
  - Recording uses `MediaRecorder`. Verify availability on desktop and on mobile Obsidian and report any limitation.
  - Audio is never written to disk or to the vault, and goes only to the user's endpoint.
  - Errors are one short line: the HTTP status and the service's message, never the API key. A denied microphone permission has its own short message.

  **Read aloud button** on assistant messages (shown only when text-to-speech is on): plays the message with a stop control, using the custom request if configured, otherwise `speechSynthesis`.

  Out of scope: wake word, live streaming transcription, hands-free voice conversation mode.

  AC: speech-to-text off → no microphone button anywhere; on with an incomplete configuration → no button; on with a complete configuration → press, speak, press, text appears in the input; text-to-speech with no custom request → the device voice reads the message.

---

## 7. Settings and defaults (proposed)

All in the General tab unless noted.

| Setting | Default |
|---|---|
| AI folder | not set (all folder-based features inactive) |
| Skills, Slash commands, Subagents | on (inactive until AI folder is set) |
| soul.md injection | on (inactive until AI folder is set) |
| Persistent memory | off |
| Chat history search | off |
| Skill suggestion | off |
| Auto context compression (+ threshold) | off (threshold 80%) |
| MCP client | off |
| Event hooks | off |
| Plan mode available | on (never forced) |
| Mentions | on |
| Conversation branching | off |
| Editing a message (when branching on) | Create a branch |
| Web search | off |
| Search source | Auto |
| External search service | not set |
| Scheduled tasks | off |
| Interactive rendering | on |
| Speech-to-text (microphone) | off |
| Text-to-speech (read aloud) | off (device voices when turned on) |

---

## 8. Non-functional requirements

NFR-1. **Performance:** with every feature off, no measurable change in startup time or memory. Skill, command and memory scans must be lazy and cached; the 16k-line file must not slow down.
NFR-2. **Mobile:** all features work on mobile except those marked desktop-only (stdio MCP). Touch targets for branching arrows, menus and the microphone button must be usable on a phone.
NFR-3. **Compatibility:** existing settings and `conversations.json` data load without migration prompts. Any migration is automatic and lossless.
NFR-4. **RTL:** new UI respects the existing RTL handling.
NFR-5. **Security:** no `eval`, no unsandboxed HTML, no secrets in vault files or logs.
NFR-6. **Errors:** short and accurate; no raw stack traces shown to the user.

---

## 9. Platform constraints to respect

- stdio MCP servers: desktop only.
- Microphone capture uses `MediaRecorder`; availability on mobile Obsidian must be verified.
- Scheduled tasks run only while Obsidian is open.
- `main.js` is a single file with no build step today; do not introduce a build tool without asking.

---

## 10. Delivery plan

1. Phase 0: tool registry and agent loop.
2. AI folder setup (section 4) and soul.md injection.
3. Skills, slash commands, mentions.
4. Conversation branching (touches the data model; do it before features that depend on message history, such as compression and chat search).
5. Memory, compression, chat search.
6. Plan mode, permissions, hooks.
7. Subagents, MCP, web search (built-in path first; the external path needs Phase 0).
8. Scheduled tasks, voice, interactive rendering.

Re-order only with my approval.

---

## 11. Working protocol

**Step 1 — no code.** Reply with:
1. Architecture overview: how the pieces fit into the `Plugin` class, the views, the vault/file APIs and `app.secretStorage`.
2. Your build order with dependencies, compared to section 10.
3. Risks and open questions, at minimum: native function calling vs the text protocol; single file vs a build step; how skills are invoked; where branch data is stored; what "Branch" does on a user message that has no reply yet. (The web search and voice designs are decided in FR-3.4 and FR-3.8; do not ask about them.)

**Then implement one or two features per round, only after I approve.** For each feature deliver:
- exact patches (find/replace with unique anchors, or unified diffs), never the whole file;
- new settings keys, defaults and where they appear;
- files and functions touched;
- short manual test steps mapped to the acceptance criteria.

Before ending a round, re-read sections 2 and 4–6 and confirm that nothing outside the requested scope was added.