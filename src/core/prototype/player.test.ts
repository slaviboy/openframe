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
import type { PrototypeAction, Reaction } from '../schema/document';
import {
  beginTemporary,
  delayedReactions,
  endTemporary,
  findReaction,
  hitTest,
  hotspots,
  keyReaction,
  presentableFrames,
  runReaction,
  startPlayer,
  stepScreen,
  type PlayerState,
} from './player';

let store: DocumentStore;
let index: SceneIndex;
let page: string;

const go = (navigation: 'NAVIGATE' | 'OVERLAY' | 'SWAP' | 'SCROLL_TO', destinationId: string): PrototypeAction => ({ type: 'NODE', navigation, destinationId, transition: { type: 'DISSOLVE', easing: { type: 'LINEAR' }, duration: 200 } });
const on = (actions: PrototypeAction[], trigger: Reaction['trigger'] = { type: 'ON_CLICK' }): Reaction => ({ trigger, actions });

beforeEach(() => {
  const ids = new IdGenerator('p');
  store = createEmptyDocument({ name: 'D', now: 'n', appVersion: 't', ids });
  page = store.pages()[0]!;
  const history = new History({ store, captureMeta: () => null, restoreMeta: () => undefined });
  const shape = (id: string, parent: string, x: number, y: number, width: number, height: number) => ({ id, parent: { id: parent, key: keyOnTop(store, parent) }, name: id, x, y, width, height });
  history.run('Build', (tx) => {
    tx.create(makeFrame(shape('home', page, 0, 0, 400, 300)));
    tx.create({ ...makeRectangle(shape('next', 'home', 20, 20, 100, 40)), reactions: [on([go('NAVIGATE', 'about')]), on([go('OVERLAY', 'menu')], { type: 'ON_KEY_DOWN', keys: ['Shift', 'KeyM'] })] });
    tx.create({ ...makeRectangle(shape('covered', 'home', 20, 20, 50, 20)), visible: false });
    tx.create(makeFrame(shape('about', page, 500, 0, 400, 300)));
    tx.create({ ...makeRectangle(shape('back', 'about', 0, 0, 50, 50)), reactions: [on([{ type: 'BACK' }]), on([{ type: 'URL', url: 'https://example.com' }, { type: 'URL', url: 'javascript:alert(1)' }], { type: 'AFTER_TIMEOUT', timeout: 900 })] });
    tx.create(makeFrame(shape('menu', page, 0, 400, 200, 200)));
    tx.create({ ...makeRectangle(shape('close', 'menu', 0, 0, 20, 20)), reactions: [on([{ type: 'CLOSE' }]), on([go('SWAP', 'sheet')], { type: 'ON_HOVER' })] });
    tx.create(makeFrame(shape('sheet', page, 300, 400, 200, 200)));
    tx.create(makeFrame(shape('unused', page, 1000, 1000, 100, 100)));
  });
  index = new SceneIndex(store);
  index.ensure(page);
});

describe('prototype player', () => {
  test('presentable screens are the connected frames in reading order; the player starts on the first or a chosen one', () => {
    expect(presentableFrames(store, page)).toEqual(['home', 'about', 'menu', 'sheet']);
    expect(startPlayer(store, page)).toEqual({ pageId: page, frameId: 'home', history: [], overlays: [], temporary: null });
    expect(startPlayer(store, page, 'back')!.frameId).toBe('about');
  });

  test('hit testing finds the deepest visible layer, and interactions bubble to the first layer that has the trigger', () => {
    expect(hitTest(store, index, 'home', { x: 30, y: 30 })).toEqual(['next', 'home']);
    expect(hitTest(store, index, 'home', { x: 300, y: 250 })).toEqual(['home']);
    expect(hitTest(store, index, 'home', { x: 500, y: 250 })).toEqual([]);
    expect(findReaction(store, ['next', 'home'], 'ON_CLICK')?.nodeId).toBe('next');
    expect(findReaction(store, ['home'], 'ON_CLICK')).toBeNull();
  });

  test('navigate, overlays, swap, close and back', () => {
    let state: PlayerState = startPlayer(store, page)!;
    let step = runReaction(store, state, findReaction(store, ['next'], 'ON_CLICK')!.reaction);
    expect(step.state).toMatchObject({ frameId: 'about', history: ['home'] });
    expect(step.effects).toEqual([{ type: 'transition', from: 'home', to: 'about', overlay: false, transition: { type: 'DISSOLVE', easing: { type: 'LINEAR' }, duration: 200 } }]);
    step = runReaction(store, step.state, findReaction(store, ['back'], 'ON_CLICK')!.reaction);
    expect(step.state).toMatchObject({ frameId: 'home', history: [] });

    // Keyboard: Shift+M opens the menu overlay.
    const key = keyReaction(store, step.state, ['KeyM', 'Shift'])!;
    expect(key.nodeId).toBe('next');
    step = runReaction(store, step.state, key.reaction);
    expect(step.state.overlays).toEqual(['menu']);
    expect(runReaction(store, step.state, key.reaction).effects).toEqual([]);
    state = step.state;

    // Swapping an overlay replaces it; closing removes it.
    step = runReaction(store, state, on([go('SWAP', 'sheet')]));
    expect(step.state).toMatchObject({ frameId: 'home', overlays: ['sheet'], history: [] });
    step = runReaction(store, step.state, on([{ type: 'CLOSE' }]));
    expect(step.state.overlays).toEqual([]);
    expect(step.effects).toEqual([{ type: 'closeOverlay', id: 'sheet' }]);
    // Swap from a screen replaces the screen without recording it.
    expect(runReaction(store, step.state, on([go('SWAP', 'about')])).state).toMatchObject({ frameId: 'about', history: [] });
    // Scroll to scrolls; missing destinations do nothing.
    expect(runReaction(store, state, on([go('SCROLL_TO', 'next')])).effects).toMatchObject([{ type: 'scrollTo', nodeId: 'next' }]);
    expect(runReaction(store, state, on([go('NAVIGATE', 'gone')]))).toEqual({ state, effects: [] });
  });

  test('links open only for web and mail addresses; after delay interactions are listed for the shown frames', () => {
    const state = runReaction(store, startPlayer(store, page)!, findReaction(store, ['next'], 'ON_CLICK')!.reaction).state;
    const [delayed] = delayedReactions(store, state);
    expect(delayed).toMatchObject({ nodeId: 'back', timeout: 900 });
    expect(runReaction(store, state, delayed!.reaction).effects).toEqual([{ type: 'openUrl', url: 'https://example.com' }]);
  });

  test('while hovering returns to where it started when it ends', () => {
    const withMenu = runReaction(store, startPlayer(store, page)!, on([go('OVERLAY', 'menu')])).state;
    const hover = findReaction(store, ['close', 'menu'], 'ON_HOVER')!;
    const during = beginTemporary(store, withMenu, hover.nodeId, hover.reaction);
    expect(during.state.overlays).toEqual(['sheet']);
    expect(during.state.temporary).toMatchObject({ nodeId: 'close', trigger: 'ON_HOVER' });
    const after = endTemporary(during.state);
    expect(after.state).toBe(withMenu);
    expect(after.effects).toEqual([{ type: 'closeOverlay', id: 'sheet' }]);
  });

  test('the arrows step through the screens; hints list the hotspots', () => {
    const start = startPlayer(store, page)!;
    expect(stepScreen(store, start, -1)).toBeNull();
    expect(stepScreen(store, start, 1)!.state).toMatchObject({ frameId: 'about', history: ['home'] });
    expect(hotspots(store, 'home')).toEqual(['next']);
  });
});
