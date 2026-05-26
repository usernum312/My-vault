---
icon: https://www.svgrepo.com/show/371422/newspaper.svg
banner: https://www.godaddy.com/resources/latam/wp-content/uploads/sites/4/2024/06/portada_blog_11zon.png?size=3840x0
banner_y: 40
cssclasses:
  - invert-dark
  - invert-banner
  - metadata-clean
  - page-black
---
```base
views:
  - type: cards
    name: Cards
    filters:
      or:
        - file.folder.startsWith("002 Notes/004 Archived Notes/Snippets/Short Blogs")
        - file.folder.startsWith("004 Meta/003 External Content/001 Digital CLippings")
    image: note.banner
```