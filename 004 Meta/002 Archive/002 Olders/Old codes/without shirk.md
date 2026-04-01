> حسنا قراءة الروايات بالتأكير ليست أفضل شيء يمكنني فعله لكن لو كان لا بد من القراءة فسأقرأ باستخدام هذا الكود الذي يستبدل الكلمات الشركية

<!--```js
(function() {
        const dictionary = {
        "ألوهية": "عظمة",
        "تأليه": "تعظيم",
        "آلهة": "كيانات عليا",
        "الإلهة": "السامية",
        "الإله": "السامي",
        "إلهة": "سامية",
        "الهة": "سامية",
        "الرب": "السيد",
        "إله": "سامي",
        "اله": "سامي",
        "الرب": "السيد",
        "رب": "سيد",
        "الآلهة": "المتسامين",
        "آلهة":"متسامين",
        "ألوهة": "سمو",
        "قدوس": "طاهر",
        "قدسية": "الطهورة",
        "مقدس": "مبجل",
        "عبادة": "ولاء",
        "عبد": "تابع"
    };

    function replaceWords(node) {
        if (node.nodeType === Node.TEXT_NODE) {
            let text = node.textContent;
            let sortedWords = Object.keys(dictionary).sort((a, b) => b.length - a.length);     
            for (let word of sortedWords) {
                let regex = new RegExp('(?<=^|[\\s\\p{P}])' + word + '(?=[\\s\\p{P}]|$)', 'giu');
                text = text.replace(regex, dictionary[word]);
            }
            node.textContent = text;
        } else {
            for (let child of node.childNodes) {
                replaceWords(child);
            }
        }
    }

    replaceWords(document.body);
    const observer = new MutationObserver((mutations) => {
        mutations.forEach((mutation) => {
            mutation.addedNodes.forEach((node) => {
                if (node.nodeType === Node.ELEMENT_NODE) {
                    replaceWords(node);
                }
            });
        });
    });

    observer.observe(document.body, { childList: true, subtree: true });
})();
```-->