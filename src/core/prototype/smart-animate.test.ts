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
import { createEmptyDocument, keyOnTop, makeEllipse, makeFrame, makeRectangle, solid } from '../document/factory';
import type { DocumentStore } from '../document/store';
import { History } from '../history/history';
import { IdGenerator } from '../ids/ids';
import type { SceneNode, SolidPaint } from '../schema/document';
import { blendTransform, canSmartAnimate, matchLayers, smartAnimateStore } from './smart-animate';

let store: DocumentStore;
let page: string;
let history: History<null>;
const red = { r: 1, g: 0, b: 0, a: 1 };
const blue = { r: 0, g: 0, b: 1, a: 1 };

beforeEach(() => {
  const ids = new IdGenerator('s');
  store = createEmptyDocument({ name: 'D', now: 'n', appVersion: 't', ids });
  page = store.pages()[0]!;
  history = new History({ store, captureMeta: () => null, restoreMeta: () => undefined });
  const shape = (id: string, parent: string, name: string, x: number, width = 100) => ({ id, parent: { id: parent, key: keyOnTop(store, parent) }, name, x, y: 0, width, height: 50 });
  history.run('Build', (tx) => {
    tx.create(makeFrame(shape('a', page, 'Screen A', 0, 400)));
    tx.create({ ...makeRectangle(shape('a-card', 'a', 'Card', 0)), fills: [solid(red)], cornerRadius: 0 });
    tx.create(makeRectangle(shape('a-title', 'a-card', 'Title', 10, 20)));
    tx.create(makeRectangle(shape('a-old', 'a', 'Old', 300, 20)));
    tx.create(makeFrame(shape('b', page, 'Screen B', 500, 400)));
    tx.create({ ...makeRectangle(shape('b-card', 'b', 'Card', 100, 200)), fills: [solid(blue)], opacity: 0.5, cornerRadius: 20 });
    tx.create(makeRectangle(shape('b-title', 'b-card', 'Title', 30, 20)));
    tx.create(makeRectangle(shape('b-new', 'b', 'New', 200, 20)));
  });
});

const node = (s: DocumentStore, id: string) => s.getOrThrow(id) as SceneNode;

describe('smart animate', () => {
  test('layers match by name and place in the hierarchy', () => {
    expect([...matchLayers(store, 'a', 'b')]).toEqual([
      ['b', 'a'],
      ['b-card', 'a-card'],
      ['b-title', 'a-title'],
    ]);
    expect(canSmartAnimate(store, 'a', 'b')).toBe(true);
  });

  test('halfway: matching layers blend, new layers dissolve in, and layers left dissolve out', () => {
    const mid = smartAnimateStore(store, 'a', 'b', 0.5);
    const card = node(mid, 'b-card');
    expect(card.transform).toEqual([1, 0, -0, 1, 50, 0]);
    expect(card.size).toEqual({ width: 150, height: 50 });
    expect(card.opacity).toBe(0.75);
    expect((card as SceneNode & { cornerRadius: number }).cornerRadius).toBe(10);
    expect(((card as SceneNode & { fills: SolidPaint[] }).fills[0]!).color).toEqual({ r: 0.5, g: 0, b: 0.5, a: 1 });
    expect(node(mid, 'b-title').transform[4]).toBe(20);
    expect(node(mid, 'b-new').opacity).toBe(0.5);
    // The layer left keeps its place in the frame while it fades.
    expect(node(mid, 'a-old')).toMatchObject({ opacity: 0.5, parent: { id: 'b' } });
    expect(mid.children('b')).toEqual(expect.arrayContaining(['b-card', 'b-new', 'a-old']));
    // Only the destination frame is in the document.
    expect(mid.has('a')).toBe(false);
    expect(node(smartAnimateStore(store, 'a', 'b', 1), 'b-card')).toMatchObject({ opacity: 0.5, size: { width: 200, height: 50 } });
  });

  test('rotation turns the shorter way round', () => {
    const angle = (deg: number) => (deg * Math.PI) / 180;
    const rotated = (deg: number) => [Math.cos(angle(deg)), Math.sin(angle(deg)), -Math.sin(angle(deg)), Math.cos(angle(deg)), 0, 0] as const;
    const half = blendTransform(rotated(170), rotated(-170), 0.5);
    expect(Math.abs(Math.atan2(half[1], half[0]) * (180 / Math.PI))).toBeCloseTo(180);
  });

  test('shadows and changing shapes dissolve instead', () => {
    history.run('Shape', (tx) => {
      tx.delete('b-title');
      tx.delete('b-card');
      tx.create(makeEllipse({ id: 'b-oval', parent: { id: 'b', key: keyOnTop(tx.store, 'b') }, name: 'Card', x: 0, y: 0, width: 10, height: 10 }));
    });
    expect(canSmartAnimate(store, 'a', 'b')).toBe(false);
  });
});
