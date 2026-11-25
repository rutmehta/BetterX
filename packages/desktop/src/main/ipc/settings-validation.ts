import type { CloudSyncSettings } from "@betterx/core";

export function assertCloudSyncSettings(value: unknown): asserts value is CloudSyncSettings {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    typeof (value as Record<string, unknown>).serverUrl !== "string" ||
    typeof (value as Record<string, unknown>).autoSync !== "boolean"
  ) {
    throw new Error("Invalid cloud sync settings");
  }
}
