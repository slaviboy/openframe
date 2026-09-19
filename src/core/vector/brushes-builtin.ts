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

import { ROOT_ID, type Id } from '../ids/ids';
import type { BrushNode, BrushSettings, Node } from '../schema/document';
import { REFERENCE_BRUSHES, type ReferenceBrush } from './brushes-reference';
import { straightSegment, type VectorNetwork } from './vector-network';

/**
 * The brushes every file has: the reference's own twenty-five, in its order and under its two headings.
 * Their names and kinds are the capture's; the shape each paints was traced from the capture's picture of
 * the stroke it makes, since nothing in the capture holds the reference's vector shapes (see
 * `scripts/extract-reference-brushes.mjs` and docs/UI_REFERENCE.md).
 *
 * They are not layers in the file — the same in every file, nothing added to what is saved — so `brushById`
 * looks here before it looks in the document. Their ids sit in the `0` replica, which is the root's own and
 * which no editing session ever takes, so one can never be taken for a brush made in a file.
 */

/** A brush's shape, built from its flat loops the first time it is asked for and kept after that. */
const networks = new Map<string, VectorNetwork>();

function networkOf(brush: ReferenceBrush): VectorNetwork {
  const held = networks.get(brush.id);
  if (held) return held;
  const vertices: { x: number; y: number }[] = [];
  const segments: ReturnType<typeof straightSegment>[] = [];
  for (const loop of brush.polygons) {
    const first = vertices.length;
    for (let i = 0; i < loop.length; i += 2) vertices.push({ x: loop[i]!, y: loop[i + 1]! });
    for (let i = first; i < vertices.length; i++) segments.push(straightSegment(i, i + 1 < vertices.length ? i + 1 : first));
  }
  const network: VectorNetwork = { vertices, segments, regions: [] };
  networks.set(brush.id, network);
  return network;
}

/** One of the reference's brushes as a brush of ours, built once. */
const nodes = new Map<string, BrushNode>();

function brushOf(brush: ReferenceBrush): BrushNode {
  const held = nodes.get(brush.id);
  if (held) return held;
  const node: BrushNode = {
    id: brush.id,
    type: 'BRUSH',
    name: brush.name,
    parent: { id: ROOT_ID, key: `brush-builtin-${brush.id}` },
    visible: true,
    locked: false,
    brushKind: brush.kind,
    vectorNetwork: networkOf(brush) as BrushNode['vectorNetwork'],
    size: brush.size,
  };
  nodes.set(brush.id, node);
  return node;
}

export const BUILTIN_BRUSHES: readonly BrushNode[] = REFERENCE_BRUSHES.map(brushOf);

/** Whether a brush is one of the ones every file has, rather than one made in this file. */
export const isBuiltinBrush = (id: Id): boolean => REFERENCE_BRUSHES.some((brush) => brush.id === id);

/** The brush an id names: one every file has, or one this file holds. */
export function brushById(store: { get(id: Id): Node | undefined }, id: Id): BrushNode | undefined {
  const builtin = REFERENCE_BRUSHES.find((brush) => brush.id === id);
  if (builtin) return brushOf(builtin);
  const node = store.get(id);
  return node?.type === 'BRUSH' ? node : undefined;
}

/**
 * What a brush is laid down with when it is applied: a scatter brush of the reference's own carries the
 * spread measured from its picture, so picking one brings its own numbers to the Brush tab. A brush made in
 * a file, and every stretch brush, takes the defaults.
 */
export const settingsOfBrush = (id: Id): BrushSettings | undefined => REFERENCE_BRUSHES.find((brush) => brush.id === id)?.settings;
