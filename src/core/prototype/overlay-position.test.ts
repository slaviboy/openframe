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
import type { PrototypeAction, Reaction } from '../schema/document';
import { runReaction, startPlayer } from './player';
import { composeScene, positionInFrame } from './presentation';

let store: DocumentStore;
let page: string;
const open = (destinationId: string, overlayRelativePosition?: { x: number; y: number }): Reaction => ({
  trigger: { type: 'ON_CLICK' },
  actions: [{ type: 'NODE', navigation: 'OVERLAY', destinationId, transition: { type: 'INSTANT' }, ...(overlayRelativePosition ? { overlayRelativePosition } : {}) } as PrototypeAction],
});

beforeEach(() => {
  const ids = new IdGenerator('o');
  store = createEmptyDocument({ name: 'D', now: 'n', appVersion: 't', ids });
  page = store.pages()[0]!;
  const history = new History({ store, captureMeta: () => null, restoreMeta: () => undefined });
  const shape = (id: string, parent: string, x: number, y: number, width: number, height: number) => ({ id, parent: { id: parent, key: keyOnTop(store, parent) }, name: id, x, y, width, height });
  history.run('Build', (tx) => {
    tx.create(makeFrame(shape('home', page, 100, 100, 400, 300)));
    tx.create(makeFrame(shape('bar', 'home', 10, 200, 300, 80)));
    tx.create(makeRectangle(shape('button', 'bar', 20, 30, 100, 20)));
    tx.create({ ...makeFrame(shape('menu', page, 0, 600, 200, 100)), overlay: { position: 'MANUAL', closeOnClickOutside: false, background: null } });
    tx.create({ ...makeFrame(shape('sheet', page, 0, 900, 200, 100)), overlay: { position: 'BOTTOM_CENTER', closeOnClickOutside: false, background: null } });
  });
});

describe('manual overlay positions', () => {
  test('a layer’s position in its top-level frame adds up its parents', () => {
    expect(positionInFrame(store, 'button')).toEqual({ frameId: 'home', x: 30, y: 230 });
    expect(positionInFrame(store, 'home')).toEqual({ frameId: 'home', x: 0, y: 0 });
  });

  test('a manually positioned overlay opens at its offset from the hotspot; others keep their position', () => {
    const start = startPlayer(store, page, 'home')!;
    const opened = runReaction(store, start, open('menu', { x: 5, y: -110 }), 'button').state;
    expect(opened.overlayAnchors).toEqual({ menu: { hotspotId: 'button', offset: { x: 5, y: -110 } } });
    // Home fits the 800 × 600 window at scale 1, its top-left at (200, 150).
    const scene = composeScene(store, opened, { width: 800, height: 600 }, 'FIT', 0, null);
    expect(scene.items.at(-1)).toMatchObject({ kind: 'frame', frameId: 'menu', x: 200 + 30 + 5, y: 150 + 230 - 110 });

    const sheet = runReaction(store, start, open('sheet', { x: 5, y: 5 }), 'button').state;
    expect(sheet.overlayAnchors).toBeUndefined();
    expect(composeScene(store, sheet, { width: 800, height: 600 }, 'FIT', 0, null).items.at(-1)).toMatchObject({ frameId: 'sheet', x: 300, y: 350 });
  });
});
