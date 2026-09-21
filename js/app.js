import { loadLayout, saveLayout, clearLayout, onSaveError } from './db.js';
import {
  getBreakpoint,
  resolveCollisions,
  compact,
  deriveLayout,
  validateLayouts,
  defaultLayouts,
  BREAKPOINTS,
} from './layout.js';

const grid = document.getElementById('grid');
const badge = document.getElementById('breakpoint-badge');
const toastRoot = document.getElementById('toast-root');

const WIDGET_META = {
  'w-visits': { title: '访问量', value: '12,847', note: '较昨日 +8.2%' },
  'w-orders': { title: '订单数', value: '1,293', note: '较昨日 +3.1%' },
  'w-revenue': { title: '营收', value: '¥86,400', note: '较昨日 -1.4%' },
  'w-users': { title: '活跃用户', value: '3,572', note: '在线 214' },
  'w-chart': { title: '趋势图', value: '', note: '近 30 天访问趋势（示意）' },
  'w-todo': { title: '待办事项', value: '6', note: '2 项已逾期' },
};

const state = {
  layouts: {},        // { lg: [...], md: [...], sm: [...] }
  bp: null,           // 当前断点对象
  widgetEls: new Map(),
  drag: null,
};

/* ---------- Toast ---------- */
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

onSaveError((msg) => toast(msg, 'error', 5000));

window.addEventListener('error', (e) => {
  toast(`发生未捕获异常：${e.message}`, 'error', 5000);
});
window.addEventListener('unhandledrejection', (e) => {
  toast(`异步操作失败：${e.reason?.message || e.reason}`, 'error', 5000);
});

/* ---------- 渲染 ---------- */
function currentItems() {
  return state.layouts[state.bp.name] || [];
}

function render() {
  const cols = state.bp.cols;
  grid.style.setProperty('--cols', cols);
  badge.textContent = `${state.bp.name.toUpperCase()} · ${cols} 列`;

  const items = currentItems();
  const seen = new Set();
  for (const item of items) {
    seen.add(item.id);
    let el = state.widgetEls.get(item.id);
    if (!el) {
      el = createWidgetEl(item.id);
      state.widgetEls.set(item.id, el);
      grid.appendChild(el);
    }
    el.style.gridColumn = `${item.x + 1} / span ${item.w}`;
    el.style.gridRow = `${item.y + 1} / span ${item.h}`;
  }
  for (const [id, el] of state.widgetEls) {
    if (!seen.has(id)) {
      el.remove();
      state.widgetEls.delete(id);
    }
  }
}

function createWidgetEl(id) {
  const meta = WIDGET_META[id] || { title: '卡片', value: '—', note: '' };
  const el = document.createElement('section');
  el.className = 'widget';
  el.dataset.id = id;
  el.innerHTML = `
    <div class="widget-header">
      <span class="widget-title">${meta.title}</span>
      <button class="widget-remove" type="button" title="移除" aria-label="移除卡片">✕</button>
    </div>
    <div class="widget-body">
      ${meta.value ? `<span class="num">${meta.value}</span>` : ''}
      <span>${meta.note}</span>
    </div>
    <div class="resize-handle" aria-label="调整大小"></div>
  `;
  el.querySelector('.widget-header').addEventListener('pointerdown', (e) => {
    if (e.target.closest('.widget-remove')) return; // 移除按钮不触发拖拽
    startDrag(e, id, 'move');
  });
  el.querySelector('.resize-handle').addEventListener('pointerdown', (e) => startDrag(e, id, 'resize'));
  el.querySelector('.widget-remove').addEventListener('click', () => removeWidget(id));
  return el;
}

function removeWidget(id) {
  try {
    for (const bp of BREAKPOINTS) {
      if (state.layouts[bp.name]) {
        state.layouts[bp.name] = compact(
          state.layouts[bp.name].filter((it) => it.id !== id),
          bp.cols
        );
      }
    }
    render();
    persist();
    toast('卡片已移除', 'success');
  } catch (err) {
    console.error(err);
    toast('移除失败：' + err.message, 'error');
  }
}

/* ---------- 网格度量 ---------- */
function gridMetrics() {
  const rect = grid.getBoundingClientRect();
  const style = getComputedStyle(grid);
  const gap = parseFloat(style.gap) || 0;
  const rowH = parseFloat(style.gridAutoRows) || 72;
  const padL = parseFloat(style.paddingLeft) || 0;
  const padT = parseFloat(style.paddingTop) || 0;
  const cols = state.bp.cols;
  const colW = (rect.width - padL - parseFloat(style.paddingRight || 0) - gap * (cols - 1)) / cols;
  return { rect, gap, rowH, padL, padT, colW };
}

function pointerToCell(clientX, clientY, m) {
  const px = clientX - m.rect.left - m.padL;
  const py = clientY - m.rect.top - m.padT;
  return {
    x: Math.floor((px + m.gap / 2) / (m.colW + m.gap)),
    y: Math.floor((py + m.gap / 2) / (m.rowH + m.gap)),
  };
}

/* ---------- 拖拽（Pointer Events） ---------- */
function startDrag(event, id, mode) {
  if (event.button !== 0) return;
  event.preventDefault();
  const item = currentItems().find((it) => it.id === id);
  if (!item) return;

  const el = state.widgetEls.get(id);
  try {
    event.target.setPointerCapture(event.pointerId);
  } catch {
    // 某些浏览器对非主指针捕获会抛错，忽略即可
  }

  const ghost = document.createElement('div');
  ghost.className = 'ghost';
  grid.appendChild(ghost);
  el.classList.add('dragging-source');

  state.drag = {
    id,
    mode,
    pointerId: event.pointerId,
    origin: { ...item },
    target: { ...item },
    startCell: pointerToCell(event.clientX, event.clientY, gridMetrics()),
    ghost,
    rafId: 0,
    lastEvent: null,
  };
  positionGhost(ghost, item);

  window.addEventListener('pointermove', onDragMove, { passive: true });
  window.addEventListener('pointerup', onDragEnd);
  window.addEventListener('pointercancel', onDragCancel);
}

// pointermove 仅记录坐标，实际计算在 rAF 中执行，保证每帧最多一次布局计算
function onDragMove(event) {
  const drag = state.drag;
  if (!drag || event.pointerId !== drag.pointerId) return;
  drag.lastEvent = { x: event.clientX, y: event.clientY };
  if (!drag.rafId) {
    drag.rafId = requestAnimationFrame(applyDragFrame);
  }
}

function applyDragFrame() {
  const drag = state.drag;
  if (!drag) return;
  drag.rafId = 0;
  if (!drag.lastEvent) return;

  const m = gridMetrics();
  const cell = pointerToCell(drag.lastEvent.x, drag.lastEvent.y, m);
  const cols = state.bp.cols;
  const o = drag.origin;

  if (drag.mode === 'move') {
    const dx = cell.x - drag.startCell.x;
    const dy = cell.y - drag.startCell.y;
    drag.target.x = Math.max(0, Math.min(o.x + dx, cols - o.w));
    drag.target.y = Math.max(0, o.y + dy);
  } else {
    drag.target.w = Math.max(1, Math.min(o.w + (cell.x - drag.startCell.x), cols - o.x));
    drag.target.h = Math.max(1, o.h + (cell.y - drag.startCell.y));
  }
  positionGhost(drag.ghost, drag.target);
}

function positionGhost(ghost, item) {
  const m = gridMetrics();
  const w = item.w * m.colW + (item.w - 1) * m.gap;
  const h = item.h * m.rowH + (item.h - 1) * m.gap;
  const x = m.padL + item.x * (m.colW + m.gap);
  const y = m.padT + item.y * (m.rowH + m.gap);
  ghost.style.width = `${w}px`;
  ghost.style.height = `${h}px`;
  ghost.style.transform = `translate(${x}px, ${y}px)`;
}

function commitDrag() {
  const drag = state.drag;
  const items = currentItems();
  const changed =
    drag.target.x !== drag.origin.x ||
    drag.target.y !== drag.origin.y ||
    drag.target.w !== drag.origin.w ||
    drag.target.h !== drag.origin.h;
  if (changed) {
    state.layouts[state.bp.name] = compact(
      resolveCollisions(items, drag.target, state.bp.cols),
      state.bp.cols
    );
    render();
    persist();
  }
}

function cleanupDrag() {
  const drag = state.drag;
  if (!drag) return;
  if (drag.rafId) cancelAnimationFrame(drag.rafId);
  drag.ghost.remove();
  state.widgetEls.get(drag.id)?.classList.remove('dragging-source');
  state.drag = null;
  window.removeEventListener('pointermove', onDragMove);
  window.removeEventListener('pointerup', onDragEnd);
  window.removeEventListener('pointercancel', onDragCancel);
}

function onDragEnd(event) {
  if (!state.drag || event.pointerId !== state.drag.pointerId) return;
  try {
    commitDrag();
  } catch (err) {
    console.error(err);
    toast('布局更新失败，已还原', 'error');
  } finally {
    cleanupDrag();
  }
}

function onDragCancel(event) {
  if (!state.drag || event.pointerId !== state.drag.pointerId) return;
  cleanupDrag(); // 不提交，直接还原
}

/* ---------- 响应式 ---------- */
let resizeRaf = 0;
const observer = new ResizeObserver((entries) => {
  if (resizeRaf) return;
  resizeRaf = requestAnimationFrame(() => {
    resizeRaf = 0;
    const width = entries[0].contentRect.width;
    const bp = getBreakpoint(width);
    if (!state.bp || bp.name !== state.bp.name) {
      switchBreakpoint(bp);
    } else if (state.drag) {
      positionGhost(state.drag.ghost, state.drag.target);
    }
  });
});

function switchBreakpoint(bp) {
  const prev = state.bp;
  state.bp = bp;
  if (!state.layouts[bp.name]) {
    // 当前断点没有布局时，从最近的更大断点推导
    const order = ['lg', 'md', 'sm'];
    const idx = order.indexOf(bp.name);
    const sourceName = [...order.slice(0, idx)].reverse().find((n) => state.layouts[n]) ||
      order.slice(idx + 1).find((n) => state.layouts[n]);
    if (sourceName) {
      const fromCols = BREAKPOINTS.find((b) => b.name === sourceName).cols;
      state.layouts[bp.name] = deriveLayout(state.layouts[sourceName], fromCols, bp.cols);
    } else {
      state.layouts[bp.name] = [];
    }
  }
  render();
  if (prev && prev.name !== bp.name) {
    toast(`已切换到 ${bp.name.toUpperCase()} 布局（${bp.cols} 列）`, 'info', 1500);
  }
}

/* ---------- 持久化 ---------- */
function persist() {
  saveLayout({ version: 1, layouts: state.layouts });
}

/* ---------- 工具栏 ---------- */
document.getElementById('btn-add').addEventListener('click', () => {
  try {
    const id = `w-custom-${Date.now().toString(36)}`;
    WIDGET_META[id] = { title: '自定义卡片', value: '', note: '点击 ✕ 可移除' };
    for (const bp of BREAKPOINTS) {
      const list = state.layouts[bp.name] || (state.layouts[bp.name] = []);
      const w = Math.min(4, bp.cols);
      const y = list.reduce((max, it) => Math.max(max, it.y + it.h), 0);
      state.layouts[bp.name] = compact([...list, { id, x: 0, y, w, h: 2 }], bp.cols);
    }
    render();
    persist();
    toast('已添加卡片', 'success');
  } catch (err) {
    console.error(err);
    toast('添加失败：' + err.message, 'error');
  }
});

document.getElementById('btn-reset').addEventListener('click', async () => {
  try {
    await clearLayout();
    state.layouts = defaultLayouts();
    render();
    persist();
    toast('布局已重置为默认', 'success');
  } catch (err) {
    console.error(err);
    toast('重置失败：' + err.message, 'error');
  }
});

/* ---------- 启动 ---------- */
async function init() {
  try {
    const raw = await loadLayout();
    const validated = validateLayouts(raw);
    if (raw && !validated) {
      toast('检测到布局数据损坏，已恢复默认布局', 'error', 5000);
    }
    state.layouts = validated || defaultLayouts();
  } catch (err) {
    console.error(err);
    state.layouts = defaultLayouts();
    toast('布局加载失败，已使用默认布局', 'error', 5000);
  }
  state.bp = getBreakpoint(grid.getBoundingClientRect().width || window.innerWidth);
  observer.observe(grid);
  render();
}

init();
