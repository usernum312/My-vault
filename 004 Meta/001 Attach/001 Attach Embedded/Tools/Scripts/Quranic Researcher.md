---
icon: lucide-search
cssclasses:
  - Disappear
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
            const file=app.workspace.getActiveFile();
            const link=`[[warsh.pdf#page=${v.page}]]`;
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