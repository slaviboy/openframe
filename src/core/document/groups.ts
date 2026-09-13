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

import type { Transaction } from '../history/history';
import type { Id } from '../ids/ids';
import { applyLinear } from '../math/matrix';
import { transformRect, unionAll } from '../math/rect';
import { matrixOf } from '../scene/scene-index';
import type { SceneNode, Transform } from '../schema/document';

/** Fields of a child whose change can alter its parent group's bounds. */
const CHILD_GEOMETRY_FIELDS: ReadonlySet<string> = new Set(['transform', 'size', 'parent']);
const EPSILON = 1e-6;

/**
 * Commit finalizer enforcing group semantics:
 * - groups never exist empty: a group that lost its last child is deleted (cascading up);
 * - groups hug their children: the group's origin and size always equal the union of its
 *   direct children's geometry, measured in the group's own coordinate space.
 *
 * Children keep their world position: when a group's origin moves by `b` (group-local),
 * the group transform becomes G·T(b) and each child transform T(−b)·C.
 */
export function groupFinalizer(tx: Transaction): void {
  const store = tx.store;
  const candidates = new Set<Id>();
  const addGroupAncestors = (start: Id | null | undefined) => {
    for (let cur = start ?? null; cur !== null && store.has(cur); cur = store.parentOf(cur)) {
      if (store.get(cur)?.type === 'GROUP') candidates.add(cur);
    }
  };

  for (const op of tx.ops) {
    if (op.kind === 'create') {
      if (op.node.type === 'GROUP') candidates.add(op.node.id);
      if (op.node.type !== 'DOCUMENT') addGroupAncestors(op.node.parent.id);
    } else if (op.kind === 'delete') {
      if (op.node.type !== 'DOCUMENT') addGroupAncestors(op.node.parent.id);
    } else if (CHILD_GEOMETRY_FIELDS.has(op.field) && store.has(op.id)) {
      addGroupAncestors(store.parentOf(op.id));
      if (op.field === 'parent') addGroupAncestors((op.prev as { id: Id } | undefined)?.id);
    }
  }
  if (candidates.size === 0) return;

  // Deepest groups first, so nested groups have their final size before parents measure them.
  const depth = new Map([...candidates].map((id) => [id, store.ancestors(id).length]));
  const ordered = [...candidates].sort((a, b) => depth.get(b)! - depth.get(a)!);
  for (const id of ordered) {
    if (!store.has(id)) continue;
    if (store.children(id).length === 0) tx.delete(id);
    else hugChildren(tx, id);
  }
}

function hugChildren(tx: Transaction, groupId: Id): void {
  const store = tx.store;
  const group = store.getOrThrow(groupId) as SceneNode;
  const childNodes = store.children(groupId).map((id) => store.getOrThrow(id) as SceneNode);
  const bounds = unionAll(
    childNodes.map((c) => transformRect(matrixOf(c.transform), { x: 0, y: 0, width: c.size.width, height: c.size.height })),
  );
  if (!bounds) return;
  const unchanged =
    Math.abs(bounds.x) < EPSILON &&
    Math.abs(bounds.y) < EPSILON &&
    Math.abs(bounds.width - group.size.width) < EPSILON &&
    Math.abs(bounds.height - group.size.height) < EPSILON;
  if (unchanged) return;

  const g = matrixOf(group.transform);
  const shift = applyLinear(g, { x: bounds.x, y: bounds.y });
  const groupTransform: Transform = [g.a, g.b, g.c, g.d, g.e + shift.x, g.f + shift.y];
  tx.set(groupId, 'transform', groupTransform);
  tx.set(groupId, 'size', { width: bounds.width, height: bounds.height });
  if (Math.abs(bounds.x) < EPSILON && Math.abs(bounds.y) < EPSILON) return;
  for (const child of childNodes) {
    const t = child.transform;
    tx.set(child.id, 'transform', [t[0], t[1], t[2], t[3], t[4] - bounds.x, t[5] - bounds.y] satisfies Transform);
  }
}
