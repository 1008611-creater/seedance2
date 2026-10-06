# Image2 域名迁移：image2.lsb0713.online → image2.cauai.fun

状态：**迁移已完成；旧域整条线已按 2026-10-06 决策作废。** 本文保留为现状记录与回滚参考。
最后更新：2026-10-06

> 证据口径：标「实测」的是 2026-10-06 直接探测/读码得到的结论；标「前序记录」的来自本项目前序会话，本次未复验。

## 一、当前决定

老大 2026-10-06 决定：**旧站不再使用**（无人知晓旧站网址），不投入旧域跳转与浏览器数据迁移。

由此产生三个连带结果：

1. 旧域 308 跳转**不再作为交付项**。`proxy.ts` 里的旧域跳转逻辑保留，但在旧域 DNS 不指向本站的前提下不会生效。
2. 浏览器本地数据迁移（收藏 / 草稿 / 历史 / 语言）**取消**。localStorage 按 origin 隔离，旧域数据不再回收。
3. `/migrate` 页面已从仓库**撤除**（实测：`https://image2.cauai.fun/migrate` → 404）。

## 二、仓库内保留的实现

1. **旧域 308（保留但当前不生效）**：`proxy.ts` 把 `image2.lsb0713.online`、`ai.lsb0713.online` 的页面路径 308 到 `resolveImage2SiteTarget()` 解析出的目标（默认 `https://image2.cauai.fun`），保留 pathname 与查询串，目标协议恒为 https。
2. **逃生开关**：`IMAGE2_DISABLE_LEGACY_REDIRECT=1` 可临时关闭旧域跳转（已登记在 `.env.example`，默认留空）。
3. **有意不跳转的例外**（matcher 层面）：
   - `/api/*`：避免在途请求被跨域 308 打断（跨域 POST 跟随重定向会因缺少 CORS 响应头失败）。
   - `/_next/*` 与带扩展名的静态资源（图片、favicon、`robots.txt`、`sitemap.xml`）。
   - 原为 `/migrate` 保留的豁免**已随迁移页撤除一并从 matcher 删除**（2026-10-06 实测：旧域 `/migrate` → 308 → `https://image2.cauai.fun/migrate` → 新域 404）。现在不再有任何只为迁移页存在的特例。
4. **场景域收敛**：`scene.lsb0713.online` 上的 `/image2-cases*`、`/admin/image2-cases*`、`/video-studio*` 308 回新域，避免两站同名路径内容互相污染。
5. **SEO**：`app/robots.ts`、`app/sitemap.ts` 按 host 区分 image2 / scene / picture 三套站点；image2 的 canonical / OG / sitemap 指向新域（实测：`/robots.txt`、`/sitemap.xml` 均 200）。

## 三、已撤除的部分

| 项 | 处置 | 说明 |
|---|---|---|
| `app/migrate/page.tsx` | 已删除 | 旧域作废后，该页成为指向 404 旧域的死链入口 |
| `components/legacy-storage-migration.tsx` | 已删除 | 迁移页 UI |
| `lib/legacy-storage-migration.ts` | **保留** | `proxy.ts` 依赖其中的 `resolveImage2SiteTarget()` |

**遗留死代码提示（未处理，待定）**：`lib/legacy-storage-migration.ts` 里除 `resolveImage2SiteTarget()` 外，`scanMigratableStorage` / `buildMigrationPayload` / `encodeMigrationPayload` / `decodeMigrationPayload` / `mergeMigrationPayload` / `buildMigrationLink` 等约 250 行迁移逻辑已无调用方。
该文件目前**未纳入 git 跟踪**，直接删除会丢失，故未动。若要清理，建议先纳入版本控制再删，或只保留 `resolveImage2SiteTarget` 与常量。

## 四、线上部署事实（前序记录，本次未复验）

- 入口：`https://image2.cauai.fun`（实测 200）。
- 承载：103 服务器 `103.85.227.94`，生产目录 `/opt/image2-cauai`，systemd `image2-cauai.service`，监听 `127.0.0.1:3052`，nginx 反代 + Cloudflare。
- 构建目录：`/home/niannian-admin/image2-build-next`；上线脚本 `cutover.sh`。
- **注意**：本文早期版本写的「Vercel 绑定新域」与实际情况不符——该站不在 Vercel 上。早期方案中的 DNS / Vercel / Supabase 回调 / Turnstile 等待授权项，随旧域作废一并取消。

## 五、剩余外部动作

| 项 | 说明 | 状态 |
|---|---|---|
| `http://image2.cauai.fun` 强制跳 HTTPS | 实测 `http://` 返回 200，未跳转。需在 Cloudflare 打开 Always Use HTTPS | 待授权（外部配置） |
| 仓库提交 | `app/robots.ts`、`app/sitemap.ts`、`lib/legacy-storage-migration.ts`、`tools/`、`docs/` 等仍未跟踪 | 待授权 |

## 六、回滚

| 层 | 方法 |
|---|---|
| 构建 / 代码 | `sudo cp -a /opt/image2-cauai-backup-20261005/. /opt/image2-cauai/ && sudo systemctl restart image2-cauai` |
| systemd unit | 备份在 `/tmp/image2-cauai.service.bak-20261006` |
| 旧域跳转 | 设置 `IMAGE2_DISABLE_LEGACY_REDIRECT=1` 并重新部署（当前旧域已不指向本站，通常无需操作） |
| 数据 | 案例库由 `tools/sync-image2-source-adapters.mjs` 重建；同步器自检失败时不写文件 |

**数据同步幂等口径**（实测，2026-10-06）：除 `importedAt` 外内容未变化时保留原 `importedAt` 并跳过写入；内容确有变化时必须写入。
该判定依赖 `current.cases` 是磁盘快照——`tools/sync-image2-source-adapters.mjs` 已用 `structuredClone(current.cases)` 与合并阶段的原地改写隔离，否则上游内容变更会被误判为「无变化」而静默丢弃。

## 七、验收命令

```powershell
# 本地生产模式起服务后（node node_modules/next/dist/bin/next start -p 3013）
curl.exe -s -o NUL -D - -H "Host: image2.lsb0713.online" http://127.0.0.1:3013/            # 期望 308 → https://image2.cauai.fun/
curl.exe -s -o NUL -D - -H "Host: image2.lsb0713.online" "http://127.0.0.1:3013/image2-cases?a=1"  # 期望 308 且保留 ?a=1
curl.exe -s -o NUL -D - -H "Host: image2.lsb0713.online" http://127.0.0.1:3013/api/image2   # 期望 200（不跳转）
curl.exe -s -o NUL -D - -H "Host: image2.lsb0713.online" http://127.0.0.1:3013/migrate     # 期望 308 → https://image2.cauai.fun/migrate（该路径已无豁免；新域侧为 404）
curl.exe -s -o NUL -D - -H "Host: scene.lsb0713.online" http://127.0.0.1:3013/image2-cases # 期望 308 → 新域
curl.exe -s http://127.0.0.1:3013/robots.txt   # 期望 Sitemap: https://image2.cauai.fun/sitemap.xml
curl.exe -s http://127.0.0.1:3013/sitemap.xml  # 期望包含 https://image2.cauai.fun/ 与 /image2-cases
```

线上回归用 `npm run smoke:image2-domains`（默认打新域、scene 域与 picture 域；`--only=legacy,seo` 可只跑旧域契约与 SEO 段）。

## 八、相关文档

- `docs/image2-final-acceptance.md` —— 最终验收报告（完成状态、四来源数量、测试结果、未完成事项）。
- `docs/image2-next-stage-prompt-system.md` —— 下一阶段提示词系统方案。
