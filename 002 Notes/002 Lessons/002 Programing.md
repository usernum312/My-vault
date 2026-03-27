---
icon: lucide-gamepad
tags:
  - Type/Main-Files
  - Self↑up/Programing
banner: ""
cssclasses:
  - Disappear
  - list-cards
  - invert-banner
  - invert-dark-apt
---
```base
filters:
  or:
    - note["The Topic"].contains("Games")
    - note["The Topic"].contains("Dev")
views:
  - type: table
    name: Table
    groupBy:
      property: The Topic
      direction: ASC
    order:
      - file.name
      - file.ctime
      - file.tags

```

> [!link]- Real Links (Base)
> - [[log - 2026-03-03]]
> - [[Noise in the games]]
> - [[Log - How to learn]]
> - [[Fully Ai Game]]
> - [[User experience]]
> - [[noise images dev]]

