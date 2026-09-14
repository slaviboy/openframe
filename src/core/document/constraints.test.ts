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
import { History } from '../history/history';
import { IdGenerator } from '../ids/ids';
import type { Constraint, SceneNode } from '../schema/document';
import { constrainAxis, constraintsFinalizer } from './constraints';
import { createEmptyDocument, keyOnTop, makeFrame, makeRectangle } from './factory';

function setup(horizontal: Constraint, vertical: Constraint = 'MIN') {
  const ids = new IdGenerator('c');
  const store = createEmptyDocument({ name: 'D', now: 'n', appVersion: 't', ids });
  const history = new History<null>({ store, captureMeta: () => null, restoreMeta: () => undefined, finalizers: [constraintsFinalizer] });
  const page = store.pages()[0]!;
  const frame = ids.next();
  const child = ids.next();
  history.run('create', (tx) => {
    tx.create(makeFrame({ id: frame, parent: { id: page, key: keyOnTop(store, page) }, name: 'F', x: 0, y: 0, width: 100, height: 100 }));
    tx.create({
      ...makeRectangle({ id: child, parent: { id: frame, key: keyOnTop(store, frame) }, name: 'R', x: 70, y: 60, width: 20, height: 30 }),
      constraints: { horizontal, vertical },
    });
  });
  const box = () => {
    const node = store.getOrThrow(child) as SceneNode;
    return { x: node.transform[4], y: node.transform[5], width: node.size.width, height: node.size.height };
  };
  return { ids, store, history, frame, child, box, page };
}

describe('constraints', () => {
  test('each constraint on one axis', () => {
    expect(constrainAxis('MIN', 70, 20, 100, 200, true)).toEqual([70, 20]);
    expect(constrainAxis('MAX', 70, 20, 100, 200, true)).toEqual([170, 20]);
    expect(constrainAxis('CENTER', 70, 20, 100, 200, true)).toEqual([120, 20]);
    expect(constrainAxis('STRETCH', 70, 20, 100, 200, true)).toEqual([70, 120]);
    expect(constrainAxis('SCALE', 70, 20, 100, 200, true)).toEqual([140, 40]);
    // Rotated layers move but keep their size.
    expect(constrainAxis('STRETCH', 70, 20, 100, 200, false)).toEqual([120, 20]);
    expect(constrainAxis('SCALE', 70, 20, 100, 200, false)).toEqual([140, 20]);
  });

  test('resizing a frame moves and resizes children by their constraints', () => {
    const right = setup('MAX', 'MAX');
    right.history.run('resize', (tx) => tx.set(right.frame, 'size', { width: 200, height: 150 }));
    expect(right.box()).toEqual({ x: 170, y: 110, width: 20, height: 30 });
    const stretch = setup('STRETCH', 'SCALE');
    stretch.history.run('resize', (tx) => tx.set(stretch.frame, 'size', { width: 200, height: 200 }));
    expect(stretch.box()).toEqual({ x: 70, y: 120, width: 120, height: 60 });
    // Undo restores children with the frame.
    stretch.history.undo();
    expect(stretch.box()).toEqual({ x: 70, y: 60, width: 20, height: 30 });
    const left = setup('MIN');
    left.history.run('resize', (tx) => tx.set(left.frame, 'size', { width: 300, height: 100 }));
    expect(left.box()).toEqual({ x: 70, y: 60, width: 20, height: 30 });
  });

  test('⌘ ignores constraints, and repeated runs during a drag do not compound', () => {
    const ignored = setup('MAX');
    ignored.history.run('resize', (tx) => {
      tx.ignoreConstraints = true;
      tx.set(ignored.frame, 'size', { width: 200, height: 100 });
    });
    expect(ignored.box().x).toBe(70);
    const drag = setup('MAX');
    drag.history.run('drag', (tx) => {
      tx.set(drag.frame, 'size', { width: 150, height: 100 });
      constraintsFinalizer(tx);
      tx.set(drag.frame, 'size', { width: 200, height: 100 });
      constraintsFinalizer(tx);
      // ⌘ pressed mid-drag puts the child back.
      tx.ignoreConstraints = true;
      constraintsFinalizer(tx);
      expect(drag.box().x).toBe(70);
      tx.ignoreConstraints = false;
    });
    expect(drag.box().x).toBe(170);
  });

  test('a nested frame stretched by its parent passes the resize on to its children', () => {
    const { ids, store, history, frame, page } = setup('MIN');
    const inner = ids.next();
    const leaf = ids.next();
    history.run('nest', (tx) => {
      tx.create({ ...makeFrame({ id: inner, parent: { id: frame, key: keyOnTop(store, frame) }, name: 'Inner', x: 10, y: 10, width: 80, height: 50 }), constraints: { horizontal: 'STRETCH', vertical: 'MIN' } });
      tx.create({ ...makeRectangle({ id: leaf, parent: { id: inner, key: keyOnTop(store, inner) }, name: 'Leaf', x: 60, y: 0, width: 10, height: 10 }), constraints: { horizontal: 'MAX', vertical: 'MIN' } });
    });
    expect(page).toBeTruthy();
    history.run('resize', (tx) => tx.set(frame, 'size', { width: 150, height: 100 }));
    expect((store.getOrThrow(inner) as SceneNode).size.width).toBe(130);
    expect((store.getOrThrow(leaf) as SceneNode).transform[4]).toBe(110);
  });
});
