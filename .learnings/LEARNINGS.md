# Learnings

Corrections, insights, and knowledge gaps captured during development.

**Categories**: correction | insight | knowledge_gap | best_practice

---

## [LRN-20260619-001] correction — Waline v3 是 ESM 模块，普通 script 标签静默失败

**Logged**: 2026-06-19T00:20+08
**Priority**: high
**Status**: resolved
**Area**: frontend

### What happened
`<script src="https://unpkg.com/@waline/client@v3/dist/waline.js"></script>` 加载后无任何效果，评论区始终不渲染。浏览器控制台静默无错。

### Root cause
Waline v3（当前 3.15.2）只提供 ES Module 格式。文件末尾是 `export{...}`，普通 `<script>` 标签遇到 export 语法报错但不显示。

### Fix
```html
<script type="module">
import { init } from 'https://unpkg.com/@waline/client@3.15.2/dist/waline.js';
init({ el: '#waline', serverURL: '...' });
</script>
```

### Prevention
- npm 包用 `@latest` 前先 `curl` 看一眼末尾是否有 `export`
- ESM-only 包越来越多，优先检查 UMD 构建是否存在
- pin 具体版本号，避免 v3 标签指向的版本升级后破坏兼容性

**See Also**: LRN-20260619-006

---

## [LRN-20260619-002] correction — `config:admin` 与 `config:username` 两套 KV key 不同步

**Logged**: 2026-06-19T00:20+08
**Priority**: critical
**Status**: resolved
**Area**: backend

### What happened
后台修改用户名后保存成功（`config:username` 被更新），但登录时仍只能用旧用户名 `admin`。

### Root cause
登录端点 `login.js` 读取 `config:admin` 的 `user` 字段验证用户名；  
修改用户名的 `config.js POST` 只写了 `config:username`，没同步 `config:admin.user`。

### Fix
config.js username handler 同步更新两个 KV key：
```javascript
await env.LINKS.put('config:username', data.username.trim());
const adminRaw = JSON.parse(await env.LINKS.get('config:admin') || '{}');
if (adminRaw.user) { adminRaw.user = data.username.trim(); await env.LINKS.put('config:admin', JSON.stringify(adminRaw)); }
```

### Prevention
- 同一实体存多份数据时，写操作必须同步所有副本
- KV 项目中检查每个 handler 的读/写路径是否一致
- 加集成测试验证"改用户名后登录成功"

---

## [LRN-20260619-003] knowledge_gap — MIUI 暗色模式不是标准 CSS，是系统级颜色反转

**Logged**: 2026-06-19T00:20+08
**Priority**: high
**Status**: resolved
**Area**: frontend

### What happened
邮件在小米手机上白底白字看不清，加了 `@media (prefers-color-scheme: dark)` 的 `!important` 覆盖也不生效。

### Root cause
MIUI/HyperOS 对 WebView 实现的是**系统级颜色反转**（类似 Android Force Dark），不是标准的 `prefers-color-scheme`。CSS 媒体查询对它完全无效。

### Fix
三重防御（参考小米开放平台文档）：
```html
<meta name="color-scheme" content="light only">
<meta name="supported-color-schemes" content="light only">
```
```css
html { color-scheme: light only !important; }
<body style="background:#ffffff;color:#333333">
```
在每一个可能被反转的元素上加显式 `color` / `background-color` 内联样式。

### Prevention
- 邮件 HTML 开发时不依赖 CSS 变量，全用内联样式
- 测试覆盖：Apple Mail、Gmail、QQ邮箱、小米自带邮件

**See Also**: LRN-20260619-005

---

## [LRN-20260619-004] best_practice — CF Pages Function 内部不要 fetch 自己

**Logged**: 2026-06-19T00:20+08
**Priority**: medium
**Status**: resolved
**Area**: backend

### What happened
`flushEmailQueue` 在 submit Function 内 `fetch(url)` 调用同一个项目的 `/api/cron/send-pending`，意图触发队列发送。但 CF Pages 内部 fetch 可能被截断、循环检测或超时，导致不可靠。

### Fix
- 异步邮件改为直接 fire-and-forget 调用 `sendEmail()`，不再经过 cron endpoint
- 队列作为兜底，cron-job.org 外部触发

### Prevention
- 不要在同一请求中 fetch 自己的 Pages 项目 URL
- 带外触发用外部 cron 服务（cron-job.org）
- 内部背景任务用 `Promise.catch(() => {})` 不 await

---

## [LRN-20260619-005] best_practice — 邮件 HTML 暗色模式防御清单

**Logged**: 2026-06-19T00:20+08
**Priority**: medium
**Status**: resolved
**Area**: frontend

### 四大邮件客户端暗色模式行为

| 客户端 | 行为 | 对策 |
|--------|------|------|
| **Apple Mail** | 尊重 `color-scheme` meta，没有则反转颜色 | `<meta name="color-scheme" content="light only">` |
| **Gmail** | 忽略 meta，强制反转浅色背景为深色 | 所有文字用显式 inline `color` |
| **Outlook** | Word 渲染引擎，不反转颜色 | 基本安全 |
| **MIUI 自带** | 系统级颜色反转，无视 CSS | 三重防御（meta + CSS + inline） |

### 最终模板
```html
<meta name="color-scheme" content="light only">
<meta name="supported-color-schemes" content="light only">
<style>
html{color-scheme:light only!important}
@media(prefers-color-scheme:dark){ /* 全覆盖 !important */ }
</style>
<body style="background:#ffffff;color:#333333">
```

---

## [LRN-20260619-006] correction — 通过 Python 脚本批量修改 JS 文件时少用 sed

**Logged**: 2026-06-19T00:20+08
**Priority**: critical
**Status**: resolved
**Area**: infra

### What happened
用 `sed` 清理文件后又用 Python 脚本插入代码，因为 import 行被 sed 删掉导致匹配失败，Python 脚本 fallback 逻辑把文件截断到只剩 11 行。review.js 从 242 行变成 11 行。

### Root cause
两步操作没有原子性：sed 先删除了 onRequestGet 和 import，Python 依赖的 import 行已不存在，fallback 分支写得不对。

### Fix
通过 git checkout 恢复后，用 `file_edit` 工具逐文件精准修改。

### Prevention
- **不用 sed 批量修改 JS/HTML 文件**。用 `file_edit` 或 Python 的精准文本替换
- Python 脚本操作前先验证目标行的存在性，找不到就 abort 不 fallback
- 每次批量修改后 `git diff --stat` 确认行数变化合理
- 被删除 500 行 → 异常；被增加 500 行输入多行 handler → 正常

**See Also**: agent_md "项目文件规则"、"代码改动守则"

---

## [LRN-20260619-007] insight — Alpine.js `x-show` 隐藏的元素 DOM 中存在但不可见

**Logged**: 2026-06-19T00:20+08
**Priority**: low
**Status**: resolved
**Area**: frontend

### 现象
Waline `#waline` 元素在 `x-show="tab==='feedback'"` 内。Alpine 初始化期间 `x-cloak` 让元素 `display:none`。Waline.init 在这个阶段执行时容器 0 高度，但不影响后续渲染——Waline 用的是 Vue 3 的 Teleport/Portal 机制。

### 结论
Waline v3 + Alpine x-show 兼容正常，之前的加载失败是 ESM 问题，不是 DOM 可见性问题。

---

## [LRN-20260619-008] best_practice — CF Pages POST-only API 必须显式写 `onRequestGet`

**Logged**: 2026-06-19T00:20+08
**Priority**: medium
**Status**: resolved
**Area**: backend

### 现象
用 GET 访问 `/api/submit` 之类 POST-only 端点，CF Pages 直接返回 404 HTML。用户不知道是"方法不对"还是"路径不存在"。

### Fix
每个只导出 `onRequestPost` 的文件加：
```javascript
export async function onRequestGet() {
  return new Response(JSON.stringify({ error: '此接口需要 POST 请求' }), {
    status: 405, headers: { 'Content-Type': 'application/json; charset=utf-8' }
  });
}
```

### Prevention
- 新 API 加 method 检测作为模板规范
- 检查工具：`grep -L "onRequestGet\|onRequest(" functions/api/**/*.js`

---

## [LRN-20260619-009] correction — sidebarClass 绑定遗漏导致选中高亮缺失

**Logged**: 2026-06-19T00:20+08
**Priority**: low
**Status**: resolved
**Area**: frontend

### 现象
后台侧边栏最后 3 个 tab（用户名、备份、反馈）点击后没有蓝色选中高亮。

### Root cause
按钮只绑了 `@click="tab='xxx'"` 改 tab 变量，缺了 `:class="sidebarClass('xxx')"`，所以 class 一直是 `text-white/80 hover:bg-white/5`，从不变成 active 样式。

### Fix
给三个按钮加上 `:class="sidebarClass('xxx')"`，同时去掉静态的 `text-white/80 hover:bg-white/5`（由 sidebarClass 动态管理）。

### Prevention
新增按钮时对照模板：`@click` + `:class="sidebarClass"` 缺一不可。

---

## [LRN-20260619-010] insight — `encodeURIComponent` 对 token 不是必需的但无害

**Logged**: 2026-06-19T00:20+08
**Priority**: low
**Status**: noted
**Area**: backend

Token 由 `genToken` 生成（hex 字符 0-9a-f），不含需要编码的字符。`setSessionCookie` 里的 `encodeURIComponent(token)` 无害但冗余。

---

## [LRN-20260619-011] best_practice — 用户需求契合度自检清单

**Logged**: 2026-06-19T00:20+08
**Priority**: medium
**Status**: noted
**Area**: config

### 本次开发遵循的用户偏好模式
基于 user_md 和 soul 记录：

| 原则 | 如何体现 |
|------|---------|
| 效率优先 | 并行修复多个问题，批量操作，减少往返 |
| 直接给方案 | 每步改动都有前后对比，不给模糊建议 |
| 不擅自推送生产 | 始终推 `main`，等用户确认 |
| Markdown 结构化 | 用表格总结所有改动 |
| 先查再用 | `curl` 验证 Waline 格式 → 修正 ESM 加载 |
| 不动源码先查环境 | Waline 加载失败先查版本格式，不动初始化逻辑 |
| 国内可用性 | 邮件模板考虑 QQ邮箱、小米邮箱兼容 |
| 两次失败即停 | sed+Python 搞垮文件后立即 git checkout 恢复 |
| 交互四态 | 加载中/成功/失败提示都有（saving、error message、success badge） |
