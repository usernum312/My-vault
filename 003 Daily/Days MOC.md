---
cssclasses:
  - invert-banner
  - invert-dark
  - metadata-no-actions
node_size: 15
banner: https://images.pexels.com/photos/5386754/pexels-photo-5386754.jpeg
icon: lucide-calendar-cog
---
## Days
```base
filters:
  and:
    - file.inFolder("003 Daily/001 Active Diaries")
views:
  - type: cards
    name: Table
    sort:
      - property: file.name
        direction: DESC
    cardSize: 220
    image: note.banner
    imageAspectRatio: 0.5

```
### Diaries
```base
views:
  - type: table
    name: Table
    filters:
      and:
        - file.folder.contains("Diaries log")

```
### Learn
```base
views:
  - type: table
    name: Table
    filters:
      and:
        - file.folder.startsWith("002 Notes/002 Lessons/Log")

```