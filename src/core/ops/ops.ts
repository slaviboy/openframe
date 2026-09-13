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
import type { Node } from '../schema/document';

/**
 * Document operations. Every op carries enough information to be inverted
 * exactly, which is what powers undo/redo, cancelation of in-progress gestures,
 * and journal replay.
 */
export type Op =
  | { readonly kind: 'create'; readonly node: Node }
  | { readonly kind: 'delete'; readonly node: Node }
  | {
      readonly kind: 'set';
      readonly id: Id;
      readonly field: string;
      readonly value: unknown;
      /** Value before this op (undefined = field absent). */
      readonly prev: unknown;
    };

export function invertOp(op: Op): Op {
  switch (op.kind) {
    case 'create':
      return { kind: 'delete', node: op.node };
    case 'delete':
      return { kind: 'create', node: op.node };
    case 'set':
      return { kind: 'set', id: op.id, field: op.field, value: op.prev, prev: op.value };
  }
}

export const invertOps = (ops: readonly Op[]): Op[] => ops.map(invertOp).reverse();

/** Id of the node an op targets. */
export const opTarget = (op: Op): Id => (op.kind === 'set' ? op.id : op.node.id);
