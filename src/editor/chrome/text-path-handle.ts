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
import { apply } from '@/core/math/matrix';
import type { Vec2 } from '@/core/math/vec';
import type { TextNode } from '@/core/schema/document';
import { pathRunFor } from '@/core/vector/text-path';
import type { Editor } from '../editor';
import { worldToScreen } from '../viewport/viewport';

/** How big the handle is on screen, in CSS pixels. */
export const TEXT_PATH_HANDLE_SIZE = 9;

/** The selected text-on-a-path layer, while a single one is selected and it still has its path. */
export function selectedTextOnPath(editor: Editor): TextNode | null {
  const [id, ...rest] = editor.selection;
  if (id === undefined || rest.length > 0) return null;
  const node = editor.doc.get(id);
  return node?.type === 'TEXT' && node.textPath && editor.doc.has(node.textPath.pathId) ? node : null;
}

/** Where the handle that moves text along its path sits, in screen coordinates, or null when there is none. */
export function textPathHandle(editor: Editor): { readonly nodeId: Id; readonly center: Vec2 } | null {
  const node = selectedTextOnPath(editor);
  const run = node?.textPath ? pathRunFor(editor.doc, node.textPath.pathId) : null;
  if (!node || !node.textPath || !run) return null;
  const local = run.at(node.textPath.start * run.length).point;
  const world = apply(editor.scene.computeWorld(node.id), local);
  return { nodeId: node.id, center: worldToScreen(editor.state.viewport, world) };
}

/** Whether a screen point is on that handle. */
export function hitTextPathHandle(editor: Editor, screen: Vec2): boolean {
  const handle = textPathHandle(editor);
  return handle !== null && Math.hypot(screen.x - handle.center.x, screen.y - handle.center.y) <= TEXT_PATH_HANDLE_SIZE / 2 + 3;
}

/** Where along its path a point falls, as a share of the path's length (0–1), for dragging the handle. */
export function textPathPositionAt(editor: Editor, nodeId: Id, world: Vec2): number | null {
  const node = editor.doc.get(nodeId);
  if (node?.type !== 'TEXT' || !node.textPath) return null;
  const run = pathRunFor(editor.doc, node.textPath.pathId);
  const local = editor.scene.toLocal(nodeId, world);
  if (!run || !local || run.length <= 0) return null;
  // The nearest point along the path, walked in the steps the run is sampled at.
  let best = { distance: 0, gap: Infinity };
  const steps = Math.max(32, Math.ceil(run.length));
  for (let i = 0; i <= steps; i++) {
    const distance = (run.length * i) / steps;
    const point = run.at(distance).point;
    const gap = Math.hypot(point.x - local.x, point.y - local.y);
    if (gap < best.gap) best = { distance, gap };
  }
  return Math.min(1, Math.max(0, best.distance / run.length));
}
