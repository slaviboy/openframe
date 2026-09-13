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
import { createEmptyDocument, keyOnTop, makeEllipse, makeRectangle, makeStar } from '@/core/document/factory';
import { IdGenerator } from '@/core/ids/ids';
import type { RectangleNode, SceneNode, StarNode } from '@/core/schema/document';
import { deserializeDocument, serializeDocument } from '@/core/serialize/serialize';
import { Editor } from '../editor';
import { setCornerRadii, setCornerRadius } from './properties';

let editor: Editor;

function add(make: typeof makeRectangle | typeof makeStar | typeof makeEllipse): string {
  return editor.history.run('seed', (tx) => {
    const id = editor.ids.next();
    tx.create(make({ id, parent: { id: editor.pageId, key: keyOnTop(editor.doc, editor.pageId) }, name: 'L', x: 0, y: 0, width: 100, height: 100 }));
    return id;
  });
}
const get = <T extends SceneNode>(id: string) => editor.doc.getOrThrow(id) as T;

beforeEach(() => {
  const ids = new IdGenerator('c');
  editor = new Editor({ doc: createEmptyDocument({ name: 'D', now: 'n', appVersion: 't', ids }), ids, validate: true });
});

describe('corner radius', () => {
  test('independent corners start from the uniform radius and return to the largest corner', () => {
    const rect = add(makeRectangle);
    editor.history.run('radius', (tx) => setCornerRadius(tx, get(rect), 8));
    editor.history.run('independent', (tx) => setCornerRadii(tx, get(rect), { topLeft: 8, topRight: 8, bottomRight: 8, bottomLeft: 8 }));
    editor.history.run('corner', (tx) => setCornerRadii(tx, get(rect), { ...get<RectangleNode>(rect).cornerRadii!, topLeft: 24 }));
    expect(get<RectangleNode>(rect).cornerRadii).toEqual({ topLeft: 24, topRight: 8, bottomRight: 8, bottomLeft: 8 });
    expect((deserializeDocument(serializeDocument(editor.doc)).getOrThrow(rect) as RectangleNode).cornerRadii?.topLeft).toBe(24);
    editor.history.run('uniform', (tx) => setCornerRadii(tx, get(rect), undefined));
    expect(get<RectangleNode>(rect)).toMatchObject({ cornerRadius: 24 });
    expect(get<RectangleNode>(rect).cornerRadii).toBeUndefined();
  });

  test('polygons and stars take a uniform radius, stored only when positive; ellipses ignore it', () => {
    const star = add(makeStar);
    editor.history.run('radius', (tx) => setCornerRadius(tx, get(star), 6));
    expect(get<StarNode>(star).cornerRadius).toBe(6);
    editor.history.run('radius', (tx) => setCornerRadius(tx, get(star), 0));
    expect('cornerRadius' in get(star)).toBe(false);
    const ellipse = add(makeEllipse);
    editor.history.run('radius', (tx) => setCornerRadius(tx, get(ellipse), 6));
    expect('cornerRadius' in get(ellipse)).toBe(false);
  });
});
