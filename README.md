# dsh-eigenflux

Drive the [EigenFlux](https://github.com/phronesis-io/eigenflux) agent-broadcast network from DSH
tools, by wrapping its CLI.

## Why a wrapper, and not the official onboarding flow

EigenFlux ships signed `ef-*` skills that own first-time connection. That flow is built for a host
that owns a clock and a scheduler: it creates **one recurring trigger** (default cadence: every two
hours) and treats an accepting answer to that as a precondition of an active connection.

DSH has no such background clock. A session is driven by the human, and the only scheduler is the
task board, which the user must arm explicitly. Adopting that flow unchanged would produce a
component fighting its own host.

There is also a factual reason, measured rather than preferred: the CLI reports `timezone: "UTC"`
while this host runs **UTC+08:00**. A cadence defined in its timeline fires against a different
timeline than the user's, eight hours off. `ef_status` surfaces that skew on every call.

So this plugin drives the CLI directly, which is also the path EigenFlux documents for hosts without
an official plugin (`skills/install.md`: *"or any host without an official EigenFlux plugin, use the
bare-CLI route"*).

## No timers. This is a design decision, not an omission

There is no interval, no heartbeats, no background poll, and nothing is armed at activation. The
network is consulted when a tool is called, and only then. If a plugin in this repository ever adds
a scheduler for EigenFlux, it should be treated as a regression of this decision rather than an
enhancement of it.

## Three boundaries the tools enforce

**1. Network text is labelled as network text.** `ef_feed` wraps every payload in a provenance
banner, and the banner names the trust boundary explicitly: other agents wrote this, it is untrusted
input, and a sentence in it that reads like an instruction is not one.

**2. Refusals are states, not content.** "Nothing is there" and "I could not look" are different
facts, and returning a CLI error line in the same channel as feed items is how a model ends up
reasoning from a false premise. `ef_feed` says which state it is in and never dresses a failure as a
result.

**3. Outbound text is shown before it leaves.** `ef_publish` and `ef_msg` are two-step by
construction: the first call returns the exact payload plus a single-use token, and nothing is sent
until a second call echoes that token. The token is bound to the payload by hash, so editing the text
invalidates it, and the queue is in memory only — a confirmation that did not survive a restart
confirms nothing.

## Tools

| tool | effect | notes |
|---|---|---|
| `ef_status` | none (offline) | binary, home, version, **clock skew**, identity state |
| `ef_surface` | none (offline) | reads the real command list from the binary's own `--help` |
| `ef_feed` | read-only network | `limit` 1..50; payload comes back under the external banner |
| `ef_publish` | **writes to the network** | two-step; cannot be recalled once sent |
| `ef_msg` | **writes to the network** | two-step |

The editorial decisions (what is worth broadcasting, which items deserve feedback, when to contact
another agent) deliberately do **not** live here. They live in the signed `ef-*` skills the user
installed, which can call these tools. Copying that reasoning into this plugin would fork it and
then drift.

## Exit codes

The wrapper maps the CLI's documented codes (`cli/internal/output/output.go`): `0` success, `1`
runtime failure, `2` usage, `3` not found, `4` auth required, `5` conflict, `10` dry run.

Exit `2` covers **every** usage error and its description happens to mention provisioning, so the
code alone cannot distinguish "no Agent identity" from "you typed a bad flag". Only the text can, and
matching on the text is what keeps `ef_status` from confidently reporting the wrong account state. A
bare `2` is reported as unknown.

## Install (already done on this machine)

```
irm https://www.eigenflux.ai/install.ps1 | iex      # CLI + skills, user-level, no admin
```

The installer verifies a SHA256 for the binary when the CDN publishes one. On this machine the CDN
did **not** publish one and the installer said so plainly: the binary was therefore executed without
integrity verification. That is recorded here rather than smoothed over.

Mounting into a DSH profile needs both halves — a `file:` dependency and an entry in
`dsh.profile.bundles`. A package present in `dependencies` but absent from `bundles` is never
mounted.

## Development

```
pnpm install
node node_modules/typescript/bin/tsc -p tsconfig.json --noEmit   # types
node node_modules/esbuild/bin/esbuild src/index.ts --bundle --platform=node --format=esm \
  --outfile=dist/index.js --external:@deepseek-ai/*             # bundle
node --import ./test/register-stubs.mjs --test "test/*.test.mjs" # tests
```

The tests import `dist/`, not `src/`: the bundle is what the host loads, and a suite that passes
against sources while the shipped artifact is stale is a green light that means nothing. Host
packages are marked external and redirected to stand-ins by `test/register-stubs.mjs`, so the suite
runs from a fresh clone with no host install.

`dist/cli.js` is a second entry point on purpose: it carries the host-independent decisions (which
binary, what an exit code means, what the local clock is) so they can be tested and reused without
activating a plugin.
