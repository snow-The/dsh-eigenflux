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
export declare function resolveBin(env?: NodeJS.ProcessEnv): string | null;
/** The Agent Home the CLI resolves: `--homedir`, then `EIGENFLUX_HOME`, then `~/.eigenflux`. */
export declare function resolveHome(env?: NodeJS.ProcessEnv): string;
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
export declare function runEf(subcommand: string[], opts?: RunOptions): Promise<EfResult>;
/**
 * Discover the real command surface from the binary itself.
 *
 * The capability REGISTRY (`eigenflux capabilities`) needs a provisioned Agent and answers exit 2
 * without one, so it cannot describe the CLI to a caller who has not connected yet. `--help` can,
 * every time, and it describes the version actually installed rather than a table someone typed
 * into this file and then forgot.
 */
export interface Surface {
    commands: {
        name: string;
        summary: string;
    }[];
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
export declare function parseCommandTable(text: string): {
    name: string;
    summary: string;
}[];
export declare function introspect(cmd?: string): Promise<Surface>;
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
export type EfAuthState = 'ready' | 'no-identity' | 'auth-required' | 'unknown';
export declare function authStateOf(r: EfResult): EfAuthState;
/** One Chinese phrase per state, so every tool reports the same thing for the same condition. */
export declare function describeAuthState(s: EfAuthState): string;
/** Local clock facts, because the CLI reports `timezone: UTC` while this host is +08:00. */
export declare function clockFacts(now?: Date): {
    local: string;
    offsetMinutes: number;
    zone: string;
};
