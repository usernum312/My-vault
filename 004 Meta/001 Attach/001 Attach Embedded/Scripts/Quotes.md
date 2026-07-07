---
icon: lucide-message-square-quote
cssclasses:
  - metadata-clean
  - Amiri-Font
---
```dataviewjs
// مصدر المحتوى: مقولات، آيات، أحاديث
const quotes = [
  // آيات قرآنية
  { type: "قرآني", text: "إِنَّ اللَّهَ مَعَ الصَّابِرِينَ", reference: "56 الذاريات" },
  { type: "قرآني", text: "وَمَا خَلَقْتُ ٱلْجِنَّ وَٱلْإِنسَ إِلَّا لِيَعْبُدُونِ", reference: "البقرة 153" },
  { type: "قرآني", text: "وَمَنْ يَتَّقِ اللَّهَ يَجْعَلْ لَهُ مَخْرَجًا", reference: "الطلاق 2" },
  { type: "قرآني", text: "رَبَّنَا آتِنَا فِي الدُّنْيَا حَسَنَةً وَفِي الْآخِرَةِ حَسَنَةً وَقِنَا عَذَابَ النَّارِ", reference: "البقرة 201" },
  { type: "قرآني", text: "إِنَّ عَذَابَ رَبِّهِمْ غَيْرُ مَأْمُونٍ", reference: "المعارج 28" },
  { type: "قرآني", text: "مَن كَانَ يُرِيدُ ٱلْحَيَوٰةَ ٱلدُّنْيَا وَزِينَتَهَا نُوَفِّ إِلَيْهِمْ أَعْمَـٰلَهُمْ فِيهَا وَهُمْ فِيهَا لَا يُبْخَسُونَ ۝ أُو۟لَـٰٓئِكَ ٱلَّذِينَ لَيْسَ لَهُمْ فِى ٱلْـَٔاخِرَةِ إِلَّا ٱلنَّارُ ۖ وَحَبِطَ مَا صَنَعُوا۟ فِيهَا وَبَـٰطِلٌ مَّا كَانُوا۟ يَعْمَلُونَ", reference: "الذاريات 15-16"  },
  
  // أحاديث نبوية
  { type: "نبوي", text: 'ففزع رسول الله ﷺ، فبدر بين يدي أصحابه مسرعًا حتى انتهى إلى القبر، فجثا على ركبتيه، فاستقبلتُه من بين يديه لأنظر ما يصنع. فبكى حتّى بلّ الثرى من دموعه، ثم أقبل علينا، فقال: "أيْ إخواني، لمثل هذا اليوم فأعِدّوا"', reference: "رواه الترمذي" },
  { type: "نبوي", text: "اتَّقِ اللَّهَ حَيْثُمَا كُنْتَ، وَأَتْبِعِ السَّيِّئَةَ الْحَسَنَةَ تَمْحُهَا، وَخَالِقِ النَّاسَ بِخُلُقٍ حَسَنٍ", reference: "رواه الترمذي" },
  { type: "نبوي", text: "لا يَزَالُ قَوْمٌ يَتَأَخَّرُونَ حَتَّى يُؤَخِّرَهُمْ اللَّهُ", reference: "رواه مسلم" },
  { type: "نبوي", text: "لو تَعلَمونَ ما أعلَمُ لَضَحِكتُم قَليلًا ولَبَكَيتُم كَثيرًا", reference: "رواه مسلم" },
  
  // آثار الصالحين
  { type: "أثر", text: "مَنْ أَكْثَرَ مِنْ ذِكْرِ اللَّهِ أَحَبَّهُ اللَّهُ", reference: "ابن القيم" },
  { type: "أثر", text: "رِضَا النَّاسِ غَايَةٌ لَا تُدْرَكُ، فَعَلَيْكَ بِمَا يُقَرِّبُكَ إِلَى اللَّهِ", reference: "الحسن البصري" },
  { type: "أثر", text: "يَا ابْنَ آدَمَ، إِنَّمَا أَنْتَ أَيَّامٌ، إِذَا ذَهَبَ يَوْمٌ ذَهَبَ بَعْضُكَ", reference: "الحسن البصري" },
  { type: "أثر", text: "مَا نَدِمْتُ عَلَى شَيْءٍ نَدَمِي عَلَى يَوْمٍ غَرَبَتْ شَمْسُهُ، نَقَصَ فِيهِ أَجَلِي، وَلَمْ يَزْدَدْ فِيهِ عَمَلِي", reference: "الحسن البصري" },
  { type: "أثر", text: "ابْنَ آدَمَ، نَهَارُكَ ضَيْفُكَ فَأَحْسِنْ إِلَيْهِ، فَإِنَّكَ إِنْ أَحْسَنْتَ إِلَيْهِ ارْتَحَلَ بِحَمْدِكَ، وَإِنْ أَسَأْتَ إِلَيْهِ ارْتَحَلَ بِذَمِّكَ، وَكَذَلِكَ لَيْلَتُكَ", reference: "الحسن البصري" },
];

// اختيار عنصر عشوائي
function beautifyQuotes(text) {  return text.replace(/"([^"]*)"/g, '”$1“'); }
const randomIndex = Math.floor(Math.random() * quotes.length);
const selected = quotes[randomIndex];

// تنسيق النص حسب النوع
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

// إضافة المرجع إذا وجد
const fullText = selected.reference ? `${displayText}<br><span style="font-size: 0.8em; color: #667eea67;">— <a href="obsidian://open?vault=My-vault&file=002%20Notes%2F003%20Pocket%20Notes%2FQuotes%20as%20images" style="color: inherit; text-decoration: none;">${selected.reference}</a></span>` : displayText;

// عرض القالب مع تصفير الحاوية الخارجية
const container = this.container;
container.style.height = "auto";
container.style.overflow = "hidden";

const html = `
<div style="direction: rtl; text-align: center; padding: 20px; border-radius: 15px; background: linear-gradient(135deg, #667eea20, #764ba220); backdrop-filter: blur(5px); width:100%; box-sizing: border-box;">
  <span style="font-size: 1.5em; color: #667eea; font-weight: 600; display: inline-block;">${fullText}</span>
</div>
`;
container.innerHTML = html;
```