# 国策文游（PWA 原型）

这个仓库是一个**纯前端、离线可用**的国策文字模拟游戏原型：
- 无后端、无订阅，GitHub Pages 一键托管
- PWA，可添加到 iPhone 主屏，离线运行
- 单按钮状态机：生成建议值 → 结算本季度 → 进入下季度
- 本地 IndexedDB 持久化，支持导入/导出存档（JSON）

## 目录结构
```
.
├─ index.html            # App Shell + UI
├─ sw.js                 # Service Worker（离线缓存）
├─ public/
│  ├─ manifest.webmanifest
│  └─ icons/
│     ├─ icon-192.png
│     └─ icon-512.png
└─ src/
   ├─ main.js            # UI 逻辑 + 状态机
   ├─ engine.js          # 数值与建议值引擎（极简可跑）
   └─ db.js              # IndexedDB 持久化
```

## 本地开发
直接用任意静态服务器打开：

```bash
python3 -m http.server 8080
# 打开 http://localhost:8080/
```

或双击 `index.html` 也能运行，但 Service Worker 在 file:// 受限。

## GitHub Pages 部署
1. 建新仓库，上传全部文件。
2. repo 设置 → Pages → Source 选择 `Deploy from branch`，分支选 `main`，目录 `/root`。
3. 打开 Pages 提供的 URL（注意子路径），首次加载后可“添加到主屏”。

> 若你的仓库是子路径（如 `https://user.github.io/repo/`），确保 `index.html` 里 `manifest`、脚本、SW 路径保持相对路径（本工程已使用相对路径）。

## iOS 注意事项
- iOS 切到后台会暂停 JS/Worker，请在前台完成“结算本季度”。
- 首次进入会自动申请持久化存储，但系统仍可能清理：**请定期导出存档**。
- 离线使用前，先在线打开一次让 SW 缓存资源。

## 下一步
- 把 `engine.js` 替换为你的细化模型（经济/财政/军事/人口等模块化）。
- 扩展 IndexedDB schema，支持多存档、多国家并行。
- 把计算移到 Web Worker（避免主线程卡顿）。
- 事件系统、日志与回滚。
