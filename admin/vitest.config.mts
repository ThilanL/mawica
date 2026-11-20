import { defineConfig } from "vitest/config";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
      "@mawica": path.resolve(__dirname, "../src"),
      "server-only": path.resolve(__dirname, "tests/stubs/server-only.ts"),
      // Resolve the consumer-generated Prisma client from admin sources/tests.
      "../../../src/generated/prisma/client": path.resolve(__dirname, "../src/generated/prisma/client.ts"),
      "../../src/generated/prisma/client": path.resolve(__dirname, "../src/generated/prisma/client.ts"),
    },
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.{ts,tsx}"],
    setupFiles: ["tests/setup.ts"],
    fileParallelism: false,
    testTimeout: 20000,
  },
});
