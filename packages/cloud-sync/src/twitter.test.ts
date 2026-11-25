import { describe, expect, test } from "bun:test";
import { fetchTwitterUser } from "./twitter.js";

const NOW = 1_700_000_000_000;

function userResponse() {
  return Response.json({ data: { id: "123", username: "alice" } });
}

function rateLimited(headers: Record<string, string> = {}) {
  return Response.json({ title: "Too Many Requests", status: 429 }, { status: 429, headers });
}

function sequence(...responses: Response[]) {
  const calls: string[] = [];
  const fetch = async (input: string) => {
    calls.push(input);
    const next = responses.shift();
    if (!next) throw new Error("unexpected fetch");
    return next;
  };
  return { calls, fetch };
}

describe("X user lookup during cloud-sync sign-in", () => {
  test("returns the user on success", async () => {
    const { fetch } = sequence(userResponse());
    const result = await fetchTwitterUser("token", { fetch });
    expect(result).toEqual({ ok: true, user: { id: "123", username: "alice" } });
  });

  test("retries once after a short 429 window and signs the user in", async () => {
    const sleeps: number[] = [];
    const { calls, fetch } = sequence(
      rateLimited({ "x-rate-limit-reset": String(NOW / 1000 + 2) }),
      userResponse()
    );
    const result = await fetchTwitterUser("token", {
      fetch,
      now: () => NOW,
      sleep: async (ms) => {
        sleeps.push(ms);
      },
    });
    expect(result.ok).toBe(true);
    expect(calls).toHaveLength(2);
    expect(sleeps).toEqual([2000]);
  });

  test("does not hold the callback open for long rate-limit windows", async () => {
    const { calls, fetch } = sequence(rateLimited({ "retry-after": "900" }));
    const result = await fetchTwitterUser("token", {
      fetch,
      now: () => NOW,
      sleep: async () => {
        throw new Error("should not sleep");
      },
    });
    expect(calls).toHaveLength(1);
    expect(result).toEqual({ ok: false, status: 429, retryAfterSeconds: 900 });
  });

  test("reports a persistent 429 with the reset delay", async () => {
    const { fetch } = sequence(
      rateLimited(),
      rateLimited({ "x-rate-limit-reset": String(NOW / 1000 + 60) })
    );
    const result = await fetchTwitterUser("token", {
      fetch,
      now: () => NOW,
      sleep: async () => {},
    });
    expect(result).toEqual({ ok: false, status: 429, retryAfterSeconds: 60 });
  });

  test("tolerates non-JSON error bodies", async () => {
    const { fetch } = sequence(new Response("Bad Gateway", { status: 502 }));
    const result = await fetchTwitterUser("token", { fetch });
    expect(result).toEqual({ ok: false, status: 502 });
  });
});
