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
This works well, but I want these guidelines to be temporary. For the rest of the conversation, this data should be purged from its context window—acting like external standard operating data that is processed once during the edit and then forgotten. If the user requests another file modification later, those principles are injected again. My goal here is to keep the context window lightweight and save tokens.
___
I noticed the return of parasitic behaviors, even if in a small form. For example, the banner property was modified: the link was saved and the two text string markers that were there before were deleted. Even though the modification didn’t cause any issues, there shouldn’t have been any change on the page level. The changes are supposed to happen only by adding the notes the user wrote, and only in the workspace.
___
**ISSUE: Custom sidebar tab icon gets overwritten by default Lucide file icon on file open**
**Description**:
Sometimes When opening a file from the sidebar, the tab icon (.workspace-drawer .workspace-drawer-tab-select .workspace-tab-header-inner-icon) initially renders the custom user-defined icon correctly. However, a few milliseconds later, it gets dynamically overwritten and replaced by the default Lucide file icon.
Currently, the custom icon only stays fixed after the user manually switches to another sidebar tab and returns to the original one.
Note: in the generally the issue happening but sometimes other it doesn't.
**Expected Behavior**:
The custom user icon should persist seamlessly when a file is opened, without being replaced by the Lucide file icon.
___
**Objective:** Expand workspace video player support to natively handle local/stored vault video files alongside existing YouTube URL functionality.

**Key Requirements & Functionality:**

- **Input Parsing:**
    - If a user inputs a link to a note within their vault pointing to a local video file (e.g., `.mp4`, `.mkv`, `.webm`), parse the note and embed the attached video directly into the workspace.
- **Audio Processing & Transcription:**
    - Execute a script/API to process the video track and automatically extract/generate a text transcript.
- **UI Adaptation & Feature Parity:**
    - Refactor the UI so that all existing YouTube-specific features work seamlessly with local video files, including:
        - **Timestamped Notes:** Creating notes linked to specific timestamps within the video.
        - **Interactive Seeking:** Jumping directly to designated timestamps/time intervals upon interaction.
        - **State Persistence:** Automatically saving playback position and resuming from the last stopped time upon reopening.
- **Technical Guidance (Playback Timing):**
    - Utilize the `#t=` media fragment parameter within the HTML5 video source path to handle timestamp jumping.
    - _Example:_ `<video src="videoplayback.mp4#t=120" controls></video>` to start playback directly at 2:00.