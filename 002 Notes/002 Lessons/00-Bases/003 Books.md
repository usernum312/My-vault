---
tags:
  - Type/Meta/Main-Files
  - Type/Meta
  - Type/External-Content/Book
icon: lucide-swatch-book
banner: https://images.unsplash.com/photo-1532012197267-da84d127e765?w=1200&auto=format&fit=crop&q=60&ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxzZWFyY2h8MTV8fGJvb2tzfGVufDB8fDB8fHww
cssclasses:
  - color-images
  - rm-lk-bg
aliases:
  - Books
  - Book's
  - كتب
  - الكتب
  - كتب نافعة
  - كتب دينية
  - كتب مفيدة
  - الكتب النافعة
  - الكتب المفيدة
  - كتب تطوير الذات
Categories:
  - "[[001 Dashboards|MOC]]"
  - "[[Management|Management]]"
  - "[[Interesting|Interesting]]"
Main Categories:
  - Learn
links pages:
  - "[[Book library]]"
  - "[[Quran]]"
link source: "[فتح الكتاب](android-app://com.rajarsheechatterjee.LNReader)"
---
> <span style="font-size: 1.1rem; color: gold;">GOOL:</span> [read](android-app://com.rajarsheechatterjee.LNReader) everyday even read just one page
> ***
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
        - file.inFolder("002 Notes/004 Archived Notes/Snippets/Quote's")
    groupBy:
      property: book
      direction: ASC
    order:
      - file.name
    indentProperties: false

```