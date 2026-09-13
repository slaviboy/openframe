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
import { keyBetween } from '../ids/fractional-index';
import { IdGenerator, ROOT_ID } from '../ids/ids';
import type { Node } from '../schema/document';
import { createEmptyDocument, keyOnTop, makeEllipse, makeFrame, makePage, makeRectangle, makeSlice } from './factory';
import { findLayers } from './find';

function doc() {
  const ids = new IdGenerator('f');
  const store = createEmptyDocument({ name: 'F', now: 'n', appVersion: 't', ids });
  const page1 = store.pages()[0]!;
  const page2 = ids.next();
  store.applyOp({ kind: 'create', node: makePage(page2, 'Page 2', keyBetween(store.getOrThrow(page1).type === 'PAGE' ? (store.getOrThrow(page1) as { parent: { key: string } }).parent.key : null, null)) });
  const add = (make: (i: { id: string; parent: { id: string; key: string }; name: string; x: number; y: number; width: number; height: number }) => Node, name: string, parent: string, patch: Partial<Node> = {}) => {
    const id = ids.next();
    store.applyOp({ kind: 'create', node: { ...make({ id, parent: { id: parent, key: keyOnTop(store, parent) }, name, x: 0, y: 0, width: 10, height: 10 }), ...patch } as Node });
    return id;
  };
  const card = add(makeFrame, 'Card', page1);
  const button = add(makeRectangle, 'Button background', card);
  const avatar = add(makeEllipse, 'Avatar', card, { visible: false });
  const cardSlice = add(makeSlice, 'Card export', page1);
  const other = add(makeRectangle, 'card shadow', page2);
  return { store, page1, page2, card, button, avatar, cardSlice, other };
}

describe('findLayers', () => {
  test('case-insensitive name search in layers-panel order, including hidden layers', () => {
    const d = doc();
    expect(findLayers(d.store, [d.page1], 'CARD').map((r) => r.id)).toEqual([d.cardSlice, d.card]);
    expect(findLayers(d.store, [d.page1], 'a').map((r) => r.id)).toEqual([d.cardSlice, d.card, d.avatar, d.button]);
    expect(findLayers(d.store, [d.page1], '   ')).toEqual([]);
  });

  test('all pages and type filters', () => {
    const d = doc();
    expect(findLayers(d.store, [d.page1, d.page2], 'card')).toEqual([
      { id: d.cardSlice, pageId: d.page1 },
      { id: d.card, pageId: d.page1 },
      { id: d.other, pageId: d.page2 },
    ]);
    expect(findLayers(d.store, [d.page1, d.page2], 'card', new Set(['shape'])).map((r) => r.id)).toEqual([d.other]);
    expect(findLayers(d.store, [d.page1], 'card', new Set(['frame', 'slice'])).map((r) => r.id)).toEqual([d.cardSlice, d.card]);
    expect(findLayers(d.store, [d.page1, d.page2], 'a', new Set(), 2)).toHaveLength(2);
    expect(ROOT_ID).toBe('0:0');
  });
});
