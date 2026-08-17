---
icon: lucide-glasses
Categories:
  - "[[Technical Doc's|Technical Doc's]]"
---
>إعداداتي في التطبيق من حيث الثيم والألوان كالتالي مع اكواد الCss في الاسفل
>اللون هو:#d6a58b (سابقا, فمؤخرا صرت أُفضل اللون الأساسي)
>الثيم هو: Yotsuba
#### All Settings
<!-- file is: settings.json-->
##### Old v
```json
{"CHAPTER_READER_SETTINGS":"{\"theme\":\"#000000\",\"textColor\":\"#FCFCFC\",\"textSize\":26,\"textAlign\":\"center\",\"padding\":16,\"fontFamily\":\"\",\"lineHeight\":1.5,\"customCSS\":\"body {\\n  --theme-primary: color-mix(in srgb, var(--readerSettings-textColor) 50%, transparent);\\n  direction: rtl !important;\\n  font-family: serif !important;\\n  text-align: var(--readerSettings-textAlign) !important;\\n  background-color: var(--readerSettings-theme) !important;\\n}\\n#LNReader-chapter h1 {\\n  font-size: 2.5rem;\\n  padding-bottom: 0.2em;\\n  border-top: 1px dashed var(--theme-secondary);\\n  border-left: 1px dashed var(--theme-secondary);\\n  border-right: 1px dashed var(--theme-secondary);\\n  border-bottom: 1px solid var(--theme-secondary);\\n}\\n#LNReader-chapter h2 {\\n  font-size: 2.5rem;\\n  padding-bottom: 0.2em;\\n  border-left: 1px dashed var(--theme-secondary);\\n  border-right: 1px dashed var(--theme-secondary);\\n  border-bottom: 1px solid var(--theme-outline);\\n}\\n#LNReader-chapter h3 {\\n  font-size: 2.5rem;\\n  padding-bottom: 0.2em;\\n  border-bottom: 1px solid var(--theme-outline);\\n}\\n#LNReader-chapter h4 {\\n  font-size: 2.5rem;\\n  padding-bottom: 0.2em;\\n  border-left: 1px dashed var(--theme-secondary);\\n  border-right: 1px dashed var(--theme-secondary);\\n}\\n#TTS-Controller {\\n  display: none;\\n}\\n.next-button {\\n  color: var(--readerSettings-textColor);\\n  background-color: var(--theme-onPrimary);\\n}\",\"customJS\":\"// translate function\\n(function() {\\n    let translationQueue = [];\\n    let isTranslating = false;\\n    \\n    const customDictionary = {\\n        \\\"book\\\": \\\"كتاب\\\"\\n};\\n    \\n    // Add debug logging\\n    function log(message, data) {\\n        console.log(`[Translation Script] ${message}`, data || '');\\n    }\\n    \\n    log('Script initialized');\\n    \\n    const observer = new MutationObserver(function(mutations) {\\n        log('Mutation observed', mutations.length);\\n        for (const mutation of mutations) {\\n            if (mutation.type === 'childList' || mutation.type === 'characterData') {\\n                collectNewTextNodes();\\n            }\\n        }\\n    });\\n    \\n    function applyDictionary(text) {\\n        let result = text;\\n        for (const [english, arabic] of Object.entries(customDictionary)) {\\n            const regex = new RegExp(english.replace(/[.*+?^${}()|[\\\\]\\\\\\\\]/g, '\\\\\\\\$&'), 'gi');\\n            result = result.replace(regex, arabic);\\n        }\\n        return result;\\n    }\\n    \\n    function collectNewTextNodes() {\\n        log('Collecting text nodes');\\n        const textNodes = getTextNodes(document.body);\\n        log(`Found ${textNodes.length} text nodes`);\\n        \\n        for (const node of textNodes) {\\n            if (!node.nodeValue || node.nodeValue.trim() === '') continue;\\n            if (node.parentElement && isAlreadyTranslated(node.parentElement)) continue;\\n            if (node.hasAttribute && node.hasAttribute('data-queued')) continue;\\n            if (node.hasAttribute && node.hasAttribute('data-translating')) continue;\\n            \\n            const originalText = node.nodeValue;\\n            if (!needsTranslation(originalText)) continue;\\n            \\n            log('Queuing text for translation:', originalText.substring(0, 50));\\n            \\n            if (node.setAttribute) {\\n                node.setAttribute('data-queued', 'true');\\n            }\\n            \\n            translationQueue.push({\\n                node: node,\\n                text: originalText\\n            });\\n        }\\n        \\n        if (!isTranslating && translationQueue.length > 0) {\\n            log(`Starting translation of ${translationQueue.length} items`);\\n            processQueue();\\n        }\\n    }\\n    \\n    function getTextNodes(element) {\\n        const walker = document.createTreeWalker(\\n            element,\\n            NodeFilter.SHOW_TEXT,\\n            {\\n                acceptNode: function(node) {\\n                    if (!node.nodeValue || node.nodeValue.trim() === '') return NodeFilter.FILTER_REJECT;\\n                    if (node.parentElement && isExcludedTag(node.parentElement)) return NodeFilter.FILTER_REJECT;\\n                    return NodeFilter.FILTER_ACCEPT;\\n                }\\n            }\\n        );\\n        \\n        const nodes = [];\\n        while(walker.nextNode()) nodes.push(walker.currentNode);\\n        return nodes;\\n    }\\n    \\n    function isExcludedTag(element) {\\n        const excluded = ['SCRIPT', 'STYLE', 'CODE', 'PRE', 'TEXTAREA', 'INPUT'];\\n        return excluded.includes(element.tagName);\\n    }\\n    \\n    function isAlreadyTranslated(element) {\\n        return element.hasAttribute && element.hasAttribute('data-translated');\\n    }\\n    \\n    function markAsTranslated(element) {\\n        if (element && element.setAttribute) {\\n            element.setAttribute('data-translated', 'true');\\n            if (element.hasAttribute('data-queued')) {\\n                element.removeAttribute('data-queued');\\n            }\\n            if (element.hasAttribute('data-translating')) {\\n                element.removeAttribute('data-translating');\\n            }\\n        }\\n    }\\n    \\n    function needsTranslation(text) {\\n        const arabicPattern = /[\\\\u0600-\\\\u06FF]/;\\n        const englishPattern = /[a-zA-Z]/;\\n        const hasEnglish = englishPattern.test(text);\\n        const hasArabic = arabicPattern.test(text);\\n        const englishRatio = (text.match(/[a-zA-Z]/g) || []).length / text.length;\\n        const needs = hasEnglish && (!hasArabic || englishRatio > 0.3);\\n        if (needs) {\\n            log('Text needs translation:', text.substring(0, 50));\\n        }\\n        return needs;\\n    }\\n    \\n    async function processQueue() {\\n        if (translationQueue.length === 0) {\\n            isTranslating = false;\\n            log('Translation queue empty');\\n            return;\\n        }\\n        \\n        isTranslating = true;\\n        \\n        const item = translationQueue.shift();\\n        const { node, text } = item;\\n        \\n        if (!node.parentElement || isAlreadyTranslated(node.parentElement)) {\\n            processQueue();\\n            return;\\n        }\\n        \\n        if (node.setAttribute) {\\n            node.setAttribute('data-translating', 'true');\\n            if (node.hasAttribute('data-queued')) {\\n                node.removeAttribute('data-queued');\\n            }\\n        }\\n        \\n        try {\\n            log('Translating:', text.substring(0, 50));\\n            const translated = await translateText(text);\\n            log('Translated to:', translated.substring(0, 50));\\n            \\n            if (translated && translated !== text && node.parentElement) {\\n                const parent = node.parentElement;\\n                \\n                node.nodeValue = translated;\\n                markAsTranslated(parent);\\n                \\n                if (parent.childNodes.length === 1 && parent.textContent.trim() === translated.trim()) {\\n                    parent.style.opacity = '0';\\n                    parent.style.transition = 'opacity 0.3s';\\n                    setTimeout(() => {\\n                        parent.style.opacity = '1';\\n                    }, 50);\\n                }\\n                log('Successfully translated and applied');\\n            } else if (node.parentElement) {\\n                markAsTranslated(node.parentElement);\\n                log('No translation needed or translation failed');\\n            }\\n        } catch(e) {\\n            console.error('Translation error:', e);\\n            if (node.parentElement) {\\n                node.setAttribute('data-translate-error', 'true');\\n            }\\n        } finally {\\n            if (node.setAttribute) {\\n                node.removeAttribute('data-translating');\\n            }\\n        }\\n        \\n        await delay(150);\\n        \\n        processQueue();\\n    }\\n    \\n    async function translateText(text) {\\n        if (!text || text.trim().length === 0) return text;\\n        \\n        const cleanText = text.replace(/\\\\s+/g, ' ').trim();\\n        \\n        const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=ar&dt=t&q=${encodeURIComponent(cleanText)}`;\\n        \\n        try {\\n            const response = await fetch(url);\\n            if (!response.ok) {\\n                throw new Error(`HTTP error! status: ${response.status}`);\\n            }\\n            const data = await response.json();\\n            if (data && data[0]) {\\n                let translated = '';\\n                for (let i = 0; i < data[0].length; i++) {\\n                    if (data[0][i] && data[0][i][0]) {\\n                        translated += data[0][i][0];\\n                    }\\n                }\\n                let result = applyDictionary(translated);\\n                return result;\\n            }\\n            return applyDictionary(text);\\n        } catch(e) {\\n            console.error('Fetch error:', e);\\n            return applyDictionary(text);\\n        }\\n    }\\n    \\n    function delay(ms) {\\n        return new Promise(resolve => setTimeout(resolve, ms));\\n    }\\n    \\n    observer.observe(document.body, {\\n        childList: true,\\n        subtree: true,\\n        characterData: true\\n    });\\n    \\n    window.addEventListener('load', function() {\\n        log('Window loaded, collecting text nodes');\\n        setTimeout(() => {\\n            collectNewTextNodes();\\n        }, 300);\\n    });\\n    \\n    window.addEventListener('scroll', function() {\\n        if (!isTranslating && translationQueue.length > 0) {\\n            processQueue();\\n        }\\n    });\\n    \\n    const style = document.createElement('style');\\n    style.textContent = `\\n        [data-translating] {\\n            opacity: 0.7;\\n            transition: opacity 0.2s;\\n        }\\n        [data-translate-error] {\\n            border-left: 2px solid red;\\n        }\\n    `;\\n    document.head.appendChild(style);\\n    \\n    log('Script setup complete');\\n})();\\n\\n// add word count\\nconst chapter = document.getElementById('LNReader-chapter');\\nconst wordCount = chapter.innerText.trim().split(/\\\\s+/).length;\\nconst counter = document.createElement('p');\\ncounter.style.cssText = 'opacity:0.5; font-size:0.85em; margin-bottom:1em;';\\ncounter.textContent = `~${wordCount.toLocaleString()} كلمة`;\\nchapter.appendChild(counter);\\n\",\"customThemes\":[{\"backgroundColor\":\"#000000\",\"textColor\":\"#FCFCFC\"}],\"tts\":{\"rate\":1,\"pitch\":1,\"autoPageAdvance\":false,\"scrollToTop\":true},\"epubLocation\":\"\",\"epubUseAppTheme\":false,\"epubUseCustomCSS\":false,\"epubUseCustomJS\":false}","CHAPTER_GENERAL_SETTINGS":"{\"keepScreenOn\":false,\"fullScreenMode\":true,\"pageReader\":false,\"swipeGestures\":false,\"showScrollPercentage\":true,\"useVolumeButtons\":false,\"volumeButtonsOffset\":null,\"showBatteryAndTime\":false,\"autoScroll\":false,\"autoScrollInterval\":10,\"autoScrollOffset\":null,\"verticalSeekbar\":false,\"removeExtraParagraphSpacing\":false,\"bionicReading\":false,\"tapToScroll\":false,\"TTSEnable\":false}","BROWSE_SETTINGS":"{\"showMyAnimeList\":false,\"showAniList\":false,\"globalSearchConcurrency\":1}","LANGUAGES_FILTER":"[]","LIBRARY_SETTINGS":"{\"novelsPerRow\":1,\"displayMode\":2}","AVAILABLE_PLUGINS":"[]","FILTERED_INSTALLED_PLUGINS":"[]","THEME_MODE":"dark","INSTALL_PLUGINS":"[]","AMOLED_BLACK":true,"IS_ONBOARDED":true,"APP_SETTINGS":"{\"incognitoMode\":false,\"disableHapticFeedback\":false,\"showHistoryTab\":true,\"showUpdatesTab\":true,\"showLabelsInNav\":true,\"useFabForContinueReading\":true,\"disableLoadingAnimations\":false,\"downloadedOnlyMode\":false,\"useLibraryFAB\":true,\"onlyUpdateOngoingNovels\":false,\"updateLibraryOnLaunch\":false,\"downloadNewChapters\":false,\"refreshNovelMetadata\":false,\"hideBackdrop\":false,\"defaultChapterSort\":\"ORDER BY position ASC\"}","FILTERED_AVAILABLE_PLUGINS":"[]"}
```
##### Cur v
```json
{"FILTERED_AVAILABLE_PLUGINS":"[]","CUSTOM_ACCENT_COLOR":"#d6a58b","LAST_READ_PREFIX_local_/storage/emulated/0/Android/data/com.rajarsheechatterjee.LNReader/files/Novels/local/2":"{\"id\":1787,\"novelId\":2,\"path\":\"/storage/emulated/0/Android/data/com.rajarsheechatterjee.LNReader/files/Novels/local/2/119\",\"name\":\"حسن الظن بالرب إنما يكون مع طاعته (4)\",\"releaseTime\":\"2026-04-27T20:34:25.628Z\",\"bookmark\":0,\"unread\":0,\"readTime\":\"2026-05-18 18:24:46\",\"isDownloaded\":1,\"updatedTime\":null,\"chapterNumber\":null,\"page\":\"1\",\"position\":119,\"progress\":100}","NOVEL_SETTINGS_local_/storage/emulated/0/Android/data/com.rajarsheechatterjee.LNReader/files/Novels/local/2":"{\"showChapterTitles\":false}","LANGUAGES_FILTER":"[]","TRACKED_NOVEL_MIGRATION_V1_2":"true","CHAPTER_GENERAL_SETTINGS":"{\"keepScreenOn\":false,\"fullScreenMode\":true,\"pageReader\":false,\"swipeGestures\":false,\"showScrollPercentage\":true,\"useVolumeButtons\":false,\"volumeButtonsOffset\":null,\"showBatteryAndTime\":false,\"autoScroll\":false,\"autoScrollInterval\":10,\"autoScrollOffset\":null,\"verticalSeekbar\":false,\"removeExtraParagraphSpacing\":false,\"bionicReading\":false,\"tapToScroll\":false,\"TTSEnable\":true}","INSTALL_PLUGINS":"[]","THEME_MODE":"dark","CHAPTER_READER_SETTINGS":"{\"theme\":\"#F7DFC6\",\"textColor\":\"#593100\",\"textSize\":33,\"textAlign\":\"justify\",\"padding\":16,\"fontFamily\":\"\",\"lineHeight\":1.5,\"customCSS\":\"body {\\n  direction: rtl !important;\\n  font-family: serif !important;\\n  text-align: var(--readerSettings-textAlign) !important;\\n  background-color: var(--readerSettings-theme) !important;\\n}\\n#LNReader-chapter h1 {\\n  font-size: 2.5rem;\\n  padding-bottom: 0.2em;\\n  border-top: 1px dashed var(--theme-secondary);\\n  border-left: 1px dashed var(--theme-secondary);\\n  border-right: 1px dashed var(--theme-secondary);\\n  border-bottom: 1px solid var(--theme-secondary);\\n}\\n#LNReader-chapter h2 {\\n  font-size: 2.5rem;\\n  padding-bottom: 0.2em;\\n  border-left: 1px dashed var(--theme-secondary);\\n  border-right: 1px dashed var(--theme-secondary);\\n  border-bottom: 1px solid var(--theme-outline);\\n}\\n#LNReader-chapter h3 {\\n  font-size: 2.5rem;\\n  padding-bottom: 0.2em;\\n  border-bottom: 1px solid var(--theme-outline);\\n}\\n#LNReader-chapter h4 {\\n  font-size: 2.5rem;\\n  padding-bottom: 0.2em;\\n  border-left: 1px dashed var(--theme-secondary);\\n  border-right: 1px dashed var(--theme-secondary);\\n}\\n#TTS-Controller {\\n  display: none; \\n}\\n.next-button {\\n  color: var(--readerSettings-textColor);\\n  background-color: var(--theme-onPrimary);\\n}\\n.hr,* hr, * + hr {\\n  border-color: var(--readerSettings-textColor) !important;\\n}\\n.footnote {\\n  color: color-mix(in srgb, var(--readerSettings-textColor) 40%, transparent) !important; \\n}\\n.inline-footnote {\\n    user-select: none;\\n    -webkit-user-select: none;\\n    -moz-user-select: none;\\n    -ms-user-select: none;\\n    display: inline-block;\\n    pointer-events: none;\\n}\\n.inline-footnote::before {\\n    content: attr(data-num);\\n    color: color-mix(in srgb, var(--readerSettings-textColor) 50%, transparent);\\n    font-size: 0.9rem;\\n    vertical-align: super;\\n    font-weight: bold;\\n    margin: 0 4px;\\n}\\n\\n@container style(--readerSettings-theme: #F7DFC6 /*Old: FFEBD6*/) {\\n  body {\\n    background-image: url(\\\"https://i.ibb.co/JWN5M74g/Screenshot-2026-05-14-12-16-45-645-com-miui-gallery-edit.jpg\\\");\\n  }\\n}\",\"customJS\":\"/* ==============\\n  | Translate\\n================*/\\n(function() {\\n    let translationQueue = [];\\n    let isTranslating = false;\\n    \\n    const customDictionary = {\\n        \\\"book\\\": \\\"كتاب\\\"\\n};\\n    \\n    // Add debug logging\\n    function log(message, data) {\\n        console.log(`[Translation Script] ${message}`, data || '');\\n    }\\n    \\n    log('Script initialized');\\n    \\n    const observer = new MutationObserver(function(mutations) {\\n        log('Mutation observed', mutations.length);\\n        for (const mutation of mutations) {\\n            if (mutation.type === 'childList' || mutation.type === 'characterData') {\\n                collectNewTextNodes();\\n            }\\n        }\\n    });\\n    \\n    function applyDictionary(text) {\\n        let result = text;\\n        for (const [english, arabic] of Object.entries(customDictionary)) {\\n            const regex = new RegExp(english.replace(/[.*+?^${}()|[\\\\]\\\\\\\\]/g, '\\\\\\\\$&'), 'gi');\\n            result = result.replace(regex, arabic);\\n        }\\n        return result;\\n    }\\n    \\n    function collectNewTextNodes() {\\n        log('Collecting text nodes');\\n        const textNodes = getTextNodes(document.body);\\n        log(`Found ${textNodes.length} text nodes`);\\n        \\n        for (const node of textNodes) {\\n            if (!node.nodeValue || node.nodeValue.trim() === '') continue;\\n            if (node.parentElement && isAlreadyTranslated(node.parentElement)) continue;\\n            if (node.hasAttribute && node.hasAttribute('data-queued')) continue;\\n            if (node.hasAttribute && node.hasAttribute('data-translating')) continue;\\n            \\n            const originalText = node.nodeValue;\\n            if (!needsTranslation(originalText)) continue;\\n            \\n            log('Queuing text for translation:', originalText.substring(0, 50));\\n            \\n            if (node.setAttribute) {\\n                node.setAttribute('data-queued', 'true');\\n            }\\n            \\n            translationQueue.push({\\n                node: node,\\n                text: originalText\\n            });\\n        }\\n        \\n        if (!isTranslating && translationQueue.length > 0) {\\n            log(`Starting translation of ${translationQueue.length} items`);\\n            processQueue();\\n        }\\n    }\\n    \\n    function getTextNodes(element) {\\n        const walker = document.createTreeWalker(\\n            element,\\n            NodeFilter.SHOW_TEXT,\\n            {\\n                acceptNode: function(node) {\\n                    if (!node.nodeValue || node.nodeValue.trim() === '') return NodeFilter.FILTER_REJECT;\\n                    if (node.parentElement && isExcludedTag(node.parentElement)) return NodeFilter.FILTER_REJECT;\\n                    return NodeFilter.FILTER_ACCEPT;\\n                }\\n            }\\n        );\\n        \\n        const nodes = [];\\n        while(walker.nextNode()) nodes.push(walker.currentNode);\\n        return nodes;\\n    }\\n    \\n    function isExcludedTag(element) {\\n        const excluded = ['SCRIPT', 'STYLE', 'CODE', 'PRE', 'TEXTAREA', 'INPUT'];\\n        return excluded.includes(element.tagName);\\n    }\\n    \\n    function isAlreadyTranslated(element) {\\n        return element.hasAttribute && element.hasAttribute('data-translated');\\n    }\\n    \\n    function markAsTranslated(element) {\\n        if (element && element.setAttribute) {\\n            element.setAttribute('data-translated', 'true');\\n            if (element.hasAttribute('data-queued')) {\\n                element.removeAttribute('data-queued');\\n            }\\n            if (element.hasAttribute('data-translating')) {\\n                element.removeAttribute('data-translating');\\n            }\\n        }\\n    }\\n    \\n    function needsTranslation(text) {\\n        const arabicPattern = /[\\\\u0600-\\\\u06FF]/;\\n        const englishPattern = /[a-zA-Z]/;\\n        const hasEnglish = englishPattern.test(text);\\n        const hasArabic = arabicPattern.test(text);\\n        const englishRatio = (text.match(/[a-zA-Z]/g) || []).length / text.length;\\n        const needs = hasEnglish && (!hasArabic || englishRatio > 0.3);\\n        if (needs) {\\n            log('Text needs translation:', text.substring(0, 50));\\n        }\\n        return needs;\\n    }\\n    \\n    async function processQueue() {\\n        if (translationQueue.length === 0) {\\n            isTranslating = false;\\n            log('Translation queue empty');\\n            return;\\n        }\\n        \\n        isTranslating = true;\\n        \\n        const item = translationQueue.shift();\\n        const { node, text } = item;\\n        \\n        if (!node.parentElement || isAlreadyTranslated(node.parentElement)) {\\n            processQueue();\\n            return;\\n        }\\n        \\n        if (node.setAttribute) {\\n            node.setAttribute('data-translating', 'true');\\n            if (node.hasAttribute('data-queued')) {\\n                node.removeAttribute('data-queued');\\n            }\\n        }\\n        \\n        try {\\n            log('Translating:', text.substring(0, 50));\\n            const translated = await translateText(text);\\n            log('Translated to:', translated.substring(0, 50));\\n            \\n            if (translated && translated !== text && node.parentElement) {\\n                const parent = node.parentElement;\\n                \\n                node.nodeValue = translated;\\n                markAsTranslated(parent);\\n                \\n                if (parent.childNodes.length === 1 && parent.textContent.trim() === translated.trim()) {\\n                    parent.style.opacity = '0';\\n                    parent.style.transition = 'opacity 0.3s';\\n                    setTimeout(() => {\\n                        parent.style.opacity = '1';\\n                    }, 50);\\n                }\\n                log('Successfully translated and applied');\\n            } else if (node.parentElement) {\\n                markAsTranslated(node.parentElement);\\n                log('No translation needed or translation failed');\\n            }\\n        } catch(e) {\\n            console.error('Translation error:', e);\\n            if (node.parentElement) {\\n                node.setAttribute('data-translate-error', 'true');\\n            }\\n        } finally {\\n            if (node.setAttribute) {\\n                node.removeAttribute('data-translating');\\n            }\\n        }\\n        \\n        await delay(150);\\n        \\n        processQueue();\\n    }\\n    \\n    async function translateText(text) {\\n        if (!text || text.trim().length === 0) return text;\\n        \\n        const cleanText = text.replace(/\\\\s+/g, ' ').trim();\\n        \\n        const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=ar&dt=t&q=${encodeURIComponent(cleanText)}`;\\n        \\n        try {\\n            const response = await fetch(url);\\n            if (!response.ok) {\\n                throw new Error(`HTTP error! status: ${response.status}`);\\n            }\\n            const data = await response.json();\\n            if (data && data[0]) {\\n                let translated = '';\\n                for (let i = 0; i < data[0].length; i++) {\\n                    if (data[0][i] && data[0][i][0]) {\\n                        translated += data[0][i][0];\\n                    }\\n                }\\n                let result = applyDictionary(translated);\\n                return result;\\n            }\\n            return applyDictionary(text);\\n        } catch(e) {\\n            console.error('Fetch error:', e);\\n            return applyDictionary(text);\\n        }\\n    }\\n    \\n    function delay(ms) {\\n        return new Promise(resolve => setTimeout(resolve, ms));\\n    }\\n    \\n    observer.observe(document.body, {\\n        childList: true,\\n        subtree: true,\\n        characterData: true\\n    });\\n    \\n    window.addEventListener('load', function() {\\n        log('Window loaded, collecting text nodes');\\n        setTimeout(() => {\\n            collectNewTextNodes();\\n        }, 300);\\n    });\\n    \\n    window.addEventListener('scroll', function() {\\n        if (!isTranslating && translationQueue.length > 0) {\\n            processQueue();\\n        }\\n    });\\n    \\n    const style = document.createElement('style');\\n    style.textContent = `\\n        [data-translating] {\\n            opacity: 0.7;\\n            transition: opacity 0.2s;\\n        }\\n        [data-translate-error] {\\n            border-left: 2px solid red;\\n        }\\n    `;\\n    document.head.appendChild(style);\\n    \\n    log('Script setup complete');\\n})();\\n\\n\\n/* ==============\\n  | Footnotes\\n================*/\\ndocument.addEventListener(\\\"DOMContentLoaded\\\", function() {\\n    const container = document.getElementById(\\\"book-container\\\");\\n    if (!container) return;\\n\\n    const walker = document.createTreeWalker(\\n        container,\\n        NodeFilter.SHOW_TEXT,\\n        {\\n            acceptNode: function(node) {\\n\\n                if (node.parentElement && (\\n                    node.parentElement.classList.contains('footnote') || \\n                    node.parentElement.classList.contains('footnote-hr')\\n                )) {\\n                    return NodeFilter.FILTER_REJECT;\\n                }\\n                return NodeFilter.FILTER_ACCEPT;\\n            }\\n        }\\n    );\\n\\n    const nodesToReplace = [];\\n    let currentNode = walker.nextNode();\\n    \\n    while (currentNode) {\\n        if (/\\\\(\\\\d+\\\\)/.test(currentNode.nodeValue)) {\\n            nodesToReplace.push(currentNode);\\n        }\\n        currentNode = walker.nextNode();\\n    }\\n\\n    nodesToReplace.forEach(node => {\\n        const parent = node.parentNode;\\n        const text = node.nodeValue;\\n        const parts = text.split(/(\\\\(\\\\d+\\\\))/);\\n\\n        const fragment = document.createDocumentFragment();\\n        parts.forEach(part => {\\n            if (/^\\\\(\\\\d+\\\\)$/.test(part)) {\\n                const span = document.createElement('span');\\n                span.className = 'inline-footnote';\\n                span.setAttribute('data-num', part);\\n                fragment.appendChild(span);\\n            } else if (part) {\\n                fragment.appendChild(document.createTextNode(part));\\n            }\\n        });\\n\\n        parent.replaceChild(fragment, node);\\n    });\\n});\\n\\n\\n/* ==============\\n  | Word Count\\n================*/\\nconst chapter = document.getElementById('LNReader-chapter');\\nconst wordCount = chapter.innerText.trim().split(/\\\\s+/).length;\\nconst counter = document.createElement('p');\\ncounter.style.cssText = 'opacity:0.5; font-size:0.85em; margin-bottom:1em;';\\ncounter.textContent = `~${wordCount.toLocaleString()} كلمة`;\\nchapter.appendChild(counter);\",\"customThemes\":[{\"backgroundColor\":\"#000000\",\"textColor\":\"#FCFCFC\"}],\"tts\":{\"rate\":1,\"pitch\":1,\"autoPageAdvance\":false,\"scrollToTop\":true},\"epubLocation\":\"\",\"epubUseAppTheme\":false,\"epubUseCustomCSS\":false,\"epubUseCustomJS\":false}","IS_ONBOARDED":true,"LAST_READ_PREFIX_local_/storage/emulated/0/Android/data/com.rajarsheechatterjee.LNReader/files/Novels/local/1":"{\"id\":6,\"novelId\":1,\"path\":\"/storage/emulated/0/Android/data/com.rajarsheechatterjee.LNReader/files/Novels/local/1/5\",\"name\":\"مقدمة (5)\",\"releaseTime\":\"2026-04-27T20:07:43.107Z\",\"bookmark\":0,\"unread\":1,\"readTime\":\"2026-05-08 15:41:57\",\"isDownloaded\":1,\"updatedTime\":null,\"chapterNumber\":null,\"page\":\"1\",\"position\":5,\"progress\":null}","APP_SETTINGS":"{\"incognitoMode\":false,\"disableHapticFeedback\":false,\"showHistoryTab\":true,\"showUpdatesTab\":true,\"showLabelsInNav\":true,\"useFabForContinueReading\":true,\"disableLoadingAnimations\":false,\"downloadedOnlyMode\":false,\"useLibraryFAB\":true,\"onlyUpdateOngoingNovels\":false,\"updateLibraryOnLaunch\":false,\"downloadNewChapters\":false,\"refreshNovelMetadata\":false,\"hideBackdrop\":false,\"defaultChapterSort\":\"ORDER BY position ASC\"}","TRACKED_NOVEL_MIGRATION_V1_undefined":"true","AMOLED_BLACK":true,"TRACKER_MIGRATION_V1_COMPLETED":"true","TRACKED_NOVEL_MIGRATION_V1_1":"true","FILTERED_INSTALLED_PLUGINS":"[]","AVAILABLE_PLUGINS":"[]","LIBRARY_SETTINGS":"{\"novelsPerRow\":1,\"displayMode\":2}","BROWSE_SETTINGS":"{\"showMyAnimeList\":false,\"showAniList\":false,\"globalSearchConcurrency\":1}"}
```
#### Separate Codes
##### Css code
```css
body {
  direction: rtl !important;
  font-family: serif !important;
  text-align: var(--readerSettings-textAlign) !important;
  background-color: var(--readerSettings-theme) !important;
}
#LNReader-chapter h1 {
  font-size: 2.5rem;
  padding-bottom: 0.2em;
  border-top: 1px dashed var(--theme-secondary);
  border-left: 1px dashed var(--theme-secondary);
  border-right: 1px dashed var(--theme-secondary);
  border-bottom: 1px solid var(--theme-secondary);
}
#LNReader-chapter h2 {
  font-size: 2.5rem;
  padding-bottom: 0.2em;
  border-left: 1px dashed var(--theme-secondary);
  border-right: 1px dashed var(--theme-secondary);
  border-bottom: 1px solid var(--theme-outline);
}
#LNReader-chapter h3 {
  font-size: 2.5rem;
  padding-bottom: 0.2em;
  border-bottom: 1px solid var(--theme-outline);
}
#LNReader-chapter h4 {
  font-size: 2.5rem;
  padding-bottom: 0.2em;
  border-left: 1px dashed var(--theme-secondary);
  border-right: 1px dashed var(--theme-secondary);
}
#TTS-Controller {
  display: none; 
}
.next-button {
  color: var(--readerSettings-textColor);
  background-color: var(--theme-onPrimary);
}
.hr, * hr, * + hr {
  border-color: var(--readerSettings-textColor) !important;
}
.footnote {
  color: color-mix(in srgb, var(--readerSettings-textColor) 40%, transparent) !important; 
}
.inline-footnote {
    user-select: none;
    -webkit-user-select: none;
    -moz-user-select: none;
    -ms-user-select: none;
    display: inline-block;
    pointer-events: none;
}
.inline-footnote::before {
    content: attr(data-num);
    color: color-mix(in srgb, var(--readerSettings-textColor) 50%, transparent);
    font-size: 0.9rem;
    vertical-align: super;
    font-weight: bold;
    margin: 0 4px;
}

@container style(--readerSettings-theme: #F7DFC6 /*Old: FFEBD6*/) {
  body {
    background-image: url("https://i.ibb.co/JWN5M74g/Screenshot-2026-05-14-12-16-45-645-com-miui-gallery-edit.jpg");
  }
}
```
##### Js code
```js
/* ==============
  | Translate
================*/
(function() {
    let translationQueue = [];
    let isTranslating = false;
    
    const customDictionary = {
        "Allah": "اللّه"
};
    
    // Add debug logging
    function log(message, data) {
        console.log(`[Translation Script] ${message}`, data || '');
    }
    
    log('Script initialized');
    
    const observer = new MutationObserver(function(mutations) {
        log('Mutation observed', mutations.length);
        for (const mutation of mutations) {
            if (mutation.type === 'childList' || mutation.type === 'characterData') {
                collectNewTextNodes();
            }
        }
    });
    
    function applyDictionary(text) {
        let result = text;
        for (const [english, arabic] of Object.entries(customDictionary)) {
            const regex = new RegExp(english.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
            result = result.replace(regex, arabic);
        }
        return result;
    }
    
    function collectNewTextNodes() {
        log('Collecting text nodes');
        const textNodes = getTextNodes(document.body);
        log(`Found ${textNodes.length} text nodes`);
        
        for (const node of textNodes) {
            if (!node.nodeValue || node.nodeValue.trim() === '') continue;
            if (node.parentElement && isAlreadyTranslated(node.parentElement)) continue;
            if (node.hasAttribute && node.hasAttribute('data-queued')) continue;
            if (node.hasAttribute && node.hasAttribute('data-translating')) continue;
            
            const originalText = node.nodeValue;
            if (!needsTranslation(originalText)) continue;
            
            log('Queuing text for translation:', originalText.substring(0, 50));
            
            if (node.setAttribute) {
                node.setAttribute('data-queued', 'true');
            }
            
            translationQueue.push({
                node: node,
                text: originalText
            });
        }
        
        if (!isTranslating && translationQueue.length > 0) {
            log(`Starting translation of ${translationQueue.length} items`);
            processQueue();
        }
    }
    
    function getTextNodes(element) {
        const walker = document.createTreeWalker(
            element,
            NodeFilter.SHOW_TEXT,
            {
                acceptNode: function(node) {
                    if (!node.nodeValue || node.nodeValue.trim() === '') return NodeFilter.FILTER_REJECT;
                    if (node.parentElement && isExcludedTag(node.parentElement)) return NodeFilter.FILTER_REJECT;
                    return NodeFilter.FILTER_ACCEPT;
                }
            }
        );
        
        const nodes = [];
        while(walker.nextNode()) nodes.push(walker.currentNode);
        return nodes;
    }
    
    function isExcludedTag(element) {
        const excluded = ['SCRIPT', 'STYLE', 'CODE', 'PRE', 'TEXTAREA', 'INPUT'];
        return excluded.includes(element.tagName);
    }
    
    function isAlreadyTranslated(element) {
        return element.hasAttribute && element.hasAttribute('data-translated');
    }
    
    function markAsTranslated(element) {
        if (element && element.setAttribute) {
            element.setAttribute('data-translated', 'true');
            if (element.hasAttribute('data-queued')) {
                element.removeAttribute('data-queued');
            }
            if (element.hasAttribute('data-translating')) {
                element.removeAttribute('data-translating');
            }
        }
    }
    
    function needsTranslation(text) {
        const arabicPattern = /[\u0600-\u06FF]/;
        const englishPattern = /[a-zA-Z]/;
        const hasEnglish = englishPattern.test(text);
        const hasArabic = arabicPattern.test(text);
        const englishRatio = (text.match(/[a-zA-Z]/g) || []).length / text.length;
        const needs = hasEnglish && (!hasArabic || englishRatio > 0.3);
        if (needs) {
            log('Text needs translation:', text.substring(0, 50));
        }
        return needs;
    }
    
    async function processQueue() {
        if (translationQueue.length === 0) {
            isTranslating = false;
            log('Translation queue empty');
            return;
        }
        
        isTranslating = true;
        
        const item = translationQueue.shift();
        const { node, text } = item;
        
        if (!node.parentElement || isAlreadyTranslated(node.parentElement)) {
            processQueue();
            return;
        }
        
        if (node.setAttribute) {
            node.setAttribute('data-translating', 'true');
            if (node.hasAttribute('data-queued')) {
                node.removeAttribute('data-queued');
            }
        }
        
        try {
            log('Translating:', text.substring(0, 50));
            const translated = await translateText(text);
            log('Translated to:', translated.substring(0, 50));
            
            if (translated && translated !== text && node.parentElement) {
                const parent = node.parentElement;
                
                node.nodeValue = translated;
                markAsTranslated(parent);
                
                if (parent.childNodes.length === 1 && parent.textContent.trim() === translated.trim()) {
                    parent.style.opacity = '0';
                    parent.style.transition = 'opacity 0.3s';
                    setTimeout(() => {
                        parent.style.opacity = '1';
                    }, 50);
                }
                log('Successfully translated and applied');
            } else if (node.parentElement) {
                markAsTranslated(node.parentElement);
                log('No translation needed or translation failed');
            }
        } catch(e) {
            console.error('Translation error:', e);
            if (node.parentElement) {
                node.setAttribute('data-translate-error', 'true');
            }
        } finally {
            if (node.setAttribute) {
                node.removeAttribute('data-translating');
            }
        }
        
        await delay(150);
        
        processQueue();
    }
    
    async function translateText(text) {
        if (!text || text.trim().length === 0) return text;
        
        const cleanText = text.replace(/\s+/g, ' ').trim();
        
        const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=ar&dt=t&q=${encodeURIComponent(cleanText)}`;
        
        try {
            const response = await fetch(url);
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            const data = await response.json();
            if (data && data[0]) {
                let translated = '';
                for (let i = 0; i < data[0].length; i++) {
                    if (data[0][i] && data[0][i][0]) {
                        translated += data[0][i][0];
                    }
                }
                let result = applyDictionary(translated);
                return result;
            }
            return applyDictionary(text);
        } catch(e) {
            console.error('Fetch error:', e);
            return applyDictionary(text);
        }
    }
    
    function delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
    
    observer.observe(document.body, {
        childList: true,
        subtree: true,
        characterData: true
    });
    
    window.addEventListener('load', function() {
        log('Window loaded, collecting text nodes');
        setTimeout(() => {
            collectNewTextNodes();
        }, 300);
    });
    
    window.addEventListener('scroll', function() {
        if (!isTranslating && translationQueue.length > 0) {
            processQueue();
        }
    });
    
    const style = document.createElement('style');
    style.textContent = `
        [data-translating] {
            opacity: 0.7;
            transition: opacity 0.2s;
        }
        [data-translate-error] {
            border-left: 2px solid red;
        }
    `;
    document.head.appendChild(style);
    
    log('Script setup complete');
})();


/* ==============
  | Footnotes
================*/
document.addEventListener("DOMContentLoaded", function() {
    const container = document.getElementById("book-container");
    if (!container) return;

    const footnoteRegex = /(\(\d+\)|\[\d+\/\s*[\u0600-\u06FF]+\s*\])/g;

    const walker = document.createTreeWalker(
        container,
        NodeFilter.SHOW_TEXT,
        {
            acceptNode: function(node) {
                if (node.parentElement && (
                    node.parentElement.classList.contains('footnote') || 
                    node.parentElement.classList.contains('footnote-hr')
                )) {
                    return NodeFilter.FILTER_REJECT;
                }
                return NodeFilter.FILTER_ACCEPT;
            }
        }
    );

    const nodesToReplace = [];
    let currentNode = walker.nextNode();
    
    while (currentNode) {
        footnoteRegex.lastIndex = 0;
        if (footnoteRegex.test(currentNode.nodeValue)) {
            nodesToReplace.push(currentNode);
        }
        currentNode = walker.nextNode();
    }

    nodesToReplace.forEach(node => {
        const parent = node.parentNode;
        const text = node.nodeValue;
        
        const parts = text.split(/(\(\d+\)|\[\d+\/\s*[\u0600-\u06FF]+\s*\])/g);

        const fragment = document.createDocumentFragment();
        parts.forEach(part => {
            if (/^(\(\d+\)|\[\d+\/\s*[\u0600-\u06FF]+\s*\])$/.test(part)) {
                const span = document.createElement('span');
                span.className = 'inline-footnote';
                span.setAttribute('data-num', part);
                fragment.appendChild(span);
            } else if (part) {
                fragment.appendChild(document.createTextNode(part));
            }
        });

        parent.replaceChild(fragment, node);
    });
});

/* ==============
  | Word Count
================*/
const chapter = document.getElementById('LNReader-chapter');
const wordCount = chapter.innerText.trim().split(/\s+/).length;
const counter = document.createElement('p');
counter.style.cssText = 'opacity:0.5; font-size:0.85em; margin-bottom:1em;';
counter.textContent = `~${wordCount.toLocaleString()} كلمة`;
chapter.appendChild(counter);

```

> *ملاحظة:* أدناه يوجد كود جافاسكريبت لاستبدال الكلمات الشركية في الروايات، كخط دفاع اخير لي...
<!--```js
/* =============
=====================
For Novels
=====================
================ */
/* ==============
  | Watermark Remover
================*/
(function() {
    // النص الأساسي المراد حذفه نهائياً (بدون الهاشتاق العشوائي)
    const watermarkText = "هذا تنبيه من موقع فضاء الروايات , اذا ظهر لك هذا التنبيه يعني انت تقرأ من تطبيق سارق وخطير على جهازك ننصحك تقرا على موقعنا او تنزل تطبيق فضاء روايات riwyat متوفر في غوغل بلاي cenele.com اقرا على موقعنا لأجل قراءة الفصل كامل https://cenele.com/";
    
    // تنظيف النص البرمجي من المسافات الزائدة لضمان دقة المطابقة
    const cleanWatermark = watermarkText.replace(/\s+/g, ' ').trim();

    function log(message, data) {
        console.log(`[Watermark Script] ${message}`, data || '');
    }

    // دالة لتنظيف العقد النصية داخل الصفحة
    function cleanTextNodes(element) {
        const walker = document.createTreeWalker(
            element,
            NodeFilter.SHOW_TEXT,
            {
                acceptNode: function(node) {
                    if (!node.nodeValue || node.nodeValue.trim() === '') return NodeFilter.FILTER_REJECT;
                    if (node.parentElement && ['SCRIPT', 'STYLE', 'CODE', 'PRE'].includes(node.parentElement.tagName)) {
                        return NodeFilter.FILTER_REJECT;
                    }
                    return NodeFilter.FILTER_ACCEPT;
                }
            }
        );

        let node;
        while (node = walker.nextNode()) {
            // تنظيف النص الحالي من المسافات المتعددة لتسهيل المقارنة
            const currentNodeText = node.nodeValue.replace(/\s+/g, ' ').trim();
            
            // التحقق مما إذا كانت العقدة النصية تحتوي على العلامة المائية الأساسية
            if (currentNodeText.includes(cleanWatermark)) {
                log('تم العثور على العلامة المائية وحذفها مع النص العشوائي:', node.nodeValue.substring(0, 40));
                
                // تحويل النص الثابت إلى تعبير نمطي آمن
                const escapedWatermark = cleanWatermark.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                
                // التعبير النمطي الجديد: يبحث عن النص الثابت + مسافات اختيارية + علامة # + أي حروف/أرقام بعدها (\S*)
                const regex = new RegExp(escapedWatermark + '\\s*#\\S*', 'gi');
                
                // استبدال النص بالكامل بفراغ
                node.nodeValue = node.nodeValue.replace(regex, "").trim();
                
                if (node.nodeValue === '' && node.parentElement && node.parentElement.childNodes.length === 1) {
                    node.parentElement.style.display = 'none';
                }
            }
        }
    }

    // مراقبة التغييرات في الصفحة (MutationObserver)
    const observer = new MutationObserver(function(mutations) {
        for (const mutation of mutations) {
            if (mutation.type === 'childList' || mutation.type === 'characterData') {
                cleanTextNodes(document.body);
            }
        }
    });

    log('تم تشغيل سكريبت حذف العلامة المائية بنجاح');
    cleanTextNodes(document.body);

    observer.observe(document.body, {
        childList: true,
        subtree: true,
        characterData: true
    });

    window.addEventListener('load', function() {
        setTimeout(() => {
            cleanTextNodes(document.body);
        }, 200);
    });
})();
```