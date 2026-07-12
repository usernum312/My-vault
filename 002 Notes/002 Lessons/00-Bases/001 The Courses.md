---
icon: lucide-graduation-cap
tags:
  - Type/Meta/Main-Files
  - Type/Meta
  - Type/Self↑up/knowledge
banner: https://every-tuesday.com/wp-content/uploads/2016/04/courses.jpg
cssclasses:
  - metadata-no-title
  - list-cards
  - invert-banner
Categories:
  - "[[001 Dashboards|MOC]]"
  - "[[Management|Management]]"
---
```base
filters:
  and:
    - '!file.hasTag("Type/Meta/Main-Files")'
    - or:
        - file.name.contains("course")
        - Categories.contains(link("001 The Courses", "Course"))
views:
  - type: table
    name: Table

```

> [!link]- Real Links (Base)
> - [[Ai course]]
> - [[JavaScript Course]]