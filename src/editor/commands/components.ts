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
import type { Id } from '@/core/ids/ids';
import type { SceneNode } from '@/core/schema/document';
import type { Editor } from '../editor';
import { selectedSceneNodes } from './selection-helpers';
import { wrapNodes, wrapSelection } from './structure';

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

/** Whether Create multiple components applies: two or more selected layers, no sections, and at least one that isn't a main component yet. */
export function canCreateMultipleComponents(editor: Editor): boolean {
  const nodes = selectedSceneNodes(editor).map((id) => editor.doc.get(id) as SceneNode);
  return nodes.length > 1 && !nodes.some((n) => n.type === 'SECTION') && nodes.some((n) => !isMainComponent(n));
}

/**
 * Create multiple components: each selected layer becomes a component of its own, as one undo step. A frame
 * becomes the component itself; any other layer (a group, boolean group, path or shape) is nested in its own
 * component frame without a fill. Main components stay as they are. The new components are selected.
 */
export function createMultipleComponents(editor: Editor): Id[] {
  if (!canCreateMultipleComponents(editor)) return [];
  const ids = selectedSceneNodes(editor).filter((id) => !isMainComponent(editor.doc.get(id) as SceneNode));
  const created: Id[] = [];
  editor.history.run('Create multiple components', (tx) => {
    for (const id of ids) {
      const node = tx.store.getOrThrow(id) as SceneNode;
      if (node.type === 'FRAME' && !node.instance) {
        tx.set(id, 'component', {});
        created.push(id);
        continue;
      }
      const containerId = editor.ids.next();
      wrapNodes(tx, editor, [id], 'FRAME', containerId, {
        name: 'Component',
        after: (t, container) => {
          t.set(container, 'fills', []);
          t.set(container, 'component', {});
        },
      });
      created.push(containerId);
    }
  });
  editor.state.select(created);
  return created;
}

/** Whether a documentation link can be opened from the properties panel: only http and https links are shown as links. */
export const isSafeLink = (link: string): boolean => /^https?:\/\//i.test(link.trim());

/**
 * Component configuration: sets a main component's description and documentation link. Values are
 * trimmed, an empty value removes the field, and a change is one undo step (nothing happens when the
 * value is unchanged).
 */
export function setComponentConfiguration(editor: Editor, id: Id, change: { readonly description?: string; readonly link?: string }): void {
  const node = editor.doc.get(id) as SceneNode | undefined;
  if (node?.type !== 'FRAME' || !node.component) return;
  const current = node.component;
  // The changed value (trimmed; empty removes the field), otherwise the current one.
  const pick = (key: 'description' | 'link'): string | undefined => {
    const value = change[key];
    return value === undefined ? current[key] : value.trim() || undefined;
  };
  const description = pick('description');
  const link = pick('link');
  const next = { ...(description !== undefined ? { description } : {}), ...(link !== undefined ? { link } : {}) };
  if (JSON.stringify(next) === JSON.stringify(current)) return;
  editor.history.run(change.link !== undefined ? 'Change documentation link' : 'Change component description', (tx) => tx.set(id, 'component', next));
}

