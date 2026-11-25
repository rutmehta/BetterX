import { afterEach, beforeEach, describe, expect, mock, spyOn, test } from "bun:test";
import type { CloudSyncSettings, IStorage } from "../../types/storage.js";
import type { BetterXContext } from "../tab-registry.js";
import { CloudTab, startCloudAutoSync } from "./cloud-tab.js";

const trustedServer = "https://sync.example";
const attackerServer = "https://attacker.example";
const config = {
  plugin_states: { example: { enabled: true, settings: { secret: "private config" } } },
  theme_state: {
    order: ["custom.css"],
    active: ["custom.css"],
    themes: { "custom.css": "body{}" },
  },
};

// Only the elements and events used by the cloud tab are needed here.
class TabElement {
  value = "";
  checked = false;
  style = {};
  textContent = "";
  listeners = new Map<string, () => void | Promise<void>>();
  addEventListener(event: string, listener: () => void | Promise<void>) {
    this.listeners.set(event, listener);
  }
}

const originalWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
const originalLocalStorage = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
let settings: CloudSyncSettings;
let ctx: BetterXContext;
let timer: (() => void) | undefined;
let fetchSpy: ReturnType<typeof spyOn<typeof globalThis, "fetch">>;
let pageValues: Map<string, string>;

beforeEach(() => {
  settings = {};
  timer = undefined;
  pageValues = new Map([
    ["bx_cloud_server", attackerServer],
    ["bx_autosync", "true"],
  ]);
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: {
      getItem: (key: string) => pageValues.get(key) ?? null,
      setItem: (key: string, value: string) => pageValues.set(key, value),
    },
  });
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: {
      clearInterval: () => {
        timer = undefined;
      },
      setInterval: (callback: () => void) => {
        timer = callback;
        return 1;
      },
    },
  });
  const storage: IStorage = {
    getCloudSyncSettings: async () => ({ ...settings }),
    setCloudSyncSettings: async (value) => {
      settings = { ...value };
    },
    getPluginStates: async () => config.plugin_states,
    setPluginStates: async () => {},
    getThemeState: async () => config.theme_state,
    setThemeState: async () => {},
    listThemes: async () => ["custom.css"],
    readTheme: async () => "body{}",
    writeTheme: async () => {},
    deleteTheme: async () => {},
    onThemeChanged: () => () => {},
  };
  ctx = {
    storage,
    notifications: { showError: mock(() => {}) },
  } as unknown as BetterXContext;
  fetchSpy = spyOn(globalThis, "fetch").mockImplementation(
    Object.assign(
      async (_url: URL | RequestInfo, init?: RequestInit) =>
        new Response("{}", { status: init?.method === "POST" ? 200 : 401 }),
      { preconnect: globalThis.fetch.preconnect }
    )
  );
});

afterEach(() => {
  fetchSpy.mockRestore();
  if (originalWindow) Object.defineProperty(globalThis, "window", originalWindow);
  else Reflect.deleteProperty(globalThis, "window");
  if (originalLocalStorage) {
    Object.defineProperty(globalThis, "localStorage", originalLocalStorage);
  } else Reflect.deleteProperty(globalThis, "localStorage");
});

// Drain the asynchronous initialization / interval callback, including Response.text().
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("cloud sync storage isolation", () => {
  test("page localStorage cannot opt a new user into auto-sync", async () => {
    await startCloudAutoSync(ctx);
    await settle();
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(timer).toBeUndefined();
    expect(settings).toEqual({});
  });

  test("auto-sync uses the protected server despite a poisoned page destination", async () => {
    settings = { serverUrl: trustedServer, autoSync: true };
    await startCloudAutoSync(ctx);
    await settle();
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(fetchSpy.mock.calls[0]?.[0]).toBe(`${trustedServer}/api/config`);
    expect(JSON.parse(fetchSpy.mock.calls[0]?.[1]?.body as string)).toEqual(config);
    expect(fetchSpy.mock.calls[0]?.[1]?.credentials).toBe("include");
  });

  test("an opted-in user without a custom server uses the default server", async () => {
    settings = { autoSync: true };
    await startCloudAutoSync(ctx);
    await settle();
    expect(fetchSpy.mock.calls[0]?.[0]).toBe("https://cloud.betterx.mopigames.dev/api/config");
  });

  test("each interval checks the protected opt-in flag", async () => {
    settings = { serverUrl: trustedServer, autoSync: true };
    await startCloudAutoSync(ctx);
    await settle();
    fetchSpy.mockClear();
    settings.autoSync = false;
    ctx.storage.readTheme = async () => "body{color:red}";
    timer?.();
    await settle();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  test("fails closed when protected storage is unavailable", async () => {
    ctx.storage.getCloudSyncSettings = async () => {
      throw new Error("storage unavailable");
    };
    await startCloudAutoSync(ctx);
    await settle();
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(timer).toBeUndefined();
  });

  test("the tab loads and saves both settings through IStorage", async () => {
    settings = { serverUrl: trustedServer, autoSync: false };
    const elements = new Map<string, TabElement>();
    const element = (selector: string) => {
      let node = elements.get(selector);
      if (!node) {
        node = new TabElement();
        elements.set(selector, node);
      }
      return node;
    };
    const container = { innerHTML: "", querySelector: element } as unknown as HTMLElement;
    CloudTab.initialize(container, ctx);
    await settle();
    const server = element("#cloud-server-url");
    const toggle = element("#cloud-autosync-toggle");
    expect(server.value).toBe(trustedServer);
    expect(toggle.checked).toBe(false);

    server.value = "https://new-sync.example/";
    await server.listeners.get("change")?.();
    expect(settings).toEqual({ serverUrl: "https://new-sync.example", autoSync: false });
    toggle.checked = true;
    await toggle.listeners.get("change")?.();
    expect(settings).toEqual({ serverUrl: "https://new-sync.example", autoSync: true });
    expect(pageValues.get("bx_cloud_server")).toBe(attackerServer);
    expect(fetchSpy.mock.calls.filter(([, init]) => init?.method === "POST")[0]?.[0]).toBe(
      "https://new-sync.example/api/config"
    );
  });
});
