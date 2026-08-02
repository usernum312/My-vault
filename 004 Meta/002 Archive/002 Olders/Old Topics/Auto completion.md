---
Categories:
  - "[[Technical Doc's|Technical Doc's]]"
icon: lucide-a-arrow-down
---
**Plugin name:** various complements
**Plugin url:**
1. in Obsidian: obsidian://show-plugin?id=various-complements
2. in GitHub: **[https://github.com/various-complements](https://github.com/tadashi-aikawa/obsidian-various-complements-plugin)**

Settings
```json
{
  "strategy": "default",
  "cedictPath": "./cedict_ts.u8",
  "matchStrategy": "prefix",
  "fuzzyMatch": true,
  "minFuzzyMatchScore": 0.5,
  "matchingWithoutEmoji": true,
  "treatAccentDiacriticsAsAlphabeticCharacters": false,
  "treatUnderscoreAsPartOfWord": false,
  "maxNumberOfSuggestions": 3,
  "maxNumberOfWordsAsPhrase": 3,
  "minNumberOfCharactersTriggered": 0,
  "minNumberOfWordsTriggeredPhrase": 1,
  "complementAutomatically": true,
  "delayMilliSeconds": 0,
  "disableSuggestionsDuringImeOn": false,
  "disableSuggestionsInMathBlock": false,
  "disableSuggestionsInCodeBlock": false,
  "insertSpaceAfterCompletion": false,
  "firstCharactersDisableSuggestions": ":/^",
  "patternsToSuppressTrigger": [
    "^~~~.*",
    "^```.*"
  ],
  "phrasePatternsToSuppressTrigger": [],
  "noAutoFocusUntilCycle": false,
  "showMatchStrategy": false,
  "showComplementAutomatically": false,
  "showIndexingStatus": false,
  "descriptionOnSuggestion": "Short",
  "hotkeys": {
    "select": [
      {
        "modifiers": [],
        "key": "Enter"
      }
    ],
    "select with custom alias": [],
    "select with custom alias and add to aliases": [],
    "select with query alias": [],
    "up": [
      {
        "modifiers": [],
        "key": "ArrowUp"
      }
    ],
    "down": [
      {
        "modifiers": [],
        "key": "ArrowDown"
      }
    ],
    "select 1st": [],
    "select 2nd": [],
    "select 3rd": [],
    "select 4th": [],
    "select 5th": [],
    "select 6th": [],
    "select 7th": [],
    "select 8th": [],
    "select 9th": [],
    "open": [],
    "completion": [],
    "insert as text": []
  },
  "propagateEsc": false,
  "enableCurrentFileComplement": true,
  "currentFileMinNumberOfCharacters": 0,
  "onlyComplementEnglishOnCurrentFileComplement": false,
  "excludeCurrentFileWordPatterns": [],
  "enableCurrentVaultComplement": true,
  "currentVaultMinNumberOfCharacters": 0,
  "includeCurrentVaultPathPrefixPatterns": "",
  "excludeCurrentVaultPathPrefixPatterns": "003 Daily/001 Active Diaries\n003 Daily/002 Archived Diaries\n004 Meta/001 Attach/002 Attachment media\n004 Meta/005 Canva",
  "excludeCurrentVaultPathGlobPatterns": [],
  "includeCurrentVaultOnlyFilesUnderCurrentDirectory": false,
  "excludeCurrentVaultWordPatterns": [],
  "enableCustomDictionaryComplement": true,
  "customDictionaryPaths": "https://raw.githubusercontent.com/first20hours/google-10000-english/master/google-10000-english-no-swears.txt\nhttps://raw.githubusercontent.com/loayamin/arabic-words/master/word-list.txt?hl=en-GB",
  "columnDelimiter": "Tab",
  "customDictionaryWordRegexPattern": "",
  "delimiterToHideSuggestion": "",
  "delimiterToDivideSuggestionsForDisplayFromInsertion": "",
  "caretLocationSymbolAfterComplement": "",
  "displayedTextSuffix": " => ...",
  "enableInternalLinkComplement": false,
  "suggestInternalLinkWithAlias": false,
  "preserveFirstLetterCaseOnInternalLink": false,
  "excludeInternalLinkPathPrefixPatterns": "",
  "excludeInternalLinkPathGlobPatterns": [],
  "excludeSelfInternalLink": false,
  "excludeExistingInActiveFileInternalLinks": false,
  "excludeUnresolvedInternalLinks": false,
  "excludeInternalLinksInCode": false,
  "updateInternalLinksOnSave": true,
  "insertAliasTransformedFromDisplayedInternalLink": {
    "enabled": false,
    "beforeRegExp": "",
    "after": ""
  },
  "frontMatterKeyForExclusionInternalLink": "",
  "tagsForExclusionInternalLink": [],
  "enableFrontMatterComplement": false,
  "frontMatterComplementMatchStrategy": "inherit",
  "insertCommaAfterFrontMatterCompletion": false,
  "currentFileMinNumberOfCharactersForTrigger": 0,
  "currentVaultMinNumberOfCharactersForTrigger": 0,
  "customDictionaryMinNumberOfCharactersForTrigger": 0,
  "internalLinkMinNumberOfCharactersForTrigger": 0,
  "intelligentSuggestionPrioritization": {
    "enabled": false,
    "historyFilePath": "",
    "prettyPrintHistoryFile": false,
    "maxDaysToKeepHistory": 30,
    "maxNumberOfHistoryToKeep": 0
  },
  "disableOnMobile": false,
  "showLogAboutPerformanceInConsole": false
}
```
### Settings explain 
Based on the extensive main.ts file you provided, here is a detailed explanation of all the settings for the "Various Complements" Obsidian plugin, grouped by their categories in the settings tab.

Main Settings

These settings control the core behavior of the autocomplete engine.

· Strategy: Determines the tokenization (word-splitting) method. This affects what the plugin considers a "word" for indexing and completion. Options include Default, English-only, Japanese, Chinese, Arabic, and Korean. The choice dictates how the plugin handles different languages and character sets.
· CC-CEDICT path: (Visible when Strategy is Chinese). Specifies the path to the cedict_ts.u8 file, which is a Chinese-English dictionary used by the Chinese tokenizer. You need to download this file separately.
· Match strategy: Defines how the plugin matches your query against indexed words.
  · prefix: Matches words that start with your input. This is the fastest and most common method.
  · partial: Matches words that contain your input anywhere within them. The warning in the settings mentions it's slower than prefix.
· Fuzzy match: When enabled, allows for matches even if you make small typos. It uses a scoring system to find the closest matches.
· Min fuzzy match score: Sets a threshold (from 0 to 5) for the "Fuzzy match" score. Only suggestions with a score higher than this value will be shown. This helps filter out poor fuzzy matches.
· Treat accent diacritics as alphabetic characters: If enabled, characters with accents (e.g., á, è, ü) are treated the same as their base letters (e.g., a, e, u). This means a search for aaa can match áaä.
· Treat an underscore as a part of a word: If enabled, aaa_bbb is treated as a single token aaa_bbb instead of two separate tokens aaa and bbb.
· Matching without emoji: If enabled, emojis are ignored during matching. For example, aaa will match 😄aaa.
· Max number of suggestions: Limits the number of suggestions shown in the popup (1-255).
· Max number of words as a phrase: Allows the plugin to consider multiple words together (e.g., "New York") for autocomplete. A higher value makes the plugin slower.
· Min number of characters for trigger: The minimum number of characters you must type before the autocomplete popup appears. Setting this to 0 uses the default threshold for the chosen Strategy.
· Min number of words for trigger: The minimum number of words in a phrase before the autocomplete popup appears.
· Complement automatically: If enabled, the popup appears automatically as you type. If disabled, you must manually trigger it with a command/hotkey.
· Delay milli-seconds for trigger: Adds a delay (in milliseconds) before the plugin starts searching after you stop typing, to improve performance.
· Disable suggestions during IME on: Prevents the popup from showing while an Input Method Editor (IME), like those used for Japanese or Chinese, is active.
· Disable suggestions in the Math block: Prevents the popup from showing within code blocks that are designated as math blocks.
· Disable suggestions in the Code block: Prevents the popup from showing within code blocks.
· Insert space after completion: Automatically adds a space after you select a suggestion.
· First characters to disable suggestions: Typing a character from this list at the start of a word will prevent the popup from showing.
· Line patterns to suppress trigger: A list of regular expressions. If the current line (until the cursor) matches any of these patterns, autocomplete will be suppressed.
· Phrase patterns to suppress trigger: A list of regular expressions. If the current phrase (the word you're typing) matches any pattern, autocomplete for that phrase will be suppressed.
· No auto-focus until the cycle: Prevents the first suggestion from being automatically selected when the popup appears. You must use the "up"/"down" keys to select one.

Appearance Settings

· Show Match strategy: Displays the current "Match strategy" (prefix/partial) on the Obsidian status bar. This requires a restart to apply.
· Show Complement automatically: Displays the current "Complement automatically" state (auto/manual) on the status bar. This requires a restart.
· Show Indexing status: Shows the word counts for each provider (Current File, Current Vault, etc.) on the status bar. This requires a restart.
· Description on a suggestion: Controls what, if any, additional information is shown next to a suggestion.
  · None: Shows only the suggestion.
  · Short: Shows a shortened version of the description (e.g., the filename for a vault suggestion).
  · Full: Shows the complete description.

Key Customization

· Hotkeys: Allows you to customize keybindings for various actions within the popup (e.g., Select, Select 1st, Select with custom alias, Up, Down, Open, Completion, Insert as text). You can define multiple keys by using a pipe (|), like Enter|Tab.
· Propagate ESC: If enabled, pressing the ESC key will both close the popup and, if you're using Vim mode, return to Normal mode.

Current File Complement

These settings control suggestions derived from the content of the file you are currently editing.

· Enable Current file complement: Toggles this feature on/off.
· Min number of characters for indexing: Sets the minimum length of words from the current file that will be indexed for suggestions.
· Only complement English on current file complement: Only words composed of English letters will be indexed from the current file.
· Min number of characters for trigger: Overrides the global "Min number of characters for trigger" specifically for this provider.
· Exclude word patterns for indexing: A list of regular expressions. Any word in the current file that matches these patterns will be excluded from the suggestions.

Current Vault Complement

These settings control suggestions derived from all files in your Obsidian vault.

· Enable Current vault complement: Toggles this feature on/off.
· Min number of characters for indexing: Sets the minimum length of words from the vault that will be indexed.
· Include prefix path patterns: Only files whose paths start with these strings will be scanned.
· Exclude prefix path patterns: Files whose paths start with these strings will be excluded from scanning.
· Exclude path glob patterns: Exclude files using glob patterns (e.g., **/attachments, **/*.png). This is more flexible but slower.
· Include only files under current directory: If enabled, only files in the same directory as the currently open file will be scanned.
· Min number of characters for trigger: Overrides the global trigger setting specifically for this provider.
· Exclude word patterns for indexing: A list of regular expressions for words from the vault to be excluded from suggestions.

Custom Dictionary Complement

These settings control suggestions from external lists of words or phrases you define.

· Enable Custom dictionary complement: Toggles this feature on/off.
· Custom dictionary paths: A newline-separated list of paths to dictionary files, which can be local (relative to vault root) or URLs. It also supports .json files for more structured dictionaries.
· Column delimiter: The delimiter used to separate parts of a line in a text dictionary file (e.g., Tab, Comma, Pipe).
· Word regex pattern: Only words matching this regular expression will be loaded from the dictionary.
· Delimiter to hide a suggestion: If defined (e.g., ;;;), the text after this delimiter in a dictionary entry is hidden on the suggestion list but included when inserted.
· Delimiter to divide suggestions for display from ones for insertion: If defined (e.g.,  >>> ), the text before the delimiter is shown in the popup, but the text after it is inserted into the editor.
· Caret location symbol after complement: A symbol (e.g., <CARET>) that, when present in a dictionary entry, will move the cursor to its position after insertion.
· Displayed text suffix: Text shown next to a suggestion when the displayed and inserted text differ.
· Min number of characters for trigger: Overrides the global trigger setting for this provider.

Internal Link Complement

These settings control suggestions for [[Internal Links]].

· Enable Internal link complement: Toggles this feature on/off.
· Suggest with an alias: When selected, the suggestion inserted will be a link with an alias (e.g., [[Target File|Alias Text]]) based on the text you're typing.
· Preserve first-letter case: Ensures that the case of the first letter of the alias matches the case of your typed query.
· Update internal links on save: Automatically refreshes the list of internal links when a file is saved, updating them to reflect any changes (like renamed files).
· Exclude self internal link: Removes suggestions for the currently open file itself.
· Exclude existing in active file internal links: Removes suggestions for links that are already used in the current file.
· Exclude unresolved internal links: Removes suggestions for links that point to non-existent files (phantom links).
· Exclude internal links in code: Suppresses internal link suggestions when the cursor is inside a code block or inline code.
· Insert an alias that is transformed from the displayed internal link: Allows you to define a regex pattern to transform the link before inserting it as an alias.
  · Before: regular expression pattern with captures: The regex pattern to apply to the link text.
  · After: The replacement string, which can use captured groups (e.g., $<name>).
· Exclude prefix path patterns: Similar to vault settings, excludes links whose target file path starts with these strings.
· Exclude path glob patterns: Similar to vault settings, excludes links using glob patterns.
· Front matter key for exclusion: If a target file has a frontmatter key with this name and the value true, its link will be excluded.
· Tags for exclusion: If a target file has any of these tags, its link will be excluded.
· Min number of characters for trigger: Overrides the global trigger setting for this provider.

Front Matter Complement

These settings control suggestions for values within your YAML frontmatter.

· Enable Front matter complement: Toggles this feature on/off.
· Match strategy in the front matter: Allows you to use a different Match strategy (inherit, prefix, partial) specifically when completing frontmatter.
· Insert comma after completion: Automatically adds a comma after selecting a frontmatter suggestion, useful for lists.

Intelligent Suggestion Prioritization

These settings manage the "intelligent" algorithm that learns your preferences and reorders suggestions based on your selection history.

· Enable Intelligent Suggestion Prioritization: Toggles this feature on/off.
· history file path: Specifies where the selection history file is stored.
· Pretty-print history file: Saves the history file in a human-readable (indented) format.
· Max days to keep history: Automatically removes history entries older than this number of days (0 = never remove).
· Max number of history to keep: Limits the total number of history entries (0 = no limit).

Mobile Settings

· Disable on mobile: Completely disables the plugin when running on a mobile device.

Debug Settings

· Show log about performance in a console: Outputs performance-related logs to the developer console, which can be helpful for debugging.

***

You're absolutely right! The "complement" sections can be confusing. Let me break down what "complement" means in this context and explain each section in plain, everyday language.

What Does "Complement" Mean Here?

"Complement" in this plugin means "autocomplete" or "suggest words as you type".

Think of it like your phone's keyboard suggesting the next word, but much more powerful. The plugin looks at different sources of text in your Obsidian vault and suggests words/phrases from those sources while you're typing.

---

Current File Complement

What it does: Suggests words and phrases that appear elsewhere in the file you're currently editing.

Example: You're writing a note about "Project Alpha." If you've already typed "Project" somewhere in the file, when you start typing "Pro" again, the plugin will suggest "Project."

Settings Explained:

Setting What it means in plain English
Enable Current file complement Turn this on to get suggestions from the file you're editing right now.
Min number of characters for indexing How long a word must be to be remembered. If set to 3, words like "a" or "an" won't be suggested, but "and" will.
Only complement English on current file complement Only suggest English words. Ignores Chinese, Japanese, emojis, etc.
Min number of characters for trigger How many characters you must type before suggestions appear. Set to 2 means you type "Pr" and it suggests "Project."
Exclude word patterns for indexing Words you DON'T want suggested. You can use patterns (regex) like ^temp to ignore all words starting with "temp".

---

Current Vault Complement

What it does: Suggests words and phrases that appear anywhere in all the notes in your vault.

Example: You have a note called "Meeting Notes" that contains the word "quarterly_report." When you're writing in a completely different note and type "quarter," the plugin suggests "quarterly_report" because it remembers it from elsewhere in your vault.

Settings Explained:

Setting What it means in plain English
Enable Current vault complement Turn this on to search through ALL your notes for suggestions.
Min number of characters for indexing Minimum word length to be included in the vault-wide suggestion list.
Include prefix path patterns Only look in folders that start with these names. Example: "Work/" means only look in the Work folder.
Exclude prefix path patterns Don't look in folders that start with these names. Example: "Private/" means ignore everything in the Private folder.
Exclude path glob patterns Don't look in files/folders that match these patterns. Examples: **/attachments = ignore all "attachments" folders; **/*.png = ignore all image files.
Include only files under current directory Only search files in the SAME folder as the file you're editing. Ignore files in other folders.
Min number of characters for trigger How many characters to type before suggestions appear (specific to vault suggestions).
Exclude word patterns for indexing Words you never want suggested from the vault (e.g., ^draft to ignore all words starting with "draft").

---

Custom Dictionary Complement

What it does: Suggests words/phrases from a custom list you create (like a personal dictionary).

Example: You're a programmer and often type "function_debug_utility." You can add this to your custom dictionary file, and whenever you type "func," the plugin will suggest the full term.

Settings Explained:

Setting What it means in plain English
Enable Custom dictionary complement Turn this on to use your own word lists.
Custom dictionary paths The location of your custom dictionary file(s). You can use text files, JSON files, or even web URLs.
Column delimiter If your dictionary uses columns (like Tab-separated or Comma-separated values), this tells the plugin how to read it.
Word regex pattern Only load dictionary entries that match this pattern. Use this to filter out unwanted entries.
Delimiter to hide a suggestion Hide part of an entry from the suggestion popup. Example: "project
Delimiter to divide suggestions for display from ones for insertion Show one thing, insert another. Example: "Quarterly Report >>> q_report" shows "Quarterly Report" but inserts "q_report."
Caret location symbol after complement Place the cursor somewhere specific after insertion. Example: If your dictionary has "div<CARET></div>", it inserts "div</div>" and places the cursor between them.
Displayed text suffix Adds a suffix to entries where the displayed text differs from the inserted text (like adding " => ...").
Min number of characters for trigger How many characters to type before custom dictionary suggestions appear.

---

Internal Link Complement

What it does: Suggests [[Internal Links]] to other notes as you type.

Example: You're typing [[Pro... and the plugin suggests [[Project Alpha]], [[Project Beta]], and [[Progress Report]] - all existing notes in your vault.

Settings Explained:

Setting What it means in plain English
Enable Internal link complement Turn this on to get suggestions for note links.
Suggest with an alias Instead of just [[Project Alpha]], it suggests `[[Project Alpha
Preserve first-letter case If you type "pro" (lowercase), it inserts the alias as "pro" even if the note is "Project."
Update internal links on save Automatically updates the suggestion list when you rename/move notes.
Exclude self internal link Don't suggest the note you're currently editing.
Exclude existing in active file internal links Don't suggest links you've already used in this file.
Exclude unresolved internal links Don't suggest links to notes that don't exist (broken links).
Exclude internal links in code Don't suggest internal links if you're typing inside a code block.
Insert an alias that is transformed from the displayed internal link Automatically modify the link before inserting. Example: Turn "Project_Alpha_2024" into "Project Alpha" automatically.
Exclude prefix path patterns Don't suggest links to notes in certain folders (e.g., "Private/").
Exclude path glob patterns Don't suggest links based on glob patterns (e.g., **/archive/*).
Front matter key for exclusion If a note has a specific frontmatter key set to "true," don't suggest it.
Tags for exclusion Don't suggest notes that have certain tags.
Min number of characters for trigger How many characters to type before link suggestions appear.

---

Front Matter Complement

What it does: Suggests values for YAML frontmatter fields (the metadata at the top of your notes).

Example: You're editing a note and start typing tags: [pro... in the frontmatter, and the plugin suggests project, productivity, programming - all tags you've used before.

Settings Explained:

Setting What it means in plain English
Enable Front matter complement Turn this on to get suggestions for frontmatter fields.
Match strategy in the front matter How to match frontmatter values - you can use a different strategy here than in the main settings.
Insert comma after completion Automatically add a comma after selecting a suggestion (helpful for lists in frontmatter like aliases or tags).

---

Putting It All Together: A Real-World Example

Imagine you're writing a daily work journal:

1. Current File Complement helps you reuse "quarterly_report" and "stakeholder_meeting" you've already typed in today's note.
2. Current Vault Complement suggests "Project_Alpha" and "Project_Beta" from ANY note in your entire vault.
3. Custom Dictionary Complement gives you "function_debug_utility" and "error_handling_try_catch" from your personal dictionary of programming terms.
4. Internal Link Complement helps you create links like \[\[2024-Q4 Goals\]\] as you type.
5. Front Matter Complement suggests tags like \#work, \#project-alpha when you're editing the metadata at the top of your note.

Each source works together to give you the most helpful suggestions based on the context of what you're typing!
