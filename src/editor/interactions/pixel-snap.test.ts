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

import { afterEach, describe, expect, test } from 'vitest';
import { createEmptyDocument } from '@/core/document/factory';
import { IdGenerator } from '@/core/ids/ids';
import type { RectangleNode } from '@/core/schema/document';
import { BUILTIN_COMMANDS } from '../commands/builtin';
import { Editor } from '../editor';
import { ToolManager } from '../tools/tool-manager';
import type { PointerInfo } from '../tools/types';
import { roundTransform, setSnapToPixelGrid } from './transform';

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

afterEach(() => setSnapToPixelGrid(true));

describe('snap to pixel grid', () => {
  test('axis-aligned positions round to whole pixels only while snapping', () => {
    const m = { a: 1, b: 0, c: 0, d: 1, e: 10.4567, f: -3.52 };
    expect(roundTransform(m)).toMatchObject({ e: 10, f: -4 });
    setSnapToPixelGrid(false);
    expect(roundTransform(m)).toMatchObject({ e: 10.46, f: -3.52 });
    // Rotated layers always keep 0.01 precision.
    setSnapToPixelGrid(true);
    expect(roundTransform({ a: 0.8, b: 0.6, c: -0.6, d: 0.8, e: 1.234, f: 5.678 })).toMatchObject({ e: 1.23, f: 5.68 });
  });

  test('drawing lands on fractional positions at high zoom when snapping is off', () => {
    const ids = new IdGenerator('p');
    const editor = new Editor({ doc: createEmptyDocument({ name: 'D', now: 'n', appVersion: 't', ids }), ids, validate: true });
    editor.commands.register(...BUILTIN_COMMANDS);
    editor.setViewport({ x: 0, y: 0, zoom: 8 });
    const tools = new ToolManager(editor);
    const draw = (x0: number, y0: number, x1: number, y1: number) => {
      editor.state.setTool('rectangle');
      tools.pointerDown(sample(x0, y0));
      tools.pointerMove(sample((x0 + x1) / 2, (y0 + y1) / 2));
      tools.pointerUp(sample(x1, y1));
      return editor.doc.getOrThrow(editor.selection[0]!) as RectangleNode;
    };
    // Screen 84 / zoom 8 = world 10.5.
    expect(draw(84, 84, 164, 164).transform.slice(4)).toEqual([11, 11]);
    setSnapToPixelGrid(false);
    // Far from the first rectangle, so object snapping doesn't pull it to an edge. Screen 804 / 8 = 100.5.
    expect(draw(804, 804, 884, 884).transform.slice(4)).toEqual([100.5, 100.5]);
  });
});
