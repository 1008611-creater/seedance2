"use client";

import { FolderOpen, LogIn, PlayCircle, Search, Sparkles, X } from "lucide-react";
import { type CSSProperties, type FormEvent, useEffect, useMemo, useState } from "react";
import type { Image2PublicHomeData, WorkbenchCase } from "@/lib/image2-workbench-data";
import styles from "./image2-public-home.module.css";

type AccountAuthMode = "login" | "signup" | "recover";

type AccountAuthStatus = {
  message: string;
  tone: "idle" | "busy" | "success" | "error";
};

type Image2AccountSession = {
  accessToken: string;
  refreshToken?: string;
  expiresAt?: number;
  user: {
    id: string;
    email?: string;
  };
};

const accountSessionStorageKey = "image2-workbench-team-session:v1";
const supabaseAuthUrl = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").replace(/\/+$/, "");
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
const isSupabaseAuthConfigured = Boolean(supabaseAuthUrl && supabaseAnonKey);

const readAccountSession = () => {
  try {
    const raw = window.localStorage.getItem(accountSessionStorageKey);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Image2AccountSession;
    if (!parsed.accessToken || !parsed.user?.id) return null;
    return parsed;
  } catch {
    return null;
  }
};

const persistAccountSession = (session: Image2AccountSession) => {
  window.localStorage.setItem(accountSessionStorageKey, JSON.stringify(session));
  return session;
};

const clearAccountSession = () => {
  window.localStorage.removeItem(accountSessionStorageKey);
};

const supabaseAuthHeaders = (accessToken?: string) => ({
  apikey: supabaseAnonKey,
  "Content-Type": "application/json",
  ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {})
});

const toAccountSession = (data: Record<string, unknown>): Image2AccountSession => {
  const user = data.user as { id?: string; email?: string } | undefined;
  const accessToken = typeof data.access_token === "string" ? data.access_token : "";
  if (!accessToken || !user?.id) throw new Error("登录响应缺少会话信息。");
  const expiresIn = typeof data.expires_in === "number" ? data.expires_in : undefined;
  return {
    accessToken,
    refreshToken: typeof data.refresh_token === "string" ? data.refresh_token : undefined,
    expiresAt: expiresIn ? Date.now() + expiresIn * 1000 : undefined,
    user: {
      id: user.id,
      email: user.email
    }
  };
};

const supabaseAuthRequest = async (path: string, init: RequestInit = {}, accessToken?: string) => {
  if (!isSupabaseAuthConfigured) throw new Error("当前环境暂不支持账号登录。");
  const response = await fetch(`${supabaseAuthUrl}/auth/v1/${path}`, {
    ...init,
    headers: {
      ...supabaseAuthHeaders(accessToken),
      ...(init.headers ?? {})
    }
  });
  const text = await response.text();
  let data: Record<string, unknown> = {};
  if (text) {
    try {
      data = JSON.parse(text) as Record<string, unknown>;
    } catch {
      data = { message: text.slice(0, 240) };
    }
  }
  if (!response.ok) {
    throw new Error(String(data.error_description ?? data.msg ?? data.message ?? data.error ?? "账号请求失败。"));
  }
  return data;
};

const signInWithSupabasePassword = async (email: string, password: string) =>
  toAccountSession(
    await supabaseAuthRequest("token?grant_type=password", {
      method: "POST",
      body: JSON.stringify({ email, password })
    })
  );

const withAuthRedirect = (path: string, redirectTo?: string) =>
  redirectTo ? `${path}${path.includes("?") ? "&" : "?"}redirect_to=${encodeURIComponent(redirectTo)}` : path;

const getAuthCallbackUrl = (mode: "confirm" | "recovery") => {
  if (typeof window === "undefined") return undefined;
  return `${window.location.origin}/auth/callback?mode=${mode}`;
};

const signUpWithSupabasePassword = async (email: string, password: string, redirectTo?: string) => {
  const data = await supabaseAuthRequest(withAuthRedirect("signup", redirectTo), {
    method: "POST",
    body: JSON.stringify({ email, password })
  });
  return data.access_token ? toAccountSession(data) : null;
};

const recoverSupabasePassword = async (email: string, redirectTo?: string) => {
  await supabaseAuthRequest(withAuthRedirect("recover", redirectTo), {
    method: "POST",
    body: JSON.stringify({ email })
  });
};

const signOutSupabaseSession = async (accessToken: string) => {
  await supabaseAuthRequest("logout", { method: "POST" }, accessToken);
};

async function hasWorkbenchAccess(session: Image2AccountSession) {
  const response = await fetch("/api/image2-workbench", {
    cache: "no-store",
    headers: {
      Authorization: `Bearer ${session.accessToken}`
    }
  });
  if (response.status === 401) throw new Error("登录状态已失效。");
  if (!response.ok && response.status !== 403) throw new Error("账号状态暂时无法确认。");
  const payload = (await response.json().catch(() => ({}))) as { access?: { isTeamMember?: boolean } };
  return Boolean(payload.access?.isTeamMember);
}

export function Image2PublicHome({ initialData }: { initialData: Image2PublicHomeData }) {
  const [accountSession, setAccountSession] = useState<Image2AccountSession | null>(null);
  const [accountEmail, setAccountEmail] = useState("");
  const [accountPassword, setAccountPassword] = useState("");
  const [accountAuthMode, setAccountAuthMode] = useState<AccountAuthMode>("login");
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [authStatus, setAuthStatus] = useState<AccountAuthStatus>({
    message: isSupabaseAuthConfigured ? "可以使用账号登录。" : "当前环境暂不支持账号登录。",
    tone: "idle"
  });

  const featuredCases = useMemo(() => initialData.featuredCases.filter((item) => item.imageUrl).slice(0, 6), [initialData.featuredCases]);
  const heroCases = featuredCases.slice(0, 4);

  useEffect(() => {
    if (!isSupabaseAuthConfigured) return;
    const saved = readAccountSession();
    if (!saved) return;
    setAccountSession(saved);
    setAccountEmail(saved.user.email ?? "");
    void (async () => {
      try {
        if (await hasWorkbenchAccess(saved)) {
          window.location.assign("/workbench");
          return;
        }
        setAuthStatus({ message: "已登录。", tone: "success" });
      } catch {
        clearAccountSession();
        setAccountSession(null);
        setAuthStatus({ message: "可以使用账号登录。", tone: "idle" });
      }
    })();
  }, []);

  async function submitAccountAuth(event: FormEvent) {
    event.preventDefault();
    if (!isSupabaseAuthConfigured) return;
    const email = accountEmail.trim();

    if (accountAuthMode === "recover") {
      if (!email) {
        setAuthStatus({ message: "请输入要找回密码的邮箱。", tone: "error" });
        return;
      }
      setAuthStatus({ message: "正在发送重置邮件...", tone: "busy" });
      try {
        await recoverSupabasePassword(email, getAuthCallbackUrl("recovery"));
        setAuthStatus({ message: "已发送重置邮件，请查看邮箱。", tone: "success" });
      } catch (error) {
        setAuthStatus({ message: error instanceof Error ? error.message : "重置邮件发送失败。", tone: "error" });
      }
      return;
    }

    if (!email || accountPassword.length < 6) {
      setAuthStatus({ message: "请输入邮箱和至少 6 位密码。", tone: "error" });
      return;
    }

    setAuthStatus({ message: accountAuthMode === "login" ? "正在登录..." : "正在注册...", tone: "busy" });
    try {
      const session =
        accountAuthMode === "login"
          ? await signInWithSupabasePassword(email, accountPassword)
          : await signUpWithSupabasePassword(email, accountPassword, getAuthCallbackUrl("confirm"));
      if (!session) {
        setAccountAuthMode("login");
        setAuthStatus({ message: "注册成功，请完成邮箱验证后再登录。", tone: "success" });
        return;
      }

      persistAccountSession(session);
      setAccountSession(session);
      setAccountPassword("");
      if (await hasWorkbenchAccess(session)) {
        window.location.assign("/workbench");
        return;
      }
      setIsAuthModalOpen(false);
      setAuthStatus({ message: "欢迎回来。", tone: "success" });
    } catch (error) {
      setAuthStatus({ message: error instanceof Error ? error.message : "账号请求失败。", tone: "error" });
    }
  }

  async function signOutAccount() {
    const session = accountSession;
    setAuthStatus({ message: "正在退出...", tone: "busy" });
    try {
      if (session?.accessToken) await signOutSupabaseSession(session.accessToken);
    } catch {
      // Local cleanup still matters when the remote session has already expired.
    }
    clearAccountSession();
    setAccountSession(null);
    setAccountPassword("");
    setAuthStatus({ message: "已退出。", tone: "success" });
  }

  return (
    <main className={styles.shell}>
      <header className={styles.topbar}>
        <a className={styles.brand} href="/">
          <Sparkles aria-hidden="true" />
          <span>Image2</span>
        </a>
      </header>

      <section className={styles.hero} aria-label="Image2 案例灵感库">
        <div className={styles.heroCopy}>
          <small>Prompt Atlas</small>
          <h1>Image2 案例灵感库</h1>
          <p>高价值案例、提示词结构和首帧参考，适合做灵感检索与风格拆解。</p>
          <div className={styles.actions}>
            <a className={styles.primaryAction} href="/image2-cases">
              <FolderOpen aria-hidden="true" />
              进入案例库
            </a>
            <a className={styles.secondaryAction} href="/video-studio">
              <PlayCircle aria-hidden="true" />
              视频创作
            </a>
            <button className={styles.loginAction} type="button" onClick={() => setIsAuthModalOpen(true)} disabled={!isSupabaseAuthConfigured}>
              <LogIn aria-hidden="true" />
              登录
            </button>
          </div>
        </div>

        <div className={styles.heroGrid} aria-label="精选案例预览">
          {heroCases.map((item, index) => (
            <a className={styles.heroTile} href={`/image2-cases?case=${item.id}`} key={item.id} style={{ "--tile-index": index } as CSSProperties}>
              <img src={item.imageUrl} alt={item.imageAlt || item.title} loading={index === 0 ? "eager" : "lazy"} />
              <span>{item.categoryLabel}</span>
            </a>
          ))}
        </div>
      </section>

      <section className={styles.sections} aria-label="公开内容">
        <div className={styles.sectionIntro}>
          <span>精选案例</span>
          <h2>从优秀样片开始拆解</h2>
        </div>
        <div className={styles.caseGrid}>
          {featuredCases.map((item) => (
            <PublicCaseCard item={item} key={item.id} />
          ))}
        </div>
      </section>

      <section className={styles.referenceBand} aria-label="提示词参考">
        <a href="/image2-cases">
          <Search aria-hidden="true" />
          <span>
            <strong>提示词参考</strong>
            <small>按类别、价值分和来源快速筛选案例。</small>
          </span>
        </a>
        <a href="/image2-cases">
          <Sparkles aria-hidden="true" />
          <span>
            <strong>首帧路线</strong>
            <small>把优秀样片拆成主体、构图、光线和风格锚点。</small>
          </span>
        </a>
      </section>

      {isAuthModalOpen ? (
        <AccountAuthModal
          authMode={accountAuthMode}
          authStatus={authStatus}
          email={accountEmail}
          isConfigured={isSupabaseAuthConfigured}
          onClose={() => setIsAuthModalOpen(false)}
          onEmailChange={setAccountEmail}
          onModeChange={(mode) => {
            setAccountAuthMode(mode);
            setAuthStatus({
              message: mode === "recover" ? "输入邮箱后发送重置邮件。" : "可以使用账号登录。",
              tone: "idle"
            });
          }}
          onPasswordChange={setAccountPassword}
          onSubmit={submitAccountAuth}
          password={accountPassword}
        />
      ) : null}
    </main>
  );
}

function PublicCaseCard({ item }: { item: WorkbenchCase }) {
  return (
    <a className={styles.caseCard} href={`/image2-cases?case=${item.id}`}>
      <img src={item.imageUrl} alt={item.imageAlt || item.title} loading="lazy" />
      <span>{item.categoryLabel}</span>
      <strong>{item.title}</strong>
      <small>{item.promptPreview}</small>
    </a>
  );
}

function AccountAuthModal({
  authMode,
  authStatus,
  email,
  isConfigured,
  onClose,
  onEmailChange,
  onModeChange,
  onPasswordChange,
  onSubmit,
  password
}: {
  authMode: AccountAuthMode;
  authStatus: AccountAuthStatus;
  email: string;
  isConfigured: boolean;
  onClose: () => void;
  onEmailChange: (value: string) => void;
  onModeChange: (mode: AccountAuthMode) => void;
  onPasswordChange: (value: string) => void;
  onSubmit: (event: FormEvent) => void;
  password: string;
}) {
  const submitLabel = authMode === "login" ? "登录" : authMode === "signup" ? "注册账号" : "发送重置邮件";
  return (
    <div className={styles.modalBackdrop} role="presentation">
      <section className={styles.modal} role="dialog" aria-modal="true" aria-label="账号登录">
        <div className={styles.modalHeader}>
          <span>Account</span>
          <button type="button" onClick={onClose} aria-label="关闭">
            <X aria-hidden="true" />
          </button>
        </div>
        <h2>账号登录</h2>
        {isConfigured ? (
          <form className={styles.authForm} onSubmit={onSubmit}>
            <div className={styles.authTabs} role="tablist" aria-label="账号模式">
              {(["login", "signup", "recover"] as AccountAuthMode[]).map((mode) => (
                <button
                  aria-pressed={authMode === mode}
                  className={authMode === mode ? styles.active : ""}
                  key={mode}
                  type="button"
                  onClick={() => onModeChange(mode)}
                >
                  {mode === "login" ? "登录" : mode === "signup" ? "注册" : "找回"}
                </button>
              ))}
            </div>
            <label>
              <span>邮箱</span>
              <input autoComplete="email" type="email" value={email} onChange={(event) => onEmailChange(event.target.value)} />
            </label>
            {authMode !== "recover" ? (
              <label>
                <span>密码</span>
                <input
                  autoComplete={authMode === "login" ? "current-password" : "new-password"}
                  type="password"
                  value={password}
                  onChange={(event) => onPasswordChange(event.target.value)}
                />
              </label>
            ) : null}
            <p className={`${styles.authMessage} ${styles[authStatus.tone]}`}>{authStatus.message}</p>
            <div className={styles.authActions}>
              <button type="button" onClick={onClose}>
                取消
              </button>
              <button className={styles.primaryButton} disabled={authStatus.tone === "busy"} type="submit">
                {authStatus.tone === "busy" ? "处理中" : submitLabel}
              </button>
            </div>
          </form>
        ) : (
          <p className={`${styles.authMessage} ${styles.error}`}>当前环境暂不支持账号登录。</p>
        )}
      </section>
    </div>
  );
}
