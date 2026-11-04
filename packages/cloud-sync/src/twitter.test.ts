import { describe, expect, test } from "bun:test";
import { fetchTwitterUser, rateLimitWaitMs } from "./twitter.js";

const NOW = 1_700_000_000_000;

function rateLimited(headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify({ title: "Too Many Requests", status: 429 }), {
    status: 429,
    headers,
  });
}

function userOk(): Response {
  return Response.json({ data: { id: "42", username: "alice" } });
}

function harness(responses: Response[]) {
  const sleeps: number[] = [];
  let calls = 0;
  const options = {
    fetchImpl: async () => {
      const res = responses[calls++];
      if (!res) throw new Error("unexpected fetch");
      return res;
    },
    sleep: async (ms: number) => {
      sleeps.push(ms);
    },
    now: () => NOW,
  };
  return { options, sleeps, calls: () => calls };
}

describe("fetchTwitterUser", () => {
  test("recovers from a short /2/users/me rate limit instead of failing sign-in", async () => {
    const h = harness([rateLimited({ "x-rate-limit-reset": String(NOW / 1000 + 2) }), userOk()]);
    const result = await fetchTwitterUser("token", h.options);
    expect(result).toEqual({ ok: true, user: { id: "42", username: "alice" } });
    expect(h.sleeps).toEqual([2000]);
    expect(h.calls()).toBe(2);
  });

  test("gives up on long rate-limit windows and reports when to retry", async () => {
    const h = harness([rateLimited({ "x-rate-limit-reset": String(NOW / 1000 + 600) })]);
    const result = await fetchTwitterUser("token", h.options);
    expect(result).toEqual({ ok: false, status: 429, retryAfterSeconds: 600 });
    expect(h.sleeps).toEqual([]);
  });

  test("bounds the number of retries", async () => {
    const h = harness([rateLimited(), rateLimited(), rateLimited()]);
    const result = await fetchTwitterUser("token", h.options);
    expect(result).toEqual({ ok: false, status: 429, retryAfterSeconds: 1 });
    expect(h.calls()).toBe(3);
  });

  test("reports non-rate-limit failures without retrying, even with non-JSON bodies", async () => {
    const h = harness([new Response("bad gateway", { status: 502 })]);
    expect(await fetchTwitterUser("token", h.options)).toEqual({ ok: false, status: 502 });
    expect(h.calls()).toBe(1);
  });
});

describe("rateLimitWaitMs", () => {
  test("parses retry-after seconds and HTTP dates", () => {
    expect(rateLimitWaitMs(new Headers({ "retry-after": "3" }), NOW)).toBe(3000);
    const date = new Date(NOW + 4000).toUTCString();
    expect(rateLimitWaitMs(new Headers({ "retry-after": date }), NOW)).toBe(4000);
    expect(rateLimitWaitMs(new Headers(), NOW)).toBeUndefined();
  });
});
