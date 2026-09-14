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
import { createEmptyDocument, keyOnTop, makeFrame } from '../document/factory';
import { History } from '../history/history';
import { IdGenerator } from '../ids/ids';
import type { PrototypeAction } from '../schema/document';
import { runReaction, startPlayer } from './player';

describe('state management resets', () => {
  test('a navigation says which states of its destination start over: scroll, videos and interactive components', () => {
    const ids = new IdGenerator('r');
    const store = createEmptyDocument({ name: 'D', now: 'n', appVersion: 't', ids });
    const page = store.pages()[0]!;
    const history = new History({ store, captureMeta: () => null, restoreMeta: () => undefined });
    const shape = (id: string, x: number) => ({ id, parent: { id: page, key: keyOnTop(store, page) }, name: id, x, y: 0, width: 10, height: 10 });
    history.run('Build', (tx) => {
      tx.create(makeFrame(shape('home', 0)));
      tx.create(makeFrame(shape('next', 50)));
    });
    const go = (patch: Partial<Extract<PrototypeAction, { type: 'NODE' }>>): PrototypeAction => ({ type: 'NODE', navigation: 'NAVIGATE', destinationId: 'next', transition: { type: 'INSTANT' }, ...patch });
    const start = startPlayer(store, page, 'home')!;
    const effect = (action: PrototypeAction) => runReaction(store, start, { trigger: { type: 'ON_CLICK' }, actions: [action] }).effects[0];
    expect(effect(go({}))).toEqual({ type: 'transition', from: 'home', to: 'next', overlay: false, transition: { type: 'INSTANT' } });
    expect(effect(go({ resetInteractiveComponents: true, resetScrollPosition: true }))).toMatchObject({ resetComponents: true, resetScroll: true });
  });
});
