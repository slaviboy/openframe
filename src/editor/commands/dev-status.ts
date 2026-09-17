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

import type { Finalizer } from '@/core/history/history';
import type { Id } from '@/core/ids/ids';
import type { DevStatus, Node, SceneNode } from '@/core/schema/document';
import type { Editor } from '../editor';

/** The layers a developer hands off from: sections, frames and the components made of them. */
export type DevStatusNode = SceneNode & { readonly devStatus?: DevStatus };

/** Whether a layer is one Dev Mode's statuses can be put on. */
export const canHaveDevStatus = (node: Node | undefined): node is DevStatusNode => node?.type === 'FRAME' || node?.type === 'SECTION';

/** The status a layer carries, if it has been marked. */
export function devStatusOf(editor: Editor, id: Id): DevStatus | undefined {
  const node = editor.doc.get(id);
  return canHaveDevStatus(node) ? node.devStatus : undefined;
}

/** How a status reads in the interface. */
export function devStatusLabel(status: DevStatus): string {
  const name = status.state === 'READY_FOR_DEV' ? 'Ready for dev' : 'Completed';
  return status.changed ? `${name} (changed)` : name;
}

/**
 * Marks the layers ready for dev or completed, or takes the status off. Marking again is also how a design that has
 * changed since it was last marked is settled: it clears the changed state.
 */
export function setDevStatus(editor: Editor, ids: readonly Id[], state: DevStatus['state'] | null): boolean {
  const layers = ids.filter((id) => canHaveDevStatus(editor.doc.get(id)));
  if (layers.length === 0) return false;
  editor.history.run(state === null ? 'Remove dev status' : state === 'READY_FOR_DEV' ? 'Mark as ready for dev' : 'Mark as completed', (tx) => {
    for (const id of layers) tx.set(id, 'devStatus', state === null ? undefined : { state });
  });
  return true;
}

/** Every marked layer on a page, in the order the page holds them. */
export function devStatusLayers(editor: Editor, pageId: Id): DevStatusNode[] {
  const out: DevStatusNode[] = [];
  const walk = (id: Id) => {
    for (const child of editor.doc.children(id)) {
      const node = editor.doc.get(child);
      if (canHaveDevStatus(node) && node.devStatus) out.push(node);
      walk(child);
    }
  };
  walk(pageId);
  return out;
}

/** Whether a page holds anything marked, which is what puts the Dev Mode badge on it. */
export const pageHasDevStatus = (editor: Editor, pageId: Id): boolean => devStatusLayers(editor, pageId).length > 0;

/**
 * Editing a design that was marked ready for dev or completed puts it in the changed state, so a developer can see
 * that it has moved on since they last looked. It is never set by hand, and marking the design again clears it.
 *
 * Changes that are not the design moving on do not count: setting the status itself, and the values a variable or a
 * style carries (a layer bound to one keeps the same design when that value changes elsewhere).
 */
export const devStatusFinalizer: Finalizer = (tx) => {
  const touched = new Set<Id>();
  for (const op of tx.ops) {
    if (op.kind === 'set' && (op.field === 'devStatus' || op.field === 'boundVariables' || op.field === 'fillStyleId' || op.field === 'strokeStyleId')) continue;
    const from = op.kind === 'set' ? op.id : op.node.id;
    // The status belongs to the design as a whole, so a change anywhere inside it marks the design.
    for (let id: Id | null = from; id !== null; id = tx.store.parentOf(id)) {
      const node = tx.store.get(id);
      if (canHaveDevStatus(node) && node.devStatus && !node.devStatus.changed) touched.add(id);
    }
  }
  for (const id of touched) {
    const node = tx.store.get(id);
    if (canHaveDevStatus(node) && node.devStatus) tx.set(id, 'devStatus', { ...node.devStatus, changed: true });
  }
};
