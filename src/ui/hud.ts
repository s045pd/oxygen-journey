import type { LevelDef, LevelPhase, ControlKind, ExtraSlider } from '../types';
import { LEVELS } from '../content/levels';

export class HUD {
  private container: HTMLElement;
  
  // Elements
  private splash!: HTMLElement;
  private splashStartBtn!: HTMLButtonElement;
  private topLeft!: HTMLElement;
  private romanEl!: HTMLElement;
  private titleEl!: HTMLElement;
  private scaleLabelEl!: HTMLElement;
  private tourOverlay!: HTMLElement;
  private tourTextEl!: HTMLElement;
  private bottomLeft!: HTMLElement;
  private yourTurnEl!: HTMLElement;
  private yourTurnTextEl!: HTMLElement;
  private checkBtn!: HTMLButtonElement;
  private bottomRight!: HTMLElement;
  private readoutEl!: HTMLElement;
  private controlHintEl!: HTMLElement;
  private sliderEl!: HTMLInputElement;
  private sliderLabelEl!: HTMLElement;
  private extraSliderContainer!: HTMLElement;
  private extraSliderEl!: HTMLInputElement;
  private extraSliderLabelEl!: HTMLElement;
  private holdBtn!: HTMLButtonElement;
  private prevBtn!: HTMLButtonElement;
  private nextBtn!: HTMLButtonElement;
  private progressDots!: HTMLElement;

  // Callbacks
  public onStart: () => void = () => {};
  public onCheck: () => void = () => {};
  public onNext: () => void = () => {};
  public onPrev: () => void = () => {};
  public onHoldStart: () => void = () => {};
  public onHoldEnd: () => void = () => {};
  public onTap: () => void = () => {};
  public onSlider: (v: number) => void = () => {};
  public onExtraSlider: (v: number) => void = () => {};
  public onDrag: (dx: number, dy: number) => void = () => {};
  public onSkipTour: () => void = () => {};

  private isDragging = false;
  private lastDragX = 0;
  private lastDragY = 0;
  private currentControlKind: ControlKind = 'tap';
  private isInTour = false;

  constructor(container: HTMLElement) {
    this.container = container;
    this.createDOM();
    this.bindEvents();
  }

  private createDOM(): void {
    // Splash screen
    this.splash = document.createElement('div');
    this.splash.className = 'splash';
    this.splash.innerHTML = `
      <h1 class="splash__title">Oxygen Journey</h1>
      <p class="splash__subtitle">Follow oxygen from breath to cell in this interactive exploration of respiration and circulation</p>
      <button class="splash__start">Begin Journey</button>
    `;
    this.container.appendChild(this.splash);
    this.splashStartBtn = this.splash.querySelector('.splash__start')!;

    // HUD Top Left
    this.topLeft = document.createElement('div');
    this.topLeft.className = 'hud-top-left';
    this.topLeft.innerHTML = `
      <div class="hud__roman">I</div>
      <h2 class="hud__title">Breathe In</h2>
      <span class="hud__scale-label">You → Lungs</span>
    `;
    this.container.appendChild(this.topLeft);
    this.romanEl = this.topLeft.querySelector('.hud__roman')!;
    this.titleEl = this.topLeft.querySelector('.hud__title')!;
    this.scaleLabelEl = this.topLeft.querySelector('.hud__scale-label')!;

    // Tour overlay
    this.tourOverlay = document.createElement('div');
    this.tourOverlay.className = 'tour-overlay';
    this.tourOverlay.innerHTML = `
      <p class="tour-overlay__text"></p>
      <span class="tour-overlay__hint">Click or press SPACE to skip</span>
    `;
    this.container.appendChild(this.tourOverlay);
    this.tourTextEl = this.tourOverlay.querySelector('.tour-overlay__text')!;

    // HUD Bottom Left
    this.bottomLeft = document.createElement('div');
    this.bottomLeft.className = 'hud-bottom-left';
    this.bottomLeft.innerHTML = `
      <div class="hud__your-turn">
        <div class="hud__your-turn-label">Your Turn</div>
        <p class="hud__your-turn-text"></p>
      </div>
      <button class="hud__check-btn">Check Understanding</button>
    `;
    this.container.appendChild(this.bottomLeft);
    this.yourTurnEl = this.bottomLeft.querySelector('.hud__your-turn')!;
    this.yourTurnTextEl = this.bottomLeft.querySelector('.hud__your-turn-text')!;
    this.checkBtn = this.bottomLeft.querySelector('.hud__check-btn')!;

    // HUD Bottom Right
    this.bottomRight = document.createElement('div');
    this.bottomRight.className = 'hud-bottom-right';
    this.bottomRight.innerHTML = `
      <div class="hud__readout">—</div>
      <div class="hud__controls">
        <span class="hud__control-hint"><kbd>SPACE</kbd> Tap to interact</span>
        <button class="hud__hold-btn">HOLD</button>
        <div class="hud__slider-container">
          <label class="hud__slider-label"></label>
          <input type="range" class="hud__slider" min="0" max="100" value="50">
        </div>
        <div class="hud__extra-slider-container">
          <label class="hud__extra-slider-label"></label>
          <input type="range" class="hud__extra-slider" min="0" max="100" value="50">
        </div>
      </div>
      <div class="hud__nav">
        <button class="hud__nav-btn" data-dir="prev">←</button>
        <button class="hud__nav-btn" data-dir="next">→</button>
      </div>
    `;
    this.container.appendChild(this.bottomRight);
    this.readoutEl = this.bottomRight.querySelector('.hud__readout')!;
    this.controlHintEl = this.bottomRight.querySelector('.hud__control-hint')!;
    this.holdBtn = this.bottomRight.querySelector('.hud__hold-btn')!;
    this.sliderEl = this.bottomRight.querySelector('.hud__slider')!;
    this.sliderLabelEl = this.bottomRight.querySelector('.hud__slider-label')!;
    this.extraSliderContainer = this.bottomRight.querySelector('.hud__extra-slider-container')!;
    this.extraSliderEl = this.bottomRight.querySelector('.hud__extra-slider')!;
    this.extraSliderLabelEl = this.bottomRight.querySelector('.hud__extra-slider-label')!;
    this.prevBtn = this.bottomRight.querySelector('[data-dir="prev"]')!;
    this.nextBtn = this.bottomRight.querySelector('[data-dir="next"]')!;

    // Initially hide sliders and hold button
    (this.bottomRight.querySelector('.hud__slider-container') as HTMLElement).style.display = 'none';
    this.extraSliderContainer.style.display = 'none';
    this.holdBtn.style.display = 'none';

    // Progress dots
    this.progressDots = document.createElement('div');
    this.progressDots.className = 'progress-dots';
    LEVELS.forEach((_, i) => {
      const dot = document.createElement('div');
      dot.className = 'progress-dot';
      dot.dataset.index = String(i);
      this.progressDots.appendChild(dot);
    });
    this.container.appendChild(this.progressDots);
  }

  private bindEvents(): void {
    // Start button
    this.splashStartBtn.addEventListener('click', () => this.onStart());

    // Check button
    this.checkBtn.addEventListener('click', () => this.onCheck());

    // Navigation
    this.prevBtn.addEventListener('click', () => this.onPrev());
    this.nextBtn.addEventListener('click', () => this.onNext());

    // Main Slider
    this.sliderEl.addEventListener('input', () => {
      this.onSlider(parseFloat(this.sliderEl.value) / 100);
    });

    // Extra Slider
    this.extraSliderEl.addEventListener('input', () => {
      this.onExtraSlider(parseFloat(this.extraSliderEl.value) / 100);
    });

    // Hold button (for touch/mouse)
    this.holdBtn.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      this.onHoldStart();
    });
    this.holdBtn.addEventListener('pointerup', () => {
      this.onHoldEnd();
    });
    this.holdBtn.addEventListener('pointerleave', () => {
      this.onHoldEnd();
    });

    // Tour overlay click to skip
    this.tourOverlay.addEventListener('click', (e) => {
      e.stopPropagation();
      if (this.isInTour) {
        this.onSkipTour();
      }
    });

    // Keyboard
    document.addEventListener('keydown', (e) => {
      if (e.code === 'Space' && !e.repeat) {
        e.preventDefault();
        // If in tour, skip to hands-on
        if (this.isInTour) {
          this.onSkipTour();
          return;
        }
        if (this.currentControlKind === 'hold') {
          this.onHoldStart();
        } else if (this.currentControlKind === 'tap') {
          this.onTap();
        }
      }
      if (e.code === 'ArrowLeft') this.onPrev();
      if (e.code === 'ArrowRight') this.onNext();
    });

    document.addEventListener('keyup', (e) => {
      if (e.code === 'Space') {
        e.preventDefault();
        if (this.currentControlKind === 'hold' && !this.isInTour) {
          this.onHoldEnd();
        }
      }
    });

    // Drag controls - on document for full area
    const onPointerDown = (e: PointerEvent) => {
      // Ignore if clicking on UI elements
      if ((e.target as HTMLElement).closest('.hud-bottom-right, .hud-bottom-left, .hud-top-left, .tour-overlay, .splash, .quiz-overlay')) {
        return;
      }
      if (this.currentControlKind === 'drag') {
        this.isDragging = true;
        this.lastDragX = e.clientX;
        this.lastDragY = e.clientY;
      }
    };

    const onPointerMove = (e: PointerEvent) => {
      if (this.isDragging && this.currentControlKind === 'drag') {
        const dx = e.clientX - this.lastDragX;
        const dy = e.clientY - this.lastDragY;
        this.lastDragX = e.clientX;
        this.lastDragY = e.clientY;
        this.onDrag(dx, dy);
      }
    };

    const onPointerUp = () => {
      this.isDragging = false;
    };

    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('pointermove', onPointerMove);
    document.addEventListener('pointerup', onPointerUp);

    // Touch hold for mobile
    let touchHoldActive = false;
    
    document.addEventListener('touchstart', (e) => {
      // Skip if touching UI elements
      if ((e.target as HTMLElement).closest('.hud-bottom-right, .hud-bottom-left, .hud-top-left, .tour-overlay, .splash, .quiz-overlay')) {
        return;
      }
      if (this.isInTour) {
        this.onSkipTour();
        return;
      }
      if (this.currentControlKind === 'hold') {
        touchHoldActive = true;
        this.onHoldStart();
      }
    }, { passive: true });

    document.addEventListener('touchend', () => {
      if (touchHoldActive && this.currentControlKind === 'hold') {
        touchHoldActive = false;
        this.onHoldEnd();
      }
    });
  }

  setLevel(def: LevelDef, index: number): void {
    this.romanEl.textContent = def.roman;
    this.titleEl.textContent = def.title;
    this.scaleLabelEl.textContent = def.scaleLabel;
    
    // Update progress dots
    this.progressDots.querySelectorAll('.progress-dot').forEach((dot, i) => {
      dot.classList.toggle('active', i === index);
      dot.classList.toggle('completed', i < index);
    });

    // Update nav buttons
    this.prevBtn.disabled = index === 0;
    this.nextBtn.disabled = index === LEVELS.length - 1;
  }

  setPhase(phase: LevelPhase): void {
    const isTour = phase === 'tour';
    const isHandsOn = phase === 'handsOn';
    const isCheck = phase === 'check';

    this.isInTour = isTour;
    this.tourOverlay.classList.toggle('visible', isTour);
    this.yourTurnEl.classList.toggle('visible', isHandsOn || isCheck);
    this.checkBtn.classList.toggle('visible', isHandsOn);
  }

  setTour(text: string): void {
    this.tourTextEl.textContent = text;
  }

  setYourTurn(text: string): void {
    this.yourTurnTextEl.textContent = text;
  }

  setReadout(html: string): void {
    this.readoutEl.innerHTML = html;
  }

  setControl(kind: ControlKind, label: string, extraSlider?: ExtraSlider): void {
    this.currentControlKind = kind;
    
    const sliderContainer = this.bottomRight.querySelector('.hud__slider-container') as HTMLElement;
    const isSlider = kind === 'slider';
    const isHold = kind === 'hold';
    const isDrag = kind === 'drag';
    const isTap = kind === 'tap';
    
    // Show/hide main slider
    sliderContainer.style.display = isSlider ? 'flex' : 'none';
    if (isSlider) {
      this.sliderLabelEl.textContent = label;
    }
    
    // Show/hide hold button
    this.holdBtn.style.display = isHold ? 'inline-block' : 'none';
    
    // Show/hide extra slider (for dual control levels like swap/burn)
    if (extraSlider) {
      this.extraSliderContainer.style.display = 'flex';
      this.extraSliderLabelEl.textContent = extraSlider.label;
      this.extraSliderEl.value = String((extraSlider.initial ?? 0.5) * 100);
      // Trigger initial value
      this.onExtraSlider(extraSlider.initial ?? 0.5);
    } else {
      this.extraSliderContainer.style.display = 'none';
    }
    
    // Build control hint
    let keyHint = '';
    switch (kind) {
      case 'hold':
        keyHint = '<kbd>SPACE</kbd> ';
        break;
      case 'tap':
        keyHint = '<kbd>SPACE</kbd> ';
        break;
      case 'drag':
        keyHint = '<kbd>DRAG</kbd> ';
        break;
      case 'slider':
        keyHint = '';
        break;
    }
    
    this.controlHintEl.innerHTML = keyHint + label;
  }

  showSplash(): void {
    this.splash.classList.remove('hidden');
    this.topLeft.style.display = 'none';
    this.bottomLeft.style.display = 'none';
    this.bottomRight.style.display = 'none';
    this.progressDots.style.display = 'none';
  }

  hideSplash(): void {
    this.splash.classList.add('hidden');
    this.topLeft.style.display = 'block';
    this.bottomLeft.style.display = 'flex';
    this.bottomRight.style.display = 'flex';
    this.progressDots.style.display = 'flex';
  }
}