
# مخطط الأشهر السنوي

هذه الملاحظة تعرض مخططًا لجميع أشهر السنة في شكل بطاقات متجاورة، مع ثلاثة أماكن لكتابة الأهداف لكل شهر، تمامًا كما في الصورة.

```dataviewjs
const months = [
    "يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو",
    "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر"
];

let html = `
<style>
.monthly-planner-container {
    display: flex;
    flex-wrap: wrap;
    gap: 20px;
    justify-content: space-around;
    padding: 10px;
}
.month-card {
    border: 1px solid #ccc;
    border-radius: 8px;
    padding: 15px;
    width: 45%; /* Approx half width for two columns */
    min-width: 300px; /* Ensure it doesn't get too small */
    box-shadow: 2px 2px 5px rgba(0,0,0,0.1);
    background-color: #f9f9f9;
    box-sizing: border-box; /* Include padding and border in the element's total width and height */
}
.month-card h3 {
    text-align: center;
    margin-top: 0;
    margin-bottom: 15px;
    color: #333;
    font-size: 1.2em;
    border-bottom: 1px solid #eee;
    padding-bottom: 10px;
}
.month-card .goal-line {
    border-bottom: 1px dashed #bbb;
    padding-bottom: 5px;
    margin-bottom: 10px;
    min-height: 20px; /* Placeholder for line */
}
@media (max-width: 768px) {
    .month-card {
        width: 100%; /* Full width on smaller screens */
    }
}
</style>
<div class="monthly-planner-container">
`;

for (let i = 0; i < months.length; i++) {
    html += `
    <div class="month-card">
        <h3>${months[i]}</h3>
        <div class="goal-line"></div>
        <div class="goal-line"></div>
        <div class="goal-line"></div>
    </div>
    `;
}

html += `</div>`;
dv.container.innerHTML = html;
```
