/* Pointer Events 拖拽与缩放：rAF 节流渲染，setPointerCapture 保证流畅 */
(function (global) {
  'use strict';

  class DragController {
    /**
     * @param {HTMLElement} gridEl 网格容器
     * @param {object} hooks
     *   - getMetrics(): { cols, cellW, cellH, gap, gridLeft, gridTop }
     *   - getItemRect(id): { x, y, w, h } 当前网格坐标
     *   - onPreview(id, rect, mode): 拖拽中预览（rect 为网格坐标）
     *   - onCommit(id, rect, mode): 拖拽结束提交
     */
    constructor(gridEl, hooks) {
      this.grid = gridEl;
      this.hooks = hooks;
      this.state = null;
      this.rafId = 0;

      gridEl.addEventListener('pointerdown', (e) => this.onPointerDown(e));
      gridEl.addEventListener('pointermove', (e) => this.onPointerMove(e));
      gridEl.addEventListener('pointerup', (e) => this.onPointerUp(e));
      gridEl.addEventListener('pointercancel', (e) => this.onPointerUp(e));
    }

    onPointerDown(e) {
      if (e.button !== 0 && e.pointerType === 'mouse') return;
      const resizeHandle = e.target.closest('.widget-resize');
      const header = e.target.closest('.widget-header');
      if (!resizeHandle && !header) return;
      if (e.target.closest('.widget-remove')) return;

      const el = e.target.closest('.widget');
      if (!el) return;

      const base = this.hooks.getItemRect(el.dataset.id);
      if (!base) return;

      const rect = el.getBoundingClientRect();
      this.state = {
        id: el.dataset.id,
        el,
        mode: resizeHandle ? 'resize' : 'move',
        pointerId: e.pointerId,
        startX: e.clientX,
        startY: e.clientY,
        originX: rect.left,
        originY: rect.top,
        width: rect.width,
        height: rect.height,
        baseX: base.x,
        baseY: base.y,
        baseW: base.w,
        baseH: base.h,
        metrics: this.hooks.getMetrics(),
        dx: 0,
        dy: 0,
        lastRect: null,
      };

      // 捕获指针，移出元素也能持续收到事件
      try {
        this.grid.setPointerCapture(e.pointerId);
      } catch (_) { /* 某些旧浏览器不支持，忽略 */ }

      el.classList.add('dragging');
      e.preventDefault();
    }

    onPointerMove(e) {
      const s = this.state;
      if (!s || e.pointerId !== s.pointerId) return;
      s.dx = e.clientX - s.startX;
      s.dy = e.clientY - s.startY;
      // rAF 节流：每帧最多计算一次，保证拖拽流畅
      if (!this.rafId) {
        this.rafId = requestAnimationFrame(() => {
          this.rafId = 0;
          this.render();
        });
      }
    }

    render() {
      const s = this.state;
      if (!s) return;
      const { cellW, cellH, gap, cols, gridLeft, gridTop } = s.metrics;
      const L = global.DashLayout;

      if (s.mode === 'move') {
        s.el.style.transform = `translate(${s.dx}px, ${s.dy}px)`;
        const gridX = L.clamp(
          Math.round((s.originX + s.dx - gridLeft) / (cellW + gap)),
          0, cols - s.baseW
        );
        const gridY = Math.max(0, Math.round((s.originY + s.dy - gridTop) / (cellH + gap)));
        s.lastRect = { x: gridX, y: gridY, w: s.baseW, h: s.baseH };
      } else {
        const w = Math.max(60, s.width + s.dx);
        const h = Math.max(60, s.height + s.dy);
        s.el.style.width = `${w}px`;
        s.el.style.height = `${h}px`;
        const gridW = L.clamp(
          Math.round((w + gap) / (cellW + gap)),
          L.MIN_W, cols - s.baseX
        );
        const gridH = Math.max(L.MIN_H, Math.round((h + gap) / (cellH + gap)));
        s.lastRect = { x: s.baseX, y: s.baseY, w: gridW, h: gridH };
      }
      this.hooks.onPreview(s.id, s.lastRect, s.mode);
    }

    onPointerUp(e) {
      const s = this.state;
      if (!s || e.pointerId !== s.pointerId) return;
      if (this.rafId) {
        cancelAnimationFrame(this.rafId);
        this.rafId = 0;
      }
      this.render(); // 以最终位置为准

      try {
        this.grid.releasePointerCapture(e.pointerId);
      } catch (_) { /* 忽略 */ }

      s.el.classList.remove('dragging');
      s.el.style.transform = '';
      s.el.style.width = '';
      s.el.style.height = '';

      const { id, mode, lastRect } = s;
      this.state = null;
      if (lastRect) this.hooks.onCommit(id, lastRect, mode);
    }
  }

  global.DashDrag = { DragController };
})(window);
