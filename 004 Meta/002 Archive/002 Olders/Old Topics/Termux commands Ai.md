---
icon: lucide-square-terminal
Main Categories:
  - Programing
Categories:
  - Terminal
  - Ai
link sourse: "[Termux](android-app://com.termux)"
---
### بناء ذكاء اصطناعي محلي 
#### التجهيزات
##### الاستعدادات
###### تحديث النظام والحزم الأساسية
```bash
pkg update && pkg upgrade -y 
```

###### تثبيت الحزم الضرورية للبناء
```bash
pkg install git cmake clang make wget -y  
pkg install python python-pip -y  
pip install fastapi uvicorn requests pydantic
```
##### تحميل المشروع

###### استنساخ مستودع llama.cpp
```bash
git clone https://github.com/ggerganov/llama.cpp
cd llama.cpp
```

###### إنشاء مجلد للنماذج
```bash
mkdir -p models
```
###### تحميل نموذج Qwen2.5 
```bash
wget -O models/qwen2.5-3b-instruct-q4_k_m.gguf "https://huggingface.co/Qwen/Qwen2.5-3B-Instruct-GGUF/resolve/main/qwen2.5-3b-instruct-q4_k_m.gguf"
```
###### أو نموذج Gemma 4
```bash
curl -L -o gemma-2-2b-it.gguf https://huggingface.co/bartowski/gemma-2-2b-it-GGUF/resolve/main/gemma-2-2b-it-Q4_K_M.gguf
```
مع
```bash
./build/bin/llama-server \
  -m models/gemma-2-2b-it.gguf \
  --host 127.0.0.1 \
  --port 8000 \
  --ctx-size 2048 \
  --threads 4 \
  --batch-size 128 \
  --n-predict 512 \
  --chat-template simple
```
او نموذج Gemma **الثقيل**
```bash
 wget -O models/gemma-4-e4b-it-q4_k_m.gguf "https://huggingface.co/unsloth/gemma-4-E4B-it-GGUF/resolve/main/gemma-4-E4B-it-Q4_K_M.gguf"
```
##### البناء

###### تنظيف أي بناء سابق
```bash
cd ~/llama.cpp
rm -rf build
mkdir build
cd build
```
###### تفعيل السيرفر ودعم HTTP
```bash
cmake .. \
  -DLLAMA_SERVER=ON \
  -DLLAMA_HTTP=ON

make -j$(nproc)
```
#### تشغيل السيرفر

##### تشغيل llama-server مع تحديد النموذج وعدد الخيوط وحجم الذاكرة السياقية للعمل مع التطبيقات الخارجية كapi
```bash
./bin/llama-server \
  -m ~/llama.cpp/models/qwen2.5-3b-instruct-q4_k_m.gguf \
  --host 127.0.0.1 \
  --port 8000 \
  --ctx-size 2048 \
  --threads 8
```

###### لو أردت يمكنك الحديث مع أي نموذج مباشرة من الterminal عبر
```shell
./build/bin/llama-cli \
  -m models/gemma-4-e4b-it-q4_k_m.gguf\
  -cnv \
  --color on\
  -p "You are a helpful assistant." \
  --ctx-size 2048 \
  --threads 4
```
##### إنشاء سيرفر بايثون لاستقبال الطلبات والعمل

###### قم بإنشاء ملف باسم: llama_api.py واكتب فيه التالي
كود السيرفر
```python
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import requests

LLAMA_SERVER_URL = "http://127.0.0.1:8000/v1/chat/completions"

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

class AskRequest(BaseModel):
    prompt: str
    max_tokens: int = 128

@app.get("/health")
def health():
    return {"status": "ok"}

@app.post("/ask")
def ask(req: AskRequest):
    try:
        payload = {
            "model": "qwen2.5-3b-instruct",# اسم النموذج هنا
            "messages": [{"role": "user", "content": req.prompt}],
            "temperature": 0.7,
            "max_tokens": req.max_tokens
        }

        response = requests.post(LLAMA_SERVER_URL, json=payload, timeout=180)
        data = response.json()

        if "choices" in data and len(data["choices"]) > 0:
            return {"response": data["choices"][0]["message"]["content"]}
        else:
            return {"error": "The model didn't return any text."}

    except Exception as e:
        return {"error": str(e)}
```
###### تشغيل API Python
```bash
uvicorn llama_api:app --host 127.0.0.1 --port 8000
```
###### كامل الأكواد
```bash
pkg update && pkg upgrade -y
pkg install git cmake clang make wget -y
pkg install python python-pip -y
pip install fastapi uvicorn requests pydantic
git clone https://github.com/ggerganov/llama.cpp
cd llama.cpp
mkdir -p models
wget -O models/qwen2.5-3b-instruct-q4_k_m.gguf "https://huggingface.co/Qwen/Qwen2.5-3B-Instruct-GGUF/resolve/main/qwen2.5-3b-instruct-q4_k_m.gguf"
cd ~/llama.cpp
mkdir build
cd build
cmake .. \
  -DLLAMA_SERVER=ON \
  -DLLAMA_HTTP=ON

make -j$(nproc)
cd ~
nano llama_api.py
```
- in nano
```python
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import requests

LLAMA_SERVER_URL = "http://127.0.0.1:8000/v1/chat/completions"

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

class AskRequest(BaseModel):
    prompt: str
    max_tokens: int = 128

@app.get("/health")
def health():
    return {"status": "ok"}

@app.post("/ask")
def ask(req: AskRequest):
    try:
        payload = {
            "model": "qwen2.5-3b-instruct",
            "messages": [{"role": "user", "content": req.prompt}],
            "temperature": 0.7,
            "max_tokens": req.max_tokens
        }

        response = requests.post(LLAMA_SERVER_URL, json=payload, timeout=180)
        data = response.json()

        if "choices" in data and len(data["choices"]) > 0:
            return {"response": data["choices"][0]["message"]["content"]}
        else:
            return {"error": "The model didn't return any text."}

    except Exception as e:
        return {"error": str(e)}
```
- run
```bash
uvicorn llama_api:app --host 127.0.0.1 --port 8000
```