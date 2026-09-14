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

import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import { evaluateEasing } from '@/core/anim/easing';
import { clampHandle, curveRange, easingCurve } from '@/core/anim/easing-curve';
import { toEasing } from '@/core/prototype/reactions';
import type { PrototypeEasing } from '@/core/schema/document';
import styles from './EasingGraph.module.css';

/** The graph's drawing size and the room around it (in its own units). */
const SIZE = 120;
const PAD = 12;
/** The pause between runs of the preview. */
const PREVIEW_PAUSE_MS = 400;
const NUDGES: Readonly<Record<string, readonly [number, number]>> = { ArrowLeft: [-0.01, 0], ArrowRight: [0.01, 0], ArrowUp: [0, 0.01], ArrowDown: [0, -0.01] };

type Handle = 1 | 2;

const withHandle = (easing: PrototypeEasing, handle: Handle, point: { readonly x: number; readonly y: number }): PrototypeEasing =>
  easing.type !== 'CUSTOM_CUBIC_BEZIER' ? easing : handle === 1 ? { ...easing, x1: point.x, y1: point.y } : { ...easing, x2: point.x, y2: point.y };

type SpringEasing = Extract<PrototypeEasing, { type: 'CUSTOM_SPRING' }>;

/**
 * A custom spring dragged on its graph: across changes its stiffness (doubling every half graph width) and up or down its
 * damping (less damping bounces higher), within the ranges of their fields.
 */
const draggedSpring = (spring: SpringEasing, dx: number, dy: number): SpringEasing => ({
  ...spring,
  stiffness: Math.round(Math.min(10_000, Math.max(1, spring.stiffness * 2 ** (dx * 2)))),
  damping: Math.round(Math.min(1000, Math.max(0, spring.damping - dy * 40))),
});

/**
 * An animation's easing as a graph — time across, the animation up — with a preview that plays while the pointer is over
 * it. A custom Bézier's handles are dragged on the graph (or moved with the arrow keys), and clicking a keyframe puts its
 * handle back on it.
 */
export function EasingGraph({ easing, durationMs, suffix, onChange }: { easing: PrototypeEasing; durationMs: number; suffix: string; onChange: (easing: PrototypeEasing) => void }) {
  // While a handle is dragged, the graph follows it; the change is made when it's let go.
  const [draft, setDraft] = useState<PrototypeEasing | null>(null);
  const [playing, setPlaying] = useState(false);
  const svg = useRef<SVGSVGElement>(null);
  const dot = useRef<HTMLSpanElement>(null);
  const springDrag = useRef<{ x: number; y: number; spring: SpringEasing } | null>(null);
  const shown = draft ?? easing;
  const points = easingCurve(toEasing(shown));
  const range = curveRange(points);
  const bezier = shown.type === 'CUSTOM_CUBIC_BEZIER' ? shown : null;
  const spring = shown.type === 'CUSTOM_SPRING' ? shown : null;
  const min = bezier ? Math.min(range.min, bezier.y1, bezier.y2) : range.min;
  const max = bezier ? Math.max(range.max, bezier.y1, bezier.y2) : range.max;
  const x = (t: number) => PAD + t * SIZE;
  const y = (value: number) => PAD + ((max - value) / (max - min)) * SIZE;

  useEffect(() => {
    if (!playing) return;
    const curve = toEasing(easing);
    const duration = Math.max(1, durationMs);
    const start = performance.now();
    let frame = 0;
    const tick = (now: number) => {
      const t = Math.min(1, ((now - start) % (duration + PREVIEW_PAUSE_MS)) / duration);
      if (dot.current) dot.current.style.left = `${evaluateEasing(curve, t) * 100}%`;
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [playing, easing, durationMs]);

  /** A pointer's place in the graph, as a handle there. */
  const pointAt = (e: PointerEvent) => {
    const rect = svg.current!.getBoundingClientRect();
    const scale = (SIZE + PAD * 2) / rect.width;
    const px = (e.clientX - rect.left) * scale;
    const py = (e.clientY - rect.top) * scale;
    return clampHandle((px - PAD) / SIZE, max - ((py - PAD) / SIZE) * (max - min));
  };
  const nudge = (handle: Handle) => (e: KeyboardEvent) => {
    const step = NUDGES[e.key];
    if (!step || !bezier) return;
    e.preventDefault();
    e.stopPropagation();
    const [hx, hy] = handle === 1 ? [bezier.x1, bezier.y1] : [bezier.x2, bezier.y2];
    onChange(withHandle(bezier, handle, clampHandle(hx + step[0], hy + step[1])));
  };
  /** The pointer's movement since the drag began, in graph widths (up is positive). */
  const dragDelta = (e: PointerEvent, from: { x: number; y: number }) => {
    const width = svg.current!.getBoundingClientRect().width;
    return [(e.clientX - from.x) / width, (from.y - e.clientY) / width] as const;
  };
  const nudgeSpring = (e: KeyboardEvent) => {
    const step = NUDGES[e.key];
    if (!step || !spring) return;
    e.preventDefault();
    e.stopPropagation();
    onChange(draggedSpring(spring, step[0] * 5, step[1] * 5));
  };
  const reset = (handle: Handle) => onChange(withHandle(shown, handle, handle === 1 ? { x: 0, y: 0 } : { x: 1, y: 1 }));

  return (
    <div className={styles.easing}>
      <svg ref={svg} className={styles.graph} viewBox={`0 0 ${SIZE + PAD * 2} ${SIZE + PAD * 2}`} role="group" aria-label={`Easing graph${suffix}`}>
        <rect className={styles.frame} x={x(0)} y={y(1)} width={SIZE} height={y(0) - y(1)} />
        <path className={styles.curve} d={points.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(p.t).toFixed(2)} ${y(p.value).toFixed(2)}`).join(' ')} />
        {spring && (
          // The whole graph is the spring's handle.
          <rect
            role="slider"
            tabIndex={0}
            aria-label={`Spring graph${suffix}`}
            aria-valuetext={`Stiffness ${spring.stiffness}, damping ${spring.damping}`}
            className={styles.springArea}
            x={0}
            y={0}
            width={SIZE + PAD * 2}
            height={SIZE + PAD * 2}
            onPointerDown={(e) => {
              e.preventDefault();
              e.currentTarget.setPointerCapture(e.pointerId);
              springDrag.current = { x: e.clientX, y: e.clientY, spring };
              setDraft(spring);
            }}
            onPointerMove={(e) => {
              const drag = springDrag.current;
              if (drag) setDraft(draggedSpring(drag.spring, ...dragDelta(e, drag)));
            }}
            onPointerUp={() => {
              if (springDrag.current && draft) onChange(draft);
              springDrag.current = null;
              setDraft(null);
            }}
            onKeyDown={nudgeSpring}
          />
        )}
        {bezier && (
          <>
            <line className={styles.arm} x1={x(0)} y1={y(0)} x2={x(bezier.x1)} y2={y(bezier.y1)} />
            <line className={styles.arm} x1={x(1)} y1={y(1)} x2={x(bezier.x2)} y2={y(bezier.y2)} />
            {([1, 2] as const).map((handle) => (
              <rect
                key={`keyframe-${handle}`}
                role="button"
                tabIndex={0}
                aria-label={`Reset Bezier handle ${handle}${suffix}`}
                className={styles.keyframe}
                x={x(handle === 1 ? 0 : 1) - 4}
                y={y(handle === 1 ? 0 : 1) - 4}
                width={8}
                height={8}
                onClick={() => reset(handle)}
                onKeyDown={(e) => {
                  if (e.key !== 'Enter' && e.key !== ' ') return;
                  e.preventDefault();
                  e.stopPropagation();
                  reset(handle);
                }}
              />
            ))}
            {([1, 2] as const).map((handle) => (
              <circle
                key={`handle-${handle}`}
                role="button"
                tabIndex={0}
                aria-label={`Bezier handle ${handle}${suffix}`}
                className={styles.handle}
                cx={x(handle === 1 ? bezier.x1 : bezier.x2)}
                cy={y(handle === 1 ? bezier.y1 : bezier.y2)}
                r={5}
                onPointerDown={(e) => {
                  e.preventDefault();
                  e.currentTarget.setPointerCapture(e.pointerId);
                  setDraft(easing);
                }}
                onPointerMove={(e) => {
                  if (draft) setDraft(withHandle(draft, handle, pointAt(e)));
                }}
                onPointerUp={() => {
                  if (draft) onChange(draft);
                  setDraft(null);
                }}
                onKeyDown={nudge(handle)}
              />
            ))}
          </>
        )}
      </svg>
      <div className={styles.preview} role="img" aria-label={`Animation preview${suffix}`} data-playing={playing || undefined} onPointerEnter={() => setPlaying(true)} onPointerLeave={() => setPlaying(false)}>
        <span ref={dot} className={styles.dot} />
      </div>
    </div>
  );
}
