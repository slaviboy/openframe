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

import { multiply, translation } from '@/core/math/matrix';
import type { Rect } from '@/core/math/rect';
import { pointsBounds } from '@/core/vector/vector-transform-points';
import type { SelectionFrame } from '../chrome/selection-geometry';
import type { Editor } from '../editor';

/**
 * The bounding box of the selected points in vector edit mode, as a selection frame (so its resize
 * handles and rotation corners work as they do for layers) and as a box in the layer's space. Shown
 * with the Move tool while at least two points are selected and they don't all sit at one position.
 */
export function pointsFrame(editor: Editor): { readonly frame: SelectionFrame; readonly box: Rect } | null {
  const state = editor.state.getSnapshot().vectorEdit;
  const node = state ? editor.doc.get(state.nodeId) : undefined;
  if (!state || node?.type !== 'VECTOR' || (state.tool ?? 'move') !== 'move') return null;
  const box = pointsBounds(node.vectorNetwork, state.vertices);
  if (!box || (box.width === 0 && box.height === 0)) return null;
  editor.scene.ensure(editor.pageId);
  const toWorld = multiply(editor.scene.worldTransform(node.id), translation(box.x, box.y));
  return { frame: { toWorld, width: box.width, height: box.height, nodeId: null }, box };
}
