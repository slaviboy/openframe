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

import { canParent } from '@/core/document/containment';
import { sortByPaintOrder } from '@/core/document/order';
import type { Transaction } from '@/core/history/history';
import { keyBetween } from '@/core/ids/fractional-index';
import type { Id } from '@/core/ids/ids';
import { IDENTITY, invert, multiply } from '@/core/math/matrix';
import type { SceneIndex } from '@/core/scene/scene-index';
import { isSceneNode } from '@/core/schema/document';
import { toTransform } from '../interactions/transform';

export type DropPosition = 'above' | 'below' | 'inside';

/** Whether `id` can contain children in the layers panel. */
export function canContain(tx: Transaction | { store: Transaction['store'] }, id: Id): boolean {
  const node = tx.store.get(id);
  return node?.type === 'FRAME' || node?.type === 'GROUP' || node?.type === 'BOOLEAN_OPERATION' || node?.type === 'PAGE' || node?.type === 'SECTION';
}

/**
 * Moves layers relative to a target row of the layers panel, preserving each layer's
 * position on the canvas. Rows list the topmost layer first, so dropping "above" a row
 * places layers higher in z-order than the target.
 *
 * Returns false (and changes nothing) when the drop is invalid, e.g. into itself.
 */
export function moveLayers(tx: Transaction, index: SceneIndex, ids: readonly Id[], target: Id, position: DropPosition): boolean {
  const store = tx.store;
  const targetNode = store.get(target);
  if (!targetNode || targetNode.type === 'DOCUMENT') return false;
  const parent = position === 'inside' ? target : targetNode.type === 'PAGE' ? null : targetNode.parent.id;
  if (parent === null || !canContain(tx, parent)) return false;
  const moving = ids.filter((id) => store.has(id) && id !== target && !ids.some((o) => o !== id && store.isAncestor(o, id)));
  if (moving.some((id) => id === parent || store.isAncestor(id, parent))) return false;
  if (moving.length === 0) return false;
  // Sections cannot be dropped into frames or groups.
  const parentType = store.getOrThrow(parent).type;
  if (moving.some((id) => !canParent(parentType, store.getOrThrow(id).type))) return false;

  // Determine the key interval among the remaining siblings.
  const siblings = store.children(parent).filter((id) => !moving.includes(id));
  const keyOf = (id: Id) => {
    const n = store.getOrThrow(id);
    return n.type === 'DOCUMENT' ? '' : n.parent.key;
  };
  let lo: string | null;
  let hi: string | null;
  if (position === 'inside') {
    lo = siblings.length ? keyOf(siblings.at(-1)!) : null;
    hi = null;
  } else {
    const idx = siblings.indexOf(target);
    if (position === 'above') {
      lo = keyOf(target);
      hi = idx + 1 < siblings.length ? keyOf(siblings[idx + 1]!) : null;
    } else {
      lo = idx > 0 ? keyOf(siblings[idx - 1]!) : null;
      hi = keyOf(target);
    }
  }

  // Keep the moved layers' relative z-order: bottom-most first.
  const order = sortByPaintOrder(store, moving);

  const parentNode = store.getOrThrow(parent);
  const parentWorld = isSceneNode(parentNode) ? index.computeWorld(parent) : IDENTITY;
  const parentInv = invert(parentWorld);
  if (!parentInv) return false;
  for (const id of order) {
    const node = store.getOrThrow(id);
    if (!isSceneNode(node)) continue;
    const key = keyBetween(lo, hi);
    lo = key;
    if (node.parent.id !== parent) {
      const world = index.computeWorld(id);
      tx.set(id, 'parent', { id: parent, key });
      tx.set(id, 'transform', toTransform(multiply(parentInv, world)));
    } else {
      tx.set(id, 'parent', { id: parent, key });
    }
  }
  return true;
}
