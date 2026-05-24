const submit = process.argv.includes("--submit");
const generateAudio = process.env.SMOKE_GENERATE_AUDIO === "true";
const appBase = stripTrailingSlash(process.env.MAIN_APP_BASE_URL ?? "http://127.0.0.1:3012");
const proxyBase = stripTrailingSlash(process.env.DOUBAO2API_PROXY_BASE_URL ?? "http://127.0.0.1:7872/v1");
const proxyRoot = proxyBase.replace(/\/v1$/, "");
const userId = process.env.SMOKE_USER_ID ?? `smoke-doubao2api-${Date.now()}`;

async function main() {
  const proxyHealth = await getJson(`${proxyRoot}/healthz`);
  const providerStatus = await getJson(`${appBase}/api/provider/doubao2api/status`);
  const dashboard = await getJson(`${appBase}/api/dashboard?userId=${encodeURIComponent(userId)}`);
  const accounts = Array.isArray(providerStatus.accounts) ? providerStatus.accounts : [];
  const poolCooldownUntil = Number(providerStatus.pool?.cooldownUntil || 0);

  const result = {
    appBase,
    proxyRoot,
    userId,
    proxyStatus: proxyHealth.status,
    proxyConfigured: proxyHealth.provider?.configured,
    upstreamReachable: proxyHealth.provider?.upstream?.reachable,
    upstreamLoggedIn: proxyHealth.provider?.upstream?.payload?.logged_in,
    accountCount: accounts.length,
    loggedInAccounts: accounts.filter((account) => account.loggedIn).map((account) => account.id),
    pendingLoginAccounts: accounts.filter((account) => account.reachable && !account.loggedIn).map((account) => account.id),
    poolCooldownUntil: poolCooldownUntil || undefined,
    poolCoolingDown: poolCooldownUntil > Date.now(),
    poolLastError: providerStatus.pool?.lastError || undefined,
    providerMode: dashboard.providerMode,
    generateAudio,
    submitted: false
  };

  if (dashboard.providerMode !== "doubao2api") {
    throw new Error(`Expected providerMode=doubao2api, got ${dashboard.providerMode}`);
  }

  if (!providerStatus.reachable || !accounts.length) {
    throw new Error("Expected doubao2api account status to be reachable with at least one account.");
  }

  if (submit) {
    await postJson(`${appBase}/api/claim`, { userId });
    const afterSubmit = await postJson(`${appBase}/api/generations`, {
      userId,
      prompt: "烟花在夜空中绽放，镜头缓慢推进，电影感。",
      mode: "text",
      ratio: "16:9",
      durationSeconds: 5,
      resolution: "720p",
      generateAudio,
      privacy: "private",
      assets: []
    });
    result.submitted = true;
    result.latestJobStatus = afterSubmit.jobs?.[0]?.status ?? afterSubmit.gallery?.[0]?.status;
    result.latestJobRefunded = Boolean(afterSubmit.jobs?.[0]?.refundedAt);
    result.latestVideoUrl = afterSubmit.gallery?.[0]?.videoUrl;
    result.latestError = afterSubmit.jobs?.[0]?.errorMessage;
  }

  console.log(JSON.stringify(result, null, 2));
}

async function getJson(url) {
  const response = await fetch(url);
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`GET ${url} failed ${response.status}: ${JSON.stringify(payload)}`);
  return payload;
}

async function postJson(url, payload) {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-seedance-user": payload.userId ?? userId
    },
    body: JSON.stringify(payload)
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`POST ${url} failed ${response.status}: ${JSON.stringify(body)}`);
  return body;
}

function stripTrailingSlash(value) {
  return value.replace(/\/+$/, "");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
