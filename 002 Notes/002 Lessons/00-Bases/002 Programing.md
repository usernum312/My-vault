---
icon: lucide-code-xml
tags:
  - Type/Meta/Main-Files
  - Self↑up/Programing
banner: https://bvmtechnology.com/img/application-development.jpg
cssclasses:
  - list-cards
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
