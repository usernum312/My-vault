const {
	Notice,
	Plugin,
	PluginSettingTab,
	Setting,
	TFile,
	ItemView,
	Modal,
	MarkdownRenderer,
	MarkdownView
} = require("obsidian");

const VIEW_TYPE_PRAYER = "prayer-panel-view";

/**
 * Translations Dictionary
 */
const TRANSLATIONS = {
	en: {
		// General / UI
		appName: "Prayer Times",
		loading: "Loading...",
		hijri: "Hijri",
		reference: "Reference",
		next: "next",
		fetchNow: "Fetch Now",
		playAthan: "Play Athan",
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
		reminderPostpone: "Postpone (15m)",
		reminderNotificationTitle: "Reminder",
		noUpcomingReminders: "No upcoming reminders for today.",
		reminderAudio: "Reminder audio file",
		reminderAudioDesc: "Path inside vault (e.g. Sounds/alarm.mp3)",

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
		audiofile: "Audio Files",
		athanAudio: "Athan audio file",
		athanAudioDesc: "Path inside vault (e.g. Sounds/athan.mp3)",
		preAthanAudio: "Pre-Athan audio file",
		preAthanAudioDesc: "Custom audio for pre-Athan preview (falls back to Athan if empty)",
		iqamaAudio: "Iqama audio file",
		iqamaAudioDesc: "Custom audio for iqama (falls back to Athan if empty)",
		fastingAudio: "Fasting audio file",
		fastingAudioDesc: "Path for fasting alert (falls back to Athan if empty)",
		enableFor: "Enable Athan For",
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

		// edit Prayers
		offsetsSection: "Prayer Time Offsets (minutes)",
		offsetsDesc: "Add or subtract minutes from the calculated times (e.g., -2 or 5)",

		// reference
		ref_midnight: "Midnight",
		ref_lastThird: "Last Third",
		ref_sunrise: "Sunrise",
		ref_reminders: "Reminders",

		// Islamic note
		islamicnote: "Islamic Notes",
		enabled: "Enable Islamic notes",
		enabledesc: "Create/open a Islamic note from the Hijri/status bar (toggle on/off)",
		folderpath: "Islamic notes folder",
		folderpathdesc: "Folder where Islamic notes are created (e.g. 'Daily' or 'Journal/Notes'",
		dateformat: "Islamic note date format",
		dateformatdesc: "Choose how the Hijri date is displayed",
		notedateformat: "Islamic note date format",
		notedateformatdesc: "Choose which date(s) to include in the note filename and header",
		
		// Note Templates
		noteTemplate: "Note Template",
		noteTemplateDesc: "Customize the content of Islamic notes.",
		NoteTemplate: "Note Template (english)",
		templateResetNotice: "Template reset to default",
		autoOpenIslamicName: "Auto-open Islamic note on startup",
		autoOpenIslamicDesc: "Automatically create/open the daily Islamic note when Obsidian starts.",

		// Islamic Note Content
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
		
		// NEW: Fasting Logic
		note_forbidden: "Fasting is forbidden",
		note_forbidden_msg: "Fasting is forbidden {day} due to {event}",
		note_fasting_reason: "Fast {day} due to {event}",
		note_ramadan: "Ramadan Kareem",

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
	},
	ar: {
		// General / UI
		appName: "مواقيت الصلوات",
		loading: "جاري التحميل...",
		hijri: "هجري",
		reference: "المرجع",
		next: "متبقية",
		fetchNow: "تحديث الآن",
		playAthan: "تشغيل الآذان",
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
		reminderPostpone: "تأجيل (15د)",
		reminderNotificationTitle: "تذكير",
		noUpcomingReminders: "لا توجد تذكيرات قادمة اليوم.",
		reminderAudio: "ملف صوت التذكيرات",
		reminderAudioDesc: "المسار داخل الخزنة (مثال: Sounds/alarm.mp3)",

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
		audiofile: "ملفات الأصوات",
		athanAudio: "ملف صوت الآذان",
		athanAudioDesc: "المسار داخل الخزنة (مثال: Sounds/athan.mp3)",
		preAthanAudio: "ملف صوت تنبيه ما قبل الآذان",
		preAthanAudioDesc: "صوت مخصص للتنبيه (يستخدم الآذان إذا كان فارغاً)",
		iqamaAudio: "ملف صوت الإقامة",
		iqamaAudioDesc: "صوت مخصص للإقامة (يستخدم الآذان إذا كان فارغاً)",
		fastingAudio: "ملف صوت الصيام",
		fastingAudioDesc: "المسار لتنبيه الصيام (يستخدم الآذان إذا كان فارغاً)",
		enableFor: "تفعيل الآذان لـ",
		enablePreAthan: "تفعيل تنبيه قرب الآذان",
		enableIqama: "تفعيل خصائص الإقامة",
		enableIqamaDesc: "مفتاح رئيسي لتفعيل أو تعطيل جميع مؤقتات وصوتيات الإقامة",
		enablePreAthanDesc: "عرض تنبيه وتشغيل صوت قصير قبل الصلاة",
		preAthanOffset: "وقت التنبيه (بالدقائق)",
		preAthanOffsetDesc: "كم دقيقة قبل الصلاة يتم التشغيل",
		iqamaSection: "الإقامة (دقائق بعد الصلاة)",
		iqamaDesc: "تفعيل ل",
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
		displayRefDesc: "اختر الوقت المرجعي للعرض في اللوحة (منتصف الليل، الثلث الأخير، الشروق)",
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
		
		// edit Prayers
		offsetsSection: "تعديل مواقيت الصلاة (بالدقائق)",
		offsetsDesc: "إضافة أو إنقاص دقائق من المواقيت المحسوبة (مثال: -2 أو 5)",
		
		// days
		Sun: "الأحد",
		Mon: "الاثنين",
		Tue: "الثلاثاء",
		Wed: "الأربعاء",
		Thu: "الخميس",
		Fri: "الجمعة",
		Sat: "السبت",

		// reference
		ref_midnight: "منتصف الليل",
		ref_lastThird: "الثلث الأخير",
		ref_sunrise: "الشروق",
		ref_reminders: "التذكيرات",

		// Islamic Notes
		islamicnote: "ملاحظات اسلامية",
		enabled: "تفعيل الملاحظات الإسلامية",
		enabledesc: "إنشاء/فتح ملاحظة إسلامية من شريط الحالة/الهجري (تشغيل/إيقاف)",
		folderpath: "مسار مجلد الملاحظات الإسلامية",
		folderpathdesc: "(المجلد الذي تُنشأ فيه الملاحظات الإسلامية (مثل 'يومي' أو 'مذكرات/يوميات",
		dateformat: "تنسيق التاريخ الهجري",
		dateformatdesc: "اختر طريقة عرض التاريخ الهجري",
		notedateformat: "تنسيق تاريخ الملاحظة الإسلامية",
		notedateformatdesc: "اختر التاريخ (التواريخ) المراد تضمينها في اسم ملف الملاحظة وعنوانها",
		// Note Templates
		noteTemplate: "قالب الملاحظة",
		noteTemplateDesc: "تخصيص محتوى الملاحظات الإسلامية.",
		NoteTemplate: "قالب الملاحظة (عربية)",
		templateResetNotice: "تم إعادة القالب الافتراضي",
		autoOpenIslamicName: "فتح الملاحظة فور فتح تشغيل التطبيق",
		autoOpenIslamicDesc: "إنشاء/فتح الملاحظة الإسلامية اليومية تلقائيًا عند  تشغيل اوبسيديان.",

		// Islamic Note Content
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

		// NEW: Fasting Logic
		note_forbidden: "الصيام محرم",
		note_forbidden_msg: "يحرم الصيام {day} بسبب {event}",
		note_fasting_reason: "صيام {day} بسبب {event}",
		note_ramadan: "رمضان كريم",

		// more settings
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
	}
};

/**
 * Named calculation methods mapped to AlAdhan API numbers.
 */

const METHOD_OPTIONS = [
  { id: -1, label: "Auto / Default (Based on Location)", labelAr: "تلقائي / افتراضي (بناءً على الموقع)" },
  { id: 1, label: "University of Islamic Sciences, Karachi", labelAr: "جامعة العلوم الإسلامية، كراتشي" },
  { id: 2, label: "Islamic Society of North America (ISNA)", labelAr: "الجمعية الإسلامية لأمريكا الشمالية (ISNA)" },
  { id: 3, label: "Muslim World League", labelAr: "رابطة العالم الإسلامي" },
  { id: 4, label: "Umm Al-Qura University (Makkah)", labelAr: "جامعة أم القرى (مكة المكرمة)" },
  { id: 5, label: "Egyptian General Authority of Survey", labelAr: "الهيئة المصرية العامة للمساحة" },
  { id: 7, label: "Institute of Geophysics, Tehran", labelAr: "معهد الجيوفيزياء، جامعة طهران" },
  { id: 8, label: "Gulf Region", labelAr: "منطقة الخليج" },
  { id: 9, label: "Kuwait", labelAr: "الكويت" },
  { id: 10, label: "Qatar", labelAr: "قطر" },
  { id: 11, label: "Majlis Ugama Islam Singapura", labelAr: "مجلس الشريعة الإسلامية (سنغافورة)" },
  { id: 12, label: "Union Organization Islamic de France", labelAr: "الاتحاد الإسلامي الفرنسي" },
  { id: 13, label: "Turkey (Diyanet)", labelAr: "تركيا (رئاسة الشؤون الدينية)" },
  { id: 14, label: "Spiritual Administration of Muslims of Russia", labelAr: "إدارة المسلمين في روسيا" },
  { id: 15, label: "Moonsighting Committee Worldwide", labelAr: "لجنة رؤية الهلال العالمية" },
  { id: 16, label: "Dubai (Unofficial)", labelAr: "دبي (غير رسمي)" },
];
/**
 * Countries dataset — top-level so all code can access it.
 */
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
/**
 * Default settings
 */
const DEFAULT_SETTINGS = {
	language: "en",
	// --- NEW: Location Mode Settings ---
	locationMode: "auto", // "auto" (City/Country) or "manual" (Lat/Long)
	latitude: "",
	longitude: "",
	// -----------------------------------
	city: "",
	country: "",
	method: -1,
	athanAudioPath: "",
	hijriDateFormat: "iso",
	// Pre-Athan
	enablePreAthan: true,
	preAthanOffsetMinutes: 10,
	preAthanAudioPath: "",
	// Iqama
	enableIqamaFeature: false,
	iqamaMinutes: { Fajr: 10, Dhuhr: 5, Asr: 5, Maghrib: 5, Isha: 5 },
	iqamaEnabled: { Fajr: false, Dhuhr: false, Asr: false, Maghrib: false, Isha: false }, // Default off, or set true if you prefer
	iqamaAudioPath: "",
	// Enabled prayers
	enabledPrayers: { Fajr: true, Dhuhr: true, Asr: true, Maghrib: true, Isha: true },
	// edit prayers
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
		morning: { enabled: false, reference: "sunrise", direction: "after", offsetMinutes: 5, audioPath: "" },
		evening: { enabled: false, reference: "sunset", direction: "before", offsetMinutes: 10, audioPath: "" },
		night: { enabled: false, reference: "Isha", direction: "after", offsetMinutes: 5, audioPath: "" }
	},
	// UI / reliability
	enableStatusBar: true,
	enableOfflineFallback: true,
	tryWakeLockOnMobile: true,
	showSystemNotification: true,
	displayReference: "lastThird",
	// cached persistence
	cached: { prayerTimes: {}, hijri: null, fetchedAtISO: null },
	// daily notes
	enableDailyNotes: true,
	dailyNotesFolder: "deen",
	dailyNotesDateFormat: "both",
	autoOpenIslamicNoteOnStartup: false,
	// Note Templates - UPDATED
	englishNoteTemplate: "",
	englishNoteTemplatePath: "",
	englishNoteTemplateMode: "text",
	arabicNoteTemplate: "",
	arabicNoteTemplatePath: "",
	arabicNoteTemplateMode: "text",
	// Reminder feature
	enableReminders: false,
	reminderAudioPath: "",
};

module.exports = class PrayerAthanPlugin extends Plugin {
	async onload() {
		await this.loadSettings();
		// Initialize runtime fields
		this.audio = null;
		this._currentAudioURL = null;
		this.prayerTimes = Object.assign({}, this.settings.cached?.prayerTimes || {});
		this.hijri = this.settings.cached?.hijri || null;
		this.fetchedAt = this.settings.cached?.fetchedAtISO ? new Date(this.settings.cached.fetchedAtISO) : null;
		this.lastTriggered = { athan: null, reminder: null, iqama: null, fasting: null, supplication: null, holyDayNotifiedDate: null };
		this.wakeLock = null;
		
		// Reminder System Initialization
		this.reminders = new Map(); // Key: FilePath, Value: List of Reminders
		this.ignoredReminders = new Set(); // Runtime cache of muted reminders

		// Register UI, view, commands
		this.addSettingTab(new PrayerSettingTab(this.app, this));
		if (this.settings.enableStatusBar) {
			this.statusBarEl = this.addStatusBarItem();
			this.updateStatusBar();
		}
		this.registerView(VIEW_TYPE_PRAYER, (leaf) => new PrayerPanelView(leaf, this));

		// English commands
		this.addCommand({ id: "open-prayer-panel", name: "Open Prayer Panel", callback: () => this.activatePrayerPanel() });
		this.addCommand({ id: "prayer-fetch-now", name: "Fetch Prayer Times Now", callback: async () => { await this.fetchPrayerTimes(true); new Notice(this.t("fetchRequested")); }});
		this.addCommand({ id: "prayer-play-now", name: "Play Athan (manual)", callback: async () => { await this.playAthan("Manual"); }});
		this.addCommand({ id: "prayer-stop-now", name: "Stop Athan", callback: () => this.stopAthan() });
		this.addCommand({ id: "create-islamic-note", name: "Create Islamic Daily Note", callback: async () => { await this.createOrOpenHijriDailyNote(); }});

		this.injectCSS();

		this.app.workspace.onLayoutReady(async () => {
    // أولاً: استخدام البيانات المخزنة فوراً (إن وجدت)
    const todayIndex = new Date().getDate() - 1;
    const todayData = this.settings.cached?.monthTimes?.[todayIndex];
    if (todayData) {
        this._processDayData(todayData);
        this.updateStatusBar();
        this.refreshPrayerPanel();
        console.log("Loaded cached data on startup");
    }
    
    // ثانياً: التحقق من الحاجة للتحديث في الخلفية
    if (this._needsMonthUpdate()) {
        console.log("Background fetch needed");
        // نؤدي التحديث في الخلفية بعد ثانيتين
        setTimeout(async () => {
            await this.fetchPrayerTimes(true);
        }, 2000);
    } else {
        console.log("Using cached data, no fetch needed");
    }
			
			if (this.settings.tryWakeLockOnMobile) console.log("Prayer Times: Wake Lock enabled.");
			
			// Initialize Reminders if enabled
			if (this.settings.enableReminders) {
				await this.scanVaultForReminders();
				this.registerEvent(this.app.vault.on("modify", (file) => this.scanFileForReminders(file)));
				this.registerEvent(this.app.vault.on("delete", (file) => this.reminders.delete(file.path)));
				this.registerEvent(this.app.vault.on("rename", (file, oldPath) => {
					if (this.reminders.has(oldPath)) {
						this.reminders.set(file.path, this.reminders.get(oldPath));
						this.reminders.delete(oldPath);
					}
				}));
			}

			// Auto‑open Islamic note on startup if enabled
			if (this.settings.autoOpenIslamicNoteOnStartup) {
				setTimeout(() => {
					this.createOrOpenHijriDailyNote();
				}, 1000);
			}
		});

		// Register intervals — tuned for better battery usage
		this.registerInterval(window.setInterval(() => {
			this.checkPrayerSchedules();
			if(this.settings.enableReminders) this.checkReminders();
		}, 60_000)); // دقيقة واحدة بدلاً من 30 ثانية
		
		this.registerInterval(window.setInterval(() => { this.updateStatusBar(); this.refreshPrayerPanel(); }, 5_000)); // 5s UI refresh
		
		// منتصف الليل: التبديل إلى اليوم التالي من البيانات المخزنة
		this.registerInterval(window.setInterval(() => {
			const now = new Date();
			if (now.getHours() === 0 && now.getMinutes() === 0) {
				const todayIndex = now.getDate() - 1;
				if (this.settings.cached && 
					Array.isArray(this.settings.cached.monthTimes) && 
					this.settings.cached.monthTimes.length > todayIndex) {
					
					const todayData = this.settings.cached.monthTimes[todayIndex];
					if (todayData) {
						this._processDayData(todayData);
						this.lastTriggered = { 
							athan: null, 
							reminder: null, 
							iqama: null, 
							fasting: null, 
							supplication: null, 
							holyDayNotifiedDate: null 
						};
					}
				}
			}
		}, 60_000));
		
		this._lastSixHourRefresh = Date.now();
		this.registerInterval(window.setInterval(() => {
			const sixHours = 1000 * 60 * 60 * 6;
			if (Date.now() - this._lastSixHourRefresh > sixHours) {
				this._lastSixHourRefresh = Date.now();
				// تحديث كل 6 ساعات فقط إذا كان الشهر قد تغير أو مر وقت طويل
				if (this._needsMonthUpdate()) {
					this.fetchPrayerTimes();
				}
			}
		}, 60_000));
	}

	onunload() {
		this.app.workspace.getLeavesOfType(VIEW_TYPE_PRAYER).forEach(l => l.detach());
		this.releaseWakeLock();
		this.stopAthan();
	}

	/* ---------------------------
	   i18n helpers
	----------------------------*/
	t(key, params = {}) {
		const lang = this.settings.language || "en";
		let str = (TRANSLATIONS[lang] && TRANSLATIONS[lang][key]) || TRANSLATIONS["en"][key] || key;
		for (const k in params) str = str.replace(`{${k}}`, params[k]);
		return str;
	}
	
	tPrayer(englishName) {
		if (englishName === "Manual") return this.t("manual");
		return this.t(englishName) || englishName;
	}

	/* ---------------------------
	   Country helper
	----------------------------*/
	getCountryParam(countrySettingValue) {
		if (!countrySettingValue) return "";
		const v = String(countrySettingValue).trim();

		if (v.length === 2) {
			const match = COUNTRIES.find(c => c.code.toUpperCase() === v.toUpperCase());
			if (match) return match.en;
			return v;
		}

		const found = COUNTRIES.find(c => c.en.toLowerCase() === v.toLowerCase() || c.ar === v);
		return found ? found.en : v;
	}

	/* ---------------------------
	   Fetching & caching - محدث لجلب الشهر كاملاً
	----------------------------*/
	async fetchPrayerTimes(force = false) {
    const now = new Date();
    const todayIndex = now.getDate() - 1; // رقم اليوم (0-30)
    const currentMonth = now.getMonth() + 1; // الشهر الحالي (1-12)
    const currentYear = now.getFullYear(); // السنة الحالية

    // 1. التحقق من وجود بيانات مخزنة وصلاحيتها للشهر الحالي
    if (
        !force &&
        this.settings.cached &&
        Array.isArray(this.settings.cached.monthTimes) &&
        this.settings.cached.monthTimes.length > todayIndex &&
        this.settings.cached.fetchedAtISO
    ) {
        const fetchedAt = new Date(this.settings.cached.fetchedAtISO);
        
        // التحقق: هل البيانات المخزنة تنتمي لنفس الشهر والسنة الحالية؟
        const isSameMonth = (fetchedAt.getMonth() + 1) === currentMonth;
        const isSameYear = fetchedAt.getFullYear() === currentYear;

        if (isSameMonth && isSameYear) {
            // استخدام البيانات المخزنة فوراً دون عمل fetch
            const todayData = this.settings.cached.monthTimes[todayIndex];
            if (todayData && todayData.timings) {
                this._processDayData(todayData);
                this.updateStatusBar();
                this.refreshPrayerPanel();
                this._checkHolyDayNotification();
                console.log("Using cached monthly data for " + currentMonth + "/" + currentYear);
                return; // إنهاء الدالة هنا
            }
        }
    }

    // 2. إذا لم تكن البيانات موجودة أو كانت لشهر قديم، نقوم بجلبها من الإنترنت
    try {
        const methodParam =
            (this.settings.method === -1)
                ? ""
                : `&method=${this.settings.method}`;

        let url = "";

        if (this.settings.locationMode === "manual") {
            if (!this.settings.latitude || !this.settings.longitude) {
                new Notice(
                    this.settings.language === "ar"
                        ? "يرجى إدخال خطوط العرض والطول"
                        : "Please enter Latitude and Longitude"
                );
                return;
            }

            url =
                `https://api.aladhan.com/v1/calendar` +
                `?latitude=${this.settings.latitude}` +
                `&longitude=${this.settings.longitude}` +
                `${methodParam}` +
                `&month=${currentMonth}` +
                `&year=${currentYear}`;
        } else {
            const countryParam = this.getCountryParam(this.settings.country);
            url =
                `https://api.aladhan.com/v1/calendarByCity` +
                `?city=${encodeURIComponent(this.settings.city)}` +
                `&country=${encodeURIComponent(countryParam)}` +
                `${methodParam}` +
                `&month=${currentMonth}` +
                `&year=${currentYear}`;
        }

        const res = await fetch(url);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);

        const json = await res.json();
        if (!json || !json.data || !Array.isArray(json.data))
            throw new Error("Invalid API response");

        // تخزين بيانات الشهر كاملة وتحديث تاريخ الجلب
        this.settings.cached = {
            monthTimes: json.data,
            fetchedAtISO: new Date().toISOString()
        };
        await this.saveSettings();

        // معالجة بيانات اليوم الحالي من المصفوفة الجديدة
        const todayData = json.data[todayIndex];
        if (todayData && todayData.timings) {
            this._processDayData(todayData);
        }

        new Notice(this.t("fetchUpdated"));
        this.updateStatusBar();
        this.refreshPrayerPanel();
        this._checkHolyDayNotification();

    } catch (err) {
        console.error("fetchPrayerTimes failed:", err);
        new Notice(this.t("fetchFailed"));

        // استخدام النسخة الاحتياطية (حتى لو كانت قديمة) في حال فشل الإنترنت
        if (this.settings.cached && Array.isArray(this.settings.cached.monthTimes)) {
            const todayData = this.settings.cached.monthTimes[todayIndex];
            if (todayData && todayData.timings) {
                this._processDayData(todayData);
                new Notice(this.t("usingCached"));
            }
        }
    }
  }


	// دالة مساعدة لمعالجة بيانات اليوم الواحد
	_processDayData(dayData) {
		if (!dayData || !dayData.timings) return;
		
		const raw = dayData.timings;
		const clean = {};

		for (const k of [
			"Fajr",
			"Sunrise",
			"Dhuhr",
			"Asr",
			"Maghrib",
			"Isha",
			"Midnight"
		]) {
			if (raw[k]) {
				const cleaned = this._cleanTimeString(raw[k]);
				let offset = 0;
				if (this.settings.enablePrayerOffsets) {
					offset = this.settings.prayerOffsets[k] || 0;
				}
				clean[k] = this._applyOffset(cleaned, offset);
			}
		}

		this.prayerTimes = clean;
		this.hijri = dayData.date && dayData.date.hijri ? dayData.date.hijri : null;
		this.fetchedAt = new Date();
	}

  // دالة للتحقق مما إذا كنا بحاجة لتحديث بيانات الشهر - محدثة
  _needsMonthUpdate() {
    if (!this.settings.cached || !this.settings.cached.monthTimes || !this.settings.cached.monthTimes.length) {
        return true; 
    }

    const now = new Date();
    const fetchedAt = new Date(this.settings.cached.fetchedAtISO);

    // تحديث فقط إذا تغير الشهر أو السنة
    return (fetchedAt.getMonth() !== now.getMonth() || fetchedAt.getFullYear() !== now.getFullYear());
  }


	// دالة مساعدة للتحميل بدون تعديل الإعدادات
	_processDayDataForLoad(dayData) {
		if (!dayData || !dayData.timings) return {};
		
		const raw = dayData.timings;
		const clean = {};

		for (const k of ["Fajr", "Sunrise", "Dhuhr", "Asr", "Maghrib", "Isha", "Midnight"]) {
			if (raw[k]) {
				clean[k] = this._cleanTimeString(raw[k]);
			}
		}
		return clean;
	}

	/* ---------------------------
	   Scheduling & triggers
	----------------------------*/
	checkPrayerSchedules() {
		const now = new Date();
		const nowMinutes = now.getHours() * 60 + now.getMinutes();

		const TOLERANCE_MINUTES = 1;

		for (const prayer of Object.keys(this.settings.enabledPrayers)) {
			if (!this.settings.enabledPrayers[prayer]) continue;

			const targetHM = this.prayerTimes[prayer === "Sunrise" ? "Sunrise" : prayer];
			if (!targetHM) continue;

			const prayerMinutes = this._hmToMinutes(targetHM);

			/* ---------- pre-athan ---------- */
			if (
				this.settings.enablePreAthan &&
				Number.isFinite(Number(this.settings.preAthanOffsetMinutes))
			) {
				const offset = Number(this.settings.preAthanOffsetMinutes);
				const reminderMinutes = prayerMinutes - offset;
				const diffReminder = nowMinutes - reminderMinutes;

				if (
					reminderMinutes >= 0 &&
					diffReminder >= 0 &&
					diffReminder <= TOLERANCE_MINUTES
				) {
					const key = `${prayer}_reminder_${reminderMinutes}`;
					if (this.lastTriggered.reminder !== key) {
						this.lastTriggered.reminder = key;
						this.triggerPreAthan(prayer);
					}
				}
			}

			/* ---------- athan ---------- */
			const diffAthan = nowMinutes - prayerMinutes;
			if (diffAthan >= 0 && diffAthan <= TOLERANCE_MINUTES) {
				const key = `${prayer}_athan_${prayerMinutes}`;
				if (this.lastTriggered.athan !== key) {
					this.lastTriggered.athan = key;
					this.playAthan(prayer);
				}
			}

			/* ---------- iqama ---------- */
			// Check if Iqama Master Switch is ON
			if (this.settings.enableIqamaFeature) {
				const isIqamaEnabled = this.settings.iqamaEnabled && this.settings.iqamaEnabled[prayer];
				const iq = Number(this.settings.iqamaMinutes && this.settings.iqamaMinutes[prayer]) || 0;
				
				if (isIqamaEnabled && iq > 0) {
					const iqamaMinutes = prayerMinutes + iq;
					const diffIqama = nowMinutes - iqamaMinutes;

					if (diffIqama >= 0 && diffIqama <= TOLERANCE_MINUTES) {
						const key = `${prayer}_iqama_${iqamaMinutes}`;
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
		const msg = this.t("preAthanMsg", { prayer: this.tPrayer(prayer), minutes: this.settings.preAthanOffsetMinutes });
		new Notice(msg);
		if (this.settings.showSystemNotification) this._maybeShowSystemNotification(this.t("preAthanMsg").split(":")[0], msg);
		const path = this.settings.preAthanAudioPath || this.settings.athanAudioPath || null;
		if (path) await this._playAudioFromVault(path, { previewSeconds: 3, volume: 0.6 });
	}

	async playIqama(prayer) {
		const path = this.settings.iqamaAudioPath || this.settings.athanAudioPath || null;
		if (!path) { new Notice(this.t("noAudio")); return; }
		const msg = this.t("iqamaMsg", { prayer: this.tPrayer(prayer) });
		new Notice(msg);
		if (this.settings.showSystemNotification) this._maybeShowSystemNotification("Iqama", msg);
		await this._playAudioFromVault(path, { volume: 1 });
	}

	/* ---------------------------
	   Fasting & supplications
	----------------------------*/
	_parseHijriDayList(txt) {
		if (!txt) return [];
		return txt.split(",").map(s => Number(s.trim())).filter(n => Number.isFinite(n) && n >= 1 && n <= 30);
	}

	/* ---------------------------
	   New Logic: Islamic Events & Fasting Rules
	----------------------------*/
	_getIslamicEvent(hijriMonthName, hijriDay) {
		if (!hijriMonthName || !hijriDay) return null;
		const m = hijriMonthName.toLowerCase();
		const d = Number(hijriDay);

		// 1. Ramadan (Mandatory)
		if (m.includes("ramadan")) {
			return { name: "Ramadan", type: "mandatory" };
		}

		// 2. Forbidden Days (Haram)
		// Eid al-Fitr
		if (m.includes("shawwal") && d === 1) return { name: "Eid al-Fitr", type: "forbidden" };
		// Eid al-Adha
		if (m.includes("dhul") && m.includes("hijjah") && d === 10) return { name: "Eid al-Adha", type: "forbidden" };
		// Tashreeq Days (11, 12, 13 Dhul-Hijjah) - Fasting usually forbidden/disliked
		if (m.includes("dhul") && m.includes("hijjah") && (d >= 11 && d <= 13)) return { name: "Tashreeq", type: "forbidden" };

		// 3. Recommended Days (Sunnah)
		// Day of Arafah
		if (m.includes("dhul") && m.includes("hijjah") && d === 9) return { name: "Day of Arafah", type: "recommended" };
		// Ashura
		if (m.includes("muharram") && d === 10) return { name: "Ashura", type: "recommended" };
		// Tasu'a (9th Muharram)
		if (m.includes("muharram") && d === 9) return { name: "Tasu'a", type: "recommended" };
		// White Days (13, 14, 15 of any month, except if forbidden)
		if ([13, 14, 15].includes(d)) return { name: "الأيام البيض", type: "recommended" };
		// 1st Muharram
		if (m.includes("muharram") && d === 1) return { name: "Islamic New Year", type: "recommended" };
		// 15th Sha'ban
		if (m.includes("sha") && m.includes("ban") && d === 15) return { name: "Mid-Sha'ban", type: "recommended" };
		// 6 days of Shawwal (General note, usually starts after Eid)
		if (m.includes("shawwal") && d > 1 && d <= 7) return { name: "Six of Shawwal", type: "recommended" };
		
		// Isra and Mi'raj (Not typically a fasting day for all, but Holy)
		if (m.includes("rajab") && d === 27) return { name: "Isra and Mi'raj", type: "holy" };
		// Mawlid
		if (m.includes("rabi") && m.includes("awwal") && d === 12) return { name: "Mawlid", type: "holy" };

		return null;
	}

	/**
	 * Determines the status of a specific date (Today/Tomorrow).
	 * Returns: { isFasting: boolean, isForbidden: boolean, message: string, color: 'red'|'gold'|'default' }
	 */
	_analyzeFastingStatus(dateObj, hijriObj, dayOffset = 0) {
		if (!hijriObj || !hijriObj.day) return null;

		const weekdayKey = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][dateObj.getDay()];
		
		// Calculate Hijri Day based on offset (approximate)
		let hDay = Number(hijriObj.day) + dayOffset;
		let hMonth = (hijriObj.month && hijriObj.month.en) ? hijriObj.month.en : "";
		
		// Simple rollover logic (not perfect without re-fetching, but good for UI)
		if (hDay > 30) { hDay -= 30; /* We assume month changed, hard to guess name without fetch */ }
		
		const event = this._getIslamicEvent(hMonth, hDay);
		
		// User settings
		const userWeekdays = this.settings.fastingWeekdays || {};
		const userHijriDays = this._parseHijriDayList(this.settings.fastingHijriDays || "");
		const userWantsToFast = userWeekdays[weekdayKey] || userHijriDays.includes(hDay);

		const dayLabel = dayOffset === 0 ? this.t("note_today_fasting").replace("Today is ", "").replace("اليوم ", "") : this.t("note_tomorrow_fasting").replace("Tomorrow is ", "").replace("غداً ", ""); // Clean up labels slightly
		const timeLabel = dayOffset === 0 ? (this.settings.language === 'ar' ? "اليوم" : "Today") : (this.settings.language === 'ar' ? "غداً" : "Tomorrow");

		// 1. PRIORITY: Forbidden
		if (event && event.type === "forbidden") {
			return {
				priority: 10,
				isForbidden: true,
				isFasting: false,
				className: "forbidden",
				text: this.t("note_forbidden_msg", { day: timeLabel, event: event.name })
			};
		}

		// 2. PRIORITY: Mandatory (Ramadan)
		if (event && event.type === "mandatory") {
			return {
				priority: 5,
				isForbidden: false,
				isFasting: true,
				className: "mandatory",
				text: `${event.name}: ${this.t("note_today_fasting")}` // "Ramadan: Today is a day of fasting"
			};
		}

		// 3. PRIORITY: Recommended (Special Event)
		if (event && event.type === "recommended") {
			// If user wants to fast OR it's a major event we suggest
			return {
				priority: 4,
				isForbidden: false,
				isFasting: true,
				className: "recommended",
				text: this.t("note_fasting_reason", { day: timeLabel, event: event.name })
			};
		}

		// 4. PRIORITY: User Selection (Weekdays / Manual Hijri)
		if (userWantsToFast) {
			// Check if it clashed with forbidden (handled in step 1), if not, it's valid
			return {
				priority: 1,
				isForbidden: false,
				isFasting: true,
				className: "default",
				text: dayOffset === 0 ? this.t("note_today_fasting") : this.t("note_tomorrow_fasting")
			};
		}

		return null;
	}

	_checkFastingAlerts(now) {
		if (!this.settings.fastingEnabled) return;

		// Use the new centralized analyzer for Tomorrow (since alerts usually happen the night before)
		// Or Today depending on when this runs. Usually alerts run at a specific prayer time.
		
		const tomorrow = new Date(now);
		tomorrow.setDate(now.getDate() + 1);
		
		// We typically alert for *Tomorrow's* fast at Maghrib/Isha of *Today*
		// Or alert for *Today's* fast at Fajr.
		
		const alertCfg = this.settings.fastingAlert || { prayer: "Fajr", offsetMinutes: 10, direction: "before" };
		const refPrayer = alertCfg.prayer || "Fajr";
		const refHM = this.prayerTimes[refPrayer];
		if (!refHM) return;

		let alertMinutes = this._hmToMinutes(refHM);
		const offset = Number(alertCfg.offsetMinutes) || 0;
		if (alertCfg.direction === "before") alertMinutes -= offset;
		else alertMinutes += offset;
		if (alertMinutes < 0) alertMinutes = 0;
		
		const nowMinutes = now.getHours() * 60 + now.getMinutes();

		if (nowMinutes === alertMinutes) {
			 // Analyze based on when the alert is set for. 
			 // If alert is at Maghrib/Isha, we are likely warning for TOMORROW.
			 // If alert is at Fajr, we are warning for TODAY.
			 const isWarningForTomorrow = (refPrayer === "Maghrib" || refPrayer === "Isha");
			 
			 const targetDate = isWarningForTomorrow ? tomorrow : now;
			 const offsetDay = isWarningForTomorrow ? 1 : 0;

			 const status = this._analyzeFastingStatus(targetDate, this.hijri, offsetDay);

			 // Only trigger AUDIO alert if it is a Valid Fasting day (User, Recommended, Mandatory)
			 // Do NOT trigger audio for Forbidden days.
			 if (status && status.isFasting && !status.isForbidden) {
				const key = `fasting_${this._dayKeyForFasting(now)}_${alertMinutes}`;
				if (this.lastTriggered.fasting !== key) {
					this.lastTriggered.fasting = key;
					
					// Custom message based on event
					const msg = status.text; 
					this._triggerFastingAlert(msg);
				}
			 }
		}
	}

	_dayKeyForFasting(now) {
		let key = now.toISOString().slice(0,10);
		if (this.hijri && this.hijri.day) key += `_h${this.hijri.day}_${(this.hijri.month && this.hijri.month.en) || ""}`;
		return key;
	}

	async _triggerFastingAlert(customMsg) {
		const msg = customMsg || this.t("fastingAlert");
		new Notice(msg);
		if (this.settings.showSystemNotification) this._maybeShowSystemNotification(this.t("fastingAlert"), msg);
		let path = this.settings.fastingAudioPath || this.settings.athanAudioPath;
		if (!path) return;
		await this._playAudioFromVault(path, { volume: 1 });
	}

	_checkSupplicationReminders(now) {
		const sup = this.settings.supplications || {};
		if (sup.morning && sup.morning.enabled) this._checkSingleSupplication("morning", sup.morning, now);
		if (sup.evening && sup.evening.enabled) this._checkSingleSupplication("evening", sup.evening, now);
		if (sup.night && sup.night.enabled) this._checkSingleSupplication("night", sup.night, now);
	}

	_checkSingleSupplication(key, cfg, now) {
		let refTimeHM = null;
		const ref = (cfg.reference || "").toLowerCase();
		if (ref === "sunrise" && this.prayerTimes.Sunrise) refTimeHM = this.prayerTimes.Sunrise;
		else if ((ref === "sunset" || ref === "maghrib") && this.prayerTimes.Maghrib) refTimeHM = this.prayerTimes.Maghrib;
		else if (this.prayerTimes[cfg.reference]) refTimeHM = this.prayerTimes[cfg.reference];

		if (!refTimeHM) return;
		let minutes = this._hmToMinutes(refTimeHM);
		const offset = Number(cfg.offsetMinutes) || 0;
		if (cfg.direction === "before") minutes -= offset;
		else minutes += offset;
		if (minutes < 0) minutes = 0;
		const nowMinutes = now.getHours() * 60 + now.getMinutes();
		if (nowMinutes === minutes) {
			const id = `${key}_${minutes}_${this.fetchedAt ? this.fetchedAt.toISOString().slice(0,10) : ""}`;
			if (this.lastTriggered.supplication !== id) {
				this.lastTriggered.supplication = id;
				this._triggerSupplication(cfg, key);
			}
		}
	}

	async _triggerSupplication(cfg, nameKey) {
		const mapName = { morning: "morningSup", evening: "eveningSup", night: "nightSup" };
		const labelKey = mapName[nameKey] || "supplication";
		const label = this.t(labelKey);
		const msg = `${label}`;
		new Notice(msg);
		if (this.settings.showSystemNotification) this._maybeShowSystemNotification(label, msg);
		const path = (cfg && cfg.audioPath) || this.settings.athanAudioPath || this.settings.fastingAudioPath;
		if (!path) return;
		await this._playAudioFromVault(path, { volume: 0.7 });
	}

	/* ---------------------------
	   Holy day detection & notification
	----------------------------*/
	_checkHolyDayNotification() {
		if (!this.hijri) return;
		const dayNum = Number(this.hijri.day || (this.hijri.date && this.hijri.date.split("-")[0]) || NaN);
		const monthName = (this.hijri.month && (this.hijri.month.en || this.hijri.month)) || "";
		if (!Number.isFinite(dayNum)) return;

		const holidays = [];
		if (monthName.toLowerCase().includes("shawwal") && dayNum === 1) holidays.push("Eid al-Fitr");
		if (monthName.toLowerCase().includes("dhul") && monthName.toLowerCase().includes("hijjah") && dayNum === 10) holidays.push("Eid al-Adha");
		if (monthName.toLowerCase().includes("dhul") && monthName.toLowerCase().includes("hijjah") && dayNum === 9) holidays.push("Day of Arafah");
		if (monthName.toLowerCase().includes("muharram") && dayNum === 1) holidays.push("Islamic New Year");
		if (monthName.toLowerCase().includes("muharram") && dayNum === 10) holidays.push("Ashura");
		if (monthName.toLowerCase().includes("rajab") && dayNum === 27) holidays.push("Isra and Mi'raj");
		if (monthName.toLowerCase().includes("ramadan") && dayNum === 1) holidays.push("Start of Ramadan");

		if (holidays.length === 0) return;

		const todayKey = this.fetchedAt ? this.fetchedAt.toISOString().slice(0,10) : new Date().toISOString().slice(0,10);
		if (this.lastTriggered.holyDayNotifiedDate === todayKey) return;
		this.lastTriggered.holyDayNotifiedDate = todayKey;

		const body = `Today: ${holidays.join(", ")}`;
		new Notice(`${this.t("holyDay")}: ${body}`);
		if (this.settings.showSystemNotification) this._maybeShowSystemNotification(this.t("holyDay"), body);
	}

	/* ---------------------------
	   Audio helpers: play from vault (revokes ObjectURLs)
	----------------------------*/
	async _playAudioFromVault(path, opts = {}) {
		try {
			if (!path) return;
			const file = this.app.vault.getAbstractFileByPath(path);
			if (!(file instanceof TFile)) {
				console.warn("Audio file not found:", path);
				new Notice(this.t("fileNotFound") + ` (${path})`);
				return;
			}
			
			// 1. Stop any currently playing audio first
			this.stopAthan();

			const data = await this.app.vault.readBinary(file);
			const url = URL.createObjectURL(new Blob([data]));
			
			// 2. Assign to the class property 'this.audio' instead of a local variable
			this._currentAudioURL = url;
			this.audio = new Audio(url);
			
			if (typeof opts.volume === "number") this.audio.volume = opts.volume;
			else this.audio.volume = 1;

			// revoke URL when playback ends
			const revoke = () => {
				try { URL.revokeObjectURL(url); } catch (e) {}
				try { 
					if(this.audio) this.audio.removeEventListener("ended", revoke); 
				} catch (e) {}
			};
			this.audio.addEventListener("ended", revoke);

			await this.audio.play();
			
			if (opts.previewSeconds) {
				setTimeout(() => {
					this.stopAthan(); // Use the central stop method
				}, opts.previewSeconds * 1000);
			}
		} catch (err) {
			console.warn("Failed to play audio from vault:", err);
		}
	}

	/* ---------------------------
	   Play / stop Athan & Iqama (ensure URL revoked)
	----------------------------*/
	async playAthan(prayer) {
		if (!this.settings.athanAudioPath) {
			new Notice(this.t("noAudio"));
			if (this.settings.showSystemNotification) this._maybeShowSystemNotification("Athan", `${this.t("noAudio")}`);
			return;
		}
		const file = this.app.vault.getAbstractFileByPath(this.settings.athanAudioPath);
		if (!(file instanceof TFile)) {
			new Notice(this.t("fileNotFound"));
			return;
		}
		try {
			const data = await this.app.vault.readBinary(file);
			const url = URL.createObjectURL(new Blob([data]));
			this.stopAthan(); // stop & revoke previous audio if any
			this._currentAudioURL = url;
			this.audio = new Audio(url);
			this.audio.loop = false;
			this.audio.volume = 1;

			// revoke when ended
			this.audio.addEventListener("ended", () => {
				try { URL.revokeObjectURL(url); } catch(e) {}
				this._currentAudioURL = null;
			});

			await this.audio.play();

			const prayerName = this.tPrayer(prayer);
			new Notice(`Athan: ${prayerName}`);
			if (this.settings.showSystemNotification) this._maybeShowSystemNotification("Athan", `Athan for ${prayerName}`);
		} catch (err) {
			console.error("playAthan error", err);
			new Notice("Failed to play Athan audio.");
		}
	}

	stopAthan() {
		try {
			if (this.audio) {
				this.audio.pause();
				try { this.audio.src = ""; } catch(e) {}
				this.audio = null;
			}
			if (this._currentAudioURL) {
				try { URL.revokeObjectURL(this._currentAudioURL); } catch(e) {}
				this._currentAudioURL = null;
			}
		} catch (err) { console.warn("stopAthan error", err); }
	}

	/* ---------------------------
	   Wake lock helpers
	----------------------------*/
	async tryAcquireWakeLock(onDemand = false) {
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

	/* ---------------------------
	   Status bar & panel helpers
	----------------------------*/
	updateStatusBar() {
		if (!this.settings.enableStatusBar) return;
		if (!this.statusBarEl) this.statusBarEl = this.addStatusBarItem();
		if (!this.prayerTimes || !this.prayerTimes.Fajr) {
			this.statusBarEl.setText(this.t("loading"));
			return;
		}
		const next = this._getNextPrayer();
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
		leaf.setViewState({ type: VIEW_TYPE_PRAYER, active: true }).then(() => { this.app.workspace.revealLeaf(leaf); });
	}

	/* ---------------------------
	   Utilities (formatting & parsing)
	----------------------------*/
	_formatTime(hm) {
		if (!hm || hm === "--:--") return hm;
		if (this.settings.timeFormat !== "12h") return hm;
		const parts = hm.split(":");
		let h = parseInt(parts[0]);
		const m = parts[1];
		const suffix = h >= 12 ? this.t("pm") : this.t("am");
		h = h % 12 || 12;
		const hh = h.toString().padStart(2, "0");
		return `${hh}:${m}${suffix}`;
	}

	_cleanTimeString(s) {
		if (!s) return null;
		const m = s.match(/(\d{1,2}:\d{2})/);
		if (m) {
			const parts = m[1].split(":");
			const hh = parts[0].padStart(2, "0");
			return `${hh}:${parts[1]}`;
		}
		return null;
	}

	_hmToMinutes(hm) {
		if (!hm) return null;
		const parts = hm.split(":").map(Number);
		return parts[0] * 60 + parts[1];
	}

	_applyOffset(timeStr, offset) {
		if (!timeStr || !offset || offset === 0) return timeStr;
		const parts = timeStr.split(":");
		let minutes = parseInt(parts[0]) * 60 + parseInt(parts[1]);
		minutes += offset;
		minutes = (minutes + 1440) % 1440;
		const h = Math.floor(minutes / 60).toString().padStart(2, "0");
		const m = (minutes % 60).toString().padStart(2, "0");
		return `${h}:${m}`;
	}

	_getNextPrayer() {
		try {
			const now = new Date();
			const nowMin = now.getHours() * 60 + now.getMinutes();
			let best = null;
			for (const name of ["Fajr","Dhuhr","Asr","Maghrib","Isha"]) {
				const t = this.prayerTimes[name];
				if (!t) continue;
				const pm = this._hmToMinutes(t);
				if (pm >= nowMin) {
					if (!best || pm < this._hmToMinutes(best.time)) best = { name, time: t, inMinutes: pm - nowMin };
				}
			}
			if (!best) return { name: "—", time: "--:--", inMinutes: "--" };
			return best;
		} catch (err) { return { name: "—", time: "--:--", inMinutes: "--" }; }
	}

	_formatHijri() {
		if (!this.hijri) return null;
		const year = this.hijri.year;
		const monthNum = this.hijri.month?.number || this.hijri.month || null;
		const monthName = this.hijri.month?.en || this.hijri.month?.ar || "";
		const day = Number(this.hijri.day);
		if (!year || !monthNum || !day) return null;
		if (this.settings.hijriDateFormat === "iso") {
			const mm = String(monthNum).padStart(2, "0");
			const dd = String(day).padStart(2, "0");
			return `${year}-${mm}-${dd}`;
		}
		return `${day} ${monthName} ${year}`;
	}

	_formatCountdown(next) {
		if (!next || !next.time || next.inMinutes === "--") return "--";

		const now = new Date();
		const [h, m] = (next.time || "--:--").split(":").map(Number);
		if (!Number.isFinite(h) || !Number.isFinite(m)) return "--";

		const target = new Date(
			now.getFullYear(),
			now.getMonth(),
			now.getDate(),
			h,
			m,
			0,
			0
		);

		let totalMinutes = Math.max(0, Math.floor((target - now) / 60000));
		const hours = Math.floor(totalMinutes / 60);
		const minutes = totalMinutes % 60;

		if (hours > 0) {
			return `${hours}h ${minutes.toString().padStart(2, "0")}m`;
		}
		return `${minutes}m`;
	}

	_maybeShowSystemNotification(title, body) {
		if (!("Notification" in window)) return;
		if (Notification.permission === "granted") new Notification(title, { body });
		else if (Notification.permission !== "denied") Notification.requestPermission().then(p => { if (p === "granted") new Notification(title, { body }); });
	}

	/* ---------------------------
	   Persistence
	----------------------------*/
	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
		
		// Ensure new setting exists if not in DEFAULT_SETTINGS yet
		if (this.settings.enableIqamaFeature === undefined) this.settings.enableIqamaFeature = false;

		this.settings.iqamaEnabled = Object.assign(
			{ Fajr: false, Dhuhr: false, Asr: false, Maghrib: false, Isha: false },
			this.settings.iqamaEnabled || {}
		);
		
		// التأكد من وجود cached.monthTimes بشكل صحيح
		if (!this.settings.cached) {
			this.settings.cached = { monthTimes: [], fetchedAtISO: null };
		} else if (!this.settings.cached.monthTimes) {
			this.settings.cached.monthTimes = [];
		}
		
		// تهيئة البيانات من الكاش إذا كانت موجودة
		if (this.settings.cached.monthTimes && this.settings.cached.monthTimes.length > 0) {
			const todayIndex = new Date().getDate() - 1;
			const todayData = this.settings.cached.monthTimes[todayIndex];
			if (todayData && todayData.timings) {
				this.prayerTimes = this._processDayDataForLoad(todayData);
				this.hijri = todayData.date && todayData.date.hijri ? todayData.date.hijri : null;
				this.fetchedAt = this.settings.cached.fetchedAtISO ? new Date(this.settings.cached.fetchedAtISO) : null;
			}
		}
	}
	
	async saveSettings() { 
		await this.saveData(this.settings); 
	}

	/* ---------------------------
	   CSS injection placeholder
	----------------------------*/
	injectCSS() {
		if (document.getElementById("prayer-panel-css")) return;
		const style = document.createElement("style");
		style.id = "prayer-panel-css";
		style.textContent = PRAYER_PANEL_CSS || ""; // keep your CSS constant elsewhere or inline
		document.head.appendChild(style);
	}

	/* ---------------------------
	   Daily note creator with template support - UPDATED VERSION
	----------------------------*/
	async createOrOpenHijriDailyNote() {
		try {
			if (!this.settings?.enableDailyNotes) {
				new Notice("Daily notes export is disabled in settings.");
				return;
			}

			const now = this.fetchedAt ? new Date(this.fetchedAt) : new Date();
			const todayGregorian = new Date(now);
			const tomorrowGregorian = new Date(now);
			tomorrowGregorian.setDate(todayGregorian.getDate() + 1);
			const todayISO = todayGregorian.toISOString().slice(0, 10);
			const weekdayKey = d => ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"][d.getDay()];
			const todayWeekday = weekdayKey(todayGregorian);
			const tomorrowWeekday = weekdayKey(tomorrowGregorian);

			const hijriText = this._formatHijri() || "";
			let hijriDay = null;
			if (this.hijri) {
				const raw = this.hijri.day || (this.hijri.date && this.hijri.date.split("-")[0]);
				const n = Number(raw);
				if (Number.isFinite(n)) hijriDay = n;
			}
			let tomorrowHijriDay = null;
			if (Number.isFinite(hijriDay)) {
				tomorrowHijriDay = hijriDay + 1;
				if (tomorrowHijriDay > 30) tomorrowHijriDay -= 30;
			}
			const hijriMonth = (this.hijri?.month && (this.hijri.month.en || this.hijri.month)) || "";

			const hijriFastingDays = this._parseHijriDayList(this.settings.fastingHijriDays || "");
			const weekdayFasting = this.settings.fastingWeekdays || {};
			const todayIsFasting = (Number.isFinite(hijriDay) && hijriFastingDays.includes(hijriDay)) || !!weekdayFasting[todayWeekday];
			const tomorrowIsFasting = (Number.isFinite(tomorrowHijriDay) && hijriFastingDays.includes(tomorrowHijriDay)) || !!weekdayFasting[tomorrowWeekday];

			const detectHolyDays = (dayNum) => {
				if (!Number.isFinite(dayNum) || !hijriMonth) return [];
				const m = hijriMonth.toLowerCase();
				const out = [];
				if (m.includes("shawwal") && dayNum === 1) out.push("Eid al-Fitr");
				if (m.includes("dhul") && m.includes("hijjah") && dayNum === 9) out.push("Day of Arafah");
				if (m.includes("dhul") && m.includes("hijjah") && dayNum === 10) out.push("Eid al-Adha");
				if (m.includes("muharram") && dayNum === 1) out.push("Islamic New Year");
				if (m.includes("muharram") && dayNum === 10) out.push("Ashura");
				if (m.includes("rajab") && dayNum === 27) out.push("Isra and Mi'raj");
				if (m.includes("ramadan") && dayNum === 1) out.push("Start of Ramadan");
				return out;
			};

			const todayHoly = detectHolyDays(hijriDay);
			const tomorrowHoly = detectHolyDays(tomorrowHijriDay);

			const folder = this.settings.dailyNotesFolder || "Daily";
			const fmt = this.settings.dailyNotesDateFormat || "both";
			let title;
			if (fmt === "gregorian") title = todayISO;
			else if (fmt === "hijri") title = hijriText || todayISO;
			else title = `${todayISO} — ${hijriText}`;

			const safeTitle = title.replace(/[\/\\:?<>|*"']/g, "").trim();
			const path = `${folder}/${safeTitle}.md`;

			// Build the content sections
			const prayerTimesSection = [];
			prayerTimesSection.push(`## ${this.t("note_prayer_times")}`);
			for (const p of ["Fajr","Dhuhr","Asr","Maghrib","Isha"]) {
				if (this.prayerTimes?.[p]) {
					prayerTimesSection.push(`- [ ] ${this.tPrayer(p)} — ${this._formatTime(this.prayerTimes[p])}`);
				}
			}
			const prayerTimesContent = prayerTimesSection.join("\n");

			const prayerTimesTableContent = this._generatePrayerTimesTable();

			const checklistSection = [];
			checklistSection.push(`## ${this.t("note_checklist")}`);
			checklistSection.push(`- [ ] ${this.t("note_morning")}`);
			checklistSection.push(`- [ ] ${this.t("note_evening")}`);
			checklistSection.push(`- [ ] ${this.t("note_bedtime")}`);
			const checklistContent = checklistSection.join("\n");

			const specialDaysSection = [];
			if (todayHoly.length || tomorrowHoly.length || todayIsFasting || tomorrowIsFasting) {
				specialDaysSection.push(`## ${this.t("note_special_days")}`);
				if (todayHoly.length) specialDaysSection.push(`- <b style="font-size: 1.0em">${this.t("note_today_holy")}:</b> ${todayHoly.join(", ")}`);
				if (tomorrowHoly.length) specialDaysSection.push(`- <b style="font-size: 1.0em">${this.t("note_tomorrow_holy")}:</b> ${tomorrowHoly.join(", ")}`);
				if (todayIsFasting) specialDaysSection.push(`- <b style="font-size: 1.0em">${this.t("note_today_fasting")}</b>`);
				if (tomorrowIsFasting) specialDaysSection.push(`- <b style="font-size: 1.0em">${this.t("note_tomorrow_fasting")}</b>`);
			}
			const specialDaysContent = specialDaysSection.join("\n");

			const fastingAnalysisContent = this._generateFastingAnalysis(todayIsFasting, tomorrowIsFasting, todayHoly, tomorrowHoly);

			// Get template content based on language
			let templateContent = "";
			const isArabic = this.settings.language === "ar";

			if (isArabic) {
				if (this.settings.arabicNoteTemplateMode === "file" && this.settings.arabicNoteTemplatePath) {
					const templateFile = this.app.vault.getAbstractFileByPath(this.settings.arabicNoteTemplatePath);
					if (templateFile instanceof TFile) {
						templateContent = await this.app.vault.read(templateFile);
					} else {
						templateContent = this.settings.arabicNoteTemplate || "";
					}
				} else {
					templateContent = this.settings.arabicNoteTemplate || "";
				}
			} else {
				if (this.settings.englishNoteTemplateMode === "file" && this.settings.englishNoteTemplatePath) {
					const templateFile = this.app.vault.getAbstractFileByPath(this.settings.englishNoteTemplatePath);
					if (templateFile instanceof TFile) {
						templateContent = await this.app.vault.read(templateFile);
					} else {
						templateContent = this.settings.englishNoteTemplate || "";
					}
				} else {
					templateContent = this.settings.englishNoteTemplate || "";
				}
			}

			if (!templateContent.trim()) {
				templateContent = isArabic ?
					"\n{{PRAYER_TIMES}}\n\n\n{{CHECKLIST}}\n\n \n{{SPECIAL_DAYS}}" :
					"{{PRAYER_TIMES}}\n\n#{{CHECKLIST}}\n\n{{SPECIAL_DAYS}}";
			}

			// Define dynamic variables
			const dynamicVariables = {
				'{{DATE}}': todayISO,
				'{{date}}': todayISO,
				'{{HIJRI_DATE}}': hijriText,
				'{{hijri_date}}': hijriText,
				'{{HIJRI_DAY}}': hijriDay ? String(hijriDay) : "",
				'{{hijri_day}}': hijriDay ? String(hijriDay) : "",
				'{{HIJRI_MONTH}}': hijriMonth,
				'{{hijri_month}}': hijriMonth,
				'{{HIJRI_YEAR}}': this.hijri?.year ? String(this.hijri.year) : "",
				'{{hijri_year}}': this.hijri?.year ? String(this.hijri.year) : "",
				'{{GREGORIAN_DATE}}': todayISO,
				'{{gregorian_date}}': todayISO,
				'{{PRAYER_TIMES_TABLE}}': prayerTimesTableContent,
				'{{PRAYER_TIMES}}': prayerTimesContent,
				'{{CHECKLIST}}': checklistContent,
				'{{SPECIAL_DAYS}}': specialDaysContent,
				'{{FASTING_ANALYSIS}}': fastingAnalysisContent,
				'{{WEEKDAY}}': todayWeekday,
				'{{weekday}}': todayWeekday,
				'{{DAY_NAME}}': this.t(todayWeekday),
				'{{day_name}}': this.t(todayWeekday),
			};

			let content = templateContent;
			for (const [variable, value] of Object.entries(dynamicVariables)) {
				content = content.split(variable).join(value);
			}

			let file = this.app.vault.getAbstractFileByPath(path);

			if (!(file instanceof TFile)) {
				await this.app.vault.create(path, `${content}\n`);
				file = this.app.vault.getAbstractFileByPath(path);
				new Notice("New daily note created successfully.");
			}

			// ⭐ COMPLETELY REWRITTEN: Find existing leaf with this file
			if (file) {
				// Get all leaves that have views with files
				const allLeaves = this.app.workspace.getLeavesOfType('markdown');
				let existingLeaf = null;
				
				// Debug: Log all open files
				console.log("Checking for existing file:", file.path);
				
				for (const leaf of allLeaves) {
					if (leaf.view && leaf.view.file) {
						console.log("Open file:", leaf.view.file.path);
						if (leaf.view.file.path === file.path) {
							existingLeaf = leaf;
							console.log("Found existing leaf!");
							break;
						}
					}
				}
				
				if (existingLeaf) {
					// If found, set it as active
					this.app.workspace.setActiveLeaf(existingLeaf, { focus: true });
					console.log("Activated existing leaf");
				} else {
					// If not found, open in a new tab
					console.log("Opening in new tab");
					const newLeaf = this.app.workspace.getLeaf('tab');
					await newLeaf.openFile(file);
				}
			}

		} catch (err) {
			console.error("Daily note creation failed:", err);
			new Notice("Failed to create or open daily note.");
		}
	}

	// دالة مساعدة لإنشاء جدول مواقيت الصلاة
	_generatePrayerTimesTable() {
		const times = this.prayerTimes || {};
		const isArabic = this.settings.language === "ar";
		
		let table = "";
		if (isArabic) {
			table = "| الصلاة | الوقت |\n|--------|--------|\n";
		} else {
			table = "| Prayer | Time |\n|--------|------|\n";
		}
		
		for (const p of ["Fajr", "Dhuhr", "Asr", "Maghrib", "Isha"]) {
			if (times[p]) {
				table += `| ${this.tPrayer(p)} | ${this._formatTime(times[p])} |\n`;
			}
		}
		
		return table;
	}

	// دالة مساعدة لإنشاء تحليل الصيام
	_generateFastingAnalysis(todayIsFasting, tomorrowIsFasting, todayHoly, tomorrowHoly) {
		const isArabic = this.settings.language === "ar";
		let analysis = "";
		
		if (isArabic) {
			if (todayHoly.length > 0 || tomorrowHoly.length > 0) {
				analysis += `## الأيام المباركة\n`;
				if (todayHoly.length > 0) {
					analysis += `- اليوم: ${todayHoly.join(", ")}\n`;
				}
				if (tomorrowHoly.length > 0) {
					analysis += `- غداً: ${tomorrowHoly.join(", ")}\n`;
				}
			}
			if (todayIsFasting.length > 0 || tomorrowIsFasting.length > 0) {
				if (analysis) analysis += `\n`;
				analysis += `## الصيام\n`;
				if (todayIsFasting) {
					analysis += `- اليوم يوم صيام\n`;
				}
				if (tomorrowIsFasting) {
					analysis += `- غداً يوم صيام\n`;
				}
			}
		} else {
			if (todayHoly.length > 0 || tomorrowHoly.length > 0) {
				analysis += `## Holy Days\n`;
				if (todayHoly.length > 0) {
					analysis += `- Today: ${todayHoly.join(", ")}\n`;
				}
				if (tomorrowHoly.length > 0) {
					analysis += `- Tomorrow: ${tomorrowHoly.join(", ")}\n`;
				}
			}
			if (todayIsFasting || tomorrowIsFasting) {
				if (analysis) analysis += `\n`;
				analysis += `## Fasting\n`;
				if (todayIsFasting) {
					analysis += `- Today is a day of fasting\n`;
				}
				if (tomorrowIsFasting) {
					analysis += `- Tomorrow is a day of fasting\n`;
				}
			}
		}
		
		return analysis;
	}

	/* ---------------------------
	   REMINDER SYSTEM LOGIC - FIXED VERSION
	----------------------------*/
	
	async scanVaultForReminders() {
		this.reminders.clear();
		for (const file of this.app.vault.getMarkdownFiles()) {
			await this.scanFileForReminders(file);
		}
	}

	async scanFileForReminders(file) {
		if (!(file instanceof TFile)) return;
		try {
			const content = await this.app.vault.read(file);
			const lines = content.split(/\r?\n/);
			const fileReminders = [];

			// Regex 1: Specific Time (@YYYY-MM-DD HH:mm)
			// Regex 2: Relative Prayer (@YYYY-MM-DD before/after-prayer offsetm)
			// Matches: (@2026-01-27 04:00) or (@2026-01-27 after-isha 20m) or (@2026-01-27 before-fajr 10m)
			const regex1 = /\(@(\d{4}-\d{2}-\d{2})\s+(\d{1,2}:\d{2})\)/g;
			const regex2 = /\(@(\d{4}-\d{2}-\d{2})\s+(before|after)-([a-zA-Z-]+)\s+(\d+)m\)/g;

			lines.forEach((lineText, lineIndex) => {
				// Check if line is completed task
				const isCompleted = /^\s*-\s*\[x\]/i.test(lineText);
				
				let match;
				
				// Check Format 1
				while ((match = regex1.exec(lineText)) !== null) {
					fileReminders.push({
						file: file.path,
						line: lineIndex,
						text: lineText,
						date: match[1],
						time: match[2],
						type: 'fixed',
						originalLine: lineText,
						completed: isCompleted
					});
				}

				// Check Format 2
				while ((match = regex2.exec(lineText)) !== null) {
					fileReminders.push({
						file: file.path,
						line: lineIndex,
						text: lineText,
						date: match[1],
						direction: match[2], // 'before' or 'after'
						ref: match[3],
						offset: match[4],
						type: 'relative',
						originalLine: lineText,
						completed: isCompleted
					});
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

	// Helper method to generate unique reminder key
	_generateReminderKey(reminder) {
		// Include date, file, line, and text to make it unique but date-specific
		return `${reminder.date}:${reminder.file}:${reminder.line}:${reminder.text}`;
	}

	checkReminders() {
		const now = new Date();
		const todayISO = now.toISOString().slice(0, 10);
		
		this.reminders.forEach((list, filePath) => {
			list.forEach(reminder => {
				if (reminder.completed) return; // Skip completed tasks
				
				// Constraint: Only trigger if date is today
				if (reminder.date !== todayISO) return;
				
				let dueTime = null;
				
				if (reminder.type === 'fixed') {
					dueTime = this._getDateFromTimeString(reminder.date, reminder.time);
				} else if (reminder.type === 'relative') {
					// Calculate based on Prayer Times
					const refTimeStr = this._getPrayerOrRefTime(reminder.ref);
					if (refTimeStr) {
						const offset = parseInt(reminder.offset);
						const refDate = this._getDateFromTimeString(reminder.date, refTimeStr);
						if (refDate) {
							if (reminder.direction === 'before') {
								dueTime = new Date(refDate.getTime() - offset * 60000);
							} else {
								dueTime = new Date(refDate.getTime() + offset * 60000);
							}
						}
					}
				}
				
				// Check if time has passed (within tolerance)
				if (dueTime && now >= dueTime && now < new Date(dueTime.getTime() + 60000)) {
					// Check if already triggered today using the reminder key
					const key = this._generateReminderKey(reminder);
					if (this.lastTriggered.reminder !== key) {
						this.triggerReminderNotification(reminder);
					}
				}
			});
		});
	}
	
	// Helper to get upcoming reminders for the panel view
	getUpcomingRemindersForToday() {
		const now = new Date();
		const todayISO = now.toISOString().slice(0, 10);
		const upcoming = [];
		
		this.reminders.forEach((list, filePath) => {
			list.forEach(reminder => {
				if (reminder.completed) return; // Skip completed tasks
				if (reminder.date !== todayISO) return;
				
				let dueTime = null;
				if (reminder.type === 'fixed') {
					dueTime = this._getDateFromTimeString(reminder.date, reminder.time);
				} else if (reminder.type === 'relative') {
					const refTimeStr = this._getPrayerOrRefTime(reminder.ref);
					if (refTimeStr) {
						const offset = parseInt(reminder.offset);
						const refDate = this._getDateFromTimeString(reminder.date, refTimeStr);
						if (refDate) {
							if (reminder.direction === 'before') {
								dueTime = new Date(refDate.getTime() - offset * 60000);
							} else {
								dueTime = new Date(refDate.getTime() + offset * 60000);
							}
						}
					}
				}
				
				// Show all upcoming reminders, regardless of whether they've been triggered
				if (dueTime) {
					// Clean text for display
					let displayText = reminder.text;
					if(reminder.type === 'fixed') {
						displayText = displayText.replace(new RegExp(`\\(@${reminder.date}\\s+${reminder.time}\\)`), '').trim();
					} else {
						displayText = displayText.replace(new RegExp(`\\(@${reminder.date}\\s+${reminder.direction}-${reminder.ref}\\s+${reminder.offset}m\\)`), '').trim();
					}
					displayText = displayText.replace(/^-\s*\[.\]\s*/, '').trim();
					
					upcoming.push({
						time: dueTime,
						text: displayText,
						file: reminder.file,
						line: reminder.line,
						hasTriggered: this._generateReminderKey(reminder) === this.lastTriggered.reminder
					});
				}
			});
		});
		
		return upcoming.sort((a, b) => a.time - b.time);
	}

	_getDateFromTimeString(dateStr, timeStr) {
		if(!timeStr) return null;
		const [y, m, d] = dateStr.split('-').map(Number);
		const [hr, min] = timeStr.split(':').map(Number);
		return new Date(y, m - 1, d, hr, min, 0);
	}

	_getPrayerOrRefTime(refKey) {
		const key = refKey.toLowerCase();
		const map = {
			'fajr': 'Fajr',
			'dhuhr': 'Dhuhr',
			'asr': 'Asr',
			'maghrib': 'Maghrib',
			'isha': 'Isha',
			'sunrise': 'Sunrise',
			'sunset': 'Maghrib' // Treating Sunset as Maghrib for calculation purposes usually
		};

		if (map[key] && this.prayerTimes[map[key]]) return this.prayerTimes[map[key]];
		
		// Calculated references using shared logic
		if (key === 'midnight') return this._computeReferenceTimeText('midnight');
		if (key === 'last-thutd') return this._computeReferenceTimeText('lastThird');
		
		return null;
	}

	async triggerReminderNotification(reminder) {
		const key = this._generateReminderKey(reminder);
		
		// Check if already triggered today (this prevents repeats within the same day)
		if (this.lastTriggered.reminder === key) return;
		
		this.lastTriggered.reminder = key; // Mark as triggered for today
		
		new ReminderNotificationModal(this.app, reminder, this).open();
		
		// Play user-defined audio if set
		if (this.settings.reminderAudioPath) {
			await this._playAudioFromVault(this.settings.reminderAudioPath, { volume: 1 });
		}
		
		// Optional: Play system sound or notification if configured
		if(this.settings.showSystemNotification) {
			this._maybeShowSystemNotification(this.t("reminderNotificationTitle"), 
				reminder.text.replace(/\(@.*?\)/, '').trim());
		}
	}

	async markReminderDone(reminder) {
		const file = this.app.vault.getAbstractFileByPath(reminder.file);
		if (file instanceof TFile) {
			const content = await this.app.vault.read(file);
			const lines = content.split(/\r?\n/);
			if (lines.length > reminder.line) {
				let line = lines[reminder.line];
				// Toggle Checkbox logic: - [ ] -> - [x]
				if (line.includes("- [ ]")) {
					line = line.replace("- [ ]", "- [x]");
					lines[reminder.line] = line;
					await this.app.vault.modify(file, lines.join("\n"));
				}
			}
		}
	}

	async postponeReminder(reminder) {
		const file = this.app.vault.getAbstractFileByPath(reminder.file);
		if (file instanceof TFile) {
			const content = await this.app.vault.read(file);
			const lines = content.split(/\r?\n/);
			if (lines.length > reminder.line) {
				let line = lines[reminder.line];
				
				// Find the time tag to replace
				if (reminder.type === 'fixed') {
					// Add 15 mins to fixed time
					const oldDate = this._getDateFromTimeString(reminder.date, reminder.time);
					const newDate = new Date(oldDate.getTime() + 15 * 60000);
					const newTimeStr = `${String(newDate.getHours()).padStart(2,'0')}:${String(newDate.getMinutes()).padStart(2,'0')}`;
					const regex = new RegExp(`\\(@${reminder.date}\\s+${reminder.time}\\)`);
					// If date changed (crossed midnight), update date too
					const newDateStr = newDate.toISOString().slice(0,10);
					line = line.replace(regex, `(@${newDateStr} ${newTimeStr})`);
				} else if (reminder.type === 'relative') {
					// Postpone logic for relative times
					// We calculate the current offset value (positive for after, negative for before)
					// Add 15 minutes
					// Convert back to direction + absolute offset
					
					let currentOffsetVal = parseInt(reminder.offset);
					if (reminder.direction === 'before') currentOffsetVal = -currentOffsetVal;
					
					let newOffsetVal = currentOffsetVal + 15;
					
					let newDirection = 'after';
					if (newOffsetVal < 0) {
						newDirection = 'before';
						newOffsetVal = Math.abs(newOffsetVal);
					}
					
					const regex = new RegExp(`\\(@${reminder.date}\\s+${reminder.direction}-${reminder.ref}\\s+${reminder.offset}m\\)`);
					line = line.replace(regex, `(@${reminder.date} ${newDirection}-${reminder.ref} ${newOffsetVal}m)`);
				}
				
				lines[reminder.line] = line;
				await this.app.vault.modify(file, lines.join("\n"));
			}
		}
	}
	
	// Helper ported from View to Main Class for shared use
	_computeReferenceTimeText(refLabel) {
		const times = this.prayerTimes || {};
		try {
			if (refLabel === "midnight") {
				const mag = times.Maghrib;
				const faj = times.Fajr;
				if (!mag || !faj) return null;
				let magMin = this._hmToMinutes(mag);
				let fajMin = this._hmToMinutes(faj);
				if (fajMin <= magMin) fajMin += 24 * 60;
				const nightDuration = fajMin - magMin;
				const midnightMin = magMin + (nightDuration / 2);
				return this._minutesToHM(Math.floor(midnightMin) % (24 * 60));
			}
			if (refLabel === "lastThird") {
				const mag = times.Maghrib;
				const faj = times.Fajr;
				if (!mag || !faj) return null;
				let magMin = this._hmToMinutes(mag);
				let fajMin = this._hmToMinutes(faj);
				if (fajMin <= magMin) fajMin += 24 * 60;
				const nightDur = fajMin - magMin;
				const lastThirdStart = fajMin - Math.ceil(nightDur / 3);
				return this._minutesToHM(Math.floor(lastThirdStart) % (24 * 60));
			}
			if (refLabel === "sunrise") {
				const sunrise = times.Sunrise;
				if (!sunrise) return null;
				return sunrise; // Sunrise is already in HH:MM format
			}
			return null;
		} catch (e) { return null; }
	}
	
	_minutesToHM(mins) {
		const h = Math.floor(mins / 60) % 24;
		const m = mins % 60;
		return `${String(h).padStart(2,"0")}:${String(m).padStart(2,"0")}`;
	}
};

/* ============================
   Panel View
============================== */

class PrayerPanelView extends ItemView {
	constructor(leaf, plugin) {
		super(leaf);
		this.plugin = plugin;
		// Initialize refOptions. If reminders enabled, add it to the cycle.
		this.refOptions = ["sunrise", "midnight", "lastThird"];
		if (this.plugin.settings.enableReminders) {
			this.refOptions.push("reminders");
		}
	}
  
	getIcon() {
		return "clock";
	}
  
	getViewType() { 
		return VIEW_TYPE_PRAYER; 
	}
	
	getDisplayText() { 
		return "prayer times"; // جعل العنوان متكيف مع اللغة
	}
	
	async onOpen() { 
		this.render(); 
	}

	render() {
		this.containerEl.empty();
		this.containerEl.addClass("prayer-panel-container");
		if (this.plugin.settings.language === "ar") this.containerEl.addClass("prayer-rtl");
		else this.containerEl.removeClass("prayer-rtl");

		const header = this.containerEl.createDiv("prayer-panel-header");
		header.createDiv({ cls: "prayer-panel-title", text: this.plugin.t("appName") });

		const hijriDiv = header.createDiv({
			cls: "prayer-panel-hijri",
			text: `${this.plugin.t("hijri")}: ${this.plugin._formatHijri() || "—"}`
		});
		hijriDiv.addEventListener("click", async (e) => {
			e.stopPropagation();
			await this.plugin.createOrOpenHijriDailyNote();
		});

		const refBtnContainer = header.createDiv("prayer-panel-ref-btn-container");
		const currentRef = this.plugin.settings.displayReference || "midnight";
		const tRef = (k) => this.plugin.t(`ref_${k}`) || k;

		const btn = refBtnContainer.createEl("button", {
			cls: "prayer-ref-toggle-btn",
			text: `${tRef(currentRef)}`
		});

		btn.addEventListener("click", async () => {
			// Re-evaluate options in case settings changed
			this.refOptions = ["sunrise", "midnight", "lastThird"];
			if (this.plugin.settings.enableReminders) {
				this.refOptions.push("reminders");
			}

			const idx = this.refOptions.indexOf(this.plugin.settings.displayReference || "midnight");
			// If current ref is invalid (e.g. reminders disabled but still selected), default to 0
			const safeIdx = idx === -1 ? 0 : idx;
			const nextVal = this.refOptions[(safeIdx + 1) % this.refOptions.length];
			
			this.plugin.settings.displayReference = nextVal;
			await this.plugin.saveSettings();
			btn.setText(`${this.plugin.t("reference")} ${tRef(nextVal)}`);
			this.plugin.updateStatusBar();
			this.plugin.refreshPrayerPanel();
		});

		// --- CONDITIONAL RENDERING BASED ON REFERENCE ---
		if (currentRef === "reminders" && this.plugin.settings.enableReminders) {
			this._renderReminderList(this.containerEl);
		} else {
			this._renderPrayerList(this.containerEl, currentRef, tRef);
		}

		/* ---------------- FOOTER ---------------- */

		const footer = this.containerEl.createDiv("prayer-panel-footer");

		let lastFetchDisplay = "—";
		if (this.plugin.fetchedAt) {
			const h = this.plugin.fetchedAt.getHours().toString().padStart(2, "0");
			const m = this.plugin.fetchedAt.getMinutes().toString().padStart(2, "0");
			lastFetchDisplay = this.plugin._formatTime(`${h}:${m}`);
		}

		footer.createDiv({
			cls: "prayer-footer-fetch",
			text: `${this.plugin.t("lastFetch")}: ${lastFetchDisplay}`
		});

		/* ----- fasting note ABOVE buttons ----- */

		const nowDate = this.plugin.fetchedAt ? new Date(this.plugin.fetchedAt) : new Date();
		const tomorrowDate = new Date(nowDate);
		tomorrowDate.setDate(nowDate.getDate() + 1);

		// Analyze Today and Tomorrow
		const statusToday = this.plugin._analyzeFastingStatus(nowDate, this.plugin.hijri, 0);
		const statusTomorrow = this.plugin._analyzeFastingStatus(tomorrowDate, this.plugin.hijri, 1);
		const isAr = this.plugin.settings.language === "ar";

		let combinedText = "";
		let combinedClass = "";

		// --- Check for Combined Scenarios (Dual Alerts) ---
		if (statusToday && statusTomorrow) {
			const todayIsFast = statusToday.isFasting && !statusToday.isForbidden;
			const todayIsForbidden = statusToday.isForbidden;
			
			const tomorrowIsFast = statusTomorrow.isFasting && !statusTomorrow.isForbidden;
			const tomorrowIsForbidden = statusTomorrow.isForbidden;

			// 1. Today Fast && Tomorrow Fast -> "both-fast" (Yellow)
			if (todayIsFast && tomorrowIsFast) {
				combinedClass = "both-fast";
				combinedText = isAr 
					? "🌙 اليوم & غدا لديك صيامً" 
					: "🌙 today & tomorrow you have a fast";
			}
			// 2. Today Fast (Yellow) && Tomorrow Forbidden (Red) -> "mix-fast-forbid"
			else if (todayIsFast && tomorrowIsForbidden) {
				combinedClass = "mix-fast-forbid";
				combinedText = isAr 
					? "اليوم صيام وغداً الصيام محرم" 
					: "Today fast & tomorrow fasting is forbidden";
			}
			// 3. Today Forbidden (Red) && Tomorrow Fast (Yellow) -> "mix-forbid-fast"
			else if (todayIsForbidden && tomorrowIsFast) {
				combinedClass = "mix-forbid-fast";
				combinedText = isAr 
					? "اليوم الصيام محرم وغداً صيام" 
					: "Today fasting is forbidden & tomorrow have fast";
			}
		}

		// Render Combined Note if matched
		if (combinedText) {
			footer.createDiv({
				cls: `prayer-fasting-note ${combinedClass}`,
				text: `🌙 ${combinedText}`
			});
		} 
		else {
			// --- Fallback: Priority Logic (Single Alert) ---
			// If no specific combination matched, show the single most important event
			let activeStatus = null;

			// Priority: Forbidden(10) > Mandatory(5) > Recommended(4) > User(1)
			const p1 = statusToday ? statusToday.priority : 0;
			const p2 = statusTomorrow ? statusTomorrow.priority : 0;

			if (p1 >= p2 && p1 > 0) activeStatus = statusToday;
			else if (p2 > p1 && p2 > 0) activeStatus = statusTomorrow;

			if (activeStatus) {
				const noteDiv = footer.createDiv({
					cls: `prayer-fasting-note ${activeStatus.className}`,
					text: `🌙 ${activeStatus.text}`
				});
				
				// Add specific red styling class if forbidden
				if (activeStatus.isForbidden) {
					noteDiv.addClass("forbidden-note");
				}
			}
		}

		/* ----- buttons row ----- */

		const controls = footer.createDiv("prayer-footer-controls");

		const btnFetch = controls.createEl("button", {
			cls: "prayer-btn",
			text: this.plugin.t("fetchNow")
		});
		btnFetch.addEventListener("click", async () => {
			await this.plugin.fetchPrayerTimes(true);
		});

		const btnPlay = controls.createEl("button", {
			cls: "prayer-btn",
			text: this.plugin.t("playAthan")
		});
		btnPlay.addEventListener("click", async () => {
			await this.plugin.playAthan("Manual");
		});

		const btnStop = controls.createEl("button", {
			cls: "prayer-btn",
			text: this.plugin.t("stop")
		});
		btnStop.addEventListener("click", () => {
			this.plugin.stopAthan();
		});
	}

	_renderPrayerList(container, currentRef, tRef) {
		const refTextDiv = container.createDiv("prayer-panel-reference");
		const refText = this.plugin._computeReferenceTimeText(currentRef);
		refTextDiv.createDiv({
			cls: "prayer-ref-label",
			text: `${this.plugin.t("reference")} (${tRef(currentRef)}): ${refText || "—"}`
		});

		const list = container.createDiv("prayer-panel-list");
		const times = this.plugin.prayerTimes || {};
		if (!times.Fajr) {
			list.createDiv({ cls: "prayer-loading", text: this.plugin.t("loading") });
			return;
		}

		const now = new Date();
		const nowMin = now.getHours() * 60 + now.getMinutes();
		const next = this.plugin._getNextPrayer();

		let currentName = null;
		for (const name of ["Fajr", "Dhuhr", "Asr", "Maghrib", "Isha"]) {
			const t = times[name];
			if (!t) continue;
			if (this.plugin._hmToMinutes(t) === nowMin) {
				currentName = name;
				break;
			}
		}

		for (const name of ["Fajr", "Dhuhr", "Asr", "Maghrib", "Isha"]) {
			const row = list.createDiv("prayer-row");
			if (currentName === name) row.addClass("prayer-row-current");
			else if (next && next.name === name) row.addClass("prayer-row-next");

			row.createSpan({ cls: "prayer-name", text: this.plugin.tPrayer(name) });
			row.createSpan({ cls: "prayer-time", text: this.plugin._formatTime(times[name]) });

			// Check Master Toggle for Iqama Display
			const masterIqama = this.plugin.settings.enableIqamaFeature;
			const specificIqama = this.plugin.settings.iqamaEnabled?.[name];
			const iq = Number(this.plugin.settings.iqamaMinutes?.[name]) || 0;
			
			if (masterIqama && specificIqama && iq > 0) {
				row.createSpan({ cls: "prayer-iqama", text: `+${iq}${this.plugin.t("minutes")}` });
			}

			if (next && next.name === name) {
				row.createSpan({
					cls: "prayer-next-badge",
					text: `${this.plugin._formatCountdown(next)}`
				});
			}
		}
	}

	_renderReminderList(container) {
		const list = container.createDiv("prayer-panel-list");
		const reminders = this.plugin.getUpcomingRemindersForToday();

		if (reminders.length === 0) {
			list.createDiv({ cls: "prayer-loading", text: this.plugin.t("noUpcomingReminders") });
			return;
		}

		reminders.forEach(rem => {
			const row = list.createDiv("prayer-row");
			const timeStr = `${String(rem.time.getHours()).padStart(2,'0')}:${String(rem.time.getMinutes()).padStart(2,'0')}`;
			
			const timeSpan = row.createSpan({ cls: "prayer-time", text: this.plugin._formatTime(timeStr) });
			timeSpan.style.marginRight = "10px";
			
			const textSpan = row.createSpan({ cls: "prayer-name" });
			// Use MarkdownRenderer for panel list items too
			MarkdownRenderer.renderMarkdown(rem.text, textSpan, rem.file, this);
			
			// Style adjustments for rendered markdown inside list
			textSpan.style.fontWeight = "normal";
			textSpan.style.fontSize = "0.9em";
			textSpan.style.whiteSpace = "nowrap";
			textSpan.style.overflow = "hidden";
			textSpan.style.textOverflow = "ellipsis";

			row.addEventListener("click", async () => {
				const file = this.plugin.app.vault.getAbstractFileByPath(rem.file);
				if (file instanceof TFile) {
					const leaf = this.plugin.app.workspace.getLeaf(false);
					await leaf.openFile(file);
					const view = leaf.view;
					if (view instanceof MarkdownView) {
						const editor = view.editor;
						editor.setCursor({ line: rem.line, ch: 0 });
						editor.scrollIntoView({ from: { line: rem.line, ch: 0 }, to: { line: rem.line, ch: 0 } }, true);
					}
				}
			});
		});
	}
}

/* ============================
   Settings tab (fixed dropdown + text input)
============================== */

class PrayerSettingTab extends PluginSettingTab {
	constructor(app, plugin) { super(app, plugin); this.plugin = plugin; }

	// Helper to create audio setting with auto-complete
	createAudioSetting(containerEl, nameKey, descKey, settingKey) {
		const listId = `audio-list-${settingKey}`;
		new Setting(containerEl)
			.setName(this.plugin.t(nameKey))
			.setDesc(this.plugin.t(descKey))
			.addText(text => {
				text.setValue(this.plugin.settings[settingKey]);
				text.onChange(async v => {
					this.plugin.settings[settingKey] = v;
					await this.plugin.saveSettings();
				});

				// Attach datalist for auto-complete
				const input = text.inputEl;
				input.setAttribute('list', listId);

				// Create datalist if not exists
				let datalist = containerEl.querySelector(`#${listId}`);
				if (!datalist) {
					datalist = document.createElement('datalist');
					datalist.id = listId;
					containerEl.appendChild(datalist);
					
					// Populate with audio files from vault
					const audioFiles = this.plugin.app.vault.getFiles().filter(f => 
						['mp3', 'wav', 'ogg', 'm4a', 'webm'].includes(f.extension)
					);
					audioFiles.forEach(f => {
						const opt = document.createElement('option');
						opt.value = f.path;
						datalist.appendChild(opt);
					});
				}
			});
	}

	display() {
		const { containerEl } = this;
		containerEl.empty();

		// RTL support
		if (this.plugin.settings.language === "ar") containerEl.addClass("prayer-rtl");
		else containerEl.removeClass("prayer-rtl");

		containerEl.createEl("h2", { text: this.plugin.t("settingsTitle") });

		// --- 1. General Settings ---
		new Setting(containerEl)
			.setName(this.plugin.t("language"))
			.setDesc(this.plugin.t("languageDesc"))
			.addDropdown(dd => {
				dd.addOption("en", "English");
				dd.addOption("ar", "العربية");
				dd.setValue(this.plugin.settings.language);
				dd.onChange(async (val) => {
					this.plugin.settings.language = val;
					await this.plugin.saveSettings();
					this.display(); // Refresh to apply language direction/text
					this.plugin.refreshPrayerPanel();
					this.plugin.updateStatusBar();
				});
			});

		// Location Mode
		new Setting(containerEl)
			.setName(this.plugin.t("locationMode"))
			.addDropdown(dd => {
				dd.addOption("auto", this.plugin.t("locModeAuto"));
				dd.addOption("manual", this.plugin.t("locModeManual"));
				dd.setValue(this.plugin.settings.locationMode || "auto");
				dd.onChange(async v => {
					this.plugin.settings.locationMode = v;
					await this.plugin.saveSettings();
					this.display(); // Refresh to show/hide fields
				});
			});

		if (this.plugin.settings.locationMode === "manual") {
			new Setting(containerEl)
				.setName(this.plugin.t("latitude"))
				.setDesc(this.plugin.t("latitudeDesc"))
				.addText(t => t.setValue(this.plugin.settings.latitude).onChange(async v => {
					this.plugin.settings.latitude = v;
					await this.plugin.saveSettings();
				}));

			new Setting(containerEl)
				.setName(this.plugin.t("longitude"))
				.setDesc(this.plugin.t("longitudeDesc"))
				.addText(t => t.setValue(this.plugin.settings.longitude).onChange(async v => {
					this.plugin.settings.longitude = v;
					await this.plugin.saveSettings();
				}));
		} else {
			// City input
			new Setting(containerEl)
				.setName(this.plugin.t("city"))
				.setDesc(this.plugin.t("cityDesc"))
				.addText(t => t.setValue(this.plugin.settings.city).onChange(async v => { this.plugin.settings.city = v; await this.plugin.saveSettings(); await this.plugin.fetchPrayerTimes(true); }));

			// Country input
			const isAr = this.plugin.settings.language === "ar";
			let textInput = null;
			let ddRef = null;
			const datalistId = "prayer-country-list";
			if (!containerEl.querySelector(`#${datalistId}`)) {
				const dl = document.createElement("datalist");
				dl.id = datalistId;
				for (const c of COUNTRIES) {
					const opt = document.createElement("option");
					opt.value = c.en;
					dl.appendChild(opt);
				}
				containerEl.appendChild(dl);
			}

			new Setting(containerEl)
				.setName(this.plugin.t("country"))
				.setDesc(isAr ? "اختر الدولة أو اكتب اسمها" : "Select or type country name (or ISO code)")
				.addDropdown(dd => {
					ddRef = dd;
					dd.addOption("", isAr ? "-- اختر أو اكتب --" : "-- Select or type --");
					for (const country of COUNTRIES) {
						const label = isAr ? country.ar : country.en;
						dd.addOption(country.code, label);
					}
					const saved = this.plugin.settings.country || "";
					const pre = (typeof saved === "string" && saved.length === 2 && COUNTRIES.some(c => c.code === saved.toUpperCase())) ? saved.toUpperCase() : "";
					dd.setValue(pre);
					dd.onChange(async (val) => {
						this.plugin.settings.country = val || "";
						await this.plugin.saveSettings();
						if (textInput) textInput.setValue("");
					});
				})
				.addText(text => {
					textInput = text;
					const saved = this.plugin.settings.country || "";
					const initial = (typeof saved === "string" && saved.length === 2 && COUNTRIES.some(c => c.code === saved.toUpperCase())) ? "" : saved;
					text.setPlaceholder(isAr ? "أو اكتب هنا" : "Or type here")
						.setValue(initial)
						.onChange(async v => {
							const trimmed = v ? v.trim() : "";
							if (trimmed) {
								this.plugin.settings.country = trimmed;
								await this.plugin.saveSettings();
								try { if (ddRef) ddRef.setValue(""); } catch (e) {}
							}
						});
					setTimeout(() => { try { if (text.inputEl) text.inputEl.setAttribute("list", datalistId); } catch(e) {} }, 0);
				});
		}

		// Calculation method
		new Setting(containerEl)
			.setName(this.plugin.t("calcMethod"))
			.setDesc(this.plugin.t("calcMethodDesc"))
			.addDropdown(dd => {
				const isAr = this.plugin.settings.language === "ar";
				for (const opt of METHOD_OPTIONS) {
					const label = (isAr && opt.labelAr) ? opt.labelAr : opt.label;
					dd.addOption(String(opt.id), label);
				}
				dd.setValue(String(this.plugin.settings.method));
				dd.onChange(async (val) => {
					const num = Number(val);
					if (Number.isFinite(num)) {
						this.plugin.settings.method = num;
						await this.plugin.saveSettings();
						await this.plugin.fetchPrayerTimes(true);
					}
				});
			});

		// Time format
		new Setting(containerEl)
			.setName(this.plugin.t("timeFormat"))
			.setDesc(this.plugin.t("timeFormatDesc"))
			.addDropdown(dd => {
				dd.addOption("24h", this.plugin.t("timeFormat24h"));
				dd.addOption("12h", this.plugin.t("timeFormat12h"));
				dd.setValue(this.plugin.settings.timeFormat || "24h");
				dd.onChange(async (val) => {
					this.plugin.settings.timeFormat = val;
					await this.plugin.saveSettings();
					this.plugin.refreshPrayerPanel();
					this.plugin.updateStatusBar();
				});
			});

		// --- 2. Main Audio ---
		containerEl.createEl("h3", { text: this.plugin.t("audiofile") });
		this.createAudioSetting(containerEl, "athanAudio", "athanAudioDesc", "athanAudioPath");
		
		// --- 3. Enable Prayers & Offsets ---
		containerEl.createEl("h3", { text: this.plugin.t("enableFor") });
		for (const prayer of Object.keys(this.plugin.settings.enabledPrayers)) {
			new Setting(containerEl).setName(this.plugin.tPrayer(prayer)).addToggle(t => t.setValue(this.plugin.settings.enabledPrayers[prayer]).onChange(async v => { this.plugin.settings.enabledPrayers[prayer] = v; await this.plugin.saveSettings(); }));
		}

		// --- Prayer Offsets Section ---
		containerEl.createEl("h4", { text: this.plugin.t("offsetsSection") });
		containerEl.createEl("p", { text: this.plugin.t("offsetsDesc"), cls: "setting-item-description" });

		// 1. Master Toggle for Offsets
		new Setting(containerEl)
			.setName(this.plugin.settings.language === "ar" ? "تفعيل تعديل المواقيت" : "Enable Time Adjustments")
			.addToggle(toggle => {
				toggle
					.setValue(this.plugin.settings.enablePrayerOffsets)
					.onChange(async (val) => {
						this.plugin.settings.enablePrayerOffsets = val;
						await this.plugin.saveSettings();
						await this.plugin.fetchPrayerTimes(true); // Refetch to apply/remove offsets immediately
						this.display(); // Refresh UI to show/hide inputs
					});
			});

		// 2. Conditional Inputs (Only show if Master Toggle is ON)
		if (this.plugin.settings.enablePrayerOffsets) {
			for (const p of ["Fajr", "Sunrise", "Dhuhr", "Asr", "Maghrib", "Isha"]) {
				new Setting(containerEl)
					.setName(this.plugin.tPrayer(p))
					.addText(text => text
						.setPlaceholder("0")
						.setValue(String(this.plugin.settings.prayerOffsets[p] || 0))
						.onChange(async (value) => {
							const val = parseInt(value);
							this.plugin.settings.prayerOffsets[p] = isNaN(val) ? 0 : val;
							await this.plugin.saveSettings();
							await this.plugin.fetchPrayerTimes(true);
						})
					);
			}
		}

		// --- 4. Pre-Athan (Responsive) ---
		containerEl.createEl("h3", { text: "Pre-Athan" });
		new Setting(containerEl)
			.setName(this.plugin.t("enablePreAthan"))
			.setDesc(this.plugin.t("enablePreAthanDesc"))
			.addToggle(t => t.setValue(this.plugin.settings.enablePreAthan)
				.onChange(async v => { 
					this.plugin.settings.enablePreAthan = v; 
					await this.plugin.saveSettings(); 
					this.display(); // Refresh to show/hide sub-settings
				}));

		if (this.plugin.settings.enablePreAthan) {
			new Setting(containerEl)
				.setName(this.plugin.t("preAthanOffset"))
				.setDesc(this.plugin.t("preAthanOffsetDesc"))
				.addText(t => t.setValue(String(this.plugin.settings.preAthanOffsetMinutes))
					.onChange(async v => { const n = Number(v); if (!isNaN(n) && n >= 0 && n <= 120) { this.plugin.settings.preAthanOffsetMinutes = n; await this.plugin.saveSettings(); } }));
			
			this.createAudioSetting(containerEl, "preAthanAudio", "preAthanAudioDesc", "preAthanAudioPath");
		}

		// --- 5. Iqama Minutes ---
		containerEl.createEl("h3", { text: this.plugin.t("iqamaSection") });
		
		// Master Toggle for Iqama
		new Setting(containerEl)
			.setName(this.plugin.t("enableIqama"))
			.setDesc(this.plugin.t("enableIqamaDesc"))
			.addToggle(t => t.setValue(this.plugin.settings.enableIqamaFeature)
				.onChange(async v => { 
					this.plugin.settings.enableIqamaFeature = v; 
					await this.plugin.saveSettings(); 
					this.display(); // Refresh to show/hide sub-settings
				}));

		// Conditional Block for Iqama Settings
		if (this.plugin.settings.enableIqamaFeature) {
			
			// Iqama Audio (Moved here)
			this.createAudioSetting(containerEl, "iqamaAudio", "iqamaAudioDesc", "iqamaAudioPath");

			for (const p of ["Fajr", "Dhuhr", "Asr", "Maghrib", "Isha"]) {
				const iqamaSetting = new Setting(containerEl)
					.setName(this.plugin.tPrayer(p))
					.setDesc(this.plugin.t("iqamaDesc"));

				// 1. Add Toggle
				iqamaSetting.addToggle(toggle => {
					toggle
						.setValue(this.plugin.settings.iqamaEnabled[p])
						.onChange(async (val) => {
							this.plugin.settings.iqamaEnabled[p] = val;
							await this.plugin.saveSettings();
							this.display(); // Refresh to show/hide the text input
						});
				});

				// 2. Add Text Input (Only if Toggle is ON)
				if (this.plugin.settings.iqamaEnabled[p]) {
					iqamaSetting.addText(text => {
						text
							.setPlaceholder("Minutes")
							.setValue(String(this.plugin.settings.iqamaMinutes[p] || 0))
							.onChange(async (val) => {
								const n = Number(val);
								if (!isNaN(n) && n >= 0 && n <= 180) {
									this.plugin.settings.iqamaMinutes[p] = n;
									await this.plugin.saveSettings();
								}
							});
					});
				}
			}
		}

		// --- 6. Supplications (Responsive) ---
		containerEl.createEl("h3", { text: this.plugin.t("supplicationSection") });
		
		// Morning
		containerEl.createEl("h4", { text: this.plugin.t("morningSup") });
		new Setting(containerEl)
			.setName(this.plugin.t("morningSupEnable"))
			.setDesc(this.plugin.t("morningSupDesc"))
			.addToggle(t => t.setValue(this.plugin.settings.supplications.morning.enabled)
				.onChange(async v => { 
					this.plugin.settings.supplications.morning.enabled = v; 
					await this.plugin.saveSettings(); 
					this.display(); // Refresh
				}));

		if (this.plugin.settings.supplications.morning.enabled) {
			const listId = `audio-list-morning`;
			new Setting(containerEl).setName(this.plugin.t("morningSupAudio")).addText(t => {
				t.setValue(this.plugin.settings.supplications.morning.audioPath || "").onChange(async v => { this.plugin.settings.supplications.morning.audioPath = v; await this.plugin.saveSettings(); });
				t.inputEl.setAttribute('list', listId);
				let datalist = containerEl.querySelector(`#${listId}`);
				if (!datalist) {
					datalist = document.createElement('datalist');
					datalist.id = listId;
					containerEl.appendChild(datalist);
					const audioFiles = this.plugin.app.vault.getFiles().filter(f => ['mp3', 'wav', 'ogg', 'm4a', 'webm'].includes(f.extension));
					audioFiles.forEach(f => { const opt = document.createElement('option'); opt.value = f.path; datalist.appendChild(opt); });
				}
			});

			new Setting(containerEl).setName(this.plugin.t("morningOffset")).addText(t => t.setValue(String(this.plugin.settings.supplications.morning.offsetMinutes || 5)).onChange(async v => { const n = Number(v); if (!isNaN(n)) { this.plugin.settings.supplications.morning.offsetMinutes = n; await this.plugin.saveSettings(); } }));
			new Setting(containerEl).setName(this.plugin.t("morningDir")).addDropdown(dd => dd.addOption("before", this.plugin.t("before")).addOption("after", this.plugin.t("after")).setValue(this.plugin.settings.supplications.morning.direction || "after").onChange(async v => { this.plugin.settings.supplications.morning.direction = v; await this.plugin.saveSettings(); }));
		}

		// Evening
		containerEl.createEl("h4", { text: this.plugin.t("eveningSup") });
		new Setting(containerEl)
			.setName(this.plugin.t("eveningSupEnable"))
			.setDesc(this.plugin.t("eveningSupDesc"))
			.addToggle(t => t.setValue(this.plugin.settings.supplications.evening.enabled)
				.onChange(async v => { 
					this.plugin.settings.supplications.evening.enabled = v; 
					await this.plugin.saveSettings(); 
					this.display(); // Refresh
				}));

		if (this.plugin.settings.supplications.evening.enabled) {
			const listId = `audio-list-evening`;
			new Setting(containerEl).setName(this.plugin.t("eveningSupAudio")).addText(t => {
				t.setValue(this.plugin.settings.supplications.evening.audioPath || "").onChange(async v => { this.plugin.settings.supplications.evening.audioPath = v; await this.plugin.saveSettings(); });
				t.inputEl.setAttribute('list', listId);
				let datalist = containerEl.querySelector(`#${listId}`);
				if (!datalist) {
					datalist = document.createElement('datalist');
					datalist.id = listId;
					containerEl.appendChild(datalist);
					const audioFiles = this.plugin.app.vault.getFiles().filter(f => ['mp3', 'wav', 'ogg', 'm4a', 'webm'].includes(f.extension));
					audioFiles.forEach(f => { const opt = document.createElement('option'); opt.value = f.path; datalist.appendChild(opt); });
				}
			});
			new Setting(containerEl).setName(this.plugin.t("eveningOffset")).addText(t => t.setValue(String(this.plugin.settings.supplications.evening.offsetMinutes || 10)).onChange(async v => { const n = Number(v); if (!isNaN(n)) { this.plugin.settings.supplications.evening.offsetMinutes = n; await this.plugin.saveSettings(); } }));
			new Setting(containerEl).setName(this.plugin.t("eveningRef")).addDropdown(dd => dd.addOption("sunset", "sunset").addOption("Asr", "Asr").setValue(this.plugin.settings.supplications.evening.reference || "sunset").onChange(async v => { this.plugin.settings.supplications.evening.reference = v; await this.plugin.saveSettings(); }));
		}

		// Night
		containerEl.createEl("h4", { text: this.plugin.t("nightSup") });
		new Setting(containerEl)
			.setName(this.plugin.t("nightSupEnable"))
			.setDesc(this.plugin.t("nightSupDesc"))
			.addToggle(t => t.setValue(this.plugin.settings.supplications.night.enabled)
				.onChange(async v => { 
					this.plugin.settings.supplications.night.enabled = v; 
					await this.plugin.saveSettings(); 
					this.display(); // Refresh
				}));

		if (this.plugin.settings.supplications.night.enabled) {
			const listId = `audio-list-night`;
			new Setting(containerEl).setName(this.plugin.t("nightSupAudio")).addText(t => {
				t.setValue(this.plugin.settings.supplications.night.audioPath || "").onChange(async v => { this.plugin.settings.supplications.night.audioPath = v; await this.plugin.saveSettings(); });
				t.inputEl.setAttribute('list', listId);
				let datalist = containerEl.querySelector(`#${listId}`);
				if (!datalist) {
					datalist = document.createElement('datalist');
					datalist.id = listId;
					containerEl.appendChild(datalist);
					const audioFiles = this.plugin.app.vault.getFiles().filter(f => ['mp3', 'wav', 'ogg', 'm4a', 'webm'].includes(f.extension));
					audioFiles.forEach(f => { const opt = document.createElement('option'); opt.value = f.path; datalist.appendChild(opt); });
				}
			});
			new Setting(containerEl).setName(this.plugin.t("nightOffset")).addText(t => t.setValue(String(this.plugin.settings.supplications.night.offsetMinutes || 5)).onChange(async v => { const n = Number(v); if (!isNaN(n)) { this.plugin.settings.supplications.night.offsetMinutes = n; await this.plugin.saveSettings(); } }));
		}

		// --- 7. Display Reference ---
		new Setting(containerEl).setName(this.plugin.t("displayRef")).setDesc(this.plugin.t("displayRefDesc"))
			.addDropdown(dd => {
				dd.addOption("midnight", this.plugin.t("ref_midnight"));
				dd.addOption("lastThird", this.plugin.t("ref_lastThird"));
				dd.addOption("sunrise", this.plugin.t("ref_sunrise"));
				if(this.plugin.settings.enableReminders) {
					dd.addOption("reminders", this.plugin.t("ref_reminders"));
				}
				dd.setValue(this.plugin.settings.displayReference);
				dd.onChange(async v => { 
					this.plugin.settings.displayReference = v; 
					await this.plugin.saveSettings(); 
					this.plugin.refreshPrayerPanel(); 
				});
			});

		// --- 8. Fasting Settings (Responsive) ---
		containerEl.createEl("h3", { text: this.plugin.t("fastingSection") });
		new Setting(containerEl)
			.setName(this.plugin.t("enableFasting"))
			.addToggle(t => t.setValue(this.plugin.settings.fastingEnabled)
				.onChange(async v => { 
					this.plugin.settings.fastingEnabled = v; 
					await this.plugin.saveSettings(); 
					this.display(); // Refresh
				}));
		
		if (this.plugin.settings.fastingEnabled) {
			const days = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
			const wkContainer = containerEl.createDiv("fasting-weekdays-grid");
			wkContainer.createEl("div", { text: this.plugin.t("fastingWeekdays"), cls: "fasting-label" });
			const grid = wkContainer.createDiv("fasting-weekdays");
			for (const d of days) {
				const btn = grid.createEl("button", { cls: "fasting-day-btn", text: this.plugin.t(d) });
				btn.addEventListener("click", async () => {
					this.plugin.settings.fastingWeekdays[d] = !this.plugin.settings.fastingWeekdays[d];
					await this.plugin.saveSettings();
					btn.toggleClass("active", this.plugin.settings.fastingWeekdays[d]);
				});
				if (this.plugin.settings.fastingWeekdays[d]) btn.addClass("active");
			}
			new Setting(containerEl).setName(this.plugin.t("fastingHijri")).setDesc(this.plugin.t("fastingHijriDesc")).addText(t => t.setValue(this.plugin.settings.fastingHijriDays).onChange(async v => { this.plugin.settings.fastingHijriDays = v; await this.plugin.saveSettings(); }));
			new Setting(containerEl).setName(this.plugin.t("fastingPrayer")).setDesc(this.plugin.t("fastingPrayerDesc"))
				.addDropdown(dd => { ["Fajr","Dhuhr","Asr","Maghrib","Isha"].forEach(p => dd.addOption(p, this.plugin.tPrayer(p))); dd.setValue(this.plugin.settings.fastingAlert.prayer || "Fajr").onChange(async v => { this.plugin.settings.fastingAlert.prayer = v; await this.plugin.saveSettings(); }); });
			new Setting(containerEl).setName(this.plugin.t("fastingOffset")).addText(t => t.setValue(String(this.plugin.settings.fastingAlert.offsetMinutes || 0)).onChange(async v => { const n = Number(v); if (!isNaN(n)) { this.plugin.settings.fastingAlert.offsetMinutes = n; await this.plugin.saveSettings(); } }));
			new Setting(containerEl).setName(this.plugin.t("fastingDir")).addDropdown(dd => dd.addOption("before",this.plugin.t("before")).addOption("after",this.plugin.t("after")).setValue(this.plugin.settings.fastingAlert.direction || "before").onChange(async v => { this.plugin.settings.fastingAlert.direction = v; await this.plugin.saveSettings(); }));
			this.createAudioSetting(containerEl, "fastingAudio", "fastingAudioDesc", "fastingAudioPath");
		}

		// --- 9. Islamic Notes (Responsive) ---
		containerEl.createEl("h3", { text:this.plugin.t("islamicnote") });

		new Setting(containerEl)
			.setName(this.plugin.t("enabled"))
			.setDesc(this.plugin.t("enabledesc"))
			.addToggle(t => t.setValue(this.plugin.settings.enableDailyNotes)
				.onChange(async (v) => {
					this.plugin.settings.enableDailyNotes = v;
					await this.plugin.saveSettings();
					this.display(); // Refresh
				}));

		if (this.plugin.settings.enableDailyNotes) {
			new Setting(containerEl)
				.setName(this.plugin.t("folderpath"))
				.setDesc(this.plugin.t("folderpathdesc"))
				.addText(t => t.setValue(this.plugin.settings.dailyNotesFolder || "Daily").onChange(async (v) => {
					this.plugin.settings.dailyNotesFolder = v;
					await this.plugin.saveSettings();
				}));

			new Setting(containerEl)
				.setName(this.plugin.t("dateformat"))
				.setDesc(this.plugin.t("dateformatdesc"))
				.addDropdown(dropdown => {
					dropdown
						.addOption("iso", "ISO (YYYY-MM-DD)")
						.addOption("text", "Text (10 Muharram 1447)")
						.setValue(this.plugin.settings.hijriDateFormat || "iso")
						.onChange(async value => {
							this.plugin.settings.hijriDateFormat = value;
							await this.plugin.saveSettings();
							this.plugin.updateStatusBar?.();
						});
				});
			new Setting(containerEl)
				.setName(this.plugin.t("notedateformat"))
				.setDesc(this.plugin.t("notedateformatdesc"))
				.addDropdown(dd => {
					dd.addOption("hijri", "Hijri only");
					dd.addOption("gregorian", "Gregorian only");
					dd.addOption("both", "Both (Gregorian — Hijri)");
					dd.setValue(this.plugin.settings.dailyNotesDateFormat || "both");
					dd.onChange(async (v) => {
						this.plugin.settings.dailyNotesDateFormat = v;
						await this.plugin.saveSettings();
					});
				});
			
			// Note Template Settings - UPDATED VERSION
			containerEl.createEl("h4", { text: this.plugin.t("noteTemplate") });
			containerEl.createEl("p", { 
				text: this.plugin.t("noteTemplateDesc"),
				cls: "setting-item-description" 
			});

			if (this.plugin.settings.language === "ar") {
				// القالب العربي
				const arabicSetting = new Setting(containerEl)
					.setName(this.plugin.t("NoteTemplate"))
					.setDesc("اختر ملف قالب أو اكتب القالب مباشرة");
				
				// زر اختيار الملف
				arabicSetting.addButton(button => {
					button.setButtonText(this.plugin.t("chooseFile"));
					button.onClick(async () => {
						// فتح مستعرض الملفات
						const files = this.plugin.app.vault.getMarkdownFiles();
						const fileNames = files.map(f => f.path);
						
						// إنشاء نافذة منبثقة لاختيار الملف
						const modal = new TemplateFileModal(this.plugin.app, fileNames, (selectedPath) => {
							if (selectedPath) {
								this.plugin.settings.arabicNoteTemplatePath = selectedPath;
								this.plugin.settings.arabicNoteTemplateMode = "file";
								this.plugin.saveSettings();
								this.display(); // إعادة تحميل الواجهة
							}
						});
						modal.open();
					});
				});
				
				// زر الكتابة المباشرة
				arabicSetting.addButton(button => {
					button.setButtonText(this.plugin.t("writeTemplate"));
					button.onClick(async () => {
						this.plugin.settings.arabicNoteTemplateMode = "text";
						this.plugin.settings.arabicNoteTemplatePath = "";
						this.plugin.saveSettings();
						this.display(); // إعادة تحميل الواجهة
					});
				});
				
				// عرض الوضع الحالي
				arabicSetting.addText(text => {
					text.setDisabled(true);
					if (this.plugin.settings.arabicNoteTemplateMode === "file") {
						text.setValue(`path: ${this.plugin.settings.arabicNoteTemplatePath || this.plugin.t("noFileSelected")}`);
					} else {
						text.setValue(`write: ${this.plugin.t("directWritingMode")}`);
					}
				});
				
				// منطقة إدخال النص (تظهر فقط في وضع الكتابة)
				if (this.plugin.settings.arabicNoteTemplateMode === "text") {
					new Setting(containerEl)
						.setName(this.plugin.t("directTemplateText"))
						.addTextArea(text => {
							const defaultValue = "\n{{PRAYER_TIMES}}\n\n\n{{CHECKLIST}}\n\n \n{{SPECIAL_DAYS}}";
							
							text.setValue(this.plugin.settings.arabicNoteTemplate || defaultValue);
							text.setPlaceholder("استخدم {{PRAYER_TIMES}} و {{CHECKLIST}} و {{SPECIAL_DAYS}} كأماكن للنصوص الديناميكية");
							text.inputEl.rows = 8;
							text.inputEl.style.width = "100%";
							text.inputEl.style.fontFamily = "var(--font-family-mono, monospace)";
							text.inputEl.style.fontSize = "12px";
							text.inputEl.style.direction = "rtl";
							text.inputEl.style.textAlign = "right";
							
							text.onChange(async (value) => {
								this.plugin.settings.arabicNoteTemplate = value;
								await this.plugin.saveSettings();
							});
						});
				}
			} else {
				// القالب الإنجليزي
				const englishSetting = new Setting(containerEl)
					.setName(this.plugin.t("NoteTemplate"))
					.setDesc("Choose a template file or write template directly");
				
				// زر اختيار الملف
				englishSetting.addButton(button => {
					button.setButtonText(this.plugin.t("chooseFile"));
					button.onClick(async () => {
						// فتح مستعرض الملفات
						const files = this.plugin.app.vault.getMarkdownFiles();
						const fileNames = files.map(f => f.path);
						
						// إنشاء نافذة منبثقة لاختيار الملف
						const modal = new TemplateFileModal(this.plugin.app, fileNames, (selectedPath) => {
							if (selectedPath) {
								this.plugin.settings.englishNoteTemplatePath = selectedPath;
								this.plugin.settings.englishNoteTemplateMode = "file";
								this.plugin.saveSettings();
								this.display(); // إعادة تحميل الواجهة
							}
						});
						modal.open();
					});
				});
				
				// زر الكتابة المباشرة
				englishSetting.addButton(button => {
					button.setButtonText(this.plugin.t("writeTemplate"));
					button.onClick(async () => {
						this.plugin.settings.englishNoteTemplateMode = "text";
						this.plugin.settings.englishNoteTemplatePath = "";
						this.plugin.saveSettings();
						this.display(); // إعادة تحميل الواجهة
					});
				});
				
				// عرض الوضع الحالي
				englishSetting.addText(text => {
					text.setDisabled(true);
					if (this.plugin.settings.englishNoteTemplateMode === "file") {
						text.setValue(`path: ${this.plugin.settings.englishNoteTemplatePath || this.plugin.t("noFileSelected")}`);
					} else {
						text.setValue(`${this.plugin.t("directWritingMode")}`);
					}
				});
				
				// منطقة إدخال النص (تظهر فقط في وضع الكتابة)
				if (this.plugin.settings.englishNoteTemplateMode === "text") {
					new Setting(containerEl)
						.setName(this.plugin.t("directTemplateText"))
						.addTextArea(text => {
							const defaultValue = "{{PRAYER_TIMES}}\n\n#{{CHECKLIST}}\n\n{{SPECIAL_DAYS}}";
							
							text.setValue(this.plugin.settings.englishNoteTemplate || defaultValue);
							text.setPlaceholder("Use {{PRAYER_TIMES}}, {{CHECKLIST}}, and {{SPECIAL_DAYS}} as placeholders");
							text.inputEl.rows = 8;
							text.inputEl.style.width = "100%";
							text.inputEl.style.fontFamily = "var(--font-family-mono, monospace)";
							text.inputEl.style.fontSize = "12px";
							
							text.onChange(async (value) => {
								this.plugin.settings.englishNoteTemplate = value;
								await this.plugin.saveSettings();
							});
						});
				}
			}
		
const placeholderInfo = containerEl.createDiv({ cls: "template-placeholder-info" });
const markdownContent = `> [!Tips] available variable
> {{DATE}}  {{HIJRI_DATE}}  {{PRAYER_TIMES}}  {{PRAYER_TIMES_TABLE}}    {{CHECKLIST}}   {{SPECIAL_DAYS}}   {{FASTING_ANALYSIS}}  {{HIJRI_DAY}} {{HIJRI_MONTH}}  {{HIJRI_YEAR}}`;

MarkdownRenderer.renderMarkdown(markdownContent, placeholderInfo, '', null);
		}
		// After the dateformat dropdown
    new Setting(containerEl)
    .setName(this.plugin.t("autoOpenIslamicName"))
    .setDesc(this.plugin.t("autoOpenIslamicDesc"))
    .addToggle(t => t
        .setValue(this.plugin.settings.autoOpenIslamicNoteOnStartup)
        .onChange(async (val) => {
            this.plugin.settings.autoOpenIslamicNoteOnStartup = val;
            await this.plugin.saveSettings();
        }));
		// --- 10. More Settings ---
		containerEl.createEl("h3", { text: this.plugin.t("moresetting") });
		
		new Setting(containerEl).setName(this.plugin.t("showStatusBar")).setDesc(this.plugin.t("showStatusBarDesc")).addToggle(t => t.setValue(this.plugin.settings.enableStatusBar).onChange(async v => { this.plugin.settings.enableStatusBar = v; await this.plugin.saveSettings(); if (v && !this.plugin.statusBarEl) { this.plugin.statusBarEl = this.plugin.addStatusBarItem(); this.plugin.updateStatusBar(); } else if (!v && this.plugin.statusBarEl) { try { this.plugin.statusBarEl.remove(); } catch (e) {} this.plugin.statusBarEl = null; } }));
		new Setting(containerEl).setName(this.plugin.t("offlineFallback")).setDesc(this.plugin.t("offlineFallbackDesc")).addToggle(t => t.setValue(this.plugin.settings.enableOfflineFallback).onChange(async v => { this.plugin.settings.enableOfflineFallback = v; await this.plugin.saveSettings(); }));
		new Setting(containerEl).setName(this.plugin.t("sysNotif")).setDesc(this.plugin.t("sysNotifDesc")).addToggle(t => t.setValue(this.plugin.settings.showSystemNotification).onChange(async v => { this.plugin.settings.showSystemNotification = v; await this.plugin.saveSettings(); if (v && "Notification" in window && Notification.permission !== "granted") Notification.requestPermission(); }));
		new Setting(containerEl).setName(this.plugin.t("wakeLock")).setDesc(this.plugin.t("wakeLockDesc")).addToggle(t => t.setValue(this.plugin.settings.tryWakeLockOnMobile).onChange(async v => { this.plugin.settings.tryWakeLockOnMobile = v; await this.plugin.saveSettings(); }));
		
		// Reminder Settings
		new Setting(containerEl)
			.setName(this.plugin.t("enableReminders"))
			.setDesc(this.plugin.t("enableRemindersDesc"))
			.addToggle(t => t.setValue(this.plugin.settings.enableReminders)
				.onChange(async (v) => {
					this.plugin.settings.enableReminders = v;
					await this.plugin.saveSettings();
					if(v) this.plugin.scanVaultForReminders();
					this.display(); // Refresh to update reference dropdown
				}));
		
		if (this.plugin.settings.enableReminders) {
			this.createAudioSetting(containerEl, "reminderAudio", "reminderAudioDesc", "reminderAudioPath");
		}

		// Manual actions
		containerEl.createEl("hr");
		new Setting(containerEl).setName(this.plugin.t("manualActions"))
			.addButton(btn => btn.setButtonText(this.plugin.t("btnFetch")).onClick(async () => { await this.plugin.fetchPrayerTimes(true); }))
			.addButton(btn => btn.setButtonText(this.plugin.t("btnPlay")).onClick(async () => { await this.plugin.playAthan("Manual"); }))
			.addButton(btn => btn.setButtonText(this.plugin.t("btnStop")).onClick(() => { this.plugin.stopAthan(); }))
	}
}

/* ============================
   Reminder Modal UI - FIXED VERSION
============================== */
class ReminderNotificationModal extends Modal {
	constructor(app, reminder, plugin) {
		super(app);
		this.reminder = reminder;
		this.plugin = plugin;
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.addClass("prayer-reminder-modal");

		contentEl.createEl("h3", { text: this.plugin.t("reminderNotificationTitle"), cls: "prayer-reminder-title" });
		
		// Extract reminder text without tag
		let displayText = this.reminder.text;
		if(this.reminder.type === 'fixed') {
			displayText = displayText.replace(new RegExp(`\\(@${this.reminder.date}\\s+${this.reminder.time}\\)`), '').trim();
		} else {
			displayText = displayText.replace(new RegExp(`\\(@${this.reminder.date}\\s+${this.reminder.direction}-${this.reminder.ref}\\s+${this.reminder.offset}m\\)`), '').trim();
		}
		// Remove Task checkboxes visual
		displayText = displayText.replace(/^-\s*\[.\]\s*/, '').trim();

		const msgDiv = contentEl.createDiv({ cls: "prayer-reminder-message" });
		
		// Use MarkdownRenderer to render links, bold, etc.
		MarkdownRenderer.renderMarkdown(displayText || this.plugin.t("remindersTitle"), msgDiv, this.reminder.file, this);
		
		const subDiv = contentEl.createDiv({ cls: "prayer-reminder-sub" });
		subDiv.setText(`${this.reminder.file}`);

		const btnContainer = contentEl.createDiv({ cls: "prayer-reminder-actions" });

		// Mute (Just for today)
		const muteBtn = btnContainer.createEl("button", { text: this.plugin.t("reminderMute") });
		muteBtn.onclick = () => {
			this.plugin.stopAthan();
			// Mark as triggered for today (won't trigger again today)
			const key = this.plugin._generateReminderKey(this.reminder);
			this.plugin.lastTriggered.reminder = key;
			this.close();
		};

		// Done (Mark as completed in file)
		const doneBtn = btnContainer.createEl("button", { text: this.plugin.t("reminderDone"), cls: "mod-cta" });
		doneBtn.onclick = async () => {
			this.plugin.stopAthan();
			await this.plugin.markReminderDone(this.reminder);
			this.close();
		};

		// Postpone (Delay by 15 minutes)
		const postponeBtn = btnContainer.createEl("button", { text: this.plugin.t("reminderPostpone") });
		postponeBtn.onclick = async () => {
			this.plugin.stopAthan();
			await this.plugin.postponeReminder(this.reminder);
			this.close();
		};
	}

	onClose() {
		const { contentEl } = this;
		contentEl.empty();
		this.plugin.stopAthan();
	}
}

/* ============================
   Template File Modal
============================== */
class TemplateFileModal extends Modal {
	constructor(app, filePaths, callback) {
		super(app);
		this.filePaths = filePaths;
		this.callback = callback;
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.addClass("prayer-template-modal");
		
		contentEl.createEl("h3", { text: "Select Template File", cls: "prayer-modal-title" });
		
		const searchContainer = contentEl.createDiv({ cls: "template-search-container" });
		const searchInput = searchContainer.createEl("input", {
			type: "text",
			placeholder: "Search files...",
			cls: "template-search-input"
		});
		
		const listContainer = contentEl.createDiv({ cls: "template-file-list" });
		
		// وظيفة عرض الملفات
		const displayFiles = (filter = "") => {
			listContainer.empty();
			
			const filteredFiles = this.filePaths.filter(path => 
				path.toLowerCase().includes(filter.toLowerCase())
			);
			
			if (filteredFiles.length === 0) {
				listContainer.createDiv({ 
					text: "No files found", 
					cls: "template-no-files" 
				});
				return;
			}
			
			filteredFiles.forEach(path => {
				const fileItem = listContainer.createDiv({ cls: "template-file-item" });
				fileItem.createDiv({ 
					text: path, 
					cls: "template-file-path" 
				});
				
				fileItem.addEventListener("click", () => {
					this.callback(path);
					this.close();
				});
			});
		};
		
		// عرض جميع الملفات في البداية
		displayFiles();
		
		// إضافة مستمع للبحث
		searchInput.addEventListener("input", (e) => {
			displayFiles(e.target.value);
		});
		
		// زر الإلغاء
		const cancelBtn = contentEl.createEl("button", { 
			text: "Cancel", 
			cls: "prayer-modal-cancel" 
		});
		cancelBtn.addEventListener("click", () => {
			this.callback(null);
			this.close();
		});
	}

	onClose() {
		const { contentEl } = this;
		contentEl.empty();
	}
}

/* ============================
   CSS
============================== */

const PRAYER_PANEL_CSS = `
.prayer-panel-container { padding: 16px; font-family: var(--font-family); color: var(--text-normal); }
.prayer-panel-header { display:flex; justify-content:space-between; align-items:center; margin-bottom:12px; gap:12px; }
.prayer-panel-title { font-size:18px; font-weight:600; }
.prayer-panel-hijri { font-size:14px; opacity:0.95; }

/* RTL Support */
.prayer-rtl { direction: rtl; }

/* Reference toggle button - UPDATED RESPONSIVE */
.prayer-panel-ref-btn-container { 
    display: flex; 
    align-items: center; 
    gap: 6px;
    flex-wrap: wrap;
    min-height: 32px;
}

.prayer-ref-toggle-btn {
    padding: 5px 8px; /* Reduced padding */
    border-radius: 999px; /* Oval shape */
    border: 1px solid var(--background-modifier-border);
    background: transparent;
    cursor: pointer;
    font-size: 12px; /* Smaller font */
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: 180px; /* Limit maximum width */
    min-width: 80px; /* Minimum width */
    flex: 1 1 auto; /* Allow to shrink/grow */
}

.prayer-ref-toggle-btn:hover { 
    background: var(--background-modifier-hover); 
}
/* reference text */
.prayer-panel-reference { margin-bottom:8px; font-size:13px; opacity:0.9; }

/* list: scrollable */
.prayer-panel-list {
	max-height: 320px;
	overflow-y: auto;
	padding: 6px 4px;
	margin-bottom:12px;
}

/* individual rows */
.prayer-row {
	display:flex;
	justify-content:space-between;
	align-items:center;
	padding:10px 12px;
	border-bottom: none;
	background: transparent;
	cursor:pointer;
	touch-action: manipulation;
	user-select: none;
	-webkit-user-select: none;
	border-radius: 10px;
	margin-bottom: 8px;
	transition: background 0.12s ease, transform 0.06s ease;
}
.prayer-row:hover { transform: translateY(-1px); background: var(--background-modifier-hover); }

/* current prayer */
.prayer-row-current {
	background: rgba(255,255,255,0.92);
	color: var(--interactive-accent);
	font-weight: 700;
	box-shadow: 0 1px 0 rgba(0,0,0,0.04);
}
@media (prefers-color-scheme: dark) {
	.prayer-row-current {
		background: linear-gradient(90deg, rgba(255,255,255,0.03), rgba(255,255,255,0.01));
		color: var(--interactive-accent);
	}
}

/* next prayer */
.prayer-row-next {
	background: linear-gradient(90deg, rgba(0,0,0,0.02), rgba(0,0,0,0.00));
	border-left: 4px dashed var(--interactive-accent);
}

/* name/time styling */
.prayer-name { font-weight:600; }
.prayer-time { font-family:monospace; font-size:15px; }
.prayer-iqama { font-size:12px; opacity:0.85; margin-left:8px; }

/* next badge */
.prayer-next-badge { background:var(--interactive-accent); color:var(--text-on-accent); border-radius:999px; padding:4px 10px; font-size:12px; margin-left:8px; cursor:pointer; }

/* Footer layout */
.prayer-panel-footer {
	display: flex;
	flex-direction: column;
	align-items: stretch;
	gap: 10px;
	margin-top: 12px;
	padding-top: 12px;
	border-top: 1px solid var(--background-modifier-border);
}

/* --- FASTING NOTES --- */

/* Base Style */
.prayer-fasting-note {
	padding: 8px 10px;
	border-radius: 8px;
	font-weight: 600;
	text-align: center;
	box-shadow: 0 1px 0 rgba(0,0,0,0.04);
	white-space: normal;
	line-height: 1.3;
	margin-bottom: 8px;
	font-size: 13px;
}

/* 1. Standard / User Fast (Gold Gradient) */
.prayer-fasting-note.default,
.prayer-fasting-note.recommended,
.prayer-fasting-note.mandatory,
.prayer-fasting-note.both-fast {
	background: linear-gradient(90deg, #ffe082, #ffd54f); /* Softer Amber/Gold */
	color: #3e2723; /* Dark brown text for contrast */
}

/* 2. Forbidden (Red Gradient) */
.prayer-fasting-note.forbidden-note {
	background: linear-gradient(90deg, #ef9a9a, #e57373); /* Softer Pastel Red */
	color: #3e2723;
}

/* 3. Mixed: Today Fast (Gold) | Tomorrow Forbidden (Red) */
.prayer-fasting-note.mix-fast-forbid {
	/* 50% split using the softer colors */
	background: linear-gradient(90deg, #ffe082 50%, #ef9a9a 50%);
	color: #3e2723;
}

/* 4. Mixed: Today Forbidden (Red) | Tomorrow Fast (Gold) */
.prayer-fasting-note.mix-forbid-fast {
	/* 50% split using the softer colors */
	background: linear-gradient(90deg, #ef9a9a 50%, #ffe082 50%);
	color: #3e2723;
}

/* --- Dark Mode Adjustments (Lower Brightness/Opacity) --- */
@media (prefers-color-scheme: dark) {
	.prayer-fasting-note.default,
	.prayer-fasting-note.recommended,
	.prayer-fasting-note.mandatory,
	.prayer-fasting-note.both-fast {
		background: linear-gradient(90deg, rgba(255, 213, 79, 0.25), rgba(255, 202, 40, 0.25));
		color: #fff9c4; /* Light Yellow Text */
		border: 1px solid rgba(255, 213, 79, 0.3);
	}

	.prayer-fasting-note.forbidden-note {
		background: linear-gradient(90deg, rgba(239, 83, 80, 0.25), rgba(229, 115, 115, 0.25));
		color: #ffcdd2; /* Light Red Text */
		border: 1px solid rgba(239, 83, 80, 0.3);
	}

	.prayer-fasting-note.mix-fast-forbid {
		background: linear-gradient(90deg, rgba(255, 213, 79, 0.25) 50%, rgba(239, 83, 80, 0.25) 50%);
		color: var(--text-normal);
		border: 1px solid rgba(255, 255, 255, 0.1);
	}

	.prayer-fasting-note.mix-forbid-fast {
		background: linear-gradient(90deg, rgba(239, 83, 80, 0.25) 50%, rgba(255, 213, 79, 0.25) 50%);
		color: var(--text-normal);
		border: 1px solid rgba(255, 255, 255, 0.1);
	}
}

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
    overflow: hidden;
    text-overflow: ellipsis;
    font-size: 12px;
    transition: all 0.2s ease;
}

.fasting-day-btn.active {
    background: var(--interactive-accent);
    color: var(--text-on-accent);
}

@media (max-width: 1768px) {
.fasting-day-btn:hover {
    background: var(--background-modifier-hover);
    transform: translateY(-0.5px);
}

    .fasting-weekdays {
        gap: 4px;
        justify-content: center; 
    }
    
    .fasting-day-btn {
        flex: 0 1 calc(14.28% - 4px); /* 7 أزرار في السطر (100% / 7) */
        min-width: 35px;
        max-width: 600px;
        padding: 5px 4px;
        font-size: 11px;
    }
}

@media (max-width: 480px) {
    .fasting-weekdays {
        gap: 3px;
    }
    
    .fasting-day-btn {
        flex: 0 1 calc(25% - 3px);
        min-width: auto;
        max-width: none;
        font-size: 10px;
    }
}

@media (max-width: 320px) {
    .fasting-weekdays {
        gap: 2px;
    }
    
    .fasting-day-btn {
        flex: 0 1 calc(33.33% - 2px);
        font-size: 9px;
    }
}

/* buttons row - UPDATED RESPONSIVE VERSION */
.prayer-footer-controls { 
    display: flex; 
    justify-content: center; 
    gap: 4px; /* Reduced gap */
    width: 100%;
    min-height: 40px; /* Ensure consistent height */
}

.prayer-btn {
    flex: 1 1 auto; /* Allow buttons to grow/shrink */
    min-width: 60px; /* Reduced minimum width */
    max-width: 100px; /* Reduced maximum width */
    padding: 6px 4px; /* Reduced padding */
    font-size: 11px; /* Smaller font */
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    text-align: center;
    border-radius: 999px; /* Oval/pill shape */
    border: 1px solid var(--background-modifier-border);
    background: transparent;
    cursor: pointer;
    transition: all 0.2s ease;
    word-break: keep-all;
}

.prayer-btn:hover { 
    background: var(--background-modifier-hover); 
    transform: translateY(-1px);
}

.prayer-footer-fetch { 
    font-size: 11px; 
    opacity: 0.6; 
    text-align: center; 
    font-family: var(--font-monospace); 
    margin-bottom: 8px;
}

/* Small sidebar adjustments */
@media (max-width: 300px) {
    .prayer-footer-controls {
        gap: 3px;
    }
    
    .prayer-btn {
        min-width: 50px; /* Even smaller for narrow sidebars */
        padding: 5px 3px;
        font-size: 10px;
        border-radius: 999px;
    }
}

/* Extra small sidebar */
@media (max-width: 200px) {
    .prayer-footer-controls {
        gap: 2px;
    }
    
    .prayer-btn {
        min-width: 45px;
        padding: 4px 2px;
        font-size: 9px;
        border-radius: 999px;
    }
}

/* Update the existing media query for mobile */
@media (max-width:768px) {
    .prayer-row { padding:12px 10px; }
    .prayer-panel-title { font-size:20px; }
    .prayer-panel-hijri { font-size:16px; }
    
    /* Add button adjustments for mobile */
    .prayer-btn {
        min-width: 70px; /* Slightly larger on mobile but still compact */
        padding: 8px 6px;
        font-size: 12px;
        border-radius: 999px;
    }
}

/* small responsive adjustments */
@media (max-width:768px) {
	.prayer-row { padding:12px 10px; }
	.prayer-panel-title { font-size:20px; }
	.prayer-panel-hijri { font-size:16px; }
	
    /* Add button adjustments for mobile */
    .prayer-btn {
        min-width: 80px;
        padding: 10px 8px;
        font-size: 13px;
    }
}

/* Reminder Modal Styles */
.prayer-reminder-modal { 
	text-align: center; 
	padding: 20px; 
	max-width: 400px;
	margin: 0 auto; /* Center horizontally */
	display: flex;
	flex-direction: column;
	justify-content: center;
	align-items: center;
}
.prayer-reminder-title { margin-bottom: 10px; color: var(--text-muted); }
.prayer-reminder-message { font-size: 1.1em; margin-bottom: 10px; text-align: left; width: 100%; }
.prayer-reminder-message p { margin: 0; } /* Reset markdown paragraph margins */
.prayer-reminder-sub { font-size: 0.9em; color: var(--text-faint); margin-bottom: 20px; word-break: break-all; }
.prayer-reminder-actions { display: flex; justify-content: space-around; gap: 10px; width: 100%; }
.prayer-reminder-actions button { min-width: 80px; }

/* Panel List Markdown Fixes */
.prayer-panel-list .prayer-name p {
	margin: 0;
	display: inline;
}

/* Template Textarea Styles */
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

.setting-item textarea[dir="rtl"] {
	direction: rtl;
	text-align: right;
}

/* Template Placeholder Info */
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

/* Template Modal Styles */
.prayer-template-modal { 
	padding: 20px; 
	max-width: 500px;
	max-height: 70vh;
	overflow: hidden;
	display: flex;
	flex-direction: column;
}

.prayer-modal-title { 
	margin-bottom: 15px; 
	color: var(--text-normal);
}

.template-search-container {
	margin-bottom: 15px;
}

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

.template-file-item:hover {
	background: var(--background-modifier-hover);
}

.template-file-path {
	font-family: var(--font-family-mono);
	font-size: 12px;
	word-break: break-all;
	color: var(--text-muted);
}

.template-no-files {
	padding: 20px;
	text-align: center;
	color: var(--text-muted);
	font-style: italic;
}

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

.prayer-modal-cancel:hover {
	background: var(--background-modifier-hover);
}
`;

// ===== OFFLINE CALENDAR IMPROVEMENT PATCH =====
// Adds month-level caching so plugin works many days without internet.
// It stores a full month from AlAdhan calendar endpoint and selects
// the correct day locally.

async function fetchPrayerTimes(lat, lon, method) {

    const now = new Date();
    const month = now.getMonth() + 1;
    const year = now.getFullYear();
    const today = now.getDate();

    const cacheKey = `prayer_${lat}_${lon}_${method}_${month}_${year}`;

    // محاولة قراءة cache
    const cached = localStorage.getItem(cacheKey);
    if (cached) {
        const parsed = JSON.parse(cached);
        return parsed[today - 1].timings;
    }

    const url = `https://api.aladhan.com/v1/calendar?latitude=${lat}&longitude=${lon}&method=${method}&month=${month}&year=${year}`;

    try {

        const res = await fetch(url);
        const data = await res.json();

        if (!data || !data.data) {
            throw new Error("Invalid API response");
        }

        // حفظ الشهر في cache
        localStorage.setItem(cacheKey, JSON.stringify(data.data));

        return data.data[today - 1].timings;

    } catch (err) {
        console.error("Prayer API error:", err);
        return null;
    }
}

function pickTodayFromCalendar(calendar) {
	const today = new Date().getDate();
	const day = calendar.find(d => Number(d.date.gregorian.day) === today);
	if (!day) return null;

	return {
		Fajr: day.timings.Fajr,
		Dhuhr: day.timings.Dhuhr,
		Asr: day.timings.Asr,
		Maghrib: day.timings.Maghrib,
		Isha: day.timings.Isha
	};
}

// Monkey patch helper
async function enhanceOfflineSupport(plugin) {
	try {
		if (!plugin.settings.cached) plugin.settings.cached = {};
		if (!plugin.settings.cached.calendar) {
			const cal = await fetchMonthlyCalendar(
				plugin.settings.latitude,
				plugin.settings.longitude,
				plugin.settings.method || 2
			);
			plugin.settings.cached.calendar = cal;
			await plugin.saveSettings();
		}

		const todayTimes = pickTodayFromCalendar(plugin.settings.cached.calendar);
		if (todayTimes) {
			plugin.prayerTimes = todayTimes;
		}
	} catch (e) {
		console.warn("Offline calendar enhancement failed:", e);
	}
}

// Try activating enhancement when plugin loads
setTimeout(() => {
	try {
		if (app?.plugins?.plugins) {
			for (const p of Object.values(app.plugins.plugins)) {
				if (p?.prayerTimes !== undefined) {
					enhanceOfflineSupport(p);
				}
			}
		}
	} catch (e) {}
}, 4000);

// ===== END PATCH =====

