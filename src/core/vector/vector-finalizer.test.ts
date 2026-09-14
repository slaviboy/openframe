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
import { createEmptyDocument, keyOnTop, makeVector } from '../document/factory';
import { History } from '../history/history';
import { IdGenerator } from '../ids/ids';
import type { VectorNode } from '../schema/document';
import { vectorFinalizer } from './vector-finalizer';
import { straightSegment } from './vector-network';

function setup() {
  const ids = new IdGenerator('v');
  const store = createEmptyDocument({ name: 'D', now: 'n', appVersion: 't', ids });
  const history = new History<null>({ store, captureMeta: () => null, restoreMeta: () => undefined, finalizers: [vectorFinalizer] });
  const page = store.pages()[0]!;
  const id = ids.next();
  history.run('create', (tx) =>
    tx.create(
      makeVector({ id, parent: { id: page, key: keyOnTop(store, page) }, name: 'Vector', x: 0, y: 0, width: 20, height: 10 }, {
        vertices: [
          { x: 0, y: 0 },
          { x: 20, y: 10 },
        ],
        segments: [{ ...straightSegment(0, 1), tangentStart: { x: 4, y: 2 } }],
        regions: [],
      }),
    ),
  );
  return { store, history, id, node: () => store.getOrThrow(id) as VectorNode };
}

describe('vector finalizer', () => {
  test('resizing a vector layer scales its network from the starting size, also across repeated runs', () => {
    const { history, id, node } = setup();
    const tx = history.begin('resize');
    tx.set(id, 'size', { width: 30, height: 10 });
    vectorFinalizer(tx);
    tx.set(id, 'size', { width: 40, height: 20 });
    history.commit(tx);
    expect(node().vectorNetwork.vertices).toEqual([
      { x: 0, y: 0 },
      { x: 40, y: 20 },
    ]);
    expect(node().vectorNetwork.segments[0]!.tangentStart).toEqual({ x: 8, y: 4 });
    history.undo();
    expect(node().vectorNetwork.vertices[1]).toEqual({ x: 20, y: 10 });
  });

  test('a network set in the same transaction is kept as it is', () => {
    const { history, id, node } = setup();
    const network = { vertices: [{ x: 0, y: 0 }, { x: 50, y: 5 }], segments: [straightSegment(0, 1)], regions: [] };
    history.run('pen', (tx) => {
      tx.set(id, 'vectorNetwork', network);
      tx.set(id, 'size', { width: 50, height: 5 });
    });
    expect(node().vectorNetwork).toEqual(network);
  });
});
