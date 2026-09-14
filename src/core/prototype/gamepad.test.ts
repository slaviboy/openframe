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
import { gamepadButtonOf, gamepadCode, gamepadLabel, newlyPressed } from './gamepad';
import { keyReaction, startPlayer } from './player';

describe('gamepad buttons in Key/Gamepad triggers', () => {
  test('codes, names and new presses', () => {
    expect(gamepadCode(0)).toBe('Gamepad0');
    expect(gamepadButtonOf('Gamepad12')).toBe(12);
    expect(gamepadButtonOf('KeyK')).toBeNull();
    expect(gamepadLabel('Gamepad0')).toBe('Gamepad A / ✕');
    expect(gamepadLabel('Gamepad20')).toBe('Gamepad button 21');
    expect(gamepadLabel('Enter')).toBeNull();
    expect(newlyPressed([true, false, false], [true, true, false])).toEqual([1]);
    expect(newlyPressed([], [false, true])).toEqual([1]);
  });

  test('a pressed gamepad button runs the interaction triggered by it', () => {
    const ids = new IdGenerator('g');
    const store = createEmptyDocument({ name: 'D', now: 'n', appVersion: 't', ids });
    const page = store.pages()[0]!;
    const history = new History({ store, captureMeta: () => null, restoreMeta: () => undefined });
    const shape = (id: string, parent: string) => ({ id, parent: { id: parent, key: keyOnTop(store, parent) }, name: id, x: 0, y: 0, width: 10, height: 10 });
    history.run('Build', (tx) => {
      tx.create(makeFrame(shape('home', page)));
      tx.create({ ...makeRectangle(shape('button', 'home')), reactions: [{ trigger: { type: 'ON_KEY_DOWN', keys: [gamepadCode(0)] }, actions: [{ type: 'BACK' }] }] });
    });
    const state = startPlayer(store, page, 'home')!;
    expect(keyReaction(store, state, [gamepadCode(0)])?.nodeId).toBe('button');
    expect(keyReaction(store, state, [gamepadCode(1)])).toBeNull();
  });
});
