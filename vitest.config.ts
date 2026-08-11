import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const root = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      "@skill-hub/shared": path.join(root, "packages/shared/src/index.ts"),
      "@skill-hub/core": path.join(root, "packages/core/src/index.ts"),
      "@skill-hub/router": path.join(root, "packages/router/src/index.ts"),
      "@skill-hub/sync": path.join(root, "packages/sync/src/index.ts"),
    },
  },
  test: {
    include: [
      "packages/*/src/**/*.test.ts",
      "apps/*/src/**/*.test.ts",
      "tests/unit/**/*.test.ts",
      "tests/integration/**/*.test.ts",
    ],
    environment: "node",
    passWithNoTests: false,
  },
});
