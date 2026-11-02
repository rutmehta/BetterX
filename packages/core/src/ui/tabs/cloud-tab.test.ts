import { expect, test } from "bun:test";
import type { CloudSyncSettings, IStorage } from "../../types/storage.js";
import { setFetchProxy } from "../../utils/proxy.js";
import type { BetterXContext } from "../tab-registry.js";
import { startCloudAutoSync } from "./cloud-tab.js";

test("auto-sync ignores page-controlled settings and uses protected storage on every tick", async () => {
  const windowDescriptor = Object.getOwnPropertyDescriptor(globalThis, "window");
  const localStorageDescriptor = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
  const requests: { url: string; body: string | undefined }[] = [];
  let tick = () => {};
  let settings: CloudSyncSettings = { serverUrl: "https://trusted.example", autoSync: false };
  let failReads = false;
  let revision = 0;
  const storage: IStorage = {
    async getCloudSyncSettings() {
      if (failReads) throw new Error("storage unavailable");
      return settings;
    },
    async getPluginStates() {
      return { example: { enabled: true, settings: { revision } } };
    },
    async getThemeState() {
      return { order: ["custom.css"], active: ["custom.css"] };
    },
    async listThemes() {
      return ["custom.css"];
    },
    async readTheme() {
      return "body { color: red; }";
    },
    async setCloudSyncSettings() {},
    async setPluginStates() {},
    async setThemeState() {},
    async writeTheme() {},
    async deleteTheme() {},
    onThemeChanged() {
      return () => {};
    },
  };
  const ctx = { storage } as BetterXContext;

  // These are the values an x.com script could plant before startup.
  const pageSettings = new Map([
    ["bx_cloud_server", "https://attacker.example"],
    ["bx_autosync", "true"],
  ]);
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: { getItem: (key: string) => pageSettings.get(key) ?? null },
  });
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: {
      clearInterval() {},
      setInterval(callback: () => void) {
        tick = callback;
        return 1;
      },
    },
  });
  setFetchProxy(async (url, init) => {
    requests.push({ url, body: init?.body });
    return { ok: true, status: 200, text: "{}", json: {} };
  });
  const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

  try {
    startCloudAutoSync(ctx);
    await settle();
    expect(requests).toEqual([]);

    settings = { ...settings, autoSync: true };
    tick();
    await settle();
    expect(requests.map((request) => request.url)).toEqual(["https://trusted.example/api/config"]);
    expect(JSON.parse(requests[0]?.body ?? "{}")).toMatchObject({
      plugin_states: { example: { enabled: true, settings: { revision: 0 } } },
      theme_state: { themes: { "custom.css": "body { color: red; }" } },
    });

    pageSettings.set("bx_cloud_server", "https://another-attacker.example");
    pageSettings.set("bx_autosync", "false");
    revision++;
    tick();
    await settle();
    expect(requests.map((request) => request.url)).toEqual([
      "https://trusted.example/api/config",
      "https://trusted.example/api/config",
    ]);

    settings = { ...settings, autoSync: false };
    revision++;
    tick();
    await settle();
    expect(requests).toHaveLength(2);

    settings = { ...settings, autoSync: true };
    failReads = true;
    tick();
    await settle();
    expect(requests).toHaveLength(2);
  } finally {
    if (windowDescriptor) Object.defineProperty(globalThis, "window", windowDescriptor);
    else Reflect.deleteProperty(globalThis, "window");
    if (localStorageDescriptor) {
      Object.defineProperty(globalThis, "localStorage", localStorageDescriptor);
    } else Reflect.deleteProperty(globalThis, "localStorage");
  }
});
