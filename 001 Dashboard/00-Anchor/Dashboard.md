---
cssclasses:
  - list-cards
  - center-title
  - card
  - cards-cols-2
  - IBM
  - center-paragraph
  - no-plus
banner: https://www.litmus.com/wp-content/uploads/2023/09/template_hero.svg
icon: lucide-layout-grid
links pages:
  - "[[000 Ultimate Base]]"
  - "[[000 Map of content]]"
  - "[[Self Education]]"
tags:
  - Type/Main-Files
node_size: 33
ui: preview
banner_y: 33
---
```dataviewjs
const tasks = dv.pages('"003 Daily/001 Active Diaries"')
  .where(p => p.file.day && dv.date(p.file.day).equals(dv.date("today")))
  .file.tasks
  .where(t => !t.completed && t.text.includes("العمل على"));

if (tasks.length > 0) {
  // تغليف المهام بـ div يدعم الـ RTL
  dv.container.createEl("div", { cls: "rtl-tasks" }, el => {
    dv.taskList(tasks, false);
  });
}
```

# <span><u>Dashboard</u></span>

- Basic files
    - [[Self Education]]
    - [[Athkar & Adia|Athkar & Adia]]
    - [[Diny|Diny]]
    - [[001 Dashboards]]
- Shortcuts 
    - [Search](https://duckduckgo.com)
    - [YouTube](https://www.youtube.com/) 
    - [ChatGPT](https://chat.openai.com/)
    - [Termux](android-app://com.termux)
-  side files
    - [[Azkaru]]
    - [[My tools]]
    - [[Mawaidh]]
    - [[004 My notes]]
    - [[learn English]]
    - [[points of my knowledge]]
    - [[YouTube]]
- Pomodoro![[Pomodoro v.basic|Pomodoro]]

# <span><u>My Projects</u></span>
[[000 Map of content|map of learning]]
![[002 My projects]]

# <span><u>The Tracker</u></span>


![[Tracker A]]