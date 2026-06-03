---
Topic: مكافئات على الأفعال/العادات الايجابية
links pages:
  - "[[EnterTainment's]]"
Categories:
  - "[[Rest]]"
cssclasses:
  - rtl-metadata
  - rtl-everything
aliases:
  - مكافئة
icon: lucide-gift
---
> *غير مسموح* باستخدام ومشاهدة [فيديوهات](https://youtube.com) عبر حساب المحتوى التافه، كما انه غير مسموح لعب الألعاب بدون تفعيل والحصول على المكافئة.
> *كيف ؟*
> بعد انجاز اي مهمه يسمح لك بالاتي
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

dv.paragraph(`🔹 **عدد المهمات المنجزة:** ${completedTasks.length}`);
dv.paragraph(`🔹 **إجمالي الوقت المستحق:** ${totalRestTime} دقيقة`);
}
```
>كم أضعت؟ 1:20 
#### ألعاب
[cookie run](android-app://com.devsisters.ck)
[rpg vanilla](android-app://com.grimdev.grimquest)
[underdark](android-app://com.FreeDust.UnderDark)
[ragdol fists](android-app://com.lonriv.radofists)
[warrior un](android-app://com.GamerMind.Warriors_of_the_Universe_Online)
[Yugi yo lins](android-app://jp.konami.duellinks)
[Boom birdS](android-app://com.tuokio.boomslingers)
[Limbs cmpn](android-app://com.ProjectMoon.LimbusCompany)
#### أفعال
> *ملاحظة:* الأفعال عادة ما تؤدي الى آلام على مستوى المحفظة او الجيب (على حسب)

1. اشتري علكة
2. اشتري شيبس
3. اشتري مكسرات
4. اشتري آيس كريم
5. اشتري عصير مجمد
6. خوض تجربة جديدة
7. ممارسة [[My self -Anna-#الهوايات|هواية]] ممتعة