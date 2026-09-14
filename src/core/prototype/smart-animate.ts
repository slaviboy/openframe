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
import type { Node, Paint, SceneNode } from '../schema/document';

/**
 * Smart animate: layers that match between two frames (the same name at the same place in the hierarchy) animate the
 * differences in position, rotation, scale, size, opacity, corner radius and fill; layers only in the destination
 * dissolve in, and layers only in the frame being left dissolve out.
 */

type Transform = readonly [number, number, number, number, number, number];

const scene = (store: DocumentStore, id: Id): SceneNode | undefined => {
  const node = store.get(id);
  return node && 'transform' in node ? node : undefined;
};

/** Each layer in a frame by its path of names (a repeated name among siblings gets its occurrence number). */
function layerPaths(store: DocumentStore, frameId: Id): Map<string, Id> {
  const out = new Map<string, Id>();
  const visit = (parentId: Id, prefix: string) => {
    const seen = new Map<string, number>();
    for (const child of store.children(parentId)) {
      const node = scene(store, child);
      if (!node) continue;
      const occurrence = seen.get(node.name) ?? 0;
      seen.set(node.name, occurrence + 1);
      const path = `${prefix}/${node.name}#${occurrence}`;
      out.set(path, child);
      visit(child, path);
    }
  };
  visit(frameId, '');
  return out;
}

/** Matching layers between the frame left and the destination: destination layer → layer left (the frames match each other). */
export function matchLayers(store: DocumentStore, fromFrame: Id, toFrame: Id): Map<Id, Id> {
  const from = layerPaths(store, fromFrame);
  const matches = new Map<Id, Id>([[toFrame, fromFrame]]);
  for (const [path, id] of layerPaths(store, toFrame)) {
    const source = from.get(path);
    if (source) matches.set(id, source);
  }
  return matches;
}

const hasShadow = (node: SceneNode | undefined) => node?.effects?.some((effect) => effect.type === 'DROP_SHADOW' || effect.type === 'INNER_SHADOW') ?? false;

/**
 * Whether smart animate can animate between the frames: matching layers with drop or inner shadows, or that change
 * from one kind of shape to another (or change a vector's path), can't, and the transition dissolves instead.
 */
export function canSmartAnimate(store: DocumentStore, fromFrame: Id, toFrame: Id): boolean {
  for (const [to, from] of matchLayers(store, fromFrame, toFrame)) {
    const a = scene(store, from);
    const b = scene(store, to);
    if (!a || !b) return false;
    if (hasShadow(a) || hasShadow(b)) return false;
    if (a.type !== b.type) return false;
    if (a.type === 'VECTOR' && b.type === 'VECTOR' && JSON.stringify(a.vectorNetwork) !== JSON.stringify(b.vectorNetwork)) return false;
  }
  return true;
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** A transform blended between two: translation, rotation (the shorter way round) and scale separately. */
export function blendTransform(a: Transform, b: Transform, t: number): Transform {
  const decompose = (m: Transform) => {
    const sx = Math.hypot(m[0], m[1]);
    const rotation = Math.atan2(m[1], m[0]);
    const sy = sx === 0 ? Math.hypot(m[2], m[3]) : (m[0] * m[3] - m[1] * m[2]) / sx;
    return { sx, sy, rotation, x: m[4], y: m[5] };
  };
  const p = decompose(a);
  const q = decompose(b);
  let turn = q.rotation - p.rotation;
  if (turn > Math.PI) turn -= Math.PI * 2;
  if (turn < -Math.PI) turn += Math.PI * 2;
  const rotation = p.rotation + turn * t;
  const sx = lerp(p.sx, q.sx, t);
  const sy = lerp(p.sy, q.sy, t);
  const cos = Math.cos(rotation);
  const sin = Math.sin(rotation);
  return [cos * sx, sin * sx, -sin * sy, cos * sy, lerp(p.x, q.x, t), lerp(p.y, q.y, t)];
}

/** Fills blended between two lists: matching solid paints blend their colors and opacity; otherwise the destination's. */
function blendFills(a: readonly Paint[] | undefined, b: readonly Paint[] | undefined, t: number): readonly Paint[] | undefined {
  if (!a || !b || a.length !== b.length) return b;
  return b.map((paint, i) => {
    const start = a[i]!;
    if (paint.type !== 'SOLID' || start.type !== 'SOLID') return paint;
    return {
      ...paint,
      opacity: lerp(start.opacity, paint.opacity, t),
      color: { r: lerp(start.color.r, paint.color.r, t), g: lerp(start.color.g, paint.color.g, t), b: lerp(start.color.b, paint.color.b, t), a: lerp(start.color.a, paint.color.a, t) },
    };
  });
}

function blendLayer(from: SceneNode, to: SceneNode, t: number): SceneNode {
  const blended: Record<string, unknown> = {
    ...to,
    transform: blendTransform(from.transform as Transform, to.transform as Transform, t),
    size: { width: lerp(from.size.width, to.size.width, t), height: lerp(from.size.height, to.size.height, t) },
    opacity: lerp(from.opacity, to.opacity, t),
  };
  if ('fills' in to && 'fills' in from) blended.fills = blendFills(from.fills as readonly Paint[], to.fills as readonly Paint[], t);
  if ('cornerRadius' in to && 'cornerRadius' in from && typeof to.cornerRadius === 'number' && typeof from.cornerRadius === 'number') blended.cornerRadius = lerp(from.cornerRadius, to.cornerRadius, t);
  return blended as unknown as SceneNode;
}

/**
 * The destination frame `progress` (eased, 0 → 1) of the way through a smart animate transition, as a document holding
 * only that frame (on its page): matching layers blended from the layers left, new layers faded in, and the layers left
 * without a match faded out where they were (under their parent's match, or the frame).
 */
export function smartAnimateStore(store: DocumentStore, fromFrame: Id, toFrame: Id, progress: number): DocumentStore {
  const t = progress;
  const fade = Math.min(1, Math.max(0, t));
  const matches = matchLayers(store, fromFrame, toFrame);
  const matchedSources = new Set(matches.values());
  const sourceToDestination = new Map([...matches].map(([to, from]) => [from, to]));
  // The frame's page, and the sections it is in.
  const nodes: Node[] = [];
  for (let id = store.parentOf(toFrame); id !== null && id !== ROOT_ID; id = store.parentOf(id)) nodes.unshift(store.getOrThrow(id));
  nodes.unshift(store.getOrThrow(ROOT_ID));

  const addDestination = (id: Id, parentMatched: boolean) => {
    const node = scene(store, id);
    if (!node) return;
    const source = matches.get(id);
    const sourceNode = source ? scene(store, source) : undefined;
    let out: SceneNode = sourceNode ? blendLayer(sourceNode, node, t) : node;
    // A new layer (its parent matched) dissolves in; its children come with it.
    if (!sourceNode && parentMatched) out = { ...out, opacity: out.opacity * fade };
    nodes.push(out);
    for (const child of store.children(id)) addDestination(child, sourceNode !== undefined);
  };
  addDestination(toFrame, true);

  // Layers left without a match dissolve out, under their parent's match.
  const addLeaving = (id: Id, parentId: Id, key: string, top: boolean) => {
    const node = scene(store, id);
    if (!node) return;
    nodes.push({ ...node, parent: { id: parentId, key }, opacity: top ? node.opacity * (1 - fade) : node.opacity } as SceneNode);
    for (const child of store.children(id)) addLeaving(child, id, (scene(store, child)?.parent.key ?? key), false);
  };
  const visitSource = (id: Id) => {
    for (const child of store.children(id)) {
      const node = scene(store, child);
      if (!node) continue;
      if (matchedSources.has(child)) {
        visitSource(child);
        continue;
      }
      const parentMatch = sourceToDestination.get(id);
      if (parentMatch) addLeaving(child, parentMatch, node.parent.key, true);
    }
  };
  visitSource(fromFrame);
  return new DocumentStore(store.meta, nodes);
}

/** The document root and the page and sections a frame is in, top down. */
function ancestorNodes(store: DocumentStore, frameId: Id): Node[] {
  const nodes: Node[] = [];
  for (let id = store.parentOf(frameId); id !== null && id !== ROOT_ID; id = store.parentOf(id)) nodes.unshift(store.getOrThrow(id));
  nodes.unshift(store.getOrThrow(ROOT_ID));
  return nodes;
}

/**
 * Animate matching layers on a moving transition: only the destination's layers that match layers of the frame left,
 * blended `progress` of the way from them (their children only in the destination dissolving in), in a frame without
 * its fill, strokes or effects. Drawn still over the moving frames, which leave those layers out.
 */
export function matchedLayersStore(store: DocumentStore, fromFrame: Id, toFrame: Id, progress: number): DocumentStore {
  const matches = matchLayers(store, fromFrame, toFrame);
  const fade = Math.min(1, Math.max(0, progress));
  const frame = scene(store, toFrame)!;
  const nodes = ancestorNodes(store, toFrame);
  nodes.push({ ...frame, fills: [], strokes: [], effects: [] } as unknown as SceneNode);
  const addAsIs = (id: Id) => {
    const node = scene(store, id);
    if (!node) return;
    nodes.push(node);
    store.children(id).forEach(addAsIs);
  };
  // A layer matches only when its parent does (its path includes the parent's), so unmatched subtrees are left out whole.
  const add = (id: Id, parentMatched: boolean, parentFixed: boolean) => {
    const node = scene(store, id);
    if (!node) return;
    const source = matches.get(id);
    const sourceNode = source ? scene(store, source) : undefined;
    if (!sourceNode && !parentMatched) {
      // A fixed layer only in the destination dissolves in where it is, instead of moving in with its frame.
      if (isFixed(node)) {
        nodes.push({ ...node, opacity: node.opacity * fade });
        store.children(id).forEach(addAsIs);
      }
      return;
    }
    // Matching fixed layers (and the layers in them) get no transition: they show as they are in the destination.
    const fixed = parentFixed || isFixed(node) || isFixed(sourceNode);
    nodes.push(fixed ? node : sourceNode ? blendLayer(sourceNode, node, progress) : { ...node, opacity: node.opacity * fade });
    for (const child of store.children(id)) add(child, true, fixed);
  };
  for (const child of store.children(toFrame)) add(child, false, false);
  // A fixed layer only in the frame left dissolves out where it was.
  const matchedSources = new Set(matches.values());
  for (const child of store.children(fromFrame)) {
    const node = scene(store, child);
    if (!node || !isFixed(node) || matchedSources.has(child)) continue;
    nodes.push({ ...node, parent: { id: toFrame, key: node.parent.key }, opacity: node.opacity * (1 - fade) } as SceneNode);
    store.children(child).forEach(addAsIs);
  }
  return new DocumentStore(store.meta, nodes);
}

/** Layers set to Fixed: with Animate matching layers they don't move with their frame. */
function isFixed(node: SceneNode | undefined): boolean {
  return node?.scrollBehavior === 'FIXED';
}

/**
 * A frame without its layers that match layers of another frame (those animate on their own) and without the fixed
 * layers directly in it (those dissolve in place), as a document holding only that frame.
 */
export function withoutMatchingLayersStore(store: DocumentStore, frameId: Id, otherFrameId: Id): DocumentStore {
  const matched = new Set(matchLayers(store, otherFrameId, frameId).keys());
  matched.delete(frameId);
  const nodes = ancestorNodes(store, frameId);
  const visit = (id: Id) => {
    const node = scene(store, id);
    if (!node || matched.has(id) || (store.parentOf(id) === frameId && isFixed(node))) return;
    nodes.push(node);
    store.children(id).forEach(visit);
  };
  visit(frameId);
  return new DocumentStore(store.meta, nodes);
}
