---
icon: lucide-goal
---
# أهداف الربع السنوي

عرض لثلاثه اشهر خاصه بهذا الربع مع خانات لكتابه الاهداف الاساسيه لكل شهر

```dataviewjs
const storagePath = ".obsidian/daily-planner.json";
let containerId = "Quarterly-Goals";
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
.qg-container {
    background: var(--background-primary, #ffffff);
    color: var(--text-normal, #333333);
    border: 1px solid var(--background-modifier-border, #e0e0e0);
    border-radius: 12px;
    padding: 25px;
    max-width: 750px;
    margin: 20px auto;
    font-family: 'Cairo', 'Tahoma', sans-serif;
    box-shadow: 0 4px 15px rgba(0,0,0,0.05);
    direction: rtl;
    text-align: right;
}
.qg-badge-container {
    text-align: center;
    margin-bottom: 30px;
}
.qg-badge {
    display: inline-block;
    background: var(--interactive-accent, #2b5f80);
    color: #ffffff;
    padding: 8px 35px;
    border-radius: 20px;
    font-size: 1.4em;
    font-weight: bold;
    box-shadow: 0 4px 10px rgba(0,0,0,0.1);
}
.qg-month-card {
    background: var(--background-secondary, #f9f9f9);
    border: 1px solid var(--background-modifier-border, #e0e0e0);
    border-radius: 10px;
    padding: 20px;
    margin-bottom: 25px;
    box-shadow: 0 2px 8px rgba(0,0,0,0.03);
}
.qg-month-header {
    display: flex;
    align-items: center;
    gap: 15px;
    margin-bottom: 20px;
    font-size: 1.2em;
    font-weight: bold;
    color: var(--text-normal, #222);
}
.qg-month-line {
    flex-grow: 1;
    position: relative;
    height: 30px;
    display: flex;
    align-items: center;
}
.qg-goal-row {
    display: flex;
    align-items: center;
    margin-bottom: 14px;
    gap: 15px;
}
.qg-checkbox {
    appearance: auto !important;
    -webkit-appearance: checkbox !important;
    width: 20px;
    height: 20px;
    cursor: pointer;
    accent-color: var(--interactive-accent, #444);
    flex-shrink: 0;
}
.qg-line-box {
    flex-grow: 1;
    position: relative;
    height: 32px;
    display: flex;
    align-items: center;
}
.qg-dots {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    border-bottom: 1.5px dotted var(--text-muted, #999);
    pointer-events: none;
}
.qg-input {
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
.qg-status {
    font-size: 0.85em;
    color: var(--text-muted, #777);
    margin-top: 15px;
    text-align: left;
    font-style: italic;
}
</style>

<div class="qg-container">
    <div class="qg-badge-container">
        <div class="qg-badge">أهداف الربع</div>
    </div>
`;

// إنشاء الأقسام الثلاثة للأشهر الثلاثة
for (let m = 1; m <= 3; m++) {
    html += `
    <div class="qg-month-card">
        <div class="qg-month-header">
            <span>شهر</span>
            <div class="qg-month-line">
                <input type="text" class="qg-input" data-id="month_name_${m}" placeholder="اكتب اسم الشهر..." style="font-weight: bold; font-size: 0.9em;">
            </div>
        </div>
    `;

    // 4 أهداف لكل شهر مطابقة للصورة
    for (let g = 1; g <= 4; g++) {
        html += `
        <div class="qg-goal-row">
            <input type="checkbox" class="qg-checkbox" data-id="m${m}_goal_chk_${g}">
            <div class="qg-line-box">
                <div class="qg-dots"></div>
                <input type="text" class="qg-input" data-id="m${m}_goal_txt_${g}" placeholder="">
            </div>
        </div>
        `;
    }

    html += `</div>`;
}

html += `</div>`;

dv.container.innerHTML = html;

let inputs = dv.container.querySelectorAll('.qg-input, .qg-checkbox');
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