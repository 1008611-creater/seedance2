"use client";

import {
  Bell,
  BookOpen,
  Check,
  ChevronDown,
  Clock,
  Film,
  Gift,
  ImageIcon,
  KeyRound,
  ListVideo,
  Loader2,
  Lock,
  Play,
  Settings,
  Sparkles,
  Ticket,
  Upload,
  UserRound,
  WandSparkles,
  X
} from "lucide-react";
import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { formatChinaDateTime } from "@/lib/time";
import type {
  DashboardResponse,
  MediaAsset,
  VideoDuration,
  VideoMode,
  VideoRatio
} from "@/lib/types";

const storageKey = "seedance-mvp-user-id";
const demoPrompt =
  "夕阳下的海边，女孩慢慢走向镜头，海浪轻轻拍打沙滩，电影感，柔和光影，动作自然稳定。";

const promptIdeas = [
  "雨夜城市街道，一位穿黑色风衣的角色走过霓虹灯牌，镜头缓慢跟随，地面积水反射光影，电影感，稳定运镜。",
  "透明耳机悬浮在浅灰色背景中，柔和棚拍光，产品缓慢旋转，微距细节清晰，干净高级。",
  "雪山日出，登山者站在山脊上回望镜头，云海缓慢流动，金色阳光洒在雪面，史诗感。",
  "森林晨雾里，阳光穿过高大的树木，镜头低角度穿过草叶，空气里有细小水汽，安静自然。"
];

export function CreatorApp() {
  const [userId, setUserId] = useState("");
  const [dashboard, setDashboard] = useState<DashboardResponse | null>(null);
  const [notice, setNotice] = useState<{ text: string; tone: "success" | "error" } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [prompt, setPrompt] = useState(demoPrompt);
  const [mode, setMode] = useState<VideoMode>("text");
  const [ratio, setRatio] = useState<VideoRatio>("adaptive");
  const [durationSeconds, setDurationSeconds] = useState<VideoDuration>(15);
  const [style, setStyle] = useState("");
  const [seed, setSeed] = useState("");
  const [generateAudio, setGenerateAudio] = useState(true);
  const [assets, setAssets] = useState<MediaAsset[]>([]);
  const [code, setCode] = useState("WEEK-SEED-2026");
  const [accountDraft, setAccountDraft] = useState({ displayName: "", email: "" });
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let saved = localStorage.getItem(storageKey);
    if (!saved) {
      saved = crypto.randomUUID();
      localStorage.setItem(storageKey, saved);
    }
    setUserId(saved);
  }, []);

  useEffect(() => {
    if (!userId) return;
    void refreshDashboard(userId);
  }, [userId]);

  useEffect(() => {
    if (!dashboard) return;
    setAccountDraft({
      displayName: dashboard.user.displayName,
      email: dashboard.user.email ?? ""
    });
  }, [dashboard?.user.id]);

  useEffect(() => {
    if (!userId) return;
    const hasActiveJobs = dashboard?.jobs.some((job) => job.status === "queued" || job.status === "running");
    const timer = window.setInterval(() => {
      if (hasActiveJobs) void refreshDashboard(userId, false);
    }, 2200);
    return () => window.clearInterval(timer);
  }, [userId, dashboard?.jobs]);

  const quotaPercent = dashboard?.quota.limit ? dashboard.quota.remaining / dashboard.quota.limit : 0;
  const modeRequiresFiles = mode !== "text";
  const activeJobs = dashboard?.jobs ?? [];
  const gallery = dashboard?.gallery ?? [];

  async function refreshDashboard(id = userId, showError = true) {
    if (!id) return;
    try {
      const response = await fetch(`/api/dashboard?userId=${encodeURIComponent(id)}`, {
        headers: { "x-seedance-user": id }
      });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error ?? "加载失败。");
      setDashboard(json);
    } catch (error) {
      if (showError) flash(error instanceof Error ? error.message : "加载失败。", "error");
    }
  }

  async function apiPost(path: string, payload: Record<string, unknown>, successMessage: string) {
    if (!userId) return;
    setBusy(path);
    try {
      const response = await fetch(path, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-seedance-user": userId
        },
        body: JSON.stringify({ userId, ...payload })
      });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error ?? "操作失败。");
      setDashboard(json);
      flash(successMessage);
    } catch (error) {
      flash(error instanceof Error ? error.message : "操作失败。", "error");
    } finally {
      setBusy(null);
    }
  }

  function flash(text: string, tone: "success" | "error" = "success") {
    setNotice({ text, tone });
    window.clearTimeout((flash as any).timer);
    (flash as any).timer = window.setTimeout(() => setNotice(null), 3200);
  }

  async function handleClaim() {
    await apiPost("/api/claim", {}, "免费周卡已激活，今天可以提交 2 个生成任务。");
  }

  async function handleRedeem(event: FormEvent) {
    event.preventDefault();
    await apiPost("/api/redeem", { code }, "卡密兑换成功，周卡权益已刷新。");
  }

  async function handleAccount(event: FormEvent) {
    event.preventDefault();
    await apiPost("/api/account", accountDraft, "账号资料已更新。");
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    await apiPost(
      "/api/generations",
      {
        prompt,
        mode,
        ratio,
        durationSeconds,
        resolution: "720p",
        style,
        seed,
        generateAudio,
        privacy: "private",
        assets
      },
      dashboard?.providerMode === "seedance" ? "任务已提交到 Seedance 队列。" : "任务已提交到生成队列。"
    );
  }

  async function handleFiles(files: FileList | null) {
    if (!files) return;
    const selected = Array.from(files);
    const nextAssets: MediaAsset[] = [];

    for (const file of selected) {
      const kind = file.type.startsWith("video/")
        ? "video"
        : file.type.startsWith("audio/")
          ? "audio"
          : "image";
      const dataUrl = await readFile(file);
      nextAssets.push({
        id: crypto.randomUUID(),
        name: file.name,
        kind,
        role: "reference_image",
        mimeType: file.type,
        size: file.size,
        dataUrl
      });
    }

    setAssets((current) => trimAssets([...current, ...nextAssets], mode));
  }

  function handleMode(nextMode: VideoMode) {
    setMode(nextMode);
    setAssets((current) => trimAssets(current, nextMode));
  }

  function removeAsset(id: string) {
    setAssets((current) => current.filter((asset) => asset.id !== id));
  }

  const uploadCopy = useMemo(() => {
    if (mode === "first-frame") return "上传首帧图";
    if (mode === "first-last") return "上传首尾帧";
    if (mode === "references") return "上传参考素材";
    return "无需素材";
  }, [mode]);

  return (
    <div className="dashboard">
      <aside className="sidebar" aria-label="主导航">
        <a className="brand" href="#">
          <span className="brand-icon">
            <Sparkles />
          </span>
          <span>
            <strong>Seedance 2.0</strong>
            <small>满血版周卡创作台</small>
          </span>
        </a>

        <nav className="nav-list" aria-label="功能导航">
          <a className="active" href="#composer">
            <Film />
            <span>创作台</span>
          </a>
          <a href="#gallery">
            <ImageIcon />
            <span>成片库</span>
          </a>
          <a href="#queue">
            <ListVideo />
            <span>生成队列</span>
          </a>
          <a href="#redeem">
            <Ticket />
            <span>卡密兑换</span>
          </a>
          <a href="#account">
            <UserRound />
            <span>账号</span>
          </a>
          <a href="#settings">
            <Settings />
            <span>参数</span>
          </a>
        </nav>

        <section className="benefit-card" aria-labelledby="benefit-title">
          <div className="benefit-head">
            <h2 id="benefit-title">周卡权益</h2>
            <span>{dashboard?.quota.active ? "生效中" : "未激活"}</span>
          </div>
          <p>Seedance 2.0 满血版周卡</p>
          <small>
            {dashboard?.entitlement
              ? `有效期至 ${formatChinaDateTime(dashboard.entitlement.endsAt)}`
              : "领取或兑换后生效"}
          </small>
          <ul>
            <li>
              <Check /> 每天 2 次生成额度
            </li>
            <li>
              <Check /> 单次最高 15 秒
            </li>
            <li>
              <Check /> 720p 输出
            </li>
            <li>
              <Check /> 支持横竖方与智能比例
            </li>
          </ul>
          <button className="light-button" type="button" onClick={handleClaim} disabled={busy === "/api/claim"}>
            {busy === "/api/claim" ? <Loader2 className="spin" /> : <Gift />}
            领取免费周卡
          </button>
        </section>
      </aside>

      <div className="app">
        <header className="topbar">
          <div className="provider-chip">
            <span className={dashboard?.providerMode === "seedance" ? "dot live" : "dot"} />
            {dashboard?.providerMode === "seedance" ? "Seedance 实时通道" : "标准生成通道"}
          </div>
          <div className="topbar-actions">
            <button className="text-button" type="button">
              <BookOpen />
              <span>帮助中心</span>
            </button>
            <button className="icon-button subtle" type="button" aria-label="通知">
              <Bell />
            </button>
            <button className="user-menu" type="button">
              <img src="/assets/avatar.svg" alt="创作者头像" />
              <span>
                <strong>{dashboard?.user.displayName ?? "创作者"}</strong>
                <small>{dashboard?.quota.active ? "周卡用户" : "待激活"}</small>
              </span>
              <ChevronDown />
            </button>
          </div>
        </header>

        <main className="content">
          <section className="page-title">
            <h1>Seedance 2.0 满血版周卡创作台</h1>
            <p>稳定高效的 AI 视频创作体验</p>
          </section>

          {notice ? <section className={`notice ${notice.tone === "error" ? "error" : ""}`}>{notice.text}</section> : null}

          <section className="work-grid">
            <div className="main-column">
              <section className="campaign-card">
                <div className="campaign-icon">
                  <Gift />
                </div>
                <div>
                  <h2>免费周卡活动进行中</h2>
                  <p>新账号领取后，每天可生成 2 段 720p 视频。</p>
                </div>
                <button className="primary-button" type="button" onClick={handleClaim} disabled={busy === "/api/claim"}>
                  领取周卡
                </button>
              </section>

              <form id="composer" className="panel composer" onSubmit={handleSubmit}>
                <div className="section-head">
                  <h2>开始创作</h2>
                  <div className="section-actions">
                    <button
                      className="soft-button"
                      type="button"
                      onClick={() => setPrompt(promptIdeas[Math.floor(Math.random() * promptIdeas.length)])}
                    >
                      <WandSparkles />
                      <span>灵感</span>
                    </button>
                    <button className="soft-button danger" type="button" onClick={() => setPrompt("")}>
                      清空
                    </button>
                  </div>
                </div>

                <label className="prompt-field">
                  <span>视频描述</span>
                  <textarea
                    maxLength={1000}
                    rows={7}
                    value={prompt}
                    onChange={(event) => setPrompt(event.target.value)}
                    placeholder="描述画面主体、动作、镜头、光线、节奏。"
                  />
                  <small>{prompt.length} / 1000</small>
                </label>

                <div className="mode-tabs" role="group" aria-label="生成模式">
                  {(dashboard?.modes ?? []).map((item) => (
                    <button
                      className={`segment ${mode === item.value ? "active" : ""}`}
                      type="button"
                      key={item.value}
                      onClick={() => handleMode(item.value)}
                    >
                      <strong>{item.label}</strong>
                      <span>{item.hint}</span>
                    </button>
                  ))}
                </div>

                {modeRequiresFiles ? (
                  <section className="upload-strip">
                    <input
                      ref={fileInputRef}
                      type="file"
                      multiple={mode === "references" || mode === "first-last"}
                      accept={mode === "references" ? "image/*,video/mp4,video/quicktime,audio/mpeg,audio/wav" : "image/*"}
                      onChange={(event) => void handleFiles(event.target.files)}
                    />
                    <button className="upload-button" type="button" onClick={() => fileInputRef.current?.click()}>
                      <Upload />
                      {uploadCopy}
                    </button>
                    <div className="asset-list">
                      {assets.map((asset) => (
                        <span className="asset-pill" key={asset.id}>
                          {asset.kind === "image" ? <ImageIcon /> : asset.kind === "video" ? <Film /> : <Clock />}
                          {asset.name}
                          <button type="button" onClick={() => removeAsset(asset.id)} aria-label="移除素材">
                            <X />
                          </button>
                        </span>
                      ))}
                    </div>
                  </section>
                ) : null}

                <section id="settings" className="settings-block">
                  <div className="section-head compact">
                    <h2>视频规格</h2>
                    <span>720p 周卡通道</span>
                  </div>

                  <div className="option-group ratio-options">
                    {(dashboard?.ratios ?? []).map((item) => (
                      <button
                        className={`option-tile ${ratio === item.value ? "active" : ""}`}
                        type="button"
                        key={item.value}
                        onClick={() => setRatio(item.value)}
                      >
                        <span className="tile-shape" data-ratio={item.value} />
                        <strong>{item.label}</strong>
                        <small>{item.size}</small>
                        <em>{item.use}</em>
                      </button>
                    ))}
                  </div>

                  <div className="option-group duration-options">
                    {(dashboard?.durations ?? []).map((item) => (
                      <button
                        className={`duration-chip ${durationSeconds === item.value ? "active" : ""}`}
                        type="button"
                        key={item.value}
                        onClick={() => setDurationSeconds(item.value)}
                      >
                        <strong>{item.label}</strong>
                        <span>{item.hint}</span>
                      </button>
                    ))}
                  </div>

                  <div className="settings-grid">
                    <label>
                      <span>分辨率</span>
                      <select value="720p" disabled>
                        <option value="720p">720p 周卡固定</option>
                      </select>
                    </label>
                    <label>
                      <span>风格</span>
                      <input value={style} onChange={(event) => setStyle(event.target.value)} placeholder="电影感 / 产品广告" />
                    </label>
                    <label>
                      <span>Seed</span>
                      <input value={seed} onChange={(event) => setSeed(event.target.value)} placeholder="随机" inputMode="numeric" />
                    </label>
                    <label className="toggle-row">
                      <input
                        type="checkbox"
                        checked={generateAudio}
                        onChange={(event) => setGenerateAudio(event.target.checked)}
                      />
                      <span>生成音频</span>
                    </label>
                  </div>
                </section>

                <div className="composer-footer">
                  <p>
                    <Clock /> 今日额度：
                    <strong>
                      {dashboard?.quota.remaining ?? 0} / {dashboard?.quota.limit ?? 0} 次
                    </strong>
                  </p>
                  <button className="primary-button generate-button" type="submit" disabled={busy === "/api/generations"}>
                    {busy === "/api/generations" ? <Loader2 className="spin" /> : <Sparkles />}
                    <span>开始生成</span>
                  </button>
                </div>
              </form>

              <section id="gallery" className="panel gallery-panel">
                <div className="section-head">
                  <div>
                    <h2>成片库</h2>
                    <div className="filter-tabs">
                      <button className="active" type="button">
                        全部
                      </button>
                      <button type="button">视频</button>
                      <button type="button">分享</button>
                    </div>
                  </div>
                  <button className="text-button" type="button">
                    批量管理
                  </button>
                </div>
                <div className="gallery-grid">
                  {gallery.length ? (
                    gallery.map((item) => <GalleryCard key={item.id} item={item} />)
                  ) : (
                    <div className="empty-state">暂无成片</div>
                  )}
                </div>
              </section>
            </div>

            <aside className="right-column">
              <section className="panel quota-panel">
                <div className="section-head">
                  <h2>今日额度</h2>
                  <button className="text-button" type="button" onClick={() => void refreshDashboard()}>
                    刷新
                  </button>
                </div>
                <div className="quota-gauge" aria-label="今日剩余额度">
                  <svg viewBox="0 0 180 112">
                    <path className="gauge-bg" d="M34 92a56 56 0 0 1 112 0" />
                    <path
                      className="gauge-fill"
                      d="M34 92a56 56 0 0 1 112 0"
                      style={{ strokeDashoffset: 176 - quotaPercent * 176 }}
                    />
                  </svg>
                  <div>
                    <strong>
                      {dashboard?.quota.remaining ?? 0}
                      <small>/{dashboard?.quota.limit ?? 0}</small>
                    </strong>
                    <span>剩余次数</span>
                  </div>
                </div>
                <h3>每日 00:00 重置</h3>
                <p>{dashboard?.quota.resetAt ? `下次重置 ${formatChinaDateTime(dashboard.quota.resetAt)}` : "等待登录"}</p>
                <div className="upgrade-tip">
                  <Lock />
                  <span>1080p 与更多额度可放到下一档会员。</span>
                  <button type="button">升级</button>
                </div>
              </section>

              <section id="redeem" className="panel redeem-panel">
                <div className="section-head">
                  <h2>卡密兑换</h2>
                </div>
                <form className="redeem-form" onSubmit={handleRedeem}>
                  <input value={code} onChange={(event) => setCode(event.target.value)} aria-label="兑换码" />
                  <button className="primary-button" type="submit" disabled={busy === "/api/redeem"}>
                    <KeyRound />
                  </button>
                </form>
                <button className="link-button" type="button">
                  兑换记录
                </button>
              </section>

              <section id="account" className="panel account-panel">
                <div className="section-head">
                  <h2>账号</h2>
                </div>
                <form className="account-form" onSubmit={handleAccount}>
                  <label>
                    <span>昵称</span>
                    <input
                      value={accountDraft.displayName}
                      onChange={(event) => setAccountDraft((draft) => ({ ...draft, displayName: event.target.value }))}
                    />
                  </label>
                  <label>
                    <span>邮箱</span>
                    <input
                      value={accountDraft.email}
                      onChange={(event) => setAccountDraft((draft) => ({ ...draft, email: event.target.value }))}
                      placeholder="name@example.com"
                    />
                  </label>
                  <button className="light-button" type="submit" disabled={busy === "/api/account"}>
                    保存账号
                  </button>
                </form>
              </section>

              <section id="queue" className="panel queue-panel">
                <div className="section-head">
                  <h2>生成队列</h2>
                  <button className="text-button" type="button">
                    查看全部
                  </button>
                </div>
                <div className="queue-list">
                  {activeJobs.length ? (
                    activeJobs.map((job) => <QueueItem key={job.id} item={job} />)
                  ) : (
                    <div className="empty-mini">暂无任务</div>
                  )}
                </div>
              </section>
            </aside>
          </section>
        </main>
      </div>
    </div>
  );
}

function QueueItem({ item }: { item: DashboardResponse["jobs"][number] }) {
  const statusText = {
    queued: "排队中",
    running: "生成中",
    succeeded: "已完成",
    failed: "失败",
    expired: "已过期"
  }[item.status];

  return (
    <article className="queue-item">
      <img src={item.coverUrl} alt={item.title} />
      <div className="queue-copy">
        <strong>{item.title}</strong>
        <span>
          {item.durationSeconds === -1 ? "智能" : `${item.durationSeconds}s`}｜{item.resolution}｜{item.ratio}
        </span>
      </div>
      <div className={`queue-status ${item.status}`}>{statusText}</div>
      <div className="queue-progress">
        <span style={{ width: `${item.progress}%` }} />
      </div>
      {item.errorMessage ? <p className="queue-error">{item.errorMessage}</p> : null}
    </article>
  );
}

function GalleryCard({ item }: { item: DashboardResponse["gallery"][number] }) {
  return (
    <article className="gallery-card">
      <a className="thumb" href={item.videoUrl ?? "#"} target="_blank" rel="noreferrer">
        <img src={item.coverUrl} alt={item.title} />
        <span className="play-mark">
          <Play />
        </span>
        <span className="duration-mark">{item.durationSeconds === -1 ? "AUTO" : `00:${String(item.durationSeconds).padStart(2, "0")}`}</span>
      </a>
      <h3>{item.title}</h3>
      <p>
        {item.resolution}　{item.ratio}　{formatChinaDateTime(item.createdAt)}
      </p>
    </article>
  );
}

function trimAssets(assets: MediaAsset[], mode: VideoMode) {
  if (mode === "text") return [];
  if (mode === "first-frame") return assets.filter((asset) => asset.kind === "image").slice(0, 1);
  if (mode === "first-last") return assets.filter((asset) => asset.kind === "image").slice(0, 2);

  const images = assets.filter((asset) => asset.kind === "image").slice(0, 9);
  const videos = assets.filter((asset) => asset.kind === "video").slice(0, 3);
  const audios = assets.filter((asset) => asset.kind === "audio").slice(0, 3);
  return [...images, ...videos, ...audios];
}

function readFile(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener("load", () => resolve(String(reader.result)));
    reader.addEventListener("error", () => reject(reader.error));
    reader.readAsDataURL(file);
  });
}
