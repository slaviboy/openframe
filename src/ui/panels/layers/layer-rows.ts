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

import type { DocumentStore } from '@/core/document/store';
import type { Id } from '@/core/ids/ids';

export interface LayerRow {
  readonly id: Id;
  readonly depth: number;
  readonly hasChildren: boolean;
  readonly expanded: boolean;
}

/**
 * Flattens a page's layer tree into rows for the virtualized layers panel. Rows list the
 * topmost layer first (reverse paint order), and only expanded containers contribute
 * their children.
 */
export function flattenLayers(store: DocumentStore, pageId: Id, expanded: ReadonlySet<Id>): LayerRow[] {
  const rows: LayerRow[] = [];
  const visit = (parent: Id, depth: number) => {
    const children = store.children(parent);
    for (let i = children.length - 1; i >= 0; i--) {
      const id = children[i]!;
      const hasChildren = store.children(id).length > 0;
      const isExpanded = hasChildren && expanded.has(id);
      rows.push({ id, depth, hasChildren, expanded: isExpanded });
      if (isExpanded) visit(id, depth + 1);
    }
  };
  visit(pageId, 0);
  return rows;
}

/** Ids between two rows (inclusive), in row order — for Shift-click range selection. */
export function rowRange(rows: readonly LayerRow[], from: Id, to: Id): Id[] {
  const a = rows.findIndex((r) => r.id === from);
  const b = rows.findIndex((r) => r.id === to);
  if (a < 0 || b < 0) return [to];
  const [lo, hi] = a < b ? [a, b] : [b, a];
  return rows.slice(lo, hi + 1).map((r) => r.id);
}
