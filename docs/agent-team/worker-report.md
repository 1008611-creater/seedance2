# Worker Report

## 可执行性复核

- 需求是否清晰：是。
- 实现计划是否合理：是。
- 验收标准是否可执行：是。
- 是否需要补充：否。

## 实现摘要

- 已新增统一验证码登录后端：`/api/auth/otp/send` 和 `/api/auth/otp/verify`，支持邮箱 OTP 与 E.164 手机号 SMS OTP。
- 已新增 Cloudflare Turnstile 服务端校验：生产/强制模式缺 secret 会失败，mock 只允许本地 smoke 显式开启。
- 已新增统一业务用户数据库 migration：`user_profiles` 和 `auth_events`，含 RLS、用户自读/自改策略、哈希化认证事件审计。
- 已新增登录成功后的业务资料 upsert、登录事件记录，并尽量初始化 `image2_wallets`；钱包初始化失败不阻塞登录。
- 已新增统一登录页 `/login`，按 host 渲染 `Image2 账号` 或 `场景引擎账号`，写入现有统一会话 key `image2-account-session:v1`。
- 已新增管理员用户 API `/api/admin/users` 和后台页 `/admin/users`，沿用现有 `ADMIN_TOKEN`，展示用户、联系方式、来源、最近登录、图片余额和近期事件。
- 已新增认证 smoke 和 migration 静态检查：`smoke:unified-auth`、`check:unified-auth-migration`。

## 修改文件

- `.env.example`
- `package.json`
- `app/admin/page.tsx`
- `app/admin/users/page.tsx`
- `app/api/admin/users/route.ts`
- `app/api/auth/otp/send/route.ts`
- `app/api/auth/otp/verify/route.ts`
- `app/globals.css`
- `app/login/page.tsx`
- `components/admin-users-console.tsx`
- `components/unified-login-panel.tsx`
- `lib/turnstile.ts`
- `lib/unified-auth.ts`
- `supabase/migrations/202606040002_unified_auth_profiles.sql`
- `tools/check-unified-auth-migration.mjs`
- `tools/smoke-unified-auth.mjs`
- `docs/agent-team/worker-report.md`

## 覆盖范围

- 覆盖 REQ-001：邮箱或手机号验证码登录入口和 API。
- 覆盖 REQ-002：发送和校验验证码均通过服务端 API。
- 覆盖 REQ-003：服务端 Turnstile `siteverify` 校验封装，secret 不暴露到前端。
- 覆盖 REQ-004：成功登录后创建/更新业务 profile，并尝试创建图片余额钱包。
- 覆盖 REQ-005：新增统一管理员用户管理 API 与 UI。
- 覆盖 REQ-006：回归了 `image2` / `scene` 域名 smoke，域名边界保持绿色。

## 自测结果

- `npm run typecheck`：通过。
- `npm run build`：通过；仍有既有 Turbopack/NFT warning。
- `npm run check:unified-auth-migration`：通过，校验 `user_profiles`、`auth_events`、RLS 和禁止敏感字段。
- `npm run smoke:unified-auth`：通过，`11/11 checks passed`。
  - 覆盖 Turnstile 未配置强制失败。
  - 覆盖管理员用户 API 未授权 401。
  - 覆盖邮箱 OTP 和手机号 SMS OTP 的 Supabase 请求形状。
  - 覆盖 OTP verify mock 成功返回 `accessToken`、`refreshToken`、`user.id`、`user.email` 和 profile。
  - 覆盖 `/login` 的 Image2/scene 双品牌文案。
  - 覆盖 `/admin/users` 用户管理页基本渲染。
- `npm run smoke:image2-domains`：通过，`45/45 checks passed`。
- `npm run smoke:image2-pages`：`image2` 与 `scene` 相关 23 项通过；3 项 `picture.lsb0713.online` 因公网 `net::ERR_CONNECTION_CLOSED` 失败，和本轮统一登录改动无直接关系。
- 浏览器本地验收：
  - `http://127.0.0.1:3012/login`：title `Image2 账号`，可见邮箱/手机号、验证码、Turnstile 提示。
  - `http://127.0.0.1:3012/admin/users`：title `统一用户管理 - Image2 后台`，可见后台口令、统计、空状态。

## 未覆盖项

- 尚未执行真实 Supabase migration：当前本地环境未发现 `SUPABASE_DB_URL` / `SUPABASE_ACCESS_TOKEN` / `SUPABASE_PROJECT_REF` / `SUPABASE_DB_PASSWORD` 可用于命令行迁移。
- 尚未验证真实邮箱 OTP 发送、真实手机号 SMS 发送、真实 Turnstile token，因为生产 `NEXT_PUBLIC_TURNSTILE_SITE_KEY` / `TURNSTILE_SECRET_KEY` 当前未配置。
- 尚未把旧的分散登录弹窗替换为 `/login`；这在 spec 中为 NON-004，后续可单独做入口收敛。

## 风险与验收关注点

- `supabase/migrations/202606040002_unified_auth_profiles.sql` 需要在 Supabase SQL Editor 或 CLI 中执行后，真实用户 profile / auth event 才会落库。
- Supabase Phone Auth 的短信可用性取决于 Supabase 项目内 Phone provider / SMS 服务配置。
- `UNIFIED_AUTH_ALLOW_MOCKS` 只为本地 smoke 使用，不得配置到生产环境。
- 后续部署生产前需要配置 Cloudflare Turnstile site key / secret，并确认 `/login` 在 `scene.lsb0713.online`、`image2.lsb0713.online` 均可真实发送验证码。
