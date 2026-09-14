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
import { createEmptyDocument, keyOnTop, makeVector } from '@/core/document/factory';
import { IdGenerator } from '@/core/ids/ids';
import type { VectorNode } from '@/core/schema/document';
import { straightSegment } from '@/core/vector/vector-network';
import { BUILTIN_COMMANDS } from '../commands/builtin';
import { Editor } from '../editor';
import { ToolManager } from '../tools/tool-manager';
import type { PointerInfo } from '../tools/types';
import { beginVectorEdit } from './vector-edit';
import { selectedHandles } from './vector-handles';

let editor: Editor;
let tools: ToolManager;
let id: string;

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
const network = () => (editor.doc.getOrThrow(id) as VectorNode).vectorNetwork;
const editState = () => editor.state.getSnapshot().vectorEdit;

beforeEach(() => {
  const ids = new IdGenerator('e');
  editor = new Editor({ doc: createEmptyDocument({ name: 'D', now: 'n', appVersion: 't', ids }), ids, validate: true });
  editor.commands.register(...BUILTIN_COMMANDS);
  editor.setViewport({ x: 0, y: 0, zoom: 1 });
  tools = new ToolManager(editor);
  // A square with corners at (100, 100), (200, 100), (200, 200) and (100, 200) on screen.
  id = editor.history.run('create', (tx) => {
    const vectorId = editor.ids.next();
    tx.create(
      makeVector({ id: vectorId, parent: { id: editor.pageId, key: keyOnTop(editor.doc, editor.pageId) }, name: 'Vector', x: 100, y: 100, width: 100, height: 100 }, {
        vertices: [
          { x: 0, y: 0 },
          { x: 100, y: 0 },
          { x: 100, y: 100 },
          { x: 0, y: 100 },
        ],
        segments: [straightSegment(0, 1), straightSegment(1, 2), straightSegment(2, 3), straightSegment(3, 0)],
        regions: [{ loops: [[0, 1, 2, 3]], windingRule: 'NONZERO' }],
      }),
    );
    return vectorId;
  });
  beginVectorEdit(editor, id);
});

describe('bend tool and handles in vector edit mode', () => {
  test('Bend: dragging out of a corner gives it mirrored handles and selects it, as one undo step', () => {
    editor.commands.run('vector.toolBend');
    expect(editState()?.tool).toBe('bend');
    drag([200, 100], [220, 80]);
    expect(network().segments[1]!.tangentStart).toEqual({ x: 20, y: -20 });
    expect(network().segments[0]!.tangentEnd).toEqual({ x: -20, y: 20 });
    expect(editState()?.vertices).toEqual([1]);
    expect(selectedHandles(editor).map((h) => h.screen)).toEqual([
      { x: 180, y: 120 },
      { x: 220, y: 80 },
    ]);
    editor.history.undo();
    expect(network().segments[1]!.tangentStart).toEqual({ x: 0, y: 0 });
  });

  test('Bend on a path adds a point there and bends it', () => {
    editor.commands.run('vector.toolBend');
    drag([150, 100], [150, 70]);
    expect(network().vertices).toHaveLength(5);
    expect(network().segments[4]!.tangentStart).toEqual({ x: 0, y: -30 });
    expect(network().segments[0]!.tangentEnd).toEqual({ x: 0, y: 30 });
    expect(editState()?.vertices).toEqual([4]);
  });

  test('the Move tool drags a handle of a selected point, and a mirrored handle follows', () => {
    editor.commands.run('vector.toolBend');
    drag([200, 100], [220, 100]);
    editor.commands.run('vector.toolMove');
    drag([220, 100], [240, 120]);
    expect(network().segments[1]!.tangentStart).toEqual({ x: 40, y: 20 });
    expect(network().segments[0]!.tangentEnd).toEqual({ x: -40, y: -20 });
    // The point itself didn't move.
    expect(editState()?.vertices).toEqual([1]);
  });

  test('Shift-clicking handles selects them, and dragging one moves every selected handle the same way', () => {
    editor.commands.run('vector.toolBend');
    drag([200, 100], [220, 100]);
    editor.commands.run('vector.toolMove');
    // Handles at (180, 100) and (220, 100).
    tools.pointerDown({ ...sample(180, 100), shift: true });
    tools.pointerUp({ ...sample(180, 100), shift: true });
    tools.pointerDown({ ...sample(220, 100), shift: true });
    tools.pointerUp({ ...sample(220, 100), shift: true });
    expect(editState()?.selectedHandles).toEqual([
      { segment: 0, side: 'end' },
      { segment: 1, side: 'start' },
    ]);
    drag([220, 100], [220, 120]);
    expect(network().segments[0]!.tangentEnd).toEqual({ x: -20, y: 20 });
    expect(network().segments[1]!.tangentStart).toEqual({ x: 20, y: 20 });
  });
});
