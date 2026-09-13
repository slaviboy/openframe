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

import type { Id } from '../ids/ids';
import type { DocumentStore } from './store';

/** Sibling indices from the root down; comparing these orders arbitrary layers by paint order. */
export function zPath(store: DocumentStore, id: Id): number[] {
  const path: number[] = [];
  for (let cur: Id | null = id; cur !== null; ) {
    const parent = store.parentOf(cur);
    if (parent === null) break;
    path.unshift(store.children(parent).indexOf(cur));
    cur = parent;
  }
  return path;
}

/** Sorts layers bottom-most (painted first) to top-most. */
export function sortByPaintOrder(store: DocumentStore, ids: readonly Id[]): Id[] {
  const paths = new Map(ids.map((id) => [id, zPath(store, id)]));
  return [...ids].sort((a, b) => {
    const za = paths.get(a)!;
    const zb = paths.get(b)!;
    for (let i = 0; i < Math.min(za.length, zb.length); i++) if (za[i] !== zb[i]) return za[i]! - zb[i]!;
    return za.length - zb.length;
  });
}
