---
banner: https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcT04Qfg17fYOhAm0JdPEKF75zJAlvXtBwENt_MzslXpSw&s=10
icon: lucide-line-chart
cssclasses:
  - card
  - center-title
  - dashboard
  - no-plus
links pages:
  - "[[Tracker B]]"
node_size: 15
ui: preview-force
---
# Tracker Read Quran

```dataviewjs
/******************************************************************
  QURAN DASHBOARD – FULL FINAL VERSION WITH CONNECTORS
******************************************************************/

let dashboard = dv.el("div","");
dashboard.className = "quran-dashboard-layout";

/* ========================= CSS ========================= */

dashboard.innerHTML = `
<style>
.quran-dashboard-layout{
  width:100%;
  max-width:100%;
  display:grid;
  grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
  gap:20px;
  align-items:start;
}

.quran-dashboard-layout > .q-box{
  min-width:0;
}

@media (max-width:1200px){
  .quran-dashboard-layout{
    grid-template-columns: 1fr 1fr;
  }
}

.q-box{
  padding:15px;
  background:var(--background-primary);
  border-radius:12px;
}

/* ================= MONTH TRACKER WITH CONNECTORS ================= */

.q-month-header{
  display:flex;
  justify-content:space-between;
  align-items:center;
  color:steelblue;
  font-weight:bold;
  font-size:1.1em;
  margin-bottom:10px;
}

.q-month-header span{
  cursor:pointer;
  user-select:none;
}

.q-weekdays{
  display:grid;
  grid-template-columns:repeat(7,1fr);
  text-align:center;
  font-size:.75em;
  color:var(--text-muted);
  margin-bottom:5px;
}

.q-days-grid{
  display:grid;
  grid-template-columns:repeat(7,1fr);
  gap:5px;
  position:relative;
}

.q-day{
  aspect-ratio:1;
  display:flex;
  align-items:center;
  justify-content:center;
  background:var(--background-secondary);
  border-radius:50%;
  font-size:.75em;
  position:relative;
  z-index:2;
}

.q-day.read{
  background:steelblue;
  color:white;
}

.q-day.out-of-month{
  opacity:0.3;
}

/* خطوط التوصيل بين الأيام */
.q-connector {
  position:absolute;
  height:3px;
  background:steelblue;
  opacity:0.6;
  z-index:1;
  pointer-events:none;
  transform-origin:0 0;
}

/* ================= DOTS CHART (نفس الكود السابق) ================= */

.q-chart-title{
  text-align:center;
  font-weight:bold;
  margin-bottom:10px;
}

.q-dots-wrapper{
  position:relative;
  height:240px;
  border-left:1px solid var(--background-modifier-border);
  border-bottom:1px solid var(--background-modifier-border);
}

.q-y-axis{
  position:absolute;
  left:-35px;
  top:0;
  height:100%;
  display:flex;
  flex-direction:column;
  justify-content:space-between;
  font-size:10px;
  color:var(--text-muted);
}

.q-grid-line{
  position:absolute;
  width:100%;
  height:1px;
  background:var(--background-modifier-border);
}

.q-dots-grid{
  position:relative;
  width:100%;
  height:100%;
}

.q-line{
  position:absolute;
  height:2px;
  background:steelblue;
  transform-origin:0 0;
  opacity:.6;
  pointer-events:none;
}

.q-dot{
  position:absolute;
  width:8px;
  height:8px;
  background:steelblue;
  border-radius:50%;
  transform:translate(-50%,-50%);
  cursor:pointer;
  transition:.15s;
  box-shadow:0 0 5px rgba(70,130,180,.5);
}

.q-dot:hover{
  transform:translate(-50%,-50%) scale(1.3);
}

.q-dot.active{
  background:#e74c3c;
  transform:translate(-50%,-50%) scale(1.4);
  box-shadow:0 0 10px rgba(231,76,60,.7);
  z-index:5;
}

.q-tooltip{
  position:absolute;
  background:var(--background-secondary);
  padding:4px 8px;
  border-radius:4px;
  font-size:11px;
  white-space:nowrap;
  box-shadow:0 2px 8px rgba(0,0,0,.25);
  z-index:10;
}

.q-axis-x{
  display:flex;
  justify-content:space-between;
  margin-top:6px;
  font-size:10px;
  color:var(--text-muted);
}

/* ================= BULLET ================= */

.q-bullet-title{
  text-align:center;
  font-weight:bold;
  margin-bottom:10px;
}

.q-bullet-container{
  height:25px;
  background:#17202A;
  border-radius:6px;
  overflow:hidden;
}

.q-bullet-bar{
  height:100%;
  background:steelblue;
}

.q-bullet-stats{
  display:flex;
  justify-content:space-between;
  margin-top:10px;
  font-size:.8em;
  color:var(--text-muted);
}
</style>
`;

/* =================================================
   1️⃣ MONTH TRACKER WITH CONNECTORS
================================================= */

const monthFolder = '"003 Daily"';
const monthPages = dv.pages(monthFolder).where(p=>p["Read Quran"]!=null);

let readData={};
monthPages.forEach(p=>{
  readData[p.file.name]=p["Read Quran"]===true?1:0;
});

let currentMonth = dv.date("today");
let monthBox = dashboard.createDiv({cls:"q-box"});

let header = monthBox.createDiv({cls:"q-month-header"});
let prev = header.createSpan({text:"←"});
let title = header.createSpan({});
let next = header.createSpan({text:"→"});

let weekdays = monthBox.createDiv({cls:"q-weekdays"});
["Sun","Mon","Tue","Wed","Thu","Fri","Sat"].forEach(d=>weekdays.createSpan({text:d}));

let gridContainer = monthBox.createDiv({cls:"q-days-grid", attr: {id: "days-grid"}});

function renderMonth() {
  gridContainer.innerHTML = "";
  title.textContent = currentMonth.toFormat("MMMM yyyy");

  let start = currentMonth.startOf("month");
  let end = currentMonth.endOf("month");
  let day = start.startOf("week");
  
  let dayElements = [];
  let dayObjects = [];

  // إنشاء الأيام
  while (day <= end || dayElements.length < 42) {
    let dateStr = day.toFormat("yyyy-MM-dd");
    let isRead = readData[dateStr] === 1;
    let inMonth = day.month === currentMonth.month;
    
    let dayDiv = gridContainer.createDiv({
      cls: `q-day ${isRead ? "read" : ""} ${!inMonth ? "out-of-month" : ""}`,
      text: day.day.toString(),
      attr: {
        'data-date': dateStr,
        'data-read': isRead ? 'true' : 'false',
        'data-in-month': inMonth ? 'true' : 'false'
      }
    });
    
    dayElements.push(dayDiv);
    dayObjects.push({
      element: dayDiv,
      date: day,
      dateStr: dateStr,
      isRead: isRead,
      inMonth: inMonth,
      index: dayElements.length - 1
    });
    
    day = day.plus({days: 1});
  }

// رسم خطوط التوصيل بين الأيام الناجحة المتتالية - فقط في نفس السطر
setTimeout(() => {
  for (let i = 0; i < dayObjects.length - 1; i++) {
    let current = dayObjects[i];
    let next = dayObjects[i + 1];
    
    // التحقق مما إذا كان اليومان في نفس الأسبوع (نفس الصف في الشبكة)
    // الأيام في نفس السطر إذا كان مؤشرها modulo 7 لا يساوي 6 (آخر يوم في السطر)
    let currentRow = Math.floor(i / 7);
    let nextRow = Math.floor((i + 1) / 7);
    
    // شرط التوصيل: 
    // 1. كلاهما في الشهر الحالي
    // 2. كلاهما ناجح (true)
    // 3. في نفس الصف (نفس الأسبوع) - أي أن currentRow === nextRow
    if (current.inMonth && next.inMonth && current.isRead && next.isRead && currentRow === nextRow) {
      let currentRect = current.element.getBoundingClientRect();
      let nextRect = next.element.getBoundingClientRect();
      let containerRect = gridContainer.getBoundingClientRect();
      
      // حساب النقاط بالنسبة للحاوية
      let x1 = currentRect.left + currentRect.width / 2 - containerRect.left;
      let y1 = currentRect.top + currentRect.height / 2 - containerRect.top;
      let x2 = nextRect.left + nextRect.width / 2 - containerRect.left;
      let y2 = nextRect.top + nextRect.height / 2 - containerRect.top;
      
      // حساب المسافة والزاوية
      let dx = x2 - x1;
      let dy = y2 - y1;
      let distance = Math.sqrt(dx * dx + dy * dy);
      let angle = Math.atan2(dy, dx) * 180 / Math.PI;
      
      // إنشاء خط التوصيل
      let connector = document.createElement("div");
      connector.className = "q-connector";
      connector.style.position = "absolute";
      connector.style.left = x1 + "px";
      connector.style.top = y1 + "px";
      connector.style.width = distance + "px";
      connector.style.height = "3px";
      connector.style.background = "steelblue";
      connector.style.transform = `rotate(${angle}deg)`;
      connector.style.transformOrigin = "0 0";
      connector.style.opacity = "0.6";
      connector.style.borderRadius = "2px";
      connector.style.pointerEvents = "none";
      connector.style.zIndex = "1";
      
      gridContainer.appendChild(connector);
    }
  }
}, 10);
}

prev.onclick = () => {
  currentMonth = currentMonth.minus({months: 1});
  renderMonth();
};

next.onclick = () => {
  currentMonth = currentMonth.plus({months: 1});
  renderMonth();
};

renderMonth();

// إعادة رسم الخطوط عند تغيير حجم النافذة
let resizeTimeout;
window.addEventListener('resize', () => {
  clearTimeout(resizeTimeout);
  resizeTimeout = setTimeout(() => {
    renderMonth();
  }, 100);
});

/* =================================================
   2️⃣ DOTS CHART (نفس الكود السابق)
================================================= */

const folder = '"003 Daily/001 Active Diaries"';
const pages = dv.pages(folder)
  .where(p=>p["Number of Pages (reading)"]!=null)
  .sort(p=>p.file.name);

let dates=[], values=[];
pages.forEach(p=>{
  dates.push(p.file.name);
  values.push(p["Number of Pages (reading)"]);
});

let chartBox=dashboard.createDiv({cls:"q-box"});
chartBox.createDiv({cls:"q-chart-title",text:"مسيرتي في ختم القرآن"});

let dotsWrapper=chartBox.createDiv({cls:"q-dots-wrapper"});
let gridDots=dotsWrapper.createDiv({cls:"q-dots-grid"});

let maxValue=Math.max(...values,1);

for(let i=0;i<=5;i++){
  dotsWrapper.createDiv({cls:"q-grid-line",attr:{style:`top:${(i/5)*100}%`}});
}

let yAxis=dotsWrapper.createDiv({cls:"q-y-axis"});
for(let i=5;i>=0;i--){
  yAxis.createSpan({text:Math.round((i/5)*maxValue)});
}

let minDate=dates.length?new Date(dates[0]):new Date();
let maxDate=dates.length?new Date(dates[dates.length-1]):new Date();
let range=maxDate-minDate||1;

let selected=null, tooltip=null;

function renderChart(){
  const rect=dotsWrapper.getBoundingClientRect();
  const w=rect.width;
  const h=rect.height;

  gridDots.innerHTML="";
  if(tooltip){tooltip.remove(); tooltip=null;}
  selected=null;

  let pts=values.map((v,i)=>{
    let d=new Date(dates[i]);
    return{
      x:((d-minDate)/range)*w,
      y:h-(v/maxValue)*h,
      val:v,
      date:dates[i]
    };
  });

  for(let i=0;i<pts.length-1;i++){
    let p1=pts[i], p2=pts[i+1];
    let dx=p2.x-p1.x;
    let dy=p2.y-p1.y;
    let dist=Math.sqrt(dx*dx+dy*dy);
    let angle=Math.atan2(dy,dx)*180/Math.PI;

    let line=document.createElement("div");
    line.className="q-line";
    line.style.left=p1.x+"px";
    line.style.top=p1.y+"px";
    line.style.width=dist+"px";
    line.style.transform="rotate("+angle+"deg)";
    gridDots.appendChild(line);
  }

  pts.forEach(p=>{
    let dot=document.createElement("div");
    dot.className="q-dot";
    dot.style.left=p.x+"px";
    dot.style.top=p.y+"px";

    dot.onclick=()=>{
      if(selected===dot){
        dot.classList.remove("active");
        if(tooltip){tooltip.remove();tooltip=null;}
        selected=null;
        return;
      }

      if(selected)selected.classList.remove("active");
      if(tooltip)tooltip.remove();

      dot.classList.add("active");
      selected=dot;

      tooltip=document.createElement("div");
      tooltip.className="q-tooltip";
      tooltip.innerText=`${p.date} : ${p.val} صفحة`;
      tooltip.style.left=(p.x+10)+"px";
      tooltip.style.top=(p.y-28)+"px";
      gridDots.appendChild(tooltip);
    };

    gridDots.appendChild(dot);
  });
}

requestAnimationFrame(renderChart);
new ResizeObserver(()=>renderChart()).observe(dotsWrapper);

/* محور X */
let xAxis=chartBox.createDiv({cls:"q-axis-x"});
if(dates.length){
  xAxis.createSpan({text:dates[0]});
  if(dates.length>2)
    xAxis.createSpan({text:dates[Math.floor(dates.length/2)]});
  xAxis.createSpan({text:dates[dates.length-1]});
}

/* =================================================
   3️⃣ BULLET CHART
================================================= */

let bulletBox=dashboard.createDiv({cls:"q-box"});
bulletBox.createDiv({cls:"q-bullet-title",text:"التقدم في ختم كتاب ربي"});

let monthStart=currentMonth.startOf("year");
let monthEnd=currentMonth.endOf("year");

let monthPages2=pages.where(p=>
  p.file.name>=monthStart.toFormat("yyyy-MM-dd") &&
  p.file.name<=monthEnd.toFormat("yyyy-MM-dd")
);

let total=0;
monthPages2.forEach(p=>{
  total+=p["Number of Pages (reading)"]||0;
});

let target=604;
let percent=Math.min((total/target)*100,100);

let barContainer=bulletBox.createDiv({cls:"q-bullet-container"});
barContainer.createDiv({
  cls:"q-bullet-bar",
  attr:{style:`width:${percent}%`}
});

let stats=bulletBox.createDiv({cls:"q-bullet-stats"});
stats.createSpan({text:`المجموع: ${total}`});
stats.createSpan({text:`${percent.toFixed(1)}%`});
```

# Tracker Memorizing the Quran

```dataviewjs
/******************************************************************
  QURAN DASHBOARD – MEMORIZING WITH CONNECTORS
******************************************************************/

let dashboard = dv.el("div","");
dashboard.className = "quran-dashboard-layout";

/* ========================= CSS ========================= */

dashboard.innerHTML = `
<style>
.quran-dashboard-layout{
  width:100%;
  max-width:100%;
  display:grid;
  grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
  gap:20px;
  align-items:start;
}

.quran-dashboard-layout > .q-box{
  min-width:0;
}

@media (max-width:1200px){
  .quran-dashboard-layout{
    grid-template-columns: 1fr 1fr;
  }
}

.q-box{
  padding:15px;
  background:var(--background-primary);
  border-radius:12px;
}

/* ================= MONTH TRACKER WITH CONNECTORS ================= */

.q-month-header{
  display:flex;
  justify-content:space-between;
  align-items:center;
  color:steelblue;
  font-weight:bold;
  font-size:1.1em;
  margin-bottom:10px;
}

.q-month-header span{
  cursor:pointer;
  user-select:none;
}

.q-weekdays{
  display:grid;
  grid-template-columns:repeat(7,1fr);
  text-align:center;
  font-size:.75em;
  color:var(--text-muted);
  margin-bottom:5px;
}

.q-days-grid{
  display:grid;
  grid-template-columns:repeat(7,1fr);
  gap:5px;
  position:relative;
}

.q-day{
  aspect-ratio:1;
  display:flex;
  align-items:center;
  justify-content:center;
  background:var(--background-secondary);
  border-radius:50%;
  font-size:.75em;
  position:relative;
  z-index:2;
}

.q-day.read{
  background:steelblue;
  color:white;
}

.q-day.out-of-month{
  opacity:0.3;
}

/* خطوط التوصيل بين الأيام */
.q-connector {
  position:absolute;
  height:3px;
  background:steelblue;
  opacity:0.6;
  z-index:1;
  pointer-events:none;
  transform-origin:0 0;
}

/* ================= باقي الأنماط (نفس السابق) ================= */
.q-chart-title{
  text-align:center;
  font-weight:bold;
  margin-bottom:10px;
}

.q-dots-wrapper{
  position:relative;
  height:240px;
  border-left:1px solid var(--background-modifier-border);
  border-bottom:1px solid var(--background-modifier-border);
}

.q-y-axis{
  position:absolute;
  left:-35px;
  top:0;
  height:100%;
  display:flex;
  flex-direction:column;
  justify-content:space-between;
  font-size:10px;
  color:var(--text-muted);
}

.q-grid-line{
  position:absolute;
  width:100%;
  height:1px;
  background:var(--background-modifier-border);
}

.q-dots-grid{
  position:relative;
  width:100%;
  height:100%;
}

.q-line{
  position:absolute;
  height:2px;
  background:steelblue;
  transform-origin:0 0;
  opacity:.6;
  pointer-events:none;
}

.q-dot{
  position:absolute;
  width:8px;
  height:8px;
  background:steelblue;
  border-radius:50%;
  transform:translate(-50%,-50%);
  cursor:pointer;
  transition:.15s;
  box-shadow:0 0 5px rgba(70,130,180,.5);
}

.q-dot:hover{
  transform:translate(-50%,-50%) scale(1.3);
}

.q-dot.active{
  background:#e74c3c;
  transform:translate(-50%,-50%) scale(1.4);
  box-shadow:0 0 10px rgba(231,76,60,.7);
  z-index:5;
}

.q-tooltip{
  position:absolute;
  background:var(--background-secondary);
  padding:4px 8px;
  border-radius:4px;
  font-size:11px;
  white-space:nowrap;
  box-shadow:0 2px 8px rgba(0,0,0,.25);
  z-index:10;
}

.q-axis-x{
  display:flex;
  justify-content:space-between;
  margin-top:6px;
  font-size:10px;
  color:var(--text-muted);
}

.q-bullet-title{
  text-align:center;
  font-weight:bold;
  margin-bottom:10px;
}

.q-bullet-container{
  height:25px;
  background:#17202A;
  border-radius:6px;
  overflow:hidden;
}

.q-bullet-bar{
  height:100%;
  background:steelblue;
}

.q-bullet-stats{
  display:flex;
  justify-content:space-between;
  margin-top:10px;
  font-size:.8em;
  color:var(--text-muted);
}
</style>
`;

/* =================================================
   1️⃣ MONTH TRACKER WITH CONNECTORS (MEMORIZING)
================================================= */

const monthFolder = '"003 Daily"';
const monthPages = dv.pages(monthFolder).where(p=>p["Memorizing the Quran"]!=null);

let readData={};
monthPages.forEach(p=>{
  readData[p.file.name]=p["Memorizing the Quran"]===true?1:0;
});

let currentMonth = dv.date("today");
let monthBox = dashboard.createDiv({cls:"q-box"});

let header = monthBox.createDiv({cls:"q-month-header"});
let prev = header.createSpan({text:"←"});
let title = header.createSpan({});
let next = header.createSpan({text:"→"});

let weekdays = monthBox.createDiv({cls:"q-weekdays"});
["Sun","Mon","Tue","Wed","Thu","Fri","Sat"].forEach(d=>weekdays.createSpan({text:d}));

let gridContainer = monthBox.createDiv({cls:"q-days-grid", attr: {id: "days-grid"}});

function renderMonth() {
  gridContainer.innerHTML = "";
  title.textContent = currentMonth.toFormat("MMMM yyyy");

  let start = currentMonth.startOf("month");
  let end = currentMonth.endOf("month");
  let day = start.startOf("week");
  
  let dayElements = [];
  let dayObjects = [];

  // إنشاء الأيام
  while (day <= end || dayElements.length < 42) {
    let dateStr = day.toFormat("yyyy-MM-dd");
    let isRead = readData[dateStr] === 1;
    let inMonth = day.month === currentMonth.month;
    
    let dayDiv = gridContainer.createDiv({
      cls: `q-day ${isRead ? "read" : ""} ${!inMonth ? "out-of-month" : ""}`,
      text: day.day.toString(),
      attr: {
        'data-date': dateStr,
        'data-read': isRead ? 'true' : 'false',
        'data-in-month': inMonth ? 'true' : 'false'
      }
    });
    
    dayElements.push(dayDiv);
    dayObjects.push({
      element: dayDiv,
      date: day,
      dateStr: dateStr,
      isRead: isRead,
      inMonth: inMonth,
      index: dayElements.length - 1
    });
    
    day = day.plus({days: 1});
  }

// رسم خطوط التوصيل بين الأيام الناجحة المتتالية - فقط في نفس السطر
setTimeout(() => {
  for (let i = 0; i < dayObjects.length - 1; i++) {
    let current = dayObjects[i];
    let next = dayObjects[i + 1];
    
    // التحقق مما إذا كان اليومان في نفس الأسبوع (نفس الصف في الشبكة)
    // الأيام في نفس السطر إذا كان مؤشرها modulo 7 لا يساوي 6 (آخر يوم في السطر)
    let currentRow = Math.floor(i / 7);
    let nextRow = Math.floor((i + 1) / 7);
    
    // شرط التوصيل: 
    // 1. كلاهما في الشهر الحالي
    // 2. كلاهما ناجح (true)
    // 3. في نفس الصف (نفس الأسبوع) - أي أن currentRow === nextRow
    if (current.inMonth && next.inMonth && current.isRead && next.isRead && currentRow === nextRow) {
      let currentRect = current.element.getBoundingClientRect();
      let nextRect = next.element.getBoundingClientRect();
      let containerRect = gridContainer.getBoundingClientRect();
      
      // حساب النقاط بالنسبة للحاوية
      let x1 = currentRect.left + currentRect.width / 2 - containerRect.left;
      let y1 = currentRect.top + currentRect.height / 2 - containerRect.top;
      let x2 = nextRect.left + nextRect.width / 2 - containerRect.left;
      let y2 = nextRect.top + nextRect.height / 2 - containerRect.top;
      
      // حساب المسافة والزاوية
      let dx = x2 - x1;
      let dy = y2 - y1;
      let distance = Math.sqrt(dx * dx + dy * dy);
      let angle = Math.atan2(dy, dx) * 180 / Math.PI;
      
      // إنشاء خط التوصيل
      let connector = document.createElement("div");
      connector.className = "q-connector";
      connector.style.position = "absolute";
      connector.style.left = x1 + "px";
      connector.style.top = y1 + "px";
      connector.style.width = distance + "px";
      connector.style.height = "3px";
      connector.style.background = "steelblue";
      connector.style.transform = `rotate(${angle}deg)`;
      connector.style.transformOrigin = "0 0";
      connector.style.opacity = "0.6";
      connector.style.borderRadius = "2px";
      connector.style.pointerEvents = "none";
      connector.style.zIndex = "1";
      
      gridContainer.appendChild(connector);
    }
  }
}, 10);
}

prev.onclick = () => {
  currentMonth = currentMonth.minus({months: 1});
  renderMonth();
};

next.onclick = () => {
  currentMonth = currentMonth.plus({months: 1});
  renderMonth();
};

renderMonth();

// إعادة رسم الخطوط عند تغيير حجم النافذة
let resizeTimeout;
window.addEventListener('resize', () => {
  clearTimeout(resizeTimeout);
  resizeTimeout = setTimeout(() => {
    renderMonth();
  }, 100);
});

/* =================================================
   2️⃣ DOTS CHART (MEMORIZING)
================================================= */

const folder = '"003 Daily/001 Active Diaries"';
const pages = dv.pages(folder)
  .where(p=>p["Number of Pages (Memorizing)"]!=null)
  .sort(p=>p.file.name);

let dates=[], values=[];
pages.forEach(p=>{
  dates.push(p.file.name);
  values.push(p["Number of Pages (Memorizing)"]);
});

let chartBox=dashboard.createDiv({cls:"q-box"});
chartBox.createDiv({cls:"q-chart-title",text:"مسيرتي في حفظ كلام ربي"});

let dotsWrapper=chartBox.createDiv({cls:"q-dots-wrapper"});
let gridDots=dotsWrapper.createDiv({cls:"q-dots-grid"});

let maxValue=Math.max(...values,1);

for(let i=0;i<=5;i++){
  dotsWrapper.createDiv({cls:"q-grid-line",attr:{style:`top:${(i/5)*100}%`}});
}

let yAxis=dotsWrapper.createDiv({cls:"q-y-axis"});
for(let i=5;i>=0;i--){
  yAxis.createSpan({text:Math.round((i/5)*maxValue)});
}

let minDate=dates.length?new Date(dates[0]):new Date();
let maxDate=dates.length?new Date(dates[dates.length-1]):new Date();
let range=maxDate-minDate||1;

let selected=null, tooltip=null;

function renderChart(){
  const rect=dotsWrapper.getBoundingClientRect();
  const w=rect.width;
  const h=rect.height;

  gridDots.innerHTML="";
  if(tooltip){tooltip.remove(); tooltip=null;}
  selected=null;

  let pts=values.map((v,i)=>{
    let d=new Date(dates[i]);
    return{
      x:((d-minDate)/range)*w,
      y:h-(v/maxValue)*h,
      val:v,
      date:dates[i]
    };
  });

  for(let i=0;i<pts.length-1;i++){
    let p1=pts[i], p2=pts[i+1];
    let dx=p2.x-p1.x;
    let dy=p2.y-p1.y;
    let dist=Math.sqrt(dx*dx+dy*dy);
    let angle=Math.atan2(dy,dx)*180/Math.PI;

    let line=document.createElement("div");
    line.className="q-line";
    line.style.left=p1.x+"px";
    line.style.top=p1.y+"px";
    line.style.width=dist+"px";
    line.style.transform="rotate("+angle+"deg)";
    gridDots.appendChild(line);
  }

  pts.forEach(p=>{
    let dot=document.createElement("div");
    dot.className="q-dot";
    dot.style.left=p.x+"px";
    dot.style.top=p.y+"px";

    dot.onclick=()=>{
      if(selected===dot){
        dot.classList.remove("active");
        if(tooltip){tooltip.remove();tooltip=null;}
        selected=null;
        return;
      }

      if(selected)selected.classList.remove("active");
      if(tooltip)tooltip.remove();

      dot.classList.add("active");
      selected=dot;

      tooltip=document.createElement("div");
      tooltip.className="q-tooltip";
      tooltip.innerText=`${p.date} : ${p.val} صفحة`;
      tooltip.style.left=(p.x+10)+"px";
      tooltip.style.top=(p.y-28)+"px";
      gridDots.appendChild(tooltip);
    };

    gridDots.appendChild(dot);
  });
}

requestAnimationFrame(renderChart);
new ResizeObserver(()=>renderChart()).observe(dotsWrapper);

/* محور X */
let xAxis=chartBox.createDiv({cls:"q-axis-x"});
if(dates.length){
  xAxis.createSpan({text:dates[0]});
  if(dates.length>2)
    xAxis.createSpan({text:dates[Math.floor(dates.length/2)]});
  xAxis.createSpan({text:dates[dates.length-1]});
}

/* =================================================
   3️⃣ BULLET CHART (MEMORIZING)
================================================= */

const bfolder = '"003 Daily"';

const bpages = dv.pages(bfolder)
  .where(p=>p["Number of Pages (Memorizing)"]!=null)
  .sort(p=>p.file.name);

let bulletBox=dashboard.createDiv({cls:"q-box"});
bulletBox.createDiv({cls:"q-bullet-title",text:"التقدم في حفظ كلام ربي"});

let yearStart=currentMonth.startOf("year");
let yearEnd=currentMonth.endOf("year");

let monthPages2=bpages.where(p=>
  p.file.name>=yearStart.toFormat("yyyy-MM-dd") &&
  p.file.name<=yearEnd.toFormat("yyyy-MM-dd")
);

let total=0;
monthPages2.forEach(p=>{
  total+=p["Number of Pages (Memorizing)"]||0;
});

let target=604;
let percent=Math.min((total/target)*100,100);

let barContainer=bulletBox.createDiv({cls:"q-bullet-container"});
barContainer.createDiv({
  cls:"q-bullet-bar",
  attr:{style:`width:${percent}%`}
});

let stats=bulletBox.createDiv({cls:"q-bullet-stats"});
stats.createSpan({text:`المجموع: ${total}`});
stats.createSpan({text:`${percent.toFixed(1)}%`});
```

# Tracker Islamic
![[Tracker B]]