
**Plugin name:** vconsole
**Plugin url:**
1. in Obsidian: obsidian://show-plugin?id=vconsole
2. in GitHub: **[https://github.com/obsidian-vconsole](https://github.com/zhouhua/obsidian-vconsole)**

##### My edit

> Add copy all feature 
###### Location to add the code
```js
return e2.onReady = function() {
              var n3, e3;
              t2.prototype.onReady.call(this), this.model.maxLogNumber = Number(null == (n3 = this.vConsole.option.log) ? void 0 : n3.maxLogNumber) || 1e3, this.compInstance.showTimestamps = !(null == (e3 = this.vConsole.option.log) || !e3.showTimestamps);
            }, e2.onRemove = function() {
              t2.prototype.onRemove.call(this), this.model.unbindPlugin(this.id);
            }, e2.onAddTopBar = function(t3) {
              for (var n3 = this, e3 = ["All", "Log", "Info", "Warn", "Error"], o2 = [], r2 = 0; r2 < e3.length; r2++)
                o2.push({ name: e3[r2], data: { type: e3[r2].toLowerCase() }, actived: 0 === r2, className: "", onClick: function(t4, e4) {
                  if (e4.type === n3.compInstance.filterType)
                    return false;
                  n3.compInstance.filterType = e4.type;
                } });
              o2[0].className = "vc-actived", t3(o2);
            }, e2.onAddTool = function(t3) {
              var n3 = this;
              t3([{ name: "Clear", global: false, onClick: function(t4) {
                n3.model.clearPluginLog(n3.id), n3.vConsole.triggerEvent("clearLog");
              } }, { name: "Top", global: false, onClick: function(t4) {
                n3.compInstance.scrollToTop();
              } }, { name: "Bottom", global: false, onClick: function(t4) {
                n3.compInstance.scrollToBottom();
              } }
```

###### The code

```js
,{
    name: "Copy All",
    global: false,
    onClick: function(t4) {
        try {
            // الوصول إلى المكون الداخلي لـ VConsole Log
            if (n3.compInstance && n3.compInstance.$$ && n3.compInstance.$$.ctx) {
                var ctx = n3.compInstance.$$.ctx;
                // البحث عن logList في سياق المكون
                var logList = null;
                for (var i = 0; i < ctx.length; i++) {
                    if (ctx[i] && ctx[i].logList) {
                        logList = ctx[i].logList;
                        break;
                    }
                }
                
                if (logList && logList.length > 0) {
                    var text = logList.map(function(log) {
                        return log.data.map(function(item) {
                            if (typeof item.origData === 'string') return item.origData;
                            try {
                                return JSON.stringify(item.origData, null, 2);
                            } catch (e) {
                                return String(item.origData);
                            }
                        }).join(' ');
                    }).join('\n');
                    
                    navigator.clipboard.writeText(text).then(function() {
                        console.log('Logs copied successfully!');
                    }).catch(function(err) {
                        console.error('Clipboard write failed:', err);
                    });
                    return;
                }
            }
            
            // إذا فشل الوصول عبر compInstance، نجرب الطرق الأخرى
            if (n3.model && n3.model.logQueue && n3.model.logQueue.length > 0) {
                var text = n3.model.logQueue.map(function(log) {
                    return log.data.map(function(item) {
                        return item.origData;
                    }).join(' ');
                }).join('\n');
                
                navigator.clipboard.writeText(text);
                return;
            }
            
            console.warn('Could not access logs');
            
        } catch (e) {
            console.error('Error copying logs:', e);
        }
    }
```