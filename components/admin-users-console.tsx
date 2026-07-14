"use client";

import { type FormEvent, useMemo, useState } from "react";
import { AlertTriangle, Clock3, Loader2, ShieldCheck, UsersRound, WalletCards } from "lucide-react";

type AdminUserSummary = {
  createdAt?: string;
  displayName?: string;
  email?: string;
  lastLoginAt?: string;
  loginCount?: number;
  phone?: string;
  recentEvents?: Array<{
    createdAt: string;
    eventType: string;
    host?: string;
    success: boolean;
  }>;
  sourceHost?: string;
  sourceSite?: string;
  userId: string;
  wallet?: {
    balance: number;
    lifetimeCredited: number;
    lifetimeSpent: number;
    updatedAt?: string;
  };
};

type UsersResponse = {
  error?: string;
  storageMode?: string;
  totals?: {
    users?: number;
    walletBalance?: number;
  };
  users?: AdminUserSummary[];
};

type Status = {
  message: string;
  tone: "idle" | "busy" | "success" | "error";
};

function formatTime(value?: string) {
  if (!value) return "未记录";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "未记录";
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).format(date);
}

async function readJson<T>(response: Response): Promise<T> {
  const text = await response.text();
  if (!text) return {} as T;
  try {
    return JSON.parse(text) as T;
  } catch {
    return { error: text.slice(0, 240) } as T;
  }
}

function eventLabel(eventType: string) {
  const labels: Record<string, string> = {
    admin_read: "后台读取",
    login: "登录成功",
    logout: "退出登录",
    otp_send: "发送验证码",
    otp_verify: "校验验证码"
  };
  return labels[eventType] ?? eventType;
}

export function AdminUsersConsole() {
  const [adminToken, setAdminToken] = useState("");
  const [users, setUsers] = useState<AdminUserSummary[]>([]);
  const [storageMode, setStorageMode] = useState("");
  const [status, setStatus] = useState<Status>({
    message: "输入后台口令后读取统一账号列表。",
    tone: "idle"
  });

  const stats = useMemo(
    () => ({
      users: users.length,
      active: users.filter((user) => user.lastLoginAt).length,
      balance: users.reduce((sum, user) => sum + (user.wallet?.balance ?? 0), 0)
    }),
    [users]
  );

  async function loadUsers(event?: FormEvent) {
    event?.preventDefault();
    const token = adminToken.trim();
    if (!token) {
      setStatus({ message: "请输入后台口令。", tone: "error" });
      return;
    }

    setStatus({ message: "正在读取用户列表...", tone: "busy" });
    try {
      const response = await fetch("/api/admin/users?limit=80", {
        cache: "no-store",
        headers: {
          "x-admin-token": token
        }
      });
      const data = await readJson<UsersResponse>(response);
      if (!response.ok) throw new Error(data.error || "用户列表读取失败。");
      setUsers(data.users ?? []);
      setStorageMode(data.storageMode ?? "");
      setStatus({ message: `已读取 ${data.users?.length ?? 0} 个统一账号。`, tone: "success" });
    } catch (error) {
      setStatus({ message: error instanceof Error ? error.message : "用户列表读取失败。", tone: "error" });
    }
  }

  return (
    <section className="admin-users-panel" aria-label="统一用户管理">
      <div className="admin-users-head">
        <span>
          <UsersRound aria-hidden="true" />
          用户管理
        </span>
        <strong>统一账号与图片余额</strong>
        <p>集中查看邮箱、手机号、来源站点、最近登录、验证码事件和图片余额，先用现有后台口令保护。</p>
      </div>

      <form className="admin-users-auth" onSubmit={loadUsers}>
        <label>
          <span>后台口令</span>
          <input
            autoComplete="off"
            placeholder="ADMIN_TOKEN"
            type="password"
            value={adminToken}
            onChange={(event) => setAdminToken(event.target.value)}
          />
        </label>
        <button type="submit" disabled={status.tone === "busy"}>
          {status.tone === "busy" ? <Loader2 className="spinning" aria-hidden="true" /> : <ShieldCheck aria-hidden="true" />}
          读取用户
        </button>
      </form>

      <div className={`admin-users-status ${status.tone}`}>
        {status.tone === "error" ? <AlertTriangle aria-hidden="true" /> : <Clock3 aria-hidden="true" />}
        <span>{status.message}</span>
        {storageMode ? <small>{storageMode}</small> : null}
      </div>

      <div className="admin-users-stats" aria-label="用户摘要">
        <div>
          <span>{stats.users}</span>
          <small>统一账号</small>
        </div>
        <div>
          <span>{stats.active}</span>
          <small>有登录记录</small>
        </div>
        <div>
          <span>{stats.balance}</span>
          <small>图片余额合计</small>
        </div>
      </div>

      <div className="admin-users-table">
        {users.length ? (
          users.map((user) => (
            <article className="admin-user-row" key={user.userId}>
              <div className="admin-user-identity">
                <strong>{user.displayName || user.email || user.phone || "未命名用户"}</strong>
                <span>{user.email || user.phone || "无联系方式"}</span>
                <small>{user.userId}</small>
              </div>
              <div>
                <span>来源</span>
                <strong>{user.sourceHost || user.sourceSite || "未记录"}</strong>
                <small>登录 {user.loginCount ?? 0} 次</small>
              </div>
              <div>
                <span>最近登录</span>
                <strong>{formatTime(user.lastLoginAt)}</strong>
                <small>创建 {formatTime(user.createdAt)}</small>
              </div>
              <div className="admin-user-wallet">
                <span>
                  <WalletCards aria-hidden="true" />
                  图片余额
                </span>
                <strong>{user.wallet?.balance ?? 0}</strong>
                <small>
                  累计 +{user.wallet?.lifetimeCredited ?? 0} / -{user.wallet?.lifetimeSpent ?? 0}
                </small>
              </div>
              <div className="admin-user-events">
                {(user.recentEvents ?? []).length ? (
                  user.recentEvents?.slice(0, 3).map((event) => (
                    <small className={event.success ? "success" : "error"} key={`${user.userId}-${event.eventType}-${event.createdAt}`}>
                      {eventLabel(event.eventType)} · {formatTime(event.createdAt)}
                    </small>
                  ))
                ) : (
                  <small>暂无事件</small>
                )}
              </div>
            </article>
          ))
        ) : (
          <div className="admin-users-empty">
            <UsersRound aria-hidden="true" />
            <strong>暂无用户数据</strong>
            <p>输入后台口令后读取；用户通过统一登录页成功登录后会出现在这里。</p>
          </div>
        )}
      </div>
    </section>
  );
}
