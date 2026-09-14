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
import { createEmptyDocument, keyOnTop, makeBooleanOperation, makeRectangle } from '../document/factory';
import { groupFinalizer } from '../document/groups';
import { History } from '../history/history';
import { IdGenerator } from '../ids/ids';
import type { BooleanOperation, SceneNode } from '../schema/document';
import { shapeContainsLocal } from './boolean-hit';

function setup(operation: BooleanOperation) {
  const ids = new IdGenerator('b');
  const store = createEmptyDocument({ name: 'D', now: 'n', appVersion: 't', ids });
  const history = new History<null>({ store, captureMeta: () => null, restoreMeta: () => undefined, finalizers: [groupFinalizer] });
  const page = store.pages()[0]!;
  const [group, base, cutter] = [ids.next(), ids.next(), ids.next()];
  history.run('create', (tx) => {
    tx.create(makeBooleanOperation({ id: group, parent: { id: page, key: keyOnTop(store, page) }, name: 'Boolean', x: 0, y: 0, width: 0, height: 0 }, operation));
    // The bottom square covers 0–100; the square above it covers 50–150 horizontally.
    tx.create(makeRectangle({ id: base, parent: { id: group, key: keyOnTop(store, group) }, name: 'base', x: 0, y: 0, width: 100, height: 100 }));
    tx.create(makeRectangle({ id: cutter, parent: { id: group, key: keyOnTop(store, group) }, name: 'cutter', x: 50, y: 0, width: 100, height: 100 }));
  });
  const node = store.getOrThrow(group) as SceneNode;
  const contains = (x: number, y: number) => shapeContainsLocal(store, store.getOrThrow(group) as SceneNode, { x, y }, 0);
  return { store, history, group, base, node, contains };
}

describe('boolean groups', () => {
  test('each operation combines its children when hit testing', () => {
    const union = setup('UNION');
    expect([union.contains(25, 50), union.contains(75, 50), union.contains(125, 50), union.contains(175, 50)]).toEqual([true, true, true, false]);
    const subtract = setup('SUBTRACT');
    expect([subtract.contains(25, 50), subtract.contains(75, 50), subtract.contains(125, 50)]).toEqual([true, false, false]);
    const intersect = setup('INTERSECT');
    expect([intersect.contains(25, 50), intersect.contains(75, 50), intersect.contains(125, 50)]).toEqual([false, true, false]);
    const exclude = setup('EXCLUDE');
    expect([exclude.contains(25, 50), exclude.contains(75, 50), exclude.contains(125, 50)]).toEqual([true, false, true]);
  });

  test('boolean groups hug their children and disappear when empty', () => {
    const { store, history, group, base, node } = setup('UNION');
    expect(node.size).toEqual({ width: 150, height: 100 });
    history.run('delete', (tx) => {
      for (const child of [...store.children(group)]) tx.delete(child);
    });
    expect(store.has(group)).toBe(false);
    expect(store.has(base)).toBe(false);
  });
});
