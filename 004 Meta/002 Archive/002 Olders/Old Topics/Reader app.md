---
icon: lucide-glasses
---
>إعداداتي في التطبيق من حيث الثيم والألوان كالتالي مع اكواد الCss في الاسفل
>اللون هو:#d6a58b (اختياري فمؤخرا صرت أُفضل اللون الأساسي)
>الثيم هو: Yotsuba
#### All Settings
<!-- file is: settings.json-->
```json
{"CHAPTER_READER_SETTINGS":"{\"theme\":\"#000000\",\"textColor\":\"#FCFCFC\",\"textSize\":26,\"textAlign\":\"center\",\"padding\":16,\"fontFamily\":\"\",\"lineHeight\":1.5,\"customCSS\":\"body {\\n  --theme-primary: color-mix(in srgb, var(--readerSettings-textColor) 50%, transparent);\\n  direction: rtl !important;\\n  font-family: serif !important;\\n  text-align: var(--readerSettings-textAlign) !important;\\n  background-color: var(--readerSettings-theme) !important;\\n}\\n#LNReader-chapter h1 {\\n  font-size: 2.5rem;\\n  padding-bottom: 0.2em;\\n  border-top: 1px dashed var(--theme-secondary);\\n  border-left: 1px dashed var(--theme-secondary);\\n  border-right: 1px dashed var(--theme-secondary);\\n  border-bottom: 1px solid var(--theme-secondary);\\n}\\n#LNReader-chapter h2 {\\n  font-size: 2.5rem;\\n  padding-bottom: 0.2em;\\n  border-left: 1px dashed var(--theme-secondary);\\n  border-right: 1px dashed var(--theme-secondary);\\n  border-bottom: 1px solid var(--theme-outline);\\n}\\n#LNReader-chapter h3 {\\n  font-size: 2.5rem;\\n  padding-bottom: 0.2em;\\n  border-bottom: 1px solid var(--theme-outline);\\n}\\n#LNReader-chapter h4 {\\n  font-size: 2.5rem;\\n  padding-bottom: 0.2em;\\n  border-left: 1px dashed var(--theme-secondary);\\n  border-right: 1px dashed var(--theme-secondary);\\n}\\n#TTS-Controller {\\n  display: none;\\n}\\n.next-button {\\n  color: var(--readerSettings-textColor);\\n  background-color: var(--theme-onPrimary);\\n}\",\"customJS\":\"// translate function\\n(function() {\\n    let translationQueue = [];\\n    let isTranslating = false;\\n    \\n    const customDictionary = {\\n        \\\"book\\\": \\\"كتاب\\\"\\n};\\n    \\n    // Add debug logging\\n    function log(message, data) {\\n        console.log(`[Translation Script] ${message}`, data || '');\\n    }\\n    \\n    log('Script initialized');\\n    \\n    const observer = new MutationObserver(function(mutations) {\\n        log('Mutation observed', mutations.length);\\n        for (const mutation of mutations) {\\n            if (mutation.type === 'childList' || mutation.type === 'characterData') {\\n                collectNewTextNodes();\\n            }\\n        }\\n    });\\n    \\n    function applyDictionary(text) {\\n        let result = text;\\n        for (const [english, arabic] of Object.entries(customDictionary)) {\\n            const regex = new RegExp(english.replace(/[.*+?^${}()|[\\\\]\\\\\\\\]/g, '\\\\\\\\$&'), 'gi');\\n            result = result.replace(regex, arabic);\\n        }\\n        return result;\\n    }\\n    \\n    function collectNewTextNodes() {\\n        log('Collecting text nodes');\\n        const textNodes = getTextNodes(document.body);\\n        log(`Found ${textNodes.length} text nodes`);\\n        \\n        for (const node of textNodes) {\\n            if (!node.nodeValue || node.nodeValue.trim() === '') continue;\\n            if (node.parentElement && isAlreadyTranslated(node.parentElement)) continue;\\n            if (node.hasAttribute && node.hasAttribute('data-queued')) continue;\\n            if (node.hasAttribute && node.hasAttribute('data-translating')) continue;\\n            \\n            const originalText = node.nodeValue;\\n            if (!needsTranslation(originalText)) continue;\\n            \\n            log('Queuing text for translation:', originalText.substring(0, 50));\\n            \\n            if (node.setAttribute) {\\n                node.setAttribute('data-queued', 'true');\\n            }\\n            \\n            translationQueue.push({\\n                node: node,\\n                text: originalText\\n            });\\n        }\\n        \\n        if (!isTranslating && translationQueue.length > 0) {\\n            log(`Starting translation of ${translationQueue.length} items`);\\n            processQueue();\\n        }\\n    }\\n    \\n    function getTextNodes(element) {\\n        const walker = document.createTreeWalker(\\n            element,\\n            NodeFilter.SHOW_TEXT,\\n            {\\n                acceptNode: function(node) {\\n                    if (!node.nodeValue || node.nodeValue.trim() === '') return NodeFilter.FILTER_REJECT;\\n                    if (node.parentElement && isExcludedTag(node.parentElement)) return NodeFilter.FILTER_REJECT;\\n                    return NodeFilter.FILTER_ACCEPT;\\n                }\\n            }\\n        );\\n        \\n        const nodes = [];\\n        while(walker.nextNode()) nodes.push(walker.currentNode);\\n        return nodes;\\n    }\\n    \\n    function isExcludedTag(element) {\\n        const excluded = ['SCRIPT', 'STYLE', 'CODE', 'PRE', 'TEXTAREA', 'INPUT'];\\n        return excluded.includes(element.tagName);\\n    }\\n    \\n    function isAlreadyTranslated(element) {\\n        return element.hasAttribute && element.hasAttribute('data-translated');\\n    }\\n    \\n    function markAsTranslated(element) {\\n        if (element && element.setAttribute) {\\n            element.setAttribute('data-translated', 'true');\\n            if (element.hasAttribute('data-queued')) {\\n                element.removeAttribute('data-queued');\\n            }\\n            if (element.hasAttribute('data-translating')) {\\n                element.removeAttribute('data-translating');\\n            }\\n        }\\n    }\\n    \\n    function needsTranslation(text) {\\n        const arabicPattern = /[\\\\u0600-\\\\u06FF]/;\\n        const englishPattern = /[a-zA-Z]/;\\n        const hasEnglish = englishPattern.test(text);\\n        const hasArabic = arabicPattern.test(text);\\n        const englishRatio = (text.match(/[a-zA-Z]/g) || []).length / text.length;\\n        const needs = hasEnglish && (!hasArabic || englishRatio > 0.3);\\n        if (needs) {\\n            log('Text needs translation:', text.substring(0, 50));\\n        }\\n        return needs;\\n    }\\n    \\n    async function processQueue() {\\n        if (translationQueue.length === 0) {\\n            isTranslating = false;\\n            log('Translation queue empty');\\n            return;\\n        }\\n        \\n        isTranslating = true;\\n        \\n        const item = translationQueue.shift();\\n        const { node, text } = item;\\n        \\n        if (!node.parentElement || isAlreadyTranslated(node.parentElement)) {\\n            processQueue();\\n            return;\\n        }\\n        \\n        if (node.setAttribute) {\\n            node.setAttribute('data-translating', 'true');\\n            if (node.hasAttribute('data-queued')) {\\n                node.removeAttribute('data-queued');\\n            }\\n        }\\n        \\n        try {\\n            log('Translating:', text.substring(0, 50));\\n            const translated = await translateText(text);\\n            log('Translated to:', translated.substring(0, 50));\\n            \\n            if (translated && translated !== text && node.parentElement) {\\n                const parent = node.parentElement;\\n                \\n                node.nodeValue = translated;\\n                markAsTranslated(parent);\\n                \\n                if (parent.childNodes.length === 1 && parent.textContent.trim() === translated.trim()) {\\n                    parent.style.opacity = '0';\\n                    parent.style.transition = 'opacity 0.3s';\\n                    setTimeout(() => {\\n                        parent.style.opacity = '1';\\n                    }, 50);\\n                }\\n                log('Successfully translated and applied');\\n            } else if (node.parentElement) {\\n                markAsTranslated(node.parentElement);\\n                log('No translation needed or translation failed');\\n            }\\n        } catch(e) {\\n            console.error('Translation error:', e);\\n            if (node.parentElement) {\\n                node.setAttribute('data-translate-error', 'true');\\n            }\\n        } finally {\\n            if (node.setAttribute) {\\n                node.removeAttribute('data-translating');\\n            }\\n        }\\n        \\n        await delay(150);\\n        \\n        processQueue();\\n    }\\n    \\n    async function translateText(text) {\\n        if (!text || text.trim().length === 0) return text;\\n        \\n        const cleanText = text.replace(/\\\\s+/g, ' ').trim();\\n        \\n        const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=ar&dt=t&q=${encodeURIComponent(cleanText)}`;\\n        \\n        try {\\n            const response = await fetch(url);\\n            if (!response.ok) {\\n                throw new Error(`HTTP error! status: ${response.status}`);\\n            }\\n            const data = await response.json();\\n            if (data && data[0]) {\\n                let translated = '';\\n                for (let i = 0; i < data[0].length; i++) {\\n                    if (data[0][i] && data[0][i][0]) {\\n                        translated += data[0][i][0];\\n                    }\\n                }\\n                let result = applyDictionary(translated);\\n                return result;\\n            }\\n            return applyDictionary(text);\\n        } catch(e) {\\n            console.error('Fetch error:', e);\\n            return applyDictionary(text);\\n        }\\n    }\\n    \\n    function delay(ms) {\\n        return new Promise(resolve => setTimeout(resolve, ms));\\n    }\\n    \\n    observer.observe(document.body, {\\n        childList: true,\\n        subtree: true,\\n        characterData: true\\n    });\\n    \\n    window.addEventListener('load', function() {\\n        log('Window loaded, collecting text nodes');\\n        setTimeout(() => {\\n            collectNewTextNodes();\\n        }, 300);\\n    });\\n    \\n    window.addEventListener('scroll', function() {\\n        if (!isTranslating && translationQueue.length > 0) {\\n            processQueue();\\n        }\\n    });\\n    \\n    const style = document.createElement('style');\\n    style.textContent = `\\n        [data-translating] {\\n            opacity: 0.7;\\n            transition: opacity 0.2s;\\n        }\\n        [data-translate-error] {\\n            border-left: 2px solid red;\\n        }\\n    `;\\n    document.head.appendChild(style);\\n    \\n    log('Script setup complete');\\n})();\\n\\n// add word count\\nconst chapter = document.getElementById('LNReader-chapter');\\nconst wordCount = chapter.innerText.trim().split(/\\\\s+/).length;\\nconst counter = document.createElement('p');\\ncounter.style.cssText = 'opacity:0.5; font-size:0.85em; margin-bottom:1em;';\\ncounter.textContent = `~${wordCount.toLocaleString()} كلمة`;\\nchapter.appendChild(counter);\\n\",\"customThemes\":[{\"backgroundColor\":\"#000000\",\"textColor\":\"#FCFCFC\"}],\"tts\":{\"rate\":1,\"pitch\":1,\"autoPageAdvance\":false,\"scrollToTop\":true},\"epubLocation\":\"\",\"epubUseAppTheme\":false,\"epubUseCustomCSS\":false,\"epubUseCustomJS\":false}","CHAPTER_GENERAL_SETTINGS":"{\"keepScreenOn\":false,\"fullScreenMode\":true,\"pageReader\":false,\"swipeGestures\":false,\"showScrollPercentage\":true,\"useVolumeButtons\":false,\"volumeButtonsOffset\":null,\"showBatteryAndTime\":false,\"autoScroll\":false,\"autoScrollInterval\":10,\"autoScrollOffset\":null,\"verticalSeekbar\":false,\"removeExtraParagraphSpacing\":false,\"bionicReading\":false,\"tapToScroll\":false,\"TTSEnable\":false}","BROWSE_SETTINGS":"{\"showMyAnimeList\":false,\"showAniList\":false,\"globalSearchConcurrency\":1}","LANGUAGES_FILTER":"[]","LIBRARY_SETTINGS":"{\"novelsPerRow\":1,\"displayMode\":2}","AVAILABLE_PLUGINS":"[]","FILTERED_INSTALLED_PLUGINS":"[]","THEME_MODE":"dark","INSTALL_PLUGINS":"[]","AMOLED_BLACK":true,"IS_ONBOARDED":true,"APP_SETTINGS":"{\"incognitoMode\":false,\"disableHapticFeedback\":false,\"showHistoryTab\":true,\"showUpdatesTab\":true,\"showLabelsInNav\":true,\"useFabForContinueReading\":true,\"disableLoadingAnimations\":false,\"downloadedOnlyMode\":false,\"useLibraryFAB\":true,\"onlyUpdateOngoingNovels\":false,\"updateLibraryOnLaunch\":false,\"downloadNewChapters\":false,\"refreshNovelMetadata\":false,\"hideBackdrop\":false,\"defaultChapterSort\":\"ORDER BY position ASC\"}","FILTERED_AVAILABLE_PLUGINS":"[]"}
```
#### Separate Codes
##### Css code
```css
body {
  /*--theme-primary: color-mix(in srgb, var(--readerSettings-textColor) 50%, transparent);*/
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
.hr,
#book-container hr,
#book-container + hr {
  border-color: var(--readerSettings-textColor) !important;
}
.footnote {
  color: color-mix(in srgb, var(--readerSettings-textColor) 40%, transparent) !important; 
}
```
##### Js code
```js
// translate function
(function() {
    let translationQueue = [];
    let isTranslating = false;
    
    const customDictionary = {
        "Allah": "اللَّه",
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

// add word count
const chapter = document.getElementById('LNReader-chapter');
const wordCount = chapter.innerText.trim().split(/\s+/).length;
const counter = document.createElement('p');
counter.style.cssText = 'opacity:0.5; font-size:0.85em; margin-bottom:1em;';
counter.textContent = `~${wordCount.toLocaleString()} كلمة`;
chapter.appendChild(counter);
```

> *ملاحظة:* أدناه يوجد كود جافاسكريبت لاستبدال الكلمات الشركية في الروايات، كخط دفاع اخير لي...
<!--```js
// Islamic dictionary
(function() {
        const dictionary = {
        "ألوهية": "تسامي",
"الألوهية": "التسامي",
"ألوهة": "تسامي",
        "تأليه": "تعظيم",
"إلهي": "سماوي",
"الإلهي": "السماوي",
"للألوهية": "للسمو",
"ألوهيته": "سموه",
"خالق": "صانع",
"إلهيًا": "سماويا",
"آلهتكم": "متسامينكم",
"إلهكم": "متساميكم",
"إلهتكم": "سماويتكم",
"الإلهية": "السماوية",
"إلهية": "سماوية",
        "إله": "متسامي",
        "اله": "متسامي",
"إلها": "متساميا",
"إلهًا": "متساميا",
"إِِلها": "متساميًا",
"إِِلهًا": "متساميًا",
"كإله": "كمتسامي",
"كالإله": "كالمتسامي",
        "الإله": "المتسامي",
"ألهة": "المتسامين",
        "الاله": "المتسامي",
        "الهة": "متسامية",
        "إلهة": "متسامية",
        "الالهة": "المتسامية",
        "الإلهة": "المتسامية",
        "آلهة":"متسامين",
"الآلهة": "المتسامين",
"لآلهة": "لمتسامين",
"لإلهة": "لمتسامية",
"لإله": "لمتسامي",
"للإلهة": "للمتسامية",
"للآلهة": "للمتسامين",
"بالآلهة": "بالمتسامين",
"للإله": "للمتسامي",
"بالإله": "بالمتسامي",
"بإله": "بمتسامي",
"بالإلهة": "بالمتسامية",
"بإلهة": "بمتسامية",
"والإله": "واامتسامي",
"والإلهة": "والمتسامية",
"وإلهة": "ومتسامية",
"وإله": "ومتسامي",
"ألهتهم": "متساميهم",
"وآلهة": "ومتسامين",
        "رب": "سيد",
        "قدوس": "مبجول",
        "قدسية": "مبجلية",
        "مقدس": "مبجل",
        "عبادة": "ولاء",
        "عبد": "تابع",
"يعبد": "يتبع",
"يتعبد": "يتبع",
"اعبد": "أتبع",
"أعبد": "أتبع",
"عبده": "اتبعه",
    };

    function replaceWords(node) {
        if (node.nodeType === Node.TEXT_NODE) {
            let text = node.textContent;
            let sortedWords = Object.keys(dictionary).sort((a, b) => b.length - a.length);     
            for (let word of sortedWords) {
                let regex = new RegExp('(?<=^|[\\s\\p{P}])' + word + '(?=[\\s\\p{P}]|$)', 'giu');
                text = text.replace(regex, dictionary[word]);
            }
            node.textContent = text;
        } else {
            for (let child of node.childNodes) {
                replaceWords(child);
            }
        }
    }

    replaceWords(document.body);
    const observer = new MutationObserver((mutations) => {
        mutations.forEach((mutation) => {
            mutation.addedNodes.forEach((node) => {
                if (node.nodeType === Node.ELEMENT_NODE) {
                    replaceWords(node);
                }
            });
        });
    });

    observer.observe(document.body, { childList: true, subtree: true });
})();
(function() {
    const dictionary = {
        "ألوهية": "تسامي",
        "الألوهية": "التسامي",
        "ألوهة": "تسامي",
        "تأليه": "تعظيم",
        "إلهي": "سماوي",
        "الإلهي": "السماوي",
        "للألوهية": "للسمو",
        "ألوهيته": "سموه",
"ألوهيت": "سمو",
        "خالق": "صانع",
        "إلهيًا": "سماويا",
        "آلهتكم": "متسامينكم",
        "إلهكم": "متساميكم",
        "إلهتكم": "سماويتكم",
        "الإلهية": "السماوية",
        "تأله": "السمو",
        "تأليه": "التسميةوتعظيم",
        "إلوهية": "تسامي",
"آله": "متسامي",
        "إلهية": "سماوية",
        "إله": "متسامي",
        "اله": "متسامي",
        "إلها": "متساميا",
        "إلهًا": "متساميا",
        "إِِلها": "متساميًا",
        "إِِلهًا": "متساميًا",
        "كإله": "كمتسامي",
"أله": "متسامي",
        "كالإله": "كالمتسامي",
        "الإله": "المتسامي",
        "ألهة": "المتسامين",
        "الاله": "المتسامي",
        "الهة": "متسامية",
        "إلهة": "متسامية",
        "الالهة": "المتسامية",
        "الإلهة": "المتسامية",
        "آلهة": "متسامين",
        "الآلهة": "المتسامين",
        "لآلهة": "لمتسامين",
        "والآلهة": "والمتسامين",
        "لإلهة": "لمتسامية",
        "لإله": "لمتسامي",
        "قدوس": "مبجول",
        "قدسية": "تبجلية",
        "مقدس": "مبجل",
        "عبادة": "ولاء",
        "عبد": "تابع",
        "يعبد": "يتبع",
        "يتعبد": "يتبع",
        "اعبد": "أتبع",
        "أعبد": "أتبع",
        "عبده": "اتبعه",
        "ملائكة": "مفترين",
        "ملاك": "مفتري",
"صلاة": "طلب",
"يصلي": "يطلب",
"لوهية": "سماوية",
"آدم": "أديم",
"أدم": "أديم",
    };

    const exceptions = new Set([
        "استبداله", "استبدالها", "افعاله", "أفعاله", "الهواء", 
        "سؤالا", "قاله", "جماله", "رجاله", "ماله", "حرب", 
        "إلهام", "الهام", "حاله", "الهدف", "الحرب", "ساله","الهجوم", "الهجمات"
    ]);

    function replaceWords(node) {
        if (node.nodeType === Node.ELEMENT_NODE && 
            (node.tagName === 'SCRIPT' || node.tagName === 'STYLE' || node.tagName === 'CODE')) {
            return;
        }

        if (node.nodeType === Node.TEXT_NODE) {
            let text = node.textContent;
            let originalText = text;
            
            const sortedWords = Object.keys(dictionary).sort((a, b) => b.length - a.length);
            
            for (let word of sortedWords) {
                const regex = new RegExp(`(${word})`, 'gi');
                
                text = text.replace(regex, (match, capturedWord) => {
                    // التحقق من الاستثناءات
                    if (exceptions.has(capturedWord.toLowerCase()) || exceptions.has(capturedWord)) {
                        return match;
                    }
                    
                    const replacement = dictionary[capturedWord];
                    if (replacement) {
                        return replacement;
                    }
                    return match;
                });
            }
            
            if (text !== originalText) {
                node.textContent = text;
            }
        } 
        else if (node.nodeType === Node.ELEMENT_NODE) {
            for (let child of node.childNodes) {
                replaceWords(child);
            }
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            replaceWords(document.body);
        });
    } else {
        replaceWords(document.body);
    }
    
    const observer = new MutationObserver((mutations) => {
        for (let mutation of mutations) {
            for (let node of mutation.addedNodes) {
                if (node.nodeType === Node.ELEMENT_NODE) {
                    replaceWords(node);
                } else if (node.nodeType === Node.TEXT_NODE && node.parentElement) {
                    replaceWords(node.parentElement);
                }
            }
        }
    });
    
    observer.observe(document.body, { 
        childList: true, 
        subtree: true,
        characterData: true 
    });
})();
```-->