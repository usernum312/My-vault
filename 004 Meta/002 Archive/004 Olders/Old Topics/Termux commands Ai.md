---
icon: lucide-square-terminal
links pages:
  - "[[Termux commands Pomo]]"
  - "[[Sync]]"
The Topic:
  - Terminal
  - Ai
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

##### تشغيل llama-server مع تحديد النموذج وعدد الخيوط وحجم الذاكرة السياقية
```bash
./bin/llama-server \
  -m ~/llama.cpp/models/qwen2.5-3b-instruct-q4_k_m.gguf \
  --host 127.0.0.1 \
  --port 8000 \
  --ctx-size 8192 \
  --threads 8
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
            return {"error": "النموذج لم يُرجع أي نص"}

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
            return {"error": "النموذج لم يُرجع أي نص"}

    except Exception as e:
        return {"error": str(e)}
```
- run
```bash
uvicorn llama_api:app --host 127.0.0.1 --port 8000
```