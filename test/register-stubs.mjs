/**
 * Redirect the host-provided @deepseek-ai packages to test-only stand-ins, so the suite runs from a
 * fresh clone with no host install. Loaded via:
 *   node --import ./test/register-stubs.mjs --test "test/*.test.mjs"
 *
 * This is the pattern dsh-session-handoff/test/register-stubs.mjs established; it is repeated here
 * rather than shared, because the plugins are independent packages and a shared test helper would
 * be one more cross-package deployment edge to keep in sync.
 */
import { registerHooks } from 'node:module';

const stubs = new Map([
  ['@deepseek-ai/dsh-tools', new URL('./stubs/dsh-tools.js', import.meta.url).href],
]);

registerHooks({
  resolve(specifier, context, nextResolve) {
    const stub = stubs.get(specifier);
    if (stub !== undefined) return { url: stub, shortCircuit: true };
    return nextResolve(specifier, context);
  },
});
