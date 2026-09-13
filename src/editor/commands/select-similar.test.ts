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
import { BLACK, createEmptyDocument, keyOnTop, makeEllipse, makeFrame, makeGroup, makeRectangle, makeSection, solid } from '@/core/document/factory';
import { IdGenerator } from '@/core/ids/ids';
import { layersAt } from '@/core/scene/hit-test';
import type { Node } from '@/core/schema/document';
import { Editor } from '../editor';
import { BUILTIN_COMMANDS } from './builtin';
import { layersWithSame, matchingLayers } from './select-similar';

let editor: Editor;

type Init = { id: string; parent: { id: string; key: string }; name: string; x: number; y: number; width: number; height: number };
function add(make: (init: Init) => Node, name: string, x: number, y: number, w: number, h: number, parent = editor.pageId, patch: Partial<Node> = {}): string {
  return editor.history.run('seed', (tx) => {
    const id = editor.ids.next();
    tx.create({ ...make({ id, parent: { id: parent, key: keyOnTop(editor.doc, parent) }, name, x, y, width: w, height: h }), ...patch } as Node);
    return id;
  });
}

beforeEach(() => {
  const ids = new IdGenerator('m');
  const doc = createEmptyDocument({ name: 'D', now: 'n', appVersion: 't', ids });
  editor = new Editor({ doc, ids, validate: true });
  editor.commands.register(...BUILTIN_COMMANDS);
});

describe('select layer menu', () => {
  test('lists every layer under the point in layers-panel order, excluding clipped content', () => {
    const frame = add(makeFrame, 'Card', 0, 0, 200, 200);
    const back = add(makeRectangle, 'Back', 10, 10, 100, 100, frame);
    const front = add(makeEllipse, 'Front', 20, 20, 100, 100, frame);
    const outside = add(makeRectangle, 'Overflow', 150, 150, 100, 100, frame);
    const other = add(makeRectangle, 'Other', 50, 50, 20, 20);
    expect(layersAt(editor.doc, editor.scene, editor.pageId, { x: 60, y: 60 }, 0)).toEqual([other, frame, front, back]);
    // Clipped part of the overflowing rectangle is not under the point.
    expect(layersAt(editor.doc, editor.scene, editor.pageId, { x: 230, y: 230 }, 0)).toEqual([]);
    expect(layersAt(editor.doc, editor.scene, editor.pageId, { x: 180, y: 180 }, 0)).toEqual([frame, outside]);
  });

  test('groups are listed when their content is hit', () => {
    const rect = add(makeRectangle, 'R', 0, 0, 50, 50);
    const group = editor.history.run('group', (tx) => {
      const id = editor.ids.next();
      tx.create(makeGroup({ id, parent: { id: editor.pageId, key: keyOnTop(editor.doc, editor.pageId) }, name: 'G', x: 0, y: 0, width: 0, height: 0 }));
      tx.set(rect, 'parent', { id, key: 'V' });
      return id;
    });
    expect(layersAt(editor.doc, editor.scene, editor.pageId, { x: 10, y: 10 }, 0)).toEqual([group, rect]);
  });
});

describe('select matching layers', () => {
  test('matches the same name path in sibling top-level frames of the same page or section', () => {
    const a = add(makeFrame, 'Screen A', 0, 0, 300, 300);
    const b = add(makeFrame, 'Screen B', 400, 0, 300, 300);
    const c = add(makeFrame, 'Screen C', 800, 0, 300, 300);
    const headerA = add(makeFrame, 'Header', 0, 0, 300, 60, a);
    const searchA = add(makeRectangle, 'Search', 10, 10, 100, 20, headerA);
    const headerB = add(makeFrame, 'Header', 0, 0, 300, 60, b);
    const searchB = add(makeRectangle, 'Search', 10, 10, 100, 20, headerB);
    add(makeRectangle, 'Search', 10, 10, 100, 20, c); // different path: not inside a Header
    const section = add(makeSection, 'S', 0, 500, 800, 400);
    const inSection = add(makeFrame, 'Screen D', 0, 0, 300, 300, section);
    const headerD = add(makeFrame, 'Header', 0, 0, 300, 60, inSection);
    add(makeRectangle, 'Search', 10, 10, 100, 20, headerD);

    editor.state.select([searchA]);
    expect(matchingLayers(editor)).toEqual([searchA, searchB]);
    expect(editor.commands.isEnabled('edit.selectMatching')).toBe(true);
    editor.commands.run('edit.selectMatching');
    expect(editor.selection).toEqual([searchA, searchB]);

    // Top-level layers have nothing to match.
    editor.state.select([a]);
    expect(editor.commands.isEnabled('edit.selectMatching')).toBe(false);
  });
});

describe('select all with same', () => {
  test('fill, stroke and properties compare the selected layer’s values across the page', () => {
    const red = solid({ r: 1, g: 0, b: 0, a: 1 });
    const a = add(makeRectangle, 'A', 0, 0, 10, 10, editor.pageId, { fills: [red] } as Partial<Node>);
    const b = add(makeEllipse, 'B', 20, 0, 10, 10, editor.pageId, { fills: [red], strokes: [solid(BLACK)] } as Partial<Node>);
    const c = add(makeRectangle, 'C', 40, 0, 10, 10, editor.pageId, { fills: [red] } as Partial<Node>);
    const hidden = add(makeRectangle, 'H', 60, 0, 10, 10, editor.pageId, { fills: [red], visible: false } as Partial<Node>);
    add(makeRectangle, 'D', 80, 0, 10, 10);

    editor.state.select([a]);
    expect(layersWithSame(editor, 'fill')).toEqual([a, b, c]);
    expect(layersWithSame(editor, 'properties')).toEqual([a, c]);
    expect(layersWithSame(editor, 'stroke')).toEqual([]);
    expect(editor.commands.isEnabled('edit.selectSameStroke')).toBe(false);
    editor.state.select([b]);
    editor.commands.run('edit.selectSameStroke');
    expect(editor.selection).toEqual([b]);
    expect(layersWithSame(editor, 'fill')).not.toContain(hidden);
  });
});
