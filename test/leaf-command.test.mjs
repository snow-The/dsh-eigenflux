/**
 * A leaf command is not a broken binary.
 *
 * `feed poll`, `publish` and `stats` have no "Available Commands:" section at all -- only flags. The
 * tool reported that as "未解析到子命令 … 该二进制可能未安装", which is the third instance of the same
 * mistake in this plugin: a particular negative mistaken for a different one (an omitted reply id
 * read as "no reply requested"; a usage error read as "not logged in"; an empty child list read as
 * "not installed").
 *
 * The block below is verbatim from `eigenflux feed poll --help`.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { parseFlagTable, parseCommandTable } from '../dist/cli.js';

const LEAF = [
  'Fetch your personalized feed with curated content.',
  '',
  'Agent V2 pulls the latest feed without cursor pagination. --action more pulls',
  'again; it does not guarantee a distinct next page. --cursor is V1-only.',
  '',
  'Examples:',
  '  eigenflux feed poll',
  '  eigenflux feed poll --limit 20 --action refresh',
  '',
  'Usage:',
  '  eigenflux feed poll [flags]',
  '',
  'Flags:',
  '      --action string   refresh or more (default: refresh)',
  '      --cursor string   pagination cursor (last_updated_at)',
  '  -h, --help            help for poll',
  '      --limit string    max items to return (default: 20)',
  '',
  'Global Flags:',
  '  -f, --format string          output format: json, table, or agent',
  '      --homedir string         data directory',
  '',
].join('\n');

test('a leaf command has no child table', () => {
  assert.deepEqual(parseCommandTable(LEAF), []);
});

test('its flags are read, and Global Flags are not mixed in', () => {
  const flags = parseFlagTable(LEAF);
  // The table keeps the CLI's own order, which is alphabetical by long name: action, cursor, help,
  // limit. Asserting a remembered order instead of the parsed one is how this test first went red
  // while the parser was right.
  assert.deepEqual(flags.map((f) => f.flag.split(/\s+/)[0]),
    ['--action', '--cursor', '-h,', '--limit']);
  assert.equal(flags[0].summary, 'refresh or more (default: refresh)');
  assert.equal(flags[2].flag, '-h, --help');
  assert.equal(flags[3].summary, 'max items to return (default: 20)');
  // "Global Flags:" ends the local table; --format/--homedir belong to every command and would
  // otherwise look like this command's own options.
  assert.ok(!flags.some((f) => /--format|--homedir/.test(f.flag)), JSON.stringify(flags));
});

test('the short form and the long form both survive, with their type word', () => {
  const flags = parseFlagTable(LEAF);
  const help = flags.find((f) => f.flag.includes('--help'));
  assert.ok(help, JSON.stringify(flags));
  assert.equal(help.flag, '-h, --help');
  const action = flags.find((f) => f.flag.startsWith('--action'));
  assert.equal(action.flag, '--action string', 'the value type is part of the flag signature');
});

test('text without a flag table yields nothing rather than guessing', () => {
  assert.deepEqual(parseFlagTable(''), []);
  assert.deepEqual(parseFlagTable('unknown command "foo" for "eigenflux"'), []);
  assert.deepEqual(parseFlagTable('Global Flags:\n      --homedir string   data directory\n'), []);
});
