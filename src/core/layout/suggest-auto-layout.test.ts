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
import { createEmptyDocument, keyOnTop, makeFrame, makeRectangle } from '../document/factory';
import { History } from '../history/history';
import { IdGenerator } from '../ids/ids';
import type { FrameNode, SceneNode } from '../schema/document';
import { createAutoLayoutFinalizer } from './auto-layout';
import { suggestAutoLayout } from './suggest-auto-layout';

function setup() {
  const ids = new IdGenerator('s');
  const store = createEmptyDocument({ name: 'D', now: 'n', appVersion: 't', ids });
  const history = new History<null>({ store, captureMeta: () => null, restoreMeta: () => undefined, finalizers: [createAutoLayoutFinalizer(() => null)] });
  const page = store.pages()[0]!;
  const world = (id: string) => {
    let x = 0;
    let y = 0;
    for (let cur: string | null = id; cur && cur !== page; cur = store.parentOf(cur)) {
      const n = store.getOrThrow(cur) as SceneNode;
      x += n.transform[4];
      y += n.transform[5];
    }
    return { x, y };
  };
  return { ids, store, history, page, world };
}

describe('suggest auto layout', () => {
  test('rows of layers become nested horizontal frames in a vertical frame, keeping positions', () => {
    const { ids, store, history, page, world } = setup();
    const frame = ids.next();
    const kids = [ids.next(), ids.next(), ids.next(), ids.next()];
    history.run('create', (tx) => {
      tx.create(makeFrame({ id: frame, parent: { id: page, key: keyOnTop(store, page) }, name: 'Card', x: 100, y: 100, width: 230, height: 140 }));
      kids.forEach((id, i) =>
        tx.create(makeRectangle({ id, parent: { id: frame, key: keyOnTop(store, frame) }, name: id, x: 10 + (i % 2) * 110, y: 10 + Math.floor(i / 2) * 70, width: 100, height: 50 })),
      );
    });
    const before = kids.map(world);
    let changed: string[] = [];
    history.run('suggest', (tx) => {
      changed = suggestAutoLayout(tx, frame, () => ids.next());
    });
    expect(changed).toHaveLength(3);
    const card = store.getOrThrow(frame) as FrameNode;
    expect(card).toMatchObject({ layoutMode: 'VERTICAL', itemSpacing: 20 });
    const rows = store.children(frame);
    expect(rows).toHaveLength(2);
    for (const row of rows) expect(store.getOrThrow(row)).toMatchObject({ type: 'FRAME', layoutMode: 'HORIZONTAL', itemSpacing: 10, fills: [] });
    expect(kids.map(world)).toEqual(before);
    history.undo();
    expect(store.children(frame)).toEqual(kids);
  });

  test('a single row flows directly; overlapping layers are left alone', () => {
    const { ids, store, history, page } = setup();
    const [row, a, b, stack, c, d] = [ids.next(), ids.next(), ids.next(), ids.next(), ids.next(), ids.next()];
    history.run('create', (tx) => {
      tx.create(makeFrame({ id: row, parent: { id: page, key: keyOnTop(store, page) }, name: 'Row', x: 0, y: 0, width: 200, height: 50 }));
      tx.create(makeRectangle({ id: a, parent: { id: row, key: keyOnTop(store, row) }, name: 'a', x: 0, y: 0, width: 50, height: 50 }));
      tx.create(makeRectangle({ id: b, parent: { id: row, key: keyOnTop(store, row) }, name: 'b', x: 80, y: 0, width: 50, height: 50 }));
      tx.create(makeFrame({ id: stack, parent: { id: page, key: keyOnTop(store, page) }, name: 'Stack', x: 300, y: 0, width: 100, height: 100 }));
      tx.create(makeRectangle({ id: c, parent: { id: stack, key: keyOnTop(store, stack) }, name: 'c', x: 0, y: 0, width: 60, height: 60 }));
      tx.create(makeRectangle({ id: d, parent: { id: stack, key: keyOnTop(store, stack) }, name: 'd', x: 30, y: 30, width: 60, height: 60 }));
    });
    history.run('suggest', (tx) => {
      expect(suggestAutoLayout(tx, row, () => ids.next())).toEqual([row]);
      expect(suggestAutoLayout(tx, stack, () => ids.next())).toEqual([]);
    });
    expect(store.getOrThrow(row)).toMatchObject({ layoutMode: 'HORIZONTAL', itemSpacing: 30 });
    expect((store.getOrThrow(stack) as FrameNode).layoutMode).toBeUndefined();
    expect(store.children(stack)).toEqual([c, d]);
  });
});
