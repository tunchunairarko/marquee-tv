// Real-application end-to-end tests: drives the compiled Tauri binary
// (Rust streaming proxy + system WebView) through tauri-driver/WebDriver.
// Supported on Linux (WebKitWebDriver) and Windows (msedgedriver).
//
//   pnpm e2e:app            # builds a debug binary first
//   SKIP_BUILD=1 pnpm e2e:app
import { spawn, spawnSync } from "node:child_process";
import { mkdirSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const exe = process.platform === "win32" ? "simple-iptv-player.exe" : "simple-iptv-player";
const application = path.join(root, "src-tauri", "target", "debug", exe);
const IDENTIFIER = "io.github.tunchunairarko.simpleiptv";
const MOCK = "http://127.0.0.1:4599";

let driver;
let mock;

async function waitFor(url, ms = 60_000) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    try {
      await fetch(url);
      return;
    } catch {
      await new Promise((r) => setTimeout(r, 250));
    }
  }
  throw new Error(`timed out waiting for ${url}`);
}

/** Start every run from a clean profile (only this app's own data folders). */
function resetAppData() {
  const bases =
    process.platform === "win32"
      ? [process.env.LOCALAPPDATA, process.env.APPDATA]
      : [
          process.env.XDG_DATA_HOME ?? path.join(os.homedir(), ".local", "share"),
          process.env.XDG_CACHE_HOME ?? path.join(os.homedir(), ".cache"),
          process.env.XDG_CONFIG_HOME ?? path.join(os.homedir(), ".config"),
        ];
  for (const base of bases) {
    if (!base) continue;
    const dir = path.join(base, IDENTIFIER);
    if (path.basename(dir) === IDENTIFIER) rmSync(dir, { recursive: true, force: true });
  }
}

export const config = {
  runner: "local",
  specs: ["./specs/**/*.e2e.mjs"],
  maxInstances: 1,
  hostname: "127.0.0.1",
  port: 4444,
  capabilities: [{ maxInstances: 1, "tauri:options": { application } }],
  logLevel: "warn",
  bail: 0,
  waitforTimeout: 20_000,
  connectionRetryTimeout: 120_000,
  connectionRetryCount: 2,
  framework: "mocha",
  reporters: ["spec"],
  mochaOpts: { ui: "bdd", timeout: 120_000 },

  onPrepare: async () => {
    if (!process.env.SKIP_BUILD) {
      const r = spawnSync("pnpm", ["tauri", "build", "--debug", "--no-bundle"], { cwd: root, stdio: "inherit", shell: true });
      if (r.status !== 0) throw new Error("tauri build failed");
    }
    resetAppData();
    mock = spawn(process.execPath, ["e2e/support/mock-server.mjs", "4599"], { cwd: root, stdio: "inherit" });
    await waitFor(`${MOCK}/__requests`);
  },

  beforeSession: async () => {
    const bin = path.join(os.homedir(), ".cargo", "bin", process.platform === "win32" ? "tauri-driver.exe" : "tauri-driver");
    driver = spawn(bin, [], { stdio: [null, process.stdout, process.stderr] });
    await waitFor("http://127.0.0.1:4444/status");
  },

  before: async () => {
    await browser.setWindowSize(1440, 900).catch(() => {});
  },

  afterTest: async (test, _ctx, { passed }) => {
    if (passed) return;
    mkdirSync(path.join(root, "e2e-tauri", "logs"), { recursive: true });
    const name = test.title.replace(/[^\w]+/g, "-").slice(0, 80);
    await browser.saveScreenshot(path.join(root, "e2e-tauri", "logs", `${name}.png`)).catch(() => {});
  },

  afterSession: () => driver?.kill(),
  onComplete: () => mock?.kill(),
};
