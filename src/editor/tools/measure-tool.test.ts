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
import { createEmptyDocument, keyOnTop, makeFrame, makeRectangle } from '@/core/document/factory';
import { IdGenerator } from '@/core/ids/ids';
import type { Node } from '@/core/schema/document';
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

function add(make: (i: { id: string; parent: { id: string; key: string }; name: string; x: number; y: number; width: number; height: number }) => Node, x: number, y: number, w: number, h: number, parent = editor.pageId): string {
  return editor.history.run('seed', (tx) => {
    const id = editor.ids.next();
    tx.create(make({ id, parent: { id: parent, key: keyOnTop(editor.doc, parent) }, name: 'L', x, y, width: w, height: h }));
    return id;
  });
}

beforeEach(() => {
  const ids = new IdGenerator('m');
  editor = new Editor({ doc: createEmptyDocument({ name: 'D', now: 'n', appVersion: 't', ids }), ids, validate: true });
  editor.commands.register(...BUILTIN_COMMANDS);
  editor.setViewport({ x: 0, y: 0, zoom: 1 });
  tools = new ToolManager(editor);
});

describe('equal spacing while moving', () => {
  test('a layer dragged near the middle of two neighbors snaps to equal gaps and shows both', () => {
    add(makeRectangle, 0, 0, 50, 50);
    const middle = add(makeRectangle, 98, 0, 50, 50);
    add(makeRectangle, 200, 0, 50, 50);
    tools.pointerDown(sample(120, 25));
    tools.pointerMove(sample(123, 25));
    expect(tools.moveTool.gapIndicators.map((g) => g.distance)).toEqual([50, 50]);
    tools.pointerUp(sample(123, 25));
    expect((editor.doc.getOrThrow(middle) as { transform: number[] }).transform.slice(4)).toEqual([100, 0]);
    expect(tools.moveTool.gapIndicators).toEqual([]);
  });

  test('Control disables equal-gap snapping', () => {
    add(makeRectangle, 0, 0, 50, 50);
    const middle = add(makeRectangle, 98, 0, 50, 50);
    add(makeRectangle, 200, 0, 50, 50);
    tools.pointerDown(sample(120, 25, { ctrl: true }));
    tools.pointerMove(sample(123, 25, { ctrl: true }));
    expect(tools.moveTool.gapIndicators).toEqual([]);
    tools.pointerUp(sample(123, 25, { ctrl: true }));
    expect((editor.doc.getOrThrow(middle) as { transform: number[] }).transform.slice(4)).toEqual([101, 0]);
  });
});

describe('⌥ measurements', () => {
  test('hovering another layer with ⌥ measures the gap; releasing ⌥ hides it', () => {
    const a = add(makeRectangle, 0, 0, 50, 50);
    add(makeRectangle, 90, 0, 50, 50);
    editor.state.select([a]);
    tools.pointerMove(sample(110, 20));
    expect(tools.moveTool.measurements).toEqual([]);
    tools.modifiersChanged({ alt: true, shift: false, mod: false, ctrl: false });
    expect(tools.moveTool.measurements.map((l) => l.distance)).toEqual([40]);
    tools.modifiersChanged({ alt: false, shift: false, mod: false, ctrl: false });
    expect(tools.moveTool.measurements).toEqual([]);
  });

  test('without another layer under the pointer, distances go to the parent frame edges', () => {
    const frame = add(makeFrame, 0, 0, 200, 100);
    const child = add(makeRectangle, 20, 30, 50, 40, frame);
    editor.state.select([child]);
    tools.pointerMove(sample(45, 50, { alt: true }));
    expect(tools.moveTool.measurements.map((l) => [l.axis, l.distance])).toEqual([
      ['x', 20],
      ['x', 130],
      ['y', 30],
      ['y', 30],
    ]);
  });

  test('nothing is measured without a selection', () => {
    add(makeRectangle, 0, 0, 50, 50);
    tools.pointerMove(sample(20, 20, { alt: true }));
    expect(tools.moveTool.measurements).toEqual([]);
  });
});
