---
icon: lucide-bug
cssclasses:
  - list-cards
Main Categories:
  - Programing
  - Meta
Categories:
  - Cyber Security
  - Hacking
tags:
  - Type/Meta/Main-Files
  - Self↑up/knowledge
  - Self↑up/Programing
  - Self↑up/Cyber-Security
banner: https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcSEvl0gHHlUW8e8aANP_37yexhfhYuuw9CzeaHX-4ACoA&s=10
aliases:
  - الأمن السيبراني
---
> Cyber Security: I love know how web and device's work and i love when i can get bug
```base
filters:
  and:
    - '!file.tags.contains("Type/Main-Files")'
    - or:
        - file.tags.contains("Self↑up/Cyber-Security")
        - Categories.containsAny("Hacking", "Cyber Security")
views:
  - type: table
    name: Table
    order:
      - file.name
      - file.links

```
>[!link] links
> - [[Broot Force attack]]
> - [[Broot force Attack Visual]]