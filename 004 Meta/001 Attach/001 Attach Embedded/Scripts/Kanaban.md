---
ui: preview-force
---
```dataviewjs
const START_MARKER = "<!-- KANBAN_DATA_START";
const END_MARKER = "KANBAN_DATA_END -->";

const defaultState = {
  columns: [
    { id: "col-init-1", title: "In Progress", tasks: [] },
    { id: "col-init-2", title: "Done", tasks: [] }
  ]
};

const currentPage = dv.current();
if (!currentPage?.file?.path) {
  dv.span("");
  return;
}
const filePath = currentPage.file.path;
const boardId = "kb-instance-" + filePath.replace(/[^a-zA-Z0-9]/g, "_");

window.__kbStore = window.__kbStore || {};
if (!window.__kbStore[filePath]) {
  window.__kbStore[filePath] = {
    state: structuredClone(defaultState),
    loaded: false,
    lastSaved: "",
    saving: false
  };
}
const mem = window.__kbStore[filePath];

let draggedTask = null;
let touchState = null;

function getCurrentFile() {
  return app.vault.getAbstractFileByPath(filePath);
}

function parseStateFromContent(content) {
  const startIdx = content.lastIndexOf(START_MARKER);
  const endIdx = content.lastIndexOf(END_MARKER);
  if (startIdx === -1 || endIdx === -1 || endIdx <= startIdx) return null;
  const rawJson = content.slice(startIdx + START_MARKER.length, endIdx).trim();
  try {
    const parsed = JSON.parse(rawJson);
    return Array.isArray(parsed?.columns) ? parsed : null;
  } catch {
    return null;
  }
}

function buildHiddenBlock(data) {
  return `${START_MARKER}\n${JSON.stringify(data, null, 2)}\n${END_MARKER}`;
}

function writeBlockAtEnd(content, block) {
  const startIdx = content.lastIndexOf(START_MARKER);
  const endIdx = content.lastIndexOf(END_MARKER);
  if (startIdx !== -1 && endIdx !== -1 && endIdx > startIdx) {
    const before = content.slice(0, startIdx).trimEnd();
    return before.length > 0 ? `${before}\n\n${block}\n` : `${block}\n`;
  }
  const trimmed = content.trimEnd();
  return trimmed.length > 0 ? `${trimmed}\n\n${block}\n` : `${block}\n`;
}

async function initDataOnce() {
  if (mem.loaded) return;
  const file = getCurrentFile();
  if (!file) return;

  const content = await app.vault.read(file);
  const existing = parseStateFromContent(content);
  if (existing) {
    mem.state = existing;
    mem.lastSaved = JSON.stringify(existing);
    mem.loaded = true;
    return;
  }

  mem.state = structuredClone(defaultState);
  mem.lastSaved = JSON.stringify(mem.state);
  mem.loaded = true;

  const block = buildHiddenBlock(mem.state);
  mem.saving = true;
  try {
    await app.vault.process(file, (curr) => writeBlockAtEnd(curr, block));
  } finally {
    setTimeout(() => { mem.saving = false; }, 500);
  }
}

async function persistToFile() {
  if (!mem.loaded || mem.saving) return;
  const serialized = JSON.stringify(mem.state);
  if (serialized === mem.lastSaved) return;

  const file = getCurrentFile();
  if (!file) return;

  mem.saving = true;
  try {
    const snapshot = JSON.parse(serialized);
    const block = buildHiddenBlock(snapshot);
    await app.vault.process(file, (content) => writeBlockAtEnd(content, block));
    mem.lastSaved = serialized;
  } finally {
    setTimeout(() => { mem.saving = false; }, 500);
  }
}

if (!window.__kbSyncHooksBound) {
  window.__kbSyncHooksBound = true;
  app.workspace.on("active-leaf-change", () => {
    Object.keys(window.__kbStore).forEach((p) => {
      const entry = window.__kbStore[p];
      const f = app.vault.getAbstractFileByPath(p);
      if (!entry.loaded || entry.saving || !f) return;
      const ser = JSON.stringify(entry.state);
      if (ser !== entry.lastSaved) {
        entry.saving = true;
        const block = buildHiddenBlock(JSON.parse(ser));
        app.vault.process(f, (content) => writeBlockAtEnd(content, block))
          .then(() => {
            entry.lastSaved = ser;
          })
          .finally(() => {
            setTimeout(() => { entry.saving = false; }, 500);
          });
      }
    });
  });

  window.addEventListener("beforeunload", () => {
    Object.keys(window.__kbStore).forEach((p) => {
      const entry = window.__kbStore[p];
      const f = app.vault.getAbstractFileByPath(p);
      if (!entry.loaded || !f) return;
      const ser = JSON.stringify(entry.state);
      if (ser !== entry.lastSaved) {
        const block = buildHiddenBlock(JSON.parse(ser));
        app.vault.process(f, (content) => writeBlockAtEnd(content, block));
      }
    });
  });
}

const styleId = "kb-modern-style-v8";
if (!document.getElementById(styleId)) {
  const style = document.createElement("style");
  style.id = styleId;
  style.textContent = `
    .kb-board { display: flex; gap: 14px; align-items: flex-start; overflow-x: auto; padding: 6px 2px 14px; direction: ltr; font-family: var(--font-interface); }
    .kb-col { flex: 0 0 275px; background: var(--background-secondary); border: 1px solid var(--background-modifier-border); border-radius: 10px; padding: 12px; display: flex; flex-direction: column; gap: 10px; transition: border-color 0.15s ease, background 0.15s ease; }
    .kb-col.drag-over { border-color: var(--interactive-accent); background: color-mix(in srgb, var(--interactive-accent) 7%, var(--background-secondary)); }
    .kb-col-header { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
    .kb-col-title { flex: 1; min-width: 0; background: transparent; border: 1px solid transparent; border-radius: 6px; color: var(--text-normal); font-weight: 600; font-size: 0.95rem; padding: 4px 6px; outline: none; }
    .kb-col-title:hover, .kb-col-title:focus { border-color: var(--background-modifier-border); background: var(--background-primary); }
    .kb-col-meta { display: flex; align-items: center; justify-content: space-between; gap: 8px; padding: 5px 8px; margin-bottom: 4px; border-bottom: 1px solid var(--background-modifier-border); font-size: 0.8rem; color: var(--text-muted); }
    .kb-col-count-val { font-weight: 600; color: var(--text-normal); }
    .kb-del-col-btn { width: 24px !important; height: 24px !important; min-width: 24px !important; max-width: 24px !important; min-height: 24px !important; max-height: 24px !important; flex: 0 0 24px !important; padding: 0 !important; display: inline-flex !important; align-items: center !important; justify-content: center !important; background: transparent; border: none; border-radius: 50% !important; color: var(--text-muted); cursor: pointer; font-size: 0.82rem; transition: all 0.15s ease; }
    .kb-del-col-btn:hover { color: var(--text-error); background: color-mix(in srgb, var(--text-error) 12%, transparent); }
    .kb-tasks { display: flex; flex-direction: column; gap: 8px; min-height: 28px; }
    .kb-task { background: var(--background-primary); border: 1px solid var(--background-modifier-border); border-radius: 8px; padding: 9px 10px; display: flex; align-items: center; justify-content: space-between; gap: 8px; cursor: grab; touch-action: none; user-select: none; -webkit-user-select: none; transition: transform 0.12s ease, box-shadow 0.12s ease, border-color 0.12s ease; }
    .kb-task:active { cursor: grabbing; }
    .kb-task:hover { border-color: var(--background-modifier-border-hover); box-shadow: 0 2px 6px rgba(0,0,0,0.08); }
    .kb-task.dragging { opacity: 0.4; }
    .kb-task-text { flex: 1; font-size: 0.9rem; color: var(--text-normal); word-break: break-word; line-height: 1.45; }
    .kb-task-text p { margin: 0; }
    .kb-task-text p + p { margin-top: 4px; }
    .kb-menu-wrap { position: relative; flex: 0 0 30px; width: 30px; height: 30px; display: inline-flex; align-items: center; justify-content: center; }
    .kb-board .kb-dots-btn { width: 30px !important; height: 30px !important; min-width: 30px !important; max-width: 30px !important; min-height: 30px !important; max-height: 30px !important; flex: 0 0 30px !important; padding: 0 !important; margin: 0 !important; box-sizing: border-box !important; display: inline-flex !important; align-items: center !important; justify-content: center !important; background: transparent !important; border: none !important; box-shadow: none !important; color: var(--text-muted) !important; cursor: pointer; border-radius: 50% !important; line-height: 1 !important; transition: background 0.15s ease, color 0.15s ease; }
    .kb-board .kb-dots-btn:hover { background: var(--background-modifier-hover) !important; color: var(--text-normal) !important; }
    .kb-board .kb-col-header .kb-dots-btn { color: var(--text-normal) !important; }
    .kb-board .kb-col-header .kb-dots-btn:hover { background: var(--background-modifier-hover) !important; color: var(--text-normal) !important; }
    .kb-dot-char { display: inline-block; width: 4px; height: 4px; border-radius: 50%; background: currentColor; pointer-events: none; }
    .kb-dots-stack { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 2.5px; pointer-events: none; }
    .kb-menu { display: none; position: absolute; right: 0; top: calc(100% + 4px); background: var(--background-primary); border: 1px solid var(--background-modifier-border); border-radius: 8px; box-shadow: var(--shadow-s); z-index: 30; min-width: 136px; padding: 4px; }
    .kb-menu.open { display: block; }
    .kb-delete-btn { width: 100%; text-align: left; background: transparent; border: none; color: var(--text-error); padding: 6px 10px; border-radius: 6px; cursor: pointer; font-size: 0.85rem; font-weight: 500; }
    .kb-delete-btn:hover { background: color-mix(in srgb, var(--text-error) 12%, transparent); }
    .kb-add-task-btn { width: 100%; text-align: left; background: transparent; border: 1px dashed var(--background-modifier-border); color: var(--text-muted); padding: 7px 10px; border-radius: 8px; cursor: pointer; font-size: 0.86rem; transition: all 0.12s ease; }
    .kb-add-task-btn:hover { color: var(--text-normal); border-color: var(--text-muted); background: var(--background-primary); }
    .kb-quick-input { width: 100%; box-sizing: border-box; background: var(--background-primary); border: 1px solid var(--interactive-accent); border-radius: 8px; padding: 8px 10px; color: var(--text-normal); font-size: 0.9rem; outline: none; }
    .kb-add-col-btn { flex: 0 0 210px; background: transparent; border: 1px dashed var(--background-modifier-border); border-radius: 10px; color: var(--text-muted); padding: 14px; cursor: pointer; font-size: 0.9rem; transition: all 0.15s ease; }
    .kb-add-col-btn:hover { color: var(--text-normal); border-color: var(--interactive-accent); background: var(--background-secondary); }
    .kb-drag-ghost { position: fixed; pointer-events: none; z-index: 9999; background: var(--background-primary); border: 1px solid var(--interactive-accent); border-radius: 8px; padding: 9px 12px; color: var(--text-normal); font-size: 0.9rem; box-shadow: 0 8px 20px rgba(0,0,0,0.2); transform: translate(-50%, -50%); direction: ltr; max-width: 240px; word-break: break-word; }
  `;
  document.head.appendChild(style);
}

function createDotsEl() {
  const stack = document.createElement("span");
  stack.className = "kb-dots-stack";
  for (let i = 0; i < 3; i++) {
    const dot = document.createElement("span");
    dot.className = "kb-dot-char";
    stack.appendChild(dot);
  }
  return stack;
}

const root = dv.container;
let mountEl = root.querySelector(`#${boardId}`);
if (!mountEl) {
  root.innerHTML = "";
  mountEl = document.createElement("div");
  mountEl.id = boardId;
  root.appendChild(mountEl);
}

if (!window.__kbDocClickBound) {
  window.__kbDocClickBound = true;
  document.addEventListener("click", (e) => {
    if (!e.target.closest(".kb-menu-wrap")) {
      document.querySelectorAll(".kb-menu.open").forEach((m) => m.classList.remove("open"));
    }
  });
}

function moveTask(sourceColId, targetColId, taskId) {
  if (!sourceColId || !targetColId || sourceColId === targetColId) return false;
  const sourceCol = mem.state.columns.find((c) => c.id === sourceColId);
  const targetCol = mem.state.columns.find((c) => c.id === targetColId);
  if (!sourceCol || !targetCol) return false;

  const taskIndex = sourceCol.tasks.findIndex((t) => t.id === taskId);
  if (taskIndex === -1) return false;

  const [movedTask] = sourceCol.tasks.splice(taskIndex, 1);
  targetCol.tasks.push(movedTask);
  return true;
}

function clearDragHighlights() {
  mountEl.querySelectorAll(".kb-col.drag-over").forEach((el) => el.classList.remove("drag-over"));
}

function renderTaskMarkdown(container, markdownText) {
  container.innerHTML = "";
  void obsidian.MarkdownRenderer.render(app, markdownText, container, filePath, dv.component);
}

function render() {
  const board = document.createElement("div");
  board.className = "kb-board";

  mem.state.columns.forEach((col) => {
    const colEl = document.createElement("div");
    colEl.className = "kb-col";
    colEl.dataset.colId = col.id;

    colEl.addEventListener("dragover", (e) => { e.preventDefault(); colEl.classList.add("drag-over"); });
    colEl.addEventListener("dragleave", (e) => { if (!colEl.contains(e.relatedTarget)) colEl.classList.remove("drag-over"); });
    colEl.addEventListener("drop", (e) => {
      e.preventDefault();
      colEl.classList.remove("drag-over");
      if (!draggedTask) return;
      const changed = moveTask(draggedTask.colId, col.id, draggedTask.taskId);
      draggedTask = null;
      if (changed) {
        render();
        void persistToFile();
      }
    });

    const header = document.createElement("div");
    header.className = "kb-col-header";

    const titleInput = document.createElement("input");
    titleInput.type = "text";
    titleInput.className = "kb-col-title";
    titleInput.value = col.title;
    titleInput.placeholder = "Column name...";
    titleInput.addEventListener("change", () => {
      col.title = titleInput.value.trim() || "Untitled";
      void persistToFile();
    });
    titleInput.addEventListener("keydown", (e) => { if (e.key === "Enter") titleInput.blur(); });

    const colMenuWrap = document.createElement("div");
    colMenuWrap.className = "kb-menu-wrap";

    const colDotsBtn = document.createElement("button");
    colDotsBtn.type = "button";
    colDotsBtn.className = "kb-dots-btn";
    colDotsBtn.title = "Options";
    colDotsBtn.appendChild(createDotsEl());

    const colMenu = document.createElement("div");
    colMenu.className = "kb-menu";

    const colMeta = document.createElement("div");
    colMeta.className = "kb-col-meta";

    const colCountLabel = document.createElement("span");
    colCountLabel.textContent = "Tasks:";

    const colCountVal = document.createElement("span");
    colCountVal.className = "kb-col-count-val";
    colCountVal.textContent = col.tasks.length;

    const delColBtn = document.createElement("button");
    delColBtn.type = "button";
    delColBtn.className = "kb-del-col-btn";
    delColBtn.title = "Delete column";
    delColBtn.textContent = "✕";
    delColBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      mem.state.columns = mem.state.columns.filter((c) => c.id !== col.id);
      render();
      void persistToFile();
    });

    colMeta.appendChild(colCountLabel);
    colMeta.appendChild(colCountVal);
    colMeta.appendChild(delColBtn);
    colMenu.appendChild(colMeta);
    colMenuWrap.appendChild(colDotsBtn);
    colMenuWrap.appendChild(colMenu);

    colDotsBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      const isOpen = colMenu.classList.contains("open");
      document.querySelectorAll(".kb-menu.open").forEach((m) => m.classList.remove("open"));
      if (!isOpen) colMenu.classList.add("open");
    });

    header.appendChild(titleInput);
    header.appendChild(colMenuWrap);
    colEl.appendChild(header);

    const tasksWrap = document.createElement("div");
    tasksWrap.className = "kb-tasks";

    col.tasks.forEach((task) => {
      const taskEl = document.createElement("div");
      taskEl.className = "kb-task";
      taskEl.draggable = true;

      taskEl.addEventListener("dragstart", () => {
        draggedTask = { colId: col.id, taskId: task.id };
        taskEl.classList.add("dragging");
      });
      taskEl.addEventListener("dragend", () => {
        taskEl.classList.remove("dragging");
        draggedTask = null;
        clearDragHighlights();
      });

      taskEl.addEventListener("touchstart", (e) => {
        if (e.target.closest(".kb-menu-wrap") || e.target.closest("a")) return;
        const touch = e.touches[0];
        const ghost = document.createElement("div");
        ghost.className = "kb-drag-ghost";
        ghost.textContent = task.text;
        ghost.style.left = `${touch.clientX}px`;
        ghost.style.top = `${touch.clientY}px`;
        document.body.appendChild(ghost);
        taskEl.classList.add("dragging");
        touchState = { colId: col.id, taskId: task.id, ghost };
      }, { passive: true });

      taskEl.addEventListener("touchmove", (e) => {
        if (!touchState) return;
        e.preventDefault();
        const touch = e.touches[0];
        touchState.ghost.style.left = `${touch.clientX}px`;
        touchState.ghost.style.top = `${touch.clientY}px`;
        clearDragHighlights();
        const targetEl = document.elementFromPoint(touch.clientX, touch.clientY)?.closest(".kb-col");
        if (targetEl) targetEl.classList.add("drag-over");
      }, { passive: false });

      const endTouchDrag = (e) => {
        if (!touchState) return;
        const touch = e.changedTouches[0];
        const targetColEl = document.elementFromPoint(touch.clientX, touch.clientY)?.closest(".kb-col");
        const targetColId = targetColEl?.dataset.colId;
        touchState.ghost.remove();
        taskEl.classList.remove("dragging");
        clearDragHighlights();
        const { colId: srcId, taskId: tId } = touchState;
        touchState = null;
        if (targetColId && moveTask(srcId, targetColId, tId)) {
          render();
          void persistToFile();
        }
      };

      taskEl.addEventListener("touchend", endTouchDrag);
      taskEl.addEventListener("touchcancel", endTouchDrag);

      const textEl = document.createElement("div");
      textEl.className = "kb-task-text";
      renderTaskMarkdown(textEl, task.text);

      const menuWrap = document.createElement("div");
      menuWrap.className = "kb-menu-wrap";

      const dotsBtn = document.createElement("button");
      dotsBtn.type = "button";
      dotsBtn.className = "kb-dots-btn";
      dotsBtn.title = "Options";
      dotsBtn.appendChild(createDotsEl());

      const menu = document.createElement("div");
      menu.className = "kb-menu";

      const delBtn = document.createElement("button");
      delBtn.type = "button";
      delBtn.className = "kb-delete-btn";
      delBtn.textContent = "Delete task";
      delBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        col.tasks = col.tasks.filter((t) => t.id !== task.id);
        render();
        void persistToFile();
      });

      dotsBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        const isOpen = menu.classList.contains("open");
        document.querySelectorAll(".kb-menu.open").forEach((m) => m.classList.remove("open"));
        if (!isOpen) menu.classList.add("open");
      });

      menu.appendChild(delBtn);
      menuWrap.appendChild(dotsBtn);
      menuWrap.appendChild(menu);

      taskEl.appendChild(textEl);
      taskEl.appendChild(menuWrap);
      tasksWrap.appendChild(taskEl);
    });

    colEl.appendChild(tasksWrap);

    const addTaskBtn = document.createElement("button");
    addTaskBtn.type = "button";
    addTaskBtn.className = "kb-add-task-btn";
    addTaskBtn.textContent = "+ Add task";

    addTaskBtn.addEventListener("click", () => {
      const input = document.createElement("input");
      input.type = "text";
      input.className = "kb-quick-input";
      input.placeholder = "Type task and press Enter...";

      addTaskBtn.replaceWith(input);
      input.focus();

      let committed = false;
      const commit = () => {
        if (committed) return;
        committed = true;
        const val = input.value.trim();
        if (val) {
          col.tasks.push({
            id: "task-" + Date.now() + "-" + Math.random().toString(36).slice(2, 6),
            text: val
          });
        }
        render();
        if (val) void persistToFile();
      };

      input.addEventListener("keydown", (e) => {
        if (e.key === "Enter") { e.preventDefault(); commit(); }
        else if (e.key === "Escape") { committed = true; render(); }
      });

      input.addEventListener("blur", commit);
    });

    colEl.appendChild(addTaskBtn);
    board.appendChild(colEl);
  });

  const addColBtn = document.createElement("button");
  addColBtn.type = "button";
  addColBtn.className = "kb-add-col-btn";
  addColBtn.textContent = "+ Add column";
  addColBtn.addEventListener("click", () => {
    const num = mem.state.columns.length + 1;
    mem.state.columns.push({
      id: "col-" + Date.now() + "-" + num,
      title: `Column ${num}`,
      tasks: []
    });
    render();
    void persistToFile();
  });

  board.appendChild(addColBtn);
  mountEl.replaceChildren(board);
}

await initDataOnce();
render();
```

<!-- KANBAN_DATA_START
{
  "columns": [
    {
      "id": "col-init-1",
      "title": "Daily Quests",
      "tasks": []
    },
    {
      "id": "col-init-2",
      "title": "Done",
      "tasks": []
    }
  ]
}
KANBAN_DATA_END -->
