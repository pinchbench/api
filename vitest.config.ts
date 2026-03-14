import { defineWorkersConfig } from "@cloudflare/vitest-pool-workers/config";

export default defineWorkersConfig({
  test: {
    globals: true,
    setupFiles: ["./test/setup.ts"],
    poolOptions: {
      workers: {
        wrangler: { configPath: "./wrangler.jsonc" },
        miniflare: {
          bindings: {
            CF_ACCESS_BYPASS: "true",
            OFFICIAL_KEY: "test-official-key",
            GITHUB_CLIENT_ID: "test-github-client-id",
            GITHUB_CLIENT_SECRET: "test-github-client-secret",
          },
        },
      },
    },
  },
});
