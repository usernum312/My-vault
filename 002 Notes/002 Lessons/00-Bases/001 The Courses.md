---
icon: lucide-graduation-cap
tags:
  - Type/Meta/Main-Files
  - Type/Meta
  - Self↑up/knowledge
banner: https://every-tuesday.com/wp-content/uploads/2016/04/courses.jpg
cssclasses:
  - metadata-no-title
  - list-cards
  - invert-banner
Categories:
  - "[[001 Dashboards|MOC]]"
  - "[[Management]]"
---
```base
filters:
  and:
    - Categories.contains(link("001 The Courses", "Course"))
    - not:
        - file.hasTag("Type/Meta/Main-Files")
views:
  - type: table
    name: Table

```

> [!link]- Real Links (Base)
> - [[Ai course]]