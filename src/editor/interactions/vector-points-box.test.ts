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

const sample = (x: number, y: number, modifiers: { shift?: boolean; alt?: boolean } = {}): Omit<PointerInfo, 'world'> => ({
  screen: { x, y },
  button: 0,
  shift: modifiers.shift ?? false,
  alt: modifiers.alt ?? false,
  mod: false,
  ctrl: false,
  pointerType: 'mouse',
  pressure: 0.5,
  clickCount: 1,
});
const drag = (from: readonly [number, number], to: readonly [number, number], modifiers: { shift?: boolean; alt?: boolean } = {}) => {
  tools.pointerDown(sample(...from, modifiers));
  tools.pointerMove(sample(...to, modifiers));
  tools.pointerUp(sample(...to, modifiers));
};
const node = () => editor.doc.getOrThrow(id) as VectorNode;

beforeEach(() => {
  const ids = new IdGenerator('e');
  editor = new Editor({ doc: createEmptyDocument({ name: 'D', now: 'n', appVersion: 't', ids }), ids, validate: true });
  editor.commands.register(...BUILTIN_COMMANDS);
  editor.setViewport({ x: 0, y: 0, zoom: 1 });
  tools = new ToolManager(editor);
  // A closed square with corners at (100, 100) and (200, 200) on screen, all four points selected.
  id = editor.history.run('create', (tx) => {
    const vectorId = editor.ids.next();
    tx.create(
      makeVector(
        { id: vectorId, parent: { id: editor.pageId, key: keyOnTop(editor.doc, editor.pageId) }, name: 'Vector', x: 100, y: 100, width: 100, height: 100 },
        {
          vertices: [
            { x: 0, y: 0 },
            { x: 100, y: 0 },
            { x: 100, y: 100 },
            { x: 0, y: 100 },
          ],
          segments: [straightSegment(0, 1), straightSegment(1, 2), straightSegment(2, 3), straightSegment(3, 0)],
          regions: [{ loops: [[0, 1, 2, 3]], windingRule: 'NONZERO' }],
        },
      ),
    );
    return vectorId;
  });
  beginVectorEdit(editor, id);
  editor.state.setVectorEdit({ ...editor.state.getSnapshot().vectorEdit!, vertices: [0, 1, 2, 3] });
});

describe("the selected points' bounding box", () => {
  test('dragging its right edge resizes the points, as one undo step', () => {
    drag([200, 150], [300, 150]);
    expect(node().size).toEqual({ width: 200, height: 100 });
    expect(node().vectorNetwork.vertices[2]).toEqual({ x: 200, y: 100 });
    editor.history.undo();
    expect(node().size).toEqual({ width: 100, height: 100 });
  });

  test('Shift keeps proportions: an edge drag scales the other axis about the middle', () => {
    drag([200, 150], [300, 150], { shift: true });
    expect(node().size).toEqual({ width: 200, height: 200 });
    expect(node().transform[5]).toBe(50);
  });

  test('dragging from just outside a corner rotates the points about the middle of the box; Shift snaps to 15°', () => {
    // 8px up and right of the top-right corner: beyond the point and handle tolerance, inside the rotation zone.
    drag([208, 92], [208, 208]);
    expect(node().vectorNetwork.vertices[0]!.x).toBeCloseTo(100);
    expect(node().vectorNetwork.vertices[0]!.y).toBeCloseTo(0);
    expect(node().size.width).toBeCloseTo(100);
    editor.history.undo();
    // About 91° snaps to exactly 90°.
    drag([208, 92], [208, 210], { shift: true });
    expect(node().vectorNetwork.vertices[0]!.x).toBeCloseTo(100, 6);
    expect(node().vectorNetwork.vertices[0]!.y).toBeCloseTo(0, 6);
  });

  test('a selected point under the pointer still drags the points instead of the box', () => {
    drag([200, 100], [220, 100]);
    expect(node().size).toEqual({ width: 100, height: 100 });
    expect(node().transform[4]).toBe(120);
  });
});

describe('holding Space while dragging the box', () => {
  test('Space carries the points instead of resizing them, and letting go resizes again', () => {
    const before = node();
    // Press the right edge's handle and start a resize. The corners are points, so the edge is what grabs the box.
    tools.pointerDown(sample(200, 150));
    tools.pointerMove(sample(220, 150));
    expect(node().size.width).toBeGreaterThan(before.size.width);

    // With Space held the points keep their size and travel with the pointer.
    tools.setSpaceHeld(true);
    const carried = node().size;
    const at = node().transform[4];
    tools.pointerMove(sample(260, 150));
    expect(node().size).toEqual(carried);
    expect(node().transform[4]).toBeGreaterThan(at);

    // Letting Space go picks the resize up again from where the points now are.
    tools.setSpaceHeld(false);
    tools.pointerMove(sample(300, 150));
    expect(node().size.width).toBeGreaterThan(carried.width);
    tools.pointerUp(sample(300, 150));
  });
});
