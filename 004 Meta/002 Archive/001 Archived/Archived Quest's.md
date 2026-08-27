---
cssclasses:
  - remove-hr-star
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
By the way, this is just my assumption about how it currently works. If my understanding is incorrect, please explain the actual mechanism to me first. Then, tell me if my proposal is good and technically feasible. Let’s discuss this as co-contributors on the project.
___
I noticed the return of parasitic behaviors, even if in a small form. For example, the banner property was modified: the link was saved and the two text string markers that were there before were deleted. Even though the modification didn’t cause any issues, there shouldn’t have been any change on the page level. The changes are supposed to happen only by adding the notes the user wrote, and only in the workspace.
___
**ISSUE: Custom sidebar tab icon gets overwritten by default Lucide file icon on file open**
**Description**:
Sometimes When opening a file from the sidebar, the tab icon (.workspace-drawer .workspace-drawer-tab-select .workspace-tab-header-inner-icon) initially renders the custom user-defined icon correctly. However, a few milliseconds later, it gets dynamically overwritten and replaced by the default Lucide file icon.
Currently, the custom icon only stays fixed after the user manually switches to another sidebar tab and returns to the original one.
Note: This issue doesn't happen when Obsidian starts up with the main selected sidebar containing the custom icon active, also in the sometimes the issue happening vut sometimes other it doesn't.
**Expected Behavior**:
The custom user icon should persist seamlessly when a file is opened, without being replaced by the Lucide file icon.
___