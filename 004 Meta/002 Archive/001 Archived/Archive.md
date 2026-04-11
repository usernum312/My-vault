```base
views:
  - type: table
    name: Cu Folder
    filters:
      and:
        - file.inFolder("004 Meta/002 Archive")
    order:
      - file.name
      - file.ext
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
      and:
        - file.inFolder("002 Notes/004 Archived Notes")
  - type: table
    name: Snippet
    filters:
      and:
        - note["The Topic"].contains("snippet")

```