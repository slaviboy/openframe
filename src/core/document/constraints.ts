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
import { valuesEqual } from '../ops/equality';
import type { Id } from '../ids/ids';
import type { Constraint, SceneNode, Size, Transform } from '../schema/document';

const EPSILON = 1e-6;
const round = (v: number) => Math.round(v * 100) / 100;

/** What the finalizer last wrote to each child during a transaction, so it can take back only its own changes. */
const written = new WeakMap<Transaction, Map<Id, { transform: Transform; size: Size }>>();

/** A field's value when the transaction began: the recorded set's previous value, or the current one. */
function original<T>(tx: Transaction, id: Id, field: string, current: T): T {
  const op = tx.ops.find((o) => o.kind === 'set' && o.id === id && o.field === field);
  return op && op.kind === 'set' ? (op.prev as T) : current;
}

/** One axis: the child's new start and length when its frame goes from `before` to `after` along it. */
export function constrainAxis(constraint: Constraint, start: number, length: number, before: number, after: number, resizable: boolean): [number, number] {
  const delta = after - before;
  switch (constraint) {
    case 'MIN':
      return [start, length];
    case 'MAX':
      return [round(start + delta), length];
    case 'CENTER':
      return [round(start + delta / 2), length];
    case 'STRETCH':
      return resizable ? [start, round(Math.max(0, length + delta))] : [round(start + delta / 2), length];
    case 'SCALE': {
      const k = before > 0 ? after / before : 1;
      return resizable ? [round(start * k), round(length * k)] : [round(start * k), length];
    }
  }
}

/**
 * Commit finalizer applying constraints: when a frame's size changes, each child keeps its relation to
 * the frame's edges (left, right, both, center, or proportionally). Children are positioned from their
 * values when the transaction began, so running before every preview frame of a drag doesn't compound,
 * and frames resized by their parent's constraints pass the change on to their own children.
 * `tx.ignoreConstraints` (⌘ while resizing, the Scale tool) keeps children where they started.
 */
export function constraintsFinalizer(tx: Transaction): void {
  const store = tx.store;
  const done = new Set<Id>();
  for (let i = 0; i < tx.ops.length; i++) {
    const op = tx.ops[i]!;
    if (op.kind !== 'set' || op.field !== 'size' || done.has(op.id)) continue;
    const frame = store.get(op.id);
    if (frame?.type !== 'FRAME') continue;
    done.add(op.id);
    const before = op.prev as Size | undefined;
    if (!before) continue;
    const after = frame.size;
    for (const childId of store.children(op.id)) {
      const child = store.get(childId) as SceneNode | undefined;
      if (!child || !('transform' in child)) continue;
      const constraints = child.constraints ?? { horizontal: 'MIN', vertical: 'MIN' };
      const transform = original<Transform>(tx, childId, 'transform', child.transform);
      const size = original<Size>(tx, childId, 'size', child.size);
      const writes = written.get(tx) ?? new Map<Id, { transform: Transform; size: Size }>();
      written.set(tx, writes);
      if (tx.ignoreConstraints || (constraints.horizontal === 'MIN' && constraints.vertical === 'MIN')) {
        // Take back only this finalizer's own adjustments (⌘ pressed during a drag); other changes to the
        // child in this transaction, such as the Scale tool scaling it, stay.
        const mine = writes.get(childId);
        if (mine && valuesEqual(child.transform, mine.transform) && valuesEqual(child.size, mine.size)) {
          tx.set(childId, 'transform', transform);
          tx.set(childId, 'size', size);
        }
        writes.delete(childId);
        continue;
      }
      const axisAligned = Math.abs(transform[1]) < EPSILON && Math.abs(transform[2]) < EPSILON;
      const [x, width] = constrainAxis(constraints.horizontal, transform[4], size.width, before.width, after.width, axisAligned);
      // Lines have no height to stretch.
      const [y, height] = constrainAxis(constraints.vertical, transform[5], size.height, before.height, after.height, axisAligned && child.type !== 'LINE');
      const next = [...transform] as unknown as Transform;
      (next as unknown as number[])[4] = x;
      (next as unknown as number[])[5] = y;
      const nextSize = { width, height };
      tx.set(childId, 'transform', next);
      tx.set(childId, 'size', nextSize);
      writes.set(childId, { transform: next, size: nextSize });
    }
  }
}
