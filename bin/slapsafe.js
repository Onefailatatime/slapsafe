#!/usr/bin/env node
'use strict';

/*
 * SlapSafe launcher.
 *
 * This thin launcher does nothing on its own. It takes your license key,
 * unlocks the scanner from slapsafe.com, and runs it locally against your
 * own code. Your code is never uploaded — only your key is checked.
 *
 *   npx slapsafe                 scan the current folder
 *   npx slapsafe ./my-app        scan a folder
 *   npx slapsafe --key SS1-...   set/replace your license key
 *   npx slapsafe --logout        forget the stored key
 *
 * Get a key at https://slapsafe.com  ($5, one-time).
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const https = require('https');
const http = require('http');
const crypto = require('crypto');
const { spawnSync, execSync } = require('child_process');
const readline = require('readline');

const UNLOCK_URLS = process.env.SLAPSAFE_UNLOCK_URL
  ? [process.env.SLAPSAFE_UNLOCK_URL]
  : ['https://slapsafe.com/.netlify/functions/unlock',
     'https://slapsafe-app.netlify.app/.netlify/functions/unlock'];
const CONFIG_DIR = path.join(os.homedir(), '.slapsafe');
const KEY_FILE = path.join(CONFIG_DIR, 'key');

const isTTY = process.stdout.isTTY && !process.env.NO_COLOR;
const c = (n, s) => (isTTY ? `\x1b[${n}m${s}\x1b[0m` : s);
const dim = (s) => c('90', s); const bold = (s) => c('1', s);
const red = (s) => c('31', s); const grn = (s) => c('32', s); const acc = (s) => c('36', s);

function saveKey(k) {
  try { fs.mkdirSync(CONFIG_DIR, { recursive: true }); fs.writeFileSync(KEY_FILE, k.trim() + '\n', { mode: 0o600 }); } catch {}
}
function loadKey() {
  if (process.env.SLAPSAFE_KEY) return process.env.SLAPSAFE_KEY.trim();
  try { return fs.readFileSync(KEY_FILE, 'utf8').trim(); } catch { return null; }
}
function ask(question) {
  return new Promise((res) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question(question, (a) => { rl.close(); res(a.trim()); });
  });
}

// A stable, privacy-preserving device id. Prefer a hardware id (so clearing
// ~/.slapsafe doesn't change identity); fall back to a persisted random id.
// Hashed with a salt so the raw hardware id never leaves the machine.
function rawMachineId() {
  try {
    if (process.platform === 'darwin') {
      const out = execSync('ioreg -rd1 -c IOPlatformExpertDevice', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
      const m = out.match(/IOPlatformUUID"\s*=\s*"([^"]+)"/);
      if (m) return 'mac:' + m[1];
    } else if (process.platform === 'linux') {
      for (const p of ['/etc/machine-id', '/var/lib/dbus/machine-id']) {
        try { const v = fs.readFileSync(p, 'utf8').trim(); if (v) return 'linux:' + v; } catch {}
      }
    } else if (process.platform === 'win32') {
      const out = execSync('reg query "HKLM\\SOFTWARE\\Microsoft\\Cryptography" /v MachineGuid', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
      const m = out.match(/MachineGuid\s+REG_SZ\s+([A-Za-z0-9-]+)/);
      if (m) return 'win:' + m[1];
    }
  } catch {}
  return null;
}
function deviceId() {
  let raw = rawMachineId();
  if (!raw) {
    const p = path.join(CONFIG_DIR, 'device');
    try { raw = 'rand:' + fs.readFileSync(p, 'utf8').trim(); }
    catch {
      const r = crypto.randomBytes(16).toString('hex');
      try { fs.mkdirSync(CONFIG_DIR, { recursive: true }); fs.writeFileSync(p, r + '\n', { mode: 0o600 }); } catch {}
      raw = 'rand:' + r;
    }
  }
  return crypto.createHash('sha256').update('slapsafe-device-v1|' + raw).digest('hex').slice(0, 32);
}
const DEVICE = deviceId();

// try each endpoint until one answers; network/DNS errors fall through to the next
async function unlock(key) {
  let lastErr = 'could not reach slapsafe.com';
  for (const url of UNLOCK_URLS) {
    const r = await unlockAt(url, key);
    if (r.reached) return r.body;            // got a real answer (valid or invalid) — done
    lastErr = r.error || lastErr;            // network error — try the next endpoint
  }
  return { ok: false, error: lastErr };
}

// POST { key } -> { reached:true, body:{ok,core?,error?} } | { reached:false, error }
function unlockAt(URL_STR, key) {
  return new Promise((resolve) => {
    let u;
    try { u = new URL(URL_STR); } catch { return resolve({ reached: false, error: 'bad unlock url' }); }
    const body = JSON.stringify({ key, device: DEVICE, v: 1 });
    const transport = u.protocol === 'http:' ? http : https;
    const req = transport.request(
      { hostname: u.hostname, path: u.pathname + u.search, port: u.port || 443, method: 'POST',
        headers: { 'content-type': 'application/json', 'content-length': Buffer.byteLength(body), 'user-agent': 'slapsafe-cli' } },
      (resp) => {
        let data = '';
        resp.on('data', (d) => (data += d));
        resp.on('end', () => {
          // a 5xx means this endpoint is misconfigured — treat as not-reached so we try the next
          if (resp.statusCode >= 500) return resolve({ reached: false, error: `server error (${resp.statusCode})` });
          try { const j = JSON.parse(data); resolve(j && typeof j === 'object' ? { reached: true, body: j } : { reached: false, error: 'bad response' }); }
          catch { resolve({ reached: false, error: `server error (${resp.statusCode})` }); }
        });
      }
    );
    req.on('error', (e) => resolve({ reached: false, error: e.message }));
    req.setTimeout(15000, () => { req.destroy(); resolve({ reached: false, error: 'timeout' }); });
    req.write(body); req.end();
  });
}

function banner() {
  console.log('');
  console.log(bold('  🛡  SlapSafe') + dim('  — local pre-launch security audit  ·  slapsafe.com'));
}

async function main() {
  const args = process.argv.slice(2);

  if (args.includes('--logout')) {
    try { fs.unlinkSync(KEY_FILE); } catch {}
    console.log(grn('  ✓ license key forgotten.'));
    return;
  }

  // --key SS1-... (set key explicitly)
  const ki = args.indexOf('--key');
  if (ki !== -1 && args[ki + 1]) { saveKey(args[ki + 1]); args.splice(ki, 2); }

  // remaining positional arg = path to scan
  const target = args.find((a) => !a.startsWith('-')) || process.cwd();

  let key = loadKey();
  if (!key) {
    banner();
    console.log(dim('  Enter your SlapSafe license key (one-time setup).'));
    console.log(dim('  Don\'t have one? Get it at ') + acc('https://slapsafe.com') + dim('  ($5).'));
    console.log('');
    key = await ask('  key: ');
    if (!key) { console.log(red('\n  No key entered. Get one at https://slapsafe.com\n')); process.exit(1); }
    saveKey(key);
  }

  process.stdout.write(dim('  unlocking…'));
  const res = await unlock(key);
  process.stdout.write('\r' + ' '.repeat(14) + '\r');

  if (!res.ok || !res.core) {
    banner();
    console.log(red('  ✗ ' + (res.error || 'that key isn\'t valid.')));
    console.log(dim('  Check the key from your purchase email, or get one at ') + acc('https://slapsafe.com'));
    console.log(dim('  Re-enter with: ') + 'npx slapsafe --key YOUR-KEY');
    console.log('');
    process.exit(1);
  }

  // drop the buyer doc pack once (deep-audit prompts, checklist, rotation runbook)
  if (res.docs && typeof res.docs === 'object') {
    const docDir = path.join(CONFIG_DIR, 'docs');
    try {
      if (!fs.existsSync(docDir)) {
        fs.mkdirSync(docDir, { recursive: true });
        for (const [name, body] of Object.entries(res.docs)) {
          if (/^[\w.-]+\.md$/.test(name)) fs.writeFileSync(path.join(docDir, name), body);
        }
        console.log(dim('  (doc pack saved to ~/.slapsafe/docs — prompts, checklist, rotation runbook)'));
      }
    } catch { /* non-fatal */ }
  }

  // write the unlocked scanner to a temp file and run it locally on the target
  const tmp = path.join(os.tmpdir(), `slapsafe-core-${process.pid}.js`);
  try {
    fs.writeFileSync(tmp, res.core, { mode: 0o600 });
    const r = spawnSync(process.execPath, [tmp, target], { stdio: 'inherit' });
    process.exitCode = r.status == null ? 0 : r.status;
  } finally {
    try { fs.unlinkSync(tmp); } catch {}
  }
}

main().catch((e) => { console.error(red('  unexpected error: ' + (e && e.message))); process.exit(1); });
