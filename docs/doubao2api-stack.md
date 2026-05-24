# doubao2api 本地生视频链路

## 服务拓扑

- 上游逆向服务：`D:\codex-work\wangchuxiaoji-doubao2api`，默认 `http://127.0.0.1:9090`
- 本地代理服务：`D:\codex-work\seedance2-video-api`，默认 `http://127.0.0.1:7872`
- 主应用：`D:\codex-work\seedance2`，默认 `http://127.0.0.1:3012`

主应用通过 `VIDEO_PROVIDER=doubao2api` 走本地代理；本地代理再转发到 `wangchuxiaoji-oss/doubao2api` 上游。

## 启动

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File tools\start-doubao2api-stack.ps1
```

启动脚本会检查 `9090`、`7872`、`3012` 三个端口：已运行则复用，未运行则后台启动，并把日志写到各项目的 `.logs/` 目录。

多账号池启动示例：

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File tools\start-doubao2api-stack.ps1 -RestartProxy -ExtraUpstreamPorts "9091,9092"
```

`-RestartProxy` 会重启 `7872` 本地代理，让新的账号池配置立即生效；不会重启 `3012` 主应用。

如果调整了上游频率、浏览器资料目录或账号池端口，使用更完整的保守启动：

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File tools\start-doubao2api-stack.ps1 -RestartProxy -RestartUpstreams -ExtraUpstreamPorts "9091,9092"
```

`-RestartUpstreams` 会重启 `9090/9091/9092` 上游进程，但继续复用对应 `.browser_data*` 登录资料目录。

每个上游端口对应一个独立浏览器资料目录：

- `9090` -> `D:\codex-work\wangchuxiaoji-doubao2api\.browser_data`
- `9091` -> `D:\codex-work\wangchuxiaoji-doubao2api\.browser_data_9091`
- `9092` -> `D:\codex-work\wangchuxiaoji-doubao2api\.browser_data_9092`

每个新增端口都需要单独打开 `/auth` 扫码登录一次，例如：

```text
http://127.0.0.1:9091/auth
http://127.0.0.1:9092/auth
```

## 停止

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File tools\stop-doubao2api-stack.ps1
```

## 登录上游

当前上游健康状态可能是 `logged_in: false`。这时主应用可以提交到本地通道，但上游会返回未登录错误，主应用会把本次额度退回。

需要真实生视频前，打开：

```text
http://127.0.0.1:9090/auth
```

扫码登录后再检查：

```powershell
Invoke-RestMethod http://127.0.0.1:7872/healthz | ConvertTo-Json -Depth 8
```

登录态保存在上游项目的 `.browser_data/`，不要把 cookie、session 或 `.browser_data/` 内容提交、外发或写进文档。

## 验证

只检查服务和主应用 provider，不提交真实任务：

```powershell
node tools\smoke-doubao2api-main-app.mjs
```

主应用也提供账号池状态接口：

```powershell
Invoke-RestMethod http://127.0.0.1:3012/api/provider/doubao2api/status | ConvertTo-Json -Depth 8
```

创作台右侧 `本地通道` 面板会显示每个账号的登录状态，并给出对应 `/admin` 登录入口。

主应用已接入的 doubao2api 能力：

- 文生视频：创作台 `文生视频`。
- 图生视频：创作台 `首帧图生`、`首尾帧`、`参考素材`。
- 文生图 / 图生图：创作台 `文生图` 面板，走 `/api/doubao2api/images`。
- 文生音乐：创作台 `文生音乐` 面板，走 `/api/music/generations`。

显式提交一次测试任务：

```powershell
node tools\smoke-doubao2api-main-app.mjs --submit
```

注意：上游已登录时，`--submit` 会真实提交一次生成；上游未登录时，会返回失败并退回额度。

## 账号池与冷却

`seedance2-video-api` 支持账号池和冷却队列。核心环境变量：

```text
DOUBAO2API_UPSTREAMS=main=http://127.0.0.1:9090/v1;acct-9091=http://127.0.0.1:9091/v1
DOUBAO2API_RATE_LIMIT_COOLDOWN_MS=1800000
DOUBAO2API_LOGIN_REQUIRED_COOLDOWN_MS=60000
DOUBAO2API_MIN_INTERVAL_MS=120000
DOUBAO2API_QUEUE_TIMEOUT_MS=5000
```

行为：

- 正常请求会按账号可用时间选择上游。
- 当前脚本按保守模式启动：上游 `DOUBAO_RPM_LIMIT=3`，代理层单账号两次请求至少间隔 2 分钟。
- 遇到 `710022004` / rate limited / verify 时，按账号级风控处理，冷却当前账号并尝试下一个已登录账号。
- 遇到 `710022002` / `当前服务访问频繁` 时，按池级风控处理，整组账号统一冷却 30 分钟，停止继续轮询账号，避免越试越频繁。
- 遇到备用账号未登录或登录失效时，会标记该账号并继续尝试下一个账号；如果只剩未登录备用号，会返回明确的登录提示。
- 所有账号都冷却或排队时，请求会快速返回友好错误；主界面也会显示 `通道冷却中`，到点前不会继续提交。
- 主应用失败任务会退回本次额度。

## 风控处理边界

公开项目和平台经验能落地的做法是降低频率、冷却、排队、避免重复重试，以及在生产场景接官方 API 兜底。不要把 cookie/session、浏览器指纹、代理切换等内容写入代码、文档或自动化流程。

当前可用的稳定路径：

- 本地逆向通道：用于低频自测和备用，严格遵守冷却提示。
- 官方/托管 API：用于对外服务和连续生产；可接入 Volcengine/BytePlus/Ark 或 fal.ai 这类 Seedance 2.0 API。

## 当前验证记录

- `npm run typecheck`：通过。
- `node D:\codex-work\seedance2-video-api\src\server\app.cjs --check`：通过。
- `Invoke-RestMethod http://127.0.0.1:7872/healthz`：通过，账号池包含 `main`、`acct-9091`、`acct-9092`；三个账号均 `logged_in=true`。
- `Invoke-RestMethod http://127.0.0.1:3012/api/provider/doubao2api/status`：通过，返回 `accountCount=3`，三个账号均已登录。
- `node tools\smoke-doubao2api-main-app.mjs`：通过，`providerMode=doubao2api`、`upstreamLoggedIn=true`、`accountCount=3`、`loggedInAccounts=3`。
- In-app browser：`http://127.0.0.1:3012/` 确认页面包含 `文生图 / 图生图`、`doubao-image`、`生成图片`、`文生音乐`、`本地通道`。
- `node tools\smoke-doubao2api-main-app.mjs --submit`：登录后已打到真实上游；当前豆包仍返回访问频繁，任务失败且 `latestJobRefunded=true`。
- In-app browser：冷却期内确认 `开始生成` 按钮变为 `通道冷却中`，本地通道面板显示冷却到点时间。
- 前端截图证据：`D:\codex-work\seedance2\docs\agent-team\evidence\doubao2api-frontend-ready.png`。
