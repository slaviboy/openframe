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
import { straightSegment } from '@/core/vector/vector-network';
import { BUILTIN_COMMANDS } from '../commands/builtin';
import { Editor } from '../editor';
import { ToolManager } from '../tools/tool-manager';
import type { PointerInfo } from '../tools/types';
import { beginVectorEdit, deleteSelectedPoints } from './vector-edit';

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
/** Draws a lasso through the screen points. */
const lasso = (points: readonly (readonly [number, number])[], shift = false) => {
  tools.pointerDown(sample(...points[0]!, shift));
  for (const p of points.slice(1)) tools.pointerMove(sample(...p, shift));
  tools.pointerUp(sample(...points.at(-1)!, shift));
};
const editState = () => editor.state.getSnapshot().vectorEdit;

beforeEach(() => {
  const ids = new IdGenerator('e');
  editor = new Editor({ doc: createEmptyDocument({ name: 'D', now: 'n', appVersion: 't', ids }), ids, validate: true });
  editor.commands.register(...BUILTIN_COMMANDS);
  editor.setViewport({ x: 0, y: 0, zoom: 1 });
  tools = new ToolManager(editor);
  // A square with corners at (100, 100), (200, 100), (200, 200) and (100, 200) on screen.
  id = editor.history.run('create', (tx) => {
    const vectorId = editor.ids.next();
    tx.create(
      makeVector({ id: vectorId, parent: { id: editor.pageId, key: keyOnTop(editor.doc, editor.pageId) }, name: 'Vector', x: 100, y: 100, width: 100, height: 100 }, {
        vertices: [
          { x: 0, y: 0 },
          { x: 100, y: 0 },
          { x: 100, y: 100 },
          { x: 0, y: 100 },
        ],
        segments: [straightSegment(0, 1), straightSegment(1, 2), straightSegment(2, 3), straightSegment(3, 0)],
        regions: [{ loops: [[0, 1, 2, 3]], windingRule: 'NONZERO' }],
      }),
    );
    return vectorId;
  });
});

describe('lasso in vector edit mode', () => {
  test('Q picks the Lasso: an outline selects the points inside it, Shift adds, a click clears, and the tool stays after deleting', () => {
    beginVectorEdit(editor, id);
    editor.commands.run('vector.toolLasso');
    expect(editState()?.tool).toBe('lasso');

    lasso([
      [80, 80],
      [220, 80],
      [220, 150],
      [80, 150],
    ]);
    expect(editState()?.vertices).toEqual([0, 1]);
    lasso(
      [
        [80, 180],
        [120, 180],
        [120, 220],
        [80, 220],
      ],
      true,
    );
    expect(editState()?.vertices).toEqual([0, 1, 3]);
    lasso([[150, 150]]);
    expect(editState()?.vertices).toEqual([]);

    lasso([
      [180, 180],
      [220, 180],
      [220, 220],
      [180, 220],
    ]);
    expect(editState()?.vertices).toEqual([2]);
    expect(deleteSelectedPoints(editor)).toBe(true);
    expect(editState()?.tool).toBe('lasso');

    editor.commands.run('vector.toolMove');
    expect(editState()?.tool).toBe('move');
  });

  test('Escape cancels a lasso being drawn without leaving vector edit mode', () => {
    beginVectorEdit(editor, id);
    editor.commands.run('vector.toolLasso');
    tools.pointerDown(sample(80, 80));
    tools.pointerMove(sample(220, 80));
    expect(tools.vectorEdit.lassoPath).toHaveLength(2);
    expect(tools.cancel()).toBe(true);
    expect(tools.vectorEdit.lassoPath).toBeNull();
    expect(editState()).not.toBeNull();
  });

  test('V and Q only pick vector tools while a vector is being edited', () => {
    expect(editor.commands.get('vector.toolLasso')!.enabled!(editor)).toBe(false);
    expect(editor.commands.get('vector.toolMove')!.enabled!(editor)).toBe(false);
  });
});
