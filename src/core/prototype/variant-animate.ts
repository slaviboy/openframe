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
import type { Id } from '../ids/ids';
import { isSceneNode, type Node, type Paint, type SceneNode } from '../schema/document';
import { blendFills, blendLayer, layerPaths } from './smart-animate';

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

/** A layer dissolving into the one that replaces it: its colors cross-fade, but it doesn't move or resize. */
function dissolveLayer(from: SceneNode, to: SceneNode, t: number): SceneNode {
  const blended: Record<string, unknown> = { ...to, opacity: from.opacity + (to.opacity - from.opacity) * t };
  if ('fills' in to && 'fills' in from) blended.fills = blendFills(from.fills as readonly Paint[], to.fills as readonly Paint[], t);
  return blended as unknown as SceneNode;
}

/**
 * A Change to in flight: the prototype's document as it looks `progress` (eased, 0 → 1) of the way from the instance's
 * old variant (`from`) to its new one (`to`). Both are copies of the same document, so everything outside the instance
 * is the destination's; inside it, layers are matched by their path of names, since swapping a variant gives the
 * instance's layers new ids. A matched layer smart animates (moving and resizing) or dissolves (colors only); a layer
 * the new variant adds fades in, and one the old variant had fades out where it was, under its parent's match.
 */
export function blendVariantStore(from: DocumentStore, to: DocumentStore, instanceId: Id, progress: number, smart: boolean): DocumentStore {
  const t = clamp01(progress);
  const fromPaths = layerPaths(from, instanceId);
  const toPaths = layerPaths(to, instanceId);
  /** Destination layer → the layer it replaces. */
  const matches = new Map<Id, Id>();
  for (const [path, toId] of toPaths) {
    const fromId = fromPaths.get(path);
    if (fromId !== undefined) matches.set(toId, fromId);
  }
  const leftBehind = new Map<Id, Id>();
  for (const [toId, fromId] of matches) leftBehind.set(fromId, toId);
  const inside = new Set(toPaths.values());

  const nodes: Node[] = [];
  for (const node of to.nodes()) {
    if (!isSceneNode(node)) {
      nodes.push(node);
      continue;
    }
    const fromId = matches.get(node.id);
    const before = fromId === undefined ? undefined : from.get(fromId);
    if (before && isSceneNode(before)) nodes.push(smart ? blendLayer(before, node, t) : dissolveLayer(before, node, t));
    else if (inside.has(node.id)) nodes.push({ ...node, opacity: node.opacity * t } as SceneNode);
    else nodes.push(node);
  }

  // The layers only the old variant had, fading out. A matched parent is gone from the destination under its own id,
  // so they hang under the layer that replaced it; a parent that is itself fading out keeps them.
  const fading = new Set<Id>();
  for (const [path, fromId] of fromPaths) if (!toPaths.has(path)) fading.add(fromId);
  for (const fromId of fading) {
    const node = from.get(fromId);
    if (!node || !isSceneNode(node)) continue;
    const parentId = leftBehind.get(node.parent.id) ?? node.parent.id;
    if (!to.has(parentId) && !fading.has(parentId)) continue;
    // Only the topmost layer of a fading branch is faded: its children go with it.
    const alpha = fading.has(node.parent.id) ? node.opacity : node.opacity * (1 - t);
    nodes.push({ ...node, parent: { id: parentId, key: node.parent.key }, opacity: alpha } as SceneNode);
  }
  return new DocumentStore(to.meta, nodes);
}
