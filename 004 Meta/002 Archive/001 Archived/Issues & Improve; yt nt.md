---
icon: lucide-book-up-2
Translate: true
banner: https://images.unsplash.com/photo-1517842645767-c639042777db?w=500&auto=format&fit=crop&q=60&ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxzZWFyY2h8Mnx8bm90ZXN8ZW58MHx8MHx8fDA%3D
ui: edit
cssclasses:
  - card
  - metadata-no-title
  - remove-hr-star
link pages:
  - "[[NOTES MOC]]"
tags:
  - Type/Notes
---
# Ongoing
- non: everything clean
# Done
I think : the note behavior is a bit rigid/intrusive.
- If there are multiple videos, I have no problem creating and adding a main titles to the note (because video every main title is considered the beginning of new video note and the end of bedore it video note.), but if there is only one video, there is no need to add a main title to the note. The main title is the one that is added by force, which is a first-level address and usually looks like this: topic property text , or video title
- The code forcibly adds a timeline for the 0th second to the note, even if I delete it or choose a different timeline from which to retrieve the note; it is created by force.
- if user have multi links and was naming the links like that following example 
link source:
  - "[part 1](https://www.youtube.com/embed/Dm2swyisqAM)"
  - "[part 2](https://www.youtube.com/embed/c1WBd2gWSPo)"
  - "[part 3](https://www.youtube.com/embed/GlWHz2oGzV0)"
And have heading **titles (from any level)** **contains** or **exactly** what's worte in the links make that's
#### part 1 - the title not should be exactly like the link but there is some semi
- some note
- some note
#### part 2 - the video number two mented notes/content
- some note
- some note
#### part 3
- some note
- some note

If you was there just wroted link (without title: [that's title](thats link)) don't write the HTTP link, write video title as note title

Also remove <!-- end video --> because we are don't need it if there is there just one video we are don't need it, if we are have more than one video every part or title is considered the beginning of new video note and the end of bedore it video note.
- I want to change the way timed notes work because the current standard format is: {00:00}(timestamp) (the timing of the note as a link and the note appears below it). However, I want it to be as follows ###### [00:00] (a level 6 heading with the timing and the note below it)
    - if you can make the note will be changed to the workspace mode and video works in the selected minute do that
-  An icon is automatically created in the tab next to the note name when it's opened in Workspace mode. What code is responsible for this?
- I found a problem when I am inside a space and try to switch to another one. I encounter an issue where the following notification appears: failed to open "" and nothing opens.
- ==allow the workspace to add properties as long as they do not already exist==, with a constraint preventing it from modifying the values of properties if they already exist, except for only one value, which is `playback-position`.
- The video thumbnail is being fetched for the banner property, but sometimes the fetched image is of poor quality. You need to improve this process by adding a filter: if the image quality is low, skip it and search for a higher-quality video thumbnail again by add minimal resolution for the images.
- The current workflow is to extract the direct link that is clearly and easily accessible, like this:link source: https://www.youtube.com/embed/oZgl_rTqFLs This is good, but sometimes there might be wiki links, so they should also be unpacked, and their conten ts retrieved. SoThe video must be played from the link, even if it's not a clean link: in the following format: [wiki link](https://youtu.be/videoid),  It is also necessary to take the links even if they are inside the quotation marks "[wiki link](https://youtu.be/videoid)" or "https://youtu.be/videoid"
- Another problem is the disappearance of support for multiple links and sources, as it is supposed to accept more than one link as a source.
link source:
  - https://www.youtube.com/embed/oZgl_rTqFLs
  - "[part 2](https://www.youtube.com/embed/UY89yYKECiI)"
  - [part 3](https://www.youtube.com/embed/GlWHz2oGzV0)
-  I hate a certain part of the code, which is that a large title for the page is automatically added if the note is ready. I don't want this title. It's fine if the note is new, but if it is already written, what's the use of it? There is no need for it.
- I’ve noticed that the note behavior is a bit rigid/intrusive. If I change anything—like deleting the note's title, or writing without including the timestamp of when the note was created—the page deletes all the existing text and inserts a default template that I might not want. That template is merely a visual layout, so it shouldn't be forced onto everything.The only modifications I allow are the following two:Instead of deleting everything, it should only allow adding a section title above all contents (pre-append).It can add missing Frontmatter properties, provided that it does not delete the existing ones.
- I tried to edit a normal note and add a Youtnote property to it, and although this note contained all the requirements that the workspace needs, from the video to other things and even the link format, I found that the workspace does not work with this note, I encountered an issue where, when I entered the Workspace view, the video didn't appear as if it hadn't been inserted, even though it was there,When I create a Youtnote note from the beginning, it works, but when I convert a file into a Youtnote note as I just did now, it does not work,I think the cause of the problem is the following: The note is not in the template that Workspace expects for the video, as it expects first of all that there is a video title and at the end <!-- end video -->, and this is not available in the note that I made, look:
---
icon: book
Topic: Work less, Work intelligently.
Status: Done
link source:
  - https://www.youtube.com/embed/oZgl_rTqFLs
tags:
  - Type/External-Content/Book
  - Type/External-Content/Media/YouTube
youtnote: true
---
###### Working as an employee is very bad because you are restricted in three aspect
1. Time
2. Places
3. Energy
So the author suggest that solution....
- I have a problem with playback: if I exit the note/application or switch from Workspace to note mode and then re-enter, the video restarts from scratch and all progress is lost.
- When I leave Workspace, the automatic transcript deletion feature works, but it doesn't work when I simply close Workspace, exit the application, or close the page.
the only way for the workspace to work should not be for the user to enter the link directly into it; rather, they should be able to enter it in the note itself, and then it should be decoded and displayed smoothly