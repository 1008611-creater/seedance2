import { readFile } from "node:fs/promises";
import { NextRequest } from "next/server";
import { expect, test } from "@playwright/test";
import { AdminAuthError, requireAdmin } from "@/lib/admin-auth";

const migrationPath = "supabase/migrations/202607150001_image2_security_advisor_hardening.sql";

const envNames = [
  "ADMIN_TOKEN",
  "IMAGE2_ENABLE_ADMIN_TOKEN_BREAK_GLASS",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "NEXT_PUBLIC_SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
  "VERCEL"
] as const;

function requestWith(headers: Record<string, string>) {
  return new NextRequest("http://localhost/api/admin/users", { headers });
}

test.describe.serial("Image2 role-bound admin authorization", () => {
  const originalEnv = new Map<string, string | undefined>();
  const originalFetch = global.fetch;

  test.beforeEach(() => {
    for (const name of envNames) originalEnv.set(name, process.env[name]);
    process.env.ADMIN_TOKEN = "local-break-glass-token";
    delete process.env.IMAGE2_ENABLE_ADMIN_TOKEN_BREAK_GLASS;
    delete process.env.VERCEL;
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

  test("keeps the local break-glass token available outside production", async () => {
    const identity = await requireAdmin(requestWith({ "x-admin-token": "local-break-glass-token" }));
    expect(identity).toEqual({ id: "break-glass", method: "break-glass" });
  });

  test("disables the shared token by default in production", async () => {
    process.env.VERCEL = "1";
    await expect(requireAdmin(requestWith({ "x-admin-token": "local-break-glass-token" }))).rejects.toMatchObject({
      status: 401
    });
  });

  test("accepts a verified Supabase user only when profiles.role is admin", async () => {
    process.env.VERCEL = "1";
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://project.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon-test";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "service-test";
    global.fetch = async (input) => {
      const url = String(input);
      if (url.endsWith("/auth/v1/user")) {
        return Response.json({ email: "operator@example.com", id: "operator-id" });
      }
      if (url.includes("/rest/v1/profiles?")) {
        return Response.json([{ email: "operator@example.com", id: "operator-id", role: "admin" }]);
      }
      return new Response(null, { status: 404 });
    };

    await expect(requireAdmin(requestWith({ authorization: "Bearer user-access-token" }))).resolves.toEqual({
      email: "operator@example.com",
      id: "operator-id",
      method: "supabase-role"
    });
  });

  test("rejects a verified non-admin user", async () => {
    process.env.VERCEL = "1";
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://project.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon-test";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "service-test";
    global.fetch = async (input) => {
      const url = String(input);
      if (url.endsWith("/auth/v1/user")) return Response.json({ id: "user-id" });
      if (url.includes("/rest/v1/profiles?")) return Response.json([{ email: null, id: "user-id", role: "user" }]);
      return new Response(null, { status: 404 });
    };

    try {
      await requireAdmin(requestWith({ authorization: "Bearer user-access-token" }));
      throw new Error("expected requireAdmin to reject a non-admin user");
    } catch (error) {
      expect(error).toBeInstanceOf(AdminAuthError);
      expect(error).toMatchObject({ status: 403 });
    }
  });
});

test("security migration removes public wallet mutation access and fixes search paths", async () => {
  const sql = (await readFile(migrationPath, "utf8")).toLowerCase();
  expect(sql).toContain("from public, anon, authenticated");
  expect(sql).toContain("to service_role");
  expect(sql).toContain("public.image2_apply_wallet_delta(uuid, integer, text, text, uuid, jsonb)");
  expect(sql).toContain("public.image2_redeem_balance_code(uuid, text, text, text)");

  for (const signature of [
    "public.set_updated_at()",
    "public.seedance_set_updated_at()",
    "public.image2_set_updated_at()",
    "public.image2_gacha_set_updated_at()",
    "public.image2_credit_amount_for_plan(text, jsonb)"
  ]) {
    expect(sql).toContain(`alter function ${signature}`);
  }
});
