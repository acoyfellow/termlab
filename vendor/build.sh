#!/usr/bin/env bash
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
work="${TERMLAB_VENDOR_WORK:-$here/.work}"
mkdir -p "$work"
log="$work/build.log"
: > "$log"

fetch() {
  local url=$1 dir=$2 rev=$3
  [ -d "$work/$dir/.git" ] || git clone -q "$url" "$work/$dir"
  git -C "$work/$dir" checkout -q "$rev" 2>>"$log" || { git -C "$work/$dir" fetch -q origin; git -C "$work/$dir" checkout -q "$rev"; }
}

fetch https://github.com/DatanoiseTV/ferroterm ferroterm f77d0c1de83b27457af6d318f7df8a744ec17305
(cd "$work/ferroterm" && PATH="$HOME/.cargo/bin:$PATH" ./build.sh >>"$log" 2>&1)
rm -rf "$here/ferroterm" && mkdir -p "$here/ferroterm"
cp -R "$work/ferroterm/web/src" "$work/ferroterm/web/pkg" "$work/ferroterm/web/ferroterm.css" "$work/ferroterm/web/ferroterm.d.ts" "$work/ferroterm/web/package.json" "$work/ferroterm/LICENSE" "$here/ferroterm/"

fetch https://github.com/zkmio/auterm auterm b79bcb9d515bbd93afd837b764e5e8f6c7b34007
(cd "$work/auterm" && npm ci --ignore-scripts --no-audit --no-fund >>"$log" 2>&1 && npx tsc >>"$log" 2>&1)
rm -rf "$here/auterm" && mkdir -p "$here/auterm"
cp -R "$work/auterm/dist" "$work/auterm/package.json" "$work/auterm/LICENSE" "$here/auterm/"
rm -rf "$here/auterm/dist/test"
find "$here/auterm/dist" -name "*.map" -delete
for pkg in ferroterm auterm; do node -e "const f=process.argv[1],p=require(f);for(const k of ['scripts','devDependencies','files'])delete p[k];if(p.name==='auterm')p.types='dist/index.d.ts';require('fs').writeFileSync(f,JSON.stringify(p,null,2)+'\\n')" "$here/$pkg/package.json"; done

fetch https://chromium.googlesource.com/apps/libapps libapps f3b11d7e07d93b172883a6bbdfae42a3d8179008
(cd "$work/libapps" && npm install --ignore-scripts --no-audit --no-fund >>"$log" 2>&1 && (cd libdot && ../node_modules/.bin/rollup -c >>"$log" 2>&1) && (cd hterm && ../node_modules/.bin/rollup -c >>"$log" 2>&1))
rm -rf "$here/hterm-upstream" && mkdir -p "$here/hterm-upstream"
cp "$work/libapps/hterm/dist/js/hterm.js" "$work/libapps/LICENSE" "$here/hterm-upstream/"
printf '{ "name": "hterm-upstream", "version": "%s", "type": "module", "main": "hterm.js", "module": "hterm.js", "license": "BSD-3-Clause" }\n' "$(node -p "require('$work/libapps/hterm/package.json').version")" > "$here/hterm-upstream/package.json"
