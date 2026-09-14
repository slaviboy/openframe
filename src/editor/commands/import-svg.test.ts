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
import { importSvg, type SvgElement } from '@/core/import/svg-import';
import type { FrameNode, GroupNode, VectorNode } from '@/core/schema/document';
import { Editor } from '../editor';
import { placeSvgs } from './import-svg';

let editor: Editor;
const el = (tag: string, attributes: Record<string, string> = {}, ...children: SvgElement[]): SvgElement => ({ tag, attributes, children });

beforeEach(() => {
  const ids = new IdGenerator('m');
  editor = new Editor({ doc: createEmptyDocument({ name: 'D', now: 'n', appVersion: 't', ids }), ids, validate: true });
});

describe('placing SVGs', () => {
  test('an SVG becomes a frame of editable vectors and groups, centered on the point, in one undo step', () => {
    const svg = importSvg(
      el(
        'svg',
        { width: '100', height: '50' },
        el('rect', { x: '10', y: '10', width: '20', height: '20', fill: 'red' }),
        el('g', { id: 'icons', transform: 'translate(40 0)' }, el('circle', { cx: '10', cy: '10', r: '10', fill: 'none', stroke: 'blue', 'stroke-width': '3' })),
      ),
    )!;
    const [frameId] = placeSvgs(editor, [{ name: 'logo', svg }], { x: 0, y: 0 });
    const frame = editor.doc.getOrThrow(frameId!) as FrameNode;
    expect(frame).toMatchObject({ type: 'FRAME', name: 'logo', size: { width: 100, height: 50 }, fills: [] });
    expect(frame.transform.slice(4)).toEqual([-50, -25]);
    const [rectId, groupId] = editor.doc.children(frameId!);
    const rect = editor.doc.getOrThrow(rectId!) as VectorNode;
    expect(rect).toMatchObject({ type: 'VECTOR', name: 'Rectangle', size: { width: 20, height: 20 }, strokes: [] });
    expect(rect.transform.slice(4)).toEqual([10, 10]);
    expect(rect.fills[0]).toMatchObject({ type: 'SOLID', color: { r: 1, g: 0, b: 0, a: 1 } });
    const group = editor.doc.getOrThrow(groupId!) as GroupNode;
    expect(group).toMatchObject({ type: 'GROUP', name: 'icons' });
    // The group fits its circle.
    expect(group.transform[4]).toBeCloseTo(40);
    expect(group.size.width).toBeCloseTo(20);
    const circle = editor.doc.getOrThrow(editor.doc.children(groupId!)[0]!) as VectorNode;
    expect(circle).toMatchObject({ fills: [], strokeWeight: 3 });
    expect(editor.selection).toEqual([frameId]);
    editor.history.undo();
    expect(editor.doc.has(frameId!)).toBe(false);
  });

  test('several SVGs sit in a row', () => {
    const svg = importSvg(el('svg', { width: '40', height: '40' }))!;
    const ids = placeSvgs(editor, [{ name: 'a', svg }, { name: 'b', svg }], { x: 0, y: 0 });
    // Total width 40 + 20 + 40 = 100.
    expect(ids.map((id) => (editor.doc.getOrThrow(id) as FrameNode).transform[4])).toEqual([-50, 10]);
  });
});
