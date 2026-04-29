import { defineConfig } from "astro/config";

import cloudflare from "@astrojs/cloudflare";

export default defineConfig({
  site: process.env.SITE_URL ?? "https://example.com",
  output: "static",
  build: { format: "directory" },
  adapter: cloudflare()
});