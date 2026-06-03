---
icon: lucide-map-pinned
tags:
  - Type/Meta/Main-Files
  - Type/Meta
links pages:
  - "[[Dashboard]]"
  - "[[Learn Something]]"
banner: https://i.ytimg.com/vi/ML0WQlQgu3w/maxresdefault.jpg
cssclasses:
  - invert-banner
  - metadata-no-title
  - list-cards
node_size: 30
aliases:
  - Map of learning
  - Map of content
banner_y: 45
Categories:
  - "[[001 Dashboards|MOC]]"
  - "[[Management]]"
---
##### Main Files
```base
views:
  - type: table
    name: Main Files
    filters:
      and:
        - file.folder == "002 Notes/002 Lessons/00-Bases"
        - '!file.name.contains("00-Map of content")'
    order:
      - file.name
  - type: table
    name: The content
    filters:
      and:
        - file.folder.startsWith("002 Notes/002 Lessons/00-Matts")
        - '!file.hasTag("Type/Meta/Main-Files")'
    groupBy:
      property: file.links
      direction: ASC

```

> [!link]- Real Links (Base)
> - [[001 The Courses]]
> - [[002 Programing]]
> - [[003 Books]]
> - [[004 Physics]]
> - [[005 Animation]]
> - [[006 Cyber Security]]
> - [[007 Electric Circuit]]
> - [[008 Learn English]]