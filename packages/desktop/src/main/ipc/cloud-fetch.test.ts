/// <reference types="bun" />
import { afterAll, describe, expect, test } from "bun:test";
import { CLOUD_REQUEST_TIMEOUT_MS, fetchCloud } from "./cloud-fetch.js";

const SLOW_RESPONSE_MS = 150;

const server = Bun.serve({
  port: 0,
  async fetch() {
    await Bun.sleep(SLOW_RESPONSE_MS);
    return Response.json({ plugin_states: {}, theme_state: { order: [], active: [] } });
  },
});

afterAll(() => server.stop(true));

describe("cloud sync fetch", () => {
  const url = new URL("/api/config", server.url);
  const init = { method: "GET", headers: {}, body: null };

  test("a timeout shorter than the server's response time aborts the sync", async () => {
    await expect(fetchCloud(url, init, SLOW_RESPONSE_MS / 3)).rejects.toThrow();
  });

  test("slow self-hosted servers get more than the old 20s budget", async () => {
    expect(CLOUD_REQUEST_TIMEOUT_MS).toBeGreaterThan(20_000);
    const response = await fetchCloud(url, init);
    expect(response.ok).toBe(true);
    expect(await response.json()).toHaveProperty("plugin_states");
  });
});
