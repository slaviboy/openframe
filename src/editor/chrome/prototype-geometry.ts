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
import { distanceToNoodle, noodleBetween, noodleCrossesRect, visibleConnections, type Connection } from '@/core/prototype/connections';
import { topLevelFrame, variantSetOf } from '@/core/prototype/reactions';
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

/** How close (screen pixels) a click must be to a noodle to select its connection. */
export const CONNECTION_HIT_PX = 6;

/** The visible connection whose noodle is under a screen point (the closest one), while the Prototype tab is open. */
export function connectionAt(editor: Editor, screen: Vec2): Connection | null {
  if (editor.state.getSnapshot().rightTab !== 'prototype') return null;
  let best: { connection: Connection; distance: number } | null = null;
  for (const connection of visibleConnections(editor.doc, editor.pageId, editor.selection)) {
    const source = screenBounds(editor, connection.sourceId);
    const destination = screenBounds(editor, connection.destinationId);
    if (!source || !destination) continue;
    const distance = distanceToNoodle(noodleBetween(source, destination), screen);
    if (distance <= CONNECTION_HIT_PX && (!best || distance < best.distance)) best = { connection, distance };
  }
  return best?.connection ?? null;
}

/** The connections shown for `selection` whose noodles pass through a screen rectangle (a marquee), while the Prototype tab is open. */
export function connectionsInScreenRect(editor: Editor, rect: Rect, selection: readonly Id[]): Connection[] {
  if (editor.state.getSnapshot().rightTab !== 'prototype') return [];
  return visibleConnections(editor.doc, editor.pageId, selection).filter((connection) => {
    const source = screenBounds(editor, connection.sourceId);
    const destination = screenBounds(editor, connection.destinationId);
    return source !== null && destination !== null && noodleCrossesRect(noodleBetween(source, destination), rect);
  });
}

/**
 * The variant a connection dragged from layers in a variant (or in an instance of one) would change to at a world point:
 * another variant of that component set; null elsewhere.
 */
export function variantDestinationAt(editor: Editor, sourceIds: readonly Id[], world: Vec2): Id | null {
  const sets = new Set(sourceIds.map((id) => variantSetOf(editor.doc, id)));
  const setId = sets.size === 1 ? [...sets][0] : null;
  if (!setId) return null;
  const hit = hitTestDeepest(editor.doc, editor.scene, editor.pageId, world, { tolerance: 0 });
  for (let id = hit; id !== null; id = editor.doc.parentOf(id)) {
    if (editor.doc.parentOf(id) !== setId) continue;
    const own = sourceIds.some((source) => source === id || editor.doc.isAncestor(id, source));
    return own ? null : id;
  }
  return null;
}

/** The top-level frame a connection dragged from the sources would end on at a world point (not their own frame). */
export function connectDestinationAt(editor: Editor, sourceIds: readonly Id[], world: Vec2): Id | null {
  const hit = hitTestDeepest(editor.doc, editor.scene, editor.pageId, world, { tolerance: 0 });
  const frame = hit ? topLevelFrame(editor.doc, hit) : null;
  if (!frame) {
    // Over a section outside its frames: the connection leads to the section.
    for (let id = hit; id !== null; id = editor.doc.parentOf(id)) if (editor.doc.get(id)?.type === 'SECTION') return id;
    return null;
  }
  const own = new Set(sourceIds.map((id) => topLevelFrame(editor.doc, id)));
  return own.has(frame) ? null : frame;
}
