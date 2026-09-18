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
import { createEmptyDocument, keyOnTop, makeFrame } from '@/core/document/factory';
import { IdGenerator } from '@/core/ids/ids';
import { BUILTIN_COMMANDS } from '../commands/builtin';
import { Editor } from '../editor';
import { ToolManager } from './tool-manager';
import type { PointerInfo } from './types';

let editor: Editor;
let tools: ToolManager;
let frame: string;

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
const drag = (from: readonly [number, number], to: readonly [number, number]) => {
  tools.pointerDown(sample(...from));
  tools.pointerMove(sample(...to));
  tools.pointerUp(sample(...to));
};
const drawn = () => editor.doc.children(editor.pageId).filter((id) => id !== frame);

beforeEach(() => {
  const ids = new IdGenerator('a');
  editor = new Editor({ doc: createEmptyDocument({ name: 'D', now: 'n', appVersion: 't', ids }), ids, validate: true });
  editor.commands.register(...BUILTIN_COMMANDS);
  editor.setViewport({ x: 0, y: 0, zoom: 1 });
  tools = new ToolManager(editor);
  // A frame covering 100,100 to 400,400 on screen.
  frame = editor.history.run('frame', (tx) => {
    const id = editor.ids.next();
    tx.create(makeFrame({ id, parent: { id: editor.pageId, key: keyOnTop(editor.doc, editor.pageId) }, name: 'Frame', x: 100, y: 100, width: 300, height: 300 }));
    return id;
  });
});

describe('auto-parenting, and Space to prevent it', () => {
  test('a shape drawn inside a frame becomes its child', () => {
    editor.state.setTool('rectangle');
    drag([150, 150], [250, 250]);
    expect(drawn()).toHaveLength(0);
    expect(editor.doc.children(frame)).toHaveLength(1);
  });

  test('Space held while drawing keeps the shape out of the frame', () => {
    editor.state.setTool('rectangle');
    tools.setSpaceHeld(true);
    drag([150, 150], [250, 250]);
    tools.setSpaceHeld(false);
    expect(editor.doc.children(frame)).toHaveLength(0);
    expect(drawn()).toHaveLength(1);
  });

  test('a layer dragged over a frame is taken into it, unless Space is held', () => {
    editor.state.setTool('rectangle');
    drag([500, 500], [560, 560]);
    const rect = drawn()[0]!;
    editor.state.setTool('move');
    editor.state.select([rect]);

    // Dragged onto the frame, it becomes the frame's child.
    drag([530, 530], [250, 250]);
    expect(editor.doc.parentOf(rect)).toBe(frame);

    // Dragged back out, then in again with Space held: it stays where it belongs.
    drag([250, 250], [530, 530]);
    expect(editor.doc.parentOf(rect)).toBe(editor.pageId);
    tools.setSpaceHeld(true);
    drag([530, 530], [250, 250]);
    tools.setSpaceHeld(false);
    expect(editor.doc.parentOf(rect)).toBe(editor.pageId);
  });
});
