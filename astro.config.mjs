import { defineConfig } from "astro/config";

export default defineConfig({
  site: "https://ramirocerda.vercel.app",
  image: {
    remotePatterns: [{ protocol: "https" }],
  },
});
