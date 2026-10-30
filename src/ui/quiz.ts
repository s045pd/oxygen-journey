import type { QuizQuestion } from '../types';
import { sfx } from '../audio/sfx';

export class QuizOverlay {
  private container: HTMLElement;
  private overlay: HTMLElement;
  private modal: HTMLElement;
  private questions: QuizQuestion[] = [];
  private selectedAnswers: (number | null)[] = [];
  private onDoneCallback: (allCorrect: boolean) => void = () => {};
  private submitted = false;

  constructor(container: HTMLElement) {
    this.container = container;
    this.overlay = document.createElement('div');
    this.overlay.className = 'quiz-overlay';
    
    this.modal = document.createElement('div');
    this.modal.className = 'quiz-modal';
    this.overlay.appendChild(this.modal);
    
    this.container.appendChild(this.overlay);
  }

  open(questions: QuizQuestion[], onDone: (allCorrect: boolean) => void): void {
    this.questions = questions;
    this.selectedAnswers = questions.map(() => null);
    this.onDoneCallback = onDone;
    this.submitted = false;
    
    this.render();
    this.overlay.classList.add('visible');
  }

  close(): void {
    this.overlay.classList.remove('visible');
  }

  private render(): void {
    this.modal.innerHTML = `
      <div class="quiz__header">Check Your Understanding</div>
      ${this.questions.map((q, qi) => `
        <div class="quiz__question" data-question="${qi}">
          <p class="quiz__question-text">${qi + 1}. ${q.question}</p>
          <div class="quiz__options">
            ${q.options.map((opt, oi) => `
              <button 
                class="quiz__option ${this.selectedAnswers[qi] === oi ? 'selected' : ''}" 
                data-question="${qi}" 
                data-option="${oi}"
                ${this.submitted ? 'disabled' : ''}
              >
                ${opt}
              </button>
            `).join('')}
          </div>
        </div>
      `).join('')}
      <button class="quiz__submit" ${this.canSubmit() ? '' : 'disabled'}>
        ${this.submitted ? 'Continue' : 'Submit Answers'}
      </button>
      ${this.submitted ? this.renderResult() : ''}
    `;

    // Bind events
    this.modal.querySelectorAll('.quiz__option').forEach(btn => {
      btn.addEventListener('click', (e) => {
        if (this.submitted) return;
        
        const target = e.currentTarget as HTMLElement;
        const qi = parseInt(target.dataset.question!);
        const oi = parseInt(target.dataset.option!);
        
        this.selectedAnswers[qi] = oi;
        sfx.play('tap');
        this.render();
      });
    });

    const submitBtn = this.modal.querySelector('.quiz__submit') as HTMLButtonElement;
    submitBtn.addEventListener('click', () => {
      if (this.submitted) {
        this.close();
        this.onDoneCallback(this.isAllCorrect());
      } else {
        this.submit();
      }
    });
  }

  private canSubmit(): boolean {
    return this.selectedAnswers.every(a => a !== null);
  }

  private submit(): void {
    this.submitted = true;
    
    const allCorrect = this.isAllCorrect();
    if (allCorrect) {
      sfx.play('success');
    } else {
      sfx.play('fail');
    }
    
    this.render();
    this.showAnswerFeedback();
  }

  private isAllCorrect(): boolean {
    return this.questions.every((q, i) => this.selectedAnswers[i] === q.correctIndex);
  }

  private showAnswerFeedback(): void {
    this.modal.querySelectorAll('.quiz__option').forEach(btn => {
      const el = btn as HTMLElement;
      const qi = parseInt(el.dataset.question!);
      const oi = parseInt(el.dataset.option!);
      
      if (oi === this.questions[qi].correctIndex) {
        el.classList.add('correct');
      } else if (this.selectedAnswers[qi] === oi) {
        el.classList.add('incorrect');
      }
    });
  }

  private renderResult(): string {
    const correct = this.questions.filter((q, i) => this.selectedAnswers[i] === q.correctIndex).length;
    const total = this.questions.length;
    const allCorrect = correct === total;
    
    return `
      <div class="quiz__result ${allCorrect ? 'success' : 'fail'}">
        ${allCorrect 
          ? '✓ Excellent! You got all answers correct!' 
          : `You got ${correct}/${total} correct. Review the highlighted answers above.`
        }
      </div>
    `;
  }
}