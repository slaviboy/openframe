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

import { makeFrame } from '../document/factory';
import type { Transaction } from '../history/history';
import { keyBetween } from '../ids/fractional-index';
import type { Id } from '../ids/ids';
import { transformRect, type Rect } from '../math/rect';
import { matrixOf } from '../scene/scene-index';
import { isSceneNode, type SceneNode } from '../schema/document';
import { applyAutoLayout, isAutoLayoutFrame } from './auto-layout';

interface Item {
  readonly id: Id;
  readonly box: Rect;
}

const boundsOf = (node: SceneNode): Rect => transformRect(matrixOf(node.transform), { x: 0, y: 0, width: node.size.width, height: node.size.height });

/** Groups items whose extents along an axis overlap; items that only touch start a new group. */
function bands(items: readonly Item[], axis: 'x' | 'y'): Item[][] {
  const size = axis === 'x' ? 'width' : 'height';
  const groups: Item[][] = [];
  let end = -Infinity;
  for (const item of [...items].sort((a, b) => a.box[axis] - b.box[axis])) {
    if (groups.length === 0 || item.box[axis] >= end - 0.5) {
      groups.push([item]);
      end = item.box[axis] + item.box[size];
    } else {
      groups.at(-1)!.push(item);
      end = Math.max(end, item.box[axis] + item.box[size]);
    }
  }
  return groups;
}

const unionOf = (items: readonly Item[]): Rect => {
  const x = Math.min(...items.map((i) => i.box.x));
  const y = Math.min(...items.map((i) => i.box.y));
  return { x, y, width: Math.max(...items.map((i) => i.box.x + i.box.width)) - x, height: Math.max(...items.map((i) => i.box.y + i.box.height)) - y };
};

/**
 * Suggest auto layout: gives a frame, and the frames nested in it, as much auto layout as their
 * arrangement allows while keeping the design in place. Nested frames are handled first. Children
 * already in a single row or column flow directly; otherwise children that share a row (or, when
 * everything shares one row, a column) are wrapped in new fill-less frames, which are handled the
 * same way, and the frame flows those. Layers that overlap can't flow and are left as they are.
 * Returns the frames that got auto layout.
 */
export function suggestAutoLayout(tx: Transaction, frameId: Id, nextId: () => Id): Id[] {
  const store = tx.store;
  const changed: Id[] = [];
  const visit = (id: Id): void => {
    const node = store.get(id);
    if (node?.type !== 'FRAME' || isAutoLayoutFrame(node)) return;
    const children = store
      .children(id)
      .map((childId) => store.get(childId))
      .filter((n): n is SceneNode => n !== undefined && isSceneNode(n) && n.visible);
    for (const child of children) if (child.type === 'FRAME' && store.children(child.id).length > 0) visit(child.id);
    if (children.length === 0) return;
    const items = children.map((child) => ({ id: child.id, box: boundsOf(child) }));
    if (items.length > 1) {
      const rows = bands(items, 'y');
      const columns = bands(items, 'x');
      const oneRow = rows.length === 1 && columns.length === items.length;
      const oneColumn = columns.length === 1 && rows.length === items.length;
      if (!oneRow && !oneColumn) {
        const groups = rows.length > 1 ? rows : columns.length > 1 ? columns : null;
        if (!groups) return;
        for (const group of groups) {
          if (group.length < 2) continue;
          const union = unionOf(group);
          const siblings = store.children(id);
          const first = group.map((item) => item.id).sort((a, b) => siblings.indexOf(a) - siblings.indexOf(b))[0]!;
          const firstNode = store.getOrThrow(first) as SceneNode;
          const nextSibling = siblings[siblings.indexOf(first) + 1];
          const nextKey = nextSibling ? (store.getOrThrow(nextSibling) as SceneNode).parent.key : null;
          const wrapperId = nextId();
          tx.create({
            ...makeFrame({ id: wrapperId, parent: { id, key: keyBetween(firstNode.parent.key, nextKey) }, name: 'Frame', x: union.x, y: union.y, width: union.width, height: union.height }),
            fills: [],
            clipsContent: false,
          });
          for (const item of group) {
            const child = store.getOrThrow(item.id) as SceneNode;
            const t = child.transform;
            tx.set(item.id, 'transform', [t[0], t[1], t[2], t[3], t[4] - union.x, t[5] - union.y]);
            tx.set(item.id, 'parent', { id: wrapperId, key: child.parent.key });
          }
          visit(wrapperId);
        }
      }
    }
    applyAutoLayout(tx, id);
    if (isAutoLayoutFrame(store.get(id))) changed.push(id);
  };
  visit(frameId);
  return changed;
}
