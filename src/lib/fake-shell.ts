/**
 * Fake shell — produces output that looks like a real PTY but runs
 * entirely in the browser. Each terminal binding (xterm, wterm, hterm)
 * talks to one instance of this.
 *
 * Design contract:
 *   - `write(input: string)`  — the terminal hands us user keystrokes
 *   - `onOutput(cb)`           — we push PTY-like bytes back to the terminal
 *   - `fire(name)`             — trigger one of the canned payloads below
 *
 * Output is plain text with ANSI escapes where interesting. No
 * bash/sh parser; just prompt + echo + a few demo commands.
 */

export type OutputListener = (chunk: string) => void;

const PROMPT = '\x1b[1;32mtermlab\x1b[0m:\x1b[1;34m~\x1b[0m$ ';
const CRLF = '\r\n';

export interface FireCatalog {
  readonly id: string;
  readonly title: string;
  readonly description: string;
}

/**
 * Payloads we can fire on demand. Each one exercises something a
 * real terminal has to handle well: long wrap-heavy output, ANSI
 * colors, cursor movement, box drawing, emoji.
 */
export const FIRES: readonly FireCatalog[] = [
  {
    id: 'tools-list',
    title: 'tools/list firehose',
    description: 'The cf-portal MCP tools/list response. Plain text, wrap-heavy.',
  },
  {
    id: 'ansi-rainbow',
    title: 'ANSI rainbow',
    description: '256-color palette + bright/dim/bold/italic/underline/reverse',
  },
  {
    id: 'boxes',
    title: 'Box-drawing characters',
    description: 'Unicode box characters — tests monospace alignment',
  },
  {
    id: 'long-log',
    title: '10k lines',
    description: 'Numbered lines so you can test scrollback + find',
  },
  {
    id: 'emoji',
    title: 'Emoji + CJK',
    description: 'Wide characters — tests whether cell width is right',
  },
  {
    id: 'clear',
    title: 'clear',
    description: 'Clear the screen',
  },
] as const;

/**
 * Event name for global "fire into every FakeShell on the page" events.
 * The page-level mass-control buttons dispatch these on `window`; every
 * FakeShell subscribes and calls its own `fire` method. This keeps the
 * page from needing to track references to each shell instance.
 */
export const BROADCAST_FIRE_EVENT = 'termlab:broadcast-fire';

/**
 * Payload shape for broadcast-fire events. Intentionally minimal so
 * a page-level shell (tests, bookmarklets, external instrumentation)
 * can dispatch without a dependency on this module.
 */
export interface BroadcastFireDetail {
  readonly id: string;
}

export class FakeShell {
  private listeners = new Set<OutputListener>();
  private inputBuffer = '';
  private broadcastHandler: ((e: Event) => void) | null = null;

  constructor() {
    // First impression banner on construct — emitted async so whoever
    // just attached has time to subscribe first.
    queueMicrotask(() => this.banner());

    // Subscribe to global broadcast events if we're in the browser.
    // SSR-safe: the `typeof window` check guards against node execution.
    if (typeof window !== 'undefined') {
      this.broadcastHandler = (e: Event) => {
        const detail = (e as CustomEvent<BroadcastFireDetail>).detail;
        if (detail && typeof detail.id === 'string') {
          this.fire(detail.id);
        }
      };
      window.addEventListener(BROADCAST_FIRE_EVENT, this.broadcastHandler);
    }
  }

  /**
   * Clean up the broadcast subscription. Called by TerminalCell's
   * onDestroy via the adapter handle.
   */
  dispose() {
    if (this.broadcastHandler && typeof window !== 'undefined') {
      window.removeEventListener(BROADCAST_FIRE_EVENT, this.broadcastHandler);
      this.broadcastHandler = null;
    }
    this.listeners.clear();
  }

  onOutput(listener: OutputListener) {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  /** Emit a chunk to every subscriber. */
  private emit(chunk: string) {
    for (const l of this.listeners) l(chunk);
  }

  private banner() {
    this.emit(
      [
        '\x1b[1;36mTermlab fake shell\x1b[0m',
        'Type anything. Enter runs demo commands (help, ls, ansi, clear).',
        'Or click a fire button below for a canned payload.',
        '',
      ].join(CRLF) + CRLF
    );
    this.prompt();
  }

  private prompt() {
    this.emit(PROMPT);
  }

  /**
   * Called by the terminal binding on every keystroke. `input` is what
   * a real PTY would have accepted — characters + control sequences.
   * We implement a tiny line editor (backspace + enter) and echo the
   * rest, then run a `command` on Enter.
   */
  write(input: string) {
    for (const ch of input) {
      const code = ch.charCodeAt(0);
      if (ch === '\r' || ch === '\n') {
        this.emit(CRLF);
        this.runCommand(this.inputBuffer.trim());
        this.inputBuffer = '';
      } else if (code === 0x7f || ch === '\b') {
        // Backspace: erase last char locally + visually (move-left, space, move-left).
        if (this.inputBuffer.length) {
          this.inputBuffer = this.inputBuffer.slice(0, -1);
          this.emit('\b \b');
        }
      } else if (code === 0x03) {
        // Ctrl-C: cancel the current line.
        this.inputBuffer = '';
        this.emit('^C' + CRLF);
        this.prompt();
      } else if (code >= 0x20 && code !== 0x7f) {
        this.inputBuffer += ch;
        this.emit(ch); // echo
      }
      // other control chars ignored
    }
  }

  private runCommand(cmd: string) {
    switch (cmd) {
      case '':
        break;
      case 'help':
        this.emit(
          [
            'commands:',
            '  help      this message',
            '  ls        fake listing',
            '  ansi      ANSI color preview',
            '  boxes     unicode box drawing',
            '  long      10k-line log',
            '  emoji     emoji + CJK test',
            '  clear     clear screen',
            '',
          ].join(CRLF)
        );
        break;
      case 'ls':
        this.emit(
          '\x1b[1;34mprojects/\x1b[0m  \x1b[1;34mdocs/\x1b[0m  README.md  notes.txt' +
            CRLF
        );
        break;
      case 'ansi':
        this.fire('ansi-rainbow');
        return;
      case 'boxes':
        this.fire('boxes');
        return;
      case 'long':
        this.fire('long-log');
        return;
      case 'emoji':
        this.fire('emoji');
        return;
      case 'clear':
        this.fire('clear');
        return;
      default:
        this.emit(`termlab: ${cmd}: not found` + CRLF);
    }
    this.prompt();
  }

  /**
   * Fire a canned payload — same as typing `ansi` etc. at the prompt
   * but also callable from a UI button. Ends with a fresh prompt.
   */
  fire(id: string) {
    switch (id) {
      case 'tools-list':
        this.emit(TOOLS_LIST_FIREHOSE);
        break;
      case 'ansi-rainbow':
        this.emit(ansiRainbow());
        break;
      case 'boxes':
        this.emit(boxDrawing());
        break;
      case 'long-log':
        this.emit(longLog(10_000));
        break;
      case 'emoji':
        this.emit(emojiPayload());
        break;
      case 'clear':
        this.emit('\x1b[2J\x1b[H');
        break;
      default:
        this.emit(`termlab: unknown fire: ${id}` + CRLF);
    }
    this.prompt();
  }
}

// ---------------------------------------------------------------------------
// Canned payloads
// ---------------------------------------------------------------------------

const TOOLS_LIST_FIREHOSE = [
  '{"result":{"tools":[',
  ...Array.from({ length: 48 }, (_, i) =>
    JSON.stringify({
      name: `wiki-mcp-server_${['search_wiki', 'fetch_page', 'get_page_comments', 'get_page_labels', 'query_cql', 'get_my_tasks'][i % 6]}`,
      description:
        'Use this tool to find information in the Cloudflare internal wiki. Semantic wiki search at https://wiki.cfdata.org. Use this for fuzzy topic matching and discovery. Use query_cql for exact filtering and sorting.',
      inputSchema: { type: 'object', properties: { query: { type: 'string' } } },
      $schema: 'http://json-schema.org/draft-07/schema#',
      execution: { taskSupport: 'forbidden' },
    })
  ).join(','),
  ']}}',
].join('') + '\r\n\r\n';

function ansiRainbow(): string {
  const rows: string[] = [];
  rows.push('\x1b[1m== text styles ==\x1b[0m');
  rows.push(
    '\x1b[1mbold\x1b[0m \x1b[2mdim\x1b[0m \x1b[3mitalic\x1b[0m \x1b[4munderline\x1b[0m \x1b[7mreverse\x1b[0m \x1b[9mstrike\x1b[0m'
  );
  rows.push('');
  rows.push('\x1b[1m== 16-color foreground ==\x1b[0m');
  for (let i = 0; i < 16; i++) {
    const code = i < 8 ? 30 + i : 90 + (i - 8);
    rows.push(`\x1b[${code}mcolor ${i}\x1b[0m`);
  }
  rows.push('');
  rows.push('\x1b[1m== 256-color grid ==\x1b[0m');
  let line = '';
  for (let i = 0; i < 256; i++) {
    line += `\x1b[48;5;${i}m  \x1b[0m`;
    if ((i + 1) % 16 === 0) {
      rows.push(line);
      line = '';
    }
  }
  rows.push('');
  return rows.join('\r\n') + '\r\n';
}

function boxDrawing(): string {
  return [
    '┌──────────────┬──────────────┐',
    '│  light box   │  double box  │',
    '├──────────────┼──────────────┤',
    '│ ╔══════════╗ │ ┏━━━━━━━━━━┓ │',
    '│ ║  double  ║ │ ┃   heavy  ┃ │',
    '│ ╚══════════╝ │ ┗━━━━━━━━━━┛ │',
    '└──────────────┴──────────────┘',
    '',
  ].join('\r\n');
}

function longLog(count: number): string {
  const rows: string[] = [];
  for (let i = 1; i <= count; i++) {
    rows.push(
      `\x1b[2m${String(i).padStart(6, '0')}\x1b[0m \x1b[36mINFO\x1b[0m ` +
        `req=${(Math.random() * 1e9).toFixed(0)} ` +
        `user=${Math.random() < 0.1 ? 'admin' : 'user-' + Math.floor(Math.random() * 9999)} ` +
        `action=${['read', 'write', 'delete', 'list', 'head'][i % 5]} ` +
        `status=${[200, 201, 204, 400, 404, 500][i % 6]}`
    );
  }
  return rows.join('\r\n') + '\r\n';
}

function emojiPayload(): string {
  return [
    '\x1b[1mEmoji row:\x1b[0m 🚀 🎉 🔥 ✨ 🦀 🧠 🫠 🪿 🛟 🗺️',
    '\x1b[1mFamily:\x1b[0m 👨‍👩‍👧‍👦 👩‍🚀 🧑‍💻 🧑🏽‍🎤 🧞‍♂️',
    '\x1b[1mCJK:\x1b[0m 你好世界 こんにちは 안녕하세요 مرحبا שלום',
    '\x1b[1mMixed box + emoji:\x1b[0m',
    '┌─🚀─────┬─🔥─────┐',
    '│  left  │ right  │',
    '└────────┴────────┘',
    '',
  ].join('\r\n');
}
