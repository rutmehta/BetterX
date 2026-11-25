import { describe, expect, test } from "bun:test";
import { fetchTwitterUser } from "./twitter.js";

const userBody = { data: { id: "123", username: "alice", profile_image_url: "https://x/p.png" } };

function sequence(...responses: (() => Response)[]) {
  const calls: string[] = [];
  const fetch = async (input: string) => {
    calls.push(input);
    const next = responses.shift();
    if (!next) throw new Error("unexpected fetch");
    return next();
  };
  return { fetch, calls };
}

const rateLimited =
  (headers: Record<string, string> = {}) =>
  () =>
    new Response(JSON.stringify({ title: "Too Many Requests" }), { status: 429, headers });
const okUser = () => Response.json(userBody);

describe("fetchTwitterUser", () => {
  test("retries a transient 429 on /2/users/me instead of failing sign-in", async () => {
    const waits: number[] = [];
    const { fetch, calls } = sequence(rateLimited({ "retry-after": "1" }), okUser);
    const result = await fetchTwitterUser("token", {
      fetch,
      sleep: async (ms) => void waits.push(ms),
    });
    expect(result).toEqual({ ok: true, user: userBody.data });
    expect(calls).toHaveLength(2);
    expect(waits).toEqual([1000]);
  });

  test("honors x-rate-limit-reset when Retry-After is absent", async () => {
    const waits: number[] = [];
    const { fetch } = sequence(rateLimited({ "x-rate-limit-reset": "1002" }), okUser);
    const result = await fetchTwitterUser("token", {
      fetch,
      sleep: async (ms) => void waits.push(ms),
      now: () => 1_000_000,
    });
    expect(result.ok).toBe(true);
    expect(waits).toEqual([2000]);
  });

  test("gives up with retryAfterSeconds when the rate-limit window is too long", async () => {
    const { fetch, calls } = sequence(rateLimited({ "retry-after": "900" }));
    const result = await fetchTwitterUser("token", {
      fetch,
      sleep: async () => {
        throw new Error("should not wait");
      },
    });
    expect(result).toEqual({ ok: false, status: 429, retryAfterSeconds: 900 });
    expect(calls).toHaveLength(1);
  });

  test("stops after a bounded number of 429s", async () => {
    const { fetch, calls } = sequence(rateLimited(), rateLimited(), rateLimited());
    const result = await fetchTwitterUser("token", { fetch, sleep: async () => {} });
    expect(result).toEqual({ ok: false, status: 429, retryAfterSeconds: 3 });
    expect(calls).toHaveLength(3);
  });

  test("does not retry other failures and tolerates non-JSON bodies", async () => {
    const { fetch, calls } = sequence(
      () => new Response("<html>bad gateway</html>", { status: 503 })
    );
    const result = await fetchTwitterUser("token", { fetch, sleep: async () => {} });
    expect(result).toEqual({ ok: false, status: 503 });
    expect(calls).toHaveLength(1);
  });
});
