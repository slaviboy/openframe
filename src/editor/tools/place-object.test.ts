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
import type { SceneNode } from '@/core/schema/document';
import { BUILTIN_COMMANDS } from '../commands/builtin';
import { Editor } from '../editor';
import { ToolManager } from './tool-manager';

let editor: Editor;
let tools: ToolManager;

beforeEach(() => {
  const ids = new IdGenerator('k');
  editor = new Editor({ doc: createEmptyDocument({ name: 'D', now: 'n', appVersion: 't', ids }), ids, validate: true });
  editor.commands.register(...BUILTIN_COMMANDS);
  editor.setViewport({ x: 0, y: 0, zoom: 1 });
  editor.canvasSize = { width: 1000, height: 600 };
  editor.setCanvasInsets({ left: 200, right: 200, top: 0, bottom: 0 });
  tools = new ToolManager(editor);
});

describe('keyboard object placement', () => {
  test('Return places a 100×100 layer centered in the uncovered canvas and returns to Move', () => {
    expect(tools.canPlaceObject()).toBe(false);
    editor.state.setTool('ellipse');
    expect(tools.canPlaceObject()).toBe(true);
    const id = tools.placeObject()!;
    const node = editor.doc.getOrThrow(id) as SceneNode;
    expect(node).toMatchObject({ type: 'ELLIPSE', name: 'Ellipse 1', size: { width: 100, height: 100 } });
    // Visible area spans x 200–800, so its center is (500, 300).
    expect(node.transform.slice(4)).toEqual([450, 250]);
    expect(editor.selection).toEqual([id]);
    expect(editor.state.getSnapshot().tool).toBe('move');
    editor.history.undo();
    expect(editor.doc.has(id)).toBe(false);
  });

  test('placement goes inside a frame under the center', () => {
    const frame = editor.history.run('seed', (tx) => {
      const fid = editor.ids.next();
      tx.create(makeFrame({ id: fid, parent: { id: editor.pageId, key: keyOnTop(editor.doc, editor.pageId) }, name: 'F', x: 300, y: 100, width: 400, height: 400 }));
      return fid;
    });
    editor.state.setTool('rectangle');
    const id = tools.placeObject()!;
    expect(editor.doc.parentOf(id)).toBe(frame);
    expect((editor.doc.getOrThrow(id) as SceneNode).transform.slice(4)).toEqual([150, 150]);
  });
});
