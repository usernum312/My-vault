---
icon: lucide-gamepad
tags:
  - Type/Meta/Main-Files
  - Self↑up/Programing
banner: https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcT7T4t4fPZESjszUwZET91figWM1toOfRorodZrC9JXrg&s=10
cssclasses:
  - list-cards
  - invert-banner
  - invert-dark-apt
  - metadata-no-title
aliases:
  - البرمجة
  - برمجة
Main Categories:
- Meta
Categories:
  - "[[001 Dashboards|MOC]]"
  - "[[Management]]"
---
##### أفكار
##### نوتس
```base
filters:
  and:
    - file.folder.startsWith("002 Notes/002 Lessons")
    - or:
        - note["Main Categories"].contains("Programing")
views:
  - type: table
    name: Table
    groupBy:
      property: Main Categories
      direction: ASC
    order:
      - file.name
      - file.ctime
      - file.tags
    sort:
      - property: Categories
        direction: ASC

```
