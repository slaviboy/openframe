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

import { DocumentStore } from '../document/store';
import { ROOT_ID, type Id } from '../ids/ids';
import type { Vec2 } from '../math/vec';
import type { SceneIndex } from '../scene/scene-index';
import type { Node, SceneNode } from '../schema/document';
import { matchLayers } from './smart-animate';

export type OverflowDirection = NonNullable<SceneNode['overflowDirection']>;
export type ScrollBehavior = NonNullable<SceneNode['scrollBehavior']>;

export const OVERFLOW_DIRECTIONS: readonly OverflowDirection[] = ['NONE', 'HORIZONTAL', 'VERTICAL', 'BOTH'];
export const OVERFLOW_LABELS: Readonly<Record<OverflowDirection, string>> = { NONE: 'No scrolling', HORIZONTAL: 'Horizontal', VERTICAL: 'Vertical', BOTH: 'Both directions' };
export const SCROLL_BEHAVIORS: readonly ScrollBehavior[] = ['SCROLLS', 'FIXED', 'STICKY_SCROLLS'];
export const SCROLL_BEHAVIOR_LABELS: Readonly<Record<ScrollBehavior, string>> = { SCROLLS: 'Scroll with parent', FIXED: 'Fixed', STICKY_SCROLLS: 'Sticky' };

const scene = (store: DocumentStore, id: Id): SceneNode | undefined => {
  const node = store.get(id);
  return node && 'transform' in node ? node : undefined;
};

export const overflowOf = (node: SceneNode | undefined): OverflowDirection => (node?.type === 'FRAME' ? (node.overflowDirection ?? 'NONE') : 'NONE');
const scrollsX = (direction: OverflowDirection) => direction === 'HORIZONTAL' || direction === 'BOTH';
const scrollsY = (direction: OverflowDirection) => direction === 'VERTICAL' || direction === 'BOTH';

/** The nearest frame around a layer that scrolls (not the layer itself); null when none does. */
export function scrollFrameOf(store: DocumentStore, id: Id): Id | null {
  for (let parent = store.parentOf(id); parent !== null; parent = store.parentOf(parent)) {
    const node = scene(store, parent);
    if (!node) return null;
    if (overflowOf(node) !== 'NONE') return parent;
  }
  return null;
}

/** How far a frame's content reaches, in the frame's own coordinates (at least the frame's size). */
export function contentSize(store: DocumentStore, index: SceneIndex, frameId: Id): { width: number; height: number } {
  const frame = scene(store, frameId);
  const origin = index.worldBounds(frameId);
  if (!frame || !origin) return { width: 0, height: 0 };
  let width = frame.size.width;
  let height = frame.size.height;
  const visit = (id: Id) => {
    for (const child of store.children(id)) {
      const node = scene(store, child);
      if (!node?.visible) continue;
      const bounds = index.worldBounds(child);
      if (bounds) {
        width = Math.max(width, bounds.x + bounds.width - origin.x);
        height = Math.max(height, bounds.y + bounds.height - origin.y);
      }
      visit(child);
    }
  };
  visit(frameId);
  return { width, height };
}

/** How far a frame scrolls each way (0 on an axis it doesn't scroll on, or with no content beyond it). */
export function scrollLimits(store: DocumentStore, index: SceneIndex, frameId: Id): Vec2 {
  const frame = scene(store, frameId);
  const direction = overflowOf(frame);
  if (!frame || direction === 'NONE') return { x: 0, y: 0 };
  const content = contentSize(store, index, frameId);
  return { x: scrollsX(direction) ? Math.max(0, content.width - frame.size.width) : 0, y: scrollsY(direction) ? Math.max(0, content.height - frame.size.height) : 0 };
}

/** Whether a frame is set to scroll but its content isn't bigger than it (so it can't). */
export function needsBiggerContent(store: DocumentStore, index: SceneIndex, frameId: Id): boolean {
  if (overflowOf(scene(store, frameId)) === 'NONE') return false;
  const limits = scrollLimits(store, index, frameId);
  return limits.x === 0 && limits.y === 0;
}

/**
 * The frame a scroll of `delta` over a hit chain (deepest layer first) moves: the deepest scrolling frame with room to
 * move that way; null when none has.
 */
export function wheelScrollTarget(store: DocumentStore, index: SceneIndex, chain: readonly Id[], delta: Vec2, offsets: ReadonlyMap<Id, Vec2>): Id | null {
  for (const id of chain) {
    if (overflowOf(scene(store, id)) === 'NONE') continue;
    const limits = scrollLimits(store, index, id);
    const offset = offsets.get(id) ?? { x: 0, y: 0 };
    const roomX = (delta.x > 0 && offset.x < limits.x) || (delta.x < 0 && offset.x > 0);
    const roomY = (delta.y > 0 && offset.y < limits.y) || (delta.y < 0 && offset.y > 0);
    if (roomX || roomY) return id;
  }
  return null;
}

/** A scroll offset kept within a frame's limits. */
export const clampScroll = (offset: Vec2, limits: Vec2): Vec2 => ({ x: Math.min(limits.x, Math.max(0, offset.x)), y: Math.min(limits.y, Math.max(0, offset.y)) });

/**
 * A top-level frame with its scrolling frames scrolled, as a document holding only that frame (on its page): the children
 * of a scrolled frame move by its offset, except fixed layers, which stay put above the others, and sticky layers,
 * which stop once their top reaches the frame's top.
 */
export function scrolledFrameStore(store: DocumentStore, frameId: Id, offsets: ReadonlyMap<Id, Vec2>): DocumentStore {
  // The frame's page, and the sections it is in.
  const nodes: Node[] = [];
  for (let id = store.parentOf(frameId); id !== null && id !== ROOT_ID; id = store.parentOf(id)) nodes.unshift(store.getOrThrow(id));
  nodes.unshift(store.getOrThrow(ROOT_ID));
  const visit = (id: Id) => {
    const node = scene(store, id);
    if (!node) return;
    const offset = offsets.get(node.parent.id);
    if (offset && (offset.x !== 0 || offset.y !== 0)) {
      const behavior = node.scrollBehavior ?? 'SCROLLS';
      if (behavior === 'FIXED') {
        // Fixed layers stay above the layers that scroll.
        nodes.push({ ...node, parent: { ...node.parent, key: `~${node.parent.key}` } });
      } else {
        const [a, b, c, d, e, f] = node.transform;
        const y = behavior === 'STICKY_SCROLLS' ? Math.max(f - offset.y, 0) : f - offset.y;
        nodes.push({ ...node, transform: [a, b, c, d, e - offset.x, y] } as SceneNode);
      }
    } else {
      nodes.push(node.scrollBehavior === 'STICKY_SCROLLS' && id !== frameId ? stuckInParent(store, frameId, node, offsets) : node);
    }
    store.children(id).forEach(visit);
  };
  visit(frameId);
  return new DocumentStore(store.meta, nodes);
}

/**
 * A sticky layer nested in another layer of a scrolled frame: it sticks once its top reaches the frame's top, but stays
 * within its direct parent's bounds, so it scrolls away with the parent.
 */
function stuckInParent(store: DocumentStore, frameId: Id, node: SceneNode, offsets: ReadonlyMap<Id, Vec2>): SceneNode {
  const parent = scene(store, node.parent.id);
  if (!parent) return node;
  // The parent's top in the scrolled frame, before scrolling.
  let top = 0;
  for (let current: SceneNode | undefined = parent; current && current.id !== frameId; current = scene(store, current.parent.id)) {
    top += current.transform[5];
    const offset = offsets.get(current.parent.id);
    if (!offset) continue;
    if (offset.y === 0) return node;
    const [a, b, c, d, e, f] = node.transform;
    const stuck = Math.max(f, offset.y - top);
    return { ...node, transform: [a, b, c, d, e, Math.min(stuck, Math.max(f, parent.size.height - node.size.height))] } as SceneNode;
  }
  return node;
}

/** The part of a top-level frame's name that matches for state sharing: the prefix before its last slash, or the whole name. */
const sharedName = (name: string): string => {
  const slash = name.lastIndexOf('/');
  return (slash < 0 ? name : name.slice(0, slash)).trim();
};

/** Whether top-level frames with these names share state: identical names, or a common prefix before a slash ("Checkout / Empty" and "Checkout / Complete"). */
export const namesShareState = (a: string, b: string): boolean => a.trim() === b.trim() || (a.includes('/') && b.includes('/') && sharedName(a) === sharedName(b));

/**
 * State sharing of scroll position: navigating between matching top-level frames (in the same page or section), the
 * destination's scrolling frames take the scroll offsets of their matching layers in the frame left, kept within their
 * own limits. The offsets to set, by the destination's layers; empty when the frames don't match.
 */
export function sharedScrollOffsets(store: DocumentStore, index: SceneIndex, fromFrame: Id, toFrame: Id, offsets: ReadonlyMap<Id, Vec2>): Map<Id, Vec2> {
  const out = new Map<Id, Vec2>();
  const from = scene(store, fromFrame);
  const to = scene(store, toFrame);
  if (!from || !to || fromFrame === toFrame || store.parentOf(fromFrame) !== store.parentOf(toFrame) || !namesShareState(from.name, to.name)) return out;
  for (const [destination, source] of matchLayers(store, fromFrame, toFrame)) {
    const offset = offsets.get(source);
    if (!offset || overflowOf(scene(store, destination)) === 'NONE') continue;
    out.set(destination, clampScroll(offset, scrollLimits(store, index, destination)));
  }
  return out;
}
