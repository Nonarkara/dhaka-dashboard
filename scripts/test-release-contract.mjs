#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

console.log("==> Running test-release-contract.mjs...");

// 1. Wrangler.toml check
const wranglerToml = readFileSync(join(root, "wrangler.toml"), "utf8");

if (!wranglerToml.includes('pattern = "dhaka.nonarkara.org"')) {
  console.error("FAIL: wrangler.toml missing custom domain pattern dhaka.nonarkara.org");
  process.exit(1);
}

if (!wranglerToml.includes('account_id = "74ad6bf8dfaaccf82de6f0847f7d2d54"')) {
  console.error("FAIL: wrangler.toml missing or incorrect account_id");
  process.exit(1);
}

if (!wranglerToml.includes('directory = "./public"')) {
  console.error("FAIL: wrangler.toml assets directory must be ./public");
  process.exit(1);
}

if (!wranglerToml.includes('name = "RATE_LIMITER"')) {
  console.error("FAIL: wrangler.toml must declare native rate limiter binding RATE_LIMITER");
  process.exit(1);
}

// 2. Package.json check
const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
if (pkg.name !== "dhaka-dashboard") {
  console.error("FAIL: package.json name must be dhaka-dashboard");
  process.exit(1);
}
if (pkg.type !== "module") {
  console.error("FAIL: package.json type must be module");
  process.exit(1);
}

console.log("✓ test-release-contract.mjs passed: Wrangler and package contracts satisfied.");
