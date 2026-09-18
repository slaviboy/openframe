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
import { createEmptyDocument, keyOnTop, makeFrame, makeRectangle } from '@/core/document/factory';
import { IdGenerator } from '@/core/ids/ids';
import type { FrameNode, Node, RectangleNode } from '@/core/schema/document';
import { BUILTIN_COMMANDS } from '../commands/builtin';
import { rotationDegrees } from '../commands/properties';
import { normalizeDegrees } from './move-tool';
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

/** Simulated drag in screen coordinates (viewport is identity at zoom 1 with origin 0,0). */
function drag(x0: number, y0: number, x1: number, y1: number, over: Partial<PointerInfo> = {}) {
  tools.pointerDown(sample(x0, y0, over));
  const steps = 5;
  for (let i = 1; i <= steps; i++) tools.pointerMove(sample(x0 + ((x1 - x0) * i) / steps, y0 + ((y1 - y0) * i) / steps, over));
  tools.pointerUp(sample(x1, y1, over));
}
const click = (x: number, y: number, over: Partial<PointerInfo> = {}) => {
  tools.pointerDown(sample(x, y, over));
  tools.pointerUp(sample(x, y, over));
};
const get = <T extends Node>(id: string) => editor.doc.getOrThrow(id) as T;

function add<T extends Node>(build: (id: string, parent: { id: string; key: string }) => T, parent = editor.pageId): string {
  return editor.history.run('seed', (tx) => {
    const id = editor.ids.next();
    tx.create(build(id, { id: parent, key: keyOnTop(editor.doc, parent) }));
    return id;
  });
}

beforeEach(() => {
  const ids = new IdGenerator('u');
  const doc = createEmptyDocument({ name: 'D', now: 'n', appVersion: 't', ids });
  editor = new Editor({ doc, ids, validate: true });
  editor.commands.register(...BUILTIN_COMMANDS);
  editor.setViewport({ x: 0, y: 0, zoom: 1 });
  tools = new ToolManager(editor);
});

describe('shape tools', () => {
  test('drag draws a rectangle, selects it, one undo step, returns to move tool', () => {
    editor.state.setTool('rectangle');
    drag(10, 20, 110, 70);
    const [id] = editor.selection;
    const rect = get<RectangleNode>(id!);
    expect(rect.type).toBe('RECTANGLE');
    expect(rect.name).toBe('Rectangle 1');
    expect(rect.transform.slice(4)).toEqual([10, 20]);
    expect(rect.size).toEqual({ width: 100, height: 50 });
    expect(editor.state.getSnapshot().tool).toBe('move');
    editor.commands.run('edit.undo');
    expect(editor.doc.has(id!)).toBe(false);
  });

  test('shift draws squares, alt draws from center, drag up-left normalizes', () => {
    editor.state.setTool('ellipse');
    drag(100, 100, 40, 70, { shift: true });
    const e = get<RectangleNode>(editor.selection[0]!);
    expect(e.size).toEqual({ width: 60, height: 60 });
    expect(e.transform.slice(4)).toEqual([40, 40]);
    editor.state.setTool('rectangle');
    drag(200, 200, 220, 210, { alt: true });
    const r = get<RectangleNode>(editor.selection[0]!);
    expect(r.size).toEqual({ width: 40, height: 20 });
    expect(r.transform.slice(4)).toEqual([180, 190]);
  });

  test('click places a 100×100 layer; drawing inside a frame parents to it in local coordinates', () => {
    const frame = add((id, parent) => makeFrame({ id, parent, name: 'F', x: 300, y: 300, width: 200, height: 200 }));
    editor.state.setTool('rectangle');
    click(350, 360);
    const r = get<RectangleNode>(editor.selection[0]!);
    expect(r.parent.id).toBe(frame);
    expect(r.transform.slice(4)).toEqual([50, 60]);
    expect(r.size).toEqual({ width: 100, height: 100 });
  });

  test('Escape cancels an in-progress draw', () => {
    editor.state.setTool('frame');
    tools.pointerDown(sample(0, 0));
    tools.pointerMove(sample(50, 50));
    expect(tools.cancel()).toBe(true);
    expect([...editor.doc.children(editor.pageId)]).toEqual([]);
    expect(editor.history.canUndo).toBe(false);
  });
});

describe('move tool', () => {
  let a: string;
  let b: string;
  beforeEach(() => {
    a = add((id, parent) => makeRectangle({ id, parent, name: 'A', x: 0, y: 0, width: 50, height: 50 }));
    b = add((id, parent) => makeRectangle({ id, parent, name: 'B', x: 100, y: 0, width: 50, height: 50 }));
  });

  test('click selects, shift-click adds, empty click clears', () => {
    click(10, 10);
    expect(editor.selection).toEqual([a]);
    click(110, 10, { shift: true });
    expect(editor.selection).toEqual([a, b]);
    click(500, 500);
    expect(editor.selection).toEqual([]);
  });

  test('drag moves as a single undo step; shift constrains axis', () => {
    drag(10, 10, 40, 25);
    expect(get<RectangleNode>(a).transform.slice(4)).toEqual([30, 15]);
    drag(40, 25, 90, 35, { shift: true });
    expect(get<RectangleNode>(a).transform.slice(4)).toEqual([80, 15]);
    editor.commands.run('edit.undo');
    expect(get<RectangleNode>(a).transform.slice(4)).toEqual([30, 15]);
  });

  test('marquee selects intersecting layers', () => {
    drag(-10, -10, 120, 20);
    expect(editor.selection).toEqual([a, b]);
  });

  test('resize from the se handle, with shift keeping aspect ratio', () => {
    click(10, 10);
    drag(50, 50, 80, 70);
    expect(get<RectangleNode>(a).size).toEqual({ width: 80, height: 70 });
    drag(80, 70, 160, 90, { shift: true });
    const size = get<RectangleNode>(a).size;
    expect(size.width / size.height).toBeCloseTo(80 / 70, 2);
  });

  test('resizing past the opposite edge flips the layer', () => {
    click(10, 10);
    drag(50, 25, -30, 25); // east edge dragged left past x=0
    const rect = get<RectangleNode>(a);
    expect(rect.size.width).toBe(30);
    expect(rect.transform[0]).toBe(-1);
  });

  test('dragging a layer into a frame reparents it, keeping its world position', () => {
    const frame = add((id, parent) => makeFrame({ id, parent, name: 'F', x: 400, y: 400, width: 300, height: 300 }));
    click(110, 10);
    drag(110, 10, 510, 510);
    const moved = get<RectangleNode>(b);
    expect(moved.parent.id).toBe(frame);
    expect(moved.transform.slice(4)).toEqual([100, 100]);
    expect(get<FrameNode>(frame).type).toBe('FRAME');
    editor.commands.run('edit.undo');
    expect(get<RectangleNode>(b).parent.id).toBe(editor.pageId);
  });

  test('wheel pans and ctrl-wheel zooms around the cursor, a mouse notch by less than it reports', () => {
    // A trackpad's small deltas pan by exactly what they report.
    tools.wheel({ screen: { x: 100, y: 100 }, deltaX: 0, deltaY: 20, ctrlOrMeta: false, shift: false });
    expect(editor.state.viewport.y).toBe(20);
    // A mouse notch is damped, or the canvas leaps a hundred pixels at a time.
    tools.wheel({ screen: { x: 100, y: 100 }, deltaX: 0, deltaY: 100, ctrlOrMeta: false, shift: false });
    expect(editor.state.viewport.y).toBe(70);

    tools.wheel({ screen: { x: 100, y: 100 }, deltaX: 0, deltaY: -10, ctrlOrMeta: true, shift: false });
    expect(editor.state.viewport.zoom).toBeGreaterThan(1);
    // A notch of zoom moves it by about 6%, not the 18% it used to take.
    const before = editor.state.viewport.zoom;
    tools.wheel({ screen: { x: 100, y: 100 }, deltaX: 0, deltaY: -100, ctrlOrMeta: true, shift: false });
    expect(editor.state.viewport.zoom / before).toBeGreaterThan(1.05);
    expect(editor.state.viewport.zoom / before).toBeLessThan(1.08);
  });
});

describe('rotation handles', () => {
  const centerOf = (id: string) => {
    editor.scene.ensure(editor.pageId);
    const b = editor.scene.worldBounds(id)!;
    return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
  };

  test('dragging just outside a corner rotates around the center as one undo step', () => {
    const r = add((id, parent) => makeRectangle({ id, parent, name: 'R', x: 100, y: 100, width: 100, height: 50 }));
    click(150, 125);
    // Pivot (150,125). Start outside the NW corner (100,100) and sweep clockwise to straight above the pivot.
    drag(90, 90, 150, 40);
    const node = get<RectangleNode>(r);
    const expected = -(((Math.atan2(-85, 0) - Math.atan2(-35, -60)) * 180) / Math.PI);
    expect(rotationDegrees(node)).toBeCloseTo(expected, 1);
    expect(centerOf(r).x).toBeCloseTo(150);
    expect(centerOf(r).y).toBeCloseTo(125);
    editor.commands.run('edit.undo');
    expect(get<RectangleNode>(r).transform).toEqual([1, 0, 0, 1, 100, 100]);
  });

  test('shift snaps the resulting rotation to 15° increments; Escape cancels', () => {
    const r = add((id, parent) => makeRectangle({ id, parent, name: 'R', x: 100, y: 100, width: 100, height: 50 }));
    click(150, 125);
    drag(90, 90, 150, 40, { shift: true });
    expect(rotationDegrees(get<RectangleNode>(r))).toBeCloseTo(-60, 5);

    // The NW corner (100,100) rotated 60° clockwise about (150,125) is at ≈(146.7, 69.2);
    // start 10px further out along the diagonal so the press lands in the rotation zone.
    tools.pointerDown(sample(146, 59));
    tools.pointerMove(sample(200, 60));
    expect(rotationDegrees(get<RectangleNode>(r))).not.toBeCloseTo(-60, 1);
    expect(tools.cancel()).toBe(true);
    expect(rotationDegrees(get<RectangleNode>(r))).toBeCloseTo(-60, 5);
    expect(normalizeDegrees(-179.6)).toBeCloseTo(-179.6);
    expect(normalizeDegrees(-180)).toBe(180);
    expect(normalizeDegrees(540)).toBe(180);
  });

  test('resize handles take precedence over the rotation zone at the corner', () => {
    const r = add((id, parent) => makeRectangle({ id, parent, name: 'R', x: 100, y: 100, width: 100, height: 50 }));
    click(150, 125);
    drag(200, 150, 220, 160);
    expect(get<RectangleNode>(r).size).toEqual({ width: 120, height: 60 });
    expect(rotationDegrees(get<RectangleNode>(r))).toBe(0);
  });

  test('multi-selection rotates each layer around the shared center', () => {
    const a = add((id, parent) => makeRectangle({ id, parent, name: 'A', x: 0, y: 0, width: 20, height: 20 }));
    const b = add((id, parent) => makeRectangle({ id, parent, name: 'B', x: 80, y: 0, width: 20, height: 20 }));
    click(10, 10);
    click(90, 10, { shift: true });
    // Selection bounds (0,0)-(100,20), pivot (50,10). Rotate 180° with shift snapping.
    drag(-10, -10, 110, 30, { shift: true });
    expect(centerOf(a).x).toBeCloseTo(90);
    expect(centerOf(b).x).toBeCloseTo(10);
  });
});

describe('snapping and ⌥-drag duplicate', () => {
  test('moving snaps edges within 5px and shows guides; Control disables snapping', () => {
    const a = add((id, parent) => makeRectangle({ id, parent, name: 'A', x: 0, y: 0, width: 50, height: 50 }));
    add((id, parent) => makeRectangle({ id, parent, name: 'B', x: 100, y: 0, width: 50, height: 50 }));
    click(25, 25);
    tools.pointerDown(sample(25, 25));
    tools.pointerMove(sample(50, 25));
    tools.pointerMove(sample(72, 25));
    // Raw right edge 97 snaps to B's left edge at 100; tops are aligned too.
    expect(tools.moveTool.snapGuides.some((g) => g.axis === 'x' && g.position === 100)).toBe(true);
    tools.pointerUp(sample(72, 25));
    expect(get<RectangleNode>(a).transform.slice(4)).toEqual([50, 0]);
    expect(tools.moveTool.snapGuides).toEqual([]);

    editor.commands.run('edit.undo');
    drag(25, 25, 72, 25, { ctrl: true });
    expect(get<RectangleNode>(a).transform.slice(4)).toEqual([47, 0]);
  });

  test('snapping respects the Shift axis lock', () => {
    const a = add((id, parent) => makeRectangle({ id, parent, name: 'A', x: 0, y: 0, width: 50, height: 50 }));
    add((id, parent) => makeRectangle({ id, parent, name: 'B', x: 100, y: 3, width: 50, height: 50 }));
    click(25, 25);
    // Shift locks y. Without the lock A's top (0) would snap 3px down to B's top (3);
    // with it, only x snaps (A's right edge 97 → B's left edge 100).
    drag(25, 25, 72, 27, { shift: true });
    expect(get<RectangleNode>(a).transform.slice(4)).toEqual([50, 0]);
  });

  test('⌥-drag duplicates and moves the copy in one undo step; ⌘D then repeats the offset', () => {
    const r = add((id, parent) => makeRectangle({ id, parent, name: 'R', x: 0, y: 300, width: 40, height: 40 }));
    click(20, 320);
    drag(20, 320, 120, 320, { alt: true });
    expect(editor.doc.children(editor.pageId)).toHaveLength(2);
    expect(get<RectangleNode>(r).transform.slice(4)).toEqual([0, 300]);
    const copy = editor.selection[0]!;
    expect(copy).not.toBe(r);
    expect(get<RectangleNode>(copy).transform.slice(4)).toEqual([100, 300]);

    editor.commands.run('edit.undo');
    expect(editor.doc.children(editor.pageId)).toHaveLength(1);
    editor.commands.run('edit.redo');
    expect(editor.selection).toEqual([copy]);
    editor.commands.run('edit.duplicate');
    expect(get<RectangleNode>(editor.selection[0]!).transform.slice(4)).toEqual([200, 300]);
  });

  test('Escape during ⌥-drag removes the copy', () => {
    const r = add((id, parent) => makeRectangle({ id, parent, name: 'R', x: 0, y: 300, width: 40, height: 40 }));
    click(20, 320);
    tools.pointerDown(sample(20, 320, { alt: true }));
    tools.pointerMove(sample(80, 320, { alt: true }));
    expect(editor.doc.children(editor.pageId)).toHaveLength(2);
    expect(tools.cancel()).toBe(true);
    expect([...editor.doc.children(editor.pageId)]).toEqual([r]);
    expect(editor.selection).toEqual([r]);
  });
});

describe('draw and resize snapping', () => {
  test('drawing snaps the dragged corner to nearby edges; Control disables snapping', () => {
    add((id, parent) => makeRectangle({ id, parent, name: 'B', x: 100, y: 0, width: 50, height: 50 }));
    editor.state.setTool('rectangle');
    tools.pointerDown(sample(0, 0));
    tools.pointerMove(sample(50, 20));
    tools.pointerMove(sample(97, 30));
    expect(tools.snapGuides.some((g) => g.axis === 'x' && g.position === 100)).toBe(true);
    tools.pointerUp(sample(97, 30));
    expect(get<RectangleNode>(editor.selection[0]!).size).toEqual({ width: 100, height: 30 });

    editor.state.setTool('rectangle');
    drag(0, 200, 97, 230, { ctrl: true });
    expect(get<RectangleNode>(editor.selection[0]!).size).toEqual({ width: 97, height: 30 });
  });

  test('resizing snaps the moving edge and shows guides', () => {
    const a = add((id, parent) => makeRectangle({ id, parent, name: 'A', x: 0, y: 0, width: 50, height: 50 }));
    add((id, parent) => makeRectangle({ id, parent, name: 'B', x: 100, y: 0, width: 50, height: 50 }));
    click(25, 25);
    tools.pointerDown(sample(50, 25));
    tools.pointerMove(sample(70, 25));
    tools.pointerMove(sample(97, 25));
    expect(tools.snapGuides.some((g) => g.axis === 'x' && g.position === 100)).toBe(true);
    tools.pointerUp(sample(97, 25));
    expect(get<RectangleNode>(a).size).toEqual({ width: 100, height: 50 });
    expect(tools.snapGuides).toEqual([]);
  });
});

describe('context menu selection', () => {
  test('right-click selects the layer under the pointer, keeps a containing multi-selection, clears on empty canvas', () => {
    const a = add((id, parent) => makeRectangle({ id, parent, name: 'A', x: 0, y: 0, width: 50, height: 50 }));
    const b = add((id, parent) => makeRectangle({ id, parent, name: 'B', x: 100, y: 0, width: 50, height: 50 }));
    tools.contextSelect(sample(25, 25, { button: 2 }));
    expect(editor.selection).toEqual([a]);

    editor.state.select([a, b]);
    tools.contextSelect(sample(125, 25, { button: 2 }));
    expect(editor.selection).toEqual([a, b]);

    tools.contextSelect(sample(400, 400, { button: 2 }));
    expect(editor.selection).toEqual([]);
  });
});
