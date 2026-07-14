# Task Spec

## 背景和目标

- REQ-001: 为 `image2.lsb0713.online`、`scene.lsb0713.online` 以及本地同源预览建立统一账号入口，支持邮箱或手机号验证码登录。
- REQ-002: 登录、发送验证码和校验验证码必须经过服务端 API，不再只依赖前端直接调用 Supabase Auth。
- REQ-003: 账号入口必须接入 Cloudflare Turnstile 人机验证；服务端使用 `siteverify` 校验 token，不把 secret 暴露到前端。
- REQ-004: 每个成功登录或注册的用户必须在业务数据库中拥有统一用户资料记录，并尽量初始化图片余额钱包记录。
- REQ-005: 新增统一管理员用户管理界面，可查看用户、联系方式、最近登录、图片余额和近期流水概览。
- REQ-006: 不破坏现有 Image2 案例库、scene 商业站、额度、卡密和后台变更记录能力。

## 本次范围

- TASK-001: 新增 Supabase migration，创建 `user_profiles` 与 `auth_events`，并配置 RLS。
- TASK-002: 新增服务端认证工具：Supabase Auth REST 封装、Turnstile 校验、用户资料 upsert、登录事件记录。
- TASK-003: 新增 `/api/auth/otp/send`，支持邮箱 OTP 与手机号 SMS OTP 请求。
- TASK-004: 新增 `/api/auth/otp/verify`，校验邮箱或手机号验证码，返回统一本地会话 payload。
- TASK-005: 新增 `/login` 统一登录页，按 host 显示 Image2 或 场景引擎品牌，包含邮箱/手机号、验证码、Turnstile widget 和登录状态。
- TASK-006: 新增 `/api/admin/users`，使用现有 `ADMIN_TOKEN` 保护，读取用户资料、钱包和最近登录事件。
- TASK-007: 新增 `/admin/users` 管理页，并从 `/admin` 增加入口。
- TASK-008: 补充 `.env.example` 中 Turnstile、Auth 和 admin smoke 配置说明。
- TASK-009: 增加认证与管理员 API smoke 覆盖未配置、未授权、Turnstile 失败、OTP 成功 mock 路径。

## 本次不做

- NON-001: 不接入真实短信服务商配置；手机号 OTP 走 Supabase Phone Auth，是否能真实发送取决于 Supabase 项目配置。
- NON-002: 不实现微信/Google/OAuth 登录。
- NON-003: 不实现支付后台、订单后台或复杂 RBAC；管理员仍沿用当前 `ADMIN_TOKEN`。
- NON-004: 不重写现有三个分散的旧登录弹窗；本轮先提供统一登录页和 API，后续再逐步替换旧入口。
- NON-005: 不清理脏 worktree，不回退无关改动。
- NON-006: 不记录或提交任何真实密钥、验证码、cookie、token。

## 业务规则

- RULE-BIZ-001: 邮箱输入包含 `@` 时走 email OTP；否则按手机号处理，手机号必须是 E.164 格式，如 `+8613800000000`。
- RULE-BIZ-002: 验证码发送成功后，前端进入输入验证码状态；验证码校验成功后写入 `localStorage` 的统一会话 key `image2-account-session:v1`。
- RULE-BIZ-003: `scene` host 的登录页文案使用“场景引擎账号”，默认返回 `/workbench`；`image2` host 使用“Image2 账号”，默认返回 `/image2-cases`。
- RULE-BIZ-004: 如果 Turnstile 没配置，开发环境允许 API 返回明确的 `turnstile_disabled` 状态；生产环境必须校验。
- RULE-BIZ-005: 用户资料表只保存业务需要的联系方式、来源、最近登录和显示名，不保存验证码明文或访问 token。

## 权限规则

- RULE-AUTH-001: `/api/auth/otp/send` 必须执行 Turnstile 校验后才调用 Supabase Auth OTP。
- RULE-AUTH-002: `/api/auth/otp/verify` 必须校验 Supabase OTP 成功后才创建/更新业务用户记录。
- RULE-AUTH-003: `/api/admin/users` 必须通过 `requireAdmin`，未授权返回 401。
- RULE-AUTH-004: 用户资料 RLS：普通登录用户只能读/改自己的 profile；管理员 API 使用 service role 读取聚合数据。
- RULE-AUTH-005: API 错误不泄露 Supabase service role、Turnstile secret、验证码或内部响应全文。

## 数据规则

- RULE-DATA-001: `user_profiles.user_id` 引用 `auth.users(id)`，一人一条主业务资料。
- RULE-DATA-002: `auth_events` 只记录事件类型、联系方式摘要、IP hash、User-Agent 截断、host 和成功/失败状态。
- RULE-DATA-003: 登录成功后尽量创建 `image2_wallets` 行；如果钱包 migration 未应用，登录仍可成功但返回 `walletInitialized=false`。
- RULE-DATA-004: 数据库 migration 必须可重复执行，使用 `create table if not exists`、`drop policy if exists`。

## 影响范围

- `.env.example`
- `app/login/page.tsx`
- `app/admin/page.tsx`
- `app/admin/users/page.tsx`
- `app/api/auth/otp/send/route.ts`
- `app/api/auth/otp/verify/route.ts`
- `app/api/admin/users/route.ts`
- `components/unified-login-panel.tsx`
- `components/admin-users-console.tsx`
- `lib/unified-auth.ts`
- `lib/turnstile.ts`
- `supabase/migrations/202606040002_unified_auth_profiles.sql`
- `tools/smoke-unified-auth.mjs`
- `package.json`
- `docs/agent-team/worker-report.md`
- `docs/agent-team/review-report.md`
- `docs/agent-team/issues.json`

## 推荐实现步骤

- TASK-010: 先写 migration 和服务端工具，保证 API 可复用。
- TASK-011: 实现 send/verify API，使用 mock-friendly fetch 和清晰状态码。
- TASK-012: 实现登录页，不引入新依赖，Turnstile widget 仅在 site key 存在时渲染。
- TASK-013: 实现 admin users API 和 UI，缺 Supabase 配置时显示可操作错误。
- TASK-014: 添加 smoke 脚本，覆盖关键 API 分支。
- TASK-015: 运行 `npm run typecheck`、`npm run build`、认证 smoke 和既有域名 smoke。

## 验收标准

- AC-001: `npm run typecheck` 通过。
- AC-002: `npm run build` 通过，允许既有 Turbopack/NFT warning。
- AC-003: 未配置 Turnstile 且模拟生产时，`/api/auth/otp/send` 返回 400/403 级错误，不调用 Supabase OTP。
- AC-004: mock Turnstile 成功时，`/api/auth/otp/send` 能为 email 或 phone 生成正确 Supabase Auth OTP 请求。
- AC-005: mock Supabase OTP 校验成功时，`/api/auth/otp/verify` 返回 `accessToken`、`refreshToken`、`user.id` 和 `user.email` 或 `user.phone`，并尝试写 `user_profiles`。
- AC-006: `/api/admin/users` 无 `ADMIN_TOKEN` 返回 401。
- AC-007: `/api/admin/users` 带合法 `ADMIN_TOKEN` 时能返回用户列表结构；Supabase 未配置时返回清晰错误。
- AC-008: `/login` 在 Image2 host 文案包含 `Image2 账号`，在 scene host 文案包含 `场景引擎账号`，无明显旧红色 ScenePlus 视觉。
- AC-009: `/admin/users` 可输入后台口令并展示用户管理表的加载、错误和空状态。
- AC-010: `npm run smoke:image2-domains` 仍通过，证明域名边界没有被认证页破坏。

## 待确认事项

- 真实手机号短信是否可用取决于 Supabase Auth 的 Phone provider 和短信服务配置；本轮只把前端/API/数据链路准备好。
- Cloudflare Turnstile site key 与 secret 需要在生产环境变量中配置，本轮只提供变量名和服务端校验逻辑。
