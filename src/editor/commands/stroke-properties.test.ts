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
import { createEmptyDocument, keyOnTop, makeEllipse, makeRectangle } from '@/core/document/factory';
import { IdGenerator } from '@/core/ids/ids';
import type { RectangleNode, SceneNode } from '@/core/schema/document';
import { deserializeDocument, serializeDocument } from '@/core/serialize/serialize';
import { Editor } from '../editor';
import { setDashCap, setIndividualStrokeWeights, setStrokeDashes, setStrokeJoin, setStrokeMiterAngle } from './properties';

let editor: Editor;
let rect: string;
let ellipse: string;

beforeEach(() => {
  const ids = new IdGenerator('s');
  editor = new Editor({ doc: createEmptyDocument({ name: 'D', now: 'n', appVersion: 't', ids }), ids, validate: true });
  const add = (make: typeof makeRectangle | typeof makeEllipse) =>
    editor.history.run('seed', (tx) => {
      const id = editor.ids.next();
      tx.create(make({ id, parent: { id: editor.pageId, key: keyOnTop(editor.doc, editor.pageId) }, name: 'L', x: 0, y: 0, width: 10, height: 10 }));
      return id;
    });
  rect = add(makeRectangle);
  ellipse = add(makeEllipse);
});

const get = <T extends SceneNode>(id: string) => editor.doc.getOrThrow(id) as T;

describe('stroke properties', () => {
  test('dashes, dash caps, joins and miter angle store only non-defaults and round-trip', () => {
    editor.history.run('stroke', (tx) => {
      setStrokeDashes(tx, get(rect), [4, 2]);
      setDashCap(tx, get(rect), 'ROUND');
      setStrokeJoin(tx, get(rect), 'BEVEL');
      setStrokeMiterAngle(tx, get(rect), 45);
    });
    expect(get<RectangleNode>(rect)).toMatchObject({ strokeDashes: [4, 2], strokeCap: 'ROUND', strokeJoin: 'BEVEL', strokeMiterAngle: 45 });
    const reloaded = deserializeDocument(serializeDocument(editor.doc)).getOrThrow(rect);
    expect(reloaded).toMatchObject({ strokeDashes: [4, 2], strokeJoin: 'BEVEL' });

    editor.history.run('reset', (tx) => {
      setStrokeDashes(tx, get(rect), undefined);
      setDashCap(tx, get(rect), 'NONE');
      setStrokeJoin(tx, get(rect), 'MITER');
      setStrokeMiterAngle(tx, get(rect), 28.96);
    });
    const node = get<RectangleNode>(rect);
    for (const field of ['strokeDashes', 'strokeCap', 'strokeJoin', 'strokeMiterAngle']) expect(field in node).toBe(false);
  });

  test('invalid dash patterns clear the dashes', () => {
    editor.history.run('dash', (tx) => setStrokeDashes(tx, get(rect), [0, 0]));
    expect('strokeDashes' in get(rect)).toBe(false);
    editor.history.run('dash', (tx) => setStrokeDashes(tx, get(rect), [3]));
    expect('strokeDashes' in get(rect)).toBe(false);
  });

  test('individual stroke weights apply to rectangles and collapse when equal', () => {
    editor.history.run('sides', (tx) => setIndividualStrokeWeights(tx, get(rect), { top: 2, right: 0, bottom: 0, left: 0 }));
    expect(get<RectangleNode>(rect).individualStrokeWeights).toEqual({ top: 2, right: 0, bottom: 0, left: 0 });
    editor.history.run('sides', (tx) => setIndividualStrokeWeights(tx, get(rect), { top: 3, right: 3, bottom: 3, left: 3 }));
    expect(get<RectangleNode>(rect)).toMatchObject({ strokeWeight: 3 });
    expect('individualStrokeWeights' in get(rect)).toBe(false);
    editor.history.run('sides', (tx) => setIndividualStrokeWeights(tx, get(ellipse), { top: 2, right: 0, bottom: 0, left: 0 }));
    expect('individualStrokeWeights' in get(ellipse)).toBe(false);
  });
});
