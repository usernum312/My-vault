---
icon: lucide-notebook-tabs
---
# التقييم الربع سنوي

نموذج تقييم ربع سنوي، يتضمن أسئلة حول الإنجازات والأهداف والصعوبات التي واجهتها لهذا الربع

```dataviewjs
const storagePath = ".obsidian/daily-planner.json";
let containerId = "Quarterly-Review";

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
.q-sheet {
    background: var(--background-primary, #ffffff);
    color: var(--text-normal, #333333);
    border: 1px solid var(--background-modifier-border, #e0e0e0);
    border-radius: 8px;
    padding: 25px;
    max-width: 800px;
    margin: 20px auto;
    font-family: 'Cairo', 'Tahoma', sans-serif;
    box-shadow: 0 4px 12px rgba(0,0,0,0.05);
    direction: rtl;
    text-align: right;
}
.q-title {
    text-align: center;
    color: var(--text-normal, #2b2b2b);
    font-size: 1.7em;
    font-weight: bold;
    margin-bottom: 25px;
    border-bottom: 2px solid var(--text-normal, #333);
    padding-bottom: 12px;
}
.q-section {
    margin-bottom: 22px;
}
.q-sec-title {
    font-size: 1.15em;
    font-weight: bold;
    color: var(--text-normal, #222);
    margin-bottom: 10px;
    display: flex;
    align-items: center;
    gap: 8px;
}
.q-sec-title::before {
    content: '◆';
    color: var(--text-muted, #555);
    font-size: 0.85em;
}
.q-row {
    display: flex;
    align-items: center;
    margin-bottom: 14px;
    gap: 12px;
}
.q-checkbox {
    appearance: auto !important;
    -webkit-appearance: checkbox !important;
    width: 18px;
    height: 18px;
    cursor: pointer;
    accent-color: var(--interactive-accent, #555);
    flex-shrink: 0;
}
/* حاوية السطر التي تحمل النقاط في الخلفية */
.q-line-box {
    flex-grow: 1;
    position: relative;
    border-bottom: 1.5px dotted var(--text-muted, #999);
    height: 30px;
    display: flex;
    align-items: center;
}
/* حقل الكتابة الشفاف فوق النقاط */
.q-input {
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
    font-size: 1em;
    font-family: inherit;
    color: var(--text-normal, #222) !important;
    outline: none !important;
}
.q-status {
    font-size: 0.8em;
    color: var(--text-muted, #777);
    margin-top: 15px;
    text-align: left;
    font-style: italic;
}
</style>

<div class="q-sheet">
    <div class="q-title">التقييم الربع سنوي</div>

    <div class="q-section">
        <div class="q-sec-title">ما أبرز إنجازات هذا الربع؟</div>
        <div class="q-row">
            <input type="checkbox" class="q-checkbox" data-id="ach_chk_1">
            <div class="q-line-box"><input type="text" class="q-input" data-id="ach_txt_1"></div>
        </div>
        <div class="q-row">
            <input type="checkbox" class="q-checkbox" data-id="ach_chk_2">
            <div class="q-line-box"><input type="text" class="q-input" data-id="ach_txt_2"></div>
        </div>
        <div class="q-row">
            <input type="checkbox" class="q-checkbox" data-id="ach_chk_3">
            <div class="q-line-box"><input type="text" class="q-input" data-id="ach_txt_3"></div>
        </div>
    </div>

    <div class="q-section">
        <div class="q-sec-title">ما الأهداف التي تحققت؟</div>
        <div class="q-row">
            <input type="checkbox" class="q-checkbox" data-id="goal_chk_1">
            <div class="q-line-box"><input type="text" class="q-input" data-id="goal_txt_1"></div>
        </div>
        <div class="q-row">
            <input type="checkbox" class="q-checkbox" data-id="goal_chk_2">
            <div class="q-line-box"><input type="text" class="q-input" data-id="goal_txt_2"></div>
        </div>
        <div class="q-row">
            <input type="checkbox" class="q-checkbox" data-id="goal_chk_3">
            <div class="q-line-box"><input type="text" class="q-input" data-id="goal_txt_3"></div>
        </div>
    </div>

    <div class="q-section">
        <div class="q-sec-title">أبرز صعوبات هذا الربع:</div>
        <div class="q-row">
            <input type="checkbox" class="q-checkbox" data-id="diff_chk_1">
            <div class="q-line-box"><input type="text" class="q-input" data-id="diff_txt_1"></div>
        </div>
        <div class="q-row">
            <input type="checkbox" class="q-checkbox" data-id="diff_chk_2">
            <div class="q-line-box"><input type="text" class="q-input" data-id="diff_txt_2"></div>
        </div>
        <div class="q-row">
            <input type="checkbox" class="q-checkbox" data-id="diff_chk_3">
            <div class="q-line-box"><input type="text" class="q-input" data-id="diff_txt_3"></div>
        </div>
    </div>

    <div class="q-section">
        <div class="q-sec-title">ما أكثر عادة أو سلوك أثر علي؟</div>
        <div class="q-row">
            <input type="checkbox" class="q-checkbox" data-id="habit_chk_1">
            <div class="q-line-box"><input type="text" class="q-input" data-id="habit_txt_1"></div>
        </div>
        <div class="q-row">
            <input type="checkbox" class="q-checkbox" data-id="habit_chk_2">
            <div class="q-line-box"><input type="text" class="q-input" data-id="habit_txt_2"></div>
        </div>
    </div>

    <div class="q-section">
        <div class="q-sec-title">ما الذي أحتاج إلى تحسينه في الربع القادم؟</div>
        <div class="q-row">
            <input type="checkbox" class="q-checkbox" data-id="improve_chk_1">
            <div class="q-line-box"><input type="text" class="q-input" data-id="improve_txt_1"></div>
        </div>
        <div class="q-row">
            <input type="checkbox" class="q-checkbox" data-id="improve_chk_2">
            <div class="q-line-box"><input type="text" class="q-input" data-id="improve_txt_2"></div>
        </div>
    </div>
</div>
`;

dv.container.innerHTML = html;

let inputs = dv.container.querySelectorAll('.q-input, .q-checkbox');
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