---
icon: https://raw.githubusercontent.com/lobehub/lobe-icons/refs/heads/master/packages/static-png/light/obsidian-color.png
banner: https://i.ytimg.com/vi/M-1aY0npFDs/hq720.jpg?sqp=-oaymwEcCK4FEIIDSEbyq4qpAw4IARUAAIhCGAFwAcABBg==&rs=AOn4CLBwhLRyQKBTN6SIUwraxxI8rpNMVQ
banner_y: 36
Categories:
  - "[[Technical Doc's]]"
---

## Clipper settings

```json
{
  "general_settings": {
    "showMoreActionsButton": false,
    "betaFeatures": false,
    "legacyMode": false,
    "silentOpen": false,
    "openBehavior": "popup",
    "saveBehavior": "addToObsidian"
  },
  "highlighter_settings": {
    "highlighterEnabled": true,
    "alwaysShowHighlights": true,
    "highlightBehavior": "highlight-inline"
  },
  "interpreter_settings": {
    "interpreterModel": "",
    "models": [],
    "providers": [],
    "interpreterEnabled": false,
    "interpreterAutoRun": false,
    "defaultPromptContext": ""
  },
  "migrationVersion": 1,
  "property_types": [
    {
      "name": "author",
      "type": "multitext",
      "defaultValue": "{{author|split:\", \"|wikilink|join}}"
    },
    {
      "name": "tags",
      "type": "tags"
    },
    {
      "name": "Translate",
      "type": "checkbox",
      "defaultValue": "true"
    },
    {
      "name": "Categories",
      "type": "multitext",
      "defaultValue": "{{title}}"
    },
    {
      "name": "link sourse",
      "type": "text",
      "defaultValue": "{{url}}"
    }
  ],
  "reader_settings": {
    "fontSize": 1.5,
    "lineHeight": 1.6,
    "maxWidth": 38,
    "theme": "default",
    "themeMode": "auto"
  },
  "stats": {
    "addToObsidian": 3,
    "saveFile": 0,
    "copyToClipboard": 0,
    "share": 0
  },
  "template_1772632926351g62s4mjn0": {
    "id": "1772632926351g62s4mjn0",
    "name": "Default",
    "behavior": "create",
    "noteNameFormat": "{{title}}",
    "path": "004 Meta/003 External Content/001 Digital CLippings",
    "noteContentFormat": "# THE SUBJECT\n\n{{description}}\n***\n\n# THE CONTENT\n\n{{content}}",
    "context": "",
    "properties": [
      {
        "id": "17733164182038voruigkj",
        "name": "icon",
        "value": "lucide-globe",
        "type": "text"
      },
      {
        "id": "1773316386774yjm5gzgqs",
        "name": "banner",
        "value": "{{image}}",
        "type": "text"
      },
      {
        "id": "1772632926352mfs0u3zmk",
        "name": "link sourse",
        "value": "{{url}}",
        "type": "text"
      },
      {
        "id": "1772632926352pyzrfcfbh",
        "name": "Categories",
        "value": "{{title}}",
        "type": "multitext"
      },
      {
        "id": "1772633626363oadsr0xuf",
        "name": "Translate",
        "value": "true",
        "type": "checkbox"
      },
      {
        "id": "1773317414075kyi6n2w5o",
        "name": "tags",
        "value": "Type/External-Content/Internet",
        "type": "tags"
      }
    ],
    "triggers": []
  },
  "template_list": [
    "1772632926351g62s4mjn0"
  ],
  "vaults": []
}
```