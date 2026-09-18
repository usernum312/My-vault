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
Currently, file modification guidelines (handling files using methods like patch, etc.) are only sent in two cases:
The user requests a file modification via ✏ Edit instruction:.
The user asks the AI to directly edit a file within the workspace/files it has access to.
This works well, but I want these guidelines to be temporary. For the rest of the conversation, this data should be purged from its context window—acting like external standard operating data that is processed once during the edit and then forgotten (What inspired me to create this idea was the way artificial intelligence was given files to read when it requested them from the vault, provided it had the necessary permissions. It would simply forget the contents of the files, and I liked this aspect, so I didn't want to delete it but i needed to save some details because that i added mechanism stores some basic data inside a comment html tag.). If the user requests another file modification later, those principles are injected again. My goal here is to keep the context window lightweight and save tokens.
___
I want to Use the cached banner image URL as the primary image source across the application. If any component requests an image link associated with a cached banner, always serve the cached image instead of making a network request to fetch the original image from the internet.

To test this implementation, I will perform the following steps:
1. Disconnect the device from the Wi-Fi/Internet to ensure offline mode.
2. Clear/delete all locally stored Obsidian vault data while preserving the plugin and its cached banners.
3. Open the vault offline and check if the banner images load correctly using their link references.

**Expected Result:** If the banner images fail to load via their links while offline, it indicates that the application is still attempting to fetch the original image from the internet instead of using the cached version.
___
