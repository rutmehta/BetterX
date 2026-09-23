/// <reference types="bun" />
import { expect, test } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { callBridge } from "./client.js";

test("missing bridge tells users to open BetterX, not to use a removed enable switch", async () => {
  const dir = await mkdtemp("/tmp/bx-client-test-");
  try {
    await expect(
      callBridge({ name: "get_status", args: {} }, join(dir, "missing.json"))
    ).rejects.toThrow("Open BetterX to start the local agent bridge");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("stale bridge socket tells users to reopen BetterX without an enable switch", async () => {
  const dir = await mkdtemp("/tmp/bx-client-test-");
  const path = join(dir, "connection.json");
  await writeFile(
    path,
    JSON.stringify({
      version: 1,
      token: "a".repeat(64),
      socketPath: "/tmp/betterx-mcp-DoesNotExist/bridge.sock",
    }),
    { mode: 0o600 }
  );
  try {
    await expect(callBridge({ name: "get_status", args: {} }, path)).rejects.toThrow(
      "Cannot connect to BetterX; reopen the app and try again"
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
