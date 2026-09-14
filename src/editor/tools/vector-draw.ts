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

import type { Transaction } from '@/core/history/history';
import type { Id } from '@/core/ids/ids';
import type { VectorNode } from '@/core/schema/document';
import { networkBounds, transformNetwork, type VectorNetwork } from '@/core/vector/vector-network';

/**
 * Puts a network drawn in the parent's space on a vector layer: the layer's box moves and resizes to
 * the network's bounds, and the network is stored relative to that box.
 */
export function placeNetwork(tx: Transaction, id: Id, network: VectorNetwork): void {
  const bounds = networkBounds(network) ?? { x: 0, y: 0, width: 0, height: 0 };
  const t = (tx.store.getOrThrow(id) as VectorNode).transform;
  tx.set(id, 'transform', [t[0], t[1], t[2], t[3], bounds.x, bounds.y]);
  tx.set(id, 'size', { width: bounds.width, height: bounds.height });
  tx.set(id, 'vectorNetwork', transformNetwork(network, { x: bounds.x, y: bounds.y }, 1, 1));
}
