import { defineConfig, devices } from "@playwright/test";

const PORT = Number(process.env.E2E_PORT || 4175);
const externalBaseURL = process.env.E2E_BASE_URL;
const baseURL = externalBaseURL || `http://127.0.0.1:${PORT}`;

export default defineConfig({
   testDir: "./tests/e2e",
   fullyParallel: true,
   forbidOnly: Boolean(process.env.CI),
   retries: process.env.CI ? 1 : 0,
   workers: process.env.CI ? 2 : undefined,
   timeout: 30_000,
   expect: { timeout: 5_000 },
   reporter: process.env.CI
      ? [["github"], ["html", { open: "never" }], ["junit", { outputFile: "test-results/junit.xml" }]]
      : [["list"], ["html", { open: "never" }]],
   outputDir: "test-results",
   use: {
      baseURL,
      serviceWorkers: "block",
      trace: "retain-on-failure",
      screenshot: "only-on-failure",
      video: "off",
   },
   projects: [
      {
         name: "chromium",
         use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 1000 } },
      },
   ],
   webServer: externalBaseURL
      ? undefined
      : {
           command: "node tests/e2e/server.mjs",
           url: baseURL,
           reuseExistingServer: !process.env.CI,
           timeout: 30_000,
           env: { E2E_PORT: String(PORT) },
        },
});
