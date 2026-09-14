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
import { SceneIndex } from '../scene/scene-index';
import type { SceneNode } from '../schema/document';
import { clampScroll, needsBiggerContent, scrolledFrameStore, scrollFrameOf, scrollLimits, wheelScrollTarget } from './scroll';

let store: DocumentStore;
let index: SceneIndex;

beforeEach(() => {
  const ids = new IdGenerator('s');
  store = createEmptyDocument({ name: 'D', now: 'n', appVersion: 't', ids });
  const page = store.pages()[0]!;
  const history = new History({ store, captureMeta: () => null, restoreMeta: () => undefined });
  const shape = (id: string, parent: string, x: number, y: number, width: number, height: number) => ({ id, parent: { id: parent, key: keyOnTop(store, parent) }, name: id, x, y, width, height });
  history.run('Build', (tx) => {
    tx.create({ ...makeFrame(shape('screen', page, 0, 0, 100, 100)), overflowDirection: 'VERTICAL' });
    tx.create(makeRectangle(shape('long', 'screen', 0, 150, 50, 40)));
    tx.create({ ...makeRectangle(shape('bar', 'screen', 0, 0, 100, 10)), scrollBehavior: 'FIXED' });
    tx.create({ ...makeRectangle(shape('header', 'screen', 0, 20, 100, 10)), scrollBehavior: 'STICKY_SCROLLS' });
    tx.create({ ...makeFrame(shape('slider', 'screen', 0, 40, 60, 30)), overflowDirection: 'HORIZONTAL' });
    tx.create(makeRectangle(shape('slide', 'slider', 50, 0, 50, 30)));
    tx.create({ ...makeFrame(shape('empty', page, 300, 0, 100, 100)), overflowDirection: 'BOTH' });
    // A sticky title nested in a card.
    tx.create(makeFrame(shape('card', 'screen', 0, 80, 100, 40)));
    tx.create({ ...makeRectangle(shape('title', 'card', 0, 0, 100, 10)), scrollBehavior: 'STICKY_SCROLLS' });
  });
  index = new SceneIndex(store);
  index.ensure(page);
});

describe('prototype scrolling', () => {
  test('limits follow the overflow direction and the content beyond the frame', () => {
    expect(scrollLimits(store, index, 'screen')).toEqual({ x: 0, y: 90 });
    expect(scrollLimits(store, index, 'slider')).toEqual({ x: 40, y: 0 });
    expect(needsBiggerContent(store, index, 'empty')).toBe(true);
    expect(needsBiggerContent(store, index, 'screen')).toBe(false);
    expect(scrollFrameOf(store, 'slide')).toBe('slider');
    expect(scrollFrameOf(store, 'long')).toBe('screen');
    expect(scrollFrameOf(store, 'screen')).toBeNull();
    expect(clampScroll({ x: -5, y: 500 }, { x: 0, y: 90 })).toEqual({ x: 0, y: 90 });
  });

  test('a scroll moves the deepest frame with room that way', () => {
    const none = new Map();
    expect(wheelScrollTarget(store, index, ['slide', 'slider', 'screen'], { x: 10, y: 0 }, none)).toBe('slider');
    expect(wheelScrollTarget(store, index, ['slide', 'slider', 'screen'], { x: 0, y: 10 }, none)).toBe('screen');
    expect(wheelScrollTarget(store, index, ['slide', 'slider', 'screen'], { x: 10, y: 0 }, new Map([['slider', { x: 40, y: 0 }]]))).toBeNull();
    expect(wheelScrollTarget(store, index, ['long', 'screen'], { x: 0, y: -10 }, none)).toBeNull();
  });

  test('scrolled content moves; fixed layers stay above it and sticky layers stop at the top', () => {
    const scrolled = scrolledFrameStore(store, 'screen', new Map([['screen', { x: 0, y: 50 }]]));
    const y = (id: string) => (scrolled.getOrThrow(id) as SceneNode).transform[5];
    expect(y('long')).toBe(100);
    expect(y('bar')).toBe(0);
    expect(y('header')).toBe(0);
    expect(y('slider')).toBe(-10);
    expect(scrolled.children('screen').at(-1)).toBe('bar');
    expect(scrolled.has('empty')).toBe(false);
  });

  test('a nested sticky layer sticks at the frame top within its parent, then scrolls away with it', () => {
    const titleAt = (scroll: number) => (scrolledFrameStore(store, 'screen', new Map([['screen', { x: 0, y: scroll }]])).getOrThrow('title') as SceneNode).transform[5];
    expect(titleAt(50)).toBe(0);
    expect(titleAt(90)).toBe(10);
    expect(titleAt(150)).toBe(30);
  });
});
