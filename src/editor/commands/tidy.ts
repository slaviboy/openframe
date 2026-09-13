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
import type { Rect } from '@/core/math/rect';
import { tidyLayout } from '@/core/scene/tidy';
import type { SceneNode } from '@/core/schema/document';
import type { Editor } from '../editor';
import { captureStart, translateNodes } from '../interactions/transform';
import { selectedSceneNodes } from './selection-helpers';

const tidyTargets = (editor: Editor): Id[] => selectedSceneNodes(editor).filter((id) => !(editor.doc.get(id) as SceneNode).locked);

export const canTidyUp = (editor: Editor): boolean => tidyTargets(editor).length >= 2;

/** Tidy up (⌃⌥T): arranges the selected unlocked layers into an evenly spaced grid in one undo step. */
export function tidyUpSelection(editor: Editor): void {
  const ids = tidyTargets(editor);
  if (ids.length < 2) return;
  editor.scene.ensure(editor.pageId);
  const items = ids.map((id) => ({ id, bounds: editor.scene.worldBounds(id) })).filter((i): i is { id: Id; bounds: Rect } => i.bounds !== null);
  const positions = tidyLayout(items.map((i) => i.bounds));
  editor.history.run('Tidy up', (tx) => {
    items.forEach((item, i) => {
      const target = positions[i]!;
      const delta = { x: target.x - item.bounds.x, y: target.y - item.bounds.y };
      if (Math.abs(delta.x) < 1e-9 && Math.abs(delta.y) < 1e-9) return;
      translateNodes(tx, [captureStart(tx, editor.scene, item.id)], delta);
    });
  });
}
