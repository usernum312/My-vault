---
Categories:
  - "[[Technical Doc's|Technical Doc's]]"
---

# مشكلة فتح ملفات PDF في Obsidian من DataviewJS

## وصف المشكلة
عند محاولة فتح رابط PDF برمجيًا داخل **DataviewJS** باستخدام:

```javascript
app.workspace.openLinkText(`warsh.pdf#page=${v.page}`, '', false);
```

قد يظهر خطأ يفيد بعدم العثور على الملف، رغم وجوده فعليًا داخل الخزنة.

## السبب
السبب يعود إلى أن **DataviewJS** يعمل في سياق مختلف عن السياق العادي في Obsidian، مما قد يؤدي إلى:

- اختلاف في تفسير المسار
- عدم التعامل مع الرابط بنفس طريقة الروابط المكتوبة يدويًا
- صعوبة الاعتماد على `openLinkText` مباشرة في بعض الحالات

## الحل
استخدم رابطًا مخزنًا داخل عنصر HTML، ثم افتحه عبر مستمع نقر:

```javascript
const target = `warsh.pdf#page=${v.page}`;

linkContainer.innerHTML = `<a href="#" data-href="${target}">${v.text}</a>`;

linkContainer.querySelector('a').addEventListener('click', (e) => {
    e.preventDefault();
    const target = e.target.dataset.href;
    if (target) {
        app.workspace.openLinkText(target, '', false);
    }
});
```

## ملاحظات
- الروابط المكتوبة يدويًا مثل `[[warsh.pdf#page=354|النص]]` تعمل بشكل طبيعي في الاستخدام العادي لكن المشكلة تظهر عند إنشاء الرابط برمجيًا داخل DataviewJS.
- استخدام `data-href` مع `EventListener` يضمن تمرير الرابط الصحيح إلى Obsidian.

## الخلاصة
عند فشل فتح ملفات PDF برمجيًا في DataviewJS، فالحل العملي هو:
1. إنشاء رابط HTML مخصص
2. حفظ المسار في `data-href`
3. فتح الرابط عبر `app.workspace.openLinkText` داخل مستمع النقر