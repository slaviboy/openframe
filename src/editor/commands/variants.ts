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

import { isMainComponent } from '@/core/document/instances';
import { isComponentSet, variantNamesFromComponents } from '@/core/document/variants';
import type { Id } from '@/core/ids/ids';
import type { SceneNode } from '@/core/schema/document';
import type { Editor } from '../editor';
import { selectedSceneNodes } from './selection-helpers';
import { wrapNodes } from './structure';

/** Component sets have a dashed purple stroke and no fill by default. */
const COMPONENT_SET_STROKE = { type: 'SOLID', color: { r: 0x97 / 255, g: 0x47 / 255, b: 1, a: 1 }, opacity: 1, visible: true, blendMode: 'NORMAL' } as const;
const COMPONENT_SET_DASHES = [10, 5];

/** Whether Combine as variants applies: two or more main components sharing a parent that isn't a component set already. */
export function canCombineAsVariants(editor: Editor): boolean {
  const ids = selectedSceneNodes(editor);
  if (ids.length < 2) return false;
  const parent = editor.doc.parentOf(ids[0]!);
  if (parent === null || isComponentSet(editor.doc.get(parent) as SceneNode | undefined)) return false;
  return ids.every((id) => editor.doc.parentOf(id) === parent && isMainComponent(editor.doc.get(id) as SceneNode));
}

/**
 * Combine as variants: puts the selected main components in a component set, keeping their layout. Using
 * the slash naming convention, the text before the first `/` names the set and the other parts become the
 * variants' property values. The set is selected; one undo step.
 */
export function combineAsVariants(editor: Editor): Id | null {
  if (!canCombineAsVariants(editor)) return null;
  const selected = new Set(selectedSceneNodes(editor));
  const parent = editor.doc.parentOf([...selected][0]!)!;
  const ids = editor.doc.children(parent).filter((id) => selected.has(id));
  const { setName, variants } = variantNamesFromComponents(ids.map((id) => (editor.doc.get(id) as SceneNode).name));
  const setId = editor.ids.next();
  editor.history.run('Combine as variants', (tx) => {
    ids.forEach((id, i) => tx.set(id, 'name', variants[i]!));
    wrapNodes(tx, editor, ids, 'FRAME', setId, {
      after: (t, container) => {
        t.set(container, 'name', setName);
        t.set(container, 'fills', []);
        t.set(container, 'strokes', [COMPONENT_SET_STROKE]);
        t.set(container, 'strokeDashes', COMPONENT_SET_DASHES);
        t.set(container, 'componentSet', {});
      },
    });
  });
  editor.state.select([setId]);
  return setId;
}
