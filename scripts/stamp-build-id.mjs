#!/usr/bin/env node
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { execSync } from "node:child_process";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const indexHtml = join(root, "public", "index.html");
const researchHtml = join(root, "public", "research.html");
const appJs = join(root, "public", "app.js");
const buildIdTs = join(root, "src", "build-id.ts");

let sha = "local";
try {
  sha = execSync("git rev-parse --short HEAD", { encoding: "utf8" }).trim();
} catch {}

const now = new Date();
const stamp = `dhaka-atlas-${now.getUTCFullYear()}${String(now.getUTCMonth() + 1).padStart(2, "0")}${String(now.getUTCDate()).padStart(2, "0")}-${Math.floor(now.getTime() / 1000)}-${sha}`;

// Update build-id.ts
writeFileSync(buildIdTs, `export const BUILD_ID = "${stamp}";\nexport const ATLAS_VERSION = "1.0.0";\n`, "utf8");

// Update index.html
if (readFileSync(indexHtml)) {
  let html = readFileSync(indexHtml, "utf8");
  html = html
    .replace(/src="\/theme\.js(?:\?v=[^"]*)?"/g, `src="/theme.js?v=${stamp}"`)
    .replace(/src="\/translations\.js(?:\?v=[^"]*)?"/g, `src="/translations.js?v=${stamp}"`)
    .replace(/src="\/i18n\.js(?:\?v=[^"]*)?"/g, `src="/i18n.js?v=${stamp}"`)
    .replace(/href="\/style\.css(?:\?v=[^"]*)?"/g, `href="/style.css?v=${stamp}"`)
    .replace(/href="\/dhaka-design\.css(?:\?v=[^"]*)?"/g, `href="/dhaka-design.css?v=${stamp}"`)
    .replace(/src="\/loader\.js(?:\?v=[^"]*)?"/g, `src="/loader.js?v=${stamp}"`)
    .replace(/src="\/app\.js(?:\?v=[^"]*)?"/g, `src="/app.js?v=${stamp}"`)
    .replace(/src="\/dashboard\.js(?:\?v=[^"]*)?"/g, `src="/dashboard.js?v=${stamp}"`);
  writeFileSync(indexHtml, html, "utf8");
}

// Update research.html
if (readFileSync(researchHtml)) {
  let html = readFileSync(researchHtml, "utf8");
  html = html
    .replace(/src="\/theme\.js(?:\?v=[^"]*)?"/g, `src="/theme.js?v=${stamp}"`)
    .replace(/src="\/translations\.js(?:\?v=[^"]*)?"/g, `src="/translations.js?v=${stamp}"`)
    .replace(/src="\/i18n\.js(?:\?v=[^"]*)?"/g, `src="/i18n.js?v=${stamp}"`)
    .replace(/href="\/style\.css(?:\?v=[^"]*)?"/g, `href="/style.css?v=${stamp}"`)
    .replace(/href="\/dhaka-design\.css(?:\?v=[^"]*)?"/g, `href="/dhaka-design.css?v=${stamp}"`);
  writeFileSync(researchHtml, html, "utf8");
}

// Update app.js
if (readFileSync(appJs)) {
  let js = readFileSync(appJs, "utf8");
  js = js.replace(/const ATLAS_BUILD_TAG = "[^"]*";/, `const ATLAS_BUILD_TAG = "${stamp}";`);
  writeFileSync(appJs, js, "utf8");
}

console.log(`[stamp-build-id] wrote ${stamp} into build-id.ts, index.html, research.html, app.js`);
