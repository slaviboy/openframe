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
import type { Vec2 } from '../math/vec';
import type { VectorNetwork } from './vector-network';

/** Signed edges of a box after a resize: x1 < x0 or y1 < y0 means it was flipped on that axis. */
export interface BoxEdges {
  readonly x0: number;
  readonly y0: number;
  readonly x1: number;
  readonly y1: number;
}

/** The box around the given vertices in the network's space, or null for fewer than two of them. */
export function pointsBounds(network: VectorNetwork, indices: readonly number[]): Rect | null {
  const points = [...new Set(indices)].map((i) => network.vertices[i]).filter((p): p is NonNullable<typeof p> => p !== undefined);
  if (points.length < 2) return null;
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  const [x, y] = [Math.min(...xs), Math.min(...ys)];
  return { x, y, width: Math.max(...xs) - x, height: Math.max(...ys) - y };
}

/** Applies a mapping to the selected vertices and a linear mapping to the handles at them (segment ends at a selected vertex). */
function mapPoints(network: VectorNetwork, indices: readonly number[], point: (p: Vec2) => Vec2, tangent: (t: Vec2) => Vec2): VectorNetwork {
  const selected = new Set(indices);
  return {
    ...network,
    vertices: network.vertices.map((v, i) => (selected.has(i) ? { ...v, ...point(v) } : v)),
    segments: network.segments.map((s) =>
      selected.has(s.start) || selected.has(s.end)
        ? { ...s, tangentStart: selected.has(s.start) ? tangent(s.tangentStart) : s.tangentStart, tangentEnd: selected.has(s.end) ? tangent(s.tangentEnd) : s.tangentEnd }
        : s,
    ),
  };
}

/**
 * Resizes selected points with their bounding box: each point keeps its place relative to the box as it
 * goes from `from` to the resized edges (a flipped box mirrors them), and the handles at those points
 * stretch by the same factors, so the curves between them keep their shape.
 */
export function scalePoints(network: VectorNetwork, indices: readonly number[], from: Rect, to: BoxEdges): VectorNetwork {
  const sx = from.width > 0 ? (to.x1 - to.x0) / from.width : 1;
  const sy = from.height > 0 ? (to.y1 - to.y0) / from.height : 1;
  return mapPoints(
    network,
    indices,
    (p) => ({ x: to.x0 + (p.x - from.x) * sx, y: to.y0 + (p.y - from.y) * sy }),
    // 0 + keeps a zero component +0 when an axis flips.
    (t) => ({ x: 0 + t.x * sx, y: 0 + t.y * sy }),
  );
}

/** Rotates selected points about `pivot` by `radians`, turning the handles at those points with them. */
export function rotatePoints(network: VectorNetwork, indices: readonly number[], pivot: Vec2, radians: number): VectorNetwork {
  const [cos, sin] = [Math.cos(radians), Math.sin(radians)];
  const turn = (t: Vec2): Vec2 => ({ x: 0 + (t.x * cos - t.y * sin), y: 0 + (t.x * sin + t.y * cos) });
  return mapPoints(
    network,
    indices,
    (p) => {
      const r = turn({ x: p.x - pivot.x, y: p.y - pivot.y });
      return { x: pivot.x + r.x, y: pivot.y + r.y };
    },
    turn,
  );
}
