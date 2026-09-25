---
icon: lucide-logs
---
```base
filters:
  and:
    - file.folder.contains("Log")
    - '!file.folder.contains("Dia")'
    - file.name != "Learning Logs"
views:
  - type: cards
    name: Table
    order:
      - file.name
      - Categories
    cardSize: 210
    image: note.banner
    imageAspectRatio: 0.4

```
###### <!-- navigation -->
![[Navigator]]
