#!/usr/bin/env node
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

console.log("==> Running test-anti-slop-design.mjs...");

// 1. Scan for banned generic placeholder words
const FORBIDDEN_WORDS = [
  "lorem ipsum",
  "coming soon",
  "placeholder text",
  "todo: add",
  "tbd"
];

function checkDir(dir) {
  const entries = readdirSync(dir);
  for (const entry of entries) {
    if (entry.startsWith(".") || entry === "node_modules" || entry === "vendor") continue;
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      checkDir(full);
    } else if (/\.(html|js|mjs|ts|json|geojson)$/.test(entry)) {
      const content = readFileSync(full, "utf8").toLowerCase();
      for (const word of FORBIDDEN_WORDS) {
        if (content.includes(word)) {
          console.error(`FAIL: Forbidden filler word "${word}" found in ${full}`);
          process.exit(1);
        }
      }
    }
  }
}

checkDir(join(root, "public"));
checkDir(join(root, "src"));

// 2. Check CSS for zero border radius and zero box shadow rules
const css = readFileSync(join(root, "public", "style.css"), "utf8");
if (!css.includes("border-radius: 0 !important") || !css.includes("box-shadow: none !important")) {
  console.error("FAIL: public/style.css must enforce 'border-radius: 0 !important' and 'box-shadow: none !important'");
  process.exit(1);
}

// 3. Three type sizes per page (CLAUDE.md §11.7): every size in project CSS, pages and
// templates must be one of the three tokens. Vendor files are excluded.
const typeFiles = ["style.css", "dhaka-design.css", "index.html", "research.html", ...readdirSync(join(root, "public")).filter(f => f.endsWith(".js"))];
for (const file of typeFiles) {
  const text = readFileSync(join(root, "public", file), "utf8");
  const raw = text.match(/font(?:-size)?:\s*(?:\d{3}\s+)?\d+(?:\.\d+)?(?:px|rem|em)/g);
  if (raw) {
    console.error(`FAIL: ${file} sets a literal font size (${raw[0]}); use --text-display, --text-body or --text-micro`);
    process.exit(1);
  }
}
const tokens = new Set(css.match(/--text-(?:display|body|micro):\s*[^;]+/g) || []);
if (tokens.size !== 3) {
  console.error("FAIL: style.css must define exactly the three type tokens");
  process.exit(1);
}

// 4. Watch strip uses text glyphs that take tier colour, never emoji.
const indexHtml = readFileSync(join(root, "public", "index.html"), "utf8");
if (/\p{Extended_Pictographic}/u.test(indexHtml.replace(/[✕↑↗→←↓≋◍৳▸▾]/g, ""))) {
  console.error("FAIL: index.html contains emoji; use monochrome text glyphs");
  process.exit(1);
}

console.log("✓ test-anti-slop-design.mjs passed: No AI slop or generic placeholders; sharp modernist geometry enforced.");
