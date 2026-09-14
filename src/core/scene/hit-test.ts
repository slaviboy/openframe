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

import { stackingOrder } from '../layout/auto-layout';
import { shapeContainsLocal } from './boolean-hit';
import type { DocumentStore } from '../document/store';
import type { Id } from '../ids/ids';
import { intersects, contains as rectContains, type Rect } from '../math/rect';
import type { Vec2 } from '../math/vec';
import { isSceneNode } from '../schema/document';
import { maskOf } from './masks';
import { nodeContainsLocal, type SceneIndex } from './scene-index';

export interface HitOptions {
  /** Hit tolerance in world units (e.g. 4 screen px / zoom). */
  tolerance: number;
}

/** Whether a node and all its ancestors are visible and unlocked (i.e. interactive on canvas). */
export function isInteractive(store: DocumentStore, id: Id): boolean {
  for (let cur: Id | null = id; cur !== null; cur = store.parentOf(cur)) {
    const node = store.get(cur);
    if (!node) return false;
    if (node.type === 'DOCUMENT' || node.type === 'PAGE') return true;
    if (!node.visible || node.locked) return false;
  }
  return true;
}

function clippedOut(store: DocumentStore, index: SceneIndex, id: Id, world: Vec2): boolean {
  // Masked content (the layer's own mask, or one of an ancestor's) is only visible inside the mask's shape.
  for (let cur: Id | null = id; cur !== null; cur = store.parentOf(cur)) {
    const mask = maskOf(store, cur);
    const maskNode = mask ? store.get(mask) : undefined;
    if (maskNode && isSceneNode(maskNode)) {
      const local = index.toLocal(maskNode.id, world);
      if (!local || !nodeContainsLocal(maskNode, local, 0)) return true;
    }
  }
  for (let cur = store.parentOf(id); cur !== null; cur = store.parentOf(cur)) {
    const node = store.get(cur);
    if (!node || !isSceneNode(node)) return false;
    if (node.type === 'FRAME' && node.clipsContent) {
      const local = index.toLocal(cur, world);
      if (!local || !nodeContainsLocal(node, local, 0)) return true;
    }
  }
  return false;
}

/** Topmost (last painted) interactive node under a world point, with its ancestor chain honored for clipping. */
export function hitTestDeepest(store: DocumentStore, index: SceneIndex, pageId: Id, world: Vec2, options: HitOptions): Id | null {
  index.ensure(pageId);
  const t = options.tolerance;
  const candidates = new Set(index.query({ x: world.x - t, y: world.y - t, width: t * 2, height: t * 2 }));
  if (candidates.size === 0) return null;
  // Slices are invisible, so they only take a click when no painted layer is under the point.
  let slice: Id | null = null;
  // Walk the tree in reverse paint order so the first match is the topmost.
  const visit = (id: Id): Id | null => {
    const node = store.get(id);
    if (!node) return null;
    if (isSceneNode(node) && (!node.visible || node.locked)) return null;
    // Boolean groups are hit only inside their combined shape, whichever child lies under the point.
    if (node.type === 'BOOLEAN_OPERATION') {
      const local = candidates.has(id) ? index.toLocal(id, world) : null;
      if (!local || !shapeContainsLocal(store, node, local, t / scaleOfWorld(index, id)) || clippedOut(store, index, id, world)) return null;
    }
    const children = stackingOrder(node, store.children(id));
    for (let i = children.length - 1; i >= 0; i--) {
      const hit = visit(children[i]!);
      if (hit) return hit;
    }
    if (isSceneNode(node) && candidates.has(id)) {
      const local = index.toLocal(id, world);
      if (local && nodeContainsLocal(node, local, t / scaleOfWorld(index, id)) && !clippedOut(store, index, id, world)) {
        if (node.type !== 'SLICE') return id;
        slice ??= id;
      }
    }
    return null;
  };
  return visit(pageId) ?? slice;
}

/**
 * Every interactive layer under a world point, in layers-panel order (topmost first, parents
 * before their children) — the "Select layer" context menu. Groups are listed when one of
 * their descendants is hit; clipped-out content is excluded.
 */
export function layersAt(store: DocumentStore, index: SceneIndex, pageId: Id, world: Vec2, tolerance: number): Id[] {
  index.ensure(pageId);
  const candidates = new Set(index.query({ x: world.x - tolerance, y: world.y - tolerance, width: tolerance * 2, height: tolerance * 2 }));
  const out: Id[] = [];
  const visit = (id: Id): boolean => {
    const node = store.get(id);
    if (!node || !isSceneNode(node) || !node.visible || node.locked) return false;
    const mark = out.length;
    out.push(id);
    let childHit = false;
    const children = stackingOrder(node, store.children(id));
    for (let i = children.length - 1; i >= 0; i--) if (visit(children[i]!)) childHit = true;
    let self = false;
    if (node.type !== 'GROUP' && candidates.has(id)) {
      const local = index.toLocal(id, world);
      self = local !== null && nodeContainsLocal(node, local, tolerance / scaleOfWorld(index, id)) && !clippedOut(store, index, id, world);
    }
    if (self || childHit) return true;
    out.length = mark;
    return false;
  };
  const top = store.children(pageId);
  for (let i = top.length - 1; i >= 0; i--) visit(top[i]!);
  return out;
}

/** Frames directly on the page or in a section act as artboards. */
function isArtboard(store: DocumentStore, pageId: Id, id: Id): boolean {
  if (store.get(id)?.type !== 'FRAME') return false;
  const parent = store.parentOf(id);
  return parent === pageId || (parent !== null && store.get(parent)?.type === 'SECTION');
}

function scaleOfWorld(index: SceneIndex, id: Id): number {
  const m = index.worldTransform(id);
  return Math.max(1e-9, Math.sqrt(Math.abs(m.a * m.d - m.b * m.c)));
}

/**
 * Chooses which node a click selects, following the reference editor:
 * - Deep select (⌘/Ctrl): the deepest hit layer.
 * - Otherwise the outermost layer under the page, except that top-level frames act as
 *   artboards: clicking content inside them selects that content's top-level child.
 * - If the current selection has siblings under the pointer, the click stays at that
 *   hierarchy level (so selecting inside a group keeps working until clicking away).
 */
export function selectionTarget(
  store: DocumentStore,
  pageId: Id,
  deepest: Id,
  currentSelection: readonly Id[],
  deep: boolean,
): Id {
  if (deep) return deepest;
  const chain: Id[] = [];
  for (let cur: Id | null = deepest; cur !== null && cur !== pageId; cur = store.parentOf(cur)) chain.unshift(cur);
  // Sibling context: stay at the depth of an existing selection inside the same ancestor.
  for (const selected of currentSelection) {
    const parent = store.parentOf(selected);
    if (parent === null || parent === pageId) continue;
    const idx = chain.indexOf(parent);
    if (idx >= 0 && idx + 1 < chain.length) return chain[idx + 1]!;
    if (chain.includes(selected)) return selected;
  }
  let target = chain[0] ?? deepest;
  let depth = 0;
  // Sections and artboards are transparent to clicks on their content.
  while (depth + 1 < chain.length) {
    if (store.get(target)?.type === 'SECTION' || isArtboard(store, pageId, target)) {
      depth++;
      target = chain[depth]!;
    } else break;
  }
  return target;
}

/**
 * True when an artboard or section has children: clicking its empty area starts a marquee
 * inside it instead of selecting it (sections are selected by their title).
 */
export function isArtboardWithChildren(store: DocumentStore, pageId: Id, id: Id): boolean {
  return (store.get(id)?.type === 'SECTION' || isArtboard(store, pageId, id)) && store.children(id).length > 0;
}

/**
 * Marquee selection: layers whose bounds intersect the marquee, at the level of the
 * page's top-level layers — or inside the artboard where the marquee started.
 * With `deep`, the deepest intersecting leaves are selected.
 */
export function marqueeSelect(
  store: DocumentStore,
  index: SceneIndex,
  pageId: Id,
  marquee: Rect,
  scopeId: Id,
  deep: boolean,
): Id[] {
  index.ensure(pageId);
  const hits = new Set(index.query(marquee));
  const result: Id[] = [];
  const visit = (id: Id) => {
    for (const child of store.children(id)) {
      const node = store.get(child);
      if (!node || !isSceneNode(node) || !node.visible || node.locked) continue;
      const bounds = index.worldBounds(child);
      if (!bounds || !hits.has(child) || !intersects(bounds, marquee)) continue;
      const kids = store.children(child);
      const containerFullyCovered = rectContains(marquee, bounds);
      if (deep && kids.length > 0) {
        const before = result.length;
        visit(child);
        if (result.length === before && node.type !== 'GROUP') result.push(child);
      } else if (isArtboardWithChildren(store, pageId, child) && !containerFullyCovered) {
        // Partially covered artboards and sections select their intersecting children instead.
        visit(child);
      } else {
        result.push(child);
      }
    }
  };
  visit(scopeId);
  return result;
}
