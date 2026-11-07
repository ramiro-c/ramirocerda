import { defineConfig } from "astro/config";
import sitemap from "@astrojs/sitemap";
import rehypeExternalLinks from "rehype-external-links";

export default defineConfig({
  site: "https://www.ramirocerda.com.ar",
  markdown: {
    rehypePlugins: [
      // Markdown links to other sites open in a new tab, matching the
      // target="_blank" rel="noopener noreferrer" convention used by components.
      [rehypeExternalLinks, { rel: ["noopener", "noreferrer"], target: "_blank" }],
    ],
  },
  // Renamed or retired project pages keep their old URLs working.
  redirects: {
    "/work/agent-general": "/work/ldp-copilot",
    "/en/work/agent-general": "/en/work/ldp-copilot",
    "/work/agent-scout": "/work/ldp-copilot",
    "/en/work/agent-scout": "/en/work/ldp-copilot",
  },
  integrations: [
    sitemap({
      i18n: {
        defaultLocale: "es",
        locales: { es: "es", en: "en" },
      },
    }),
  ],
  i18n: {
    defaultLocale: "es",
    locales: ["es", "en"],
    routing: {
      prefixDefaultLocale: false,
    },
  },
});
