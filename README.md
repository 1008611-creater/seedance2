# Seedance 2.0 周卡创作台 MVP

这是一个 Next.js MVP，用来验证“注册账号 -> 兑换卡密/领取周卡 -> 每日 2 次额度 -> 提交 Seedance 2.0 视频任务 -> 队列生成 -> 成片库”的完整链路。

## 本地运行

```powershell
npm install
npm run dev
```

默认地址：`http://localhost:3012`

演示卡密：

```text
WEEK-SEED-2026
VIP-720P-7D
FREEWEEK
```

## 当前包含

- 中文创作台前端，延续 `01` 效果图的浅色 SaaS 排版
- 账号资料、免费周卡领取、卡密兑换
- 每日 2 次额度，按北京时间自然日重置
- Seedance 2.0 合规视频规格：`adaptive/16:9/9:16/1:1/4:3/3:4/21:9`，`4/5/8/10/15s/智能时长`
- 文生视频、首帧图生、首尾帧、参考素材模式
- Next.js API 后端：权益、额度、生成任务、回调接口
- 未配置真实 API Key 时使用人工履约队列，适配外部平台手动/半手动生成

## 人工履约后台

后台地址：

```text
https://ai.lsb0713.online/admin
```

后台会读取 `ADMIN_TOKEN`。本机开发口令放在 `.env.local`，线上口令需要在 Vercel 环境变量中配置。

工作流：

1. 用户在前台提交任务，系统扣除今日额度。
2. 管理员进入 `/admin`，复制任务包。
3. 管理员在外部视频平台完成人工生成。
4. 将成片上传到对象存储或其他可公开访问的位置。
5. 在后台填入成片链接并发布，用户端自动进入成片库。

## 可选：接入真实 Seedance API

复制 `.env.example` 为 `.env.local`，配置：

```text
APP_URL=https://ai.lsb0713.online
ADMIN_TOKEN=你的后台口令
BYTEPLUS_API_KEY=你的 ModelArk API Key
SEEDANCE_MODEL_ID=dreamina-seedance-2-0-260128
```

配置后，`POST /api/generations` 会调用 BytePlus ModelArk 创建异步视频生成任务；`POST /api/provider/seedance/callback` 用于接收状态回调。

生产环境还需要接入持久数据库和对象存储。详细落地方案见 `ARCHITECTURE.md`。
