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
import type { FontLoader } from '@/core/text/glyph-paths';
import type { Editor } from '../editor';
import { replaceTextWithOutlines, textLayersUnder, textOutlinesFor } from './outline-text';
import { selectedSceneNodes } from './selection-helpers';

const unlockedSelection = (editor: Editor): Id[] => selectedSceneNodes(editor).filter((id) => !(editor.doc.get(id) as SceneNode).locked);

/** Flatten is available when a selected, unlocked layer has an outline to flatten, text counting as one. */
export const canFlatten = (editor: Editor): boolean => {
  const ids = unlockedSelection(editor);
  return ids.some((id) => canFlattenLayer(editor.doc, id)) || (editor.textLayout?.glyphPlacements !== undefined && textLayersUnder(editor, ids).length > 0);
};

/**
 * Flatten (⌥⇧F): merges the selected layers into one vector layer, selected afterwards, in one undo step. Text
 * is read out as its glyphs' outlines first, in the same step, so a layer with words in it flattens like any
 * other; text whose outlines can't be read is left as it is and contributes nothing, as before.
 */
export async function flattenSelection(editor: Editor, load: FontLoader): Promise<void> {
  const ids = unlockedSelection(editor);
  if (ids.length === 0) return;
  // The outlines are read before the document is touched, since reading a font file has to be waited for.
  const outlines = await textOutlinesFor(editor, textLayersUnder(editor, ids), load);
  let created: Id | null = null;
  editor.history.run('Flatten', (tx) => {
    const replaced = replaceTextWithOutlines(tx, editor, outlines);
    created = flattenLayers(
      tx,
      ids.map((id) => replaced.get(id) ?? id),
      () => editor.ids.next(),
    );
  });
  if (created) editor.state.select([created]);
}
