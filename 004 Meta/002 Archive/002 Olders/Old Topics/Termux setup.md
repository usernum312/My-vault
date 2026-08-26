---
Main Categories:
  - Programing
Categories:
  - "[[Terminal|Terminal]]"
  - "[[Tool|Tool]]"
  - "[[Technical Doc's|Technical Doc's]]"
cssclasses:
  - metadata-no-title
icon: lucide-terminal-square
link source:
  - "[Termux](android-app://com.termux)"
  - "[Terminal tools](https://m.youtube.com/watch?v=JdZFfXeA55o)"
---
#### update 
```bash
pkg update && pkg upgrade -y 
```
#### install libraries
```bash
pkg install python python-pip -y
pkg install python termux-api
pkg install git
termux-setup-storage
```
#### use fish auto complete
```bash
pkg install fish -y
fish
# For cool looking
fish_config prompt choose informative_vcs # try install fish-tools
fish_config prompt save
# For launch fish at start automatically
chsh -s fish # echo 'exec fish' >> ~/.bashrc
# For hide welcome message
set -U fish_greeting
# For return welcome message
set --erase -U fish_greeting
```