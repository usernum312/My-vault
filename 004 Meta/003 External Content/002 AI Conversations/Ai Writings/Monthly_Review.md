# مراجعة الشهر

هذه الملاحظة تعرض قسمًا لمراجعة الشهر، بما في ذلك ما يحتاج إلى تحسين وإيجابيات الشهر، كما هو موضح في الصورة.

```dataviewjs
let html = `
<style>
.monthly-review-container {
    padding: 20px;
    max-width: 800px;
    margin: auto;
    font-family: 'Arial', sans-serif;
}
.review-section {
    margin-bottom: 30px;
    border: 1px solid #e9e9e9;
    border-radius: 10px;
    padding: 25px;
    background-color: #fefefe;
    box-shadow: 0 4px 10px rgba(0,0,0,0.05);
}
.review-section h2 {
    color: #333;
    text-align: center;
    margin-bottom: 20px;
    font-size: 1.8em;
    border-bottom: 2px solid #f0f0f0;
    padding-bottom: 15px;
}
.review-section h3 {
    color: #555;
    margin-top: 0;
    margin-bottom: 15px;
    font-size: 1.3em;
}
.checklist-item {
    display: flex;
    align-items: center;
    margin-bottom: 12px;
}
.checklist-item input[type="checkbox"] {
    margin-right: 12px;
    width: 20px;
    height: 20px;
    accent-color: #5a7d9a;
}
.checklist-item span {
    flex-grow: 1;
    border-bottom: 1px dashed #ccc;
    min-height: 25px;
    padding-bottom: 5px;
}
.text-area-lines {
    border: 1px solid #ddd;
    border-radius: 5px;
    padding: 15px;
    background-color: #fcfcfc;
    min-height: 150px;
    line-height: 1.8;
    /* Simulate ruled lines */
    background-image: linear-gradient(to bottom, #eee 1px, transparent 1px);
    background-size: 100% 30px; /* Adjust line height as needed */
}
.text-area-lines:focus-within {
    border-color: #a0c3d9;
    box-shadow: 0 0 5px rgba(90, 125, 154, 0.3);
}
</style>
<div class="monthly-review-container">
    <div class="review-section">
        <h2>مراجعة الشهر</h2>
        <h3>ما الذي أحتاج تحسينه في الربع القادم؟</h3>
        <div class="checklist-item"><input type="checkbox"><span></span></div>
        <div class="checklist-item"><input type="checkbox"><span></span></div>
        <div class="checklist-item"><input type="checkbox"><span></span></div>
    </div>

    <div class="review-section">
        <h3>الإيجابيات هذا الشهر</h3>
        <div class="text-area-lines">
            <!-- User can type here, or use multiple divs for distinct lines -->
            <div style="min-height: 25px; border-bottom: 1px dashed #ccc; margin-bottom: 10px;"></div>
            <div style="min-height: 25px; border-bottom: 1px dashed #ccc; margin-bottom: 10px;"></div>
            <div style="min-height: 25px; border-bottom: 1px dashed #ccc; margin-bottom: 10px;"></div>
            <div style="min-height: 25px; border-bottom: 1px dashed #ccc; margin-bottom: 10px;"></div>
        </div>
    </div>
</div>
`;
dv.container.innerHTML = html;
```