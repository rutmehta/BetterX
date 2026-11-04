import { describe, expect, test } from "bun:test";
import { fetchTwitterUser } from "./twitter-user.js";

const user = { id: "123", username: "jack", profile_image_url: "https://pbs.twimg.com/a.jpg" };

function mockFetch(responses: Response[]) {
  const calls: string[] = [];
  const fetchImpl = (async (url: string) => {
    calls.push(url);
    const res = responses.shift();
    if (!res) throw new Error("unexpected fetch");
    return res;
  }) as unknown as typeof fetch;
  return { fetchImpl, calls };
}

const rateLimited = (headers: Record<string, string> = {}) =>
  new Response(JSON.stringify({ title: "Too Many Requests" }), { status: 429, headers });
const ok = () => new Response(JSON.stringify({ data: user }), { status: 200 });

describe("fetchTwitterUser", () => {
  test("returns the user on success", async () => {
    const { fetchImpl } = mockFetch([ok()]);
    expect(await fetchTwitterUser("tok", { fetch: fetchImpl })).toEqual({ ok: true, user });
  });

  test("retries a rate-limited /2/users/me lookup instead of failing sign-in", async () => {
    const sleeps: number[] = [];
    const { fetchImpl, calls } = mockFetch([rateLimited({ "retry-after": "2" }), ok()]);
    const result = await fetchTwitterUser("tok", {
      fetch: fetchImpl,
      sleep: async (ms) => void sleeps.push(ms),
    });
    expect(result).toEqual({ ok: true, user });
    expect(calls).toHaveLength(2);
    expect(sleeps).toEqual([2000]);
  });

  test("uses x-rate-limit-reset when Retry-After is absent", async () => {
    const sleeps: number[] = [];
    const { fetchImpl } = mockFetch([rateLimited({ "x-rate-limit-reset": "1003" }), ok()]);
    await fetchTwitterUser("tok", {
      fetch: fetchImpl,
      sleep: async (ms) => void sleeps.push(ms),
      now: () => 1_000_000,
    });
    expect(sleeps).toEqual([3000]);
  });

  test("reports rate limiting with a retry hint when the window is too long", async () => {
    const { fetchImpl, calls } = mockFetch([rateLimited({ "retry-after": "900" })]);
    const result = await fetchTwitterUser("tok", { fetch: fetchImpl, sleep: async () => {} });
    expect(result).toEqual({ ok: false, status: 429, retryAfterSeconds: 900 });
    expect(calls).toHaveLength(1);
  });

  test("gives up after bounded retries", async () => {
    const { fetchImpl, calls } = mockFetch([rateLimited(), rateLimited(), rateLimited()]);
    const result = await fetchTwitterUser("tok", { fetch: fetchImpl, sleep: async () => {} });
    expect(result).toEqual({ ok: false, status: 429, retryAfterSeconds: 1 });
    expect(calls).toHaveLength(3);
  });

  test("handles non-JSON error bodies", async () => {
    const { fetchImpl } = mockFetch([new Response("Bad Gateway", { status: 502 })]);
    expect(await fetchTwitterUser("tok", { fetch: fetchImpl })).toEqual({ ok: false, status: 502 });
  });
});
