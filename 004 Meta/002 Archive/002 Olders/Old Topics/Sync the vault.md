---
banner: https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcQaE9KO_-t4YpMroMWhq8KpPHZQQ0TSjkA6_G3gt5QaBg&s=10
cssclasses:
  - card
  - invert-banner
links pages:
  - "[[Termux commands Ai]]"
  - "[[Termux commands Pomo]]"
The Topic:
  - Terminal
banner_y: 33
icon: sync-small
---
##### sync

```bash
proot-distro login ubuntu
cd shared/obsidian/My-vault
sync

```

##### tips
- for avoid issues use`git pull origin main --rebase`
- For delete cache data just write `git rm --cached filepath`
- when i have issues with update <!-- example: error: failed to push some refs to 'github.com:username/reponame '-->use`git push --force origin main`
