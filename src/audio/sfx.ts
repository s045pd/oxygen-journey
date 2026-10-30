type SfxName = 'inhale' | 'exhale' | 'tap' | 'success' | 'fail' | 'whoosh';

class SFXManager {
  private ctx: AudioContext | null = null;
  private initialized = false;

  private getContext(): AudioContext {
    if (!this.ctx) {
      this.ctx = new AudioContext();
    }
    return this.ctx;
  }

  async resume(): Promise<void> {
    const ctx = this.getContext();
    if (ctx.state === 'suspended') {
      await ctx.resume();
    }
    this.initialized = true;
  }

  private createOscillator(
    frequency: number,
    type: OscillatorType,
    duration: number,
    gainStart: number,
    gainEnd: number,
    detune: number = 0
  ): void {
    if (!this.initialized) return;
    
    const ctx = this.getContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    
    osc.type = type;
    osc.frequency.value = frequency;
    osc.detune.value = detune;
    
    gain.gain.setValueAtTime(gainStart, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(
      Math.max(gainEnd, 0.001),
      ctx.currentTime + duration
    );
    
    osc.connect(gain);
    gain.connect(ctx.destination);
    
    osc.start();
    osc.stop(ctx.currentTime + duration);
  }

  private createNoise(duration: number, gainStart: number, gainEnd: number): void {
    if (!this.initialized) return;
    
    const ctx = this.getContext();
    const bufferSize = ctx.sampleRate * duration;
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    
    for (let i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1) * 0.5;
    }
    
    const noise = ctx.createBufferSource();
    noise.buffer = buffer;
    
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(gainStart, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(
      Math.max(gainEnd, 0.001),
      ctx.currentTime + duration
    );
    
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 800;
    
    noise.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);
    
    noise.start();
  }

  play(name: SfxName): void {
    switch (name) {
      case 'inhale':
        this.createNoise(1.2, 0.08, 0.01);
        this.createOscillator(120, 'sine', 1.0, 0.05, 0.001);
        break;
        
      case 'exhale':
        this.createNoise(1.0, 0.06, 0.01);
        this.createOscillator(80, 'sine', 0.8, 0.04, 0.001);
        break;
        
      case 'tap':
        this.createOscillator(600, 'sine', 0.1, 0.15, 0.001);
        this.createOscillator(300, 'triangle', 0.05, 0.1, 0.001);
        break;
        
      case 'success':
        this.createOscillator(523, 'sine', 0.15, 0.2, 0.01);
        setTimeout(() => {
          this.createOscillator(659, 'sine', 0.15, 0.2, 0.01);
        }, 100);
        setTimeout(() => {
          this.createOscillator(784, 'sine', 0.3, 0.2, 0.001);
        }, 200);
        break;
        
      case 'fail':
        this.createOscillator(200, 'sawtooth', 0.3, 0.15, 0.001, -10);
        this.createOscillator(150, 'sawtooth', 0.4, 0.1, 0.001, 10);
        break;
        
      case 'whoosh':
        this.createNoise(0.4, 0.1, 0.001);
        this.createOscillator(400, 'sine', 0.2, 0.05, 0.001);
        const ctx = this.getContext();
        if (ctx && this.initialized) {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = 'sine';
          osc.frequency.setValueAtTime(600, ctx.currentTime);
          osc.frequency.exponentialRampToValueAtTime(200, ctx.currentTime + 0.3);
          gain.gain.setValueAtTime(0.08, ctx.currentTime);
          gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);
          osc.connect(gain);
          gain.connect(ctx.destination);
          osc.start();
          osc.stop(ctx.currentTime + 0.3);
        }
        break;
    }
  }
}

export const sfx = new SFXManager();