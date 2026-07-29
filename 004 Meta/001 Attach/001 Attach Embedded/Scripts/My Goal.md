---
cssclasses:
  - 
  - metadata-clean
icon: lucide-medal
---
###### <span style="display: none">section 1</span>
```dataviewjs
const folderPath = '"003 Daily/003 The Diaries Log\'s"';
const targetHeading = "ما الذي ترغب في التخلي عنه أو اكتسابه هذا الأسبوع؟";

const today = new Date();
const oneWeekAgo = new Date();
oneWeekAgo.setDate(today.getDate() - 7);

const pages = dv.pages(folderPath)
    .filter(p => {
        const fileDate = new Date(p.file.name);
        
        return !isNaN(fileDate) && fileDate >= oneWeekAgo && fileDate <= today;
    });

const allGoals = [];

for (let page of pages) {
    const tFile = app.vault.getAbstractFileByPath(page.file.path);
    
    if (tFile) {
        const fileContent = await app.vault.read(tFile);
        const lines = fileContent.split('\n');
        
        let headingFound = false;
        let targetContent = [];
        
        for (let line of lines) {
            if (line.includes(`#### ${targetHeading}`)) {
                headingFound = true;
                continue;
            }
            
            if (headingFound && line.startsWith('#')) {
                break;
            }
            
            if (headingFound) {
                targetContent.push(line.trim());
            }
        }
        
        const finalContent = targetContent.filter(line => line.length > 0).join('\n');
        
        if (finalContent && finalContent != "عادة، طريقة فكر...") {
            allGoals.push(`${finalContent}`);
        }
    }
}
let oneGoal = allGoals[0];

const h6Style = "margin-top: 5px; padding-bottom: 5px; font-size: 0.95rem; font-weight: 400;";

if (allGoals.length === 1) {
    dv.el("span", "هدف الأسبوع الحالي: " + oneGoal, { attr: { style: "" } });
}
else if (allGoals.length > 1) {
    dv.el("h6", "🎯 أهداف الأسبوع الحالي:", { attr: { style: h6Style } });
    dv.list(allGoals);
}
else {
dv.span("حدد هدف واعمل على تحقيقه");
}
```
```dataviewjs
const container = dv.el("div", "", { attr: { style: "display: flex; align-items: center; gap: 10px; margin: 0; margin-top: -16.5px; position: relative;" } }); const btn = dv.el("button", "تحفيز", { parent: container }); btn.style.padding = "0 0px"; btn.style.userSelect = "text" ; btn.style.background = "none"; btn.style.color = "#D3D3D3"; const textSpan = dv.el("span", "", { parent: container }); textSpan.innerHTML = `<b style="color:red">إقرأها:</b> ألم تسأم من تضييع وقتك انت لا تفعل اي شيء فقط تظل تستهلك؛ توقف: افتح الملاحظة و<a href="obsidian://open?vault=My-vault&file=004%20Meta%2F002%20Archive%2F001%20Archived%2FLearn%20Something" style="color: inherit !important; text-decoration:none;">تعلم أي شيء</a <`;  textSpan.style.display = "none"; textSpan.style.transition = "opacity 0.3s ease"; textSpan.style.color = "var(--blockquote-color)"; textSpan.style.padding = "5px 10px"; textSpan.style.borderRadius = "4px"; textSpan.style.fontSize = "14px"; btn.addEventListener("click", (event) => { event.stopPropagation(); if (textSpan.style.display === "none") { textSpan.style.display = "inline-block"; } else { textSpan.style.display = "none"; } }); document.addEventListener("click", (event) => { if (!btn.contains(event.target) && !textSpan.contains(event.target)) { textSpan.style.display = "none"; } });
```

## أسئلة (للتذكير)
1. هل صليت رواتبك؟ وهل قرأت <a href="obsidian://open?vault=My-vault&file=001%20Basics%2FAzkaru" style="text-decoration: none;color:inherit;">اذكار يومك/ليلتك؟</a>
2. هل أتحرك نحو <a href=" obsidian://open?vault=My-vault&file=001%20Basics%2F00-Anchor%2F001%20Main%20Root%2FThe%20Ideal%20life" style="text-decoration: none;color:inherit;">الحياة التي أكرهها</a> ام <a href="obsidian://open?vault=My-vault&file=001%20Basics%2F00-Anchor%2F001%20Main%20Root%2FThe%20Ideal%20life" style="text-decoration: none;color:inherit;">الحياة التي اريدها؟</a>
3. ما هو الشيء الذي كنت ستفعله هذا اليوم لو كنت بالفعل ذلك الشخص؟