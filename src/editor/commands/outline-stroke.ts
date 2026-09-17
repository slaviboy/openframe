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
import { sortByPaintOrder } from '@/core/document/order';
import { keyBetween } from '@/core/ids/fractional-index';
import type { Id } from '@/core/ids/ids';
import { applyLinear } from '@/core/math/matrix';
import { matrixOf } from '@/core/scene/scene-index';
import { hasGeometry, type Paint, type SceneNode, type VectorNode } from '@/core/schema/document';
import { commandsToNetwork } from '@/core/vector/shape-networks';
import { networkBounds, transformNetwork } from '@/core/vector/vector-network';
import type { Editor } from '../editor';
import type { FontLoader } from '@/core/text/glyph-paths';
import { replaceTextWithOutlines, textOutlinesFor } from './outline-text';
import { nextKeyAbove, selectedSceneNodes } from './selection-helpers';

/** Layers whose strokes can be outlined. */
const OUTLINED: ReadonlySet<string> = new Set(['RECTANGLE', 'ELLIPSE', 'POLYGON', 'STAR', 'LINE', 'VECTOR']);

const anyVisible = (paints: readonly Paint[]): boolean => paints.some((p) => p.visible && p.opacity > 0);

const hasOutlinableStroke = (node: SceneNode): boolean => OUTLINED.has(node.type) && hasGeometry(node) && !node.locked && node.strokeWeight > 0 && anyVisible(node.strokes);

/** A text layer's stroke is outlined through its glyphs, which are read out first. */
const hasTextStroke = (node: SceneNode): boolean => node.type === 'TEXT' && !node.locked && node.characters !== '' && node.strokeWeight > 0 && anyVisible(node.strokes);

/** Outline stroke is available once the engine is loaded and a selected, unlocked layer draws a stroke. */
export const canOutlineStroke = (editor: Editor): boolean =>
  editor.geometry !== null &&
  selectedSceneNodes(editor).some((id) => {
    const node = editor.doc.getOrThrow(id) as SceneNode;
    return hasOutlinableStroke(node) || (editor.textLayout?.glyphPlacements !== undefined && hasTextStroke(node));
  });

/**
 * Outline stroke (⌘⌥O): each selected layer's stroke becomes a vector layer of the area it covers,
 * filled with the stroke's paints. A layer with a visible fill keeps it and loses its stroke, with the
 * outline directly above it; other layers are replaced. The outlines are selected; one undo step.
 */
export async function outlineStrokeSelection(editor: Editor, load: FontLoader): Promise<Id[]> {
  const geometry = editor.geometry;
  if (!geometry) return [];
  const ids = sortByPaintOrder(editor.doc, selectedSceneNodes(editor));
  // A text layer's stroke follows its glyphs, so the glyphs are read out first and that outline is stroked.
  const outlines = await textOutlinesFor(
    editor,
    ids.filter((id) => hasTextStroke(editor.doc.getOrThrow(id) as SceneNode)),
    load,
  );
  const selection: Id[] = [];
  editor.history.run('Outline stroke', (tx) => {
    const replaced = replaceTextWithOutlines(tx, editor, outlines);
    for (const original of ids) {
      const id = replaced.get(original) ?? original;
      const node = tx.store.getOrThrow(id) as SceneNode;
      const commands = hasOutlinableStroke(node) ? geometry.strokeOutline(node) : null;
      const network = commands ? commandsToNetwork(commands) : null;
      const bounds = network ? networkBounds(network) : null;
      if (!network || !bounds || !hasGeometry(node)) {
        selection.push(id);
        continue;
      }
      const keepFill = node.type !== 'LINE' && anyVisible(node.fills);
      // The outline is in the layer's local space: its box moves along the layer's own rotation.
      const t = node.transform;
      const offset = applyLinear(matrixOf(t), { x: bounds.x, y: bounds.y });
      const vectorId = editor.ids.next();
      const key = keyBetween(node.parent.key, nextKeyAbove(tx.store, id));
      const vector = makeVector(
        { id: vectorId, parent: { id: node.parent.id, key }, name: node.name, x: 0, y: 0, width: bounds.width, height: bounds.height },
        transformNetwork(network, { x: bounds.x, y: bounds.y }, 1, 1),
      );
      tx.create({
        ...vector,
        transform: [t[0], t[1], t[2], t[3], t[4] + offset.x, t[5] + offset.y],
        fills: structuredClone(node.strokes),
        strokes: [],
        opacity: node.opacity,
        blendMode: node.blendMode,
        ...(!keepFill && node.effects ? { effects: node.effects } : {}),
      } as VectorNode);
      if (keepFill) tx.set(id, 'strokes', []);
      else tx.delete(id);
      selection.push(vectorId);
    }
  });
  editor.state.select(selection);
  return selection;
}
