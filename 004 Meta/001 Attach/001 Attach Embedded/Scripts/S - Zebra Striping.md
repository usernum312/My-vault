---
icon: lucide-list-collapse
cssclasses:
  - metadata-clean
---
```dataviewjs
const container = dv.container.closest('.zebra-tasks') || document;
const items = container.querySelectorAll('.task-list-item');
items.forEach((item, i) => {
  item.classList.remove('zebra-even', 'zebra-odd');
  item.classList.add(i % 2 === 0 ? 'zebra-even' : 'zebra-odd');
});
```