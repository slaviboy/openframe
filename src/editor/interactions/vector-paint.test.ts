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

import { beforeEach, describe, expect, test } from 'vitest';
import { createEmptyDocument, DEFAULT_SHAPE_FILL, keyOnTop, makeVector, solid } from '@/core/document/factory';
import { IdGenerator } from '@/core/ids/ids';
import type { Paint, VectorNode } from '@/core/schema/document';
import { convertPaint } from '@/core/color/paints';
import { straightSegment } from '@/core/vector/vector-network';
import { BUILTIN_COMMANDS } from '../commands/builtin';
import { Editor } from '../editor';
import { ToolManager } from '../tools/tool-manager';
import type { PointerInfo } from '../tools/types';
import { beginVectorEdit, vectorEditPaint } from './vector-edit';

let editor: Editor;
let tools: ToolManager;
let id: string;

const sample = (x: number, y: number): Omit<PointerInfo, 'world'> => ({
  screen: { x, y },
  button: 0,
  shift: false,
  alt: false,
  mod: false,
  ctrl: false,
  pointerType: 'mouse',
  pressure: 0.5,
  clickCount: 1,
});
const click = (x: number, y: number) => {
  tools.pointerDown(sample(x, y));
  tools.pointerUp(sample(x, y));
};
const network = () => (editor.doc.getOrThrow(id) as VectorNode).vectorNetwork;
const editState = () => editor.state.getSnapshot().vectorEdit;

beforeEach(() => {
  const ids = new IdGenerator('e');
  editor = new Editor({ doc: createEmptyDocument({ name: 'D', now: 'n', appVersion: 't', ids }), ids, validate: true });
  editor.commands.register(...BUILTIN_COMMANDS);
  editor.setViewport({ x: 0, y: 0, zoom: 1 });
  tools = new ToolManager(editor);
  // A closed square with corners at (100, 100) and (200, 200) on screen, and no fill of its own.
  id = editor.history.run('create', (tx) => {
    const vectorId = editor.ids.next();
    tx.create(
      makeVector(
        { id: vectorId, parent: { id: editor.pageId, key: keyOnTop(editor.doc, editor.pageId) }, name: 'Vector', x: 100, y: 100, width: 100, height: 100 },
        {
          vertices: [
            { x: 0, y: 0 },
            { x: 100, y: 0 },
            { x: 100, y: 100 },
            { x: 0, y: 100 },
          ],
          segments: [straightSegment(0, 1), straightSegment(1, 2), straightSegment(2, 3), straightSegment(3, 0)],
          regions: [{ loops: [[0, 1, 2, 3]], windingRule: 'NONZERO' }],
        },
      ),
    );
    return vectorId;
  });
  beginVectorEdit(editor, id);
  editor.commands.run('vector.toolPaint');
});

describe('paint tool in vector edit mode', () => {
  test('⇧B picks Paint: a click fills the region with the paint, a second click removes it; one undo step each', () => {
    expect(editState()?.tool).toBe('paint');
    const red = solid({ r: 1, g: 0, b: 0, a: 1 });
    editor.state.setVectorEdit({ ...editState()!, paint: red });
    click(150, 150);
    expect(network().regions[0]!.fills).toEqual([red]);
    click(150, 150);
    expect(network().regions[0]!.fills).toEqual([]);
    editor.history.undo();
    expect(network().regions[0]!.fills).toEqual([red]);
    editor.history.undo();
    expect(network().regions[0]!.fills).toBeUndefined();
  });

  test('clicking outside every region changes nothing; hovering a region reports what a click would do', () => {
    click(600, 600);
    expect(network().regions[0]!.fills).toBeUndefined();
    tools.pointerMove(sample(150, 150));
    expect(tools.vectorEdit.paintHover).toEqual({ region: 0, remove: false });
    tools.pointerMove(sample(600, 600));
    expect(tools.vectorEdit.paintHover).toBeNull();
  });

  test("the paint defaults to the layer's first solid fill, or the default shape fill", () => {
    expect(vectorEditPaint(editor)).toEqual(solid(DEFAULT_SHAPE_FILL));
  });
});

describe('what the Paint tool paints with, and the cursor it carries', () => {
  test('the paint falls back to the layer’s first visible fill, gradient or not', () => {
    const gradient: Paint = {
      type: 'GRADIENT_LINEAR',
      gradientStops: [
        { position: 0, color: { r: 1, g: 0, b: 0, a: 1 } },
        { position: 1, color: { r: 0, g: 0, b: 1, a: 1 } },
      ],
      gradientTransform: [1, 0, 0, 1, 0, 0],
      opacity: 1,
      visible: true,
      blendMode: 'NORMAL',
    };
    editor.history.run('gradient fill', (tx) => tx.set(id, 'fills', [gradient]));
    expect(vectorEditPaint(editor).type).toBe('GRADIENT_LINEAR');
  });

  test('a gradient picked for the tool is what a click paints the region with', () => {
    const gradient = convertPaint(vectorEditPaint(editor), 'GRADIENT_RADIAL');
    editor.state.setVectorEdit({ ...editState()!, paint: gradient });
    tools.pointerDown(sample(150, 150));
    tools.pointerUp(sample(150, 150));
    const painted = (editor.doc.getOrThrow(id) as VectorNode).vectorNetwork.regions[0]!.fills;
    expect(painted?.[0]?.type).toBe('GRADIENT_RADIAL');
  });

  test('the cursor is a droplet, hollow over a region the click would clear', () => {
    tools.pointerMove(sample(750, 750));
    expect(tools.vectorEdit.cursor()).toBe('droplet');
    // Over a region already showing the paint, the click would take the fill away instead.
    tools.pointerDown(sample(150, 150));
    tools.pointerUp(sample(150, 150));
    tools.pointerMove(sample(160, 160));
    expect(tools.vectorEdit.cursor()).toBe('droplet-empty');
  });
});
