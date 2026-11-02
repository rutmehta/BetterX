/// <reference types="bun" />
import { describe, expect, test } from "bun:test";
import { assertCloudSyncSettings } from "./settings-validation.js";

describe("cloud sync settings validation", () => {
  test("accepts settings with a URL and boolean auto-sync flag", () => {
    expect(() =>
      assertCloudSyncSettings({ serverUrl: "https://cloud.example", autoSync: false })
    ).not.toThrow();
  });

  test("rejects values that do not match the settings shape", () => {
    for (const value of [
      null,
      [],
      {},
      { serverUrl: "https://cloud.example", autoSync: "yes" },
      { serverUrl: 5, autoSync: false },
    ]) {
      expect(() => assertCloudSyncSettings(value)).toThrow("Invalid cloud sync settings");
    }
  });
});
