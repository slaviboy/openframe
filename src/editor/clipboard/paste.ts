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

import { isMainComponent, pastedInstanceLayer } from '@/core/document/instances';
import { canParent } from '@/core/document/containment';
import { sortByPaintOrder } from '@/core/document/order';
import type { DocumentStore } from '@/core/document/store';
import type { Transaction } from '@/core/history/history';
import { keysBetween } from '@/core/ids/fractional-index';
import type { Id } from '@/core/ids/ids';
import { IDENTITY, invert, multiply, translation } from '@/core/math/matrix';
import { intersects, type Rect } from '@/core/math/rect';
import type { Vec2 } from '@/core/math/vec';
import { matrixOf } from '@/core/scene/scene-index';
import { isSceneNode, type SceneNode } from '@/core/schema/document';
import type { Editor } from '../editor';
import { keyOf, nextKeyAbove, selectedSceneNodes, topChildKey } from '../commands/selection-helpers';
import { roundTransform, toTransform } from '../interactions/transform';
import { containerAt } from '../tools/draw-helpers';
import { visibleWorldRect } from '../viewport/viewport';
import type { ClipboardPayload } from './payload';
import { acceptsLayers } from '@/core/document/instances';

export type PasteMode = 'default' | 'over-selection' | 'replace';

const centerDelta = (from: Rect, to: Rect): Vec2 => ({
  x: Math.round(to.x + to.width / 2 - (from.x + from.width / 2)),
  y: Math.round(to.y + to.height / 2 - (from.y + from.height / 2)),
});

/**
 * Pastes clipboard layers with fresh ids.
 *
 * - `default` (⌘V): into the selected frame, or above the top-most selected layer in its
 *   parent, or on top of the page. Content stays at its copied canvas position when that is
 *   visible (and inside the target frame); otherwise it is centered in the view or frame.
 * - `over-selection` (⇧⌘V): centered on the selection bounds.
 * - `replace` (⇧⌘R): each selected layer is replaced by a copy of the content centered on it.
 *
 * Returns the new root ids (also selected). The whole paste is one undo step.
 */
export function pastePayload(editor: Editor, payload: ClipboardPayload, mode: PasteMode = 'default', at?: Vec2): Id[] {
  const store = editor.doc;
  editor.scene.ensure(editor.pageId);
  const selected = sortByPaintOrder(store, selectedSceneNodes(editor));
  const pasted: Id[] = [];

  if (mode === 'replace' && selected.length > 0) {
    editor.history.run('Paste to replace', (tx) => {
      for (const target of selected) {
        const bounds = editor.scene.worldBounds(target);
        const parent = store.parentOf(target);
        if (!bounds || parent === null) continue;
        const slot = acceptingSlot(tx.store, payload, parent, keyOf(store, target), nextKeyAbove(store, target));
        pasted.push(...insert(tx, editor, payload, slot.parent, slot.lo, slot.hi, centerDelta(payload.bounds, bounds)));
        tx.delete(target);
      }
    });
    editor.state.select(pasted);
    return pasted;
  }

  // Several frames selected: one copy into each, at the same position relative to the frame it
  // was copied from (or centered when that position falls outside the frame).
  const frames = selected.filter((id) => store.get(id)?.type === 'FRAME');
  if (mode === 'default' && !at && frames.length >= 2 && frames.length === selected.length) {
    editor.history.run('Paste', (tx) => {
      for (const frame of frames) {
        const frameBounds = editor.scene.worldBounds(frame);
        if (!frameBounds) continue;
        let offset: Vec2 = payload.sourceOrigin
          ? { x: frameBounds.x - payload.sourceOrigin.x, y: frameBounds.y - payload.sourceOrigin.y }
          : centerDelta(payload.bounds, frameBounds);
        const placed = { ...payload.bounds, x: payload.bounds.x + offset.x, y: payload.bounds.y + offset.y };
        if (!intersects(placed, frameBounds)) offset = centerDelta(payload.bounds, frameBounds);
        const slot = acceptingSlot(tx.store, payload, frame, topChildKey(tx.store, frame), null);
        pasted.push(...insert(tx, editor, payload, slot.parent, slot.lo, slot.hi, offset));
      }
    });
    editor.state.select(pasted);
    return pasted;
  }

  const topmost = selected.at(-1);
  const selectedFrame = !at && selected.length === 1 && store.get(selected[0]!)?.type === 'FRAME' ? selected[0]! : null;
  let parent: Id;
  let lo: string | null;
  let hi: string | null;
  if (at) {
    // Paste here: on top of the frame or section under the point (or the page).
    parent = containerAt(editor, at);
    lo = topChildKey(store, parent);
    hi = null;
  } else if (selectedFrame) {
    parent = selectedFrame;
    lo = topChildKey(store, selectedFrame);
    hi = null;
  } else if (topmost) {
    parent = store.parentOf(topmost)!;
    lo = keyOf(store, topmost);
    hi = nextKeyAbove(store, topmost);
  } else {
    parent = editor.pageId;
    lo = topChildKey(store, parent);
    hi = null;
  }

  ({ parent, lo, hi } = acceptingSlot(store, payload, parent, lo, hi));

  let offset: Vec2 = { x: 0, y: 0 };
  if (at) {
    offset = centerDelta(payload.bounds, { x: at.x, y: at.y, width: 0, height: 0 });
  } else if (mode === 'over-selection' && selected.length > 0) {
    offset = centerDelta(payload.bounds, editor.selectionBounds(selected)!);
  } else if (selectedFrame) {
    const frameBounds = editor.scene.worldBounds(selectedFrame)!;
    if (!intersects(payload.bounds, frameBounds)) offset = centerDelta(payload.bounds, frameBounds);
  } else {
    const view = visibleWorldRect(editor.state.viewport, editor.canvasSize.width, editor.canvasSize.height);
    if (!intersects(payload.bounds, view)) offset = centerDelta(payload.bounds, view);
  }

  editor.history.run('Paste', (tx) => {
    pasted.push(...insert(tx, editor, payload, parent, lo, hi, offset));
  });
  editor.state.select(pasted);
  return pasted;
}

/**
 * Moves an insertion point up the hierarchy until the parent accepts every pasted root
 * (sections cannot be pasted into frames or groups, and instances only take layers in their slots);
 * content then goes directly above the ancestor it left. The page accepts every layer, so this always terminates.
 */
function acceptingSlot(store: DocumentStore, payload: ClipboardPayload, parent: Id, lo: string | null, hi: string | null): { parent: Id; lo: string | null; hi: string | null } {
  const rootTypes = payload.nodes.filter((n) => payload.roots.includes(n.id)).map((n) => n.type);
  const accepts = (id: Id) => {
    const type = store.get(id)?.type;
    return type !== undefined && rootTypes.every((t) => canParent(type, t)) && acceptsLayers(store, id);
  };
  let current = parent;
  let anchor: Id | null = null;
  while (!accepts(current)) {
    const up = store.parentOf(current);
    if (up === null) break;
    anchor = current;
    current = up;
  }
  return anchor ? { parent: current, lo: keyOf(store, anchor), hi: nextKeyAbove(store, anchor) } : { parent, lo, hi };
}

function insert(tx: Transaction, editor: Editor, payload: ClipboardPayload, parent: Id, lo: string | null, hi: string | null, offset: Vec2): Id[] {
  const parentNode = tx.store.getOrThrow(parent);
  const parentWorld = isSceneNode(parentNode) ? editor.scene.computeWorld(parent) : IDENTITY;
  const parentInv = invert(parentWorld);
  if (!parentInv) return [];

  const idMap = new Map<Id, Id>(payload.nodes.map((n) => [n.id, editor.ids.next()]));
  const roots = new Set(payload.roots);
  const byId = new Map(payload.nodes.map((n) => [n.id, n]));
  const depth = (node: SceneNode): number => {
    let d = 0;
    for (let cur = node; !roots.has(cur.id); cur = byId.get(cur.parent.id)!) d++;
    return d;
  };
  const shift = translation(offset.x, offset.y);
  const rootKeys = keysBetween(lo, hi, payload.roots.length);
  const created: Id[] = [];

  // A pasted main component that is still in this document becomes an instance of it.
  const instanceRoots = new Set(payload.roots.filter((rootId) => isMainComponent(byId.get(rootId)) && isMainComponent(tx.store.get(rootId) as SceneNode | undefined)));
  const inInstance = (node: SceneNode): boolean => {
    for (let cur = node; ; cur = byId.get(cur.parent.id)!) {
      if (instanceRoots.has(cur.id)) return true;
      if (roots.has(cur.id)) return false;
    }
  };

  payload.roots.forEach((rootId, i) => {
    const node = byId.get(rootId)!;
    const world = multiply(shift, matrixOf(payload.worldTransforms[rootId]!));
    const local = roundTransform(multiply(parentInv, world));
    const newId = idMap.get(rootId)!;
    const parentRef = { id: parent, key: rootKeys[i]! };
    const copy = instanceRoots.has(rootId) ? pastedInstanceLayer(node, newId, parentRef, true) : { ...node, id: newId, parent: parentRef };
    tx.create({ ...copy, transform: toTransform(local) });
    created.push(newId);
  });

  // Descendants in depth order so every parent exists before its children.
  const descendants = payload.nodes.filter((n) => !roots.has(n.id)).sort((a, b) => depth(a) - depth(b));
  for (const node of descendants) {
    const id = idMap.get(node.id)!;
    const parentRef = { id: idMap.get(node.parent.id)!, key: node.parent.key };
    tx.create(inInstance(node) ? pastedInstanceLayer(node, id, parentRef, false) : { ...node, id, parent: parentRef });
  }
  return created;
}
