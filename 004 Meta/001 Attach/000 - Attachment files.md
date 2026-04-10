---
cssclasses:
  - Link
  - list-cards
  - Headless
  - no-plus
---

```base
filters:
  or:
    - file.folder.startsWith("004 Meta/001 Attach")
    - file.ext.containsAny("pdf", "jpeg", "png", "jpg", "m4a", "mp3", "svg", "mp4")
views:
  - type: cards
    name: Table
    groupBy:
      property: file.ext
      direction: DESC
    order:
      - file.name
    sort:
      - property: file.folder
        direction: DESC
    image: note.banner
    cardSize: 210
    imageAspectRatio: 0.3
    markers: bullet
    indentProperties: false

```

> [!link]- Real Links (Combined)
> - [[Automaticly]]
> - [[Pomodoro v.basic]]
> - [[RandomAya]]
> - [[أذكار الصباح]]
> - [[أذكار المساء]]
> - [[أذكار النوم]]
