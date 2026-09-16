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

import type { Vec2 } from '../math/vec';
import type { BrushKind, BrushNode, Node, Size, VectorNetworkData } from '../schema/document';
import { networkStrokePath } from './vector-network';
import type { StrokeChain } from './vector-width';

export const isBrush = (node: Node | undefined): node is BrushNode => node?.type === 'BRUSH';

/** How far apart a brush shape is repeated along a stroke, as a share of the shape's own length. */
const SCATTER_SPACING = 1.2;

/** How finely a brush's own outline is walked; a stretched shape bends along the stroke, so it needs points to bend. */
const OUTLINE_STEP = 1;

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** A brush's shape as closed polygons, in the space of the layer it was made from. */
export function brushOutline(network: VectorNetworkData): Vec2[][] {
  const polygons: Vec2[][] = [];
  let current: Vec2[] | null = null;
  let at: Vec2 = { x: 0, y: 0 };
  const line = (to: Vec2) => {
    if (!current) return;
    const steps = Math.max(1, Math.ceil(Math.hypot(to.x - at.x, to.y - at.y) / OUTLINE_STEP));
    for (let i = 1; i <= steps; i++) current.push({ x: lerp(at.x, to.x, i / steps), y: lerp(at.y, to.y, i / steps) });
    at = to;
  };
  for (const command of networkStrokePath(network)) {
    if (command.op === 'M') {
      current = [{ x: command.x, y: command.y }];
      polygons.push(current);
      at = { x: command.x, y: command.y };
    } else if (command.op === 'L') {
      line({ x: command.x, y: command.y });
    } else if (command.op === 'C') {
      const from = at;
      const rough = Math.hypot(command.x1 - from.x, command.y1 - from.y) + Math.hypot(command.x2 - command.x1, command.y2 - command.y1) + Math.hypot(command.x - command.x2, command.y - command.y2);
      const steps = Math.max(2, Math.ceil(rough / OUTLINE_STEP));
      for (let i = 1; i <= steps; i++) {
        const t = i / steps;
        const u = 1 - t;
        current?.push({
          x: u * u * u * from.x + 3 * u * u * t * command.x1 + 3 * u * t * t * command.x2 + t * t * t * command.x,
          y: u * u * u * from.y + 3 * u * u * t * command.y1 + 3 * u * t * t * command.y2 + t * t * t * command.y,
        });
      }
      at = { x: command.x, y: command.y };
    }
  }
  return polygons.filter((polygon) => polygon.length > 2);
}

/** The point and direction of the chain at `distance` along it. */
function along(chain: StrokeChain, distance: number): { point: Vec2; tangent: Vec2 } {
  const { points, lengths } = chain;
  const total = lengths[lengths.length - 1]!;
  const d = Math.min(Math.max(distance, 0), total);
  let i = 1;
  while (i < lengths.length - 1 && lengths[i]! < d) i++;
  const before = points[i - 1]!;
  const after = points[i]!;
  const span = lengths[i]! - lengths[i - 1]!;
  const t = span > 0 ? (d - lengths[i - 1]!) / span : 0;
  const dx = after.x - before.x;
  const dy = after.y - before.y;
  const length = Math.hypot(dx, dy) || 1;
  return { point: { x: lerp(before.x, after.x, t), y: lerp(before.y, after.y, t) }, tangent: { x: dx / length, y: dy / length } };
}

/**
 * A stroke painted with a custom brush, as closed polygons to fill.
 *
 * A stretch brush is laid over the whole stroke: the shape's x becomes distance along the path and its y the offset
 * across it, so it bends with the path. A scatter brush repeats the shape along the path instead, each copy turned to
 * face the way the path goes. Both scale so the shape's height matches the stroke's weight.
 */
export function brushStrokeOutlines(chain: StrokeChain, network: VectorNetworkData, size: Size, kind: BrushKind, strokeWeight: number): Vec2[][] {
  const total = chain.lengths[chain.lengths.length - 1]!;
  const polygons = brushOutline(network);
  if (total <= 0 || strokeWeight <= 0 || polygons.length === 0 || size.width <= 0 || size.height <= 0) return [];
  const scale = strokeWeight / size.height;

  if (kind === 'STRETCH') {
    return polygons.map((polygon) =>
      polygon.map((p) => {
        const { point, tangent } = along(chain, (p.x / size.width) * total);
        const across = (p.y - size.height / 2) * scale;
        return { x: point.x - tangent.y * across, y: point.y + tangent.x * across };
      }),
    );
  }

  // Scatter: a copy of the shape at each step along the path.
  const step = Math.max(size.width * scale * SCATTER_SPACING, 0.5);
  const out: Vec2[][] = [];
  for (let distance = 0; distance <= total; distance += step) {
    const { point, tangent } = along(chain, distance);
    for (const polygon of polygons) {
      out.push(
        polygon.map((p) => {
          // The shape's own center sits on the path, turned to the path's direction.
          const x = (p.x - size.width / 2) * scale;
          const y = (p.y - size.height / 2) * scale;
          return { x: point.x + tangent.x * x - tangent.y * y, y: point.y + tangent.y * x + tangent.x * y };
        }),
      );
    }
  }
  return out;
}
