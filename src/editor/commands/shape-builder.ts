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

import { makeVector } from '@/core/document/factory';
import type { PathCommand } from '@/core/geometry/corners';
import { keyBetween } from '@/core/ids/fractional-index';
import type { Id } from '@/core/ids/ids';
import type { SceneNode, VectorNode } from '@/core/schema/document';
import type { ShapeFace } from '@/core/vector/geometry-service';
import { regionShapes } from '@/core/vector/shape-builder';
import { commandsToNetwork } from '@/core/vector/shape-networks';
import { networkBounds, transformNetwork } from '@/core/vector/vector-network';
import type { Editor } from '../editor';
import { nextKeyAbove } from './selection-helpers';
import { refitVector } from '../tools/vector-draw';

/** The vector layer the Shape builder is working on: the one being edited in vector edit mode. */
export function shapeBuilderTarget(editor: Editor): VectorNode | null {
  const state = editor.state.getSnapshot().vectorEdit;
  const node = state ? editor.doc.get(state.nodeId) : undefined;
  return node?.type === 'VECTOR' && !node.locked ? node : null;
}

/**
 * The pieces the layer's own closed regions cut each other into, in the layer's space. Empty when the engine
 * isn't loaded or the layer encloses nothing.
 */
export function shapeBuilderFaces(editor: Editor): readonly ShapeFace[] {
  const node = shapeBuilderTarget(editor);
  const shapes = node ? regionShapes(node.vectorNetwork) : [];
  return node && editor.geometry && shapes.length > 0 ? editor.geometry.shapeFaces(shapes) : [];
}

/** The area left once some of the pieces are taken out of the layer: everything the others cover. */
function commandsOfFaces(faces: readonly ShapeFace[], wanted: readonly number[]): PathCommand[] {
  return wanted.flatMap((i) => faces[i]?.commands ?? []);
}

/** Writes an area onto the edited layer, refitting its box; the layer is left alone when nothing is left. */
function setArea(editor: Editor, node: VectorNode, commands: readonly PathCommand[], label: string, made?: (tx: import('@/core/history/history').Transaction) => void): boolean {
  if (commands.length === 0) return false;
  editor.history.run(label, (tx) => {
    refitVector(tx, node.id, commandsToNetwork(commands), node.transform);
    made?.(tx);
  });
  return true;
}

/**
 * Merge: the chosen pieces become one area on the layer, the rest of it going. Used for the pieces a drag swept
 * over, which is how several are joined into a single shape.
 */
export function mergeFaces(editor: Editor, faces: readonly ShapeFace[], chosen: readonly number[]): boolean {
  const node = shapeBuilderTarget(editor);
  if (!node || chosen.length === 0) return false;
  return setArea(editor, node, commandsOfFaces(faces, chosen), 'Merge regions');
}

/**
 * Subtract: a piece is taken out of the layer and the rest of it kept, which is what ⌥-clicking a piece does.
 * The layer is left alone when that would leave nothing at all.
 */
export function subtractFace(editor: Editor, faces: readonly ShapeFace[], face: number): boolean {
  const node = shapeBuilderTarget(editor);
  if (!node || faces[face] === undefined) return false;
  const kept = faces.map((_, i) => i).filter((i) => i !== face);
  return setArea(editor, node, commandsOfFaces(faces, kept), 'Subtract region');
}

/**
 * Extract: a piece is taken out of the layer onto a layer of its own, directly above it, which is then selected.
 * The piece keeps the layer's appearance. The layer is left alone when it holds only the one piece.
 */
export function extractFace(editor: Editor, faces: readonly ShapeFace[], face: number): boolean {
  const node = shapeBuilderTarget(editor);
  const piece = faces[face];
  if (!node || !piece || faces.length < 2) return false;
  const network = commandsToNetwork(piece.commands);
  const bounds = networkBounds(network);
  if (!bounds || bounds.width <= 0 || bounds.height <= 0) return false;
  const kept = faces.map((_, i) => i).filter((i) => i !== face);
  let made: Id | null = null;
  const ok = setArea(editor, node, commandsOfFaces(faces, kept), 'Extract region', (tx) => {
    const vectorId = editor.ids.next();
    const key = keyBetween(node.parent.key, nextKeyAbove(tx.store, node.id));
    const vector = makeVector(
      { id: vectorId, parent: { id: node.parent.id, key }, name: node.name, x: 0, y: 0, width: bounds.width, height: bounds.height },
      transformNetwork(network, { x: bounds.x, y: bounds.y }, 1, 1),
    );
    // The piece sits where it was cut from, which is the layer's own place plus where the piece falls in it.
    tx.create({
      ...vector,
      transform: [node.transform[0], node.transform[1], node.transform[2], node.transform[3], node.transform[4] + bounds.x, node.transform[5] + bounds.y],
      fills: node.fills,
      strokes: node.strokes,
      strokeWeight: node.strokeWeight,
      strokeAlign: node.strokeAlign,
      opacity: node.opacity,
      blendMode: node.blendMode,
    } satisfies VectorNode as SceneNode);
    made = vectorId;
  });
  if (ok && made) editor.state.select([made]);
  return ok;
}
