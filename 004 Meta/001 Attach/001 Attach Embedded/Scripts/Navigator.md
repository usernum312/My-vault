---
icon: lucide-arrow-right-left
---
```dataviewjs
(async () => {
    const activeFile = app.workspace.getActiveFile();
    if (!activeFile || !activeFile.parent) return;

    // 1. جلب كافة ملفات الملاحظات داخل المجلد الحالي وترتيبها أبجدياً
    const folder = activeFile.parent;
    const files = folder.children
        .filter(f => f.extension === 'md')
        .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }));

    const currentIndex = files.findIndex(f => f.path === activeFile.path);
    if (currentIndex === -1 || files.length <= 1) return;

    // 2. إنشاء حاوية عائمة تماماً في أعلى الزاوية اليمنى (Absolute/Fixed Position)
    const container = dv.el("div", "");
    container.style.position = "absolute";
    container.style.gap = "4px";
    container.style.top = "-15px";
    container.style.left = "20px";
    container.style.display = "flex";
    container.style.flexDirection = "row";
    container.style.zIndex = "99999999999";
    container.style.pointerEvents = "none";

    // دالة مساعدة لإنشاء الأزرار الصغيرة جدًا والباهتة
    function createNavButton(iconText, isDisabled, onClick) {
        const btn = dv.el("button", iconText, { container });
        btn.style.pointerEvents = "auto";
        btn.style.background = "transparent";
        btn.style.border = "none";
        btn.style.boxShadow = "none";
        btn.style.color = "var(--text-muted)";
        btn.style.opacity = isDisabled ? "0.15" : "0.4";
        btn.style.fontSize = "13px";
        btn.style.padding = "1px 4px";
        btn.style.lineHeight = "1";
        btn.style.cursor = isDisabled ? "default" : "pointer";
        btn.style.borderRadius = "3px";
        btn.style.transition = "all 0.2s ease";

        if (!isDisabled) {
            btn.onmouseover = () => {
                btn.style.opacity = "0.9";
                btn.style.background = "var(--background-modifier-hover)";
            };
            btn.onmouseout = () => {
                btn.style.opacity = "0.4";
                btn.style.background = "transparent";
            };
            btn.onclick = onClick;
        }
        return btn;
    }

    // 3. إنشاء زرين متجاورين في أعلى الصفحة (السهم الأيمن ثم الأيسر)
    const prevFile = currentIndex > 0 ? files[currentIndex - 1] : null;
    const nextFile = currentIndex < files.length - 1 ? files[currentIndex + 1] : null;

    // السهم الأيسر (للملف التالي)
    createNavButton("←", !prevFile, () => {
        if (prevFile) app.workspace.getLeaf().openFile(prevFile);
    });
    
    // السهم الأيمن (للملف السابق)
    createNavButton("→", !nextFile, () => {
        if (nextFile) app.workspace.getLeaf().openFile(nextFile);
    });
})();
```