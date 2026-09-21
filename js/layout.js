// 布局引擎：纯函数，负责碰撞处理、压实、断点间布局推导与数据校验。

export const BREAKPOINTS = [
  { name: 'lg', minWidth: 1200, cols: 12 },
  { name: 'md', minWidth: 768, cols: 8 },
  { name: 'sm', minWidth: 0, cols: 4 },
];

export function getBreakpoint(width) {
  for (const bp of BREAKPOINTS) {
    if (width >= bp.minWidth) return bp;
  }
  return BREAKPOINTS[BREAKPOINTS.length - 1];
}

export function collides(a, b) {
  if (a.id === b.id) return false;
  return (
    a.x < b.x + b.w &&
    a.x + a.w > b.x &&
    a.y < b.y + b.h &&
    a.y + a.h > b.y
  );
}

// 将与 target 碰撞的其他元素向下推，直到无碰撞（带迭代上限防死循环）
export function resolveCollisions(items, target, cols) {
  const result = items.map((it) => ({ ...it }));
  const moved = result.find((it) => it.id === target.id);
  Object.assign(moved, target);
  clampItem(moved, cols);

  let guard = 0;
  let changed = true;
  while (changed && guard++ < 200) {
    changed = false;
    for (const item of result) {
      if (item.id === moved.id) continue;
      for (const other of result) {
        if (collides(item, other)) {
          item.y = other.y + other.h;
          changed = true;
        }
      }
    }
  }
  return result;
}

// 向上压实，消除空隙
export function compact(items, cols) {
  const sorted = items.map((it) => ({ ...it })).sort((a, b) => a.y - b.y || a.x - b.x);
  const placed = [];
  for (const item of sorted) {
    clampItem(item, cols);
    item.y = Math.max(0, item.y);
    while (item.y > 0 && !placed.some((p) => collides({ ...item, y: item.y - 1 }, p))) {
      item.y -= 1;
    }
    while (placed.some((p) => collides(item, p))) {
      item.y += 1;
    }
    placed.push(item);
  }
  return placed;
}

export function clampItem(item, cols) {
  item.w = Math.max(1, Math.min(item.w, cols));
  item.h = Math.max(1, item.h);
  item.x = Math.max(0, Math.min(item.x, cols - item.w));
  item.y = Math.max(0, item.y);
  return item;
}

// 从某个断点的布局推导另一个断点：按比例缩放坐标后压实
export function deriveLayout(sourceItems, fromCols, toCols) {
  const scale = toCols / fromCols;
  const scaled = sourceItems.map((it) => ({
    ...it,
    x: Math.round(it.x * scale),
    w: Math.max(1, Math.round(it.w * scale)),
  }));
  return compact(scaled, toCols);
}

// 校验持久化数据，损坏时返回 null 由调用方回退默认布局
export function validateLayouts(data) {
  if (!data || typeof data !== 'object' || data.version !== 1) return null;
  const layouts = data.layouts;
  if (!layouts || typeof layouts !== 'object') return null;
  const out = {};
  for (const bp of BREAKPOINTS) {
    const list = layouts[bp.name];
    if (!Array.isArray(list)) continue;
    const valid = list.filter(
      (it) =>
        it &&
        typeof it.id === 'string' &&
        Number.isFinite(it.x) &&
        Number.isFinite(it.y) &&
        Number.isFinite(it.w) &&
        Number.isFinite(it.h) &&
        it.w >= 1 &&
        it.h >= 1
    );
    // 非空列表却全部非法 → 视为数据损坏，跳过该断点
    if (list.length > 0 && valid.length === 0) continue;
    out[bp.name] = valid.map((it) => clampItem({ ...it }, bp.cols));
  }
  return Object.keys(out).length > 0 ? out : null;
}

export function defaultLayouts() {
  const base = [
    { id: 'w-visits', x: 0, y: 0, w: 3, h: 2 },
    { id: 'w-orders', x: 3, y: 0, w: 3, h: 2 },
    { id: 'w-revenue', x: 6, y: 0, w: 3, h: 2 },
    { id: 'w-users', x: 9, y: 0, w: 3, h: 2 },
    { id: 'w-chart', x: 0, y: 2, w: 8, h: 4 },
    { id: 'w-todo', x: 8, y: 2, w: 4, h: 4 },
  ];
  return {
    lg: compact(base, 12),
    md: deriveLayout(base, 12, 8),
    sm: deriveLayout(base, 12, 4),
  };
}
