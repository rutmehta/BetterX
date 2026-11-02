import { beforeAll, describe, expect, test } from "bun:test";
import { SignJWT } from "jose";

const BASE = "https://sync.example.com";
const SECRET = "test-session-secret-at-least-32-characters";

process.env.BASE_URL = BASE;
process.env.TWITTER_CLIENT_ID = "client";
process.env.TWITTER_CLIENT_SECRET = "secret";
process.env.SESSION_SECRET = SECRET;
process.env.DATABASE_URL = ":memory:";

let app: { fetch: (req: Request) => Response | Promise<Response> };
let cookie: string;

const config = JSON.stringify({
  plugin_states: { evil: { enabled: true, settings: {} } },
  theme_state: { order: ["pwn.css"], active: ["pwn.css"], themes: { "pwn.css": "body{}" } },
});

function post(path: string, headers: Record<string, string>, body?: string): Promise<Response> {
  return Promise.resolve(
    app.fetch(
      new Request(`${BASE}${path}`, {
        method: "POST",
        headers: { Cookie: cookie, ...headers },
        body: body ?? null,
      })
    )
  );
}

beforeAll(async () => {
  app = (await import("./index.js")).default;
  const token = await new SignJWT({ id: "user-1", username: "alice" })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuer(BASE)
    .setAudience("betterx-cloud")
    .setExpirationTime("1h")
    .sign(new TextEncoder().encode(SECRET));
  cookie = `bx_session=${token}`;
});

describe("cloud-sync CSRF protection", () => {
  test("rejects a cross-site text/plain config overwrite", async () => {
    const res = await post(
      "/api/config",
      { Origin: "https://evil.example", "Content-Type": "text/plain" },
      config
    );
    expect(res.status).toBe(403);
  });

  test("rejects a config POST that is not application/json", async () => {
    const res = await post("/api/config", { "Content-Type": "text/plain" }, config);
    expect(res.status).toBe(415);
  });

  test("rejects a cross-site logout", async () => {
    const res = await post("/auth/logout", { Origin: "https://evil.example" });
    expect(res.status).toBe(403);
  });

  test("rejects an opaque null origin", async () => {
    const res = await post("/auth/logout", { Origin: "null" });
    expect(res.status).toBe(403);
  });

  test("accepts JSON from the dashboard, extensions, and non-browser clients", async () => {
    for (const origin of [BASE, "chrome-extension://abc", "moz-extension://uuid", undefined]) {
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (origin) headers.Origin = origin;
      const res = await post("/api/config", headers, config);
      expect(res.status).toBe(200);
    }
  });

  test("accepts a same-origin logout", async () => {
    const res = await post("/auth/logout", { Origin: BASE });
    expect(res.status).toBe(302);
  });
});
