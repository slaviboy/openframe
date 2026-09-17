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
import type { DocumentStore } from '../document/store';
import type { SceneNode } from '../schema/document';
import type { VectorNetwork } from './vector-network';

/** How an offset path turns the corners it grows around: squared off, or rounded. */
export type OffsetJoin = 'SQUARE' | 'ROUND';

/** Path geometry that needs the rendering engine's path operations (stroking, dashing, combining). */
export interface GeometryService {
  /**
   * The filled area a layer's stroke covers, in the layer's local space and filled with the nonzero
   * rule: dashes, caps, joins and the inside/outside alignment applied. Null when the layer draws no
   * stroke or its stroke can't be outlined.
   */
  strokeOutline(node: SceneNode): PathCommand[] | null;

  /**
   * Eraser on a closed region: the region's area (in the network's space) minus a round stroke of
   * `weight` along `path`, as path commands; [] when nothing is left, null when the stroke doesn't reach it.
   */
  regionMinusStroke(network: VectorNetwork, region: number, path: readonly Vec2[], weight: number): PathCommand[] | null;

  /**
   * The shape a boolean group comes to: its children's outlines combined by its operation, as path commands in
   * the group's own space. Null when the group combines nothing.
   */
  booleanOutline(node: SceneNode, store: DocumentStore): PathCommand[] | null;

  /**
   * Offset path: the area a network's closed loops cover, grown by `amount` (or shrunk, when it is negative),
   * as path commands in the network's space. `join` shapes the corners the growth rounds or squares off.
   * [] when shrinking leaves nothing; null when the network encloses no area to offset.
   */
  offsetNetwork(network: VectorNetwork, amount: number, join: OffsetJoin): PathCommand[] | null;

  /**
   * Cut divide on a closed region: its area (in the network's space) split by the infinite line through
   * `a` and `b`, as path commands for the part on each side — `positive` where (b − a) × (p − a) > 0 —
   * with [] for a side nothing is on. Null without the region.
   */
  regionHalves(network: VectorNetwork, region: number, a: Vec2, b: Vec2): { readonly positive: PathCommand[]; readonly negative: PathCommand[] } | null;
}
