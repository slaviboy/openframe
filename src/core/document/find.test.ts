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
import { createEmptyDocument, keyOnTop, makeEllipse, makeFrame, makePage, makeRectangle, makeSlice, makeText } from './factory';
import { findLayers, replaceInText } from './find';

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

describe('finding and replacing text', () => {
  test('a search can read the text a layer carries as well as its name', () => {
    const ids = new IdGenerator('t');
    const store = createEmptyDocument({ name: 'D', now: 'n', appVersion: 't', ids });
    const page = store.pages()[0]!;
    store.applyOp({
      kind: 'create',
      node: { ...makeText({ id: 't1', parent: { id: page, key: keyOnTop(store, page) }, name: 'Heading', x: 0, y: 0, width: 100, height: 20 }), characters: 'Buy now' } as Node,
    });

    // By name only, the words inside it are not looked at.
    expect(findLayers(store, [page], 'buy', new Set(), 1000, 'name')).toEqual([]);
    expect(findLayers(store, [page], 'buy', new Set(), 1000, 'text')).toEqual([{ id: 't1', pageId: page, inText: true }]);
    // Both reads either, and a name match is not marked as a text one.
    expect(findLayers(store, [page], 'heading', new Set(), 1000, 'both')).toEqual([{ id: 't1', pageId: page }]);
  });

  test('replacing rewrites every run of the words, whatever their case', () => {
    const ids = new IdGenerator('t');
    const store = createEmptyDocument({ name: 'D', now: 'n', appVersion: 't', ids });
    const page = store.pages()[0]!;
    store.applyOp({
      kind: 'create',
      node: { ...makeText({ id: 't1', parent: { id: page, key: keyOnTop(store, page) }, name: 'Heading', x: 0, y: 0, width: 100, height: 20 }), characters: 'Buy now, buy later' } as Node,
    });

    expect(replaceInText(store, ['t1'], 'buy', 'Get')).toEqual([{ id: 't1', characters: 'Get now, Get later' }]);
    // Words that are not there change nothing, and nor does an empty search.
    expect(replaceInText(store, ['t1'], 'sell', 'Get')).toEqual([]);
    expect(replaceInText(store, ['t1'], '  ', 'Get')).toEqual([]);
  });

  test('the words are taken as they are written, not as a pattern', () => {
    const ids = new IdGenerator('t');
    const store = createEmptyDocument({ name: 'D', now: 'n', appVersion: 't', ids });
    const page = store.pages()[0]!;
    store.applyOp({
      kind: 'create',
      node: { ...makeText({ id: 't1', parent: { id: page, key: keyOnTop(store, page) }, name: 'Heading', x: 0, y: 0, width: 100, height: 20 }), characters: 'Cost: $5.00 (each)' } as Node,
    });
    expect(replaceInText(store, ['t1'], '$5.00', '$6.00')).toEqual([{ id: 't1', characters: 'Cost: $6.00 (each)' }]);
    expect(replaceInText(store, ['t1'], '(each)', 'per item')).toEqual([{ id: 't1', characters: 'Cost: $5.00 per item' }]);
  });
});
