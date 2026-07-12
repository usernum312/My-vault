---
icon: lucide-search
cssclasses:
  - rtl-everything
  - metadata-clean
  - center-everything
---
```dataviewjs
const DATA_PATH = ".obsidian/quran.json";

async function fetchQuran(){

    const verses = [];
    const totalPages = 604;

    for(let p=1;p<=totalPages;p++){

        const url = `https://api.quran.com/api/v4/verses/by_page/${p}?words=false&translations=false&fields=text_uthmani,text_imlaei_simple,page_number,verse_key`;

        const r = await fetch(url);
        const j = await r.json();

        j.verses.forEach(v=>{

            const [s,a] = v.verse_key.split(":");

            verses.push({
                sura:Number(s),
                ayah:Number(a),
                page:v.page_number,
                text:v.text_uthmani,
                text_simple:v.text_imlaei_simple
            });

        });

    }

    return verses;
}

async function loadQuran(){

    const exists = await app.vault.adapter.exists(DATA_PATH);

    if(!exists){

        dv.container.innerHTML="جاري تحميل القرآن لأول مرة ...";

        const data = await fetchQuran();

        await app.vault.adapter.write(DATA_PATH, JSON.stringify(data));

        return data;
    }

    const content = await app.vault.adapter.read(DATA_PATH);
    return JSON.parse(content);
}

function normalizeArabic(text){

    return text
    .replace(/[\u064B-\u065F]/g,"")
    .replace(/ٱ/g,"ا")
    .replace(/إ/g,"ا")
    .replace(/أ/g,"ا")
    .replace(/ى/g,"ي")
    .replace(/ة/g,"ه")
    .replace(/\s+/g," ")
    .trim();

}

function highlight(text,word){

    const r = new RegExp(word,"gi");
    return text.replace(r,'<mark>'+word+'</mark>');
}

const quranRaw = await loadQuran();

/* build search index */

const quran = quranRaw.map(v=>({
    ...v,
    norm: normalizeArabic(v.text_simple)
}));

const container = dv.container;
container.style.direction="rtl";

/* search UI */

const bar = document.createElement("div");
bar.style.display = "flex";
bar.style.gap = "8px";
bar.style.marginBottom = "10px";
bar.style.flexDirection = "row-reverse";  // This puts the button visually on the right

const input = document.createElement("input");
input.placeholder = "ابحث في القرآن";
input.style.flex = "1";
input.style.backgroundColor = "var(--background-secondary)";
input.style.border = "1px solid var(--background-modifier-border)";
input.style.borderRadius = "0";            // Square corners to match the button
input.style.padding = "8px 12px";
input.style.outline = "none";

const btn = document.createElement("button");
btn.textContent = "بحث";
btn.style.borderRadius = "5px";
btn.style.padding = "8px 16px";
btn.style.backgroundColor = "var(--interactive-accent)";
btn.style.color = "var(--text-normal)";
btn.style.border = "1px solid var(--background-modifier-border)";
btn.style.cursor = "pointer";
btn.style.fontFamily = "inherit";
btn.style.fontSize = "inherit";
btn.style.transition = "background-color 0.2s";

btn.addEventListener("mouseenter", () => {
    btn.style.backgroundColor = "var(--interactive-hover)";
});
btn.addEventListener("mouseleave", () => {
    btn.style.backgroundColor = "var(--interactive-normal)";
});

bar.appendChild(input);
bar.appendChild(btn);

bar.appendChild(input);
bar.appendChild(btn);

const info=document.createElement("div");
info.style.marginBottom="10px";
info.style.fontSize="13px";

const results=document.createElement("div");

container.appendChild(bar);
container.appendChild(info);
container.appendChild(results);

function runSearch(){

    const query=input.value.trim();
    if(!query) return;

    const norm=normalizeArabic(query);

    const found = quran.filter(v=>v.norm.includes(norm));

    results.innerHTML="";
    info.textContent=`عدد النتائج: ${found.length}`;

    /* حالة عدم وجود نتائج */

    if(found.length===0){

        results.innerHTML=`
        <div style="
            padding:12px;
            border:1px solid var(--background-modifier-border);
            border-radius:6px;
            text-align:center;
            opacity:0.7;
            margin-top:10px;
        ">
        لم يتم العثور على الآية
        </div>
        `;

        return;
    }

    found.forEach(v=>{

        const row=document.createElement("div");
        row.style.borderBottom="1px solid var(--background-modifier-border)";
        row.style.padding="8px";

        const ayah=document.createElement("div");
        ayah.style.fontSize="18px";
        ayah.innerHTML=highlight(v.text,query);

        const meta=document.createElement("div");
        meta.style.fontSize="12px";
        meta.textContent=`سورة ${v.sura} • آية ${v.ayah} • صفحة ${v.page}`;

        const buttons=document.createElement("div");
        buttons.style.marginTop="5px";

        const copy=document.createElement("button");
        copy.textContent="نسخ";
        copy.onclick=()=>navigator.clipboard.writeText(v.text);

        const go=document.createElement("button");
        go.textContent="الصفحة";

        go.onclick=()=>{
            const file=dv.current().file;
            const link=`[[warsh.pdf#page=${v.page}|${v.text}]]`;
            app.vault.append(file,"\n"+link+"\n");
        };

        buttons.appendChild(copy);
        buttons.appendChild(go);

        row.appendChild(ayah);
        row.appendChild(meta);
        row.appendChild(buttons);

        results.appendChild(row);

    });

}

btn.onclick=runSearch;

input.addEventListener("keypress",e=>{
    if(e.key==="Enter") runSearch();
});
```
##### نتائج البحث
***

[[warsh.pdf#page=199|فَأَعْقَبَهُمْ نِفَاقًا فِى قُلُوبِهِمْ إِلَىٰ يَوْمِ يَلْقَوْنَهُۥ بِمَآ أَخْلَفُوا۟ ٱللَّهَ مَا وَعَدُوهُ وَبِمَا كَانُوا۟ يَكْذِبُونَ]]

[[warsh.pdf#page=519|وَلَقَدْ خَلَقْنَا ٱلْإِنسَـٰنَ وَنَعْلَمُ مَا تُوَسْوِسُ بِهِۦ نَفْسُهُۥ ۖ وَنَحْنُ أَقْرَبُ إِلَيْهِ مِنْ حَبْلِ ٱلْوَرِيدِ]]

[[warsh.pdf#page=499|يَسْمَعُ ءَايَـٰتِ ٱللَّهِ تُتْلَىٰ عَلَيْهِ ثُمَّ يُصِرُّ مُسْتَكْبِرًا كَأَن لَّمْ يَسْمَعْهَا ۖ فَبَشِّرْهُ بِعَذَابٍ أَلِيمٍ]]

[[warsh.pdf#page=319|يَوْمَئِذٍ يَتَّبِعُونَ ٱلدَّاعِىَ لَا عِوَجَ لَهُۥ ۖ وَخَشَعَتِ ٱلْأَصْوَاتُ لِلرَّحْمَـٰنِ فَلَا تَسْمَعُ إِلَّا هَمْسًا]]

[[warsh.pdf#page=111|وَقَالَتِ ٱلْيَهُودُ وَٱلنَّصَـٰرَىٰ نَحْنُ أَبْنَـٰٓؤُا۟ ٱللَّهِ وَأَحِبَّـٰٓؤُهُۥ ۚ قُلْ فَلِمَ يُعَذِّبُكُم بِذُنُوبِكُم]]

[[warsh.pdf#page=348|حَتَّىٰٓ إِذَا جَآءَ أَحَدَهُمُ ٱلْمَوْتُ قَالَ رَبِّ ٱرْجِعُونِ]]

[[warsh.pdf#page=441|قِيلَ ٱدْخُلِ ٱلْجَنَّةَ ۖ قَالَ يَـٰلَيْتَ قَوْمِى يَعْلَمُونَ]]

[[warsh.pdf#page=107|فِسْقٌ ۗ ٱلْيَوْمَ يَئِسَ ٱلَّذِينَ كَفَرُوا۟ مِن دِينِكُمْ فَلَا تَخْشَوْهُمْ وَٱخْشَوْنِ ۚ ٱلْيَوْمَ أَكْمَلْتُ لَكُمْ دِينَكُمْ وَأَتْمَمْتُ عَلَيْكُمْ نِعْمَتِى وَرَضِيتُ لَكُمُ ٱلْإِسْلَـٰمَ دِينًا ۚ]]

[[warsh.pdf#page=70|ثُمَّ أَنزَلَ عَلَيْكُم مِّنۢ بَعْدِ ٱلْغَمِّ أَمَنَةً نُّعَاسًا يَغْشَىٰ طَآئِفَةً مِّنكُمْ ۖ وَطَآئِفَةٌ قَدْ أَهَمَّتْهُمْ أَنفُسُهُمْ يَظُنُّونَ بِٱللَّهِ غَيْرَ ٱلْحَقِّ ظَنَّ ٱلْجَـٰهِلِيَّةِ ۖ يَقُولُونَ هَل لَّنَا مِنَ ٱلْأَمْرِ مِن شَىْءٍ ۗ قُلْ إِنَّ ٱلْأَمْرَ كُلَّهُۥ لِلَّهِ ۗ يُخْفُونَ فِىٓ أَنفُسِهِم مَّا لَا يُبْدُونَ لَكَ ۖ يَقُولُونَ لَوْ كَانَ لَنَا مِنَ ٱلْأَمْرِ شَىْءٌ مَّا قُتِلْنَا هَـٰهُنَا ۗ قُل لَّوْ كُنتُمْ فِى بُيُوتِكُمْ لَبَرَزَ ٱلَّذِينَ كُتِبَ عَلَيْهِمُ ٱلْقَتْلُ إِلَىٰ مَضَاجِعِهِمْ ۖ وَلِيَبْتَلِىَ ٱللَّهُ مَا فِى صُدُورِكُمْ وَلِيُمَحِّصَ مَا فِى قُلُوبِكُمْ ۗ وَٱللَّهُ عَلِيمٌۢ بِذَاتِ ٱلصُّدُورِ]]

[[warsh.pdf#page=523|وَمَا خَلَقْتُ ٱلْجِنَّ وَٱلْإِنسَ إِلَّا لِيَعْبُدُونِ]]

[[warsh.pdf#page=322|مَا يَأْتِيهِم مِّن ذِكْرٍ مِّن رَّبِّهِم مُّحْدَثٍ إِلَّا ٱسْتَمَعُوهُ وَهُمْ يَلْعَبُونَ]]

[[warsh.pdf#page=97|أُو۟لَـٰٓئِكَ مَأْوَىٰهُمْ جَهَنَّمُ وَلَا يَجِدُونَ عَنْهَا مَحِيصًا]]

[[warsh.pdf#page=590|إِنَّ بَطْشَ رَبِّكَ لَشَدِيدٌ]]

[[warsh.pdf#page=559|أَعَدَّ ٱللَّهُ لَهُمْ عَذَابًا شَدِيدًا ۖ فَٱتَّقُوا۟ ٱللَّهَ يَـٰٓأُو۟لِى ٱلْأَلْبَـٰبِ ٱلَّذِينَ ءَامَنُوا۟ ۚ قَدْ أَنزَلَ ٱللَّهُ إِلَيْكُمْ ذِكْرًا]]

[[warsh.pdf#page=129|وَهُوَ ٱلْقَاهِرُ فَوْقَ عِبَادِهِۦ ۚ وَهُوَ ٱلْحَكِيمُ ٱلْخَبِيرُ]]

[[warsh.pdf#page=314|إِذْ تَمْشِىٓ أُخْتُكَ فَتَقُولُ هَلْ أَدُلُّكُمْ عَلَىٰ مَن يَكْفُلُهُۥ ۖ فَرَجَعْنَـٰكَ إِلَىٰٓ أُمِّكَ كَىْ تَقَرَّ عَيْنُهَا وَلَا تَحْزَنَ ۚ وَقَتَلْتَ نَفْسًا فَنَجَّيْنَـٰكَ مِنَ ٱلْغَمِّ وَفَتَنَّـٰكَ فُتُونًا ۚ فَلَبِثْتَ سِنِينَ فِىٓ أَهْلِ مَدْيَنَ ثُمَّ جِئْتَ عَلَىٰ قَدَرٍ يَـٰمُوسَىٰ]]

[[warsh.pdf#page=314|إِذْ تَمْشِىٓ أُخْتُكَ فَتَقُولُ هَلْ أَدُلُّكُمْ عَلَىٰ مَن يَكْفُلُهُۥ ۖ فَرَجَعْنَـٰكَ إِلَىٰٓ أُمِّكَ كَىْ تَقَرَّ عَيْنُهَا وَلَا تَحْزَنَ ۚ وَقَتَلْتَ نَفْسًا فَنَجَّيْنَـٰكَ مِنَ ٱلْغَمِّ وَفَتَنَّـٰكَ فُتُونًا ۚ فَلَبِثْتَ سِنِينَ فِىٓ أَهْلِ مَدْيَنَ ثُمَّ جِئْتَ عَلَىٰ قَدَرٍ يَـٰمُوسَىٰ]]
