---
icon: https://www.svgrepo.com/show/329632/irib5.svg
cssclasses:
  - metadata-clean
---
<!-- old icon: https://cdn-icons-png.flaticon.com/128/9988/9988512.png -->
```dataviewjs
(async () => {
    let sourcePath = "001 Basics/Quran.md";
    
    if (!sourcePath) {
        dv.span("⚠️ لم يتم تعيين مسار ملف القرآن بعد. يرجى فتح ملف القرآن الرئيسي (الذي يحتوي على قائمة السور) لتخزين المسار تلقائياً.");
        return;
    }
    
    // التحقق من وجود الملف وصحة المسار
    const fileContent = await dv.io.load(sourcePath);
    if (!fileContent) {
        dv.span(`⚠️ الملف "${sourcePath}" غير موجود. يرجى فتح ملف القرآن الرئيسي مرة واحدة لتحديث المسار.`);
        return;
    }
    
    // استخراج السور من المحتوى
    const surahRegex = /### \d+\. (?:سورة )?([^\n]+)\n\[\[warsh\.pdf#page=(\d+)\|(.*?)\]\]/g;
    const surahs = [];
    let match;
    while ((match = surahRegex.exec(fileContent)) !== null) {
        surahs.push({
            name: match[1].trim(),
            page: parseInt(match[2]),
            displayText: match[3]
        });
    }
    
    // استخراج المفضلة
    const favSectionRegex = /### <span style="color: pink;">المفضلة<\/span>([\s\S]*?)(?=\n___|\n###\s+\d+\.|$)/;
    const favMatch = fileContent.match(favSectionRegex);
    const favoritePages = new Set();
    if (favMatch) {
        const favLinkRegex = /\[\[warsh\.pdf#page=(\d+)\|.*?\]\]/g;
        let favLinkMatch;
        while ((favLinkMatch = favLinkRegex.exec(favMatch[1])) !== null) {
            favoritePages.add(parseInt(favLinkMatch[1]));
        }
    }
    surahs.forEach(s => s.favorite = favoritePages.has(s.page));
    
    if (surahs.length === 0) {
        dv.span("⚠️ لم يتم العثور على سور في الملف: " + sourcePath);
        return;
    }
    
    // اختيار عشوائي مع تفضيل للمفضلة
    const FAV_WEIGHT = 3;
    const NORM_WEIGHT = 1;
    let totalWeight = 0;
    const weighted = surahs.map(s => {
        const w = s.favorite ? FAV_WEIGHT : NORM_WEIGHT;
        totalWeight += w;
        return { surah: s, weight: w };
    });
    let rand = Math.random() * totalWeight;
    let acc = 0;
    let selected = weighted[0].surah;
    for (const item of weighted) {
        acc += item.weight;
        if (rand < acc) {
            selected = item.surah;
            break;
        }
    }
    
    // بناء الواجهة
    const wrapper = dv.el('div', '');
    wrapper.style.display = 'flex';
    wrapper.style.alignItems = 'center';
    wrapper.style.margin = '0.5rem 0';
    
    const button = dv.el('button', 'اختر سورة عشوائية');
    Object.assign(button.style, {
        cursor: 'pointer',
        border: '1px solid var(--background-modifier-border)',
        backgroundColor: 'var(--interactive-accent)',
        borderRadius: '4px',
        fontWeight: 'bold',
        padding: '0.5rem 1rem',
        whiteSpace: 'nowrap',
        color: 'var(--text-normal)',
        height: '2.65rem'
    });
    
    const spaceGap = dv.el('span', '&nbsp;&nbsp;');
    
    const linkContainer = dv.el('span', '');
    Object.assign(linkContainer.style, {
        display: 'flex',
        alignItems: 'center',
        flex: '1',
        padding: '0.5rem 0.75rem',
        backgroundColor: 'var(--background-secondary)',
        borderRadius: '4px',
        border: '1px solid var(--background-modifier-border)',
        height: '2.65rem'
    });
    
    function updateDisplay(surah) {
        while (linkContainer.firstChild) linkContainer.removeChild(linkContainer.firstChild);
        linkContainer.appendChild(dv.span(`[[warsh.pdf#page=${surah.page}|${surah.displayText}]]`));
    }
    updateDisplay(selected);
    
    // زر التحديث
    button.onclick = async () => {
        const freshContent = await dv.io.load(sourcePath);
        if (!freshContent) return;
        const freshSurahs = [];
        const freshRegex = /### \d+\. (?:سورة )?([^\n]+)\n\[\[warsh\.pdf#page=(\d+)\|(.*?)\]\]/g;
        let freshMatch;
        while ((freshMatch = freshRegex.exec(freshContent)) !== null) {
            freshSurahs.push({
                page: parseInt(freshMatch[2]),
                displayText: freshMatch[3],
                favorite: false
            });
        }
        const freshFavMatch = freshContent.match(favSectionRegex);
        const freshFavPages = new Set();
        if (freshFavMatch) {
            const freshFavRegex = /\[\[warsh\.pdf#page=(\d+)\|.*?\]\]/g;
            let fMatch;
            while ((fMatch = freshFavRegex.exec(freshFavMatch[1])) !== null) {
                freshFavPages.add(parseInt(fMatch[1]));
            }
        }
        freshSurahs.forEach(s => s.favorite = freshFavPages.has(s.page));
        let newTotalWeight = 0;
        const newWeighted = freshSurahs.map(s => {
            const w = s.favorite ? FAV_WEIGHT : NORM_WEIGHT;
            newTotalWeight += w;
            return { surah: s, weight: w };
        });
        let newRand = Math.random() * newTotalWeight;
        let newAcc = 0;
        let newSelected = newWeighted[0].surah;
        for (const item of newWeighted) {
            newAcc += item.weight;
            if (newRand < newAcc) {
                newSelected = item.surah;
                break;
            }
        }
        updateDisplay(newSelected);
    };
    wrapper.appendChild(button);
    wrapper.appendChild(spaceGap);
    wrapper.appendChild(linkContainer);
})();
```