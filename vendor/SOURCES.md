# Vendored terminal builds

These terminals have no npm release. Each is built from its upstream repository at the commit below, without source changes.

| Package | Upstream | Commit | Build |
|---|---|---|---|
| ferroterm 0.8.0 | https://github.com/DatanoiseTV/ferroterm | f77d0c1 (2026-07-08) | `./build.sh` (cargo wasm32 release + wasm-bindgen 0.2.122) |
| auterm 0.1.0 | https://github.com/zkmio/auterm | b79bcb9 (2026-07-24) | `npm ci && tsc` |
| hterm 1.92.1 (upstream) | https://chromium.googlesource.com/apps/libapps | f3b11d7 (2026-10-09) | `rollup -c` in libdot and hterm |
