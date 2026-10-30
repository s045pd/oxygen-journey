/**
 * Oxygen Journey — shared UI stylesheet (HUD, quiz, splash, stage fallbacks).
 *
 * Injected once at runtime so the lesson looks right even if the page stylesheet
 * is missing or minimal. HUD/quiz selectors are prefixed `oj-` to avoid clashing
 * with style.css. Stage fallbacks (html/body, scale ring) use :where() so any
 * rule in style.css wins over them.
 */
import type { AccentName } from '../types';

export const ACCENT_HEX: Record<AccentName, number> = {
  cyan: 0x38f0ff,
  magenta: 0xff3fd0,
  violet: 0x9b6dff,
  crimson: 0xff3b5c,
  amber: 0xffb02e,
};

/** Secondary tint used for the glass rim gradient toward the head. */
export const ACCENT_PARTNER: Record<AccentName, number> = {
  cyan: 0x9b6dff,
  magenta: 0x9b6dff,
  violet: 0x38f0ff,
  crimson: 0xff3fd0,
  amber: 0xff3b5c,
};

const STYLE_ID = 'oj-ui-style';

const hex = (n: number): string => '#' + n.toString(16).padStart(6, '0');
const rgb = (n: number): string => `${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}`;

function accentRules(): string {
  return (Object.keys(ACCENT_HEX) as AccentName[])
    .map((name) => {
      const v = ACCENT_HEX[name];
      return (
        `.oj-root[data-accent="${name}"]{--oj-accent:${hex(v)};--oj-accent-rgb:${rgb(v)};}\n` +
        `:where([data-accent="${name}"]){--accent:${hex(v)};}`
      );
    })
    .join('\n');
}

const CSS = /* css */ `
:where(html,body){margin:0;padding:0;width:100%;height:100%;overflow:hidden;background:#070a10;overscroll-behavior:none;}
:where(body){-webkit-tap-highlight-color:transparent;-webkit-text-size-adjust:100%;}

.oj-root{
  --oj-accent:#38f0ff;--oj-accent-rgb:56, 240, 255;
  --oj-ink:#e9f1ff;--oj-ink-2:rgba(214,228,255,.74);--oj-ink-3:rgba(214,228,255,.46);
  --oj-glass:rgba(10,14,22,.66);--oj-line:rgba(214,228,255,.10);
  --oj-good:#3dffa8;--oj-bad:#ff4d6d;--oj-warn:#ff8a3d;
  --oj-font:"Inter","SF Pro Text",system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;
  --oj-mono:"JetBrains Mono","SF Mono",ui-monospace,Menlo,Consolas,monospace;
  --oj-sat:env(safe-area-inset-top,0px);--oj-sab:env(safe-area-inset-bottom,0px);
  --oj-sal:env(safe-area-inset-left,0px);--oj-sar:env(safe-area-inset-right,0px);
  position:fixed;inset:0;overflow:hidden;background:#070a10;color:var(--oj-ink);
  font-family:var(--oj-font);-webkit-font-smoothing:antialiased;
  user-select:none;-webkit-user-select:none;-webkit-touch-callout:none;touch-action:none;
}
.oj-root>canvas{position:absolute;inset:0;width:100%;height:100%;display:block;outline:none;touch-action:none;}

/* Scale ring fallbacks (style.css overrides these). */
:where(.scale-ring-host){position:absolute;right:calc(var(--oj-sar,0px) + 2px);top:50%;transform:translateY(-50%);
  width:58px;height:min(44vh,380px);pointer-events:none;z-index:5;}
:where(.scale-ring-host) svg{width:100%;height:100%;overflow:visible;display:block;}
:where(.ring-track){fill:none;stroke:rgba(214,228,255,.16);stroke-width:1.5;}
:where(.ring-progress){fill:none;stroke:var(--accent,#38f0ff);stroke-width:2;stroke-linecap:round;filter:drop-shadow(0 0 4px var(--accent,#38f0ff));}
:where(.ring-tick){fill:rgba(214,228,255,.32);}
:where(.ring-tick.is-done){fill:var(--accent,#38f0ff);opacity:.6;}
:where(.ring-tick.is-active){fill:#fff;filter:drop-shadow(0 0 4px var(--accent,#38f0ff));}
:where(.ring-label){font:600 8.5px/1 "JetBrains Mono",ui-monospace,Menlo,monospace;letter-spacing:.12em;fill:rgba(214,228,255,.62);
  text-anchor:end;dominant-baseline:middle;}
:where(.ring-label.is-active){fill:#eaf4ff;}

${accentRules()}

/* ---------------------------------------------------------------- HUD */
.oj-hud{position:absolute;inset:0;pointer-events:none;z-index:10;}
.oj-hud *,.oj-quiz *{box-sizing:border-box;}
.oj-hud button,.oj-quiz button{font:inherit;color:inherit;cursor:pointer;-webkit-tap-highlight-color:transparent;touch-action:manipulation;}
.oj-hud button:focus{outline:none}
.oj-hud button:focus-visible,.oj-quiz button:focus-visible{outline:2px solid rgba(var(--oj-accent-rgb),.8);outline-offset:2px;}

.oj-vignette{position:absolute;inset:0;pointer-events:none;
  background:radial-gradient(125% 90% at 50% 36%,transparent 50%,rgba(2,3,6,.6) 100%),
             linear-gradient(to top,rgba(4,6,10,.72),rgba(4,6,10,0) 36%);}

.oj-top{position:absolute;top:0;left:0;right:0;display:flex;justify-content:space-between;align-items:flex-start;gap:12px;
  padding:calc(var(--oj-sat) + 12px) calc(var(--oj-sar) + 12px) 0 calc(var(--oj-sal) + 14px);
  transition:opacity .45s ease,transform .45s cubic-bezier(.2,.8,.2,1);}
.oj-id{display:flex;flex-direction:column;gap:6px;min-width:0;}
.oj-brand{font:600 9.5px/1 var(--oj-mono);letter-spacing:.2em;text-transform:uppercase;color:var(--oj-ink-3);}
.oj-title{display:flex;align-items:baseline;gap:9px;font-weight:650;font-size:19px;letter-spacing:-.01em;line-height:1.1;white-space:nowrap;}
.oj-roman{font:700 12px/1 var(--oj-mono);color:var(--oj-accent);letter-spacing:.08em;text-shadow:0 0 12px rgba(var(--oj-accent-rgb),.65);}
.oj-meta{display:flex;align-items:center;gap:10px;flex-wrap:wrap;}
.oj-segs{display:flex;gap:3px;}
.oj-segs i{width:11px;height:3px;border-radius:2px;background:rgba(214,228,255,.14);transition:background .35s,box-shadow .35s;}
.oj-segs i.is-done{background:rgba(var(--oj-accent-rgb),.5);}
.oj-segs i.is-current{background:var(--oj-accent);box-shadow:0 0 8px rgba(var(--oj-accent-rgb),.85);}
.oj-phases{display:flex;gap:2px;font:600 9px/1 var(--oj-mono);letter-spacing:.14em;text-transform:uppercase;}
.oj-phases span{padding:4px 6px;border-radius:999px;color:var(--oj-ink-3);transition:color .3s,background .3s,box-shadow .3s;}
.oj-phases span.is-past{color:var(--oj-ink-2);}
.oj-phases span.is-on{color:#05070c;background:var(--oj-accent);box-shadow:0 0 12px rgba(var(--oj-accent-rgb),.55);}
.oj-nav{display:flex;gap:6px;pointer-events:auto;flex:none;}
.oj-icon{width:34px;height:34px;border-radius:10px;display:grid;place-items:center;padding:0;
  background:rgba(10,14,22,.5);border:1px solid var(--oj-line);
  backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);transition:border-color .2s,background .2s,opacity .2s;}
.oj-icon:hover:not(:disabled){border-color:rgba(var(--oj-accent-rgb),.55);background:rgba(var(--oj-accent-rgb),.08);}
.oj-icon:disabled{opacity:.28;cursor:default;}
.oj-icon svg{width:16px;height:16px;stroke:currentColor;fill:none;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round;}

/* Card */
.oj-card{position:absolute;left:calc(var(--oj-sal) + 10px);right:calc(var(--oj-sar) + 10px);bottom:calc(var(--oj-sab) + 10px);
  pointer-events:auto;padding:12px 14px;border-radius:16px;background:var(--oj-glass);border:1px solid var(--oj-line);
  backdrop-filter:blur(18px) saturate(140%);-webkit-backdrop-filter:blur(18px) saturate(140%);
  box-shadow:0 18px 50px rgba(0,0,0,.45),inset 0 1px 0 rgba(255,255,255,.05);
  transition:opacity .35s ease,transform .4s cubic-bezier(.2,.8,.2,1),border-color .4s;}
.oj-card::before{content:"";position:absolute;left:16px;right:16px;top:-1px;height:1px;
  background:linear-gradient(90deg,transparent,rgba(var(--oj-accent-rgb),.75),transparent);}
.oj-card.is-success{border-color:rgba(var(--oj-accent-rgb),.38);}
.oj-hud.is-splash .oj-top,.oj-hud.is-splash .oj-card{opacity:0;transform:translateY(10px);pointer-events:none;}
.oj-hud.is-splash .oj-top{transform:translateY(-8px);}
.oj-hud[data-phase="check"] .oj-card{opacity:0;transform:translateY(14px);pointer-events:none;}
.oj-hud[data-phase="tour"] .oj-try-only{display:none;}
.oj-hud:not([data-phase="tour"]) .oj-tour-only{display:none;}
@media (min-width:760px){
  .oj-card{left:calc(var(--oj-sal) + 28px);right:auto;bottom:calc(var(--oj-sab) + 28px);width:420px;padding:16px 18px;}
}
.oj-card-head{display:flex;align-items:center;gap:10px;min-height:20px;}
.oj-card-kicker{font:700 10px/1 var(--oj-mono);letter-spacing:.22em;color:var(--oj-accent);text-shadow:0 0 10px rgba(var(--oj-accent-rgb),.55);}
.oj-beats{display:flex;gap:4px;}
.oj-beats i{width:5px;height:5px;border-radius:50%;background:rgba(214,228,255,.2);transition:background .3s,box-shadow .3s;}
.oj-beats i.is-on{background:var(--oj-accent);box-shadow:0 0 6px rgba(var(--oj-accent-rgb),.9);}
.oj-skip{margin-left:auto;height:26px;padding:0 10px;border-radius:999px;border:1px solid var(--oj-line);background:rgba(214,228,255,.04);
  font:600 10px/1 var(--oj-mono)!important;letter-spacing:.14em;text-transform:uppercase;color:var(--oj-ink-2)!important;transition:border-color .2s,color .2s;}
.oj-skip:hover{border-color:rgba(var(--oj-accent-rgb),.6);color:#fff!important;}
.oj-card-text{margin:8px 0 0;font-size:14px;line-height:1.42;color:var(--oj-ink);text-wrap:pretty;min-height:2.84em;}
.oj-hud[data-phase="tour"] .oj-card-text{cursor:pointer;}
.oj-card-text.is-swap{animation:oj-rise .45s cubic-bezier(.2,.8,.2,1);}
@media (min-width:760px){.oj-card-text{font-size:15px;}}
.oj-tourbar{height:2px;margin-top:10px;border-radius:2px;background:rgba(214,228,255,.08);overflow:hidden;}
.oj-tourbar i{display:block;height:100%;width:100%;transform-origin:left center;transform:scaleX(0);
  background:var(--oj-accent);box-shadow:0 0 8px rgba(var(--oj-accent-rgb),.8);}

/* Readout */
.oj-readout{margin-top:10px;}
.oj-ro-row{display:flex;align-items:baseline;gap:8px;min-width:0;}
.oj-ro-label{font:600 9.5px/1 var(--oj-mono);letter-spacing:.16em;text-transform:uppercase;color:var(--oj-ink-3);white-space:nowrap;}
.oj-ro-note{font:700 9px/1 var(--oj-mono);letter-spacing:.14em;color:var(--oj-warn);padding:3px 6px;border-radius:999px;
  border:1px solid rgba(255,138,61,.45);background:rgba(255,138,61,.1);}
.oj-ro-note:empty{display:none;}
.oj-ro-value{margin-left:auto;font:700 21px/1 var(--oj-mono);font-variant-numeric:tabular-nums;color:#fff;white-space:nowrap;transition:color .3s,text-shadow .3s;}
.oj-ro-value small{font-size:10.5px;font-weight:600;color:var(--oj-ink-2);margin-left:5px;letter-spacing:.06em;}
.oj-ro-bar{position:relative;margin-top:7px;height:4px;border-radius:4px;background:rgba(214,228,255,.09);}
.oj-ro-bar i{position:absolute;inset:0;border-radius:inherit;transform-origin:left center;transform:scaleX(0);
  background:linear-gradient(90deg,rgba(var(--oj-accent-rgb),.45),var(--oj-accent));box-shadow:0 0 10px rgba(var(--oj-accent-rgb),.6);}
.oj-ro-bar em{position:absolute;top:-3px;bottom:-3px;width:2px;margin-left:-1px;border-radius:1px;background:rgba(255,255,255,.75);
  box-shadow:0 0 6px rgba(255,255,255,.6);}
.oj-readout.is-warn .oj-ro-bar i{background:linear-gradient(90deg,rgba(255,138,61,.45),var(--oj-warn));box-shadow:0 0 10px rgba(255,138,61,.6);}
.oj-readout.is-warn .oj-ro-value{color:var(--oj-warn);}
.oj-readout.is-done .oj-ro-value{color:var(--oj-accent);text-shadow:0 0 14px rgba(var(--oj-accent-rgb),.7);}

/* Controls */
.oj-ctrl-row{display:flex;align-items:center;gap:8px;margin-top:11px;}
.oj-control{flex:1;min-width:0;display:flex;}
.oj-btn{position:relative;display:inline-flex;align-items:center;justify-content:center;gap:8px;height:46px;padding:0 16px;border-radius:12px;
  border:1px solid var(--oj-line);background:rgba(214,228,255,.05);font-weight:600;font-size:14px;letter-spacing:.01em;white-space:nowrap;
  transition:background .2s,border-color .2s,box-shadow .25s,opacity .25s,transform .12s;}
.oj-btn svg{width:15px;height:15px;stroke:currentColor;fill:none;stroke-width:2;stroke-linecap:round;stroke-linejoin:round;}
.oj-btn:active:not(:disabled){transform:scale(.97);}
.oj-btn.primary{border-color:rgba(var(--oj-accent-rgb),.6);color:#fff;
  background:linear-gradient(180deg,rgba(var(--oj-accent-rgb),.3),rgba(var(--oj-accent-rgb),.12));
  box-shadow:0 0 18px rgba(var(--oj-accent-rgb),.22),inset 0 1px 0 rgba(255,255,255,.14);}
.oj-btn.primary:hover:not(:disabled){box-shadow:0 0 28px rgba(var(--oj-accent-rgb),.4),inset 0 1px 0 rgba(255,255,255,.18);}
.oj-btn:disabled{opacity:.34;cursor:default;filter:saturate(.35);}
.oj-check{flex:none;}
.oj-check.is-ready{animation:oj-pulse 1.7s ease-in-out infinite;}
.oj-act{flex:1;min-width:0;height:52px;justify-content:flex-start;padding:0 14px;overflow:hidden;
  border-color:rgba(var(--oj-accent-rgb),.38);background:rgba(var(--oj-accent-rgb),.07);}
.oj-act-ring{flex:none;position:relative;width:24px;height:24px;border-radius:50%;border:2px solid var(--oj-accent);
  box-shadow:0 0 10px rgba(var(--oj-accent-rgb),.55);transition:background .2s;}
.oj-act-ring::after{content:"";position:absolute;inset:5px;border-radius:50%;background:var(--oj-accent);opacity:.5;}
.oj-act-label{overflow:hidden;text-overflow:ellipsis;}
.oj-act-key{margin-left:auto;font:600 9px/1 var(--oj-mono);letter-spacing:.14em;color:var(--oj-ink-3);padding:4px 6px;border:1px solid var(--oj-line);border-radius:6px;}
@media (hover:none){.oj-act-key{display:none;}}
.oj-act.is-held{background:rgba(var(--oj-accent-rgb),.22);border-color:var(--oj-accent);
  box-shadow:0 0 30px rgba(var(--oj-accent-rgb),.45),inset 0 0 20px rgba(var(--oj-accent-rgb),.25);}
.oj-act.is-held .oj-act-ring{background:rgba(var(--oj-accent-rgb),.35);animation:oj-breathe 1.1s ease-in-out infinite;}
.oj-act::after{content:"";position:absolute;inset:0;border-radius:inherit;pointer-events:none;opacity:0;
  box-shadow:inset 0 0 0 2px var(--oj-accent),0 0 24px rgba(var(--oj-accent-rgb),.6);}
.oj-act.is-tapped::after{animation:oj-flash .42s ease-out;}
.oj-act.is-tapped .oj-act-ring{animation:oj-pop .32s ease-out;}

.oj-range{display:flex;flex-direction:column;justify-content:center;gap:4px;flex:1;min-width:0;padding:0 2px;}
.oj-range-top{display:flex;justify-content:space-between;gap:8px;font:600 9.5px/1 var(--oj-mono);letter-spacing:.16em;text-transform:uppercase;color:var(--oj-ink-3);}
.oj-range-top output{color:var(--oj-ink);font-variant-numeric:tabular-nums;}
.oj-range input{-webkit-appearance:none;appearance:none;width:100%;height:30px;background:transparent;margin:0;cursor:pointer;touch-action:none;}
.oj-range input:focus{outline:none;}
.oj-range input::-webkit-slider-runnable-track{height:4px;border-radius:4px;
  background:linear-gradient(90deg,var(--oj-accent) 0,var(--oj-accent) calc(var(--v,0) * 100%),rgba(214,228,255,.14) calc(var(--v,0) * 100%));}
.oj-range input::-webkit-slider-thumb{-webkit-appearance:none;width:22px;height:22px;margin-top:-9px;border-radius:50%;background:#fff;
  border:2px solid var(--oj-accent);box-shadow:0 0 0 4px rgba(var(--oj-accent-rgb),.18),0 0 14px rgba(var(--oj-accent-rgb),.75);}
.oj-range input::-moz-range-track{height:4px;border-radius:4px;background:rgba(214,228,255,.14);}
.oj-range input::-moz-range-progress{height:4px;border-radius:4px;background:var(--oj-accent);}
.oj-range input::-moz-range-thumb{width:18px;height:18px;border-radius:50%;background:#fff;border:2px solid var(--oj-accent);
  box-shadow:0 0 0 4px rgba(var(--oj-accent-rgb),.18),0 0 14px rgba(var(--oj-accent-rgb),.75);}
.oj-extra{margin-top:8px;}
.oj-extra:empty{display:none;}

.oj-draghint{flex:1;min-width:0;display:flex;align-items:center;gap:10px;height:52px;padding:0 14px;border-radius:12px;
  border:1px dashed rgba(var(--oj-accent-rgb),.5);background:rgba(var(--oj-accent-rgb),.06);font-weight:600;font-size:14px;transition:background .2s,border-color .2s;}
.oj-draghint svg{flex:none;width:20px;height:20px;stroke:var(--oj-accent);fill:none;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round;
  animation:oj-sway 1.8s ease-in-out infinite;filter:drop-shadow(0 0 4px rgba(var(--oj-accent-rgb),.8));}
.oj-draghint small{margin-left:auto;font:600 9px/1 var(--oj-mono);letter-spacing:.14em;color:var(--oj-ink-3);text-transform:uppercase;}
.oj-draghint.is-active{border-style:solid;background:rgba(var(--oj-accent-rgb),.18);}

/* Splash / finish */
.oj-splash{position:absolute;inset:0;pointer-events:auto;display:flex;align-items:flex-end;z-index:30;
  padding:calc(var(--oj-sat) + 24px) calc(var(--oj-sar) + 24px) calc(var(--oj-sab) + 30px) calc(var(--oj-sal) + 24px);
  background:linear-gradient(to top,rgba(7,10,16,.95) 0%,rgba(7,10,16,.62) 40%,rgba(7,10,16,0) 72%);
  transition:opacity .7s ease,visibility .7s;}
.oj-splash.is-hidden{opacity:0;visibility:hidden;pointer-events:none;}
.oj-splash-inner{max-width:540px;animation:oj-rise .8s cubic-bezier(.2,.8,.2,1);}
.oj-splash h1{margin:12px 0 0;font-size:clamp(40px,10vw,76px);line-height:.94;letter-spacing:-.035em;font-weight:720;color:#fff;}
.oj-splash h1 span{display:block;color:var(--oj-accent);text-shadow:0 0 28px rgba(var(--oj-accent-rgb),.55);}
.oj-splash-sub{margin:16px 0 0;font-size:15px;line-height:1.5;color:var(--oj-ink-2);max-width:38ch;}
.oj-splash-hint{margin-top:14px;font:600 10px/1.4 var(--oj-mono);letter-spacing:.16em;text-transform:uppercase;color:var(--oj-ink-3);}
.oj-splash .oj-btn{margin-top:22px;height:52px;padding:0 24px;font-size:15px;}
.oj-splash-keys{margin-top:14px;font:600 9.5px/1.4 var(--oj-mono);letter-spacing:.14em;color:var(--oj-ink-3);text-transform:uppercase;}
@media (hover:none){.oj-splash-keys{display:none;}}
.oj-score{margin-top:18px;display:flex;align-items:baseline;gap:10px;}
.oj-score b{font:700 44px/1 var(--oj-mono);color:var(--oj-accent);text-shadow:0 0 22px rgba(var(--oj-accent-rgb),.6);}
.oj-score span{font:600 10px/1 var(--oj-mono);letter-spacing:.16em;text-transform:uppercase;color:var(--oj-ink-3);}

/* ---------------------------------------------------------------- Quiz */
.oj-quiz{position:absolute;inset:0;z-index:20;pointer-events:none;display:flex;align-items:flex-end;justify-content:center;
  padding:0 calc(var(--oj-sar) + 10px) calc(var(--oj-sab) + 10px) calc(var(--oj-sal) + 10px);
  background:linear-gradient(to top,rgba(4,6,10,.6),rgba(4,6,10,0) 50%);opacity:0;visibility:hidden;transition:opacity .35s ease,visibility .35s;}
.oj-quiz.is-open{pointer-events:auto;opacity:1;visibility:visible;}
.oj-quiz-card{position:relative;width:100%;max-width:520px;padding:13px 14px;border-radius:16px;background:var(--oj-glass);border:1px solid var(--oj-line);
  backdrop-filter:blur(18px) saturate(140%);-webkit-backdrop-filter:blur(18px) saturate(140%);
  box-shadow:0 18px 50px rgba(0,0,0,.45),inset 0 1px 0 rgba(255,255,255,.05);
  transform:translateY(16px);transition:transform .45s cubic-bezier(.2,.8,.2,1);}
.oj-quiz-card::before{content:"";position:absolute;left:16px;right:16px;top:-1px;height:1px;background:linear-gradient(90deg,transparent,rgba(var(--oj-accent-rgb),.75),transparent);}
.oj-quiz.is-open .oj-quiz-card{transform:none;}
@media (min-width:760px){
  .oj-quiz{justify-content:flex-start;padding-left:calc(var(--oj-sal) + 28px);padding-bottom:calc(var(--oj-sab) + 28px);}
  .oj-quiz-card{width:440px;padding:16px 18px;}
}
.oj-quiz-head{display:flex;align-items:center;gap:10px;}
.oj-quiz-count{margin-left:auto;font:600 10px/1 var(--oj-mono);letter-spacing:.14em;color:var(--oj-ink-3);}
.oj-quiz-prompt{margin:9px 0 10px;font-size:15px;line-height:1.36;font-weight:620;text-wrap:pretty;}
.oj-quiz-prompt.is-swap{animation:oj-rise .4s cubic-bezier(.2,.8,.2,1);}
.oj-quiz-options{display:flex;flex-direction:column;gap:6px;}
.oj-opt{display:flex;align-items:center;gap:10px;min-height:42px;padding:8px 12px;text-align:left;border-radius:11px;border:1px solid var(--oj-line);
  background:rgba(214,228,255,.04);font-size:13.5px;line-height:1.3;transition:border-color .2s,background .2s,opacity .25s,box-shadow .25s;}
.oj-opt-key{flex:none;width:20px;height:20px;border-radius:6px;display:grid;place-items:center;font:700 10px/1 var(--oj-mono);
  border:1px solid rgba(214,228,255,.22);color:var(--oj-ink-2);transition:background .2s,color .2s,border-color .2s;}
.oj-opt:hover:not(:disabled){border-color:rgba(var(--oj-accent-rgb),.55);background:rgba(var(--oj-accent-rgb),.08);}
.oj-opt:disabled{cursor:default;}
.oj-opt.is-dim{opacity:.4;}
.oj-opt.is-right{border-color:var(--oj-good);background:rgba(61,255,168,.12);box-shadow:0 0 18px rgba(61,255,168,.18);}
.oj-opt.is-right .oj-opt-key{background:var(--oj-good);color:#03140b;border-color:transparent;}
.oj-opt.is-wrong{border-color:var(--oj-bad);background:rgba(255,77,109,.12);animation:oj-shake .35s ease;}
.oj-opt.is-wrong .oj-opt-key{background:var(--oj-bad);color:#1a0308;border-color:transparent;}
.oj-quiz-fb{display:none;align-items:center;gap:10px;margin-top:10px;}
.oj-quiz.is-answered .oj-quiz-fb{display:flex;animation:oj-rise .35s cubic-bezier(.2,.8,.2,1);}
.oj-quiz-fb p{margin:0;flex:1;min-width:0;font-size:12.5px;line-height:1.38;color:var(--oj-ink-2);}
.oj-quiz-fb p b{display:block;font:700 10px/1.2 var(--oj-mono);letter-spacing:.18em;text-transform:uppercase;margin-bottom:3px;}
.oj-quiz-fb.is-good b{color:var(--oj-good);} .oj-quiz-fb.is-bad b{color:var(--oj-bad);}
.oj-quiz-fb .oj-btn{flex:none;height:42px;}

@media (max-height:520px){
  .oj-card,.oj-quiz-card{padding:9px 12px;}
  .oj-card-text{font-size:13px;min-height:0;margin-top:6px;}
  .oj-readout{margin-top:6px;} .oj-ctrl-row{margin-top:7px;}
  .oj-act,.oj-draghint{height:42px;} .oj-btn{height:40px;}
  .oj-quiz-prompt{font-size:14px;margin:6px 0 8px;} .oj-opt{min-height:36px;padding:6px 10px;}
}

@keyframes oj-rise{from{opacity:0;transform:translateY(6px);}to{opacity:1;transform:none;}}
@keyframes oj-pulse{0%,100%{box-shadow:0 0 14px rgba(var(--oj-accent-rgb),.25),inset 0 1px 0 rgba(255,255,255,.14);}
  50%{box-shadow:0 0 34px rgba(var(--oj-accent-rgb),.6),inset 0 1px 0 rgba(255,255,255,.2);}}
@keyframes oj-breathe{0%,100%{transform:scale(1);}50%{transform:scale(1.18);}}
@keyframes oj-flash{0%{opacity:1;}100%{opacity:0;}}
@keyframes oj-pop{0%{transform:scale(1.35);}100%{transform:scale(1);}}
@keyframes oj-sway{0%,100%{transform:translateX(-3px);}50%{transform:translateX(3px);}}
@keyframes oj-shake{0%,100%{transform:none;}25%{transform:translateX(-4px);}75%{transform:translateX(4px);}}
@media (prefers-reduced-motion:reduce){
  .oj-hud *,.oj-quiz *{animation:none!important;transition-duration:.01s!important;}
}
`;

export function ensureUiStyles(): void {
  if (typeof document === 'undefined' || document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = CSS;
  document.head.appendChild(style);
}