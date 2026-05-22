---
banner: https://cdn.prod.website-files.com/603337453431865da8887550/60334c6df6e0cd2b97016787_SYNC-TECH-RED-p-500.png
cssclasses:
  - card
  - invert-banner
icon: sync-small
aliases:
  - Termux  Sync the vault
  - Termux commands sync
links pages:
  - "[[Termux commands Ai]]"
  - "[[Termux commands Pomo]]"
Main Categories:
  - Programing
Categories:
  - "[[Terminal]]"
  - "[[Technical Doc's]]"
---
##### Sync
```bash
proot-distro login ubuntu
cd shared/obsidian/My-vault
sync

```
Current repo: https://github.com/usernum312/My-vault/
##### Tips
- for avoid issues use`git pull origin main --rebase`
- for support arabic language `git config --global core.quotepath false`
- For delete cache data just write `git rm --cached filepath`
- when i have issues with update <!-- example: error: failed to push some refs to 'github.com:username/reponame '-->use`git push --force origin main`
- if you want to return from the last commit use `git reset --soft origin/main`
- if you want to see everything will to update use `git status`
- if you want to return to any commit `git reset --hard id after that git push origin main --force`

###### Reset Commands
```shell
# 1. Create a temporary orphan branch (has no history)
git checkout --orphan latest_branch

# 2. Add all current files to this new branch
git add -A

# 3. Create the new starting commit
git commit -am "Initial commit"

# 4. Delete the old main branch (replace 'main' with 'master' if needed)
git branch -D main

# 5. Rename the current temporary branch to 'main'
git branch -m main

# 6. Force update your GitHub repository
git push -f origin main

```

