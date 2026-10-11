# مخطط الأسابيع

هذه الملاحظة تعرض مخططًا للأسابيع في شكل عمودين، مع قائمة مهام لكل أسبوع، كما هو موضح في الصورة.

```dataviewjs
const numberOfWeeks = 8; // يمكنك تعديل عدد الأسابيع المعروضة

let html = `
<style>
.weekly-planner-container {
    display: flex;
    flex-wrap: wrap; /* Allows columns to wrap if needed */
    gap: 20px;
    justify-content: space-around;
    padding: 10px;
}
.weekly-column {
    flex: 1; /* Each column takes equal space */
    min-width: 45%; /* Ensure two columns */
    display: flex;
    flex-direction: column;
    gap: 20px;
    box-sizing: border-box;
}
.week-section {
    border: 1px solid #e0e0e0;
    border-radius: 8px;
    padding: 15px;
    background-color: #fdfdfd;
    box-shadow: 1px 1px 4px rgba(0,0,0,0.08);
}
.week-section h3 {
    text-align: center;
    margin-top: 0;
    margin-bottom: 15px;
    color: #2a6a8c;
    font-size: 1.1em;
    border-bottom: 1px solid #e0e0e0;
    padding-bottom: 10px;
}
.task-item {
    display: flex;
    align-items: center;
    margin-bottom: 8px;
}
.task-item input[type="checkbox"] {
    margin-right: 10px;
    width: 16px;
    height: 16px;
    accent-color: #5a7d9a;
}
.task-item span {
    flex-grow: 1;
    border-bottom: 1px dashed #d0d0d0;
    min-height: 18px;
    padding-bottom: 2px;
}
@media (max-width: 768px) {
    .weekly-column {
        min-width: 100%; /* Full width on smaller screens */
    }
}
</style>
<div class="weekly-planner-container">
    <div class="weekly-column">
`;

for (let i = 1; i <= numberOfWeeks; i++) {
    if (i > numberOfWeeks / 2 && i === Math.floor(numberOfWeeks / 2) + 1) {
        html += `</div><div class="weekly-column">`; // Start second column
    }
    html += `
        <div class="week-section">
            <h3>الأسبوع ${i}</h3>
            <div class="task-item"><input type="checkbox"><span></span></div>
            <div class="task-item"><input type="checkbox"><span></span></div>
            <div class="task-item"><input type="checkbox"><span></span></div>
            <div class="task-item"><input type="checkbox"><span></span></div>
        </div>
    `;
}

html += `
    </div>
</div>
`;
dv.container.innerHTML = html;
```
```