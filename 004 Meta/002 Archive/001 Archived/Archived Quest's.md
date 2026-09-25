---
cssclasses:
  - rm-hr-star
icon: lucide-save-all
link pages:
  - "[[Web Translator]]"
  - "[[Quests]]"
Translate: true
---
## Archived Quest's
___
I want to Use the cached banner image URL as the primary image source across the application. If any component requests an image link associated with a cached banner, always serve the cached image instead of making a network request to fetch the original image from the internet.

To test this implementation, I will perform the following steps:
1. Disconnect the device from the Wi-Fi/Internet to ensure offline mode.
2. Clear/delete all locally stored Obsidian vault data while preserving the plugin and its cached banners.
3. Open the vault offline and check if the banner images load correctly using their link references.

**Expected Result:** If the banner images fail to load via their links while offline, it indicates that the application is still attempting to fetch the original image from the internet instead of using the cached version.
___
