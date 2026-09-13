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
import { setBlurType, type BlurEffect } from '@/core/effects/effects';
import { createEmptyDocument, keyOnTop, makeRectangle } from '@/core/document/factory';
import { IdGenerator } from '@/core/ids/ids';
import type { RectangleNode } from '@/core/schema/document';
import { Editor } from '../editor';
import { ToolManager } from '../tools/tool-manager';
import type { PointerInfo } from '../tools/types';
import { beginBlurEdit, blurEditChrome } from './blur-edit';

let editor: Editor;
let tools: ToolManager;
let rect: string;

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
const blur = () => (editor.doc.getOrThrow(rect) as RectangleNode).effects![0] as BlurEffect;

beforeEach(() => {
  const ids = new IdGenerator('b');
  editor = new Editor({ doc: createEmptyDocument({ name: 'D', now: 'n', appVersion: 't', ids }), ids, validate: true });
  editor.state.setViewport({ x: 0, y: 0, zoom: 1 });
  tools = new ToolManager(editor);
  rect = editor.history.run('seed', (tx) => {
    const id = editor.ids.next();
    const r = makeRectangle({ id, parent: { id: editor.pageId, key: keyOnTop(editor.doc, editor.pageId) }, name: 'R', x: 0, y: 0, width: 200, height: 100 });
    tx.create({ ...r, effects: [setBlurType({ type: 'LAYER_BLUR', radius: 10, visible: true }, 'PROGRESSIVE'), { type: 'BACKGROUND_BLUR', radius: 4, visible: true }] });
    return id;
  });
});

describe('on-canvas progressive blur handles', () => {
  test('dragging the end handle moves where the blur reaches full strength, clamped to the layer, in one undo step', () => {
    expect(beginBlurEdit(editor, rect, 0)).toBe(true);
    expect(blurEditChrome(editor)).toEqual({ start: { x: 100, y: 0 }, end: { x: 100, y: 100 } });
    tools.pointerDown(sample(100, 100));
    tools.pointerMove(sample(150, 70));
    tools.pointerMove(sample(400, 50));
    tools.pointerUp(sample(400, 50));
    expect(blur().endOffset).toEqual({ x: 1, y: 0.5 });
    expect(blur().startOffset).toEqual({ x: 0.5, y: 0 });
    editor.history.undo();
    expect(blur().endOffset).toEqual({ x: 0.5, y: 1 });
  });

  test('uniform blurs cannot be edited; Escape or clicking away ends editing', () => {
    expect(beginBlurEdit(editor, rect, 1)).toBe(false);
    beginBlurEdit(editor, rect, 0);
    expect(tools.cancel()).toBe(true);
    expect(editor.state.getSnapshot().blurEdit).toBeNull();
    beginBlurEdit(editor, rect, 0);
    tools.pointerDown(sample(20, 50));
    tools.pointerUp(sample(20, 50));
    expect(editor.state.getSnapshot().blurEdit).toBeNull();
  });
});
