import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  test: {
    include: ["src/**/*.test.ts"],
    // Each PGlite test database boots and migrates in-process; under parallel
    // load that alone can pass the 5 s default.
    testTimeout: 30_000,
  },
});
