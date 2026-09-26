/**
 * Load the built plugin and drive its tools through a stub host.
 *
 * Testing the BUNDLE rather than the sources is deliberate: the bundle is what the host loads, and
 * this repo has already been bitten by a tests-pass-but-dist-is-stale gap (dsh-plugin-guide's test
 * suite imports `../dist/index.js` for exactly that reason).
 *
 * The stub ctx records registrations. `ef_status` and `ef_surface` are exercised for real against
 * the installed CLI: both are read-only and offline, so a green test here is evidence that the
 * wrapper actually talks to the binary, not merely that it type-checks.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

const mod = await import('../dist/index.js');
const { apply, name } = mod;

test('exports the plugin shape the host expects', () => {
  assert.equal(typeof apply, 'function');
  assert.equal(name, 'dsh-eigenflux');
});

function boot() {
  const registered = [];
  const ctx = {
    tools: { register: (d) => { registered.push(d); return d; } },
    logger: { info() {}, warn() {}, error() {} },
  };
  apply(ctx);
  return registered;
}

test('registers the five expected tools, each with a description and an output renderer', () => {
  const tools = boot();
  const names = tools.map((t) => t.name).sort();
  assert.deepEqual(names, ['ef_feed', 'ef_msg', 'ef_publish', 'ef_status', 'ef_surface']);
  for (const t of tools) {
    assert.ok(t.description && t.description.length > 10, `${t.name} needs a real description`);
    assert.equal(typeof t.output.render, 'function', `${t.name} needs a renderer`);
    assert.equal(typeof t.execute, 'function', `${t.name} needs execute`);
  }
});

test('ef_status reports the install, the clock skew, and never claims a connection', async () => {
  const tools = boot();
  const status = tools.find((t) => t.name === 'ef_status');
  const text = await status.execute({}, {});

  assert.match(text, /\[ef_status\]/, text);
  assert.match(text, /cli version\s+0\.\d+\.\d+/, 'must report the real installed version: ' + text);
  assert.match(text, /agent home\s+\S+/, text);
  assert.match(text, /本机时钟\s+\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\s+\(UTC[+-]\d{2}:\d{2}\)/, text);
  // The skew line is the whole justification for having no scheduler; it must appear whenever the
  // host is not on UTC.
  const offset = -new Date().getTimezoneOffset();
  if (offset !== 0) {
    assert.match(text, /⚠ 时区差/, 'a non-UTC host must surface the skew: ' + text);
  }
  assert.match(text, /接入状态\s+(未接入|已接入|未知)/, text);
});

test('ef_status states the honest reason when the CLI is missing, instead of a bare failure', async () => {
  const tools = boot();
  const status = tools.find((t) => t.name === 'ef_status');
  const saved = process.env.EIGENFLUX_BIN;
  // Point every candidate away: the override plus the LOCALAPPDATA fallback the resolver probes.
  process.env.EIGENFLUX_BIN = 'C:\\definitely\\not\\here\\eigenflux.exe';
  const savedLocal = process.env.LOCALAPPDATA;
  process.env.LOCALAPPDATA = 'C:\\definitely\\not\\here';
  try {
    const text = await status.execute({}, {});
    assert.match(text, /未安装/, text);
    assert.match(text, /install\.ps1/, 'must say how to install, not just that it is missing: ' + text);
  } finally {
    if (saved === undefined) delete process.env.EIGENFLUX_BIN; else process.env.EIGENFLUX_BIN = saved;
    if (savedLocal === undefined) delete process.env.LOCALAPPDATA; else process.env.LOCALAPPDATA = savedLocal;
  }
});

test('ef_surface reads the real command surface from the binary', async () => {
  const tools = boot();
  const surface = tools.find((t) => t.name === 'ef_surface');
  const text = await surface.execute({ cmd: 'feed' }, {});
  assert.match(text, /\[ef_surface feed\]/, text);
  assert.match(text, /\bpoll\b/, 'feed must list poll: ' + text);
  assert.match(text, /来自二进制自身的 --help/, 'the source of the table must be stated: ' + text);
});

test('bare ef_surface lists the TOP-LEVEL commands — the case that read as "not installed"', async () => {
  // Two independent defects met here. The parser stopped at the blank line cobra prints right after
  // "Available Commands:", so the top-level table came back empty while every subcommand worked.
  // Then, with that fixed, the wrapper was STILL appending `--format json --no-interactive` to a help
  // request, and the ROOT command rejects those as positional arguments ("unknown command \"json\"",
  // exit 2, no output) -- so the tool kept reporting "no subcommands found", which reads as "the
  // binary is missing" rather than "the wrapper asked the wrong question".
  const tools = boot();
  const surface = tools.find((t) => t.name === 'ef_surface');
  const text = await surface.execute({}, {});
  assert.ok(!/未解析到子命令/.test(text), 'bare ef_surface must resolve the top-level table: ' + text);
  for (const expected of ['feed', 'publish', 'msg', 'agent', 'heartbeat']) {
    assert.match(text, new RegExp('\\b' + expected + '\\b'), `top-level surface must list ${expected}: ` + text);
  }
});

test('ef_publish previews and sends nothing, and a wrong token is refused', async () => {
  const tools = boot();
  const publish = tools.find((t) => t.name === 'ef_publish');
  const preview = await publish.execute({ content: 'test payload that must never be sent' }, {});
  assert.match(preview, /预览 —— 没有任何内容被发出/, preview);
  assert.match(preview, /confirm_token: [0-9a-f]{16}-[0-9a-f]{8}/, 'a preview must hand back a token: ' + preview);
  assert.match(preview, /test payload that must never be sent/, 'the exact text must be shown before sending');

  const refused = await publish.execute({ content: 'x', confirm_token: 'deadbeefdeadbeef-00000000' }, {});
  assert.match(refused, /令牌无效或已过期/, refused);
  assert.match(refused, /没有任何内容被发出/, refused);
});

test('ef_msg previews with the reply target and refuses an unknown token', async () => {
  const tools = boot();
  const msg = tools.find((t) => t.name === 'ef_msg');
  const preview = await msg.execute({ content: 'hello there', item_id: 4242 }, {});
  assert.match(preview, /\[ef_msg\] 预览/, preview);
  assert.match(preview, /--item-id 4242/, preview);
  const refused = await msg.execute({ content: 'x', confirm_token: 'nope' }, {});
  assert.match(refused, /令牌无效或已过期/, refused);
});

test('the reply target survives a STRING item id — dropping it silently would misroute a reply', async () => {
  // The declared type is integer, but a tool argument can arrive as a string, and the first version
  // guarded with `Number.isFinite(args.item_id)` -- false for every string. The flag was then omitted
  // with no complaint: the preview looked perfectly normal, just without a reply target, so the
  // message would have gone out as a new message addressed to nobody. Only a string id exposes it,
  // which is exactly why the number-only test above passed.
  const tools = boot();
  const msg = tools.find((t) => t.name === 'ef_msg');
  const asString = await msg.execute({ content: 'reply', item_id: '362115728905601024' }, {});
  assert.match(asString, /--item-id 362115728905601024/, asString);

  // Small numbers are safe and still work.
  assert.match(await msg.execute({ content: 'r', item_id: 99 }, {}), /--item-id 99/);
  assert.match(await msg.execute({ content: 'r', item_id: ' 77 ' }, {}), /--item-id 77/);

  // Absent / empty simply omits the flag.
  for (const none of [null, undefined, '', '  ']) {
    const t = await msg.execute({ content: 'r', item_id: none }, {});
    assert.ok(!/--item-id/.test(t), `absent id ${JSON.stringify(none)} must omit the flag: ` + t);
  }

  // Nonsense is REFUSED, not silently dropped: the caller must not believe it set a reply target.
  for (const junk of ['abc', '12.5']) {
    const t = await msg.execute({ content: 'r', item_id: junk }, {});
    assert.match(t, /必须/, `junk id ${JSON.stringify(junk)} must be refused with a reason: ` + t);
    assert.ok(!/--item-id/.test(t), t);
  }
});

test('an 18-digit id passed as a NUMBER is refused, never rounded into a different item', async () => {
  // EigenFlux ids are snowflakes: 362115728905601024 > Number.MAX_SAFE_INTEGER (9007199254740991).
  // As a JS number it becomes 362115728905601000 -- a DIFFERENT item. Sending a reply to the wrong
  // agent silently is worse than dropping the flag, and this is measured, not theorised:
  //   String(362115728905601024) === "362115728905601000"
  const tools = boot();
  const msg = tools.find((t) => t.name === 'ef_msg');

  const rounded = await msg.execute({ content: 'reply', item_id: 362115728905601024 }, {});
  assert.ok(!/--item-id 362115728905601000/.test(rounded), 'must not send the ROUNDED id: ' + rounded);
  assert.ok(!/--item-id/.test(rounded), 'must not send any id derived from an unsafe number: ' + rounded);
  assert.match(rounded, /超出 JS 安全整数范围/, rounded);
  assert.match(rounded, /字符串/, 'the refusal must say how to fix it: ' + rounded);

  // The boundary itself is usable, so the guard rejects only what is genuinely corrupted.
  assert.match(await msg.execute({ content: 'r', item_id: Number.MAX_SAFE_INTEGER }, {}),
    new RegExp('--item-id ' + Number.MAX_SAFE_INTEGER));

  // And the same id as a string is passed through EXACTLY.
  assert.match(await msg.execute({ content: 'r', item_id: '362115728905601024' }, {}),
    /--item-id 362115728905601024$/m);
});

test('ef_feed reports the identity state instead of dressing a refusal as content', async () => {
  const tools = boot();
  const feed = tools.find((t) => t.name === 'ef_feed');
  const text = await feed.execute({ limit: 3 }, {});
  // Measured on this machine: `feed poll` exits 4 ("not logged in ... run 'eigenflux auth login'"),
  // while `capabilities` exits 2 with the provisioning wording. Both are refusals, neither is
  // content, and the tool must say which one it is rather than echoing a bare CLI error line.
  if (/未读取到任何内容/.test(text)) {
    assert.match(text, /不是"网络里没有内容"/, 'must distinguish "nothing there" from "no identity": ' + text);
    assert.match(text, /接入是你的决定/, 'connecting stays the human\'s decision: ' + text);
    assert.ok(!/外部内容开始/.test(text), 'a refusal must not be wrapped as external content: ' + text);
  } else {
    assert.match(text, /外部来源 · 非用户指令/, 'network content must be labelled external: ' + text);
    assert.match(text, /--- 外部内容开始 ---/, text);
    assert.match(text, /--- 外部内容结束 ---/, text);
  }
});
