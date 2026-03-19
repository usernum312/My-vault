---
icon: lucide-square-terminal
links pages:
  - "[[Termux commands Ai]]"
  - "[[Sync]]"
The Topic:
  - Terminal
  - Tool
---
### إنشاء موقع لمؤقت البومو

#### التجهيزات

###### تحديث النظام
```bash
pkg update && pkg upgrade -y
```

###### تثبيت الحزم الضرورية
```bash
pkg install python -y
pkg install git -y
pkg install wget -y
```

#### إنشاء الموقع

###### إنشاء المجلد الرئيسي
```bash
mkdir -p ~/pomodoro-timer
cd ~/pomodoro-timer
```

##### إنشاء ملف: pomo.html
```bash
nano pomo.html
```
###### كود html
```html
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Mini Pomodoro</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background: #2e3440;
            color: #d8dee9;
            padding: 8px;
            width: 100%;
            height: 100%;
            overflow: hidden;
        }
        
        .container {
            width: 100%;
            height: 100%;
            display: flex;
            flex-direction: column;
        }
        
        .timer-display {
            flex: 1;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            position: relative;
        }
        
        .time {
            font-size: 32px;
            font-weight: bold;
            font-family: 'Courier New', monospace;
            letter-spacing: 2px;
            margin-bottom: 8px;
        }
        
        .status {
            font-size: 12px;
            padding: 4px 10px;
            border-radius: 10px;
            font-weight: 600;
            text-transform: uppercase;
        }
        
        .status.work {
            background: #bf616a;
            color: white;
        }
        
        .status.break {
            background: #a3be8c;
            color: #2e3440;
        }
        
        .controls {
            display: flex;
            gap: 6px;
            justify-content: center;
            margin-top: 4px;
        }
        
        .btn {
            padding: 6px 12px;
            border: none;
            border-radius: 6px;
            font-size: 12px;
            font-weight: 600;
            cursor: pointer;
            transition: all 0.2s;
            flex: 1;
            text-align: center;
        }
        
        .btn-start {
            background: #5e81ac;
            color: white;
        }
        
        .btn-reset {
            background: #b48ead;
            color: white;
        }
        
        .btn:hover {
            opacity: 0.9;
            transform: translateY(-1px);
        }
        
        .progress {
            height: 3px;
            background: #4c566a;
            border-radius: 2px;
            margin: 4px 0;
            overflow: hidden;
        }
        
        .progress-bar {
            height: 100%;
            background: #88c0d0;
            width: 0%;
            transition: width 1s linear;
        }
        
        .quick-controls {
            display: flex;
            justify-content: space-between;
            margin-top: 6px;
            font-size: 11px;
        }
        
        .mode-btn {
            background: #434c5e;
            color: #d8dee9;
            border: none;
            padding: 4px 8px;
            border-radius: 4px;
            cursor: pointer;
            font-size: 11px;
        }
        
        .mode-btn.active {
            background: #5e81ac;
            color: white;
        }
        
        .hidden {
            display: none;
        }
        
        .settings-panel {
            position: absolute;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: #2e3440;
            padding: 10px;
            z-index: 10;
        }
        
        .setting-row {
            margin: 8px 0;
            font-size: 12px;
        }
        
        .setting-row label {
            display: block;
            margin-bottom: 4px;
            color: #81a1c1;
        }
        
        .setting-row input {
            width: 100%;
            padding: 4px;
            background: #3b4252;
            border: 1px solid #4c566a;
            border-radius: 4px;
            color: #d8dee9;
        }
        
        .close-settings {
            position: absolute;
            top: 5px;
            right: 5px;
            background: none;
            border: none;
            color: #81a1c1;
            cursor: pointer;
            font-size: 16px;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="timer-display">
            <div class="time" id="time">25:00</div>
            <div class="status work" id="status">WORK</div>
            
            <div class="progress">
                <div class="progress-bar" id="progressBar"></div>
            </div>
            
            <div class="controls">
                <button class="btn btn-start" id="startPauseBtn">▶</button>
                <button class="btn btn-reset" id="resetBtn">↺</button>
            </div>
            
            <div class="quick-controls">
                <button class="mode-btn active" id="workBtn">Work</button>
                <button class="mode-btn" id="breakBtn">Break</button>
                <button class="mode-btn" id="settingsBtn">⚙️</button>
            </div>
        </div>
        
        <div class="settings-panel hidden" id="settingsPanel">
            <button class="close-settings" id="closeSettings">×</button>
            
            <div class="setting-row">
                <label for="workDuration">Work (minutes):</label>
                <input type="number" id="workDuration" min="1" max="60" value="25">
            </div>
            
            <div class="setting-row">
                <label for="breakDuration">Break (minutes):</label>
                <input type="number" id="breakDuration" min="1" max="30" value="5">
            </div>
            
            <div class="setting-row">
                <label for="autoSwitch">Auto switch:</label>
                <select id="autoSwitch" style="width: 100%; padding: 4px; background: #3b4252; border: 1px solid #4c566a; border-radius: 4px; color: #d8dee9;">
                    <option value="yes">Yes</option>
                    <option value="no">No</option>
                </select>
            </div>
            
            <button class="btn btn-start" id="saveSettings" style="margin-top: 10px;">Save</button>
        </div>
    </div>

    <script>
        // Timer configuration
        let config = {
            workTime: 25 * 60, // 25 minutes in seconds
            breakTime: 5 * 60,  // 5 minutes in seconds
            autoSwitch: true
        };
        
        // Timer state
        let timeLeft = config.workTime;
        let isRunning = false;
        let isWorkTime = true;
        let totalTime = config.workTime;
        let timerInterval = null;
        
        // DOM Elements
        const timeDisplay = document.getElementById('time');
        const statusDisplay = document.getElementById('status');
        const progressBar = document.getElementById('progressBar');
        const startPauseBtn = document.getElementById('startPauseBtn');
        const resetBtn = document.getElementById('resetBtn');
        const workBtn = document.getElementById('workBtn');
        const breakBtn = document.getElementById('breakBtn');
        const settingsBtn = document.getElementById('settingsBtn');
        const settingsPanel = document.getElementById('settingsPanel');
        const closeSettings = document.getElementById('closeSettings');
        const saveSettings = document.getElementById('saveSettings');
        const workDurationInput = document.getElementById('workDuration');
        const breakDurationInput = document.getElementById('breakDuration');
        const autoSwitchSelect = document.getElementById('autoSwitch');
        
        // Format time as MM:SS
        function formatTime(seconds) {
            const mins = Math.floor(seconds / 60);
            const secs = seconds % 60;
            return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
        }
        
        // Update display
        function updateDisplay() {
            timeDisplay.textContent = formatTime(timeLeft);
            
            // Update progress bar
            const progress = ((totalTime - timeLeft) / totalTime) * 100;
            progressBar.style.width = `${progress}%`;
            
            // Update status
            if (isWorkTime) {
                statusDisplay.textContent = 'WORK';
                statusDisplay.className = 'status work';
                workBtn.classList.add('active');
                breakBtn.classList.remove('active');
            } else {
                statusDisplay.textContent = 'BREAK';
                statusDisplay.className = 'status break';
                breakBtn.classList.add('active');
                workBtn.classList.remove('active');
            }
        }
        
        // Start timer
        function startTimer() {
            if (isRunning) return;
            
            isRunning = true;
            
            timerInterval = setInterval(() => {
                timeLeft--;
                
                if (timeLeft <= 0) {
                    clearInterval(timerInterval);
                    
                    if (config.autoSwitch) {
                        // Switch modes
                        if (isWorkTime) {
                            switchToBreak();
                        } else {
                            switchToWork();
                        }
                        startTimer();
                    } else {
                        // Just stop
                        isRunning = false;
                        startPauseBtn.textContent = '▶';
                    }
                }
                
                updateDisplay();
            }, 1000);
        }
        
        // Pause timer
        function pauseTimer() {
            if (!isRunning) return;
            
            isRunning = false;
            clearInterval(timerInterval);
        }
        
        // Toggle timer (start/pause)
        function toggleTimer() {
            if (!isRunning) {
                startTimer();
                startPauseBtn.textContent = '⏸';
            } else {
                pauseTimer();
                startPauseBtn.textContent = '▶';
            }
        }
        
        // Reset timer
        function resetTimer() {
            pauseTimer();
            startPauseBtn.textContent = '▶';
            if (isWorkTime) {
                timeLeft = config.workTime;
                totalTime = config.workTime;
            } else {
                timeLeft = config.breakTime;
                totalTime = config.breakTime;
            }
            updateDisplay();
        }
        
        // Switch to work mode
        function switchToWork() {
            isWorkTime = true;
            timeLeft = config.workTime;
            totalTime = config.workTime;
            updateDisplay();
        }
        
        // Switch to break mode
        function switchToBreak() {
            isWorkTime = false;
            timeLeft = config.breakTime;
            totalTime = config.breakTime;
            updateDisplay();
        }
        
        // Load settings from localStorage
        function loadSettings() {
            const saved = localStorage.getItem('pomodoroConfig');
            if (saved) {
                config = JSON.parse(saved);
                workDurationInput.value = config.workTime / 60;
                breakDurationInput.value = config.breakTime / 60;
                autoSwitchSelect.value = config.autoSwitch ? 'yes' : 'no';
            }
        }
        
        // Save settings
        function saveSettingsToStorage() {
            config.workTime = parseInt(workDurationInput.value) * 60;
            config.breakTime = parseInt(breakDurationInput.value) * 60;
            config.autoSwitch = autoSwitchSelect.value === 'yes';
            
            localStorage.setItem('pomodoroConfig', JSON.stringify(config));
            
            // Update current timer if needed
            if (isWorkTime) {
                totalTime = config.workTime;
                timeLeft = config.workTime;
            } else {
                totalTime = config.breakTime;
                timeLeft = config.breakTime;
            }
            
            // Reset button icon
            startPauseBtn.textContent = '▶';
            
            updateDisplay();
            settingsPanel.classList.add('hidden');
        }
        
        // Event Listeners
        startPauseBtn.addEventListener('click', toggleTimer);
        resetBtn.addEventListener('click', resetTimer);
        
        workBtn.addEventListener('click', () => {
            pauseTimer();
            startPauseBtn.textContent = '▶';
            switchToWork();
        });
        
        breakBtn.addEventListener('click', () => {
            pauseTimer();
            startPauseBtn.textContent = '▶';
            switchToBreak();
        });
        
        settingsBtn.addEventListener('click', () => {
            settingsPanel.classList.remove('hidden');
        });
        
        closeSettings.addEventListener('click', () => {
            settingsPanel.classList.add('hidden');
        });
        
        saveSettings.addEventListener('click', saveSettingsToStorage);
        
        // Save settings on Enter key in inputs
        workDurationInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') saveSettingsToStorage();
        });
        
        breakDurationInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') saveSettingsToStorage();
        });
        
        // Initialize
        function init() {
            loadSettings();
            if (isWorkTime) {
                timeLeft = config.workTime;
                totalTime = config.workTime;
            } else {
                timeLeft = config.breakTime;
                totalTime = config.breakTime;
            }
            updateDisplay();
        }
        
        init();
    </script>
</body>
</html>
```

##### إنشاء ملف server.py
```bash
nano server.py
```
###### كود python 
```python
import http.server
import socketserver
import os
import sys

class CORSRequestHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        # Allow iframe embedding
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('X-Frame-Options', 'ALLOWALL')
        super().end_headers()

if __name__ == '__main__':
    PORT = 8080
    DIRECTORY = os.path.dirname(os.path.abspath(__file__))
    
    # Change to the directory containing pomo.html
    os.chdir(DIRECTORY)
    
    with socketserver.TCPServer(("", PORT), CORSRequestHandler) as httpd:
        print(f"🚀 Server running at:")
        print(f"   Local: http://localhost:{PORT}")
        print(f"   Network: http://{socket.gethostname()}:{PORT}")
        print(f"   For Obsidian: http://YOUR_IP_ADDRESS:{PORT}")
        print("\n📱 To get your IP address in Termux, run: ip addr show")
        print("📋 Press Ctrl+C to stop the server")
        
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\n👋 Server stopped")
```

##### إنشاء ملف: start-server.sh
```bash
nano start-server.sh
```

###### سكربت الكود
```bash
#!/data/data/com.termux/files/usr/bin/bash
cd ~/pomodoro-timer
python -m http.server 8080 > /dev/null 2>&1 &
```

##### تشغيل السيرفر
```bash
./start-server.sh
```
##### تفعيلها واستخدامها مع اوبسيديان 
```html
<iframe src= "http://localhost:8080/pomo.html" style="width: 100%; height: 100%"></iframe> 
```
##### كامل الأوامر دفعة واحدة (نسخة قصيرة)

```bash
pkg update && pkg upgrade -y
pkg install python git wget -y
mkdir -p ~/pomodoro-timer
cd ~/pomodoro-timer
```

```bash
nano pomo.html 
```
![[Termux commands Pomo#كود html]]
```bash
nano server.py
```
![[Termux commands Pomo#كود python]]
```bash
nano start-server.sh
```
![[Termux commands Pomo#سكربت الكود]]