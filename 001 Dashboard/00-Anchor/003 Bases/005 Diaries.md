---
cssclasses:
  - Headless
  - no-plus
  - invert-banner
  - invert-dark
  - Link
node_size: 15
banner: https://images.pexels.com/photos/5386754/pexels-photo-5386754.jpeg
---
```base
filters:
  and:
    - file.inFolder("003 Daily/001 Active Diaries")
views:
  - type: cards
    name: Table
    sort:
      - property: file.name
        direction: DESC
    cardSize: 220
    image: note.banner
    imageAspectRatio: 0.5

```