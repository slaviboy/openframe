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

import { repeatMatrices, repeats } from '@/core/geometry/repeat';
import type { Id } from '@/core/ids/ids';
import { multiply } from '@/core/math/matrix';
import { matrixOf } from '@/core/scene/scene-index';
import { toTransform } from '../interactions/transform';
import { isSceneNode, type GroupNode, type RepeatTransform, type SceneNode } from '@/core/schema/document';
import type { Editor } from '../editor';
import { duplicateNodes } from './structure';
import { wrapSelection } from './structure';

/** A radial repeat as it starts out: six copies around the circle. */
export const DEFAULT_RADIAL: RepeatTransform = { kind: 'RADIAL', count: 6, spacing: 0 };

/** A linear repeat as it starts out: three copies, a shape's width apart (set when it is added). */
export const DEFAULT_LINEAR: RepeatTransform = { kind: 'LINEAR', count: 3, spacing: 100, direction: 'HORIZONTAL' };

/** The transform group of the selection: a selected group that carries a repeat. */
export function selectedRepeatGroup(editor: Editor): GroupNode | null {
  const [id, ...rest] = editor.selection;
  if (id === undefined || rest.length > 0) return null;
  const node = editor.doc.get(id);
  return node?.type === 'GROUP' && node.repeat ? node : null;
}

/**
 * Adds a transform to the selection: the layers go into a group that repeats them, around a center (radial) or along a
 * line (linear). A selected transform group takes the new kind instead of being wrapped again. Nothing is copied: the
 * repeats are drawn, and Apply transforms turns them into layers.
 */
export function addRepeatTransform(editor: Editor, kind: RepeatTransform['kind']): Id | null {
  const existing = selectedRepeatGroup(editor);
  const repeat = kind === 'RADIAL' ? DEFAULT_RADIAL : DEFAULT_LINEAR;
  if (existing) {
    editor.history.run('Change transform', (tx) => tx.set(existing.id, 'repeat', { ...repeat, ...(kind === 'LINEAR' ? { spacing: Math.round(existing.size.width) || repeat.spacing } : {}) }));
    return existing.id;
  }
  if (editor.selection.length === 0) return null;
  const groupId = wrapSelection(editor, 'GROUP', { label: kind === 'RADIAL' ? 'Add radial repeat' : 'Add linear repeat' });
  if (groupId === null) return null;
  const group = editor.doc.get(groupId);
  const spacing = group && isSceneNode(group) ? Math.round(group.size.width) || repeat.spacing : repeat.spacing;
  editor.history.run(kind === 'RADIAL' ? 'Add radial repeat' : 'Add linear repeat', (tx) => tx.set(groupId, 'repeat', kind === 'LINEAR' ? { ...repeat, spacing } : repeat));
  return groupId;
}

/** Changes a transform group's repeat: how many copies there are, how far apart, along which line, over what angle. */
export function setRepeatTransform(editor: Editor, id: Id, patch: Partial<RepeatTransform>): boolean {
  const node = editor.doc.get(id);
  if (node?.type !== 'GROUP' || !node.repeat) return false;
  editor.history.run('Change transform', (tx) => tx.set(id, 'repeat', { ...node.repeat!, ...patch }));
  return true;
}

/** Removes a transform, leaving the group with its original contents. */
export function removeRepeatTransform(editor: Editor, id: Id): boolean {
  const node = editor.doc.get(id);
  if (node?.type !== 'GROUP' || !node.repeat) return false;
  editor.history.run('Remove transform', (tx) => tx.set(id, 'repeat', undefined));
  return true;
}

export const canApplyTransforms = (editor: Editor): boolean => editor.selection.some((id) => (editor.doc.get(id) as GroupNode | undefined)?.repeat !== undefined);

/**
 * Apply transforms to selection: each repeated copy becomes real layers in the transform group, placed where it was
 * drawn, and the transform itself goes away. One undo step.
 */
export function applyTransforms(editor: Editor): boolean {
  const groups = editor.selection.map((id) => editor.doc.get(id)).filter((node): node is GroupNode => node?.type === 'GROUP' && repeats(node.repeat));
  if (groups.length === 0) return false;
  editor.history.run('Apply transforms', (tx) => {
    for (const group of groups) {
      // A snapshot: the copies are added to this group as they are made, and only the originals are repeated.
      const children = [...tx.store.children(group.id)];
      // The original stays as it is; every other copy is duplicated and moved to where it was drawn.
      for (const copy of repeatMatrices(group.repeat!, group.size).slice(1)) {
        const { clones } = duplicateNodes(tx, editor, children);
        for (const clone of clones) {
          const node = tx.store.getOrThrow(clone) as SceneNode;
          tx.set(clone, 'transform', toTransform(multiply(copy, matrixOf(node.transform))));
        }
      }
      tx.set(group.id, 'repeat', undefined);
    }
  });
  return true;
}
