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
import { createEmptyDocument, keyOnTop, makeLine, makeRectangle, solid } from '@/core/document/factory';
import { IdGenerator } from '@/core/ids/ids';
import type { LineNode, RectangleNode } from '@/core/schema/document';
import { Editor } from '../editor';
import { ToolManager } from './tool-manager';
import type { PointerInfo } from './types';

const RED = { r: 1, g: 0, b: 0, a: 1 };
const GRAY = { r: 0.5, g: 0.5, b: 0.5, a: 1 };
let editor: Editor;
let tools: ToolManager;
let rect: string;
let empty: string;
let line: string;

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
const get = <T,>(id: string) => editor.doc.getOrThrow(id) as T;

beforeEach(() => {
  const ids = new IdGenerator('y');
  editor = new Editor({ doc: createEmptyDocument({ name: 'D', now: 'n', appVersion: 't', ids }), ids, validate: true });
  editor.state.setViewport({ x: 0, y: 0, zoom: 1 });
  tools = new ToolManager(editor);
  editor.sampleCanvasPixel = () => RED;
  [rect, empty, line] = editor.history.run('seed', (tx) => {
    const parent = () => ({ id: editor.pageId, key: keyOnTop(editor.doc, editor.pageId) });
    const r = editor.ids.next();
    tx.create({ ...makeRectangle({ id: r, parent: parent(), name: 'R', x: 0, y: 0, width: 10, height: 10 }), fills: [solid(GRAY), { ...solid(GRAY), visible: false }] });
    const e = editor.ids.next();
    tx.create({ ...makeRectangle({ id: e, parent: parent(), name: 'E', x: 20, y: 0, width: 10, height: 10 }), fills: [] });
    const l = editor.ids.next();
    tx.create(makeLine({ id: l, parent: parent(), name: 'L', x: 0, y: 40, width: 30, height: 0 }));
    return [r, e, l] as const;
  });
});

describe('eyedropper', () => {
  test('clicking applies the sampled color to the selection in one undo step, then returns to Move', () => {
    editor.state.select([rect, empty, line]);
    editor.state.setTool('eyedropper');
    tools.pointerMove(sample(300, 300));
    expect(tools.eyedropperSample?.color).toEqual(RED);
    tools.pointerDown(sample(300, 300));
    tools.pointerUp(sample(300, 300));
    // The top visible solid fill takes the color; hidden fills are skipped.
    expect(get<RectangleNode>(rect).fills[0]).toEqual(solid(RED));
    expect(get<RectangleNode>(rect).fills[1]!.visible).toBe(false);
    expect(get<RectangleNode>(empty).fills).toEqual([solid(RED)]);
    expect(get<LineNode>(line).strokes.at(-1)).toMatchObject({ type: 'SOLID', color: RED });
    expect(editor.state.getSnapshot().tool).toBe('move');
    expect(tools.eyedropperSample).toBeNull();
    editor.history.undo();
    expect(get<RectangleNode>(rect).fills[0]).toEqual(solid(GRAY));
  });

  test('a color request resolves with the clicked color and restores the previous tool without editing layers', async () => {
    editor.state.select([rect]);
    editor.state.setTool('rectangle');
    const request = editor.pickColorFromCanvas!();
    expect(editor.state.getSnapshot().tool).toBe('eyedropper');
    tools.pointerDown(sample(5, 5));
    await expect(request).resolves.toEqual(RED);
    expect(editor.state.getSnapshot().tool).toBe('rectangle');
    expect(get<RectangleNode>(rect).fills[0]).toEqual(solid(GRAY));
  });

  test('Escape or switching tools cancels a request; nothing sampled means nothing applied', async () => {
    const canceled = editor.pickColorFromCanvas!();
    expect(tools.cancel()).toBe(true);
    await expect(canceled).resolves.toBeNull();
    expect(editor.state.getSnapshot().tool).toBe('move');
    const switched = editor.pickColorFromCanvas!();
    editor.state.setTool('frame');
    await expect(switched).resolves.toBeNull();
    editor.sampleCanvasPixel = () => null;
    editor.state.select([rect]);
    editor.state.setTool('eyedropper');
    tools.pointerDown(sample(5, 5));
    expect(get<RectangleNode>(rect).fills[0]).toEqual(solid(GRAY));
  });
});
