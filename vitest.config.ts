import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
      "@tunnel": path.resolve(__dirname, "tunnel"),
      // `server-only` throws outside the React server condition; tests run server code directly.
      "server-only": path.resolve(__dirname, "tests/setup/empty.ts"),
      // The VS Code extension runs against a small fake of the editor API in unit tests.
      vscode: path.resolve(__dirname, "tests/setup/fake-vscode.ts"),
    },
  },
  test: {
    environment: "node",
    include: process.env.BENCH ? ["tests/bench/**/*.test.ts"] : ["tests/integration/**/*.test.ts", "tests/unit/**/*.test.ts"],
    globalSetup: ["tests/setup/global.ts"],
    setupFiles: ["tests/setup/env.ts"],
    // One database: run files sequentially so truncation can't race another file.
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 120_000,
  },
});
