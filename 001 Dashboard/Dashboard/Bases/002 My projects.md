---
ui: preview
cssclasses:
  - dashboard
  - list-cards
  - Link
  - Disappear
banner: https://images.pexels.com/photos/5380642/pexels-photo-5380642.jpeg
node_size: 20
---

```base
filters:
  and:
    - file.folder.contains("00")
    - '!file.name.contains("Tem")'
    - or:
        - note["The Topic"].contains("Project")
        - file.tags.contains("programming")
views:
  - type: table
    name: Table
    groupBy:
      property: The Topic
      direction: ASC
    order:
      - file.name
      - file.links
      - file.tags
    sort: []
    summaries: {}
    rowHeight: medium
    markers: bullet
    columnSize:
      file.links: 199

```

> [!link]- Real Links (Base)
> - [[Quran Tajwid colors]]