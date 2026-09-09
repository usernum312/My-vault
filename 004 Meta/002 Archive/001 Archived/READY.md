---
Topic:
  - ready for start working
link pages:
  - "[[Quests]]"
cssclasses:
  - rm-hr-star
Translate: true
icon: lucide-list-start
---
حل مشكلتك يتطلب التعامل مع شقين: **المنطق الخاص بالزر (JavaScript)**، و**أبعاد وتنسيق الزر (CSS)**.

### أولاً: إصلاح التنسيق والـ CSS (مشكلة الحجم والعرض)

سبب عدم التزام الزر بعرض `5px` هو استخدام المتصفح أو تطبيق Obsidian لخاصية `box-sizing` القياسية، بالإضافة إلى أبعاد الـ `padding` و `border` المطبقة افتراضياً على عناصر `<button>`. لجعل الزر صغيرًا جدًا ومربعًا أو مسطحًا بالشكل الصحيح:

1. أضف `padding: 0 !important;` لإزالة المساحة الداخلية.
2. أضف `box-sizing: border-box !important;`.
3. اضبط `line-height` و `font-size` لتنسيق العلامة `+` داخل المساحة الضيقة.

**التنسيق المعدل للزر:**

<button id="browned-time" style="position: absolute; width: 12px !important; min-width: 12px !important; max-width: 12px !important; height: 18px !important; padding: 0 !important; line-height: 18px; font-size: 10px; border-radius: 4px; cursor: pointer;">+</button>

_(ملاحظة: عرض `5px` ضيق جداً ولن يتسع لرسم علامة `+` بوضوح، يفضل استخدام `12px` أو `15px` مع جعل الـ `padding: 0`)._

### ثانياً: ربط منطق إضافة الوقت المستعار (JavaScript)

في الكود الخاص بك، الزر `id="browned-time"` موجود لكن لا يوجد له **EventListener** يعالج الضغط عليه لإضافة وقت إلى `state.totalTime` وتحديث الواجهة والـ State.

**الخطوات البرمجية للحل:**

1. **إضافة دالة لإضافة الوقت المستعار:** تستطيع إضافة هذه الدالة داخل منطقة الدوال في الكود:

function addBorrowedTime(minutes) {
    state.totalTime += minutes; // إضافة الوقت المستعار للتصنيف المتاح
    saveState(); // حفظ الحالة
    if (viewContainer) {
        updateTextUI(); // تحديث أرقام الواجهة مباشرة
    }
    new Notice(`➕ تم إضافة ${minutes} دقائق وقت مستعار!`);
}

1. **ربط الزر في أحداث الـ Click:** ابحث عن الشفرة التالية داخل `viewContainer.addEventListener("click", (e) => { ... })`:

// أضف هذا الشرط داخل الموجه الخاص بالأحداث (Event Listener)
else if (target.id === "browned-time") {
    addBorrowedTime(5); // أضف 5 دقائق مثلاً أو القدر الذي تريده
}

### الكود كاملاً بعد التعديل والدمج

قم باستبدال الجزء الخاضع للتعديل في الملف بهذا التنسيق المباشر:
```html
// ... داخل قسم بناء العناصر HTML
<div style="background: var(--background-secondary); padding: 15px; border-radius: 8px; margin-bottom: 15px; display:grid; grid-template-columns: 1fr 1fr; gap:10px; position: relative;">
    <button id="browned-time" style="position: absolute; top: 5px; right: 5px; width: 15px !important; min-width: 15px !important; height: 18px !important; padding: 0 !important; line-height: 16px; font-size: 11px; border-radius: 3px; cursor: pointer; color: white; border: none;" title="إضافة وقت مستعار">+</button>
    <div style="border-left: 3px solid var(--interactive-accent); padding-left:10px; text-align:right;">
        <p style="margin:0; font-size:13px; color:var(--text-muted);">🎯 المهمات المتاحة:</p>
        <p style="margin:5px 0 0 0; font-size:20px; font-weight:bold; color:var(--interactive-accent);"><span class="ui-tasks">${state.totalTasks}</span> مهمة</p>
    </div>
    <div style="text-align:right;">
        <p style="margin:0; font-size:13px; color:var(--text-muted);">⏳ وقت الترفيه المتاح:</p>
        <p style="margin:5px 0 0 0; font-size:20px; font-weight:bold; color:var(--text-accent);"><span class="ui-time">${state.totalTime}</span> دقيقة</p>
    </div>
</div>

```
وفي قسم الاستماع للأحداث `viewContainer.addEventListener("click", ...)` أضف الشرط التالي:

if (target.id === "browned-time") {
    // إضافة 5 دقائق استعارة للوقت المتاح
    state.totalTime += 5; 
    saveState();
    updateTextUI();
    new Notice("⏳ تم إضافة 5 دقائق مستعارة لوقت الترفيه!");
}
---
استخدام **GitHub Actions** و **GitHub Codespaces** يوفر بيئة سحابية جاهزة دون الحاجة لتثبيت JDK أو Android SDK على جهازك المحلي.

إليك الخطوات لتعديل الكود داخل البيئة السحابية وتفعيل البناء الآلي لإنشاء ملف الـ APK عبر GitHub Actions:

### 1. إعداد البيئة وتعديل الكود في Codespaces

1. توجه إلى مستودع **Acode** الخاص بك على GitHub (أو قم بعمل **Fork** للمستودع الأصلي).
2. اضغط على زر **Code** -> خيار **Codespaces** -> اختر **Create codespace on main**.
3. بعد فتح محرر VS Code السحابي، نفذ الأوامر التالية في الـ Terminal لتعديل الكود:

```bash
# تثبيت الاعتماديات
npm install

# إدخال الإذن مباشرة في ملف AndroidManifest.xml
sed -i '/<uses-permission android:name="android.permission.WRITE_EXTERNAL_STORAGE"/a \    <uses-permission android:name="android.permission.MANAGE_EXTERNAL_STORAGE" tools:ignore="ScopedStorage" />' platforms/android/app/src/main/AndroidManifest.xml
```

### 2. إضافة دالة طلب الإذن في `MainActivity.java`

افتح الملف عبر شريط الملفات الجانبي في المسار: `platforms/android/app/src/main/java/com/foxdebug/acode/MainActivity.java`

أضف الأسطر التالية داخل الكلاس لطلب إذن الوصول الشامل عند التشغيل:

```java
@Override
public void onCreate(android.os.Bundle savedInstanceState) {
    super.onCreate(savedInstanceState);
    if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.R) {
        if (!android.os.Environment.isExternalStorageManager()) {
            try {
                android.content.Intent intent = new android.content.Intent(android.provider.Settings.ACTION_MANAGE_APP_ALL_FILES_ACCESS_PERMISSION);
                intent.setData(android.net.Uri.parse("package:" + getPackageName()));
                startActivity(intent);
            } catch (Exception e) {
                android.content.Intent intent = new android.content.Intent(android.provider.Settings.ACTION_MANAGE_ALL_FILES_ACCESS_PERMISSION);
                startActivity(intent);
            }
        }
    }
}
```

### 3. إنشاء ملف GitHub Actions للبناء السحابي (Workflow)

أنشئ ملفاً جديداً في المسار التالي داخل مشروعك: `.github/workflows/build.yml` وأضف بداخله الكود التالي:

```yaml
name: Build Acode APK

on:
  push:
    branches: [ main, master ]
  workflow_dispatch:

jobs:
  build:
    runs-on: ubuntu-latest

    steps:
      - name: Checkout Repository
        uses: actions/checkout@v4

      - name: Set up JDK 17
        uses: actions/setup-java@v4
        with:
          distribution: 'zulu'
          java-version: '17'

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '18'

      - name: Install Android SDK
        uses: android-actions/setup-android@v3

      - name: Install Global Dependencies
        run: |
          npm install -g cordova

      - name: Install Project Dependencies
        run: |
          npm install

      - name: Build Web Assets
        run: |
          npm run build

      - name: Build Android Debug APK
        run: |
          cordova build android --debug

      - name: Upload APK Artifact
        uses: actions/upload-artifact@v4
        with:
          name: acode-all-access-apk
          path: platforms/android/app/build/outputs/apk/debug/app-debug.apk
```

### 4. رفع التغييرات وتشغيل البناء

من داخل الـ Terminal في Codespaces، قم بحفظ التغيرات ورفعها إلى المستودع:

```bash
git add .
git commit -m "feat: Add MANAGE_EXTERNAL_STORAGE and build workflow"
git push origin main
```

### 5. تحميل الـ APK الناتج

1. انتقل إلى مستودعك على موقع **GitHub**.
2. اضغط على تبويب **Actions** من الأعلى.
3. اضغط على أحدث تشغيل لـ **Build Acode APK**.
4. بعد اكتمال البناء (ظهور علامة الصح الخضراء)، انزل إلى أسفل الصفحة لتقسيم **Artifacts**.
5. قم بتحميل ملف `**acode-all-access-apk**`، وفك الضغط عنه لتجد ملف `app-debug.apk` جاهزاً للتثبيت على هاتفك.