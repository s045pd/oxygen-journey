/**
 * Oxygen Journey — Check quiz overlay.
 * One question at a time, instant feedback with a short explanation.
 * Keys: 1–3 / A–C choose, Enter or Space continues.
 */
import type { QuizQuestion } from '../types';
import { COPY } from '../content/levels';
import { sfx } from '../audio/sfx';
import { ensureUiStyles } from './uiStyles';

export type QuizDone = (correct: number, total: number) => void;

const ARROW = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg>';
const KEYS = ['A', 'B', 'C', 'D', 'E'];

function h<K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', parent?: Element): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  parent?.appendChild(e);
  return e;
}

export class QuizOverlay {
  readonly root: HTMLDivElement;
  private readonly countEl: HTMLSpanElement;
  private readonly promptEl: HTMLParagraphElement;
  private readonly optionsEl: HTMLDivElement;
  private readonly fb: HTMLDivElement;
  private readonly fbVerdict: HTMLElement;
  private readonly fbText: HTMLSpanElement;
  private readonly nextBtn: HTMLButtonElement;
  private readonly nextLabel: HTMLSpanElement;

  private questions: readonly QuizQuestion[] = [];
  private optionBtns: HTMLButtonElement[] = [];
  private index = 0;
  private correct = 0;
  private answered = false;
  private openState = false;
  private onDone: QuizDone | null = null;

  constructor(parent: HTMLElement) {
    ensureUiStyles();
    const root = h('div', 'oj-quiz', parent);
    root.setAttribute('role', 'dialog');
    root.setAttribute('aria-modal', 'true');
    root.setAttribute('aria-label', COPY.quizKicker);
    this.root = root;

    const card = h('div', 'oj-quiz-card', root);
    const head = h('div', 'oj-quiz-head', card);
    const kicker = h('span', 'oj-card-kicker', head);
    kicker.textContent = COPY.quizKicker;
    this.countEl = h('span', 'oj-quiz-count', head);

    this.promptEl = h('p', 'oj-quiz-prompt', card);
    this.promptEl.setAttribute('aria-live', 'polite');
    this.optionsEl = h('div', 'oj-quiz-options', card);

    this.fb = h('div', 'oj-quiz-fb', card);
    const p = h('p', '', this.fb);
    p.setAttribute('aria-live', 'polite');
    this.fbVerdict = h('b', '', p);
    this.fbText = h('span', '', p);
    this.nextBtn = h('button', 'oj-btn primary', this.fb);
    this.nextBtn.type = 'button';
    this.nextLabel = h('span', '', this.nextBtn);
    this.nextBtn.insertAdjacentHTML('beforeend', ARROW);
    this.nextBtn.addEventListener('click', () => this.advance());

    // Block stage interactions behind the overlay.
    root.addEventListener('pointerdown', (e) => e.stopPropagation());
  }

  get isOpen(): boolean {
    return this.openState;
  }

  open(questions: readonly QuizQuestion[], onDone: QuizDone): void {
    this.questions = questions;
    this.onDone = onDone;
    this.index = 0;
    this.correct = 0;
    if (!questions.length) {
      onDone(0, 0);
      return;
    }
    this.render();
    if (!this.openState) {
      this.openState = true;
      this.root.classList.add('is-open');
      window.addEventListener('keydown', this.onKey, true);
    }
  }

  close(): void {
    if (!this.openState) return;
    this.openState = false;
    this.onDone = null;
    this.root.classList.remove('is-open', 'is-answered');
    window.removeEventListener('keydown', this.onKey, true);
  }

  private render(): void {
    const q = this.questions[this.index];
    this.answered = false;
    this.root.classList.remove('is-answered');
    this.fb.classList.remove('is-good', 'is-bad');
    this.countEl.textContent = `${this.index + 1} / ${this.questions.length}`;
    this.promptEl.textContent = q.prompt;
    this.promptEl.classList.remove('is-swap');
    void this.promptEl.offsetWidth;
    this.promptEl.classList.add('is-swap');

    this.optionsEl.replaceChildren();
    this.optionBtns = q.options.map((opt, i) => {
      const b = h('button', 'oj-opt', this.optionsEl);
      b.type = 'button';
      const key = h('span', 'oj-opt-key', b);
      key.textContent = KEYS[i] ?? String(i + 1);
      const t = h('span', '', b);
      t.textContent = opt;
      b.addEventListener('click', () => this.choose(i));
      return b;
    });
  }

  private choose(i: number): void {
    if (this.answered || !this.openState) return;
    const q = this.questions[this.index];
    if (i < 0 || i >= q.options.length) return;
    this.answered = true;
    const right = i === q.correctIndex;
    if (right) this.correct++;

    this.optionBtns.forEach((b, k) => {
      b.disabled = true;
      if (k === q.correctIndex) b.classList.add('is-right');
      else if (k === i) b.classList.add('is-wrong');
      else b.classList.add('is-dim');
    });

    this.fbVerdict.textContent = right ? COPY.correct : COPY.notQuite;
    this.fbText.textContent = q.explain;
    this.fb.classList.toggle('is-good', right);
    this.fb.classList.toggle('is-bad', !right);
    const last = this.index >= this.questions.length - 1;
    this.nextLabel.textContent = last ? COPY.quizFinish : COPY.quizNext;
    this.root.classList.add('is-answered');
    if (right) sfx.success();
    else sfx.fail();
    try {
      this.nextBtn.focus({ preventScroll: true });
    } catch {
      /* ignore */
    }
  }

  private advance(): void {
    if (!this.answered || !this.openState) return;
    this.index++;
    if (this.index >= this.questions.length) {
      const done = this.onDone;
      const correct = this.correct;
      const total = this.questions.length;
      this.close();
      done?.(correct, total);
      return;
    }
    sfx.tap(1.2);
    this.render();
  }

  private readonly onKey = (e: KeyboardEvent): void => {
    if (!this.openState || e.ctrlKey || e.metaKey || e.altKey) return;
    const k = e.key.toLowerCase();
    const isSpace = e.code === 'Space' || e.key === ' ';
    if ((k === 'enter' || isSpace) && this.answered) {
      e.preventDefault();
      e.stopPropagation();
      if (!e.repeat) this.advance();
      return;
    }
    if (isSpace) {
      e.preventDefault();
      e.stopPropagation();
      return;
    }
    let idx = -1;
    if (/^[1-5]$/.test(k)) idx = Number(k) - 1;
    else if (/^[a-e]$/.test(k)) idx = k.charCodeAt(0) - 97;
    if (idx >= 0 && !this.answered) {
      e.preventDefault();
      e.stopPropagation();
      this.choose(idx);
      return;
    }
    // Swallow stage navigation keys while the quiz is up.
    if (k === 'arrowleft' || k === 'arrowright') e.stopPropagation();
  };

  dispose(): void {
    this.close();
    this.root.remove();
  }
}