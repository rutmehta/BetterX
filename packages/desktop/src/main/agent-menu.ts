import { type BrowserWindow, Menu, MenuItem, app, dialog } from "electron";
import { startBridge } from "../mcp/bridge.js";
import { connectionFile } from "../mcp/connection.js";
import { AgentController } from "./agent.js";

export function installAgentMenu(getWindow: () => BrowserWindow | null) {
  const controller = new AgentController(getWindow);
  let bridge: Awaited<ReturnType<typeof startBridge>> | null = null;
  const menu =
    Menu.getApplicationMenu() ??
    Menu.buildFromTemplate([
      { role: "fileMenu" },
      { role: "editMenu" },
      { role: "viewMenu" },
      { role: "windowMenu" },
    ]);
  const submenu = new Menu();
  submenu.append(
    new MenuItem({
      label: "Connection information",
      click: () => {
        void dialog.showMessageBox({
          title: "BetterX local MCP",
          message: bridge ? "Agent access is enabled" : "Agent access could not start",
          detail: `Connection file: ${connectionFile()}\n\nThe MCP client uses stdio. Run the bundled dist/mcp/index.cjs with Node.js 20 or later. See the repository's docs/local-mcp.md for configuration. No private post data is saved to disk by the bridge.`,
        });
      },
    })
  );
  menu.append(new MenuItem({ label: "Agent", submenu }));
  Menu.setApplicationMenu(menu);

  void startBridge(connectionFile(), (command, signal) => controller.execute(command, signal))
    .then((started) => {
      bridge = started;
    })
    .catch((error: unknown) => {
      dialog.showErrorBox(
        "BetterX agent access",
        error instanceof Error ? error.message : "Could not start agent access"
      );
    });
  app.on("before-quit", () => {
    controller.clear();
    void bridge?.close();
  });
}
