---
Topic: Ongoing work
icon: lucide-fish-symbol
Main Categories:
  - Project
tags:
  - Type/Meta/Main-Files
  - Type/Self↑up/knowledge
---
```base
views:
  - type: cards
    name: Table
    filters:
      and:
        - Status == "Ongoing"
        - file.folder != "002 Notes/002 Lessons/00-Matts/Books"
    order:
      - file.name
      - file.mtime
    cardSize: 210
    image: note.banner
    imageAspectRatio: 0.5

```