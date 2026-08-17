#### websites for programming
* [APP From Website](https://wl.tools/tiiny_host)
##### Game Assets websites
1. Auto Sprite
```dataviewjs
const linkData = {
  url: "https://www.autosprite.io/",
  title: "AutoSprite - AI Sprite Sheet Generator",
  host: "www.autosprite.io", 
  favicon: "https://www.autosprite.io/favicon-96x96.png",
  image: "https://www.autosprite.io/favicon-96x96.png",
  description: "Upload a single sprite, pick a moveset, and export engine-ready spritesheets in minutes."
};

dv.el("div", `
<div class="auto-card-link-container">
  <a class="auto-card-link-card" href="${linkData.url}">
    <div class="auto-card-link-main">
      <div class="auto-card-link-title">${linkData.title}</div>
      <div class="auto-card-link-description">${linkData.description}</div>
      <div class="auto-card-link-host">
        ${linkData.favicon ? `<img class="auto-card-link-favicon" src="${linkData.favicon}">` : ""}
        <span>${linkData.host}</span>
      </div>
    </div>
    ${linkData.image ? `<img class="auto-card-link-thumbnail" src="${linkData.image}">` : ""}
  </a>
</div>
`);
```

2. Kenney

```dataviewjs
const linkData = {
  url: "https://kenney.nl/assets",
  title: "Assets · Kenney",
  host: "kenney.nl", 
  favicon: "https://kenney.nl/data/img/logo@2.png",
  image: "https://kenney.nl/data/img/kenney-promo.png",
  description: "Massive collection of free game assets, sprites, and 3D models"
};

dv.el("div", `
<div class="auto-card-link-container">
  <a class="auto-card-link-card" href="${linkData.url}">
    <div class="auto-card-link-main">
      <div class="auto-card-link-title">${linkData.title}</div>
      <div class="auto-card-link-description">${linkData.description}</div>
      <div class="auto-card-link-host">
        ${linkData.favicon ? `<img class="auto-card-link-favicon" src="${linkData.favicon}">` : ""}
        <span>${linkData.host}</span>
      </div>
    </div>
    ${linkData.image ? `<img class="auto-card-link-thumbnail" src="${linkData.image}">` : ""}
  </a>
</div>
`);
```


2.  Game Assets
```dataviewjs
const d = {
    url: "https://www.gamedevmarket.net/",
    title: "Game Assets for Indie Developers",
    description: "marketplace for high quality, affordable 2D, 3D, GUI & Audio game assets, handcrafted by talented creators around the world.",
    host: "www.gamedevmarket.net",
    favicon: "https://www.gamedevmarket.net/favicon.png",
    image: "https://cdn.gamedevmarket.net/no-cover.png" // No image URL was provided
};

dv.el("div", `
<div class="auto-card-link-container">
  <a class="auto-card-link-card" href="${d.url}">
    <div class="auto-card-link-main">
      <div class="auto-card-link-title">${d.title}</div>
      <div class="auto-card-link-description">${d.description}</div>
      <div class="auto-card-link-host">
        ${d.favicon ? `<img class="auto-card-link-favicon" src="${d.favicon}">` : ""}
        <span>${d.host}</span>
      </div>
    </div>
    ${d.image ? `<img class="auto-card-link-thumbnail" src="${d.image}">` : ""}
  </a>
</div>
`);
```
