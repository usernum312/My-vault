---
icon: lucide-square-dashed-mouse-pointer
Categories:
  - "[[Learning|Learning]]"
  - "[[Web|Web]]"
  - "[[Interesting|Interesting]]"
link pages:
  - "[[YouTube]]"
  - "[[Quotes as images]]"
banner: https://cdn.create.vista.com/api/media/small/611756510/stock-vector-grunge-black-interesting-word-rubber-seal-stamp-white-background
cssclasses:
  - invert-banner
  - recolor-images
  - dashboard
  - center-title
  - rm-lk-ln
tags:
  - Type/External-Content/Internet
Status: Ongoing
---
#### [[Internet]] & Interesting
```base
filters:
  and:
    - file.tags.contains("Type/External-Content/Internet")
    - or:
        - file.folder == "004 Meta/003 External Content/001 Digital CLippings"
        - Categories.containsAny("interesting")
views:
  - type: cards
    name: Table
    order:
      - file.name
      - link source
    sort:
      - property: file.ctime
        direction: ASC
    imageAspectRatio: 0.3
    cardSize: 240
    image: note.banner

```
#### [[YouTube|YouTube]]
##### فيديوهات سوف اشاهدها
- ![](https://youtu.be/CrQG586W9NQ)
##### فيديوهات [[Tathakar|تذكير]]

![[Tathakar]]