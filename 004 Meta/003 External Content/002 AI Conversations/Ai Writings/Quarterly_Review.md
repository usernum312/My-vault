# التقييم الربع سنوي

هذه الملاحظة تعرض نموذج تقييم ربع سنوي، يتضمن أسئلة حول الإنجازات والأهداف والصعوبات، كما هو موضح في الصورة.

```dataviewjs
let html = `
<style>
.quarterly-review-container {
    padding: 20px;
    max-width: 900px;
    margin: auto;
    font-family: 'Arial', sans-serif;
}
.review-block {
    margin-bottom: 35px;
    border: 1px solid #d0e0eb;
    border-radius: 12px;
    padding: 30px;
    background-color: #f7fafd;
    box-shadow: 0 6px 15px rgba(0,0,0,0.08);
}
.review-block h2 {
    color: #2c5f80;
    text-align: center;
    margin-bottom: 25px;
    font-size: 2em;
    border-bottom: 3px solid #d0e0eb;
    padding-bottom: 20px;
}
.question-section {
    margin-bottom: 25px;
}
.question-section h3 {
    color: #4a6a8a;
    margin-top: 0;
    margin-bottom: 15px;
    font-size: 1.4em;
    position: relative;
    padding-left: 30px;
}
.question-section h3::before {
    content: '▪';
    position: absolute;
    left: 0;
    color: #7ba6c9;
    font-size: 1.2em;
    line-height: 1;
}
.answer-line {
    display: flex;
    align-items: center;
    margin-bottom: 10px;
}
.answer-line input[type="checkbox"] {
    margin-right: 15px;
    width: 22px;
    height: 22px;
    accent-color: #5a7d9a;
}
.answer-line span {
    flex-grow: 1;
    border-bottom: 1px dashed #b0c0d0;
    min-height: 30px;
    padding-bottom: 5px;
}
</style>
<div class="quarterly-review-container">
    <div class="review-block">
        <h2>التقييم الربع سنوي</h2>

        <div class="question-section">
            <h3>ما أبرز إنجازات هذا الربع؟</h3>
            <div class="answer-line"><input type="checkbox"><span></span></div>
            <div class="answer-line"><input type="checkbox"><span></span></div>
            <div class="answer-line"><input type="checkbox"><span></span></div>
        </div>

        <div class="question-section">
            <h3>ما الأهداف التي تحققت؟</h3>
            <div class="answer-line"><input type="checkbox"><span></span></div>
            <div class="answer-line"><input type="checkbox"><span></span></div>
            <div class="answer-line"><input type="checkbox"><span></span></div>
        </div>

        <div class="question-section">
            <h3>أبرز صعوبات هذا الربع:</h3>
            <div class="answer-line"><input type="checkbox"><span></span></div>
            <div class="answer-line"><input type="checkbox"><span></span></div>
            <div class="answer-line"><input type="checkbox"><span></span></div>
        </div>

        <div class="question-section">
            <h3>ما أكثر عادة أو سلوك أثر علي؟</h3>
            <div class="answer-line"><input type="checkbox"><span></span></div>
            <div class="answer-line"><input type="checkbox"><span></span></div>
        </div>
    </div>
</div>
`;
dv.container.innerHTML = html;
```