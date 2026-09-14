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
import type { SceneNode } from '@/core/schema/document';
import type { Editor } from '../editor';
import { selectedSceneNodes } from './selection-helpers';

const selectedInstances = (editor: Editor): Id[] =>
  selectedSceneNodes(editor).filter((id) => {
    const node = editor.doc.get(id) as SceneNode | undefined;
    return node?.type === 'FRAME' && node.instance !== undefined;
  });

/** Detach instance is available when the selection includes an instance. */
export const canDetachInstance = (editor: Editor): boolean => selectedInstances(editor).length > 0;

/**
 * Detach instance (⌥⌘B): each selected instance becomes a regular frame that keeps its current layers
 * and properties, without its link to the main component, so later changes to the component no longer
 * reach it. One undo step; the selection stays.
 */
export function detachInstances(editor: Editor): Id[] {
  const ids = selectedInstances(editor);
  if (ids.length === 0) return [];
  editor.history.run('Detach instance', (tx) => {
    for (const id of ids) {
      tx.set(id, 'instance', undefined);
      for (const layerId of [...tx.store.descendants(id, false)]) {
        const layer = tx.store.get(layerId) as SceneNode | undefined;
        if (layer?.source !== undefined) tx.set(layerId, 'source', undefined);
        if (layer?.overrides !== undefined) tx.set(layerId, 'overrides', undefined);
      }
    }
  });
  return ids;
}
