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

import { apply } from '@/core/math/matrix';
import type { Vec2 } from '@/core/math/vec';
import { vertexHandles, type VertexHandle } from '@/core/vector/vector-bend';
import type { Editor } from '../editor';
import { worldToScreen } from '../viewport/viewport';

/** A Bézier handle of a selected point in vector edit mode, with its and its vertex's screen positions. */
export interface ScreenHandle extends VertexHandle {
  readonly screen: Vec2;
  readonly vertexScreen: Vec2;
}

/** The handles of the selected points of the vector being edited (segment ends with a non-zero tangent). */
export function selectedHandles(editor: Editor): ScreenHandle[] {
  const state = editor.state.getSnapshot().vectorEdit;
  const node = state ? editor.doc.get(state.nodeId) : undefined;
  if (!state || node?.type !== 'VECTOR' || state.vertices.length === 0) return [];
  editor.scene.ensure(editor.pageId);
  const m = editor.scene.worldTransform(node.id);
  const v = editor.state.viewport;
  const network = node.vectorNetwork;
  return vertexHandles(network, state.vertices).map((h) => ({
    ...h,
    screen: worldToScreen(v, apply(m, h.point)),
    vertexScreen: worldToScreen(v, apply(m, network.vertices[h.vertex]!)),
  }));
}

/** The handle of a selected point under a screen position, if any. */
export function hitHandle(editor: Editor, screen: Vec2, tolerancePx: number): ScreenHandle | null {
  return selectedHandles(editor).find((h) => Math.hypot(h.screen.x - screen.x, h.screen.y - screen.y) <= tolerancePx) ?? null;
}
