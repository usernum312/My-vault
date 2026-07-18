/**
 * Prayer Times & Athan — Obsidian Plugin
 * Refactored for readability, correctness, and maintainability.
 *
 * Key changes from original:
 *  - Separated concerns: constants, data layer, scheduling, UI, CSS
 *  - Fixed 10 bugs documented below
 *  - Removed dead/broken code (enhanceOfflineSupport / fetchMonthlyCalendar)
 *  - Eliminated duplication (DRY): _processDayDataForLoad merged into _processDayData,
 *    Iqama inline stepper replaced by reusable createStepperSetting,
 *    detectHolyDays / _checkHolyDayNotification logic merged into one place
 *  - lastTriggered.reminder split into .preAthan and .vaultReminder to fix key collision
 *  - Reduced cyclomatic complexity in fetchPrayerTimes, _analyzeFastingStatus,
 *    createOrOpenHijriDailyNote, and renderGeneral
 *  - _generateFastingAnalysis now uses this.t() instead of raw Arabic/English strings
 *  - CSS deduplication (two identical @media 768px blocks removed; one kept)
 *  - Typo fixed: 'last-thutd' → 'last-third' in _getPrayerOrRefTime
 *  - Nested settings path helper (_getNestedSetting / _setNestedSetting) fixes
 *    supplications.morning.audioPath read/write in createAudioSetting
 *  - Cache logic corrected: monthly mode now truly serves from cache unless month changes
 *  - _fetchDailyPrayerTimes now correctly resets monthTimes to [] so _needsMonthUpdate
 *    returns true only when month actually changed
 *
 * NEW FEATURES (v2):
 *  - Feature 4: Notification Dashboard — dedicated full-screen modal that collects ALL
 *    today's pending reminders and displays them at a single user-chosen time.
 *    Settings: reminderMode ("sequential"|"dashboard"), dashboardTime ("HH:MM"),
 *    dashboardCommand (open manually via command palette).
 *    ReminderDashboardModal renders each reminder with Done / Postpone / ▶ Play buttons.
 *  - Feature 5: Custom per-reminder sound via sound: syntax.
 *    (@2026-05-15 before-maghrib 20m sound:Media/Sounds/reminder.mp3)
 *    (@2026-05-15 08:00 sound:Sounds/alert.mp3)
 *    Both regex patterns extended to capture optional sound: path.
 *    triggerReminderNotification + dashboard use customAudioPath preferentially.
 *  - Feature 8: Optional "spend time" / expiry via end: syntax.
 *    (@2026-05-15 08:00 end:08:30)
 *    (@2026-05-15 08:00 end:maghrib)
 *    (@2026-05-15 08:00 end:before-maghrib-20m)
 *    (@2026-05-15 before-maghrib 20m end:after-isha-10m sound:Media/Sounds/reminder.mp3)
 *    end: is optional and, when present, must come before sound:. Its value
 *    accepts a fixed HH:mm, a bare prayer/reference name, or a
 *    before/after-ref-Nm offset (see _parseEndSpec). Once "now" passes the
 *    resolved end: time, the reminder is expired: checkReminders() won't fire
 *    it, getUpcomingRemindersForToday() won't list it, and
 *    _getPostponedReminders() won't flag it as missed — even if never marked
 *    done. See _resolveEndTime / _isReminderExpired.
 */

"use strict";

const {
	Notice,
	Plugin,
	PluginSettingTab,
	Setting,
	TFile,
	ItemView,
	Modal,
	MarkdownRenderer,
	MarkdownView,
	Component,
} = require("obsidian");

/* ============================================================
   SECTION 1 — CONSTANTS & STATIC DATA
   ============================================================ */

const VIEW_TYPE_PRAYER   = "prayer-panel-view";
const VIEW_TYPE_REMINDER = "reminder-panel-view";

const PRAYER_NAMES = ["Fajr", "Dhuhr", "Asr", "Maghrib", "Isha"];
const ALL_TIME_KEYS = ["Fajr", "Sunrise", "Dhuhr", "Asr", "Maghrib", "Isha", "Midnight"];
const WEEKDAY_KEYS  = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/**
 * Returns "YYYY-MM-DD" for a Date using its LOCAL calendar date.
 * FIX: Date.prototype.toISOString() always converts to UTC, which made every
 * "today" calculation lag by up to an hour after local midnight for users
 * ahead of UTC (e.g. UTC+1) — prayer times, Hijri date, and the daily note
 * were all built for "yesterday" until local time passed 1:00 AM.
 * Use this helper everywhere we need "today's date" in local time.
 */
function localISODate(d = new Date()) {
	const y   = d.getFullYear();
	const m   = String(d.getMonth() + 1).padStart(2, "0");
	const day = String(d.getDate()).padStart(2, "0");
	return `${y}-${m}-${day}`;
}
var surahNames = ["الفاتحة","البقرة","آل عمران","النساء","المائدة","الأنعام","الأعراف","الأنفال","التوبة","يونس","هود","يوسف","الرعد","إبراهيم","الحجر","النحل","الإسراء","الكهف","مريم","طه","الأنبياء","الحج","المؤمنون","النور","الفرقان","الشعراء","النمل","القصص","العنكبوت","الروم","لقمان","السجدة","الأحزاب","سبأ","فاطر","يس","الصافات","ص","الزمر","غافر","فصلت","الشورى","الزخرف","الدخان","الجاثية","الأحقاف","محمد","الفتح","الحجرات","ق","الذاريات","الطور","النجم","القمر","الرحمن","الواقعة","الحديد","المجادلة","الحشر","الممتحنة","الصف","الجمعة","المنافقون","التغابن","الطلاق","التحريم","الملك","القلم","الحاقة","المعارج","نوح","الجن","المزمل","المدثر","القيامة","الإنسان","المرسلات","النبأ","النازعات","عبس","التكوير","الانفطار","المطففين","الانشقاق","البروج","الطارق","الأعلى","الغاشية","الفجر","البلد","الشمس","الليل","الضحى","الشرح","التين","العلق","القدر","البينة","الزلزلة","العاديات","القارعة","التكاثر","العصر","الهمزة","الفيل","قريش","الماعون","الكوثر","الكافرون","النصر","المسد","الإخلاص","الفلق","الناس"];

// ---------------------------------------------------------------------------
// Translations
// ---------------------------------------------------------------------------

const TRANSLATIONS = {
	en: {
		// General / UI
		appName: "Prayer Times",
		loading: "Loading...",
		hijri: "Hijri Date",
		reference: "Reference",
		next: "next",
		fetchNow: "Fetch Now",
		playAthan: "Play Athan",
		playQuran: "Play Quran",
		stop: "Stop",
		manual: "Manual",
		lastFetch: "Last fetch",
		fastingSummary: "Fasting",
		disabled: "disabled",
		days: "days",
		alert: "alert",
		before: "before",
		after: "after",
		timeFormat: "Time format",
		timeFormatDesc: "Choose 12-hour (AM/PM) or 24-hour format",
		timeFormat12h: "12-hour (AM/PM)",
		timeFormat24h: "24-hour",
		minutes: "m",
		am: "am",
		pm: "pm",

		// Reminders
		remindersTitle: "Reminders",
		enableReminders: "Enable Reminders",
		enableRemindersDesc: "Parse vault for (@date time) and (@date before/after-prayer offset) tags.",
		reminderMute: "Mute",
		reminderDone: "Done",
		reminderPostpone: "Postpone",
		reminderNotificationTitle: "Reminder",
		noUpcomingReminders: "No upcoming reminders for today.",
		reminderAudio: "Reminder audio file",
		reminderAudioDesc: "Path inside vault (e.g. Sounds/alarm.mp3)",
		postponeDurations: "Postpone durations (minutes)",
		postponeDurationsDesc: "Comma-separated postponement durations (in minutes) offered in the dropdown next to the Postpone button (e.g. 5, 15, 30, 60).",

		// Notifications
		fetchRequested: "Prayer times fetch requested.",
		fetchUpdated: "Prayer times updated.",
		fetchFailed: "Failed to fetch prayer times.",
		usingCached: "Using cached prayer times.",
		noCached: "No cached times available. Enable offline fallback or try again.",
		preAthanMsg: "Pre-Athan: {prayer} in {minutes} minutes.",
		iqamaMsg: "Iqama for {prayer}",
		fastingAlert: "Fasting alert",
		supplication: "Supplication reminder",
		morningSup: "Morning supplication",
		eveningSup: "Evening supplication",
		nightSup: "Nighttime supplication",
		holyDay: "Holy day",
		noAudio: "No Athan audio configured.",
		fileNotFound: "Audio file not found in vault.",
		wakeLockAcquired: "Wake Lock acquired.",
		wakeLockFailed: "Wake Lock request failed.",
		wakeLockSupported: "Wake Lock API not supported on this device.",

		// Settings
		settingsTitle: "Prayer Times & Athan — Settings",
		language: "Language",
		languageDesc: "Choose the display language (English / Arabic).",
		city: "City",
		cityDesc: "City for Al-Athan Timings By City",
		country: "Country",
		locationMode: "Location Mode",
		locModeAuto: "City & Country",
		locModeManual: "Manual Coordinates",
		latitude: "Latitude",
		latitudeDesc: "Decimal format (e.g. 30.044)",
		longitude: "Longitude",
		longitudeDesc: "Decimal format (e.g. 31.235)",
		countryDesc: "Please enter the country code in the two-letter ISO format (e.g., US, SA, EG, AE) rather than the full country name, to ensure that prayer times are calculated correctly.",
		calcMethod: "Calculation method",
		calcMethodDesc: "Select the calculation authority used by AlAdhan",
		audiofiles: "Audio Files",
		athanAudio: "Athan audio file",
		athanAudioDesc: "Path inside vault (e.g. Sounds/athan.mp3)",
		preAthanAudio: "Pre-Athan audio file",
		preAthanAudioDesc: "Custom audio for pre-Athan preview (falls back to Athan if empty)",
		iqamaAudio: "Iqama audio file",
		iqamaAudioDesc: "Custom audio for iqama (falls back to Athan if empty)",
		fastingAudio: "Fasting audio file",
		fastingAudioDesc: "Path for fasting alert (falls back to Athan if empty)",
		enableFor: "Enable Athan For",
		PreAthanname: "Pre-Athan",
		enablePreAthan: "Enable Pre-Athan reminder",
		enableIqama: "Enable Iqama Features",
		enableIqamaDesc: "Master switch to enable/disable all Iqama timers and audio",
		enablePreAthanDesc: "Show reminder and play preview before prayer",
		preAthanOffset: "Pre-Athan offset (minutes)",
		preAthanOffsetDesc: "Minutes before prayer to trigger the pre-Athan",
		iqamaSection: "Iqama (minutes after prayer)",
		iqamaDesc: "0 = disabled",
		supplicationSection: "Supplication reminders & audio",
		morningSupAudio: "Morning supplication audio",
		morningSupEnable: "Morning supplication",
		morningSupDesc: "Enable morning supplication (before/after sunrise)",
		morningOffset: "Morning offset (minutes)",
		morningDir: "Morning direction",
		eveningSupAudio: "Evening supplication audio",
		eveningSupEnable: "Evening supplication",
		eveningSupDesc: "Enable evening supplication (before sunset or after Asr)",
		eveningOffset: "Evening offset (minutes)",
		eveningRef: "Evening reference",
		nightSupAudio: "Night supplication audio",
		nightSupEnable: "Nighttime supplication",
		nightSupDesc: "Enable nighttime supplication (after Isha)",
		nightOffset: "Night offset (minutes)",
		displayRef: "Display reference time",
		displayRefDesc: "Choose which reference time to display in panel",
		showStatusBar: "Show status bar widget",
		showStatusBarDesc: "Displays Hijri date and next prayer in the status bar (desktop only)",
		offlineFallback: "Enable offline fallback",
		offlineFallbackDesc: "Use last cached prayer times when fetching fails",
		sysNotif: "Use system notifications",
		sysNotifDesc: "Show native OS notifications when possible",
		wakeLock: "Try Wake Lock on mobile",
		wakeLockDesc: "Best-effort: keep screen awake to improve background reliability",
		fastingSection: "Fasting settings",
		enableFasting: "Enable fasting alerts",
		fastingWeekdays: "Choose weekdays for fasting:",
		fastingHijri: "Fasting Hijri days",
		fastingHijriDesc: "Comma-separated Hijri day numbers (e.g. 13,14,15)",
		fastingPrayer: "Fasting alert prayer",
		fastingPrayerDesc: "Prayer to reference for fasting alert",
		fastingOffset: "Fasting alert offset minutes",
		fastingDir: "Fasting alert direction",
		manualActions: "Manual actions",
		btnFetch: "Fetch Now",
		btnPlay: "Play Athan Now",
		btnStop: "Stop Athan",
		btnWakeLock: "Request Wake Lock (mobile)",

		// Prayers
		Fajr: "Fajr",
		Sunrise: "Sunrise",
		Dhuhr: "Dhuhr",
		Asr: "Asr",
		Maghrib: "Maghrib",
		Isha: "Isha",

		// Prayer offsets section
		offsetsSection: "Prayer Time Offsets (minutes)",
		offsetsDesc: "Add or subtract minutes from the calculated times (e.g., -2 or 5)",

		// Reference labels
		ref_midnight: "Midnight",
		ref_lastThird: "Last Third",
		ref_sunrise: "Sunrise",
		ref_reminders: "Reminders",

		// Islamic notes
		islamicnote: "Islamic Notes",
		enabled: "Enable Islamic notes",
		enabledesc: "Create/open a Islamic note from the Hijri/status bar (toggle on/off)",
		folderpath: "Islamic notes folder",
		folderpathdesc: "Folder where Islamic notes are created (e.g. 'Daily' or 'Journal/Notes'",
		dateformat: "Islamic note date format",
		dateformatdesc: "Choose how the Hijri date is displayed",
		notedateformat: "Islamic note date format",
		notedateformatdesc: "Choose which date(s) to include in the note filename and header",

		// Note templates
		noteTemplateDesc: "Customize the content of Islamic notes.",
		NoteTemplate: "Note Template (english)",
		NoteTemplateEn: "Note Template (english)",
		templateResetNotice: "Template reset to default",
		autoOpenIslamicName: "Auto-open Islamic note on startup",
		autoOpenIslamicDesc: "Automatically create/open the daily Islamic note when Obsidian starts.",

		// Islamic note content
		note_prayer_times: "Prayer times",
		note_checklist: "Checklist",
		note_morning: "Morning Athkar",
		note_evening: "Evening Athkar",
		note_bedtime: "Bedtime Athkar",
		note_special_days: "Special days",
		note_today_holy: "Today is a holy day",
		note_tomorrow_holy: "Tomorrow is a holy day",
		note_today_fasting: "Today is a day of fasting",
		note_tomorrow_fasting: "Tomorrow is a day of fasting",

		// Fasting logic
		note_forbidden: "Fasting is forbidden",
		note_forbidden_msg: "Fasting is forbidden {day} due to {event}",
		note_fasting_reason: "Fast {day} due to {event}",
		note_ramadan: "Ramadan Kareem",

		// Misc settings
		moresetting: "More Setting",
		chooseFile: "Choose File",
		writeTemplate: "Write Template",
		templateMode: "Template Mode",
		fileMode: "File Mode",
		textMode: "Text Mode",
		noFileSelected: "No file selected",
		directWritingMode: "Direct writing mode",
		directTemplateText: "Direct Template Text",
		templateFile: "Template File",

		// Fetch mode
		fetchMode: "Fetch Mode",
		fetchModeDesc: "Choose how prayer times are fetched",
		fetchModeMonthly: "Monthly - Fetch full month once (recommended)",
		fetchModeDaily: "Daily - Fetch each day individually",
		fetchModeHybrid: "Hybrid - Monthly fetch with daily Hijri update",

		// Hijri offset
		hijriOffsetSection: "Hijri Date Correction",
		hijriOffsetDesc: "Adjust the Hijri date if it differs from actual local sighting",
		hijriOffsetEnable: "Enable Hijri offset",
		hijriOffsetDays: "Hijri offset (days)",
		hijriOffsetDaysDesc: "Number of days to add/subtract (e.g., 1 or -1)",

		// Layout
		settingsLayout: "Layout settings",
		settingsLayoutDesc: "Choose your navigation method: detailed tabs or everything in one place.",
		layoutTabbed: "Tabbed",
		layoutFlat: "Single Page",

		// Tab labels
		tabGeneral: "General",
		tabPrayers: "Prayers",
		tabPaths: "Paths",
		Paths: "Paths",
		tabReminders: "Reminders",
		tabSupplications: "Supplications",
		tabNotes: "Notes",
		tabAdvanced: "Advanced",

		// Weekday names (used for fasting weekday buttons)
		Sun: "Sun", Mon: "Mon", Tue: "Tue", Wed: "Wed",
		Thu: "Thu", Fri: "Fri", Sat: "Sat",

		// Fasting analysis headings (used in _generateFastingAnalysis)
		fastingAnalysisHolyDays: "Holy Days",
		fastingAnalysisFasting: "Fasting",
		fastingAnalysisToday: "Today",
		fastingAnalysisTomorrow: "Tomorrow",

		// Reminder mode & Dashboard (Feature 4)
		reminderMode: "Reminder notification style",
		reminderModeDesc: "Sequential: notify each reminder at its own time. Dashboard: collect all reminders and show them together at a single chosen time.",
		reminderModeSequential: "Sequential (notify at each reminder's time)",
		reminderModeDashboard: "Dashboard (show all at once at a chosen time)",
		dashboardTime: "Dashboard summary time",
		dashboardTimeDesc: "Time to open the reminder dashboard (HH:MM, 24h format)",
		dashboardTitle: "Reminder Dashboard",
		dashboardSubtitle: "All pending reminders for today",
		dashboardEmpty: "No pending reminders for today. 🎉",
		dashboardDue: "Due",
		dashboardCustomSound: "Custom sound",
		dashboardOpenDashboard: "Open Dashboard now",
		dashboardMarkAllDone: "Mark all done",

		// Reminder Panel (Feature 6)
		reminderPanelTitle: "Reminders",
		reminderHeader: "Reminders",
		reminderPanelEmpty: "No reminders for today.",
		reminderPanelDismiss: "Dismiss",
		reminderPanelDone: "Done",
		reminderPanelTodayOnly: "Today",
		openReminderPanel: "Open Reminder Panel",

		// Show Reminders in panel reference cycle
		showRemindersInPanel: "Show Reminders tab in panel",
		showRemindersInPanelDesc: "When enabled, 'Reminders' appears as a reference option in the prayer panel. When disabled, navigating past the third reference wraps back to the first.",

		// Dynamic Reference (Feature 8)
		dynamicReference: "Dynamic Reference",
		dynamicReferenceDesc: "Automatically sets the reference based on the current time; users can still switch manually — it resets back after 1 minute.",

		// Hide Reference Button
		hideReferenceBtn: "hide reference button",
		hideReferenceBtnDesc: "hide reference button on the prayers panel",

		// Feature 7: Postponed / missed reminder recovery
		postponedReminderBehavior: "Missed reminder behavior",
		postponedReminderBehaviorDesc: "What to do when a postponed reminder's time has already passed when you open the app.",
		postponedDelay6s: "Show after 6-second delay (on app open)",
		postponedWaitDashboard: "Wait until current time reaches the dashboard time (special case)",
		multiplePostponedDisplay: "Multiple missed reminders: show in",
		multiplePostponedDisplayDesc: "When several missed reminders are found, show them inside the notification dashboard panel, or display them one after another (sequentially).",
		multiplePostponedDashboard: "Notification dashboard panel",
		multiplePostponedSequential: "Consecutive (one then the next…)",
	},

	ar: {
		// General / UI
		appName: "مواقيت الصلوات",
		loading: "جاري التحميل...",
		hijri: "التاريخ الهجري",
		reference: "المرجع",
		next: "متبقية",
		fetchNow: "تحديث الآن",
		playAthan: "تشغيل الآذان",
		playQuran: "تشغيل القرآن",
		stop: "إيقاف",
		manual: "يدوي",
		lastFetch: "آخر تحديث",
		fastingSummary: "الصيام",
		disabled: "معطل",
		days: "أيام",
		alert: "تنبيه",
		before: "قبل",
		after: "بعد",
		timeFormat: "تنسيق الوقت",
		timeFormatDesc: "اختر تنسيق 12 ساعة (ص/م) أو 24 ساعة",
		timeFormat12h: "12 ساعة (ص/م)",
		timeFormat24h: "24 ساعة",
		minutes: "د",
		am: "ص",
		pm: "م",

		// Reminders
		remindersTitle: "التذكيرات",
		enableReminders: "تفعيل التذكيرات",
		enableRemindersDesc: "تفعيل البحث عن وسوم (@date time) و (@date before/after-prayer).",
		reminderMute: "كتم",
		reminderDone: "تم",
		reminderPostpone: "تأجيل التنبيه",
		reminderNotificationTitle: "تذكير",
		noUpcomingReminders: "لا توجد تذكيرات قادمة اليوم.",
		reminderAudio: "ملف صوت التذكيرات",
		reminderAudioDesc: "المسار داخل الخزنة (مثال: Sounds/alarm.mp3)",
		postponeDurations: "مدد التأجيل (بالدقائق)",
		postponeDurationsDesc: "مدد التأجيل مفصولة بفواصل (بالدقائق) تظهر في القائمة المنسدلة بجانب زر التأجيل (مثال: 5, 15, 30, 60).",

		// Notifications
		fetchRequested: "تم طلب تحديث مواقيت الصلاة.",
		fetchUpdated: "تم تحديث مواقيت الصلاة.",
		fetchFailed: "فشل تحديث مواقيت الصلاة.",
		usingCached: "استخدام المواقيت المحفوظة.",
		noCached: "لا توجد مواقيت محفوظة. فعل خيار العمل دون اتصال أو حاول مرة أخرى.",
		preAthanMsg: "تنبيه قرب الآذان: {prayer} خلال {minutes} دقائق.",
		iqamaMsg: "إقامة صلاة {prayer}",
		fastingAlert: "تنبيه الصيام",
		supplication: "تذكير بالأذكار",
		morningSup: "أذكار الصباح",
		eveningSup: "أذكار المساء",
		nightSup: "أذكار النوم",
		holyDay: "يوم ديني",
		noAudio: "لم يتم تحديد ملف صوت للآذان.",
		fileNotFound: "ملف الصوت غير موجود.",
		wakeLockAcquired: "تم تفعيل منع السكون (Wake Lock).",
		wakeLockFailed: "فشل تفعيل منع السكون.",
		wakeLockSupported: "خاصية منع السكون غير مدعومة في هذا الجهاز.",

		// Settings
		settingsTitle: "إعدادات مواقيت الصلاة والآذان",
		language: "اللغة",
		languageDesc: "اختر لغة العرض (الإنجليزية / العربية).",
		city: "المدينة",
		cityDesc: "المدينة لجلب المواقيت",
		country: "الدولة",
		locationMode: "نظام تحديد الموقع",
		locModeAuto: "المدينة والدولة",
		locModeManual: "إحداثيات يدوية",
		latitude: "خط العرض",
		latitudeDesc: "صيغة عشرية (مثل 30.044)",
		longitude: "خط الطول",
		longitudeDesc: "صيغة عشرية (مثل 31.235)",
		countryDesc: "يرجى إدخال رمز الدولة بصيغة ISO المكونة من حرفين (مثل: US، SA، EG، AE) وليس الاسم الكامل للدولة، وذلك لضمان حساب أوقات الأذان بشكل صحيح.",
		calcMethod: "طريقة الحساب",
		calcMethodDesc: "اختر الجهة التي يعتمد عليها الحساب",
		audiofiles: "ملفات الأصوات",
		athanAudio: "ملف صوت الآذان",
		athanAudioDesc: "المسار داخل الخزنة (مثال: Sounds/athan.mp3)",
		preAthanAudio: "ملف صوت تنبيه ما قبل الآذان",
		preAthanAudioDesc: "صوت مخصص للتنبيه (يستخدم الآذان إذا كان فارغاً)",
		iqamaAudio: "ملف صوت الإقامة",
		iqamaAudioDesc: "صوت مخصص للإقامة (يستخدم الآذان إذا كان فارغاً)",
		fastingAudio: "ملف صوت الصيام",
		fastingAudioDesc: "المسار لتنبيه الصيام (يستخدم الآذان إذا كان فارغاً)",
		enableFor: "تفعيل الآذان لـ",
		PreAthanname: "قبل الأذان",
		enablePreAthan: "تفعيل تنبيه قرب الآذان",
		enableIqama: "تفعيل خصائص الإقامة",
		enableIqamaDesc: "مفتاح رئيسي لتفعيل أو تعطيل جميع مؤقتات وصوتيات الإقامة",
		enablePreAthanDesc: "عرض تنبيه وتشغيل صوت قصير قبل الصلاة",
		preAthanOffset: "وقت التنبيه (بالدقائق)",
		preAthanOffsetDesc: "كم دقيقة قبل الصلاة يتم التشغيل",
		iqamaSection: "الإقامة (دقائق بعد الصلاة)",
		iqamaDesc: "تفعيل لـ",
		supplicationSection: "تذكيرات الأذكار والأدعية",
		morningSupAudio: "ملف صوت أذكار الصباح",
		morningSupEnable: "أذكار الصباح",
		morningSupDesc: "تفعيل أذكار الصباح (قبل/بعد الشروق)",
		morningOffset: "توقيت الصباح (دقائق)",
		morningDir: "اتجاه الوقت",
		eveningSupAudio: "ملف صوت أذكار المساء",
		eveningSupEnable: "أذكار المساء",
		eveningSupDesc: "تفعيل أذكار المساء (قبل الغروب أو بعد العصر)",
		eveningOffset: "توقيت المساء (دقائق)",
		eveningRef: "مرجع المساء",
		nightSupAudio: "ملف صوت أذكار النوم",
		nightSupEnable: "أذكار النوم",
		nightSupDesc: "تفعيل أذكار النوم (بعد العشاء)",
		nightOffset: "توقيت الليل (دقائق)",
		displayRef: "عرض الوقت المرجعي",
		displayRefDesc: "اختر الوقت المرجعي للعرض في اللوحة",
		showStatusBar: "إظهار شريط الحالة",
		showStatusBarDesc: "عرض التاريخ الهجري والصلاة القادمة في الشريط السفلي",
		offlineFallback: "العمل دون اتصال",
		offlineFallbackDesc: "استخدام آخر مواقيت محفوظة عند فشل الاتصال",
		sysNotif: "استخدام إشعارات النظام",
		sysNotifDesc: "عرض إشعارات نظام التشغيل عندما يكون ذلك ممكناً",
		wakeLock: "محاولة منع السكون (موبايل)",
		wakeLockDesc: "محاولة إبقاء الشاشة تعمل لتحسين الموثوقية في الخلفية",
		fastingSection: "إعدادات الصيام",
		enableFasting: "تفعيل تنبيهات الصيام",
		fastingWeekdays: "اختر أيام الصيام الأسبوعية:",
		fastingHijri: "أيام الصيام الهجرية",
		fastingHijriDesc: "أرقام الأيام مفصولة بفواصل (مثال: 13,14,15)",
		fastingPrayer: "صلاة مرجع الصيام",
		fastingPrayerDesc: "الصلاة التي يتم التنبيه بناءً عليها",
		fastingOffset: "توقيت تنبيه الصيام (دقائق)",
		fastingDir: "اتجاه التنبيه",
		manualActions: "إجراءات يدوية",
		btnFetch: "تحديث الآن",
		btnPlay: "تشغيل الآذان",
		btnStop: "إيقاف الآذان",
		btnWakeLock: "طلب منع السكون (موبايل)",

		// Prayers
		Fajr: "الفجر",
		Sunrise: "الشروق",
		Dhuhr: "الظهر",
		Asr: "العصر",
		Maghrib: "المغرب",
		Isha: "العشاء",

		// Prayer offsets
		offsetsSection: "تعديل مواقيت الصلاة (بالدقائق)",
		offsetsDesc: "إضافة أو إنقاص دقائق من المواقيت المحسوبة (مثال: -2 أو 5)",

		// Reference labels
		ref_midnight: "منتصف الليل",
		ref_lastThird: "الثلث الأخير",
		ref_sunrise: "الشروق",
		ref_reminders: "التذكيرات",

		// Islamic notes
		islamicnote: "ملاحظات اسلامية",
		enabled: "تفعيل الملاحظات الإسلامية",
		enabledesc: "إنشاء/فتح ملاحظة إسلامية من شريط الحالة/الهجري (تشغيل/إيقاف)",
		folderpath: "مسار مجلد الملاحظات الإسلامية",
		folderpathdesc: "(المجلد الذي تُنشأ فيه الملاحظات الإسلامية (مثل 'يومي' أو 'مذكرات/يوميات",
		dateformat: "تنسيق التاريخ الهجري",
		dateformatdesc: "اختر طريقة عرض التاريخ الهجري",
		notedateformat: "تنسيق تاريخ الملاحظة الإسلامية",
		notedateformatdesc: "اختر التاريخ (التواريخ) المراد تضمينها في اسم ملف الملاحظة وعنوانها",

		// Note templates
		noteTemplateDesc: "تخصيص محتوى الملاحظات الإسلامية.",
		NoteTemplate: "قالب الملاحظة (عربية)",
		NoteTemplateEn: "قالب الملاحظة (إنجليزية)",
		templateResetNotice: "تم إعادة القالب الافتراضي",
		autoOpenIslamicName: "فتح الملاحظة فور فتح تشغيل التطبيق",
		autoOpenIslamicDesc: "إنشاء/فتح الملاحظة الإسلامية اليومية تلقائيًا عند تشغيل اوبسيديان.",

		// Islamic note content
		note_prayer_times: "مواقيت الصلاة",
		note_checklist: "قائمة المهام",
		note_morning: "أذكار الصباح",
		note_evening: "أذكار المساء",
		note_bedtime: "أذكار النوم",
		note_special_days: "أيام مميزة",
		note_today_holy: "اليوم يوم ديني",
		note_tomorrow_holy: "غداً يوم ديني",
		note_today_fasting: "اليوم يوم صيام",
		note_tomorrow_fasting: "غداً يوم صيام",

		// Fasting logic
		note_forbidden: "الصيام محرم",
		note_forbidden_msg: "يحرم الصيام {day} بسبب {event}",
		note_fasting_reason: "صيام {day} بسبب {event}",
		note_ramadan: "رمضان كريم",

		// Misc settings
		moresetting: "إعدادات أخرى",
		chooseFile: "اختر ملف",
		writeTemplate: "اكتب التمبلت",
		templateMode: "وضع القالب",
		fileMode: "وضع الملف",
		textMode: "وضع النص",
		noFileSelected: "لم يتم اختيار ملف",
		directWritingMode: "وضع الكتابة المباشرة",
		directTemplateText: "نص القالب المباشر",
		templateFile: "ملف القالب",

		// Fetch mode
		fetchMode: "طريقة الجلب",
		fetchModeDesc: "اختر طريقة جلب مواقيت الصلاة",
		fetchModeMonthly: "شهري - جلب الشهر كاملاً مرة واحدة (موصى به)",
		fetchModeDaily: "يومي - جلب كل يوم على حدة",
		fetchModeHybrid: "هجري - جلب شهري مع تحديث يومي للتواريخ الهجرية",

		// Hijri offset
		hijriOffsetSection: "تصحيح التاريخ الهجري",
		hijriOffsetDesc: "ضبط التاريخ الهجري إذا كان مختلفاً عن الرؤية المحلية",
		hijriOffsetEnable: "تفعيل تصحيح التاريخ الهجري",
		hijriOffsetDays: "إزاحة التاريخ الهجري (أيام)",
		hijriOffsetDaysDesc: "عدد الأيام للإضافة أو الطرح (مثال: 1 أو -1)",

		// Layout
		settingsLayout: "طريقة التنقل",
		settingsLayoutDesc: "اختر نوع طريقة التنقل تابات مفصلة او كل شئ في مكان واحد",
		layoutTabbed: "تبويبات",
		layoutFlat: "صفحة واحدة",

		// Tab labels
		tabGeneral: "عام",
		tabPrayers: "الصلوات",
		tabPaths: "المسارات",
		Paths: "المسارات",
		tabReminders: "التذكيرات",
		tabSupplications: "الأذكار",
		tabFasting: "الصيام",
		tabNotes: "الملاحظات",
		tabAdvanced: "متقدم",

		// Weekday names
		Sun: "الأحد", Mon: "الاثنين", Tue: "الثلاثاء", Wed: "الأربعاء",
		Thu: "الخميس", Fri: "الجمعة", Sat: "السبت",

		// Fasting analysis headings
		fastingAnalysisHolyDays: "الأيام المباركة",
		fastingAnalysisFasting: "الصيام",
		fastingAnalysisToday: "اليوم",
		fastingAnalysisTomorrow: "غداً",

		// Reminder mode & Dashboard (Feature 4)
		reminderMode: "أسلوب إشعارات التذكير",
		reminderModeDesc: "تسلسلي: إشعار كل تذكير في وقته. لوحة التحكم: جمع كل التذكيرات وعرضها دفعة واحدة في وقت محدد.",
		reminderModeSequential: "تسلسلي (إشعار في وقت كل تذكير)",
		reminderModeDashboard: "لوحة التحكم (عرض الكل مرة واحدة في وقت محدد)",
		dashboardTime: "وقت لوحة التذكيرات",
		dashboardTimeDesc: "الوقت الذي تُفتح فيه لوحة التذكيرات (HH:MM، صيغة 24 ساعة)",
		dashboardTitle: "لوحة التذكيرات",
		dashboardSubtitle: "جميع التذكيرات المعلقة لهذا اليوم",
		dashboardEmpty: "لا توجد تذكيرات معلقة اليوم. 🎉",
		dashboardDue: "موعد",
		dashboardCustomSound: "صوت مخصص",
		dashboardOpenDashboard: "فتح اللوحة الآن",
		dashboardMarkAllDone: "تمييز الكل كمنجز",

		// Reminder Panel (Feature 6)
		reminderHeader: "التذكيرات",
		reminderPanelEmpty: "لا توجد تذكيرات اليوم.",
		reminderPanelDismiss: "إخفاء",
		reminderPanelDone: "تم",
		reminderPanelTodayOnly: "اليوم",
		openReminderPanel: "فتح لوحة التذكيرات",

		// Show Reminders in panel reference cycle
		showRemindersInPanel: "إظهار تبويب التذكيرات في اللوحة",
		showRemindersInPanelDesc: "عند التفعيل، تظهر 'التذكيرات' كخيار مرجعي في لوحة الصلاة. عند التعطيل، ينتقل التنقل بعد الخيار الثالث مباشرةً إلى الأول.",

		// Dynamic Reference (Feature 8)
		dynamicReference: "المرجع الديناميكي",
		dynamicReferenceDesc: "يضبط المرجع تلقائيًا بحسب الوقت الحالي:يمكن التبديل يدويًا — يُعاد الضبط التلقائي بعد دقيقة واحدة.",

		// Hide Reference Button
		hideReferenceBtn: "إخفاء زر المرجغ",
		hideReferenceBtnDesc: "إخفاء زر المرجع داخل لوحة الصلوات",

		// Feature 7: Postponed / missed reminder recovery
		postponedReminderBehavior: "سلوك التذكيرات المتأخرة",
		postponedReminderBehaviorDesc: "ماذا يحدث عند فتح التطبيق وقد مضى وقت تذكير مؤجل؟",
		postponedDelay6s: "عرض التذكير بعد 6 ثوانٍ من فتح التطبيق",
		postponedWaitDashboard: "الانتظار حتى يبلغ الوقت الحالي وقت لوحة التحكم (حالة خاصة)",
		multiplePostponedDisplay: "تذكيرات متعددة متأخرة: عرضها في",
		multiplePostponedDisplayDesc: "عند وجود عدة تذكيرات متأخرة، عرضها داخل لوحة إشعارات التحكم أو واحدة تلو الأخرى.",
		multiplePostponedDashboard: "لوحة إشعارات التذكيرات",
		multiplePostponedSequential: "تسلسلي (الأولى ثم الثانية...)",
	},
};

// ---------------------------------------------------------------------------
// Calculation methods (AlAdhan API)
// ---------------------------------------------------------------------------

const METHOD_OPTIONS = [
	{ id: -1, label: "Auto / Default (Based on Location)", labelAr: "تلقائي / افتراضي (بناءً على الموقع)" },
	{ id: 1,  label: "University of Islamic Sciences, Karachi", labelAr: "جامعة العلوم الإسلامية، كراتشي" },
	{ id: 2,  label: "Islamic Society of North America (ISNA)", labelAr: "الجمعية الإسلامية لأمريكا الشمالية (ISNA)" },
	{ id: 3,  label: "Muslim World League", labelAr: "رابطة العالم الإسلامي" },
	{ id: 4,  label: "Umm Al-Qura University (Makkah)", labelAr: "جامعة أم القرى (مكة المكرمة)" },
	{ id: 5,  label: "Egyptian General Authority of Survey", labelAr: "الهيئة المصرية العامة للمساحة" },
	{ id: 7,  label: "Institute of Geophysics, Tehran", labelAr: "معهد الجيوفيزياء، جامعة طهران" },
	{ id: 8,  label: "Gulf Region", labelAr: "منطقة الخليج" },
	{ id: 9,  label: "Kuwait", labelAr: "الكويت" },
	{ id: 10, label: "Qatar", labelAr: "قطر" },
	{ id: 11, label: "Majlis Ugama Islam Singapura", labelAr: "مجلس الشريعة الإسلامية (سنغافورة)" },
	{ id: 12, label: "Union Organization Islamic de France", labelAr: "الاتحاد الإسلامي الفرنسي" },
	{ id: 13, label: "Turkey (Diyanet)", labelAr: "تركيا (رئاسة الشؤون الدينية)" },
	{ id: 14, label: "Spiritual Administration of Muslims of Russia", labelAr: "إدارة المسلمين في روسيا" },
	{ id: 15, label: "Moonsighting Committee Worldwide", labelAr: "لجنة رؤية الهلال العالمية" },
	{ id: 16, label: "Dubai (Unofficial)", labelAr: "دبي (غير رسمي)" },
];

// ---------------------------------------------------------------------------
// Countries dataset
// ---------------------------------------------------------------------------

const COUNTRIES = [
	{ code: "AF", en: "Afghanistan", ar: "أفغانستان" },
	{ code: "AL", en: "Albania", ar: "ألبانيا" },
	{ code: "DZ", en: "Algeria", ar: "الجزائر" },
	{ code: "AD", en: "Andorra", ar: "أندورا" },
	{ code: "AO", en: "Angola", ar: "أنغولا" },
	{ code: "AG", en: "Antigua and Barbuda", ar: "أنتيغوا وبربودا" },
	{ code: "AR", en: "Argentina", ar: "الأرجنتين" },
	{ code: "AM", en: "Armenia", ar: "أرمينيا" },
	{ code: "AU", en: "Australia", ar: "أستراليا" },
	{ code: "AT", en: "Austria", ar: "النمسا" },
	{ code: "AZ", en: "Azerbaijan", ar: "أذربيجان" },
	{ code: "BS", en: "Bahamas", ar: "باهاماس" },
	{ code: "BH", en: "Bahrain", ar: "البحرين" },
	{ code: "BD", en: "Bangladesh", ar: "بنغلاديش" },
	{ code: "BB", en: "Barbados", ar: "باربادوس" },
	{ code: "BY", en: "Belarus", ar: "بيلاروس" },
	{ code: "BE", en: "Belgium", ar: "بلجيكا" },
	{ code: "BZ", en: "Belize", ar: "بليز" },
	{ code: "BJ", en: "Benin", ar: "بنين" },
	{ code: "BT", en: "Bhutan", ar: "بوتان" },
	{ code: "BO", en: "Bolivia", ar: "بوليفيا" },
	{ code: "BA", en: "Bosnia and Herzegovina", ar: "البوسنة والهرسك" },
	{ code: "BW", en: "Botswana", ar: "بوتسوانا" },
	{ code: "BR", en: "Brazil", ar: "البرازيل" },
	{ code: "BN", en: "Brunei", ar: "بروناي" },
	{ code: "BG", en: "Bulgaria", ar: "بلغاريا" },
	{ code: "BF", en: "Burkina Faso", ar: "بوركينا فاسو" },
	{ code: "BI", en: "Burundi", ar: "بوروندي" },
	{ code: "KH", en: "Cambodia", ar: "كمبوديا" },
	{ code: "CM", en: "Cameroon", ar: "الكاميرون" },
	{ code: "CA", en: "Canada", ar: "كندا" },
	{ code: "CV", en: "Cape Verde", ar: "الرأس الأخضر" },
	{ code: "CF", en: "Central African Republic", ar: "جمهورية أفريقيا الوسطى" },
	{ code: "TD", en: "Chad", ar: "تشاد" },
	{ code: "CL", en: "Chile", ar: "تشيلي" },
	{ code: "CN", en: "China", ar: "الصين" },
	{ code: "CO", en: "Colombia", ar: "كولومبيا" },
	{ code: "KM", en: "Comoros", ar: "جزر القمر" },
	{ code: "CG", en: "Congo", ar: "الكونغو" },
	{ code: "CD", en: "Democratic Republic of the Congo", ar: "الكونغو الديمقراطية" },
	{ code: "CR", en: "Costa Rica", ar: "كوستاريكا" },
	{ code: "CI", en: "Ivory Coast", ar: "ساحل العاج" },
	{ code: "HR", en: "Croatia", ar: "كرواتيا" },
	{ code: "CU", en: "Cuba", ar: "كوبا" },
	{ code: "CY", en: "Cyprus", ar: "قبرص" },
	{ code: "CZ", en: "Czech Republic", ar: "التشيك" },
	{ code: "DK", en: "Denmark", ar: "الدانمارك" },
	{ code: "DJ", en: "Djibouti", ar: "جيبوتي" },
	{ code: "DM", en: "Dominica", ar: "دومينيكا" },
	{ code: "DO", en: "Dominican Republic", ar: "جمهورية الدومينيكان" },
	{ code: "EC", en: "Ecuador", ar: "الإكوادور" },
	{ code: "EG", en: "Egypt", ar: "مصر" },
	{ code: "SV", en: "El Salvador", ar: "السلفادور" },
	{ code: "GQ", en: "Equatorial Guinea", ar: "غينيا الاستوائية" },
	{ code: "ER", en: "Eritrea", ar: "إريتريا" },
	{ code: "EE", en: "Estonia", ar: "إستونيا" },
	{ code: "SZ", en: "Eswatini", ar: "إسواتيني" },
	{ code: "ET", en: "Ethiopia", ar: "إثيوبيا" },
	{ code: "FJ", en: "Fiji", ar: "فيجي" },
	{ code: "FI", en: "Finland", ar: "فنلندا" },
	{ code: "FR", en: "France", ar: "فرنسا" },
	{ code: "GA", en: "Gabon", ar: "الغابون" },
	{ code: "GM", en: "Gambia", ar: "غامبيا" },
	{ code: "GE", en: "Georgia", ar: "جورجيا" },
	{ code: "DE", en: "Germany", ar: "ألمانيا" },
	{ code: "GH", en: "Ghana", ar: "غانا" },
	{ code: "GR", en: "Greece", ar: "اليونان" },
	{ code: "GD", en: "Grenada", ar: "غرينادا" },
	{ code: "GT", en: "Guatemala", ar: "غواتيمالا" },
	{ code: "GN", en: "Guinea", ar: "غينيا" },
	{ code: "GW", en: "Guinea-Bissau", ar: "غينيا بيساو" },
	{ code: "GY", en: "Guyana", ar: "غيانا" },
	{ code: "HT", en: "Haiti", ar: "هايتي" },
	{ code: "HN", en: "Honduras", ar: "هندوراس" },
	{ code: "HU", en: "Hungary", ar: "المجر" },
	{ code: "IS", en: "Iceland", ar: "آيسلندا" },
	{ code: "IN", en: "India", ar: "الهند" },
	{ code: "ID", en: "Indonesia", ar: "إندونيسيا" },
	{ code: "IR", en: "Iran", ar: "إيران" },
	{ code: "IQ", en: "Iraq", ar: "العراق" },
	{ code: "IE", en: "Ireland", ar: "إيرلندا" },
	{ code: "IT", en: "Italy", ar: "إيطاليا" },
	{ code: "JM", en: "Jamaica", ar: "جامايكا" },
	{ code: "JP", en: "Japan", ar: "اليابان" },
	{ code: "JO", en: "Jordan", ar: "الأردن" },
	{ code: "KZ", en: "Kazakhstan", ar: "كازاخستان" },
	{ code: "KE", en: "Kenya", ar: "كينيا" },
	{ code: "KW", en: "Kuwait", ar: "الكويت" },
	{ code: "KG", en: "Kyrgyzstan", ar: "قيرغيزستان" },
	{ code: "LA", en: "Laos", ar: "لاوس" },
	{ code: "LV", en: "Latvia", ar: "لاتفيا" },
	{ code: "LB", en: "Lebanon", ar: "لبنان" },
	{ code: "LS", en: "Lesotho", ar: "ليسوتو" },
	{ code: "LR", en: "Liberia", ar: "ليبيريا" },
	{ code: "LY", en: "Libya", ar: "ليبيا" },
	{ code: "LI", en: "Liechtenstein", ar: "ليختنشتاين" },
	{ code: "LT", en: "Lithuania", ar: "ليتوانيا" },
	{ code: "LU", en: "Luxembourg", ar: "لوكسمبورغ" },
	{ code: "MY", en: "Malaysia", ar: "ماليزيا" },
	{ code: "MV", en: "Maldives", ar: "جزر المالديف" },
	{ code: "ML", en: "Mali", ar: "مالي" },
	{ code: "MT", en: "Malta", ar: "مالطا" },
	{ code: "MR", en: "Mauritania", ar: "موريتانيا" },
	{ code: "MU", en: "Mauritius", ar: "موريشيوس" },
	{ code: "MX", en: "Mexico", ar: "المكسيك" },
	{ code: "MD", en: "Moldova", ar: "مولدوفا" },
	{ code: "MN", en: "Mongolia", ar: "منغوليا" },
	{ code: "ME", en: "Montenegro", ar: "الجبل الأسود" },
	{ code: "MA", en: "Morocco", ar: "المغرب" },
	{ code: "MZ", en: "Mozambique", ar: "موزمبيق" },
	{ code: "MM", en: "Myanmar", ar: "ميانمار" },
	{ code: "NA", en: "Namibia", ar: "ناميبيا" },
	{ code: "NP", en: "Nepal", ar: "نيبال" },
	{ code: "NL", en: "Netherlands", ar: "هولندا" },
	{ code: "NZ", en: "New Zealand", ar: "نيوزيلندا" },
	{ code: "NI", en: "Nicaragua", ar: "نيكاراغوا" },
	{ code: "NE", en: "Niger", ar: "النيجر" },
	{ code: "NG", en: "Nigeria", ar: "نيجيريا" },
	{ code: "NO", en: "Norway", ar: "النرويج" },
	{ code: "OM", en: "Oman", ar: "عُمان" },
	{ code: "PK", en: "Pakistan", ar: "باكستان" },
	{ code: "PA", en: "Panama", ar: "بنما" },
	{ code: "PY", en: "Paraguay", ar: "باراغواي" },
	{ code: "PE", en: "Peru", ar: "بيرو" },
	{ code: "PH", en: "Philippines", ar: "الفلبين" },
	{ code: "PL", en: "Poland", ar: "بولندا" },
	{ code: "PT", en: "Portugal", ar: "البرتغال" },
	{ code: "QA", en: "Qatar", ar: "قطر" },
	{ code: "RO", en: "Romania", ar: "رومانيا" },
	{ code: "RU", en: "Russia", ar: "روسيا" },
	{ code: "RW", en: "Rwanda", ar: "رواندا" },
	{ code: "SA", en: "Saudi Arabia", ar: "السعودية" },
	{ code: "SN", en: "Senegal", ar: "السنغال" },
	{ code: "RS", en: "Serbia", ar: "صربيا" },
	{ code: "SG", en: "Singapore", ar: "سنغافورة" },
	{ code: "SK", en: "Slovakia", ar: "سلوفاكيا" },
	{ code: "SI", en: "Slovenia", ar: "سلوفينيا" },
	{ code: "SO", en: "Somalia", ar: "الصومال" },
	{ code: "ZA", en: "South Africa", ar: "جنوب أفريقيا" },
	{ code: "ES", en: "Spain", ar: "إسبانيا" },
	{ code: "LK", en: "Sri Lanka", ar: "سريلانكا" },
	{ code: "SD", en: "Sudan", ar: "السودان" },
	{ code: "SR", en: "Suriname", ar: "سورينام" },
	{ code: "SE", en: "Sweden", ar: "السويد" },
	{ code: "CH", en: "Switzerland", ar: "سويسرا" },
	{ code: "SY", en: "Syria", ar: "سوريا" },
	{ code: "TJ", en: "Tajikistan", ar: "طاجيكستان" },
	{ code: "TZ", en: "Tanzania", ar: "تنزانيا" },
	{ code: "TH", en: "Thailand", ar: "تايلاند" },
	{ code: "TG", en: "Togo", ar: "توغو" },
	{ code: "TN", en: "Tunisia", ar: "تونس" },
	{ code: "TR", en: "Turkey", ar: "تركيا" },
	{ code: "TM", en: "Turkmenistan", ar: "تركمانستان" },
	{ code: "UG", en: "Uganda", ar: "أوغندا" },
	{ code: "UA", en: "Ukraine", ar: "أوكرانيا" },
	{ code: "AE", en: "United Arab Emirates", ar: "الإمارات" },
	{ code: "GB", en: "United Kingdom", ar: "المملكة المتحدة" },
	{ code: "US", en: "United States", ar: "الولايات المتحدة" },
	{ code: "UY", en: "Uruguay", ar: "أوروغواي" },
	{ code: "UZ", en: "Uzbekistan", ar: "أوزبكستان" },
	{ code: "VE", en: "Venezuela", ar: "فنزويلا" },
	{ code: "VN", en: "Vietnam", ar: "فيتنام" },
	{ code: "YE", en: "Yemen", ar: "اليمن" },
	{ code: "ZM", en: "Zambia", ar: "زامبيا" },
	{ code: "ZW", en: "Zimbabwe", ar: "زيمبابوي" },
];

// ---------------------------------------------------------------------------
// Default settings
// ---------------------------------------------------------------------------

const DEFAULT_SETTINGS = {
	language: "en",
	locationMode: "auto",
	latitude: "",
	longitude: "",
	settingsLayout: "tabbed",
	city: "",
	country: "",
	method: -1,
	timeFormat: "24h",
	athanAudioPath: "",
	hijriDateFormat: "iso",
	// Pre-Athan
	enablePreAthan: true,
	preAthanOffsetMinutes: 10,
	preAthanAudioPath: "",
	// Iqama
	enableIqamaFeature: false,
	iqamaMinutes: { Fajr: 10, Dhuhr: 5, Asr: 5, Maghrib: 5, Isha: 5 },
	iqamaEnabled: { Fajr: false, Dhuhr: false, Asr: false, Maghrib: false, Isha: false },
	iqamaAudioPath: "",
	// Enabled prayers
	enabledPrayers: { Fajr: true, Dhuhr: true, Asr: true, Maghrib: true, Isha: true },
	// Prayer offsets
	enablePrayerOffsets: false,
	prayerOffsets: { Fajr: 0, Sunrise: 0, Dhuhr: 0, Asr: 0, Maghrib: 0, Isha: 0, Midnight: 0 },
	// Fasting
	fastingEnabled: false,
	fastingAudioPath: "",
	fastingWeekdays: { Sun: false, Mon: false, Tue: false, Wed: false, Thu: false, Fri: false, Sat: false },
	fastingHijriDays: "",
	fastingAlert: { prayer: "Fajr", offsetMinutes: 10, direction: "before" },
	// Supplications
	supplications: {
		morning: { enabled: false, reference: "sunrise", direction: "after",  offsetMinutes: 5,  audioPath: "" },
		evening: { enabled: false, reference: "sunset",  direction: "before", offsetMinutes: 10, audioPath: "" },
		night:   { enabled: false, reference: "Isha",    direction: "after",  offsetMinutes: 5,  audioPath: "" },
	},
	// UI / reliability
	enableStatusBar: true,
	enableOfflineFallback: true,
	tryWakeLockOnMobile: true,
	showSystemNotification: true,
	hideReferenceBtn: false,
	displayReference: "lastThird",
	// Cached persistence — always uses monthTimes structure
	cached: { monthTimes: [], fetchedAtISO: null },
	// Daily notes
	enableDailyNotes: true,
	dailyNotesFolder: "deen",
	dailyNotesDateFormat: "both",
	autoOpenIslamicNoteOnStartup: false,
	// Note templates
	englishNoteTemplate: "",
	englishNoteTemplatePath: "",
	englishNoteTemplateMode: "text",
	arabicNoteTemplate: "",
	arabicNoteTemplatePath: "",
	arabicNoteTemplateMode: "text",
	// Reminder feature
	enableReminders: false,
	reminderAudioPath: "",
	postponeDurations: "5, 15, 30, 60", // comma-separated minutes offered in the Postpone dropdown
	reminderMode: "sequential",   // "sequential" | "dashboard"
	dashboardTime: "08:00",       // HH:MM — when to open the dashboard in dashboard mode
	showRemindersInPanel: true,   // whether the Reminders ref option appears in the panel cycle
	dynamicReference: false,      // Feature 8: auto-set reference based on time of day
	// Postponed / missed reminder recovery (Feature 7)
	postponedReminderBehavior: "delay6s", // "delay6s" | "waitForDashboardTime"
	multiplePostponedDisplay: "sequential", // "sequential" | "dashboard"
	// Fetch mode
	fetchMode: "monthly",
	// Hijri offset
	hijriOffset: 0,
	hijriOffsetEnabled: false,
};

/* ============================================================
   SECTION 2 — PLUGIN MAIN CLASS
   ============================================================ */

module.exports = class PrayerAthanPlugin extends Plugin {


	/* ---- Lifecycle ---------------------------------------- */

	async onload() {
		await this.loadSettings();

		// Runtime audio state
		this.audio = null;
		this._currentAudioURL = null;

		// Runtime prayer data (already seeded from cache in loadSettings)
		this.prayerTimes = this.prayerTimes || {};
		this.hijri       = this.hijri       || null;
		this.fetchedAt   = this.fetchedAt   || null;

		// Deduplication keys for scheduler
		// FIX: split into separate keys so pre-athan and vault reminders don't collide
		this.lastTriggered = {
			athan:                null,
			preAthan:             null,  // was "reminder" — shared with vault reminders (BUG)
			vaultReminder:        new Set(), // FIX Bug1: was a single key; now a Set so ALL shown reminders are tracked per session
			iqama:                null,
			fasting:              null,
			supplication:         null,
			holyDayNotifiedDate:  null,
			dashboard:            null,  // Feature 4: dedup key for daily dashboard open
		};

		this.wakeLock = null;

		// Feature 8: timer handle for resetting displayReference after manual override
		this._dynamicRefResetTimer = null;

		// Reminder system
		this.reminders        = new Map(); // filePath → reminder[]
		this.ignoredReminders = new Set();
		// Per-session dismissed reminder keys (cleared at midnight with daily triggers)
		this.dismissedReminders = new Set();
		// Feature 4: reminders collected but not yet shown in dashboard mode
		this._dashboardPending = [];

		// Register UI
		this.addSettingTab(new PrayerSettingTab(this.app, this));
		if (this.settings.enableStatusBar) {
			this.statusBarEl = this.addStatusBarItem();
			this.updateStatusBar();
		}
		this.registerView(VIEW_TYPE_PRAYER,   (leaf) => new PrayerPanelView(leaf, this));
		this.registerView(VIEW_TYPE_REMINDER, (leaf) => new ReminderPanelView(leaf, this));

		// Commands
		this.addCommand({ id: "open-prayer-panel",       name: "Open Prayer Panel",          callback: () => this.activatePrayerPanel() });
		this.addCommand({ id: "open-reminder-panel",     name: "Open Reminder Panel",         callback: () => this.activateReminderPanel() });
		this.addCommand({ id: "prayer-fetch-now",        name: "Fetch Prayer Times Now",      callback: async () => { await this.fetchPrayerTimes(true); new Notice(this.t("fetchRequested")); } });
		this.addCommand({ id: "prayer-play-now",      name: "Play Athan (manual)",        callback: async () => { await this.playAthan("Manual"); } });
		this.addCommand({ id: "prayer-stop-now",      name: "Stop Athan",                 callback: () => this.stopAthan() });
		this.addCommand({ id: "create-islamic-note",  name: "Create Islamic Daily Note",  callback: async () => { await this.createOrOpenHijriDailyNote(); } });
		// Feature 4: open dashboard manually at any time
		this.addCommand({ id: "open-reminder-dashboard", name: "Open Reminder Dashboard", callback: () => this.openReminderDashboard() });

		this.injectCSS();

		this.app.workspace.onLayoutReady(async () => {
			// Immediately use today's cached data if available
			const todayIndex = new Date().getDate() - 1;
			const todayData  = this.settings.cached?.monthTimes?.[todayIndex];
			if (todayData) {
				this._processDayData(todayData);
				this.updateStatusBar();
				this.refreshPrayerPanel();
			}

			// Background fetch only when the month has changed
			if (this._needsMonthUpdate()) {
				setTimeout(async () => { await this.fetchPrayerTimes(true); }, 2000);
			}

			// Initialize reminder scanning
			if (this.settings.enableReminders) {
				await this.scanVaultForReminders();
				// Feature 7: recover any past-due (postponed / missed) reminders
				await this._handlePostponedRemindersOnStartup();
				this.registerEvent(this.app.vault.on("modify", (file) => this.scanFileForReminders(file)));
				this.registerEvent(this.app.vault.on("delete", (file) => this.reminders.delete(file.path)));
				this.registerEvent(this.app.vault.on("rename", (file, oldPath) => {
					if (this.reminders.has(oldPath)) {
						this.reminders.set(file.path, this.reminders.get(oldPath));
						this.reminders.delete(oldPath);
					}
				}));
			}

			if (this.settings.autoOpenIslamicNoteOnStartup) {
				setTimeout(() => { this.createOrOpenHijriDailyNote(); }, 1000);
			}
		});

		// 1-minute scheduler: prayer times, reminders, dashboard
		this.registerInterval(window.setInterval(() => {
			this.checkPrayerSchedules();
			if (this.settings.enableReminders) {
				this.checkReminders();
				this._checkDashboardTime(); // Feature 4
			}
		}, 60_000));

		// 5-second UI refresh
		this.registerInterval(window.setInterval(() => {
			this.updateStatusBar();
			this.refreshPrayerPanel();
			this.refreshReminderPanel();
		}, 5_000));

		// Midnight: advance to next day's cached data and reset triggers
		this.registerInterval(window.setInterval(() => {
			const now = new Date();
			if (now.getHours() !== 0 || now.getMinutes() !== 0) return;
			const todayIndex = now.getDate() - 1;
			const monthTimes = this.settings.cached?.monthTimes;
			if (Array.isArray(monthTimes) && monthTimes.length > todayIndex) {
				const todayData = monthTimes[todayIndex];
				if (todayData) {
					this._processDayData(todayData);
					this._resetDailyTriggers();
				}
			}
		}, 60_000));

		// Every 6 hours: re-fetch if month rolled over
		this._lastSixHourRefresh = Date.now();
		this.registerInterval(window.setInterval(() => {
			const sixHours = 1000 * 60 * 60 * 6;
			if (Date.now() - this._lastSixHourRefresh < sixHours) return;
			this._lastSixHourRefresh = Date.now();
			if (this._needsMonthUpdate()) this.fetchPrayerTimes();
		}, 60_000));
	}

	onunload() {
		this.app.workspace.getLeavesOfType(VIEW_TYPE_PRAYER).forEach(l => l.detach());
		this.app.workspace.getLeavesOfType(VIEW_TYPE_REMINDER).forEach(l => l.detach());
		this.releaseWakeLock();
		this.stopAthan();
	}

	/** Reset per-day deduplication keys at midnight. */
	_resetDailyTriggers() {
		this.lastTriggered = {
			athan:               null,
			preAthan:            null,
			vaultReminder:       new Set(), // FIX Bug1: reset to empty Set, not null
			iqama:               null,
			fasting:             null,
			supplication:        null,
			holyDayNotifiedDate: null,
			dashboard:           null, // Feature 4
		};
		this._dashboardPending  = []; // clear collected pending reminders
		this.dismissedReminders = new Set(); // clear per-day dismissed keys
	}

	/* ---- i18n --------------------------------------------- */

	/** Translate a key with optional {placeholder} interpolation. */
	t(key, params = {}) {
		const lang = this.settings.language || "en";
		let str = (TRANSLATIONS[lang]?.[key]) ?? (TRANSLATIONS["en"][key]) ?? key;
		for (const k in params) str = str.replace(`{${k}}`, params[k]);
		return str;
	}

	/** Translate a prayer name; handles "Manual" pseudo-name. */
	tPrayer(englishName) {
		if (englishName === "Manual") return this.t("manual");
		return this.t(englishName) || englishName;
	}

	/* ---- Country helper ------------------------------------ */

	/**
	 * Given a country setting value (ISO code or full name), return
	 * the English name required by the AlAdhan city endpoint.
	 */
	getCountryParam(value) {
		if (!value) return "";
		const v = String(value).trim();

		if (v.length === 2) {
			const match = COUNTRIES.find(c => c.code.toUpperCase() === v.toUpperCase());
			return match ? match.en : v;
		}

		const found = COUNTRIES.find(c =>
			c.en.toLowerCase() === v.toLowerCase() || c.ar === v
		);
		return found ? found.en : v;
	}

	/* ---- Fetching & caching ------------------------------- */

	/**
	 * Fetch prayer times from AlAdhan.
	 * - Monthly mode: only fetches when the calendar month changes (or force=true from a
	 *   *manual* user action). Does NOT re-fetch just because the app restarted.
	 * - Daily mode:   fetches every day.
	 * - Hybrid mode:  monthly fetch + daily Hijri-only update.
	 *
	 * FIX: Original code fetched from network on every app start in monthly mode because
	 * force=true was passed from onLayoutReady. Now onLayoutReady only passes force when
	 * _needsMonthUpdate() is true.
	 */
	async fetchPrayerTimes(force = false) {
		const todayIndex = new Date().getDate() - 1;
		const mode       = this.settings.fetchMode || "monthly";

		// In monthly/hybrid modes, skip network when cache is still valid
		if (!force && !this._needsMonthUpdate()) {
			if (mode === "hybrid") await this._updateHijriDateOnly();
			return;
		}

		try {
			if (mode === "daily") {
				await this._fetchDailyPrayerTimes();
				return;
			}

			// Monthly and hybrid share the same calendar fetch
			const now    = new Date();
			const month  = now.getMonth() + 1;
			const year   = now.getFullYear();
			const methodParam = this.settings.method === -1 ? "" : `&method=${this.settings.method}`;

			const url = this._buildCalendarUrl(month, year, methodParam);

			const res  = await fetch(url);
			if (!res.ok) throw new Error(`HTTP ${res.status}`);

			const json = await res.json();
			if (!json?.data || !Array.isArray(json.data)) throw new Error("Invalid API response");

			// Persist full month; clear old prayerTimes/hijri fields from legacy schema
			this.settings.cached = {
				monthTimes:   json.data,
				fetchedAtISO: new Date().toISOString(),
			};
			await this.saveSettings();

			const todayData = json.data[todayIndex];
			if (todayData?.timings) this._processDayData(todayData);

			new Notice(this.t("fetchUpdated"));
			this.updateStatusBar();
			this.refreshPrayerPanel();
			this._checkHolyDayNotification();

		} catch (err) {
			console.error("fetchPrayerTimes failed:", err);
			new Notice(this.t("fetchFailed"));
			this._tryOfflineFallback(todayIndex);
		}
	}

	/** Build the appropriate AlAdhan calendar URL based on location mode. */
	_buildCalendarUrl(month, year, methodParam) {
		if (this.settings.locationMode === "manual") {
			if (!this.settings.latitude || !this.settings.longitude) {
				new Notice(this.settings.language === "ar"
					? "يرجى إدخال خطوط العرض والطول"
					: "Please enter Latitude and Longitude");
				throw new Error("Missing coordinates");
			}
			return `https://api.aladhan.com/v1/calendar?latitude=${this.settings.latitude}&longitude=${this.settings.longitude}${methodParam}&month=${month}&year=${year}`;
		}
		const countryParam = this.getCountryParam(this.settings.country);
		return `https://api.aladhan.com/v1/calendarByCity?city=${encodeURIComponent(this.settings.city)}&country=${encodeURIComponent(countryParam)}${methodParam}&month=${month}&year=${year}`;
	}

	/** Use cached month data as fallback on network failure. */
	_tryOfflineFallback(todayIndex) {
		if (!this.settings.enableOfflineFallback) return;
		const monthTimes = this.settings.cached?.monthTimes;
		if (!Array.isArray(monthTimes)) return;
		const todayData = monthTimes[todayIndex];
		if (todayData?.timings) {
			this._processDayData(todayData);
			new Notice(this.t("usingCached"));
		}
	}

	/**
	 * Fetch a single day's timings (daily mode).
	 * FIX: clears monthTimes so _needsMonthUpdate won't permanently return false.
	 */
	async _fetchDailyPrayerTimes() {
		const now  = new Date();
		const date = localISODate(now); // FIX: use local date, not UTC
		const methodParam = this.settings.method === -1 ? "" : `&method=${this.settings.method}`;

		let url;
		if (this.settings.locationMode === "manual") {
			url = `https://api.aladhan.com/v1/timings/${date}?latitude=${this.settings.latitude}&longitude=${this.settings.longitude}${methodParam}`;
		} else {
			const countryParam = this.getCountryParam(this.settings.country);
			url = `https://api.aladhan.com/v1/timingsByCity/${date}?city=${encodeURIComponent(this.settings.city)}&country=${encodeURIComponent(countryParam)}${methodParam}`;
		}

		const res  = await fetch(url);
		if (!res.ok) throw new Error(`HTTP ${res.status}`);

		const json = await res.json();
		if (!json?.data?.timings) throw new Error("Invalid API response");

		this._processDayData(json.data);

		// Store minimal cache so _needsMonthUpdate can detect the month correctly.
		// monthTimes is [] so a monthly re-check next day will trigger properly.
		this.settings.cached = {
			monthTimes:   [],
			fetchedAtISO: new Date().toISOString(),
		};
		await this.saveSettings();
	}

	/** Fetch only the Hijri date from AlAdhan (hybrid mode). */
	async _updateHijriDateOnly() {
		try {
			const date = localISODate(); // FIX: use local date, not UTC
			const res  = await fetch(`https://api.aladhan.com/v1/gToH/${date}`);
			if (!res.ok) return;
			const json = await res.json();
			if (json?.data?.hijri) {
				this.hijri = this.settings.hijriOffsetEnabled
					? this._applyHijriOffset(json.data.hijri)
					: json.data.hijri;
				await this.saveSettings();
			}
		} catch (err) {
			console.warn("Failed to update Hijri date only:", err);
		}
	}

	/**
	 * Extract and store today's prayer times from a raw AlAdhan day object.
	 * Applies user-configured time offsets.
	 * FIX: _processDayDataForLoad was a duplicate of this without offsets — merged here.
	 */
	_processDayData(dayData, applyOffsets = true) {
		if (!dayData?.timings) return;

		const raw   = dayData.timings;
		const clean = {};

		for (const key of ALL_TIME_KEYS) {
			if (!raw[key]) continue;
			const time   = this._cleanTimeString(raw[key]);
			const offset = (applyOffsets && this.settings.enablePrayerOffsets)
				? (this.settings.prayerOffsets[key] || 0)
				: 0;
			clean[key] = this._applyOffset(time, offset);
		}

		this.prayerTimes = clean;

		let hijriData = dayData.date?.hijri ?? null;
		if (hijriData && this.settings.hijriOffsetEnabled) {
			hijriData = this._applyHijriOffset(hijriData);
		}
		this.hijri     = hijriData;
		this.fetchedAt = new Date();
	}

	/**
	 * Returns true when no valid month cache exists, or when the cache
	 * belongs to a different calendar month than today.
	 */
	_needsMonthUpdate() {
		const cached = this.settings.cached;
		if (!cached?.fetchedAtISO || !Array.isArray(cached.monthTimes) || cached.monthTimes.length === 0) {
			return true;
		}

		const now       = new Date();
		const fetchedAt = new Date(cached.fetchedAtISO);

		return (
			fetchedAt.getMonth()     !== now.getMonth() ||
			fetchedAt.getFullYear()  !== now.getFullYear()
		);
	}

	/* ---- Scheduling & triggers ----------------------------- */

	/** Called every minute to check and fire prayer-time events. */
	checkPrayerSchedules() {
		const now        = new Date();
		const nowMinutes = now.getHours() * 60 + now.getMinutes();
		const TOLERANCE  = 1; // minutes

		for (const prayer of Object.keys(this.settings.enabledPrayers)) {
			if (!this.settings.enabledPrayers[prayer]) continue;

			const targetHM      = this.prayerTimes[prayer];
			if (!targetHM) continue;
			const prayerMinutes = this._hmToMinutes(targetHM);

			// Pre-Athan
			if (this.settings.enablePreAthan && Number.isFinite(Number(this.settings.preAthanOffsetMinutes))) {
				const offset    = Number(this.settings.preAthanOffsetMinutes);
				const preMin    = prayerMinutes - offset;
				const diff      = nowMinutes - preMin;

				if (preMin >= 0 && diff >= 0 && diff <= TOLERANCE) {
					const key = `${prayer}_preAthan_${preMin}`;
					if (this.lastTriggered.preAthan !== key) {
						this.lastTriggered.preAthan = key;
						this.triggerPreAthan(prayer);
					}
				}
			}

			// Athan
			const athanDiff = nowMinutes - prayerMinutes;
			if (athanDiff >= 0 && athanDiff <= TOLERANCE) {
				const key = `${prayer}_athan_${prayerMinutes}`;
				if (this.lastTriggered.athan !== key) {
					this.lastTriggered.athan = key;
					this.playAthan(prayer);
				}
			}

			// Iqama
			if (this.settings.enableIqamaFeature && this.settings.iqamaEnabled?.[prayer]) {
				const iq       = Number(this.settings.iqamaMinutes?.[prayer]) || 0;
				if (iq > 0) {
					const iqMin  = prayerMinutes + iq;
					const iqDiff = nowMinutes - iqMin;
					if (iqDiff >= 0 && iqDiff <= TOLERANCE) {
						const key = `${prayer}_iqama_${iqMin}`;
						if (this.lastTriggered.iqama !== key) {
							this.lastTriggered.iqama = key;
							this.playIqama(prayer);
						}
					}
				}
			}
		}

		this._checkFastingAlerts(now);
		this._checkSupplicationReminders(now);
	}

	async triggerPreAthan(prayer) {
		const msg  = this.t("preAthanMsg", { prayer: this.tPrayer(prayer), minutes: this.settings.preAthanOffsetMinutes });
		new Notice(msg);
		if (this.settings.showSystemNotification) {
			this._maybeShowSystemNotification(this.t("preAthanMsg").split(":")[0], msg);
		}
		const path = this.settings.preAthanAudioPath || this.settings.athanAudioPath || null;
		if (path) await this._playAudioFromVault(path, { previewSeconds: 3, volume: 0.6 });
	}

	async playIqama(prayer) {
		const path = this.settings.iqamaAudioPath || this.settings.athanAudioPath || null;
		if (!path) { new Notice(this.t("noAudio")); return; }
		const msg  = this.t("iqamaMsg", { prayer: this.tPrayer(prayer) });
		new Notice(msg);
		if (this.settings.showSystemNotification) this._maybeShowSystemNotification("Iqama", msg);
		await this._playAudioFromVault(path, { volume: 1 });
	}

	/* ---- Fasting & supplications -------------------------- */

	/** Parse a comma-separated list of Hijri day numbers. */
	_parseHijriDayList(txt) {
		if (!txt) return [];
		return txt
			.split(",")
			.map(s => Number(s.trim()))
			.filter(n => Number.isFinite(n) && n >= 1 && n <= 30);
	}

	/**
	 * Return an Islamic event for the given Hijri month name and day,
	 * or null if no special event applies.
	 * Types: "mandatory" | "forbidden" | "recommended" | "holy"
	 */
	_getIslamicEvent(hijriMonthName, hijriDay) {
		if (!hijriMonthName || !hijriDay) return null;
		const m = hijriMonthName.toLowerCase();
		const d = Number(hijriDay);

		// Mandatory
		if (m.includes("ramadan"))                                         return { name: "Ramadan",          type: "mandatory"   };

		// Forbidden
		if (m.includes("shawwal") && d === 1)                              return { name: "Eid al-Fitr",       type: "forbidden"   };
		if (m.includes("dhul") && m.includes("hijjah") && d === 10)       return { name: "Eid al-Adha",       type: "forbidden"   };
		if (m.includes("dhul") && m.includes("hijjah") && d >= 11 && d <= 13) return { name: "Tashreeq",     type: "forbidden"   };

		// Recommended
		if (m.includes("dhul") && m.includes("hijjah") && d === 9)        return { name: "Day of Arafah",     type: "recommended" };
		if (m.includes("muharram") && d === 10)                            return { name: "Ashura",            type: "recommended" };
		if (m.includes("muharram") && d === 9)                             return { name: "Tasu'a",            type: "recommended" };
		if ([13, 14, 15].includes(d))                                      return { name: "الأيام البيض",     type: "recommended" };
		if (m.includes("muharram") && d === 1)                             return { name: "Islamic New Year",  type: "recommended" };
		if (m.includes("sha") && m.includes("ban") && d === 15)            return { name: "Mid-Sha'ban",       type: "recommended" };
		if (m.includes("shawwal") && d > 1 && d <= 7)                     return { name: "Six of Shawwal",    type: "recommended" };

		// Holy (not necessarily fasting)
		if (m.includes("rajab") && d === 27)                               return { name: "Isra and Mi'raj",   type: "holy"        };
		if (m.includes("rabi") && m.includes("awwal") && d === 12)         return { name: "Mawlid",            type: "holy"        };

		return null;
	}

	/**
	 * Determine fasting/forbidden status for a given date.
	 * dayOffset = 0 for today, 1 for tomorrow.
	 * Returns a status object or null if no notable status.
	 */
	_analyzeFastingStatus(dateObj, hijriObj, dayOffset = 0) {
		if (!hijriObj?.day) return null;

		const weekdayKey   = WEEKDAY_KEYS[dateObj.getDay()];
		const timeLabel    = dayOffset === 0
			? (this.settings.language === "ar" ? "اليوم" : "Today")
			: (this.settings.language === "ar" ? "غداً"  : "Tomorrow");

		// Approximate Hijri day (simple rollover — accurate enough for UI)
		let hDay   = Number(hijriObj.day) + dayOffset;
		let hMonth = hijriObj.month?.en ?? "";
		if (hDay > 30) hDay -= 30; // Simple rollover; doesn't update month name

		const event          = this._getIslamicEvent(hMonth, hDay);
		const userWantsToFast = this.settings.fastingWeekdays?.[weekdayKey] ||
			this._parseHijriDayList(this.settings.fastingHijriDays || "").includes(hDay);

		if (event?.type === "forbidden") {
			return {
				priority: 10, isForbidden: true, isFasting: false,
				className: "forbidden",
				text: this.t("note_forbidden_msg", { day: timeLabel, event: event.name }),
			};
		}
		if (event?.type === "mandatory") {
			return {
				priority: 5, isForbidden: false, isFasting: true,
				className: "mandatory",
				text: `${event.name}: ${this.t("note_today_fasting")}`,
			};
		}
		if (event?.type === "recommended") {
			return {
				priority: 4, isForbidden: false, isFasting: true,
				className: "recommended",
				text: this.t("note_fasting_reason", { day: timeLabel, event: event.name }),
			};
		}
		if (userWantsToFast) {
			return {
				priority: 1, isForbidden: false, isFasting: true,
				className: "default",
				text: dayOffset === 0 ? this.t("note_today_fasting") : this.t("note_tomorrow_fasting"),
			};
		}
		return null;
	}

	_checkFastingAlerts(now) {
		if (!this.settings.fastingEnabled) return;

		const alertCfg  = this.settings.fastingAlert || { prayer: "Fajr", offsetMinutes: 10, direction: "before" };
		const refHM     = this.prayerTimes[alertCfg.prayer || "Fajr"];
		if (!refHM) return;

		let alertMin = this._hmToMinutes(refHM);
		const offset = Number(alertCfg.offsetMinutes) || 0;
		alertMin    += alertCfg.direction === "before" ? -offset : offset;
		if (alertMin < 0) alertMin = 0;

		const nowMin = now.getHours() * 60 + now.getMinutes();
		if (nowMin !== alertMin) return;

		// If alert is at Maghrib/Isha, warn about TOMORROW's fast
		const isForTomorrow = (alertCfg.prayer === "Maghrib" || alertCfg.prayer === "Isha");
		const targetDate    = isForTomorrow ? new Date(now.getTime() + 86400000) : now;
		const status        = this._analyzeFastingStatus(targetDate, this.hijri, isForTomorrow ? 1 : 0);

		if (status?.isFasting && !status.isForbidden) {
			const key = `fasting_${this._dayKeyForFasting(now)}_${alertMin}`;
			if (this.lastTriggered.fasting !== key) {
				this.lastTriggered.fasting = key;
				this._triggerFastingAlert(status.text);
			}
		}
	}

	_dayKeyForFasting(now) {
		let key = localISODate(now); // FIX: use local date, not UTC
		if (this.hijri?.day) key += `_h${this.hijri.day}_${this.hijri.month?.en ?? ""}`;
		return key;
	}

	async _triggerFastingAlert(customMsg) {
		const msg = customMsg || this.t("fastingAlert");
		new Notice(msg);
		if (this.settings.showSystemNotification) {
			this._maybeShowSystemNotification(this.t("fastingAlert"), msg);
		}
		const path = this.settings.fastingAudioPath || this.settings.athanAudioPath;
		if (path) await this._playAudioFromVault(path, { volume: 1 });
	}

	_checkSupplicationReminders(now) {
		const sup = this.settings.supplications || {};
		for (const key of ["morning", "evening", "night"]) {
			if (sup[key]?.enabled) this._checkSingleSupplication(key, sup[key], now);
		}
	}

	_checkSingleSupplication(key, cfg, now) {
		const refTimeHM = this._resolveSupplicationRef(cfg.reference);
		if (!refTimeHM) return;

		let minutes  = this._hmToMinutes(refTimeHM);
		const offset = Number(cfg.offsetMinutes) || 0;
		minutes     += cfg.direction === "before" ? -offset : offset;
		if (minutes < 0) minutes = 0;

		const nowMinutes = now.getHours() * 60 + now.getMinutes();
		if (nowMinutes !== minutes) return;

		const dateKey = this.fetchedAt ? localISODate(this.fetchedAt) : ""; // FIX: local date, not UTC
		const id      = `${key}_${minutes}_${dateKey}`;
		if (this.lastTriggered.supplication !== id) {
			this.lastTriggered.supplication = id;
			this._triggerSupplication(cfg, key);
		}
	}

	/** Resolve a supplication reference string to an HH:MM time. */
	_resolveSupplicationRef(ref) {
		const r = (ref || "").toLowerCase();
		if (r === "sunrise")                          return this.prayerTimes.Sunrise  || null;
		if (r === "sunset" || r === "maghrib")        return this.prayerTimes.Maghrib  || null;
		if (this.prayerTimes[ref])                    return this.prayerTimes[ref];
		return null;
	}

	async _triggerSupplication(cfg, nameKey) {
		const labelMap  = { morning: "morningSup", evening: "eveningSup", night: "nightSup" };
		const label     = this.t(labelMap[nameKey] || "supplication");
		new Notice(label);
		if (this.settings.showSystemNotification) this._maybeShowSystemNotification(label, label);
		const path = cfg?.audioPath || this.settings.athanAudioPath || this.settings.fastingAudioPath;
		if (path) await this._playAudioFromVault(path, { volume: 0.7 });
	}

	/* ---- Holy day detection -------------------------------- */

	/**
	 * Return an array of holy day names for a given Hijri day & month.
	 * Shared by _checkHolyDayNotification and createOrOpenHijriDailyNote.
	 */
	_detectHolyDays(dayNum, hijriMonthName) {
		if (!Number.isFinite(dayNum) || !hijriMonthName) return [];
		const m   = hijriMonthName.toLowerCase();
		const out = [];
		if (m.includes("shawwal")  && dayNum === 1)                         out.push("Eid al-Fitr");
		if (m.includes("dhul")     && m.includes("hijjah") && dayNum === 9) out.push("Day of Arafah");
		if (m.includes("dhul")     && m.includes("hijjah") && dayNum === 10) out.push("Eid al-Adha");
		if (m.includes("muharram") && dayNum === 1)                         out.push("Islamic New Year");
		if (m.includes("muharram") && dayNum === 10)                        out.push("Ashura");
		if (m.includes("rajab")    && dayNum === 27)                        out.push("Isra and Mi'raj");
		if (m.includes("ramadan")  && dayNum === 1)                         out.push("Start of Ramadan");
		return out;
	}

	_checkHolyDayNotification() {
		if (!this.hijri) return;
		const dayNum    = Number(this.hijri.day || (this.hijri.date?.split("-")[0]) || NaN);
		const monthName = this.hijri.month?.en ?? (this.hijri.month ?? "");
		if (!Number.isFinite(dayNum)) return;

		const holidays = this._detectHolyDays(dayNum, monthName);
		if (holidays.length === 0) return;

		const todayKey = this.fetchedAt
			? localISODate(this.fetchedAt) // FIX: local date, not UTC
			: localISODate();
		if (this.lastTriggered.holyDayNotifiedDate === todayKey) return;
		this.lastTriggered.holyDayNotifiedDate = todayKey;

		const body = `Today: ${holidays.join(", ")}`;
		new Notice(`${this.t("holyDay")}: ${body}`);
		if (this.settings.showSystemNotification) this._maybeShowSystemNotification(this.t("holyDay"), body);
	}

	/* ---- Audio helpers ------------------------------------ */

	/** Play an audio file from the vault by path, revoking the blob URL when done. */
	async _playAudioFromVault(path, opts = {}) {
		if (!path) return;
		try {
			const file = this.app.vault.getAbstractFileByPath(path);
			if (!(file instanceof TFile)) {
				console.warn("Audio file not found:", path);
				new Notice(`${this.t("fileNotFound")} (${path})`);
				return;
			}

			this.stopAthan(); // Revoke any previous audio

			const data = await this.app.vault.readBinary(file);
			const url  = URL.createObjectURL(new Blob([data]));
			this._currentAudioURL = url;
			this.audio            = new Audio(url);
			this.audio.volume     = typeof opts.volume === "number" ? opts.volume : 1;

			// Revoke blob URL when playback ends
			const revoke = () => {
				try { URL.revokeObjectURL(url); }   catch (e) {}
				try { this.audio?.removeEventListener("ended", revoke); } catch (e) {}
			};
			this.audio.addEventListener("ended", revoke);

			await this.audio.play();

			if (opts.previewSeconds) {
				setTimeout(() => this.stopAthan(), opts.previewSeconds * 1000);
			}
		} catch (err) {
			console.warn("Failed to play audio from vault:", err);
		}
	}

	async playAthan(prayer) {
		if (!this.settings.athanAudioPath) {
			new Notice(this.t("noAudio"));
			if (this.settings.showSystemNotification) {
				this._maybeShowSystemNotification("Athan", this.t("noAudio"));
			}
			return;
		}

		const file = this.app.vault.getAbstractFileByPath(this.settings.athanAudioPath);
		if (!(file instanceof TFile)) { new Notice(this.t("fileNotFound")); return; }

		try {
			const data = await this.app.vault.readBinary(file);
			const url  = URL.createObjectURL(new Blob([data]));
			this.stopAthan();
			this._currentAudioURL = url;
			this.audio            = new Audio(url);
			this.audio.loop       = false;
			this.audio.volume     = 1;

			this.audio.addEventListener("ended", () => {
				try { URL.revokeObjectURL(url); } catch (e) {}
				this._currentAudioURL = null;
			});

			await this.audio.play();

			const prayerName = this.tPrayer(prayer);
			new Notice(`Athan: ${prayerName}`);
			if (this.settings.showSystemNotification) {
				this._maybeShowSystemNotification("Athan", `Athan for ${prayerName}`);
			}
		} catch (err) {
			console.error("playAthan error", err);
			new Notice("Failed to play Athan audio.");
		}
	}

	stopAthan() {
		try {
			if (this.audio) {
				this.audio.pause();
				try { this.audio.src = ""; } catch (e) {}
				this.audio = null;
			}
			if (this._currentAudioURL) {
				try { URL.revokeObjectURL(this._currentAudioURL); } catch (e) {}
				this._currentAudioURL = null;
			}
		} catch (err) { console.warn("stopAthan error", err); }
	}
	
  async playQuran() {
    try {
      this.stopQuran();
      if (typeof this.stopAthan === "function") this.stopAthan();
      new Notice("جاري اختيار قارئ وسورة عشوائية...");
  
      // 1. Create the audio object immediately to capture user intent
      this.quranaudio = new Audio();
      this.quranaudio.loop = false;
      this.quranaudio.volume = 1;
  
      const response = await fetch("https://mp3quran.net/api/v3/reciters?language=ar");
      if (!response.ok) throw new Error("Failed to fetch reciters");
      
      const data = await response.json();
      const reciters = data.reciters;
      
      if (!reciters || reciters.length === 0) throw new Error("No reciters found");
      
      const randomReciter = reciters[Math.floor(Math.random() * reciters.length)];
      const surahList = randomReciter.moshaf[0].surah_list.split(",");
      const randomSurahNumber = surahList[Math.floor(Math.random() * surahList.length)].trim();
      const formattedSurah = randomSurahNumber.padStart(3, "0");
      
      // 2. Format the URL cleanly and handle missing trailing slashes from the API
      let serverUrl = randomReciter.moshaf[0].server.trim();
      if (!serverUrl.endsWith("/")) {
          serverUrl += "/";
      }
      
      const audioUrl = `${serverUrl}${formattedSurah}.mp3`;
      
      this.quranaudio.src = audioUrl;
      this.quranaudio.load(); // Forces the browser to reload the source and parse the new media stream
  
      // 3. Play the audio
      try {
          await this.quranaudio.play();
      } catch (playError) {
          console.error("Audio playback blocked or failed:", playError);
          new Notice("تعذر تشغيل الملف الصوتي. تأكد من جودة اتصالك بالإنترنت.");
          return;
      }
  
      const surahIndex = parseInt(randomSurahNumber) - 1;
      // Assuming surahNames array is defined globally or in your class context
      const surahName = (typeof surahNames !== 'undefined' && surahNames[surahIndex]) || `سورة ${randomSurahNumber}`;
      
      new Notice(`يتلى الآن: ${surahName} -  ${randomSurahNumber} بصوت الشيخ ${randomReciter.name}`);
      
      if (this.settings && this.settings.showSystemNotification) {
          this._maybeShowSystemNotification("القرآن الكريم", `القارئ: ${randomReciter.name} - ${surahName}`);
      }
      console.log(`يتلى الآن: ${surahName} -  ${randomSurahNumber} بصوت الشيخ ${randomReciter.name}`);
      
    } catch (err) {
      console.error("playQuran error", err);
      new Notice("فشل في جلب أو تشغيل القرآن الكريم.");
    }
  }

	
	stopQuran() {
    try {
        if (this.quranaudio) {
            this.quranaudio.pause();
            try { this.quranaudio.src = ""; } catch (e) {}
            this.quranaudio = null;
        }
    } catch (err) { 
        console.warn("stopQuran error", err); 
    }
  }


	/* ---- Wake lock helpers -------------------------------- */

	async tryAcquireWakeLock() {
		if (!("wakeLock" in navigator)) { new Notice(this.t("wakeLockSupported")); return; }
		try {
			this.wakeLock = await navigator.wakeLock.request("screen");
			this.wakeLock.addEventListener("release", () => { console.log("Wake Lock released"); });
			new Notice(this.t("wakeLockAcquired"));
		} catch (err) {
			console.error("tryAcquireWakeLock failed", err);
			new Notice(this.t("wakeLockFailed"));
		}
	}

	async releaseWakeLock() {
		try {
			if (this.wakeLock) { await this.wakeLock.release(); this.wakeLock = null; }
		} catch (err) { console.warn("releaseWakeLock failed", err); }
	}

	/* ---- Status bar & panel helpers ----------------------- */

	updateStatusBar() {
		if (!this.settings.enableStatusBar) return;
		if (!this.statusBarEl) this.statusBarEl = this.addStatusBarItem();

		if (!this.prayerTimes?.Fajr) {
			this.statusBarEl.setText(this.t("loading"));
			return;
		}

		const next      = this._getNextPrayer();
		const countdown = this._formatCountdown(next);
		const hijriText = this._formatHijri() || "—";

		this.statusBarEl.setText(
			`${this.t("hijri")}: ${hijriText} | ` +
			`${this.t("next")}: ${this.tPrayer(next.name)} ${this._formatTime(next.time)} (${countdown})`
		);
		this.statusBarEl.onclick = async () => { await this.createOrOpenHijriDailyNote(); };
	}

	refreshPrayerPanel() {
		this.app.workspace.getLeavesOfType(VIEW_TYPE_PRAYER).forEach(l => {
			if (l.view && typeof l.view.render === "function") l.view.render();
		});
	}

	activatePrayerPanel() {
		let leaf = this.app.workspace.getLeavesOfType(VIEW_TYPE_PRAYER)[0];
		if (!leaf) leaf = this.app.workspace.getRightLeaf(false);
		leaf.setViewState({ type: VIEW_TYPE_PRAYER, active: true }).then(() => {
			this.app.workspace.revealLeaf(leaf);
		});
	}

	refreshReminderPanel() {
		this.app.workspace.getLeavesOfType(VIEW_TYPE_REMINDER).forEach(l => {
			if (l.view && typeof l.view.render === "function") l.view.render();
		});
	}

	activateReminderPanel() {
		let leaf = this.app.workspace.getLeavesOfType(VIEW_TYPE_REMINDER)[0];
		if (!leaf) leaf = this.app.workspace.getRightLeaf(false);
		leaf.setViewState({ type: VIEW_TYPE_REMINDER, active: true }).then(() => {
			this.app.workspace.revealLeaf(leaf);
		});
	}

	/* ---- Utilities: time formatting & math ---------------- */

	/** Format an "HH:MM" string to 12h or 24h based on settings. */
	_formatTime(hm) {
		if (!hm || hm === "--:--") return hm;
		if (this.settings.timeFormat !== "12h") return hm;
		const [hStr, m] = hm.split(":");
		let h = parseInt(hStr, 10);
		const suffix = h >= 12 ? this.t("pm") : this.t("am");
		h = h % 12 || 12;
		return `${String(h).padStart(2, "0")}:${m}${suffix}`;
	}

	/** Extract an "HH:MM" string from a raw AlAdhan timing string (may include timezone). */
	_cleanTimeString(s) {
		if (!s) return null;
		const m = s.match(/(\d{1,2}:\d{2})/);
		if (!m) return null;
		const [h, min] = m[1].split(":");
		return `${h.padStart(2, "0")}:${min}`;
	}

	/** Convert "HH:MM" to total minutes from midnight. */
	_hmToMinutes(hm) {
		if (!hm) return null;
		const [h, m] = hm.split(":").map(Number);
		return h * 60 + m;
	}

	/** Convert total minutes (may exceed 1440) back to "HH:MM". */
	_minutesToHM(mins) {
		const h = Math.floor(mins / 60) % 24;
		const m = mins % 60;
		return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
	}

	/** Apply a signed minute offset to "HH:MM", wrapping around midnight. */
	_applyOffset(timeStr, offset) {
		if (!timeStr || !offset) return timeStr;
		const [h, m] = timeStr.split(":").map(Number);
		const total  = ((h * 60 + m + offset) + 1440) % 1440;
		return this._minutesToHM(total);
	}

	/** Return the next upcoming obligatory prayer. */
	_getNextPrayer() {
		try {
			const now    = new Date();
			const nowMin = now.getHours() * 60 + now.getMinutes();
			let best     = null;

			for (const name of PRAYER_NAMES) {
				const t = this.prayerTimes[name];
				if (!t) continue;
				const pm = this._hmToMinutes(t);
				if (pm >= nowMin && (!best || pm < this._hmToMinutes(best.time))) {
					best = { name, time: t, inMinutes: pm - nowMin };
				}
			}

			return best ?? { name: "—", time: "--:--", inMinutes: "--" };
		} catch (err) {
			return { name: "—", time: "--:--", inMinutes: "--" };
		}
	}

	/** Format the Hijri date string based on user format preference. */
  _formatHijri() {
    if (!this.hijri) return null;
    const year     = this.hijri.year;
    const monthNum = this.hijri.month?.number ?? this.hijri.month ?? null;
    const isAr = this.settings.language === "ar";
    const monthName = isAr 
        ? (this.hijri.month?.ar ?? this.hijri.month?.en ?? "")
        : (this.hijri.month?.en ?? this.hijri.month?.ar ?? "");
    const day      = Number(this.hijri.day);
    if (!year || !monthNum || !day) return null;

    if (this.settings.hijriDateFormat === "iso") {
        return `${year}-${String(monthNum).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    }
    return `${day} ${monthName} ${year}`;
  }

	/** Format the countdown until the next prayer as "Xh Ym" or "Ym". */
	_formatCountdown(next) {
		if (!next?.time || next.inMinutes === "--") return "--";
		const [h, m] = (next.time || "--:--").split(":").map(Number);
		if (!Number.isFinite(h) || !Number.isFinite(m)) return "--";

		const now    = new Date();
		const target = new Date(now.getFullYear(), now.getMonth(), now.getDate(), h, m, 0, 0);
		const totalMinutes = Math.max(0, Math.floor((target - now) / 60000));
		const hours        = Math.floor(totalMinutes / 60);
		const minutes      = totalMinutes % 60;
		return hours > 0 ? `${hours}h ${String(minutes).padStart(2, "0")}m` : `${minutes}m`;
	}

	/** Compute a reference time (midnight / lastThird / sunrise) as "HH:MM". */
	_computeReferenceTimeText(refLabel) {
		const times = this.prayerTimes || {};
		try {
			if (refLabel === "sunrise") return times.Sunrise || null;

			const mag = times.Maghrib;
			const faj = times.Fajr;
			if (!mag || !faj) return null;

			let magMin = this._hmToMinutes(mag);
			let fajMin = this._hmToMinutes(faj);
			if (fajMin <= magMin) fajMin += 24 * 60; // next-day wrap

			const nightDur = fajMin - magMin;

			if (refLabel === "midnight") {
				return this._minutesToHM(Math.floor(magMin + nightDur / 2) % (24 * 60));
			}
			if (refLabel === "lastThird") {
				return this._minutesToHM(Math.floor(fajMin - nightDur / 3) % (24 * 60));
			}
			return null;
		} catch (e) { return null; }
	}

	/**
	 * Feature 8: Compute the appropriate reference label for the current time.
	 *  - Morning  (Fajr → Dhuhr):   "sunrise"
	 *  - Evening  (Maghrib → ~00:30): "midnight"
	 *  - Nighttime (~00:30 → Fajr):  "lastThird"
	 * Falls back to stored setting when prayer times are unavailable.
	 */
	_getDynamicReference() {
		const times = this.prayerTimes || {};
		const fajr    = this._hmToMinutes(times.Fajr);
		const dhuhr   = this._hmToMinutes(times.Dhuhr);
		const maghrib = this._hmToMinutes(times.Maghrib);

		const now    = new Date();
		const nowMin = now.getHours() * 60 + now.getMinutes();

		// Need at least Fajr + Maghrib to decide
		if (fajr == null || maghrib == null) return this.settings.displayReference || "lastThird";

		// Compute midnight (midpoint of Maghrib→Fajr-next-day)
		let fajrNext = fajr;
		if (fajrNext <= maghrib) fajrNext += 24 * 60;
		const midnightMin = Math.floor(maghrib + (fajrNext - maghrib) / 2) % (24 * 60);
		// "Just past midnight" = midnight + 30 min
		const afterMidnight = (midnightMin + 30) % (24 * 60);

		// Morning: Fajr → Dhuhr
		const dhurMin = dhuhr ?? (12 * 60);
		if (nowMin >= fajr && nowMin < dhurMin) return "sunrise";

		// Evening: Maghrib → afterMidnight (wraps past 00:00)
		// We check two segments: Maghrib→midnight, or 00:00→afterMidnight
		const eveningStart = maghrib;
		const eveningEnd   = afterMidnight; // e.g. 00:30
		if (eveningEnd < eveningStart) {
			// Normal case: maghrib is evening, after midnight is early AM
			if (nowMin >= eveningStart || nowMin < eveningEnd) return "midnight";
		} else {
			if (nowMin >= eveningStart && nowMin < eveningEnd) return "midnight";
		}

		// Nighttime: afterMidnight → Fajr
		return "lastThird";
	}

	/**
	 * Feature 8: Apply dynamic reference if enabled, without saving (avoids write on every tick).
	 * Called each time the panel renders.
	 */
	_applyDynamicReferenceIfEnabled() {
		if (!this.settings.dynamicReference) return;
		// Don't override if a manual reset timer is still pending
		if (this._dynamicRefResetTimer != null) return;
		const dynamic = this._getDynamicReference();
		if (this.settings.displayReference !== dynamic) {
			this.settings.displayReference = dynamic;
			// No saveSettings here — this is a transient in-memory update.
			// The next manual change will save again.
		}
	}

	/** System notification helper; silently degrades if permission denied. */
	_maybeShowSystemNotification(title, body) {
		if (!("Notification" in window)) return;
		if (Notification.permission === "granted") {
			new Notification(title, { body });
		} else if (Notification.permission !== "denied") {
			Notification.requestPermission().then(p => {
				if (p === "granted") new Notification(title, { body });
			});
		}
	}

	/* ---- Hijri offset ------------------------------------- */

	/** Apply the user's Hijri day offset to a raw Hijri date object (deep clone). */
	_applyHijriOffset(hijriData) {
		if (!hijriData) return null;
		if (!this.settings.hijriOffsetEnabled || this.settings.hijriOffset === 0) return hijriData;

		const adjusted = JSON.parse(JSON.stringify(hijriData));
		let day   = parseInt(adjusted.day) + this.settings.hijriOffset;
		let month = parseInt(adjusted.month?.number ?? adjusted.month);
		let year  = parseInt(adjusted.year);

		if (day > 30) {
			day -= 30;
			month++;
			if (month > 12) { month = 1; year++; }
		} else if (day < 1) {
			month--;
			if (month < 1) { month = 12; year--; }
			day = 30 + day;
		}

		adjusted.day  = String(day);
		if (adjusted.month && typeof adjusted.month === "object") {
			adjusted.month.number = month;
		}
		adjusted.year = String(year);
		return adjusted;
	}

	/* ---- Settings persistence ----------------------------- */

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());

		// Backward-compatibility guards for fields added after initial release
		if (this.settings.enableIqamaFeature === undefined) this.settings.enableIqamaFeature = false;

		this.settings.iqamaEnabled = Object.assign(
			{ Fajr: false, Dhuhr: false, Asr: false, Maghrib: false, Isha: false },
			this.settings.iqamaEnabled || {}
		);

		// Normalise cached structure — migrate old prayerTimes/hijri schema
		if (!this.settings.cached) {
			this.settings.cached = { monthTimes: [], fetchedAtISO: null };
		} else if (!Array.isArray(this.settings.cached.monthTimes)) {
			this.settings.cached.monthTimes = [];
		}

		// Seed runtime fields from cache immediately (avoids flicker on startup)
		const monthTimes = this.settings.cached.monthTimes;
		if (monthTimes.length > 0) {
			const todayData = monthTimes[new Date().getDate() - 1];
			if (todayData?.timings) {
				// applyOffsets = false on initial load; the 2s deferred fetch will apply them
				this._processDayData(todayData, false);
				this.fetchedAt = this.settings.cached.fetchedAtISO
					? new Date(this.settings.cached.fetchedAtISO)
					: null;
			}
		}
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}

	/* ---- CSS injection ------------------------------------- */

	injectCSS() {
		if (document.getElementById("prayer-panel-css")) return;
		const style       = document.createElement("style");
		style.id          = "prayer-panel-css";
		style.textContent = PRAYER_PANEL_CSS;
		document.head.appendChild(style);
	}

	/* ---- Nested settings helpers -------------------------- */

	/**
	 * Read a dot-path key from settings (e.g. "supplications.morning.audioPath").
	 * Needed because createAudioSetting receives a dot-path string.
	 * FIX: original code used dot-path as a flat key — always returned undefined.
	 */
	_getNestedSetting(dotPath) {
		return dotPath.split(".").reduce((obj, k) => obj?.[k], this.settings) ?? "";
	}

	_setNestedSetting(dotPath, value) {
		const parts = dotPath.split(".");
		let ref     = this.settings;
		for (let i = 0; i < parts.length - 1; i++) ref = ref[parts[i]];
		ref[parts[parts.length - 1]] = value;
	}

	/* ---- Daily Islamic note -------------------------------- */

	async createOrOpenHijriDailyNote() {
		try {
			if (!this.settings?.enableDailyNotes) {
				new Notice("Daily notes export is disabled in settings.");
				return;
			}

			// FIX: always use the real current time here, not the last-fetch
			// timestamp — otherwise the note stays pinned to whatever day the
			// data was last fetched on.
			const now              = new Date();
			const tomorrow         = new Date(now);
			tomorrow.setDate(now.getDate() + 1);

			const todayISO      = localISODate(now); // FIX: use local date, not UTC
			const todayWeekday  = WEEKDAY_KEYS[now.getDay()];
			const tomorrowWD    = WEEKDAY_KEYS[tomorrow.getDay()];

			const hijriText  = this._formatHijri() || "";
			const hijriDay   = this._extractHijriDay(this.hijri);
			const tomorrowHD = Number.isFinite(hijriDay) ? ((hijriDay % 30) + 1) : null;
			const hijriMonth = this.hijri?.month?.en ?? (this.hijri?.month ?? "");

			// Fasting
			const hijriFastingDays  = this._parseHijriDayList(this.settings.fastingHijriDays || "");
			const weekdayFasting    = this.settings.fastingWeekdays || {};
			const todayIsFasting    = hijriFastingDays.includes(hijriDay)   || !!weekdayFasting[todayWeekday];
			const tomorrowIsFasting = hijriFastingDays.includes(tomorrowHD) || !!weekdayFasting[tomorrowWD];

			const todayHoly    = this._detectHolyDays(hijriDay,   hijriMonth);
			const tomorrowHoly = this._detectHolyDays(tomorrowHD, hijriMonth);

			// Note title
			const fmt   = this.settings.dailyNotesDateFormat || "both";
			const title = fmt === "gregorian"  ? todayISO
				: fmt === "hijri" ? (hijriText || todayISO)
				: `${todayISO} — ${hijriText}`;

			const folder = this.settings.dailyNotesFolder || "Daily";
			await this.app.vault.createFolder(folder).catch(() => {}); // ignore if exists

			const safeTitle = title.replace(/[\/\\:?<>|*"']/g, "").trim();
			const path      = `${folder}/${safeTitle}.md`;

			// Build content sections
			const prayerTimesContent    = this._buildPrayerTimesSection();
			const prayerTimesTable      = this._generatePrayerTimesTable();
			const checklistContent      = this._buildChecklistSection();
			const specialDaysContent    = this._buildSpecialDaysSection(todayHoly, tomorrowHoly, todayIsFasting, tomorrowIsFasting);
			const fastingAnalysisContent = this._generateFastingAnalysis(todayIsFasting, tomorrowIsFasting, todayHoly, tomorrowHoly);

			// Load template
			const templateContent = await this._loadNoteTemplate();

			const dynamicVariables = {
				"{{DATE}}": todayISO, "{{date}}": todayISO,
				"{{HIJRI_DATE}}": hijriText, "{{hijri_date}}": hijriText,
				"{{HIJRI_DAY}}": hijriDay ? String(hijriDay) : "", "{{hijri_day}}": hijriDay ? String(hijriDay) : "",
				"{{HIJRI_MONTH}}": hijriMonth, "{{hijri_month}}": hijriMonth,
				"{{HIJRI_YEAR}}": this.hijri?.year ? String(this.hijri.year) : "", "{{hijri_year}}": this.hijri?.year ? String(this.hijri.year) : "",
				"{{GREGORIAN_DATE}}": todayISO, "{{gregorian_date}}": todayISO,
				"{{PRAYER_TIMES_TABLE}}": prayerTimesTable,
				"{{PRAYER_TIMES}}": prayerTimesContent,
				"{{CHECKLIST}}": checklistContent,
				"{{SPECIAL_DAYS}}": specialDaysContent,
				"{{FASTING_ANALYSIS}}": fastingAnalysisContent,
				"{{WEEKDAY}}": todayWeekday, "{{weekday}}": todayWeekday,
				"{{DAY_NAME}}": this.t(todayWeekday), "{{day_name}}": this.t(todayWeekday),
			};

			let content = templateContent;
			for (const [variable, value] of Object.entries(dynamicVariables)) {
				content = content.split(variable).join(value);
			}

			// Create file if it doesn't exist
			let file = this.app.vault.getAbstractFileByPath(path);
			if (!(file instanceof TFile)) {
				await this.app.vault.create(path, `${content}\n`);
				file = this.app.vault.getAbstractFileByPath(path);
				new Notice("New daily note created successfully.");
			}

			// Open (or focus) the file
			if (file) {
				const existing = this.app.workspace.getLeavesOfType("markdown")
					.find(l => l.view?.file?.path === file.path);

				if (existing) {
					this.app.workspace.setActiveLeaf(existing, { focus: true });
				} else {
					const newLeaf = this.app.workspace.getLeaf("tab");
					await newLeaf.openFile(file);
				}
			}
		} catch (err) {
			console.error("Daily note creation failed:", err);
			new Notice("Failed to create or open daily note.");
		}
	}

	/** Extract the numeric Hijri day from the hijri object. */
	_extractHijriDay(hijri) {
		if (!hijri) return null;
		const raw = hijri.day ?? (hijri.date?.split("-")[0]);
		const n   = Number(raw);
		return Number.isFinite(n) ? n : null;
	}

	_buildPrayerTimesSection() {
		const lines = [`## ${this.t("note_prayer_times")}`];
		for (const p of PRAYER_NAMES) {
			if (this.prayerTimes?.[p]) {
				lines.push(`- [ ] ${this.tPrayer(p)} — ${this._formatTime(this.prayerTimes[p])}`);
			}
		}
		return lines.join("\n");
	}

	_buildChecklistSection() {
		return [
			`## ${this.t("note_checklist")}`,
			`- [ ] ${this.t("note_morning")}`,
			`- [ ] ${this.t("note_evening")}`,
			`- [ ] ${this.t("note_bedtime")}`,
		].join("\n");
	}

	_buildSpecialDaysSection(todayHoly, tomorrowHoly, todayIsFasting, tomorrowIsFasting) {
		if (!todayHoly.length && !tomorrowHoly.length && !todayIsFasting && !tomorrowIsFasting) return "";
		const lines = [`## ${this.t("note_special_days")}`];
		if (todayHoly.length)    lines.push(`- <b>${this.t("note_today_holy")}:</b> ${todayHoly.join(", ")}`);
		if (tomorrowHoly.length) lines.push(`- <b>${this.t("note_tomorrow_holy")}:</b> ${tomorrowHoly.join(", ")}`);
		if (todayIsFasting)      lines.push(`- <b>${this.t("note_today_fasting")}</b>`);
		if (tomorrowIsFasting)   lines.push(`- <b>${this.t("note_tomorrow_fasting")}</b>`);
		return lines.join("\n");
	}

	/** Load the user's template text or file for the current language. */
	async _loadNoteTemplate() {
		const isAr = this.settings.language === "ar";
		const mode = isAr ? this.settings.arabicNoteTemplateMode  : this.settings.englishNoteTemplateMode;
		const path = isAr ? this.settings.arabicNoteTemplatePath  : this.settings.englishNoteTemplatePath;
		const text = isAr ? this.settings.arabicNoteTemplate      : this.settings.englishNoteTemplate;
		const dflt = isAr
			? "\n{{PRAYER_TIMES}}\n\n\n{{CHECKLIST}}\n\n \n{{SPECIAL_DAYS}}"
			: "{{PRAYER_TIMES}}\n\n#{{CHECKLIST}}\n\n{{SPECIAL_DAYS}}";

		if (mode === "file" && path) {
			const templateFile = this.app.vault.getAbstractFileByPath(path);
			if (templateFile instanceof TFile) {
				const content = await this.app.vault.read(templateFile);
				if (content.trim()) return content;
			}
		}

		return (text || "").trim() ? text : dflt;
	}

	_generatePrayerTimesTable() {
		const isAr  = this.settings.language === "ar";
		let table   = isAr
			? "| الصلاة | الوقت |\n|--------|--------|\n"
			: "| Prayer | Time |\n|--------|------|\n";

		for (const p of PRAYER_NAMES) {
			if (this.prayerTimes[p]) {
				table += `| ${this.tPrayer(p)} | ${this._formatTime(this.prayerTimes[p])} |\n`;
			}
		}
		return table;
	}

	/**
	 * Generate a Markdown fasting/holy-day analysis block.
	 * FIX: original used raw Arabic/English strings; now uses this.t() for correct locale.
	 */
	_generateFastingAnalysis(todayIsFasting, tomorrowIsFasting, todayHoly, tomorrowHoly) {
		let analysis = "";
		const today    = this.t("fastingAnalysisToday");
		const tomorrow = this.t("fastingAnalysisTomorrow");

		if (todayHoly.length > 0 || tomorrowHoly.length > 0) {
			analysis += `## ${this.t("fastingAnalysisHolyDays")}\n`;
			if (todayHoly.length)    analysis += `- ${today}: ${todayHoly.join(", ")}\n`;
			if (tomorrowHoly.length) analysis += `- ${tomorrow}: ${tomorrowHoly.join(", ")}\n`;
		}

		if (todayIsFasting || tomorrowIsFasting) {
			if (analysis) analysis += "\n";
			analysis += `## ${this.t("fastingAnalysisFasting")}\n`;
			if (todayIsFasting)    analysis += `- ${this.t("note_today_fasting")}\n`;
			if (tomorrowIsFasting) analysis += `- ${this.t("note_tomorrow_fasting")}\n`;
		}

		return analysis;
	}

	/* ---- Internal-link click helper ----------------------- */

	/**
	 * After MarkdownRenderer.renderMarkdown() runs, any [[wiki-links]] it produces
	 * are plain <a class="internal-link"> elements.  If left unhandled inside a Modal
	 * or sidebar view, clicking them passes the raw obsidian:// href to the OS, which
	 * forces a full app restart instead of opening the note in-app.
	 *
	 * This helper intercepts those clicks and routes them through
	 * app.workspace.openLinkText(), which is the correct Obsidian API for navigating
	 * to an internal link without reloading the app.
	 *
	 * Call this once after every renderMarkdown() call, passing the container element
	 * and the source file path (used to resolve relative links).
	 */
	_interceptInternalLinks(containerEl, sourcePath) {
		containerEl.querySelectorAll("a.internal-link").forEach(anchor => {
			anchor.addEventListener("click", (e) => {
				e.preventDefault();
				e.stopPropagation();
				const linkText = anchor.getAttribute("data-href") || anchor.getAttribute("href") || anchor.textContent;
				if (linkText) {
					this.app.workspace.openLinkText(linkText, sourcePath, false);
				}
			});
		});
	}

	/* ---- Reminder system ---------------------------------- */

	async scanVaultForReminders() {
		this.reminders.clear();
		for (const file of this.app.vault.getMarkdownFiles()) {
			await this.scanFileForReminders(file);
		}
	}

	async scanFileForReminders(file) {
		if (!(file instanceof TFile)) return;
		try {
			const content       = await this.app.vault.read(file);
			const lines         = content.split(/\r?\n/);
			const fileReminders = [];

			/**
			 * Feature 5 — custom sound syntax:
			 *   (@2026-05-15 08:00 sound:Media/Sounds/reminder.mp3)
			 *   (@2026-05-15 before-maghrib 20m sound:Media/Sounds/reminder.mp3)
			 *
			 * Feature 8 — optional "spend time" / expiry syntax:
			 *   (@2026-05-15 08:00 end:08:30)                        fixed end time
			 *   (@2026-05-15 08:00 end:maghrib)                      ends exactly at a prayer/reference time
			 *   (@2026-05-15 08:00 end:before-maghrib-20m)           ends N minutes before a prayer/reference time
			 *   (@2026-05-15 before-maghrib 20m end:after-isha-10m sound:Media/Sounds/reminder.mp3)
			 *
			 * end: is normally written before sound: with no space after the colon, but
			 * see the IMPORTANT note below — malformed modifiers degrade gracefully now
			 * rather than breaking anything.
			 *
			 * IMPORTANT — parsing strategy: regex1/regex2 below ONLY capture the core
			 * "(@date time)" / "(@date dir-ref Nm)" portion, plus everything else up to
			 * the closing ")" as one raw trailing string. That raw string is then handed
			 * to _parseTrailingModifiers(), which extracts end:/sound: leniently (stray
			 * whitespace after the colon, or inside a relative end spec like
			 * "after-sunrise 01m", is tolerated and normalized). This is deliberate: if
			 * a modifier is malformed beyond what we tolerate, _parseTrailingModifiers
			 * simply returns null for that piece instead of failing to match — the core
			 * reminder (its date/time) always still fires. Previously, one broken
			 * end:/sound: token could silently prevent the ENTIRE reminder tag from
			 * matching at all, with no error shown. See _parseEndSpec / _resolveEndTime
			 * / _isReminderExpired for how the (now-normalized) end spec is resolved.
			 */
			// Format 1: (@YYYY-MM-DD HH:mm <rest up to closing paren, capped>)
			// Format 2: (@YYYY-MM-DD before/after-prayer Xm <rest up to closing paren, capped>)
			// NOTE: the trailing-modifier group is bounded to {0,200} chars (real end:/sound:
			// values are always short) instead of an unbounded "*". This guarantees the regex
			// engine never has to scan/backtrack across an entire huge line (e.g. a base64
			// image embed or a giant one-line table) looking for a closing ")" that isn't
			// there — a defensive cap, regardless of whether that was the actual cause of
			// any slowdown/freeze.
			const regex1 = /\(@(\d{4}-\d{2}-\d{2})\s+(\d{1,2}:\d{2})((?:(?!\)).){0,200})\)/g;
			const regex2 = /\(@(\d{4}-\d{2}-\d{2})\s+(before|after)-([a-zA-Z-]+)\s+(\d+)m((?:(?!\)).){0,200})\)/g;

			lines.forEach((lineText, lineIndex) => {
				// Fast path: skip regex entirely for the vast majority of lines that
				// don't even contain a reminder tag opener. Cheap substring check,
				// avoids invoking the regex engine on long unrelated lines at all.
				if (!lineText.includes("(@")) return;

				try {
					const isCompleted = /^\s*-\s*\[x\]/i.test(lineText);
					let match;

					// Reset lastIndex before each line (regex is stateful with /g)
					regex1.lastIndex = 0;
					while ((match = regex1.exec(lineText)) !== null) {
						const { endTime, customAudioPath } = this._parseTrailingModifiers(match[3]);
						fileReminders.push({
							file: file.path, line: lineIndex, text: lineText,
							date: match[1], time: match[2],
							endTime, // Feature 8
							customAudioPath, // Feature 5
							type: "fixed", originalLine: lineText, completed: isCompleted,
						});
					}

					regex2.lastIndex = 0;
					while ((match = regex2.exec(lineText)) !== null) {
						const { endTime, customAudioPath } = this._parseTrailingModifiers(match[5]);
						fileReminders.push({
							file: file.path, line: lineIndex, text: lineText,
							date: match[1], direction: match[2], ref: match[3], offset: match[4],
							endTime, // Feature 8
							customAudioPath, // Feature 5
							type: "relative", originalLine: lineText, completed: isCompleted,
						});
					}
				} catch (lineErr) {
					// A single malformed line must never take down the whole scan.
					console.error(`Prayer Times & Athan: failed to parse reminder tag on ${file.path}:${lineIndex + 1}`, lineErr);
				}
			});

			if (fileReminders.length > 0) {
				this.reminders.set(file.path, fileReminders);
			} else {
				this.reminders.delete(file.path);
			}
		} catch (e) {
			console.error("Error scanning file for reminders:", e);
		}
	}

	_generateReminderKey(reminder) {
		return `${reminder.date}:${reminder.file}:${reminder.line}:${reminder.text}`;
	}

	/**
	 * Wrap a raw reminder object into the display shape used by the dashboard
	 * modal ({time, text, file, line, customAudioPath, reminder, hasTriggered}).
	 * Used so _dashboardPending (raw reminders) can be rendered the same way
	 * getUpcomingRemindersForToday()'s wrapped items are.
	 */
	_wrapReminderForDisplay(reminder) {
		return {
			time:            this._resolveDueTime(reminder),
			text:            this._stripReminderTag(reminder),
			file:            reminder.file,
			line:            reminder.line,
			customAudioPath: reminder.customAudioPath || null,
			reminder:        reminder,
			hasTriggered:    this.lastTriggered.vaultReminder.has(this._generateReminderKey(reminder)), // FIX Bug1
		};
	}

	/**
	 * Called every minute.
	 * - Sequential mode: trigger each reminder at its own due time (original behaviour).
	 * - Dashboard mode:  silently collect due reminders into _dashboardPending;
	 *   the dashboard is opened by _checkDashboardTime() at the user-chosen time.
	 */
	checkReminders() {
		const now      = new Date();
		const todayISO = localISODate(now); // FIX: local date, not UTC
		const mode     = this.settings.reminderMode || "sequential";

		this.reminders.forEach((list) => {
			list.forEach(reminder => {
				if (reminder.completed || reminder.date !== todayISO) return;
				if (this._isReminderExpired(reminder, now)) return; // Feature 8: muted past end:

				const dueTime = this._resolveDueTime(reminder);
				if (!dueTime) return;

				// FIX (bug: dashboard permanently shows "No pending reminders"
				// despite real overdue reminders): this used to require `now`
				// to land inside a single 60-second window right at dueTime.
				// But checkReminders() itself only runs once every 60s via
				// setInterval, and JS timers aren't guaranteed to fire exactly
				// on schedule (app backgrounded/minimized, computer sleep,
				// system under load, etc.). Any missed tick meant that window
				// closed forever — the reminder would never be collected into
				// _dashboardPending and would never appear, even though it
				// was genuinely still due/overdue and never marked done.
				// A reminder should count as "due" from the moment `now`
				// reaches its due time and stay due — and keep being
				// collected/shown — until it's completed, postponed, or
				// expires via its own end: cutoff (already filtered above).
				const isDue = now >= dueTime;
				if (!isDue) return;

				const key = this._generateReminderKey(reminder);

				if (mode === "dashboard") {
					// Collect into pending — do NOT fire individual notifications
					const alreadyCollected = this._dashboardPending.some(r => this._generateReminderKey(r) === key);
					if (!alreadyCollected && !reminder.completed) {
						this._dashboardPending.push(reminder);
					}
				} else {
					// Sequential — original behaviour
					// FIX Bug1: use Set.has() so every reminder shown this session is remembered, not just the last one
					if (!this.lastTriggered.vaultReminder.has(key)) {
						this.triggerReminderNotification(reminder);
					}
				}
			});
		});
	}

	/**
	 * Feature 4 — Check whether the dashboard summary time has been reached.
	 * Opens the ReminderDashboardModal once per day at settings.dashboardTime.
	 */
	_checkDashboardTime() {
		if ((this.settings.reminderMode || "sequential") !== "dashboard") return;

		const dashTime = this.settings.dashboardTime || "08:00";
		const now      = new Date();
		const nowHHMM  = `${String(now.getHours()).padStart(2,"0")}:${String(now.getMinutes()).padStart(2,"0")}`;

		if (nowHHMM !== dashTime) return;

		// Deduplicate: only open once per calendar day
		const todayISO = localISODate(now); // FIX: local date, not UTC
		if (this.lastTriggered.dashboard === todayISO) return;
		this.lastTriggered.dashboard = todayISO;

		this.openReminderDashboard();
	}

	/** Open the Reminder Dashboard modal (callable from command palette or auto-trigger). */
	openReminderDashboard() {
		new ReminderDashboardModal(this.app, this).open();
	}

	/** Return upcoming/pending reminders for today sorted by due time. */
	getUpcomingRemindersForToday() {
		const now      = new Date();
		const todayISO = localISODate(now); // FIX: local date, not UTC
		const upcoming = [];

		this.reminders.forEach((list) => {
			list.forEach(reminder => {
				if (reminder.completed || reminder.date !== todayISO) return;
				if (this._isReminderExpired(reminder, now)) return; // Feature 8: don't appear once past end:
				const dueTime = this._resolveDueTime(reminder);
				if (!dueTime) return;

				// Skip reminders dismissed for this session
				const key = this._generateReminderKey(reminder);
				if (this.dismissedReminders?.has(key)) return;

				upcoming.push({
					time:            dueTime,
					text:            this._stripReminderTag(reminder),
					file:            reminder.file,
					line:            reminder.line,
					customAudioPath: reminder.customAudioPath || null, // Feature 5
					reminder:        reminder,                          // raw object for actions
					hasTriggered:    this.lastTriggered.vaultReminder.has(this._generateReminderKey(reminder)), // FIX Bug1
				});
			});
		});

		return upcoming.sort((a, b) => a.time - b.time);
	}

	/** Calculate the due Date for a reminder (fixed or relative). Returns null if unresolvable. */
	_resolveDueTime(reminder) {
		if (reminder.type === "fixed") {
			return this._getDateFromTimeString(reminder.date, reminder.time);
		}

		const refTimeStr = this._getPrayerOrRefTime(reminder.ref);
		if (!refTimeStr) return null;

		const refDate = this._getDateFromTimeString(reminder.date, refTimeStr);
		if (!refDate) return null;

		const offsetMs = parseInt(reminder.offset) * 60000;
		return reminder.direction === "before"
			? new Date(refDate.getTime() - offsetMs)
			: new Date(refDate.getTime() + offsetMs);
	}

	/**
	 * Feature 8 — Leniently pull end:/sound: values out of the raw trailing text
	 * captured after a reminder's core date/time (see regex1/regex2 above). This
	 * never throws and never "fails" the reminder: if a modifier is missing or
	 * garbled, its value just comes back null and the core reminder is unaffected.
	 * Tolerates:
	 *   - a space (or none) right after the colon: "end: after-sunrise-01m"
	 *   - internal spaces in a relative end spec: "end:after-sunrise 01m" or
	 *     "end: after sunrise 01m" (normalized to "after-sunrise-01m")
	 *   - end:/sound: in either order
	 */
	_parseTrailingModifiers(raw) {
		const text = (raw || "").trim();
		if (!text) return { endTime: null, customAudioPath: null };

		const endIdx   = text.search(/\bend:/i);
		const soundIdx = text.search(/\bsound:/i);

		let endRaw = null, soundRaw = null;
		if (endIdx !== -1 && soundIdx !== -1) {
			if (endIdx < soundIdx) {
				endRaw   = text.slice(endIdx, soundIdx);
				soundRaw = text.slice(soundIdx);
			} else {
				soundRaw = text.slice(soundIdx, endIdx);
				endRaw   = text.slice(endIdx);
			}
		} else if (endIdx !== -1) {
			endRaw = text.slice(endIdx);
		} else if (soundIdx !== -1) {
			soundRaw = text.slice(soundIdx);
		}

		let endTime = null;
		if (endRaw) {
			const m = /^end:\s*(.*)$/i.exec(endRaw.trim());
			if (m && m[1]) {
				// Collapse internal whitespace so "after-sunrise 01m" is treated
				// the same as the canonical "after-sunrise-01m" form.
				endTime = m[1].trim().replace(/\s+/g, "-") || null;
			}
		}

		let customAudioPath = null;
		if (soundRaw) {
			const m = /^sound:\s*(.*)$/i.exec(soundRaw.trim());
			if (m && m[1]) customAudioPath = m[1].trim() || null;
		}

		return { endTime, customAudioPath };
	}

	/**
	 * Feature 8 — Parse the raw end:<spec> token into a structured description.
	 * Three accepted shapes:
	 *   "08:30"                -> { type: "fixed", time: "08:30" }
	 *   "maghrib" / "sunset"    -> { type: "relative", direction: "after", ref: "maghrib", offset: 0 }
	 *   "before-maghrib-20m"   -> { type: "relative", direction: "before", ref: "maghrib", offset: 20 }
	 *   "after-isha-10m"       -> { type: "relative", direction: "after", ref: "isha", offset: 10 }
	 * Returns null when the spec doesn't match any of the above.
	 */
	_parseEndSpec(spec) {
		if (!spec) return null;

		if (/^\d{1,2}:\d{2}$/.test(spec)) {
			return { type: "fixed", time: spec };
		}

		const relMatch = /^(before|after)-([a-zA-Z-]+)-(\d+)m$/i.exec(spec);
		if (relMatch) {
			return {
				type: "relative",
				direction: relMatch[1].toLowerCase(),
				ref: relMatch[2],
				offset: parseInt(relMatch[3], 10),
			};
		}

		// Bare reference/prayer name with no offset, e.g. "maghrib" or "last-third"
		if (/^[a-zA-Z-]+$/.test(spec)) {
			return { type: "relative", direction: "after", ref: spec, offset: 0 };
		}

		return null;
	}

	/**
	 * Feature 8 — Calculate the "spend time" cutoff Date for a reminder that carries
	 * an optional end:<spec> tag. Supports a fixed HH:mm time, a bare prayer/reference
	 * name, or a before/after-ref-Nm offset — same reference vocabulary as the
	 * reminder's own relative time (see _getPrayerOrRefTime). Always resolved against
	 * the reminder's own date (same day), regardless of whether the reminder itself
	 * is fixed or relative. Returns null when the reminder has no end: tag, or when
	 * the referenced prayer/reference time isn't available yet.
	 */
	_resolveEndTime(reminder) {
		const spec = this._parseEndSpec(reminder.endTime);
		if (!spec) return null;

		if (spec.type === "fixed") {
			return this._getDateFromTimeString(reminder.date, spec.time);
		}

		const refTimeStr = this._getPrayerOrRefTime(spec.ref);
		if (!refTimeStr) return null;

		const refDate = this._getDateFromTimeString(reminder.date, refTimeStr);
		if (!refDate) return null;

		const offsetMs = spec.offset * 60000;
		return spec.direction === "before"
			? new Date(refDate.getTime() - offsetMs)
			: new Date(refDate.getTime() + offsetMs);
	}

	/**
	 * Feature 8 — True once "now" has passed the reminder's end: cutoff (if any).
	 * Expired reminders are muted: they must not trigger notifications/dashboard
	 * entries and must not appear as upcoming or missed/postponed, even though
	 * they were never marked done.
	 */
	_isReminderExpired(reminder, now = new Date()) {
		const endTime = this._resolveEndTime(reminder);
		return !!endTime && now > endTime;
	}

	/** Strip the reminder tag syntax (including any trailing end:/sound: modifiers) from a line for display. */
	_stripReminderTag(reminder) {
		let text = reminder.text;
		if (reminder.type === "fixed") {
			// Match the whole (@date time <rest up to closing paren, capped>) token
			text = text.replace(/\(@\d{4}-\d{2}-\d{2}\s+\d{1,2}:\d{2}(?:(?!\)).){0,200}\)/, "").trim();
		} else {
			// Match the whole (@date before/after-ref Nm <rest up to closing paren, capped>) token
			text = text.replace(/\(@\d{4}-\d{2}-\d{2}\s+(?:before|after)-[a-zA-Z-]+\s+\d+m(?:(?!\)).){0,200}\)/, "").trim();
		}
		return text.replace(/^-\s*\[.\]\s*/, "").trim();
	}

	_getDateFromTimeString(dateStr, timeStr) {
		if (!timeStr) return null;
		const [y, m, d]  = dateStr.split("-").map(Number);
		const [hr, min]  = timeStr.split(":").map(Number);
		return new Date(y, m - 1, d, hr, min, 0);
	}

	_getPrayerOrRefTime(refKey) {
		const map = {
			fajr: "Fajr", dhuhr: "Dhuhr", asr: "Asr",
			maghrib: "Maghrib", isha: "Isha",
			sunrise: "Sunrise", sunset: "Maghrib",
		};
		const key = refKey.toLowerCase();

		if (map[key] && this.prayerTimes[map[key]]) return this.prayerTimes[map[key]];

		// FIX: original had typo 'last-thutd' — corrected to 'last-third'
		if (key === "midnight")    return this._computeReferenceTimeText("midnight");
		if (key === "last-third")  return this._computeReferenceTimeText("lastThird");

		return null;
	}

	async triggerReminderNotification(reminder) {
		const key = this._generateReminderKey(reminder);
		// FIX Bug1: use Set so ALL shown reminders are tracked per session, not just the last one
		if (this.lastTriggered.vaultReminder.has(key)) return;
		this.lastTriggered.vaultReminder.add(key);

		new ReminderNotificationModal(this.app, reminder, this).open();

		// Feature 5: prefer per-reminder custom audio, fall back to global reminder audio
		const audioPath = reminder.customAudioPath || this.settings.reminderAudioPath || null;
		if (audioPath) await this._playAudioFromVault(audioPath, { volume: 1 });

		if (this.settings.showSystemNotification) {
			this._maybeShowSystemNotification(
				this.t("reminderNotificationTitle"),
				reminder.text.replace(/\(@.*?\)/, "").trim()
			);
		}
	}

	async markReminderDone(reminder) {
		const file = this.app.vault.getAbstractFileByPath(reminder.file);
		if (!(file instanceof TFile)) return;
		const content = await this.app.vault.read(file);
		const lines   = content.split(/\r?\n/);
		if (lines.length <= reminder.line) return;
		if (lines[reminder.line].includes("- [ ]")) {
			lines[reminder.line] = lines[reminder.line].replace("- [ ]", "- [x]");
			await this.app.vault.modify(file, lines.join("\n"));
		}
	}

	/**
	 * Parse settings.postponeDurations ("5, 15, 30, 60") into a de-duplicated
	 * array of positive integer minutes, preserving the user's order.
	 * Falls back to [15] if the setting is empty or contains no valid values.
	 */
	_getPostponeDurations() {
		const raw = this.settings.postponeDurations || "";
		const seen = new Set();
		const values = raw
			.split(",")
			.map(s => parseInt(s.trim(), 10))
			.filter(n => Number.isFinite(n) && n > 0)
			.filter(n => (seen.has(n) ? false : (seen.add(n), true)));
		return values.length > 0 ? values : [15];
	}

	/**
	 * Postpone a reminder by `minutes`.
	 *
	 * FIX (bug: "snooze is visual only, time doesn't update"): this previously
	 * had two bugs that combined to make postponing silently no-op while the
	 * UI still reported success:
	 *
	 *  1. The new time was computed as (reminder's ORIGINAL scheduled time) +
	 *     minutes, instead of (CURRENT time) + minutes. Per spec, snoozing an
	 *     overdue reminder should push it forward from "now", not from
	 *     whenever it was originally due.
	 *  2. The rewrite regex only matched the bare "(@date time)" /
	 *     "(@date dir-ref Nm)" tag with NOTHING else inside the parens. Any
	 *     reminder using the end:/sound: modifiers (Features 5/8) has extra
	 *     text before the closing ")", so `.replace()` found no match and
	 *     returned the line completely unchanged — with no error thrown.
	 *     Callers (dashboard/notification modals) then unconditionally
	 *     removed the item from view, so the postpone *looked* like it
	 *     worked even though the file — and the actual trigger time — never
	 *     changed.
	 *
	 * Returns true on success, false if the tag couldn't be found/updated
	 * (callers should NOT optimistically clear the reminder from any pending
	 * list when this returns false).
	 */
	async postponeReminder(reminder, minutes = 15) {
		const file = this.app.vault.getAbstractFileByPath(reminder.file);
		if (!(file instanceof TFile)) return false;
		const content = await this.app.vault.read(file);
		const lines   = content.split(/\r?\n/);
		if (lines.length <= reminder.line) return false;

		const line = lines[reminder.line];
		const now  = new Date(); // FIX: base the new time on "now", not the old due time
		let updatedLine = null;

		if (reminder.type === "fixed") {
			const newDate    = new Date(now.getTime() + minutes * 60000);
			const newDateStr = localISODate(newDate); // local date, not UTC
			const newTimeStr = `${String(newDate.getHours()).padStart(2, "0")}:${String(newDate.getMinutes()).padStart(2, "0")}`;

			// FIX: capture-and-preserve any trailing end:/sound: modifiers
			// (same {0,200}-bounded group the parser uses in regex1), so the
			// tag is matched — and rewritten — regardless of what follows.
			const tagRegex = new RegExp(
				`\\(@${reminder.date}\\s+${reminder.time}((?:(?!\\)).){0,200})\\)`
			);
			updatedLine = line.replace(tagRegex, (_, trailing) => `(@${newDateStr} ${newTimeStr}${trailing})`);
		} else {
			// Relative reminder ("before/after-ref Nm"): recompute the offset
			// so the reminder's ABSOLUTE due time becomes now + minutes,
			// still anchored to the same reference (e.g. Maghrib).
			const refTimeStr = this._getPrayerOrRefTime(reminder.ref);
			const refDate    = refTimeStr ? this._getDateFromTimeString(reminder.date, refTimeStr) : null;

			if (refDate) {
				const newAbsolute     = new Date(now.getTime() + minutes * 60000);
				const signedOffsetMin = Math.round((newAbsolute.getTime() - refDate.getTime()) / 60000);
				const newDirection    = signedOffsetMin < 0 ? "before" : "after";
				const newOffset       = Math.abs(signedOffsetMin);

				const tagRegex = new RegExp(
					`\\(@${reminder.date}\\s+${reminder.direction}-${reminder.ref}\\s+${reminder.offset}m((?:(?!\\)).){0,200})\\)`
				);
				updatedLine = line.replace(
					tagRegex,
					(_, trailing) => `(@${reminder.date} ${newDirection}-${reminder.ref} ${newOffset}m${trailing})`
				);
			}
		}

		// If the (now more permissive) regex still couldn't find/change the
		// tag, don't silently write the file back unchanged and don't let
		// the caller believe the postpone succeeded.
		if (!updatedLine || updatedLine === line) {
			new Notice(`Couldn't postpone "${this._stripReminderTag(reminder)}" — its reminder tag couldn't be located on line ${reminder.line + 1}.`);
			return false;
		}

		lines[reminder.line] = updatedLine;
		await this.app.vault.modify(file, lines.join("\n"));

		// FIX Bug3: after the file is written, the vault "modify" event fires
		// scanFileForReminders() which rebuilds the reminder object with the new
		// date/time — giving it a NEW key. Because vaultReminder no longer contains
		// the old key either (it was never added; triggerReminderNotification wasn't
		// called for a postponed-then-dismissed reminder), checkReminders() treats the
		// re-scanned reminder as unseen and fires it immediately on the next tick.
		//
		// Fix: suppress the just-postponed reminder by adding its OLD key now (so any
		// stale in-memory reference can't re-trigger), then compute and add the NEW key
		// so the rescheduled reminder stays suppressed until the session ends or midnight
		// resets the Set. The new key is based on the rewritten line text so it matches
		// exactly what scanFileForReminders will produce.
		const oldKey = this._generateReminderKey(reminder);
		this.lastTriggered.vaultReminder.add(oldKey);

		// Derive the new key: same file + line, but the text field in the in-memory
		// reminder object will be the updated line after the next vault scan. We can
		// approximate it from updatedLine directly.
		const newReminderApprox = { ...reminder, text: updatedLine.trim(), date: localISODate(new Date(now.getTime() + minutes * 60000)) };
		const newKey = this._generateReminderKey(newReminderApprox);
		this.lastTriggered.vaultReminder.add(newKey);

		// Also add to dismissedReminders so _getPostponedReminders() won't surface it
		// as "missed" on the NEXT startup before its new due time arrives.
		this.dismissedReminders.add(oldKey);
		this.dismissedReminders.add(newKey);

		return true;
	}

	/**
	 * Builds a split "Postpone" control: a small ">" arrow button on the far
	 * left that opens a dropdown of user-configurable durations (from
	 * settings.postponeDurations), and a main button that shows the
	 * currently-selected duration and applies it on click.
	 *
	 * @param {HTMLElement} container   Parent element to append the control to.
	 * @param {Object}      reminder    The reminder this control acts on.
	 * @param {Function}    onApply     async (minutes) => void — called when the
	 *                                  main button is clicked with the selected duration.
	 * @param {string}      [mainBtnCls] Extra class(es) applied to the main button
	 *                                   (e.g. "dashboard-action-btn" to match sibling buttons).
	 * @returns {HTMLElement} the wrapper element.
	 */
	createPostponeControl(container, reminder, onApply, mainBtnCls = "") {
		const durations = this._getPostponeDurations();
		let selected = durations[0];

		const wrap = container.createDiv({ cls: "postpone-split-btn" });

		const arrowBtn = wrap.createEl("button", {
			cls: "postpone-arrow-btn",
			attr: { type: "button", "aria-label": this.t("postponeDurations") },
		});
		arrowBtn.createSpan({ cls: "postpone-arrow-icon", text: "\u203A" }); // ›

		const label = () => `${this.t("reminderPostpone")} (${selected}${this.t("minutes")})`;
		const mainBtn = wrap.createEl("button", {
			cls: `postpone-main-btn ${mainBtnCls}`.trim(),
			text: label(),
		});

		const dropdown = wrap.createDiv({ cls: "postpone-dropdown" });
		dropdown.style.display = "none";

		let outsideClickHandler = null;
		const closeDropdown = () => {
			dropdown.style.display = "none";
			arrowBtn.removeClass("postpone-arrow-open");
			if (outsideClickHandler) {
				document.removeEventListener("click", outsideClickHandler);
				outsideClickHandler = null;
			}
		};
		const openDropdown = () => {
			dropdown.style.display = "block";
			arrowBtn.addClass("postpone-arrow-open");
			outsideClickHandler = (ev) => {
				if (!wrap.contains(ev.target)) closeDropdown();
			};
			document.addEventListener("click", outsideClickHandler);
		};

		durations.forEach(min => {
			const item = dropdown.createDiv({ cls: "postpone-dropdown-item", text: `${min}${this.t("minutes")}` });
			item.onclick = (ev) => {
				ev.stopPropagation();
				selected = min;
				mainBtn.setText(label());
				closeDropdown();
			};
		});

		arrowBtn.onclick = (ev) => {
			ev.stopPropagation();
			if (dropdown.style.display === "none") openDropdown();
			else closeDropdown();
		};

		mainBtn.onclick = async (ev) => {
			ev.stopPropagation();
			closeDropdown();
			await onApply(selected);
		};

		return wrap;
	}

	/* ---- Feature 7: Postponed / missed reminder recovery ---------- */

	/**
	 * Return all today's reminders whose due time is in the past (missed/postponed)
	 * and that have not been completed, ignored, or dismissed this session.
	 * Sorted oldest-first.
	 */
	_getPostponedReminders() {
		const now      = new Date();
		const todayISO = localISODate(now); // FIX: local date, not UTC
		const missed   = [];

		this.reminders.forEach((list) => {
			list.forEach(reminder => {
				if (reminder.completed || reminder.date !== todayISO) return;
				if (this._isReminderExpired(reminder, now)) return; // Feature 8: expired, not "missed"
				const dueTime = this._resolveDueTime(reminder);
				if (!dueTime) return;
				// Only include reminders whose due time has already passed
				if (dueTime >= now) return;
				const key = this._generateReminderKey(reminder);
				if (this.ignoredReminders.has(key))   return;
				if (this.dismissedReminders?.has(key)) return;
				missed.push(reminder);
			});
		});

		return missed.sort((a, b) => {
			const ta = this._resolveDueTime(a);
			const tb = this._resolveDueTime(b);
			return (ta || 0) - (tb || 0);
		});
	}

	/**
	 * Called once after vault scan on startup.
	 * Detects past-due reminders and handles them per the user's settings:
	 *
	 *   postponedReminderBehavior:
	 *     "delay6s"           — show after a 6-second delay on app open
	 *     "waitForDashboardTime" — hold until current time ≥ dashboardTime (works
	 *                             even when reminderMode is "sequential"; this is
	 *                             the special-case described in the feature spec)
	 *
	 *   multiplePostponedDisplay (when >1 missed reminder):
	 *     "dashboard"   — open the ReminderDashboardModal with all of them
	 *     "sequential"  — show the first immediately then chain each subsequent
	 *                     one with a 6-second gap after the previous modal opens
	 */
	async _handlePostponedRemindersOnStartup() {
		if (!this.settings.enableReminders) return;

		const missed   = this._getPostponedReminders();
		if (missed.length === 0) return;

		const behavior = this.settings.postponedReminderBehavior || "delay6s";
		const display  = this.settings.multiplePostponedDisplay  || "sequential";

		const showReminders = () => {
			if (missed.length > 1 && display === "dashboard") {
				// Show all inside the dashboard modal
				const firstReminder = missed[0];
				if (firstReminder) {
        const key = this._generateReminderKey(firstReminder);
        const alreadyIn = this._dashboardPending.some(p => this._generateReminderKey(p) === key);
        if (!alreadyIn) this._dashboardPending.push(firstReminder);
        }
				for (const r of missed) {
					const key = this._generateReminderKey(r);
					const alreadyIn = this._dashboardPending.some(p => this._generateReminderKey(p) === key);
					if (!alreadyIn) this._dashboardPending.push(r);
				}
				this.openReminderDashboard();
			} else {
				// Sequential: show modals one after another with a 6-second gap
				let delay = 0;
				for (const reminder of missed) {
					setTimeout(() => {
						this.triggerReminderNotification(reminder);
					}, delay);
					delay += 6000;
				}
			}
		};

		if (missed.length === 1 && behavior === "delay6s") {
			setTimeout(showReminders, 6000);
		} else if (missed.length === 1 && behavior === "waitForDashboardTime") {
			const dashHHMM = this.settings.dashboardTime || "08:00";
			const [dh, dm] = dashHHMM.split(":").map(Number);

			const tryShow = () => {
				const now = new Date();
				const nowTotal  = now.getHours() * 60 + now.getMinutes();
				const dashTotal = dh * 60 + dm;
				if (nowTotal >= dashTotal) {
					showReminders();
				} else {
					setTimeout(tryShow, 30_000);
				}
			};
			tryShow();
		}
		else {showReminders();}
	}
};

/* ============================================================
   SECTION 3 — PANEL VIEW
   ============================================================ */

class PrayerPanelView extends ItemView {
	constructor(leaf, plugin) {
		super(leaf);
		this.plugin = plugin;
		// Feature: dedicated, short-lived Component that owns whatever
		// MarkdownRenderer.renderMarkdown() attaches (wiki-link/hover-preview
		// listeners, embeds, etc.) during a render() pass. render() runs on a
		// 5-second timer (see refreshPrayerPanel), and el.empty() only clears
		// DOM nodes — it does NOT unload those attached listeners. Reusing
		// `this` (the view) as the owning component across every 5-second
		// refresh leaked one registration per reminder, per tick, forever —
		// this was the cause of the progressive freeze. Unloading and
		// recreating this component on every render() call fixes that.
		this._mdComponent = new Component();
		this._mdComponent.load();
	}

	getIcon()        { return "clock"; }
	getViewType()    { return VIEW_TYPE_PRAYER; }
	getDisplayText() { return "prayer times"; }

	async onOpen() { this.render(); }

	async onClose() {
		this._mdComponent?.unload();
		this.containerEl.empty();
	}

	/** Build the available reference cycle based on current settings. */
	_buildRefOptions() {
		const opts = ["sunrise", "midnight", "lastThird"];
		if (this.plugin.settings.enableReminders && this.plugin.settings.showRemindersInPanel !== false) opts.push("reminders");
		return opts;
	}

	render() {
		// Fresh Component for this render pass — see constructor comment.
		this._mdComponent?.unload();
		this._mdComponent = new Component();
		this._mdComponent.load();

		this.containerEl.empty();
		this.containerEl.addClass("prayer-panel-container");
		this.containerEl.toggleClass("prayer-rtl", this.plugin.settings.language === "ar");

		// Feature 8: update reference from time-of-day if dynamic mode is on
		this.plugin._applyDynamicReferenceIfEnabled();

		this._renderHeader();

		let currentRef = this.plugin.settings.displayReference || "midnight";
		// If "reminders" is selected but the panel option is disabled, fall back to first ref
		if (currentRef === "reminders" && this.plugin.settings.showRemindersInPanel === false) {
			currentRef = "sunrise";
		}
		if (currentRef === "reminders" && this.plugin.settings.enableReminders) {
			this._renderReminderList(this.containerEl);
		} else {
			this._renderPrayerList(this.containerEl, currentRef);
		}

		this._renderFooter();
	}

	_renderHeader() {
    const header = this.containerEl.createDiv("prayer-panel-header");

    // ── Title with line through it ──────────────────────────────
    const titleWrapper = header.createDiv({ cls: "prayer-panel-title" });
    const titleSpan = titleWrapper.createEl("span", { text: this.plugin.t("appName") });

    // ── Row for Hijri + Reference button ────────────────────────
    const row = header.createDiv("prayer-panel-header-row");

    // Reference button
    if (!this.plugin.settings.hideReferenceBtn) {
    const refOpts = this._buildRefOptions();
    let currentRef = this.plugin.settings.displayReference || "midnight";
    if (currentRef === "reminders" && this.plugin.settings.showRemindersInPanel === false) {
        currentRef = refOpts[0] || "sunrise";
    }
    const tRef = (k) => this.plugin.t(`ref_${k}`) || k;
    const btnContainer = row.createDiv("prayer-panel-ref-btn-container");
    const btn = btnContainer.createEl("button", {
        cls: "prayer-ref-toggle-btn",
        text: tRef(currentRef),
    });
    btn.addEventListener("click", async () => {
        const opts = this._buildRefOptions();
        const idx = opts.indexOf(this.plugin.settings.displayReference || "midnight");
        const safeIdx = idx === -1 ? 0 : idx;
        const next = opts[(safeIdx + 1) % opts.length];

        this.plugin.settings.displayReference = next;
        await this.plugin.saveSettings();

        if (this.plugin.settings.dynamicReference) {
            if (this.plugin._dynamicRefResetTimer != null) {
                clearTimeout(this.plugin._dynamicRefResetTimer);
            }
            this.plugin._dynamicRefResetTimer = setTimeout(async () => {
                this.plugin._dynamicRefResetTimer = null;
                const dynamic = this.plugin._getDynamicReference();
                this.plugin.settings.displayReference = dynamic;
                await this.plugin.saveSettings();
                this.plugin.updateStatusBar();
                this.plugin.refreshPrayerPanel();
            }, 60_000);
        }

        this.plugin.updateStatusBar();
        this.plugin.refreshPrayerPanel();
    });
    }
    // Hijri date
    const hijriDiv = row.createDiv({
        cls: "prayer-panel-hijri",
        text: `${this.plugin.t("hijri")}: ${this.plugin._formatHijri() || "—"}`,
    });
    hijriDiv.addEventListener("click", async (e) => {
        e.stopPropagation();
        await this.plugin.createOrOpenHijriDailyNote();
    });
  }

	_renderPrayerList(container, currentRef) {
		const tRef = (k) => this.plugin.t(`ref_${k}`) || k;

		const refTextDiv = container.createDiv("prayer-panel-reference");
		const refText    = this.plugin._computeReferenceTimeText(currentRef);
		refTextDiv.createDiv({
			cls:  "prayer-ref-label",
			text: `${this.plugin.t("reference")} (${tRef(currentRef)}): ${refText || "—"}`,
		});

		const list  = container.createDiv("prayer-panel-list");
		const times = this.plugin.prayerTimes || {};
		if (!times.Fajr) {
			list.createDiv({ cls: "prayer-loading", text: this.plugin.t("loading") });
			return;
		}

		const now    = new Date();
		const nowMin = now.getHours() * 60 + now.getMinutes();
		const next   = this.plugin._getNextPrayer();

		for (const name of PRAYER_NAMES) {
			const row = list.createDiv("prayer-row");
			const pm  = this.plugin._hmToMinutes(times[name]);

			if (pm === nowMin)                row.addClass("prayer-row-current");
			else if (next?.name === name)     row.addClass("prayer-row-next");

			row.createSpan({ cls: "prayer-name", text: this.plugin.tPrayer(name) });
			row.createSpan({ cls: "prayer-time", text: this.plugin._formatTime(times[name]) });

			const iq = Number(this.plugin.settings.iqamaMinutes?.[name]) || 0;
			if (this.plugin.settings.enableIqamaFeature && this.plugin.settings.iqamaEnabled?.[name] && iq > 0) {
				row.createSpan({ cls: "prayer-iqama", text: `+${iq}${this.plugin.t("minutes")}` });
			}

			if (next?.name === name) {
				row.createSpan({ cls: "prayer-next-badge", text: this.plugin._formatCountdown(next) });
			}
		}
	}

	_renderReminderList(container) {
		const list      = container.createDiv("prayer-panel-list");
		const reminders = this.plugin.getUpcomingRemindersForToday();

		if (reminders.length === 0) {
			list.createDiv({ cls: "prayer-loading", text: this.plugin.t("noUpcomingReminders") });
			return;
		}

		reminders.forEach(rem => {
			const row     = list.createDiv("prayer-row reminder-panel-row");
			const timeStr = `${String(rem.time.getHours()).padStart(2, "0")}:${String(rem.time.getMinutes()).padStart(2, "0")}`;

			const timeSpan             = row.createSpan({ cls: "prayer-time", text: this.plugin._formatTime(timeStr) });
			timeSpan.style.marginRight = "10px";

			const textSpan              = row.createSpan({ cls: "prayer-name" });
			textSpan.style.fontWeight   = "normal";
			textSpan.style.fontSize     = "0.9em";
			textSpan.style.whiteSpace   = "nowrap";
			textSpan.style.overflow     = "hidden";
			textSpan.style.textOverflow = "ellipsis";
			MarkdownRenderer.renderMarkdown(rem.text, textSpan, rem.file, this._mdComponent);
			// FIX: intercept [[wiki-link]] clicks so they open in-app instead of
			// triggering an obsidian:// protocol URL that force-restarts Obsidian.
			this.plugin._interceptInternalLinks(textSpan, rem.file);

			// Dismiss button — hides the row for this session without touching the file
			const dismissBtn = row.createEl("button", {
				cls:   "reminder-dismiss-btn",
				title: this.plugin.t("reminderPanelDismiss"),
				text:  "×",
			});
			dismissBtn.addEventListener("click", (e) => {
				e.stopPropagation();
				this.plugin.dismissedReminders.add(this.plugin._generateReminderKey(rem.reminder));
				this.plugin.refreshPrayerPanel();
				this.plugin.refreshReminderPanel();
			});

			row.addEventListener("click", async () => {
				const file = this.plugin.app.vault.getAbstractFileByPath(rem.file);
				if (!(file instanceof TFile)) return;
				const leaf = this.plugin.app.workspace.getLeaf(false);
				await leaf.openFile(file);
				if (leaf.view instanceof MarkdownView) {
					const editor = leaf.view.editor;
					editor.setCursor({ line: rem.line, ch: 0 });
					editor.scrollIntoView({ from: { line: rem.line, ch: 0 }, to: { line: rem.line, ch: 0 } }, true);
				}
			});
		});
	}

	_renderFooter() {
		const footer = this.containerEl.createDiv("prayer-panel-footer");

		// Last fetch time
		let lastFetchDisplay = "—";
		if (this.plugin.fetchedAt) {
			const h = String(this.plugin.fetchedAt.getHours()).padStart(2, "0");
			const m = String(this.plugin.fetchedAt.getMinutes()).padStart(2, "0");
			lastFetchDisplay = this.plugin._formatTime(`${h}:${m}`);
		}
		footer.createDiv({ cls: "prayer-footer-fetch", text: `${this.plugin.t("lastFetch")}: ${lastFetchDisplay}` });

		// Fasting note
		this._renderFastingNote(footer);

		// Buttons
		const controls = footer.createDiv("prayer-footer-controls");
		this._createFooterButton(controls, "fetchNow", async () => { await this.plugin.fetchPrayerTimes(true); });
		this._createFooterButton(controls, "playQuran", async () => { await this.plugin.playQuran(); });
		this._createFooterButton(controls, "stop", () => { this.plugin.stopAthan(); this.plugin.stopQuran(); });
	}

	_createFooterButton(container, labelKey, handler) {
		const btn = container.createEl("button", { cls: "prayer-btn", text: this.plugin.t(labelKey) });
		btn.addEventListener("click", handler);
		return btn;
	}

	_renderFastingNote(footer) {
		const now      = this.plugin.fetchedAt ? new Date(this.plugin.fetchedAt) : new Date();
		const tomorrow = new Date(now);
		tomorrow.setDate(now.getDate() + 1);

		const statusToday    = this.plugin._analyzeFastingStatus(now,      this.plugin.hijri, 0);
		const statusTomorrow = this.plugin._analyzeFastingStatus(tomorrow,  this.plugin.hijri, 1);
		const isAr           = this.plugin.settings.language === "ar";

		// Combined dual-day scenarios take priority
		const combinedResult = this._buildCombinedFastingNote(statusToday, statusTomorrow, isAr);
		if (combinedResult) {
			footer.createDiv({ cls: `prayer-fasting-note ${combinedResult.cls}`, text: `🌙 ${combinedResult.text}` });
			return;
		}

		// Fallback: show single highest-priority status
		const p1 = statusToday?.priority    ?? 0;
		const p2 = statusTomorrow?.priority ?? 0;
		const activeStatus = p1 >= p2 && p1 > 0 ? statusToday
			: p2 > p1 && p2 > 0 ? statusTomorrow
			: null;

		if (!activeStatus) return;

		const noteDiv = footer.createDiv({
			cls:  `prayer-fasting-note ${activeStatus.className}`,
			text: `🌙 ${activeStatus.text}`,
		});
		if (activeStatus.isForbidden) noteDiv.addClass("forbidden-note");
	}

	/**
	 * Build combined fasting label when both today and tomorrow have notable status.
	 * Returns { cls, text } or null.
	 */
	_buildCombinedFastingNote(statusToday, statusTomorrow, isAr) {
		if (!statusToday || !statusTomorrow) return null;

		const todayFast      = statusToday.isFasting    && !statusToday.isForbidden;
		const todayForbid    = statusToday.isForbidden;
		const tomorrowFast   = statusTomorrow.isFasting && !statusTomorrow.isForbidden;
		const tomorrowForbid = statusTomorrow.isForbidden;

		if (todayFast && tomorrowFast) {
			return {
				cls:  "both-fast",
				text: isAr ? "اليوم & غدا لديك صيامً" : "today & tomorrow you have a fast",
			};
		}
		if (todayFast && tomorrowForbid) {
			return {
				cls:  "mix-fast-forbid",
				text: isAr ? "اليوم صيام وغداً الصيام محرم" : "Today fast & tomorrow fasting is forbidden",
			};
		}
		if (todayForbid && tomorrowFast) {
			return {
				cls:  "mix-forbid-fast",
				text: isAr ? "اليوم الصيام محرم وغداً صيام" : "Today fasting is forbidden & tomorrow have fast",
			};
		}
		return null;
	}
}

/* ============================================================
   SECTION 3b — REMINDER PANEL VIEW (Feature 6)
   A dedicated sidebar panel that lists all of today's reminders
   with Done, Dismiss, and file-navigation actions.
   ============================================================ */

class ReminderPanelView extends ItemView {
	constructor(leaf, plugin) {
		super(leaf);
		this.plugin      = plugin;
		// "today" | "all" — filter toggle
		this._filter     = "today";
		// See PrayerPanelView constructor for why this exists: render() runs
		// on a 5-second timer and el.empty() alone doesn't unload whatever
		// MarkdownRenderer attached to the owning component on the previous
		// pass. Reusing `this` there leaked one registration per reminder,
		// per tick — the cause of the progressive freeze.
		this._mdComponent = new Component();
		this._mdComponent.load();
	}

	getIcon()        { return "bell"; }
	getViewType()    { return VIEW_TYPE_REMINDER; }
	getDisplayText() { return this.plugin ? this.plugin.t("reminderPanelTitle") : "Reminders"; }

	async onOpen()  { this.render(); }
	async onClose() {
		this._mdComponent?.unload();
		this.containerEl.empty();
	}

	render() {
		// Fresh Component for this render pass — see constructor comment.
		this._mdComponent?.unload();
		this._mdComponent = new Component();
		this._mdComponent.load();

		const el = this.containerEl;
		el.empty();
		el.addClass("reminder-panel-container");
		el.toggleClass("prayer-rtl", this.plugin.settings.language === "ar");

		this._renderHeader(el);
		this._renderList(el);
	}

	_renderHeader(el) {
		const header = el.createDiv("reminder-panel-header");

		header.createDiv({ cls: "reminder-panel-title", text: this.plugin.t("reminderHeader") });

		// Today / All toggle
		const toggle = header.createDiv("reminder-panel-filter-toggle");

		const todayBtn = toggle.createEl("button", {
			cls:  "reminder-filter-btn" + (this._filter === "today" ? " active" : ""),
			text: this.plugin.t("reminderPanelTodayOnly"),
		});

		todayBtn.addEventListener("click", () => { this._filter = "today"; this.render(); });
	}

	_renderList(el) {
		const listEl = el.createDiv("reminder-panel-list");
		const items  = this._getItems();

		if (items.length === 0) {
			listEl.createDiv({ cls: "reminder-panel-empty", text: this.plugin.t("reminderPanelEmpty") });
			return;
		}

		// Group by source file for the "all" view; flat list for "today"
		if (this._filter === "all") {
			const byFile = new Map();
			items.forEach(item => {
				if (!byFile.has(item.file)) byFile.set(item.file, []);
				byFile.get(item.file).push(item);
			});
			byFile.forEach((group, filePath) => {
				const section = listEl.createDiv("reminder-panel-section");
				const label   = filePath.split("/").pop().replace(/\.md$/, "");
				section.createDiv({ cls: "reminder-panel-section-label", text: label });
				group.forEach(item => this._renderRow(section, item));
			});
		} else {
			items.forEach(item => this._renderRow(listEl, item));
		}
	}

	_renderRow(container, item) {
		const row = container.createDiv("reminder-panel-row");
		row.toggleClass("reminder-panel-row-done", !!item.completed);

		// Time badge — only meaningful for today view or when date is relevant
		if (item.time) {
			const timeStr = `${String(item.time.getHours()).padStart(2,"0")}:${String(item.time.getMinutes()).padStart(2,"0")}`;
			row.createSpan({ cls: "reminder-panel-time", text: this.plugin._formatTime(timeStr) });
		} else if (this._filter === "all") {
			// Show the date for future/past reminders
			row.createSpan({ cls: "reminder-panel-time", text: item.reminder.date || "" });
		}

		// Rendered text (supports [[wiki-links]])
		const textEl = row.createDiv({ cls: "reminder-panel-text" });
		MarkdownRenderer.renderMarkdown(item.text || "—", textEl, item.file, this._mdComponent);
		this.plugin._interceptInternalLinks(textEl, item.file);

		// Action bar
		const actions = row.createDiv("reminder-panel-actions");

		// Done button — marks the checkbox in the source file
		const doneBtn = actions.createEl("button", {
			cls:  "reminder-panel-btn reminder-panel-btn-done",
			text: this.plugin.t("reminderPanelDone"),
			title: this.plugin.t("reminderPanelDone"),
		});
		doneBtn.addEventListener("click", async (e) => {
			e.stopPropagation();
			await this.plugin.markReminderDone(item.reminder);
			this.render();
			this.plugin.refreshPrayerPanel();
		});

		// Dismiss button — hides for this session, does not touch the file
		const dismissBtn = actions.createEl("button", {
			cls:   "reminder-panel-btn reminder-panel-btn-dismiss",
			text:  this.plugin.t("reminderPanelDismiss"),
			title: this.plugin.t("reminderPanelDismiss"),
		});
		dismissBtn.addEventListener("click", (e) => {
			e.stopPropagation();
			this.plugin.dismissedReminders.add(this.plugin._generateReminderKey(item.reminder));
			this.render();
			this.plugin.refreshPrayerPanel();
		});

		// Clicking the row body navigates to the source file
		row.addEventListener("click", async () => {
			const file = this.plugin.app.vault.getAbstractFileByPath(item.file);
			if (!(file instanceof TFile)) return;
			const leaf = this.plugin.app.workspace.getLeaf(false);
			await leaf.openFile(file);
			if (leaf.view instanceof MarkdownView) {
				const editor = leaf.view.editor;
				editor.setCursor({ line: item.line, ch: 0 });
				editor.scrollIntoView({ from: { line: item.line, ch: 0 }, to: { line: item.line, ch: 0 } }, true);
			}
		});
	}

	/**
	 * Return items for the current filter.
	 * - "today": upcoming (non-dismissed, non-completed) reminders for today, sorted by time.
	 * - "all":   every reminder in the vault, including future dates, grouped by file.
	 */
	_getItems() {
		if (this._filter === "today") {
			// Reuse the existing helper (already filters dismissed + completed)
			return this.plugin.getUpcomingRemindersForToday();
		}

		// "all" mode — iterate every reminder across every file
		const now      = new Date();
		const todayISO = localISODate(now); // FIX: local date, not UTC
		const all      = [];

		this.plugin.reminders.forEach((list) => {
			list.forEach(reminder => {
				const key       = this.plugin._generateReminderKey(reminder);
				const dismissed = this.plugin.dismissedReminders?.has(key);
				if (dismissed) return;

				const dueTime = this.plugin._resolveDueTime(reminder);
				all.push({
					time:      reminder.date === todayISO ? dueTime : null,
					text:      this.plugin._stripReminderTag(reminder),
					file:      reminder.file,
					line:      reminder.line,
					completed: reminder.completed,
					reminder:  reminder,
				});
			});
		});

		// Sort: today's items first (by time), then future by date, then completed last
		all.sort((a, b) => {
			if (a.completed !== b.completed) return a.completed ? 1 : -1;
			const da = a.reminder.date, db = b.reminder.date;
			if (da !== db) return da < db ? -1 : 1;
			if (a.time && b.time) return a.time - b.time;
			return 0;
		});

		return all;
	}
}

/* ============================================================
   SECTION 4 — SETTINGS TAB
   ============================================================ */

class PrayerSettingTab extends PluginSettingTab {
	constructor(app, plugin) {
		super(app, plugin);
		this.plugin    = plugin;
		this.activeTab = "general";
	}

	display() {
		const { containerEl } = this;
		containerEl.empty();

		const isTabbed = this.plugin.settings.settingsLayout !== "flat";
		containerEl.toggleClass("prayer-rtl", this.plugin.settings.language === "ar");
		containerEl.createEl("h2", { text: this.plugin.t("settingsTitle") });

		if (isTabbed) {
			const tabContainer = containerEl.createDiv("prayer-settings-tabs");
			const tabs = [
				{ id: "general",   label: this.plugin.t("tabGeneral") },
				{ id: "prayers",   label: this.plugin.t("tabPrayers") },
				{ id: "supplications", label: this.plugin.t("tabSupplications") },
				{ id: "reminders", label: this.plugin.t("tabReminders") },
				{ id: "fasting",   label: this.plugin.t("tabFasting") },
				{ id: "notes",     label: this.plugin.t("tabNotes") },
				{ id: "audio",     label: this.plugin.t("tabPaths") },
				{ id: "advanced",  label: this.plugin.t("tabAdvanced") },
			];
			tabs.forEach(tab => {
				const btn = tabContainer.createEl("button", {
					text: tab.label,
					cls:  "prayer-tab-btn" + (this.activeTab === tab.id ? " active" : ""),
				});
				btn.onclick = () => { this.activeTab = tab.id; this.display(); };
			});
		}

		if (!isTabbed || this.activeTab === "general")   this.renderGeneral(containerEl);
		if (!isTabbed || this.activeTab === "prayers")   this.renderPrayers(containerEl);
		if (!isTabbed || this.activeTab === "supplications") this.renderSupplications(containerEl);
		if (!isTabbed || this.activeTab === "reminders") this.renderReminders(containerEl);
		if (!isTabbed || this.activeTab === "fasting")  this.renderFasting(containerEl);
		if (!isTabbed || this.activeTab === "notes")     this.renderNotes(containerEl);
		if (!isTabbed || this.activeTab === "audio")     this.renderPathAudio(containerEl);
		if (!isTabbed || this.activeTab === "advanced")  this.renderAdvanced(containerEl);
	}

	/* ---- Shared UI helpers -------------------------------- */

	/** Setting with audio file autocomplete from vault. Supports dot-path keys. */
	createAudioSetting(containerEl, nameKey, descKey, settingKey) {
		const listId = `audio-list-${settingKey.replace(/\./g, "-")}`;
		new Setting(containerEl)
			.setName(this.plugin.t(nameKey))
			.setDesc(descKey ? this.plugin.t(descKey) : "")
			.addText(text => {
				// FIX: use _getNestedSetting/_setNestedSetting for dot-paths
				text.setValue(this.plugin._getNestedSetting(settingKey));
				text.onChange(async v => {
					this.plugin._setNestedSetting(settingKey, v);
					await this.plugin.saveSettings();
				});

				const input = text.inputEl;
				input.setAttribute("list", listId);

				if (!containerEl.querySelector(`#${listId}`)) {
					const dl = document.createElement("datalist");
					dl.id    = listId;
					this.plugin.app.vault
						.getFiles()
						.filter(f => ["mp3", "wav", "ogg", "m4a", "webm"].includes(f.extension))
						.forEach(f => {
							const opt   = document.createElement("option");
							opt.value   = f.path;
							dl.appendChild(opt);
						});
					containerEl.appendChild(dl);
				}
			});
	}

	/** Numeric stepper: [−] [value] [+] with min/max clamping. */
	createStepperSetting(containerEl, name, desc, currentValue, min, max, onChangeCallback) {
		const setting = new Setting(containerEl).setName(name);
		if (desc) setting.setDesc(desc);

		let textComponent;

		setting.addButton(btn => btn.setButtonText("−").onClick(async () => {
			let val = parseInt(textComponent.getValue());
			if (isNaN(val)) val = currentValue;
			if (val > min) { val--; textComponent.setValue(String(val)); await onChangeCallback(val); }
		}));

		setting.addText(text => {
			textComponent = text;
			text.setValue(String(currentValue)).onChange(async v => {
				let val = parseInt(v);
				if (!isNaN(val)) {
					val = Math.max(min, Math.min(max, val));
					await onChangeCallback(val);
				}
			});
			text.inputEl.parentElement?.addClass("prayer-stepper");
		});

		setting.addButton(btn => btn.setButtonText("+").onClick(async () => {
			let val = parseInt(textComponent.getValue());
			if (isNaN(val)) val = currentValue;
			if (val < max) { val++; textComponent.setValue(String(val)); await onChangeCallback(val); }
		}));

		return setting;
	}

	/* ---- Tab renderers ------------------------------------ */

	renderGeneral(containerEl) {
		if (this.plugin.settings.settingsLayout === "flat") {
			containerEl.createEl("h3", { text: this.plugin.t("tabGeneral") });
		}

		// Layout toggle
		new Setting(containerEl)
			.setName(this.plugin.t("settingsLayout"))
			.setDesc(this.plugin.t("settingsLayoutDesc"))
			.addDropdown(dd => {
				dd.addOption("tabbed", this.plugin.t("layoutTabbed"));
				dd.addOption("flat",   this.plugin.t("layoutFlat"));
				dd.setValue(this.plugin.settings.settingsLayout || "tabbed");
				dd.onChange(async val => { this.plugin.settings.settingsLayout = val; await this.plugin.saveSettings(); this.display(); });
			});

		// Language
		new Setting(containerEl)
			.setName(this.plugin.t("language"))
			.setDesc(this.plugin.t("languageDesc"))
			.addDropdown(dd => {
				dd.addOption("en", "English");
				dd.addOption("ar", "العربية");
				dd.setValue(this.plugin.settings.language);
				dd.onChange(async val => {
					this.plugin.settings.language = val;
					await this.plugin.saveSettings();
					this.display();
					this.plugin.refreshPrayerPanel();
					this.plugin.updateStatusBar();
				});
			});

		// Location mode
		new Setting(containerEl).setName(this.plugin.t("locationMode")).addDropdown(dd => {
			dd.addOption("auto",   this.plugin.t("locModeAuto"));
			dd.addOption("manual", this.plugin.t("locModeManual"));
			dd.setValue(this.plugin.settings.locationMode || "auto");
			dd.onChange(async v => { this.plugin.settings.locationMode = v; await this.plugin.saveSettings(); this.display(); });
		});

		if (this.plugin.settings.locationMode === "manual") {
			new Setting(containerEl).setName(this.plugin.t("latitude")).setDesc(this.plugin.t("latitudeDesc")).addText(t => t.setValue(this.plugin.settings.latitude).onChange(async v => { this.plugin.settings.latitude = v; await this.plugin.saveSettings(); }));
			new Setting(containerEl).setName(this.plugin.t("longitude")).setDesc(this.plugin.t("longitudeDesc")).addText(t => t.setValue(this.plugin.settings.longitude).onChange(async v => { this.plugin.settings.longitude = v; await this.plugin.saveSettings(); }));
		} else {
			new Setting(containerEl).setName(this.plugin.t("city")).setDesc(this.plugin.t("cityDesc")).addText(t => t.setValue(this.plugin.settings.city).onChange(async v => { this.plugin.settings.city = v; await this.plugin.saveSettings(); await this.plugin.fetchPrayerTimes(true); }));
			this._renderCountrySetting(containerEl);
		}

		// Calculation method
		new Setting(containerEl).setName(this.plugin.t("calcMethod")).setDesc(this.plugin.t("calcMethodDesc")).addDropdown(dd => {
			const isAr = this.plugin.settings.language === "ar";
			for (const opt of METHOD_OPTIONS) {
				dd.addOption(String(opt.id), (isAr && opt.labelAr) ? opt.labelAr : opt.label);
			}
			dd.setValue(String(this.plugin.settings.method));
			dd.onChange(async val => {
				const num = Number(val);
				if (Number.isFinite(num)) {
					this.plugin.settings.method = num;
					await this.plugin.saveSettings();
					await this.plugin.fetchPrayerTimes(true);
				}
			});
		});

		// Time format
		new Setting(containerEl).setName(this.plugin.t("timeFormat")).setDesc(this.plugin.t("timeFormatDesc")).addDropdown(dd => {
			dd.addOption("24h", this.plugin.t("timeFormat24h"));
			dd.addOption("12h", this.plugin.t("timeFormat12h"));
			dd.setValue(this.plugin.settings.timeFormat || "24h");
			dd.onChange(async val => { this.plugin.settings.timeFormat = val; await this.plugin.saveSettings(); this.plugin.refreshPrayerPanel(); this.plugin.updateStatusBar(); });
		});
	}

	/** Country selector with dropdown + free-text fallback. */
	_renderCountrySetting(containerEl) {
		const isAr      = this.plugin.settings.language === "ar";
		const datalistId = "prayer-country-list";

		if (!containerEl.querySelector(`#${datalistId}`)) {
			const dl = document.createElement("datalist");
			dl.id    = datalistId;
			COUNTRIES.forEach(c => {
				const opt = document.createElement("option");
				opt.value = c.en;
				dl.appendChild(opt);
			});
			containerEl.appendChild(dl);
		}

		let textInput = null;
		let ddRef     = null;

		new Setting(containerEl)
			.setName(this.plugin.t("country"))
			.setDesc(isAr ? "اختر الدولة أو اكتب اسمها" : "Select or type country name (or ISO code)")
			.addDropdown(dd => {
				ddRef = dd;
				dd.addOption("", isAr ? "-- اختر أو اكتب --" : "-- Select or type --");
				COUNTRIES.forEach(c => dd.addOption(c.code, isAr ? c.ar : c.en));
				const saved = this.plugin.settings.country || "";
				const pre   = (saved.length === 2 && COUNTRIES.some(c => c.code === saved.toUpperCase())) ? saved.toUpperCase() : "";
				dd.setValue(pre);
				dd.onChange(async val => { this.plugin.settings.country = val || ""; await this.plugin.saveSettings(); textInput?.setValue(""); });
			})
			.addText(text => {
				textInput = text;
				const saved   = this.plugin.settings.country || "";
				const initial = (saved.length === 2 && COUNTRIES.some(c => c.code === saved.toUpperCase())) ? "" : saved;
				text.setPlaceholder(isAr ? "أو اكتب هنا" : "Or type here").setValue(initial);
				text.onChange(async v => {
					const trimmed = v?.trim() || "";
					if (trimmed) { this.plugin.settings.country = trimmed; await this.plugin.saveSettings(); try { ddRef?.setValue(""); } catch (e) {} }
				});
				setTimeout(() => { try { text.inputEl?.setAttribute("list", datalistId); } catch (e) {} }, 0);
			});
	}

	renderPrayers(containerEl) {
		if (this.plugin.settings.settingsLayout === "flat") {
			containerEl.createEl("h3", { text: this.plugin.t("tabPrayers") });
		}

		containerEl.createEl("h4", { text: this.plugin.t("enableFor") });
		for (const prayer of Object.keys(this.plugin.settings.enabledPrayers)) {
			new Setting(containerEl).setName(this.plugin.tPrayer(prayer)).addToggle(t =>
				t.setValue(this.plugin.settings.enabledPrayers[prayer])
				 .onChange(async v => { this.plugin.settings.enabledPrayers[prayer] = v; await this.plugin.saveSettings(); })
			);
		}
		this.createAudioSetting(containerEl, "athanAudio", "athanAudioDesc", "athanAudioPath");

		containerEl.createEl("h4", { text: this.plugin.t("PreAthanname") });
		new Setting(containerEl).setName(this.plugin.t("enablePreAthan")).setDesc(this.plugin.t("enablePreAthanDesc")).addToggle(t =>
			t.setValue(this.plugin.settings.enablePreAthan)
			 .onChange(async v => { this.plugin.settings.enablePreAthan = v; await this.plugin.saveSettings(); this.display(); })
		);

		if (this.plugin.settings.enablePreAthan) {
			this.createStepperSetting(
				containerEl, this.plugin.t("preAthanOffset"), this.plugin.t("preAthanOffsetDesc"),
				this.plugin.settings.preAthanOffsetMinutes || 10, 0, 120,
				async val => { this.plugin.settings.preAthanOffsetMinutes = val; await this.plugin.saveSettings(); }
			);
			this.createAudioSetting(containerEl, "preAthanAudio", "preAthanAudioDesc", "preAthanAudioPath");
		}

		containerEl.createEl("h4", { text: this.plugin.t("offsetsSection") });
		containerEl.createEl("p",  { text: this.plugin.t("offsetsDesc"), cls: "setting-item-description" });

		new Setting(containerEl)
			.setName(this.plugin.settings.language === "ar" ? "تفعيل تعديل المواقيت" : "Enable Time Adjustments")
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.enablePrayerOffsets)
				.onChange(async val => {
					this.plugin.settings.enablePrayerOffsets = val;
					await this.plugin.saveSettings();
					await this.plugin.fetchPrayerTimes(true);
					this.display();
				})
			);

		if (this.plugin.settings.enablePrayerOffsets) {
			for (const p of ["Fajr", "Sunrise", "Dhuhr", "Asr", "Maghrib", "Isha"]) {
				this.createStepperSetting(
					containerEl, this.plugin.tPrayer(p), null,
					this.plugin.settings.prayerOffsets[p] || 0, -120, 120,
					async val => { this.plugin.settings.prayerOffsets[p] = val; await this.plugin.saveSettings(); await this.plugin.fetchPrayerTimes(true); }
				);
			}
		}

		containerEl.createEl("h4", { text: this.plugin.t("iqamaSection") });
		new Setting(containerEl).setName(this.plugin.t("enableIqama")).setDesc(this.plugin.t("enableIqamaDesc")).addToggle(t =>
			t.setValue(this.plugin.settings.enableIqamaFeature)
			 .onChange(async v => { this.plugin.settings.enableIqamaFeature = v; await this.plugin.saveSettings(); this.display(); })
		);

		if (this.plugin.settings.enableIqamaFeature) {
			this.createAudioSetting(containerEl, "iqamaAudio", "iqamaAudioDesc", "iqamaAudioPath");

			for (const p of PRAYER_NAMES) {
				// FIX: replaced duplicate raw DOM stepper with reusable createStepperSetting
				new Setting(containerEl).setName(this.plugin.tPrayer(p)).setDesc(this.plugin.t("iqamaDesc"))
					.addToggle(toggle => toggle
						.setValue(this.plugin.settings.iqamaEnabled[p])
						.onChange(async val => { this.plugin.settings.iqamaEnabled[p] = val; await this.plugin.saveSettings(); this.display(); })
					);

				if (this.plugin.settings.iqamaEnabled[p]) {
					this.createStepperSetting(
						containerEl,
						`  ↳ ${this.plugin.tPrayer(p)}`, null,
						this.plugin.settings.iqamaMinutes[p] || 0, 0, 180,
						async val => { this.plugin.settings.iqamaMinutes[p] = val; await this.plugin.saveSettings(); }
					);
				}
			}
		}
	}

	renderPathAudio(containerEl) {
	if (this.plugin.settings.settingsLayout === "flat") {
		containerEl.createEl("h3", { text: this.plugin.t("tabPaths") });
	}

	// ── Audio Files ──────────────────────────────────────────────
	containerEl.createEl("h4", { text: this.plugin.t("audiofiles") });
	this.createAudioSetting(containerEl, "athanAudio", "", "athanAudioPath");
	this.createAudioSetting(containerEl, "preAthanAudio", "", "preAthanAudioPath");
	this.createAudioSetting(containerEl, "iqamaAudio", "", "iqamaAudioPath");
	this.createAudioSetting(containerEl, "fastingAudio", "", "fastingAudioPath");
	this.createAudioSetting(containerEl, "morningSupAudio", "", "supplications.morning.audioPath");
	this.createAudioSetting(containerEl, "eveningSupAudio", "", "supplications.evening.audioPath");
	this.createAudioSetting(containerEl, "nightSupAudio", "", "supplications.night.audioPath");
	this.createAudioSetting(containerEl, "reminderAudio", "", "reminderAudioPath");

	// ── Folder/Files Paths ──────────────────────────────────────────────
	containerEl.createEl("h4", { text: this.plugin.t("Paths") });
	
	// Islamic Notes Folder
	new Setting(containerEl)
		.setName(this.plugin.t("folderpath"))
		.addText(t => t
			.setPlaceholder(this.plugin.t("folderPathPlaceholder"))
			.setValue(this.plugin.settings.dailyNotesFolder || "Daily")
			.onChange(async v => { 
				this.plugin.settings.dailyNotesFolder = v; 
				await this.plugin.saveSettings(); 
			})
		);

	// Note Template File (English)
	new Setting(containerEl)
		.setName(this.plugin.t("NoteTemplateEn"))
		.addText(t => t
			.setPlaceholder(this.plugin.t("filePathPlaceholder"))
			.setValue(this.plugin.settings.englishNoteTemplatePath || "")
			.onChange(async v => {
				this.plugin.settings.englishNoteTemplatePath = v; 
				await this.plugin.saveSettings(); 
			})
		);

	// Note Template File (Arabic)
	new Setting(containerEl)
		.setName(this.plugin.t("NoteTemplate"))
		.addText(t => t
			.setPlaceholder(this.plugin.t("filePathPlaceholder"))
			.setValue(this.plugin.settings.arabicNoteTemplatePath || "")
			.onChange(async v => { 
				this.plugin.settings.arabicNoteTemplatePath = v; 
				await this.plugin.saveSettings(); 
			})
		);
  }

	renderReminders(containerEl) {
		if (this.plugin.settings.settingsLayout === "flat") {
			containerEl.createEl("h3", { text: this.plugin.t("tabReminders") });
		}

		// reminders

		new Setting(containerEl).setName(this.plugin.t("enableReminders")).setDesc(this.plugin.t("enableRemindersDesc")).addToggle(t =>
			t.setValue(this.plugin.settings.enableReminders).onChange(async v => {
				this.plugin.settings.enableReminders = v;
				await this.plugin.saveSettings();
				if (v) this.plugin.scanVaultForReminders();
				this.display();
			})
		);
		new Setting(containerEl)
			.setName(this.plugin.t("showRemindersInPanel"))
			.setDesc(this.plugin.t("showRemindersInPanelDesc"))
			.addToggle(t => t
				.setValue(this.plugin.settings.showRemindersInPanel !== false)
				.onChange(async v => {
					this.plugin.settings.showRemindersInPanel = v;
					// If the user disables the panel tab while it is active, reset to first ref
					if (!v && this.plugin.settings.displayReference === "reminders") {
						this.plugin.settings.displayReference = "sunrise";
					}
					await this.plugin.saveSettings();
					this.plugin.refreshPrayerPanel();
				})
			);

		if (this.plugin.settings.enableReminders) {
			this.createAudioSetting(containerEl, "reminderAudio", "reminderAudioDesc", "reminderAudioPath");

			// Customizable postpone durations (dropdown next to the Postpone button)
			new Setting(containerEl)
				.setName(this.plugin.t("postponeDurations"))
				.setDesc(this.plugin.t("postponeDurationsDesc"))
				.addText(text => {
					text.setPlaceholder("5, 15, 30, 60")
						.setValue(this.plugin.settings.postponeDurations || "")
						.onChange(async val => {
							this.plugin.settings.postponeDurations = val;
							await this.plugin.saveSettings();
						});
				});

			// Feature 4 — notification style selector
			new Setting(containerEl)
				.setName(this.plugin.t("reminderMode"))
				.setDesc(this.plugin.t("reminderModeDesc"))
				.addDropdown(dd => {
					dd.addOption("sequential", this.plugin.t("reminderModeSequential"));
					dd.addOption("dashboard",  this.plugin.t("reminderModeDashboard"));
					dd.setValue(this.plugin.settings.reminderMode || "sequential");
					dd.onChange(async val => {
						this.plugin.settings.reminderMode = val;
						await this.plugin.saveSettings();
						this.display();
					});
				});

			// Show time picker only when dashboard mode is active
			if ((this.plugin.settings.reminderMode || "sequential") === "dashboard") {
				new Setting(containerEl)
					.setName(this.plugin.t("dashboardTime"))
					.setDesc(this.plugin.t("dashboardTimeDesc"))
					.addText(text => {
						text.setPlaceholder("08:00")
							.setValue(this.plugin.settings.dashboardTime || "08:00");
						text.inputEl.type = "time"; // native time picker on supported platforms
						text.onChange(async val => {
							// Validate HH:MM format
							if (/^\d{1,2}:\d{2}$/.test(val)) {
								this.plugin.settings.dashboardTime = val;
								await this.plugin.saveSettings();
							}
						});
					});

				// Button to open the dashboard right now (for testing / on-demand)
				new Setting(containerEl)
					.setName(this.plugin.t("dashboardOpenDashboard"))
					.addButton(btn => btn
						.setButtonText(this.plugin.t("dashboardOpenDashboard"))
						.onClick(() => { this.plugin.openReminderDashboard(); })
					);
			}

			// Feature 7 — missed / postponed reminder recovery
			new Setting(containerEl)
				.setName(this.plugin.t("postponedReminderBehavior"))
				.setDesc(this.plugin.t("postponedReminderBehaviorDesc"))
				.addDropdown(dd => {
					dd.addOption("delay6s",              this.plugin.t("postponedDelay6s"));
					dd.addOption("waitForDashboardTime", this.plugin.t("postponedWaitDashboard"));
					dd.setValue(this.plugin.settings.postponedReminderBehavior || "delay6s");
					dd.onChange(async val => {
						this.plugin.settings.postponedReminderBehavior = val;
						await this.plugin.saveSettings();
						this.display();
					});
				});

			new Setting(containerEl)
				.setName(this.plugin.t("multiplePostponedDisplay"))
				.setDesc(this.plugin.t("multiplePostponedDisplayDesc"))
				.addDropdown(dd => {
					dd.addOption("sequential", this.plugin.t("multiplePostponedSequential"));
					dd.addOption("dashboard",  this.plugin.t("multiplePostponedDashboard"));
					dd.setValue(this.plugin.settings.multiplePostponedDisplay || "sequential");
					dd.onChange(async val => {
						this.plugin.settings.multiplePostponedDisplay = val;
						await this.plugin.saveSettings();
					});
				});
		}
	}

	renderSupplications(containerEl) {
		if (this.plugin.settings.settingsLayout === "flat") {
			containerEl.createEl("h3", { text: this.plugin.t("tabSupplications") });
		}
		// Supplications
		containerEl.createEl("h4", { text: this.plugin.t("supplicationSection") });

		this._renderSupplicationRow(containerEl, "morning", {
			enableKey: "morningSupEnable", descKey: "morningSupDesc",
			audioSettingKey: "supplications.morning.audioPath",
			audioNameKey: "morningSupAudio",
			offsetKey: "morningOffset", offsetPath: "supplications.morning.offsetMinutes",
			dirKey: "morningDir", dirPath: "supplications.morning.direction",
			dirOptions: [["before", "before"], ["after", "after"]],
		});

		this._renderSupplicationRow(containerEl, "evening", {
			enableKey: "eveningSupEnable", descKey: "eveningSupDesc",
			audioSettingKey: "supplications.evening.audioPath",
			audioNameKey: "eveningSupAudio",
			offsetKey: "eveningOffset", offsetPath: "supplications.evening.offsetMinutes",
			dirKey: "eveningRef", dirPath: "supplications.evening.reference",
			dirOptions: [["sunset", "sunset"], ["Asr", "Asr"]],
		});

		this._renderSupplicationRow(containerEl, "night", {
			enableKey: "nightSupEnable", descKey: "nightSupDesc",
			audioSettingKey: "supplications.night.audioPath",
			audioNameKey: "nightSupAudio",
			offsetKey: "nightOffset", offsetPath: "supplications.night.offsetMinutes",
			// Night supplication has no direction selector in original
		});
	}

	/** Render a supplication enable toggle + optional sub-settings. */
	_renderSupplicationRow(containerEl, key, cfg) {
		const sup = this.plugin.settings.supplications[key];

		new Setting(containerEl)
			.setName(this.plugin.t(cfg.enableKey))
			.setDesc(this.plugin.t(cfg.descKey))
			.addToggle(t => t.setValue(sup.enabled).onChange(async v => {
				this.plugin.settings.supplications[key].enabled = v;
				await this.plugin.saveSettings();
				this.display();
			}));

		if (!sup.enabled) return;

		if (cfg.audioSettingKey) {
			this.createAudioSetting(containerEl, cfg.audioNameKey, "", cfg.audioSettingKey);
		}
		if (cfg.offsetKey && cfg.offsetPath) {
			this.createStepperSetting(
				containerEl, this.plugin.t(cfg.offsetKey), null,
				this.plugin._getNestedSetting(cfg.offsetPath) || 5, 0, 120,
				async val => { this.plugin._setNestedSetting(cfg.offsetPath, val); await this.plugin.saveSettings(); }
			);
		}
		if (cfg.dirKey && cfg.dirPath && cfg.dirOptions) {
			new Setting(containerEl).setName(this.plugin.t(cfg.dirKey)).addDropdown(dd => {
				cfg.dirOptions.forEach(([val, lbl]) => dd.addOption(val, lbl));
				dd.setValue(this.plugin._getNestedSetting(cfg.dirPath) || cfg.dirOptions[0][0])
				  .onChange(async v => { this.plugin._setNestedSetting(cfg.dirPath, v); await this.plugin.saveSettings(); });
			});
		}
	}

	renderNotes(containerEl) {
		if (this.plugin.settings.settingsLayout === "flat") {
			containerEl.createEl("h3", { text: this.plugin.t("tabNotes") });
		}

		new Setting(containerEl).setName(this.plugin.t("enabled")).setDesc(this.plugin.t("enabledesc")).addToggle(t =>
			t.setValue(this.plugin.settings.enableDailyNotes)
			 .onChange(async v => { this.plugin.settings.enableDailyNotes = v; await this.plugin.saveSettings(); this.display(); })
		);

		if (!this.plugin.settings.enableDailyNotes) return;

		new Setting(containerEl).setName(this.plugin.t("folderpath")).setDesc(this.plugin.t("folderpathdesc"))
			.addText(t => t.setValue(this.plugin.settings.dailyNotesFolder || "Daily").onChange(async v => { this.plugin.settings.dailyNotesFolder = v; await this.plugin.saveSettings(); }));
		new Setting(containerEl).setName(this.plugin.t("dateformat")).setDesc(this.plugin.t("dateformatdesc"))
			.addDropdown(dd => {
				dd.addOption("iso", "ISO (YYYY-MM-DD)");
				dd.addOption("text", "Text (10 Muharram 1447)");
				dd.setValue(this.plugin.settings.hijriDateFormat || "iso")
				  .onChange(async val => { this.plugin.settings.hijriDateFormat = val; await this.plugin.saveSettings(); this.plugin.updateStatusBar?.(); });
			});
		new Setting(containerEl).setName(this.plugin.t("notedateformat")).setDesc(this.plugin.t("notedateformatdesc"))
			.addDropdown(dd => {
				dd.addOption("hijri",     "Hijri only");
				dd.addOption("gregorian", "Gregorian only");
				dd.addOption("both",      "Both (Gregorian — Hijri)");
				dd.setValue(this.plugin.settings.dailyNotesDateFormat || "both")
				  .onChange(async v => { this.plugin.settings.dailyNotesDateFormat = v; await this.plugin.saveSettings(); });
			});

		containerEl.createEl("h4", { text: this.plugin.t("noteTemplate") });
		containerEl.createEl("p",  { text: this.plugin.t("noteTemplateDesc"), cls: "setting-item-description" });

		const isAr = this.plugin.settings.language === "ar";
		this._renderTemplateSection(containerEl, isAr);

		// Placeholder reference card
		const placeholderInfo = containerEl.createDiv({ cls: "template-placeholder-info" });
		MarkdownRenderer.renderMarkdown(
			"> [!Tips] available variables\n> {{DATE}}  {{HIJRI_DATE}}  {{PRAYER_TIMES}}  {{PRAYER_TIMES_TABLE}}  {{CHECKLIST}}  {{SPECIAL_DAYS}}  {{FASTING_ANALYSIS}}  {{HIJRI_DAY}}  {{HIJRI_MONTH}}  {{HIJRI_YEAR}}",
			placeholderInfo, "", null
		);

		new Setting(containerEl).setName(this.plugin.t("autoOpenIslamicName")).setDesc(this.plugin.t("autoOpenIslamicDesc"))
			.addToggle(t => t.setValue(this.plugin.settings.autoOpenIslamicNoteOnStartup)
				.onChange(async val => { this.plugin.settings.autoOpenIslamicNoteOnStartup = val; await this.plugin.saveSettings(); })
			);
	}

	_renderTemplateSection(containerEl, isAr) {
		const modePath  = isAr ? "arabicNoteTemplateMode"  : "englishNoteTemplateMode";
		const filePath  = isAr ? "arabicNoteTemplatePath"  : "englishNoteTemplatePath";
		const textPath  = isAr ? "arabicNoteTemplate"      : "englishNoteTemplate";
		const dfltTmpl  = isAr
			? "\n{{PRAYER_TIMES}}\n\n\n{{CHECKLIST}}\n\n \n{{SPECIAL_DAYS}}"
			: "{{PRAYER_TIMES}}\n\n#{{CHECKLIST}}\n\n{{SPECIAL_DAYS}}";
		const placeholder = isAr
			? "استخدم {{PRAYER_TIMES}} و {{CHECKLIST}} و {{SPECIAL_DAYS}}"
			: "Use {{PRAYER_TIMES}}, {{CHECKLIST}}, and {{SPECIAL_DAYS}} as placeholders";

		const setting = new Setting(containerEl).setName(this.plugin.t("NoteTemplate"))
			.setDesc(isAr ? "اختر ملف قالب أو اكتب القالب مباشرة" : "Choose a template file or write template directly");

		setting.addButton(btn => {
			btn.setButtonText(this.plugin.t("chooseFile"));
			btn.onClick(async () => {
				const files = this.plugin.app.vault.getMarkdownFiles().map(f => f.path);
				new TemplateFileModal(this.plugin.app, files, selectedPath => {
					if (selectedPath) {
						this.plugin.settings[filePath] = selectedPath;
						this.plugin.settings[modePath] = "file";
						this.plugin.saveSettings();
						this.display();
					}
				}).open();
			});
		});

		setting.addButton(btn => {
			btn.setButtonText(this.plugin.t("writeTemplate"));
			btn.onClick(async () => {
				this.plugin.settings[modePath] = "text";
				this.plugin.settings[filePath] = "";
				this.plugin.saveSettings();
				this.display();
			});
		});

		setting.addText(text => {
			text.setDisabled(true);
			const mode = this.plugin.settings[modePath];
			text.setValue(mode === "file"
				? `path: ${this.plugin.settings[filePath] || this.plugin.t("noFileSelected")}`
				: this.plugin.t("directWritingMode")
			);
		});

		if (this.plugin.settings[modePath] === "text") {
			new Setting(containerEl).setName(this.plugin.t("directTemplateText")).addTextArea(text => {
				text.setValue(this.plugin.settings[textPath] || dfltTmpl);
				text.setPlaceholder(placeholder);
				text.inputEl.rows            = 8;
				text.inputEl.style.width     = "100%";
				text.inputEl.style.fontFamily = "var(--font-family-mono, monospace)";
				text.inputEl.style.fontSize  = "12px";
				if (isAr) { text.inputEl.style.direction = "rtl"; text.inputEl.style.textAlign = "right"; }
				text.onChange(async val => { this.plugin.settings[textPath] = val; await this.plugin.saveSettings(); });
			});
		}
	}
	
	renderFasting(containerEl) {
		containerEl.createEl("h4", { text: this.plugin.t("fastingSection") });
		new Setting(containerEl).setName(this.plugin.t("enableFasting")).addToggle(t =>
			t.setValue(this.plugin.settings.fastingEnabled)
			 .onChange(async v => { this.plugin.settings.fastingEnabled = v; await this.plugin.saveSettings(); this.display(); })
		);

		if (this.plugin.settings.fastingEnabled) {
			this._renderFastingWeekdays(containerEl);
			new Setting(containerEl).setName(this.plugin.t("fastingHijri")).setDesc(this.plugin.t("fastingHijriDesc"))
				.addText(t => t.setValue(this.plugin.settings.fastingHijriDays).onChange(async v => { this.plugin.settings.fastingHijriDays = v; await this.plugin.saveSettings(); }));
			new Setting(containerEl).setName(this.plugin.t("fastingPrayer")).setDesc(this.plugin.t("fastingPrayerDesc"))
				.addDropdown(dd => {
					PRAYER_NAMES.forEach(p => dd.addOption(p, this.plugin.tPrayer(p)));
					dd.setValue(this.plugin.settings.fastingAlert.prayer || "Fajr")
					  .onChange(async v => { this.plugin.settings.fastingAlert.prayer = v; await this.plugin.saveSettings(); });
				});
			this.createStepperSetting(
				containerEl, this.plugin.t("fastingOffset"), null,
				this.plugin.settings.fastingAlert.offsetMinutes || 0, 0, 120,
				async val => { this.plugin.settings.fastingAlert.offsetMinutes = val; await this.plugin.saveSettings(); }
			);
			new Setting(containerEl).setName(this.plugin.t("fastingDir")).addDropdown(dd =>
				dd.addOption("before", this.plugin.t("before")).addOption("after", this.plugin.t("after"))
				  .setValue(this.plugin.settings.fastingAlert.direction || "before")
				  .onChange(async v => { this.plugin.settings.fastingAlert.direction = v; await this.plugin.saveSettings(); })
			);
			this.createAudioSetting(containerEl, "fastingAudio", "fastingAudioDesc", "fastingAudioPath");
		}
	}

	_renderFastingWeekdays(containerEl) {
		const container = containerEl.createDiv("fasting-weekdays-grid");
		container.createEl("div", { text: this.plugin.t("fastingWeekdays"), cls: "fasting-label" });
		const grid = container.createDiv("fasting-weekdays");
		for (const d of WEEKDAY_KEYS) {
			const btn = grid.createEl("button", { cls: "fasting-day-btn", text: this.plugin.t(d) });
			btn.addEventListener("click", async () => {
				this.plugin.settings.fastingWeekdays[d] = !this.plugin.settings.fastingWeekdays[d];
				await this.plugin.saveSettings();
				btn.toggleClass("active", this.plugin.settings.fastingWeekdays[d]);
			});
			if (this.plugin.settings.fastingWeekdays[d]) btn.addClass("active");
		}
	}

	renderAdvanced(containerEl) {
		if (this.plugin.settings.settingsLayout === "flat") {
			containerEl.createEl("h3", { text: this.plugin.t("tabAdvanced") });
		}

		new Setting(containerEl).setName(this.plugin.t("fetchMode")).setDesc(this.plugin.t("fetchModeDesc")).addDropdown(dd => {
			dd.addOption("monthly", this.plugin.t("fetchModeMonthly"));
			dd.addOption("daily",   this.plugin.t("fetchModeDaily"));
			dd.addOption("hybrid",  this.plugin.t("fetchModeHybrid"));
			dd.setValue(this.plugin.settings.fetchMode || "monthly");
			dd.onChange(async val => { this.plugin.settings.fetchMode = val; await this.plugin.saveSettings(); await this.plugin.fetchPrayerTimes(true); this.display(); });
		});

		new Setting(containerEl).setName(this.plugin.t("showStatusBar")).setDesc(this.plugin.t("showStatusBarDesc")).addToggle(t =>
			t.setValue(this.plugin.settings.enableStatusBar).onChange(async v => {
				this.plugin.settings.enableStatusBar = v;
				await this.plugin.saveSettings();
				if (v && !this.plugin.statusBarEl) {
					this.plugin.statusBarEl = this.plugin.addStatusBarItem();
					this.plugin.updateStatusBar();
				} else if (!v && this.plugin.statusBarEl) {
					try { this.plugin.statusBarEl.remove(); } catch (e) {}
					this.plugin.statusBarEl = null;
				}
			})
		);

		new Setting(containerEl).setName(this.plugin.t("offlineFallback")).setDesc(this.plugin.t("offlineFallbackDesc")).addToggle(t =>
			t.setValue(this.plugin.settings.enableOfflineFallback).onChange(async v => { this.plugin.settings.enableOfflineFallback = v; await this.plugin.saveSettings(); })
		);

		new Setting(containerEl).setName(this.plugin.t("sysNotif")).setDesc(this.plugin.t("sysNotifDesc")).addToggle(t =>
			t.setValue(this.plugin.settings.showSystemNotification).onChange(async v => {
				this.plugin.settings.showSystemNotification = v;
				await this.plugin.saveSettings();
				if (v && "Notification" in window && Notification.permission !== "granted") Notification.requestPermission();
			})
		);

		new Setting(containerEl).setName(this.plugin.t("wakeLock")).setDesc(this.plugin.t("wakeLockDesc")).addToggle(t =>
			t.setValue(this.plugin.settings.tryWakeLockOnMobile).onChange(async v => { this.plugin.settings.tryWakeLockOnMobile = v; await this.plugin.saveSettings(); })
		);

		// Feature 8: Dynamic Reference
		new Setting(containerEl)
			.setName(this.plugin.t("dynamicReference"))
			.setDesc(this.plugin.t("dynamicReferenceDesc"))
			.addToggle(t => t
				.setValue(this.plugin.settings.dynamicReference || false)
				.onChange(async v => {
					this.plugin.settings.dynamicReference = v;
					// Cancel any pending manual-override reset timer
					if (this.plugin._dynamicRefResetTimer != null) {
						clearTimeout(this.plugin._dynamicRefResetTimer);
						this.plugin._dynamicRefResetTimer = null;
					}
					if (v) {
						// Immediately apply the dynamic reference
						const dynamic = this.plugin._getDynamicReference();
						this.plugin.settings.displayReference = dynamic;
					}
					await this.plugin.saveSettings();
					this.plugin.updateStatusBar();
					this.plugin.refreshPrayerPanel();
				})
			);


	  // Hide Reference Button
		new Setting(containerEl)
    .setName(this.plugin.t("hideReferenceBtn"))
    .setDesc(this.plugin.t("hideReferenceBtnDesc"))
    .addToggle(t => t
        .setValue(this.plugin.settings.hideReferenceBtn || false)
        .onChange(async (value) => {
            this.plugin.settings.hideReferenceBtn = value;
            await this.plugin.saveSettings();
        })
    );

		containerEl.createEl("h4", { text: this.plugin.t("hijriOffsetSection") });
		containerEl.createEl("p",  { text: this.plugin.t("hijriOffsetDesc"), cls: "setting-item-description" });

		new Setting(containerEl).setName(this.plugin.t("hijriOffsetEnable")).addToggle(toggle =>
			toggle.setValue(this.plugin.settings.hijriOffsetEnabled || false).onChange(async val => {
				this.plugin.settings.hijriOffsetEnabled = val;
				await this.plugin.saveSettings();
				if (this.plugin.hijri && val) this.plugin.hijri = this.plugin._applyHijriOffset(this.plugin.hijri);
				this.plugin.updateStatusBar();
				this.plugin.refreshPrayerPanel();
				this.display();
			})
		);

		if (this.plugin.settings.hijriOffsetEnabled) {
			this.createStepperSetting(
				containerEl, this.plugin.t("hijriOffsetDays"), this.plugin.t("hijriOffsetDaysDesc"),
				this.plugin.settings.hijriOffset || 0, -30, 30,
				async val => {
					this.plugin.settings.hijriOffset = val;
					await this.plugin.saveSettings();
					if (this.plugin.hijri) this.plugin.hijri = this.plugin._applyHijriOffset(this.plugin.hijri);
					this.plugin.updateStatusBar();
					this.plugin.refreshPrayerPanel();
				}
			);
		}

		containerEl.createEl("hr");
		new Setting(containerEl).setName(this.plugin.t("manualActions"))
			.addButton(btn => btn.setButtonText(this.plugin.t("btnFetch")).onClick(async () => { await this.plugin.fetchPrayerTimes(true); }))
			.addButton(btn => btn.setButtonText(this.plugin.t("btnPlay")).onClick(async () => { await this.plugin.playAthan("Manual"); }))
			.addButton(btn => btn.setButtonText(this.plugin.t("btnStop")).onClick(() => { this.plugin.stopAthan(); }));
	}
}

/* ============================================================
   SECTION 5 — MODALS
   ============================================================ */

class ReminderNotificationModal extends Modal {
	constructor(app, reminder, plugin) {
		super(app);
		this.reminder = reminder;
		this.plugin   = plugin;
		// Dedicated Component to own whatever MarkdownRenderer attaches
		// (wiki-link/hover-preview listeners, etc.). Passing `this` (the Modal)
		// directly triggered Obsidian's "not passing Component in renderMarkdown"
		// warning — Modal doesn't satisfy the loaded-Component contract on its
		// own. Explicitly loading/unloading this fixes that and keeps the same
		// leak protection used in the panel views.
		this._mdComponent = new Component();
		this._mdComponent.load();
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.addClass("prayer-reminder-modal");
		contentEl.createEl("h3", { text: this.plugin.t("reminderNotificationTitle"), cls: "prayer-reminder-title" });

		const displayText = this.plugin._stripReminderTag(this.reminder);

		const msgDiv = contentEl.createDiv({ cls: "prayer-reminder-message" });
		MarkdownRenderer.renderMarkdown(displayText || this.plugin.t("remindersTitle"), msgDiv, this.reminder.file, this._mdComponent);
		// FIX: intercept [[wiki-link]] clicks — without this, clicking a link inside
		// the notification modal fires the obsidian:// protocol URL and force-restarts
		// the app instead of navigating to the linked note in-app.
		this.plugin._interceptInternalLinks(msgDiv, this.reminder.file);

		contentEl.createDiv({ cls: "prayer-reminder-sub", text: this.reminder.file });

		const btnContainer = contentEl.createDiv({ cls: "prayer-reminder-actions" });

		const muteBtn = btnContainer.createEl("button", { text: this.plugin.t("reminderMute") });
		muteBtn.onclick = () => {
			this.plugin.stopAthan();
			// FIX Bug1: add to Set so muted reminders don't re-fire this session
			this.plugin.lastTriggered.vaultReminder.add(this.plugin._generateReminderKey(this.reminder));
			this.close();
		};

		const doneBtn = btnContainer.createEl("button", { text: this.plugin.t("reminderDone"), cls: "mod-cta" });
		doneBtn.onclick = async () => {
			this.plugin.stopAthan();
			await this.plugin.markReminderDone(this.reminder);
			this.close();
		};

		this.plugin.createPostponeControl(btnContainer, this.reminder, async (minutes) => {
			this.plugin.stopAthan();
			// FIX: only close (treat as handled) if the rewrite actually
			// succeeded — previously this closed unconditionally, so a
			// silent regex-mismatch failure looked identical to success.
			const ok = await this.plugin.postponeReminder(this.reminder, minutes);
			if (ok) this.close();
		});
	}

	onClose() {
		this._mdComponent?.unload();
		this.contentEl.empty();
		this.plugin.stopAthan();
	}
}

/**
 * Feature 4 — Reminder Dashboard Modal
 *
 * Full-screen modal that shows ALL pending (non-completed) reminders for today.
 * Opens either automatically at settings.dashboardTime (dashboard mode) or
 * manually via command palette / "Open Dashboard now" button in settings.
 *
 * Each row shows:
 *   [due time]  [reminder text]  [🔊 custom sound badge?]  [Done] [Postpone] [▶ Play]
 */
class ReminderDashboardModal extends Modal {
	constructor(app, plugin) {
		super(app);
		this.plugin = plugin;
		// See ReminderNotificationModal constructor for why this exists.
		this._mdComponent = new Component();
		this._mdComponent.load();
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.addClass("prayer-dashboard-modal");
		contentEl.toggleClass("prayer-rtl", this.plugin.settings.language === "ar");

		// ── Header ────────────────────────────────────────────────
		const header = contentEl.createDiv("dashboard-header");
		header.createEl("h2", { text: this.plugin.t("dashboardTitle"), cls: "dashboard-title" });
		header.createEl("p",  { text: this.plugin.t("dashboardSubtitle"), cls: "dashboard-subtitle" });

		// "Mark all done" button
		const markAllBtn = header.createEl("button", {
			text: this.plugin.t("dashboardMarkAllDone"),
			cls:  "dashboard-mark-all-btn",
		});
		markAllBtn.addEventListener("click", async () => {
			for (const reminder of [...this.plugin._dashboardPending]) {
				await this.plugin.markReminderDone(reminder);
			}
			this.plugin._dashboardPending = [];
			this.plugin.stopAthan();
			this._renderList(listContainer);
		});

		// ── Scrollable list ──────────────────────────────────────
		const listContainer = contentEl.createDiv("dashboard-list");
		this._renderList(listContainer);

		// ── Footer: close ─────────────────────────────────────────
		const footer    = contentEl.createDiv("dashboard-footer");
		const closeBtn  = footer.createEl("button", { text: "✕  " + (this.plugin.settings.language === "ar" ? "إغلاق" : "Close"), cls: "dashboard-close-btn mod-cta" });
		closeBtn.addEventListener("click", () => this.close());
	}

	/**
	 * Remove a reminder from the plugin's pending queue by key — used after
	 * marking done / postponing so it doesn't linger with stale state until
	 * the next full vault scan replaces the in-memory reminder objects.
	 */
	_removeFromPending(reminder) {
		const key = this.plugin._generateReminderKey(reminder);
		this.plugin._dashboardPending = this.plugin._dashboardPending.filter(
			r => this.plugin._generateReminderKey(r) !== key
		);
	}

	/** (Re)render the reminder rows into listContainer. */
	_renderList(listContainer) {
		// _renderList can be called multiple times while the modal stays open
		// (e.g. after Done/Postpone). Same fix pattern as the panel views:
		// unload the previous pass's registrations before re-rendering.
		this._mdComponent?.unload();
		this._mdComponent = new Component();
		this._mdComponent.load();

		listContainer.empty();

		// Feature 8 fix: the dashboard must only ever show reminders that are
		// actually due/late (collected into _dashboardPending by checkReminders
		// in "dashboard" mode, or injected by _handlePostponedRemindersOnStartup
		// for missed reminders) — NOT every reminder scheduled for today
		// regardless of whether its time has come yet.
		const items = this.plugin._dashboardPending.map(r => this.plugin._wrapReminderForDisplay(r));

		if (items.length === 0) {
			listContainer.createDiv({ cls: "dashboard-empty", text: this.plugin.t("dashboardEmpty") });
			return;
		}

		items.forEach(item => {
			const row = listContainer.createDiv("dashboard-row");

			// Time badge
			const timeStr = `${String(item.time.getHours()).padStart(2,"0")}:${String(item.time.getMinutes()).padStart(2,"0")}`;
			row.createSpan({
				cls:  "dashboard-time",
				text: `${this.plugin.t("dashboardDue")}: ${this.plugin._formatTime(timeStr)}`,
			});

			// Text
			const textDiv = row.createDiv({ cls: "dashboard-text" });
			MarkdownRenderer.renderMarkdown(item.text || "—", textDiv, item.file, this._mdComponent);
			// FIX: intercept [[wiki-link]] clicks — same force-restart bug as the
			// notification modal; route through openLinkText() instead.
			this.plugin._interceptInternalLinks(textDiv, item.file);

			// Actions
			const actions = row.createDiv("dashboard-actions");

			// Done
			const doneBtn = actions.createEl("button", { text: this.plugin.t("reminderDone"), cls: "mod-cta dashboard-action-btn" });
			doneBtn.addEventListener("click", async () => {
				this.plugin.stopAthan();
				await this.plugin.markReminderDone(item.reminder);
				this._removeFromPending(item.reminder);
				this._renderList(listContainer);
			});

			// Postpone
			this.plugin.createPostponeControl(actions, item.reminder, async (minutes) => {
				this.plugin.stopAthan();
				// FIX: only remove from the pending queue / re-render if the
				// postpone actually wrote a new time — otherwise the item
				// used to vanish from the dashboard while its underlying
				// due time silently stayed exactly the same.
				const ok = await this.plugin.postponeReminder(item.reminder, minutes);
				if (ok) {
					this._removeFromPending(item.reminder);
					this._renderList(listContainer);
				}
			}, "dashboard-action-btn");

			// Mute (stop currently playing audio)
			const muteBtn = actions.createEl("button", { text: this.plugin.t("reminderMute"), cls: "dashboard-action-btn dashboard-mute-btn" });
			muteBtn.addEventListener("click", () => { this.plugin.stopAthan(); });
		});
	}

	onClose() {
		this._mdComponent?.unload();
		this.contentEl.empty();
		this.plugin.stopAthan();
	}
}

class TemplateFileModal extends Modal {
	constructor(app, filePaths, callback) {
		super(app);
		this.filePaths = filePaths;
		this.callback  = callback;
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.addClass("prayer-template-modal");
		contentEl.createEl("h3", { text: "Select Template File", cls: "prayer-modal-title" });

		const searchInput = contentEl.createDiv({ cls: "template-search-container" }).createEl("input", {
			type: "text", placeholder: "Search files...", cls: "template-search-input",
		});

		const listContainer = contentEl.createDiv({ cls: "template-file-list" });

		const displayFiles = (filter = "") => {
			listContainer.empty();
			const filtered = this.filePaths.filter(p => p.toLowerCase().includes(filter.toLowerCase()));

			if (filtered.length === 0) {
				listContainer.createDiv({ text: "No files found", cls: "template-no-files" });
				return;
			}

			filtered.forEach(path => {
				const item = listContainer.createDiv({ cls: "template-file-item" });
				item.createDiv({ text: path, cls: "template-file-path" });
				item.addEventListener("click", () => { this.callback(path); this.close(); });
			});
		};

		displayFiles();
		searchInput.addEventListener("input", (e) => displayFiles(e.target.value));

		const cancelBtn = contentEl.createEl("button", { text: "Cancel", cls: "prayer-modal-cancel" });
		cancelBtn.addEventListener("click", () => { this.callback(null); this.close(); });
	}

	onClose() { this.contentEl.empty(); }
}

/* ============================================================
   SECTION 6 — CSS
   ============================================================ */
const PRAYER_PANEL_CSS = `
.prayer-panel-container { padding: 16px; font-family: var(--font-family); color: var(--text-normal);overflow-y:auto; }

/* ── HEADER: title centered with line through it ────────────── */
.prayer-panel-header {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: center;
    margin-bottom: 12px;
    gap: 8px 12px;
    position: relative;
    padding-bottom: 10px;
}

.prayer-panel-title {
    font-size: 18px;
    font-weight: 600;
    text-align: center;
    order: 0;
    flex: 0 0 auto;
    width: 100%;
    position: relative;
    padding: 0 16px;
    background: var(--background-primary);
    display: inline-block;
    margin: 0 auto;
}

/* The line that goes through the title */
.prayer-panel-title::before {
    content: '';
    position: absolute;
    top: 50%;
    left: 0;
    right: 0;
    height: 1px;
    background: var(--background-modifier-border);
    z-index: 0;
}

.prayer-panel-title span {
    position: relative;
    z-index: 1;
    background: var(--background-primary);
    padding: 0 16px;
}

/* ── Hijri date & Reference button row ──────────────────────── */
.prayer-panel-header-row {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 10px;
    flex-wrap: wrap;
    width: 100%;
    order: 1;
}

.theme-light {.prayer-panel-hijri {background: #00000010 !important;}}
.theme-dark {.prayer-panel-hijri {background: #ffffff10 !important;}}
.prayer-panel-hijri {
    font-size: 13px;
    opacity: 0.9;
    cursor: pointer;
    flex: 0 1 auto;
    white-space: nowrap;
    padding: 12px 16px;
    border-radius: 6px;
    border: 1px solid var(--background-modifier-border);
    transition: background 0.15s;
}
.prayer-panel-hijri:hover {
    background: var(--background-modifier-hover);
}

.prayer-panel-ref-btn-container {
    display: flex;
    align-items: center;
    gap: 6px;
    flex-wrap: wrap;
    min-height: 32px;
    flex: 0 1 auto;
}

.theme-light {.prayer-ref-toggle-btn {background: #00000010 !important;}}
.theme-dark {.prayer-ref-toggle-btn {background: #ffffff10 !important;}}
.prayer-ref-toggle-btn {
    font-size: 13px;
    opacity: 0.9;
    cursor: pointer;
    flex: 0 1 auto;
    white-space: nowrap;
    padding: 8px 16px;
    border-radius: 6px;
    border: 1px solid var(--background-modifier-border);
    transition: background 0.15s;
}
.prayer-ref-toggle-btn:hover {
    background: var(--background-modifier-hover);
    transform: translateY(-1px);
}

/* RTL Support */
.prayer-rtl { direction: rtl; }

/* Prayer list */
.prayer-panel-list { margin: 8px 0 12px 0; }
.prayer-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 8px 10px;
    border-radius: 6px;
    margin-bottom: 2px;
    transition: background 0.2s ease;
}
.prayer-row:hover { background: var(--background-modifier-hover); }
.prayer-row-current { background: var(--interactive-accent-hover); font-weight: bold; }
.prayer-row-next { border-left: 4px dashed var(--interactive-accent);border-right: 2px dashed var(--interactive-accent);border-radius: 8px; }

.prayer-name { flex: 1; font-weight: 500; }
.prayer-time { font-family: var(--font-monospace); font-size: 0.95em; margin-left: 8px; }
.prayer-iqama { font-size: 0.75em; color: var(--text-muted); margin-left: 6px; }
.prayer-next-badge {
    font-size: 0.75em;
    background: var(--interactive-accent);
    color: var(--text-on-accent);
    padding-top: 3px;
    padding-right: 4px;
    padding-left: 4px;
    border-radius: 999px;
    margin-left: 2px;
}

.prayer-panel-reference { margin-bottom: 6px; }
.prayer-ref-label { font-size: 0.85em; color: var(--text-muted); padding: 4px 0; }
.prayer-loading { color: var(--text-muted); padding: 16px 0; text-align: center; }

/* Footer */
.prayer-panel-footer { border-top: 1px solid var(--background-modifier-border); padding-top: 10px; }

.prayer-footer-fetch {
    font-size: 11px;
    opacity: 0.6;
    text-align: center;
    font-family: var(--font-monospace);
    margin-bottom: 8px;
}

/* Fasting note */
.prayer-fasting-note {
    font-size: 0.85em;
    padding: 6px 10px;
    border-radius: 6px;
    margin-bottom: 8px;
    text-align: center;
    font-weight: 500;
    border: 1px solid transparent;
}
.prayer-fasting-note.default,
.prayer-fasting-note.recommended,
.prayer-fasting-note.mandatory,
.prayer-fasting-note.both-fast {
    background: linear-gradient(90deg, #ffd54f, #ffca28);
    color: #3e2723;
}
.theme-light :is(.prayer-fasting-note.both-fast,.prayer-fasting-note.default,.prayer-fasting-note.recommended,.prayer-fasting-note.mandatory) {background: linear-gradient(90deg, #00000011, #00000010);color: #5d4037;}
.prayer-fasting-note.forbidden-note,
.prayer-fasting-note.forbidden {
    background: linear-gradient(90deg, #ef5350, #e57373);
    color: #fff;
}
.prayer-fasting-note.mix-fast-forbid {
    background: linear-gradient(90deg, #ffe082 50%, #ef9a9a 50%);
    color: #3e2723;
}
.theme-light .prayer-fasting-note.mix-fast-forbid { background: linear-gradient(90deg, #00000010 50%, #ef9a9a 50%); color: #3e2723; }

.prayer-fasting-note.mix-forbid-fast {
    background: linear-gradient(90deg, #ef9a9a 50%, #ffe082 50%);
    color: #3e2723;
}
.theme-light .prayer-fasting-note.mix-forbid-fast { background: linear-gradient(90deg, #ef9a9a 50%, #00000010 50%); color: #3e2723; }

@media (prefers-color-scheme: dark) {
    .prayer-fasting-note.default,
    .prayer-fasting-note.recommended,
    .prayer-fasting-note.mandatory,
    .prayer-fasting-note.both-fast {
        background: linear-gradient(90deg, rgba(255,213,79,0.25), rgba(255,202,40,0.25));
        color: #fff9c4;
        border: 1px solid rgba(255,213,79,0.3);
    }
    .prayer-fasting-note.forbidden-note {
        background: linear-gradient(90deg, rgba(239,83,80,0.25), rgba(229,115,115,0.25));
        color: #ffcdd2;
        border: 1px solid rgba(239,83,80,0.3);
    }
    .prayer-fasting-note.mix-fast-forbid {
        background: linear-gradient(90deg, rgba(255,213,79,0.25) 50%, rgba(239,83,80,0.25) 50%);
        color: var(--text-normal);
        border: 1px solid rgba(255,255,255,0.1);
    }
    .prayer-fasting-note.mix-forbid-fast {
        background: linear-gradient(90deg, rgba(239,83,80,0.25) 50%, rgba(255,213,79,0.25) 50%);
        color: var(--text-normal);
        border: 1px solid rgba(255,255,255,0.1);
    }
}

/* Buttons row */
.prayer-footer-controls {
    display: flex;
    justify-content: center;
    gap: 4px;
    width: 100%;
    min-height: 40px;
}
.prayer-btn {
    flex: 1 1 auto;
    min-width: 60px;
    max-width: 100px;
    padding: 6px 4px;
    font-size: 11px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    text-align: center;
    border-radius: 999px;
    border: 1px solid var(--background-modifier-border);
    background: transparent;
    cursor: pointer;
    transition: all 0.2s ease;
}
.prayer-btn:hover {
    background: var(--background-modifier-hover);
    transform: translateY(-1px);
}

/* Fasting weekday buttons */
.fasting-weekdays {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    margin: 8px 0 12px 0;
}
.fasting-day-btn {
    padding: 6px 8px;
    border-radius: 6px;
    border: 1px solid var(--background-modifier-border);
    background: transparent;
    cursor: pointer;
    text-align: center;
    white-space: nowrap;
    font-size: 16px;
    transition: all 0.2s ease;
    min-width: 60px !important;
}
.fasting-day-btn.active {
    background: var(--interactive-accent);
    color: var(--text-on-accent);
}
.fasting-day-btn:hover { background: var(--background-modifier-hover); }

/* Settings tabs */
.prayer-settings-tabs {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(110px, 1fr));
    gap: 4px;
    border-bottom: 2px solid var(--background-modifier-border);
    padding-bottom: 15px;
    margin-bottom: 25px;
    background-color: var(--background-primary);
    z-index: 10;
}
.prayer-tab-btn,
.prayer-settings-tab-button {
    text-align: center;
    padding: 10px 5px;
    cursor: pointer;
    background: var(--background-secondary);
    border: 1px solid var(--background-modifier-border);
    border-radius: 4px;
    font-size: 0.85em;
    font-weight: 500;
    transition: all 0.2s ease;
    display: flex;
    align-items: center;
    justify-content: center;
}
.prayer-tab-btn:hover,
.prayer-settings-tab-button:hover { background: var(--background-modifier-hover); }
.prayer-tab-btn.active,
.prayer-settings-tab-button.active {
    background-color: var(--interactive-accent);
    color: var(--text-on-accent);
    border-color: var(--interactive-accent);
}

/* Stepper layout */
.prayer-stepper { display: flex; align-items: center; gap: 10px; }
.prayer-settings-section-header {
    margin-top: 20px;
    padding-bottom: 5px;
    border-bottom: 1px solid var(--background-modifier-border);
    color: var(--interactive-accent);
}

/* Reminder modal */
.prayer-reminder-modal {
    text-align: center;
    padding: 20px;
    max-width: 400px;
    margin: 0 auto;
    display: flex;
    flex-direction: column;
    justify-content: center;
    align-items: center;
}
.prayer-reminder-title    { margin-bottom: 10px; color: var(--text-muted); }
.prayer-reminder-message  { font-size: 1.1em; margin-bottom: 10px; text-align: left; width: 100%; }
.prayer-reminder-message p { margin: 0; text-align: center !important; }
.prayer-reminder-sub      { font-size: 0.9em; color: var(--text-faint); margin-bottom: 20px; word-break: break-all; }
.prayer-reminder-actions  { display: flex; justify-content: space-around; gap: 10px; width: 100%; }
.prayer-reminder-actions button:not(.postpone-arrow-btn) { min-width: 80px; }

/* Customizable postpone split button: arrow toggle + main button + dropdown */
.postpone-split-btn {
    position: relative;
    display: inline-flex;
    align-items: stretch;
    min-width: 0;
    margin-left: -28px;
}
.postpone-arrow-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 16px;
    min-width: 16px;
    padding: 0;
    border: 1px solid var(--background-modifier-border);
    border-right: none;
    border-radius: 999px 0 0 999px;
    background: transparent;
    color: var(--text-muted);
    cursor: pointer;
    flex-shrink: 0;
    transition: background 0.15s;
    margin-left: 28px;
}
.postpone-arrow-btn:hover { background: var(--background-modifier-hover); color: var(--text-normal); }
.postpone-arrow-icon {
    display: inline-block;
    transition: transform 0.15s ease;
}
.postpone-arrow-btn.postpone-arrow-open .postpone-arrow-icon {
    transform: rotate(90deg);
}
.postpone-main-btn {
    border-radius: 0 999px 999px 0;
    flex: 1 1 auto;
    min-width: 80px;
    padding-right: 50px !important;
}
.postpone-split-btn:active :is(.postpone-main-btn,.postpone-arrow-btn),
.postpone-split-btn:hover :is(.postpone-main-btn,.postpone-arrow-btn) {
    background-color: var(--background-modifier-hover);
}
.postpone-dropdown {
    position: absolute;
    bottom: calc(100% + 4px);
    left: 0;
    min-width: 100%;
    width: max-content;
    background: var(--background-primary);
    border: 1px solid var(--background-modifier-border);
    border-radius: 6px;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
    z-index: 50;
    overflow: hidden;
}
.postpone-dropdown-item {
    padding: 6px 12px;
    font-size: 0.85em;
    line-height: 1.4;
    white-space: nowrap;
    cursor: pointer;
    text-align: left;
    color: var(--text-normal);
}
.postpone-dropdown-item:hover { background: var(--background-modifier-hover); }
.prayer-rtl .postpone-dropdown-item { text-align: right; }
.prayer-rtl .postpone-arrow-btn {
    border-right: 1px solid var(--background-modifier-border);
    border-left: none;
    border-radius: 0 999px 999px 0;
}
.prayer-rtl .postpone-main-btn { border-radius: 999px 0 0 999px; }
.prayer-rtl .postpone-dropdown { left: auto; right: 0; }

/* Panel list markdown fixes */
.prayer-panel-list .prayer-name p { margin: 0; display: inline; }

/* Template textarea */
.setting-item textarea {
    width: 100%;
    min-height: 120px;
    font-family: var(--font-family-mono, monospace);
    font-size: 12px;
    padding: 8px;
    border-radius: 4px;
    border: 1px solid var(--background-modifier-border);
    background-color: var(--background-primary);
    color: var(--text-normal);
    resize: vertical;
}
.setting-item textarea[dir="rtl"] { direction: rtl; text-align: right; }

/* Template placeholder info */
.template-placeholder-info {
    font-size: 11px;
    color: var(--text-muted);
    margin-top: 4px;
    margin-bottom: 8px;
}
.template-placeholder-info code {
    background-color: var(--background-modifier-border);
    padding: 2px 4px;
    border-radius: 3px;
    font-family: var(--font-family-mono);
    font-size: 10px;
}

/* Template modal */
.prayer-template-modal {
    padding: 20px;
    max-width: 500px;
    max-height: 70vh;
    overflow: hidden;
    display: flex;
    flex-direction: column;
}
.prayer-modal-title     { margin-bottom: 15px; color: var(--text-normal); }
.template-search-container { margin-bottom: 15px; }
.template-search-input {
    width: 100%;
    padding: 8px 12px;
    border-radius: 4px;
    border: 1px solid var(--background-modifier-border);
    background: var(--background-primary);
    color: var(--text-normal);
    font-size: 14px;
}
.template-file-list {
    flex: 1;
    overflow-y: auto;
    max-height: 400px;
    border: 1px solid var(--background-modifier-border);
    border-radius: 4px;
    padding: 5px;
    background: var(--background-primary);
}
.template-file-item {
    padding: 10px;
    cursor: pointer;
    border-radius: 4px;
    margin-bottom: 3px;
    transition: background 0.2s ease;
}
.template-file-item:hover { background: var(--background-modifier-hover); }
.template-file-path {
    font-family: var(--font-family-mono);
    font-size: 12px;
    word-break: break-all;
    color: var(--text-muted);
}
.template-no-files { padding: 20px; text-align: center; color: var(--text-muted); font-style: italic; }
.prayer-modal-cancel {
    margin-top: 15px;
    padding: 8px 16px;
    background: transparent;
    border: 1px solid var(--background-modifier-border);
    border-radius: 4px;
    cursor: pointer;
    width: 100%;
    transition: background 0.2s ease;
}
.prayer-modal-cancel:hover { background: var(--background-modifier-hover); }

/* ── Responsive adjustments ──────────────────────────────────── */
@media (max-width: 768px) {
    .prayer-row { padding: 12px 10px; }
    .prayer-panel-title { font-size: 20px; }
    .prayer-panel-hijri { font-size: 16px; }
    .prayer-btn { min-width: 70px; padding: 8px 6px; font-size: 12px; }
}

@media (max-width: 480px) {
    .prayer-panel-title {
        font-size: 16px;
        padding: 0 12px;
    }
    .prayer-panel-title span {
        padding: 0 12px;
    }
    .prayer-panel-hijri {
        font-size: 11px;
        padding: 3px 8px;
    }
    .prayer-ref-toggle-btn {
        font-size: 11px;
        padding: 4px 10px;
        max-width: 130px;
        min-width: 60px;
    }
    .prayer-panel-header-row {
        gap: 6px;
    }
    .fasting-weekdays { gap: 3px; }
    .fasting-day-btn { flex: 0 1 calc(25% - 3px); min-width: auto; max-width: none; font-size: 10px; }
}

@media (max-width: 360px) {
    .prayer-panel-title {
        font-size: 14px;
        padding: 0 8px;
    }
    .prayer-panel-title span {
        padding: 0 8px;
    }
    .prayer-panel-hijri {
        font-size: 10px;
        padding: 2px 6px;
    }
    .prayer-ref-toggle-btn {
        font-size: 10px;
        padding: 3px 8px;
        max-width: 100px;
        min-width: 50px;
    }
}

@media (max-width: 300px) {
    .prayer-footer-controls { gap: 3px; }
    .prayer-btn { min-width: 50px; padding: 5px 3px; font-size: 10px; }
}

@media (max-width: 200px) {
    .prayer-footer-controls { gap: 2px; }
    .prayer-btn { min-width: 45px; padding: 4px 2px; font-size: 9px; }
}

@media (max-width: 1768px) {
    .fasting-weekdays { gap: 4px; justify-content: center; }
    .fasting-day-btn {
        flex: 0 1 calc(14.28% - 4px);
        min-width: 35px;
        max-width: 600px;
        padding: 5px 4px;
        font-size: 11px;
    }
}

@media (max-width: 320px) {
    .fasting-weekdays { gap: 2px; }
    .fasting-day-btn { flex: 0 1 calc(33.33% - 2px); font-size: 9px; }
}

/* ── Feature 4: Reminder Dashboard Modal ────────────────────── */
.prayer-dashboard-modal {
    display: flex;
    flex-direction: column;
    height: 85vh;
    max-height: 85vh;
    padding: 0;
    overflow: hidden;
}

.dashboard-header {
    padding: 20px 24px 12px;
    border-bottom: 1px solid var(--background-modifier-border);
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: 12px;
    flex-shrink: 0;
}
.dashboard-title    { margin: 0; font-size: 1.3em; font-weight: 700; flex: 1 1 auto; }
.dashboard-subtitle { margin: 0; font-size: 0.85em; color: var(--text-muted); flex: 1 1 100%; }

.dashboard-mark-all-btn {
    padding: 6px 14px;
    border-radius: 6px;
    border: 1px solid var(--background-modifier-border);
    background: transparent;
    cursor: pointer;
    font-size: 0.82em;
    white-space: nowrap;
    transition: background 0.2s;
}
.dashboard-mark-all-btn:hover { background: var(--background-modifier-hover); }

/* Scrollable list - 3-column grid */
.dashboard-list {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 15px;
    padding: 16px 24px;
    overflow-y: auto;
    flex: 1 1 auto;
    align-content: start;
}

.dashboard-empty {
    grid-column: 1 / -1;
    text-align: center;
    padding: 40px 0;
    color: var(--text-muted);
    font-size: 1.1em;
}

/* Each reminder card - NO max-height restrictions */
.dashboard-row {
    display: flex;
    flex-direction: column;
    padding: 14px 16px;
    border-radius: 8px;
    border: 1px solid var(--background-modifier-border);
    background: var(--background-primary-alt);
    gap: 8px;
    min-width: 0;
    height: auto;
    overflow: visible;
}

/* Time badge */
.dashboard-time {
    font-family: var(--font-monospace);
    font-size: 0.75em;
    color: var(--text-muted);
    white-space: nowrap;
    background: var(--background-primary);
    padding: 2px 10px;
    border-radius: 999px;
    border: 1px solid var(--background-modifier-border);
    align-self: flex-start;
    flex-shrink: 0;
}

/* Reminder text - wraps naturally */
.dashboard-text {
    font-size: 0.9em;
    line-height: 1.5;
    word-wrap: break-word;
    overflow-wrap: break-word;
    word-break: break-word;
    hyphens: auto;
    flex: 0 1 auto;
}
.dashboard-text p { margin: 0 0 0.2em 0; display: inline; }
.dashboard-text p:last-child { margin-bottom: 0; }

/* Action buttons - two buttons taking equal width in one row */
.dashboard-actions {
    display: grid;
    grid-template-columns: 0.5fr 1.5fr;
    gap: 6px;
    margin-top: auto;
    padding-top: 8px;
    border-top: 1px solid var(--background-modifier-border);
    flex-shrink: 0;
}
.dashboard-action-btn {
    padding: 6px 8px;
    font-size: 0.78em;
    border-radius: 6px;
    border: 1px solid var(--background-modifier-border);
    background: transparent;
    cursor: pointer;
    transition: background 0.15s;
    white-space: nowrap;
    text-align: center;
    width: 100%;
    overflow: hidden;
    text-overflow: ellipsis;
}
.dashboard-action-btn:hover { background: var(--background-modifier-hover); }
.dashboard-action-btn.mod-cta {
    background: var(--interactive-accent);
    color: var(--text-on-accent);
    border-color: var(--interactive-accent);
}
.dashboard-action-btn.mod-cta:hover { opacity: 0.9; }

/* Postpone split button inside the dashboard's 2-column action grid */
.dashboard-actions .postpone-main-btn { padding-right: 0px; border-radius: 9px 0 0 9px; }
.dashboard-actions .postpone-split-btn { max-width: 75% !important; }
.dashboard-actions .postpone-arrow-btn {
    border-radius: 0 9px 9px 0;
    margin-left: 0px !important;
    width: auto;
}
/* Hide play and mute buttons completely */
.dashboard-mute-btn {
    display: none !important;
}

/* Footer */
.dashboard-footer {
    padding: 12px 24px;
    border-top: 1px solid var(--background-modifier-border);
    display: flex;
    justify-content: flex-end;
    flex-shrink: 0;
}
.dashboard-close-btn {
    padding: 8px 20px;
    border-radius: 6px;
    font-size: 0.9em;
    cursor: pointer;
    border: none;
    background: var(--interactive-accent);
    color: var(--text-on-accent);
    transition: opacity 0.2s;
}
.dashboard-close-btn:hover { opacity: 0.85; }

/* RTL tweaks */
.prayer-rtl .dashboard-row { direction: rtl; }
.prayer-rtl .dashboard-time { font-family: var(--font-monospace); }

/* ── Responsive: adjust columns on smaller screens ── */
@media (max-width: 900px) {
    .dashboard-list {
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 12px;
        padding: 12px 16px;
    }
}

@media (max-width: 550px) {
    .dashboard-list {
        grid-template-columns: 1fr;
        gap: 10px;
        padding: 10px 12px;
    }
    .dashboard-row {
        padding: 12px 14px;
    }
    .dashboard-text {
        font-size: 0.85em;
    }
    .dashboard-actions {
        gap: 5px;
    }
    .dashboard-action-btn {
        padding: 5px 8px;
        font-size: 0.75em;
    }
}

@media (max-width: 380px) {
    .dashboard-list {
        padding: 8px 8px;
        gap: 8px;
    }
    .dashboard-row {
        padding: 10px 10px;
    }
    .dashboard-time {
        font-size: 0.65em;
        padding: 1px 6px;
    }
    .dashboard-text {
        font-size: 0.8em;
    }
    .dashboard-action-btn {
        padding: 4px 6px;
        font-size: 0.7em;
    }
}

@media (max-width: 600px) {
    .dashboard-row {
        grid-template-columns: 1fr;
        grid-template-rows: auto auto auto;
    }
    .dashboard-actions { flex-wrap: wrap; }
}

/* ── Feature 5: Dismiss button on prayer-panel reminder rows ── */
.reminder-panel-row {
    position: relative;
}
.reminder-dismiss-btn {
    flex-shrink: 0;
    margin-left: 6px;
    width: 22px;
    height: 22px;
    padding: 0;
    line-height: 20px;
    text-align: center;
    font-size: 14px;
    font-weight: 700;
    border-radius: 50%;
    border: 1px solid var(--background-modifier-border);
    background: transparent;
    color: var(--text-muted);
    cursor: pointer;
    opacity: 0;
    transition: opacity 0.15s, background 0.15s, color 0.15s;
    pointer-events: none;
}
.prayer-row:hover .reminder-dismiss-btn {
    opacity: 1;
    pointer-events: auto;
}
.reminder-dismiss-btn:hover {
    background: var(--background-modifier-error);
    color: var(--text-on-accent);
    border-color: transparent;
}

/* ── Feature 6: Reminder Panel View ─────────────────────────── */
.reminder-panel-container {
    display: flex;
    flex-direction: column;
    height: 100%;
    padding: 0;
    font-family: var(--font-family);
    color: var(--text-normal);
    overflow: hidden;
}

.reminder-panel-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 12px 14px 8px;
    border-bottom: 1px solid var(--background-modifier-border);
    gap: 8px;
    flex-shrink: 0;
}
.reminder-panel-title {
    font-size: 15px;
    font-weight: 600;
    flex: 1 1 auto;
}

/* Today / All toggle */
.reminder-panel-filter-toggle {
    display: flex;
    gap: 4px;
    flex-shrink: 0;
}
.reminder-filter-btn {
    padding: 3px 10px;
    border-radius: 999px;
    border: 1px solid var(--background-modifier-border);
    background: transparent;
    color: var(--text-muted);
    font-size: 11px;
    cursor: pointer;
    transition: background 0.15s, color 0.15s;
}
.reminder-filter-btn.active {
    background: var(--interactive-accent);
    color: var(--text-on-accent);
    border-color: var(--interactive-accent);
}
.reminder-filter-btn:hover:not(.active) {
    background: var(--background-modifier-hover);
    color: var(--text-normal);
}

/* Scrollable list */
.reminder-panel-list {
    flex: 1 1 auto;
    overflow-y: auto;
    padding: 8px 10px;
}

.reminder-panel-empty {
    text-align: center;
    padding: 32px 0;
    color: var(--text-muted);
    font-size: 0.9em;
    font-style: italic;
}

/* "All" view: file section headers */
.reminder-panel-section {
    margin-bottom: 10px;
}
.reminder-panel-section-label {
    font-size: 0.75em;
    font-weight: 600;
    color: var(--text-muted);
    text-transform: uppercase;
    letter-spacing: 0.05em;
    padding: 4px 6px 2px;
    border-bottom: 1px solid var(--background-modifier-border);
    margin-bottom: 4px;
}

/* Individual reminder row */
.reminder-panel-row {
    display: flex;
    align-items: flex-start;
    gap: 8px;
    padding: 7px 8px;
    border-radius: 6px;
    margin-bottom: 3px;
    cursor: pointer;
    transition: background 0.15s;
}
.reminder-panel-row:hover {
    background: var(--background-modifier-hover);
}
.reminder-panel-row-done {
    opacity: 0.45;
}

.reminder-panel-time {
    font-family: var(--font-monospace);
    font-size: 0.78em;
    color: var(--text-muted);
    white-space: nowrap;
    background: var(--background-primary);
    border: 1px solid var(--background-modifier-border);
    border-radius: 999px;
    padding: 1px 7px;
    flex-shrink: 0;
    margin-top: 2px;
}

.reminder-panel-text {
    flex: 1 1 auto;
    font-size: 0.88em;
    line-height: 1.4;
    word-break: break-word;
    min-width: 0;
}
.reminder-panel-text p { margin: 0; display: inline; }

/* Action buttons per row */
.reminder-panel-actions {
    display: flex;
    gap: 4px;
    flex-shrink: 0;
    align-items: center;
    opacity: 0;
    transition: opacity 0.15s;
    pointer-events: none;
}
.reminder-panel-row:hover .reminder-panel-actions {
    opacity: 1;
    pointer-events: auto;
}
.reminder-panel-btn {
    padding: 3px 9px;
    font-size: 0.78em;
    border-radius: 5px;
    border: 1px solid var(--background-modifier-border);
    background: transparent;
    cursor: pointer;
    white-space: nowrap;
    transition: background 0.12s;
}
.reminder-panel-btn:hover { background: var(--background-modifier-hover); }
.reminder-panel-btn-done {
    background: var(--interactive-accent);
    color: var(--text-on-accent);
    border-color: var(--interactive-accent);
}
.reminder-panel-btn-done:hover { opacity: 0.85; background: var(--interactive-accent); }
.reminder-panel-btn-dismiss:hover {
    background: var(--background-modifier-error);
    color: var(--text-on-accent);
    border-color: transparent;
}
.reminder-panel-row {
    position: relative;
    padding-right: 8px;
}
.reminder-panel-actions {
    display: none;
    position: absolute; 
    right: 8px;
    top: 50%;
    transform: translateY(-50%);
    background: var(--background-primary);
    border: 1px solid var(--background-modifier-border);
    border-radius: 6px;
    padding: 4px 6px;
    gap: 4px;
    z-index: 10;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
    white-space: nowrap;
}
.reminder-panel-row:hover .reminder-panel-actions {
    display: flex;
}
.reminder-panel-text {
    flex: 1;
    min-width: 0;
    word-break: break-word;
    overflow-wrap: break-word;
    white-space: normal;
    padding-right: 4px;
}

/* RTL */
.prayer-rtl .reminder-panel-row  { direction: rtl; }
.prayer-rtl .reminder-panel-actions { direction: ltr !important; right: auto; left: 2px; }
.prayer-rtl .reminder-panel-time { font-family: var(--font-monospace); }
`;