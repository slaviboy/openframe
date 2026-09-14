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
import type { Transaction } from '../history/history';
import { keysBetween } from '../ids/fractional-index';
import type { Id } from '../ids/ids';
import { transformRect, type Rect } from '../math/rect';
import type { Vec2 } from '../math/vec';
import { matrixOf } from '../scene/scene-index';
import { isSceneNode, type SceneNode } from '../schema/document';
import { isAutoLayoutFrame, layoutPadding } from './auto-layout';

/** Whether a layer takes part in its parent's auto layout flow (visible, not ignoring auto layout). */
export function isInFlow(store: DocumentStore, id: Id): boolean {
  const node = store.get(id);
  return node !== undefined && isSceneNode(node) && node.visible && node.layoutPositioning !== 'ABSOLUTE' && isAutoLayoutFrame(store.get(node.parent.id));
}

/** The frame's flow children, except `exclude`, in flow order with their boxes in the frame's space. */
function flowItems(store: DocumentStore, frameId: Id, exclude: ReadonlySet<Id>): { id: Id; box: Rect }[] {
  return store
    .children(frameId)
    .filter((id) => !exclude.has(id) && isInFlow(store, id))
    .map((id) => {
      const node = store.getOrThrow(id) as SceneNode;
      return { id, box: transformRect(matrixOf(node.transform), { x: 0, y: 0, width: node.size.width, height: node.size.height }) };
    });
}

/**
 * Where layers dropped at `point` (in the frame's space) land among the frame's other flow children:
 * after every child whose center along the flow is before the point (in a wrapping flow, every child
 * on an earlier row, and those on the point's row left of it).
 */
export function flowInsertionIndex(store: DocumentStore, frameId: Id, point: Vec2, exclude: ReadonlySet<Id>): number {
  const frame = store.get(frameId);
  if (!isAutoLayoutFrame(frame)) return 0;
  // Grids fill cells row by row, like a wrapping horizontal flow.
  const horizontal = frame.layoutMode !== 'VERTICAL';
  const wraps = frame.layoutWrap === true || frame.layoutMode === 'GRID';
  let index = 0;
  flowItems(store, frameId, exclude).forEach(({ box }, i) => {
    const before = !horizontal
      ? point.y > box.y + box.height / 2
      : wraps
        ? box.y + box.height < point.y || (point.y >= box.y && point.x > box.x + box.width / 2)
        : point.x > box.x + box.width / 2;
    if (before) index = i + 1;
  });
  return index;
}

/** The insertion indicator for `index`: a line across the flow between the neighbors, in the frame's space. */
export function flowInsertionLine(store: DocumentStore, frameId: Id, index: number, exclude: ReadonlySet<Id>): [Vec2, Vec2] | null {
  const frame = store.get(frameId);
  if (!isAutoLayoutFrame(frame)) return null;
  const items = flowItems(store, frameId, exclude);
  const pad = layoutPadding(frame);
  const wraps = frame.layoutWrap === true || frame.layoutMode === 'GRID';
  const halfGap = Math.max(0, (frame.layoutMode === 'GRID' ? frame.gridColumnGap : frame.itemSpacing) ?? 0) / 2;
  const prev = items[index - 1]?.box;
  const next = items[index]?.box;
  if (frame.layoutMode !== 'VERTICAL') {
    const x = prev && next && !wraps ? (prev.x + prev.width + next.x) / 2 : prev ? prev.x + prev.width + halfGap : next ? next.x - halfGap : pad.left;
    const row = prev ?? next;
    const [top, bottom] = wraps && row ? [row.y, row.y + row.height] : [pad.top, frame.size.height - pad.bottom];
    return [
      { x, y: top },
      { x, y: bottom },
    ];
  }
  const y = prev && next ? (prev.y + prev.height + next.y) / 2 : prev ? prev.y + prev.height + halfGap : next ? next.y - halfGap : pad.top;
  return [
    { x: pad.left, y },
    { x: frame.size.width - pad.right, y },
  ];
}

/**
 * Moves children of an auto layout frame to flow position `index` among its other flow children,
 * keeping their relative order. Hidden layers and layers that ignore auto layout keep their place.
 */
export function moveToFlowIndex(tx: Transaction, frameId: Id, ids: readonly Id[], index: number): void {
  const store = tx.store;
  const moving = new Set(ids);
  const ordered = store.children(frameId).filter((id) => moving.has(id));
  if (ordered.length === 0) return;
  const others = store.children(frameId).filter((id) => !moving.has(id));
  const flow = others.filter((id) => isInFlow(store, id));
  const keyOf = (id: Id | null | undefined) => (id ? (store.getOrThrow(id) as SceneNode).parent.key : null);
  let prev: Id | null;
  let next: Id | null;
  if (index < flow.length) {
    next = flow[Math.max(0, index)]!;
    prev = others[others.indexOf(next) - 1] ?? null;
  } else {
    prev = flow.at(-1) ?? others.at(-1) ?? null;
    next = prev ? (others[others.indexOf(prev) + 1] ?? null) : null;
  }
  const result = [...others];
  result.splice(next ? others.indexOf(next) : others.length, 0, ...ordered);
  if (result.every((id, i) => store.children(frameId)[i] === id)) return;
  const keys = keysBetween(keyOf(prev), keyOf(next), ordered.length);
  ordered.forEach((id, i) => tx.set(id, 'parent', { id: frameId, key: keys[i]! }));
}

/** Moves one flow child `delta` positions along its frame's flow (clamped to the ends). */
export function moveInFlow(tx: Transaction, id: Id, delta: number): void {
  const store = tx.store;
  const frameId = store.parentOf(id);
  if (!frameId || !isInFlow(store, id)) return;
  const flow = store.children(frameId).filter((child) => isInFlow(store, child));
  const from = flow.indexOf(id);
  const to = Math.min(flow.length - 1, Math.max(0, from + delta));
  if (to !== from) moveToFlowIndex(tx, frameId, [id], to);
}
