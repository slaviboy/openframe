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
import { distanceToNoodle, noodleBetween, noodleCrossesRect, visibleConnections, type Connection } from '@/core/prototype/connections';import { topLevelFrame, variantSetOf } from '@/core/prototype/reactions';
import { isOverlayDestination } from '@/core/prototype/flows';
import { presentableFrames } from '@/core/prototype/player';
import { hitTestDeepest } from '@/core/scene/hit-test';
import { matchingInteractions } from '../commands/prototype';
import type { Editor } from '../editor';
import { visibleWorldRect, worldToScreen } from '../viewport/viewport';

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

const sameRef = (a: { sourceId: Id; reactionIndex: number; actionIndex: number }, b: { sourceId: Id; reactionIndex: number; actionIndex: number }) =>
  a.sourceId === b.sourceId && a.reactionIndex === b.reactionIndex && a.actionIndex === b.actionIndex;

/**
 * The connections the canvas draws for `selection`. Of matching interactions (identical interactions on matching layers),
 * only the first connection — the top-left one in view — is drawn, until one of them is selected, which draws them all.
 */
export function shownConnections(editor: Editor, selection: readonly Id[]): Connection[] {
  const selected = editor.state.getSnapshot().selectedConnections;
  // A selected connection's matching connections are drawn too, though their layers aren't selected.
  const matching = selected.flatMap((ref) => matchingInteractions(editor, ref.sourceId, ref.reactionIndex).map((match) => ({ ...match, actionIndex: ref.actionIndex })));
  const key = (ref: { sourceId: Id; reactionIndex: number; actionIndex: number }) => `${ref.sourceId}/${ref.reactionIndex}/${ref.actionIndex}`;
  const inSelection = new Set(visibleConnections(editor.doc, editor.pageId, selection).map(key));
  const visible = visibleConnections(editor.doc, editor.pageId, []).filter((connection) => inSelection.has(key(connection)) || matching.some((ref) => sameRef(ref, connection)));
  const view = visibleWorldRect(editor.state.viewport, editor.canvasSize.width, editor.canvasSize.height);
  const hidden = new Set<Connection>();
  const grouped = new Set<Connection>();
  for (const connection of visible) {
    if (grouped.has(connection)) continue;
    const refs = matchingInteractions(editor, connection.sourceId, connection.reactionIndex);
    const group = visible.filter((other) => other.actionIndex === connection.actionIndex && refs.some((ref) => ref.sourceId === other.sourceId && ref.reactionIndex === other.reactionIndex));
    group.forEach((member) => grouped.add(member));
    if (group.length < 2 || group.some((member) => selected.some((ref) => sameRef(ref, member)))) continue;
    // The top-left hotspot in view (or anywhere, when none is in view) keeps its connection: hotspots side by side are
    // one row, where the left one comes first.
    editor.scene.ensure(editor.pageId);
    const placed = group.map((member) => ({ member, bounds: editor.scene.worldBounds(member.sourceId) ?? { x: 0, y: 0, width: 0, height: 0 } }));
    const inView = placed.filter(({ bounds }) => bounds.x < view.x + view.width && bounds.x + bounds.width > view.x && bounds.y < view.y + view.height && bounds.y + bounds.height > view.y);
    const sameRow = (a: Rect, b: Rect) => a.y < b.y + b.height && b.y < a.y + a.height;
    const [first] = (inView.length > 0 ? inView : placed).sort((a, b) => (sameRow(a.bounds, b.bounds) ? a.bounds.x - b.bounds.x : a.bounds.y - b.bounds.y));
    group.forEach((member) => member !== first!.member && hidden.add(member));
  }
  return visible.filter((connection) => !hidden.has(connection));
}

/** How close (screen pixels) a click must be to a noodle to select its connection. */
export const CONNECTION_HIT_PX = 6;

/** The visible connection whose noodle is under a screen point (the closest one), while the Prototype tab is open. */
export function connectionAt(editor: Editor, screen: Vec2): Connection | null {
  if (editor.state.getSnapshot().rightTab !== 'prototype') return null;
  let best: { connection: Connection; distance: number } | null = null;
  for (const connection of shownConnections(editor, editor.selection)) {
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
  return shownConnections(editor, selection).filter((connection) => {
    const source = screenBounds(editor, connection.sourceId);
    const destination = screenBounds(editor, connection.destinationId);
    return source !== null && destination !== null && noodleCrossesRect(noodleBetween(source, destination), rect);
  });
}

/** Size of the badge next to an overlay frame on the canvas. */
export const OVERLAY_BADGE_SIZE = 16;

/** The frames on the page that interactions open as overlays, which show badges while the Prototype tab is open. */
export function overlayFrames(editor: Editor): Id[] {
  if (editor.state.getSnapshot().rightTab !== 'prototype') return [];
  return presentableFrames(editor.doc, editor.pageId).filter((id) => isOverlayDestination(editor.doc, editor.pageId, id));
}

/** An overlay frame's badge on screen: just outside the frame's top-right corner. */
export function overlayBadgeRect(editor: Editor, frameId: Id): Rect | null {
  const bounds = screenBounds(editor, frameId);
  return bounds ? { x: bounds.x + bounds.width + 6, y: bounds.y, width: OVERLAY_BADGE_SIZE, height: OVERLAY_BADGE_SIZE } : null;
}

/** The overlay whose badge is under a screen point, while the Prototype tab is open. */
export function overlayBadgeAt(editor: Editor, screen: Vec2): Id | null {
  for (const frameId of overlayFrames(editor)) {
    const rect = overlayBadgeRect(editor, frameId);
    if (rect && screen.x >= rect.x && screen.x <= rect.x + rect.width && screen.y >= rect.y && screen.y <= rect.y + rect.height) return frameId;
  }
  return null;
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
