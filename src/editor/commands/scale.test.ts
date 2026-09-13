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
import { BLACK, createEmptyDocument, keyOnTop, makeFrame, makeRectangle, solid } from '@/core/document/factory';
import { IdGenerator } from '@/core/ids/ids';
import type { Node, RectangleNode, SceneNode } from '@/core/schema/document';
import { Editor } from '../editor';
import { ToolManager } from '../tools/tool-manager';
import type { PointerInfo } from '../tools/types';
import { BUILTIN_COMMANDS } from './builtin';
import { scaleSelection } from './scale';

let editor: Editor;
let frame: string;
let child: string;

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
const get = <T extends SceneNode>(id: string) => editor.doc.getOrThrow(id) as T;

beforeEach(() => {
  const ids = new IdGenerator('s');
  editor = new Editor({ doc: createEmptyDocument({ name: 'D', now: 'n', appVersion: 't', ids }), ids, validate: true });
  editor.commands.register(...BUILTIN_COMMANDS);
  editor.setViewport({ x: 0, y: 0, zoom: 1 });
  frame = editor.history.run('seed', (tx) => {
    const id = editor.ids.next();
    tx.create(makeFrame({ id, parent: { id: editor.pageId, key: keyOnTop(editor.doc, editor.pageId) }, name: 'F', x: 100, y: 100, width: 100, height: 100 }));
    return id;
  });
  child = editor.history.run('seed', (tx) => {
    const id = editor.ids.next();
    const rect = makeRectangle({ id, parent: { id: frame, key: keyOnTop(editor.doc, frame) }, name: 'R', x: 10, y: 20, width: 20, height: 10 });
    tx.create({ ...rect, cornerRadius: 4, strokes: [solid(BLACK)], strokeWeight: 2 } as Node);
    return id;
  });
});

describe('scale', () => {
  test('scaling from the top left doubles the layer and everything inside it, in one undo step', () => {
    editor.state.select([frame]);
    scaleSelection(editor, 2, 'nw');
    expect(get(frame).transform.slice(4)).toEqual([100, 100]);
    expect(get(frame).size).toEqual({ width: 200, height: 200 });
    const rect = get<RectangleNode>(child);
    expect(rect.transform.slice(4)).toEqual([20, 40]);
    expect(rect.size).toEqual({ width: 40, height: 20 });
    expect(rect.strokeWeight).toBe(4);
    expect(rect.cornerRadius).toBe(8);
    editor.history.undo();
    expect(get(frame).size).toEqual({ width: 100, height: 100 });
    expect(get<RectangleNode>(child).strokeWeight).toBe(2);
  });

  test('the anchor stays fixed: center and bottom right', () => {
    editor.state.select([frame]);
    scaleSelection(editor, 0.5, 'c');
    expect(get(frame).transform.slice(4)).toEqual([125, 125]);
    editor.history.undo();
    scaleSelection(editor, 2, 'se');
    expect(get(frame).transform.slice(4)).toEqual([0, 0]);
  });

  test('the Scale tool (K) scales proportionally from the opposite corner while dragging a handle', () => {
    const tools = new ToolManager(editor);
    editor.commands.run('tools.scale');
    expect(editor.state.getSnapshot().tool).toBe('scale');
    editor.state.select([frame]);
    tools.pointerDown(sample(200, 200));
    tools.pointerMove(sample(250, 210));
    tools.pointerMove(sample(300, 220));
    tools.pointerUp(sample(300, 220));
    expect(get(frame).size).toEqual({ width: 200, height: 200 });
    expect(get(frame).transform.slice(4)).toEqual([100, 100]);
    expect(get<RectangleNode>(child).size).toEqual({ width: 40, height: 20 });
  });

  test('effects scale with the layer: shadow offset, blur and spread, and blur radii', () => {
    editor.history.run('effects', (tx) =>
      tx.set(child, 'effects', [
        { type: 'DROP_SHADOW', color: { r: 0, g: 0, b: 0, a: 0.25 }, offset: { x: 2, y: 4 }, radius: 6, spread: 1, visible: true, blendMode: 'NORMAL', showShadowBehindNode: false },
        { type: 'LAYER_BLUR', radius: 3, visible: true },
      ]),
    );
    editor.state.select([frame]);
    scaleSelection(editor, 2, 'nw');
    expect(get<RectangleNode>(child).effects).toEqual([
      { type: 'DROP_SHADOW', color: { r: 0, g: 0, b: 0, a: 0.25 }, offset: { x: 4, y: 8 }, radius: 12, spread: 2, visible: true, blendMode: 'NORMAL', showShadowBehindNode: false },
      { type: 'LAYER_BLUR', radius: 6, visible: true },
    ]);
  });
});
