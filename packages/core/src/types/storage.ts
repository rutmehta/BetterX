import type { PluginStorageData } from "./plugin.js";
import type { ThemeStorageState } from "./theme.js";

// ─── Storage Abstraction ──────────────────────────────────────────────────────

export type CloudSyncSettings = {
  serverUrl?: string;
  autoSync?: boolean;
};

export interface IStorage {
  // Cloud destination and opt-in must never come from page localStorage.
  getCloudSyncSettings(): Promise<CloudSyncSettings>;
  setCloudSyncSettings(settings: CloudSyncSettings): Promise<void>;

  // Plugin states
  getPluginStates(): Promise<Record<string, PluginStorageData>>;
  setPluginStates(data: Record<string, PluginStorageData>): Promise<void>;

  // Theme metadata (order, active set)
  getThemeState(): Promise<ThemeStorageState>;
  setThemeState(state: ThemeStorageState): Promise<void>;

  // Theme CSS blobs
  listThemes(): Promise<string[]>;
  readTheme(id: string): Promise<string>;
  writeTheme(id: string, css: string): Promise<void>;
  deleteTheme(id: string): Promise<void>;

  // Live theme change notifications (returns unsubscribe fn)
  onThemeChanged(cb: (id: string, css: string) => void): () => void;
}
