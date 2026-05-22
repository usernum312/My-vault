---
icon: lucide-bug
cssclasses:
  - list-cards
Main Categories:
  - Programing
  - Meta
Categories:
  - "[[006 Cyber Security|Cyber Security]]"
tags:
  - Type/Meta/Main-Files
  - Self↑up/knowledge
  - Self↑up/Programing
  - Self↑up/Cyber-Security
banner: https://www.neit.edu/wp-content/uploads/2022/10/Cyber-Security-Icon-Concept-2-1-1024x632.jpeg
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