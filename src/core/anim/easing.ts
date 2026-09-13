/*
 * Copyright (C) 2026 Stanislav Georgiev
 * https://github.com/slaviboy
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

/**
 * Easing shared by the prototype runtime and the Motion timeline.
 * An easing maps normalized time t ∈ [0,1] to progress (may overshoot for
 * "back" curves and springs).
 */

export type BezierPreset =
  | 'linear'
  | 'ease-in'
  | 'ease-out'
  | 'ease-in-and-out'
  | 'ease-in-back'
  | 'ease-out-back'
  | 'ease-in-and-out-back';

export type SpringPreset = 'gentle' | 'quick' | 'bouncy' | 'slow';

export type Easing =
  | { readonly type: 'bezier'; readonly x1: number; readonly y1: number; readonly x2: number; readonly y2: number }
  | { readonly type: 'spring'; readonly stiffness: number; readonly damping: number; readonly mass: number }
  | { readonly type: 'hold' };

/** Control points for the documented bezier presets (CSS-equivalent values). */
export const BEZIER_PRESETS: Record<BezierPreset, readonly [number, number, number, number]> = {
  linear: [0, 0, 1, 1],
  'ease-in': [0.42, 0, 1, 1],
  'ease-out': [0, 0, 0.58, 1],
  'ease-in-and-out': [0.42, 0, 0.58, 1],
  'ease-in-back': [0.3, -0.05, 0.7, -0.5],
  'ease-out-back': [0.45, 1.45, 0.8, 1],
  'ease-in-and-out-back': [0.7, -0.4, 0.4, 1.4],
};

export const SPRING_PRESETS: Record<SpringPreset, { stiffness: number; damping: number; mass: number }> = {
  gentle: { stiffness: 100, damping: 15, mass: 1 },
  quick: { stiffness: 300, damping: 20, mass: 1 },
  bouncy: { stiffness: 600, damping: 15, mass: 1 },
  slow: { stiffness: 80, damping: 20, mass: 1 },
};

export function bezierPreset(name: BezierPreset): Easing {
  const [x1, y1, x2, y2] = BEZIER_PRESETS[name];
  return { type: 'bezier', x1, y1, x2, y2 };
}

export function springPreset(name: SpringPreset): Easing {
  return { type: 'spring', ...SPRING_PRESETS[name] };
}

/** Solves a CSS cubic-bezier timing function for y at time x. */
export function cubicBezierAt(x1: number, y1: number, x2: number, y2: number, x: number): number {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  if (x1 === y1 && x2 === y2) return x;
  const cx = 3 * x1;
  const bx = 3 * (x2 - x1) - cx;
  const ax = 1 - cx - bx;
  const cy = 3 * y1;
  const by = 3 * (y2 - y1) - cy;
  const ay = 1 - cy - by;
  const sampleX = (t: number) => ((ax * t + bx) * t + cx) * t;
  const sampleY = (t: number) => ((ay * t + by) * t + cy) * t;
  const slopeX = (t: number) => (3 * ax * t + 2 * bx) * t + cx;

  // Newton–Raphson, then bisection fallback for flat slopes.
  let t = x;
  for (let i = 0; i < 8; i++) {
    const err = sampleX(t) - x;
    if (Math.abs(err) < 1e-7) return sampleY(t);
    const d = slopeX(t);
    if (Math.abs(d) < 1e-6) break;
    t -= err / d;
  }
  let lo = 0;
  let hi = 1;
  t = x;
  for (let i = 0; i < 60; i++) {
    const v = sampleX(t);
    if (Math.abs(v - x) < 1e-7) break;
    if (v < x) lo = t;
    else hi = t;
    t = (lo + hi) / 2;
  }
  return sampleY(t);
}

/**
 * Damped harmonic oscillator from 0 → 1 with zero initial velocity.
 * Returns position at `seconds`.
 */
export function springPosition(stiffness: number, damping: number, mass: number, seconds: number): number {
  const w0 = Math.sqrt(stiffness / mass);
  const zeta = damping / (2 * Math.sqrt(stiffness * mass));
  const t = seconds;
  if (zeta < 1) {
    const wd = w0 * Math.sqrt(1 - zeta * zeta);
    return 1 - Math.exp(-zeta * w0 * t) * (Math.cos(wd * t) + ((zeta * w0) / wd) * Math.sin(wd * t));
  }
  if (zeta === 1) {
    return 1 - Math.exp(-w0 * t) * (1 + w0 * t);
  }
  const s = w0 * Math.sqrt(zeta * zeta - 1);
  const r1 = -zeta * w0 + s;
  const r2 = -zeta * w0 - s;
  return 1 - (r2 * Math.exp(r1 * t) - r1 * Math.exp(r2 * t)) / (r2 - r1);
}

/**
 * Time (ms) until the spring settles within `epsilon` of the target and stays
 * there. Springs derive their duration from physics, as in the docs.
 */
export function springDurationMs(stiffness: number, damping: number, mass: number, epsilon = 0.001): number {
  const step = 1 / 240;
  let lastUnsettled = 0;
  for (let t = 0; t < 30; t += step) {
    if (Math.abs(1 - springPosition(stiffness, damping, mass, t)) > epsilon) lastUnsettled = t;
    else if (t - lastUnsettled > 0.25) break;
  }
  return Math.round((lastUnsettled + step) * 1000);
}

/** Evaluates any easing at normalized time t ∈ [0,1]. */
export function evaluateEasing(easing: Easing, t: number): number {
  switch (easing.type) {
    case 'hold':
      return t >= 1 ? 1 : 0;
    case 'bezier':
      return cubicBezierAt(easing.x1, easing.y1, easing.x2, easing.y2, t);
    case 'spring': {
      if (t <= 0) return 0;
      if (t >= 1) return 1;
      const durationS = springDurationMs(easing.stiffness, easing.damping, easing.mass) / 1000;
      return springPosition(easing.stiffness, easing.damping, easing.mass, t * durationS);
    }
  }
}
