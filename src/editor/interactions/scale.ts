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

import type { DocumentStore } from '@/core/document/store';
import type { Transaction } from '@/core/history/history';
import type { Id } from '@/core/ids/ids';
import { apply, invert, multiply, type Matrix } from '@/core/math/matrix';
import type { Vec2 } from '@/core/math/vec';
import { matrixOf, type SceneIndex } from '@/core/scene/scene-index';
import { isSceneNode, type CornerRadii, type Effect, type Size, type Transform } from '@/core/schema/document';

interface NodeSnapshot {
  readonly transform: Transform;
  readonly size: Size;
  readonly strokeWeight: number | undefined;
  readonly cornerRadius: number | undefined;
  readonly cornerRadii: CornerRadii | undefined;
  readonly effects: readonly Effect[] | undefined;
}

/** Effects scaled with their layer: shadow offsets, blur radii and spread. */
function scaleEffects(effects: readonly Effect[], f: number): Effect[] {
  return effects.map((effect) =>
    effect.type === 'DROP_SHADOW' || effect.type === 'INNER_SHADOW'
      ? { ...effect, offset: { x: round2(effect.offset.x * f), y: round2(effect.offset.y * f) }, radius: round2(effect.radius * f), spread: round2(effect.spread * f) }
      : { ...effect, radius: round2(effect.radius * f) },
  );
}

/** State captured before scaling, so repeated preview updates always scale from the start. */
export interface ScaleSnapshot {
  readonly roots: readonly { readonly id: Id; readonly world: Matrix; readonly parentWorld: Matrix }[];
  readonly nodes: ReadonlyMap<Id, NodeSnapshot>;
}

const round2 = (v: number) => Math.round(v * 100) / 100;

export function captureScale(store: DocumentStore, index: SceneIndex, rootIds: readonly Id[]): ScaleSnapshot {
  const roots: { id: Id; world: Matrix; parentWorld: Matrix }[] = [];
  const nodes = new Map<Id, NodeSnapshot>();
  for (const rootId of rootIds) {
    const root = store.get(rootId);
    if (!root || !isSceneNode(root)) continue;
    const world = index.worldTransform(rootId);
    const localInv = invert(matrixOf(root.transform));
    roots.push({ id: rootId, world, parentWorld: localInv ? multiply(world, localInv) : index.computeWorld(root.parent.id) });
    for (const id of store.descendants(rootId)) {
      const node = store.get(id);
      if (!node || !isSceneNode(node)) continue;
      nodes.set(id, {
        transform: node.transform,
        size: node.size,
        strokeWeight: 'strokeWeight' in node ? node.strokeWeight : undefined,
        cornerRadius: 'cornerRadius' in node ? node.cornerRadius : undefined,
        cornerRadii: 'cornerRadii' in node ? node.cornerRadii : undefined,
        effects: node.effects,
      });
    }
  }
  return { roots, nodes };
}

/**
 * Scales captured layers by `factor` around a world anchor point. Each root keeps its rotation
 * and flip while its position scales away from the anchor; everything inside it scales too:
 * positions, sizes, stroke weights, corner radii and effects (constraints are ignored).
 */
export function applyScale(tx: Transaction, snapshot: ScaleSnapshot, factor: number, anchorWorld: Vec2): void {
  const f = Math.max(factor, 1e-4);
  const rootIds = new Set(snapshot.roots.map((r) => r.id));
  for (const [id, s] of snapshot.nodes) {
    if (!tx.store.has(id)) continue;
    if (!rootIds.has(id)) {
      const t = s.transform;
      tx.set(id, 'transform', [t[0], t[1], t[2], t[3], round2(t[4] * f), round2(t[5] * f)] satisfies Transform);
    }
    tx.set(id, 'size', { width: round2(s.size.width * f), height: round2(s.size.height * f) });
    if (s.strokeWeight !== undefined) tx.set(id, 'strokeWeight', round2(s.strokeWeight * f));
    if (s.cornerRadius !== undefined) tx.set(id, 'cornerRadius', round2(s.cornerRadius * f));
    if (s.effects && s.effects.length > 0) tx.set(id, 'effects', scaleEffects(s.effects, f));
    if (s.cornerRadii) {
      const r = s.cornerRadii;
      tx.set(id, 'cornerRadii', { topLeft: round2(r.topLeft * f), topRight: round2(r.topRight * f), bottomRight: round2(r.bottomRight * f), bottomLeft: round2(r.bottomLeft * f) });
    }
  }
  for (const root of snapshot.roots) {
    const s = snapshot.nodes.get(root.id);
    const inv = invert(root.parentWorld);
    if (!s || !inv || !tx.store.has(root.id)) continue;
    const origin = apply(root.world, { x: 0, y: 0 });
    const moved = { x: anchorWorld.x + (origin.x - anchorWorld.x) * f, y: anchorWorld.y + (origin.y - anchorWorld.y) * f };
    const local = apply(inv, moved);
    const t = s.transform;
    tx.set(root.id, 'transform', [t[0], t[1], t[2], t[3], round2(local.x), round2(local.y)] satisfies Transform);
  }
}
