# Seedance 2.0 周卡站搭建方案

## 当前 MVP

仓库已经升级为 Next.js MVP：

- 前端：`app/page.tsx` + `components/creator-app.tsx`
- 后端 API：`/api/dashboard`、`/api/account`、`/api/claim`、`/api/redeem`、`/api/generations`、`/api/admin/jobs`、`/api/provider/seedance/callback`
- MVP 存储：本地 JSON 文件 `.data/seedance-store.json`，Vercel 上暂用 `/tmp` 兜底
- Provider：未配置 `BYTEPLUS_API_KEY` 时走人工履约队列；配置后走 BytePlus ModelArk Seedance 2.0 创建任务接口

## 人工履约模式

这版默认支持不依赖 API Key 的生产方式：

- 用户端照常提交提示词、比例、时长、素材和生成音频选项。
- 后端先检查周卡权益与每日额度，再创建 `queued` 任务。
- 管理员访问 `/admin`，通过 `ADMIN_TOKEN` 进入制作后台。
- 后台可复制任务包，记录使用的外部账号/窗口、外部任务链接和内部备注。
- 完成外部生成后，管理员把视频上传到对象存储/R2/其他公开位置，并将成片链接填回后台。
- 发布后任务变成 `succeeded`，用户前台成片库即可看到视频。

注意：当前代码不包含多账号自动化、自动操控第三方网页或绕过平台限制的脚本。生产上建议把人工履约和对象存储先跑稳，再评估合规的官方 API、团队版或商用授权通道。

## 官方参数结论

我用 Jina 查了 BytePlus 官方资料，核心判断如下：

- BytePlus ModelArk Seedance 2.0 创建任务是异步接口，提交后需要查询任务或接收 `callback_url` 状态回调；输出成功后拿 `content.video_url`。
- 官方 API 支持 `resolution: "720p"`。
- Seedance 2.0/2.0 fast 的 `duration` 支持 `[4,15]` 秒，也支持 `-1` 智能时长。
- 官方输出比例支持 `adaptive`、`16:9`、`4:3`、`1:1`、`3:4`、`9:16`、`21:9`。
- Seedance 2.0 支持文字、图片、视频、音频多模态输入；最多 9 张图、3 段视频、3 段音频；音频不能单独输入。
- 官方文档提示 Seedance 2.0 系列对含真人脸的参考图/视频有上传限制，产品里要有素材合规校验和提示。
- 视频生成是慢任务，真实站点应采用 `User -> Queue -> Provider -> Storage -> Notification`，不要把生成任务做成普通同步请求。

参考链接：

- [Seedance 2.0 官方介绍](https://seed.bytedance.com/en/seedance2_0)
- [BytePlus ModelArk Seedance 2.0 API Reference](https://docs.byteplus.com/en/docs/ModelArk/1520757)
- [Supabase Auth with Next.js](https://supabase.com/docs/guides/auth/quickstarts/nextjs)
- [AWS 生成式视频队列架构案例](https://builder.aws.com/content/3AlA7hO9tjhEwmsAEuY2A4sqka5/building-a-scalable-generative-ai-video-booth-on-aws-for-1200-conference-attendees)

## 推荐技术栈

当前 MVP 已使用：

- 前端：Next.js App Router + TypeScript + CSS
- 部署：Vercel
- 视频 Provider：BytePlus ModelArk Seedance 2.0 API 抽象

生产化建议：

- 账号：Supabase Auth 或 Clerk
- 数据库：Supabase Postgres
- 对象存储：Cloudflare R2 或 Supabase Storage，用于保存管理员上传的成片
- 队列：Upstash QStash/Redis，或 AWS SQS
- 管理端：Next.js `/admin` 路由，受管理员角色保护

增长后：

- API 层：独立 NestJS/Fastify 服务
- 队列：BullMQ + Redis 或 AWS SQS
- 存储：R2/S3，视频结果加签名 URL
- 风控：Turnstile/Captcha、IP/设备指纹、手机号或邮箱验证、异常额度冻结
- 监控：Sentry + PostHog + 队列深度报警

## 核心业务规则

卡密：

- 管理员批量生成卡密，字段包含 `code_hash`、`plan_id`、`expires_at`、`max_redemptions`、`created_by`。
- 用户兑换时只传明文卡密，后端哈希后比对。
- 同一账号只允许兑换一次免费周卡；可加设备/IP 限制防刷。
- 卡密兑换成功后生成一条 `entitlements` 权益记录，有效期 7 天。

额度：

- 周卡每天 2 次，按 Asia/Shanghai 自然日重置。
- 提交生成任务前先事务锁定额度，生成失败再按策略退回。
- 对安全拒绝、用户主动取消、供应商超时分别记录原因。

生成：

- 固定权益：`model = seedance 2.0`、`resolution = 720p`、单次最高 15 秒。
- 用户可选：比例、时长、文生/图生/参考素材、声音、私密可见、seed。
- 提交后立刻返回本地任务 ID，页面显示排队状态。
- 后端 worker 调用 BytePlus 创建任务，保存 provider task ID。
- 通过 `callback_url` 或轮询更新状态，成功后保存视频 URL 和封面。
- 非 API 模式下由管理员后台手动更新 `running`、`succeeded` 或 `failed` 状态。

## 数据表草案

```sql
profiles (
  id uuid primary key references auth.users(id),
  display_name text,
  role text default 'user',
  created_at timestamptz default now()
);

license_codes (
  id uuid primary key default gen_random_uuid(),
  code_hash text unique not null,
  plan text not null default 'weekly_free',
  max_redemptions int not null default 1,
  redeemed_count int not null default 0,
  expires_at timestamptz,
  created_at timestamptz default now()
);

entitlements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references profiles(id),
  plan text not null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  daily_limit int not null default 2,
  resolution text not null default '720p',
  duration_seconds int not null default 15
);

daily_usage (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references profiles(id),
  usage_date date not null,
  used_count int not null default 0,
  limit_count int not null default 2,
  unique (user_id, usage_date)
);

generations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references profiles(id),
  provider_task_id text,
  status text not null default 'queued',
  prompt text not null,
  mode text not null,
  ratio text default '16:9',
  resolution text default '720p',
  duration_seconds int default 15,
  video_url text,
  cover_url text,
  error_message text,
  created_at timestamptz default now(),
  completed_at timestamptz
);
```

## API 路由

- `POST /api/redeem`：校验登录、校验卡密、创建权益。
- `GET /api/me/entitlement`：返回当前周卡状态和今日额度。
- `POST /api/generations`：事务检查权益和额度，创建本地任务，入队。
- `GET /api/generations`：作品库和任务状态。
- `POST /api/provider/seedance/callback`：接收 Seedance 任务状态回调。
- `POST /api/admin/license-codes`：管理员批量生成卡密。

## Seedance 调用伪代码

```ts
await fetch("https://ark.ap-southeast.bytepluses.com/api/v3/contents/generations/tasks", {
  method: "POST",
  headers: {
    Authorization: `Bearer ${process.env.BYTEPLUS_API_KEY}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    model: process.env.SEEDANCE_MODEL_ID,
    content: [
      {
        type: "text",
        text: `${prompt} --rs 720p --rt ${ratio} --dur 15 --seed ${seed} --wm false`,
      },
    ],
    callback_url: `${process.env.APP_URL}/api/provider/seedance/callback`,
  }),
});
```

## 创新点

- 导演卡片：把提示词拆成主体、镜头、光线、节奏、声音五张卡，自动拼成高质量 prompt。
- 参考资产槽：最多 9 张图、3 段视频、3 段音频，对齐 Seedance 2.0 多模态能力。
- 额度可视化：提交时先显示“已锁定额度”，失败后明确是否退回。
- 排队透明：显示队列位置、预计等待、生成阶段，减少用户重复点击。
- 周卡裂变：用户生成的视频页带一个只读分享链接，观看者可领取一次试用卡密。
- 素材合规闸门：上传前检查文件类型、大小、时长和真人脸限制，减少供应商拒绝。

## 首版开发顺序

1. 做 Next.js + Supabase 登录、注册、会话保护。
2. 建表并实现卡密生成、兑换、周卡有效期。
3. 实现每日额度事务扣减。
4. 接入对象存储上传参考图/视频/音频。
5. 接入 Seedance 2.0 创建任务、回调或轮询。
6. 做任务状态、作品库、下载链接。
7. 做管理端和风控：卡密批量生成、封禁、失败退款、队列报警。
