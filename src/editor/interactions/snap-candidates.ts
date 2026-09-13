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
import { intersects, type Rect } from '@/core/math/rect';
import { isSceneNode } from '@/core/schema/document';
import type { Editor } from '../editor';
import { visibleWorldRect } from '../viewport/viewport';

/** Snap distance in screen pixels (a snap happens when strictly closer than this). */
export const SNAP_THRESHOLD_PX = 5;

/**
 * World bounds to snap against: visible children of the given parents that are in view,
 * plus each parent itself when it is a frame. `skip` excludes layers (e.g. those being moved).
 * Requires the scene index to be up to date for the active page.
 */
export function snapCandidatesIn(editor: Editor, parents: Iterable<Id>, skip: (id: Id) => boolean = () => false): Rect[] {
  const store = editor.doc;
  const view = visibleWorldRect(editor.state.viewport, editor.canvasSize.width, editor.canvasSize.height);
  const rects: Rect[] = [];
  for (const parent of parents) {
    const parentType = store.get(parent)?.type;
    if (parentType === 'FRAME' || parentType === 'SECTION') {
      const frameBounds = editor.scene.worldBounds(parent);
      if (frameBounds) rects.push(frameBounds);
    }
    for (const id of store.children(parent)) {
      if (skip(id)) continue;
      const node = store.get(id);
      if (!node || !isSceneNode(node) || !node.visible) continue;
      const bounds = editor.scene.worldBounds(id);
      if (bounds && intersects(bounds, view)) rects.push(bounds);
    }
  }
  return rects;
}

/** Snap targets for layers being moved or resized: their siblings and parent frames, excluding the layers and their contents. */
export function snapCandidatesFor(editor: Editor, layers: readonly Id[]): Rect[] {
  const store = editor.doc;
  const layerSet = new Set(layers);
  const parents = new Set(layers.map((id) => store.parentOf(id)).filter((id): id is Id => id !== null));
  return snapCandidatesIn(editor, parents, (id) => layerSet.has(id) || layers.some((layer) => store.isAncestor(layer, id)));
}
