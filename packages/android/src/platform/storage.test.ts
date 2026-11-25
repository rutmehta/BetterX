import { expect, test } from "bun:test";
import { AndroidStorage } from "./storage.js";

test("cloud settings require native storage instead of the page-storage fallback", async () => {
  const storage = new AndroidStorage();

  await expect(storage.getCloudSyncSettings()).rejects.toThrow(
    "Native cloud settings storage unavailable"
  );
  await expect(
    storage.setCloudSyncSettings({ serverUrl: "https://trusted.example", autoSync: true })
  ).rejects.toThrow("Native cloud settings storage unavailable");
});
