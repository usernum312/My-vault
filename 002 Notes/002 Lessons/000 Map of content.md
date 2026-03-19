---
icon: lucide-map-pinned
links pages:
  - "[[Dashboard]]"
banner: https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcRzIg8KgmlGtYJif9lbh_0hyVN8k3wwcdHshBWK5mj6bw&s=10
cssclasses:
  - invert-banner
  - invert-dark
  - Headless
  - list-cards
  - no-plus
node_size: 20
tags:
  - Type/Main-Files
aliases:
  - Map of learning
---
##### Main Files
```base
views:
  - type: table
    name: Main Files
    filters:
      and:
        - file.inFolder("002 Notes/002 Lessons")
        - file.hasTag("Type/Main-Files")
    order:
      - file.name
  - type: table
    name: The content
    filters:
      and:
        - file.folder == "002 Notes/002 Lessons"
        - '!file.hasTag("Type/Main-Files")'
    groupBy:
      property: file.links
      direction: ASC

```

> [!link]- Real Links (Base)
> - [[000 Map of content]]
> - [[001 The Courses]]
> - [[002 Programing]]
> - [[003 Math]]

