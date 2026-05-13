---
ui: preview
banner: https://images.pexels.com/photos/5380642/pexels-photo-5380642.jpeg
node_size: 20
cssclasses:
  - dashboard
  - list-cards
Categories:
  - MOC
  - Management
Main Categories:
  - Meta
---

```base
filters:
  and:
    - '!file.name.contains("Tem")'
    - or:
        - note["Main Categories"].contains("Project")
views:
  - type: table
    name: Table
    order:
      - file.name
      - file.tags
    sort: []
    summaries: {}
    rowHeight: medium
    markers: bullet
    columnSize:
      file.links: 199

```
