import { type BrowserWindow, Menu, MenuItem, app, dialog } from "electron";
import { startBridge } from "../mcp/bridge.js";
import { connectionFile } from "../mcp/connection.js";
import { AgentController } from "./agent.js";
import { getSetting, setSetting } from "./services/settings.js";

export function installAgentMenu(getWindow: () => BrowserWindow | null) {
  const controller = new AgentController(getWindow);
  let bridge: Awaited<ReturnType<typeof startBridge>> | null = null;
  let changing = false;
  const toggle = new MenuItem({
    label: "Enable read-only agent access",
    type: "checkbox",
    checked: false,
    click: () => {
      void runChange(changeAccess);
    },
  });
  const autoToggle = new MenuItem({
    label: "Always enable read-only agent access at startup",
    type: "checkbox",
    checked: getSetting("autoEnableAgentAccess"),
    click: () => {
      void runChange(changeAutoAccess);
    },
  });
  async function startAccess() {
    if (bridge) return;
    bridge = await startBridge(connectionFile(), (command, signal) =>
      controller.execute(command, signal)
    );
  }
  async function stopAccess() {
    if (!bridge) return;
    const previous = bridge;
    bridge = null;
    await previous.close();
    controller.clear();
  }
  async function runChange(action: () => Promise<void>) {
    if (changing) return;
    changing = true;
    toggle.enabled = false;
    autoToggle.enabled = false;
    toggle.checked = !!bridge;
    autoToggle.checked = getSetting("autoEnableAgentAccess");
    try {
      await action();
    } catch (error) {
      dialog.showErrorBox(
        "BetterX agent access",
        error instanceof Error ? error.message : "Could not change agent access"
      );
    } finally {
      toggle.checked = !!bridge;
      autoToggle.checked = getSetting("autoEnableAgentAccess");
      toggle.enabled = true;
      autoToggle.enabled = true;
      changing = false;
    }
  }
  async function changeAccess() {
    if (bridge) {
      await stopAccess();
    } else {
      if (!getSetting("autoEnableAgentAccess")) {
        const answer = await dialog.showMessageBox({
          type: "question",
          title: "BetterX agent access",
          message: "Allow local agents to read and browse X?",
          detail:
            "MCP clients running as your macOS/Linux user can read loaded bookmarks and posts, navigate this window, scroll, and search posts collected in memory. Requested content can be sent to the model configured in your MCP client.\n\nNo posting, messaging, cookie export, arbitrary scripts, or remote network listener. Access lasts until disabled or BetterX quits. Trust all local programs you run; this does not isolate agents from other programs running as you.",
          buttons: ["Cancel", "Enable for this session"],
          defaultId: 0,
          cancelId: 0,
        });
        if (answer.response !== 1) return;
      }
      await startAccess();
    }
  }
  async function changeAutoAccess() {
    if (getSetting("autoEnableAgentAccess")) {
      setSetting("autoEnableAgentAccess", false);
      return;
    }
    const answer = await dialog.showMessageBox({
      type: "question",
      title: "BetterX agent access",
      message: "Always enable read-only agent access at startup?",
      detail:
        "Local programs running as your macOS/Linux user can connect to BetterX whenever it is open, read loaded bookmarks and posts, navigate this window, and search posts collected in memory. Requested content can be sent to the model configured in your MCP client. This access turns on automatically at each launch until you turn this setting off. No posting, messaging, cookie export, arbitrary scripts, or remote network listener.",
      buttons: ["Cancel", "Always enable"],
      defaultId: 0,
      cancelId: 0,
    });
    if (answer.response !== 1) return;
    await startAccess();
    setSetting("autoEnableAgentAccess", true);
  }
  const menu =
    Menu.getApplicationMenu() ??
    Menu.buildFromTemplate([
      { role: "fileMenu" },
      { role: "editMenu" },
      { role: "viewMenu" },
      { role: "windowMenu" },
    ]);
  const submenu = new Menu();
  submenu.append(toggle);
  submenu.append(autoToggle);
  submenu.append(
    new MenuItem({
      label: "Connection information",
      click: () => {
        void dialog.showMessageBox({
          title: "BetterX local MCP",
          message: bridge ? "Agent access is enabled" : "Agent access is disabled",
          detail: `Connection file: ${connectionFile()}\nAlways enable at startup: ${getSetting("autoEnableAgentAccess") ? "on" : "off"}\n\nThe MCP client uses stdio. Run the bundled dist/mcp/index.cjs with Node.js 20 or later. See the repository's docs/local-mcp.md for configuration. No private post data is saved to disk by the bridge.`,
        });
      },
    })
  );
  menu.append(new MenuItem({ label: "Agent", submenu }));
  Menu.setApplicationMenu(menu);
  if (getSetting("autoEnableAgentAccess")) void runChange(startAccess);
  app.on("before-quit", () => {
    controller.clear();
    void bridge?.close();
  });
}
