```dataviewjs
const activeFile = app.workspace.getActiveFile();
if (!activeFile) return;

const folderPath = activeFile.parent.path;
const currentTitle = activeFile.basename;
const dateRegEx = /^\d{4}-\d{2}-\d{2}$/;
const centerPath = "003 Daily/Days MOC.md";

// ------------------------------------------------------------------
// Helper: create the three buttons, now left‑aligned with gaps
// ------------------------------------------------------------------
function buildNavButtons(leftLabel, rightLabel, leftOnClick, rightOnClick, centerOnClick) {
    const container = dv.el("div", "", { cls: "daily-nav-container" });
    container.style.display = "flex";
    container.style.padding = "10px 0";
    container.style.justifyContent = "center";   // ← changed from space-between
    container.style.gap = "1.6em";                    // ← added gap between buttons

    const leftBtn = dv.el("button", leftLabel, { container });
    leftBtn.style.cursor = "pointer";
    leftBtn.style.fontSize = "1em";
    leftBtn.style.margingleft = "-100px";
    leftBtn.style.marginright = "-100px";
    leftBtn.style.background = "var(--interactive-accent)";
    leftBtn.onclick = leftOnClick;

    const centerBtn = dv.el("button", "Calendar", { container });
    centerBtn.style.cursor = "pointer";
    centerBtn.style.fontSize = "1em";
    centerBtn.style.background = "var(--interactive-accent)";
    centerBtn.onclick = centerOnClick;

    const rightBtn = dv.el("button", rightLabel, { container });
    rightBtn.style.cursor = "pointer";
    rightBtn.style.fontSize = "1em";
    rightBtn.style.background = "var(--interactive-accent)";
    
    rightBtn.onclick = rightOnClick;
}

// ------------------------------------------------------------------
// Branch 1: original behaviour for "003 Daily/001 Active Diaries"
// ------------------------------------------------------------------
if (folderPath === "003 Daily/001 Active Diaries") {
    if (!dateRegEx.test(currentTitle)) return;

    const moment = window.moment;
    const currentMoment = moment(currentTitle, "YYYY-MM-DD");
    const prevDateStr = currentMoment.clone().subtract(1, 'days').format("YYYY-MM-DD");
    const nextDateStr = currentMoment.clone().add(1, 'days').format("YYYY-MM-DD");

    const activeFolder = "003 Daily/001 Active Diaries";
    const archivedFolder = "003 Daily/002 Archived Diaries";
    const templatePath = "004 Meta/004 Temple/Today Tem.md";

    async function getValidFilePath(dateStr) {
        const activePath = activeFolder + "/" + dateStr + ".md";
        const archivedPath = archivedFolder + "/" + dateStr + ".md";
        if (await app.vault.adapter.exists(activePath)) return activePath;
        if (await app.vault.adapter.exists(archivedPath)) return archivedPath;
        return activePath;   // will be created in active folder
    }

    const leftOnClick = async function() {
        const nextFullPath = await getValidFilePath(nextDateStr);
        if (await app.vault.adapter.exists(nextFullPath)) {
            const file = app.vault.getAbstractFileByPath(nextFullPath);
            if (file) app.workspace.getLeaf().openFile(file);
        } else {
            let templateContent = "";
            const templateFile = app.vault.getAbstractFileByPath(templatePath);
            if (templateFile) {
                templateContent = await app.vault.read(templateFile);
                templateContent = templateContent.replaceAll("{{title}}", nextDateStr);
            }
            const newFile = await app.vault.create(nextFullPath, templateContent);
            app.workspace.getLeaf().openFile(newFile);
        }
    };

    const rightOnClick = async function() {
        const prevFullPath = await getValidFilePath(prevDateStr);
        if (await app.vault.adapter.exists(prevFullPath)) {
            const file = app.vault.getAbstractFileByPath(prevFullPath);
            if (file) app.workspace.getLeaf().openFile(file);
        } else {
            new Notice("الملاحظة السابقة " + prevDateStr + " غير موجودة في المجلد النشط أو الأرشيف.");
        }
    };

    const centerOnClick = async function() {
        const file = app.vault.getAbstractFileByPath(centerPath);
        if (file) app.workspace.getLeaf().openFile(file);
        else new Notice("⚠️ لم يتم العثور على ملف الخريطة/التقويم في المسار المحدد.");
    };

    buildNavButtons("← " + nextDateStr, prevDateStr + " →", leftOnClick, rightOnClick, centerOnClick);
}

// ------------------------------------------------------------------
// Branch 2 & 3: unconditional navigation inside specific folders
// ------------------------------------------------------------------
else if (folderPath === "002 Notes/002 Lessons/Logs" ||
         folderPath === "003 Daily/003 The Diaries Log's") {

    const dateMatch = currentTitle.match(/(\d{4}-\d{2}-\d{2})/);
    if (!dateMatch) return;

    const folder = app.vault.getAbstractFileByPath(folderPath);
    if (!folder || !folder.children) return;

    const allFiles = folder.children.filter(f => f.extension === 'md');

    const fileList = allFiles
        .map(f => {
            const match = f.basename.match(/(\d{4}-\d{2}-\d{2})/);
            if (!match) return null;
            return { file: f, dateStr: match[1] };
        })
        .filter(item => item !== null)
        .sort((a, b) => a.dateStr.localeCompare(b.dateStr));

    if (fileList.length === 0) return;

    const currentIndex = fileList.findIndex(item => item.file.path === activeFile.path);
    if (currentIndex === -1) return;

    const prevIndex = currentIndex - 1;
    const nextIndex = currentIndex + 1;

    const nextLabel = nextIndex < fileList.length ? "← " + fileList[nextIndex].dateStr : "← —";
    const prevLabel = prevIndex >= 0 ? fileList[prevIndex].dateStr + " →" : "— →";

    const leftOnClick = async function() {
        if (nextIndex < fileList.length) {
            const file = fileList[nextIndex].file;
            app.workspace.getLeaf().openFile(file);
        } else {
            new Notice("لا يوجد ملف تالٍ.");
        }
    };

    const rightOnClick = async function() {
        if (prevIndex >= 0) {
            const file = fileList[prevIndex].file;
            app.workspace.getLeaf().openFile(file);
        } else {
            new Notice("لا يوجد ملف سابق.");
        }
    };

    const centerOnClick = async function() {
        const file = app.vault.getAbstractFileByPath(centerPath);
        if (file) app.workspace.getLeaf().openFile(file);
        else new Notice("⚠️ لم يتم العثور على ملف الخريطة/التقويم في المسار المحدد.");
    };

    buildNavButtons(nextLabel, prevLabel, leftOnClick, rightOnClick, centerOnClick);
}
```