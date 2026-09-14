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

import { isInstance, isMainComponent, swapInstance } from '@/core/document/instances';
import type { Id } from '@/core/ids/ids';
import type { Vec2 } from '@/core/math/vec';
import { hitTestDeepest } from '@/core/scene/hit-test';
import { isSceneNode, type SceneNode } from '@/core/schema/document';
import type { Editor } from '../editor';

/**
 * Swaps an instance for an instance of another main component, keeping its placement and the changes
 * made on layers whose names match in the new component. The instance stays selected; one undo step.
 */
export function swapInstanceFor(editor: Editor, instanceId: Id, mainId: Id): boolean {
  let swapped = false;
  editor.history.run('Swap instance', (tx) => {
    swapped = swapInstance(tx, instanceId, mainId, () => editor.ids.next());
  });
  if (swapped) editor.state.select([instanceId]);
  return swapped;
}

/**
 * The instance a component dropped from the Assets tab with the swap modifier replaces: the instance under
 * `world` that isn't nested in a frame or component (⌥), or the nearest one at any depth (⌥⌘ / Alt+Ctrl).
 */
export function instanceToSwap(editor: Editor, world: Vec2, nested: boolean): Id | null {
  const hit = hitTestDeepest(editor.doc, editor.scene, editor.pageId, world, { tolerance: 0 });
  for (let id = hit; id !== null; id = editor.doc.parentOf(id)) {
    const node = editor.doc.get(id);
    if (!node || !isSceneNode(node) || !isInstance(node)) continue;
    if (nested || node.parent.id === editor.pageId) return id;
  }
  return null;
}

/**
 * The related components an instance can be swapped to from the right-click menu: the main components in the
 * same frame (or page, or component set) as its main component, in layer order.
 */
export function relatedComponents(editor: Editor, instanceId: Id): SceneNode[] {
  const instance = editor.doc.get(instanceId) as SceneNode | undefined;
  if (instance?.type !== 'FRAME' || !instance.instance) return [];
  const parent = editor.doc.parentOf(instance.instance.mainId);
  if (parent === null) return [];
  return editor.doc
    .children(parent)
    .map((id) => editor.doc.get(id) as SceneNode | undefined)
    .filter((node): node is SceneNode => node !== undefined && isMainComponent(node));
}
