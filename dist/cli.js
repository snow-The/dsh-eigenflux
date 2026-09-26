// src/cli.ts
import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
function resolveBin(env = process.env) {
  const candidates = [];
  if (env.EIGENFLUX_BIN) candidates.push(env.EIGENFLUX_BIN);
  const local = env.LOCALAPPDATA;
  if (local) candidates.push(join(local, "local", "bin", "eigenflux.exe"), join(local, "local", "bin", "eigenflux"));
  candidates.push(join(homedir(), ".local", "bin", "eigenflux"));
  candidates.push("D:\\eigenflux\\eigenflux.exe");
  for (const c of candidates) {
    try {
      if (existsSync(c)) return c;
    } catch {
    }
  }
  return null;
}
function resolveHome(env = process.env) {
  const explicit = env.EIGENFLUX_HOME;
  if (explicit) return explicit.endsWith(".eigenflux") ? explicit : join(explicit, ".eigenflux");
  return join(homedir(), ".eigenflux");
}
function parseJson(text) {
  const t = text.trim();
  if (!t.startsWith("{") && !t.startsWith("[")) return null;
  try {
    return JSON.parse(t);
  } catch {
    return null;
  }
}
async function runEf(subcommand, opts = {}) {
  const bin = resolveBin();
  if (bin === null) {
    return {
      ok: false,
      code: -1,
      stdout: "",
      stderr: "",
      json: null,
      reason: "eigenflux CLI not found (looked for EIGENFLUX_BIN, %LOCALAPPDATA%\\local\\bin, ~/.local/bin, D:\\eigenflux)"
    };
  }
  const globalFlags = opts.raw === true ? [] : ["--format", "json", "--no-interactive"];
  const args = [...subcommand, ...globalFlags, ...opts.args ?? []];
  const timeout = (opts.timeoutSec ?? 45) * 1e3;
  return await new Promise((resolve) => {
    execFile(bin, args, { timeout, maxBuffer: 8 * 1024 * 1024, windowsHide: true }, (err, stdout, stderr) => {
      const out = String(stdout ?? "");
      const errText = String(stderr ?? "");
      const code = err == null ? 0 : typeof err.code === "number" ? err.code : 1;
      const json = parseJson(out);
      let reason = "";
      if (err != null) {
        if (err.killed) reason = `timed out after ${opts.timeoutSec ?? 45}s`;
        else reason = (errText.trim() || out.trim() || String(err.message ?? err)).slice(0, 600);
      }
      resolve({ ok: err == null, code, stdout: out, stderr: errText, json, reason });
    });
  });
}
function parseCommandTable(text) {
  const commands = [];
  let inList = false;
  for (const line of text.split(/\r?\n/)) {
    if (/^Available Commands:/.test(line)) {
      inList = true;
      continue;
    }
    if (!inList) continue;
    if (/^\S.*:\s*$/.test(line)) break;
    if (/^\s*$/.test(line)) continue;
    const m = /^\s{2,}(\S+)\s{2,}(.+)$/.exec(line);
    if (m) commands.push({ name: m[1], summary: m[2].trim() });
  }
  return commands;
}
async function introspect(cmd = "") {
  const r = await runEf([...cmd ? cmd.split(" ") : [], "--help"], { raw: true });
  return { commands: parseCommandTable(r.stdout || r.stderr) };
}
function authStateOf(r) {
  if (r.code === -1) return "unknown";
  const blob = (r.reason + " " + r.stderr + " " + r.stdout).toLowerCase();
  if (blob.includes("not provisioned") || blob.includes("agent-v2-credentials")) return "no-identity";
  const mentionsLogin = blob.includes("not logged in") || /auth\s+login\s+--/.test(blob) || blob.includes("unauthorized");
  if (mentionsLogin && (r.code === 4 || r.code === 1)) return "auth-required";
  if (r.code === 4) return "auth-required";
  if (r.code === 2) return "unknown";
  return r.ok ? "ready" : "unknown";
}
function describeAuthState(s) {
  switch (s) {
    case "ready":
      return "\u5DF2\u63A5\u5165\uFF08\u53EF\u8BFB\u5199\u7F51\u7EDC\uFF09";
    case "no-identity":
      return "\u672A\u63A5\u5165 \u2014\u2014 \u672C\u673A\u8FD8\u6CA1\u6709 Agent \u8EAB\u4EFD\uFF08\u9700 agent init + provision\uFF0C\u8FD9\u662F\u4EBA\u7684\u51B3\u5B9A\uFF09";
    case "auth-required":
      return "\u8EAB\u4EFD\u53EF\u80FD\u5DF2\u5B58\u5728\uFF0C\u4F46\u5F53\u524D\u672A\u767B\u5F55\u8BE5\u670D\u52A1\u5668\uFF08\u9700\u5148\u8BA4\u8BC1\uFF09";
    default:
      return "\u672A\u77E5";
  }
}
function clockFacts(now = /* @__PURE__ */ new Date()) {
  const offsetMinutes = -now.getTimezoneOffset();
  const sign = offsetMinutes >= 0 ? "+" : "-";
  const abs = Math.abs(offsetMinutes);
  const pad = (n) => String(n).padStart(2, "0");
  return {
    local: `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`,
    offsetMinutes,
    zone: `UTC${sign}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`
  };
}
export {
  authStateOf,
  clockFacts,
  describeAuthState,
  introspect,
  parseCommandTable,
  resolveBin,
  resolveHome,
  runEf
};
