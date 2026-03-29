---
icon: lucide-timer
aliases:
  - Pomodoro
links pages:
  - "[[Pomodoro v.internet]]"
  - "[[Pomodoro old.v]]"
cssclasses:
  - Headless
  - no-plus
---
```dataviewjs
// Create main container
const container = dv.el('div', '', {cls: 'pomodoro-container'});

// Add CSS and HTML structure
container.innerHTML = `
<style>
.pomodoro-container {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    background: #;
    opacity: 0.9 ;
    color: #d8dee9;
    padding: 8px;
    width: 100%;
    height: 148px;
    overflow: hidden;
}
.pomodoro-container .container {
    width: 100%;
    height: 100%;
    display: flex;
    flex-direction: column;
}

.pomodoro-container .timer-display {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    position: relative;
    cursor: pointer;
}

.pomodoro-container .time {
    font-size: 32px;
    font-weight: bold;
    font-family: 'Courier New', monospace;
    letter-spacing: 2px;
    margin-bottom: 8px;
    cursor: pointer;
}

.pomodoro-container .time.editing {
    border: 2px solid #88c0d0;
    border-radius: 5px;
    padding: 2px 8px;
}

.pomodoro-container .status {
    font-size: 12px;
    padding: 4px 10px;
    border-radius: 10px;
    font-weight: 600;
    text-transform: uppercase;
    cursor: pointer;
}

.pomodoro-container .status.work {
    background: #bf616a;
    color: white;
}

.pomodoro-container .status.break {
    background: #a3be8c;
    color: #2e3440;
}

.pomodoro-container .controls {
    display: flex;
    gap: 6px;
    justify-content: center;
    margin-top: 2px;
}

.pomodoro-container .btn {
    padding: 2px 12px;
    border: none;
    border-radius: 6px;
    font-size: 12px;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.2s;
    flex: 1;
    text-align: center;
}

.pomodoro-container .btn-start {
    background: #5e81ac;
    color: white;
}

.pomodoro-container .btn-reset {
    background: #b48ead;
    color: white;
}

.pomodoro-container .btn:hover {
    opacity: 0.9;
    transform: translateY(-1px);
}

.pomodoro-container .progress {
    height: 2px;
    background: #4c566a;
    border-radius: 2px;
    margin: 4px 0;
    overflow: hidden;
}

.pomodoro-container .progress-bar {
    height: 100%;
    background: #88c0d0;
    width: 0%;
    transition: width 1s linear;
}

.pomodoro-container .quick-controls {
    display: flex;
    justify-content: space-between;
    margin-top: 6px;
    font-size: 11px;
}

.pomodoro-container .mode-btn {
    background: #434c5e;
    color: #d8dee9;
    border: none;
    padding: 2px 8px;
    border-radius: 4px;
    cursor: pointer;
    font-size: 11px;
}

.pomodoro-container .mode-btn.active {
    background: #5e81ac;
    color: white;
}

.pomodoro-container .hidden {
    display: none !important;
}

.pomodoro-container .settings-panel {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: #2e3440;
    padding: 10px;
    z-index: 10;
}

.pomodoro-container .setting-row {
    margin: 2px 0;
    font-size: 12px;
}

.pomodoro-container .setting-row label {
    display: block;
    margin-bottom: 4px;
    color: #81a1c1;
}

.pomodoro-container .setting-row input,
.pomodoro-container .setting-row select {
    width: 100%;
    padding: 2px;
    background: #3b4252;
    border: 1px solid #4c566a;
    border-radius: 4px;
    color: #d8dee9;
}

.pomodoro-container .close-settings {
    position: absolute;
    top: 5px;
    right: 5px;
    background: none;
    border: none;
    color: #81a1c1;
    cursor: pointer;
    font-size: 16px;
}

.pomodoro-container .save-btn {
    width: 100%;
    padding: 2px;
    margin-top: 5px;
    background: #5e81ac;
    color: white;
    border: none;
    border-radius: 6px;
    cursor: pointer;
    font-weight: 600;
    font-size: 12px;
}

.pomodoro-container .time-input-container {
    display: flex;
    align-items: center;
    justify-content: center;
}

.pomodoro-container .time-input {
    font-size: 32px;
    font-weight: bold;
    font-family: 'Courier New', monospace;
    letter-spacing: 2px;
    background: transparent;
    color: #d8dee9;
    border: 2px solid #88c0d0;
    border-radius: 5px;
    padding: 2px 8px;
    text-align: center;
    width: 100px;
}

.pomodoro-container .colon {
    font-size: 32px;
    font-weight: bold;
    font-family: 'Courier New', monospace;
    margin: 0 2px;
}
</style>

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
            <select id="autoSwitch">
                <option value="yes">Yes</option>
                <option value="no">No</option>
            </select>
        </div>
        
        <button class="save-btn" id="saveSettings">Save</button>
    </div>
</div>
`;

// Timer configuration and state
let config = {
    workTime: 25 * 60,
    breakTime: 5 * 60,
    autoSwitch: true
};

// Timer state (will be loaded from localStorage)
let timeLeft = config.workTime;
let isRunning = false;
let isWorkTime = true;
let totalTime = config.workTime;
let isEditingTime = false;

// DOM Elements
const timeDisplay = container.querySelector('#time');
const statusDisplay = container.querySelector('#status');
const progressBar = container.querySelector('#progressBar');
const startPauseBtn = container.querySelector('#startPauseBtn');
const resetBtn = container.querySelector('#resetBtn');
const settingsPanel = container.querySelector('#settingsPanel');
const workDurationInput = container.querySelector('#workDuration');
const breakDurationInput = container.querySelector('#breakDuration');
const autoSwitchSelect = container.querySelector('#autoSwitch');
const closeSettingsBtn = container.querySelector('#closeSettings');
const saveSettingsBtn = container.querySelector('#saveSettings');

// Settings panel toggle
function toggleSettings() {
    settingsPanel.classList.toggle('hidden');
}

// Add click handler for time display to open settings
timeDisplay.addEventListener('dblclick', toggleSettings);
closeSettingsBtn.addEventListener('click', toggleSettings);

// State persistence functions
const STATE_KEY = 'obsidianPomodoroState';

function saveState() {
    try {
        const state = {
            timeLeft: timeLeft,
            isRunning: isRunning,
            isWorkTime: isWorkTime,
            totalTime: totalTime,
            workTime: config.workTime,
            breakTime: config.breakTime,
            autoSwitch: config.autoSwitch,
            lastTick: Date.now()
        };
        localStorage.setItem(STATE_KEY, JSON.stringify(state));
    } catch (e) {
        console.log("Cannot save state to localStorage");
    }
}

function loadState() {
    try {
        const saved = localStorage.getItem(STATE_KEY);
        if (!saved) return false;

        const state = JSON.parse(saved);
        
        // Restore config
        config.workTime = state.workTime || config.workTime;
        config.breakTime = state.breakTime || config.breakTime;
        config.autoSwitch = state.autoSwitch !== undefined ? state.autoSwitch : config.autoSwitch;
        
        // Restore timer state
        isWorkTime = state.isWorkTime;
        totalTime = state.totalTime;
        
        // Calculate elapsed time if timer was running
        if (state.isRunning) {
            const elapsedSeconds = Math.floor((Date.now() - state.lastTick) / 1000);
            timeLeft = Math.max(0, state.timeLeft - elapsedSeconds);
            
            // Handle possible completion while away
            if (timeLeft <= 0) {
                if (config.autoSwitch) {
                    if (isWorkTime) {
                        isWorkTime = false;
                        timeLeft = config.breakTime;
                        totalTime = config.breakTime;
                    } else {
                        isWorkTime = true;
                        timeLeft = config.workTime;
                        totalTime = config.workTime;
                    }
                } else {
                    timeLeft = 0;
                    isRunning = false;
                }
            } else {
                isRunning = true;
            }
        } else {
            timeLeft = state.timeLeft;
            isRunning = false;
        }
        
        // Update UI elements
        workDurationInput.value = config.workTime / 60;
        breakDurationInput.value = config.breakTime / 60;
        autoSwitchSelect.value = config.autoSwitch ? 'yes' : 'no';
        
        return true;
    } catch (e) {
        console.log("Cannot load state from localStorage", e);
        return false;
    }
}

// Format time
function formatTime(seconds) {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

// Update display
function updateDisplay() {
    timeDisplay.textContent = formatTime(timeLeft);
    
    const progress = ((totalTime - timeLeft) / totalTime) * 100;
    progressBar.style.width = `${progress}%`;
    
    if (isWorkTime) {
        statusDisplay.textContent = 'WORK';
        statusDisplay.className = 'status work';
    } else {
        statusDisplay.textContent = 'BREAK';
        statusDisplay.className = 'status break';
    }
}

// Clear any previous timer interval (global)
function clearGlobalInterval() {
    if (window.pomodoroInterval) {
        clearInterval(window.pomodoroInterval);
        window.pomodoroInterval = null;
    }
}

// Start timer
function startTimer() {
    if (isRunning) return;
    
    // Clear any leftover interval from a previous script run
    clearGlobalInterval();
    
    isRunning = true;
    startPauseBtn.textContent = '| |';
    saveState(); // save immediately when starting
    
    window.pomodoroInterval = setInterval(function() {
        timeLeft = timeLeft - 1;
        saveState(); // save each tick
        
        if (timeLeft <= 0) {
            clearGlobalInterval();
            isRunning = false;
            
            if (config.autoSwitch) {
                if (isWorkTime) {
                    isWorkTime = false;
                    timeLeft = config.breakTime;
                    totalTime = config.breakTime;
                } else {
                    isWorkTime = true;
                    timeLeft = config.workTime;
                    totalTime = config.workTime;
                }
                // Automatically start the next session
                startTimer();
            } else {
                startPauseBtn.textContent = '▶';
                saveState(); // save after stopping
            }
            
            updateDisplay();
            return;
        }
        
        updateDisplay();
    }, 1000);
}

// Pause timer
function pauseTimer() {
    if (!isRunning) return;
    
    isRunning = false;
    clearGlobalInterval();
    startPauseBtn.textContent = '▶';
    saveState(); // save paused state
}

// Toggle timer
function toggleTimer() {
    if (!isRunning) {
        startTimer();
    } else {
        pauseTimer();
    }
}

// Reset timer
function resetTimer() {
    pauseTimer();
    if (isWorkTime) {
        timeLeft = config.workTime;
        totalTime = config.workTime;
    } else {
        timeLeft = config.breakTime;
        totalTime = config.breakTime;
    }
    updateDisplay();
    saveState();
}

// Toggle between work and break
function toggleMode() {
    if (isRunning) return;
    
    pauseTimer();
    if (isWorkTime) {
        isWorkTime = false;
        timeLeft = config.breakTime;
        totalTime = config.breakTime;
    } else {
        isWorkTime = true;
        timeLeft = config.workTime;
        totalTime = config.workTime;
    }
    updateDisplay();
    saveState();
}

// Handle time editing
function handleTimeEdit() {
    if (isRunning || isEditingTime) return;
    
    isEditingTime = true;
    const currentMinutes = Math.floor(timeLeft / 60);
    
    // Create input container
    const inputContainer = document.createElement('div');
    inputContainer.className = 'time-input-container';
    
    // Create input field
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'time-input';
    input.value = currentMinutes.toString();
    input.maxLength = 2;
    
    // Create colon and seconds display
    const colon = document.createElement('span');
    colon.className = 'colon';
    colon.textContent = ':';
    
    const seconds = document.createElement('span');
    seconds.className = 'colon';
    seconds.textContent = '00';
    
    // Assemble the input container
    inputContainer.appendChild(input);
    inputContainer.appendChild(colon);
    inputContainer.appendChild(seconds);
    
    // Replace time display with input container
    timeDisplay.parentNode.replaceChild(inputContainer, timeDisplay);
    
    // Focus and select all text
    input.focus();
    input.select();
    
    // Handle input validation (only allow numbers)
    input.addEventListener('input', function(e) {
        // Remove any non-digit characters
        let value = this.value.replace(/\D/g, '');
        
        // Limit to 2 digits
        if (value.length > 2) {
            value = value.substring(0, 2);
        }
        
        // No automatic padding - keep as typed
        this.value = value;
    });
    
    // Handle edit completion
    function completeEdit() {
        if (!isEditingTime) return;
        
        const minutes = parseInt(input.value);
        const maxMinutes = isWorkTime ? 60 : 30;
        
        if (!isNaN(minutes) && minutes >= 1 && minutes <= maxMinutes) {
            const newTime = minutes * 60;
            
            // Update config
            if (isWorkTime) {
                config.workTime = newTime;
            } else {
                config.breakTime = newTime;
            }
            
            // Update timer state
            timeLeft = newTime;
            totalTime = newTime;
            
            // Save to localStorage
            try {
                localStorage.setItem('obsidianPomodoroConfig', JSON.stringify(config));
            } catch (e) {
                console.log("Cannot save settings to localStorage");
            }
            
            updateDisplay();
            saveState();
        } else {
            // Invalid input, revert to current time
            updateDisplay();
        }
        
        // Restore original time display
        if (inputContainer.parentNode) {
            inputContainer.parentNode.replaceChild(timeDisplay, inputContainer);
        }
        isEditingTime = false;
    }
    
    // Handle key events
    function handleKeyDown(e) {
        if (e.key === 'Enter') {
            e.preventDefault();
            completeEdit();
        } else if (e.key === 'Escape') {
            e.preventDefault();
            if (inputContainer.parentNode) {
                inputContainer.parentNode.replaceChild(timeDisplay, inputContainer);
            }
            isEditingTime = false;
        }
    }
    
    // Handle blur
    input.addEventListener('blur', completeEdit);
    input.addEventListener('keydown', handleKeyDown);
}

// Load settings from localStorage
function loadSettings() {
    // First try to load full state
    const stateLoaded = loadState();
    
    if (!stateLoaded) {
        // Fallback to old config-only loading
        try {
            const saved = localStorage.getItem('obsidianPomodoroConfig');
            if (saved) {
                const parsed = JSON.parse(saved);
                config.workTime = parsed.workTime || config.workTime;
                config.breakTime = parsed.breakTime || config.breakTime;
                config.autoSwitch = parsed.autoSwitch !== undefined ? parsed.autoSwitch : config.autoSwitch;
                
                workDurationInput.value = config.workTime / 60;
                breakDurationInput.value = config.breakTime / 60;
                autoSwitchSelect.value = config.autoSwitch ? 'yes' : 'no';
                
                // Reset timer to work time
                timeLeft = config.workTime;
                totalTime = config.workTime;
                isWorkTime = true;
                isRunning = false;
            }
        } catch (e) {
            console.log("Cannot load settings from localStorage");
        }
    }
    
    // If after loading the timer was supposed to be running, start it
    if (isRunning) {
        startTimer();
    }
}

// Save settings from panel
function saveSettingsToStorage() {
    config.workTime = parseInt(workDurationInput.value) * 60;
    config.breakTime = parseInt(breakDurationInput.value) * 60;
    config.autoSwitch = autoSwitchSelect.value === 'yes';
    
    try {
        localStorage.setItem('obsidianPomodoroConfig', JSON.stringify(config));
    } catch (e) {
        console.log("Cannot save settings to localStorage");
    }
    
    if (isWorkTime) {
        totalTime = config.workTime;
        timeLeft = config.workTime;
    } else {
        totalTime = config.breakTime;
        timeLeft = config.breakTime;
    }
    
    updateDisplay();
    settingsPanel.classList.add('hidden');
    saveState();
}

// Event listeners
startPauseBtn.addEventListener('click', toggleTimer);
resetBtn.addEventListener('click', resetTimer);
timeDisplay.addEventListener('click', handleTimeEdit);
statusDisplay.addEventListener('click', toggleMode);
saveSettingsBtn.addEventListener('click', saveSettingsToStorage);

// Initialize
function init() {
    loadSettings();
    updateDisplay();
}

init();

// Clean up interval when the container is removed
const observer = new MutationObserver(function(mutations) {
    for (var i = 0; i < mutations.length; i++) {
        var mutation = mutations[i];
        for (var j = 0; j < mutation.removedNodes.length; j++) {
            var node = mutation.removedNodes[j];
            if (node.contains && node.contains(container)) {
                clearGlobalInterval();
                observer.disconnect();
                return;
            }
        }
    }
});
observer.observe(document.body, { childList: true, subtree: true });
```