// Electron-free so tests can install the menu without mock.module().
// Bun applies mock.module() to every file in the test process.
import type { BrowserWindow } from "electron";
import type { Command } from "../mcp/protocol.js";

export interface AgentMenuHandle {
  append(item: AgentMenuEntry): void;
}

export interface AgentMenuEntry {
  label: string;
  submenu?: AgentMenuHandle;
}

export interface AgentMenuDependencies {
  getApplicationMenu(): AgentMenuHandle | null;
  buildFromTemplate(
    template: ReadonlyArray<{ role: "fileMenu" | "editMenu" | "viewMenu" | "windowMenu" }>
  ): AgentMenuHandle;
  setApplicationMenu(menu: AgentMenuHandle): void;
  createMenu(): AgentMenuHandle;
  createMenuItem(options: {
    label: string;
    submenu?: AgentMenuHandle;
    click?: () => void;
  }): AgentMenuEntry;
  onBeforeQuit(listener: () => void): void;
  quit(): void;
  showMessageBox(options: { title: string; message: string; detail: string }): void;
  showErrorBox(title: string, content: string): void;
  startBridge(
    path: string,
    execute: (command: Command, signal: AbortSignal) => Promise<unknown>
  ): Promise<{ close(): void | Promise<void> }>;
  connectionFile(): string;
  createController(getWindow: () => BrowserWindow | null): {
    execute(command: Command, signal: AbortSignal): Promise<unknown>;
    clear(): void;
  };
}

export function installAgentMenuWith(
  deps: AgentMenuDependencies,
  getWindow: () => BrowserWindow | null,
  headless = false
) {
  const controller = deps.createController(getWindow);
  let bridge: { close(): void | Promise<void> } | null = null;
  if (!headless) {
    const menu =
      deps.getApplicationMenu() ??
      deps.buildFromTemplate([
        { role: "fileMenu" },
        { role: "editMenu" },
        { role: "viewMenu" },
        { role: "windowMenu" },
      ]);
    const submenu = deps.createMenu();
    submenu.append(
      deps.createMenuItem({
        label: "Connection information",
        click: () => {
          deps.showMessageBox({
            title: "BetterX local MCP",
            message: bridge ? "Agent access is enabled" : "Agent access could not start",
            detail: `Connection file: ${deps.connectionFile()}\n\nThe MCP client uses stdio. Run the bundled dist/mcp/index.cjs with Node.js 20 or later. See the repository's docs/local-mcp.md for configuration. No private post data is saved to disk by the bridge.`,
          });
        },
      })
    );
    menu.append(deps.createMenuItem({ label: "Agent", submenu }));
    deps.setApplicationMenu(menu);
  }

  void deps
    .startBridge(deps.connectionFile(), (command, signal) => controller.execute(command, signal))
    .then((started) => {
      bridge = started;
    })
    .catch((error: unknown) => {
      if (headless) {
        console.error("BetterX agent access failed:", error);
        deps.quit();
        return;
      }
      deps.showErrorBox(
        "BetterX agent access",
        error instanceof Error ? error.message : "Could not start agent access"
      );
    });
  deps.onBeforeQuit(() => {
    controller.clear();
    void bridge?.close();
  });
}
