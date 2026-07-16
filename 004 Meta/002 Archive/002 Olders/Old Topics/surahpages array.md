---
Categories:
  - "[[Technical Doc's|Technical Doc's]]"
icon: lucide-brackets
---
> For make sure names restructure
> Step's:
> 1. enter on that's link: https://github.com/zonetecde/mushaf-layout/archive/refs/heads/main.zip, and download the file
> 2. Move `mushaf` folder to root on obsidian
> 3. Change the following script to dataviewjs 
> 4. copy the array from the console
```js
/**
 * surah-pages-generator.js
 * 
 * Run this in Obsidian via the "Templater" or "CustomJS" plugin,
 * OR paste it into the Obsidian developer console (Ctrl+Shift+I).
 * 
 * Expects a folder called "mushaf" in your vault root containing
 * page-001.json through page-604.json
 * 
 * Output: the optimized surahPages array printed to console + copied to clipboard
 */

const surahStartPages = [1,2,50,77,106,128,151,177,187,208,221,235,249,255,262,267,
  282,293,305,312,322,332,342,350,359,367,377,385,396,404,411,415,418,428,434,
  440,446,453,458,467,477,483,489,496,499,502,507,511,515,518,520,523,526,528,
  531,534,537,542,545,549,551,553,554,556,558,560,562,564,566,568,570,572,574,
  575,577,578,580,582,583,585,586,587,587,589,590,591,591,592,592,593,595,595,
  596,596,597,597,598,598,599,599,600,600,601,601,601,602,602,602,603,603,603,
  604,604,604];

function lineToDecimal(line) {
  return Math.min(Math.floor((line / 15) * 10), 9);
}

async function generateSurahPages() {
  // app is the global Obsidian app object
  const vault = app.vault;
  const results = [];
  const errors = [];

  // Cache pages we've already read (multiple surahs can share a page)
  const pageCache = {};

  for (let i = 0; i < surahStartPages.length; i++) {
    const surahNum = i + 1;
    const pageNum = surahStartPages[i];
    const padded = String(pageNum).padStart(3, "0");
    const filePath = `mushaf/page-${padded}.json`;

    try {
      // Read from cache or load file
      if (!pageCache[pageNum]) {
        const file = vault.getAbstractFileByPath(filePath);
        if (!file) throw new Error(`File not found: ${filePath}`);
        const raw = await vault.read(file);
        pageCache[pageNum] = JSON.parse(raw);
      }

      const pageData = pageCache[pageNum];
      const lines = pageData.lines || [];

      // Find all surah-headers on this page
      const headers = lines.filter(l => l.type === "surah-header");

      let targetLine = null;

      if (headers.length === 1) {
        // Only one surah starts on this page — straightforward
        targetLine = headers[0].line;

      } else if (headers.length > 1) {
        // Multiple surahs on this page — find the one matching surahNum
        // The surah field is a zero-padded string like "083"
        const surahPadded = String(surahNum).padStart(3, "0");
        const match = headers.find(h => h.surah === surahPadded);
        if (match) {
          targetLine = match.line;
        } else {
          // Fallback: figure out index by position among all surahs on this page
          const surahsOnPage = surahStartPages
            .map((p, idx) => ({ page: p, surah: idx + 1 }))
            .filter(x => x.page === pageNum)
            .map(x => x.surah);
          const idxInPage = surahsOnPage.indexOf(surahNum);
          if (idxInPage >= 0 && idxInPage < headers.length) {
            targetLine = headers[idxInPage].line;
          } else {
            targetLine = headers[0].line;
            errors.push(`Surah ${surahNum} p${pageNum}: used first header as fallback`);
          }
        }

      } else {
        // No surah-header found at all on this page
        targetLine = 1;
        errors.push(`Surah ${surahNum} p${pageNum}: no surah-header found, defaulted to line 1`);
      }

      const dec = lineToDecimal(targetLine);
      const value = parseFloat((pageNum + dec / 10).toFixed(1));
      results.push({ surah: surahNum, page: pageNum, line: targetLine, dec, value });

    } catch (err) {
      errors.push(`Surah ${surahNum} p${pageNum}: ${err.message}`);
      const value = parseFloat((pageNum + 0).toFixed(1));
      results.push({ surah: surahNum, page: pageNum, line: 1, dec: 0, value });
    }
  }

  // ── Output ────────────────────────────────────────────────────────────────

  const arrayStr = "const surahPages = ["
    + results.map(r => r.value.toFixed(1)).join(",")
    + "];";

  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("surahPages — Precision Array (Hafs Madinah Mushaf)");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log(arrayStr);
  console.log("");

  // Detailed breakdown
  console.log("── Breakdown ──");
  for (const r of results) {
    const flag = r.value !== Math.floor(r.value) ? " ◄" : "";
    console.log(`Surah ${String(r.surah).padStart(3)}: page ${String(r.page).padStart(3)}, line ${String(r.line).padStart(2)} → .${r.dec} → ${r.value.toFixed(1)}${flag}`);
  }

  if (errors.length > 0) {
    console.warn("── Warnings ──");
    errors.forEach(e => console.warn(e));
  } else {
    console.log("── No errors ✓ ──");
  }

  // Copy to clipboard
  try {
    await navigator.clipboard.writeText(arrayStr);
    console.log("✓ Array copied to clipboard!");
  } catch {
    console.log("(Clipboard unavailable — copy the array above manually)");
  }

  return results;
}

// Run it
generateSurahPages();
```