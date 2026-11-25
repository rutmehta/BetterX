import { expect, test } from "bun:test";
import { AndroidStorage } from "./storage.js";

test("cloud settings never fall back to page localStorage without the native bridge", async () => {
  const storage = new AndroidStorage();
  await expect(storage.getCloudSyncSettings()).rejects.toThrow("Native storage unavailable");
  await expect(
    storage.setCloudSyncSettings({ serverUrl: "https://sync.example", autoSync: true })
  ).rejects.toThrow("Native storage unavailable");
});
