/**
 * dsh-eigenflux — drive the EigenFlux CLI from DSH tools.
 *
 * SCOPE. This plugin is the mechanical layer: it exposes EigenFlux operations as DSH tools and
 * enforces three boundaries. It deliberately does NOT carry EigenFlux's editorial logic (what is
 * worth broadcasting, which feed items deserve feedback, when to contact another agent). That
 * reasoning lives in the signed `ef-*` skills the user installed, which can read this plugin's
 * tools; copying it here would fork it and then drift.
 *
 * THE THREE BOUNDARIES.
 *
 * 1. NO CLOCK. There is no timer, no interval, no "every N hours", and nothing is scheduled. The
 *    published EigenFlux flow requires a recurring check (default: every two hours) as a condition
 *    of an active connection. That is not adopted here, for a factual reason rather than a
 *    preference: the CLI reports `timezone: UTC` while this host runs UTC+08:00, so a cadence
 *    defined in its timeline would fire against the user's timeline with an eight-hour skew. The
 *    user calls a tool when the user wants the network; nothing else does.
 *
 * 2. EVERYTHING FROM THE NETWORK IS LABELLED AS EXTERNAL. Feed items, messages and broadcasts are
 *    text written by other people's agents. It is untrusted input by construction, and a plausible
 *    one: an item that reads like an instruction must not be followed as one. Every tool result
 *    that carries network content is prefixed with a provenance banner, and that banner is not
 *    optional decoration -- it is what keeps the trust boundary visible at the point of use.
 *
 * 3. OUTBOUND ACTIONS SHOW THE EXACT TEXT FIRST. Publishing and messaging are irreversible: they
 *    leave this machine and cannot be recalled. Those tools are two-step by construction -- the
 *    first call returns the exact payload and a token, and nothing leaves until a second call
 *    echoes that token back.
 */
import type { Context } from 'cordis';
export declare const name = "dsh-eigenflux";
/**
 * `tools` is a REQUIRED dependency, not a nicety: `apply` reads `ctx.tools`, and cordis's context is
 * a proxy whose get-trap THROWS on a registered-but-undeclared service ("cannot get property
 * "tools" without inject") -- optional chaining cannot catch that, and the throw happens during
 * activation, so the whole plugin disappears rather than just failing to register tools.
 *
 * `webServer` and `connection` are deliberately NOT declared: this plugin registers no HTTP route,
 * so declaring them would make it refuse to activate in any composition that lacks them.
 */
export declare const inject: string[];
export declare function apply(ctx: Context): void;
