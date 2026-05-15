---
Topic: صفحة لترجمة الكلام من اي لغة الى العربي
Translate: true
cssclasses:
  - metadata-no-actions
  - rtl-metadata
icon: lucide-languages
---
The error Dataview (inline field '='): Error: PARSING FAILED occurs because you have typed a single equals sign (=) followed by a space, or a single = in a location that Obsidian and the Dataview plugin interpret as the start of an inline query.Dataview is looking for a command (like file.name) immediately after the = to display, but it finds nothing, causing the parser to fail.How to Fix ItHere are the most common solutions:Escape the equal sign: If you are trying to type a normal = sign (not a formula), put a backslash before it: \=. This tells Dataview to treat it as regular text.Put it in a code block: Use backticks to turn it into inline code: `= `.Complete the query: If you intended to make a query, add a field afterward, for example: = this.file.name.Change the Trigger in Settings: Go to Settings -> Dataview and change the Inline Query Prefix from = to something else, like == or dv: to avoid conflicts.When this typically happens:Typing => (an arrow) mistakenly triggers a query.Typing === (for horizontal rules) causes parsing errors.Adding = (equals with spaces) in the middle of a sentence.Note: If you are trying to use DataviewJS, the inline prefix is usually