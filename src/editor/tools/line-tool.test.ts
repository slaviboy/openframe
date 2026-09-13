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
import { createEmptyDocument, keyOnTop, makeLine, makePolygon } from '@/core/document/factory';
import { IdGenerator } from '@/core/ids/ids';
import { hitTestDeepest } from '@/core/scene/hit-test';
import type { LineNode, Node, PolygonNode, StarNode } from '@/core/schema/document';
import { BUILTIN_COMMANDS } from '../commands/builtin';
import { setLineCap, setPointCount, setSize } from '../commands/properties';
import { Editor } from '../editor';
import { ToolManager } from './tool-manager';
import type { PointerInfo } from './types';

let editor: Editor;
let tools: ToolManager;

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

function drag(x0: number, y0: number, x1: number, y1: number, over: Partial<PointerInfo> = {}) {
  tools.pointerDown(sample(x0, y0, over));
  for (let i = 1; i <= 5; i++) tools.pointerMove(sample(x0 + ((x1 - x0) * i) / 5, y0 + ((y1 - y0) * i) / 5, over));
  tools.pointerUp(sample(x1, y1, over));
}
const children = () => editor.doc.children(editor.pageId).map((id) => editor.doc.getOrThrow(id));
const only = <T extends Node>() => {
  const nodes = children();
  expect(nodes).toHaveLength(1);
  return nodes[0] as T;
};

beforeEach(() => {
  const ids = new IdGenerator('u');
  const doc = createEmptyDocument({ name: 'D', now: 'n', appVersion: 't', ids });
  editor = new Editor({ doc, ids, validate: true });
  editor.commands.register(...BUILTIN_COMMANDS);
  editor.setViewport({ x: 0, y: 0, zoom: 1 });
  tools = new ToolManager(editor);
});

describe('line and arrow tools', () => {
  test('drag draws a horizontal line in one undo step and returns to the move tool', () => {
    editor.state.setTool('line');
    drag(100, 100, 200, 100);
    const line = only<LineNode>();
    expect(line.type).toBe('LINE');
    expect(line.name).toBe('Line 1');
    expect(line.transform).toEqual([1, 0, 0, 1, 100, 100]);
    expect(line.size).toEqual({ width: 100, height: 0 });
    expect(line.endCap).toBe('NONE');
    expect(editor.selection).toEqual([line.id]);
    expect(editor.state.getSnapshot().tool).toBe('move');
    editor.history.undo();
    expect(children()).toHaveLength(0);
  });

  test('vertical drags produce an exact 90° transform', () => {
    editor.state.setTool('line');
    drag(100, 100, 100, 180);
    const line = only<LineNode>();
    expect(line.transform).toEqual([0, 1, -1, 0, 100, 100]);
    expect(line.size.width).toBe(80);
  });

  test('Shift constrains to 45° increments', () => {
    editor.state.setTool('line');
    drag(0, 0, 100, 90, { shift: true });
    const line = only<LineNode>();
    expect(line.transform[0]).toBeCloseTo(Math.SQRT1_2);
    expect(line.transform[1]).toBeCloseTo(Math.SQRT1_2);
    expect(line.size.width).toBeCloseTo(190 / Math.SQRT2, 1);
  });

  test('click places a 100px line; the arrow tool adds a line arrow end cap', () => {
    editor.state.setTool('arrow');
    tools.pointerDown(sample(40, 40));
    tools.pointerUp(sample(40, 40));
    const arrow = only<LineNode>();
    expect(arrow.name).toBe('Arrow 1');
    expect(arrow.endCap).toBe('LINE_ARROW');
    expect(arrow.startCap).toBe('NONE');
    expect(arrow.size).toEqual({ width: 100, height: 0 });
  });

  test('shortcuts: L for line, Shift+L for arrow', () => {
    expect(editor.commands.get('tools.line')?.shortcuts).toEqual(['L']);
    expect(editor.commands.get('tools.arrow')?.shortcuts).toEqual(['Shift+L']);
    editor.commands.run('tools.arrow');
    expect(editor.state.getSnapshot().tool).toBe('arrow');
  });

  test('dragging an end point moves only that end', () => {
    const id = editor.history.run('seed', (tx) => {
      const id = editor.ids.next();
      tx.create(makeLine({ id, parent: { id: editor.pageId, key: keyOnTop(editor.doc, editor.pageId) }, name: 'L', x: 100, y: 100, width: 100, height: 0 }));
      return id;
    });
    editor.state.select([id]);
    drag(200, 100, 200, 200);
    const line = editor.doc.getOrThrow(id) as LineNode;
    expect(line.transform[4]).toBe(100);
    expect(line.transform[5]).toBe(100);
    expect(line.transform[0]).toBeCloseTo(Math.SQRT1_2);
    expect(line.size.width).toBeCloseTo(141.42, 1);
    expect(line.size.height).toBe(0);
    // Dragging the start point keeps the end fixed at (200, 200).
    drag(100, 100, 200, 100);
    const moved = editor.doc.getOrThrow(id) as LineNode;
    expect(moved.transform.slice(4)).toEqual([200, 100]);
    expect(moved.size.width).toBeCloseTo(100);
    editor.history.undo();
    expect((editor.doc.getOrThrow(id) as LineNode).size.width).toBeCloseTo(141.42, 1);
  });

  test('line properties: height is fixed at 0 and caps can change', () => {
    editor.state.setTool('line');
    drag(0, 0, 50, 0);
    const line = only<LineNode>();
    editor.history.run('edit', (tx) => {
      setSize(tx, line, 'height', 40);
      setLineCap(tx, line, 'startCap', 'CIRCLE_FILLED');
    });
    const after = editor.doc.getOrThrow(line.id) as LineNode;
    expect(after.size.height).toBe(0);
    expect(after.startCap).toBe('CIRCLE_FILLED');
  });
});

describe('polygon and star tools', () => {
  test('draw a polygon (triangle) and a star with default parameters', () => {
    editor.state.setTool('polygon');
    drag(0, 0, 100, 100);
    editor.state.setTool('star');
    drag(200, 0, 300, 100);
    const [polygon, star] = children() as [PolygonNode, StarNode];
    expect(polygon).toMatchObject({ type: 'POLYGON', name: 'Polygon 1', pointCount: 3, size: { width: 100, height: 100 } });
    expect(star).toMatchObject({ type: 'STAR', name: 'Star 1', pointCount: 5, innerRadius: 0.38 });
  });

  test('point count is clamped and hit testing follows the outline', () => {
    const id = editor.history.run('seed', (tx) => {
      const id = editor.ids.next();
      tx.create(makePolygon({ id, parent: { id: editor.pageId, key: keyOnTop(editor.doc, editor.pageId) }, name: 'P', x: 0, y: 0, width: 100, height: 100 }));
      return id;
    });
    editor.history.run('count', (tx) => setPointCount(tx, editor.doc.getOrThrow(id) as PolygonNode, 99));
    expect((editor.doc.getOrThrow(id) as PolygonNode).pointCount).toBe(60);
    editor.history.run('count', (tx) => setPointCount(tx, editor.doc.getOrThrow(id) as PolygonNode, 3));
    const hit = (x: number, y: number) => hitTestDeepest(editor.doc, editor.scene, editor.pageId, { x, y }, { tolerance: 0 });
    expect(hit(50, 80)).toBe(id);
    expect(hit(5, 5)).toBeNull();
  });

  test('lines are hit within half the stroke weight plus tolerance', () => {
    editor.state.setTool('line');
    drag(0, 50, 100, 50);
    const line = only<LineNode>();
    const hit = (y: number, tolerance: number) => hitTestDeepest(editor.doc, editor.scene, editor.pageId, { x: 50, y }, { tolerance });
    expect(hit(50.4, 0)).toBe(line.id);
    expect(hit(53, 0)).toBeNull();
    expect(hit(53, 5)).toBe(line.id);
    expect(hit(60, 5)).toBeNull();
  });
});
