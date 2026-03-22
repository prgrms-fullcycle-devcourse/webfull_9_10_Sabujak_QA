import { defineConfig } from "@playwright/test";
import dotenv from "dotenv";

dotenv.config();

const outputDir = process.env.PLAYWRIGHT_OUTPUT_DIR || ".playwright-output";

export default defineConfig({
  testDir: "./tests",
  timeout: 60_000,
  expect: {
    timeout: 10_000,
  },
  fullyParallel: false,
  reporter: [["list"], ["html", { outputFolder: `${outputDir}/html-report`, open: "never" }]],
  outputDir: `${outputDir}/artifacts`,
  use: {
    baseURL: process.env.APP_BASE_URL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
});
