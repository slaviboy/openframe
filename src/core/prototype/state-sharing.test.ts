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
import { createEmptyDocument, keyOnTop, makeFrame, makeRectangle } from '../document/factory';
import type { DocumentStore } from '../document/store';
import { History } from '../history/history';
import { IdGenerator } from '../ids/ids';
import type { VideoPaint } from '../schema/document';
import { sharedVariants, sharedVideos } from './state-sharing';

let store: DocumentStore;
const video = (hash: string): VideoPaint => ({ type: 'VIDEO', videoHash: hash.repeat(64), scaleMode: 'FILL', opacity: 1, visible: true, blendMode: 'NORMAL' });

beforeEach(() => {
  const ids = new IdGenerator('t');
  store = createEmptyDocument({ name: 'D', now: 'n', appVersion: 't', ids });
  const page = store.pages()[0]!;
  const history = new History({ store, captureMeta: () => null, restoreMeta: () => undefined });
  const shape = (id: string, parent: string, name: string, x: number) => ({ id, parent: { id: parent, key: keyOnTop(store, parent) }, name, x, y: 0, width: 100, height: 100 });
  history.run('Build', (tx) => {
    // A toggle's component set (off and on), and another set.
    tx.create(makeFrame(shape('toggle-set', page, 'Toggle', 0)));
    tx.create(makeFrame(shape('off', 'toggle-set', 'State=Off', 0)));
    tx.create(makeFrame(shape('on', 'toggle-set', 'State=On', 0)));
    tx.create(makeFrame(shape('other-set', page, 'Other', 0)));
    tx.create(makeFrame(shape('other-variant', 'other-set', 'Kind=Other', 0)));
    // Screen / A and Screen / B share states; Settings doesn't match them.
    for (const [frame, name, x, hash] of [
      ['a', 'Screen / A', 200, 'a'],
      ['b', 'Screen / B', 400, 'b'],
      ['c', 'Settings', 600, 'c'],
    ] as const) {
      tx.create(makeFrame(shape(frame, page, name, x)));
      tx.create({ ...makeFrame(shape(`${frame}-toggle`, frame, 'Toggle', 0)), instance: { mainId: 'off' } });
      tx.create({ ...makeRectangle(shape(`${frame}-clip`, frame, 'Clip', 0)), fills: [video(hash)] });
    }
  });
});

describe('state sharing between matching layers', () => {
  test('an interactive component interacted with shares its variant with the matching one in the destination', () => {
    const changes = new Map([['a-toggle', 'on']]);
    expect([...sharedVariants(store, 'a', 'b', changes)]).toEqual([['b-toggle', 'on']]);
    // Not until it was interacted with, and not with frames that don't match.
    expect(sharedVariants(store, 'a', 'b', new Map()).size).toBe(0);
    expect(sharedVariants(store, 'a', 'c', changes).size).toBe(0);
    // Only variants of the destination's own component set.
    expect(sharedVariants(store, 'a', 'b', new Map([['a-toggle', 'other-variant']])).size).toBe(0);
  });

  test('a matching layer with another video takes the video state of the one left', () => {
    expect(sharedVideos(store, 'a', 'b')).toEqual([{ from: 'a'.repeat(64), to: 'b'.repeat(64) }]);
    expect(sharedVideos(store, 'a', 'c')).toEqual([]);
  });
});
