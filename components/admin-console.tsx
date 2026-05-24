"use client";

import {
  CheckCircle2,
  Clipboard,
  ExternalLink,
  Film,
  Loader2,
  Lock,
  RefreshCw,
  Search,
  Send,
  XCircle
} from "lucide-react";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { formatChinaDateTime } from "@/lib/time";
import type { AdminQueueResponse, Generation, GenerationStatus } from "@/lib/types";
import { toUserFacingError } from "@/lib/user-facing-error";

type Draft = {
  videoUrl: string;
  coverUrl: string;
  operatorName: string;
  externalAccount: string;
  sourceTaskUrl: string;
  operatorNote: string;
  userMessage: string;
  errorMessage: string;
};

const tokenKey = "seedance-admin-token";

export function AdminConsole() {
  const [token, setToken] = useState("");
  const [tokenInput, setTokenInput] = useState("");
  const [queue, setQueue] = useState<AdminQueueResponse | null>(null);
  const [busy, setBusy] = useState("");
  const [notice, setNotice] = useState<{ text: string; tone: "success" | "error" } | null>(null);
  const [filter, setFilter] = useState<GenerationStatus | "all">("queued");
  const [query, setQuery] = useState("");
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});

  useEffect(() => {
    const saved = localStorage.getItem(tokenKey) ?? "";
    if (saved) {
      setToken(saved);
      setTokenInput(saved);
      void refresh(saved);
    }
  }, []);

  useEffect(() => {
    if (!queue) return;
    setDrafts((current) => {
      const next = { ...current };
      for (const job of queue.jobs) {
        next[job.id] ??= draftFromJob(job);
      }
      return next;
    });
  }, [queue]);

  const jobs = useMemo(() => {
    const all = queue?.jobs ?? [];
    return all.filter((job) => {
      const matchStatus = filter === "all" || job.status === filter;
      const text = `${job.title} ${job.prompt} ${job.userId} ${job.externalAccount ?? ""}`.toLowerCase();
      return matchStatus && text.includes(query.trim().toLowerCase());
    });
  }, [queue, filter, query]);

  async function refresh(activeToken = token) {
    if (!activeToken) return;
    setBusy("refresh");
    try {
      const response = await fetch("/api/admin/jobs", {
        headers: {
          Authorization: `Bearer ${activeToken}`
        }
      });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error ?? "后台加载失败。");
      setQueue(json);
    } catch (error) {
      flash(toUserFacingError(error instanceof Error ? error.message : error, "后台加载失败。"), "error");
    } finally {
      setBusy("");
    }
  }

  function login(event: FormEvent) {
    event.preventDefault();
    const next = tokenInput.trim();
    setToken(next);
    localStorage.setItem(tokenKey, next);
    void refresh(next);
  }

  async function updateJob(job: Generation, status: GenerationStatus, progress: number) {
    const draft = drafts[job.id] ?? draftFromJob(job);
    setBusy(`${job.id}-${status}`);
    try {
      const response = await fetch("/api/admin/jobs", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          jobId: job.id,
          status,
          progress,
          ...draft
        })
      });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error ?? "任务更新失败。");
      setQueue(json);
      flash(status === "succeeded" ? "成片已发布给用户。" : "任务状态已更新。");
    } catch (error) {
      flash(toUserFacingError(error instanceof Error ? error.message : error, "任务更新失败。"), "error");
    } finally {
      setBusy("");
    }
  }

  async function copyTask(job: Generation) {
    await navigator.clipboard.writeText(taskPackage(job));
    flash("任务包已复制。");
  }

  function updateDraft(id: string, patch: Partial<Draft>) {
    setDrafts((current) => ({
      ...current,
      [id]: {
        ...(current[id] ?? draftFromJob(queue?.jobs.find((item) => item.id === id)!)),
        ...patch
      }
    }));
  }

  if (!token || !queue) {
    return (
      <main className="admin-login">
        <form className="admin-login-card" onSubmit={login}>
          <span className="admin-lock">
            <Lock />
          </span>
          <h1>制作后台</h1>
          <p>输入后台口令后查看用户提交的生成任务。</p>
          <input
            value={tokenInput}
            onChange={(event) => setTokenInput(event.target.value)}
            placeholder="ADMIN_TOKEN"
            type="password"
          />
          <button className="primary-button" type="submit">
            进入后台
          </button>
          {notice ? <div className={`notice ${notice.tone === "error" ? "error" : ""}`}>{notice.text}</div> : null}
        </form>
      </main>
    );
  }

  return (
    <main className="admin-shell">
      <header className="admin-header">
        <div>
          <span className="admin-eyebrow">人工履约队列</span>
          <h1>制作后台</h1>
          <p>复制任务包去外部平台生成，拿到成片链接后在这里发布给用户。</p>
        </div>
        <button className="light-button admin-refresh" type="button" onClick={() => void refresh()} disabled={busy === "refresh"}>
          {busy === "refresh" ? <Loader2 className="spin" /> : <RefreshCw />}
          刷新
        </button>
      </header>

      {notice ? <section className={`notice ${notice.tone === "error" ? "error" : ""}`}>{notice.text}</section> : null}

      <section className="admin-stats">
        <Stat label="待制作" value={queue.totals.queued} />
        <Stat label="制作中" value={queue.totals.running} />
        <Stat label="已完成" value={queue.totals.succeeded} />
        <Stat label="失败/过期" value={queue.totals.failed + queue.totals.expired} />
      </section>

      <section className="admin-toolbar">
        <div className="admin-tabs">
          {[
            ["queued", "待制作"],
            ["running", "制作中"],
            ["succeeded", "已完成"],
            ["failed", "失败"],
            ["all", "全部"]
          ].map(([value, label]) => (
            <button
              className={filter === value ? "active" : ""}
              type="button"
              key={value}
              onClick={() => setFilter(value as GenerationStatus | "all")}
            >
              {label}
            </button>
          ))}
        </div>
        <label className="admin-search">
          <Search />
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索任务、用户、账号" />
        </label>
      </section>

      <section className="admin-job-list">
        {jobs.length ? (
          jobs.map((job) => {
            const draft = drafts[job.id] ?? draftFromJob(job);
            return (
              <article className="admin-job" key={job.id}>
                <div className="admin-job-main">
                  <div className="admin-job-head">
                    <img src={job.coverUrl} alt={job.title} />
                    <div>
                      <span className={`admin-status ${job.status}`}>{statusLabel(job.status)}</span>
                      <h2>{job.title}</h2>
                      <p>
                        {job.durationSeconds === -1 ? "智能时长" : `${job.durationSeconds} 秒`} / {job.resolution} /{" "}
                        {job.ratio} / {modeLabel(job.mode)}
                      </p>
                    </div>
                  </div>

                  <textarea readOnly value={taskPackage(job)} />

                  <div className="admin-actions">
                    <button className="soft-button" type="button" onClick={() => void copyTask(job)}>
                      <Clipboard />
                      复制任务包
                    </button>
                    {job.sourceTaskUrl ? (
                      <a className="soft-link" href={job.sourceTaskUrl} target="_blank" rel="noreferrer">
                        <ExternalLink />
                        外部任务
                      </a>
                    ) : null}
                  </div>
                </div>

                <div className="admin-job-side">
                  <label>
                    <span>使用账号/窗口</span>
                    <input
                      value={draft.externalAccount}
                      onChange={(event) => updateDraft(job.id, { externalAccount: event.target.value })}
                      placeholder="NemoVideo 账号备注"
                    />
                  </label>
                  <label>
                    <span>操作人</span>
                    <input
                      value={draft.operatorName}
                      onChange={(event) => updateDraft(job.id, { operatorName: event.target.value })}
                      placeholder="谁在制作"
                    />
                  </label>
                  <label>
                    <span>外部任务链接</span>
                    <input
                      value={draft.sourceTaskUrl}
                      onChange={(event) => updateDraft(job.id, { sourceTaskUrl: event.target.value })}
                      placeholder="可选"
                    />
                  </label>
                  <label>
                    <span>成片链接</span>
                    <input
                      value={draft.videoUrl}
                      onChange={(event) => updateDraft(job.id, { videoUrl: event.target.value })}
                      placeholder="上传到 R2/对象存储后的 URL"
                    />
                  </label>
                  <label>
                    <span>用户提示</span>
                    <input
                      value={draft.userMessage}
                      onChange={(event) => updateDraft(job.id, { userMessage: event.target.value })}
                      placeholder="例如：正在制作中"
                    />
                  </label>
                  <label>
                    <span>内部备注</span>
                    <textarea
                      value={draft.operatorNote}
                      onChange={(event) => updateDraft(job.id, { operatorNote: event.target.value })}
                      placeholder="失败原因、重试信息等"
                    />
                  </label>

                  <div className="admin-submit-row">
                    <button className="light-button" type="button" onClick={() => void updateJob(job, "running", 35)}>
                      <Film />
                      开始制作
                    </button>
                    <button
                      className="primary-button"
                      type="button"
                      onClick={() => void updateJob(job, "succeeded", 100)}
                      disabled={busy === `${job.id}-succeeded`}
                    >
                      {busy === `${job.id}-succeeded` ? <Loader2 className="spin" /> : <Send />}
                      发布成片
                    </button>
                    <button className="danger-button" type="button" onClick={() => void updateJob(job, "failed", 100)}>
                      <XCircle />
                      失败退额
                    </button>
                  </div>
                </div>
              </article>
            );
          })
        ) : (
          <div className="empty-state">没有匹配的任务</div>
        )}
      </section>
    </main>
  );

  function flash(text: string, tone: "success" | "error" = "success") {
    setNotice({ text, tone });
    window.clearTimeout((flash as any).timer);
    (flash as any).timer = window.setTimeout(() => setNotice(null), 2800);
  }
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="admin-stat">
      <strong>{value}</strong>
      <span>{label}</span>
    </div>
  );
}

function draftFromJob(job: Generation): Draft {
  return {
    videoUrl: job.videoUrl ?? "",
    coverUrl: job.coverUrl ?? "",
    operatorName: job.operatorName ?? "",
    externalAccount: job.externalAccount ?? "",
    sourceTaskUrl: job.sourceTaskUrl ?? "",
    operatorNote: job.operatorNote ?? "",
    userMessage: job.userMessage ?? "",
    errorMessage: job.errorMessage ?? ""
  };
}

function taskPackage(job: Generation) {
  const assets = job.assets.length
    ? job.assets.map((asset, index) => `${index + 1}. ${asset.name} / ${asset.kind} / ${asset.role}`).join("\n")
    : "无";

  return [
    `任务ID：${job.id}`,
    `用户ID：${job.userId}`,
    `创建时间：${formatChinaDateTime(job.createdAt)}`,
    `模式：${modeLabel(job.mode)}`,
    `规格：${job.resolution} / ${job.ratio} / ${job.durationSeconds === -1 ? "智能时长" : `${job.durationSeconds}秒`}`,
    `生成音频：${job.generateAudio ? "是" : "否"}`,
    job.style ? `风格：${job.style}` : "",
    job.seed ? `Seed：${job.seed}` : "",
    "",
    "提示词：",
    job.prompt,
    "",
    "素材：",
    assets
  ]
    .filter((line) => line !== "")
    .join("\n");
}

function statusLabel(status: GenerationStatus) {
  return {
    queued: "待制作",
    running: "制作中",
    succeeded: "已完成",
    failed: "失败",
    expired: "已过期"
  }[status];
}

function modeLabel(mode: Generation["mode"]) {
  return {
    text: "文生视频",
    "first-frame": "首帧图生",
    "first-last": "首尾帧",
    references: "参考素材"
  }[mode];
}
