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

/** A spacing indicator: a gap along `axis` between world positions `from` and `to`, drawn across at `at`. */
export interface GapIndicator {
  readonly axis: 'x' | 'y';
  readonly from: number;
  readonly to: number;
  readonly at: number;
  readonly distance: number;
}

export interface EqualGapResult {
  readonly dx: number;
  readonly dy: number;
  readonly gaps: readonly GapIndicator[];
}

const round2 = (v: number) => Math.round(v * 100) / 100;

function axisSnap(moving: Rect, targets: readonly Rect[], threshold: number, axis: 'x' | 'y'): { delta: number; gaps: GapIndicator[] } | null {
  const pos = (r: Rect) => (axis === 'x' ? r.x : r.y);
  const size = (r: Rect) => (axis === 'x' ? r.width : r.height);
  const crossPos = (r: Rect) => (axis === 'x' ? r.y : r.x);
  const crossSize = (r: Rect) => (axis === 'x' ? r.height : r.width);
  const center = pos(moving) + size(moving) / 2;
  // Neighbors share the moving rect's row (x) or column (y).
  const inLane = targets.filter((t) => crossPos(t) < crossPos(moving) + crossSize(moving) && crossPos(t) + crossSize(t) > crossPos(moving));
  let before: Rect | null = null;
  let after: Rect | null = null;
  for (const t of inLane) {
    if (pos(t) + size(t) <= center && (!before || pos(t) + size(t) > pos(before) + size(before))) before = t;
    if (pos(t) >= center && (!after || pos(t) < pos(after))) after = t;
  }
  if (!before || !after) return null;
  const start = pos(before) + size(before);
  const space = pos(after) - start - size(moving);
  if (space < 0) return null;
  const ideal = start + space / 2;
  const delta = ideal - pos(moving);
  if (Math.abs(delta) >= threshold) return null;
  const at = crossPos(moving) + crossSize(moving) / 2;
  const gap = round2(space / 2);
  return {
    delta,
    gaps: [
      { axis, from: start, to: ideal, at, distance: gap },
      { axis, from: ideal + size(moving), to: pos(after), at, distance: gap },
    ],
  };
}

/**
 * The gaps already left between neighbours in the moving rect's row (x) or column (y), largest first — the
 * spacing a designer has used elsewhere, which a new layer can be lined up to match.
 */
function gapsInLane(moving: Rect, targets: readonly Rect[], axis: 'x' | 'y'): number[] {
  const pos = (r: Rect) => (axis === 'x' ? r.x : r.y);
  const size = (r: Rect) => (axis === 'x' ? r.width : r.height);
  const crossPos = (r: Rect) => (axis === 'x' ? r.y : r.x);
  const crossSize = (r: Rect) => (axis === 'x' ? r.height : r.width);
  const lane = targets
    .filter((t) => crossPos(t) < crossPos(moving) + crossSize(moving) && crossPos(t) + crossSize(t) > crossPos(moving))
    .slice()
    .sort((a, b) => pos(a) - pos(b));
  const gaps: number[] = [];
  for (let i = 1; i < lane.length; i++) {
    const space = round2(pos(lane[i]!) - (pos(lane[i - 1]!) + size(lane[i - 1]!)));
    if (space > 0.5 && !gaps.some((gap) => Math.abs(gap - space) < 0.5)) gaps.push(space);
  }
  return gaps;
}

/**
 * Matching a gap used elsewhere: the moving rect is placed so the space between it and the neighbour beside it
 * is one the row or column already uses. Returns the correction and the gap it matched, or null when none is
 * within `threshold`.
 */
function matchGap(moving: Rect, targets: readonly Rect[], threshold: number, axis: 'x' | 'y'): { delta: number; gaps: GapIndicator[] } | null {
  const pos = (r: Rect) => (axis === 'x' ? r.x : r.y);
  const size = (r: Rect) => (axis === 'x' ? r.width : r.height);
  const crossPos = (r: Rect) => (axis === 'x' ? r.y : r.x);
  const crossSize = (r: Rect) => (axis === 'x' ? r.height : r.width);
  const known = gapsInLane(moving, targets, axis);
  if (known.length === 0) return null;
  const center = pos(moving) + size(moving) / 2;
  const lane = targets.filter((t) => crossPos(t) < crossPos(moving) + crossSize(moving) && crossPos(t) + crossSize(t) > crossPos(moving));

  let best: { delta: number; gaps: GapIndicator[] } | null = null;
  const at = crossPos(moving) + crossSize(moving) / 2;
  for (const neighbour of lane) {
    const before = pos(neighbour) + size(neighbour) <= center;
    const after = pos(neighbour) >= center;
    if (!before && !after) continue;
    for (const gap of known) {
      // Placed just past the neighbour, or just short of it, at the gap the row already uses.
      const target = before ? pos(neighbour) + size(neighbour) + gap : pos(neighbour) - gap - size(moving);
      const delta = target - pos(moving);
      if (Math.abs(delta) >= threshold || (best && Math.abs(delta) >= Math.abs(best.delta))) continue;
      const from = before ? pos(neighbour) + size(neighbour) : target + size(moving);
      best = { delta, gaps: [{ axis, from, to: from + gap, at, distance: gap }] };
    }
  }
  return best;
}

/**
 * Equal spacing while moving: when the moving rect sits between two neighbors in its row
 * (or column), snaps it so both gaps are equal if that is strictly within `threshold`, and
 * reports the two gaps as indicators. Axes set to false are left alone.
 */
export function snapEqualGaps(moving: Rect, targets: readonly Rect[], threshold: number, axes: { readonly x: boolean; readonly y: boolean } = { x: true, y: true }): EqualGapResult {
  // Centring between two neighbours comes first; failing that, a gap the row or column already uses.
  const x = axes.x ? (axisSnap(moving, targets, threshold, 'x') ?? matchGap(moving, targets, threshold, 'x')) : null;
  const y = axes.y ? (axisSnap(moving, targets, threshold, 'y') ?? matchGap(moving, targets, threshold, 'y')) : null;
  // The indicator lines cross the snapped position on the other axis.
  const dy = y?.delta ?? 0;
  const dx = x?.delta ?? 0;
  const gaps = [...(x?.gaps.map((g) => ({ ...g, at: g.at + dy })) ?? []), ...(y?.gaps.map((g) => ({ ...g, at: g.at + dx })) ?? [])];
  return { dx, dy, gaps };
}
