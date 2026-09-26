/**
 * EigenFlux CLI wrapper — the only place that spawns `eigenflux`.
 *
 * WHY A WRAPPER AND NOT THE SKILLS: EigenFlux ships an onboarding flow built around a host that
 * owns a clock and a scheduler — it creates a recurring trigger, runs heartbeats, and keeps a
 * standing authorization for recurring publishing. DSH has no such background clock: a session is
 * driven by the human, and the only scheduler is the task board, which the user must arm. Adopting
 * that flow here would produce a component fighting its host. The CLI itself is stateless and
 * clock-free, so wrapping it puts the timing decision back where it belongs.
 *
 * `execFile`, never a shell: no argument is ever concatenated into a command line, so content that
 * reaches a tool argument cannot become shell syntax. This mirrors dsh-gitkit (src/index.ts:5).
 *
 * Every call is non-interactive. The CLI has interactive prompts (an install/`--no-interactive` pair
 * exists for exactly this), and a prompt waiting on a stdin nobody owns would hang the agent turn
 * instead of failing it.
 */
import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

/** Result of one CLI invocation. `code` is 0, a real exit code, or -1 for "never ran". */
export interface EfResult {
  ok: boolean;
  code: number;
  stdout: string;
  stderr: string;
  /** Parsed JSON when the payload was JSON, else null. Never throws. */
  json: unknown;
  /** Human-readable failure cause, empty on success. */
  reason: string;
}

export interface RunOptions {
  /** Seconds; a hung network call must not hang the turn. */
  timeoutSec?: number;
  /** Extra argv appended after the subcommand. */
  args?: string[];
  /**
   * Do not append the global `--format json --no-interactive`. Required for help requests: the root
   * `--help` rejects them as positional arguments ("unknown command \"json\"", exit 2, no output).
   */
  raw?: boolean;
}

/**
 * Locate the binary.
 *
 * The installer puts it in `%LOCALAPPDATA%\local\bin` (it prefers `D:\eigenflux` and falls back
 * when D: is absent — on this machine D: does not exist, so the fallback is what ran). Rather than
 * trust PATH, which a running process captured at launch, the known candidates are probed and
 * `EIGENFLUX_BIN` can override. A PATH entry added after this process started would otherwise be
 * invisible and the plugin would report a false "not installed".
 */
export function resolveBin(env: NodeJS.ProcessEnv = process.env): string | null {
  const candidates: string[] = [];
  if (env.EIGENFLUX_BIN) candidates.push(env.EIGENFLUX_BIN);
  const local = env.LOCALAPPDATA;
  if (local) candidates.push(join(local, 'local', 'bin', 'eigenflux.exe'), join(local, 'local', 'bin', 'eigenflux'));
  candidates.push(join(homedir(), '.local', 'bin', 'eigenflux'));
  candidates.push('D:\\eigenflux\\eigenflux.exe');
  for (const c of candidates) {
    try { if (existsSync(c)) return c; } catch { /* unreadable candidate: try the next */ }
  }
  return null;
}

/** The Agent Home the CLI resolves: `--homedir`, then `EIGENFLUX_HOME`, then `~/.eigenflux`. */
export function resolveHome(env: NodeJS.ProcessEnv = process.env): string {
  const explicit = env.EIGENFLUX_HOME;
  if (explicit) return explicit.endsWith('.eigenflux') ? explicit : join(explicit, '.eigenflux');
  return join(homedir(), '.eigenflux');
}

function parseJson(text: string): unknown {
  const t = text.trim();
  if (!t.startsWith('{') && !t.startsWith('[')) return null;
  try { return JSON.parse(t); } catch { return null; }
}

/**
 * Run one CLI command.
 *
 * `--format json` and `--no-interactive` are added for NORMAL commands: the first keeps the payload
 * parseable, the second guarantees a prompt can never block a turn.
 *
 * They are NOT added when the invocation is a help request. Heuristic flag-appending assumed the
 * CLI tolerates global flags anywhere; for the ROOT `--help` it does not, because cobra parses the
 * root as a command with a Run and no arguments, so the appended words become positional args:
 *
 *   eigenflux --help                          -> 2595 chars, exit 0
 *   eigenflux --help --format json --no-interactive -> "" , exit 2, `unknown command "json"`
 *
 * Asking `--help` for JSON output was never meaningful anyway: help is text. `opts.raw` opts out,
 * and the two places that read help pass it.
 */
export async function runEf(subcommand: string[], opts: RunOptions = {}): Promise<EfResult> {
  const bin = resolveBin();
  if (bin === null) {
    return {
      ok: false, code: -1, stdout: '', stderr: '', json: null,
      reason: 'eigenflux CLI not found (looked for EIGENFLUX_BIN, %LOCALAPPDATA%\\local\\bin, ~/.local/bin, D:\\eigenflux)',
    };
  }
  const globalFlags = opts.raw === true ? [] : ['--format', 'json', '--no-interactive'];
  const args = [...subcommand, ...globalFlags, ...(opts.args ?? [])];
  const timeout = (opts.timeoutSec ?? 45) * 1000;
  return await new Promise<EfResult>((resolve) => {
    execFile(bin, args, { timeout, maxBuffer: 8 * 1024 * 1024, windowsHide: true }, (err, stdout, stderr) => {
      const out = String(stdout ?? '');
      const errText = String(stderr ?? '');
      const code = err == null ? 0 : (typeof (err as { code?: unknown }).code === 'number' ? (err as { code: number }).code : 1);
      const json = parseJson(out);
      let reason = '';
      if (err != null) {
        if ((err as { killed?: boolean }).killed) reason = `timed out after ${opts.timeoutSec ?? 45}s`;
        // The CLI writes its human explanation to stderr; its absence would leave the caller with a
        // bare exit code, which is the "no data vs no answer" ambiguity this project keeps hitting.
        else reason = (errText.trim() || out.trim() || String((err as { message?: string }).message ?? err)).slice(0, 600);
      }
      resolve({ ok: err == null, code, stdout: out, stderr: errText, json, reason });
    });
  });
}

/**
 * Discover the real command surface from the binary itself.
 *
 * The capability REGISTRY (`eigenflux capabilities`) needs a provisioned Agent and answers exit 2
 * without one, so it cannot describe the CLI to a caller who has not connected yet. `--help` can,
 * every time, and it describes the version actually installed rather than a table someone typed
 * into this file and then forgot.
 */
export interface Surface {
  commands: { name: string; summary: string }[];
}

/**
 * Parse cobra's "Available Commands:" table out of a --help dump.
 *
 * Pure and exported so it can be tested against a verbatim help transcript. The first version was
 * not, and it carried a formatting assumption that broke exactly one of the two shapes the CLI
 * emits: it stopped at the first blank line, and cobra puts a blank line immediately after the
 * "Available Commands:" header. Subcommand help happened to have no blank there, so the top-level
 * surface read as empty while every subcommand read fine -- a parser that fails on half its inputs
 * and looks correct on the other half.
 */
export function parseCommandTable(text: string): { name: string; summary: string }[] {
  const commands: { name: string; summary: string }[] = [];
  let inList = false;
  for (const line of text.split(/\r?\n/)) {
    if (/^Available Commands:/.test(line)) { inList = true; continue; }
    if (!inList) continue;
    // A section heading ends the list; a blank line does not.
    if (/^\S.*:\s*$/.test(line)) break;
    if (/^\s*$/.test(line)) continue;
    const m = /^\s{2,}(\S+)\s{2,}(.+)$/.exec(line);
    if (m) commands.push({ name: m[1], summary: m[2].trim() });
  }
  return commands;
}

export async function introspect(cmd = ''): Promise<Surface> {
  const r = await runEf([...(cmd ? cmd.split(' ') : []), '--help'], { raw: true });
  return { commands: parseCommandTable(r.stdout || r.stderr) };
}

/**
 * The CLI's own exit-code contract (cli/internal/output/output.go:15-23):
 *
 *   0 success · 1 runtime failure · 2 usage error · 3 not found · 4 auth required
 *   5 conflict · 10 dry run
 *
 * Measured against the installed binary, because a documented contract and a shipped binary are two
 * different claims: `stats` -> 0, `capabilities` (no credentials) -> 2, `agent provision --help` -> 0.
 * The 2 is a USAGE error, and treating it as "not provisioned" -- as the first version of this file
 * did -- turns a usage mistake into a confident wrong answer about the user's account state.
 */
export type EfAuthState =
  | 'ready'
  | 'no-identity'    // exit 2 + the provisioning wording: no Agent identity exists yet
  | 'auth-required'  // exit 4: an identity may exist but no live session
  | 'unknown';

export function authStateOf(r: EfResult): EfAuthState {
  if (r.code === -1) return 'unknown'; // never ran
  const blob = (r.reason + ' ' + r.stderr + ' ' + r.stdout).toLowerCase();
  // Wording first: exit 2 is a usage error, and only its text says WHICH usage problem this is.
  if (blob.includes('not provisioned') || blob.includes('agent-v2-credentials')) return 'no-identity';
  // Match the REMEDY, not the bare words. A usage error can also name authentication: a bad
  // `--lang` value produced "--lang must be zh-CN or en" alongside advice to run `auth login`, and
  // substring-matching that advice reported a false account state on a fully provisioned machine.
  // An auth verdict now needs the login wording AND a code that could carry it.
  const mentionsLogin = blob.includes('not logged in') || /auth\s+login\s+--/.test(blob) || blob.includes('unauthorized');
  if (mentionsLogin && (r.code === 4 || r.code === 1)) return 'auth-required';
  if (r.code === 4) return 'auth-required';
  if (r.code === 2) return 'unknown'; // usage error: nothing may be inferred about credentials
  return r.ok ? 'ready' : 'unknown';
}

/** One Chinese phrase per state, so every tool reports the same thing for the same condition. */
export function describeAuthState(s: EfAuthState): string {
  switch (s) {
    case 'ready': return '已接入（可读写网络）';
    case 'no-identity': return '未接入 —— 本机还没有 Agent 身份（需 agent init + provision，这是人的决定）';
    case 'auth-required': return '身份可能已存在，但当前未登录该服务器（需先认证）';
    default: return '未知';
  }
}

/** Local clock facts, because the CLI reports `timezone: UTC` while this host is +08:00. */
export function clockFacts(now = new Date()): { local: string; offsetMinutes: number; zone: string } {
  const offsetMinutes = -now.getTimezoneOffset();
  const sign = offsetMinutes >= 0 ? '+' : '-';
  const abs = Math.abs(offsetMinutes);
  const pad = (n: number) => String(n).padStart(2, '0');
  return {
    local: `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`,
    offsetMinutes,
    zone: `UTC${sign}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`,
  };
}
