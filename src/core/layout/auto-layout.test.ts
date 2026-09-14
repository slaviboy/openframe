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
import { BLACK, createEmptyDocument, keyOnTop, makeFrame, makeRectangle, solid } from '../document/factory';
import { History } from '../history/history';
import { IdGenerator } from '../ids/ids';
import type { FrameNode, SceneNode } from '../schema/document';
import { applyAutoLayout, applyGridLayout, clearAutoLayout, clearGridLayout, createAutoLayoutFinalizer, setGridAutoPositioning, stackingOrder } from './auto-layout';

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

  test('min and max limits, ignore auto layout, excluded strokes and canvas stacking', () => {
    const { ids, store, history, page, box } = setup();
    const [frame, a, b, abs] = [ids.next(), ids.next(), ids.next(), ids.next()];
    history.run('create', (tx) => {
      tx.create({
        ...makeFrame({ id: frame, parent: { id: page, key: keyOnTop(store, page) }, name: 'F', x: 0, y: 0, width: 10, height: 10 }),
        layoutMode: 'HORIZONTAL',
        layoutSizingHorizontal: 'HUG',
        layoutSizingVertical: 'HUG',
        minWidth: 100,
        strokes: [solid(BLACK)],
        strokeWeight: 4,
        strokeAlign: 'INSIDE',
      });
      tx.create({ ...makeRectangle({ id: a, parent: { id: frame, key: keyOnTop(store, frame) }, name: 'A', x: 0, y: 0, width: 50, height: 20 }), maxWidth: 30 });
      tx.create(makeRectangle({ id: b, parent: { id: frame, key: keyOnTop(store, frame) }, name: 'B', x: 0, y: 0, width: 20, height: 20 }));
      tx.create({ ...makeRectangle({ id: abs, parent: { id: frame, key: keyOnTop(store, frame) }, name: 'Abs', x: 70, y: 5, width: 10, height: 10 }), layoutPositioning: 'ABSOLUTE', constraints: { horizontal: 'MAX', vertical: 'MIN' } });
    });
    // A is limited to 30; the inside stroke pads the flow; the frame's minimum width wins over hugging.
    expect(box(a)).toEqual({ x: 4, y: 4, width: 30, height: 20 });
    expect(box(b).x).toBe(34);
    expect(box(frame)).toMatchObject({ width: 100, height: 28 });
    expect(box(abs)).toMatchObject({ x: 70, y: 5 });

    history.run('exclude strokes', (tx) => tx.set(frame, 'strokesIncludedInLayout', false));
    expect(box(a)).toMatchObject({ x: 0, y: 0 });
    expect(box(frame).height).toBe(20);

    // The layer that ignores auto layout follows its constraints when the frame is resized.
    history.run('resize', (tx) => {
      tx.set(frame, 'layoutSizingHorizontal', undefined);
      tx.set(frame, 'size', { width: 150, height: 20 });
    });
    expect(box(abs).x).toBe(120);

    const node = store.getOrThrow(frame);
    expect(stackingOrder(node, store.children(frame))).toEqual([a, b, abs]);
    history.run('first on top', (tx) => tx.set(frame, 'itemReverseZIndex', true));
    expect(stackingOrder(store.getOrThrow(frame), store.children(frame))).toEqual([abs, b, a]);
  });

  test('grid flow: columns and gaps from the arrangement, spans, manual positioning, and switching back', () => {
    const { ids, store, history, page, box, node } = setup();
    const frame = ids.next();
    const kids = [ids.next(), ids.next(), ids.next(), ids.next()];
    history.run('create', (tx) => {
      tx.create(makeFrame({ id: frame, parent: { id: page, key: keyOnTop(store, page) }, name: 'F', x: 0, y: 0, width: 230, height: 230 }));
      // Two rows of two 100 px squares, 10 px apart and 10 px from the edges; created in reverse order.
      [...kids].reverse().forEach((id) => {
        const i = kids.indexOf(id);
        tx.create(makeRectangle({ id, parent: { id: frame, key: keyOnTop(store, frame) }, name: id, x: 10 + (i % 2) * 110, y: 10 + Math.floor(i / 2) * 110, width: 100, height: 100 }));
      });
    });
    history.run('grid', (tx) => applyGridLayout(tx, frame));
    expect(node<FrameNode>(frame)).toMatchObject({ layoutMode: 'GRID', gridColumnGap: 10, gridRowGap: 10, paddingLeft: 10, layoutSizingHorizontal: 'HUG' });
    expect(node<FrameNode>(frame).gridColumnSizes).toHaveLength(2);
    expect(store.children(frame)).toEqual(kids);
    expect(box(kids[3]!)).toMatchObject({ x: 120, y: 120 });
    expect(box(frame)).toMatchObject({ width: 230, height: 230 });

    history.run('span', (tx) => tx.set(kids[0]!, 'gridColumnSpan', 2));
    expect(box(kids[3]!)).toMatchObject({ x: 10, y: 230 });
    expect(box(frame).height).toBe(340);

    // Manual positioning keeps each child in its cell when a sibling is hidden.
    history.run('manual', (tx) => setGridAutoPositioning(tx, frame, false));
    expect(node(kids[3]!)).toMatchObject({ gridColumn: 0, gridRow: 2 });
    history.run('hide', (tx) => tx.set(kids[1]!, 'visible', false));
    expect(box(kids[2]!).x).toBe(120);

    history.run('horizontal', (tx) => {
      clearGridLayout(tx, frame);
      tx.set(frame, 'layoutMode', 'HORIZONTAL');
    });
    expect(node(kids[0]!).gridColumnSpan).toBeUndefined();
    expect(node<FrameNode>(frame)).toMatchObject({ layoutMode: 'HORIZONTAL', itemSpacing: 10 });
    expect(box(kids[2]!).x).toBe(120);
  });
});
