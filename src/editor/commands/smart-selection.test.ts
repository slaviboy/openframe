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
import type { SceneNode } from '@/core/schema/document';
import { Editor } from '../editor';
import { ToolManager } from '../tools/tool-manager';
import type { PointerInfo } from '../tools/types';
import { BUILTIN_COMMANDS } from './builtin';
import { setSpacingInTx, smartSelectionInfo } from './smart-selection';

let editor: Editor;
let ids: string[];

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
const xs = () => ids.map((id) => (editor.doc.getOrThrow(id) as SceneNode).transform[4]);

beforeEach(() => {
  const gen = new IdGenerator('q');
  editor = new Editor({ doc: createEmptyDocument({ name: 'D', now: 'n', appVersion: 't', ids: gen }), ids: gen, validate: true });
  editor.commands.register(...BUILTIN_COMMANDS);
  editor.setViewport({ x: 0, y: 0, zoom: 1 });
  // A row with 20 px gaps: 0–50, 70–100, 120–160.
  ids = [
    [0, 0, 50, 50],
    [70, 10, 30, 30],
    [120, 0, 40, 60],
  ].map(([x, y, w, h]) =>
    editor.history.run('seed', (tx) => {
      const id = editor.ids.next();
      tx.create(makeRectangle({ id, parent: { id: editor.pageId, key: keyOnTop(editor.doc, editor.pageId) }, name: 'R', x: x!, y: y!, width: w!, height: h! }));
      return id;
    }),
  );
});

describe('smart selection', () => {
  test('an evenly spaced multi-selection exposes its gap; setting it respaces in one undo step', () => {
    editor.state.select([ids[0]!]);
    expect(smartSelectionInfo(editor)).toBeNull();
    editor.state.select(ids);
    expect(smartSelectionInfo(editor)?.selection).toMatchObject({ axis: 'x', gap: 20 });
    editor.history.run('Change spacing', (tx) => setSpacingInTx(tx, editor, 5));
    expect(xs()).toEqual([0, 55, 90]);
    editor.history.undo();
    expect(xs()).toEqual([0, 70, 120]);
  });

  test('dragging a spacing handle changes every gap by the drag distance', () => {
    const tools = new ToolManager(editor);
    editor.state.select(ids);
    // The first handle is the middle of the 50–70 gap, centered on the overlap (y 10–40).
    tools.pointerDown(sample(60, 25));
    tools.pointerMove(sample(65, 25));
    tools.pointerMove(sample(70, 25));
    tools.pointerUp(sample(70, 25));
    expect(xs()).toEqual([0, 80, 140]);
    expect(editor.selection).toEqual(ids);
    editor.history.undo();
    expect(xs()).toEqual([0, 70, 120]);
  });
});
