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
import type { SceneNode } from '../schema/document';
import { createAutoLayoutFinalizer } from './auto-layout';
import { flowInsertionIndex, flowInsertionLine, moveInFlow, moveToFlowIndex } from './flow-order';

function setup() {
  const ids = new IdGenerator('o');
  const store = createEmptyDocument({ name: 'D', now: 'n', appVersion: 't', ids });
  const history = new History<null>({ store, captureMeta: () => null, restoreMeta: () => undefined, finalizers: [createAutoLayoutFinalizer(() => null)] });
  const page = store.pages()[0]!;
  const [frame, a, b, c, hidden] = [ids.next(), ids.next(), ids.next(), ids.next(), ids.next()];
  history.run('create', (tx) => {
    tx.create({ ...makeFrame({ id: frame, parent: { id: page, key: keyOnTop(store, page) }, name: 'F', x: 0, y: 0, width: 10, height: 10 }), layoutMode: 'HORIZONTAL', itemSpacing: 10, layoutSizingHorizontal: 'HUG', layoutSizingVertical: 'HUG' });
    for (const id of [a, hidden, b, c]) {
      tx.create({ ...makeRectangle({ id, parent: { id: frame, key: keyOnTop(store, frame) }, name: id, x: 0, y: 0, width: 20, height: 20 }), visible: id !== hidden });
    }
  });
  const x = (id: string) => (store.getOrThrow(id) as SceneNode).transform[4];
  return { store, history, frame, a, b, c, hidden, x };
}

describe('auto layout order', () => {
  test('the insertion index and indicator follow the pointer along the flow', () => {
    const { store, frame, a, b } = setup();
    // a: 0–20, b: 30–50, c: 60–80.
    expect(flowInsertionIndex(store, frame, { x: 5, y: 10 }, new Set())).toBe(0);
    expect(flowInsertionIndex(store, frame, { x: 45, y: 10 }, new Set())).toBe(2);
    expect(flowInsertionIndex(store, frame, { x: 45, y: 10 }, new Set([a]))).toBe(1);
    expect(flowInsertionLine(store, frame, 1, new Set())).toEqual([
      { x: 25, y: 0 },
      { x: 25, y: 20 },
    ]);
    expect(flowInsertionLine(store, frame, 0, new Set([b]))![0].x).toBe(-5);
  });

  test('moving to an index or by one position reorders layers and reflows them', () => {
    const { store, history, frame, a, b, c, hidden, x } = setup();
    history.run('reorder', (tx) => moveToFlowIndex(tx, frame, [a], 2));
    expect(store.children(frame).filter((id) => id !== hidden)).toEqual([b, c, a]);
    expect([x(b), x(c), x(a)]).toEqual([0, 30, 60]);
    history.run('left', (tx) => moveInFlow(tx, a, -1));
    expect(store.children(frame).filter((id) => id !== hidden)).toEqual([b, a, c]);
    history.run('clamped', (tx) => moveInFlow(tx, b, -1));
    expect(store.children(frame).filter((id) => id !== hidden)).toEqual([b, a, c]);
    history.undo();
    history.undo();
    expect(store.children(frame).filter((id) => id !== hidden)).toEqual([a, b, c]);
    expect(store.children(frame)).toContain(hidden);
  });
});
