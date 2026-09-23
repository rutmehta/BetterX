/// <reference types="bun" />
import { expect, mock, test } from "bun:test";

const createdMenus: FakeMenu[] = [];
const startCalls: string[] = [];
const prompts: string[] = [];

class FakeMenuItem {
  label: string;
  submenu: FakeMenu | undefined;
  checked = false;
  enabled = true;

  constructor(options: { label: string; submenu?: FakeMenu }) {
    this.label = options.label;
    this.submenu = options.submenu;
  }
}

class FakeMenu {
  items: FakeMenuItem[] = [];

  constructor() {
    createdMenus.push(this);
  }

  append(item: FakeMenuItem) {
    this.items.push(item);
  }

  static getApplicationMenu() {
    return null;
  }

  static buildFromTemplate() {
    return new FakeMenu();
  }

  static setApplicationMenu(_menu: FakeMenu) {}
}

mock.module("electron", () => ({
  Menu: FakeMenu,
  MenuItem: FakeMenuItem,
  app: { on: () => {} },
  dialog: {
    showMessageBox: async () => {
      prompts.push("consent");
      return { response: 0 };
    },
    showErrorBox: (message: string) => prompts.push(message),
  },
}));
mock.module("../mcp/bridge.js", () => ({
  startBridge: async (path: string) => {
    startCalls.push(path);
    return { close: async () => {} };
  },
}));
mock.module("../mcp/connection.js", () => ({
  connectionFile: () => "/tmp/betterx-test/connection.json",
}));
mock.module("./agent.js", () => ({
  AgentController: class {
    execute() {}
    clear() {}
  },
}));
mock.module("./services/settings.js", () => ({
  getSetting: () => false,
  setSetting: () => {},
}));

test("agent bridge starts at launch without consent or an off control", async () => {
  const { installAgentMenu } = await import("./agent-menu.js");
  installAgentMenu(() => null);
  await Promise.resolve();
  const appMenu = createdMenus.at(-2);
  const agentMenu = appMenu?.items.find((item) => item.label === "Agent")?.submenu;
  expect(agentMenu?.items.map((item) => item.label)).toEqual(["Connection information"]);
  expect(startCalls).toEqual(["/tmp/betterx-test/connection.json"]);
  expect(prompts).toEqual([]);
});
