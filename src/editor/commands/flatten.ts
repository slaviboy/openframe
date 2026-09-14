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
import { canFlattenLayer, flattenLayers } from '@/core/vector/flatten';
import type { Editor } from '../editor';
import { selectedSceneNodes } from './selection-helpers';

const unlockedSelection = (editor: Editor): Id[] => selectedSceneNodes(editor).filter((id) => !(editor.doc.get(id) as SceneNode).locked);

/** Flatten is available when a selected, unlocked layer has an outline to flatten. */
export const canFlatten = (editor: Editor): boolean => unlockedSelection(editor).some((id) => canFlattenLayer(editor.doc, id));

/** Flatten (⌥⇧F): merges the selected layers into one vector layer, selected afterwards, in one undo step. */
export function flattenSelection(editor: Editor): void {
  const ids = unlockedSelection(editor);
  if (ids.length === 0) return;
  let created: Id | null = null;
  editor.history.run('Flatten', (tx) => {
    created = flattenLayers(tx, ids, () => editor.ids.next());
  });
  if (created) editor.state.select([created]);
}
