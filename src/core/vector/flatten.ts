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

import { makeVector } from '../document/factory';
import { sortByPaintOrder } from '../document/order';
import type { DocumentStore } from '../document/store';
import type { Transaction } from '../history/history';
import { keyBetween } from '../ids/fractional-index';
import type { Id } from '../ids/ids';
import { IDENTITY, invert, multiply, type Matrix } from '../math/matrix';
import { matrixOf } from '../scene/scene-index';
import { hasGeometry, isSceneNode, type SceneNode, type VectorNode } from '../schema/document';
import { shapeNetwork } from './shape-networks';
import { networkBounds, transformNetwork, transformNetworkBy, type VectorNetwork, type VectorRegion, type VectorSegment, type VectorVertex } from './vector-network';

const CONTAINERS: ReadonlySet<string> = new Set(['FRAME', 'GROUP', 'SECTION']);

/** A layer's transform to world space: the product of its own and its ancestors' transforms. */
function worldOf(store: DocumentStore, id: Id): Matrix {
  let m = IDENTITY;
  for (let cur: Id | null = id; cur !== null; cur = store.parentOf(cur)) {
    const node = store.get(cur);
    if (!node || !isSceneNode(node)) break;
    m = multiply(matrixOf(node.transform), m);
  }
  return m;
}

const hasText = (store: DocumentStore, id: Id): boolean => store.children(id).some((child) => store.get(child)?.type === 'TEXT' || hasText(store, child));

/**
 * The visible layers with an outline that a layer flattens into: the layer itself, or a container's
 * contents. Containers with text inside are not flattened (text needs its glyph outlines).
 */
function collectLeaves(store: DocumentStore, id: Id, out: SceneNode[]): void {
  const node = store.get(id);
  if (!node || !isSceneNode(node) || !node.visible) return;
  if (CONTAINERS.has(node.type) && store.children(id).length > 0) {
    if (hasText(store, id)) return;
    for (const child of store.children(id)) collectLeaves(store, child, out);
    return;
  }
  if (shapeNetwork(node)) out.push(node);
}

/** Whether a layer has anything to flatten. */
export function canFlattenLayer(store: DocumentStore, id: Id): boolean {
  const leaves: SceneNode[] = [];
  collectLeaves(store, id, leaves);
  return leaves.length > 0;
}

/** Joins networks into one, keeping each one's segments and regions. */
export function mergeNetworks(networks: readonly VectorNetwork[]): VectorNetwork {
  const vertices: VectorVertex[] = [];
  const segments: VectorSegment[] = [];
  const regions: VectorRegion[] = [];
  for (const network of networks) {
    const vertexOffset = vertices.length;
    const segmentOffset = segments.length;
    vertices.push(...network.vertices);
    segments.push(...network.segments.map((s) => ({ ...s, start: s.start + vertexOffset, end: s.end + vertexOffset })));
    regions.push(...network.regions.map((r) => ({ ...r, loops: r.loops.map((loop) => loop.map((i) => i + segmentOffset)) })));
  }
  return { vertices, segments, regions };
}

/** The appearance a flattened vector takes from a layer: fills, strokes and their style, effects, opacity and blend mode. */
function appearanceOf(node: SceneNode): Partial<VectorNode> {
  const out: Record<string, unknown> = { opacity: node.opacity, blendMode: node.blendMode };
  if (node.effects) out['effects'] = node.effects;
  if (hasGeometry(node)) {
    out['fills'] = node.type === 'LINE' ? [] : node.fills;
    out['strokes'] = node.strokes;
    out['strokeWeight'] = node.strokeWeight;
    out['strokeAlign'] = node.type === 'LINE' ? 'CENTER' : node.strokeAlign;
    for (const field of ['strokeDashes', 'strokeCap', 'strokeJoin', 'strokeMiterAngle'] as const) if (node[field] !== undefined) out[field] = node[field];
    if (node.type === 'LINE' && node.endCap !== 'NONE') out['endpointCap'] = node.endCap;
  }
  return out as Partial<VectorNode>;
}

/**
 * Flatten (⌥⇧F): merges layers into a single vector layer placed where the topmost one was. Containers
 * contribute their contents and are removed; layers without an outline (text, slices) stay as they
 * are. The vector takes the topmost flattened layer's appearance and the topmost selected layer's
 * name. Returns the new layer's id, or null when nothing could be flattened.
 */
export function flattenLayers(tx: Transaction, ids: readonly Id[], nextId: () => Id): Id | null {
  const store = tx.store;
  const ordered = sortByPaintOrder(store, ids);
  const leaves: SceneNode[] = [];
  const contributing: Id[] = [];
  for (const id of ordered) {
    const before = leaves.length;
    collectLeaves(store, id, leaves);
    if (leaves.length > before) contributing.push(id);
  }
  const top = contributing.at(-1);
  if (!top) return null;
  const parent = store.parentOf(top)!;
  const parentInverse = invert(worldOf(store, parent)) ?? IDENTITY;
  const merged = mergeNetworks(leaves.map((leaf) => transformNetworkBy(shapeNetwork(leaf)!, multiply(parentInverse, worldOf(store, leaf.id)))));
  const bounds = networkBounds(merged) ?? { x: 0, y: 0, width: 0, height: 0 };
  const topNode = store.getOrThrow(top) as SceneNode;
  const siblings = store.children(parent);
  const removed = new Set(contributing);
  const above = siblings.slice(siblings.indexOf(top) + 1).find((id) => !removed.has(id));
  const key = keyBetween(topNode.parent.key, above ? (store.getOrThrow(above) as SceneNode).parent.key : null);
  const id = nextId();
  const vector = makeVector(
    { id, parent: { id: parent, key }, name: topNode.name, x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height },
    transformNetwork(merged, { x: bounds.x, y: bounds.y }, 1, 1),
  );
  tx.create({ ...vector, ...appearanceOf(leaves.at(-1)!) } as VectorNode);
  for (const layer of contributing) tx.delete(layer);
  return id;
}
