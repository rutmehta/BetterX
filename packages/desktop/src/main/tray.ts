import { type BrowserWindow, Menu, Tray, app, nativeImage } from "electron";

// ─── System Tray ──────────────────────────────────────────────────────────────

let tray: Tray | null = null;

type WindowProvider = () => BrowserWindow | null;

function withWindow(getWindow: WindowProvider, callback: (window: BrowserWindow) => void): void {
  const window = getWindow();
  if (window && !window.isDestroyed()) callback(window);
}

function buildMenu(getWindow: WindowProvider): Menu {
  return Menu.buildFromTemplate([
    {
      label: "Open BetterX",
      click: () =>
        withWindow(getWindow, (window) => {
          window.show();
          window.focus();
        }),
    },
    {
      label: "Settings",
      click: () =>
        withWindow(getWindow, (window) => {
          window.show();
          window.focus();
          void window.webContents.executeJavaScriptInIsolatedWorld(1000, [
            { code: "window.__betterx_open_settings?.()" },
          ]);
        }),
    },
    { type: "separator" },
    {
      label: "Restart",
      click: () => {
        app.relaunch();
        app.exit(0);
      },
    },
    {
      label: "Quit",
      click: () => {
        app.quit();
      },
    },
  ]);
}

// macOS draws tray images at their point size, so the 256px app icon would fill
// the menu bar. Use an 18pt template image (with a @2x representation) instead.
function createTrayImage(iconPath: string): Electron.NativeImage {
  const source = nativeImage.createFromPath(iconPath);
  if (source.isEmpty() || process.platform !== "darwin") return source;
  const image = nativeImage.createEmpty();
  for (const scaleFactor of [1, 2]) {
    const size = 18 * scaleFactor;
    const resized = source.resize({ width: size, height: size, quality: "best" });
    image.addRepresentation({ scaleFactor, width: size, height: size, buffer: resized.toPNG() });
  }
  image.setTemplateImage(true);
  return image;
}

export function createTray(iconPath: string, getWindow: WindowProvider): void {
  if (tray) return;

  tray = new Tray(createTrayImage(iconPath));
  tray.setToolTip("BetterX V3");
  tray.setContextMenu(buildMenu(getWindow));

  // Click toggles show/hide (Linux/Windows - macOS shows context menu)
  tray.on("click", () => {
    withWindow(getWindow, (window) => {
      if (window.isVisible() && window.isFocused()) {
        window.hide();
      } else {
        window.show();
        window.focus();
      }
    });
  });
}

export function destroyTray(): void {
  tray?.destroy();
  tray = null;
}

export function getTray(): Tray | null {
  return tray;
}
