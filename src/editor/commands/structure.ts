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

import { makeFrame, makeGroup, makeSection } from '@/core/document/factory';
import { sortByPaintOrder } from '@/core/document/order';
import type { DocumentStore } from '@/core/document/store';
import type { Transaction } from '@/core/history/history';
import { keyBetween, keysBetween } from '@/core/ids/fractional-index';
import type { Id } from '@/core/ids/ids';
import { IDENTITY, invert, multiply, scaling, translation, type Matrix } from '@/core/math/matrix';
import { contains as containsRect, transformRect, unionAll } from '@/core/math/rect';
import { matrixOf } from '@/core/scene/scene-index';
import { isSceneNode, type Node, type SceneNode, type Transform } from '@/core/schema/document';
import type { DuplicateMemory, Editor } from '../editor';
import { roundTransform, toTransform } from '../interactions/transform';
import { keyOf, nextKeyAbove, selectedSceneNodes, topChildKey } from './selection-helpers';

const worldOf = (editor: Editor, id: Id): Matrix => {
  const node = editor.doc.get(id);
  return node && isSceneNode(node) ? editor.scene.computeWorld(id) : IDENTITY;
};

function nextName(store: DocumentStore, pageId: Id, base: string): string {
  let max = 0;
  const pattern = new RegExp(`^${base} (\\d+)$`);
  for (const id of store.descendants(pageId, false)) {
    const match = pattern.exec(store.get(id)?.name ?? '');
    if (match) max = Math.max(max, Number(match[1]));
  }
  return `${base} ${max + 1}`;
}

/**
 * Wraps the selection in a new group (⌘G) or frame (⌥⌘G). The container is inserted at
 * the z-position of the top-most selected layer, in that layer's parent. Layers keep their
 * canvas position and relative order. Groups then hug their children (group finalizer);
 * frames are sized to the selection bounds once.
 */
export interface WrapOptions {
  /** Undo label (default "Group selection" / "Frame selection"). */
  readonly label?: string;
  /** Base layer name (default "Group" / "Frame"). */
  readonly name?: string;
  /** Extra edits in the same transaction, with the wrapped ids in paint order (bottom first). */
  readonly after?: (tx: Transaction, containerId: Id, ids: readonly Id[]) => void;
}

export function wrapSelection(editor: Editor, kind: 'GROUP' | 'FRAME', options: WrapOptions = {}): Id | null {
  const ids = sortByPaintOrder(editor.doc, selectedSceneNodes(editor));
  const topmost = ids.at(-1);
  if (!topmost || ids.some((id) => editor.doc.get(id)?.type === 'SECTION')) return null;
  const store = editor.doc;
  const parent = store.parentOf(topmost)!;
  const containerId = editor.ids.next();
  const selected = new Set(ids);

  editor.history.run(options.label ?? (kind === 'GROUP' ? 'Group selection' : 'Frame selection'), (tx) => {
    const parentWorld = worldOf(editor, parent);
    const parentInv = invert(parentWorld);
    if (!parentInv) return;
    const key = keyBetween(keyOf(store, topmost), nextKeyAbove(store, topmost, selected));
    const name = nextName(store, editor.pageId, options.name ?? (kind === 'GROUP' ? 'Group' : 'Frame'));
    let containerWorld = parentWorld;
    if (kind === 'GROUP') {
      tx.create(makeGroup({ id: containerId, parent: { id: parent, key }, name, x: 0, y: 0, width: 0, height: 0 }));
    } else {
      const bounds = unionAll(
        ids.map((id) => {
          const node = store.getOrThrow(id) as SceneNode;
          return transformRect(multiply(parentInv, worldOf(editor, id)), { x: 0, y: 0, width: node.size.width, height: node.size.height });
        }),
      )!;
      const x = Math.round(bounds.x);
      const y = Math.round(bounds.y);
      tx.create(
        makeFrame({ id: containerId, parent: { id: parent, key }, name, x, y, width: Math.round(bounds.x + bounds.width) - x, height: Math.round(bounds.y + bounds.height) - y }),
      );
      containerWorld = multiply(parentWorld, translation(x, y));
    }
    const containerInv = invert(containerWorld)!;
    const keys = keysBetween(null, null, ids.length);
    ids.forEach((id, i) => {
      const world = worldOf(editor, id);
      tx.set(id, 'parent', { id: containerId, key: keys[i]! });
      tx.set(id, 'transform', toTransform(multiply(containerInv, world)));
    });
    options.after?.(tx, containerId, ids);
  });
  editor.state.select([containerId]);
  return containerId;
}

/** Whether every selected layer is a section, or all selected layers share a page or section parent. */
export function canWrapInSection(editor: Editor): boolean {
  const ids = selectedSceneNodes(editor);
  const parent = ids.length > 0 ? editor.doc.parentOf(ids[0]!) : null;
  if (parent === null || ids.some((id) => editor.doc.parentOf(id) !== parent)) return false;
  const type = editor.doc.get(parent)?.type;
  return type === 'PAGE' || type === 'SECTION';
}

/** Space between wrapped content and the edges of a new section. */
export const SECTION_PADDING = 40;

/**
 * Wrap in new section (⌥⌘S): creates a section around selected siblings on the page or in
 * a section, padded on every side, at the z-position of the top-most selected layer.
 */
export function wrapInSection(editor: Editor): Id | null {
  if (!canWrapInSection(editor)) return null;
  const store = editor.doc;
  const ids = sortByPaintOrder(store, selectedSceneNodes(editor));
  const topmost = ids.at(-1)!;
  const parent = store.parentOf(topmost)!;
  const sectionId = editor.ids.next();
  editor.history.run('Wrap in new section', (tx) => {
    const parentWorld = worldOf(editor, parent);
    const parentInv = invert(parentWorld);
    if (!parentInv) return;
    const bounds = unionAll(
      ids.map((id) => {
        const node = store.getOrThrow(id) as SceneNode;
        return transformRect(multiply(parentInv, worldOf(editor, id)), { x: 0, y: 0, width: node.size.width, height: node.size.height });
      }),
    )!;
    const x = Math.round(bounds.x - SECTION_PADDING);
    const y = Math.round(bounds.y - SECTION_PADDING);
    const width = Math.round(bounds.x + bounds.width + SECTION_PADDING) - x;
    const height = Math.round(bounds.y + bounds.height + SECTION_PADDING) - y;
    const key = keyBetween(keyOf(store, topmost), nextKeyAbove(store, topmost, new Set(ids)));
    tx.create(makeSection({ id: sectionId, parent: { id: parent, key }, name: nextName(store, editor.pageId, 'Section'), x, y, width, height }));
    const sectionInv = invert(multiply(parentWorld, translation(x, y)))!;
    const keys = keysBetween(null, null, ids.length);
    ids.forEach((id, i) => {
      const world = worldOf(editor, id);
      tx.set(id, 'parent', { id: sectionId, key: keys[i]! });
      tx.set(id, 'transform', toTransform(multiply(sectionInv, world)));
    });
  });
  editor.state.select([sectionId]);
  return sectionId;
}

/**
 * Moves the siblings that each section fully covers into it, preserving their canvas
 * position and relative order. Runs when a section is drawn, moved or resized over layers.
 * The transaction's preview must be flushed so the scene index reflects the gesture.
 */
export function adoptCoveredLayers(tx: Transaction, editor: Editor, sectionIds: readonly Id[]): void {
  const store = tx.store;
  editor.scene.ensure(editor.pageId);
  for (const sectionId of sectionIds) {
    const section = store.get(sectionId);
    if (section?.type !== 'SECTION') continue;
    const bounds = editor.scene.worldBounds(sectionId);
    const sectionInv = invert(editor.scene.computeWorld(sectionId));
    if (!bounds || !sectionInv) continue;
    const covered = store.children(section.parent.id).filter((id) => {
      if (id === sectionId || sectionIds.includes(id)) return false;
      const node = store.get(id);
      const nodeBounds = node && isSceneNode(node) ? editor.scene.worldBounds(id) : null;
      return nodeBounds !== null && containsRect(bounds, nodeBounds);
    });
    let lo = topChildKey(store, sectionId);
    for (const id of covered) {
      const world = editor.scene.computeWorld(id);
      const key = keyBetween(lo, null);
      lo = key;
      tx.set(id, 'parent', { id: sectionId, key });
      tx.set(id, 'transform', toTransform(multiply(sectionInv, world)));
    }
  }
}

export interface UngroupOptions {
  /** Container types to release (default: groups, frames and sections). */
  types?: readonly ('GROUP' | 'FRAME' | 'SECTION')[];
  label?: string;
  /** Also remove containers without children (used when removing sections). */
  allowEmpty?: boolean;
}

/**
 * Ungroup (⇧⌘G): removes selected groups, frames and sections, moving their children into
 * the container's parent at the container's z-position, preserving canvas positions.
 * Also backs "remove section, keep contents" (⌘⌫) with `types: ['SECTION']`.
 */
export function ungroupSelection(editor: Editor, options: UngroupOptions = {}): Id[] {
  const store = editor.doc;
  const types: readonly string[] = options.types ?? ['GROUP', 'FRAME', 'SECTION'];
  const containers = selectedSceneNodes(editor).filter((id) => {
    const type = store.get(id)?.type;
    return type !== undefined && types.includes(type) && (options.allowEmpty || store.children(id).length > 0);
  });
  if (containers.length === 0) return [];
  const released: Id[] = [];
  editor.history.run(options.label ?? 'Ungroup', (tx) => {
    for (const containerId of containers) {
      const container = store.getOrThrow(containerId) as SceneNode;
      const parent = container.parent.id;
      const children = [...store.children(containerId)];
      const keys = keysBetween(container.parent.key, nextKeyAbove(store, containerId), children.length);
      const containerTransform = matrixOf(container.transform);
      children.forEach((childId, i) => {
        const child = store.getOrThrow(childId) as SceneNode;
        tx.set(childId, 'parent', { id: parent, key: keys[i]! });
        tx.set(childId, 'transform', toTransform(multiply(containerTransform, matrixOf(child.transform))));
        released.push(childId);
      });
      if (tx.store.has(containerId)) tx.delete(containerId);
    }
  });
  editor.state.select(released);
  return released;
}

function cloneSubtree(tx: Transaction, editor: Editor, sourceId: Id, parent: Id, key: string): Id {
  const source = tx.store.getOrThrow(sourceId) as Node;
  if (!isSceneNode(source)) throw new Error('Only layers can be duplicated');
  const id = editor.ids.next();
  tx.create({ ...source, id, parent: { id: parent, key } });
  for (const childId of tx.store.children(sourceId)) {
    const child = tx.store.getOrThrow(childId);
    if (isSceneNode(child)) cloneSubtree(tx, editor, childId, id, child.parent.key);
  }
  return id;
}

/**
 * Duplicate (⌘D): copies each selected layer directly above itself. When the selection is
 * the previous set of copies, each new copy is offset from its source by the same distance
 * the previous copies sit from theirs, so repeated ⌘D keeps stepping in that direction.
 */
export function duplicateSelection(editor: Editor): Id[] {
  const ids = selectedSceneNodes(editor);
  if (ids.length === 0) return [];
  const offset = repeatOffset(editor, ids);
  const memory = editor.history.run('Duplicate', (tx) => duplicateNodes(tx, editor, ids, offset));
  editor.state.select(memory.clones);
  editor.duplicateMemory = memory;
  return [...memory.clones];
}

/**
 * Clones layers (with their subtrees) directly above their sources inside a transaction,
 * optionally offset. Used by ⌘D and by ⌥-drag. Returns the memory for repeat-offset.
 */
export function duplicateNodes(tx: Transaction, editor: Editor, ids: readonly Id[], offset: { x: number; y: number } | null = null): DuplicateMemory {
  const store = tx.store;
  const clones: Id[] = [];
  const sourceTransforms = new Map<Id, Transform>();
  for (const sourceId of sortByPaintOrder(store, ids)) {
    const source = store.getOrThrow(sourceId) as SceneNode;
    const key = keyBetween(source.parent.key, nextKeyAbove(store, sourceId));
    const cloneId = cloneSubtree(tx, editor, sourceId, source.parent.id, key);
    const t = source.transform;
    if (offset) tx.set(cloneId, 'transform', [t[0], t[1], t[2], t[3], t[4] + offset.x, t[5] + offset.y] satisfies Transform);
    clones.push(cloneId);
    sourceTransforms.set(cloneId, t);
  }
  return { clones, sourceTransforms };
}

/** Offset shared by every previous copy relative to its source, or null. */
function repeatOffset(editor: Editor, selection: readonly Id[]): { x: number; y: number } | null {
  const memory = editor.duplicateMemory;
  if (!memory || memory.clones.length !== selection.length || !memory.clones.every((id) => selection.includes(id))) return null;
  let offset: { x: number; y: number } | null = null;
  for (const id of memory.clones) {
    const node = editor.doc.get(id);
    const source = memory.sourceTransforms.get(id);
    if (!node || !isSceneNode(node) || !source) return null;
    const delta = { x: node.transform[4] - source[4], y: node.transform[5] - source[5] };
    if (offset && (Math.abs(offset.x - delta.x) > 0.01 || Math.abs(offset.y - delta.y) > 0.01)) return null;
    offset = delta;
  }
  return offset && (offset.x !== 0 || offset.y !== 0) ? offset : null;
}

/** Flip horizontal (⇧H) / vertical (⇧V) around the center of the selection bounds. */
export function flipSelection(editor: Editor, axis: 'horizontal' | 'vertical'): void {
  // Sections are never flipped.
  const ids = selectedSceneNodes(editor).filter((id) => {
    const node = editor.doc.get(id) as SceneNode;
    return !node.locked && node.type !== 'SECTION';
  });
  const bounds = editor.selectionBounds(ids);
  if (!bounds || ids.length === 0) return;
  const cx = bounds.x + bounds.width / 2;
  const cy = bounds.y + bounds.height / 2;
  const mirror = multiply(translation(cx, cy), multiply(axis === 'horizontal' ? scaling(-1, 1) : scaling(1, -1), translation(-cx, -cy)));
  editor.history.run(axis === 'horizontal' ? 'Flip horizontal' : 'Flip vertical', (tx) => {
    for (const id of ids) {
      const node = tx.store.getOrThrow(id) as SceneNode;
      const parentInv = invert(worldOf(editor, node.parent.id));
      if (!parentInv) continue;
      tx.set(id, 'transform', toTransform(roundTransform(multiply(parentInv, multiply(mirror, worldOf(editor, id))))));
    }
  });
}

/** Enablement for commands that act on selected layers. */
export const hasLayerSelection = (editor: Editor): boolean => selectedSceneNodes(editor).length > 0;
