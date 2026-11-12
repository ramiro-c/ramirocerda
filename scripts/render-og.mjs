/**
 * Renders scripts/og-card.html to public/og.png (1200×630).
 * Uses locally installed Chrome/Chromium in headless mode (no extra npm deps).
 */
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const htmlPath = path.join(root, "scripts", "og-card.html");
const outPath = path.join(root, "public", "og.png");
const fileUrl = `file://${htmlPath}`;

const chromeCandidates = [
  process.env.CHROME_PATH,
  "google-chrome",
  "google-chrome-stable",
  "chromium",
  "chromium-browser",
].filter(Boolean);

let chromeBin = chromeCandidates.find((bin) => {
  if (path.isAbsolute(bin)) {
    return existsSync(bin);
  }
  const found = spawnSync("which", [bin], { encoding: "utf8" });
  return found.status === 0;
});

if (!chromeBin) {
  console.error("No Chrome/Chromium binary found. Set CHROME_PATH or install Chrome.");
  process.exit(1);
}

const result = spawnSync(
  chromeBin,
  [
    "--headless=new",
    "--disable-gpu",
    "--hide-scrollbars",
    "--window-size=1200,630",
    "--virtual-time-budget=10000",
    `--screenshot=${outPath}`,
    fileUrl,
  ],
  { stdio: "inherit" },
);

if (result.status !== 0) {
  process.exit(result.status ?? 1);
}

console.log(`Wrote ${outPath}`);
