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
import { createEmptyDocument, keyOnTop, makeRectangle, makeVector } from '@/core/document/factory';
import type { PathCommand } from '@/core/geometry/corners';
import { IdGenerator } from '@/core/ids/ids';
import type { VectorNode } from '@/core/schema/document';
import type { VectorNetwork } from '@/core/vector/vector-network';
import { Editor } from '../editor';
import { BUILTIN_COMMANDS } from './builtin';
import { offsetPathSelection } from './offset-path';

let editor: Editor;
let id: string;

/** A square from (0,0) to (40,40), as a closed network with one region. */
const square: VectorNetwork = {
  vertices: [
    { x: 0, y: 0 },
    { x: 40, y: 0 },
    { x: 40, y: 40 },
    { x: 0, y: 40 },
  ],
  segments: [0, 1, 2, 3].map((i) => ({ start: i, end: (i + 1) % 4, tangentStart: { x: 0, y: 0 }, tangentEnd: { x: 0, y: 0 } })),
  regions: [{ loops: [[0, 1, 2, 3]], windingRule: 'NONZERO' }],
};

/** A stand-in for the engine: the network's bounds grown by the amount on every side, squared off. */
const grown = (network: VectorNetwork, amount: number): PathCommand[] | null => {
  const xs = network.vertices.map((v) => v.x);
  const ys = network.vertices.map((v) => v.y);
  const [x0, y0, x1, y1] = [Math.min(...xs) - amount, Math.min(...ys) - amount, Math.max(...xs) + amount, Math.max(...ys) + amount];
  if (x1 <= x0 || y1 <= y0) return [];
  return [{ op: 'M', x: x0, y: y0 }, { op: 'L', x: x1, y: y0 }, { op: 'L', x: x1, y: y1 }, { op: 'L', x: x0, y: y1 }, { op: 'Z' }];
};

const vector = () => editor.doc.getOrThrow(id) as VectorNode;
const enabled = () => editor.commands.get('object.offsetPath')!.enabled!(editor);

beforeEach(() => {
  const ids = new IdGenerator('o');
  editor = new Editor({ doc: createEmptyDocument({ name: 'D', now: 'n', appVersion: 't', ids }), ids, validate: true });
  editor.commands.register(...BUILTIN_COMMANDS);
  editor.setGeometry({ strokeOutline: () => null, regionMinusStroke: () => null, regionHalves: () => null, booleanOutline: () => null, shapeFaces: () => [], offsetNetwork: grown });
  id = editor.history.run('create', (tx) => {
    const vectorId = editor.ids.next();
    tx.create(makeVector({ id: vectorId, parent: { id: editor.pageId, key: keyOnTop(editor.doc, editor.pageId) }, name: 'V', x: 100, y: 50, width: 40, height: 40 }, square));
    return vectorId;
  });
  editor.state.select([id]);
});

describe('offset path', () => {
  test('a positive amount grows the area, moving the layer box out to meet it', () => {
    expect(enabled()).toBe(true);
    expect(offsetPathSelection(editor, { amount: 10, join: 'ROUND' })).toBe(true);
    const node = vector();
    expect(node.size).toEqual({ width: 60, height: 60 });
    // The box corner moves by the amount, so the shape stays where it was drawn.
    expect([node.transform[4], node.transform[5]]).toEqual([90, 40]);
    // The network is re-based on the new box, so it starts at its corner.
    expect(node.vectorNetwork.vertices).toContainEqual({ x: 0, y: 0 });
    expect(node.vectorNetwork.vertices).toContainEqual({ x: 60, y: 60 });
  });

  test('a negative amount shrinks it, and one undo puts the layer back', () => {
    offsetPathSelection(editor, { amount: -5, join: 'SQUARE' });
    expect(vector().size).toEqual({ width: 30, height: 30 });
    editor.history.undo();
    expect(vector().size).toEqual({ width: 40, height: 40 });
    expect([vector().transform[4], vector().transform[5]]).toEqual([100, 50]);
  });

  test('shrinking a shape away leaves it as it was rather than emptying it', () => {
    offsetPathSelection(editor, { amount: -40, join: 'ROUND' });
    expect(vector().size).toEqual({ width: 40, height: 40 });
    expect(vector().vectorNetwork.regions).toHaveLength(1);
  });

  test('offsetting twice runs from the shape each time within one transaction, and stacks across two', () => {
    offsetPathSelection(editor, { amount: 10, join: 'ROUND' });
    offsetPathSelection(editor, { amount: 10, join: 'ROUND' });
    expect(vector().size).toEqual({ width: 80, height: 80 });
  });

  test('it is offered only for vector layers that enclose an area, and only with the engine loaded', () => {
    const rect = editor.history.run('create', (tx) => {
      const rectId = editor.ids.next();
      tx.create(makeRectangle({ id: rectId, parent: { id: editor.pageId, key: keyOnTop(editor.doc, editor.pageId) }, name: 'R', x: 0, y: 0, width: 10, height: 10 }));
      return rectId;
    });
    editor.state.select([rect]);
    expect(enabled()).toBe(false);
    editor.state.select([id]);
    editor.history.run('lock', (tx) => tx.set(id, 'locked', true));
    expect(enabled()).toBe(false);
  });
});
