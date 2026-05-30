---
Main Categories:
  - Programing
Categories:
  - "[[Terminal]]"
  - "[[Tool]]"
  - "[[Technical Doc's]]"
cssclasses:
  - metadata-no-title
icon: lucide-terminal-square
link source: "[Termux](android-app://com.termux)"
---
#### update 
```bash
pkg update && pkg upgrade -y 
```
#### install libraries
```bash
pkg install python python-pip -y  
pkg install python termux-api
termux-setup-storage
```
#### use fish auto complete
```bash
pkg install fish -y
fish_config prompt choose informative_vcs
fish_config prompt save
chsh -s fish
set -U fish_greeting
```
For return welcome message
```bash
set --erase -U fish_greeting
```