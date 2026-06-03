---
tags:
  - Type/Meta/Main-Files
Categories:
  - "[[001 Dashboards|MOC]]"
  - "[[Management]]"
links pages:
  - "[[Dashboard]]"
cssclasses:
  - metadata-no-title
  - list-cards
banner: https://images.pexels.com/photos/32026177/pexels-photo-32026177.jpeg
---

```base
filters:
  or:
    - file.inFolder("001 Dashboard")
    - file.inFolder("001 Basics")
    - or:
        - file.hasLink("002 Notes/002 Lessons/000 Map of content")
        - and:
            - file.inFolder("002 Notes/002 Lessons")
            - file.tags.containsAny("Type/Meta/Main-Files")
views:
  - type: cards
    name: Table
    groupBy:
      property: file.folder
      direction: ASC
    sort:
      - property: file.folder
        direction: ASC
      - property: file.name
        direction: DESC
      - property: file.name
        direction: ASC
    imageAspectRatio: 0.45
    image: note.banner
    cardSize: 210

```

> [!link]- Real Links (Base)
> - [[Athkar & Adia]]
> - [[Azkaru]]
> - [[000 Ultimate Base]]
> - [[001 Dashboards]]
> - [[002 My projects]]
> - [[Notes Freeze]]
> - [[My Notes]]
> - [[Days MOC]]
> - [[Dashboard]]
> - [[El Rasoul Mohamed]]
> - [[My Mother & father]]
> - [[My self -Anna-]]
> - [[Tracker A]]
> - [[Tracker B]]
> - [[Tracker Q]]
> - [[Diny]]
> - [[Interesting topic]]
> - [[Quran]]
> - [[Self Education]]
> - [[008 Learn English]]
> - [[MY Knowledge's]]