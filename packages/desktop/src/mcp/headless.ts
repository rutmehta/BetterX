import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { callBridge } from "./client.js";

// The packaged MCP server lives at Contents/Resources/mcp/index.cjs.
// Reuse the installed app's profile and single-instance lock, never copy cookies.
export async function ensureHeadlessBridge(): Promise<void> {
  try {
    await callBridge({ name: "get_status", args: {} });
    return;
  } catch {
    // Missing/stale descriptor: launch the bundled desktop runtime below.
  }
  const appPath = resolve(process.argv[1] ?? "", "../../../..");
  if (process.platform !== "darwin" || !appPath.endsWith(".app") || !existsSync(appPath)) {
    throw new Error(
      "Automatic headless startup requires the installed macOS app. For a source build, run bun run --cwd packages/desktop start:headless first."
    );
  }
  await new Promise<void>((resolveLaunch, reject) => {
    const child = spawn("/usr/bin/open", ["-gj", appPath, "--args", "--headless"], {
      stdio: "ignore",
    });
    child.once("error", reject);
    child.once("exit", (code) =>
      code === 0 ? resolveLaunch() : reject(new Error("Could not launch headless BetterX"))
    );
  });
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    try {
      await callBridge({ name: "get_status", args: {} });
      return;
    } catch {
      await new Promise((resolveDelay) => setTimeout(resolveDelay, 250));
    }
  }
  throw new Error(
    "Headless BetterX did not start within 20 seconds. Open the app to check its state."
  );
}
