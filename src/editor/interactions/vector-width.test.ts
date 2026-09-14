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
import { createEmptyDocument, keyOnTop, makeVector } from '@/core/document/factory';
import { IdGenerator } from '@/core/ids/ids';
import type { VectorNode } from '@/core/schema/document';
import { straightSegment } from '@/core/vector/vector-network';
import { BUILTIN_COMMANDS } from '../commands/builtin';
import { Editor } from '../editor';
import { ToolManager } from '../tools/tool-manager';
import type { PointerInfo } from '../tools/types';
import { beginVectorEdit } from './vector-edit';

let editor: Editor;
let tools: ToolManager;
let id: string;

const sample = (x: number, y: number, shift = false): Omit<PointerInfo, 'world'> => ({
  screen: { x, y },
  button: 0,
  shift,
  alt: false,
  mod: false,
  ctrl: false,
  pointerType: 'mouse',
  pressure: 0.5,
  clickCount: 1,
});
const click = (x: number, y: number, shift = false) => {
  tools.pointerDown(sample(x, y, shift));
  tools.pointerUp(sample(x, y, shift));
};
const drag = (from: readonly [number, number], to: readonly [number, number]) => {
  tools.pointerDown(sample(...from));
  tools.pointerMove(sample(...to));
  tools.pointerUp(sample(...to));
};
const node = () => editor.doc.getOrThrow(id) as VectorNode;
const editState = () => editor.state.getSnapshot().vectorEdit;

beforeEach(() => {
  const ids = new IdGenerator('e');
  editor = new Editor({ doc: createEmptyDocument({ name: 'D', now: 'n', appVersion: 't', ids }), ids, validate: true });
  editor.commands.register(...BUILTIN_COMMANDS);
  editor.setViewport({ x: 0, y: 0, zoom: 1 });
  tools = new ToolManager(editor);
  // An open corner path on screen: right from (100, 100) to (200, 100), then down to (200, 200). Its stroke is 1 wide.
  id = editor.history.run('create', (tx) => {
    const vectorId = editor.ids.next();
    tx.create(
      makeVector({ id: vectorId, parent: { id: editor.pageId, key: keyOnTop(editor.doc, editor.pageId) }, name: 'Vector', x: 100, y: 100, width: 100, height: 100 }, {
        vertices: [
          { x: 0, y: 0 },
          { x: 100, y: 0 },
          { x: 100, y: 100 },
        ],
        segments: [straightSegment(0, 1), straightSegment(1, 2)],
        regions: [],
      }),
    );
    return vectorId;
  });
  beginVectorEdit(editor, id);
  editor.commands.run('vector.toolWidth');
});

describe('variable width tool in vector edit mode', () => {
  test('hovering shows where a width point would go; clicking adds one at the current width, snapped halfway between two points', () => {
    expect(editState()?.tool).toBe('width');
    tools.pointerMove(sample(150, 101));
    expect(tools.vectorEdit.widthHoverPoint).toEqual({ x: 150, y: 100 });
    click(148, 101);
    expect(node().strokeWidths).toEqual([{ position: 0.25, width: 1 }]);
    expect(editState()?.widthPoints).toEqual([0]);
    editor.history.undo();
    expect(node().strokeWidths).toBeUndefined();
  });

  test('dragging a knob sets the width from the distance to the path; Delete removes the selected width point', () => {
    click(150, 100);
    // The knobs sit 12px to either side of a thin stroke.
    drag([150, 112], [150, 120]);
    expect(node().strokeWidths).toEqual([{ position: 0.25, width: 40 }]);
    expect(editor.commands.run('vector.deleteWidthPoints')).not.toBe(false);
    expect(node().strokeWidths).toBeUndefined();
    expect(editState()?.widthPoints).toEqual([]);
  });

  test('dragging a width point moves it along the path; Shift-click adds another to the selection; clicking away clears it', () => {
    click(150, 100);
    click(200, 150);
    expect(node().strokeWidths!.map((w) => w.position)).toEqual([0.25, 0.75]);
    drag([150, 100], [170, 100]);
    expect(node().strokeWidths![0]!.position).toBeCloseTo(0.35);
    expect(editState()?.widthPoints).toEqual([0]);
    click(200, 150, true);
    expect(editState()?.widthPoints).toEqual([0, 1]);
    click(600, 600);
    expect(editState()?.widthPoints).toEqual([]);
  });
});
