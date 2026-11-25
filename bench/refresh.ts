import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const root = join(import.meta.dir, "..");
const flags = new Set(process.argv.slice(2));
const publish = flags.has("--publish");
const withAdopt = flags.has("--adopt");
const rounds = process.env.REFRESH_ROUNDS ?? "5";

type Vendor = { dir: string; url: string; label: string };
const vendors: Vendor[] = [
  { dir: "ferroterm", url: "https://github.com/DatanoiseTV/ferroterm", label: "ferroterm" },
  { dir: "auterm", url: "https://github.com/zkmio/auterm", label: "auterm" },
  { dir: "libapps", url: "https://chromium.googlesource.com/apps/libapps", label: "hterm" },
  { dir: "t3code", url: "https://github.com/pingdotgg/t3code", label: "T3 Code terminal" },
];

function run(cmd: string, args: string[], capture = false): string {
  console.log(`[refresh] ${cmd} ${args.join(" ")}`);
  const result = spawnSync(cmd, args, { cwd: root, stdio: capture ? ["ignore", "pipe", "inherit"] : "inherit", encoding: "utf8" });
  if (result.status !== 0) throw new Error(`${cmd} ${args.join(" ")} exited ${result.status}`);
  return (result.stdout ?? "").trim();
}

function escapeRegExp(text: string): string {
  return text.replace(new RegExp("[.*+?^${}()|[\\]\\\\]", "g"), "\\$&");
}

function latestNpmVersion(name: string, range: string): string {
  const lines = run("npm", ["view", `${name}@${range}`, "version"], true).split("\n");
  return lines[lines.length - 1]!.replace(new RegExp("^.* '(.*)'$"), "$1");
}

function updateNpmDeps(): string[] {
  const path = join(root, "package.json");
  const pkg = JSON.parse(readFileSync(path, "utf8"));
  const changes: string[] = [];
  for (const section of ["dependencies", "devDependencies"]) {
    for (const [name, spec] of Object.entries<string>(pkg[section] ?? {})) {
      if (spec.startsWith("file:")) continue;
      const alias = spec.match(new RegExp("^npm:(@?[^@]+)@(.*)$"));
      const target = alias ? alias[1]! : name;
      const tag = alias && alias[2]!.includes("-") ? alias[2]!.split("-")[1]!.split(".")[0]! : "latest";
      const sameMajor = section === "devDependencies" && spec.startsWith("^");
      const latest = latestNpmVersion(target, sameMajor ? spec : tag);
      const prefix = alias ? `npm:${target}@` : spec.startsWith("^") ? "^" : spec.startsWith("~") ? "~" : "";
      const next = `${prefix}${latest}`;
      if (next !== spec) {
        changes.push(`${name} ${spec} -> ${next}`);
        pkg[section][name] = next;
      }
    }
  }
  writeFileSync(path, JSON.stringify(pkg, null, 2) + "\n");
  return changes;
}

function updateVendorRevs(): string[] {
  const path = join(root, "vendor/build.sh");
  let build = readFileSync(path, "utf8");
  const changes: string[] = [];
  for (const vendor of vendors) {
    const head = run("git", ["ls-remote", vendor.url, "HEAD"], true).split(new RegExp("\\s"))[0]!;
    const line = new RegExp(`(fetch ${escapeRegExp(vendor.url)} ${vendor.dir} )([0-9a-f]{40})`);
    const current = build.match(line)?.[2];
    if (!current) throw new Error(`vendor/build.sh has no fetch line for ${vendor.dir}`);
    if (current !== head) {
      changes.push(`${vendor.label} ${current.slice(0, 7)} -> ${head.slice(0, 7)}`);
      build = build.replace(line, `$1${head}`);
    }
  }
  writeFileSync(path, build);
  return changes;
}

function updateSources(): void {
  const path = join(root, "vendor/SOURCES.md");
  let text = readFileSync(path, "utf8");
  for (const vendor of vendors) {
    const [hash, date] = run("git", ["-C", join(root, "vendor/.work", vendor.dir), "log", "-1", "--format=%h %cs"], true).split(" ");
    const row = new RegExp(`^(\\| ${escapeRegExp(vendor.label)}[^\\n]*?\\| )[0-9a-f]{7,} \\([0-9-]+\\)`, "m");
    text = text.replace(row, `$1${hash!.slice(0, 7)} (${date})`);
    if (vendor.dir === "t3code") {
      const adapterPath = join(root, "src/lib/adapters/t3code-ghostty.ts");
      const adapterText = readFileSync(adapterPath, "utf8").replace(new RegExp("source at [0-9a-f]{7,}\\."), `source at ${hash!.slice(0, 7)}.`);
      writeFileSync(adapterPath, adapterText);
    }
  }
  writeFileSync(path, text);
}

const npmChanges = updateNpmDeps();
const vendorChanges = updateVendorRevs();
console.log(`[refresh] npm: ${npmChanges.join("; ") || "no change"}`);
console.log(`[refresh] vendor: ${vendorChanges.join("; ") || "no change"}`);

run("bash", ["vendor/build.sh"]);
updateSources();
run("bun", ["install"]);
run("bun", ["bench/run.ts", rounds]);
run("bun", ["bench/conformance.ts"]);
run("bun", ["bench/usability.ts"]);
run("bun", ["bench/latency.ts"]);
run("bun", ["bench/ax.ts"]);
if (withAdopt) run("bun", ["bench/adopt.ts"]);
run("bun", ["run", "build"]);

const results = ["src/lib/bench-results.json", "src/lib/conformance-results.json", "src/lib/usability-results.json", "src/lib/latency-results.json", "src/lib/ax-results.json", ...(withAdopt ? ["src/lib/adopt-results.json"] : [])];
run("git", ["add", "package.json", "bun.lock", "vite.config.ts", "svelte.config.js", "README.md", "bench/refresh.ts", "src/lib/adapters/t3code-ghostty.ts", "vendor/build.sh", "vendor/build-t3code.ts", "vendor/SOURCES.md", "vendor/t3code-ghostty", ...results]);
if (!run("git", ["diff", "--cached", "--name-only"], true)) {
  console.log("[refresh] nothing changed");
  process.exit(0);
}
const summary = [...npmChanges, ...vendorChanges].join("; ") || "same library versions";
run("git", ["commit", "-q", "-m", `Refresh results: ${summary}`]);
if (publish) run("git", ["push", "origin", "HEAD:main"]);
else console.log("[refresh] Committed locally. Review the results, then push to main to deploy, or rerun with --publish.");
