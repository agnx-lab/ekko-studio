# EKKO Studio · Agnx 子应用

## 上游嵌入

- 工作方式：仓内加 `.agnx/` 胶水（主流 Wrap + Sidecar）。真树可软链到 `$AGNX_HOME/apps/ekko-studio`。
- 推荐模式：L8 Web Guest。Tab 里是上游 Vite Web UI；Koa 后端 + Vite 由 Agnx daemon 托管，**不嵌 Electron / 桌面壳**。
- 挂载：`guest.auth=none` / 策略=`auto`→桌面 **`direct-iframe`**（对齐 OpenSEO/`auth=none` 合同；勿强制 `guest-webview`，否则 Electron `<webview>` 易丢键盘焦点）
- 上游：https://github.com/EKKOLearnAI/ekko-studio
- Port 切片：无。只加 `.agnx/` 胶水。
- 默认值：Guest/Web `8649`（`npm run dev:client`），API `8647`（`nodemon` / `dev:server`）；生产一体入口线索 `8648`（`bin/hermes-web-ui` / `npm start`）本切片未用

打开子应用后看到的是 EKKO Studio 自己的 Web 界面。Electron 桌面壳不在这个 Tab 里启动。

## 嵌页宿主能力缺口

| 上游能力 | 信号位置 | 嵌后风险 | 处置 (A–E) | 主路径 | 备注 |
| --- | --- | --- | --- | --- | --- |
| 登录 / 主界面 | Web UI + 服务端 auth | 登录表单在上游页面内；无 `?token=` 静默登录 | 不需要桥。`guest.auth=none` | 是 | 第一版手动登录 |
| Socket.IO / WS | `/socket.io`、Vite 代理 | guest-webview 需 `capabilities: websocket` | D | 是 | manifest 已声明 |
| 上传文件 | `input type=file` | 浏览器文件选择可用 | D | 是 | 不走宿主选目录 |
| Electron 桌面能力 | `packages/desktop` | 不能整嵌 | D | 否 | 只用 Web Guest |
| 选目录 / 系统对话框 | 桌面壳 | iframe/webview 可能缺 | 未做桥 | 否 | 后续若主路径依赖再补 |

## 本机前置

- Node.js ≥23（`package.json` engines；ensure 会找 nvm/fnm 里的 ≥23）
- 在仓根：`npm install`（尚未装依赖时 ensure 会 `ok:false` 并提示）
- 第一版默认 `mode=dev`：同时起后端 `8647` + 前端 `8649`；健康检查 `http://127.0.0.1:8649/health`（Vite 代理到后端）

## 登记（用户执行，Agent 不代登）

```bash
# 软链到 AGNX_HOME（推荐，便于扫盘发现）
ln -sfn ~/Downloads/ekko-studio $AGNX_HOME/apps/ekko-studio

# 或用 Agnx 登记脚本写 .agnx/config.json / overlay
cd $AGNX_MONOREPO
npm run sub-apps:register -- --app-id=ekko-studio --root=~/Downloads/ekko-studio --source=local

# 胶水改过需重建 dist
node ~/Downloads/ekko-studio/.agnx/scripts/build.mjs

# Agnx 命令面板 → 子应用 → 重新扫描
```

## 仓根 manifest

daemon `ensureLoopback` 读 **`manifest.json`（仓根）** 而非仅 `.agnx/manifest.json`。共工先例两边都有；本仓根 `manifest.json` 的 `main` 指向 `./.agnx/dist/index.js`，sidecar/guest 与 `.agnx/manifest.json` 对齐。

## 键盘 / 焦点（2026-10-14）

**现象：** 桌面 Guest 登录框敲不进字符，Tab/方向键无效。

**根因：**
1. 子应用曾 `preferStrategy=guest-webview`，而 `auth=none` 合同 auto 策略是 **`direct-iframe`**（见 `guest-surface-strategy.ts` / Skill L8）。
2. 宿主 `guest-surface-element.ts` 的 `<webview>` 挂载**未**在 click/dom-ready 上 `focus()`；焦点常留在 embedder，按键被主窗口快捷键路径吞掉或落到无输入目标处。共工强制 guest-webview 是为 cookies；OpenSEO `auto` 走 iframe，输入正常。

**子应用修复：** `preferStrategy: "auto"`（桌面解析为 direct-iframe），保留 `capabilities: ["websocket"]`，`iframeShortcutCapture: true`。

**宿主最小补丁建议（若仍要 guest-webview）：** 在 `mountGuestWebview` 的 `dom-ready` 与 container `pointerdown` 上调用 `webview.focus()`；可选对 guest webContents `setIgnoreMenuShortcuts(true)`（仅当菜单加速键抢键时）。

## 登录后主界面（2026-10-14）

- 登录走同源 `POST /api/auth/login`（Vite 反代 → 后端 8647），**非 Cookie**；token 写入 guest origin 的 `localStorage.hermes_api_key`。direct-iframe 下 CORS/SameSite 不是瓶颈。
- 若 `node_modules/mermaid` 残缺（缺 `dist/mermaid.core.mjs`），登录 API 仍 200，但聊天页 Vite import-analysis 报错遮罩会挡住主 UI，看起来像「登录失败」。修复：`npm install mermaid`；ensure 已检测并拒绝残缺依赖。

## 获取模型 / provider-models（2026-10-14）

- UI：`ProviderFormModal`「获取」→ `POST /api/hermes/provider-models`（经 Vite `/api` 反代）。
- Guest 易踩坑：`localStorage.hermes_server_url` 若写成后端 `http://127.0.0.1:8647`，相对前端 `:8649` 成跨端口；旧栈 OPTIONS 被 JWT 打成 401 且 CORS 不认跨端口 loopback → `Failed to fetch`。
- 已修：JWT 跳过 OPTIONS；loopback 跨端口同源策略；`getBaseUrl()` 折回相对路径；「获取」传 `api_mode` 并对齐 editor 目录探测。
