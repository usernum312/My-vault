---
Topic: Default Conversation
tags:
  - Type/External-Content/Ai-Conversations
icon: lucide-bot-message-square
---

# Default Conversation

### User (1)

#### Attachments:
- [[Issues]]

Translate to English

---

### Assistant (1)

#### Attachments:
- [[Issues]]

Here's the English translation:

**Issues & Improve**
---
icon: lucide-book-up-2
---
- When a user stops at a certain point in a video, exits, and then returns later to the video notes workspace, the video restarts from the beginning. This is an issue; video progress should be maintained.
- If possible, please add a feature where, when the user is watching a video in the workspace, the script in the sidebar automatically scrolls to keep pace with the video.
- While reviewing your code, I noticed you have a variable that currently captures the user's timestamp in the video when a note is created. This timestamp remains the same even if the user changes the video playback speed (e.g., to 2x or 3x). I would like you to make the video resume playback from that specific timestamp. This timestamp should be saved in `data.json`, and the video should be played from the user's last stopped point using the following URL format: `https://youtu.be/videoid?t=seconds`. If you can accurately retrieve this timestamp, please also fix the script scrolling feature in the sidebar. Currently, it scrolls but does not keep pace with the video speed. I sometimes change the video speed to 2x or 1x, and the script synchronization is lost.
- Another issue arose immediately after we switched to using the 'source link' feature: sometimes in the workspace, a user can input more than one video. In such cases, all notes related to the second (and subsequent) videos disappear, and only those for the first video are displayed. This means only one video can be accommodated. Please fix this problem as follows:
    Currently, it is:
    `source link: https://www.youtube.com/watch?v=videoid1`
    It should become like this:
    `source link:`
    `    - https://www.youtube.com/watch?v=videoid1`
    `    - https://www.youtube.com/watch?v=videoid2`

