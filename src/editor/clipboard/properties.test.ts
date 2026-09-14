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
import { createEmptyDocument, keyOnTop, makeEllipse, makeFrame, makeLine, makeRectangle, solid } from '@/core/document/factory';
import { defaultLayoutGuide } from '@/core/layout/layout-guides';
import { defaultEffect } from '@/core/effects/effects';
import { IdGenerator } from '@/core/ids/ids';
import type { EllipseNode, FrameNode, LineNode, RectangleNode } from '@/core/schema/document';
import { Editor } from '../editor';
import { ClipboardError } from './payload';
import { allPropertiesPayload, decodePropertiesHtml, encodePropertiesHtml, pasteProperties, rowPropertyPayload } from './properties';

let editor: Editor;
let rect: string;
let ellipse: string;
let line: string;
const RED = { r: 1, g: 0, b: 0, a: 1 };
const BLUE = { r: 0, g: 0, b: 1, a: 1 };

beforeEach(() => {
  const ids = new IdGenerator('p');
  editor = new Editor({ doc: createEmptyDocument({ name: 'D', now: 'n', appVersion: 't', ids }), ids, validate: true });
  [rect, ellipse, line] = editor.history.run('seed', (tx) => {
    const parent = () => ({ id: editor.pageId, key: keyOnTop(editor.doc, editor.pageId) });
    const r = editor.ids.next();
    tx.create({
      ...makeRectangle({ id: r, parent: parent(), name: 'R', x: 0, y: 0, width: 50, height: 50 }),
      fills: [solid(RED)],
      strokes: [solid(BLUE)],
      strokeWeight: 3,
      strokeDashes: [4, 2],
      opacity: 0.5,
      blendMode: 'MULTIPLY',
      cornerRadius: 8,
      effects: [defaultEffect('DROP_SHADOW')],
    });
    const e = editor.ids.next();
    tx.create(makeEllipse({ id: e, parent: parent(), name: 'E', x: 100, y: 0, width: 50, height: 50 }));
    const l = editor.ids.next();
    tx.create(makeLine({ id: l, parent: parent(), name: 'L', x: 0, y: 100, width: 50, height: 0 }));
    return [r, e, l] as const;
  });
});

describe('copy and paste properties', () => {
  test('all properties apply what the target supports, in one undo step', () => {
    editor.state.select([rect]);
    const payload = allPropertiesPayload(editor)!;
    editor.state.select([ellipse, line]);
    pasteProperties(editor, payload);
    const e = editor.doc.getOrThrow(ellipse) as EllipseNode;
    expect(e).toMatchObject({ opacity: 0.5, blendMode: 'MULTIPLY', strokeWeight: 3, strokeDashes: [4, 2], fills: [solid(RED)], strokes: [solid(BLUE)] });
    expect(e.effects).toHaveLength(1);
    expect('cornerRadius' in e).toBe(false);
    const l = editor.doc.getOrThrow(line) as LineNode;
    expect(l.strokes).toEqual([solid(BLUE)]);
    expect(l.fills).not.toEqual([solid(RED)]);
    editor.history.undo();
    expect((editor.doc.getOrThrow(ellipse) as EllipseNode).opacity).toBe(1);
  });

  test('absent optional properties are cleared on the target; unsupported ones are left alone', () => {
    editor.state.select([ellipse]);
    const plain = allPropertiesPayload(editor)!;
    editor.state.select([rect]);
    pasteProperties(editor, plain);
    const r = editor.doc.getOrThrow(rect) as RectangleNode;
    expect(r.effects).toBeUndefined();
    expect(r.strokeDashes).toBeUndefined();
    expect(r.opacity).toBe(1);
    // Ellipses have no corner radius, so the rectangle keeps its own.
    expect(r.cornerRadius).toBe(8);
  });

  test('a single fill or effect row is added on top of each target list', () => {
    editor.state.select([rect]);
    const fill = rowPropertyPayload(editor, 'fills', 0)!;
    const effect = rowPropertyPayload(editor, 'effects', 0)!;
    expect(rowPropertyPayload(editor, 'fills', 5)).toBeNull();
    editor.state.select([ellipse]);
    pasteProperties(editor, fill);
    pasteProperties(editor, effect);
    const e = editor.doc.getOrThrow(ellipse) as EllipseNode;
    expect(e.fills).toHaveLength(2);
    expect(e.fills[1]).toEqual(solid(RED));
    expect(e.effects).toHaveLength(1);
  });

  test('clipboard HTML round-trips and rejects damaged or invalid data', () => {
    editor.state.select([rect]);
    const payload = allPropertiesPayload(editor)!;
    if (payload.kind !== 'all') throw new Error('expected all properties');
    expect(decodePropertiesHtml(encodePropertiesHtml(payload))).toEqual(payload);
    expect(decodePropertiesHtml('<b>hello</b>')).toBeNull();
    expect(() => decodePropertiesHtml('<div data-openframe-properties="v1:@@@"></div>')).toThrow(ClipboardError);
    const bad = encodePropertiesHtml({ ...payload, properties: { ...payload.properties, opacity: 7 } });
    expect(() => decodePropertiesHtml(bad)).toThrow(ClipboardError);
    // Copy properties needs exactly one layer.
    editor.state.select([rect, ellipse]);
    expect(allPropertiesPayload(editor)).toBeNull();
  });
});

describe('layout guide rows', () => {
  test('a copied layout guide is added to every selected frame', () => {
    const [a, b] = editor.history.run('frames', (tx) => {
      const parent = () => ({ id: editor.pageId, key: keyOnTop(editor.doc, editor.pageId) });
      const first = editor.ids.next();
      tx.create({ ...makeFrame({ id: first, parent: parent(), name: 'A', x: 0, y: 200, width: 100, height: 100 }), layoutGuides: [defaultLayoutGuide('COLUMNS')] });
      const second = editor.ids.next();
      tx.create(makeFrame({ id: second, parent: parent(), name: 'B', x: 200, y: 200, width: 100, height: 100 }));
      return [first, second] as const;
    });
    editor.state.select([a]);
    const payload = rowPropertyPayload(editor, 'layoutGuides', 0);
    expect(payload).toMatchObject({ kind: 'layoutGuide', guide: defaultLayoutGuide('COLUMNS') });
    expect(decodePropertiesHtml(encodePropertiesHtml(payload!))).toEqual(payload);

    // Frames get the guide; other layers are left alone.
    editor.state.select([b, rect]);
    expect(rowPropertyPayload(editor, 'layoutGuides', 5)).toBeNull();
    expect(pasteProperties(editor, payload!)).toBe(true);
    expect((editor.doc.getOrThrow(b) as FrameNode).layoutGuides).toEqual([defaultLayoutGuide('COLUMNS')]);
    expect(editor.doc.getOrThrow(rect)).not.toHaveProperty('layoutGuides');
  });
});
