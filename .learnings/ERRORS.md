# Errors

Command failures and integration errors.

---

## [ERR-20260619-001] - Waline 评论区静默不加载

**Logged**: 2026-06-19T00:20+08
**Priority**: high
**Status**: resolved
**Caused by**: Waline v3 用 ESM 模块，普通 `<script src>` 无法加载

**Error**: 浏览器不报错，Waline 对象未定义，评论区空白  
**Resolution**: 改用 `<script type="module">` + `import { init } from '...'`  
**Related**: LRN-20260619-001

---

## [ERR-20260619-002] - 改用户名后仍然只能用 admin 登录

**Logged**: 2026-06-19T00:20+08
**Priority**: critical
**Status**: resolved
**Caused by**: login.js 读 `config:admin.user`，改用户名只写 `config:username`

**Error**: 前端保存成功，登录时提示用户名错误  
**Resolution**: config.js POST username 同步更新 `config:admin.user`  
**Related**: LRN-20260619-002

---

## [ERR-20260619-003] - 小米邮箱暗色模式白字白底

**Logged**: 2026-06-19T00:20+08
**Priority**: high
**Status**: resolved
**Caused by**: MIUI 系统级颜色反转，CSS `@media (prefers-color-scheme: dark)` 无效

**Error**: 用户反馈"白色背景加白色字体"  
**Resolution**: meta `color-scheme: light only` + CSS `!important` + 内联样式三重防御  
**Related**: LRN-20260619-003, LRN-20260619-005

---

## [ERR-20260619-004] - 异步邮件"开了跟没开一样"

**Logged**: 2026-06-19T00:20+08
**Priority**: high
**Status**: resolved
**Caused by**: `flushEmailQueue` fetch 同一个 CF Pages 项目被截断 + 之前 `await` 了它

**Error**: 开了异步模式，提交仍要等邮件发送  
**Resolution**: queueEmail 内部 fire-and-forget 发送，不经过 cron endpoint；异步模式直接返回  
**Related**: LRN-20260619-004

---

## [ERR-20260619-005] - 侧边栏后 3 个 tab 无选中高亮

**Logged**: 2026-06-19T00:20+08
**Priority**: low
**Status**: resolved
**Caused by**: 按钮缺 `:class="sidebarClass('xxx')"` 绑定

**Error**: 视觉反馈缺失，用户不知道当前选中哪个 tab  
**Resolution**: 三个按钮补上 `:class` 绑定  
**Related**: LRN-20260619-009

---

## [ERR-20260619-006] - 测试邮件报"请求体不是 JSON"

**Logged**: 2026-06-19T00:20+08
**Priority**: medium
**Status**: resolved
**Caused by**: `testEmail()` 调用 `this.api('/api/admin/test-email', { method: 'POST' })` 没传 body

**Error**: 后端 `request.json()` 解析空 body 抛异常  
**Resolution**: 加 `body: JSON.stringify({ type: this.testEmailType })` + `Content-Type` header

---

## [ERR-20260619-007] - 改用户名报"网络错误"

**Logged**: 2026-06-19T00:20+08
**Priority**: medium
**Status**: resolved
**Caused by**: 前端 `data: { username: xx }` 被后端解构为 `{ type, data }`，但 username handler 读的是 `body.username` 而非 `data.username`

**Error**: 后端判断 `!data.username` → 返回错误 → 前端 catch 显示"网络错误"  
**Resolution**: 前端改为 `data: { username: xx }`（已匹配 data 解构），后端 `config.js` 中也是 `data.username`

---

## [ERR-20260619-008] - sed + Python 批量操作破坏文件（review.js 从 242 行 → 11 行）

**Logged**: 2026-06-19T00:20+08
**Priority**: critical
**Status**: resolved
**Caused by**: sed 删除了 import 行，Python 脚本 fallback 逻辑错误导致文件截断

**Error**: 7 个 API 文件内容被严重破坏  
**Resolution**: `git checkout` 恢复后用 `file_edit` 逐文件精准修改  
**Related**: LRN-20260619-006

---

## [ERR-20260619-009] - 登录一闪"网络错误"

**Logged**: 2026-06-19T00:20+08
**Priority**: low
**Status**: resolved
**Caused by**: login 成功后 `loadCounts`/`loadList` 抛异常 → catch 设置 `loginError`，但此时 `loggedIn=true` 已隐藏登录表单

**Error**: 页面切换瞬间闪现错误提示  
**Resolution**: catch 改为 `console.error` 记录，不设置 loginError

---

## [ERR-20260619-010] - 会话过期静默退出无提示

**Logged**: 2026-06-19T00:20+08
**Priority**: medium
**Status**: resolved
**Caused by**: `requireAdmin` 返回 401，前端仅设 `loggedIn=false`

**Error**: 用户被踢回登录页但不知道为什么  
**Resolution**: checkAuth/loadCounts/loadList 401 处理改为 `loginError = '会话已过期，请重新登录'` + 清 localStorage
