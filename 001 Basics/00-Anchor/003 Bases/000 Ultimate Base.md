---
ui: preview
cssclasses:
  - center-everything
  - list-cards
  - card
  - rm-lk-ln
links pages:
  - "[[Dashboard]]"
node_size: 30
banner: https://cdn.prod.website-files.com/67ed1b4292dbe69e554efba1/69b03491fa12999cfff68d64_qRZ6eUJ.jpeg
banner_y: 64
Categories:
  - "[[001 Dashboards|MOC]]"
  - "[[Management|Management]]"
tags:
  - Type/Meta/Main-Files
  - Type/Meta
---
## CATEGORIES
```base
views:
  - type: cards
    name: Table
    filters:
      and:
        - "!Categories.isEmpty()"
    groupBy:
      property: Categories
      direction: ASC
    order:
      - file.name
      - Categories
      - Main Categories
    imageAspectRatio: 1
    cardSize: 200

```
## [[DASHBOARD|MY PROJECTS]]
![[002 My projects]]
## [[MY NOTES]]
![[My Notes]]
## THE TRACKER
![[Tracker A]]