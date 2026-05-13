---
icon: lucide-graduation-cap
tags:
  - Type/Meta/Main-Files
  - Self↑up/knowledge
banner: https://every-tuesday.com/wp-content/uploads/2016/04/courses.jpg
cssclasses:
  - metadata-no-title
  - list-cards
  - invert-banner
Categories:
  - MOC
  - Management
  - Course
Main Categories:
  - Meta
  - Learn
---
```base
filters:
  and:
    - Categories.contains("Course")
    - not:
        - file.hasTag("Type/Main-Files")
views:
  - type: table
    name: Table

```

> [!link]- Real Links (Base)
> - [[Ai course]]