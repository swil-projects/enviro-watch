import { defineConfig, devices } from "@playwright/test";

/**
 * E2E runs against a production build in DEMO mode (deterministic synthetic data,
 * no provider credentials needed) with authentication enabled.
 *   npm run build && npm run test:e2e
 */
const PORT = Number(process.env.E2E_PORT ?? 3200);

export default defineConfig({
  testDir: "tests/e2e",
  timeout: 60_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  retries: 0,
  reporter: [["list"]],
  use: { baseURL: `http://localhost:${PORT}`, trace: "retain-on-failure", screenshot: "only-on-failure" },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 1000 } } }],
  webServer: {
    command: `npx next start -p ${PORT}`,
    url: `http://localhost:${PORT}/api/healthz`,
    reuseExistingServer: false,
    timeout: 60_000,
    env: {
      DEMO_MODE: "true",
      AUTH_SECRET: "e2e-secret-e2e-secret-e2e-secret-0123456789",
      AUTH_USERNAME: "e2e",
      AUTH_PASSWORD: "e2e-password",
    },
  },
});
