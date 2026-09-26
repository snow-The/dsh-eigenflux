/**
 * The exit-code state machine, pinned against output measured on the installed binary.
 *
 * These strings are transcripts, not inventions. The first version of the wrapper treated exit 2 as
 * "not provisioned" because the upstream documentation names 2 as a usage error whose description
 * mentions provisioning -- and then a live `feed poll` answered exit 4 ("not logged in"), which that
 * machine mapped to "unknown". The result was a tool that reported neither "no identity" nor "needs
 * auth", and passed a CLI error line off as a feed result.
 *
 * The CLI's own contract (cli/internal/output/output.go:15-23) is a useful skeleton but not a
 * sufficient discriminator: 2 covers every usage error, so only the TEXT says which one this is.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { authStateOf, describeAuthState } from '../dist/cli.js';

const res = (over = {}) => ({ ok: false, code: 0, stdout: '', stderr: '', json: null, reason: '', ...over });

test('transcripts measured on the installed binary map to the right states', () => {
  // Measured: `eigenflux capabilities --lang en` with no credentials.
  assert.equal(authStateOf(res({
    code: 2,
    reason: 'Agent V2 is not provisioned for server "eigenflux" \u2014 run \'eigenflux agent init\' and then '
      + '\'eigenflux agent provision\': no Agent V2 credentials for server "eigenflux": open '
      + 'C:\\Users\\snow\\.eigenflux\\servers\\eigenflux\\agent-v2-credentials.json: The system cannot find the file specified.',
  })), 'no-identity');

  // Measured: `eigenflux feed poll --limit 3`.
  assert.equal(authStateOf(res({
    code: 4,
    reason: 'Error: not logged in to server "eigenflux" \u2014 run \'eigenflux auth login --email <email>\' first',
  })), 'auth-required');

  // Measured: `eigenflux stats` with no credentials -> exit 0 (local-only accounting).
  assert.equal(authStateOf(res({ ok: true, code: 0, stdout: '{"client_id":"ddeffd9e"}' })), 'ready');
});

test('a bare exit 2 is NOT read as a missing identity', () => {
  // This is the regression the machine exists for. A usage error says nothing about credentials,
  // and guessing "you are not connected" from it would be a confident wrong answer about the
  // user's account.
  assert.equal(authStateOf(res({ code: 2, reason: 'unknown flag: --bogus' })), 'unknown');
  assert.equal(authStateOf(res({ code: 2 })), 'unknown');
});

test('exit 4 is auth-required even without the matching wording', () => {
  assert.equal(authStateOf(res({ code: 4, reason: 'unauthorized' })), 'auth-required');
  assert.equal(authStateOf(res({ code: 4 })), 'auth-required');
});

test('never-ran and other failures stay unknown, and every state has a phrase', () => {
  assert.equal(authStateOf(res({ code: -1 })), 'unknown');
  assert.equal(authStateOf(res({ ok: false, code: 1, reason: 'timed out after 45s' })), 'unknown');
  assert.equal(authStateOf(res({ ok: false, code: 5, reason: 'conflict' })), 'unknown');
  for (const s of ['ready', 'no-identity', 'auth-required', 'unknown']) {
    const phrase = describeAuthState(s);
    // "unknown" is legitimately short ("未知"): the requirement is that every state HAS a phrase,
    // not that each is long. Length would be a proxy for the wrong thing.
    assert.ok(typeof phrase === 'string' && phrase.trim().length >= 2, `${s} needs a phrase, got ${JSON.stringify(phrase)}`);
  }
  // The two refusal states must read differently: one means "no identity exists", the other means
  // "an identity may exist but this session is not authenticated".
  assert.notEqual(describeAuthState('no-identity'), describeAuthState('auth-required'));
});
