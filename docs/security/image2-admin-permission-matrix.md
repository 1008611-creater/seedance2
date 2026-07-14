# Image2 管理接口权限矩阵

更新时间：2026-07-15

## 结论

当前 `app/api/admin/**` 的全部网络方法都具备服务端管理员边界。全部 Cookie 认证写方法均执行严格同源 CSRF 校验；生产环境默认不接受共享 `ADMIN_TOKEN`。页面门禁只改善体验，不作为唯一授权边界。

## 接口矩阵

| 接口 | 方法 | 数据/副作用 | 服务端授权 | CSRF | 状态 |
|---|---|---|---|---|---|
| `/api/admin/image2/overview` | GET | 用户、会员、卡密和兑换安全聚合 | `requireAdmin` | 不适用（只读） | 已保护 |
| `/api/admin/users` | GET | 用户运营必要字段 | `requireAdmin` | 不适用（只读） | 已保护 |
| `/api/admin/image2-cases/changes` | GET | 资产快照变更日志 | `requireAdmin` | 不适用（只读） | 已保护 |
| `/api/admin/image2-cases/changes` | POST | 撤销资产快照 | `requireAdmin` | `requireAdminCsrf` | 已保护 |
| `/api/admin/image2-gacha/health` | GET | 抽卡存储健康 | `requireAdmin` | 不适用（只读） | 已保护 |
| `/api/admin/jobs` | GET | Seedance 制作队列 | `requireAdmin` | 不适用（只读） | 已保护 |
| `/api/admin/jobs` | POST | 更新制作任务 | `requireAdmin` | `requireAdminCsrf` | 已保护 |
| `/api/admin/picture` | GET | 制图账号与记录 | `requireAdmin` | 不适用（只读） | 已保护 |
| `/api/admin/picture/output` | GET | 下载制图结果 | `requireAdmin` | 不适用（只读） | 已保护 |
| `/api/admin/session` | GET | 读取管理员会话 | `requireAdmin` | 不适用（只读） | 已保护 |
| `/api/admin/session` | DELETE | 退出并撤销会话 | Cookie 来源 | `requireAdminCsrf` | 已保护 |
| `/api/admin/session/refresh` | POST | 刷新并轮换会话 | `requireAdminUser` 重新检查角色 | `requireAdminCsrf` | 已保护 |

## 代码证据

- 管理员角色校验入口：`lib/admin-auth.ts` 的 `requireAdmin` / `requireAdminUser`。
- Cookie 与 CSRF：`lib/admin-session.ts` 的 `setAdminSessionCookies` / `requireAdminCsrf`。
- 聚合接口：`app/api/admin/image2/overview/route.ts:13`。
- 用户接口：`app/api/admin/users/route.ts:13`。
- 资产变更接口：`app/api/admin/image2-cases/changes/route.ts:31`、`:55`。
- 制作队列接口：`app/api/admin/jobs/route.ts:11`、`:24`。
- 会话接口：`app/api/admin/session/route.ts:19`、`:43`。
- 会话刷新：`app/api/admin/session/refresh/route.ts:15`。
- 自动化约束：`tests/image2-admin-operations.spec.ts` 会递归检查全部管理路由；新增未授权路由或缺少 CSRF 的写路由会令测试失败。

## 返回数据最小化

- `profiles`：仅返回 `id`、`email`、`display_name`、`role`、创建/更新时间。
- `entitlements`：仅聚合方案、状态和结束时间。
- `license_codes`：仅查询状态；不查询或返回卡密哈希。
- `license_redemptions`：仅查询结果；不查询或返回请求哈希、IP 哈希、User-Agent。
- 所有聚合响应使用 `Cache-Control: no-store, max-age=0`。

## 已知剩余风险

1. 普通用户会话仍在若干公开端组件中使用 `localStorage` 保存 access/refresh token。管理员会话已经完成 HttpOnly 迁移，但普通用户会话应在后续独立切片迁移到服务端 Cookie。
2. 聚合查询当前为有上限的只读列表聚合；当前数据量下准确。达到数千级权益/卡密/兑换记录前，应改为数据库聚合 RPC 或精确 count 查询，避免客户端聚合上限。
3. CSP 尚未启用。上线前需为 Next.js、Supabase、Cloudflare Turnstile、现有图片源制定 Report-Only 策略并观察误拦截，再切换强制模式。
4. Supabase 泄露密码保护仍未启用；OTP 管理员链路不依赖密码，但邮箱密码登录恢复前应单独开启。

## 明确不包含

- 本切片没有用户封禁、角色修改、余额调整、卡密生成/作废或会员权益变更接口。
- 本切片没有执行任何生产数据库写操作。
