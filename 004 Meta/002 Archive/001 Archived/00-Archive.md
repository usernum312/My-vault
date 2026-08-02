---
icon: lucide-archive-restore
---
```base
views:
  - type: table
    name: All
    filters:
      and:
        - '!file.folder.contains("Diaries")'
        - or:
            - file.name.contains("Archive")
            - file.folder.contains("Archive")
    order:
      - file.name
      - file.backlinks
      - tags
  - type: table
    name: Ai chats
    filters:
      and:
        - file.inFolder("004 Meta/003 External Content/002 AI Conversations/Ai Chat Archive")
    groupBy:
      property: file.folder
      direction: ASC
    order:
      - file.name
      - file.tags
  - type: table
    name: Cu Folder
    filters:
      and:
        - file.inFolder("004 Meta/002 Archive")
    order:
      - file.name
      - file.mtime
    sort:
      - property: file.name
        direction: DESC
```