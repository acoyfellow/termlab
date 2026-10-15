export const cols = 120;
export const rows = 40;

export const workloads: Record<string, { input: string; marker: string }> = {
  "scroll-flood": { input: Array.from({ length: 100000 }, (_, i) => `line ${i} ` + "x".repeat(80)).join("\r\n") + "\r\nEND-SCROLL", marker: "END-SCROLL" },
  "full-redraw": { input: Array.from({ length: 1500 }, (_, f) => "\x1b[H" + Array.from({ length: rows - 1 }, (_, r) => `\x1b[3${(f + r) % 8}m` + `${f}:${r} `.padEnd(cols - 1, "#") + "\x1b[0m").join("\r\n")).join("") + "\r\nEND-REDRAW", marker: "END-REDRAW" },
  "sgr-tokens": { input: "\x1b[32mfoo\x1b[0m ".repeat(100000) + "\r\nEND-SGR", marker: "END-SGR" },
};
