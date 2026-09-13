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

import type { Transaction } from '@/core/history/history';
import type { Id } from '@/core/ids/ids';
import type { MaskType } from '@/core/scene/masks';
import { isSceneNode, type SceneNode } from '@/core/schema/document';
import type { Editor } from '../editor';
import { wrapSelection } from './structure';

/** Selected layers that can be masks (sections and slices cannot). */
function maskableSelection(editor: Editor): SceneNode[] {
  return editor.selection
    .map((id) => editor.doc.get(id))
    .filter((n): n is SceneNode => n !== undefined && isSceneNode(n) && n.type !== 'SECTION' && n.type !== 'SLICE');
}

/** Whether "Use as mask" / "Remove mask" applies: every selected layer is maskable. */
export function canToggleMask(editor: Editor): boolean {
  const nodes = maskableSelection(editor);
  return nodes.length > 0 && nodes.length === editor.selection.length;
}

/** Whether every selected layer is a mask (so the command removes masks). */
export function selectionIsMask(editor: Editor): boolean {
  const nodes = maskableSelection(editor);
  return nodes.length > 0 && nodes.every((n) => n.isMask);
}

/**
 * Use as mask / Remove mask (⌃⌘M):
 * - selected masks stop being masks
 * - a single layer becomes a mask for the siblings above it
 * - several layers are grouped into a "Mask group" whose bottom-most layer is the mask
 * One undo step. Returns the affected mask or group.
 */
export function toggleMask(editor: Editor): Id | null {
  if (!canToggleMask(editor)) return null;
  const nodes = maskableSelection(editor);
  if (nodes.every((n) => n.isMask)) {
    editor.history.run(nodes.length === 1 ? 'Remove mask' : 'Remove masks', (tx) => nodes.forEach((n) => removeMask(tx, n)));
    return nodes[0]!.id;
  }
  if (nodes.length === 1) {
    editor.history.run('Use as mask', (tx) => tx.set(nodes[0]!.id, 'isMask', true));
    return nodes[0]!.id;
  }
  return wrapSelection(editor, 'GROUP', {
    label: 'Use as mask',
    name: 'Mask group',
    after: (tx, _group, ids) => {
      tx.set(ids[0]!, 'isMask', true);
    },
  });
}

function removeMask(tx: Transaction, node: SceneNode): void {
  tx.set(node.id, 'isMask', undefined);
  if (node.maskType) tx.set(node.id, 'maskType', undefined);
}

/** Sets how a mask reveals content (Alpha is stored as absent). */
export function setMaskType(tx: Transaction, node: SceneNode, type: MaskType): void {
  if (node.isMask) tx.set(node.id, 'maskType', type === 'ALPHA' ? undefined : type);
}
