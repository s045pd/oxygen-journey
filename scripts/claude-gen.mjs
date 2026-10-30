#!/usr/bin/env node
/**
 * Call official Anthropic Messages API via curl (more reliable than node fetch here),
 * write returned files, log usage.
 */
import fs from 'fs';
import path from 'path';
import { spawnSync } from 'child_process';
import os from 'os';

const args = process.argv.slice(2);
function getFlag(name, def = null) {
  const i = args.indexOf(name);
  if (i === -1) return def;
  return args[i + 1] ?? def;
}
function hasFlag(name) { return args.includes(name); }

const MODEL = getFlag('--model', 'claude-opus-4-5-20251101');
const MAX_TOKENS = Number(getFlag('--max-tokens', '16000'));
const OUT_DIR = getFlag('--out-dir', process.cwd());
const PROMPT_FILE = getFlag('--prompt', null);
const SYSTEM_FILE = getFlag('--system', null);
const LABEL = getFlag('--label', 'gen');
const DRY = hasFlag('--dry');

const key = process.env.ANTHROPIC_API_KEY;
if (!key) {
  console.error('ANTHROPIC_API_KEY missing');
  process.exit(1);
}
delete process.env.ANTHROPIC_AUTH_TOKEN;

let prompt = '';
if (hasFlag('--prompt-stdin')) {
  prompt = fs.readFileSync(0, 'utf8');
} else if (PROMPT_FILE) {
  prompt = fs.readFileSync(PROMPT_FILE, 'utf8');
} else {
  console.error('Need --prompt FILE or --prompt-stdin');
  process.exit(1);
}

const ctxIdx = args.indexOf('--context');
if (ctxIdx !== -1) {
  for (let i = ctxIdx + 1; i < args.length; i++) {
    if (args[i].startsWith('--')) break;
    const p = args[i];
    if (!fs.existsSync(p)) { console.error('Missing context:', p); continue; }
    const rel = path.relative(OUT_DIR, p) || p;
    prompt += `\n\n### Existing file: ${rel}\n\`\`\`\n${fs.readFileSync(p, 'utf8')}\n\`\`\`\n`;
  }
}

const system = SYSTEM_FILE
  ? fs.readFileSync(SYSTEM_FILE, 'utf8')
  : `You are a senior TypeScript + Three.js engineer building an educational WebGL lesson.
When asked to write code, output ONLY files using this exact format (repeat for each file):

---FILE: relative/path/from/project/root.ext---
<file contents>
---ENDFILE---

No prose outside those markers unless asked for a plan. Prefer complete, working files over stubs.
Do not invent copyrighted content from techartist; write original GCSE/KS3 English copy.`;

function curlPost(bodyObj) {
  const tmpIn = path.join(os.tmpdir(), `anth-req-${process.pid}.json`);
  const tmpOut = path.join(os.tmpdir(), `anth-res-${process.pid}.json`);
  fs.writeFileSync(tmpIn, JSON.stringify(bodyObj));
  // Pass key via env var referenced in header — still visible in process list briefly,
  // but we avoid echoing it. Use curl -H with env expansion in shell.
  const result = spawnSync('curl', [
    '-sS', '--fail-with-body',
    '--connect-timeout', '30',
    '--max-time', '600',
    '-X', 'POST',
    'https://api.anthropic.com/v1/messages',
    '-H', 'content-type: application/json',
    '-H', `x-api-key: ${key}`,
    '-H', 'anthropic-version: 2023-06-01',
    '--data-binary', `@${tmpIn}`,
    '-o', tmpOut,
    '-w', '%{http_code}',
  ], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  fs.unlinkSync(tmpIn);
  const status = Number(result.stdout.trim() || '0');
  const raw = fs.existsSync(tmpOut) ? fs.readFileSync(tmpOut, 'utf8') : '';
  try { fs.unlinkSync(tmpOut); } catch {}
  if (result.error) throw result.error;
  if (result.status !== 0 && !raw) {
    throw new Error(`curl failed status=${result.status} stderr=${result.stderr}`);
  }
  return { status, raw, stderr: result.stderr };
}

async function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function call() {
  const body = {
    model: MODEL,
    max_tokens: MAX_TOKENS,
    system,
    messages: [{ role: 'user', content: prompt }],
  };
  if (DRY) {
    console.log('DRY run, prompt chars:', prompt.length, 'model:', MODEL);
    return;
  }
  console.log(`calling ${MODEL} max_tokens=${MAX_TOKENS} prompt_chars=${prompt.length} label=${LABEL}`);
  const t0 = Date.now();
  let status, raw;
  for (let attempt = 1; attempt <= 5; attempt++) {
    try {
      ({ status, raw } = curlPost(body));
      if (status >= 500 || status === 429) {
        console.error(`retryable ${status} attempt ${attempt}`);
        await sleep(2000 * attempt);
        continue;
      }
      break;
    } catch (e) {
      console.error(`network error attempt ${attempt}:`, e.message);
      if (attempt === 5) throw e;
      await sleep(2000 * attempt);
    }
  }
  if (!raw) { console.error('no response'); process.exit(1); }
  if (status !== 200) {
    console.error('API error', status, raw.slice(0, 1000));
    process.exit(1);
  }
  const data = JSON.parse(raw);
  const text = (data.content || []).filter(c => c.type === 'text').map(c => c.text).join('\n');
  const usage = data.usage || {};
  const logLine = {
    ts: new Date().toISOString(),
    label: LABEL,
    model: data.model || MODEL,
    input_tokens: usage.input_tokens ?? null,
    output_tokens: usage.output_tokens ?? null,
    cache_read_input_tokens: usage.cache_read_input_tokens ?? null,
    cache_creation_input_tokens: usage.cache_creation_input_tokens ?? null,
    ms: Date.now() - t0,
    stop_reason: data.stop_reason,
  };
  const logPath = path.join(OUT_DIR, 'docs/build-usage.jsonl');
  fs.mkdirSync(path.dirname(logPath), { recursive: true });
  fs.appendFileSync(logPath, JSON.stringify(logLine) + '\n');
  console.log('usage', JSON.stringify(logLine));

  const re = /---FILE:\s*([^\n]+?)---\n([\s\S]*?)---ENDFILE---/g;
  let m;
  const written = [];
  while ((m = re.exec(text)) !== null) {
    const rel = m[1].trim().replace(/^\.\//, '');
    const content = m[2].replace(/\n$/, '');
    const abs = path.join(OUT_DIR, rel);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, content);
    written.push(rel);
  }
  // Also save raw for debugging always
  fs.writeFileSync(path.join(OUT_DIR, 'docs', `_raw-${LABEL}.md`), text);
  if (written.length === 0) {
    console.error('No FILE blocks found; raw saved');
    process.exit(2);
  }
  console.log('wrote', written.length, 'files:');
  for (const w of written) console.log(' ', w);
}

call().catch(e => { console.error(e); process.exit(1); });
