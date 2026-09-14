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
import type { PrototypeAction } from '../schema/document';
import { actionAt, moveAction } from './action-paths';

const link = (url: string): PrototypeAction => ({ type: 'URL', url });
const conditional = (ifActions: PrototypeAction[], elseActions: PrototypeAction[]): PrototypeAction => ({
  type: 'CONDITIONAL',
  blocks: [
    { condition: 'a', actions: ifActions },
    { condition: null, actions: elseActions },
  ],
});
const urls = (actions: readonly PrototypeAction[]): unknown[] => actions.map((action) => (action.type === 'URL' ? action.url : action.type === 'CONDITIONAL' ? action.blocks.map((block) => urls(block.actions)) : action.type));

describe('moving actions', () => {
  const actions = [link('a'), link('b'), conditional([link('c')], []), link('d')];

  test('actions are found by their path, in Conditional blocks too', () => {
    expect(actionAt(actions, [1])).toEqual(link('b'));
    expect(actionAt(actions, [2, 0, 0])).toEqual(link('c'));
    expect(actionAt(actions, [2, 1, 0])).toBeUndefined();
  });

  test('reordering, and moving into and out of a Conditional', () => {
    // a to before d.
    expect(urls(moveAction(actions, [0], [3])!)).toEqual(['b', [['c'], []], 'a', 'd']);
    // d to the top.
    expect(urls(moveAction(actions, [3], [0])!)).toEqual(['d', 'a', 'b', [['c'], []]]);
    // a into the Else block of the Conditional.
    expect(urls(moveAction(actions, [0], [2, 1, 0])!)).toEqual(['b', [['c'], ['a']], 'd']);
    // c out of the If block, to the end.
    expect(urls(moveAction(actions, [2, 0, 0], [4])!)).toEqual(['a', 'b', [[], []], 'd', 'c']);
  });

  test('a Conditional can’t move into itself', () => {
    expect(moveAction(actions, [2], [2, 0, 1])).toBeNull();
    expect(moveAction(actions, [9], [0])).toBeNull();
  });
});
