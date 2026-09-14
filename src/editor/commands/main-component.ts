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

import { hasOverrides, isMainComponent } from '@/core/document/instances';
import { keyBetween } from '@/core/ids/fractional-index';
import type { Id } from '@/core/ids/ids';
import { isSceneNode, type SceneNode } from '@/core/schema/document';
import type { Editor } from '../editor';
import { nextKeyAbove } from './selection-helpers';

type InstanceNode = Extract<SceneNode, { type: 'FRAME' }> & { readonly instance: { readonly mainId: Id } };

/** The instance the single selected layer is, or belongs to. */
function selectedInstance(editor: Editor): InstanceNode | null {
  if (editor.selection.length !== 1) return null;
  for (let cur: Id | null = editor.selection[0]!; cur !== null; cur = editor.doc.parentOf(cur)) {
    const node = editor.doc.get(cur);
    if (!node || !isSceneNode(node)) return null;
    if (node.type === 'FRAME' && node.instance) return node as InstanceNode;
  }
  return null;
}

/** The main component of the selected instance, while it is still in the document. */
function mainOfSelection(editor: Editor): Id | null {
  const instance = selectedInstance(editor);
  const main = instance ? editor.doc.get(instance.instance.mainId) : undefined;
  return main && isSceneNode(main) && isMainComponent(main) ? main.id : null;
}

const copyValue = (value: unknown): unknown => (value === undefined ? undefined : (JSON.parse(JSON.stringify(value)) as unknown));

export const canGoToMainComponent = (editor: Editor): boolean => mainOfSelection(editor) !== null;

/** Go to main component (⌃⌥⌘K): selects the main component of the selected instance and zooms to it. */
export function goToMainComponent(editor: Editor): boolean {
  const main = mainOfSelection(editor);
  if (!main) return false;
  editor.state.select([main]);
  editor.commands.run('view.zoomToSelection');
  return true;
}

export const canRestoreMainComponent = (editor: Editor): boolean => selectedInstance(editor) !== null && mainOfSelection(editor) === null;

/**
 * Restore main component: when the selected instance's main component was deleted, a new main component
 * is made from the instance — its layers and properties — directly to its right, and the instance links
 * to it again. The restored component is selected; one undo step.
 */
export function restoreMainComponent(editor: Editor): Id | null {
  const instance = selectedInstance(editor);
  if (!instance || mainOfSelection(editor) !== null) return null;
  let restored: Id | null = null;
  editor.history.run('Restore main component', (tx) => {
    const store = tx.store;
    const links: [Id, Id][] = [];
    const clone = (layerId: Id, parent: SceneNode['parent'], root: boolean): Id => {
      const layer = store.getOrThrow(layerId) as SceneNode;
      const id = editor.ids.next();
      const copy: Record<string, unknown> = { ...layer, id, parent };
      delete copy['instance'];
      delete copy['source'];
      delete copy['overrides'];
      if (root) {
        copy['component'] = {};
        const t = layer.transform;
        copy['transform'] = [t[0], t[1], t[2], t[3], t[4] + layer.size.width + 40, t[5]];
      }
      tx.create(copy as unknown as SceneNode);
      links.push([layerId, id]);
      for (const childId of store.children(layerId)) {
        const child = store.get(childId);
        if (child && isSceneNode(child)) clone(childId, { id, key: child.parent.key }, false);
      }
      return id;
    };
    restored = clone(instance.id, { id: instance.parent.id, key: keyBetween(instance.parent.key, nextKeyAbove(store, instance.id)) }, true);
    for (const [layerId, cloneId] of links) {
      if (layerId === instance.id) tx.set(layerId, 'instance', { mainId: cloneId });
      else tx.set(layerId, 'source', cloneId);
    }
  });
  if (restored) editor.state.select([restored]);
  return restored;
}

export function canPushChangesToMain(editor: Editor): boolean {
  const instance = selectedInstance(editor);
  return instance !== null && editor.selection[0] === instance.id && mainOfSelection(editor) !== null && hasOverrides(editor.doc, [instance.id]);
}

/**
 * Push changes to main component: the selected instance's changes are copied to the main component's
 * layers, which pass them on to its other instances, and the instance follows the component again.
 * One undo step.
 */
export function pushChangesToMain(editor: Editor): boolean {
  const instance = selectedInstance(editor);
  if (!instance || !canPushChangesToMain(editor)) return false;
  editor.history.run('Push changes to main component', (tx) => {
    const store = tx.store;
    for (const layerId of [instance.id, ...store.descendants(instance.id, false)]) {
      const layer = store.get(layerId);
      if (!layer || !isSceneNode(layer) || !layer.overrides) continue;
      const target = layerId === instance.id ? instance.instance.mainId : layer.source;
      if (target !== undefined && store.has(target)) {
        for (const name of layer.overrides) tx.set(target, name, copyValue((layer as unknown as Record<string, unknown>)[name]));
      }
      tx.set(layerId, 'overrides', undefined);
    }
  });
  return true;
}
