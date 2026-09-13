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
import { keyBetween } from '@/core/ids/fractional-index';
import type { Id } from '@/core/ids/ids';
import type { DocumentStore } from '@/core/document/store';

const keyOf = (store: DocumentStore, id: Id): string => {
  const node = store.getOrThrow(id);
  if (node.type === 'DOCUMENT') throw new Error('Document root has no order key');
  return node.parent.key;
};

/** Groups selected ids by parent, each group in bottom-to-top sibling order. */
function byParent(store: DocumentStore, ids: readonly Id[]): Map<Id, Id[]> {
  const groups = new Map<Id, Id[]>();
  for (const id of ids) {
    const parent = store.parentOf(id);
    if (parent === null) continue;
    groups.set(parent, [...(groups.get(parent) ?? []), id]);
  }
  for (const [parent, members] of groups) {
    const order = store.children(parent);
    members.sort((a, b) => order.indexOf(a) - order.indexOf(b));
  }
  return groups;
}

const setKey = (tx: Transaction, store: DocumentStore, id: Id, key: string) => {
  const parent = store.parentOf(id)!;
  tx.set(id, 'parent', { id: parent, key });
};

export type OrderDirection = 'forward' | 'backward' | 'front' | 'back';

/**
 * Changes z-order within each parent. Selected siblings keep their relative order.
 * "forward"/"backward" move each block past one unselected neighbor.
 */
export function reorder(tx: Transaction, ids: readonly Id[], direction: OrderDirection): void {
  const store = tx.store;
  for (const [parent, selected] of byParent(store, ids)) {
    const selectedSet = new Set(selected);
    if (direction === 'front' || direction === 'back') {
      const siblings = store.children(parent).filter((id) => !selectedSet.has(id));
      let lo: string | null = direction === 'front' ? (siblings.length ? keyOf(store, siblings.at(-1)!) : null) : null;
      const hi: string | null = direction === 'back' ? (siblings.length ? keyOf(store, siblings[0]!) : null) : null;
      for (const id of selected) {
        const key = keyBetween(lo, hi);
        setKey(tx, store, id, key);
        lo = key;
      }
      continue;
    }
    const order = direction === 'forward' ? [...selected].reverse() : selected;
    for (const id of order) {
      const siblings = store.children(parent);
      const idx = siblings.indexOf(id);
      if (direction === 'forward') {
        let next = idx + 1;
        while (next < siblings.length && selectedSet.has(siblings[next]!)) next++;
        if (next >= siblings.length) continue;
        const after = siblings[next + 1];
        setKey(tx, store, id, keyBetween(keyOf(store, siblings[next]!), after ? keyOf(store, after) : null));
      } else {
        let prev = idx - 1;
        while (prev >= 0 && selectedSet.has(siblings[prev]!)) prev--;
        if (prev < 0) continue;
        const before = siblings[prev - 1];
        setKey(tx, store, id, keyBetween(before ? keyOf(store, before) : null, keyOf(store, siblings[prev]!)));
      }
    }
  }
}
