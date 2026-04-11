###### V1 - script in quran note
```dataviewjs
(async () => {
    async function loadSurahsFromContent() {
        const currentFile = dv.current().file;
        const fileContent = await dv.io.load(currentFile.path);
        if (!fileContent) return null;
        const surahRegex = /### \d+\. (?:سورة )?([^\n]+)\n\[\[warsh\.pdf#page=(\d+)\|(.*?)\]\]/g;
        const surahs = [];
        let match;
        while ((match = surahRegex.exec(fileContent)) !== null) {
            const name = match[1].trim();
            const page = parseInt(match[2]);
            const displayText = match[3];
            surahs.push({ name, page, displayText });
        }
        
        // تحديد المفضلة من القسم المخصص
        const favSectionRegex = /### <span style="color: pink;">المفضلة<\/span>([\s\S]*?)(?=\n___|\n###\s+\d+\.|$)/;
        const favMatch = fileContent.match(favSectionRegex);
        const favoritePages = new Set();
        if (favMatch) {
            const favContent = favMatch[1];
            const favLinkRegex = /\[\[warsh\.pdf#page=(\d+)\|.*?\]\]/g;
            let favLinkMatch;
            while ((favLinkMatch = favLinkRegex.exec(favContent)) !== null) {
                favoritePages.add(parseInt(favLinkMatch[1]));
            }
        }
        
        surahs.forEach(s => s.favorite = favoritePages.has(s.page));
        return surahs;
    }
    function selectRandomSurah(surahs) {
        const FAV_WEIGHT = 5;
        const NORM_WEIGHT = 1;
        let totalWeight = 0;
        const weighted = surahs.map(s => {
            const w = s.favorite ? FAV_WEIGHT : NORM_WEIGHT;
            totalWeight += w;
            return { surah: s, weight: w };
        });
        let rand = Math.random() * totalWeight;
        let acc = 0;
        for (const item of weighted) {
            acc += item.weight;
            if (rand < acc) return item.surah;
        }
        return weighted[0].surah;
    }
    const wrapper = dv.el('div', '');
    wrapper.style.display = 'flex';
    wrapper.style.alignItems = 'center';
    wrapper.style.gap = '0.75rem';
    wrapper.style.margin = '0.5rem 0';

    const button = dv.el('button', 'اختر سورة عشوائية');
    button.style.cursor = 'pointer';
    button.style.border = '1px solid var(--background-modifier-border)';
    button.style.backgroundColor = 'var(--interactive-accent)';
    button.style.borderRadius = '4px';
    button.style.fontWeight = 'bold';
    button.style.padding = '0.5rem 1rem';
    button.style.whiteSpace = 'nowrap';
    button.style.color = 'var(--text-normal)';

    const linkContainer = dv.el('span', '');
    linkContainer.style.display = 'flex';
    linkContainer.style.alignItems = 'center';
    linkContainer.style.flex = '1';
    linkContainer.style.padding = '0.5rem 0.75rem';
    linkContainer.style.backgroundColor = 'var(--background-secondary)';
    linkContainer.style.borderRadius = '4px';
    linkContainer.style.border = '1px solid var(--background-modifier-border)';
    linkContainer.style.height = '2.65rem';
    linkContainer.innerText = 'جاري التحميل...';
    let surahs = await loadSurahsFromContent();    
    async function updateLink() {
        const freshSurahs = await loadSurahsFromContent();
        if (!freshSurahs || freshSurahs.length === 0) {
            linkContainer.innerText = '⚠️ لم يتم العثور على سور';
            return;
        }
        const selected = selectRandomSurah(freshSurahs);
        const linkMarkdown = `[[warsh.pdf#page=${selected.page}|${selected.displayText}]]`;
        while (linkContainer.firstChild) linkContainer.removeChild(linkContainer.firstChild);
        linkContainer.appendChild(dv.span(linkMarkdown));
    }
    if (surahs && surahs.length > 0) {
        const initialSurah = selectRandomSurah(surahs);
        const initialMarkdown = `[[warsh.pdf#page=${initialSurah.page}|${initialSurah.displayText}]]`;
        while (linkContainer.firstChild) linkContainer.removeChild(linkContainer.firstChild);
        linkContainer.appendChild(dv.span(initialMarkdown));
    } else {
        linkContainer.innerText = '⚠️ لم يتم العثور على سور';
    }

    // ربط الزر
    button.onclick = updateLink;

    wrapper.appendChild(button);
    wrapper.appendChild(linkContainer);
})();
```
###### V2 - script in other note without cache
```dataviewjs
(async () => {
    // قراءة المسار من المتغير العام الذي عُين في الملف الرئيسي
    const sourcePath = window.__QURAN_SOURCE_PATH;
    if (!sourcePath) {
        dv.span("⚠️ لم يتم العثور على مسار المصدر. تأكد من تعيين window.__QURAN_SOURCE_PATH في الملف الرئيسي قبل تضمين هذا السكربت.");
        return;
    }

    const fileContent = await dv.io.load(sourcePath);
    if (!fileContent) {
        dv.span("⚠️ لم يتم العثور على محتوى الملف: " + sourcePath);
        return;
    }

    const surahRegex = /### \d+\. (?:سورة )?([^\n]+)\n\[\[warsh\.pdf#page=(\d+)\|(.*?)\]\]/g;
    const surahs = [];
    let match;
    while ((match = surahRegex.exec(fileContent)) !== null) {
        surahs.push({
            name: match[1].trim(),
            page: parseInt(match[2]),
            displayText: match[3],
        });
    }

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

    const FAV_WEIGHT = 5;
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

    const wrapper = dv.el('div', '');
    wrapper.style.display = 'flex';
    wrapper.style.alignItems = 'center';
    wrapper.style.gap = '0.75rem';
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
        color: 'var(--text-normal)'
    });

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
    wrapper.appendChild(linkContainer);
})();
```
Note: in this version we are should to write that's 
```jsdataviewjs
window.__QURAN_SOURCE_PATH = dv.current().file.path;
```
in quran page