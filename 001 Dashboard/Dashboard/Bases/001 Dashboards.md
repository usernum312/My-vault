---
links pages:
  - "[[Dashboard]]"
cssclasses:
  - Headless
  - no-plus
  - list-cards
  - Link
banner: https://images.pexels.com/photos/32026177/pexels-photo-32026177.jpeg
---

```base
filters:
  or:
    - file.inFolder("001 Dashboard")
    - or:
        - file.hasLink("002 Notes/002 Lessons/000 Map of content")
        - and:
            - file.inFolder("002 Notes/002 Lessons")
            - file.tags.containsAny("Type/Main-Files")
views:
  - type: cards
    name: Table
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
> - [[003 Notes]]
> - [[004 My notes]]
> - [[005 Diaries]]
> - [[Dashboard]]
> - [[Tracker A]]
> - [[Tracker B]]
> - [[Tracker Q]]
> - [[Diny]]
> - [[Interesting topic]]
> - [[El Rasoul Mohamed]]
> - [[My Mother & father]]
> - [[My self -Anna-]]
> - [[Self Education]]
> - [[learn English]]
> - [[points of my knowledge]]

