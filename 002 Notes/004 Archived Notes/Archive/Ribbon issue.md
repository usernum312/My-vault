---
icon: lucide-notebook-pen
banner: https://images.unsplash.com/photo-1517842645767-c639042777db?w=500&auto=format&fit=crop&q=60&ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxzZWFyY2h8Mnx8bm90ZXN8ZW58MHx8MHx8fDA%3D
ui: edit
cssclasses:
  - metadata-no-title
  - rm-lk-ln
tags:
  - Type/Notes
links pages:
  - "[[NOTES MOC]]"
---
- Ribbon Menu Getting Reset After Relaunching Obsidian
- Where were few unnecessary icons on my obsidian ribbon so I removed them and arranged them according to my preference from the setting but the ribbon menu is getting reset when ever I restart the application on my windows.

this.addRibbonIcon('brain', 'AI Assistant', () => {
    this.openSidebar();
  });

  this.addRibbonIcon('message-square', 'Open AI Chat Page', () => {
    this.openChatPage();
  });
I don't want to delete them from the code, nor do I want to hide them using CSS. I just want to fix this problem. This issue occurs with my plugin, and I think the reason is that it's always trying to create the icon in the ribbon. When I ran the application, I found it already active..
Obsidian has the ability to hide them, and this is done by modifying a core file in mCydian called WorkSpace.Json, and on the phone it's called WorkSpaceMobile.Json It sets the correct value for what will be hidden and the incorrect value for what will not be hidden:
"left-ribbon": {
    "hiddenItems": {
      "audio-recorder:Start/stop recording": false,
      "switcher:Open quick switcher": true,
      "canvas:Create new canvas": true,
      "templates:Insert template": true,
      "command-palette:Open command palette": true,
      "bases:Create new base": true,
      "graph:Open graph view": false,
      "random-note:Open random note": false,
      "daily-notes:Open today's daily note": false,
      "zk-prefixer:Create new unique note": false,
      "workspaces:Manage workspace layouts": true,
      "obsidian-excalidraw-plugin:New drawing": false,
      "Ai-Assistant:AI Assistant": false,
      "Ai-Assistant:Open AI Chat Page": false
    }
  },