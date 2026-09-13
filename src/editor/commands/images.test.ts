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
import { createEmptyDocument, keyOnTop, makeEllipse, makeFrame } from '@/core/document/factory';
import { IdGenerator } from '@/core/ids/ids';
import type { ImagePaint, RectangleNode, SceneNode } from '@/core/schema/document';
import { Editor } from '../editor';
import { ToolManager } from '../tools/tool-manager';
import type { PointerInfo } from '../tools/types';
import { placeImages, type PlaceableImage } from './images';

let editor: Editor;
const red: PlaceableImage = { hash: 'a'.repeat(64), width: 40, height: 20, name: 'red' };
const blue: PlaceableImage = { hash: 'b'.repeat(64), width: 60, height: 30, name: 'blue' };

const click = (x: number, y: number): PointerInfo => ({
  screen: { x, y },
  world: { x, y },
  button: 0,
  shift: false,
  alt: false,
  mod: false,
  ctrl: false,
  pointerType: 'mouse',
  pressure: 0.5,
  clickCount: 1,
});

beforeEach(() => {
  const ids = new IdGenerator('m');
  editor = new Editor({ doc: createEmptyDocument({ name: 'D', now: 'n', appVersion: 't', ids }), ids, validate: true });
});

describe('placing images', () => {
  test('images become rectangles at their pixel size, in a row centered on the point, in one undo step', () => {
    const ids = placeImages(editor, [red, blue], { x: 0, y: 0 });
    const [a, b] = ids.map((id) => editor.doc.getOrThrow(id) as RectangleNode);
    expect(a).toMatchObject({ name: 'red', size: { width: 40, height: 20 } });
    // Total width 40 + 20 + 60 = 120, so the row starts at -60.
    expect(a!.transform.slice(4)).toEqual([-60, -10]);
    expect(b!.transform.slice(4)).toEqual([0, -15]);
    expect((a!.fills[0] as ImagePaint).imageHash).toBe(red.hash);
    expect(editor.selection).toEqual(ids);
    editor.history.undo();
    expect(ids.some((id) => editor.doc.has(id))).toBe(false);
  });

  test('images land inside the frame under them', () => {
    const frame = editor.history.run('frame', (tx) => {
      const id = editor.ids.next();
      tx.create(makeFrame({ id, parent: { id: editor.pageId, key: keyOnTop(editor.doc, editor.pageId) }, name: 'F', x: 100, y: 100, width: 200, height: 200 }));
      return id;
    });
    const [id] = placeImages(editor, [red], { x: 200, y: 200 });
    expect(editor.doc.parentOf(id!)).toBe(frame);
    expect((editor.doc.getOrThrow(id!) as SceneNode).transform.slice(4)).toEqual([80, 90]);
  });

  test('the Place image tool fills a clicked shape, places on empty canvas, and returns to Move', () => {
    const tools = new ToolManager(editor);
    const ellipse = editor.history.run('ellipse', (tx) => {
      const id = editor.ids.next();
      tx.create(makeEllipse({ id, parent: { id: editor.pageId, key: keyOnTop(editor.doc, editor.pageId) }, name: 'E', x: 0, y: 0, width: 100, height: 100 }));
      return id;
    });
    tools.imageTool.load([red, blue]);
    editor.state.setTool('image');
    tools.tool.pointerDown(click(50, 50));
    const fills = (editor.doc.getOrThrow(ellipse) as Extract<SceneNode, { type: 'ELLIPSE' }>).fills;
    expect(fills).toHaveLength(1);
    expect(fills[0]).toMatchObject({ type: 'IMAGE', imageHash: red.hash });
    expect(tools.imageTool.pending).toEqual([blue]);
    expect(editor.state.getSnapshot().tool).toBe('image');

    tools.tool.pointerDown(click(500, 500));
    const placed = editor.doc.getOrThrow(editor.selection[0]!) as RectangleNode;
    expect(placed).toMatchObject({ name: 'blue', transform: [1, 0, 0, 1, 470, 485] });
    expect(editor.state.getSnapshot().tool).toBe('move');
  });

  test('switching away from Place image, or Escape, discards the waiting images', () => {
    const tools = new ToolManager(editor);
    tools.imageTool.load([red, blue]);
    editor.state.setTool('image');
    editor.state.setTool('rectangle');
    expect(tools.imageTool.pending).toEqual([]);
    tools.imageTool.load([red]);
    editor.state.setTool('image');
    expect(tools.tool.cancel()).toBe(true);
    expect(tools.imageTool.pending).toEqual([]);
    expect(editor.state.getSnapshot().tool).toBe('move');
  });
});
