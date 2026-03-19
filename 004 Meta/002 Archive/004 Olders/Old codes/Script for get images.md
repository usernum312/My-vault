
```bash
pip install requests
```

```python
import requests
import re

url = "https://nl.pinterest.com/mahoheny/%D8%B1%D9%82%D8%A7%D8%A6%D9%82/"

headers = {
    "User-Agent": "Mozilla/5.0"
}

response = requests.get(url, headers=headers)
html = response.text

# Find all direct image links ending with jpg or png
image_links = set(re.findall(r'https://i\.pinimg\.com[^"]+\.(?:jpg|png)', html))

for link in image_links:
    print(f'<img src="{link}">')
```
[Save](https://i.pinimg.com/474x/c9/ea/bd/c9eabd1e1ef8b1a19e60bdeea8e5d8eb.jpg)