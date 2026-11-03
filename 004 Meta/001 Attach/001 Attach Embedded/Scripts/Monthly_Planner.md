---
icon: lucide-calendar-days
---
# مخطط الأشهر السنوي

عرض لجميع اشهر السنه مع ثلاث خانات لكتابه الاهداف الرئيسيه لكل شهر

```dataviewjs
const storagePath = ".obsidian/daily-planner.json";
let containerId = "Monthly-Planner";
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

const months = [
    "يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو",
    "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر"
];

let html = `
<style>
.mp-container {
    background: var(--background-primary, #ffffff);
    color: var(--text-normal, #333333);
    border: 1px solid var(--background-modifier-border, #e0e0e0);
    border-radius: 12px;
    padding: 25px;
    max-width: 900px;
    margin: 20px auto;
    font-family: 'Cairo', 'Tahoma', sans-serif;
    box-shadow: 0 4px 15px rgba(0,0,0,0.05);
    direction: rtl;
    text-align: right;
}
.mp-badge-container {
    text-align: center;
    margin-bottom: 30px;
}
.mp-badge {
    display: inline-block;
    background: var(--interactive-accent, #2b5f80);
    color: #ffffff;
    padding: 8px 35px;
    border-radius: 20px;
    font-size: 1.4em;
    font-weight: bold;
    box-shadow: 0 4px 10px rgba(0,0,0,0.1);
}
/* شبكة من عمودين لضمان ظهور البطاقات في صفوف متجاورة */
.mp-grid {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 20px;
}
@media (max-width: 768px) {
    .mp-grid {
        grid-template-columns: 1fr;
    }
}
.mp-month-card {
    background: var(--background-secondary, #f9f9f9);
    border: 1px solid var(--background-modifier-border, #e0e0e0);
    border-radius: 10px;
    padding: 16px;
    box-shadow: 0 2px 8px rgba(0,0,0,0.03);
}
.mp-month-header {
    font-size: 1.15em;
    font-weight: bold;
    color: var(--text-normal, #222);
    margin-bottom: 15px;
    display: flex;
    align-items: center;
    gap: 8px;
    border-bottom: 1px solid var(--background-modifier-border, #e0e0e0);
    padding-bottom: 8px;
}
.mp-month-header::before {
    content: '◆';
    color: var(--text-muted, #555);
    font-size: 0.85em;
}
.mp-goal-row {
    display: flex;
    align-items: center;
    margin-bottom: 10px;
    gap: 10px;
}
.mp-checkbox {
    appearance: auto !important;
    -webkit-appearance: checkbox !important;
    width: 18px;
    height: 18px;
    cursor: pointer;
    accent-color: var(--interactive-accent, #444);
    flex-shrink: 0;
}
.mp-line-box {
    flex-grow: 1;
    position: relative;
    height: 28px;
    display: flex;
    align-items: center;
}
.mp-dots {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    border-bottom: 1.5px dotted var(--text-muted, #999);
    pointer-events: none;
}
.mp-input {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    border: none !important;
    background: transparent !important;
    background-color: transparent !important;
    box-shadow: none !important;
    padding: 0 5px !important;
    font-size: 0.95em;
    font-family: inherit;
    color: var(--text-normal, #222) !important;
    outline: none !important;
}
.mp-status {
    font-size: 0.85em;
    color: var(--text-muted, #777);
    margin-top: 25px;
    text-align: left;
    font-style: italic;
}
</style>

<div class="mp-container">
    <div class="mp-badge-container">
        <div class="mp-badge">مخطط الأشهر</div>
    </div>
    <div class="mp-grid">
`;

// توليد بطاقات الأشهر الإثني عشر (مع 3 خطوط أهداف لكل شهر كما طلبت)
months.forEach((month, index) => {
    let mId = index + 1;
    html += `
        <div class="mp-month-card">
            <div class="mp-month-header">${month}</div>
    `;
    
    for (let t = 1; t <= 3; t++) {
        html += `
            <div class="mp-goal-row">
                <input type="checkbox" class="mp-checkbox" data-id="m${mId}_goal_chk_${t}">
                <div class="mp-line-box">
                    <div class="mp-dots"></div>
                    <input type="text" class="mp-input" data-id="m${mId}_goal_txt_${t}" placeholder="">
                </div>
            </div>
        `;
    }
    
    html += `</div>`;
});

html += `
    </div>
</div>
`;

dv.container.innerHTML = html;

let inputs = dv.container.querySelectorAll('.mp-input, .mp-checkbox');
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