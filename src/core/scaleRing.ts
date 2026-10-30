let trackFill: HTMLElement | null = null;
let labelEl: HTMLElement | null = null;

export function mountScaleRing(container: HTMLElement): void {
  const ring = document.createElement('div');
  ring.className = 'scale-ring';
  ring.innerHTML = `
    <div class="scale-ring__track">
      <div class="scale-ring__fill"></div>
    </div>
    <div class="scale-ring__label">Scale</div>
  `;
  container.appendChild(ring);
  
  trackFill = ring.querySelector('.scale-ring__fill');
  labelEl = ring.querySelector('.scale-ring__label');
}

export function setScale(label: string, t: number): void {
  const clamped = Math.max(0, Math.min(1, t));
  
  if (trackFill) {
    trackFill.style.height = `${clamped * 100}%`;
  }
  
  if (labelEl) {
    labelEl.textContent = label;
  }
}