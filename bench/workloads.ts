export const cols = 120;
export const rows = 40;
export const scrollback = 10000;

export type WorkloadKind = "burst" | "resize" | "paced";

export type WorkloadDef = {
  id: string;
  label: string;
  description: string;
  kind: WorkloadKind;
  input: string;
  chunks?: string[];
  resizes?: Array<[number, number]>;
  marker: string;
};

const sgrPalette = [
  "\x1b[31m",
  "\x1b[32m",
  "\x1b[1;33m",
  "\x1b[34m",
  "\x1b[3;35m",
  "\x1b[4;36m",
  "\x1b[38;5;208m",
  "\x1b[38;2;90;210;160m",
];
const sgrWords = ["foo", "bar", "baz", "let", "err", "val", "key", "end"];

function buildSgrTokens(): string {
  const parts: string[] = [];
  for (let i = 0; i < 100000; i++) {
    parts.push(`${sgrPalette[i & 7]}${sgrWords[i & 7]}\x1b[0m `);
  }
  return parts.join("") + "\r\nEND-SGR";
}

function buildTuiSession(): string {
  const borderTop = "\x1b[38;2;96;115;138m┌" + "─".repeat(cols - 2) + "┐\x1b[0m";
  const borderMid = "\x1b[38;2;96;115;138m├" + "─".repeat(cols - 2) + "┤\x1b[0m";
  const borderBot = "\x1b[38;2;96;115;138m└" + "─".repeat(cols - 2) + "┘\x1b[0m";
  const frames: string[] = ["\x1b[?1049h\x1b[2J"];
  for (let f = 0; f < 400; f++) {
    const out: string[] = ["\x1b[?2026h\x1b[H"];
    out.push(borderTop);
    out.push(`\x1b[2;1H\x1b[38;2;96;115;138m│\x1b[0m \x1b[1;38;2;120;220;180mtermlab-tui\x1b[0m  frame \x1b[38;5;214m${String(f).padStart(4, "0")}\x1b[0m  cpu \x1b[38;5;81m${(12 + (f % 70)).toString().padStart(2, "0")}%\x1b[0m  mem \x1b[38;5;141m${410 + (f % 90)}MB\x1b[0m\x1b[K\x1b[2;${cols}H\x1b[38;2;96;115;138m│\x1b[0m`);
    out.push(`\x1b[3;1H${borderMid}`);
    for (let r = 4; r <= rows - 3; r++) {
      const idx = f + r;
      const lvl = idx % 5 === 0 ? "\x1b[1;38;2;245;110;110mERR \x1b[0m" : idx % 3 === 0 ? "\x1b[38;2;240;195;90mWARN\x1b[0m" : "\x1b[38;2;115;210;155mINFO\x1b[0m";
      const msg = `worker-${idx % 16} \x1b[3mreq=${10000 + idx}\x1b[23m \x1b[4;38;5;75m/api/v2/stream/${idx % 97}\x1b[0m status=${idx % 5 === 0 ? 502 : 200} lat=${(idx * 7) % 140}ms`;
      out.push(`\x1b[${r};1H\x1b[38;2;96;115;138m│\x1b[0m ${lvl} ${msg}\x1b[K\x1b[${r};${cols}H\x1b[38;2;96;115;138m│\x1b[0m`);
    }
    out.push(`\x1b[${rows - 2};1H${borderBot}`);
    const pct = Math.floor(((f + 1) / 400) * 40);
    out.push(`\x1b[${rows - 1};1H\x1b[7m STATUS \x1b[27m [${"█".repeat(pct)}${"░".repeat(40 - pct)}] ${f + 1}/400\x1b[K`);
    out.push("\x1b[?2026l");
    frames.push(out.join(""));
  }
  frames.push(`\x1b[?1049l\r\nEND-TUI`);
  return frames.join("");
}

function buildUnicodeTruecolor(): string {
  const lines: string[] = [];
  const samples = [
    "日本語テスト café résumé naïve",
    "中文渲染性能测试 — 终端模拟器",
    "한국어 터미널 출력 테스트 🚀✨",
    "┌──┬──┐ ╔══╦══╗ αβγδε λμΩ ∑∏√",
  ];
  for (let i = 0; i < 25000; i++) {
    const r = (i * 17) & 255;
    const g = (i * 31 + 80) & 255;
    const b = (i * 47 + 140) & 255;
    lines.push(`\x1b[38;2;${r};${g};${b}m${String(i).padStart(5, "0")}\x1b[0m \x1b[38;5;${16 + (i % 216)}m${samples[i & 3]}\x1b[0m \x1b[1mtag:${i % 99}\x1b[0m`);
  }
  return lines.join("\r\n") + "\r\nEND-UNICODE";
}

function buildResizeReflow(): string {
  const lines: string[] = [];
  for (let i = 0; i < 2000; i++) {
    lines.push(`reflow-${String(i).padStart(4, "0")} ` + "abcdefghij0123456789 ".repeat(8) + `tail-${i}`);
  }
  return lines.join("\r\n") + "\r\n";
}

function buildPacedChunks(): string[] {
  const chunks: string[] = [];
  for (let f = 0; f < 60; f++) {
    const lines: string[] = [];
    for (let j = 0; j < 45; j++) {
      const n = f * 45 + j;
      const color = sgrPalette[n & 7];
      lines.push(`${color}[${String(n).padStart(4, "0")}]\x1b[0m stream event module=engine/${n % 12} diff=+${(n * 3) % 40}/-${n % 15} café 日本語 ok`);
    }
    chunks.push(lines.join("\r\n") + "\r\n");
  }
  return chunks;
}

export const workloads: Record<string, WorkloadDef> = {
  "scroll-flood": {
    id: "scroll-flood",
    label: "Scroll flood",
    description: "100,000 lines of 88 ASCII chars",
    kind: "burst",
    input: Array.from({ length: 100000 }, (_, i) => `line ${i} ` + "x".repeat(80)).join("\r\n") + "\r\nEND-SCROLL",
    marker: "END-SCROLL",
  },
  "full-redraw": {
    id: "full-redraw",
    label: "Full redraw",
    description: "1,500 full-screen 120×40 colored frames, cursor home each frame",
    kind: "burst",
    input: Array.from({ length: 1500 }, (_, f) => "\x1b[H" + Array.from({ length: rows - 1 }, (_, r) => `\x1b[3${(f + r) % 8}m` + `${f}:${r} `.padEnd(cols - 1, "#") + "\x1b[0m").join("\r\n")).join("") + "\r\nEND-REDRAW",
    marker: "END-REDRAW",
  },
  "sgr-tokens": {
    id: "sgr-tokens",
    label: "SGR tokens",
    description: "100,000 short styled tokens across 8 ANSI, 256-color and truecolor palettes",
    kind: "burst",
    input: buildSgrTokens(),
    marker: "END-SGR",
  },
  "tui-session": {
    id: "tui-session",
    label: "TUI session",
    description: "400 frames of alt-screen TUI with sync output (?2026), box borders, truecolor, CSI H/K",
    kind: "burst",
    input: buildTuiSession(),
    marker: "END-TUI",
  },
  "unicode-truecolor": {
    id: "unicode-truecolor",
    label: "Unicode + truecolor",
    description: "25,000 lines of CJK wide chars, accents, emoji, box drawing and 24-bit color",
    kind: "burst",
    input: buildUnicodeTruecolor(),
    marker: "END-UNICODE",
  },
  "resize-reflow": {
    id: "resize-reflow",
    label: "Resize + reflow",
    description: "2,000 wrapped 180-char lines across 5 viewport resizes (120→80→60→120→90→120)",
    kind: "resize",
    input: buildResizeReflow(),
    resizes: [[80, 40], [60, 30], [120, 40], [90, 35], [120, 40]],
    marker: "END-REFLOW",
  },
  "paced-stream": {
    id: "paced-stream",
    label: "Paced stream",
    description: "60 frames of live colored+Unicode output (1 chunk per rAF, ~250 KB total)",
    kind: "paced",
    input: "",
    chunks: buildPacedChunks(),
    marker: "END-PACED",
  },
};
