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
links pages:
  - "[[000 Ultimate Base]]"
  - "[[00-Map of content]]"
  - "[[Self Education]]"
  - "[[003 Books|Book's]]"
  - "[[Tracker A]]"
tags:
  - Type/Meta/Main-Files
node_size: 33
ui: preview
banner_y: 33
---
![[Auto-run scripts]]
```dataviewjs
const tasks = dv.pages('"003 Daily/001 Active Diaries"').where(p => p.file.day && dv.date(p.file.day).equals(dv.date("today"))).file.tasks.where(t => !t.completed && t.text.includes("العمل على"));if (tasks.length > 0){dv.container.createEl("div", {cls: "rtl-tasks"}, el => {dv.taskList(tasks, false);});}
```
# [[001 Dashboards|Dashboard]]

- Basic files
    - [[001 Dashboards]]
    - [[Self Education]]
    - [[Athkar & Adia|Athkar & Adiia]]
    - [[Quran]] [[Diny]] [[Learn Something|Learn]]
- <a href="obsidian://open?vault=My-vault&file=004%20Meta%2F002%20Archive%2F001%20Archived%2FAPPs" style="text-decoration: none;color:inherit">Shortcuts</a>
    - [YouTube](https://www.youtube.com/)
    - [Termux](android-app://com.termux)
    - [Reader](android-app://com.rajarsheechatterjee.LNReader)
    - [Search](https://duckduckgo.com)[ai](android-app://ai.perplexity.app.android)
-  side files
    - [[Azkaru]] [[Light exercise|ply sport]]
    - [[Interesting topic]]
    - [[MY Tools]] [[Translator]]
    - [[MY Knowledge's]]
    - [[EnterTainment's]]
- Pomodoro![[Pomodoro|Pomodoro]]

# [[00-Map of content|My Projects]]
![[002 My projects]]

# [[Tracker A|The Tracker]]
![[Tracker A]]