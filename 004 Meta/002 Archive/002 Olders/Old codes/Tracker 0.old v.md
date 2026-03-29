# Tracker Read Quran 

- ```tracker
  searchType: frontmatter
  searchTarget: Read Quran
  folder: "003 Daily"
  datasetName: الأيام التي قرأت فيهم القرآن
  fixedScale: 0.6
  month:
      color: steelblue
      todayRingColor: none

- ```tracker
  searchType: frontmatter
  searchTarget: The number of pages you finished reading from the Quran
  folder: "003 Daily/001 Active Diaries"
  fixedScale: 0.6
  line:
     yAxisLabel: pages
     fillGap: true
     title: مخطط عدد الصفحات التي أقرأها يوميا من القرآن
     yMin: 0
     showLegend: false


-  ```tracker
   searchType: frontmatter
   searchTarget: The number of pages you finished reading from the Quran
   folder: "003 Daily/001 Active Diaries"
   fixedScale: 0.3
   summary:
     template: "أقصى عدد:  {{max()::i}} صفحة تمت قراءتها في اليوم\nالمتوسط:  {{average()::i}} صفحة يوميا\nأصغر عدد:  {{min()::i}} صفحة تمت قراءتها في اليوم\nالمجموع : {{sum()::i}}صفحة من القرآن الكريم"
     style:

- ```tracker
  searchType: frontmatter
  searchTarget: The number of pages you finished reading from the Quran
  folder: "003 Daily/001 Active Diaries"
  fixedScale: 0.6
  bullet: 
      title: عدد الصفحات التي قرأتها من القرآن هذا الشهر
      orientation: vertical
      value: "{{sum()::i}}"
      valueColor: steelblue
      range: [604 → ]
      showMarker: true 
      rangeColor: '#17202A'
      markerValue: 1```
# Tracker Memorizing the Quran
- ```tracker
  searchType: frontmatter
  searchTarget: Memorizing the Quran
  folder: "003 Daily"
  datasetName: الأيام التي حفظت فيهم القرآن
  fixedScale: 0.6
  month:
      color: steelblue
      todayRingColor: none

- ```tracker
  searchType: frontmatter
  searchTarget: 
  folder: "003 Daily"
  fixedScale: 0.7
  line:
     yAxisLabel: pages
     fillGap: true
     title: مخطط عدد الصفحات التي حفظتها يوميا من القرآن
     yMin: 0
     showLegend: false

-   ```tracker
   searchType: frontmatter
   searchTarget: The number of pages you have memorized from the Quran
   folder: "003 Daily"
   summary:
     template: "أقصى عدد:  {{max()::i}} صفحة تم حفظها في اليوم\nالمتوسط:  {{average()::i}} صفحة يوميا\nأصغر عدد:  {{min()::i}} صفحة تم حفظها في اليوم\nالمجموع : {{sum()}} صفحة من القرآن الكريم "
     

- ```tracker
  searchType: frontmatter
  searchTarget: The number of pages you have memorized from the Quran
  folder: "003 Daily"
  fixedScale: 0.8
  bullet: 
      title: عدد الصفحات التي حفظتها من القرآن 
      orientation: vertical
      value: "{{sum()::i}}"
      valueColor: steelblue
      range: [604 → ]
      showMarker: true 
      rangeColor: '#17202A'
      markerValue: 1```
# Tracker Islamic
![[Tracker B]]