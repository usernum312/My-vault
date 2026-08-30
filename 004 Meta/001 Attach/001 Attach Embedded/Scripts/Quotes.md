---
icon: lucide-message-square-quote
cssclasses:
  - metadata-clean
  - Amiri-Font
---
```dataviewjs
const quotes = [
  // آيات قرآنية
  { type: "قرآني", text: "إِنَّ اللَّهَ مَعَ الصَّابِرِينَ", reference: "56 الذاريات" },
  { type: "قرآني", text: "وَمَا خَلَقْتُ ٱلْجِنَّ وَٱلْإِنسَ إِلَّا لِيَعْبُدُونِ", reference: "البقرة 153" },
  { type: "قرآني", text: "وَمَنْ يَتَّقِ اللَّهَ يَجْعَلْ لَهُ مَخْرَجًا", reference: "الطلاق 2" },
  { type: "قرآني", text: "رَبَّنَا آتِنَا فِي الدُّنْيَا حَسَنَةً وَفِي الْآخِرَةِ حَسَنَةً وَقِنَا عَذَابَ النَّارِ", reference: "البقرة 201" },
  { type: "قرآني", text: "إِنَّ عَذَابَ رَبِّهِمْ غَيْرُ مَأْمُونٍ", reference: "المعارج 28" },
  { type: "قرآني", text: "مَن كَانَ يُرِيدُ ٱلْحَيَوٰةَ ٱلدُّنْيَا وَزِينَتَهَا نُوفِّ إِلَيْهِمْ أَعْمَـٰلَهُمْ فِيهَا وَهُمْ فِيهَا لَا يُبْخَسُونَ ۝ أُو۟لَـٰٓئِكَ ٱلَّذِينَ لَيْسَ لَهُمْ فِى ٱلْـَٔاخِرَةِ إِلَّا ٱالنَّارُ ۖ وَحَبِطَ مَا صَنَعُوا۟ فِيهَا وَبَـٰطِلٌ مَّا كَانُوا۟ يَعْمَلُونَ", reference: "الذاريات 15-16"  },
  { type: "قرآني", text: "أَفَبِهَذَا الْحَدِيثِ أَنْتُمْ مُدْهِنُونَ", reference: "الواقعة 84" },
  { type: "قرآني", text: "فَأَمَّا مَن طَغَىٰ فَإِنَّ ٱلْجَحِيمَ هِىَ ٱلْمَأْوَىٰ وَأَمَّا مَنْ خَافَ مَقَامَ رَبِّهِۦ وَنَهَى ٱالنَّفْسَ عَنِ ٱلْهَوَىٰ فَإِنَّ ٱلْجَنَّةَ هِىَ ٱلْمَأْوَىٰ", reference: "النازعات 37 - 40" },
  { type: "قرآني", text: "وَٱسْتَغْفِرُوا۟ رَبَّكُمْ ثُمَّ تُوبُوٓا۟ إِلَيْهِ ۚ إِنَّ رَبِّى رَحِيمٌ وَدُودٌ", reference: "هود 90" },
  { type: "قرآني", text: "وَكَذَٰلِكَ أَخْذُ رَبِّكَ إِذَآ أَخَذَ ٱلْقُرَىٰ وَهِىَ ظَـٰلِمَةٌ ۚ إِنَّ أَخْذَهُۥٓ أَلِيمٌ شَدِيدٌ", reference: "هود 102" },
  { type: "قرآني", text: "ءَاخِذِينَ مَآ ءَاتَىٰهُمْ رَبُّهُمْ ۚ إِنَّهُمْ كَانُوا۟ قَبْلَ ذَٰلِكَ مُحْسِنِينَ", reference: "الذاريات 16" },
  { type: "قرآني", text: "فَأَصَابَهُمْ سَيِّـَٔاتُ مَا عَمِلُوا۟ وَحَاقَ بِهِم مَّا كَانُوا۟ بِهِۦ يَسْتَهْزِءُونَ", reference: "النحل 34" },
  { type: "قرآني", text: "أَفَرَءَيْتَ مَنِ ٱتَّخَذَ إِلَـٰهَهُۥ هَوَىٰهُ وَأَضَلَّهُ ٱللَّهُ عَلَىٰ عِلْمٍ وَخَتَمَ عَلَىٰ سَمْعِهِۦ وَقَلْبِهِۦ وَجَعَلَ عَلَىٰ بَصَرِهِۦ غِشَـٰوَةً فَمَن يَهْدِيهِ مِنۢ بَعْدِ ٱللَّهِ ۚ أَفَلَا تَذَكَّرُونَ", reference: "الجاثية 22" },
  //{ type: "قرآني", text: "", reference: "" },
  //{ type: "قرآني", text: "", reference: "" },

  // أحاديث نبوية
  { type: "نبوي", text: 'ففزع رسول الله ﷺ، فبدر بين يدي أصحابه مسرعًا حتى انتهى إلى القبر، فجثا على ركبتيه، فاستقبلتُه من بين يديه لأنظر ما يصنع. فبكى حتّى بلّ الثرى من دموعه، ثم أقبل علينا، فقال: "أيْ إخواني، لمثل هذا اليوم فأعِدّوا"', reference: "الترمذي" },
  { type: "نبوي", text: "اتَّقِ اللَّهَ حَيْثُمَا كُنْتَ، وَأَتْبِعِ السَّيئَةَ الْحَسَنَةَ تَمْحُهَا، وَخَالِقِ النَّاسَ بِخُلُقٍ حَسَنٍ", reference: "الترمذي" },
  { type: "نبوي", text: "لا يَزَالُ قَوْمٌ يَتَأَخَّرُونَ حَتَّى يُؤَخِّرَهُمْ اللَّهُ", reference: "مسلم" },
  { type: "نبوي", text: "لو تَعلَمونَ ما أعلَمُ لَضَحِكتُم قَليلًا ولَبَكَيتُم كَثيرًا", reference: "مسلم" },
  { type: "نبوي", text: "أَلَا وإنِّي فَرَطُكم على الحَوْضِ، أَنظُرُكم، وإنِّي مُكاثِرٌ بكم الأُمَمَ، فلا تُسَوِّدوا وَجْهي، أَلَا وقد رَأيْتُموني وسَمِعْتُم مِنِّي، وستُسأَلونَ عنِّي، فمَن كَذَبَ علَيَّ فلْيَتَبوَّأْ مَقعَدَه مِن النَّارِ، أَلَا وإنِّي مُسْتَنقِذٌ رِجالًا أو إناثًا، ومُسْتنقَذٌ منِّي آخَرونَ، فأَقولُ: يا رَبِّ، أصْحابي! فيُقالُ: إنَّك لا تَدْري ما أَحدَثوا بَعْدَك", reference: "الصحيحين" },
  //{ type: "نبوي", text: "", reference: "" },
  //{ type: "نبوي", text: "", reference: "" },

  // آثار الصالحين
  { type: "أثر", text: "مَنْ أَكْثَرَ مِنْ ذِكْرِ اللَّهِ أَحَبَّهُ اللَّهُ", reference: "ابن القيم" },
  { type: "أثر", text: "رِضَا النَّاسِ غَايَةٌ لَا تُدْرَكُ، فَعَلَيْكَ بِمَا يُقَرِّبُكَ إِلَى اللَّهِ", reference: "الحسن البصري" },
  { type: "أثر", text: "يَا ابْنَ آدَمَ، إِنَّمَا أَنْتَ أَيَّامٌ، إِذَا ذَهَبَ يَوْمٌ ذَهَبَ بَعْضُكَ", reference: "الحسن البصري" },
  { type: "أثر", text: "مَا نَدِمْتُ عَلَى شَيْءٍ نَدَمِي عَلَى يَوْمٍ غَرَبَتْ شَمْسُهُ، نَقَصَ فِيهِ أَجَلِي، وَلَمْ يَزْدَدْ فِيهِ عَمَلِي", reference: "الحسن البصري" },
  { type: "أثر", text: "ابْنَ آدَمَ، نَهَارُكَ ضَيْفُكَ فَأَحْسِنْ إِلَيْهِ، فَإِنَّكَ إِنْ أَحْسَنْتَ إِلَيْهِ ارْتَحَلَ بِحَمْدِكَ، وَإِنْ أَسَأْتَ إِلَيْهِ ارْتَحَلَ بِذَمِّكَ، وَكَذَلِكَ لَيْلَتُكَ", reference: "الحسن البصري" },
  //{ type: "أثر", text: "", reference: "" },
  //{ type: "أثر", text: "", reference: "" },
];

function beautifyQuotes(text) { return text.replace(/"([^"]*)"/g, '”$1“'); }

const sessionKey = "active_quote_index";
let randomIndex;

if (sessionStorage.getItem(sessionKey) !== null) {
  randomIndex = parseInt(sessionStorage.getItem(sessionKey), 10);
} else {
  randomIndex = Math.floor(Math.random() * quotes.length);
  sessionStorage.setItem(sessionKey, randomIndex);
}

const selected = quotes[randomIndex] || quotes[0];

let displayText = "";
if (selected.type === "قرآني") {
  displayText = `﴿ ${selected.text} ﴾`;
} else if (selected.type === "نبوي") {
  displayText = `« ${beautifyQuotes(selected.text)} »`;
} else if (selected.type === "أثر") {
  displayText = `” ${selected.text} “`;
} else {
  displayText = selected.text;
}

var fullText = "";
if (selected.type === "نبوي") {
  fullText = selected.reference ? `${displayText}<br><span style="font-size: 0.8em; color: #667eea67;">— <a href="obsidian://open?vault=My-vault&file=002%20Notes%2F003%20Pocket%20Notes%2FQuotes%20as%20images" style="color: inherit; text-decoration: none;">رواه ${selected.reference}</a></span>` : displayText; 
} else if (selected.type === "قرآني") {
  let ref_arr = selected.reference.split(" ");
  let ayy_num = ref_arr[1];
  let showing = selected.reference.replace(ayy_num, `الآية ${ayy_num}`);
  fullText = selected.reference ? `${displayText}<br><span style="font-size: 0.8em; color: #667eea67;">— <a href="obsidian://open?vault=My-vault&file=001%20Basics%2FQuran" style="color: inherit; text-decoration: none;">سورة ${showing}</a></span>` : displayText; 
} else {
  fullText = selected.reference ? `${displayText}<br><span style="font-size: 0.8em; color: #667eea67;">— <a href="obsidian://open?vault=My-vault&file=002%20Notes%2F003%20Pocket%20Notes%2FQuotes%20as%20images" style="color: inherit; text-decoration: none;">${selected.reference}</a></span>` : displayText;
}

const container = dv.container;
container.empty();

// 1. حقن CSS شامل للتحكم في الحاويات الخارجية ومغلفات المحرر
const styleId = "fix-dataview-height-style";
if (!document.getElementById(styleId)) {
  const styleEl = document.createElement("style");
  styleEl.id = styleId;
  styleEl.innerHTML = `
    .block-language-dataviewjs,
    .cm-embed-block:has(.block-language-dataviewjs),
    .cm-embed-block:has(.block-language-dataviewjs) > div {
      height: auto !important;
      min-height: unset !important;
      max-height: none !important;
      padding-bottom: 0px !important;
      margin-bottom: 0px !important;
      overflow: visible !important;
    }
  `;
  document.head.appendChild(styleEl);
}

// 2. إنشاء البطاقة
const card = document.createElement("div");
card.style.cssText = "direction: rtl; text-align: center; padding: 20px; border-radius: 15px; background: linear-gradient(135deg, rgba(102, 126, 234, 0.12), rgba(118, 75, 162, 0.12)); backdrop-filter: blur(5px); width:100%; box-sizing: border-box !important; margin: 0px !important;";
card.innerHTML = `<span style="font-size: 1.5em; color: #667eea; font-weight: 600; display: inline-block; line-height: 1.5;">${fullText}</span>`;

container.appendChild(card);

// 3. مراقبة تغيير الحجم وتصفير أي ارتفاع متبقٍ ينشئه المحرر تلقائيًا عند تقسيم الشاشة
const observer = new ResizeObserver(() => {
  const embedBlock = container.closest('.cm-embed-block');
  if (embedBlock) {
    embedBlock.style.height = 'auto';
    embedBlock.style.minHeight = '0px';
  }
});

observer.observe(card);
```