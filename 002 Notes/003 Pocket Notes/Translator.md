---
Topic: صفحة لترجمة النصوص من اي لغة الى اللغة العربية
links pages:
  - "[[Web Translator]]"
cssclasses:
  - rtl-metadata
  - metadata-no-actions
icon: lucide-languages
Translate: true
aliases: 
    - مترجم
---
Good call — the real fix isn't just tolerating a space, it's making sure a malformed end:/sound: modifier can never take down the entire reminder. Let me restructure this so the core date/time is captured unconditionally, and the trailing modifiers are parsed leniently afterward — if they're garbled, they're just ignored (reminder still fires), never fatal.
Now I'll replace this block: capture the core date/time unconditionally, then parse whatever trailing text follows via a lenient helper.
Now add the _parseTrailingModifiers helper near _parseEndSpec:
Now update _stripReminderTag to match the same generic "everything up to the closing paren" shape so display stays correct regardless of modifier formatting:
Now let's verify with node — both the original broken syntax (with the stray space) and various other malformations, confirming the core reminder always matches now:
Excellent — confirmed:
The exact line that was silently failing before now matches, and correctly extracts after-sunrise-01m from the messy spaced version.
Reversed sound:/end: order still works.
Even a genuinely garbled end: value (e.g. gibberish) no longer breaks the tag — it just resolves to "no expiry" while the base reminder still fires normally.
Fixed at the root cause, not just the symptom:
What changed: the parser used to require end:/sound: to match a strict, all-or-nothing pattern baked directly into the main regex — if that pattern didn't line up exactly (like a stray space), the entire reminder tag failed to match, silently. Now the regex only requires the core (@date time) or (@date dir-ref Nm) part; everything after that is captured as raw text and handed to a new _parseTrailingModifiers() helper that pulls out end:/sound: leniently.
Practical effect:
Your original file (with end: after-sunrise 01m, space after the colon) now parses correctly — no edit needed on your end going forward for that specific slip.
sound: and end: can appear in either order.
If someone ever writes an end: value so garbled it can't be interpreted at all, the reminder degrades gracefully: it just runs with no expiry, instead of vanishing entirely.
Your 1448-01-19.md file from before still works fine either way now, but the canonical hyphenated form (end:after-sunrise-01m) remains the recommended style since it's unambiguous.