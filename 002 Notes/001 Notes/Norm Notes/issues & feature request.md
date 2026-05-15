## **Technical Issues & Bug Report**
### **1. Automatic Data Refresh Failure**
I am experiencing an issue where the extension does not update data when a new day begins (after 12:00 AM). The expected behavior is for the data and timings to refresh automatically at midnight, but this is not happening.
### **2. Cache Logic & Inefficient Fetching**
There is a significant issue with how data is handled when the **"Monthly - Fetch full month once"** option is selected:
 * **Redundant Requests:** Even when the option to rely entirely on the cache is enabled, the system continues to fetch data from the internet every time if a connection is available.
 * **Cache Neglect:** The stored monthly data is only used when the device is offline. This is a major waste of resources; if a user chooses to cache the entire month, the app should prioritize that local data rather than making daily requests.
 * **Logic Conflict:** The current behavior mimics the "Fetch Daily" setting rather than the "Monthly" setting, which should only request data once per month.
## **UI/UX & Localization Issues**
### **3. Settings Management (PrayerSettingTab)**
 * **Missing Options:** Several settings were omitted from the PrayerSettingTab, preventing users from customizing their experience freely.
 * **Poor Organization:** The tabs are not well-organized within the tabbed layout.
 * **Localization Gaps:** There are many untranslated strings. In some instances, the actual variable names are displayed in the UI because the corresponding text strings were forgotten.
## **Feature Requests**
### **4. Notification Summary / "Dashboard" View**
I suggest adding a feature that allows users to choose a **specific time** to receive all notifications at once, rather than receiving them sequentially as each task's time arrives.
 * **The Concept:** Similar to "Scheduled Summary" features in other reminder apps, this would allow users to view all pending tasks in a single "Dashboard" screen at a time of their choosing.
 * **Filtering:** Naturally, completed tasks should not appear in this dashboard.
 * **Customization:** Users should have a toggle to choose their preferred notification style: **Sequential** (current) or **Dashboard** (summary).
### **5. Custom Alert Sounds via Syntax**
Add the ability for users to assign specific audio files to reminders using a command-line style syntax.
 * **Example:** (@2026-05-15 before-maghrib or specific time 20m sound:004 Media/Sounds/reminder.mp3)