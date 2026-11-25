/// <reference types="bun" />
import { afterEach, describe, expect, test } from "bun:test";

const TOKEN = "__BETTERX_NATIVE_TOKEN__";

describe("Android native bridge token isolation", () => {
  const originalStringify = JSON.stringify;
  const originalParse = JSON.parse;

  afterEach(() => {
    JSON.stringify = originalStringify;
    JSON.parse = originalParse;
    // biome-ignore lint/suspicious/noExplicitAny: test cleanup of prototype pollution
    delete (Object.prototype as any).toJSON;
  });

  test("page scripts hooking JSON or Object.prototype.toJSON cannot read the token", async () => {
    const posted: string[] = [];
    const bridge = {
      postMessage(message: string) {
        posted.push(message);
        const { id } = originalParse(message) as { id: string };
        queueMicrotask(() => bridge.onmessage?.({ data: originalStringify({ id, ok: true }) }));
      },
      onmessage: null as ((event: { data: string }) => void) | null,
    };
    const g = globalThis as Record<string, unknown>;
    g.BetterXAndroid = bridge;
    g.window ??= globalThis;

    const { requestNative } = await import("./platform/native-bridge");

    // Simulate a later x.com script installing hooks after document-start.
    const leaked: unknown[] = [];
    JSON.stringify = ((value: unknown, ...rest: unknown[]) => {
      leaked.push(value);
      return (originalStringify as (...args: unknown[]) => string)(value, ...rest);
    }) as typeof JSON.stringify;
    JSON.parse = ((text: string) => {
      leaked.push(text);
      return originalParse(text);
    }) as typeof JSON.parse;
    Object.defineProperty(Object.prototype, "toJSON", {
      configurable: true,
      get() {
        leaked.push(this);
        return undefined;
      },
    });

    await requestNative({ type: "STORAGE_GET", area: "local", keys: ["a"] });

    expect(posted).toHaveLength(1);
    expect(posted[0]).toContain(TOKEN);
    expect(leaked.some((value) => originalStringify(value ?? null)?.includes(TOKEN))).toBe(false);
  });
});
