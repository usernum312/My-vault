---
link pages:
  - "[[002 My projects]]"
cssclasses:
  - metadata-no-title
  - invert-banner
  - invert-dark
banner: https://images.pexels.com/photos/5104694/pexels-photo-5104694.jpeg
icon: lucide-square-square
---
```base
views:
  - type: cards
    name: Table
    filters:
      or:
        - file.inFolder("002 Notes/003 Pocket Notes")
        - file.inFolder("002 Notes/001 Notes")
    order:
      - file.name
    sort: []
    cardSize: 220
    image: note.banner
    imageAspectRatio: 0.45
  - type: cards
    name: All Notes
    filters:
      and:
        - file.path.startsWith("004 Meta/002 Archive")
    image: note.banner
    cardSize: 220
    imageAspectRatio: 0.45

```