import { defineConfig } from "astro/config";

export default defineConfig({
  site: "https://ramirocerda.vercel.app",
  i18n: {
    defaultLocale: "es",
    locales: ["es", "en"],
    routing: {
      prefixDefaultLocale: true,
    },
  },
});
