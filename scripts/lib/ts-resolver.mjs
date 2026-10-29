/**
 * Resolve the repo's TypeScript sources from Node.
 *
 * The Worker is bundled by wrangler, which resolves a relative `./x.js`
 * specifier to `x.ts` on its own. Node does not: it resolves the literal
 * path and fails. So the test scripts need a resolver that does the same
 * mapping the bundler does, or every module under test would have to import
 * with a `.ts` extension that the bundler would then reject.
 *
 * Usage: node --import ./scripts/lib/ts-resolver.mjs <script>
 *        node --import ./scripts/lib/ts-resolver.mjs --test
 */
import { registerHooks } from "node:module";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith(".") && specifier.endsWith(".js")) {
      const parent = context.parentURL
        ? fileURLToPath(context.parentURL)
        : `${process.cwd()}/resolver.ts`;
      const candidate = new URL(specifier.replace(/\.js$/, ".ts"), `file://${parent}`);
      if (existsSync(fileURLToPath(candidate))) {
        return { url: candidate.href, shortCircuit: true };
      }
    }
    return nextResolve(specifier, context);
  },
});
