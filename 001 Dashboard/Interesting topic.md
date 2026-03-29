---
icon: lucide-square-dashed-mouse-pointer
The Topic:
  - Learning
  - Web
links pages:
  - "[[YouTube]]"
  - "[[Quotes]]"
banner: https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcQJShHBWwcAi8tdOP3G7E_YVFEYR76-DdWUqgq3AHPxBw&s=10
cssclasses:
  - invert-banner
  - recolor-images
  - dashboard
  - center-title
tags:
  - Type/Quick-Notes
  - Type/Internet
---
#### [[Internet]] & Interesting
```base
filters:
  and:
    - file.tags.contains("Type/Internet")
    - '!note["link sourse"].isEmpty()'
    - or:
        - file.folder == "004 Meta/003 External Content/001 Digital CLippings"
        - note["The Topic"].containsAny("internet", "interesting")
views:
  - type: cards
    name: Table
    order:
      - file.name
      - file.backlinks
    imageAspectRatio: 0.3
    cardSize: 240
    image: note.banner

```
#### [[YouTube|YouTube]]
##### فيديوهات سوف اشاهدها
- ![](
##### فيديوهات محفوظة

- [ادارة الوقت - المسؤولية /قناة رمادي](https://youtu.be/5q8qst3-dAg?si=SvPG-Jg6i78myBI-)
- [ماتت أمي - آخر مرة اراها /يوسف القط](https://youtu.be/zBsLsGFufdg)
##### فيديوهات [[Tathakar|تذكير]]

![[Tathakar]]