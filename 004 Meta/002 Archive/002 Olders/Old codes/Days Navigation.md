```dataviewjs
const activeFile = app.workspace.getActiveFile();
if (!activeFile) {} 
else {
    const currentTitle = activeFile.basename;
    
    // Paths
    const activeFolder = "003 Daily/001 Active Diaries";
    const archivedFolder = "003 Daily/002 Archived Diaries";
    const templatePath = "004 Meta/004 Temple/Today Tem.md";
    const centerPath = "003 Daily/Days MOC.md";

    // Check Date
    const dateRegEx = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRegEx.test(currentTitle)) {}
    else {
        const moment = window.moment;
        const currentMoment = moment(currentTitle, "YYYY-MM-DD");
        const prevDateStr = currentMoment.clone().subtract(1, 'days').format("YYYY-MM-DD");
        const nextDateStr = currentMoment.clone().add(1, 'days').format("YYYY-MM-DD");

        // File place checker
        async function getValidFilePath(dateStr) {
            const activePath = activeFolder + "/" + dateStr + ".md";
            const archivedPath = archivedFolder + "/" + dateStr + ".md";
            
            if (await app.vault.adapter.exists(activePath)) {
                return activePath;
            } else if (await app.vault.adapter.exists(archivedPath)) {
                return archivedPath;
            }
            return activePath;
        }

        // Buttons Container
        const container = dv.el("div", "", { cls: "daily-nav-container" });
        container.style.display = "flex";
        container.style.padding = "10px 0";
        container.style.justifyContent = "space-between";

        // Right Button
        const rightBtn = dv.el("button", prevDateStr + " →", { container: container });
        rightBtn.style.cursor = "pointer";
        rightBtn.style.fontSize = "1em";
        rightBtn.style.background = "var(--interactive-accent)";

        // Center Button
        const centerBtn = dv.el("button", "Calendar" ,{ container: container });
        centerBtn.style.cursor = "pointer";
        centerBtn.style.fontSize = "1em";
        centerBtn.style.background = "var(--interactive-accent)";
        
        // Left Button
        const leftBtn = dv.el("button", "← " + nextDateStr, { container: container });
        leftBtn.style.cursor = "pointer";
        leftBtn.style.fontSize = "1em";
        leftBtn.style.background = "var(--interactive-accent)";
        
        // 3. أحداث الضغط على الأزرار
        leftBtn.onclick = async function() {
            const nextFullPath = await getValidFilePath(nextDateStr);
            const fileExists = await app.vault.adapter.exists(nextFullPath);
            
            if (fileExists) {
                const file = app.vault.getAbstractFileByPath(nextFullPath);
                if (file) app.workspace.getLeaf().openFile(file);
            } else {
                let templateContent = "";
                const templateFile = app.vault.getAbstractFileByPath(templatePath);
                if (templateFile) {
                    templateContent = await app.vault.read(templateFile);
                    templateContent = templateContent.replaceAll("{{title}}", nextDateStr);
                }
                // سيتم إنشاء الملف الجديد في مجلد النشط تلقائياً
                const newFile = await app.vault.create(nextFullPath, templateContent);
                app.workspace.getLeaf().openFile(newFile);
            }
        };

        centerBtn.onclick = async function() {
            const file = app.vault.getAbstractFileByPath(centerPath);
            if (file) {
                app.workspace.getLeaf().openFile(file);
            } else {
                new Notice("⚠️ لم يتم العثور على ملف الخريطة/التقويم في المسار المحدد.");
            }
        };

        rightBtn.onclick = async function() {
            const prevFullPath = await getValidFilePath(prevDateStr);
            const fileExists = await app.vault.adapter.exists(prevFullPath);
            
            if (fileExists) {
                const file = app.vault.getAbstractFileByPath(prevFullPath);
                if (file) app.workspace.getLeaf().openFile(file);
            } else {
                new Notice("الملاحظة السابقة " + prevDateStr + " غير موجودة في المجلد النشط أو الأرشيف.");
            }
        };
    }
}
```