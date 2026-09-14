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

import { describe, expect, test } from 'vitest';
import { BLACK, createEmptyDocument, keyOnTop, makeEllipse, makeFrame, makeRectangle, makeText, solid } from '../document/factory';
import { History } from '../history/history';
import { IdGenerator } from '../ids/ids';
import type { SceneNode, VectorNode } from '../schema/document';
import { canFlattenLayer, flattenLayers } from './flatten';

function setup() {
  const ids = new IdGenerator('f');
  const store = createEmptyDocument({ name: 'D', now: 'n', appVersion: 't', ids });
  const history = new History<null>({ store, captureMeta: () => null, restoreMeta: () => undefined });
  const page = store.pages()[0]!;
  const at = (parent: string) => ({ id: parent, key: keyOnTop(store, parent) });
  return { ids, store, history, page, at };
}

describe('flatten', () => {
  test('layers merge into one vector in the topmost layer’s place, with its name and appearance', () => {
    const { ids, store, history, page, at } = setup();
    const [rect, ellipse] = [ids.next(), ids.next()];
    history.run('create', (tx) => {
      tx.create(makeRectangle({ id: rect, parent: at(page), name: 'Rectangle 1', x: 0, y: 0, width: 10, height: 10 }));
      tx.create({ ...makeEllipse({ id: ellipse, parent: at(page), name: 'Ellipse 1', x: 20, y: 0, width: 10, height: 10 }), strokes: [solid(BLACK)], strokeWeight: 2 });
    });
    let vectorId: string | null = null;
    history.run('flatten', (tx) => {
      vectorId = flattenLayers(tx, [ellipse, rect], () => ids.next());
    });
    expect(store.children(page)).toEqual([vectorId]);
    const vector = store.getOrThrow(vectorId!) as VectorNode;
    expect(vector).toMatchObject({ type: 'VECTOR', name: 'Ellipse 1', strokeWeight: 2, size: { width: 30, height: 10 } });
    expect(vector.transform.slice(4)).toEqual([0, 0]);
    expect(vector.vectorNetwork.vertices).toHaveLength(8);
    expect(vector.vectorNetwork.regions).toHaveLength(2);
    history.undo();
    expect(store.children(page)).toEqual([rect, ellipse]);
  });

  test('rotated layers flatten in their parent’s space', () => {
    const { ids, store, history, page, at } = setup();
    const rect = ids.next();
    history.run('create', (tx) => tx.create({ ...makeRectangle({ id: rect, parent: at(page), name: 'R', x: 0, y: 0, width: 10, height: 20 }), transform: [0, 1, -1, 0, 100, 100] }));
    let vectorId: string | null = null;
    history.run('flatten', (tx) => {
      vectorId = flattenLayers(tx, [rect], () => ids.next());
    });
    const vector = store.getOrThrow(vectorId!) as SceneNode;
    expect(vector.transform).toEqual([1, 0, 0, 1, 80, 100]);
    expect(vector.size).toEqual({ width: 20, height: 10 });
  });

  test('a container flattens its contents and is removed; containers with text and text layers are left alone', () => {
    const { ids, store, history, page, at } = setup();
    const [frame, a, b, other, text] = [ids.next(), ids.next(), ids.next(), ids.next(), ids.next()];
    history.run('create', (tx) => {
      tx.create(makeFrame({ id: frame, parent: at(page), name: 'Frame', x: 50, y: 50, width: 100, height: 100 }));
      tx.create(makeRectangle({ id: a, parent: at(frame), name: 'a', x: 0, y: 0, width: 10, height: 10 }));
      tx.create(makeRectangle({ id: b, parent: at(frame), name: 'b', x: 20, y: 20, width: 10, height: 10 }));
      tx.create(makeFrame({ id: other, parent: at(page), name: 'Other', x: 0, y: 300, width: 50, height: 50 }));
      tx.create(makeText({ id: text, parent: at(other), name: 'T', x: 0, y: 0, width: 20, height: 10 }));
    });
    expect(canFlattenLayer(store, other)).toBe(false);
    expect(canFlattenLayer(store, text)).toBe(false);
    let vectorId: string | null = null;
    history.run('flatten', (tx) => {
      vectorId = flattenLayers(tx, [frame, other], () => ids.next());
    });
    expect(store.has(frame)).toBe(false);
    expect(store.has(other)).toBe(true);
    const vector = store.getOrThrow(vectorId!) as SceneNode;
    expect(vector.transform.slice(4)).toEqual([50, 50]);
    expect(vector.size).toEqual({ width: 30, height: 30 });
  });
});
