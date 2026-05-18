---
tags:
  - Type/Meta/Main-Files
icon: lucide-swatch-book
banner: https://images.unsplash.com/photo-1532012197267-da84d127e765?w=1200&auto=format&fit=crop&q=60&ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxzZWFyY2h8MTV8fGJvb2tzfGVufDB8fDB8fHww
cssclasses:
  - color-images
aliases:
  - كتب
  - الكتب
  - الكتب النافعة
  - كتب نافعة
  - الكتب المفيدة
  - كتب مفيدة
  - Book's
  - Books
Categories:
  - "[[001 Dashboards|MOC]]"
  - "[[Management]]"
  - "[[Interesting]]"
Main Categories:
  - Meta
  - Learn
---

```base
views:
  - type: cards
    name: Books
    filters:
      and:
        - file.folder.startsWith("002 Notes/002 Lessons/00-Matts/Books")
    order:
      - tags
      - Topic
    image: note.banner
    cardSize: 340
    imageAspectRatio: 1.3
  - type: list
    name: Quotes
    filters:
      and:
        - file.inFolder("002 Notes/004 Archived Notes/Snippets/Books snippets")
    groupBy:
      property: Book
      direction: ASC
    order:
      - file.name
    indentProperties: false

```