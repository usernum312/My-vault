---
cssclasses:
  - remove-hr-star
icon: lucide-save-all
---
## Archived Quest's
___
Currently, file modification guidelines (handling files using methods like patch, etc.) are only sent in two cases:
The user requests a file modification via ✏ Edit instruction:.
The user asks the AI to directly edit a file within the workspace/files it has access to.
This works well, but I want these guidelines to be temporary. For the rest of the conversation, this data should be purged from its context window—acting like external standard operating data that is processed once during the edit and then forgotten. If the user requests another file modification later, those principles are injected again. My goal here is to keep the context window lightweight and save tokens.
By the way, this is just my assumption about how it currently works. If my understanding is incorrect, please explain the actual mechanism to me first. Then, tell me if my proposal is good and technically feasible. Let’s discuss this as co-contributors on the project.
___
