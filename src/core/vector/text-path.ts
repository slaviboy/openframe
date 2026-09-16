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

import type { DocumentStore } from '../document/store';
import type { Id } from '../ids/ids';
import type { Vec2 } from '../math/vec';
import { strokeChain, type StrokeChain } from './vector-width';

/** A path text runs along: how long it is, and where it is at a distance along it. */
export interface PathRun {
  readonly length: number;
  at(distance: number): { readonly point: Vec2; readonly tangent: Vec2 };
}

/** A walk along a sampled path: the point and direction at a distance from its start. */
export function pathRun(chain: StrokeChain): PathRun {
  const { points, lengths } = chain;
  const length = lengths[lengths.length - 1] ?? 0;
  return {
    length,
    at(distance) {
      const d = Math.min(Math.max(distance, 0), length);
      let i = 1;
      while (i < lengths.length - 1 && lengths[i]! < d) i++;
      const before = points[i - 1]!;
      const after = points[i]!;
      const span = lengths[i]! - lengths[i - 1]!;
      const t = span > 0 ? (d - lengths[i - 1]!) / span : 0;
      const dx = after.x - before.x;
      const dy = after.y - before.y;
      const size = Math.hypot(dx, dy) || 1;
      return { point: { x: before.x + (after.x - before.x) * t, y: before.y + (after.y - before.y) * t }, tangent: { x: dx / size, y: dy / size } };
    },
  };
}

/** The path of the vector layer text follows, or null when that layer is gone or is not a vector. */
export function pathRunFor(store: DocumentStore, pathId: Id): PathRun | null {
  const node = store.get(pathId);
  if (node?.type !== 'VECTOR') return null;
  const chain = strokeChain(node.vectorNetwork);
  return chain && (chain.lengths[chain.lengths.length - 1] ?? 0) > 0 ? pathRun(chain) : null;
}
