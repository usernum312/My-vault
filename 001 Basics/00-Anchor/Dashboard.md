---
cssclasses:
  - list-cards
  - center-title
  - card
  - cards-cols-2
  - IBM-Plex-Font
  - center-paragraph
  - metadata-no-plus
banner: https://www.litmus.com/wp-content/uploads/2023/09/template_hero.svg
icon: lucide-layout-grid
link pages:
  - "[[000 Ultimate Base]]"
  - "[[00-Map of content]]"
  - "[[Self Education]]"
  - "[[Tracker A]]"
tags:
  - Type/Meta/Main-Files
node_size: 33
ui: preview
banner_y: 33
---
![[Auto-run scripts]]
```dataviewjs
const tasks = dv.pages('"003 Daily/001 Active Diaries"')
    .where(p => p.file.day && dv.date(p.file.day).equals(dv.date("today")))
    .file.tasks
    .where(t => !t.completed && t.text.includes("العمل على"));

if (tasks.length > 0) {
    const hasMyGool = tasks.some(t => t.text.includes("![[My Gool]]"));

    tasks.forEach(t => {
        if (t.text.includes("![[My Gool]]")) {
            t.text = t.text.replace("![[My Gool]]", "").trim();
        }
    });

    dv.container.createEl("div", {cls: "rtl-checklist"}, el => {
        dv.taskList(tasks, false);
    });

    if (hasMyGool) {
        const folderPath = '"003 Daily/003 The Diaries Log\'s"';
        const targetHeading = "ما الذي ترغب في التخلي عنه أو اكتسابه هذا الأسبوع؟";
        const ONE_WEEK_AGO = Date.now() - (7 * 24 * 60 * 60 * 1000);

        const pages = dv.pages(folderPath)
            .filter(p => new Date(p.file.ctime).getTime() >= ONE_WEEK_AGO);

        const allGoals = [];

        for (let page of pages) {
            const tFile = app.vault.getAbstractFileByPath(page.file.path);

            if (tFile) { 
                const fileContent = await app.vault.read(tFile); 
                const lines = fileContent.split('\n'); 
                let headingFound = false; 
                let targetContent = []; 
                
                for (let line of lines) { 
                    if (line.includes(`#### ${targetHeading}`)) { 
                        headingFound = true; 
                        continue; 
                    } 
                    if (headingFound && line.startsWith('#')) { 
                        break; 
                    } 
                    if (headingFound) { 
                        targetContent.push(line.trim()); 
                    } 
                } 
                
                const finalContent = targetContent.filter(line => line.length > 0).join('\n'); 
                if (finalContent && !finalContent.includes("عادة، طريقة فكر")) { 
                    allGoals.push(`> هدف: ${finalContent}`); 
                } 
            } 
        }

        if (allGoals.length > 0) {
                dv.paragraph(allGoals);
        } else {
                dv.paragraph("لا توجد أهداف مسجلة للأسبوع الحالي بعد..");
        }
    }
}
```
## [[001 Dashboards|Dashboard]]

- Basic files
    - [[001 Dashboards]]
    - [[Self Education]]
    - [[Athkar & Adia|Athkar & Adiia]]
    - [[Quran]] [[Diny]] [[Learn Something|Learn]]
- <a href="obsidian://open?vault=My-vault&file=004%20Meta%2F002%20Archive%2F001%20Archived%2FAPPs" style="text-decoration: none;color:inherit;font-weight: bold;">Shortcuts</a>
    - [YouTube](https://www.youtube.com/)
    - [Termux](android-app://com.termux)
    - [Reader](android-app://com.rajarsheechatterjee.LNReader)
    - [Search](https://duckduckgo.com)
-  side files
    - [[Azkaru]] [[Light exercise|ply sport]]
    - [[Interesting topic]]
    - [[MY Tools]] [[Translator]]
    - [[MY Knowledge's]]
    - [[EnterTainment's]]
- Pomodoro![[Pomodoro|Pomodoro]]

## [[002 My projects|My Projects]]
![[002 My projects]]

## [[Tracker A|The Tracker]]
![[Tracker A]]