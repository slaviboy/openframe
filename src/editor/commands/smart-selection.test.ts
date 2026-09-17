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
import { createEmptyDocument, keyOnTop, makeRectangle } from '@/core/document/factory';
import { IdGenerator } from '@/core/ids/ids';
import type { SceneNode } from '@/core/schema/document';
import { Editor } from '../editor';
import { ToolManager } from '../tools/tool-manager';
import type { PointerInfo } from '../tools/types';
import { BUILTIN_COMMANDS } from './builtin';
import { setSpacingInTx, smartSelectionInfo } from './smart-selection';

let editor: Editor;
let ids: string[];

const sample = (x: number, y: number, over: Partial<PointerInfo> = {}): Omit<PointerInfo, 'world'> => ({
  screen: { x, y },
  button: 0,
  shift: false,
  alt: false,
  mod: false,
  ctrl: false,
  pointerType: 'mouse',
  pressure: 0.5,
  clickCount: 1,
  ...over,
});
const xs = () => ids.map((id) => (editor.doc.getOrThrow(id) as SceneNode).transform[4]);

beforeEach(() => {
  const gen = new IdGenerator('q');
  editor = new Editor({ doc: createEmptyDocument({ name: 'D', now: 'n', appVersion: 't', ids: gen }), ids: gen, validate: true });
  editor.commands.register(...BUILTIN_COMMANDS);
  editor.setViewport({ x: 0, y: 0, zoom: 1 });
  // A row with 20 px gaps: 0–50, 70–100, 120–160.
  ids = [
    [0, 0, 50, 50],
    [70, 10, 30, 30],
    [120, 0, 40, 60],
  ].map(([x, y, w, h]) =>
    editor.history.run('seed', (tx) => {
      const id = editor.ids.next();
      tx.create(makeRectangle({ id, parent: { id: editor.pageId, key: keyOnTop(editor.doc, editor.pageId) }, name: 'R', x: x!, y: y!, width: w!, height: h! }));
      return id;
    }),
  );
});

describe('smart selection', () => {
  test('an evenly spaced multi-selection exposes its gap; setting it respaces in one undo step', () => {
    editor.state.select([ids[0]!]);
    expect(smartSelectionInfo(editor)).toBeNull();
    editor.state.select(ids);
    expect(smartSelectionInfo(editor)?.selection).toMatchObject({ axis: 'x', gap: 20 });
    editor.history.run('Change spacing', (tx) => setSpacingInTx(tx, editor, 5));
    expect(xs()).toEqual([0, 55, 90]);
    editor.history.undo();
    expect(xs()).toEqual([0, 70, 120]);
  });

  test('dragging a spacing handle changes every gap by the drag distance', () => {
    const tools = new ToolManager(editor);
    editor.state.select(ids);
    // The first handle is the middle of the 50–70 gap, centered on the overlap (y 10–40).
    tools.pointerDown(sample(60, 25));
    tools.pointerMove(sample(65, 25));
    tools.pointerMove(sample(70, 25));
    tools.pointerUp(sample(70, 25));
    expect(xs()).toEqual([0, 80, 140]);
    expect(editor.selection).toEqual(ids);
    editor.history.undo();
    expect(xs()).toEqual([0, 70, 120]);
  });
});

describe('marking layers within a smart selection', () => {
  let tools: ToolManager;
  const marked = () => editor.state.getSnapshot().markedLayers;
  beforeEach(() => {
    tools = new ToolManager(editor);
    editor.state.select(ids);
  });

  /** Clicks the pink ring at the center of the layer at `index` in the seeded row. */
  const clickRing = (index: number, over: Partial<PointerInfo> = {}) => {
    const centers = [
      [25, 25],
      [85, 25],
      [140, 30],
    ];
    const [x, y] = centers[index]!;
    tools.pointerDown(sample(x!, y!, over));
    tools.pointerUp(sample(x!, y!, over));
  };

  test('a ring marks its layer, ⇧ marks another, and ⇧ on a marked one takes the mark off', () => {
    clickRing(1);
    expect(marked()).toEqual([ids[1]]);
    clickRing(2, { shift: true });
    expect(marked()).toEqual([ids[1], ids[2]]);
    clickRing(2, { shift: true });
    expect(marked()).toEqual([ids[1]]);
    clickRing(0);
    expect(marked()).toEqual([ids[0]]);
    // The layer selection is the whole row throughout.
    expect(editor.selection).toEqual(ids);
  });

  test('double-clicking a ring marks the whole row, and changing the selection clears the marks', () => {
    clickRing(0, { clickCount: 2 });
    expect(marked()).toEqual(ids);
    editor.state.select([ids[0]!]);
    expect(marked()).toEqual([]);
  });

  test('Delete takes the marked layer and closes the row up behind it', () => {
    clickRing(1);
    editor.commands.run('edit.delete');
    expect(editor.doc.has(ids[1]!)).toBe(false);
    expect([ids[0]!, ids[2]!].map((id) => (editor.doc.getOrThrow(id) as SceneNode).transform[4])).toEqual([0, 70]);
    expect(editor.selection).toEqual([ids[0], ids[2]]);
    editor.history.undo();
    expect(xs()).toEqual([0, 70, 120]);
  });

  test('⌘D copies the marked layer into the row, the rest moving along to make room', () => {
    clickRing(0);
    editor.commands.run('edit.duplicate');
    const clones = marked();
    expect(clones).toHaveLength(1);
    // The row is 50, 50, 30 and 40 wide with 20 px gaps: 0, 70, 140, 190.
    expect((editor.doc.getOrThrow(clones[0]!) as SceneNode).transform[4]).toBe(70);
    expect(xs()).toEqual([0, 140, 190]);
    editor.history.undo();
    expect(xs()).toEqual([0, 70, 120]);
    expect(editor.doc.has(clones[0]!)).toBe(false);
  });

  test('with nothing marked, Delete and ⌘D treat the selection as a whole', () => {
    editor.commands.run('edit.duplicate');
    expect(editor.selection).toHaveLength(3);
    expect(xs()).toEqual([0, 70, 120]);
    editor.history.undo();
    editor.state.select(ids);
    editor.commands.run('edit.delete');
    expect(ids.every((id) => !editor.doc.has(id))).toBe(true);
  });
});

describe('reordering within a smart selection', () => {
  let tools: ToolManager;
  beforeEach(() => {
    tools = new ToolManager(editor);
    editor.state.select(ids);
    // Mark the first layer by clicking its pink ring.
    tools.pointerDown(sample(25, 25));
    tools.pointerUp(sample(25, 25));
  });

  test('dragging a marked layer to the end of the row puts it there and closes the row up', () => {
    tools.pointerDown(sample(25, 25));
    tools.pointerMove(sample(60, 25));
    tools.pointerMove(sample(160, 25));
    tools.pointerUp(sample(160, 25));
    // The row reads 30, 40 then 50 wide with 20 px gaps: 0, 50, 110.
    expect(xs()).toEqual([110, 0, 50]);
    editor.history.undo();
    expect(xs()).toEqual([0, 70, 120]);
  });

  test('the blue drop line follows the place the layers will land', () => {
    tools.pointerDown(sample(25, 25));
    tools.pointerMove(sample(60, 25));
    tools.pointerMove(sample(160, 25));
    // Half a gap before the end of the row without it: 30 + 20 + 40 = 90, less 10.
    expect(tools.moveTool.reorderInsertion?.[0]).toEqual({ x: 100, y: 0 });
    tools.pointerUp(sample(160, 25));
    expect(tools.moveTool.reorderInsertion).toBeNull();
  });

  test('dropping a layer back where it came from leaves no step in the history', () => {
    const before = editor.history.canUndo;
    tools.pointerDown(sample(25, 25));
    tools.pointerMove(sample(60, 25));
    tools.pointerMove(sample(160, 25));
    tools.pointerMove(sample(10, 25));
    tools.pointerUp(sample(10, 25));
    expect(xs()).toEqual([0, 70, 120]);
    expect(editor.history.canUndo).toBe(before);
  });

  test('a short drag carries the layer into the next place along', () => {
    tools.pointerDown(sample(25, 25));
    tools.pointerMove(sample(45, 25));
    tools.pointerUp(sample(45, 25));
    // The row reads 30, 50 then 40 wide with 20 px gaps: 0, 50, 120.
    expect(xs()).toEqual([50, 0, 120]);
  });

  test('with nothing marked the drag moves the whole selection as before', () => {
    editor.state.markLayers([]);
    // Away from any ring, so the press is an ordinary one inside the selection.
    tools.pointerDown(sample(10, 5));
    tools.pointerMove(sample(30, 5));
    tools.pointerUp(sample(30, 5));
    expect(xs()).toEqual([20, 90, 140]);
  });
});
