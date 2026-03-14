declare module "cloudflare:test" {
  interface ProvidedEnv {
    prod_pinchbench: import("@cloudflare/workers-types").D1Database;
    CF_ACCESS_BYPASS: string;
    OFFICIAL_KEY: string;
    GITHUB_CLIENT_ID: string;
    GITHUB_CLIENT_SECRET: string;
  }
}
