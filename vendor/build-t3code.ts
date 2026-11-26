import { copyFileSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

const work = resolve(process.argv[2]!);
const commit = Bun.spawnSync(["git", "-C", work, "rev-parse", "--short=7", "HEAD"]).stdout.toString().trim();
const here = import.meta.dir;
const out = join(here, "t3code-ghostty");
const ghostty = join(work, "apps/web/src/terminal/ghostty");
const assetNames = ["ghostty-vt.wasm", "ghostty-write-pty.wasm", "SymbolsNerdFontMono-Regular.woff2"];

const shims: Record<string, string> = {
  "../../lib/utils": "export const isMacPlatform = (platform) => new RegExp('mac|iphone|ipad|ipod', 'i').test(platform);",
  "../../lib/selectionActions": "export const SELECTION_MULTI_CLICK_INTERVAL_MS = 500;",
  "../../appearanceFonts": "export const isMonospaceFamily = () => true;",
  "../../lib/observeResize": "export function observeResize(element, callback) { if (typeof ResizeObserver === 'undefined') return () => {}; const observer = new ResizeObserver((entries) => callback(entries)); observer.observe(element); return () => observer.disconnect(); }",
  "../../i18n/messages": "export const m = (s) => s;",
  "../../i18n/runtime": "export const subscribeI18n = () => () => {};",
};

const keybindingsShim = () => { const source = readFileSync(join(work, "packages/shared/src/keybindings.ts"), "utf8"); const start = source.indexOf("export const US_SHIFTED_TO_UNSHIFTED_KEYS"); return `${shims["../../lib/utils"]}\n${source.slice(start, source.indexOf("]);", start) + 3)}`; };

const anyPath = new RegExp(".*");
const relativeImport = new RegExp("^\\.\\.?/");
const assetQuery = new RegExp("\\?url");
const sharedPkg = new RegExp("^@t3tools/shared/(.+)$");
const gtReact = new RegExp("^gt-react$");

const assetShim = (name: string) => `export default (globalThis.__T3_GHOSTTY_ASSETS ?? {})[${JSON.stringify(name)}];`;

const result = await Bun.build({
  entrypoints: [join(ghostty, "surface.ts")],
  format: "esm",
  minify: true,
  target: "browser",
  plugins: [{
    name: "t3code-shims",
    setup(build) {
      build.onResolve({ filter: assetQuery }, (args) => ({ path: args.path.split("?")[0]!.split("/").pop()!, namespace: "t3-asset" }));
      build.onLoad({ filter: anyPath, namespace: "t3-asset" }, (args) => ({ contents: assetShim(args.path), loader: "js" }));
      build.onResolve({ filter: gtReact }, () => ({ path: "gt-react", namespace: "t3-gt" }));
      build.onLoad({ filter: anyPath, namespace: "t3-gt" }, () => ({ contents: "export const msg = (s) => s;", loader: "js" }));
      build.onResolve({ filter: relativeImport }, (args) => {
        const absolute = join(args.resolveDir, args.path);
        const shim = Object.keys(shims).find((key) => join(ghostty, key) === absolute);
        return shim ? { path: shim, namespace: "t3-shim" } : { path: absolute.endsWith(".ts") ? absolute : absolute + ".ts" };
      });
      build.onLoad({ filter: anyPath, namespace: "t3-shim" }, (args) => ({ contents: shims[args.path]!, loader: "js" }));
      build.onResolve({ filter: sharedPkg }, (args) => {
        const sub = args.path.slice("@t3tools/shared/".length);
        if (sub === "keybindings") return { path: "keybindings", namespace: "t3-keys" };
        return { path: join(work, "packages/shared/src", sub + ".ts") };
      });
      build.onLoad({ filter: anyPath, namespace: "t3-keys" }, () => ({ contents: keybindingsShim(), loader: "ts" }));
    },
  }],
});
if (!result.success) throw new AggregateError(result.logs, "t3code build failed");

rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
writeFileSync(join(out, "index.js"), await result.outputs[0]!.text());
copyFileSync(join(ghostty, "vendor/ghostty-vt.wasm"), join(out, assetNames[0]!));
copyFileSync(join(ghostty, "vendor/ghostty-write-pty.wasm"), join(out, assetNames[1]!));
copyFileSync(join(ghostty, "fonts/SymbolsNerdFontMono-Regular.woff2"), join(out, assetNames[2]!));
copyFileSync(join(work, "LICENSE"), join(out, "LICENSE"));
writeFileSync(join(out, "package.json"), JSON.stringify({ name: "t3code-ghostty", version: `0.0.0-${commit}`, type: "module", main: "index.js", module: "index.js", license: "MIT", exports: { ".": "./index.js", "./*": "./*" } }, null, 2) + "\n");
