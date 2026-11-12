#!/usr/bin/env node
import { readFileSync, readdirSync } from "node:fs";
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

// The README states how many test suites the project runs. That number has
// gone stale twice, so it is counted here from the script itself rather
// than trusted.
const suiteFiles = readdirSync(join(root, "scripts")).filter(f => /^test-.*\.mjs$/.test(f));
const configured = (pkg.scripts.test.match(/(?:node|tsc)\s+(?:--import\s+\S+\s+)?scripts\/test-[\w.-]+\.mjs/g) || []).length;
if (configured !== suiteFiles.length) {
  console.error(`FAIL: package.json runs ${configured} test suites but scripts/ holds ${suiteFiles.length} test files`);
  process.exit(1);
}
const readme = readFileSync(join(root, "README.md"), "utf8");
const claimed = readme.match(/There are (\d+) configured npm test suites/);
if (!claimed) {
  console.error("FAIL: README must state how many npm test suites are configured");
  process.exit(1);
}
if (Number(claimed[1]) !== configured) {
  console.error(`FAIL: README claims ${claimed[1]} test suites; package.json runs ${configured}`);
  process.exit(1);
}

console.log("✓ test-release-contract.mjs passed: Wrangler and package contracts satisfied.");

const workflow = readFileSync(join(root, '.github/workflows/deploy.yml'), 'utf8');
if (!workflow.includes('bash scripts/deploy-live.sh') || !workflow.includes('Validation only — no deployment') || workflow.includes('command: deploy')) {
  throw Error('CI must distinguish validation-only runs and use the canonical verified release path');
}
