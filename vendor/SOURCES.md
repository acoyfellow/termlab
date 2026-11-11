# Vendored terminal builds

These terminals have no npm release. Each is built from its upstream repository at the commit below. The upstream source is not changed.

| Package | Upstream | Commit | Build |
|---|---|---|---|
| ferroterm 0.8.0 | https://github.com/DatanoiseTV/ferroterm | f77d0c1 (2026-07-08) | `./build.sh` (cargo wasm32 release + wasm-bindgen 0.2.122) |
| auterm 0.1.0 | https://github.com/zkmio/auterm | b79bcb9 (2026-07-24) | `npm ci && tsc` |
| hterm 1.92.1 (upstream) | https://chromium.googlesource.com/apps/libapps | 8fe95d2 (2026-11-10) | `rollup -c` in libdot and hterm |
| T3 Code terminal (t3code-ghostty) | https://github.com/pingdotgg/t3code | faa8ad6 (2026-11-11) | `bun build-t3code.ts <checkout>`: bundles `apps/web/src/terminal/ghostty/surface.ts` with its committed `ghostty-vt.wasm` (libghostty-vt 9f62873). Four app-only imports (platform check, click interval, font probe, resize helper) are replaced by small equivalents; asset URLs are passed in at runtime. |
