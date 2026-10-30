#!/usr/bin/env node
/**
 * Official Anthropic Messages API via curl SSE stream.
 * Long non-stream responses were dying with SSL EOF; streaming keeps the pipe alive.
 * --model claude-opus-5-5 · --effort xhigh → body.output_config.effort
 * Always delete ANTHROPIC_AUTH_TOKEN (no relay).
 */
import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';
import os from 'os';

const args = process.argv.slice(2);
function getFlag(name, def = null) {
  const i = args.indexOf(name);
  if (i === -1) return def;
  return args[i + 1] ?? def;
}
function hasFlag(name) { return args.includes(name); }

const MODEL = getFlag('--model', 'claude-opus-5-5');
const MAX_TOKENS = Number(getFlag('--max-tokens', '128000'));
const EFFORT = getFlag('--effort', null);
const OUT_DIR = getFlag('--out-dir', process.cwd());
const PROMPT_FILE = getFlag('--prompt', null);
const SYSTEM_FILE = getFlag('--system', null);
const LABEL = getFlag('--label', 'gen');
const DRY = hasFlag('--dry');
const CONTINUE_FROM = getFlag('--continue-from', null);
const MAX_TIME = Number(getFlag('--max-time', '3600'));

delete process.env.ANTHROPIC_AUTH_TOKEN;

const key = process.env.ANTHROPIC_API_KEY;
if (!key) {
  console.error('ANTHROPIC_API_KEY missing');
  process.exit(1);
}

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
    const content = fs.readFileSync(p, 'utf8');
    const clipped = content.length > 120000 ? content.slice(0, 120000) + '\n/* …truncated… */\n' : content;
    prompt += `\n\n### Existing file: ${rel}\n\`\`\`\n${clipped}\n\`\`\`\n`;
  }
}

if (CONTINUE_FROM && fs.existsSync(CONTINUE_FROM)) {
  const prior = fs.readFileSync(CONTINUE_FROM, 'utf8');
  prompt += `\n\n### PRIOR OUTPUT (stop_reason was max_tokens — CONTINUE)\n` +
    `Re-emit ANY incomplete last FILE fully, then remaining files. Do not restart finished files.\n` +
    `Prior text (tail):\n\`\`\`\n${prior.slice(-20000)}\n\`\`\`\n`;
}

const system = SYSTEM_FILE
  ? fs.readFileSync(SYSTEM_FILE, 'utf8')
  : `You are a senior TypeScript + Three.js engineer building a top-tier educational WebGL lesson.
When asked to write code, output ONLY files using:
---FILE: relative/path---
<contents>
---ENDFILE---
No prose outside markers. Original GCSE/KS3 English. Studio bar: neon anatomy, dark studio, scale clock, phone overlay ≤40%.`;

function streamMessages(bodyObj) {
  return new Promise((resolve, reject) => {
    const tmpIn = path.join(os.tmpdir(), `anth-req-${process.pid}-${Date.now()}.json`);
    fs.writeFileSync(tmpIn, JSON.stringify(bodyObj));
    const curl = spawn('curl', [
      '-sS', '-N', '--no-buffer',
      '--connect-timeout', '30',
      '--max-time', String(MAX_TIME),
      '-X', 'POST',
      'https://api.anthropic.com/v1/messages',
      '-H', 'content-type: application/json',
      '-H', `x-api-key: ${key}`,
      '-H', 'anthropic-version: 2023-06-01',
      '-H', 'accept: text/event-stream',
      '--data-binary', `@${tmpIn}`,
    ], { stdio: ['ignore', 'pipe', 'pipe'] });

    let buf = '';
    let stderr = '';
    let text = '';
    let thinkingChars = 0;
    let usage = {};
    let model = bodyObj.model;
    let stopReason = null;
    let messageStart = null;
    let httpErrorBody = '';
    let sawEvent = false;
    let lastProgress = Date.now();

    curl.stderr.on('data', (d) => { stderr += d.toString(); });
    curl.stdout.on('data', (chunk) => {
      buf += chunk.toString();
      // Non-SSE JSON error (whole body)
      if (!sawEvent && buf.trimStart().startsWith('{') && buf.includes('"type"') && !buf.includes('event:')) {
        httpErrorBody = buf;
        return;
      }
      let idx;
      while ((idx = buf.indexOf('\n')) !== -1) {
        let line = buf.slice(0, idx);
        buf = buf.slice(idx + 1);
        if (line.endsWith('\r')) line = line.slice(0, -1);
        if (!line.startsWith('data:')) continue;
        const payload = line.slice(5).trim();
        if (!payload || payload === '[DONE]') continue;
        let ev;
        try { ev = JSON.parse(payload); } catch { continue; }
        sawEvent = true;
        if (ev.type === 'ping') { /* heartbeat */ }
        const now = Date.now();
        if (now - lastProgress > 15000) {
          process.stderr.write(`[stream] text=${text.length} thinking=${thinkingChars} last=${ev.type}\n`);
          lastProgress = now;
        }
        switch (ev.type) {
          case 'message_start':
            messageStart = ev.message;
            if (ev.message?.model) model = ev.message.model;
            if (ev.message?.usage) usage = { ...usage, ...ev.message.usage };
            break;
          case 'content_block_start':
            process.stderr.write(`[stream] block_start type=${ev.content_block?.type}\n`);
            break;
          case 'content_block_delta':
            if (ev.delta?.type === 'text_delta') text += ev.delta.text || '';
            else if (ev.delta?.type === 'thinking_delta') thinkingChars += (ev.delta.thinking || '').length;
            else if (ev.delta?.thinking) thinkingChars += String(ev.delta.thinking).length;
            else if (typeof ev.delta?.text === 'string' && ev.delta?.type !== 'text_delta') { /* ignore */ }
            break;
          case 'message_delta':
            if (ev.delta?.stop_reason) stopReason = ev.delta.stop_reason;
            if (ev.usage) usage = { ...usage, ...ev.usage };
            break;
          case 'message_stop':
            break;
          case 'error':
            reject(new Error(`stream error: ${JSON.stringify(ev.error || ev)}`));
            try { curl.kill(); } catch {}
            return;
        }
      }
    });

    curl.on('error', (e) => {
      try { fs.unlinkSync(tmpIn); } catch {}
      reject(e);
    });
    curl.on('close', (code) => {
      try { fs.unlinkSync(tmpIn); } catch {}
      if (httpErrorBody) {
        reject(new Error(`API non-stream body: ${httpErrorBody.slice(0, 2000)}`));
        return;
      }
      if (code !== 0 && !sawEvent) {
        reject(new Error(`curl exit ${code} stderr=${stderr}`));
        return;
      }
      if (!sawEvent && !text) {
        reject(new Error(`no SSE events; stderr=${stderr} buf=${buf.slice(0, 500)}`));
        return;
      }
      // message_start has input tokens; message_delta has output tokens — merge
      if (messageStart?.usage) {
        usage = {
          input_tokens: usage.input_tokens ?? messageStart.usage.input_tokens,
          cache_creation_input_tokens: usage.cache_creation_input_tokens ?? messageStart.usage.cache_creation_input_tokens ?? 0,
          cache_read_input_tokens: usage.cache_read_input_tokens ?? messageStart.usage.cache_read_input_tokens ?? 0,
          output_tokens: usage.output_tokens ?? null,
          ...usage,
        };
      }
      resolve({ text, thinkingChars, usage, model, stopReason, stderr });
    });
  });
}

async function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function call() {
  const body = {
    model: MODEL,
    max_tokens: MAX_TOKENS,
    stream: true,
    system,
    messages: [{ role: 'user', content: prompt }],
  };
  if (EFFORT) body.output_config = { effort: EFFORT };

  if (DRY) {
    console.log('DRY', { model: MODEL, effort: EFFORT, max_tokens: MAX_TOKENS, prompt_chars: prompt.length });
    return;
  }

  console.log(`streaming ${MODEL} effort=${EFFORT || '(default)'} max_tokens=${MAX_TOKENS} prompt_chars=${prompt.length} label=${LABEL}`);
  const t0 = Date.now();
  let result;
  for (let attempt = 1; attempt <= 4; attempt++) {
    try {
      result = await streamMessages(body);
      break;
    } catch (e) {
      console.error(`stream attempt ${attempt} failed:`, e.message.slice(0, 500));
      if (attempt === 4) throw e;
      await sleep(4000 * attempt);
    }
  }

  const { text, thinkingChars, usage, model, stopReason } = result;
  const logLine = {
    ts: new Date().toISOString(),
    label: LABEL,
    model: model || MODEL,
    effort: EFFORT,
    input_tokens: usage.input_tokens ?? null,
    output_tokens: usage.output_tokens ?? null,
    cache_read_input_tokens: usage.cache_read_input_tokens ?? null,
    cache_creation_input_tokens: usage.cache_creation_input_tokens ?? null,
    ms: Date.now() - t0,
    stop_reason: stopReason,
    thinking_chars: thinkingChars,
    text_chars: text.length,
    stream: true,
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
  fs.writeFileSync(path.join(OUT_DIR, 'docs', `_raw-${LABEL}.md`), text);
  fs.writeFileSync(
    path.join(OUT_DIR, 'docs', `_meta-${LABEL}.json`),
    JSON.stringify({ model, stop_reason: stopReason, usage, thinking_chars: thinkingChars }, null, 2)
  );
  if (written.length === 0) {
    console.error('No FILE blocks; raw saved. stop_reason=', stopReason);
    process.exit(2);
  }
  console.log('wrote', written.length, 'files:');
  for (const w of written) console.log(' ', w);
  if (stopReason === 'max_tokens') {
    console.error('WARNING: truncated (max_tokens). Re-run with --continue-from docs/_raw-' + LABEL + '.md');
    process.exit(3);
  }
}

call().catch(e => { console.error(e); process.exit(1); });
