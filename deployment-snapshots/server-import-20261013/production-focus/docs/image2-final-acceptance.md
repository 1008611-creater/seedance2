# Image2 重构与上线验收

- 正式站：<https://image2.cauai.fun>
- 采样日期：2026-10-06（UTC；北京时间为 2026-10-07，发布目录按北京时间命名）
- 当前发布：`/opt/image2-cauai` → `/opt/image2-cauai-release-20261007-focus`
- 当前 build：`QYVNW_63IF_EOjdjzqZd_`
- systemd：`image2-cauai.service`，Node 24.17.0，Next 16.4.0，监听 `127.0.0.1:3052`

## 产品主路径

用户从真实案例出发：看图发现 → 任务搜索与筛选 → 详情判断效果、来源、输入图和证据 → 阅读完整原文 → 变量或 JSON 字段编辑 → 检查差异 → 保存多个命名版本 → 带着完整提示词、参考图角色、约束和备注进入工作台 → 返回案例继续编辑 → 在个人方案空间中复用、导出和恢复。

首页承担发现和入口，案例库承担任务检索，详情承担证据和判断，保真编辑器承担改写，个人方案空间承担持续积累，工作台承担生产衔接。桌面三栏和手机弹层都围绕这条路径组织。

## 已完成的底层能力

- 四个指定来源的真实数据进入统一案例身份：ZeroLu 72、YouMind 128、EvoLink Commerce 83、YouArt 150；公开索引共 1620 条，原始存储 1661 条。
- 保留作者、多来源链接、源文件、快照哈希、上游 revision、收录时间、逐条许可声明和 rights notice。YouArt 无效果图的条目保持纯文本状态。
- EvoLink 每个 Example 独立保留输入图、提示词和输出图关系；输入与输出在数据和界面中分角色展示。
- 模型信息按证据记录；没有真实生成验证的案例显示未知或未实测，不根据仓库名伪造模型结论。
- JSON 通过字节范围替换字段，普通文本保留完整自由编辑；未修改字段、构图、画幅、镜头、人物/产品一致性和禁止项不会被通用摘要覆盖。
- 编辑器提供原文、完整执行稿、结构化字段、变量、约束线索、修改差异、撤销/重做、复制完整稿、多个命名版本和恢复原文。详情未加载原文时，恢复按钮保持禁用，避免空稿覆盖。
- 收藏、项目、备注、草稿、命名版本和生成记录进入统一个人方案空间。匿名、本地账号 owner、账号切换、完整备份、恢复失败回滚、配额失败回滚均有隔离处理。
- 双标签页同时修改同一草稿时保留两个完整稿；竞争内容进入版本或冲突副本，不再静默覆盖。跨标签和陈旧 read-modify-write 场景均有回归覆盖。
- 工作台接收完整稿、案例/版本身份、参考图角色、画幅、模型偏好、备注、缺失输入和返回链接；工作台返回后可继续编辑。保留视频与首帧创作入口；本次验证到方案传递与返回编辑，未执行真实视频生产。参考图链接仅供查看，未自动上传到供应商，生成前需要选择实际输入素材。
- 图片代理拒绝非 HTTPS、非白名单、非标准端口、userinfo、元数据地址和 SVG；重定向逐跳校验、超时和响应体上限生效。图片失败显示状态、来源和可用重试。
- 弹层共享焦点管理：打开聚焦内部控件、Tab/Shift+Tab 循环、Escape 关闭、返回原触发者；嵌套大图关闭返回详情内的图片按钮，详情关闭回案例卡片。手机切换到桌面后关闭手机详情层并释放页面滚动。
- URL 保存搜索、来源、分类、输入条件、排序、收藏、案例和个人方案视图；刷新、分享、浏览器前进后退与手机旧编号深链可恢复。

## 验证证据

候选构建的完整回归：`output/refactor-regression-final-candidate.json`，36/36 通过，0 skipped、0 flaky、0 unexpected。覆盖 JSON 字段保真、原文恢复、命名版本、差异、剪贴板、工作台往返、账号隔离、备份恢复、图片重试、URL 状态、ANS 接口、来源证据、同步幂等、内容质量、双标签竞争和弹层键盘焦点。

双标签专项连续 8 轮通过（第一次重构候选）；另有强制覆盖同一陈旧快照的专项，两个完整草稿均恢复。候选视觉验收 `output/acceptance-candidate/evidence.json`：13 个页面，1440px 与 390px 均采样，无水平溢出、无 page error；截图覆盖首页、案例库、详情、长 JSON 编辑器、个人方案、工作台、独立详情页和纯文本案例。真实 VR 缓存图、长 JSON 和图片失败重试状态已检查。

类型检查 `npm run typecheck` 通过，`git diff --check` 通过。候选 build 与发布 pin：

- build：`QYVNW_63IF_EOjdjzqZd_`
- index SHA-256：`94ad47559bf557751ea6d7f4dabef0eaa8d712df02bc67ce6eda8b8a3bc54120`
- `components/image2-case-library.tsx` SHA-256：`7fea1cc86cc6046abdecd523b214f715ae4eb55356a9044094d3904f6ea8559a`
- `components/use-dialog-focus.ts` SHA-256：`cecce8247b201142082f943206ba5d99ca626f8530543749daa5d0924254dc8e`
- `components/image2-prompt-editor.tsx` SHA-256：`79458f2b625d806c116c83c0edc4b85aeca3df076bce9ee425fb209abba1b0a1`

第一次重构正式切换与实际回滚证据：`output/refactor-deploy-evidence.txt`。发布脚本先停止独立候选，保留原正式目录到 `/opt/image2-cauai-rollback-20261007-0420`，把 `.env`、`.data` 和 `outputs` 移入 `/opt/image2-cauai-shared`，再以 symlink 切换。脚本实际执行：

1. 新版本启动并健康检查通过。
2. 切换到旧版本，旧 build `eDBmUbpNXJ0B3FNlm9eN4` 和旧 index 哈希核对通过。
3. 再切回第一次重构发布 `XrArtT6IhPQX1T6OqDsgI`，systemd active，首页、案例库和索引健康检查通过。
4. `.env` SHA-256 `9c8599dd4bfea10c157cd1889b1fbece42032f9010cb6e3b96887c2c8d2e952a` 前后一致；`.data/image2-free-quota.json` SHA-256 `4ba1a4a91808ec579cdb0b80a2c6db9895761674bca58ef674b5c2add191d5e2` 前后一致。

正式 HTTPS 首次发布核心回归 `output/refactor-regression-production.json`：8/8 通过，包含完整 JSON、剪贴板、命名版本、工作台传递与返回、立即账号切换、完整备份、URL 历史及双标签竞争。账号与云接口测试使用隔离模拟状态，不代表真实登录或云同步。

最终正式 HTTPS 核心回归 `output/refactor-regression-final-production.json`：10/10 通过，0 skipped、0 flaky、0 unexpected。在首次发布覆盖项上，补验桌面焦点循环、手机嵌套大图焦点返回、手机切到桌面后解除滚动锁和确定的陈旧快照竞争；账号与云接口仍使用隔离模拟状态。

最后发布版本的正式 HTTP `output/refactor-production-http.json`：16 个请求全部符合预期，核对首页、列表、工作台、旧编号与稳定 key 深链、索引哈希、四来源计数、canonical、OG、robots、849 项 sitemap、ANS 只读包、长 JSON 详情、VR 真实缓存图、缺 code 回调页面及未配置资产接口状态。

最后发布版本的正式视觉 `output/acceptance-final-production/evidence.json`：13 页桌面/手机样本，0 水平溢出、0 page error；人工检查了 390px 与 1440px 的 2939 字 JSON，以及 390px 的真实 VR 缓存图和上游图失败说明。该结果不等于全库图片均可加载，也不等于全面可访问性认证。

检索评测 `output/refactor-search-evaluation.json`：10 条中英文任务查询，覆盖电商主图、咖啡海报、香水广告、VR 头显、美甲、水彩人像、线稿、包装、服装详情页与参考照片。每条前十中均有符合预设目标的案例；这是小样本命中验证，未度量全量相关性或用户满意度。

焦点收尾版本发布证据：`output/refactor-final-deploy-evidence.txt`。正式链接已切到 `/opt/image2-cauai-release-20261007-focus`，build `QYVNW_63IF_EOjdjzqZd_`，systemd active。发布前后 `.env` 哈希均为 `9c8599dd4bfea10c157cd1889b1fbece42032f9010cb6e3b96887c2c8d2e952a`，当次 quota 文件哈希均为 `d760751bfa77e080c0c5916f1ec9d60ef94790f95181963f64526d8c5e4b6934`；数据使用共享路径，没有用构建目录覆盖运行数据。两次发布分别核对各自前后哈希，未将不同时刻的运行数据误称为全程不变。

## 数据与维护

索引当前版本 `20261007-paired-assets-v3`。同步器默认读取本地上游快照并做预演，不代表联网刷新：

```powershell
node tools/sync-image2-source-adapters.mjs
node tools/sync-image2-source-adapters.mjs --write
npm run build:image2-lite
```

刷新上游时要另外核对仓库 revision、源文件、原文和图片关系，再写入快照；同步器的重复运行保持稳定 ID，不覆盖个人资产。当前快照为 2026-10-05，本轮没有声称它是上游最新内容。

后续发布：准备新的 `/opt/image2-cauai-release-*`，完成构建、类型检查、相关回归、视觉验收和 HTTP 验收。构建期间 `.data` 与 `outputs` 保持为发布目录内的空目录，避免 Turbopack 跨根路径追踪失败；构建完成后再将运行时路径接到 `/opt/image2-cauai-shared`。使用 `tools/image2-release-switch.sh` 切换，已迁移为 symlink 的生产目录不再重复执行 bootstrap。退回本轮前的旧版：

```bash
bash /opt/image2-cauai-release-20261007-focus/tools/image2-release-switch.sh /opt/image2-cauai-rollback-20261007-0420
```

## 源码交付与完整性

最终源码包：`output/image2-release-20261007-focus.tar.gz`，旁附同名 `.sha256`。按源码白名单收录 3572 个文件，包含生成后的公开索引与逐条详情；不包含实际环境凭据、运行配额、用户输出、依赖、构建产物或 Git 历史。`.env.example` 等模板保留供部署使用。

逐文件 SHA-256 清单：`output/image2-final-source.sha256`。以源码包实际文件列表生成清单，已在正式发布目录执行 `sha256sum -c --quiet`，3572 个文件全部一致。源码包同时保存在服务器 `/home/niannian-admin/`，包哈希与本地一致；运行时共享数据保持独立。没有 commit 或 push。

## 未验证边界

本次没有调用 McGrox 生图、上传素材、付费或真实生成，因此没有把任何案例标为本站实测效果。没有真实 Supabase 配置，真实登录、OAuth 回调、云端资产同步和登录后跨设备恢复未验收；`/api/image2/assets` 在本次未配置 Supabase 的部署中返回 503；这项结果不代表登录与云同步通过。没有逐条对全库图片做人眼核验。上游快照也未联网刷新。

旧域重定向和旧浏览器资产迁移沿用已取消决定，不纳入本次发布。