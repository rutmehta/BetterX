/// <reference types="bun" />
import { expect, test } from "bun:test";
import { AgentController } from "../main/agent.js";
import { startBridge } from "./bridge.js";
import { connectionFile } from "./connection.js";

// Bun's mock.module() replaces a module for the whole test process. The agent
// menu suite used to stub these at load time, so later files imported the stubs.
// This must run in the same `bun test` process as agent-menu.test.ts.
test("agent menu tests leave the shared bridge, connection file and controller real", () => {
  expect(startBridge.toString()).toContain("Unsafe agent directory");
  expect(connectionFile.toString()).not.toContain("/tmp/betterx-test/connection.json");
  expect(AgentController.prototype.execute.toString()).toContain("setBackgroundThrottling");
});
