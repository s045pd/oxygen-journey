/// <reference types="vite/client" />
/**
 * Oxygen Journey — entry.
 * Pulls in any stylesheet living in src/ (works whether or not index.html links it),
 * guarantees a full-bleed, notch-aware viewport, then boots the app.
 */
import.meta.glob(['./*.css', './styles/*.css'], { eager: true });
import { App } from './app';

function ensureViewportMeta(): void {
  let vp = document.querySelector<HTMLMetaElement>('meta[name="viewport"]');
  if (!vp) {
    vp = document.createElement('meta');
    vp.name = 'viewport';
    document.head.appendChild(vp);
  }
  const parts = new Map<string, string>();
  for (const raw of (vp.content || '').split(',')) {
    const [k, v] = raw.split('=').map((s) => s.trim());
    if (k) parts.set(k.toLowerCase(), v ?? '');
  }
  const want: Record<string, string> = {
    width: 'device-width',
    'initial-scale': '1',
    'viewport-fit': 'cover',
  };
  let changed = false;
  for (const [k, v] of Object.entries(want)) {
    if (parts.get(k) !== v) {
      parts.set(k, v);
      changed = true;
    }
  }
  if (changed) vp.content = [...parts].map(([k, v]) => (v ? `${k}=${v}` : k)).join(', ');

  if (!document.querySelector('meta[name="theme-color"]')) {
    const theme = document.createElement('meta');
    theme.name = 'theme-color';
    theme.content = '#070a10';
    document.head.appendChild(theme);
  }
}

function showFatal(err: unknown): void {
  console.error('[oxygen-journey] failed to start', err);
  const box = document.createElement('div');
  box.style.cssText =
    'position:fixed;inset:0;display:grid;place-items:center;padding:24px;background:#070a10;color:#e9f1ff;' +
    'font:15px/1.5 system-ui,sans-serif;text-align:center;';
  box.textContent =
    'This lesson needs WebGL. Try a recent version of Chrome, Edge, Firefox or Safari, or enable hardware acceleration.';
  document.body.appendChild(box);
}

ensureViewportMeta();

try {
  new App().start();
} catch (err) {
  showFatal(err);
}