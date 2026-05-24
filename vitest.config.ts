import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Coverage is root-level only in Vitest 4 — applies to the whole run.
    // The unit project include/exclude ensures only src/ files are instrumented.
    coverage: {
      provider: "istanbul",
      reporter: ["text", "lcov"],
      include: ["src/**/*.ts"],
      thresholds: {
        lines: 90,
        functions: 90,
        branches: 90,
        statements: 90
      }
    },
    projects: [
      // Unit project: fast, node environment, no browser/DOM needed
      {
        test: {
          name: "unit",
          include: ["tests/**/*.test.ts"],
          exclude: ["tests/a11y/**"]
        }
      },
      // a11y project: jsdom environment for axe-core structural scans
      {
        test: {
          name: "a11y",
          include: ["tests/a11y/**/*.test.ts"],
          environment: "jsdom",
          setupFiles: ["tests/a11y/setup.ts"]
        }
      }
    ]
  }
});
