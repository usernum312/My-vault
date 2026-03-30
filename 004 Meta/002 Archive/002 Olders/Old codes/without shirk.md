> حسنا قراءة الروايات بالتأكير ليست أفضل شيء يمكنني فعله لكن لو كان لا بد من القراءة فسأقرأ باستخدام هذا الكود الذي يستبدل الكلمات الشركية

<!--```js
(function() {
    const dictionary = {
        "ألوهية": "عظمة",
        "تأليه": "تعظيم",
        "آلهة": "كيانات عليا",
        "إلهة": "سامية",
        "الهة": "سامية",
        "الرب": "السيد",
        "إله": "سامي",
        "اله": "سامي",
        "رب": "سيد"
    };

    function replaceWords(node) {
        if (node.nodeType === Node.TEXT_NODE) {
            let text = node.textContent;
            
            for (let word in dictionary) {
                let regex = new RegExp('(?<=^|\\s|\\p{P})' + word + '(?=$|\\s|\\p{P})', 'gu');
                text = text.replace(regex, dictionary[word]);
            }
            node.textContent = text;
        } else {
            for (let child of node.childNodes) {
                replaceWords(child);
            }
        }
    }

    // التنفيذ الأولي والمراقبة
    replaceWords(document.body);
    const observer = new MutationObserver((mutations) => {
        mutations.forEach((mutation) => {
            mutation.addedNodes.forEach((node) => replaceWords(node));
        });
    });

    observer.observe(document.body, { childList: true, subtree: true });
})();
```-->