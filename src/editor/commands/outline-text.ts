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
import type { PathCommand } from '@/core/geometry/corners';
import { keyBetween } from '@/core/ids/fractional-index';
import type { Id } from '@/core/ids/ids';
import { applyLinear } from '@/core/math/matrix';
import { matrixOf } from '@/core/scene/scene-index';
import type { SceneNode, TextNode, VectorNode } from '@/core/schema/document';
import { outlineGlyphs, type FontLoader } from '@/core/text/glyph-paths';
import { commandsToNetwork } from '@/core/vector/shape-networks';
import { networkBounds, transformNetwork } from '@/core/vector/vector-network';
import type { Editor } from '../editor';
import { nextKeyAbove, selectedSceneNodes } from './selection-helpers';

/** The unlocked text layers of the selection, which are the layers that can be turned into outlines. */
const textLayers = (editor: Editor): Id[] =>
  selectedSceneNodes(editor).filter((id) => {
    const node = editor.doc.get(id);
    return node?.type === 'TEXT' && !node.locked && node.characters !== '';
  });

/** Turning text into paths needs the engine, which is what lays the text out and holds the font files. */
export const canOutlineText = (editor: Editor): boolean => editor.textLayout?.glyphPlacements !== undefined && textLayers(editor).length > 0;

/** The outline of one text layer, in the layer's own space, or null when nothing of it could be drawn. */
export async function textOutline(editor: Editor, node: TextNode, load: FontLoader): Promise<PathCommand[] | null> {
  const layout = editor.textLayout;
  const placements = layout?.glyphPlacements?.(node) ?? [];
  if (placements.length === 0) return null;
  // Characters the layer's own font can't draw came from a fallback on the canvas, so they are read from one here.
  const fallbacks = (layout?.availableFonts?.() ?? []).map((font) => font.family).filter((family) => family !== node.fontName.family);
  const { commands } = await outlineGlyphs(placements, load, fallbacks);
  return commands.length > 0 ? commands : null;
}

/**
 * Convert text to vector paths: each selected text layer becomes a vector layer of its glyphs' outlines, keeping
 * the text's fills, in the text layer's place. The layers are selected afterwards; one undo step. Returns the ids
 * of the layers made, which is empty when nothing could be outlined.
 */
export async function outlineTextSelection(editor: Editor, load: FontLoader): Promise<Id[]> {
  const ids = sortByPaintOrder(editor.doc, textLayers(editor));
  if (ids.length === 0) return [];

  // The outlines are read before the document is touched, since reading a font file has to be waited for.
  const outlines: { readonly node: TextNode; readonly commands: PathCommand[] }[] = [];
  for (const id of ids) {
    const node = editor.doc.get(id) as TextNode | undefined;
    if (!node) continue;
    const commands = await textOutline(editor, node, load);
    if (commands) outlines.push({ node, commands });
  }
  if (outlines.length === 0) return [];

  const made: Id[] = [];
  editor.history.run('Convert text to vector paths', (tx) => {
    for (const { node, commands } of outlines) {
      if (!tx.store.has(node.id)) continue;
      const network = commandsToNetwork(commands);
      const bounds = networkBounds(network);
      if (!bounds || bounds.width <= 0 || bounds.height <= 0) continue;
      // The outline is in the text layer's own space, so its box moves along that layer's rotation.
      const shift = applyLinear(matrixOf(node.transform), { x: bounds.x, y: bounds.y });
      const vectorId = editor.ids.next();
      const key = keyBetween(node.parent.key, nextKeyAbove(tx.store, node.id));
      const vector = makeVector(
        { id: vectorId, parent: { id: node.parent.id, key }, name: node.name, x: 0, y: 0, width: bounds.width, height: bounds.height },
        transformNetwork(network, { x: bounds.x, y: bounds.y }, 1, 1),
      );
      tx.create({
        ...vector,
        transform: [node.transform[0], node.transform[1], node.transform[2], node.transform[3], node.transform[4] + shift.x, node.transform[5] + shift.y],
        fills: node.fills,
        opacity: node.opacity,
        blendMode: node.blendMode,
        visible: node.visible,
        ...(node.effects && node.effects.length > 0 ? { effects: node.effects } : {}),
      } satisfies VectorNode as SceneNode);
      tx.delete(node.id);
      made.push(vectorId);
    }
  });
  if (made.length > 0) editor.state.select(made);
  return made;
}
