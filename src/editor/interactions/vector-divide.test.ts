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
const layers = () => editor.doc.children(editor.pageId).map((child) => editor.doc.getOrThrow(child) as VectorNode);

beforeEach(() => {
  const ids = new IdGenerator('e');
  editor = new Editor({ doc: createEmptyDocument({ name: 'D', now: 'n', appVersion: 't', ids }), ids, validate: true });
  editor.commands.register(...BUILTIN_COMMANDS);
  editor.setViewport({ x: 0, y: 0, zoom: 1 });
  tools = new ToolManager(editor);
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
  editor.commands.run('vector.toolCut');
});

describe('dividing with the Cut tool', () => {
  test('dragging across the square divides it: the half with the first point stays, the other half becomes a layer above it', () => {
    tools.pointerDown(sample(150, 80));
    tools.pointerMove(sample(150, 150));
    expect(tools.vectorEdit.cutLine).toEqual([
      { x: 150, y: 80 },
      { x: 150, y: 150 },
    ]);
    tools.pointerMove(sample(150, 220));
    tools.pointerUp(sample(150, 220));
    expect(tools.vectorEdit.cutLine).toBeNull();

    const [kept, divided] = layers();
    expect(layers()).toHaveLength(2);
    expect(kept!.id).toBe(id);
    expect(kept!.size.width).toBeCloseTo(50);
    expect(kept!.transform[4]).toBeCloseTo(100);
    expect(divided).toMatchObject({ type: 'VECTOR', name: 'Vector' });
    expect(divided!.size.width).toBeCloseTo(50);
    expect(divided!.transform[4]).toBeCloseTo(150);
    expect(divided!.vectorNetwork.segments).toHaveLength(3);

    editor.history.undo();
    expect(layers()).toHaveLength(1);
    expect(layers()[0]!.size).toEqual({ width: 100, height: 100 });
  });

  test('a click without dragging still cuts at the point pressed', () => {
    tools.pointerDown(sample(200, 200));
    tools.pointerUp(sample(200, 200));
    expect(layers()).toHaveLength(1);
    expect(layers()[0]!.vectorNetwork.vertices).toHaveLength(5);
  });
});
