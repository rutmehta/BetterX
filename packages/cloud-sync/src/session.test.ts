import { afterAll, beforeAll, expect, spyOn, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { SignJWT } from "jose";

const origin = "http://localhost:4000";
const secret = "test-session-secret-at-least-32-characters";
let directory: string;
let server: typeof import("./index.js").default;
let db: typeof import("./db/schema.js").db;

beforeAll(async () => {
  directory = await mkdtemp(path.join(tmpdir(), "betterx-sessions-"));
  const environment = {
    BASE_URL: origin,
    SESSION_SECRET: secret,
    TWITTER_CLIENT_ID: "test-client",
    TWITTER_CLIENT_SECRET: "test-secret",
    DATABASE_URL: path.join(directory, "test.db"),
  };
  const previous = Object.fromEntries(
    Object.keys(environment).map((key) => [key, process.env[key]])
  );
  Object.assign(process.env, environment);
  try {
    server = (await import("./index.js")).default;
    db = (await import("./db/schema.js")).db;
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});

afterAll(async () => {
  db?.close();
  if (directory) await rm(directory, { recursive: true, force: true });
});

function request(route: string, cookie: string, method = "GET") {
  return server.fetch(new Request(`${origin}${route}`, { method, headers: { Cookie: cookie } }));
}

async function login(id = "test-user") {
  const fetchMock = spyOn(globalThis, "fetch")
    .mockResolvedValueOnce(Response.json({ access_token: "test-access-token" }))
    .mockResolvedValueOnce(Response.json({ data: { id, username: id } }));
  try {
    const response = await request(
      "/auth/callback?code=test-code&state=test-state",
      "oauth_state=test-state; oauth_verifier=test-verifier"
    );
    expect(response.status).toBe(302);
    const cookie = response.headers.getSetCookie().find((value) => value.startsWith("bx_session="));
    expect(cookie).toBeDefined();
    if (!cookie) throw new Error("Login did not issue a session cookie");
    return cookie.split(";")[0] ?? "";
  } finally {
    fetchMock.mockRestore();
  }
}

test("logout revokes a copied session token on every protected route", async () => {
  const cookie = await login();
  expect((await request("/api/me", cookie)).status).toBe(200);
  const logout = await request("/auth/logout", cookie, "POST");
  expect(logout.status).toBe(302);
  expect(logout.headers.get("set-cookie")).toContain("Max-Age=0");
  expect((await request("/api/me", cookie)).status).toBe(401);
  expect((await request("/api/config", cookie)).status).toBe(401);
  expect((await request("/api/config", cookie, "POST")).status).toBe(401);
  expect((await request("/", cookie)).headers.get("location")).toBe("/auth/twitter");
});

test("logout only revokes that session, not other logins or users", async () => {
  const first = await login();
  const second = await login();
  const otherUser = await login("other-user");
  await request("/auth/logout", first, "POST");
  expect((await request("/api/me", second)).status).toBe(200);
  expect((await request("/api/me", otherUser)).status).toBe(200);
  await request("/auth/logout", first, "POST");
  expect((await request("/api/me", second)).status).toBe(200);
});

test("legacy stateless sessions are rejected", async () => {
  const token = await new SignJWT({ id: "test-user" })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuer(origin)
    .setAudience("betterx-cloud")
    .setExpirationTime("30d")
    .sign(new TextEncoder().encode(secret));
  expect((await request("/api/me", `bx_session=${token}`)).status).toBe(401);
});

test("logout without a valid cookie still clears the cookie", async () => {
  for (const cookie of ["", "bx_session=invalid"]) {
    const response = await request("/auth/logout", cookie, "POST");
    expect(response.status).toBe(302);
    expect(response.headers.get("set-cookie")).toContain("Max-Age=0");
  }
});
