type BurstIntensity = 'soft' | 'medium' | 'strong';

interface CelebrationBurstOptions {
  x?: number;
  y?: number;
  reducedMotion?: boolean;
  intensity?: BurstIntensity;
}

const COLORS = [
  'var(--color-neon-cyan)',
  'var(--color-neon-mint)',
  'var(--color-neon-amber)',
  'var(--color-neon-rose)',
];
const MARKERS = ['*', '+', '^', '~', 'o', '>'];

const resolveCount = (intensity: BurstIntensity): number => {
  if (intensity === 'strong') return 24;
  if (intensity === 'medium') return 16;
  return 10;
};

const random = (min: number, max: number): number => Math.random() * (max - min) + min;

export const playCelebrationBurst = (options: CelebrationBurstOptions = {}): void => {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;
  if (options.reducedMotion) return;

  const intensity = options.intensity || 'soft';
  const count = resolveCount(intensity);
  const startX = options.x ?? window.innerWidth * 0.5;
  const startY = options.y ?? window.innerHeight * 0.68;

  const layer = document.createElement('div');
  layer.style.position = 'fixed';
  layer.style.left = '0';
  layer.style.top = '0';
  layer.style.width = '100%';
  layer.style.height = '100%';
  layer.style.pointerEvents = 'none';
  layer.style.overflow = 'hidden';
  layer.style.zIndex = '140';
  document.body.appendChild(layer);

  for (let i = 0; i < count; i += 1) {
    const node = document.createElement('span');
    const isMarker = i % 4 === 0;
    const size = isMarker ? random(14, 20) : random(5, 10);
    const dx = random(-120, 120);
    const dy = random(-200, -80);
    const rotate = random(-180, 220);
    const duration = random(680, 1100);

    node.style.position = 'absolute';
    node.style.left = `${startX}px`;
    node.style.top = `${startY}px`;
    node.style.opacity = '1';
    node.style.transform = 'translate(-50%, -50%)';
    node.style.willChange = 'transform, opacity';

    if (isMarker) {
      node.textContent = MARKERS[i % MARKERS.length];
      node.style.fontSize = `${size}px`;
      node.style.filter = 'drop-shadow(0 6px 12px var(--color-overlay-backdrop-soft))';
    } else {
      node.style.width = `${size}px`;
      node.style.height = `${size}px`;
      node.style.borderRadius = '999px';
      node.style.background = COLORS[i % COLORS.length];
      node.style.boxShadow = '0 6px 14px var(--color-overlay-backdrop-soft)';
    }

    layer.appendChild(node);

    node.animate(
      [
        { transform: 'translate(-50%, -50%) scale(1)', opacity: 1 },
        {
          transform: `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px)) rotate(${rotate}deg) scale(1)`,
          opacity: 1,
          offset: 0.7,
        },
        {
          transform: `translate(calc(-50% + ${dx * 1.1}px), calc(-50% + ${dy * 0.2}px)) rotate(${rotate * 1.2}deg) scale(0.8)`,
          opacity: 0,
        },
      ],
      {
        duration,
        easing: 'cubic-bezier(0.2, 0.9, 0.3, 1)',
        fill: 'forwards',
      }
    );
  }

  window.setTimeout(() => {
    if (layer.parentNode) {
      layer.parentNode.removeChild(layer);
    }
  }, 1300);
};
