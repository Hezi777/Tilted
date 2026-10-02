import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    tsconfigPaths: true,
    // `server-only` is a marker that throws outside a Server Component graph.
    alias: { "server-only": "/src/db/test-support/server-only-stub.ts" },
  },
  test: {
    environment: "node",
    // Transform the Next.js adapter so OAuth tests can supply request headers/cookies.
    server: { deps: { inline: ["@neondatabase/auth"] } },
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
    // Clears the integration branch once per run; a no-op without TEST_DATABASE_URL.
    globalSetup: ["src/db/test-support/global-setup.ts"],
    // The integration suite talks to Neon over HTTP, which is far slower than the
    // pure-unit tests around it.
    testTimeout: 30_000,
  },
});
