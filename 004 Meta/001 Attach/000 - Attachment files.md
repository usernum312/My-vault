---
cssclasses:
  - Link
  - list-cards
  - Headless
  - no-plus
---

```base
views:
  - type: cards
    name: All
    filters:
      or:
        - file.folder.startsWith("004 Meta/001 Attach")
        - file.folder.startsWith("004 Meta/001 Attach/002 Attachment media")
        - file.folder.startsWith("004 Meta/001 Attach/001 Attach Embedded")
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
  - type: table
    name: Media Attachments
    filters:
      or:
        - file.ext.containsAny("pdf", "jpeg", "png", "jpg", "m4a", "mp3", "svg", "mp4")
        - '!file.ext.containsAny("md", "canvas", "base")'
        - file.folder.contains("004 Meta/001 Attach/002 Attachment media")
    groupBy:
      property: file.ext
      direction: ASC
  - type: table
    name: Files attachment
    filters:
      or:
        - file.folder.startsWith("004 Meta/001 Attach/001 Attach Embedded")
    groupBy:
      property: file.folder
      direction: ASC

```

> [!link]- Real Links (Combined)
> - [[Automaticly]]
> - [[Pomodoro v.basic]]
> - [[RandomAya]]
> - [[أذكار الصباح]]
> - [[أذكار المساء]]
> - [[أذكار النوم]]
