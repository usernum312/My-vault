---
icon: lucide-timer-off
---
```dataviewjs
const targetFolder = "003 Daily/001 Active Diaries";
const defaultTime = 10; 

const customRules = [
    { term: "صلاة", time: 15 },
    { term: "قراءة [[Quran|القرآن الكريم]]", time: 15 },
    { term: "حفظ", time: 30 }
];

const todayStr = moment().format("YYYY-MM-DD");
const filePath = `${targetFolder}/${todayStr}.md`;
const page = dv.page(filePath);

if (!page) {} 
else {
    const completedTasks = page.file.tasks.where(t => t.completed);
    
    let totalRestTime = 0;
    for (let task of completedTasks) {
        let taskTime = defaultTime;
        
        for (let rule of customRules) {
            if (task.text.includes(rule.term)) {
                taskTime = rule.time;
                break;
            }
        }
        totalRestTime += taskTime;
    }

dv.paragraph(`- **عدد المهمات المنجزة:** ${completedTasks.length}\n- **إجمالي الوقت المستحق:** ${totalRestTime} دقيقة`);
}
```