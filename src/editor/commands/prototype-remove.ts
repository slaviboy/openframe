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
import { topLevelFrame } from '@/core/prototype/reactions';
import type { PrototypeAction, Reaction, SceneNode } from '@/core/schema/document';
import type { Editor } from '../editor';

/** The layers on a page that have interactions. */
function layersWithInteractions(editor: Editor, pageId: Id): SceneNode[] {
  const out: SceneNode[] = [];
  const visit = (id: Id) => {
    const node = editor.doc.get(id);
    if (node && 'transform' in node && node.reactions?.length) out.push(node);
    editor.doc.children(id).forEach(visit);
  };
  visit(pageId);
  return out;
}

/** Whether a page has any interaction. */
export const hasInteractions = (editor: Editor, pageId: Id = editor.pageId): boolean => layersWithInteractions(editor, pageId).length > 0;

/** Remove all interactions: every interaction on a page, and so every connection. One undo step; false when there are none. */
export function removeAllInteractions(editor: Editor, pageId: Id = editor.pageId): boolean {
  const layers = layersWithInteractions(editor, pageId);
  if (layers.length === 0) return false;
  editor.history.run('Remove all interactions', (tx) => layers.forEach((node) => tx.set(node.id, 'reactions', undefined)));
  editor.state.selectConnections([]);
  return true;
}

/**
 * Deletes an overlay (its badge selected, then Delete): the Open overlay and Swap overlay actions that lead to the frame
 * are removed from the page's interactions (in Conditionals too), and interactions left without actions go with them.
 * The frame stays. One undo step; false when nothing opens it.
 */
export function removeOverlayInteractions(editor: Editor, frameId: Id, pageId: Id = editor.pageId): boolean {
  const opens = (action: PrototypeAction) => action.type === 'NODE' && (action.navigation === 'OVERLAY' || action.navigation === 'SWAP') && action.destinationId !== null && topLevelFrame(editor.doc, action.destinationId) === frameId;
  const strip = (actions: readonly PrototypeAction[]): PrototypeAction[] =>
    actions.filter((action) => !opens(action)).map((action) => (action.type === 'CONDITIONAL' ? { ...action, blocks: action.blocks.map((block) => ({ ...block, actions: strip(block.actions) })) } : action));
  const changes: { readonly id: Id; readonly reactions: Reaction[] }[] = [];
  for (const node of layersWithInteractions(editor, pageId)) {
    const reactions = (node.reactions ?? []).map((reaction) => ({ ...reaction, actions: strip(reaction.actions) })).filter((reaction) => reaction.actions.length > 0);
    if (JSON.stringify(reactions) !== JSON.stringify(node.reactions)) changes.push({ id: node.id, reactions });
  }
  if (changes.length === 0) return false;
  editor.history.run('Delete overlay', (tx) => changes.forEach(({ id, reactions }) => tx.set(id, 'reactions', reactions.length > 0 ? reactions : undefined)));
  return true;
}
