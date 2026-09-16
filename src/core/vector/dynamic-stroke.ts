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

import type { PathCommand } from '../geometry/corners';
import type { Vec2 } from '../math/vec';
import type { DynamicStroke } from '../schema/document';

/** How far apart the path is sampled, in layer units: fine enough for small bumps, coarse enough to stay quick. */
const SAMPLE_STEP = 2;

/** Bumps per 100 units of path at Frequency 100 — a full wave every 10 units, which reads as a hand-drawn line. */
const BUMPS_PER_100 = 10;

/** The largest sideways offset, in layer units, at Wiggle 100. */
const MAX_WIGGLE = 12;

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** A repeatable value in [-1, 1] for a whole-numbered bump: the same path always bumps the same way. */
function noiseAt(index: number): number {
  const x = Math.sin(index * 12.9898) * 43758.5453;
  return (x - Math.floor(x)) * 2 - 1;
}

/**
 * The offset a point gets at `distance` along the path. Smoothen blends between the jagged shape (each bump its own
 * random height, cornered) and a smooth one (a sine wave through those heights).
 */
function offsetAt(distance: number, frequency: number, smoothen: number): number {
  const bumps = (frequency / 100) * BUMPS_PER_100;
  const position = (distance / 100) * bumps;
  const index = Math.floor(position);
  const t = position - index;
  const from = noiseAt(index);
  const to = noiseAt(index + 1);
  const jagged = lerp(from, to, t);
  // A cosine ease over the same heights: the same bumps, without the corners.
  const smooth = lerp(from, to, (1 - Math.cos(Math.PI * t)) / 2);
  return lerp(jagged, smooth, smoothen / 100);
}

/** Straight-line samples of a path, as subpaths (a closed subpath repeats its first point at the end). */
function samples(commands: readonly PathCommand[]): Array<{ points: Vec2[]; closed: boolean }> {
  const out: Array<{ points: Vec2[]; closed: boolean }> = [];
  let current: { points: Vec2[]; closed: boolean } | null = null;
  let at: Vec2 = { x: 0, y: 0 };
  const push = (p: Vec2) => current?.points.push(p);
  for (const command of commands) {
    if (command.op === 'M') {
      current = { points: [{ x: command.x, y: command.y }], closed: false };
      out.push(current);
      at = { x: command.x, y: command.y };
    } else if (command.op === 'L') {
      const steps = Math.max(1, Math.ceil(Math.hypot(command.x - at.x, command.y - at.y) / SAMPLE_STEP));
      for (let i = 1; i <= steps; i++) push({ x: lerp(at.x, command.x, i / steps), y: lerp(at.y, command.y, i / steps) });
      at = { x: command.x, y: command.y };
    } else if (command.op === 'C') {
      // A cubic is walked at a fixed number of steps for its rough length.
      const rough = Math.hypot(command.x1 - at.x, command.y1 - at.y) + Math.hypot(command.x2 - command.x1, command.y2 - command.y1) + Math.hypot(command.x - command.x2, command.y - command.y2);
      const steps = Math.max(2, Math.ceil(rough / SAMPLE_STEP));
      for (let i = 1; i <= steps; i++) {
        const t = i / steps;
        const u = 1 - t;
        push({
          x: u * u * u * at.x + 3 * u * u * t * command.x1 + 3 * u * t * t * command.x2 + t * t * t * command.x,
          y: u * u * u * at.y + 3 * u * u * t * command.y1 + 3 * u * t * t * command.y2 + t * t * t * command.y,
        });
      }
      at = { x: command.x, y: command.y };
    } else if (command.op === 'Z' && current) {
      const first = current.points[0]!;
      current.closed = true;
      if (Math.hypot(first.x - at.x, first.y - at.y) > 0.001) push({ ...first });
      at = { ...first };
    }
  }
  return out.filter((subpath) => subpath.points.length > 1);
}

/** A dynamic stroke as it starts out: middling bumps, half smoothed — a hand-drawn line rather than a wild one. */
export const DEFAULT_DYNAMIC_STROKE: DynamicStroke = { frequency: 50, wiggle: 50, smoothen: 50 };

/** Whether a dynamic stroke would change anything: without bumps or height the path is left alone. */
export function hasDynamicStroke(dynamic: DynamicStroke | undefined): dynamic is DynamicStroke {
  return dynamic !== undefined && dynamic.frequency > 0 && dynamic.wiggle > 0;
}

/**
 * A path given a hand-drawn, bumpy look: each point moves sideways (along the path's normal) by an offset that follows
 * the path's length, so the same path always bumps the same way. Frequency sets how many bumps there are, Wiggle how
 * far they go, and Smoothen how rounded rather than jagged they are.
 */
export function dynamicStrokePath(commands: readonly PathCommand[], dynamic: DynamicStroke): PathCommand[] {
  if (!hasDynamicStroke(dynamic)) return [...commands];
  const amplitude = (dynamic.wiggle / 100) * MAX_WIGGLE;
  const out: PathCommand[] = [];
  for (const subpath of samples(commands)) {
    const { points, closed } = subpath;
    let distance = 0;
    const moved: Vec2[] = points.map((point, i) => {
      if (i > 0) distance += Math.hypot(point.x - points[i - 1]!.x, point.y - points[i - 1]!.y);
      const before = points[Math.max(0, i - 1)]!;
      const after = points[Math.min(points.length - 1, i + 1)]!;
      const dx = after.x - before.x;
      const dy = after.y - before.y;
      const length = Math.hypot(dx, dy);
      if (length === 0) return point;
      // The normal of the path here, times the offset at this distance along it.
      const offset = offsetAt(distance, dynamic.frequency, dynamic.smoothen) * amplitude;
      return { x: point.x + (-dy / length) * offset, y: point.y + (dx / length) * offset };
    });
    // A closed path meets itself again, so its last point takes the first one's offset.
    if (closed && moved.length > 1) moved[moved.length - 1] = { ...moved[0]! };
    out.push({ op: 'M', x: moved[0]!.x, y: moved[0]!.y });
    for (const point of moved.slice(1)) out.push({ op: 'L', x: point.x, y: point.y });
    if (closed) out.push({ op: 'Z' });
  }
  return out;
}
