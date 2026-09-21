# GridBoard — 可拖拽响应式仪表盘

纯前端实现，无构建步骤。技术栈：**CSS Grid + Pointer Events + IndexedDB**。

## 运行

```bash
python3 -m http.server 8080
# 打开 http://localhost:8080
```

## 功能与验收标准对照

| 验收标准 | 实现 |
| --- | --- |
| 布局保存恢复 | 拖拽/缩放/增删后防抖 300ms 写入 IndexedDB；刷新后按断点恢复 |
| 响应式正确 | lg(≥1200px, 12列) / md(≥768px, 8列) / sm(<768px, 4列)；每个断点独立布局，缺失时从邻近断点等比推导并压实 |
| 拖拽流畅 | Pointer Events + 指针捕获；幽灵占位元素仅用 `transform` 移动，不触发 reflow |
| 性能可接受 | pointermove 仅记录坐标，计算合并进 `requestAnimationFrame`；写库防抖；ResizeObserver 回调经 rAF 节流 |
| 异常有提示 | Toast 通知：IndexedDB 打开/写入失败降级内存存储、存储配额不足、数据损坏自动恢复默认、未捕获异常兜底 |

## 结构

- `index.html` — 页面骨架
- `styles.css` — Grid 布局、卡片、幽灵占位、Toast、响应式断点样式
- `js/layout.js` — 纯函数布局引擎：碰撞检测/下推解决、向上压实、断点间推导、持久化数据校验
- `js/db.js` — IndexedDB 封装：防抖保存、内存降级、配额错误上报
- `js/app.js` — 渲染、拖拽/缩放交互、断点切换、Toast、工具栏

## 测试

布局引擎单元测试（21 项）：

```bash
node /tmp/test-layout.mjs   # 或复制到仓库内运行
```
