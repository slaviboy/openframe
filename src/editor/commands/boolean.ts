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

import type { Id } from '@/core/ids/ids';
import type { BooleanOperation, BooleanOperationNode, SceneNode } from '@/core/schema/document';
import type { Editor } from '../editor';
import { selectedSceneNodes } from './selection-helpers';
import { wrapSelection } from './structure';

export const BOOLEAN_NAMES: Record<BooleanOperation, string> = {
  UNION: 'Union',
  SUBTRACT: 'Subtract',
  INTERSECT: 'Intersect',
  EXCLUDE: 'Exclude',
};

/** Boolean operations apply to shapes, vectors, text and groups — not frames, sections or slices. */
const UNSUPPORTED: ReadonlySet<string> = new Set(['FRAME', 'SECTION', 'SLICE']);

/** The appearance a new boolean group takes over from one of its layers. */
const APPEARANCE = ['fills', 'strokes', 'strokeWeight', 'strokeAlign', 'strokeDashes', 'strokeCap', 'strokeJoin', 'strokeMiterAngle', 'effects'] as const;

/** The one boolean group the selection is, whose operation the same commands change. */
function selectedBooleanGroup(editor: Editor): BooleanOperationNode | null {
  const ids = selectedSceneNodes(editor);
  const only = ids.length === 1 ? (editor.doc.get(ids[0]!) as SceneNode | undefined) : undefined;
  return only?.type === 'BOOLEAN_OPERATION' && !only.locked ? only : null;
}

/** A boolean operation needs at least two unlocked, supported layers, or one boolean group to change. */
export function canBooleanSelection(editor: Editor): boolean {
  const ids = selectedSceneNodes(editor);
  if (selectedBooleanGroup(editor)) return true;
  return (
    ids.length >= 2 &&
    ids.every((id) => {
      const node = editor.doc.get(id) as SceneNode;
      return !UNSUPPORTED.has(node.type) && !node.locked;
    })
  );
}

/**
 * Wraps the selection in a boolean group named after its operation, selected afterwards, in one undo
 * step. The group takes its fill, stroke and effects from the top layer — the bottom layer for subtract.
 */
export function booleanSelection(editor: Editor, operation: BooleanOperation): Id | null {
  if (!canBooleanSelection(editor)) return null;
  const name = BOOLEAN_NAMES[operation];

  // A boolean group already selected takes the new operation instead of being wrapped in another group.
  const group = selectedBooleanGroup(editor);
  if (group) {
    if (group.booleanOperation === operation) return group.id;
    editor.history.run(`${name} selection`, (tx) => {
      tx.set(group.id, 'booleanOperation', operation);
      // A group still called after its old operation is renamed, keeping the number a repeated name is given;
      // one the designer named keeps that name.
      const named = new RegExp(`^(?:${Object.values(BOOLEAN_NAMES).join('|')})( \\d+)?$`).exec(group.name);
      if (named) tx.set(group.id, 'name', `${name}${named[1] ?? ''}`);
    });
    return group.id;
  }

  return wrapSelection(editor, 'GROUP', {
    label: `${name} selection`,
    name,
    booleanOperation: operation,
    after: (tx, containerId, ids) => {
      const source = tx.store.getOrThrow(operation === 'SUBTRACT' ? ids[0]! : ids.at(-1)!) as unknown as Record<string, unknown>;
      for (const field of APPEARANCE) {
        if (source[field] !== undefined) tx.set(containerId, field, structuredClone(source[field]) as never);
      }
    },
  });
}
