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
import { createEmptyDocument, keyOnTop, makeFrame, makeRectangle, makeSection } from '../document/factory';
import type { DocumentStore } from '../document/store';
import { History } from '../history/history';
import { IdGenerator } from '../ids/ids';
import type { PrototypeAction, Reaction } from '../schema/document';
import { visibleConnections } from './connections';
import { framesIn, presentableFrames, runReaction, startPlayer } from './player';
import { destinationCandidates, topLevelFrame } from './reactions';

let store: DocumentStore;
let page: string;

const go = (destinationId: string): PrototypeAction => ({ type: 'NODE', navigation: 'NAVIGATE', destinationId, transition: { type: 'INSTANT' } });
const on = (action: PrototypeAction): Reaction => ({ trigger: { type: 'ON_CLICK' }, actions: [action] });

beforeEach(() => {
  const ids = new IdGenerator('s');
  store = createEmptyDocument({ name: 'D', now: 'n', appVersion: 't', ids });
  page = store.pages()[0]!;
  const history = new History({ store, captureMeta: () => null, restoreMeta: () => undefined });
  const shape = (id: string, parent: string, x: number, y: number) => ({ id, parent: { id: parent, key: keyOnTop(store, parent) }, name: id, x, y, width: 100, height: 100 });
  history.run('Build', (tx) => {
    tx.create(makeFrame(shape('home', page, 0, 0)));
    tx.create({ ...makeRectangle(shape('button', 'home', 0, 0)), reactions: [on(go('browse'))] });
    tx.create(makeSection(shape('browse', page, 500, 0)));
    tx.create(makeFrame(shape('shoes', 'browse', 200, 20)));
    tx.create(makeFrame(shape('hats', 'browse', 20, 20)));
    tx.create({ ...makeRectangle(shape('home-link', 'hats', 0, 0)), reactions: [on(go('shoes'))] });
    tx.create({ ...makeRectangle(shape('back-link', 'shoes', 0, 0)), reactions: [on(go('home'))] });
    // A layer of an instance, with an interaction inherited from its main component.
    tx.create({ ...makeFrame(shape('tabbar', 'home', 0, 50)), instance: { mainId: 'main' } });
    tx.create({ ...makeRectangle(shape('tab', 'tabbar', 0, 0)), source: 'main-tab', reactions: [on(go('home'))] });
  });
});

describe('sections in prototypes', () => {
  test('frames in sections are top-level frames and screens, and sections are Navigate to destinations', () => {
    expect(topLevelFrame(store, 'home-link')).toBe('hats');
    expect(topLevelFrame(store, 'browse')).toBeNull();
    expect(framesIn(store, 'browse')).toEqual(['hats', 'shoes']);
    expect(presentableFrames(store, page)).toEqual(['home', 'hats', 'shoes']);
    expect(destinationCandidates(store, 'button', 'NAVIGATE')).toEqual(['browse', 'shoes', 'hats']);
    expect(destinationCandidates(store, 'button', 'OVERLAY')).toEqual(['shoes', 'hats']);
  });

  test('navigating to a section goes to the frame of it visited last, or its first', () => {
    const start = startPlayer(store, page, 'home')!;
    let state = runReaction(store, start, on(go('browse'))).state;
    expect(state.frameId).toBe('hats');
    state = runReaction(store, state, on(go('shoes'))).state;
    state = runReaction(store, state, on(go('home'))).state;
    expect(state.frameId).toBe('home');
    state = runReaction(store, state, on(go('browse'))).state;
    expect(state.frameId).toBe('shoes');
  });

  test('connections inherited from a main component show only while their instance is selected', () => {
    const sources = (selection: string[]) => visibleConnections(store, page, selection).map((c) => c.sourceId);
    expect(sources([])).not.toContain('tab');
    expect(sources(['home'])).not.toContain('tab');
    expect(sources(['tabbar'])).toContain('tab');
    expect(sources(['tab'])).toContain('tab');
  });
});
