import { NextRequest } from "next/server";
import { expect, test } from "@playwright/test";
import { POST as verifyOtp } from "@/app/api/auth/otp/verify/route";
import { GET as readAdminSession } from "@/app/api/admin/session/route";
import { POST as refreshAdminSession } from "@/app/api/admin/session/refresh/route";
import { POST as exchangeAdminSession } from "@/app/api/admin/session/exchange/route";
import { requireAdmin } from "@/lib/admin-auth";
import {
  AdminSessionError,
  adminAccessCookieName,
  adminRefreshCookieName,
  requireAdminCsrf
} from "@/lib/admin-session";

const envNames = [
  "IMAGE2_ADMIN_COOKIE_SECURE",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "NEXT_PUBLIC_SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
  "UNIFIED_AUTH_SUPABASE_MOCK",
  "VERCEL"
] as const;

const originalFetch = global.fetch;
const originalEnv = new Map<string, string | undefined>();

function configureSupabase() {
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://project.supabase.co";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon-test";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service-test";
  process.env.IMAGE2_ADMIN_COOKIE_SECURE = "0";
  delete process.env.VERCEL;
}

function mockRole(role: "admin" | "user") {
  global.fetch = async (input) => {
    const url = String(input);
    if (url.includes("/rest/v1/profiles?")) {
      return Response.json([{ email: "owner@example.com", id: "owner-id", role }]);
    }
    if (url.endsWith("/auth/v1/user")) {
      return Response.json({ email: "owner@example.com", id: "owner-id" });
    }
    return new Response(null, { status: 404 });
  };
}

test.beforeEach(() => {
  for (const name of envNames) originalEnv.set(name, process.env[name]);
  configureSupabase();
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

test("admin OTP verification returns HttpOnly cookies without exposing tokens", async () => {
  process.env.UNIFIED_AUTH_SUPABASE_MOCK = "1";
  mockRole("admin");
  const response = await verifyOtp(
    new NextRequest("http://localhost/api/auth/otp/verify", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: "http://localhost",
        "x-image2-admin-csrf": "1"
      },
      body: JSON.stringify({ code: "123456", identifier: "owner@example.com", intent: "admin" })
    })
  );

  expect(response.status).toBe(200);
  const body = await response.json();
  expect(body).toMatchObject({ admin: true, user: { id: expect.any(String) } });
  expect(body.accessToken).toBeUndefined();
  expect(body.refreshToken).toBeUndefined();
  const cookies = response.headers.get("set-cookie") ?? "";
  expect(cookies).toContain(`${adminAccessCookieName}=`);
  expect(cookies).toContain(`${adminRefreshCookieName}=`);
  expect(cookies).toContain("HttpOnly");
  expect(cookies.toLowerCase()).toContain("samesite=strict");
});

test("non-admin OTP verification cannot create an admin session", async () => {
  process.env.UNIFIED_AUTH_SUPABASE_MOCK = "1";
  mockRole("user");
  const response = await verifyOtp(
    new NextRequest("http://localhost/api/auth/otp/verify", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: "http://localhost",
        "x-image2-admin-csrf": "1"
      },
      body: JSON.stringify({ code: "123456", identifier: "owner@example.com", intent: "admin" })
    })
  );

  expect(response.status).toBe(403);
  expect(response.headers.get("set-cookie")).toBeNull();
});

test("admin APIs accept the HttpOnly access cookie and session readback exposes no token", async () => {
  delete process.env.UNIFIED_AUTH_SUPABASE_MOCK;
  mockRole("admin");
  const request = new NextRequest("http://localhost/api/admin/session", {
    headers: { Cookie: `${adminAccessCookieName}=access-cookie-token` }
  });

  await expect(requireAdmin(request)).resolves.toMatchObject({ id: "owner-id", method: "supabase-role" });
  const response = await readAdminSession(request);
  expect(response.status).toBe(200);
  expect(response.headers.get("cache-control")).toContain("no-store");
  const body = await response.json();
  expect(body).toMatchObject({ authenticated: true, identity: { id: "owner-id" } });
  expect(JSON.stringify(body)).not.toContain("access-cookie-token");
});

test("missing admin cookies return a quiet signed-out status without attempting authentication", async () => {
  const response = await readAdminSession(new NextRequest("http://localhost/api/admin/session"));
  expect(response.status).toBe(200);
  await expect(response.json()).resolves.toEqual({ authenticated: false, canRefresh: false });
});

test("cookie-authenticated mutations require same-origin CSRF proof", () => {
  const missingProof = new NextRequest("http://localhost/api/admin/jobs", {
    method: "POST",
    headers: { Cookie: `${adminAccessCookieName}=access-cookie-token` }
  });
  expect(() => requireAdminCsrf(missingProof)).toThrow(AdminSessionError);

  const sameOrigin = new NextRequest("http://localhost/api/admin/jobs", {
    method: "POST",
    headers: {
      Cookie: `${adminAccessCookieName}=access-cookie-token`,
      Origin: "http://localhost",
      "x-image2-admin-csrf": "1"
    }
  });
  expect(() => requireAdminCsrf(sameOrigin)).not.toThrow();

  const bearerRequest = new NextRequest("http://localhost/api/admin/jobs", {
    method: "POST",
    headers: { Authorization: "Bearer explicit-token" }
  });
  expect(() => requireAdminCsrf(bearerRequest)).not.toThrow();
});

test("refresh rotates both HttpOnly cookies only after role verification", async () => {
  delete process.env.UNIFIED_AUTH_SUPABASE_MOCK;
  global.fetch = async (input) => {
    const url = String(input);
    if (url.includes("/auth/v1/token?grant_type=refresh_token")) {
      return Response.json({
        access_token: "rotated-access",
        expires_in: 3600,
        refresh_token: "rotated-refresh",
        user: { email: "owner@example.com", id: "owner-id" }
      });
    }
    if (url.includes("/rest/v1/profiles?")) {
      return Response.json([{ email: "owner@example.com", id: "owner-id", role: "admin" }]);
    }
    return new Response(null, { status: 404 });
  };

  const response = await refreshAdminSession(
    new NextRequest("http://localhost/api/admin/session/refresh", {
      method: "POST",
      headers: {
        Cookie: `${adminRefreshCookieName}=refresh-cookie-token`,
        Origin: "http://localhost",
        "x-image2-admin-csrf": "1"
      }
    })
  );

  expect(response.status).toBe(200);
  const cookies = response.headers.get("set-cookie") ?? "";
  expect(cookies).toContain(`${adminAccessCookieName}=rotated-access`);
  expect(cookies).toContain(`${adminRefreshCookieName}=rotated-refresh`);
  expect(cookies).toContain("HttpOnly");
});

test("admin magic-link tokens are exchanged for HttpOnly cookies without token echo", async () => {
  delete process.env.UNIFIED_AUTH_SUPABASE_MOCK;
  mockRole("admin");
  const response = await exchangeAdminSession(
    new NextRequest("http://localhost/api/admin/session/exchange", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: "http://localhost",
        "x-image2-admin-csrf": "1"
      },
      body: JSON.stringify({ accessToken: "magic-access-token", expiresIn: 3600, refreshToken: "magic-refresh-token" })
    })
  );

  expect(response.status).toBe(200);
  const body = await response.json();
  expect(body).toMatchObject({ admin: true, identity: { id: "owner-id" } });
  expect(JSON.stringify(body)).not.toContain("magic-access-token");
  expect(JSON.stringify(body)).not.toContain("magic-refresh-token");
  const cookies = response.headers.get("set-cookie") ?? "";
  expect(cookies).toContain(`${adminAccessCookieName}=magic-access-token`);
  expect(cookies).toContain(`${adminRefreshCookieName}=magic-refresh-token`);
  expect(cookies).toContain("HttpOnly");
});

test("non-admin magic-link exchange cannot create administrator cookies", async () => {
  delete process.env.UNIFIED_AUTH_SUPABASE_MOCK;
  mockRole("user");
  const response = await exchangeAdminSession(
    new NextRequest("http://localhost/api/admin/session/exchange", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: "http://localhost",
        "x-image2-admin-csrf": "1"
      },
      body: JSON.stringify({ accessToken: "ordinary-access-token", refreshToken: "ordinary-refresh-token" })
    })
  );

  expect(response.status).toBe(403);
  const cookies = response.headers.get("set-cookie") ?? "";
  expect(cookies).not.toContain("ordinary-access-token");
  expect(cookies).not.toContain("ordinary-refresh-token");
});
