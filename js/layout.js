/* 布局模型：网格坐标、碰撞处理、响应式缩放 */
(function (global) {
  'use strict';

  const BREAKPOINTS = [
    { maxWidth: 640, cols: 4 },
    { maxWidth: 900, cols: 6 },
    { maxWidth: 1200, cols: 8 },
    { maxWidth: Infinity, cols: 12 },
  ];

  const MIN_W = 2;
  const MIN_H = 2;

  function getCols(viewportWidth) {
    for (const bp of BREAKPOINTS) {
      if (viewportWidth <= bp.maxWidth) return bp.cols;
    }
    return 12;
  }

  function collides(a, b) {
    return a.x < b.x + b.w && a.x + a.w > b.x &&
           a.y < b.y + b.h && a.y + a.h > b.y;
  }

  /** 将 item 向下推直到不与 others 中任何项碰撞 */
  function resolveCollisions(item, others) {
    let moved = true;
    let guard = 0;
    while (moved && guard < 1000) {
      moved = false;
      guard++;
      for (const other of others) {
        if (other.id !== item.id && collides(item, other)) {
          item.y = other.y + other.h;
          moved = true;
        }
      }
    }
    return item;
  }

  /** 整理整体布局：按顺序放置并下推碰撞项 */
  function compact(items, cols) {
    const sorted = [...items].sort((a, b) => a.y - b.y || a.x - b.x);
    const placed = [];
    for (const item of sorted) {
      item.x = clamp(item.x, 0, Math.max(0, cols - item.w));
      resolveCollisions(item, placed);
      placed.push(item);
    }
    return sorted;
  }

  function clamp(v, min, max) {
    return Math.min(max, Math.max(min, v));
  }

  /** 找一个能容纳 w×h 的空位（逐行扫描） */
  function findFreeSlot(items, cols, w, h) {
    const candidate = { id: '__probe__', x: 0, y: 0, w, h };
    const maxY = items.reduce((m, i) => Math.max(m, i.y + i.h), 0);
    for (let y = 0; y <= maxY + 1; y++) {
      for (let x = 0; x <= cols - w; x++) {
        candidate.x = x;
        candidate.y = y;
        if (!items.some((i) => collides(candidate, i))) return { x, y };
      }
    }
    return { x: 0, y: maxY };
  }

  /** 断点变化时按列数比例缩放布局，并修正越界 */
  function reflow(items, fromCols, toCols) {
    if (fromCols === toCols) return items;
    const ratio = toCols / fromCols;
    for (const item of items) {
      item.w = clamp(Math.round(item.w * ratio), MIN_W, toCols);
      item.x = clamp(Math.round(item.x * ratio), 0, toCols - item.w);
    }
    return compact(items, toCols);
  }

  /** 校验从存储中恢复的数据结构是否合法 */
  function validate(data) {
    if (!data || !Array.isArray(data.items)) return false;
    return data.items.every((i) =>
      typeof i.id === 'string' &&
      Number.isFinite(i.x) && Number.isFinite(i.y) &&
      Number.isFinite(i.w) && Number.isFinite(i.h) &&
      i.w >= 1 && i.h >= 1
    );
  }

  global.DashLayout = {
    BREAKPOINTS,
    MIN_W,
    MIN_H,
    getCols,
    collides,
    resolveCollisions,
    compact,
    clamp,
    findFreeSlot,
    reflow,
    validate,
  };
})(window);
