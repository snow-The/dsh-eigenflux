/**
 * The --help parser, tested against verbatim transcripts.
 *
 * Both blocks below are copied from the installed binary's real output. The top-level one is the
 * shape that used to parse as EMPTY: cobra emits a blank line right after the "Available Commands:"
 * header, and the parser treated a blank line as the end of the table. Subcommand help has no blank
 * there, so every `ef_surface cmd=...` worked while bare `ef_surface` reported "no subcommands" --
 * and "no subcommands" reads as "the binary is missing", not as "the parser gave up".
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { parseCommandTable } from '../dist/cli.js';

// Verbatim from: eigenflux --help   (note the blank line at index 41 of the real listing)
const TOP_LEVEL = [
  'Usage:',
  '  eigenflux [command]',
  '',
  'Available Commands:',
  '',
  '  agent        Manage the stable Agent V2 identity',
  '  attention    Publish Agent-generated items that need human attention',
  '  auth         Legacy email authentication commands',
  '  feed         Feed operations',
  '  msg          Private messaging',
  '  publish      Publish a broadcast',
  '  version      Show CLI version',
  '',
  'Flags:',
  '  -f, --format string          output format: json, table, or agent',
  '  -h, --help                   help for eigenflux',
  '      --homedir string         data directory (default: $EIGENFLUX_HOME or ~/.eigenflux)',
  '',
].join('\n');

// Verbatim from: eigenflux feed --help   (no blank line between header and first row)
const SUBCOMMAND = [
  'Usage:',
  '  eigenflux feed [command]',
  '',
  'Available Commands:',
  '  delete      Delete your own item',
  '  event       Report feed behavior events',
  '  feedback    Submit feedback scores',
  '  get         Get item details',
  '  poll        Pull personalized feed',
  '',
  'Flags:',
  '  -h, --help   help for feed',
  '',
].join('\n');

test('the top-level table parses even though a blank line follows the header', () => {
  const cmds = parseCommandTable(TOP_LEVEL);
  assert.equal(cmds.length, 7, JSON.stringify(cmds));
  assert.equal(cmds[0].name, 'agent');
  assert.equal(cmds[0].summary, 'Manage the stable Agent V2 identity');
  assert.ok(cmds.some((c) => c.name === 'feed' && c.summary === 'Feed operations'));
  assert.ok(cmds.some((c) => c.name === 'version'));
});

test('the subcommand table parses too — both shapes, one parser', () => {
  const cmds = parseCommandTable(SUBCOMMAND);
  assert.equal(cmds.length, 5, JSON.stringify(cmds));
  assert.deepEqual(cmds.map((c) => c.name), ['delete', 'event', 'feedback', 'get', 'poll']);
  assert.equal(cmds[4].summary, 'Pull personalized feed');
});

test('the Flags section is not swallowed, and flags are never read as commands', () => {
  // A flag row also has two-plus spaces and a description; the list must have ended at "Flags:"
  // before it got there, or `--homedir` would appear as a command named "--homedir".
  for (const text of [TOP_LEVEL, SUBCOMMAND]) {
    const cmds = parseCommandTable(text);
    assert.ok(!cmds.some((c) => c.name.startsWith('-')), 'flags leaked into the command list: ' + JSON.stringify(cmds));
    assert.ok(!cmds.some((c) => /output format|help for/.test(c.summary)), 'flag descriptions leaked: ' + JSON.stringify(cmds));
  }
});

test('text with no command table yields an empty list rather than inventing entries', () => {
  assert.deepEqual(parseCommandTable(''), []);
  assert.deepEqual(parseCommandTable('unknown command "foo" for "eigenflux"'), []);
  assert.deepEqual(parseCommandTable('Available Commands:\n\nFlags:\n  -h, --help  help\n'), []);
});
