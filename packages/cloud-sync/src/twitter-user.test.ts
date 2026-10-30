import { describe, expect, test } from "bun:test";
import { fetchTwitterUser, retryAfterSeconds } from "./twitter-user.js";

const USER = { id: "123", username: "bx", profile_image_url: "https://pbs.twimg.com/a.jpg" };

function mockFetch(responses: Response[]) {
  const calls: string[] = [];
  const fetchImpl = (async (url: string) => {
    calls.push(url);
    const next = responses.shift();
    if (!next) throw new Error("unexpected fetch");
    return next;
  }) as unknown as typeof fetch;
  return { fetchImpl, calls };
}

const rateLimited = (headers: Record<string, string> = {}) =>
  new Response(JSON.stringify({ title: "Too Many Requests" }), { status: 429, headers });
const ok = () => Response.json({ data: USER });

describe("fetchTwitterUser", () => {
  test("retries a rate-limited /2/users/me lookup instead of failing sign-in", async () => {
    const { fetchImpl, calls } = mockFetch([rateLimited({ "retry-after": "1" }), ok()]);
    const sleeps: number[] = [];
    const result = await fetchTwitterUser("tok", {
      fetchImpl,
      sleep: async (ms) => void sleeps.push(ms),
    });
    expect(result).toEqual({ ok: true, user: USER });
    expect(calls).toHaveLength(2);
    expect(sleeps).toEqual([1000]);
  });

  test("gives up with 429 and Retry-After when the limit outlasts the retry budget", async () => {
    const { fetchImpl, calls } = mockFetch([rateLimited({ "retry-after": "900" })]);
    const result = await fetchTwitterUser("tok", { fetchImpl, sleep: async () => {} });
    expect(result).toEqual({ ok: false, status: 429, retryAfterSeconds: 900 });
    expect(calls).toHaveLength(1);
  });

  test("stops after the bounded number of retries", async () => {
    const { fetchImpl, calls } = mockFetch([rateLimited(), rateLimited(), rateLimited()]);
    const result = await fetchTwitterUser("tok", { fetchImpl, sleep: async () => {} });
    expect(result).toEqual({ ok: false, status: 429, retryAfterSeconds: undefined });
    expect(calls).toHaveLength(3);
  });

  test("does not retry other failures and tolerates non-JSON bodies", async () => {
    const { fetchImpl, calls } = mockFetch([new Response("<html>", { status: 500 })]);
    const result = await fetchTwitterUser("tok", { fetchImpl, sleep: async () => {} });
    expect(result).toEqual({ ok: false, status: 500 });
    expect(calls).toHaveLength(1);
  });
});

describe("retryAfterSeconds", () => {
  test("falls back to x-rate-limit-reset epoch seconds", () => {
    const headers = new Headers({ "x-rate-limit-reset": "1030" });
    expect(retryAfterSeconds(headers, 1_000_000)).toBe(30);
  });
});
