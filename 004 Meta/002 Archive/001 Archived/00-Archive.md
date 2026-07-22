---
icon: lucide-archive-restore
---
```base
views:
  - type: table
    name: All
    filters:
      or:
        - file.name.contains("Archive")
        - file.folder.contains("Archive")
    order:
      - file.name
      - file.backlinks
      - tags
  - type: table
    name: Cu Folder
    filters:
      and:
        - file.inFolder("004 Meta/002 Archive")
    order:
      - file.name
      - file.ext
      - file.mtime
    sort:
      - property: file.name
        direction: DESC
  - type: table
    name: Ai chats
    filters:
      and:
        - file.inFolder("004 Meta/003 External Content/002 AI Conversations/Ai Chat Archive")
    order:
      - file.name
      - file.tags
  - type: table
    name: Notes Arc
    filters:
      or:
        - file.folder.containsAny("002 Notes/004 Archived Notes/Archive", "002 Notes/004 Archived Notes/Snippets/Various snippets")
        - Categories.contains(link("Snippet"))
    groupBy:
      property: file.folder
      direction: ASC

```