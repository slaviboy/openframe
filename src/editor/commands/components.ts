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
import { wrapSelection } from './structure';

/** Whether a layer is a main component: a frame marked as one. */
export const isComponent = (node: SceneNode | undefined): boolean => node?.type === 'FRAME' && node.component !== undefined;

/** Create component is available for a selection of layers that aren't sections and isn't already a single component. */
export function canCreateComponent(editor: Editor): boolean {
  const nodes = selectedSceneNodes(editor).map((id) => editor.doc.get(id) as SceneNode);
  if (nodes.length === 0 || nodes.some((n) => n.type === 'SECTION')) return false;
  return !(nodes.length === 1 && isComponent(nodes[0]));
}

/**
 * Create component (⌥⌘K): a single selected frame becomes a component itself; any other selection is
 * nested in a new component frame (without a fill) named "Component". The component is selected; one
 * undo step.
 */
export function createComponent(editor: Editor): Id | null {
  if (!canCreateComponent(editor)) return null;
  const ids = selectedSceneNodes(editor);
  const only = ids.length === 1 ? (editor.doc.get(ids[0]!) as SceneNode) : null;
  if (only?.type === 'FRAME') {
    editor.history.run('Create component', (tx) => tx.set(only.id, 'component', {}));
    editor.state.select([only.id]);
    return only.id;
  }
  return wrapSelection(editor, 'FRAME', {
    label: 'Create component',
    name: 'Component',
    after: (tx, containerId) => {
      tx.set(containerId, 'fills', []);
      tx.set(containerId, 'component', {});
    },
  });
}
