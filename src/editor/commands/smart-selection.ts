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

import type { Transaction } from '@/core/history/history';
import type { Id } from '@/core/ids/ids';
import type { Rect } from '@/core/math/rect';
import type { Vec2 } from '@/core/math/vec';
import { sortByPaintOrder } from '@/core/document/order';
import { detectSmartSelection, respace, spacingHandles, type SmartSelection } from '@/core/scene/smart-selection';
import type { SceneNode } from '@/core/schema/document';
import type { Editor } from '../editor';
import { captureStart, translateNodes, type NodeStart } from '../interactions/transform';
import { worldToScreen } from '../viewport/viewport';
import { selectedSceneNodes } from './selection-helpers';
import { duplicateNodes } from './structure';

export interface SmartSelectionInfo {
  readonly ids: readonly Id[];
  /** World bounds of each layer, parallel to `ids`. */
  readonly rects: readonly Rect[];
  readonly selection: SmartSelection;
}

/** The current selection as a smart selection (two or more unlocked layers in an evenly spaced row or column), or null. */
export function smartSelectionInfo(editor: Editor): SmartSelectionInfo | null {
  const ids = selectedSceneNodes(editor).filter((id) => !(editor.doc.get(id) as SceneNode).locked);
  if (ids.length < 2 || ids.length !== editor.selection.length) return null;
  editor.scene.ensure(editor.pageId);
  const rects: Rect[] = [];
  for (const id of ids) {
    const bounds = editor.scene.worldBounds(id);
    if (!bounds) return null;
    rects.push(bounds);
  }
  const selection = detectSmartSelection(rects);
  return selection ? { ids, rects, selection } : null;
}

/** Moves the layers so every gap equals `gap`, translating from captured starts (so previews don't accumulate). */
export function applySpacing(tx: Transaction, info: SmartSelectionInfo, starts: readonly NodeStart[], gap: number): void {
  const positions = respace(info.rects, info.selection, gap);
  info.ids.forEach((_, i) => {
    const rect = info.rects[i]!;
    const target = positions[i]!;
    translateNodes(tx, [starts[i]!], { x: target.x - rect.x, y: target.y - rect.y });
  });
}

export const captureSpacingStarts = (tx: Transaction, editor: Editor, info: SmartSelectionInfo): NodeStart[] => info.ids.map((id) => captureStart(tx, editor.scene, id));

/** Sets the space between the layers of the current smart selection inside an open transaction. */
export function setSpacingInTx(tx: Transaction, editor: Editor, gap: number): void {
  const info = smartSelectionInfo(editor);
  if (info) applySpacing(tx, info, captureSpacingStarts(tx, editor, info), gap);
}

/** The spacing handle under a screen point, if any. */
export function spacingHandleAt(editor: Editor, info: SmartSelectionInfo, screen: Vec2, tolerancePx: number): boolean {
  const v = editor.state.viewport;
  return spacingHandles(info.rects, info.selection).some((handle) => {
    const p = worldToScreen(v, handle);
    return Math.abs(p.x - screen.x) <= tolerancePx && Math.abs(p.y - screen.y) <= tolerancePx * 2;
  });
}

/** The layer whose pink center ring a screen point is on, which is how a layer inside the selection is marked. */
export function smartRingAt(editor: Editor, info: SmartSelectionInfo, screen: Vec2, tolerancePx: number): Id | null {
  const v = editor.state.viewport;
  for (const [i, rect] of info.rects.entries()) {
    const p = worldToScreen(v, { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 });
    if (Math.hypot(p.x - screen.x, p.y - screen.y) <= tolerancePx) return info.ids[i]!;
  }
  return null;
}

/** The marked layers of the current smart selection, or null when there is no selection or nothing is marked. */
export function markedSmartSelection(editor: Editor): { readonly info: SmartSelectionInfo; readonly marked: readonly Id[] } | null {
  const info = smartSelectionInfo(editor);
  if (!info) return null;
  const marked = editor.state.getSnapshot().markedLayers.filter((id) => info.ids.includes(id));
  return marked.length > 0 ? { info, marked } : null;
}

/** A layer's place along the selection's axis, and how much room it takes there. */
const along = (axis: 'x' | 'y', rect: Rect) => (axis === 'x' ? { pos: rect.x, size: rect.width } : { pos: rect.y, size: rect.height });

/**
 * A place in the row or column: the layer that fills it, the room it takes, and the layer whose placement it is
 * measured from — its own, or, for a copy that is still sitting on the layer it came from, that layer's.
 */
interface Slot {
  readonly id: Id;
  readonly rect: Rect;
  readonly from?: Id;
}

/**
 * Lays a row or column out again from where it began, every gap the same, in the order given. Every layer moves from
 * the placement it had when the gesture began, so laying the row out over and over does not drift.
 */
function reflow(tx: Transaction, axis: 'x' | 'y', gap: number, start: number, slots: readonly Slot[], starts: ReadonlyMap<Id, NodeStart>): void {
  let cursor = start;
  for (const slot of slots) {
    const here = along(axis, slot.rect);
    const delta = cursor - here.pos;
    // A layer made in this transaction is not in the scene index yet, so it moves from where its source stands.
    const from = starts.get(slot.from ?? slot.id);
    if (from) translateNodes(tx, [{ ...from, id: slot.id }], axis === 'x' ? { x: delta, y: 0 } : { x: 0, y: delta });
    cursor += here.size + gap;
  }
}

/** Where each of the selection's layers stands, to move it from. */
function captureRow(tx: Transaction, editor: Editor, info: SmartSelectionInfo): Map<Id, NodeStart> {
  return new Map(info.ids.map((id) => [id, captureStart(tx, editor.scene, id)]));
}

/** The selection's layers in the order the row or column holds them, with their bounds. */
function orderedSlots(info: SmartSelectionInfo): Slot[] {
  return info.selection.order.map((index) => ({ id: info.ids[index]!, rect: info.rects[index]! }));
}

/**
 * Deletes the marked layers and closes the row or column up behind them, keeping the gap it had and leaving it
 * where it began. Returns false when nothing is marked, so the ordinary delete can take over.
 */
export function deleteMarked(editor: Editor): boolean {
  const state = markedSmartSelection(editor);
  if (!state) return false;
  const { info, marked } = state;
  const slots = orderedSlots(info);
  const kept = slots.filter((slot) => !marked.includes(slot.id));
  if (kept.length === 0) return false;
  const start = along(info.selection.axis, slots[0]!.rect).pos;
  editor.history.run('Delete', (tx) => {
    const starts = captureRow(tx, editor, info);
    for (const id of marked) if (tx.store.has(id)) tx.delete(id);
    reflow(tx, info.selection.axis, info.selection.gap, start, kept, starts);
  });
  editor.state.select(kept.map((slot) => slot.id));
  return true;
}

/**
 * Copies each marked layer into the row or column just after the layer it came from, the rest moving along to make
 * room. The copies end up selected along with the others, and marked, so a second ⌘D carries on from them.
 */
export function duplicateMarked(editor: Editor): Id[] | null {
  const state = markedSmartSelection(editor);
  if (!state) return null;
  const { info, marked } = state;
  const slots = orderedSlots(info);
  const start = along(info.selection.axis, slots[0]!.rect).pos;
  let clones: Id[] = [];
  editor.history.run('Duplicate', (tx) => {
    const starts = captureRow(tx, editor, info);
    const memory = duplicateNodes(tx, editor, marked);
    clones = [...memory.clones];
    // `duplicateNodes` clones in paint order, which is the order the marks were given back in.
    const cloneOf = new Map<Id, Id>(sortByPaintOrder(tx.store, marked).map((id, i) => [id, memory.clones[i]!]));
    const laid: Slot[] = [];
    for (const slot of slots) {
      laid.push(slot);
      const clone = cloneOf.get(slot.id);
      // A copy sits directly on the layer it came from until it is laid out, so it takes the same room.
      if (clone !== undefined) laid.push({ id: clone, rect: slot.rect, from: slot.id });
    }
    reflow(tx, info.selection.axis, info.selection.gap, start, laid, starts);
  });
  editor.state.select([...info.ids, ...clones]);
  editor.state.markLayers(clones);
  return clones;
}

/** A reorder in progress: where the marked layers stand to move from, and how the row reads without them. */
export interface ReorderState {
  readonly info: SmartSelectionInfo;
  readonly moving: readonly Slot[];
  readonly rest: readonly Slot[];
  readonly start: number;
  readonly starts: ReadonlyMap<Id, NodeStart>;
}

/** Sets a reorder up: the marked layers come out of the row, leaving the places they can be dropped back into. */
export function beginReorder(tx: Transaction, editor: Editor, info: SmartSelectionInfo, marked: readonly Id[]): ReorderState {
  const slots = orderedSlots(info);
  return {
    info,
    moving: slots.filter((slot) => marked.includes(slot.id)),
    rest: slots.filter((slot) => !marked.includes(slot.id)),
    start: along(info.selection.axis, slots[0]!.rect).pos,
    starts: captureRow(tx, editor, info),
  };
}

/** Where along the row the layers left behind stand once the marked ones are out of it. */
function restPositions(state: ReorderState): number[] {
  const { axis, gap } = state.info.selection;
  const out: number[] = [];
  let cursor = state.start;
  for (const slot of state.rest) {
    out.push(cursor);
    cursor += along(axis, slot.rect).size + gap;
  }
  out.push(cursor);
  return out;
}

/** Which place in the row a world point drops the marked layers into: 0 before the first of the rest, and so on. */
export function reorderIndexAt(state: ReorderState, world: Vec2): number {
  const { axis } = state.info.selection;
  const at = axis === 'x' ? world.x : world.y;
  const positions = restPositions(state);
  let index = 0;
  for (const [i, slot] of state.rest.entries()) if (at > positions[i]! + along(axis, slot.rect).size / 2) index = i + 1;
  return index;
}

/** Lays the row out with the marked layers dropped in at `index`. */
export function applyReorder(tx: Transaction, state: ReorderState, index: number): void {
  const { axis, gap } = state.info.selection;
  const laid = [...state.rest.slice(0, index), ...state.moving, ...state.rest.slice(index)];
  reflow(tx, axis, gap, state.start, laid, state.starts);
}

/** The blue line showing where the marked layers will land, across the row, in world coordinates. */
export function reorderLine(state: ReorderState, index: number): readonly [Vec2, Vec2] {
  const { axis, gap } = state.info.selection;
  const positions = restPositions(state);
  // Half a gap before the place they will take, which is the middle of the gap they are dropping into.
  const at = positions[index]! - gap / 2;
  const cross = state.info.rects.reduce(
    (span, rect) => (axis === 'x' ? { lo: Math.min(span.lo, rect.y), hi: Math.max(span.hi, rect.y + rect.height) } : { lo: Math.min(span.lo, rect.x), hi: Math.max(span.hi, rect.x + rect.width) }),
    { lo: Infinity, hi: -Infinity },
  );
  return axis === 'x'
    ? [
        { x: at, y: cross.lo },
        { x: at, y: cross.hi },
      ]
    : [
        { x: cross.lo, y: at },
        { x: cross.hi, y: at },
      ];
}

/** Where the marked layers sit in the row now, so a drag that changes nothing can be dropped. */
export function reorderIndexOf(state: ReorderState): number {
  const first = state.moving[0];
  if (!first) return 0;
  const at = along(state.info.selection.axis, first.rect).pos;
  return state.rest.filter((slot) => along(state.info.selection.axis, slot.rect).pos < at).length;
}
