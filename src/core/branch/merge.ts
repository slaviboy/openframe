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
import type { Op } from '../ops/ops';
import type { Id } from '../ids/ids';
import type { Node } from '../schema/document';

/** Which side of a merge a value came from: the file being merged into, or the one being merged in. */
export type MergeSide = 'ours' | 'theirs';

/** A field the two sides moved apart on, which has to be settled by hand. */
export interface MergeConflict {
  readonly nodeId: Id;
  readonly nodeName: string;
  /** The field they disagree on, or `'existence'` when one side deleted what the other changed. */
  readonly field: string;
  readonly ours: unknown;
  readonly theirs: unknown;
}

/** What merging one document into another comes to. */
export interface MergeResult {
  /** The changes that bring `ours` to the merge, leaving the conflicts as they are on our side. */
  readonly ops: readonly Op[];
  readonly conflicts: readonly MergeConflict[];
  /** How many layers came across, changed and went, not counting what is in conflict. */
  readonly added: number;
  readonly changed: number;
  readonly removed: number;
}

/** The fields a merge never reads: they say where a node is in the tree, which is handled on its own. */
const STRUCTURAL: ReadonlySet<string> = new Set(['id', 'type']);

const same = (a: unknown, b: unknown): boolean => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

/** Every field either side of a node carries. */
function fieldsOf(...nodes: readonly (Node | undefined)[]): string[] {
  const out = new Set<string>();
  for (const node of nodes) {
    if (!node) continue;
    for (const field of Object.keys(node)) if (!STRUCTURAL.has(field)) out.add(field);
  }
  return [...out];
}

/** How deep a node sits, so parents can be made before their children and taken away after them. */
function depth(store: DocumentStore, id: Id): number {
  let count = 0;
  for (let cur = store.parentOf(id); cur !== null; cur = store.parentOf(cur)) count += 1;
  return count;
}

/** Every node a store holds, the root included. */
function allIds(store: DocumentStore): Id[] {
  const out: Id[] = [];
  const walk = (id: Id) => {
    out.push(id);
    for (const child of store.children(id)) walk(child);
  };
  walk('0:0');
  return out;
}

/**
 * Merges `theirs` into `ours`, both having grown from `base`.
 *
 * A change made on one side alone is taken. A change both sides made the same way is already there. A field the two
 * moved apart on is left as ours and reported as a conflict, for someone to settle. A layer added on their side comes
 * across; one they deleted goes, unless we changed it, which is a conflict of its own.
 */
export function mergeDocuments(base: DocumentStore, ours: DocumentStore, theirs: DocumentStore): MergeResult {
  const ops: Op[] = [];
  const conflicts: MergeConflict[] = [];
  let added = 0;
  let changed = 0;
  let removed = 0;

  const ids = new Set<Id>([...allIds(base), ...allIds(ours), ...allIds(theirs)]);

  // What they added, parents first, so a child always has somewhere to land.
  const incoming = [...ids].filter((id) => base.get(id) === undefined && ours.get(id) === undefined && theirs.get(id) !== undefined);
  incoming.sort((a, b) => depth(theirs, a) - depth(theirs, b));
  for (const id of incoming) {
    const node = theirs.getOrThrow(id);
    // A layer whose parent is not here either was brought in just above; one with nowhere to go is left behind.
    if (node.type !== 'DOCUMENT' && ours.get(node.parent.id) === undefined && !incoming.includes(node.parent.id)) continue;
    ops.push({ kind: 'create', node });
    added += 1;
  }

  // What they changed, and what they deleted.
  const outgoing: Id[] = [];
  for (const id of ids) {
    const inBase = base.get(id);
    const inOurs = ours.get(id);
    const inTheirs = theirs.get(id);
    if (inOurs === undefined) continue;

    if (inTheirs === undefined && inBase !== undefined) {
      // They took it away. If we left it alone it goes; if we changed it, that is for someone to settle.
      const ourFields = fieldsOf(inBase, inOurs);
      const touched = ourFields.some((field) => !same((inBase as Record<string, unknown>)[field], (inOurs as Record<string, unknown>)[field]));
      if (touched) conflicts.push({ nodeId: id, nodeName: inOurs.name, field: 'existence', ours: 'kept', theirs: 'deleted' });
      else outgoing.push(id);
      continue;
    }
    if (inTheirs === undefined || inBase === undefined) continue;

    for (const field of fieldsOf(inBase, inOurs, inTheirs)) {
      const wasThere = (inBase as Record<string, unknown>)[field];
      const mine = (inOurs as Record<string, unknown>)[field];
      const yours = (inTheirs as Record<string, unknown>)[field];
      if (same(mine, yours)) continue;
      const iMoved = !same(wasThere, mine);
      const youMoved = !same(wasThere, yours);
      if (!youMoved) continue;
      if (iMoved) {
        conflicts.push({ nodeId: id, nodeName: inOurs.name, field, ours: mine, theirs: yours });
        continue;
      }
      ops.push({ kind: 'set', id, field, value: yours, prev: mine });
      changed += 1;
    }
  }

  // Children before their parents, since nothing is taken away while it still holds something.
  outgoing.sort((a, b) => depth(ours, b) - depth(ours, a));
  for (const id of outgoing) {
    ops.push({ kind: 'delete', node: ours.getOrThrow(id) });
    removed += 1;
  }

  return { ops, conflicts, added, changed, removed };
}

/** Settles a conflict by taking one side's value, as an op to apply on top of the merge. */
export function resolveConflict(conflict: MergeConflict, side: MergeSide): Op | null {
  if (conflict.field === 'existence') return null;
  return side === 'ours' ? null : { kind: 'set', id: conflict.nodeId, field: conflict.field, value: conflict.theirs, prev: conflict.ours };
}
