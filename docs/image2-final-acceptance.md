# Image2 案例库升级 · 最终验收报告

- **新网址**：<https://image2.cauai.fun>
- **报告时间**：2026-10-06
- **生产环境**：103 服务器 `/opt/image2-cauai`，systemd `image2-cauai.service`，监听 `127.0.0.1:3052`，Next 16.2.10 + Node v24.17.0，nginx 反代 + Cloudflare
- **数据版本**：`v=20261005-multisource-v2`（勿回退）

> **证据口径说明**：本报告区分三类状态——「本次实测」为 2026-10-06 由本次执行直接验证；「前序记录」为该项目前序会话已完成的验证，本次未复验；「未完成」为明确缺口。不做推断冒充实测。

---

## 一、完成状态

| 项 | 状态 | 证据 |
|---|---|---|
| 新域名可访问 | 本次实测 | `https://image2.cauai.fun/` → 200 |
| 案例库可检索 | 本次实测 | `/image2-cases` → 200，卡片正常渲染 |
| 收录总数 | 本次实测 | `totalCases = 1569`（index），library 1610 |
| 四来源接入 | 本次实测 | 见第二节 |
| 搜索引擎信息 | 本次实测 | `/robots.txt`、`/sitemap.xml` 均 200，指向新域 |
| 中文多词搜索 | 前序记录 | 前序会话实测（见第四节基准值） |
| 移动端交互 | 前序记录 | 前序会话 Playwright 实测 |
| 旧域名迁移 | **已作废** | 用户 2026-10-06 决定：旧站不再使用，不做跳转与迁移 |
| `/migrate` 迁移页 | **已撤除** | 本次实测：上线验证 200 → 按决定撤除 → 现为 404 |
| 图片代理安全加固 | 本次实测 | 见第四节；线上 11 项验收全通过 |

---

## 二、四个来源的接入数量

统计口径：数字均来自 `public/data/image2-case-library.index.json` 的实际数据，**不是**上游 README 宣称的总数。

| 来源项目 | 仓库 | 收录 | 上游标注模型 | 图片情况 |
|---|---|---|---|---|
| ZeroLu / awesome-gpt-image | `ZeroLu/awesome-gpt-image` @ `913388c` | **72** | GPT Image 2 | README 公开案例，保留原始提示词与作者链接 |
| YouMind / awesome-gpt-image-2 | `YouMind-OpenLab/awesome-gpt-image-2` @ `d827dcb` | **128** | GPT Image 2 | 仅覆盖 README 可见带编号案例，不计站点宣称总量 |
| EvoLinkAI / gpt-image-2.5-for-e-commerce | `EvoLinkAI/gpt-image-2.5-for-e-commerce` @ `main` | **32** | gpt-image-2.5 | 保留「输入产品图 + 操作目的 + 输出图」配对 |
| YouArt / awesome-gpt-image-2-5-prompts | `youart-open-source/...` @ `f7f6276` | **150** | gpt-image-2.5 | **全部为纯文本提示词**，仓库无逐条效果图，本站按「仅提示词」展示，不补通用示例图 |

**四来源合计 382 条。**

### 全库来源分布（11 个来源，合计 1569）

| 来源 | 条数 | | 来源 | 条数 |
|---|---:|---|---|---:|
| canghe | 441 | | morphic | 40 |
| evolink（存量归档） | 490 | | zerolu | 72 |
| wuyoscar | 162 | | evolink-commerce-25 | 32 |
| youart-25 | 150 | | image2studio | 24 |
| youmind | 128 | | fotor-blog | 24 |
| picsart-blog | 6 | | **合计** | **1569** |

### 图片与提示词构成（index 1569 条）

- `imageStatus`：`available` 229 条 / `text-only` 151 条 / 未标注 1189 条
- 无 `imageUrl`：**151 条**（即 text-only，主体为 youart-25）
- 含多图（`extraImageUrls`）：94 条
- 含图片角色标注（`imageRoles`，区分输入图/输出图）：229 条
- `promptKind`：英文 833 / 中文 334 / 中英混合 238 / JSON 结构化 164

### 图片截断修复（2026-10-06 补充）

`tools/sync-image2-source-adapters.mjs` 的 `images()` 原有一个 `.slice(0, 16)` 硬上限。EvoLink 电商把多个 Example 的图表收在**同一个 Case 块**内，导致 4 个块被静默截断（实际 23/21/24/22 张 → 各截到 16），**共丢 26 张图**。

修复：上限 `16 → 48`（覆盖现有最大块 24 张，仍可挡住异常膨胀）。

上线后验收（index 口径）：

| 检查项 | 结果 |
|---|---|
| 影响面 | 仅 `evolink-commerce-25`，其余 10 个来源逐项不变 |
| 该来源图片 | **+26 张**（Case 1 从 16 → 23 张） |
| 条目总数 | 仍 **1569**，不变 |
| index 体积 | +11KB（2476623 → 2487908） |
| 新补图线上加载 | 抽验全部 200 `image/png` |

### 待处理与已知限制

| 项 | 数量 | 说明 |
|---|---:|---|
| 仅文本（无效果图） | 151 | youart-25 主体；页面明确标注，未用通用图替代 |
| 上游已下线（存量归档） | 490 | evolink 上游仓库已下线，保留最后一次成功导入的记录 |
| 图片不可用被过滤 | 41 | library 1610 → index 1569 的差额，因图片不可用未进入前台 |
| 许可待确认 | 全库 | 每个来源均附 `licenseNote`；上游代码许可证不自动覆盖作者图片，商用前需逐条核查 |

---

## 三、已实现的用户完整路径

目标路径：**看图发现 → 精确筛选 → 查看原图与原文 → 理解结构与参考图要求 → 替换变量 → 复制或保存变体 → 进入已有工作台**

| 环节 | 实现情况 |
|---|---|
| 看图发现 | 首页真实案例图首屏；分类计数（13 类，如「UI 与界面」380、「海报与排版」273） |
| 精确筛选 | 来源筛选 + 分类筛选；筛选状态进入 URL，支持刷新恢复、分享、前进后退 |
| 查看原图与原文 | 详情页可放大、多图切换；原始提示词不截断不改写 |
| 理解结构 | 中文辅助理解与原文严格区分；可复用结构（主体/构图/镜头/光线/材质/配色/文字/约束） |
| 替换变量 | 工作台结构化改写，原文只读保留，变量编辑实时更新 |
| 复制或保存变体 | 复制原文 / 复制改写版；收藏与变体保存 |
| 进入工作台 | 保留原有工作台与视频创作入口，图库非孤岛 |

---

## 四、测试与线上验收结果

### 本次实测（2026-10-06）

- 新域全部入口：`/` 200、`/image2-cases` 200、`/robots.txt` 200、`/sitemap.xml` 200
- `/image2-social-commerce` → **308** 收敛至 `/image2-cases`（防两站内容污染逻辑生效）
- 案例库卡片实际渲染，浏览器无 console / page error
- 收录总数切换前后恒为 **1569**，各来源计数未漂移
- 服务重启后 `systemctl is-active` = active；本地探测全 200

### 前序会话记录（本次未复验）

- 中文多词搜索基准：`电商主图` 87、`电商 主图` 87、`E-commerce Main Image` 76、`banner 海报` 17
- 移动端 390×844：点卡片打开详情、不误触收藏、返回键先关弹层、关闭后历史栈干净
- 数据幂等性：连跑两次同步 + 构建，index 除 `importedAt` 外逐字节一致

### 图片代理安全加固（2026-10-06 补充）

原 `/api/image2/proxy` 存在可利用缺陷：明文 http 放行、hostname 校验不含端口、fetch 自动跟随重定向（白名单仅保护第一跳 → SSRF）、无超时、接受 `image/svg+xml`（同源渲染可执行脚本 → 借代理读取本域 localStorage）。

修复要点：仅 https、仅标准端口、拒绝 userinfo、白名单精确匹配；手动逐跳校验重定向（上限 3 跳）；只放行栅格 MIME；流式读取封顶 12MiB，读取阶段单独计时。

上线验收（2026-10-06 实测，11/11 通过）：

| 请求 | 结果 |
|---|---|
| R2 / Twimg / YouMind 图片 | 200 |
| GitHub user-attachments（302 到 S3） | 200（补白名单后未回归） |
| 明文 http / 非白名单域 / 非标端口 / userinfo | 404 |
| `169.254.169.254`（云元数据） | 404 |
| SVG 及非图片类型 | 415 |

**补充修复（2026-10-06）**：白名单漏了来源站的重定向目标，导致 `morphic` 的 40 条案例图片全部 404（`morphic.com` 会 308 跳到 `external-cdn.morphic.com`）。系统性排查 10 个来源后确认：只有 `morphic` 与 `github` 会重定向；已补入 `external-cdn.morphic.com`（白名单现 13 个域）。上线后全站 10 个来源抽样全部 200。

### 仓库内改动复核（2026-10-06 下午，独立复跑）

针对仓库内未提交的改动，在本地生产构建（`next build` 退出码 0，65 页）上独立复跑：

| 项 | 结果 |
|---|---|
| `tsc --noEmit` | 0 错误 |
| `next build` | 退出码 0，`ƒ Proxy (Middleware)` 存在 |
| `smoke-image2-domains --only=legacy,seo` | **31/31 通过**（旧域 308、`/migrate` 不再豁免、scene 收敛、robots/sitemap/canonical 指向新域） |
| Playwright 四套件（domain-pages / case-assets / commercial-home / content-quality） | **43/43 通过**（39.2s） |
| 同步器幂等 | 未改上游 → `importedAtPreserved=true`；改一条上游提示词 → `false` 且 `--write` 真实落盘；再跑一次 → 恢复 `true` |

### 真实规模性能实测（2026-10-06 补，当前数据量 1569 条）

测量方式：本地生产构建（`next start`）+ 无头 Chromium 1440×900，**5 次冷加载**取中位数。
脚本 `output/audit-artifacts/image2-perf.cjs`（该目录在 .gitignore 内，属审计产物）。

| 指标 | 结果 |
|---|---|
| TTFB | 6ms（本地，不含公网 RTT） |
| FCP | **44ms** |
| LCP | **556ms** |
| 首卡可见（DCL 起算） | **563ms** |
| DOM 节点数 | 1655 |
| 首页 index 传输量（压缩后） | **427 KB**（源 JSON 2.5 MB） |

搜索响应（输入 → 结果计数刷新，客户端筛选）：

| 查询 | 耗时 | 命中 |
|---|---|---|
| `电商主图` | 80ms | 87 |
| `banner 海报` | 35ms | 17 |
| `E-commerce Main Image` | 47ms | 76 |
| `E295-361` | 19ms | 1 |
| `人像` | 70ms | 220 |

**交叉验证**：命中数（87 / 17 / 76）与前序会话记录的基准值逐条一致，说明数据未漂移。

**口径说明**：本项测的是**当前真实规模 1569 条**。原验收要求写的是「使用接近实际规模的数据，
不拿几十条样例冒充大规模性能」——1569 就是实际规模，故按实际规模测；
未构造 10k 级合成样本，因为那与线上真实负载无关。

### 未做

- 未构造万级（10k+）合成样本做极限压测（真实规模已测，见上）
- 未逐图视觉检查全部案例（抽查为主）

---

## 五、同步与回滚方法

### 同步

```bash
# 在仓库内（image2-site）
node tools/sync-image2-source-adapters.mjs --write   # 拉取四个来源 → 统一结构
node tools/build-image2-lite-data.mjs                # 生成 index + 分片详情
```

幂等：同批输入重复执行不产生重复条目；`importedAt` 之外内容不变。上游临时失败不会清空本站。

> 该判定依赖 `current.cases` 是磁盘快照：同步器已用 `structuredClone(current.cases)` 与合并阶段的原地改写隔离。
> 若不隔离，上游内容变更会被误判为「无变化」而**静默跳过写入**（2026-10-06 已复现并修复）。

### 构建与上线

```bash
# 服务器构建目录
export PATH=/opt/node24/bin:$PATH
export NEXT_PUBLIC_IMAGE2_SITE_URL=https://image2.cauai.fun
cd /home/niannian-admin/image2-build-next && npm run build
bash /home/niannian-admin/cutover.sh
```

`cutover.sh` 会：备份当前生产到 `/opt/image2-cauai-backup-20261005`（保留 `-20261005b`）→ 整目录替换 → 重写 systemd unit → 重启 → 自检总数与来源计数。

### 回滚

| 层 | 方法 |
|---|---|
| 代码 / 构建 | `sudo cp -a /opt/image2-cauai-backup-20261005/. /opt/image2-cauai/ && sudo systemctl restart image2-cauai` |
| systemd unit | 备份在 `/tmp/image2-cauai.service.bak-20261006` |
| 数据 | 由 `sync-image2-source-adapters.mjs` 重建；同步器自检失败时不写文件 |
| 凭据 | 生产 `.env`（600）不在构建目录内，`cutover.sh` 不会覆盖它 |

---

## 六、未完成事项及原因

| 项 | 原因 |
|---|---|
| 旧域名跳转与本地数据迁移 | **用户决定作废**：旧站不再使用，无人知晓旧站网址。缺口从「未完成」转为「已取消」 |
| `http://image2.cauai.fun` 未强制跳 HTTPS | 需在 Cloudflare 打开 Always Use HTTPS，属外部配置 |
| 全库许可逐条核查 | 上游内容权利不明确；本站仅保留来源入口与 `licenseNote`，未宣称可商用 |
| 万级规模性能压测 | 真实规模（1569）首屏与搜索量化指标已补齐（见第四节）；未构造 10k+ 合成样本 |
| 未跟踪文件未纳入 git | `app/robots.ts`、`app/sitemap.ts`、`tools/`、`docs/` 等仍未提交；未获 commit / push 授权 |

### 文档状态

`docs/image2-domain-migration.md` 已按旧域作废与 `/migrate` 撤除重写（2026-10-06），并在当日下午与代码对齐：
原先「`/migrate` 保留 matcher 豁免」的表述已更正——该豁免已随页面撤除一并删除，实测旧域 `/migrate` 走 308 到新域后再由新域返回 404。
