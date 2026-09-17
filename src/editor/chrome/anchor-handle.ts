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
import { isSceneNode, type SceneNode } from '@/core/schema/document';
import { anchorPoint } from '../commands/properties';
import type { Editor } from '../editor';
import { worldToScreen } from '../viewport/viewport';

/** How big the anchor target is on screen, in CSS pixels. */
export const ANCHOR_HANDLE_SIZE = 14;

/** The layer whose anchor point is being edited: a single selection, while Edit anchor point is on in Motion. */
export function anchorTarget(editor: Editor): SceneNode | null {
  // The point a layer turns around is the same in every mode; Motion is only where it is animated.
  const state = editor.state.getSnapshot();
  if (!state.motion.editingAnchor) return null;
  const [id, ...rest] = state.selection;
  if (id === undefined || rest.length > 0) return null;
  const node = editor.doc.get(id);
  return node && isSceneNode(node) && node.type !== 'SECTION' ? node : null;
}

/** Where the anchor target sits on screen, or null when none is being edited. */
export function anchorHandle(editor: Editor): { readonly nodeId: Id; readonly center: Vec2 } | null {
  const node = anchorTarget(editor);
  if (!node) return null;
  const world = apply(editor.scene.computeWorld(node.id), anchorPoint(node));
  return { nodeId: node.id, center: worldToScreen(editor.state.viewport, world) };
}

/** Whether a screen point is on the anchor target. */
export function hitAnchorHandle(editor: Editor, screen: Vec2): boolean {
  const handle = anchorHandle(editor);
  return handle !== null && Math.hypot(screen.x - handle.center.x, screen.y - handle.center.y) <= ANCHOR_HANDLE_SIZE / 2 + 3;
}

/** The anchor a world point stands for on a layer, as a share of its box (the layer itself never moves). */
export function anchorShareAt(editor: Editor, nodeId: Id, world: Vec2): { x: number; y: number } | null {
  const node = editor.doc.get(nodeId);
  const local = editor.scene.toLocal(nodeId, world);
  if (!node || !isSceneNode(node) || !local || node.size.width <= 0 || node.size.height <= 0) return null;
  const clamp = (value: number) => Math.min(2, Math.max(-1, Math.round(value * 1000) / 1000));
  return { x: clamp(local.x / node.size.width), y: clamp(local.y / node.size.height) };
}
