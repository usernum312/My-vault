---
Main Categories:
  - Programing
Categories:
  - Terminal
  - Tool
cssclasses:
  - metadata-no-title
icon: lucide-terminal-square
link sourse: "[Termux](android-app://com.termux)"
---
### انشاء اداة كن اجل مراقبة المنسوخات وصناعة ملف به المقولة المنسوخة
#### التجهيزات
##### تحديث النظام
```bash
pkg update && pkg upgrade -y 
```
##### تثبيت الحزم الضرورية للبناء
```bash
pkg install python python-pip -y  
pkg install python termux-api
```
#### البدأ بالعمل
انشاء ملف `nano book_snippets.py`
نكتب داخله
```python
import os
import json
import subprocess
import time

TARGET_DIR = "/data/data/com.termux/files/home/storage/shared/obsidian/My-vault/002 Notes/004 Archived Notes/Snippets/Books snippets"
DB_FILE = "books_db.json"

def get_clipboard():
    """ =. get copied text from the clipboard .= """
    try:
        result = subprocess.run(['termux-clipboard-get'], capture_output=True, text=True)
        return result.stdout.strip()
    except Exception:
        return ""

def load_db():
    """ =. load data of previous books .= """
    if os.path.exists(DB_FILE):
        with open(DB_FILE, 'r', encoding='utf-8') as f:
            return json.load(f)
    return {}

def save_db(db):
    """ =. Saving book data .= """
    with open(DB_FILE, 'w', encoding='utf-8') as f:
        json.dump(db, f, ensure_ascii=False, indent=4)

def main():
    os.makedirs(TARGET_DIR, exist_ok=True)
    
    db = load_db()
    books = list(db.keys())
    
    print(". == =Book Quote tool= == .")
  
    if books:
        print("\n already :")
        for i, book in enumerate(books, 1):
            print(f"{i}. {book}")
        print("-" * 30)
        
    choice = input("\n choose book: ").strip()
    
    current_book = ""
    if choice.isdigit() and 1 <= int(choice) <= len(books):
        current_book = books[int(choice) - 1]
    else:
        current_book = choice
        if current_book not in db:
            db[current_book] = 0
            save_db(db)
            
    print(f"\n✓ Selected Book is  : {current_book}")
    last_clip = get_clipboard()
  
    try:
        while True:
            current_clip = get_clipboard()

            if current_clip and current_clip != last_clip:
                db[current_book] += 1
                quote_num = db[current_book]
                
                content = f'---\nBook: "[[{current_book}]]"\n---\n> {current_clip}\n'
                
                filename = f"{current_book} - Quote {quote_num}.md"
                filepath = os.path.join(TARGET_DIR, filename)
                
                with open(filepath, 'w', encoding='utf-8') as f:
                    f.write(content)
                    
                print(f"@ ~ New Quote   : {filename}")
                
                last_clip = current_clip
                save_db(db)
                
            time.sleep(1.5)
            
    except KeyboardInterrupt:
        print("\n thanks for use our program")

if __name__ == "__main__":
    main()
```
#### التشغيل
```shell
python book_snippets.py
```
ايقاف: ctr + c