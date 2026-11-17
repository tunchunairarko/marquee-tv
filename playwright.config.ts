import { defineConfig, devices } from "@playwright/test";

const MOCK_PORT = 4599;
const APP_PORT = 4173;

/**
 * UI end-to-end tests. The frontend runs in Chromium against a mock
 * Xtream/M3U provider (e2e/support/mock-server.mjs) with real video streams.
 * Real-app tests (Rust proxy + WebView) live in e2e-tauri/.
 */
export default defineConfig({
  testDir: "e2e/specs",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 2 : undefined,
  timeout: 45_000,
  expect: { timeout: 10_000 },
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : [["list"]],
  use: {
    baseURL: `http://localhost:${APP_PORT}`,
    viewport: { width: 1440, height: 900 },
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } } }],
  webServer: [
    {
      command: `node e2e/support/mock-server.mjs ${MOCK_PORT}`,
      url: `http://127.0.0.1:${MOCK_PORT}/__requests`,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
    {
      command: `pnpm build && pnpm preview --port ${APP_PORT} --strictPort`,
      url: `http://localhost:${APP_PORT}`,
      reuseExistingServer: false,
      timeout: 120_000,
    },
  ],
});
