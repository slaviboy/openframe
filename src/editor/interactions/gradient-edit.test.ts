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
import { gradientHandles } from '@/core/color/gradient-handles';
import { convertPaint } from '@/core/color/paints';
import { createEmptyDocument, keyOnTop, makeRectangle, solid } from '@/core/document/factory';
import { IdGenerator } from '@/core/ids/ids';
import type { Vec2 } from '@/core/math/vec';
import type { GradientPaint, RectangleNode } from '@/core/schema/document';
import { Editor } from '../editor';
import { ToolManager } from '../tools/tool-manager';
import type { PointerInfo } from '../tools/types';
import { beginGradientEdit, gradientEditChrome } from './gradient-edit';

let editor: Editor;
let tools: ToolManager;
let rect: string;
const size = { width: 200, height: 100 };

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

function drag(from: Vec2, to: Vec2): void {
  tools.pointerDown(sample(from.x, from.y));
  tools.pointerMove(sample((from.x + to.x) / 2, (from.y + to.y) / 2));
  tools.pointerMove(sample(to.x, to.y));
  tools.pointerUp(sample(to.x, to.y));
}

const paint = () => (editor.doc.getOrThrow(rect) as RectangleNode).fills[0] as GradientPaint;

function setup(type: GradientPaint['type']) {
  const ids = new IdGenerator('g');
  editor = new Editor({ doc: createEmptyDocument({ name: 'D', now: 'n', appVersion: 't', ids }), ids, validate: true });
  editor.state.setViewport({ x: 0, y: 0, zoom: 1 });
  tools = new ToolManager(editor);
  rect = editor.history.run('seed', (tx) => {
    const id = editor.ids.next();
    const r = makeRectangle({ id, parent: { id: editor.pageId, key: keyOnTop(editor.doc, editor.pageId) }, name: 'R', x: 0, y: 0, ...size });
    tx.create({ ...r, fills: [convertPaint(solid({ r: 1, g: 0, b: 0, a: 1 }), type)] });
    return id;
  });
}

describe('on-canvas gradient editing', () => {
  beforeEach(() => setup('GRADIENT_LINEAR'));

  test('dragging the end handle rotates a linear gradient, as one undo step', () => {
    expect(beginGradientEdit(editor, rect, 'fills', 0)).toBe(true);
    expect(gradientEditChrome(editor)!.end).toEqual({ x: 200, y: 50 });
    drag({ x: 200, y: 50 }, { x: 100, y: 100 });
    const handles = gradientHandles(paint(), size);
    expect(handles.end.x).toBeCloseTo(100);
    expect(handles.end.y).toBeCloseTo(100);
    expect(handles.start.x).toBeCloseTo(0);
    editor.history.undo();
    expect(paint().gradientTransform).toEqual([1, 0, 0, 1, 0, 0]);
  });

  test('clicking the gradient line adds a stop; dragging a stop moves it', () => {
    beginGradientEdit(editor, rect, 'fills', 0);
    tools.pointerDown(sample(100, 50));
    tools.pointerUp(sample(100, 50));
    expect(paint().gradientStops.map((s) => s.position)).toEqual([0, 0.5, 1]);
    drag({ x: 100, y: 50 }, { x: 150, y: 52 });
    expect(paint().gradientStops.map((s) => s.position)).toEqual([0, 0.75, 1]);
  });

  test('Escape, clicking away or selecting another layer ends editing; solid paints cannot be edited', () => {
    beginGradientEdit(editor, rect, 'fills', 0);
    expect(tools.cancel()).toBe(true);
    expect(editor.state.getSnapshot().gradientEdit).toBeNull();
    beginGradientEdit(editor, rect, 'fills', 0);
    tools.pointerDown(sample(500, 500));
    tools.pointerUp(sample(500, 500));
    expect(editor.state.getSnapshot().gradientEdit).toBeNull();
    beginGradientEdit(editor, rect, 'fills', 0);
    editor.state.clearSelection();
    expect(editor.state.getSnapshot().gradientEdit).toBeNull();
    expect(beginGradientEdit(editor, rect, 'strokes', 0)).toBe(false);
  });

  test('dragging the center of a radial gradient moves the whole gradient', () => {
    setup('GRADIENT_RADIAL');
    beginGradientEdit(editor, rect, 'fills', 0);
    drag({ x: 100, y: 50 }, { x: 120, y: 60 });
    const handles = gradientHandles(paint(), size);
    expect(handles.start.x).toBeCloseTo(120);
    expect(handles.end.x).toBeCloseTo(220);
    expect(handles.width.y).toBeCloseTo(110);
  });
});
