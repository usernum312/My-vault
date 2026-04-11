---
icon: lucide-message-square-quote
cssclasses:
  - Disappear
---
```dataviewjs
// مصدر المحتوى: مقولات، آيات، أحاديث
const quotes = [
  { type: "قرآني", text: "إِنَّ اللَّهَ مَعَ الصَّابِرِينَ", reference: "البقرة 153" },
  { type: "قرآني", text: "وَمَنْ يَتَّقِ اللَّهَ يَجْعَلْ لَهُ مَخْرَجًا", reference: "الطلاق 2" },
  { type: "قرآني", text: "رَبَّنَا آتِنَا فِي الدُّنْيَا حَسَنَةً وَفِي الْآخِرَةِ حَسَنَةً وَقِنَا عَذَابَ النَّارِ", reference: "البقرة 201" },
  { type: "قرآني", text: "إِنَّ اللَّهَ لَا يُغَيِّرُ مَا بِقَوْمٍ حَتَّى يُغَيِّرُوا مَا بِأَنْفُسِهِمْ", reference: "الرعد 11" },
  { type: "نبوي", text: "اتق الله حيثما كنت، وأتبع السيئة الحسنة تمحها، وخالق الناس بخلق حسن", reference: "رواه الترمذي" },
  { type: "أثر", text: "العلم بلا عمل كالشجر بلا ثمر", reference: "ابن الجوزي" },
  { type: "أثر", text: "من أكثر من ذكر الله أحبه الله", reference: "ابن القيم" },
  { type: "أثر", text: "رضا الناس غاية لا تدرك، فعليك بما يقرِّبك إلى الله", reference: "الحسن البصري" },
  { type: "أثر", text: "يا ابن آدم، إنما أنت أيام، إذا ذهب يوم ذهب بعضك", reference: "الحسن البصري" },
  { type: "أثر", text: "ما ندمت على شيء ندمي على يوم غربت شمسه، نقص فيه أجلي، ولم يزدد فيه عملي", reference: "الحسن البصري" },
  { type: "أثر", text: " ابن آدم، نهارك ضيفك فأحسِن إليه، فإنك إن أحسنت إليه ارتحل بحمدك، وإن أسأت إليه ارتحل بذمِّك، وكذلك ليلتك", reference: "الحسن البصري" },
];

// اختيار عنصر عشوائي
const randomIndex = Math.floor(Math.random() * quotes.length);
const selected = quotes[randomIndex];

// تنسيق النص حسب النوع
let displayText = "";
if (selected.type === "قرآني") {
  displayText = `﴿ ${selected.text} ﴾`;
} else if (selected.type === "نبوي") {
  displayText = `"${selected.text}"`;
} else {
  displayText = selected.text;
}

// إضافة المرجع إذا وجد
const fullText = selected.reference ? `${displayText}<br><span style="font-size: 0.8em; color: #667eea58;">— ${selected.reference}</span>` : displayText;

// عرض القالب
const container = this.container;
const html = `
<div style="direction: rtl; text-align: center; padding: 20px; border-radius: 15px; background: linear-gradient(135deg, #667eea20, #764ba220); backdrop-filter: blur(5px); margin: 20px 0;">
  <span style="font-size: 1.5em; color: #667eea; font-weight: 600;">${fullText}</span>
</div>
`;
container.innerHTML = html;
```