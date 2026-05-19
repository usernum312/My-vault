---
icon: links-coming-in
cssclasses:
  - dashboard
---
```dataviewjs
const activeFile = app.workspace.getActiveFile();

if (activeFile) {
    const page = dv.page(activeFile.path);

    if (page) {
        const inlinks = page.file.inlinks;

        const renderAsMarkdownLinks = (links) => {
            return links.map(link => `- ${link}`).join("\n");
        };

        dv.header(3, "Backlinks:");
        if (inlinks.length > 0) {
            dv.paragraph(renderAsMarkdownLinks(inlinks));
        } else {
            dv.paragraph("*No links are currently available.*");
        }
    }
} else {
    dv.paragraph("*No active file found.*");
}
```