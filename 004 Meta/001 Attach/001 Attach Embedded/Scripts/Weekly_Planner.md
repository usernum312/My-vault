---
icon: lucide-layout-list
---
# مخطط الأسابيع

مخطط للأسابيع الاربع للشهر الحالي، مع قائمة مهام لكل أسبوع:

```dataviewjs
const storagePath = ".obsidian/daily-planner.json";
let containerId = "Weekly-Planner";

let globalData = {};
if (await app.vault.adapter.exists(storagePath)) {
    try {
        let content = await app.vault.adapter.read(storagePath);
        globalData = JSON.parse(content || "{}");
    } catch (e) {
        globalData = {};
    }
}
let savedData = globalData[containerId] || {};

let html = `
<style>
.mg-container {
    background: var(--background-primary, #ffffff);
    color: var(--text-normal, #333333);
    border: 1px solid var(--background-modifier-border, #e0e0e0);
    border-radius: 12px;
    padding: 25px;
    max-width: 850px;
    margin: 20px auto;
    font-family: 'Cairo', 'Tahoma', sans-serif;
    box-shadow: 0 4px 15px rgba(0,0,0,0.05);
    direction: rtl;
    text-align: right;
}
.mg-badge-container {
    text-align: center;
    margin-bottom: 30px;
}
.mg-badge {
    display: inline-block;
    background: var(--interactive-accent, #2b5f80);
    color: #ffffff;
    padding: 8px 35px;
    border-radius: 20px;
    font-size: 1.4em;
    font-weight: bold;
    box-shadow: 0 4px 10px rgba(0,0,0,0.1);
}
/* شبكة من عمودين لضمان صفين، كل صف يحتوي على أسبوعين */
.mg-grid {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 20px;
}
@media (max-width: 700px) {
    .mg-grid {
        grid-template-columns: 1fr;
    }
}
.mg-week-card {
    background: var(--background-secondary, #f9f9f9);
    border: 1px solid var(--background-modifier-border, #e0e0e0);
    border-radius: 10px;
    padding: 18px;
    box-shadow: 0 2px 8px rgba(0,0,0,0.03);
}
.mg-week-header {
    font-size: 1.15em;
    font-weight: bold;
    color: var(--text-normal, #222);
    margin-bottom: 15px;
    display: flex;
    align-items: center;
    gap: 8px;
    border-bottom: 1px solid var(--background-modifier-border, #e0e0e0);
    padding-bottom: 10px;
}
.mg-week-header::before {
    content: '◆';
    color: var(--text-muted, #555);
    font-size: 0.85em;
}
.mg-goal-row {
    display: flex;
    align-items: center;
    margin-bottom: 12px;
    gap: 12px;
}
.mg-checkbox {
    appearance: auto !important;
    -webkit-appearance: checkbox !important;
    width: 18px;
    height: 18px;
    cursor: pointer;
    accent-color: var(--interactive-accent, #444);
    flex-shrink: 0;
}
.mg-line-box {
    flex-grow: 1;
    position: relative;
    height: 30px;
    display: flex;
    align-items: center;
}
.mg-dots {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    border-bottom: 1.5px dotted var(--text-muted, #999);
    pointer-events: none;
}
.mg-input {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    border: none !important;
    background: transparent !important;
    background-color: transparent !important;
    box-shadow: none !important;
    padding: 0 6px !important;
    font-size: 1em;
    font-family: inherit;
    color: var(--text-normal, #222) !important;
    outline: none !important;
}
.mg-status {
    font-size: 0.85em;
    color: var(--text-muted, #777);
    margin-top: 25px;
    text-align: left;
    font-style: italic;
}
</style>

<div class="mg-container">
    <div class="mg-badge-container">
        <div class="mg-badge">أهداف الشهر</div>
    </div>
    <div class="mg-grid">
`;

// إنشاء الأسابيع الأربعة (أسبوعين في كل صف)
for (let w = 1; w <= 4; w++) {
    html += `
        <div class="mg-week-card">
            <div class="mg-week-header">الأسبوع ${w}</div>
    `;
    
    for (let t = 1; t <= 4; t++) {
        html += `
            <div class="mg-goal-row">
                <input type="checkbox" class="mg-checkbox" data-id="w${w}_task_chk_${t}">
                <div class="mg-line-box">
                    <div class="mg-dots"></div>
                    <input type="text" class="mg-input" data-id="w${w}_task_txt_${t}" placeholder="">
                </div>
            </div>
        `;
    }
    
    html += `</div>`;
}

html += `
    </div>
</div>
`;

dv.container.innerHTML = html;

let inputs = dv.container.querySelectorAll('.mg-input, .mg-checkbox');
inputs.forEach(input => {
    let id = input.getAttribute('data-id');
    if (savedData[id] !== undefined) {
        if (input.type === 'checkbox') {
            input.checked = savedData[id];
        } else {
            input.value = savedData[id];
        }
    }

    input.addEventListener('input', () => saveDataLocally());
    input.addEventListener('change', () => saveDataLocally());
});


async function saveDataLocally() {
    let currentScriptData = {};
    inputs.forEach(input => {
        let id = input.getAttribute('data-id');
        if (input.type === 'checkbox') {
            currentScriptData[id] = input.checked;
        } else {
            currentScriptData[id] = input.value;
        }
    });

    let globalData = {};
    if (await app.vault.adapter.exists(storagePath)) {
        try {
            let content = await app.vault.adapter.read(storagePath);
            globalData = JSON.parse(content || "{}");
        } catch (e) {
            globalData = {};
        }
    }

    globalData[containerId] = currentScriptData;
    await app.vault.adapter.write(storagePath, JSON.stringify(globalData, null, 2));
}