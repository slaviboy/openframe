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
import { makeReaction, triggerAllowed } from '@/core/prototype/reactions';
import type { Reaction, SceneNode } from '@/core/schema/document';
import type { Editor } from '../editor';

const reactionsOf = (node: SceneNode | undefined): readonly Reaction[] => node?.reactions ?? [];

/** The layers among `ids` (pages, the document and resources have no interactions). */
function layers(editor: Editor, ids: readonly Id[]): SceneNode[] {
  return ids.map((id) => editor.doc.get(id)).filter((node): node is SceneNode => node !== undefined && 'transform' in node);
}

/**
 * Adds an interaction to each layer (in bulk for several): its first free trigger navigates to `destinationId`
 * instantly. One undo step; false when there are no layers.
 */
export function addInteraction(editor: Editor, ids: readonly Id[], destinationId: Id | null = null): boolean {
  const targets = layers(editor, ids);
  if (targets.length === 0) return false;
  editor.history.run('Add interaction', (tx) =>
    targets.forEach((node) => {
      const current = reactionsOf(tx.store.get(node.id) as SceneNode);
      tx.set(node.id, 'reactions', [...current, makeReaction(current, destinationId)]);
    }),
  );
  return true;
}

/**
 * Replaces an interaction of layers (its trigger, actions and animation). Layers that can't take the trigger (it would
 * repeat one they have) keep theirs. One undo step.
 */
export function updateInteraction(editor: Editor, ids: readonly Id[], index: number, reaction: Reaction): boolean {
  const targets = layers(editor, ids).filter((node) => reactionsOf(node)[index] !== undefined);
  if (targets.length === 0) return false;
  editor.history.run('Change interaction', (tx) =>
    targets.forEach((node) => {
      const current = reactionsOf(tx.store.get(node.id) as SceneNode);
      const trigger = triggerAllowed(current, reaction.trigger.type, index) ? reaction.trigger : current[index]!.trigger;
      tx.set(
        node.id,
        'reactions',
        current.map((existing, i) => (i === index ? { ...reaction, trigger } : existing)),
      );
    }),
  );
  return true;
}

/** Removes an interaction from layers. One undo step. */
export function removeInteraction(editor: Editor, ids: readonly Id[], index: number): boolean {
  const targets = layers(editor, ids).filter((node) => reactionsOf(node)[index] !== undefined);
  if (targets.length === 0) return false;
  editor.history.run('Remove interaction', (tx) =>
    targets.forEach((node) => {
      const next = reactionsOf(tx.store.get(node.id) as SceneNode).filter((_, i) => i !== index);
      tx.set(node.id, 'reactions', next.length > 0 ? next : undefined);
    }),
  );
  return true;
}
