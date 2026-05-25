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
https://image2.lsb0713.online/admin
```

后台会读取 `ADMIN_TOKEN`。本机开发口令放在 `.env.local`，线上口令需要在 Vercel 环境变量中配置。

工作流：

1. 用户在前台提交任务，系统扣除今日额度。
2. 管理员进入 `/admin`，复制任务包。
3. 管理员在外部视频平台完成人工生成。
4. 将成片上传到对象存储或其他可公开访问的位置。
5. 在后台填入成片链接并发布，用户端自动进入成片库。

主链路 smoke：

```powershell
$env:SEEDANCE_SMOKE_BASE_URL="http://127.0.0.1:3012"
$env:SEEDANCE_SMOKE_ADMIN_TOKEN=$env:ADMIN_TOKEN
npm run smoke:seedance-main-chain
```

该脚本会用临时用户验证领取周卡、提交任务、后台发布成片、用户成片库可见，以及失败任务退额。

## 可选：数字人口播包装层

仓库新增了一个 Hyperframes 包装层入口，用来把旧数字人项目输出的口播视频包装成 16:9 成片：右侧放人物，左侧放结构化信息卡片，字幕按 SRT 时间轴同步，音频默认沿用视频原声。
脚手架也会生成 `operator-checklist.md`，记录公众号工作法里的素材清理、字幕时间轴、预览检查和最终渲染步骤。

```powershell
npm run hyperframes:digital-human:demo
```

详细 manifest 格式和自定义接入方式见 `docs/digital-human-hyperframes-packaging.md`。

## 可选：Seedance 数据库存储

默认仍使用本地 `.data/seedance-store.json`，Vercel 上未切库时使用临时 runtime 存储。要切到 Supabase，先在 Supabase SQL Editor 执行：

```text
supabase/migrations/202605250002_seedance_guest_store.sql
```

如果你在本机配置了数据库迁移凭据，也可以让脚本推送：

```powershell
# 任选其一：
# 1. SUPABASE_DB_URL=postgresql://...
# 2. SUPABASE_ACCESS_TOKEN + SUPABASE_PROJECT_REF + SUPABASE_DB_PASSWORD
npm run migrate:seedance-supabase
```

确认迁移完成后，再把环境变量改为：

```text
SEEDANCE_STORE_BACKEND=supabase
SEEDANCE_SEED_DEMO_CODES=true
```

本地切库验收建议先用人工履约通道跑 smoke，不要直接改线上：

```powershell
npm run check:seedance-supabase-migration
$env:SEEDANCE_STORE_BACKEND="supabase"
$env:VIDEO_PROVIDER="manual"
npm run start -- -p 3016

$env:SEEDANCE_SMOKE_BASE_URL="http://127.0.0.1:3016"
$env:SEEDANCE_SMOKE_ADMIN_TOKEN=$env:ADMIN_TOKEN
npm run smoke:seedance-supabase
```

`smoke:seedance-supabase` 会用 `seedance_supabase_smoke_` 临时用户验证领取、提交、后台发布、成片库、失败退额，并到 Supabase 表里核对记录；默认会清理测试用户。回滚只需要把 `SEEDANCE_STORE_BACKEND` 改回 `local` 或删除该变量。

迁移表使用当前前端的浏览器本地用户 ID，不要求先完成 Supabase Auth 改造；卡密只保存 `code_hash`，不会保存明文卡密。

## 可选：接入真实 Seedance API

复制 `.env.example` 为 `.env.local`，配置：

```text
APP_URL=https://image2.lsb0713.online
ADMIN_TOKEN=你的后台口令
BYTEPLUS_API_KEY=你的 ModelArk API Key
SEEDANCE_MODEL_ID=dreamina-seedance-2-0-260128
```

配置后，`POST /api/generations` 会调用 BytePlus ModelArk 创建异步视频生成任务；`POST /api/provider/seedance/callback` 用于接收状态回调。

生产环境还需要接入持久数据库和对象存储。详细落地方案见 `ARCHITECTURE.md`。
