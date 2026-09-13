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
import { createEmptyDocument, keyOnTop, makeRectangle } from '@/core/document/factory';
import { IdGenerator } from '@/core/ids/ids';
import { Editor } from '../editor';
import { ToolManager } from './tool-manager';
import type { PointerInfo } from './types';

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

beforeEach(() => {
  const ids = new IdGenerator('l');
  editor = new Editor({ doc: createEmptyDocument({ name: 'D', now: 'n', appVersion: 't', ids }), ids, validate: true });
  editor.state.setViewport({ x: 0, y: 0, zoom: 1 });
  tools = new ToolManager(editor);
  rect = editor.history.run('seed', (tx) => {
    const id = editor.ids.next();
    tx.create(makeRectangle({ id, parent: { id: editor.pageId, key: keyOnTop(editor.doc, editor.pageId) }, name: 'R', x: 0, y: 0, width: 50, height: 50 }));
    return id;
  });
});

describe('picking a layer from the canvas', () => {
  test('a click resolves the layer under the pointer without changing the selection, then restores the tool', async () => {
    editor.state.setTool('frame');
    const request = editor.pickLayerFromCanvas!();
    expect(editor.state.getSnapshot().tool).toBe('pickLayer');
    tools.pointerMove(sample(20, 20));
    expect(editor.state.getSnapshot().hoverId).toBe(rect);
    // Empty canvas picks nothing and keeps waiting.
    tools.pointerDown(sample(300, 300));
    tools.pointerDown(sample(20, 20));
    await expect(request).resolves.toBe(rect);
    expect(editor.selection).toEqual([]);
    expect(editor.state.getSnapshot().tool).toBe('frame');
  });

  test('Escape or switching tools resolves null', async () => {
    const escaped = editor.pickLayerFromCanvas!();
    expect(tools.cancel()).toBe(true);
    await expect(escaped).resolves.toBeNull();
    const switched = editor.pickLayerFromCanvas!();
    editor.state.setTool('rectangle');
    await expect(switched).resolves.toBeNull();
  });
});
