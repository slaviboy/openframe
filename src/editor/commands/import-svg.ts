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

import { keyOnTop, makeFrame, makeGroup, makeVector } from '@/core/document/factory';
import type { Transaction } from '@/core/history/history';
import { keysBetween } from '@/core/ids/fractional-index';
import type { Id } from '@/core/ids/ids';
import type { ImportedLayer, SvgImport } from '@/core/import/svg-import';
import type { Vec2 } from '@/core/math/vec';
import type { Editor } from '../editor';
import { containerAt, parentToLocal, roundPoint } from '../tools/draw-helpers';
import { PLACE_ALL_GAP } from './images';

/** An imported SVG file ready to become layers, named after its file. */
export interface PlaceableSvg {
  readonly name: string;
  readonly svg: SvgImport;
}

/** Creates the imported layers in order (the last on top) inside `parentId`, whose space their positions are in. */
function createLayers(editor: Editor, tx: Transaction, parentId: Id, layers: readonly ImportedLayer[]): void {
  const keys = keysBetween(null, null, layers.length);
  layers.forEach((layer, index) => {
    const id = editor.ids.next();
    const parent = { id: parentId, key: keys[index]! };
    if (layer.kind === 'group') {
      // The group finalizer fits the group to its children.
      tx.create({ ...makeGroup({ id, parent, name: layer.name, x: 0, y: 0, width: 0, height: 0 }), opacity: layer.opacity });
      createLayers(editor, tx, id, layer.children);
      return;
    }
    const vector = makeVector({ id, parent, name: layer.name, x: layer.x, y: layer.y, width: layer.width, height: layer.height }, layer.network);
    tx.create({ ...vector, fills: layer.fills, strokes: layer.strokes, strokeWeight: layer.strokes.length > 0 ? layer.strokeWeight : 1, opacity: layer.opacity });
  });
}

/**
 * Creates a frame for each SVG at its size, holding its shapes as editable vector layers (and its groups as
 * groups). The frames sit in a row 20px apart, centered on `world`, each inside the frame under its center.
 * One undo step; the new frames are selected.
 */
export function placeSvgs(editor: Editor, svgs: readonly PlaceableSvg[], world: Vec2): Id[] {
  if (svgs.length === 0) return [];
  editor.scene.ensure(editor.pageId);
  const total = svgs.reduce((sum, item) => sum + item.svg.width, 0) + PLACE_ALL_GAP * (svgs.length - 1);
  let x = world.x - total / 2;
  const ids: Id[] = [];
  editor.history.run(svgs.length === 1 ? 'Import SVG' : 'Import SVGs', (tx) => {
    for (const { name, svg } of svgs) {
      const parent = containerAt(editor, { x: x + svg.width / 2, y: world.y });
      const origin = roundPoint(parentToLocal(editor, parent)({ x, y: world.y - svg.height / 2 }));
      const id = editor.ids.next();
      const frame = makeFrame({ id, parent: { id: parent, key: keyOnTop(tx.store, parent) }, name, x: origin.x, y: origin.y, width: svg.width, height: svg.height });
      tx.create({ ...frame, fills: [] });
      createLayers(editor, tx, id, svg.children);
      ids.push(id);
      x += svg.width + PLACE_ALL_GAP;
    }
  });
  editor.state.select(ids);
  return ids;
}
