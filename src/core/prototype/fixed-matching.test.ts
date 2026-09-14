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
import type { SceneNode } from '../schema/document';
import { matchedLayersStore, withoutMatchingLayersStore } from './smart-animate';

let store: DocumentStore;

beforeEach(() => {
  const ids = new IdGenerator('f');
  store = createEmptyDocument({ name: 'D', now: 'n', appVersion: 't', ids });
  const page = store.pages()[0]!;
  const history = new History({ store, captureMeta: () => null, restoreMeta: () => undefined });
  const shape = (id: string, parent: string, name: string, x: number) => ({ id, parent: { id: parent, key: keyOnTop(store, parent) }, name, x, y: 0, width: 20, height: 20 });
  history.run('Build', (tx) => {
    tx.create(makeFrame(shape('home', page, 'home', 0)));
    tx.create(makeFrame(shape('about', page, 'about', 500)));
    // A fixed bar and a title in both frames (they match by name), at different places.
    for (const [frame, x] of [
      ['home', 0],
      ['about', 40],
    ] as const) {
      tx.create({ ...makeRectangle(shape(`${frame}-bar`, frame, 'bar', x)), scrollBehavior: 'FIXED' });
      tx.create(makeRectangle(shape(`${frame}-title`, frame, 'title', x * 2.5)));
    }
    // A fixed toast in each frame, without a match.
    tx.create({ ...makeRectangle(shape('home-toast', 'home', 'home toast', 0)), scrollBehavior: 'FIXED' });
    tx.create({ ...makeRectangle(shape('about-toast', 'about', 'about toast', 0)), scrollBehavior: 'FIXED' });
  });
});

describe('fixed layers with Animate matching layers', () => {
  test('matching fixed layers get no transition, while the other matching layers still animate', () => {
    const still = matchedLayersStore(store, 'home', 'about', 0.5);
    const x = (id: string) => (still.getOrThrow(id) as SceneNode).transform[4];
    expect(x('about-bar')).toBe(40);
    expect(x('about-title')).toBe(50);
  });

  test('fixed layers without a match dissolve where they are instead of moving with their frames', () => {
    const still = matchedLayersStore(store, 'home', 'about', 0.25);
    const opacity = (id: string) => (still.getOrThrow(id) as SceneNode).opacity;
    expect(opacity('about-toast')).toBe(0.25);
    expect(opacity('home-toast')).toBe(0.75);
    expect(still.parentOf('home-toast')).toBe('about');
    // The moving frames leave them out, as they do the matching layers.
    const arriving = withoutMatchingLayersStore(store, 'about', 'home');
    expect(arriving.has('about-toast')).toBe(false);
    expect(arriving.has('about-bar')).toBe(false);
    expect(arriving.has('about-title')).toBe(false);
    expect(withoutMatchingLayersStore(store, 'home', 'about').has('home-toast')).toBe(false);
  });
});
