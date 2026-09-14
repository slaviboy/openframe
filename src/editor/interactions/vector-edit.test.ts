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
import { beginVectorEdit, deleteSelectedPoints } from './vector-edit';

let editor: Editor;
let tools: ToolManager;
let id: string;

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
const click = (x: number, y: number, over: Partial<PointerInfo> = {}) => {
  tools.pointerDown(sample(x, y, over));
  tools.pointerUp(sample(x, y, over));
};
const node = () => editor.doc.getOrThrow(id) as VectorNode;
const editState = () => editor.state.getSnapshot().vectorEdit;

beforeEach(() => {
  const ids = new IdGenerator('e');
  editor = new Editor({ doc: createEmptyDocument({ name: 'D', now: 'n', appVersion: 't', ids }), ids, validate: true });
  editor.commands.register(...BUILTIN_COMMANDS);
  editor.setViewport({ x: 0, y: 0, zoom: 1 });
  tools = new ToolManager(editor);
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

describe('vector edit mode', () => {
  test('dragging a point moves it and refits the layer box; undo restores', () => {
    expect(beginVectorEdit(editor, id)).toBe(true);
    tools.pointerDown(sample(200, 100));
    tools.pointerMove(sample(210, 90));
    tools.pointerMove(sample(220, 80));
    tools.pointerUp(sample(220, 80));
    expect(editState()).toEqual({ nodeId: id, vertices: [1] });
    // The point went from (100, 0) to (120, −20): the box grows up by 20 and right by 20.
    expect(node().transform.slice(4)).toEqual([100, 80]);
    expect(node().size).toEqual({ width: 120, height: 120 });
    expect(node().vectorNetwork.vertices[0]).toEqual({ x: 0, y: 20 });
    expect(node().vectorNetwork.vertices[1]).toEqual({ x: 120, y: 0 });
    editor.history.undo();
    expect(node().size).toEqual({ width: 100, height: 100 });
  });

  test('Shift adds points, clicking inside clears, double-clicking a path adds a point, Delete removes, clicking elsewhere leaves', () => {
    beginVectorEdit(editor, id);
    click(100, 100);
    click(200, 200, { shift: true });
    expect(editState()?.vertices).toEqual([0, 2]);
    click(150, 150);
    expect(editState()?.vertices).toEqual([]);

    click(150, 100, { clickCount: 2 });
    expect(node().vectorNetwork.vertices).toHaveLength(5);
    expect(editState()?.vertices).toEqual([4]);
    expect(deleteSelectedPoints(editor)).toBe(true);
    expect(node().vectorNetwork.vertices).toHaveLength(4);

    click(600, 600);
    expect(editState()).toBeNull();
  });

  test('Escape or selecting something else leaves vector edit mode', () => {
    beginVectorEdit(editor, id);
    expect(tools.cancel()).toBe(true);
    expect(editState()).toBeNull();
    beginVectorEdit(editor, id);
    editor.state.select([]);
    expect(editState()).toBeNull();
  });
});
