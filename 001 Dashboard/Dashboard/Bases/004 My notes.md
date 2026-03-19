---
banner: https://images.unsplash.com/photo-1517842645767-c639042777db?w=500&auto=format&fit=crop&q=60&ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxzZWFyY2h8Mnx8bm90ZXN8ZW58MHx8MHx8fDA%3D
links pages:
  - "[[003 Notes]]"
cssclasses:
  - Link
  - no-plus
---
```dataview
TABLE 
    filter(file.lists, (l) => 
        !icontains(meta(l.section).subpath, "Links") AND 
        !icontains(l.text, "http") AND 
        !icontains(l.text, "[[")
    ).text AS "The Notes",
    map(
        filter(file.lists, (l) => 
            icontains(meta(l.section).subpath, "Links") OR 
            icontains(l.text, "http") OR 
            icontains(l.text, "[[")
        ).text, 
        (t) => replace(t, "!", "")
    ) AS "Links"
FROM "002 Notes"
WHERE contains(file.tags, "Type/Quick-Notes")
```