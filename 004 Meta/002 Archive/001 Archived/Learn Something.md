---
icon: 💡
links pages:
  - "[[Self Education]]"
aliases:
  - Learn
  - Learn Suggestions
  - Learn ideas
---
> بعض المواضيع المثيرة للاهتمام لتعلمها وقت الفراغ

1. [[002 Programing|البرمجة]]
2. [[005 Animation|الانميشن]]
3. [[003 Books|قراءة الكتب]]
4. [[Improvements|قراءة مقالات]]
5. [[007 Electric Circuit|تعلم الدوائر الكهربائية]]
> استمر على اخر مشروع لك
```dataviewjs
const folderPath = "002 Notes/002 Lessons/Logs";

const pages = dv.pages(`"${folderPath}"`)
    .where(p => {
        const nameMatch = p.file.name.match(/^log - \d{4}-\d{2}-\d{2}$/);
        const statusMatch = p.Status && p.Status.toLowerCase() === "ongoing";
        
        return nameMatch && statusMatch;
    })
    .sort(p => p.file.name, "desc");

// 3. عرض النتائج في جدول
if (pages.length > 0) {
    // استخدمنا مصفوفة لتخزين البيانات بعد قراءة محتواها
    const tableRows = [];
    
    for (const p of pages) {
        // جلب الملف الفعلي من خزنة أوبسيديان لقراءة محتواه
        const file = app.vault.getAbstractFileByPath(p.file.path);
        if (file) {
            // قراءة محتوى الملف كاملاً
            const content = await app.vault.read(file);
            
            // تنظيف الـ Frontmatter (البيانات العلوية) لكي لا تظهر مع النص وتجعل المظهر سيئاً
            const cleanContent = content.replace(/^---[\s\S]+?---/, '').trim();
            
            tableRows.push([p.file.link, cleanContent]);
        }
    }

    // عرض الجدول النهائي
    dv.table(["File", "Content"], tableRows);
} else {
    dv.paragraph("لا يوجد شيء ابدا مشروع تعلم جديد بنفسك");
}
```
<!--```dataviewjs
const folderPath = "002 Notes/002 Lessons/Logs";

const pages = dv.pages(`"${folderPath}"`)
    .where(p => {
        const nameMatch = p.file.name.match(/^log - \d{4}-\d{2}-\d{2}$/);
        const statusMatch = p.Status && p.Status.toLowerCase() === "ongoing";
        
        return nameMatch && statusMatch;
    })
    .sort(p => p.file.name, "desc");

// 3. عرض النتائج في جدول
if (pages.length > 0) {
    dv.table(
        ["File"], 
        pages.map(p => [
            p.file.link,
        ])
    );
} else {
    dv.paragraph("لا يوجد شيء ابدا مشروع تعلم جديد بنفسك");
}
```-->