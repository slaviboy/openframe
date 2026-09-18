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
import { createEmptyDocument, keyOnTop, makeFrame, makeStar, makeVector } from '@/core/document/factory';
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

describe('editing the points of a shape that is not a vector layer', () => {
  test('a star becomes a vector layer of the same outline, in its place, with its appearance', () => {
    const star = editor.history.run('star', (tx) => {
      const starId = editor.ids.next();
      const node = makeStar({ id: starId, parent: { id: editor.pageId, key: keyOnTop(editor.doc, editor.pageId) }, name: 'Star 1', x: 40, y: 60, width: 80, height: 80 });
      tx.create({ ...node, opacity: 0.5 });
      return starId;
    });
    editor.state.select([star]);
    expect(beginVectorEdit(editor, star)).toBe(true);

    const id = editor.state.getSnapshot().vectorEdit!.nodeId;
    const node = editor.doc.getOrThrow(id) as VectorNode;
    expect(node.type).toBe('VECTOR');
    expect(editor.doc.has(star)).toBe(false);
    expect(node.name).toBe('Star 1');
    expect(node.opacity).toBe(0.5);
    expect(node.size).toEqual({ width: 80, height: 80 });
    expect([node.transform[4], node.transform[5]]).toEqual([40, 60]);
    // A star has ten points around it, which are now the layer's own.
    expect(node.vectorNetwork.vertices).toHaveLength(10);

    // One undo puts the star back.
    editor.history.undo();
    expect(editor.doc.getOrThrow(star).type).toBe('STAR');
  });

  test('a layer that holds other layers is left alone, so a frame keeps its contents', () => {
    const frame = editor.history.run('frame', (tx) => {
      const frameId = editor.ids.next();
      tx.create(makeFrame({ id: frameId, parent: { id: editor.pageId, key: keyOnTop(editor.doc, editor.pageId) }, name: 'F', x: 0, y: 0, width: 10, height: 10 }));
      return frameId;
    });
    expect(beginVectorEdit(editor, frame)).toBe(false);
    expect(editor.doc.getOrThrow(frame).type).toBe('FRAME');
    expect(editor.state.getSnapshot().vectorEdit).toBeNull();
  });
});

describe('editing several layers at once', () => {
  let second: string;

  /** A second square vector layer, 300–400 across and 100–200 down, beside the first. */
  beforeEach(() => {
    second = editor.history.run('create', (tx) => {
      const vectorId = editor.ids.next();
      tx.create(
        makeVector(
          { id: vectorId, parent: { id: editor.pageId, key: keyOnTop(editor.doc, editor.pageId) }, name: 'Vector 2', x: 300, y: 100, width: 100, height: 100 },
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
    editor.state.select([id, second]);
  });

  const other = () => editor.doc.getOrThrow(second) as VectorNode;

  test('Return opens every selected vector layer, each keeping its own points', () => {
    expect(editor.commands.isEnabled('vector.edit')).toBe(true);
    editor.commands.run('vector.edit');
    expect(editState()).toMatchObject({ nodeId: id, vertices: [], others: [{ nodeId: second, vertices: [] }] });
  });

  test('clicking a point in the other layer brings it forward, and ⇧ keeps the first layer points', () => {
    editor.commands.run('vector.edit');
    click(100, 100);
    expect(editState()).toMatchObject({ nodeId: id, vertices: [0] });
    // The second layer's top-left point is at 300, 100 in the world.
    click(300, 100, { shift: true });
    expect(editState()?.nodeId).toBe(second);
    expect(editState()?.vertices).toEqual([0]);
    expect(editState()?.others).toEqual([{ nodeId: id, vertices: [0] }]);
    // A plain click on it drops what the other layer held.
    click(400, 100);
    expect(editState()?.others).toEqual([{ nodeId: id, vertices: [] }]);
  });

  test('dragging carries the selected points of both layers at once', () => {
    editor.commands.run('vector.edit');
    click(100, 100);
    click(300, 100, { shift: true });
    tools.pointerDown(sample(300, 100));
    tools.pointerMove(sample(310, 120));
    tools.pointerUp(sample(310, 120));
    // The point picked in each layer travels the same distance; the rest of each layer stays where it was.
    expect(node().vectorNetwork.vertices[0]).toEqual({ x: 10, y: 20 });
    expect(node().vectorNetwork.vertices[1]).toEqual({ x: 100, y: 0 });
    expect(other().vectorNetwork.vertices[0]).toEqual({ x: 10, y: 20 });
    expect(other().vectorNetwork.vertices[1]).toEqual({ x: 100, y: 0 });
    editor.history.undo();
    expect(node().vectorNetwork.vertices[0]).toEqual({ x: 0, y: 0 });
    expect(other().vectorNetwork.vertices[0]).toEqual({ x: 0, y: 0 });
  });

  test('Delete takes the selected points out of both layers in one step', () => {
    editor.commands.run('vector.edit');
    click(100, 100);
    click(300, 100, { shift: true });
    expect(deleteSelectedPoints(editor)).toBe(true);
    expect(node().vectorNetwork.vertices).toHaveLength(3);
    expect(other().vectorNetwork.vertices).toHaveLength(3);
    editor.history.undo();
    expect(node().vectorNetwork.vertices).toHaveLength(4);
    expect(other().vectorNetwork.vertices).toHaveLength(4);
  });

  test('changing the selection to one of the layers leaves editing', () => {
    editor.commands.run('vector.edit');
    editor.state.select([id]);
    expect(editState()).toBeNull();
  });
});
