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
import type { PathCommand } from '@/core/geometry/corners';
import { IdGenerator } from '@/core/ids/ids';
import type { Vec2 } from '@/core/math/vec';
import type { VectorNode } from '@/core/schema/document';
import { straightSegment } from '@/core/vector/vector-network';
import { BUILTIN_COMMANDS } from '../commands/builtin';
import { Editor } from '../editor';
import { ToolManager } from '../tools/tool-manager';
import type { PointerInfo } from '../tools/types';
import { beginVectorEdit } from './vector-edit';

let editor: Editor;
let tools: ToolManager;
let id: string;
/** What the fake engine was last asked to erase. */
let lastCall: { path: Vec2[]; weight: number } | null;
/** What the fake engine leaves of the region: null when the eraser misses it. */
let rest: PathCommand[] | null;

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
const node = () => editor.doc.getOrThrow(id) as VectorNode;
const editState = () => editor.state.getSnapshot().vectorEdit;

beforeEach(() => {
  const ids = new IdGenerator('e');
  editor = new Editor({ doc: createEmptyDocument({ name: 'D', now: 'n', appVersion: 't', ids }), ids, validate: true });
  editor.commands.register(...BUILTIN_COMMANDS);
  editor.setViewport({ x: 0, y: 0, zoom: 1 });
  tools = new ToolManager(editor);
  lastCall = null;
  // The square's area minus a 20-wide band down its right-hand edge.
  rest = [{ op: 'M', x: 0, y: 0 }, { op: 'L', x: 90, y: 0 }, { op: 'L', x: 90, y: 100 }, { op: 'L', x: 0, y: 100 }, { op: 'Z' }];
  editor.setGeometry({
    strokeOutline: () => null,
    regionMinusStroke: (_network, _region, path, weight) => {
      lastCall = { path: [...path], weight };
      return rest;
    },
  });
  // A closed square with corners at (100, 100) and (200, 200) on screen.
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
  editor.commands.run('vector.toolEraser');
});

describe('eraser in vector edit mode', () => {
  test('⇧E picks the Eraser; a drag erases along its whole path in the layer space with its weight, as one undo step', () => {
    expect(editState()?.tool).toBe('eraser');
    editor.state.setVectorEdit({ ...editState()!, eraserWeight: 20 });
    tools.pointerDown(sample(200, 80));
    tools.pointerMove(sample(200, 150));
    expect(tools.vectorEdit.eraserTrail).toEqual({
      points: [
        { x: 200, y: 80 },
        { x: 200, y: 150 },
      ],
      width: 20,
    });
    tools.pointerMove(sample(200, 220));
    tools.pointerUp(sample(200, 220));
    expect(lastCall).toEqual({
      path: [
        { x: 100, y: -20 },
        { x: 100, y: 50 },
        { x: 100, y: 120 },
      ],
      weight: 20,
    });
    expect(node().size).toEqual({ width: 90, height: 100 });
    expect(tools.vectorEdit.eraserTrail).toBeNull();
    editor.history.undo();
    expect(node().size).toEqual({ width: 100, height: 100 });
  });

  test('a drag that erases nothing leaves the layer as it was', () => {
    rest = null;
    const before = node().vectorNetwork;
    tools.pointerDown(sample(300, 300));
    tools.pointerMove(sample(320, 320));
    tools.pointerUp(sample(320, 320));
    expect(node().vectorNetwork).toBe(before);
  });

  test('without the engine the Eraser does nothing', () => {
    editor.setGeometry(null);
    const before = node().vectorNetwork;
    tools.pointerDown(sample(200, 80));
    tools.pointerMove(sample(200, 220));
    tools.pointerUp(sample(200, 220));
    expect(node().vectorNetwork).toBe(before);
    expect(lastCall).toBeNull();
  });
});
