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
import type { Size, VectorNode } from '../schema/document';
import { transformNetwork } from './vector-network';

/** The network this finalizer last wrote to each vector layer during a transaction. */
const written = new WeakMap<Transaction, Map<Id, unknown>>();

/**
 * Keeps vector networks in step with their layers' sizes: when a vector layer is resized, its network
 * scales from the size and network the transaction started with (so previews during a drag don't
 * compound). A network set by the transaction itself — the Pen adding a point, say — already matches
 * its size and is left alone.
 */
export function vectorFinalizer(tx: Transaction): void {
  const mine = written.get(tx) ?? new Map<Id, unknown>();
  written.set(tx, mine);
  for (let i = 0; i < tx.ops.length; i++) {
    const op = tx.ops[i]!;
    if (op.kind !== 'set' || op.field !== 'size') continue;
    const node = tx.store.get(op.id);
    if (node?.type !== 'VECTOR') continue;
    const before = op.prev as Size | undefined;
    if (!before) continue;
    const networkOp = tx.ops.find((o) => o.kind === 'set' && o.id === op.id && o.field === 'vectorNetwork');
    if (networkOp && networkOp.kind === 'set' && networkOp.value !== mine.get(op.id)) continue;
    const original = (networkOp && networkOp.kind === 'set' ? networkOp.prev : node.vectorNetwork) as VectorNode['vectorNetwork'];
    const sx = before.width > 0 ? node.size.width / before.width : 1;
    const sy = before.height > 0 ? node.size.height / before.height : 1;
    const scaled = transformNetwork(original, { x: 0, y: 0 }, sx, sy) as VectorNode['vectorNetwork'];
    tx.set(op.id, 'vectorNetwork', scaled);
    mine.set(op.id, scaled);
  }
}
