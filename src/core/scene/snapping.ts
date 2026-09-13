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

import type { Rect } from '../math/rect';

/** A world-space guide line: `axis` 'x' is a vertical line at x = position, spanning y from→to. */
export interface SnapGuide {
  readonly axis: 'x' | 'y';
  readonly position: number;
  readonly from: number;
  readonly to: number;
}

export interface SnapResult {
  /** Correction to add to the moving rect's position. */
  readonly dx: number;
  readonly dy: number;
  /** Guides for every edge/center alignment after snapping. */
  readonly guides: readonly SnapGuide[];
}

const xsOf = (r: Rect): [number, number, number] => [r.x, r.x + r.width / 2, r.x + r.width];
const ysOf = (r: Rect): [number, number, number] => [r.y, r.y + r.height / 2, r.y + r.height];
const ALIGNED = 0.01;

/**
 * Snaps a moving rect's edges and center to the edges and centers of target rects.
 * On each axis the closest candidate strictly within `threshold` wins. Guides are reported
 * for every alignment that holds after the snap, merged per line.
 */
export function snapBounds(
  moving: Rect,
  targets: readonly Rect[],
  threshold: number,
  axes: { readonly x: boolean; readonly y: boolean } = { x: true, y: true },
): SnapResult {
  let bestX: number | null = null;
  let bestY: number | null = null;
  const mx = xsOf(moving);
  const my = ysOf(moving);
  for (const target of targets) {
    if (axes.x) {
      for (const t of xsOf(target)) {
        for (const m of mx) {
          const d = t - m;
          if (Math.abs(d) < threshold && (bestX === null || Math.abs(d) < Math.abs(bestX))) bestX = d;
        }
      }
    }
    if (axes.y) {
      for (const t of ysOf(target)) {
        for (const m of my) {
          const d = t - m;
          if (Math.abs(d) < threshold && (bestY === null || Math.abs(d) < Math.abs(bestY))) bestY = d;
        }
      }
    }
  }
  const dx = bestX ?? 0;
  const dy = bestY ?? 0;
  const snapped: Rect = { ...moving, x: moving.x + dx, y: moving.y + dy };
  const guides = guidesFor(snapped, targets, { x: bestX !== null, y: bestY !== null });
  return { dx, dy, guides };
}

/** Left/center/right (x) or top/middle/bottom (y) of every rect. */
export const edgeValues = (rects: readonly Rect[], axis: 'x' | 'y'): number[] => rects.flatMap((r) => (axis === 'x' ? xsOf(r) : ysOf(r)));

/** Correction that snaps `value` to the nearest candidate strictly within `threshold`, or null. */
export function snapValue(value: number, candidates: readonly number[], threshold: number): number | null {
  let best: number | null = null;
  for (const candidate of candidates) {
    const d = candidate - value;
    if (Math.abs(d) < threshold && (best === null || Math.abs(d) < Math.abs(best))) best = d;
  }
  return best;
}

/** Guides for every edge/center alignment of `rect` with the targets on the given axes. */
export function guidesFor(rect: Rect, targets: readonly Rect[], axes: { readonly x: boolean; readonly y: boolean }): SnapGuide[] {
  return [...(axes.x ? collectGuides('x', rect, targets) : []), ...(axes.y ? collectGuides('y', rect, targets) : [])];
}

function collectGuides(axis: 'x' | 'y', snapped: Rect, targets: readonly Rect[]): SnapGuide[] {
  const lines = new Map<number, { from: number; to: number }>();
  const values = axis === 'x' ? xsOf(snapped) : ysOf(snapped);
  for (const target of targets) {
    const targetValues = axis === 'x' ? xsOf(target) : ysOf(target);
    const from = axis === 'x' ? Math.min(snapped.y, target.y) : Math.min(snapped.x, target.x);
    const to = axis === 'x' ? Math.max(snapped.y + snapped.height, target.y + target.height) : Math.max(snapped.x + snapped.width, target.x + target.width);
    for (const value of values) {
      if (!targetValues.some((t) => Math.abs(t - value) < ALIGNED)) continue;
      const key = Math.round(value * 100) / 100;
      const line = lines.get(key);
      lines.set(key, line ? { from: Math.min(line.from, from), to: Math.max(line.to, to) } : { from, to });
    }
  }
  return [...lines].map(([position, span]) => ({ axis, position, from: span.from, to: span.to }));
}
