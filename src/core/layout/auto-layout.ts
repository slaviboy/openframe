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

import type { DocumentStore } from '../document/store';
import type { Finalizer, Transaction } from '../history/history';
import { keysBetween } from '../ids/fractional-index';
import type { Id } from '../ids/ids';
import { transformRect, type Rect } from '../math/rect';
import { valuesEqual } from '../ops/equality';
import { matrixOf } from '../scene/scene-index';
import { isSceneNode, type FrameNode, type Node, type SceneNode, type Transform } from '../schema/document';
import type { TextLayoutService } from '../text/text-layout';
import { fitTextBox } from '../text/text-resize';
import { layoutFlow, type FlowDirection, type FlowItem, type Padding, type Sizing } from './flow-layout';
import { layoutGrid, type GridContainer, type GridItem } from './grid-layout';

export type AutoLayoutFrame = FrameNode & { readonly layoutMode: FlowDirection | 'GRID' };

const EPSILON = 1e-6;
const round = (v: number) => Math.round(v * 100) / 100;

export const isAutoLayoutFrame = (node: Node | undefined): node is AutoLayoutFrame => node?.type === 'FRAME' && node.layoutMode !== undefined;

/** A layer's horizontal resizing: fill (in an auto layout parent), hug (auto layout frames and auto-width text) or fixed. */
export function horizontalSizing(node: SceneNode, inAutoLayout: boolean): Sizing {
  if (node.layoutSizingHorizontal === 'FILL' && inAutoLayout) return 'FILL';
  if (node.type === 'TEXT') return node.textAutoResize === 'WIDTH_AND_HEIGHT' ? 'HUG' : 'FIXED';
  return node.layoutSizingHorizontal === 'HUG' && isAutoLayoutFrame(node) ? 'HUG' : 'FIXED';
}

/** A layer's vertical resizing: fill (in an auto layout parent), hug (auto layout frames, auto-width or auto-height text) or fixed. */
export function verticalSizing(node: SceneNode, inAutoLayout: boolean): Sizing {
  if (node.layoutSizingVertical === 'FILL' && inAutoLayout) return 'FILL';
  if (node.type === 'TEXT') return node.textAutoResize === 'WIDTH_AND_HEIGHT' || node.textAutoResize === 'HEIGHT' ? 'HUG' : 'FIXED';
  return node.layoutSizingVertical === 'HUG' && isAutoLayoutFrame(node) ? 'HUG' : 'FIXED';
}

/** Padding plus inside strokes, which take up room in the layout (outside and center strokes don't). */
export function layoutPadding(frame: FrameNode): Padding {
  const inside = frame.strokesIncludedInLayout !== false && frame.strokeAlign === 'INSIDE' && frame.strokes.some((paint) => paint.visible);
  const weights = frame.individualStrokeWeights ?? { top: frame.strokeWeight, right: frame.strokeWeight, bottom: frame.strokeWeight, left: frame.strokeWeight };
  return {
    top: (frame.paddingTop ?? 0) + (inside ? weights.top : 0),
    right: (frame.paddingRight ?? 0) + (inside ? weights.right : 0),
    bottom: (frame.paddingBottom ?? 0) + (inside ? weights.bottom : 0),
    left: (frame.paddingLeft ?? 0) + (inside ? weights.left : 0),
  };
}

/** The layer's bounding box in its parent's space. */
const boundsInParent = (node: SceneNode): Rect => transformRect(matrixOf(node.transform), { x: 0, y: 0, width: node.size.width, height: node.size.height });

/** Children that take part in the flow: visible layers that don't ignore auto layout, in layer order. */
const flowChildren = (tx: Transaction, frameId: Id): SceneNode[] =>
  tx.store
    .children(frameId)
    .map((id) => tx.store.get(id))
    .filter((n): n is SceneNode => n !== undefined && isSceneNode(n) && n.visible && n.layoutPositioning !== 'ABSOLUTE');

/** Children in drawing order (bottom first): reversed when an auto layout frame puts its first child on top. */
export function stackingOrder(node: Node | undefined, children: readonly Id[]): readonly Id[] {
  return isAutoLayoutFrame(node) && node.itemReverseZIndex ? [...children].reverse() : children;
}

const FLEX_TRACK = { type: 'FLEX', value: 1 } as const;
const GRID_FRAME_FIELDS = ['gridColumnSizes', 'gridRowSizes', 'gridColumnGap', 'gridRowGap', 'gridAutoPositioning'] as const;
const GRID_CHILD_FIELDS = ['gridColumnSpan', 'gridRowSpan', 'gridColumn', 'gridRow', 'gridChildHorizontalAlign', 'gridChildVerticalAlign'] as const;

function gridContainer(frame: AutoLayoutFrame): GridContainer {
  return {
    padding: layoutPadding(frame),
    columnGap: frame.gridColumnGap ?? 0,
    rowGap: frame.gridRowGap ?? 0,
    width: frame.size.width,
    height: frame.size.height,
    horizontalSizing: frame.layoutSizingHorizontal === 'HUG' ? 'HUG' : 'FIXED',
    verticalSizing: frame.layoutSizingVertical === 'HUG' ? 'HUG' : 'FIXED',
    minWidth: frame.minWidth,
    maxWidth: frame.maxWidth,
    minHeight: frame.minHeight,
    maxHeight: frame.maxHeight,
    columns: frame.gridColumnSizes ?? [FLEX_TRACK],
    rows: frame.gridRowSizes ?? [],
    autoRow: FLEX_TRACK,
    autoPlacement: frame.gridAutoPositioning !== false,
  };
}

const gridItem = (child: SceneNode, item: FlowItem): GridItem => ({
  ...item,
  columnSpan: child.gridColumnSpan ?? 1,
  rowSpan: child.gridRowSpan ?? 1,
  column: child.gridColumn,
  row: child.gridRow,
  horizontalAlign: child.gridChildHorizontalAlign ?? 'MIN',
  verticalAlign: child.gridChildVerticalAlign ?? 'MIN',
});

/** The column and row tracks of a grid auto layout frame as currently laid out, in the frame's space; null for other layers. */
export function gridTracks(store: DocumentStore, frameId: Id): { readonly columns: readonly { start: number; length: number }[]; readonly rows: readonly { start: number; length: number }[] } | null {
  const frame = store.get(frameId);
  if (!isAutoLayoutFrame(frame) || frame.layoutMode !== 'GRID') return null;
  const children = store
    .children(frameId)
    .map((id) => store.get(id))
    .filter((n): n is SceneNode => n !== undefined && isSceneNode(n) && n.visible && n.layoutPositioning !== 'ABSOLUTE');
  const result = layoutGrid(
    gridContainer(frame),
    children.map((child) => {
      const box = boundsInParent(child);
      return gridItem(child, {
        width: box.width,
        height: box.height,
        horizontalSizing: horizontalSizing(child, true),
        verticalSizing: verticalSizing(child, true),
        minWidth: child.minWidth,
        maxWidth: child.maxWidth,
        minHeight: child.minHeight,
        maxHeight: child.maxHeight,
      });
    }),
  );
  return { columns: result.columns, rows: result.rows };
}

/** The cell of every flow child of a grid auto layout frame. */
export function gridCells(tx: Transaction, frameId: Id): Map<Id, { column: number; row: number }> {
  const cells = new Map<Id, { column: number; row: number }>();
  const frame = tx.store.get(frameId);
  if (!isAutoLayoutFrame(frame) || frame.layoutMode !== 'GRID') return cells;
  const children = flowChildren(tx, frameId);
  const result = layoutGrid(gridContainer(frame), children.map((child) => gridItem(child, { width: 0, height: 0, horizontalSizing: 'FIXED', verticalSizing: 'FIXED' })));
  children.forEach((child, i) => cells.set(child.id, result.cells[i]!));
  return cells;
}

/**
 * Lays out one auto layout frame's children and fits the frame when it hugs. Returns whether the
 * frame's size changed and which children were resized.
 */
function layoutFrame(tx: Transaction, frameId: Id, layout: TextLayoutService | null): { resizedSelf: boolean; resizedChildren: Id[] } {
  const resizedChildren: Id[] = [];
  let resizedSelf = false;
  // Refitting text that fills its width can change its height, which needs one more pass.
  for (let pass = 0; pass < 3; pass++) {
    const frame = tx.store.get(frameId);
    if (!isAutoLayoutFrame(frame)) break;
    const children = flowChildren(tx, frameId);
    const horizontal = frame.layoutMode === 'HORIZONTAL';
    // Vertically trimmed text takes up only the space from its cap height to its last baseline.
    const trims = children.map((child) => {
      const t = child.transform;
      return Math.abs(t[1]) < EPSILON && Math.abs(t[2]) < EPSILON && child.type === 'TEXT' && child.leadingTrim === 'CAP_HEIGHT' ? (layout?.verticalTrim?.(child) ?? null) : null;
    });
    const baselineOf = (child: SceneNode, i: number): number | undefined => {
      const baseline = child.type === 'TEXT' ? layout?.firstBaseline?.(child) : null;
      return baseline === null || baseline === undefined ? undefined : baseline - (trims[i]?.top ?? 0);
    };
    const items: FlowItem[] = children.map((child, i) => {
      const box = boundsInParent(child);
      const t = child.transform;
      const axisAligned = Math.abs(t[1]) < EPSILON && Math.abs(t[2]) < EPSILON;
      // Rotated layers keep their size; they flow by their bounding box.
      const h = horizontalSizing(child, true);
      const v = verticalSizing(child, true);
      const padding = isAutoLayoutFrame(child) ? layoutPadding(child) : null;
      return {
        width: box.width,
        height: box.height - (trims[i] ? trims[i]!.top + trims[i]!.bottom : 0),
        horizontalSizing: axisAligned || h !== 'FILL' ? h : 'FIXED',
        verticalSizing: axisAligned || v !== 'FILL' ? v : 'FIXED',
        mainInset: padding ? (horizontal ? padding.left + padding.right : padding.top + padding.bottom) : 0,
        // Text baseline alignment measures unrotated text layers' first baselines.
        baseline: frame.counterAxisAlignItems === 'BASELINE' && child.type === 'TEXT' && axisAligned ? baselineOf(child, i) : undefined,
        // Limits apply to the layer's own box, so rotated layers aren't limited.
        ...(axisAligned ? { minWidth: child.minWidth, maxWidth: child.maxWidth, minHeight: child.minHeight, maxHeight: child.maxHeight } : {}),
      };
    });
    const result =
      frame.layoutMode === 'GRID'
        ? layoutGrid(gridContainer(frame), children.map((child, i) => gridItem(child, items[i]!)))
        : layoutFlow(
      {
        direction: frame.layoutMode,
        wrap: frame.layoutWrap === true,
        padding: layoutPadding(frame),
        gap: frame.itemSpacing ?? 0,
        counterGap: frame.counterAxisSpacing ?? 0,
        primaryAlign: frame.primaryAxisAlignItems ?? 'MIN',
        counterAlign: frame.counterAxisAlignItems ?? 'MIN',
        width: frame.size.width,
        height: frame.size.height,
        horizontalSizing: frame.layoutSizingHorizontal === 'HUG' ? 'HUG' : 'FIXED',
        verticalSizing: frame.layoutSizingVertical === 'HUG' ? 'HUG' : 'FIXED',
        minWidth: frame.minWidth,
        maxWidth: frame.maxWidth,
        minHeight: frame.minHeight,
        maxHeight: frame.maxHeight,
      },
      items,
    );
    const size = { width: round(result.width), height: round(result.height) };
    if (!valuesEqual(size, frame.size)) {
      tx.set(frameId, 'size', size);
      resizedSelf = true;
    }
    let refitText = false;
    children.forEach((child, i) => {
      const box = result.items[i]!;
      const item = items[i]!;
      let width = child.size.width;
      let height = child.size.height;
      // Axis-aligned children take the laid-out size: filled, or fixed and hugging sizes clamped by their limits.
      if (Math.abs(child.transform[1]) < EPSILON && Math.abs(child.transform[2]) < EPSILON) {
        width = round(box.width);
        height = round(box.height + (trims[i] ? trims[i]!.top + trims[i]!.bottom : 0));
      }
      const m = matrixOf(child.transform);
      // Where the bounding box sits relative to the layer's origin, at the new size.
      const offset = transformRect({ ...m, e: 0, f: 0 }, { x: 0, y: 0, width, height });
      const t = child.transform;
      const transform: Transform = [t[0], t[1], t[2], t[3], round(box.x - offset.x), round(box.y - offset.y - (trims[i]?.top ?? 0))];
      if (!valuesEqual(transform, t)) tx.set(child.id, 'transform', transform);
      if (width !== child.size.width || height !== child.size.height) {
        tx.set(child.id, 'size', { width, height });
        resizedChildren.push(child.id);
        const resized = tx.store.get(child.id);
        if (resized?.type === 'TEXT') {
          // Text that fills its width wraps (auto height); text that fills its height is a fixed box.
          const mode = item.verticalSizing === 'FILL' ? 'NONE' : width !== child.size.width && resized.textAutoResize === 'WIDTH_AND_HEIGHT' ? 'HEIGHT' : resized.textAutoResize;
          if (mode !== resized.textAutoResize) tx.set(child.id, 'textAutoResize', mode);
          const current = tx.store.get(child.id);
          if (layout && current?.type === 'TEXT') {
            const before = current.size.height;
            fitTextBox(tx, current, layout);
            if ((tx.store.get(child.id) as SceneNode).size.height !== before) refitText = true;
          }
        }
      }
    });
    if (!refitText) break;
  }
  return { resizedSelf, resizedChildren };
}

/** Frame fields that change how its children are laid out. */
const FRAME_FIELDS: ReadonlySet<string> = new Set([
  'layoutMode',
  'layoutWrap',
  'paddingTop',
  'paddingRight',
  'paddingBottom',
  'paddingLeft',
  'itemSpacing',
  'counterAxisSpacing',
  'primaryAxisAlignItems',
  'counterAxisAlignItems',
  'layoutSizingHorizontal',
  'layoutSizingVertical',
  'size',
  'strokes',
  'strokeWeight',
  'strokeAlign',
  'individualStrokeWeights',
  'strokesIncludedInLayout',
  'minWidth',
  'maxWidth',
  'minHeight',
  'maxHeight',
  ...GRID_FRAME_FIELDS,
]);

/** Child fields that change its parent's layout. */
const CHILD_FIELDS: ReadonlySet<string> = new Set(['leadingTrim', 'size', 'transform', 'visible', 'layoutSizingHorizontal', 'layoutSizingVertical', 'textAutoResize', 'layoutPositioning', 'minWidth', 'maxWidth', 'minHeight', 'maxHeight', ...GRID_CHILD_FIELDS]);

/**
 * Auto layout finalizer: lays out every auto layout frame affected by the transaction — its own
 * settings or size changed, or a child was added, removed, shown, hidden, resized or moved — deepest
 * first, re-laying out parents whose hugging children resized and children resized by fill.
 * In `preview` mode (during a gesture), frames whose children are only being moved are left alone,
 * so a dragged child follows the pointer.
 */
export function createAutoLayoutFinalizer(getLayout: () => TextLayoutService | null, options: { readonly preview?: boolean } = {}): Finalizer {
  return (tx) => {
    const store = tx.store;
    const dirty = new Set<Id>();
    const mark = (id: Id | null | undefined) => {
      if (id && isAutoLayoutFrame(store.get(id))) dirty.add(id);
    };
    const moved = new Set<Id>();
    const resized = new Set<Id>();
    for (const op of tx.ops) {
      if (op.kind === 'create') {
        if (op.node.type !== 'DOCUMENT') mark(op.node.parent.id);
        mark(op.node.id);
      } else if (op.kind === 'delete') {
        if (op.node.type !== 'DOCUMENT') mark(op.node.parent.id);
      } else if (store.has(op.id)) {
        if (FRAME_FIELDS.has(op.field)) mark(op.id);
        if (op.field === 'parent') {
          mark((op.prev as { id: Id } | undefined)?.id);
          mark(store.parentOf(op.id));
        } else if (CHILD_FIELDS.has(op.field)) {
          if (op.field === 'transform') moved.add(op.id);
          else if (op.field === 'size') resized.add(op.id);
          mark(store.parentOf(op.id));
        }
      }
    }
    if (options.preview) {
      for (const id of moved) {
        const parent = store.parentOf(id);
        if (!resized.has(id) && parent) dirty.delete(parent);
      }
    }
    if (dirty.size === 0) return;

    const layout = getLayout();
    const queue = new Set(dirty);
    const depth = (id: Id) => store.ancestors(id).length;
    for (let guard = 0; queue.size > 0 && guard < 10_000; guard++) {
      let next: Id | null = null;
      for (const id of queue) if (next === null || depth(id) > depth(next)) next = id;
      queue.delete(next!);
      if (!isAutoLayoutFrame(store.get(next!))) continue;
      const { resizedSelf, resizedChildren } = layoutFrame(tx, next!, layout);
      const parent = store.parentOf(next!);
      if (resizedSelf && parent && isAutoLayoutFrame(store.get(parent))) queue.add(parent);
      for (const child of resizedChildren) if (isAutoLayoutFrame(store.get(child))) queue.add(child);
    }
  };
}

/** Whether children sorted along an axis sit one after another rather than overlapping. */
function sequentialPairs(boxes: readonly Rect[], axis: 'x' | 'y'): number {
  const size = axis === 'x' ? 'width' : 'height';
  const sorted = [...boxes].sort((a, b) => a[axis] - b[axis]);
  let count = 0;
  for (let i = 1; i < sorted.length; i++) if (sorted[i]![axis] >= sorted[i - 1]![axis] + sorted[i - 1]![size] - 1) count++;
  return count;
}

/**
 * Turns a frame into an auto layout frame that keeps its current look as far as possible: the flow
 * direction follows how the children are arranged, the gap is their average spacing, padding is the
 * space around them (unless `inferPadding` is false), children are reordered to their position along
 * the flow, and a frame with children hugs them. An empty frame becomes a vertical flow at its size.
 */
export function applyAutoLayout(tx: Transaction, frameId: Id, options: { readonly inferPadding?: boolean } = {}): void {
  const store = tx.store;
  const frame = store.get(frameId);
  if (frame?.type !== 'FRAME' || frame.layoutMode) return;
  const children = flowChildren(tx, frameId);
  const boxes = children.map(boundsInParent);
  const union = boxes.reduce<Rect | null>(
    (acc, b) => (acc ? { x: Math.min(acc.x, b.x), y: Math.min(acc.y, b.y), width: Math.max(acc.x + acc.width, b.x + b.width) - Math.min(acc.x, b.x), height: Math.max(acc.y + acc.height, b.y + b.height) - Math.min(acc.y, b.y) } : b),
    null,
  );
  const across = sequentialPairs(boxes, 'x');
  const down = sequentialPairs(boxes, 'y');
  const direction: FlowDirection = children.length > 1 && (across > down || (across === down && union!.width > union!.height)) ? 'HORIZONTAL' : 'VERTICAL';
  const axis = direction === 'HORIZONTAL' ? 'x' : 'y';
  const length = direction === 'HORIZONTAL' ? 'width' : 'height';
  const order = children.map((child, i) => ({ child, box: boxes[i]! })).sort((a, b) => a.box[axis] - b.box[axis]);

  tx.set(frameId, 'layoutMode', direction);
  if (order.length > 1) {
    const gaps = order.slice(1).map((entry, i) => entry.box[axis] - (order[i]!.box[axis] + order[i]!.box[length]));
    const gap = Math.round(gaps.reduce((a, b) => a + b, 0) / gaps.length);
    tx.set(frameId, 'itemSpacing', gap === 0 ? undefined : gap);
    // Keep the layers in flow order; hidden layers stay after them in their current order.
    const hidden = store.children(frameId).filter((id) => !order.some((entry) => entry.child.id === id));
    const ids = [...order.map((entry) => entry.child.id), ...hidden];
    if (ids.some((id, i) => store.children(frameId)[i] !== id)) {
      const keys = keysBetween(null, null, ids.length);
      ids.forEach((id, i) => tx.set(id, 'parent', { id: frameId, key: keys[i]! }));
    }
  }
  if (union) {
    if (options.inferPadding !== false) {
      const pad = (v: number) => (v > 0 ? Math.round(v) : undefined);
      tx.set(frameId, 'paddingLeft', pad(union.x));
      tx.set(frameId, 'paddingTop', pad(union.y));
      tx.set(frameId, 'paddingRight', pad(frame.size.width - union.x - union.width));
      tx.set(frameId, 'paddingBottom', pad(frame.size.height - union.y - union.height));
    }
    // Children lined up on their centers or far edges keep that alignment.
    const crossAxis = direction === 'HORIZONTAL' ? 'y' : 'x';
    const crossLength = direction === 'HORIZONTAL' ? 'height' : 'width';
    const same = (value: (b: Rect) => number) => boxes.every((b) => Math.abs(value(b) - value(boxes[0]!)) < 1);
    const counter = boxes.length > 1 && !same((b) => b[crossAxis]) ? (same((b) => b[crossAxis] + b[crossLength] / 2) ? 'CENTER' : same((b) => b[crossAxis] + b[crossLength]) ? 'MAX' : undefined) : undefined;
    tx.set(frameId, 'counterAxisAlignItems', counter);
    tx.set(frameId, 'layoutSizingHorizontal', 'HUG');
    tx.set(frameId, 'layoutSizingVertical', 'HUG');
  }
}

/** Turns auto layout off: children stay where they are, and fill and hug resizing become fixed. */
export function clearAutoLayout(tx: Transaction, frameId: Id): void {
  const frame = tx.store.get(frameId);
  if (!isAutoLayoutFrame(frame)) return;
  for (const field of ['layoutMode', 'layoutWrap', 'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft', 'itemSpacing', 'counterAxisSpacing', 'primaryAxisAlignItems', 'counterAxisAlignItems', 'itemReverseZIndex', 'strokesIncludedInLayout', ...GRID_FRAME_FIELDS]) {
    tx.set(frameId, field, undefined);
  }
  if (frame.layoutSizingHorizontal === 'HUG') tx.set(frameId, 'layoutSizingHorizontal', undefined);
  if (frame.layoutSizingVertical === 'HUG') tx.set(frameId, 'layoutSizingVertical', undefined);
  for (const id of tx.store.children(frameId)) {
    const child = tx.store.get(id);
    if (!child || !isSceneNode(child)) continue;
    if (child.layoutSizingHorizontal === 'FILL') tx.set(id, 'layoutSizingHorizontal', undefined);
    if (child.layoutSizingVertical === 'FILL') tx.set(id, 'layoutSizingVertical', undefined);
    if (child.layoutPositioning) tx.set(id, 'layoutPositioning', undefined);
    for (const field of GRID_CHILD_FIELDS) if (child[field] !== undefined) tx.set(id, field, undefined);
  }
}

/**
 * Switches a frame to the grid flow (giving it auto layout first when needed): as many 1fr columns as
 * its first row of children, with its gap between columns and between rows.
 */
export function applyGridLayout(tx: Transaction, frameId: Id): void {
  const store = tx.store;
  if (store.get(frameId)?.type !== 'FRAME') return;
  if (!isAutoLayoutFrame(store.get(frameId))) applyAutoLayout(tx, frameId);
  const frame = store.get(frameId);
  if (!isAutoLayoutFrame(frame) || frame.layoutMode === 'GRID') return;
  const children = flowChildren(tx, frameId).map((child) => ({ id: child.id, box: boundsInParent(child) }));
  const boxes = children.map((c) => c.box);
  const top = boxes.length > 0 ? boxes.reduce((a, b) => (b.y < a.y ? b : a)) : null;
  const left = boxes.length > 0 ? boxes.reduce((a, b) => (b.x < a.x ? b : a)) : null;
  const firstRow = top ? boxes.filter((b) => b.y < top.y + top.height / 2).sort((a, b) => a.x - b.x) : [];
  const firstColumn = left ? boxes.filter((b) => b.x < left.x + left.width / 2).sort((a, b) => a.y - b.y) : [];
  const columns = Math.max(1, firstRow.length);
  const averageGap = (sorted: readonly Rect[], axis: 'x' | 'y') => {
    const size = axis === 'x' ? 'width' : 'height';
    const gaps = sorted.slice(1).map((b, i) => b[axis] - sorted[i]![axis] - sorted[i]![size]);
    return gaps.length > 0 ? Math.max(0, Math.round(gaps.reduce((sum, g) => sum + g, 0) / gaps.length)) : null;
  };
  const gap = averageGap(firstRow, 'x') ?? Math.max(0, frame.itemSpacing ?? 0);
  const rowGap = averageGap(firstColumn, 'y') ?? gap;
  // Cells fill in reading order: children on the same row (overlapping vertically) left to right.
  const reading = [...children].sort((a, b) => (Math.abs(a.box.y - b.box.y) < Math.min(a.box.height, b.box.height) / 2 ? a.box.x - b.box.x : a.box.y - b.box.y)).map((c) => c.id);
  const flowIds = store.children(frameId).filter((id) => reading.includes(id));
  if (reading.some((id, i) => flowIds[i] !== id)) {
    const others = store.children(frameId).filter((id) => !reading.includes(id));
    const keys = keysBetween(null, null, reading.length + others.length);
    [...reading, ...others].forEach((id, i) => tx.set(id, 'parent', { id: frameId, key: keys[i]! }));
  }
  tx.set(frameId, 'layoutMode', 'GRID');
  tx.set(frameId, 'gridColumnSizes', Array.from({ length: columns }, () => FLEX_TRACK));
  tx.set(frameId, 'gridColumnGap', gap > 0 ? gap : undefined);
  tx.set(frameId, 'gridRowGap', rowGap > 0 ? rowGap : undefined);
  for (const field of ['layoutWrap', 'itemSpacing', 'counterAxisSpacing', 'primaryAxisAlignItems', 'counterAxisAlignItems']) tx.set(frameId, field, undefined);
}

/** Leaves the grid flow (before switching to horizontal or vertical): the column gap becomes the gap between items. */
export function clearGridLayout(tx: Transaction, frameId: Id): void {
  const frame = tx.store.get(frameId);
  if (!isAutoLayoutFrame(frame) || frame.layoutMode !== 'GRID') return;
  tx.set(frameId, 'itemSpacing', frame.gridColumnGap);
  for (const field of GRID_FRAME_FIELDS) tx.set(frameId, field, undefined);
  for (const id of tx.store.children(frameId)) {
    const child = tx.store.get(id);
    if (!child || !isSceneNode(child)) continue;
    for (const field of GRID_CHILD_FIELDS) if (child[field] !== undefined) tx.set(id, field, undefined);
  }
}

/** Turns a grid's automatic positioning off (children keep their current cells) or back on (rows become Auto). */
export function setGridAutoPositioning(tx: Transaction, frameId: Id, on: boolean): void {
  const frame = tx.store.get(frameId);
  if (!isAutoLayoutFrame(frame) || frame.layoutMode !== 'GRID') return;
  if (on) {
    tx.set(frameId, 'gridAutoPositioning', undefined);
    tx.set(frameId, 'gridRowSizes', undefined);
    for (const id of tx.store.children(frameId)) {
      tx.set(id, 'gridColumn', undefined);
      tx.set(id, 'gridRow', undefined);
    }
    return;
  }
  for (const [id, cell] of gridCells(tx, frameId)) {
    tx.set(id, 'gridColumn', cell.column);
    tx.set(id, 'gridRow', cell.row);
  }
  tx.set(frameId, 'gridAutoPositioning', false);
}
