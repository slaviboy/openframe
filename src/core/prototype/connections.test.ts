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
import type { PrototypeAction } from '../schema/document';
import { connectionsOnPage, distanceToNoodle, noodleBetween, noodlePoint, visibleConnections } from './connections';

const go = (navigation: 'NAVIGATE' | 'SCROLL_TO', destinationId: string | null): PrototypeAction => ({ type: 'NODE', navigation, destinationId, transition: { type: 'INSTANT' } });

describe('prototype connections', () => {
  test('connections on the page, and the ones the canvas shows for a selection', () => {
    const ids = new IdGenerator('c');
    const store = createEmptyDocument({ name: 'D', now: 'n', appVersion: 't', ids });
    const page = store.pages()[0]!;
    const history = new History({ store, captureMeta: () => null, restoreMeta: () => undefined });
    const init = (id: string, parent: string) => ({ id, parent: { id: parent, key: keyOnTop(store, parent) }, name: id, x: 0, y: 0, width: 10, height: 10 });
    history.run('Build', (tx) => {
      tx.create(makeFrame(init('home', page)));
      tx.create({ ...makeRectangle(init('button', 'home')), reactions: [{ trigger: { type: 'ON_CLICK' }, actions: [go('NAVIGATE', 'about'), { type: 'BACK' }, go('SCROLL_TO', 'button'), go('NAVIGATE', null), go('NAVIGATE', 'gone')] }] });
      tx.create(makeFrame(init('about', page)));
      tx.create({ ...makeRectangle(init('link', 'about')), reactions: [{ trigger: { type: 'ON_CLICK' }, actions: [go('NAVIGATE', 'home')] }] });
    });
    expect(connectionsOnPage(store, page)).toEqual([
      { sourceId: 'button', reactionIndex: 0, actionIndex: 0, destinationId: 'about', scroll: false },
      { sourceId: 'button', reactionIndex: 0, actionIndex: 2, destinationId: 'button', scroll: true },
      { sourceId: 'link', reactionIndex: 0, actionIndex: 0, destinationId: 'home', scroll: false },
    ]);
    expect(visibleConnections(store, page, []).map((c) => c.sourceId)).toEqual(['button', 'button', 'link']);
    // Selecting a frame shows the connections starting in it.
    expect(visibleConnections(store, page, ['about']).map((c) => c.sourceId)).toEqual(['link']);
    expect(visibleConnections(store, page, ['button']).map((c) => c.actionIndex)).toEqual([0, 2]);
  });

  test('noodles leave the side facing the destination and arrive at its facing side', () => {
    const right = noodleBetween({ x: 0, y: 0, width: 100, height: 40 }, { x: 300, y: 100, width: 200, height: 100 });
    expect(right).toEqual({ start: { x: 100, y: 20 }, c1: { x: 200, y: 20 }, c2: { x: 200, y: 150 }, end: { x: 300, y: 150 }, side: 'left' });
    const left = noodleBetween({ x: 600, y: 0, width: 100, height: 40 }, { x: 0, y: 0, width: 200, height: 40 });
    expect(left).toMatchObject({ start: { x: 600, y: 20 }, end: { x: 200, y: 20 }, side: 'right' });
    const below = noodleBetween({ x: 0, y: 0, width: 100, height: 40 }, { x: 0, y: 500, width: 100, height: 100 });
    expect(below).toMatchObject({ start: { x: 50, y: 40 }, end: { x: 50, y: 500 }, side: 'top' });
    expect(noodlePoint(right, 0)).toEqual(right.start);
    expect(noodlePoint(right, 1)).toEqual(right.end);
    expect(distanceToNoodle(right, { x: 100, y: 20 })).toBe(0);
    expect(distanceToNoodle(right, { x: 100, y: 300 })).toBeGreaterThan(100);
  });
});
