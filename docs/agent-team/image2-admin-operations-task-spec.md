# Image2 Admin Operations Task Spec

## 背景和目标

任务等级：`XL`。本切片涉及生产管理员身份、Supabase 服务端读取、用户与会员数据、案例运营后台和管理接口授权；错误可能造成用户数据泄露或越权。

- `REQ-001`：将 `/admin/image2-cases` 从入口卡片页升级为站长可日常使用的受保护运营后台。
- `REQ-002`：后台总览必须读取真实静态案例指标，并通过管理员专用服务端接口读取当前数据库能提供的真实用户、会员、兑换和审计摘要。
- `REQ-003`：案例/提示词管理必须基于构建期案例索引提供只读搜索、来源筛选、质量检查和详情检查器。
- `REQ-004`：所有 `/api/admin/**` 数据接口必须服务端校验管理员身份；Cookie 认证的写接口必须执行同源 CSRF 校验。
- `REQ-005`：真实后端合同缺失时必须返回明确的 `unavailable`/`not_configured` 状态，不得伪造用户数、会员数、兑换量或运营增长数据。
- `REQ-006`：桌面与移动端必须能够完成总览、案例搜索和用户/会员状态查看。
- `REQ-007`：形成可执行的管理接口权限矩阵和剩余漏洞清单。

## 本次范围

- `TASK-001`：新增管理员聚合只读接口 `GET /api/admin/image2/overview`。
- `TASK-002`：服务端读取 `profiles`、`entitlements`、`license_codes`、`license_redemptions`；表不存在或未配置时逐资源降级，不泄露 Supabase 原始错误与密钥。
- `TASK-003`：主后台接入现有静态案例目录，并在登录门禁后由浏览器请求真实聚合数据。
- `TASK-004`：将“用户与会员”“兑换码/积分”“运营记录”的假数据/旧合同说明替换为真实状态或明确未接通状态。
- `TASK-005`：移除用户后台的手工 `ADMIN_TOKEN` 输入，统一使用 HttpOnly 管理员会话。
- `TASK-006`：增加权限矩阵测试、聚合接口测试和后台 UI focused tests。
- `TASK-007`：生产模式本地验证后，使用真实浏览器验证桌面与移动布局；真实管理员登录仅在获得最新六位 OTP 后执行。

## 本次不做

- `NON-001`：不新增、删除、禁用或修改生产用户。
- `NON-002`：不生成、展示或作废生产卡密明文。
- `NON-003`：不修改生产积分、余额、会员权益或案例内容。
- `NON-004`：不把静态案例内容迁移进 Postgres。
- `NON-005`：不把缺少采集合同的复制率、生成率、活跃率或收入写成估算值。
- `NON-006`：本切片不启用 Supabase 泄露密码保护，不调整 Auth 提供商配置。

## 业务规则

- `RULE-BIZ-001`：总览指标必须标注数据来源与采集状态。
- `RULE-BIZ-002`：案例列表只读；任何“审查登记”仅限浏览器临时状态并明确标注 dry-run。
- `RULE-BIZ-003`：卡密摘要最多返回状态计数，不返回 `code_hash`、请求哈希、IP 哈希或明文卡密。
- `RULE-BIZ-004`：用户摘要可返回管理员日常运营必要的邮箱、角色、注册时间和权益摘要；不得返回访问令牌、刷新令牌、密码字段或认证元数据。

## 权限规则

- `RULE-AUTH-001`：`GET /api/admin/image2/overview` 必须调用 `requireAdmin`，匿名为 401，普通已登录用户为 403。
- `RULE-AUTH-002`：生产环境不允许隐式共享 `ADMIN_TOKEN` 绕过角色校验。
- `RULE-AUTH-003`：所有 Cookie 认证的 `POST/PUT/PATCH/DELETE` 管理接口必须调用 `requireAdminCsrf`，再做管理员授权。
- `RULE-AUTH-004`：管理员 UI 门禁不是授权边界；所有真实数据仍由受保护 API 返回。
- `RULE-AUTH-005`：接口响应和日志不得包含 Supabase service key、用户 JWT、Cookie 或 OTP。

## 数据规则

- `RULE-DATA-001`：静态案例摘要读取 `public/data/image2-case-library.index.json`。
- `RULE-DATA-002`：动态摘要只使用服务端 Supabase 配置和 service-role 请求。
- `RULE-DATA-003`：单个可选表缺失不得令整个总览失败；资源状态标记为 `unavailable` 并给出安全的中文说明。
- `RULE-DATA-004`：聚合接口必须 `Cache-Control: no-store, max-age=0`。
- `RULE-DATA-005`：分页/limit 参数必须有严格数值边界。

## 影响范围

- `app/admin/image2-cases/page.tsx`
- `app/admin/users/page.tsx`
- `app/api/admin/image2/overview/route.ts`
- `components/image2-admin-console.tsx`
- `components/admin-users-console.tsx`
- `lib/image2-admin-overview.ts`
- `tests/image2-admin-operations.spec.ts`
- `docs/security/image2-admin-permission-matrix.md`

## 验收标准

- `AC-001`：未登录访问主后台只显示登录门禁，不能从聚合接口获得数据。
- `AC-002`：管理员会话可以进入同一主后台，并自动加载真实聚合数据，无需输入 `ADMIN_TOKEN`。
- `AC-003`：总览显示真实案例数、来源覆盖、待复核量，以及数据库资源的真实计数或明确未接通状态。
- `AC-004`：案例管理可搜索标题/提示词/来源/标签，可按来源筛选，可打开只读检查器；无修改、删除或发布请求。
- `AC-005`：用户与会员视图只显示允许字段；卡密视图不返回哈希或明文。
- `AC-006`：权限矩阵覆盖所有 `/api/admin/**` 方法；所有写方法具备 CSRF 保护或有明确的非 Cookie 例外证据。
- `AC-007`：`typecheck`、focused tests、生产构建通过。
- `AC-008`：桌面与移动端无关键横向溢出，导航、搜索、表格/卡片和详情检查器可用。
- `AC-009`：生产真实登录完整链路若未执行，必须明确标记为等待最新六位 OTP，不得声称已通过。

## 待确认事项

- 无阻塞产品决策。数据库表存在性通过只读探测处理；生产 OTP 验收在实现和本地审查完成后再请求用户配合。
