import * as THREE from 'three';
import { createRenderer, RendererContext } from './core/renderer';
import { createGlassTorso } from './core/body';
import { mountScaleRing, setScale } from './core/scaleRing';
import { HUD } from './ui/hud';
import { QuizOverlay } from './ui/quiz';
import { sfx } from './audio/sfx';
import { LEVELS, getLevelIndex } from './content/levels';
import { levelFactories } from './levels/index';
import { LevelScene } from './levels/base';
import type { LevelPhase, LevelDef } from './types';

export class App {
  private container: HTMLElement;
  private ctx!: RendererContext;
  private hud!: HUD;
  private quiz!: QuizOverlay;

  private currentLevelIndex = 0;
  private currentPhase: LevelPhase = 'tour';
  private currentLevel: LevelScene | null = null;
  private tourTimer = 0;
  private torso: THREE.Group | null = null;
  private placeholderMessage: HTMLElement | null = null;

  private isRunning = false;

  constructor() {
    this.container = document.getElementById('app')!;
  }

  start(): void {
    // Initialize renderer
    this.ctx = createRenderer(this.container);

    // Mount scale ring
    mountScaleRing(this.container);

    // Initialize HUD
    this.hud = new HUD(this.container);
    this.hud.showSplash();

    // Initialize Quiz
    this.quiz = new QuizOverlay(this.container);

    // Bind HUD callbacks
    this.hud.onStart = () => this.onStartJourney();
    this.hud.onCheck = () => this.onCheck();
    this.hud.onNext = () => this.goToLevel(this.currentLevelIndex + 1);
    this.hud.onPrev = () => this.goToLevel(this.currentLevelIndex - 1);
    this.hud.onHoldStart = () => this.currentLevel?.onHoldStart();
    this.hud.onHoldEnd = () => this.currentLevel?.onHoldEnd();
    this.hud.onTap = () => this.currentLevel?.onTap();
    this.hud.onSlider = (v) => this.currentLevel?.onSlider(v);
    this.hud.onExtraSlider = (v) => this.currentLevel?.onSlider(v);
    this.hud.onDrag = (dx, dy) => this.currentLevel?.onDrag(dx, dy);
    this.hud.onSkipTour = () => this.skipTour();

    // Start render loop (but paused until journey starts)
    this.animate();
  }

  private async onStartJourney(): Promise<void> {
    await sfx.resume();
    sfx.play('whoosh');
    
    this.hud.hideSplash();
    this.isRunning = true;
    
    this.goToLevel(0);
  }

  private goToLevel(index: number): void {
    if (index < 0 || index >= LEVELS.length) return;

    // Clean up current level
    if (this.currentLevel) {
      this.currentLevel.exit();
      this.currentLevel.dispose();
      this.currentLevel = null;
    }

    // Remove placeholder if exists
    if (this.placeholderMessage) {
      this.placeholderMessage.remove();
      this.placeholderMessage = null;
    }

    // Remove torso if exists
    if (this.torso) {
      this.ctx.scene.remove(this.torso);
      this.torso = null;
    }

    this.currentLevelIndex = index;
    const def = LEVELS[index];

    // Update HUD
    this.hud.setLevel(def, index);
    setScale(def.scaleLabel, (index + 1) / LEVELS.length);

    // Try to load level scene
    const factory = levelFactories[def.id];
    
    if (factory) {
      this.currentLevel = factory();
      this.currentLevel.enter(this.ctx.scene);
      
      // Sync aspect ratio from ctx camera to level camera
      const levelCam = this.currentLevel.getCamera();
      levelCam.aspect = this.ctx.camera.aspect;
      levelCam.updateProjectionMatrix();
    } else {
      // Show placeholder with torso
      this.showPlaceholder(def);
    }

    // Start tour phase
    this.startTourPhase(def);
    
    sfx.play('whoosh');
  }

  private showPlaceholder(def: LevelDef): void {
    // Add glass torso
    this.torso = createGlassTorso();
    this.ctx.scene.add(this.torso);

    // Add placeholder message
    this.placeholderMessage = document.createElement('div');
    this.placeholderMessage.className = 'placeholder-message';
    this.placeholderMessage.innerHTML = `
      <h2>${def.title}</h2>
      <p>Level scene coming soon</p>
    `;
    this.container.appendChild(this.placeholderMessage);
  }

  private startTourPhase(def: LevelDef): void {
    this.currentPhase = 'tour';
    this.tourTimer = 0;
    
    this.hud.setPhase('tour');
    this.hud.setTour(def.tourText);
  }

  private startHandsOnPhase(def: LevelDef): void {
    this.currentPhase = 'handsOn';
    
    this.hud.setPhase('handsOn');
    this.hud.setYourTurn(def.yourTurn);
    this.hud.setControl(def.controlKind, def.controlLabel, def.extraSlider);
  }

  private skipTour(): void {
    if (this.currentPhase === 'tour') {
      this.startHandsOnPhase(LEVELS[this.currentLevelIndex]);
    }
  }

  private onCheck(): void {
    const def = LEVELS[this.currentLevelIndex];
    
    this.quiz.open(def.quiz, (allCorrect) => {
      if (allCorrect) {
        sfx.play('success');
        // Could auto-advance or just let user navigate
      }
    });
  }

  private animate = (): void => {
    requestAnimationFrame(this.animate);

    const dt = this.ctx.clock.getDelta();

    if (this.isRunning) {
      // Update tour timer
      if (this.currentPhase === 'tour') {
        this.tourTimer += dt;
        if (this.tourTimer >= 4) {
          this.startHandsOnPhase(LEVELS[this.currentLevelIndex]);
        }
      }

      // Update current level
      if (this.currentLevel) {
        this.currentLevel.update(dt);
        this.hud.setReadout(this.currentLevel.getReadout());
      }

      // Rotate placeholder torso gently
      if (this.torso) {
        this.torso.rotation.y += dt * 0.2;
      }
    }

    // Render using level camera if available, otherwise ctx camera
    if (this.currentLevel) {
      const levelCam = this.currentLevel.getCamera();
      // Keep aspect in sync in case of resize
      levelCam.aspect = this.ctx.camera.aspect;
      levelCam.updateProjectionMatrix();
      this.ctx.renderer.render(this.ctx.scene, levelCam);
    } else {
      this.ctx.renderer.render(this.ctx.scene, this.ctx.camera);
    }
  };
}