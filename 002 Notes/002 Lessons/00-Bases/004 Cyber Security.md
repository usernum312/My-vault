---
icon: lucide-bug
cssclasses:
  - list-cards
Main Categories:
  - Programing
  - Meta
Categories:
  - "[[004 Cyber Security|Cyber Security]]"
tags:
  - Type/Meta/Main-Files
  - Type/Meta
  - Type/Self↑up/knowledge
banner: https://lh3.googleusercontent.com/E10TJiBix3TTFTdz4t0GClMhTslA-HbTEfZ0Z0QcxgtQAcKyI1jteVQFomcqn2wi6l7Wzvpy5fORSNqCMPurgVT1mPu8Uc77pMo_=w816-rw
aliases:
  - الأمن السيبراني
---
> Cyber Security: I love know how web and device's work and i love when i can get bug
```base
filters:
  and:
    - '!file.tags.contains("Type/Meta/Main-Files")'
    - or:
        - file.tags.contains("Self↑up/knowledge/Cyber-Security")
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