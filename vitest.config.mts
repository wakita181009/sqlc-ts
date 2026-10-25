import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      // cli.ts only wires process.argv to main(); it runs as a subprocess, which v8 cannot see.
      exclude: ["src/cli.ts"],
      reporter: ["text", "html"],
      thresholds: { 100: true },
    },
  },
});
