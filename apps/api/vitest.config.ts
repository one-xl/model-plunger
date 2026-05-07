import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    setupFiles: ["src/vitest-setup-db.ts"],
    maxWorkers: 1,
    fileParallelism: false,
    testTimeout: 60_000
  }
});
