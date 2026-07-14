"use client";

import { type ReactElement, useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowUpRight,
  BookOpenCheck,
  Check,
  ChevronRight,
  ClipboardCheck,
  Copy,
  Database,
  Eye,
  FileClock,
  FolderTree,
  Gauge,
  LayoutDashboard,
  LockKeyhole,
  PanelRightOpen,
  Search,
  ShieldCheck,
  Tags,
  UsersRound,
  WalletCards,
  X
} from "lucide-react";
import type { Image2AdminCase, Image2AdminCatalog, Image2AdminReviewItem } from "@/lib/image2-admin-catalog";
import styles from "./image2-admin-console.module.css";
import visualStyles from "./image2-admin-case-visuals.module.css";

type AdminView = "overview" | "catalog" | "taxonomy" | "members" | "wallet" | "review" | "audit";
type ReviewState = "all" | "queued" | "reviewed";

type Props = {
  catalog: Image2AdminCatalog;
  accessReason: string;
};

const navigation: Array<{ id: AdminView; label: string; icon: typeof LayoutDashboard; note: string }> = [
  { id: "overview", label: "总览", icon: LayoutDashboard, note: "数据健康与待办" },
  { id: "catalog", label: "案例 / 提示词", icon: BookOpenCheck, note: "静态索引只读" },
  { id: "taxonomy", label: "分类与标签", icon: Tags, note: "目录治理" },
  { id: "members", label: "用户与会员", icon: UsersRound, note: "合同未接通" },
  { id: "wallet", label: "兑换码 / 积分", icon: WalletCards, note: "合同未接通" },
  { id: "review", label: "内容审核", icon: ClipboardCheck, note: "本地 dry-run" },
  { id: "audit", label: "运营记录", icon: FileClock, note: "现有变更日志" }
];

function formatDate(value?: string) {
  if (!value) return "索引未记录";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "索引未记录";
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  }).format(date);
}

function truncate(value: string, length = 144) {
  return value.length > length ? `${value.slice(0, length)}...` : value;
}

function accessStatus(label: string, status: "ready" | "contract" | "dry") {
  const text = status === "ready" ? "已读取" : status === "dry" ? "仅本地" : "未接通";
  return (
    <span className={`${styles.status} ${styles[status]}`}>
      <i aria-hidden="true" />
      {label} · {text}
    </span>
  );
}

function EmptyContract({ title, body, tables, endpoint }: { title: string; body: string; tables: string[]; endpoint: string }) {
  return (
    <section className={styles.contractPanel} aria-label={title}>
      <div className={styles.contractIcon}>
        <LockKeyhole aria-hidden="true" />
      </div>
      <div>
        <span className={styles.sectionKicker}>只读合同</span>
        <h2>{title}</h2>
        <p>{body}</p>
      </div>
      <div className={styles.contractGrid}>
        <div>
          <span>已发现表</span>
          <strong>{tables.join(" · ")}</strong>
        </div>
        <div>
          <span>需要的安全接口</span>
          <code>{endpoint}</code>
        </div>
        <div>
          <span>当前边界</span>
          <strong>不请求 Supabase，不展示用户或卡密数据</strong>
        </div>
      </div>
    </section>
  );
}

function CaseInspector({ item, onClose, onQueue }: { item: Image2AdminCase; onClose: () => void; onQueue: () => void }) {
  return (
    <aside className={styles.inspector} aria-label="案例检查器">
      <div className={styles.inspectorHead}>
        <div>
          <span className={styles.sectionKicker}>案例检查器</span>
          <h2>{item.title}</h2>
        </div>
        <button className={styles.iconButton} type="button" onClick={onClose} aria-label="关闭案例检查器" title="关闭">
          <X aria-hidden="true" />
        </button>
      </div>

      <div className={visualStyles.inspector}>
        <span>案例图像</span>
        <strong>候选后台不加载远程案例图</strong>
        <small>{item.caseKey}</small>
      </div>

      <dl className={styles.inspectorMeta}>
        <div><dt>案例键</dt><dd>{item.caseKey}</dd></div>
        <div><dt>来源</dt><dd>{item.sourceName}</dd></div>
        <div><dt>分类</dt><dd>{item.categoryLabel}</dd></div>
        <div><dt>价值</dt><dd>{item.valueScore} / {item.valueTier}</dd></div>
      </dl>

      <section className={styles.promptPreview}>
        <span>提示词摘要</span>
        <p>{item.promptPreview || "索引未提供提示词摘要。"}</p>
      </section>

      <div className={styles.inspectorActions}>
        <button className={styles.primaryButton} type="button" onClick={onQueue}>
          <ClipboardCheck aria-hidden="true" />
          创建本地审查任务
        </button>
        {item.sourceUrl ? (
          <a className={styles.secondaryButton} href={item.sourceUrl} target="_blank" rel="noreferrer">
            <ArrowUpRight aria-hidden="true" />
            打开原始来源
          </a>
        ) : null}
      </div>
    </aside>
  );
}

export function Image2AdminConsole({ catalog, accessReason }: Props) {
  const [activeView, setActiveView] = useState<AdminView>("overview");
  const [query, setQuery] = useState("");
  const [sourceFilter, setSourceFilter] = useState("all");
  const [selectedCase, setSelectedCase] = useState<Image2AdminCase | null>(null);
  const [reviewState, setReviewState] = useState<ReviewState>("queued");
  const [reviewedKeys, setReviewedKeys] = useState<Set<string>>(() => new Set());
  const [localEvents, setLocalEvents] = useState<string[]>([]);
  const [notice, setNotice] = useState(accessReason);

  const filteredCases = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase("zh-CN");
    return catalog.cases.filter((item) => {
      const bySource = sourceFilter === "all" || item.sourceId === sourceFilter;
      const haystack = [item.title, item.categoryLabel, item.sourceName, item.promptPreview, item.styles.join(" ")]
        .join(" ")
        .toLocaleLowerCase("zh-CN");
      return bySource && (!normalized || haystack.includes(normalized));
    });
  }, [catalog.cases, query, sourceFilter]);

  const filteredReviewItems = useMemo(() => {
    const items = catalog.reviewItems.filter((item) => sourceFilter === "all" || item.sourceId === sourceFilter);
    if (reviewState === "reviewed") return items.filter((item) => reviewedKeys.has(item.caseKey));
    if (reviewState === "queued") return items.filter((item) => !reviewedKeys.has(item.caseKey));
    return items;
  }, [catalog.reviewItems, reviewedKeys, reviewState, sourceFilter]);

  function queueReview(item: Image2AdminCase) {
    setReviewedKeys((current) => new Set(current).add(item.caseKey));
    setLocalEvents((current) => [`本地审查任务：${item.caseKey} · ${item.title}`, ...current].slice(0, 8));
    setNotice(`已在本地 dry-run 中登记 ${item.caseKey}；没有写入案例库或 Supabase。`);
  }

  async function copyCaseKey(item: Image2AdminCase) {
    try {
      await navigator.clipboard.writeText(item.caseKey);
      setNotice(`已复制案例键 ${item.caseKey}。`);
    } catch {
      setNotice("浏览器未授权剪贴板。案例键可从检查器中手动复制。");
    }
  }

  function renderOverview() {
    return (
      <>
        <section className={styles.metricGrid} aria-label="案例库摘要">
          <article><span>静态案例</span><strong>{catalog.totalCases.toLocaleString()}</strong><small>读取 `image2-case-library.index.json`</small></article>
          <article><span>来源归属已映射</span><strong>{catalog.integrity.sourceRegistryCoverage}%</strong><small>按 sourceId 是否映射到来源注册表计算</small></article>
          <article><span>待来源归属复核</span><strong>{catalog.integrity.withoutSourceRegistry.toLocaleString()}</strong><small>仅统计未映射来源，不把懒加载链接当成缺失</small></article>
          <article><span>本地已登记审查</span><strong>{reviewedKeys.size}</strong><small>只保存在当前浏览器会话</small></article>
        </section>

        <section className={styles.twoColumn}>
          <article className={styles.panel}>
            <div className={styles.panelHead}>
              <div><span className={styles.sectionKicker}>内容概况</span><h2>分类密度</h2></div>
              {accessStatus("案例索引", "ready")}
            </div>
            <div className={styles.barList}>
              {catalog.categories.slice(0, 8).map((item) => (
                <div key={item.value}>
                  <div><span>{item.label}</span><b>{item.count}</b></div>
                  <i><em style={{ width: `${Math.max(5, (item.count / Math.max(...catalog.categories.map((row) => row.count))) * 100)}%` }} /></i>
                </div>
              ))}
            </div>
          </article>

          <article className={styles.panel}>
            <div className={styles.panelHead}>
              <div><span className={styles.sectionKicker}>运营待办</span><h2>无需写库的检查项</h2></div>
              {accessStatus("dry-run", "dry")}
            </div>
            <ol className={styles.taskList}>
              <li><span>01</span><div><strong>核查来源归属</strong><small>{catalog.integrity.withoutSourceRegistry.toLocaleString()} 条未映射到来源注册表；案例原始 URL 属于详情懒加载数据，不在本页判缺。</small></div></li>
              <li><span>02</span><div><strong>复核低分案例</strong><small>{catalog.integrity.belowReviewScore.toLocaleString()} 条低于本地阈值 60，适合先整理为灵感参考层。</small></div></li>
              <li><span>03</span><div><strong>补齐可执行后台合同</strong><small>角色会话、聚合只读接口、审计写入仍没有安全管理路由。</small></div></li>
            </ol>
          </article>
        </section>

        <section className={styles.panel}>
          <div className={styles.panelHead}>
            <div><span className={styles.sectionKicker}>重点案例</span><h2>高价值案例抽样</h2></div>
            <button className={styles.textButton} type="button" onClick={() => setActiveView("catalog")}>进入案例管理 <ChevronRight aria-hidden="true" /></button>
          </div>
          <div className={styles.featuredGrid}>
            {catalog.featuredCases.slice(0, 6).map((item) => (
              <button className={styles.featuredCase} type="button" key={item.caseKey} onClick={() => setSelectedCase(item)}>
                <CaseVisual item={item} className={visualStyles.featured} />
                <div><span>{item.categoryLabel}</span><strong>{item.title}</strong><small>{item.sourceName} · {item.valueScore} 分</small></div>
              </button>
            ))}
          </div>
        </section>
      </>
    );
  }

  function renderCatalog() {
    return (
      <section className={styles.panel}>
        <div className={styles.panelHead}>
          <div><span className={styles.sectionKicker}>案例 / 提示词</span><h2>静态索引检查</h2><p>搜索和筛选直接作用于现有的构建期案例索引；这里不提供修改、删除或发布动作。</p></div>
          {accessStatus("只读索引", "ready")}
        </div>
        <div className={styles.toolbar}>
          <label className={styles.searchField}>
            <Search aria-hidden="true" />
            <input aria-label="搜索案例、提示词、来源或标签" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索案例、提示词、来源或标签" />
          </label>
          <label className={styles.selectField}><span>来源</span><select value={sourceFilter} onChange={(event) => setSourceFilter(event.target.value)}><option value="all">全部来源</option>{catalog.sources.map((source) => <option key={source.id} value={source.id}>{source.label}</option>)}</select></label>
          <span className={styles.resultCount}>{filteredCases.length.toLocaleString()} 条</span>
        </div>
        <div className={styles.caseTable}>
          <div className={styles.caseTableHead}><span>案例</span><span>分类 / 标签</span><span>来源</span><span>价值</span><span>操作</span></div>
          {filteredCases.slice(0, 80).map((item) => (
            <article className={styles.caseRow} key={item.caseKey}>
              <button className={styles.caseMain} type="button" onClick={() => setSelectedCase(item)}><CaseVisual item={item} className={visualStyles.row} /><span><strong>{item.title}</strong><small>{truncate(item.promptPreview || "索引未提供提示词摘要", 94)}</small></span></button>
              <div className={styles.caseTags}><span>{item.categoryLabel}</span>{item.styleLabels.slice(0, 2).map((tag) => <small key={tag}>{tag}</small>)}</div>
              <div className={styles.caseSource}><strong>{item.sourceName}</strong><small>{item.sourceUrl ? "原始链接已记录" : "链接待复核"}</small></div>
              <div className={styles.caseScore}><b>{item.valueScore}</b><small>{item.valueTier}</small></div>
              <div className={styles.rowActions}><button type="button" className={styles.iconButton} title="复制案例键" aria-label={`复制 ${item.caseKey}`} onClick={() => void copyCaseKey(item)}><Copy aria-hidden="true" /></button><button type="button" className={styles.iconButton} title="打开检查器" aria-label={`检查 ${item.title}`} onClick={() => setSelectedCase(item)}><PanelRightOpen aria-hidden="true" /></button></div>
            </article>
          ))}
        </div>
      </section>
    );
  }

  function renderTaxonomy() {
    return (
      <div className={styles.taxonomyGrid}>
        <section className={styles.panel}><div className={styles.panelHead}><div><span className={styles.sectionKicker}>分类</span><h2>案例分类</h2></div>{accessStatus("索引", "ready")}</div><div className={styles.rankList}>{catalog.categories.map((item, index) => <div key={item.value}><b>{String(index + 1).padStart(2, "0")}</b><span>{item.label}</span><strong>{item.count}</strong></div>)}</div></section>
        <section className={styles.panel}><div className={styles.panelHead}><div><span className={styles.sectionKicker}>标签</span><h2>高频风格标签</h2></div>{accessStatus("索引", "ready")}</div><div className={styles.tagCloud}>{catalog.styles.slice(0, 32).map((item) => <span key={item.value}>{item.label}<b>{item.count}</b></span>)}</div><div className={styles.taxonomyNote}><FolderTree aria-hidden="true" /><p>当前标签来自案例索引中的 `styles` 字段。别名合并、停用词、层级关系和人工治理表尚未接通。</p></div></section>
        <section className={styles.panel}><div className={styles.panelHead}><div><span className={styles.sectionKicker}>场景</span><h2>高频应用场景</h2></div>{accessStatus("索引", "ready")}</div><div className={styles.rankList}>{catalog.scenes.slice(0, 15).map((item, index) => <div key={item.value}><b>{String(index + 1).padStart(2, "0")}</b><span>{item.label}</span><strong>{item.count}</strong></div>)}</div></section>
      </div>
    );
  }

  function renderMembers() {
    return <EmptyContract title="用户与会员数据尚未安全接通" body="现有迁移已定义统一用户档案、会员权益、登录审计和云端资产表；现有 `/api/admin/users` 仍依赖后台口令，尚未形成基于 Supabase 管理员角色的聚合读取合同。因此本地候选不会请求或展示任何真实用户。" tables={["user_profiles", "entitlements", "auth_events", "image2_asset_snapshots"]} endpoint="GET /api/admin/image2/overview (server role check)" />;
  }

  function renderWallet() {
    return <EmptyContract title="兑换码与图片积分仅展示数据合同" body="当前 schema 已有卡密哈希、兑换审计、钱包余额与交易流水。为避免把卡密或用户金额暴露到浏览器，本候选只展示接通要求；不会查询 license_codes、wallet 或执行兑换、加减积分。" tables={["license_codes", "license_redemptions", "image2_wallets", "image2_wallet_transactions"]} endpoint="GET /api/admin/image2/wallets + POST dry-run preview" />;
  }

  function renderReview() {
    return (
      <section className={styles.panel}>
        <div className={styles.panelHead}>
          <div><span className={styles.sectionKicker}>内容审核</span><h2>索引完整度复核队列</h2><p>队列由真实静态字段生成：来源未映射、缺提示词摘要或价值评分低于 60。案例原始链接属于详情懒加载数据，不在本页误判为缺失。操作仅记在本页内存。</p></div>
          {accessStatus("本地审查", "dry")}
        </div>
        <div className={styles.reviewToolbar}>
          <div className={styles.segmented} role="tablist" aria-label="审核队列筛选">{(["queued", "reviewed", "all"] as ReviewState[]).map((state) => <button key={state} className={reviewState === state ? styles.active : ""} type="button" onClick={() => setReviewState(state)}>{state === "queued" ? "待复核" : state === "reviewed" ? "本地已登记" : "全部"}</button>)}</div>
          <span className={styles.resultCount}>{filteredReviewItems.length} 条</span>
        </div>
        <div className={styles.reviewList}>{filteredReviewItems.slice(0, 80).map((item) => <ReviewRow key={item.caseKey} item={item} reviewed={reviewedKeys.has(item.caseKey)} onReview={() => queueReview(item)} onInspect={() => setSelectedCase(item)} />)}</div>
      </section>
    );
  }

  function renderAudit() {
    return (
      <div className={styles.auditGrid}>
        <section className={styles.panel}><div className={styles.panelHead}><div><span className={styles.sectionKicker}>现有能力</span><h2>资产快照变更日志</h2></div>{accessStatus("后端已存在", "contract")}</div><p className={styles.auditLead}>仓库已有 `/api/admin/image2-cases/changes` 与 `image2_asset_change_logs`，可读取并撤销用户资产快照。现有接口使用 `ADMIN_TOKEN`，此本地候选不会调用它。</p><div className={styles.apiRows}><div><span>GET</span><code>/api/admin/image2-cases/changes</code><small>读取变更记录</small></div><div><span>POST</span><code>/api/admin/image2-cases/changes</code><small>撤销资产快照</small></div></div></section>
        <section className={styles.panel}><div className={styles.panelHead}><div><span className={styles.sectionKicker}>本地 session</span><h2>本次 dry-run 记录</h2></div>{accessStatus("浏览器内存", "dry")}</div>{localEvents.length ? <ol className={styles.localEventList}>{localEvents.map((event) => <li key={event}><Check aria-hidden="true" />{event}</li>)}</ol> : <div className={styles.emptyState}><FileClock aria-hidden="true" /><strong>还没有本地操作</strong><p>从案例检查器创建审查任务后，会在这里出现，并在刷新页面后消失。</p></div>}</section>
      </div>
    );
  }

  const viewContent: Record<AdminView, () => ReactElement> = {
    overview: renderOverview,
    catalog: renderCatalog,
    taxonomy: renderTaxonomy,
    members: renderMembers,
    wallet: renderWallet,
    review: renderReview,
    audit: renderAudit
  };
  const activeNavigation = navigation.find((item) => item.id === activeView) ?? navigation[0];

  return (
    <main className={styles.shell}>
      <aside className={styles.sidebar}>
        <a className={styles.brand} href="/image2-cases"><span><Gauge aria-hidden="true" /></span><div><strong>Image2</strong><small>运营后台候选</small></div></a>
        <nav aria-label="后台导航">{navigation.map((item) => { const Icon = item.icon; return <button key={item.id} type="button" className={activeView === item.id ? styles.navActive : ""} onClick={() => setActiveView(item.id)}><Icon aria-hidden="true" /><span><strong>{item.label}</strong><small>{item.note}</small></span></button>; })}</nav>
        <div className={styles.sidebarFoot}>{accessStatus("本地预览", "dry")}<small>默认生产关闭</small></div>
      </aside>

      <section className={styles.workspace}>
        <header className={styles.topbar}>
          <div><span className={styles.breadcrumb}>后台 / Image2 案例库 / {activeNavigation.label}</span><h1>{activeNavigation.label}</h1></div>
          <div className={styles.topbarActions}><span className={styles.importedAt}><Database aria-hidden="true" />索引导入 {formatDate(catalog.importedAt)}</span><a className={styles.publicLink} href="/image2-cases"><Eye aria-hidden="true" />公开案例库</a></div>
        </header>

        <div className={styles.notice} role="status"><ShieldCheck aria-hidden="true" /><span>{notice}</span></div>
        <div className={styles.content}>{viewContent[activeView]()}</div>
      </section>

      {selectedCase ? <CaseInspector item={selectedCase} onClose={() => setSelectedCase(null)} onQueue={() => queueReview(selectedCase)} /> : null}
    </main>
  );
}

function ReviewRow({ item, reviewed, onReview, onInspect }: { item: Image2AdminReviewItem; reviewed: boolean; onReview: () => void; onInspect: () => void }) {
  return (
    <article className={styles.reviewRow}>
      <div className={styles.reviewCase}><button type="button" onClick={onInspect}><CaseVisual item={item} className={visualStyles.review} /></button><div><strong>{item.title}</strong><small>{item.caseKey} · {item.sourceName}</small></div></div>
      <div className={styles.reviewReasons}>{item.reasons.map((reason) => <span key={reason}><AlertTriangle aria-hidden="true" />{reason}</span>)}</div>
      <div className={styles.reviewScore}><b>{item.valueScore}</b><small>{item.valueTier}</small></div>
      <button className={reviewed ? styles.reviewedButton : styles.reviewButton} type="button" onClick={onReview}>{reviewed ? <Check aria-hidden="true" /> : <ClipboardCheck aria-hidden="true" />}{reviewed ? "已登记" : "本地登记"}</button>
    </article>
  );
}

function CaseVisual({ item, className }: { item: Image2AdminCase; className: string }) {
  return (
    <span className={className} aria-hidden="true">
      <small>{item.caseKey}</small>
      <b>{item.valueScore}</b>
    </span>
  );
}
