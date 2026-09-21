# 可拖拽仪表盘

纯前端实现的可拖拽网格布局仪表盘，零依赖，无需构建。

## 运行

```bash
# 任选其一
python3 -m http.server 8080   # 然后访问 http://localhost:8080
npx serve .
```

> 注意：需通过 http(s) 访问，IndexedDB 在 `file://` 协议下可能不可用（此时会有异常提示）。

## 技术栈

- **CSS Grid**：12/8/6/4 列网格布局，卡片用 `grid-column/row` 定位
- **Pointer Events**：统一鼠标/触摸拖拽，`setPointerCapture` 保证移出元素不丢事件
- **IndexedDB**：布局整体持久化（防抖 400ms 写入）

## 验收标准对照

| 标准 | 实现 |
| --- | --- |
| 布局保存恢复 | 拖拽/缩放/增删后防抖保存到 IndexedDB，刷新自动恢复；数据损坏时回退默认布局并提示 |
| 响应式正确 | 断点 640/900/1200px 对应 4/6/8/12 列，跨断点按比例缩放坐标并重新紧凑排列 |
| 拖拽流畅 | 拖拽中仅更新 `transform`（不触发 reflow），rAF 节流，占位符预览落点 |
| 性能可接受 | DocumentFragment 批量渲染、事件委托、resize 经 rAF 合并、保存防抖 |
| 异常有提示 | Toast 通知 + 全局 `error`/`unhandledrejection` 兜底，保存状态实时显示在工具栏 |

## 文件结构

- `index.html` — 页面骨架
- `styles.css` — Grid 布局、响应式断点、Toast 样式
- `js/db.js` — IndexedDB 封装（打开失败可重试、事务异常上报）
- `js/layout.js` — 布局模型：碰撞检测、紧凑排列、响应式缩放、数据校验
- `js/drag.js` — Pointer Events 拖拽/缩放控制器
- `js/app.js` — 渲染、持久化调度、响应式监听、异常提示
