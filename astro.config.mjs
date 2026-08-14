import { defineConfig } from "astro/config";

export default defineConfig({
  site: "https://ramirocerda.com.ar",
  i18n: {
    defaultLocale: "es",
    locales: ["es", "en"],
    routing: {
      prefixDefaultLocale: true,
    },
  },
});
