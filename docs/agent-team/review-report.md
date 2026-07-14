# Review Report

## 验收结论

PASS

## 验收范围

- 验收统一登录系统本地实现：邮箱/手机号 OTP API、Cloudflare Turnstile 服务端校验、统一登录页、管理员用户后台。
- 验收生产入口：`image2.lsb0713.online`、`scene.lsb0713.online`、`picture.lsb0713.online` 的 `/login`、`/api/auth/otp/send` 与 `/api/admin/users`。
- 验收 Supabase 业务数据库生产状态：`user_profiles`、`auth_events`、`image2_wallets`。
- 验收 Image2 / scene / picture 域名边界未被统一登录改动破坏。
- 不验收真实短信服务商可用性；Supabase Phone Auth 真实发送仍取决于项目内 Phone provider 配置。

## 执行命令和验证动作

- `npm run typecheck`：通过。
- `npm run build`：通过；仍有既有 Turbopack/NFT warning，不阻塞本轮认证实现。
- `npm run check:unified-auth-migration`：通过。
- `npm run health:unified-auth`：通过，`5/5 checks passed`。
- `npm run smoke:unified-auth`：通过，`11/11 checks passed`。
- `npm run smoke:image2-domains`：通过，`61/61 checks passed`。
- `npm run smoke:image2-pages`：通过，`26 passed`。
- Supabase Auth settings：`/auth/v1/settings` 返回 HTTP 200，包含 `sms_provider`，证明生产手机号 OTP provider 配置不为空。
- Cloudflare Tunnel：发现 `scene` / `picture` 公网 530 的实际原因为 `handwriting-photo-site` tunnel 无连接，已启动既有计划任务 `Image2SceneCloudflaredTunnel`；`cloudflared tunnel list` 显示该 tunnel 已恢复连接。
- 生产登录入口：
  - `https://image2.lsb0713.online/login`：HTTP 200，title `Image2 账号`。
  - `https://scene.lsb0713.online/login`：HTTP 200，title `场景引擎账号`。
  - `https://picture.lsb0713.online/login`：HTTP 200，title `Image2 账号`。
- 生产 OTP API：
  - `POST https://image2.lsb0713.online/api/auth/otp/send` 无 Turnstile token 返回 HTTP 403，code `turnstile_token_missing`。
  - `POST https://scene.lsb0713.online/api/auth/otp/send` 无 Turnstile token 返回 HTTP 403，code `turnstile_token_missing`。
  - `POST https://picture.lsb0713.online/api/auth/otp/send` 无 Turnstile token 返回 HTTP 403，code `turnstile_token_missing`。
- 生产管理员 API：
  - 三域名 `GET /api/admin/users` 无口令均返回 HTTP 401。
  - 三域名 `GET /api/admin/users` 使用本地生产后台口令均返回 HTTP 200，用户列表结构可读取。

## 逐项验收记录

- AC-001: PASS。`npm run typecheck` 通过。
- AC-002: PASS。`npm run build` 通过；warning 与既有 `next.config.mjs` / `lib/store.ts` 动态追踪有关，不阻塞本轮认证实现。
- AC-003: PASS。生产 Turnstile 已配置；三域名 `/api/auth/otp/send` 在缺少 Turnstile token 时均返回 HTTP 403。
- AC-004: PASS。`smoke:unified-auth` 覆盖 mock Turnstile 成功时 email OTP 与 phone SMS OTP 的 Supabase 请求形状。
- AC-005: PASS。`smoke:unified-auth` 覆盖 mock Supabase OTP 校验成功返回 `accessToken`、`refreshToken`、`user.id` 与 profile；`health:unified-auth` 证明生产 `user_profiles` 与 `auth_events` 已存在。
- AC-006: PASS。`smoke:unified-auth` 与生产探测均覆盖 `/api/admin/users` 未授权 HTTP 401。
- AC-007: PASS。`smoke:unified-auth` 覆盖管理员 API 返回用户列表结构；生产三域名授权请求均返回 HTTP 200。
- AC-008: PASS。`/login` 在 Image2/scene/picture host 的品牌文案已通过生产 URL 验证；无旧红色 ScenePlus 视觉。
- AC-009: PASS。`smoke:unified-auth` 覆盖 `/admin/users` 后台口令、统计和空状态基本渲染。
- AC-010: PASS。`npm run smoke:image2-domains` 通过 `61/61 checks passed`，域名边界保持正确。

## 问题摘要

- ISSUE-001: 已关闭。生产 Supabase `public.user_profiles` 与 `public.auth_events` 已存在，`npm run health:unified-auth` 通过 `5/5`。
- ISSUE-002: 已关闭。Cloudflare Turnstile 已创建并接入 Docker/Vercel 生产环境；生产 API 已验证无 token 返回 403。
- ISSUE-003: 已关闭。`scene` / `picture` Cloudflare Tunnel 1033 已通过启动既有 `Image2SceneCloudflaredTunnel` 计划任务恢复，公网 smoke 已回绿。

## 最终说明

- 代码层、本地 mock 链路、三域名登录入口、Turnstile 服务端强制校验、生产 Supabase 业务表、统一管理员用户后台均已通过当前证据验收。
- 真实手机号短信送达仍取决于运营商和 Supabase Phone provider；当前已确认生产 Auth settings 中存在 `sms_provider`。
- 生产 tunnel 依赖 Windows 计划任务 `Image2SceneCloudflaredTunnel` 保持运行；若再次出现 Cloudflare `error code: 1033`，优先检查该任务和 `handwriting-photo-site` tunnel 连接数。
