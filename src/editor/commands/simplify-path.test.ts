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
import { IdGenerator } from '@/core/ids/ids';
import type { VectorNode } from '@/core/schema/document';
import { straightSegment, type VectorNetwork } from '@/core/vector/vector-network';
import { Editor } from '../editor';
import { BUILTIN_COMMANDS } from './builtin';
import { selectedPointCount, simplifyPathInTx, simplifyPathSelection } from './simplify-path';

let editor: Editor;
let id: string;

/** A wobbly run along a 100-wide line: 41 points where a handful would do. */
const wobble: VectorNetwork = (() => {
  const vertices = Array.from({ length: 41 }, (_, i) => ({ x: (i * 100) / 40, y: i % 2 === 0 ? 0 : 1 }));
  return { vertices, segments: vertices.slice(1).map((_, i) => straightSegment(i, i + 1)), regions: [] };
})();

const vector = () => editor.doc.getOrThrow(id) as VectorNode;
const enabled = () => editor.commands.get('object.simplifyPath')!.enabled!(editor);

beforeEach(() => {
  const ids = new IdGenerator('s');
  editor = new Editor({ doc: createEmptyDocument({ name: 'D', now: 'n', appVersion: 't', ids }), ids, validate: true });
  editor.commands.register(...BUILTIN_COMMANDS);
  id = editor.history.run('create', (tx) => {
    const vectorId = editor.ids.next();
    tx.create(makeVector({ id: vectorId, parent: { id: editor.pageId, key: keyOnTop(editor.doc, editor.pageId) }, name: 'V', x: 30, y: 20, width: 100, height: 1 }, wobble));
    return vectorId;
  });
  editor.state.select([id]);
});

describe('simplify vector', () => {
  test('it takes points out of the path and leaves the layer where it was drawn', () => {
    expect(enabled()).toBe(true);
    expect(selectedPointCount(editor)).toBe(41);
    expect(simplifyPathSelection(editor, 1)).toBe(true);
    expect(vector().vectorNetwork.vertices.length).toBeLessThan(41);
    expect(vector().size.width).toBeCloseTo(100, 0);
    expect(vector().transform[4]).toBeCloseTo(30, 0);
  });

  test('one undo puts the path back as it was drawn', () => {
    simplifyPathSelection(editor, 1);
    editor.history.undo();
    expect(vector().vectorNetwork.vertices).toHaveLength(41);
    expect([vector().transform[4], vector().transform[5]]).toEqual([30, 20]);
  });

  test('dragging the slider always thins the path it started from, not the one it last drew', () => {
    const tx = editor.history.begin('Simplify vector');
    simplifyPathInTx(tx, editor, 1);
    const strong = vector().vectorNetwork.vertices.length;
    simplifyPathInTx(tx, editor, 0);
    // Back at nothing the path is whole again, which it could not be if each pass thinned the last one.
    expect(vector().vectorNetwork.vertices).toHaveLength(41);
    simplifyPathInTx(tx, editor, 1);
    expect(vector().vectorNetwork.vertices).toHaveLength(strong);
    editor.history.cancel(tx);
    expect(vector().vectorNetwork.vertices).toHaveLength(41);
  });

  test('it is offered only for vector layers with a path', () => {
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
