---
icon: lucide-book-marked
tags:
  - Islamic/Dine
banner: https://i.pinimg.com/564x/b9/22/90/b92290fd29d73807fe553ca95b635182.jpg
cssclasses:
  - card
  - page-grid
  - no-plus
  - center-everything
aliases:
  - ديني
links pages:
  - "[[Azkaru]]"
  - "[[warsh.pdf]]"
  - "[[Mawaidh]]"
---
#### تتبع المهام الدينية
```dataview
TASK
FROM "003 Daily/001 Active Diaries"
where file.day = date(today) AND !completed
```

***
#### فضل الصلاة
<div style='font-size:26px ; color:skyblue '>:من عظم  الصلاة عند الله تعالى
</div>
<br>
<div style='color:skyblue; font-size:20px'>:قال الله تعالى
<div>﴾إِنَّ ٱلصَّلَوٰةَ كَانَتۡ عَلَى ٱلۡمُؤۡمِنِينَ كِتَٰبٗا مَّوۡقُوتٗا﴿</div>
<br>
<div style='color: skyblue; font-size: 15px'>{سورة النساء /الآية١٠٣}<br></div> فالصلاة هي القنبلة الموقوتة التي تتفجر في الآخرة إما ثوابا وأنهارا وسرورا أو عذابا أليما مرهقا, الصلاة هي العبادة الوحيدة التي  اوحيت إلى الرسول ﷺ  في السماء</div>
<br>
<div style='color: skyblue;font-size: 20px'>الحديث الصحيح : العهد الذي بيننا وبينهم الصلاةُ فمن تركها فقد كفرَ</div>
<br>
<div style='font-size:20px ; color:skyblue '>الحديث الصحيح :سَأَلْتُ النبيَّ صَلَّى اللهُ عليه وسلَّمَ: أيُّ العَمَلِ أحَبُّ إلى اللَّهِ؟ قالَ: الصَّلَاةُ علَى وقْتِهَا</div>

#### وقتها

<iframe id="iframe" title="prayerWidget" class="widget-m-top" style=" height: 358px; border: 1px solid [[ddd]]; width:40%" scrolling="no"src="https://www.islamicfinder.org/prayer-widget/2483668/shafi/15/0/18.0/17.0"></iframe><iframe style=" height: 358px; border: 1px solid [[ddd]]; width:55%" scrolling="no"src="https://flipclock.app/"></iframe>

***
#### القرآن الكريم
###### موقع لقراءة القرآن الكريم مع التفسير
```dataviewjs
const d = {
    url: "https://qur2an.net/",
    title: "شبكة القران الكريم",
    description: "شبكة القران الكريم. اقرا، استمع، حمل وابحث في سور القران الكريم",
    host: "qur2an.net",
    favicon: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAMAAABEpIrGAAAAYFBMVEU5UFs/VmEyS1bS19ro6+y6wsY6UVzm6ev////GzdD8/Pzz9fWxu7+bp616ipHd4eOEkplMYWtrfIWKmJ9vf4dSZnA8U13Z3d9ld4Ckr7ROYmydqa6RnaRYbHXw8vIoOUE1QYerAAAAy0lEQVR4AdXSVWKEMBQF0Bt7RIgNrt3/KuvejH51Lg6HOMBOBuBCnogi8EqfiMH/Avbbe1sArvby7b11IkT3G8jkkQ+NstK3XU9Dir/AMHoQgKkFiPqhNSXwnJkRnQREt4PlHKjWrn81oG1yf0GfxC78DGz++abpfwPnOxrrvRrT7tSB5XX/M9ROjZRXEZdXWZwsKwIYQytseTZtNW20Pe8+2hIQgfWtcs60jLXmL7CBNYN9vYtrbgslmG8rZzfnV9SdgVqdiCc8nMkTongkG3WXfIQAAAAASUVORK5CYII=",
    image: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAMAAABEpIrGAAAAYFBMVEU5UFs/VmEyS1bS19ro6+y6wsY6UVzm6ev////GzdD8/Pzz9fWxu7+bp616ipHd4eOEkplMYWtrfIWKmJ9vf4dSZnA8U13Z3d9ld4Ckr7ROYmydqa6RnaRYbHXw8vIoOUE1QYerAAAAy0lEQVR4AdXSVWKEMBQF0Bt7RIgNrt3/KuvejH51Lg6HOMBOBuBCnogi8EqfiMH/Avbbe1sArvby7b11IkT3G8jkkQ+NstK3XU9Dir/AMHoQgKkFiPqhNSXwnJkRnQREt4PlHKjWrn81oG1yf0GfxC78DGz++abpfwPnOxrrvRrT7tSB5XX/M9ROjZRXEZdXWZwsKwIYQytseTZtNW20Pe8+2hIQgfWtcs60jLXmL7CBNYN9vYtrbgslmG8rZzfnV9SdgVqdiCc8nMkTongkG3WXfIQAAAAASUVORK5CYII=",
};

dv.el("div", `
<div class="auto-card-link-container">
  <a class="auto-card-link-card" href="${d.url}">
    <div class="auto-card-link-main">
      <div class="auto-card-link-title">${d.title}</div>
      <div class="auto-card-link-description">${d.description}</div>
      <div class="auto-card-link-host">
        ${d.favicon ? `<img class="auto-card-link-favicon" src="${d.favicon}">` : ""}
        <span>${d.host}</span>
      </div>
    </div>
    ${d.image ? `<img class="auto-card-link-thumbnail" src="${d.image}">` : ""}
  </a>
</div>
`);
```

###### القرآن الكريم مع الترجمة
```dataviewjs
const d = {
    url: "https://quran.com/",
    title: "The Noble Quran - Quran.com",
    description: "The Quran translated into many languages in a simple and easy interface",
    host: "quran.com",
    favicon: "https://og.qurancdn.com/api/og?lang=en",
    image: "https://og.qurancdn.com/api/og?lang=en" // No image URL was provided
};

dv.el("div", `
<div class="auto-card-link-container">
  <a class="auto-card-link-card" href="${d.url}">
    <div class="auto-card-link-main">
      <div class="auto-card-link-title">${d.title}</div>
      <div class="auto-card-link-description">${d.description}</div>
      <div class="auto-card-link-host">
        ${d.favicon ? `<img class="auto-card-link-favicon" src="${d.favicon}">` : ""}
        <span>${d.host}</span>
      </div>
    </div>
    ${d.image ? `<img class="auto-card-link-thumbnail" src="${d.image}">` : ""}
  </a>
</div>
`);
```

###### حفظ القرآن الكريم
[ترتيل للحفظ](https://download.tarteel.ai/)
![[Tracker A#Tracker Read Quran]]
***
#### بعض الرسائل الجميلة
١. [[كيف تستقبل|كيف تستقبل يومك]]
٢. [[كيف نستثمر اوقاتنا]]
٣. [[نصائح هامة للفلاح]]
***
#### قنواتي الإسلامية
١.قناة [هيثم طاعت](https://www.youtube.com/@Dr.Haitham_Talaat/videos)
٢.قناة [إياد القنيبي](https://www.youtube.com/@eyadqunaibi/videos)
٣.قناة[١٨٠ درجة](https://www.youtube.com/@ahmedabobakry_180degree/videos)
٤.قناة [أنس أكشن](https://www.youtube.com/@AnasAction/videos)
٥.قناة [عبد الرحمان بابقي](https://www.youtube.com/@abdulrahmanbabgi7639/videos) 
٦.**للاستزادة:** [[My YouTube Channels#قنوات دينية|قنواتي الاسلامية]]
***
#### اذكار وأحاديث

![[Athkar & Adia]]

***

#### احكام الدين
##### 1.الصلاة
###### 1. ما تيسر جمعه من أحكام الترقيع
- اذا نسي الإنسان ركن من أركان الصلاة بعد ركعة يرجع إلى الوضعية التي قبله ثم يقوم به
    - إذا كان ذاك الركن هو الركوع فيعود الرجل صاعدا للأعلى في وضعية الانحناء أي الوضعية التي هي قبل الركوع
- وأما إذا كان الركن المنسي قبل أكثر من ركعة فيلغى ذاك الركن وتعاد الركعة أي لا تحسب ركعة الركن ويجب إعادتها وطبعا هناك سجود سهو بعدي
###### 2. [[Athkar & Adia|أدعية]] من صلاة اانبي ﷺ
![[Athkar & Adia#صلاته ﷺ]]
