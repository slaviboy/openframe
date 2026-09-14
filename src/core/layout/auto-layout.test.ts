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
import { constraintsFinalizer } from '../document/constraints';
import { createEmptyDocument, keyOnTop, makeFrame, makeRectangle } from '../document/factory';
import { History } from '../history/history';
import { IdGenerator } from '../ids/ids';
import type { FrameNode, SceneNode } from '../schema/document';
import { applyAutoLayout, clearAutoLayout, createAutoLayoutFinalizer } from './auto-layout';

function setup() {
  const ids = new IdGenerator('a');
  const store = createEmptyDocument({ name: 'D', now: 'n', appVersion: 't', ids });
  const finalizer = createAutoLayoutFinalizer(() => null);
  const history = new History<null>({ store, captureMeta: () => null, restoreMeta: () => undefined, finalizers: [constraintsFinalizer, finalizer] });
  const page = store.pages()[0]!;
  const node = <T extends SceneNode>(id: string) => store.getOrThrow(id) as T;
  const box = (id: string) => {
    const n = node(id);
    return { x: n.transform[4], y: n.transform[5], width: n.size.width, height: n.size.height };
  };
  return { ids, store, history, page, node, box };
}

describe('auto layout', () => {
  test('adding auto layout keeps a row of layers where they are and hugs them', () => {
    const { ids, store, history, page, node, box } = setup();
    const frame = ids.next();
    const [a, b, c] = [ids.next(), ids.next(), ids.next()];
    history.run('create', (tx) => {
      tx.create(makeFrame({ id: frame, parent: { id: page, key: keyOnTop(store, page) }, name: 'F', x: 0, y: 0, width: 200, height: 60 }));
      // Created out of order: layer order must follow position.
      tx.create(makeRectangle({ id: b, parent: { id: frame, key: keyOnTop(store, frame) }, name: 'B', x: 70, y: 10, width: 40, height: 40 }));
      tx.create(makeRectangle({ id: a, parent: { id: frame, key: keyOnTop(store, frame) }, name: 'A', x: 10, y: 10, width: 40, height: 40 }));
      tx.create(makeRectangle({ id: c, parent: { id: frame, key: keyOnTop(store, frame) }, name: 'C', x: 130, y: 10, width: 40, height: 40 }));
    });
    history.run('auto layout', (tx) => applyAutoLayout(tx, frame));
    expect(node<FrameNode>(frame)).toMatchObject({ layoutMode: 'HORIZONTAL', itemSpacing: 20, paddingLeft: 10, paddingTop: 10, paddingRight: 30, paddingBottom: 10, layoutSizingHorizontal: 'HUG' });
    expect(store.children(frame)).toEqual([a, b, c]);
    expect([box(a).x, box(b).x, box(c).x]).toEqual([10, 70, 130]);
    expect(box(frame)).toMatchObject({ width: 200, height: 60 });

    // Resizing a child reflows its siblings and the hugging frame.
    history.run('resize', (tx) => tx.set(a, 'size', { width: 60, height: 50 }));
    expect([box(b).x, box(c).x]).toEqual([90, 150]);
    expect(box(frame)).toMatchObject({ width: 220, height: 70 });

    // Hiding a child takes it out of the flow.
    history.run('hide', (tx) => tx.set(b, 'visible', false));
    expect(box(c).x).toBe(90);
    history.undo();
    history.undo();
    expect(box(frame)).toMatchObject({ width: 200, height: 60 });

    history.run('remove', (tx) => clearAutoLayout(tx, frame));
    expect(node<FrameNode>(frame).layoutMode).toBeUndefined();
    history.run('resize', (tx) => tx.set(a, 'size', { width: 10, height: 10 }));
    expect(box(b).x).toBe(70);
  });

  test('a vertical stack is detected, and fill children share the frame', () => {
    const { ids, store, history, page, box } = setup();
    const frame = ids.next();
    const [a, b] = [ids.next(), ids.next()];
    history.run('create', (tx) => {
      tx.create(makeFrame({ id: frame, parent: { id: page, key: keyOnTop(store, page) }, name: 'F', x: 0, y: 0, width: 100, height: 100 }));
      tx.create(makeRectangle({ id: a, parent: { id: frame, key: keyOnTop(store, frame) }, name: 'A', x: 0, y: 0, width: 50, height: 20 }));
      tx.create(makeRectangle({ id: b, parent: { id: frame, key: keyOnTop(store, frame) }, name: 'B', x: 0, y: 30, width: 50, height: 20 }));
    });
    history.run('auto layout', (tx) => {
      applyAutoLayout(tx, frame);
      tx.set(frame, 'layoutSizingHorizontal', undefined);
      tx.set(frame, 'layoutSizingVertical', undefined);
      tx.set(frame, 'paddingRight', undefined);
      tx.set(frame, 'paddingBottom', undefined);
      tx.set(a, 'layoutSizingHorizontal', 'FILL');
      tx.set(b, 'layoutSizingVertical', 'FILL');
    });
    expect(store.getOrThrow(frame)).toMatchObject({ layoutMode: 'VERTICAL', itemSpacing: 10 });
    expect(box(a)).toEqual({ x: 0, y: 0, width: 100, height: 20 });
    expect(box(b)).toEqual({ x: 0, y: 30, width: 50, height: 70 });
    history.run('resize', (tx) => tx.set(frame, 'size', { width: 200, height: 200 }));
    expect(box(a).width).toBe(200);
    expect(box(b).height).toBe(170);
  });

  test('nested hugging frames grow their auto layout parents; preview leaves moved children alone', () => {
    const { ids, store, history, page, box } = setup();
    const [outer, inner, leaf, sibling] = [ids.next(), ids.next(), ids.next(), ids.next()];
    history.run('create', (tx) => {
      tx.create({ ...makeFrame({ id: outer, parent: { id: page, key: keyOnTop(store, page) }, name: 'Outer', x: 0, y: 0, width: 10, height: 10 }), layoutMode: 'HORIZONTAL', layoutSizingHorizontal: 'HUG', layoutSizingVertical: 'HUG', itemSpacing: 5 });
      tx.create({ ...makeFrame({ id: inner, parent: { id: outer, key: keyOnTop(store, outer) }, name: 'Inner', x: 0, y: 0, width: 10, height: 10 }), layoutMode: 'VERTICAL', layoutSizingHorizontal: 'HUG', layoutSizingVertical: 'HUG', paddingLeft: 4, paddingRight: 4 });
      tx.create(makeRectangle({ id: leaf, parent: { id: inner, key: keyOnTop(store, inner) }, name: 'Leaf', x: 0, y: 0, width: 20, height: 20 }));
      tx.create(makeRectangle({ id: sibling, parent: { id: outer, key: keyOnTop(store, outer) }, name: 'Sibling', x: 0, y: 0, width: 10, height: 10 }));
    });
    expect(box(inner)).toEqual({ x: 0, y: 0, width: 28, height: 20 });
    expect(box(sibling).x).toBe(33);
    expect(box(outer)).toMatchObject({ width: 43, height: 20 });

    const preview = createAutoLayoutFinalizer(() => null, { preview: true });
    const tx = history.begin('drag');
    tx.set(sibling, 'transform', [1, 0, 0, 1, 100, 100]);
    preview(tx);
    expect(box(sibling).x).toBe(100);
    history.commit(tx);
    expect(box(sibling).x).toBe(33);
  });
});
