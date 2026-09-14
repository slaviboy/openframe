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
import type { Rect } from '@/core/math/rect';
import type { Vec2 } from '@/core/math/vec';
import { topLevelFrame } from '@/core/prototype/reactions';
import { hitTestDeepest } from '@/core/scene/hit-test';
import type { Editor } from '../editor';
import { worldToScreen } from '../viewport/viewport';

/** Diameter of the + handle a connection is dragged from. */
export const CONNECT_HANDLE_SIZE = 16;

/** A layer's bounds on screen. */
export function screenBounds(editor: Editor, id: Id): Rect | null {
  const bounds = editor.scene.worldBounds(id);
  if (!bounds) return null;
  const v = editor.state.viewport;
  const p = worldToScreen(v, bounds);
  return { x: p.x, y: p.y, width: bounds.width * v.zoom, height: bounds.height * v.zoom };
}

/**
 * The + handle on the right edge of the selected layers' last layer while the Prototype tab is open (dragging it to a
 * destination adds an interaction to every selected layer); null otherwise.
 */
export function connectHandle(editor: Editor): { readonly sourceIds: readonly Id[]; readonly center: Vec2 } | null {
  const state = editor.state.getSnapshot();
  if (state.rightTab !== 'prototype' || editor.state.getSnapshot().textEdit) return null;
  const sourceIds = editor.selection.filter((id) => {
    const node = editor.doc.get(id);
    return node !== undefined && 'transform' in node && !node.locked;
  });
  const last = sourceIds.at(-1);
  const rect = last ? screenBounds(editor, last) : null;
  if (!rect) return null;
  return { sourceIds, center: { x: rect.x + rect.width, y: rect.y + rect.height / 2 } };
}

/** Whether a screen point is on the + handle. */
export function hitConnectHandle(editor: Editor, screen: Vec2): boolean {
  const handle = connectHandle(editor);
  return handle !== null && Math.hypot(screen.x - handle.center.x, screen.y - handle.center.y) <= CONNECT_HANDLE_SIZE / 2 + 2;
}

/** The top-level frame a connection dragged from the sources would end on at a world point (not their own frame). */
export function connectDestinationAt(editor: Editor, sourceIds: readonly Id[], world: Vec2): Id | null {
  const hit = hitTestDeepest(editor.doc, editor.scene, editor.pageId, world, { tolerance: 0 });
  const frame = hit ? topLevelFrame(editor.doc, hit) : null;
  if (!frame) return null;
  const own = new Set(sourceIds.map((id) => topLevelFrame(editor.doc, id)));
  return own.has(frame) ? null : frame;
}
