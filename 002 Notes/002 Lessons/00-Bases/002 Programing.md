---
icon: lucide-code-xml
Categories:
  - "[[Management|Management]]"
  - "[[001 Dashboards|MOC]]"
  - "[[002 Programing|Programming]]"
tags:
  - Type/Meta/Main-Files
banner: https://bvmtechnology.com/img/application-development.jpg
cssclasses:
  - list-cards
  - metadata-no-title
aliases:
  - البرمجة
  - برمجة
link source:
  - "[free code camp](https://www.freecodecamp.org/learn/javascript-v9/lecture-introduction-to-javascript/what-is-javascript)"
---
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
