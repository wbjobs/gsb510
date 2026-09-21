/* 应用入口：渲染、持久化调度、响应式、异常提示 */
(function () {
  'use strict';

  const L = window.DashLayout;
  const DB = window.DashDB;

  const gridEl = document.getElementById('grid');
  const toastRoot = document.getElementById('toast-root');
  const saveStatus = document.getElementById('save-status');

  const DEFAULT_ITEMS = [
    { id: 'w1', title: '访问量', x: 0, y: 0, w: 4, h: 3, body: '今日 PV 12,480，同比 +8.2%。' },
    { id: 'w2', title: '销售趋势', x: 4, y: 0, w: 5, h: 4, body: '本周销售额稳步上升，峰值出现在周三。' },
    { id: 'w3', title: '待办事项', x: 9, y: 0, w: 3, h: 4, body: '1. 审核报表\n2. 回复客户邮件\n3. 更新看板' },
    { id: 'w4', title: '系统状态', x: 0, y: 3, w: 4, h: 3, body: '全部服务运行正常，CPU 42%，内存 61%。' },
    { id: 'w5', title: '公告', x: 4, y: 4, w: 5, h: 2, body: '本周五 22:00 - 24:00 系统维护，请提前保存工作。' },
  ];

  let items = [];
  let cols = L.getCols(window.innerWidth);
  let saveTimer = 0;
  let idSeq = 0;

  /* ---------- 异常提示 ---------- */
  function toast(message, type = 'info', duration = 3200) {
    const el = document.createElement('div');
    el.className = `toast ${type}`;
    el.textContent = message;
    toastRoot.appendChild(el);
    setTimeout(() => {
      el.classList.add('fade');
      setTimeout(() => el.remove(), 350);
    }, duration);
  }

  window.addEventListener('error', (e) => {
    toast(`发生未预期错误：${e.message}`, 'error');
  });
  window.addEventListener('unhandledrejection', (e) => {
    toast(`操作失败：${(e.reason && e.reason.message) || e.reason}`, 'error');
  });

  function setStatus(text, cls) {
    saveStatus.textContent = text;
    saveStatus.className = `save-status ${cls || ''}`;
  }

  /* ---------- 渲染 ---------- */
  function renderAll() {
    gridEl.textContent = '';
    const frag = document.createDocumentFragment();
    for (const item of items) frag.appendChild(createWidgetEl(item));
    gridEl.appendChild(frag);
  }

  function createWidgetEl(item) {
    const el = document.createElement('section');
    el.className = 'widget';
    el.dataset.id = item.id;
    applyGridPos(el, item);
    el.innerHTML = `
      <div class="widget-header">
        <span class="widget-title"></span>
        <button class="widget-remove" type="button" title="删除" aria-label="删除卡片">✕</button>
      </div>
      <div class="widget-body"></div>
      <div class="widget-resize" aria-hidden="true"></div>`;
    el.querySelector('.widget-title').textContent = item.title;
    el.querySelector('.widget-body').textContent = item.body || '';
    el.querySelector('.widget-remove').addEventListener('click', () => removeItem(item.id));
    return el;
  }

  function applyGridPos(el, item) {
    el.style.gridColumn = `${item.x + 1} / span ${item.w}`;
    el.style.gridRow = `${item.y + 1} / span ${item.h}`;
  }

  /** 拖拽预览：只更新占位符，不重排整个 DOM */
  let placeholder = null;
  function showPlaceholder(rect) {
    if (!placeholder) {
      placeholder = document.createElement('div');
      placeholder.className = 'grid-placeholder';
      gridEl.appendChild(placeholder);
    }
    placeholder.style.gridColumn = `${rect.x + 1} / span ${rect.w}`;
    placeholder.style.gridRow = `${rect.y + 1} / span ${rect.h}`;
  }
  function hidePlaceholder() {
    if (placeholder) {
      placeholder.remove();
      placeholder = null;
    }
  }

  /* ---------- 持久化（防抖） ---------- */
  function scheduleSave() {
    setStatus('保存中…', 'saving');
    clearTimeout(saveTimer);
    saveTimer = setTimeout(persist, 400);
  }

  function persist() {
    DB.saveLayout({ version: 1, cols, items })
      .then(() => setStatus('已保存', ''))
      .catch((err) => {
        setStatus('保存失败', 'error');
        toast(`布局保存失败：${err.message}`, 'error');
      });
  }

  /* ---------- 布局操作 ---------- */
  function getItem(id) {
    return items.find((i) => i.id === id);
  }

  function commitChange(id, rect) {
    const item = getItem(id);
    if (!item) return;
    if (item.x === rect.x && item.y === rect.y &&
        item.w === rect.w && item.h === rect.h) return;
    Object.assign(item, rect);
    L.resolveCollisions(item, items);
    L.compact(items, cols);
    renderAll();
    scheduleSave();
  }

  function addItem() {
    const w = Math.min(4, cols);
    const h = 3;
    const pos = L.findFreeSlot(items, cols, w, h);
    idSeq += 1;
    items.push({
      id: `w${Date.now().toString(36)}${idSeq}`,
      title: `新卡片 ${items.length + 1}`,
      x: pos.x, y: pos.y, w, h,
      body: '双击标题栏拖拽移动，右下角拖拽调整大小。',
    });
    L.compact(items, cols);
    renderAll();
    scheduleSave();
    toast('已添加卡片', 'success', 1500);
  }

  function removeItem(id) {
    items = items.filter((i) => i.id !== id);
    renderAll();
    scheduleSave();
    toast('已删除卡片', 'info', 1500);
  }

  function resetLayout() {
    items = DEFAULT_ITEMS.map((i) => ({ ...i }));
    cols = L.getCols(window.innerWidth);
    L.reflow(items, 12, cols);
    renderAll();
    DB.clearLayout()
      .then(() => scheduleSave())
      .catch((err) => toast(`重置失败：${err.message}`, 'error'));
    toast('布局已重置为默认', 'info');
  }

  /* ---------- 响应式 ---------- */
  let resizeRaf = 0;
  function onViewportResize() {
    if (resizeRaf) return;
    resizeRaf = requestAnimationFrame(() => {
      resizeRaf = 0;
      const next = L.getCols(window.innerWidth);
      if (next !== cols) {
        L.reflow(items, cols, next);
        cols = next;
        renderAll();
        scheduleSave();
      }
    });
  }
  window.addEventListener('resize', onViewportResize);

  /* ---------- 拖拽 ---------- */
  const drag = new window.DashDrag.DragController(gridEl, {
    getMetrics() {
      const style = getComputedStyle(gridEl);
      const gap = parseFloat(style.columnGap) || 0;
      const gridRect = gridEl.getBoundingClientRect();
      const padLeft = parseFloat(style.paddingLeft) || 0;
      const padTop = parseFloat(style.paddingTop) || 0;
      const cellW = (gridRect.width - padLeft - (parseFloat(style.paddingRight) || 0) - gap * (cols - 1)) / cols;
      const firstRow = parseFloat(style.gridAutoRows) || 72;
      return {
        cols,
        cellW,
        cellH: firstRow,
        gap,
        gridLeft: gridRect.left + padLeft,
        gridTop: gridRect.top + padTop,
      };
    },
    getItemRect(id) {
      const item = getItem(id);
      return item ? { x: item.x, y: item.y, w: item.w, h: item.h } : null;
    },
    onPreview(id, rect) {
      showPlaceholder(rect);
    },
    onCommit(id, rect) {
      hidePlaceholder();
      commitChange(id, rect);
    },
  });

  /* ---------- 启动：恢复布局 ---------- */
  function init() {
    document.getElementById('btn-add').addEventListener('click', addItem);
    document.getElementById('btn-reset').addEventListener('click', resetLayout);

    DB.loadLayout()
      .then((data) => {
        if (data && L.validate(data)) {
          items = data.items;
          L.reflow(items, data.cols || 12, cols);
          setStatus('已恢复布局', '');
        } else {
          if (data) toast('存储的布局数据已损坏，已加载默认布局', 'error');
          items = DEFAULT_ITEMS.map((i) => ({ ...i }));
          L.reflow(items, 12, cols);
        }
        renderAll();
      })
      .catch((err) => {
        items = DEFAULT_ITEMS.map((i) => ({ ...i }));
        L.reflow(items, 12, cols);
        renderAll();
        toast(`无法读取本地布局（${err.message}），本次更改将不会被保存`, 'error', 5000);
      });
  }

  init();
})();
