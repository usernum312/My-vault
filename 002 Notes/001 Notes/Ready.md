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
___
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