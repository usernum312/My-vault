---
cssclasses:
  - metadata-no-actions
  - center-title
icon: lucide-grid
link pages:
  - "[[My Tools]]"
---
![[Auto-run scripts]]
```dataviewjs
// 1. مصفوفة التطبيقات
const apps = [
  {
    name: "Gemini",
    pkg: "com.google.android.apps.bard",
    icon: "https://play-lh.googleusercontent.com/C64IqPWyFoCZzXVxXVl0Y6mliiNlG_sZJsqul-SBvk9ZL0wJHlU0Eho2wvsBHhho0FT5XQtH55RVGerIwXF_MA=w480-h960",
    favorite: false,
  },
  {
    name: "Acode",
    pkg: "com.foxdebug.acode",
    icon: "https://play-lh.googleusercontent.com/1Ub52VveZloRAM8bbZvi_p1fOweSUcbsXaIBqEuzUG5Sg2lF92xH1X5a-VyF93Kiw1A=w480-h960",
    favorite: true,
  },
  {
    name: "Termux",
    pkg: "com.termux",
    icon: "https://play-lh.googleusercontent.com/m3oqSZCwmitiZ-Im-CQu_rqT5eLHilOp5IudBynv3COJUumFzuQaP2dgTDxRL_03f4x2=w480-h960",
    favorite: true,
  },
  {
    name: "Claude",
    pkg: "com.anthropic.claude",
    icon: "https://play-lh.googleusercontent.com/YeFCFSW5LkBVdsEAL_fjzxDxTbhKz31j1uZUfDbSaCeM0t4Bi3SqyHTWzWsUsZnbwjofXhYajitG_gr2_B2xil8=w480-h960-rw",
    imgClass: "pen-red color-images",
    favorite: true,
  },
  {
    name: "Reader",
    pkg: "com.rajarsheechatterjee.LNReader",
    icon: "https://play-lh.googleusercontent.com/ozbHEM8xNrg-13xckP105myMVB_uebSvPVy78c5xscMmkkBzlpUckfaHUJz8IONXqfk3V1p_L-Y-q-CWhOW-qA=w480-h960",
    favorite: true,
  },
  {
    name: "Perplexity",
    pkg: "ai.perplexity.app.android",
    icon: "https://play-lh.googleusercontent.com/vg7sPhgWiPr0L2cK_NLLcCl0mrkEmNNv7C-aUkBdIUEa-9uSnCi5x4z_3Mw0vNYWKoSVWHfgri7THMOsOZKQuA=w480-h960",
    favorite: true,
  },
  {
    name: "WaterFox",
    pkg: "net.waterfox.android.release",
    icon: "https://play-lh.googleusercontent.com/YbbLHPjX3YblhrJC6FQruuwtR4zO4O6Os8Ulk8CGhfQYly9phYdyouACcDTC-rLAtvByjiItd9haqOjQz6WBWQ=w480-h960-rw",
    favorite: true,
  },
  {
    name: "Tarteel",
    pkg: "com.mmmoussa.iqra",
    icon: "https://play-lh.googleusercontent.com/RFtl6drnVL9hpbz0cal9cce7mWEPSejcRFUh0nxX94NYEb5ycmhtwPbYdGYhl-F0JUTf=w480-h960",
    favorite: false,
  },
  {
    name: "Warsh",
    pkg: "com.matarmohamed.quran",
    icon: "https://play-lh.googleusercontent.com/BHFOylSgqC6PC4zjJV05NX3PcQ0V_O3MwuIMWgIwtH7m9hhVBZKqtz0YUiPY7m3U0w=w480-h960",
    favorite: false,
  },
  {
    name: "GitHub",
    pkg: "com.github.android",
    icon: "https://play-lh.googleusercontent.com/nxpwi4UD84GNJuJ42S9U0f3lGDsHu8VkIDPCccFmJL6kyNVb1O3pTY1rl1YZICLBk6EcWIaX6n9prCbdUoQEOw=w480-h960-rw",
    favorite: false,
  },
  {
    name: "MacroDroid",
    pkg: "com.arlosoft.macrodroid",
    icon: "https://play-lh.googleusercontent.com/Jtx8e9Ievb-DmpQa-68I9e1f6JJ1D63RmjvV9Z5IH2V1FHnekVMtC9hOcityelZXzbEEPd0V4mU7vq6WRLCy=w480-h960-rw",
    favorite: false,
  },
  {
    name: "YouTube",
    pkg: "com.google.android.youtube",
    icon: "https://play-lh.googleusercontent.com/QNmuZQc9I6Zbe3mWnSr0hycnENqGFCI5p3yE29Hkxtf22T0IWS6zTrpxULLyyjWpB7ONAXDsDQXnXcVWokl3eg=w480-h960-rw",
    favorite: false,
  },
  {
    name: "DeepSeek",
    pkg: "com.deepseek.chat",
    icon: "https://play-lh.googleusercontent.com/6acgsFuPK-ynZRKRvbvEhhC5jcUJybr5Dnsy9cU1OPIxiDazubiqYqfq3nGOKSq-EG3G_6VtxM7tjRV_jiaK=s128",
    favorite: false,
  },
  {
    name: "FLManager",
    pkg: "com.mi.android.globalFileexplorer",
    icon: "https://play-lh.googleusercontent.com/Tj1DlYoF1ArDc-PUZ-MZy4-rRiwPLxoHkleHCgT46mnnmOeq88rJIxTFWnAoEcRkhTknwaRK4DX7fLry4haJ91g=w480-h960-rw",
    favorite: false,
  },
  {
    name: "Logic",
    pkg: "com.duracodefactory.logiccircuitsimulatorpro",
    icon: "https://play-lh.googleusercontent.com/v-Uj_5vinWZXM4DvNBQrmEUMvIFAayDaAh-Q4vsFcZBmq7V8w52efFdnnKqLKcEqPvKq7Z5ZvS7ylptIGdaQbg=w480-h960-rw",
    imgClass: "color-images pen-gray",
    favorite: false,
  },
  {
    name: "Quran direct",
    pkg: "maknoon.student",
    icon: "https://play-lh.googleusercontent.com/ZZYKSbdVmNvBDm3gdEuJwQt4Pa5ZARxe-cq7CWUnMvovdQTAwMIJxB_lnUEFtDDQP8KjlaASBWFz3m1gloJTqQ8=w480-h960",
    favorite: false,
  },
  {
    name: "Fajr",
    pkg: "com.blink22.fajr",
    icon: "https://play-lh.googleusercontent.com/CKh2Ni3PWN_g7iNJ4cPvq2xmGnyRuso4y4MYueUgVtNcCzuhukxp5SvwViqWjuGqxDMxP-kPzAXQXtDjHWdnvw=w480-h960",
    favorite: false,
  },
  {
    name: "Google",
    pkg: "com.google.android.googlequicksearchbox",
    icon: "https://play-lh.googleusercontent.com/xqk8hd6dMyffxE6iQa59cUt75EA-0YDvjnJlxH4z8W63-e5KwaWXbrNob6Q-OoH5SSDa78Y0I0YA3BB0zDVnB8w=w480-h960",
    favorite: false,
  },
];

// 2. دالة إنشـاء عنصر التطبيق عبر DOM

async function fetchAppIcon(pkg) {
  const defaultIcon = "https://cdn-icons-png.flaticon.com/512/3408/3408506.png";
  try {
    const response = await requestUrl({ url: `https://play.google.com/store/apps/details?id=${pkg}`, method: 'GET' });
    const match = response.text.match(/<meta[^>]*property=["']og:image["'][^>]*content=["']([^"']+)["']/i) ||
                  response.text.match(/<meta[^>]*content=["']([^"']+)["']/i);
    return (match && match[1]) ? match[1] : defaultIcon;
  } catch (e) {
    return defaultIcon;
  }
}

function createAppNode(app) {
  const link = document.createElement("a");
  link.href = `android-app://${app.pkg}`;
  link.className = "icon-container";

  const img = document.createElement("img");
  // إذا كانت الأيقونة فارغة يتم استخدام رابط البحث التلقائي من متجر Google Play
	img.src = app.icon || "https://cdn-icons-png.flaticon.com/512/3408/3408506.png";
	
	if (!app.icon) {
	  fetchAppIcon(app.pkg).then(iconUrl => { img.src = iconUrl; });
	}

  if (app.imgClass) {
    img.className = app.imgClass;
  }

  link.appendChild(img);
  link.appendChild(document.createTextNode(app.name));
  return link;
}

// 3. بناء الواجهة
const container = dv.container;

// أ) قسم المفضلة (إذا وُجدت تطبيقات favorite: true)
const favoriteApps = apps.filter((app) => app.favorite);

if (favoriteApps.length > 0) {
  const favDock = document.createElement("div");
  favDock.className = "app-dock";

  favoriteApps.forEach((app) => {
    favDock.appendChild(createAppNode(app));
  });

  const separator = document.createElement("span");
  separator.style.cssText =
    "display: block; text-align: center; color: #ffffff60;";
  separator.textContent = "———";

  container.appendChild(favDock);
  container.appendChild(separator);
}

// ب) قسم جميع التطبيقات
const allDock = document.createElement("div");
allDock.className = "app-dock";

apps.forEach((app) => {
  allDock.appendChild(createAppNode(app));
});

container.appendChild(allDock);
```
<!--<div class="app-dock">
  <a href="android-app://com.foxdebug.acode" class="icon-container">
    <img src="https://play-lh.googleusercontent.com/1Ub52VveZloRAM8bbZvi_p1fOweSUcbsXaIBqEuzUG5Sg2lF92xH1X5a-VyF93Kiw1A=w480-h960">Acode
  </a>
  <a href="android-app://com.termux" class="icon-container">
    <img src="https://play-lh.googleusercontent.com/m3oqSZCwmitiZ-Im-CQu_rqT5eLHilOp5IudBynv3COJUumFzuQaP2dgTDxRL_03f4x2=w480-h960">Termux
  </a>
  <a href="android-app://com.anthropic.claude" class="icon-container">
    <img src="https://play-lh.googleusercontent.com/YeFCFSW5LkBVdsEAL_fjzxDxTbhKz31j1uZUfDbSaCeM0t4Bi3SqyHTWzWsUsZnbwjofXhYajitG_gr2_B2xil8=w480-h960-rw">Claude
  </a>
  <a href="android-app://com.rajarsheechatterjee.LNReader" class="icon-container">
    <img src="https://play-lh.googleusercontent.com/ozbHEM8xNrg-13xckP105myMVB_uebSvPVy78c5xscMmkkBzlpUckfaHUJz8IONXqfk3V1p_L-Y-q-CWhOW-qA=w480-h960">Reader
  </a>
  <a href="android-app://ai.perplexity.app.android" class="icon-container">
    <img src="https://play-lh.googleusercontent.com/vg7sPhgWiPr0L2cK_NLLcCl0mrkEmNNv7C-aUkBdIUEa-9uSnCi5x4z_3Mw0vNYWKoSVWHfgri7THMOsOZKQuA=w480-h960">Perplexity
  </a>
   <a href="android-app://net.waterfox.android.release" class="icon-container">
    <img src="https://play-lh.googleusercontent.com/YbbLHPjX3YblhrJC6FQruuwtR4zO4O6Os8Ulk8CGhfQYly9phYdyouACcDTC-rLAtvByjiItd9haqOjQz6WBWQ=w480-h960-rw">WaterFox
  </a>
</div><span style="display: block; text-align: center; color: #ffffff60;">———</span><div class="app-dock">
  <a href="android-app://com.google.android.apps.bard" class="icon-container">
	  <img src="https://play-lh.googleusercontent.com/C64IqPWyFoCZzXVxXVl0Y6mliiNlG_sZJsqul-SBvk9ZL0wJHlU0Eho2wvsBHhho0FT5XQtH55RVGerIwXF_MA=w480-h960">Gemini
  </a>
  <a href="android-app://com.foxdebug.acode" class="icon-container">
    <img src="https://play-lh.googleusercontent.com/1Ub52VveZloRAM8bbZvi_p1fOweSUcbsXaIBqEuzUG5Sg2lF92xH1X5a-VyF93Kiw1A=w480-h960">Acode
  </a>
  <a href="android-app://com.termux" class="icon-container">
    <img src="https://play-lh.googleusercontent.com/m3oqSZCwmitiZ-Im-CQu_rqT5eLHilOp5IudBynv3COJUumFzuQaP2dgTDxRL_03f4x2=w480-h960">Termux
  </a>
  <a href="android-app://com.rajarsheechatterjee.LNReader" class="icon-container">
    <img src="https://play-lh.googleusercontent.com/ozbHEM8xNrg-13xckP105myMVB_uebSvPVy78c5xscMmkkBzlpUckfaHUJz8IONXqfk3V1p_L-Y-q-CWhOW-qA=w480-h960">Reader
  </a>
  <a href="android-app://com.mmmoussa.iqra" class="icon-container">
    <img src="https://play-lh.googleusercontent.com/RFtl6drnVL9hpbz0cal9cce7mWEPSejcRFUh0nxX94NYEb5ycmhtwPbYdGYhl-F0JUTf=w480-h960">Tarteel
  </a>
  <a href="android-app://com.matarmohamed.quran" class="icon-container">
    <img src="https://play-lh.googleusercontent.com/BHFOylSgqC6PC4zjJV05NX3PcQ0V_O3MwuIMWgIwtH7m9hhVBZKqtz0YUiPY7m3U0w=w480-h960">Warsh
  </a>
  <a href="android-app://ai.perplexity.app.android" class="icon-container">
    <img src="https://play-lh.googleusercontent.com/vg7sPhgWiPr0L2cK_NLLcCl0mrkEmNNv7C-aUkBdIUEa-9uSnCi5x4z_3Mw0vNYWKoSVWHfgri7THMOsOZKQuA=w480-h960">Perplexity
  </a>
  <a href="android-app://com.github.android" class="icon-container">
    <img src="https://play-lh.googleusercontent.com/nxpwi4UD84GNJuJ42S9U0f3lGDsHu8VkIDPCccFmJL6kyNVb1O3pTY1rl1YZICLBk6EcWIaX6n9prCbdUoQEOw=w480-h960-rw">GitHub
  </a>
    <a href="android-app://com.arlosoft.macrodroid" class="icon-container">
    <img src="https://play-lh.googleusercontent.com/Jtx8e9Ievb-DmpQa-68I9e1f6JJ1D63RmjvV9Z5IH2V1FHnekVMtC9hOcityelZXzbEEPd0V4mU7vq6WRLCy=w480-h960-rw">MacroDroid 
  </a>
  <a href="android-app://com.google.android.youtube" class="icon-container">
    <img src="https://play-lh.googleusercontent.com/QNmuZQc9I6Zbe3mWnSr0hycnENqGFCI5p3yE29Hkxtf22T0IWS6zTrpxULLyyjWpB7ONAXDsDQXnXcVWokl3eg=w480-h960-rw">YouTube
  </a>
  <a href="android-app://com.anthropic.claude" class="icon-container">
    <img src="https://play-lh.googleusercontent.com/YeFCFSW5LkBVdsEAL_fjzxDxTbhKz31j1uZUfDbSaCeM0t4Bi3SqyHTWzWsUsZnbwjofXhYajitG_gr2_B2xil8=w480-h960-rw" class="pen-red color-images">Claude
  </a>
   <a href="android-app://net.waterfox.android.release" class="icon-container">
    <img src="https://play-lh.googleusercontent.com/YbbLHPjX3YblhrJC6FQruuwtR4zO4O6Os8Ulk8CGhfQYly9phYdyouACcDTC-rLAtvByjiItd9haqOjQz6WBWQ=w480-h960-rw">WaterFox
  </a>
   <a href="android-app://com.deepseek.chat" class="icon-container">
    <img src="https://play-lh.googleusercontent.com/6acgsFuPK-ynZRKRvbvEhhC5jcUJybr5Dnsy9cU1OPIxiDazubiqYqfq3nGOKSq-EG3G_6VtxM7tjRV_jiaK=s128">DeepSeek
  </a>
  <a href="android-app://com.mi.android.globalFileexplorer" class="icon-container">
	  <img src="https://play-lh.googleusercontent.com/Tj1DlYoF1ArDc-PUZ-MZy4-rRiwPLxoHkleHCgT46mnnmOeq88rJIxTFWnAoEcRkhTknwaRK4DX7fLry4haJ91g=w480-h960-rw">FLManager
  </a>
  <a href="android-app://com.duracodefactory.logiccircuitsimulatorpro" class="icon-container">
    <img src="https://play-lh.googleusercontent.com/v-Uj_5vinWZXM4DvNBQrmEUMvIFAayDaAh-Q4vsFcZBmq7V8w52efFdnnKqLKcEqPvKq7Z5ZvS7ylptIGdaQbg=w480-h960-rw" class="color-images pen-gray">Logic
  </a>
  <a href="android-app://maknoon.student" class="icon-container">
    <img src="https://play-lh.googleusercontent.com/ZZYKSbdVmNvBDm3gdEuJwQt4Pa5ZARxe-cq7CWUnMvovdQTAwMIJxB_lnUEFtDDQP8KjlaASBWFz3m1gloJTqQ8=w480-h960">Quran direct
  </a>
  <a href="android-app://com.blink22.fajr" class="icon-container">
    <img src="https://play-lh.googleusercontent.com/CKh2Ni3PWN_g7iNJ4cPvq2xmGnyRuso4y4MYueUgVtNcCzuhukxp5SvwViqWjuGqxDMxP-kPzAXQXtDjHWdnvw=w480-h960">Fajr
  </a>
  <a href="android-app://com.google.android.googlequicksearchbox" class="icon-container">
    <img src="https://play-lh.googleusercontent.com/xqk8hd6dMyffxE6iQa59cUt75EA-0YDvjnJlxH4z8W63-e5KwaWXbrNob6Q-OoH5SSDa78Y0I0YA3BB0zDVnB8w=w480-h960">Google
  </a>
</div>-->