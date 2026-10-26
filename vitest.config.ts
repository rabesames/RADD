import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: [
      "packages/*/test/**/*.test.ts",
      "scripts/test/**/*.test.ts",
      "schema/test/**/*.test.ts",
    ],
  },
});
