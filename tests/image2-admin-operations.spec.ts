import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { NextRequest } from "next/server";
import { expect, test } from "@playwright/test";
import { GET as getAdminOverview } from "@/app/api/admin/image2/overview/route";
import { readImage2AdminOverview } from "@/lib/image2-admin-overview";

const envNames = ["NEXT_PUBLIC_SUPABASE_ANON_KEY", "NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"] as const;
const originalEnv = new Map<string, string | undefined>();
const originalFetch = global.fetch;

test.beforeEach(() => {
  for (const name of envNames) originalEnv.set(name, process.env[name]);
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://project.supabase.co";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon-test";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service-test";
});

test.afterEach(() => {
  global.fetch = originalFetch;
  for (const name of envNames) {
    const value = originalEnv.get(name);
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
  originalEnv.clear();
});

test("admin overview aggregates real resource rows without returning secret fields", async () => {
  global.fetch = async (input) => {
    const url = String(input);
    if (url.includes("/profiles?")) {
      return Response.json([
        { id: "admin-id", email: "owner@example.com", display_name: "Owner", role: "admin", created_at: "2026-07-01T00:00:00Z", updated_at: "2026-07-01T00:00:00Z" },
        { id: "user-id", email: "user@example.com", display_name: "Creator", role: "user", created_at: "2026-07-02T00:00:00Z", updated_at: "2026-07-02T00:00:00Z" }
      ]);
    }
    if (url.includes("/entitlements?")) {
      return Response.json([{ plan: "creator", status: "active", ends_at: "2099-01-01T00:00:00Z" }]);
    }
    if (url.includes("/license_codes?")) {
      return Response.json([{ status: "active", code_hash: "must-not-leak" }, { status: "used", code_hash: "must-not-leak" }]);
    }
    if (url.includes("/license_redemptions?")) {
      return Response.json([{ result: "succeeded", request_hash: "must-not-leak" }, { result: "invalid", ip_hash: "must-not-leak" }]);
    }
    return new Response(null, { status: 404 });
  };

  const overview = await readImage2AdminOverview();
  expect(overview.users).toMatchObject({ admins: 1, status: "ready", total: 2 });
  expect(overview.memberships).toMatchObject({ active: 1, status: "ready", total: 1 });
  expect(overview.licenses).toMatchObject({ active: 1, status: "ready", total: 2, used: 1 });
  expect(overview.redemptions).toMatchObject({ failed: 1, status: "ready", succeeded: 1, total: 2 });
  expect(JSON.stringify(overview)).not.toContain("must-not-leak");
  expect(JSON.stringify(overview)).not.toContain("code_hash");
  expect(JSON.stringify(overview)).not.toContain("ip_hash");
});

test("one missing optional table does not make the full admin overview fail", async () => {
  global.fetch = async (input) => {
    const url = String(input);
    if (url.includes("/profiles?")) {
      return Response.json([{ id: "admin-id", email: "owner@example.com", display_name: "Owner", role: "admin", created_at: "2026-07-01T00:00:00Z", updated_at: "2026-07-01T00:00:00Z" }]);
    }
    if (url.includes("/entitlements?")) return Response.json([]);
    if (url.includes("/license_codes?")) return Response.json([], { status: 404 });
    if (url.includes("/license_redemptions?")) return Response.json([]);
    return new Response(null, { status: 404 });
  };

  const overview = await readImage2AdminOverview();
  expect(overview.users.status).toBe("ready");
  expect(overview.memberships.status).toBe("ready");
  expect(overview.licenses).toMatchObject({ status: "unavailable", total: 0 });
  expect(overview.redemptions.status).toBe("ready");
});

test("anonymous admin overview is denied and never cached", async () => {
  const response = await getAdminOverview(new NextRequest("https://image2.example/api/admin/image2/overview"));
  expect(response.status).toBe(401);
  expect(response.headers.get("cache-control")).toContain("no-store");
  expect(await response.json()).toEqual({ error: "请先登录管理员账号。" });
});

test("admin UI uses HttpOnly session APIs and no longer asks for ADMIN_TOKEN", async () => {
  const files = [
    "app/admin/image2-cases/page.tsx",
    "app/admin/users/page.tsx",
    "components/admin-console.tsx",
    "components/admin-picture-console.tsx",
    "components/admin-users-console.tsx",
    "components/image2-admin-console.tsx"
  ];
  const source = (await Promise.all(files.map((file) => readFile(file, "utf8")))).join("\n");
  expect(source).not.toContain("ADMIN_TOKEN");
  expect(source).not.toContain("x-admin-token");
  expect(source).toContain("AdminSessionGate");
  expect(source).toContain("/api/admin/image2/overview");
});

test("every state-changing admin route has CSRF protection", async () => {
  const root = path.join(process.cwd(), "app", "api", "admin");
  const routeFiles: string[] = [];
  async function walk(directory: string) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const target = path.join(directory, entry.name);
      if (entry.isDirectory()) await walk(target);
      else if (entry.name === "route.ts") routeFiles.push(target);
    }
  }
  await walk(root);

  const failures: string[] = [];
  for (const file of routeFiles) {
    const source = await readFile(file, "utf8");
    if (!/export async function (POST|PUT|PATCH|DELETE)/.test(source)) continue;
    if (!source.includes("requireAdminCsrf(")) failures.push(path.relative(process.cwd(), file));
  }
  expect(failures).toEqual([]);
});

test("every admin data route enforces a server-side administrator boundary", async () => {
  const root = path.join(process.cwd(), "app", "api", "admin");
  const routeFiles: string[] = [];
  async function walk(directory: string) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const target = path.join(directory, entry.name);
      if (entry.isDirectory()) await walk(target);
      else if (entry.name === "route.ts") routeFiles.push(target);
    }
  }
  await walk(root);

  const failures: string[] = [];
  for (const file of routeFiles) {
    const source = await readFile(file, "utf8");
    if (!source.includes("requireAdmin(") && !source.includes("requireAdminUser(")) {
      failures.push(path.relative(process.cwd(), file));
    }
  }
  expect(failures).toEqual([]);
});
