import { expect, test } from "@playwright/test";

const baseUrl = (process.env.IMAGE2_SECURITY_BASE_URL ?? "http://127.0.0.1:3123").replace(/\/+$/, "");

test("production runtime hides legacy and internal operation APIs before parsing input", async ({ request }) => {
  const probes: Array<{ method: "GET" | "POST"; path: string }> = [
    { method: "POST", path: "/api/claim" },
    { method: "POST", path: "/api/redeem" },
    { method: "POST", path: "/api/account" },
    { method: "GET", path: "/api/dashboard" },
    { method: "GET", path: "/api/generations" },
    { method: "POST", path: "/api/doubao2api/images" },
    { method: "POST", path: "/api/music/generations" },
    { method: "POST", path: "/api/provider/seedance/callback" },
    { method: "GET", path: "/api/provider/doubao2api/status" },
    { method: "GET", path: "/api/local-automation" },
    { method: "POST", path: "/api/local-automation/jina" },
    { method: "GET", path: "/api/daihuo-scout/leads" }
  ];

  for (const probe of probes) {
    const response = await request.fetch(`${baseUrl}${probe.path}`, {
      method: probe.method,
      failOnStatusCode: false
    });
    expect(response.status(), `${probe.method} ${probe.path}`).toBe(404);
    await expect(response.json()).resolves.toEqual({ error: "接口不存在。" });
  }
});

test("forwarded host cannot select a quota-free Image2 provider branch", async ({ request }) => {
  const normal = await request.get(`${baseUrl}/api/image2`);
  const spoofed = await request.get(`${baseUrl}/api/image2`, {
    headers: { "x-forwarded-host": "picture.lsb0713.online" }
  });

  expect(normal.status()).toBe(200);
  expect(spoofed.status()).toBe(200);
  expect((await normal.json()).provider).toBe("image2");
  expect((await spoofed.json()).provider).toBe("image2");
});

test("production runtime enforces backend and browser-security baselines", async ({ request }) => {
  const assets = await request.get(`${baseUrl}/api/image2/assets`, { failOnStatusCode: false });
  const gacha = await request.get(`${baseUrl}/api/image2-gacha/runs`, { failOnStatusCode: false });
  const home = await request.get(`${baseUrl}/`);

  expect([401, 503]).toContain(assets.status());
  expect([401, 503]).toContain(gacha.status());
  expect(home.headers()["x-content-type-options"]).toBe("nosniff");
  expect(home.headers()["x-frame-options"]).toBe("DENY");
  expect(home.headers()["referrer-policy"]).toBe("strict-origin-when-cross-origin");
});

test("production admin APIs reject anonymous and implicit shared-token access", async ({ request }) => {
  const paths = [
    "/api/admin/users",
    "/api/admin/picture",
    "/api/admin/image2-cases/changes",
    "/api/admin/image2-gacha/health",
    "/api/admin/jobs",
    "/api/admin/picture/output?path=missing.png"
  ];

  for (const path of paths) {
    const anonymous = await request.get(`${baseUrl}${path}`, { failOnStatusCode: false });
    const bogusBreakGlass = await request.get(`${baseUrl}${path}`, {
      failOnStatusCode: false,
      headers: { "x-admin-token": "not-a-valid-admin-token" }
    });
    expect(anonymous.status(), `anonymous ${path}`).toBe(401);
    expect(bogusBreakGlass.status(), `bogus break-glass ${path}`).toBe(401);
  }
});
