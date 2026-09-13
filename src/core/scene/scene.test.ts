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
import { createEmptyDocument, makeEllipse, makeFrame, makeGroup, makeRectangle } from '../document/factory';
import type { DocumentStore } from '../document/store';
import { keyBetween } from '../ids/fractional-index';
import { IdGenerator } from '../ids/ids';
import { rotation, multiply, translation } from '../math/matrix';
import type { Node } from '../schema/document';
import { hitTestDeepest, isInteractive, marqueeSelect, selectionTarget } from './hit-test';
import { SceneIndex } from './scene-index';

let store: DocumentStore;
let index: SceneIndex;
let page: string;
let ids: IdGenerator;
let lastKey: string | null;

const add = (node: Node) => {
  store.applyOp({ kind: 'create', node });
  return node.id;
};
const key = () => (lastKey = keyBetween(lastKey, null));
const opts = { tolerance: 0 };

beforeEach(() => {
  ids = new IdGenerator('s');
  store = createEmptyDocument({ name: 'D', now: 'n', appVersion: 't', ids });
  page = store.pages()[0]!;
  index = new SceneIndex(store);
  lastKey = null;
});

describe('SceneIndex', () => {
  test('world bounds compose parent transforms and rotation', () => {
    const frame = add(makeFrame({ id: ids.next(), parent: { id: page, key: key() }, name: 'F', x: 100, y: 100, width: 200, height: 200 }));
    const rect = makeRectangle({ id: ids.next(), parent: { id: frame, key: key() }, name: 'R', x: 10, y: 20, width: 40, height: 10 });
    const m = multiply(translation(10, 20), rotation(Math.PI / 2));
    add({ ...rect, transform: [m.a, m.b, m.c, m.d, m.e, m.f] });
    index.ensure(page);
    const b = index.worldBounds(rect.id)!;
    expect(b.x).toBeCloseTo(100);
    expect(b.y).toBeCloseTo(120);
    expect(b.width).toBeCloseTo(10);
    expect(b.height).toBeCloseTo(40);
  });

  test('reported geometry changes update subtrees incrementally, including lazy spatial queries', () => {
    const frame = add(makeFrame({ id: ids.next(), parent: { id: page, key: key() }, name: 'F', x: 0, y: 0, width: 100, height: 100 }));
    const child = add(makeRectangle({ id: ids.next(), parent: { id: frame, key: key() }, name: 'C', x: 10, y: 10, width: 5, height: 5 }));
    index.ensure(page);
    store.applyOp({ kind: 'set', id: frame, field: 'transform', value: [1, 0, 0, 1, 1000, 0], prev: [1, 0, 0, 1, 0, 0] });
    index.applyChange({ nodes: new Map([[frame, new Set(['transform'])]]), structural: new Set() });
    index.ensure(page);
    expect(index.worldBounds(child)!.x).toBe(1010);
    expect(index.query({ x: 1005, y: 5, width: 20, height: 20 })).toContain(child);
    expect(index.query({ x: 5, y: 5, width: 20, height: 20 })).not.toContain(child);
  });

  test('structural changes force a full rebuild', () => {
    const a = add(makeRectangle({ id: ids.next(), parent: { id: page, key: key() }, name: 'A', x: 0, y: 0, width: 5, height: 5 }));
    index.ensure(page);
    const b = makeRectangle({ id: ids.next(), parent: { id: page, key: key() }, name: 'B', x: 50, y: 0, width: 5, height: 5 });
    store.applyOp({ kind: 'create', node: b });
    index.applyChange({ nodes: new Map([[b.id, new Set(['$created'])]]), structural: new Set([page]) });
    index.ensure(page);
    expect(index.worldBounds(b.id)!.x).toBe(50);
    expect(index.worldBounds(a)!.x).toBe(0);
  });

  test('rebuilds after document changes', () => {
    const r = add(makeRectangle({ id: ids.next(), parent: { id: page, key: key() }, name: 'R', x: 0, y: 0, width: 10, height: 10 }));
    index.ensure(page);
    store.applyOp({ kind: 'set', id: r, field: 'transform', value: [1, 0, 0, 1, 500, 0], prev: [1, 0, 0, 1, 0, 0] });
    index.ensure(page);
    expect(index.worldBounds(r)!.x).toBe(500);
  });
});

describe('hit testing', () => {
  test('topmost wins; ellipse corners miss', () => {
    const a = add(makeRectangle({ id: ids.next(), parent: { id: page, key: key() }, name: 'A', x: 0, y: 0, width: 100, height: 100 }));
    const b = add(makeEllipse({ id: ids.next(), parent: { id: page, key: key() }, name: 'B', x: 0, y: 0, width: 100, height: 100 }));
    expect(hitTestDeepest(store, index, page, { x: 50, y: 50 }, opts)).toBe(b);
    expect(hitTestDeepest(store, index, page, { x: 3, y: 3 }, opts)).toBe(a);
    expect(hitTestDeepest(store, index, page, { x: 300, y: 3 }, opts)).toBeNull();
  });

  test('rounded corners, rotation, clipping, hidden and locked', () => {
    const frame = add(makeFrame({ id: ids.next(), parent: { id: page, key: key() }, name: 'F', x: 0, y: 0, width: 50, height: 50 }));
    const rect = makeRectangle({ id: ids.next(), parent: { id: frame, key: key() }, name: 'R', x: 0, y: 0, width: 100, height: 100 });
    add({ ...rect, cornerRadius: 20 });
    // Inside rect but clipped by frame → frame is hit.
    expect(hitTestDeepest(store, index, page, { x: 80, y: 20 }, opts)).toBeNull();
    expect(hitTestDeepest(store, index, page, { x: 30, y: 30 }, opts)).toBe(rect.id);
    expect(hitTestDeepest(store, index, page, { x: 1, y: 1 }, opts)).toBe(frame);
    store.applyOp({ kind: 'set', id: rect.id, field: 'visible', value: false, prev: true });
    expect(hitTestDeepest(store, index, page, { x: 30, y: 30 }, opts)).toBe(frame);
    store.applyOp({ kind: 'set', id: frame, field: 'locked', value: true, prev: false });
    expect(hitTestDeepest(store, index, page, { x: 30, y: 30 }, opts)).toBeNull();
    expect(isInteractive(store, rect.id)).toBe(false);
  });
});

describe('selection targeting', () => {
  const build = () => {
    const board = add(makeFrame({ id: ids.next(), parent: { id: page, key: key() }, name: 'Board', x: 0, y: 0, width: 400, height: 400 }));
    const rect = add(makeRectangle({ id: ids.next(), parent: { id: board, key: key() }, name: 'R', x: 10, y: 10, width: 50, height: 50 }));
    const group = add(makeGroup({ id: ids.next(), parent: { id: board, key: key() }, name: 'G', x: 100, y: 100, width: 100, height: 100 }));
    const inGroup = add(makeRectangle({ id: ids.next(), parent: { id: group, key: key() }, name: 'GR', x: 0, y: 0, width: 50, height: 50 }));
    const inGroup2 = add(makeRectangle({ id: ids.next(), parent: { id: group, key: key() }, name: 'GR2', x: 60, y: 0, width: 40, height: 50 }));
    return { board, rect, group, inGroup, inGroup2 };
  };

  test('artboard children are selected directly; groups select as a unit', () => {
    const t = build();
    expect(selectionTarget(store, page, t.rect, [], false)).toBe(t.rect);
    expect(selectionTarget(store, page, t.inGroup, [], false)).toBe(t.group);
    expect(selectionTarget(store, page, t.inGroup, [], true)).toBe(t.inGroup);
  });

  test('sibling context keeps selection depth', () => {
    const t = build();
    expect(selectionTarget(store, page, t.inGroup2, [t.inGroup], false)).toBe(t.inGroup2);
  });

  test('marquee selects intersecting children inside an artboard', () => {
    const t = build();
    const sel = marqueeSelect(store, index, page, { x: 0, y: 0, width: 70, height: 70 }, page, false);
    expect(sel).toEqual([t.rect]);
    const all = marqueeSelect(store, index, page, { x: -10, y: -10, width: 500, height: 500 }, page, false);
    expect(all).toEqual([t.board]);
    const deep = marqueeSelect(store, index, page, { x: 90, y: 90, width: 200, height: 200 }, page, true);
    expect(deep).toEqual([t.inGroup, t.inGroup2]);
  });
});
