import { type BrowserWindow, Menu, MenuItem, app, dialog } from "electron";
import type { MenuItemConstructorOptions } from "electron";
import { startBridge } from "../mcp/bridge.js";
import { connectionFile } from "../mcp/connection.js";
import {
  type AgentMenuEntry,
  type AgentMenuHandle,
  installAgentMenuWith,
} from "./agent-menu-core.js";
import { AgentController } from "./agent.js";

export function installAgentMenu(getWindow: () => BrowserWindow | null, headless = false) {
  installAgentMenuWith(
    {
      getApplicationMenu: () => Menu.getApplicationMenu() as AgentMenuHandle | null,
      buildFromTemplate: (template) =>
        Menu.buildFromTemplate([...template] as MenuItemConstructorOptions[]) as AgentMenuHandle,
      setApplicationMenu: (menu) => {
        Menu.setApplicationMenu(menu as unknown as Menu);
      },
      createMenu: () => new Menu() as AgentMenuHandle,
      createMenuItem: (options) => {
        const menuItem: MenuItemConstructorOptions = { label: options.label };
        if (options.click) menuItem.click = options.click;
        if (options.submenu) menuItem.submenu = options.submenu as unknown as Menu;
        return new MenuItem(menuItem) as AgentMenuEntry;
      },
      onBeforeQuit: (listener) => {
        app.on("before-quit", listener);
      },
      quit: () => {
        app.quit();
      },
      showMessageBox: (options) => {
        void dialog.showMessageBox(options);
      },
      showErrorBox: (title, content) => {
        dialog.showErrorBox(title, content);
      },
      startBridge,
      connectionFile,
      createController: (getWindow) => new AgentController(getWindow),
    },
    getWindow,
    headless
  );
}
