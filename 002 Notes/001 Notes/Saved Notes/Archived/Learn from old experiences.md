---
Main Categories:
  - Project
cssclasses:
  - card
icon: lucide-arrow-up-01
---
```dataviewjs
const folderPath = "003 Daily/003 The Diaries Log's";
const targetHeading = "#### راجع نفسك..";

// جلب جميع الملاحظات في المجلد المحدد
const pages = dv.pages(`"${folderPath}"`)
    .filter(p => p.file.name.startsWith("Dia - log - "));

// مصفوفة لتخزين النتائج
const results = [];

// معالجة كل ملاحظة
for (let page of pages) {
    try {
        // قراءة محتوى الملاحظة
        const content = await dv.io.load(page.file.path);
        
        // البحث عن العنوان المطلوب
        const headingRegex = new RegExp(`${targetHeading}\\s*([\\s\\S]*?)(?=\\n#{1,6}\\s|$)`);
        const match = content.match(headingRegex);
        
        // إذا لم يوجد العنوان أو كان فارغاً، تخطي الملاحظة
        if (!match || !match[1] || match[1].trim() === '') {
            continue;
        }
        
        // استخراج المحتوى تحت العنوان
        let headingContent = match[1].trim();
        
        // تنظيف المحتوى من علامات Markdown الأساسية
        headingContent = headingContent
            .replace(/\*\*(.*?)\*\*/g, '$1')  // إزالة **bold**
            .replace(/\*(.*?)\*/g, '$1')      // إزالة *italic*
            .replace(/___(.*?)___/g, '$1')    // إزالة ___underline___
            .replace(/~~(.*?)~~/g, '$1')      // إزالة ~~strike~~
            .replace(/`(.*?)`/g, '$1')        // إزالة `code`
            .replace(/\[(.*?)\]\(.*?\)/g, '$1') // إزالة روابط [text](url)
            .replace(/\n/g, '<br>')           // تحويل الأسطر الجديدة إلى <br>
            .trim();
        
        // إضافة إلى النتائج
        results.push({
            name: page.file.name,
            path: page.file.path,
            content: headingContent || '(محتوى فارغ)'
        });
        
    } catch (error) {
        console.error(`خطأ في معالجة الملاحظة ${page.file.name}:`, error);
    }
}

// ترتيب النتائج حسب التاريخ (من الأحدث إلى الأقدم)
results.sort((a, b) => {
    const dateA = a.name.replace('Dia - log - ', '');
    const dateB = b.name.replace('Dia - log - ', '');
    return dateB.localeCompare(dateA);
});

// عرض النتائج في جدول
if (results.length > 0) {
    dv.table(
        ['الملاحظة', 'المحتويات'],
        results.map(r => [
            dv.fileLink(r.path, false, r.name),  // رابط للملاحظة
            r.content
        ])
    );
} else {
    dv.paragraph('⚠️ لا توجد ملاحظات تحتوي على العنوان المطلوب.');
}
```