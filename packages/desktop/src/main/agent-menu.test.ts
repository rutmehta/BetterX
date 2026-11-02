/// <reference types="bun" />
import { expect, test } from "bun:test";
import {
  type AgentMenuDependencies,
  type AgentMenuEntry,
  type AgentMenuHandle,
  installAgentMenuWith,
} from "./agent-menu-core.js";

const createdMenus: FakeMenu[] = [];
const startCalls: string[] = [];
const prompts: string[] = [];
const quits: number[] = [];

class FakeMenuItem implements AgentMenuEntry {
  label: string;
  submenu?: FakeMenu;
  click?: () => void;

  constructor(options: { label: string; submenu?: AgentMenuHandle; click?: () => void }) {
    this.label = options.label;
    if (options.submenu) this.submenu = options.submenu as FakeMenu;
    if (options.click) this.click = options.click;
  }
}

class FakeMenu implements AgentMenuHandle {
  items: FakeMenuItem[] = [];

  constructor() {
    createdMenus.push(this);
  }

  append(item: AgentMenuEntry) {
    this.items.push(item as FakeMenuItem);
  }
}

function dependencies(): AgentMenuDependencies {
  return {
    getApplicationMenu: () => null,
    buildFromTemplate: () => new FakeMenu(),
    setApplicationMenu: () => {},
    createMenu: () => new FakeMenu(),
    createMenuItem: (options) => new FakeMenuItem(options),
    onBeforeQuit: () => {},
    quit: () => {
      quits.push(1);
    },
    showMessageBox: () => {
      prompts.push("consent");
    },
    showErrorBox: (message) => prompts.push(message),
    startBridge: async (path) => {
      startCalls.push(path);
      return { close: async () => {} };
    },
    connectionFile: () => "/tmp/betterx-test/connection.json",
    createController: () => ({
      async execute() {
        return undefined;
      },
      clear() {},
    }),
  };
}

function reset() {
  createdMenus.length = 0;
  startCalls.length = 0;
  prompts.length = 0;
  quits.length = 0;
}

test("agent bridge starts at launch without consent or an off control", async () => {
  reset();
  installAgentMenuWith(dependencies(), () => null);
  await Promise.resolve();
  const appMenu = createdMenus.at(-2);
  const agentMenu = appMenu?.items.find((item) => item.label === "Agent")?.submenu;
  expect(agentMenu?.items.map((item) => item.label)).toEqual(["Connection information"]);
  expect(startCalls).toEqual(["/tmp/betterx-test/connection.json"]);
  expect(prompts).toEqual([]);
  expect(quits).toEqual([]);
});

test("headless bridge starts without menus or dialogs", async () => {
  reset();
  installAgentMenuWith(dependencies(), () => null, true);
  await Promise.resolve();
  expect(createdMenus).toEqual([]);
  expect(startCalls).toEqual(["/tmp/betterx-test/connection.json"]);
  expect(prompts).toEqual([]);
  expect(quits).toEqual([]);
});
