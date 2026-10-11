# أهداف الربع السنوي

هذه الملاحظة تعرض مخططًا لأهداف الأشهر الثلاثة للربع السنوي، مع قائمة مهام لكل شهر، كما هو موضح في الصورة.

```dataviewjs
const currentQuarterMonths = [
    "الشهر الأول", // يمكنك تغيير هذه الأسماء لتناسب الربع الحالي
    "الشهر الثاني",
    "الشهر الثالث"
];

let html = `
<style>
.quarterly-goals-container {
    display: flex;
    flex-direction: column;
    gap: 25px;
    padding: 15px;
    max-width: 700px;
    margin: auto;
}
.month-goals-section {
    border: 1px solid #ddd;
    border-radius: 8px;
    padding: 20px;
    background-color: #ffffff;
    box-shadow: 1px 1px 3px rgba(0,0,0,0.05);
}
.month-goals-section h3 {
    margin-top: 0;
    color: #444;
    border-bottom: 2px solid #eee;
    padding-bottom: 10px;
    margin-bottom: 15px;
    text-align: center;
    font-size: 1.4em;
}
.goal-item {
    display: flex;
    align-items: center;
    margin-bottom: 10px;
}
.goal-item input[type="checkbox"] {
    margin-right: 10px;
    width: 18px;
    height: 18px;
    accent-color: #5a7d9a;
}
.goal-item span {
    flex-grow: 1;
    border-bottom: 1px dashed #ccc;
    min-height: 20px;
    padding-bottom: 3px;
}
</style>
<div class="quarterly-goals-container">
`;

currentQuarterMonths.forEach(month => {
    html += `
    <div class="month-goals-section">
        <h3>${month}</h3>
        <div class="goal-item">
            <input type="checkbox"><span></span>
        </div>
        <div class="goal-item">
            <input type="checkbox"><span></span>
        </div>
        <div class="goal-item">
            <input type="checkbox"><span></span>
        </div>
    </div>
    `;
});

html += `</div>`;
dv.container.innerHTML = html;
```
```