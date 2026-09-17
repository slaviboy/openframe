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
import { createEmptyDocument, keyOnTop, makeRectangle } from '@/core/document/factory';
import type { PathCommand } from '@/core/geometry/corners';
import { IdGenerator } from '@/core/ids/ids';
import type { RectangleNode, VectorNode } from '@/core/schema/document';
import { Editor } from '../editor';
import { BUILTIN_COMMANDS } from './builtin';

let editor: Editor;
let id: string;

/** A stand-in for the engine: every stroke covers the box grown by 5 on each side. */
const outside = (width: number, height: number): PathCommand[] => [
  { op: 'M', x: -5, y: -5 },
  { op: 'L', x: width + 5, y: -5 },
  { op: 'L', x: width + 5, y: height + 5 },
  { op: 'L', x: -5, y: height + 5 },
  { op: 'Z' },
];

const rect = () => editor.doc.get(id) as RectangleNode | undefined;
const enabled = () => editor.commands.get('object.outlineStroke')!.enabled!(editor);

beforeEach(() => {
  const ids = new IdGenerator('e');
  editor = new Editor({ doc: createEmptyDocument({ name: 'D', now: 'n', appVersion: 't', ids }), ids, validate: true });
  editor.commands.register(...BUILTIN_COMMANDS);
  editor.setGeometry({ strokeOutline: (node) => outside(node.size.width, node.size.height), regionMinusStroke: () => null, regionHalves: () => null, offsetNetwork: () => null });
  id = editor.history.run('create', (tx) => {
    const rectId = editor.ids.next();
    const node = makeRectangle({ id: rectId, parent: { id: editor.pageId, key: keyOnTop(editor.doc, editor.pageId) }, name: 'Box', x: 50, y: 20, width: 100, height: 100 });
    tx.create({ ...node, strokes: node.fills });
    return rectId;
  });
  editor.state.select([id]);
});

describe('outline stroke', () => {
  test('a layer with a fill keeps it; the outlined stroke goes directly above it, filled with the stroke paint', () => {
    const paint = rect()!.strokes;
    expect(enabled()).toBe(true);
    editor.commands.run('object.outlineStroke');
    const vector = editor.doc.getOrThrow(editor.selection[0]!) as VectorNode;
    expect(vector).toMatchObject({ type: 'VECTOR', name: 'Box', fills: paint, strokes: [] });
    expect(vector.transform).toEqual([1, 0, 0, 1, 45, 15]);
    expect(vector.size).toEqual({ width: 110, height: 110 });
    expect(rect()!.strokes).toEqual([]);
    expect(editor.doc.children(editor.pageId)).toEqual([id, vector.id]);
    editor.history.undo();
    expect(rect()!.strokes).toEqual(paint);
    expect(editor.doc.children(editor.pageId)).toEqual([id]);
  });

  test('a layer without a visible fill is replaced by its outline', () => {
    editor.history.run('no fill', (tx) => tx.set(id, 'fills', []));
    editor.commands.run('object.outlineStroke');
    expect(rect()).toBeUndefined();
    expect(editor.doc.getOrThrow(editor.selection[0]!).type).toBe('VECTOR');
  });

  test('needs a visible stroke and the engine', () => {
    editor.history.run('no stroke', (tx) => tx.set(id, 'strokes', []));
    expect(enabled()).toBe(false);
    editor.history.undo();
    editor.setGeometry(null);
    expect(enabled()).toBe(false);
  });
});
