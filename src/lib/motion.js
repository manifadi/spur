import { useEffect, useRef, useState } from 'react';

export function prefersReducedMotion() {
  try { return matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { return false; }
}

/** Zahl zählt mit easeOutCubic hoch (1-(1-p)^3). Bei "Bewegung reduzieren" sofort der Endwert. */
export function useCountUp(to, { from = 0, delay = 0, duration = 900, run = true } = {}) {
  const [value, setValue] = useState(run && !prefersReducedMotion() ? from : to);
  const raf = useRef(0);
  useEffect(() => {
    if (!run || prefersReducedMotion()) { setValue(to); return undefined; }
    setValue(from);
    const t = setTimeout(() => {
      const t0 = performance.now();
      const tick = (now) => {
        const p = Math.min(1, (now - t0) / duration);
        setValue(Math.round(from + (to - from) * (1 - Math.pow(1 - p, 3))));
        if (p < 1) raf.current = requestAnimationFrame(tick);
      };
      raf.current = requestAnimationFrame(tick);
    }, delay);
    return () => { clearTimeout(t); cancelAnimationFrame(raf.current); };
  }, [to, from, delay, duration, run]);
  return value;
}

/** Animationsstil mit fill-mode both. */
export const anim = (name, ms, delay = 0, ease = 'cubic-bezier(.22,.8,.3,1)', extra = '') =>
  ({ animation: `${name} ${ms}ms ${ease} ${delay}ms ${extra} both` });

export const EASE = {
  soft: 'cubic-bezier(.22,.8,.3,1)',
  bounce: 'cubic-bezier(.34,1.56,.64,1)',
  sine: 'cubic-bezier(.37,0,.63,1)',
  jump: 'cubic-bezier(.34,1.3,.64,1)',
};
