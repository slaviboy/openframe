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
import { createEmptyDocument } from '@/core/document/factory';
import { IdGenerator } from '@/core/ids/ids';
import type { VectorNode } from '@/core/schema/document';
import { BUILTIN_COMMANDS } from '../commands/builtin';
import { Editor } from '../editor';
import { ToolManager } from './tool-manager';
import type { PointerInfo } from './types';

let editor: Editor;
let tools: ToolManager;

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
const click = (x: number, y: number) => {
  tools.pointerDown(sample(x, y));
  tools.pointerUp(sample(x, y));
};
const vectors = () =>
  editor.doc
    .children(editor.pageId)
    .map((id) => editor.doc.getOrThrow(id))
    .filter((n): n is VectorNode => n.type === 'VECTOR');

beforeEach(() => {
  const ids = new IdGenerator('p');
  editor = new Editor({ doc: createEmptyDocument({ name: 'D', now: 'n', appVersion: 't', ids }), ids, validate: true });
  editor.commands.register(...BUILTIN_COMMANDS);
  editor.setViewport({ x: 0, y: 0, zoom: 1 });
  tools = new ToolManager(editor);
});

describe('pen tool', () => {
  test('clicks add points; clicking the first point closes the shape into one undoable vector layer', () => {
    expect(editor.commands.get('tools.pen')?.shortcuts).toEqual(['P']);
    editor.state.setTool('pen');
    click(100, 100);
    click(200, 100);
    click(200, 200);
    click(100, 100);
    const [vector] = vectors();
    expect(vectors()).toHaveLength(1);
    expect(vector!.transform.slice(4)).toEqual([100, 100]);
    expect(vector!.size).toEqual({ width: 100, height: 100 });
    expect(vector!.vectorNetwork.vertices).toEqual([
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 100 },
    ]);
    expect(vector!.vectorNetwork.regions).toHaveLength(1);
    expect(tools.tool.active).toBe(false);
    expect(editor.selection).toEqual([vector!.id]);
    editor.history.undo();
    expect(vectors()).toHaveLength(0);
  });

  test('dragging while placing pulls out a handle; Escape finishes an open path; a lone point is discarded', () => {
    editor.state.setTool('pen');
    click(100, 100);
    tools.pointerDown(sample(200, 100));
    tools.pointerMove(sample(210, 120));
    tools.pointerUp(sample(210, 120));
    expect(tools.cancel()).toBe(true);
    const [vector] = vectors();
    expect(vector!.vectorNetwork.segments[0]!.tangentEnd).toEqual({ x: -10, y: -20 });
    expect(vector!.vectorNetwork.regions).toEqual([]);
    click(400, 400);
    expect(tools.cancel()).toBe(true);
    expect(vectors()).toHaveLength(1);
    expect(editor.state.getSnapshot().tool).toBe('pen');
  });
});

describe('pencil tool', () => {
  test('dragging sketches a smoothed vector with a round 3 px stroke; Shift draws a straight line', () => {
    expect(editor.commands.get('tools.pencil')?.shortcuts).toEqual(['Shift+P']);
    editor.state.setTool('pencil');
    tools.pointerDown(sample(100, 100));
    for (const [x, y] of [
      [120, 110],
      [140, 130],
      [160, 120],
    ] as const)
      tools.pointerMove(sample(x, y));
    tools.pointerUp(sample(180, 100));
    const [sketch] = vectors();
    expect(sketch).toMatchObject({ strokeWeight: 3, endpointCap: 'ROUND' });
    expect(sketch!.vectorNetwork.segments.length).toBeGreaterThan(1);

    const shift = { shift: true };
    tools.pointerDown(sample(100, 300, shift));
    tools.pointerMove(sample(130, 320, shift));
    tools.pointerMove(sample(150, 300, shift));
    tools.pointerUp(sample(200, 350, shift));
    const straight = vectors()[1]!;
    expect(straight.vectorNetwork.vertices).toHaveLength(2);
    expect(straight.size).toEqual({ width: 100, height: 50 });
    expect(editor.state.getSnapshot().tool).toBe('pencil');
  });
});
