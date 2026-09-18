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
import {
  detectSmartGrid,
  detectSmartSelection,
  gridOrder,
  gridSlots,
  gridSpacingHandles,
  respace,
  respaceGrid,
  spacingHandles,
  swapPositions,
  type SmartGrid,
  type SmartSelection,
} from '@/core/scene/smart-selection';
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

/** The selection as a smart selection can read it: every layer of it, unlocked, with where it stands. */
export interface SmartLayers {
  readonly ids: readonly Id[];
  readonly rects: readonly Rect[];
}

/** The selected layers and their world bounds, or null when the selection cannot be a smart one at all. */
function smartLayers(editor: Editor): SmartLayers | null {
  const ids = selectedSceneNodes(editor).filter((id) => !(editor.doc.get(id) as SceneNode).locked);
  if (ids.length < 2 || ids.length !== editor.selection.length) return null;
  editor.scene.ensure(editor.pageId);
  const rects: Rect[] = [];
  for (const id of ids) {
    const bounds = editor.scene.worldBounds(id);
    if (!bounds) return null;
    rects.push(bounds);
  }
  return { ids, rects };
}

/** The current selection as a smart selection (two or more unlocked layers in an evenly spaced row or column), or null. */
export function smartSelectionInfo(editor: Editor): SmartSelectionInfo | null {
  const layers = smartLayers(editor);
  const selection = layers ? detectSmartSelection(layers.rects) : null;
  return layers && selection ? { ...layers, selection } : null;
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

export const captureSpacingStarts = (tx: Transaction, editor: Editor, layers: SmartLayers): NodeStart[] => layers.ids.map((id) => captureStart(tx, editor.scene, id));

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
export function smartRingAt(editor: Editor, layers: SmartLayers, screen: Vec2, tolerancePx: number): Id | null {
  const v = editor.state.viewport;
  for (const [i, rect] of layers.rects.entries()) {
    const p = worldToScreen(v, { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 });
    if (Math.hypot(p.x - screen.x, p.y - screen.y) <= tolerancePx) return layers.ids[i]!;
  }
  return null;
}

/** Which of a smart selection's layers carry a filled ring, in the order the selection holds them. */
export const markedOf = (editor: Editor, layers: SmartLayers): Id[] => layers.ids.filter((id) => editor.state.getSnapshot().markedLayers.includes(id));

/** The marked layers of the current smart selection, or null when there is no selection or nothing is marked. */
export function markedSmartSelection(editor: Editor): { readonly info: SmartSelectionInfo; readonly marked: readonly Id[] } | null {
  const info = smartSelectionInfo(editor);
  if (!info) return null;
  const marked = markedOf(editor, info);
  return marked.length > 0 ? { info, marked } : null;
}

/** The marked layers of the current grid selection, or null when the selection is not a grid or nothing is marked. */
export function markedSmartGrid(editor: Editor): { readonly info: SmartGridInfo; readonly marked: readonly Id[] } | null {
  const info = smartGridInfo(editor);
  if (!info) return null;
  const marked = markedOf(editor, info);
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
  if (deleteMarkedInGrid(editor)) return true;
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
  const inGrid = duplicateMarkedInGrid(editor);
  if (inGrid) return inGrid;
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

/** The selection as a two-dimensional smart selection: layers in a grid, with the two gaps it is built on. */
export interface SmartGridInfo extends SmartLayers {
  readonly grid: SmartGrid;
}

/**
 * The selection as a grid, when its layers form one: rows that hold the same number of layers, lined up in
 * columns, one gap across and one gap down. A row or a column on its own is a one-dimensional selection instead.
 */
export function smartGridInfo(editor: Editor): SmartGridInfo | null {
  const layers = smartLayers(editor);
  const grid = layers ? detectSmartGrid(layers.rects) : null;
  return layers && grid ? { ...layers, grid } : null;
}

/** Whichever shape the smart selection takes: a row or column, or a grid. Null when the selection forms neither. */
export type SmartShape = { readonly kind: 'row'; readonly info: SmartSelectionInfo } | { readonly kind: 'grid'; readonly info: SmartGridInfo };

/** The smart selection as it stands, rows and columns being read before grids. */
export function smartShape(editor: Editor): SmartShape | null {
  const row = smartSelectionInfo(editor);
  if (row) return { kind: 'row', info: row };
  const grid = smartGridInfo(editor);
  return grid ? { kind: 'grid', info: grid } : null;
}

/** The layers sharing a row of the grid with `id` — what ⇧ double-click marks. */
export function gridRowOf(info: SmartGridInfo, id: Id): Id[] {
  const index = info.ids.indexOf(id);
  const row = info.grid.rows.find((candidate) => candidate.includes(index));
  return row ? row.map((i) => info.ids[i]!) : [];
}

/** Moves the grid's layers so every gap across equals `columnGap` and every gap down equals `rowGap`. */
export function applyGridSpacing(tx: Transaction, info: SmartGridInfo, starts: readonly NodeStart[], columnGap: number, rowGap: number): void {
  const positions = respaceGrid(info.rects, info.grid, columnGap, rowGap);
  info.ids.forEach((_, i) => {
    const rect = info.rects[i]!;
    const target = positions[i]!;
    translateNodes(tx, [starts[i]!], { x: target.x - rect.x, y: target.y - rect.y });
  });
}

/** Sets one of the grid's two gaps inside an open transaction, leaving the other as it is. */
export function setGridSpacingInTx(tx: Transaction, editor: Editor, axis: 'x' | 'y', gap: number): void {
  const info = smartGridInfo(editor);
  if (!info) return;
  const starts = info.ids.map((id) => captureStart(tx, editor.scene, id));
  applyGridSpacing(tx, info, starts, axis === 'x' ? gap : info.grid.columnGap, axis === 'y' ? gap : info.grid.rowGap);
}

/** Which of the grid's gaps a screen point is over, if any: the one across the rows, or the one down them. */
export function gridSpacingHandleAt(editor: Editor, info: SmartGridInfo, screen: Vec2, tolerancePx: number): 'x' | 'y' | null {
  const v = editor.state.viewport;
  for (const handle of gridSpacingHandles(info.rects, info.grid)) {
    const p = worldToScreen(v, handle.point);
    const [near, far] = handle.axis === 'x' ? [tolerancePx, tolerancePx * 2] : [tolerancePx * 2, tolerancePx];
    if (Math.abs(p.x - screen.x) <= near && Math.abs(p.y - screen.y) <= far) return handle.axis;
  }
  return null;
}

/**
 * Swaps two layers of the selection, each taking the other's place and keeping its own size — ⌘ while dragging a
 * marked layer onto another. One undo step.
 */
export function swapLayers(editor: Editor, layers: SmartLayers, a: Id, b: Id): boolean {
  const [from, to] = [layers.ids.indexOf(a), layers.ids.indexOf(b)];
  if (from === -1 || to === -1 || from === to) return false;
  const places = swapPositions(layers.rects, from, to);
  editor.history.run('Swap layers', (tx) => {
    for (const index of [from, to]) {
      const rect = layers.rects[index]!;
      const place = places[index]!;
      translateNodes(tx, [captureStart(tx, editor.scene, layers.ids[index]!)], { x: place.x - rect.x, y: place.y - rect.y });
    }
  });
  return true;
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

/** The grid's layers in the order it holds them, row by row and left to right. */
const gridSequence = (info: SmartGridInfo): Slot[] => gridOrder(info.grid).map((index) => ({ id: info.ids[index]!, rect: info.rects[index]! }));

/** Where each of the grid's layers stands, to move it from. */
const captureGrid = (tx: Transaction, editor: Editor, info: SmartGridInfo): Map<Id, NodeStart> => new Map(info.ids.map((id) => [id, captureStart(tx, editor.scene, id)]));

/**
 * Lays the grid out with its layers in the order given: each one takes the corner of the place it lands in, and
 * an order longer than the grid carries on into new rows below it. Every layer moves from where the gesture found
 * it, so laying the grid out over and over does not drift.
 */
function reflowGrid(tx: Transaction, info: SmartGridInfo, order: readonly Slot[], starts: ReadonlyMap<Id, NodeStart>): void {
  const slots = gridSlots(info.rects, info.grid, order.length);
  order.forEach((slot, n) => {
    const place = slots[n]!;
    // A layer made in this transaction is not in the scene index yet, so it moves from where its source stands.
    const from = starts.get(slot.from ?? slot.id);
    if (from) translateNodes(tx, [{ ...from, id: slot.id }], { x: place.x - slot.rect.x, y: place.y - slot.rect.y });
  });
}

/** Deletes the marked layers of a grid, the ones after them moving up a place. Returns false when it is not a grid. */
function deleteMarkedInGrid(editor: Editor): boolean {
  const state = markedSmartGrid(editor);
  if (!state) return false;
  const { info, marked } = state;
  const kept = gridSequence(info).filter((slot) => !marked.includes(slot.id));
  if (kept.length === 0) return false;
  editor.history.run('Delete', (tx) => {
    const starts = captureGrid(tx, editor, info);
    for (const id of marked) if (tx.store.has(id)) tx.delete(id);
    reflowGrid(tx, info, kept, starts);
  });
  editor.state.select(kept.map((slot) => slot.id));
  return true;
}

/** Copies each marked layer of a grid into the place after it, the rest moving along. Null when it is not a grid. */
function duplicateMarkedInGrid(editor: Editor): Id[] | null {
  const state = markedSmartGrid(editor);
  if (!state) return null;
  const { info, marked } = state;
  let clones: Id[] = [];
  editor.history.run('Duplicate', (tx) => {
    const starts = captureGrid(tx, editor, info);
    const memory = duplicateNodes(tx, editor, marked);
    clones = [...memory.clones];
    const cloneOf = new Map<Id, Id>(sortByPaintOrder(tx.store, marked).map((id, i) => [id, memory.clones[i]!]));
    const laid: Slot[] = [];
    for (const slot of gridSequence(info)) {
      laid.push(slot);
      const clone = cloneOf.get(slot.id);
      // A copy sits directly on the layer it came from until it is laid out, so it starts from the same place.
      if (clone !== undefined) laid.push({ id: clone, rect: slot.rect, from: slot.id });
    }
    reflowGrid(tx, info, laid, starts);
  });
  editor.state.select([...info.ids, ...clones]);
  editor.state.markLayers(clones);
  return clones;
}

/** A grid reorder in progress: the one layer being carried, and the places the others hold without it. */
export interface GridReorderState {
  readonly info: SmartGridInfo;
  readonly moving: Slot;
  readonly rest: readonly Slot[];
  readonly starts: ReadonlyMap<Id, NodeStart>;
}

/** Sets a grid reorder up: one marked layer comes out of the grid, leaving the places it can be dropped into. */
export function beginGridReorder(tx: Transaction, editor: Editor, info: SmartGridInfo, id: Id): GridReorderState | null {
  const sequence = gridSequence(info);
  const moving = sequence.find((slot) => slot.id === id);
  return moving ? { info, moving, rest: sequence.filter((slot) => slot.id !== id), starts: captureGrid(tx, editor, info) } : null;
}

/** Which place in the grid a world point drops the carried layer into: the one whose middle it is nearest. */
export function gridReorderIndexAt(state: GridReorderState, world: Vec2): number {
  const slots = gridSlots(state.info.rects, state.info.grid, state.rest.length + 1);
  const { width, height } = state.moving.rect;
  let best = 0;
  let nearest = Infinity;
  for (const [i, slot] of slots.entries()) {
    const distance = Math.hypot(slot.x + width / 2 - world.x, slot.y + height / 2 - world.y);
    if (distance < nearest) [best, nearest] = [i, distance];
  }
  return best;
}

/** Lays the grid out with the carried layer dropped into place `index`. */
export function applyGridReorder(tx: Transaction, state: GridReorderState, index: number): void {
  reflowGrid(tx, state.info, [...state.rest.slice(0, index), state.moving, ...state.rest.slice(index)], state.starts);
}

/** The place the carried layer holds now, so a drag that changes nothing can be dropped. */
export const gridReorderIndexOf = (state: GridReorderState): number => gridSequence(state.info).findIndex((slot) => slot.id === state.moving.id);

/** The blue line down the left of the place the carried layer will land, in world coordinates. */
export function gridReorderLine(state: GridReorderState, index: number): readonly [Vec2, Vec2] {
  const slots = gridSlots(state.info.rects, state.info.grid, state.rest.length + 1);
  const slot = slots[Math.min(index, slots.length - 1)]!;
  const at = slot.x - state.info.grid.columnGap / 2;
  return [
    { x: at, y: slot.y },
    { x: at, y: slot.y + state.moving.rect.height },
  ];
}

/**
 * Lays a smart selection out again after some of its layers have been resized, so every gap stays what it was.
 * The first layer of the row, or the top-left of the grid, stays where the resize left it and the rest follow.
 * Where the layers stand is read afresh, so this can run on every frame of a resize without drifting.
 */
export function reflowAfterResize(tx: Transaction, editor: Editor, shape: SmartShape): void {
  editor.scene.ensure(editor.pageId);
  const live = shape.info.ids.map((id) => editor.scene.worldBounds(id));
  if (live.some((rect) => rect === null)) return;
  const rects = live as Rect[];
  const place = (index: number, target: Vec2): void => {
    const rect = rects[index]!;
    const delta = { x: target.x - rect.x, y: target.y - rect.y };
    if (Math.abs(delta.x) < 1e-6 && Math.abs(delta.y) < 1e-6) return;
    translateNodes(tx, [captureStart(tx, editor.scene, shape.info.ids[index]!)], delta);
  };
  if (shape.kind === 'row') {
    const { axis, order, gap } = shape.info.selection;
    const first = rects[order[0]!]!;
    let cursor = along(axis, first).pos + along(axis, first).size;
    for (const index of order.slice(1)) {
      const rect = rects[index]!;
      const pos = cursor + gap;
      place(index, axis === 'x' ? { x: pos, y: rect.y } : { x: rect.x, y: pos });
      cursor = pos + along(axis, rect).size;
    }
    return;
  }
  const { rows, columnGap, rowGap } = shape.info.grid;
  // A grid lays its columns out from the left of the first one and its rows down from the top of the first row,
  // each column as wide as its widest layer and each row as tall as its tallest, keeping in-cell offsets.
  const tops = rows.map((row) => Math.min(...row.map((index) => rects[index]!.y)));
  const lefts = rows[0]!.map((_, c) => Math.min(...rows.map((row) => rects[row[c]!]!.x)));
  const widths = lefts.map((_, c) => Math.max(...rows.map((row) => rects[row[c]!]!.width)));
  const heights = rows.map((row) => Math.max(...row.map((index) => rects[index]!.height)));
  const laid = (sizes: readonly number[], start: number, gap: number): number[] => {
    let cursor = start;
    return sizes.map((size) => {
      const at = cursor;
      cursor += size + gap;
      return at;
    });
  };
  const x = laid(widths, lefts[0]!, columnGap);
  const y = laid(heights, tops[0]!, rowGap);
  for (const [r, row] of rows.entries()) {
    for (const [c, index] of row.entries()) {
      const rect = rects[index]!;
      place(index, { x: x[c]! + (rect.x - lefts[c]!), y: y[r]! + (rect.y - tops[r]!) });
    }
  }
}
