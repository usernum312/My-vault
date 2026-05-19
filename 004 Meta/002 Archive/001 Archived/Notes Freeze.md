---
links pages:
  - "[[002 My projects]]"
cssclasses:
  - metadata-no-title
  - invert-banner
  - invert-dark
banner: https://images.pexels.com/photos/5104694/pexels-photo-5104694.jpeg
icon: lucide-square-square
---
```base
filters:
  and:
    - file.inFolder("002 Notes/001 Notes/Norm Notes")
views:
  - type: cards
    name: Table
    order:
      - file.name
    sort: []
    cardSize: 220
    image: note.banner
    imageAspectRatio: 0.45

```