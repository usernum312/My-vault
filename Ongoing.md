---
Topic: Ongoing work
icon: lucide-fish-symbol
Main Categories:
  - Project
---
```base
views:
  - type: cards
    name: Table
    filters:
      and:
        - Status == "Ongoing"
        - file.folder != "002 Notes/002 Lessons/00-Matts/Books"
    cardSize: 210
    image: note.banner
    imageAspectRatio: 0.5
```