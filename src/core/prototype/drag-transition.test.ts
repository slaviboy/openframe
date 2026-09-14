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
import type { PrototypeTransition } from '../schema/document';
import { dragDirection, dragProgress } from './drag-transition';

const push = (direction: 'LEFT' | 'RIGHT' | 'TOP' | 'BOTTOM'): PrototypeTransition => ({ type: 'PUSH', direction, matchLayers: false, easing: { type: 'LINEAR' }, duration: 300 });
const dissolve: PrototypeTransition = { type: 'DISSOLVE', easing: { type: 'LINEAR' }, duration: 300 };
const screen = { width: 400, height: 800 };

describe('dragging through a transition', () => {
  test('a drag with the moving frame goes through the transition, as a share of the screen', () => {
    const left = dragDirection(push('LEFT'), { x: 6, y: 0 });
    expect(left).toEqual({ x: -1, y: 0 });
    expect(dragProgress(left, { x: -100, y: 30 }, screen)).toBe(0.25);
    // Dragging back past the start, or beyond the screen, stays within the transition.
    expect(dragProgress(left, { x: 50, y: 0 }, screen)).toBe(0);
    expect(dragProgress(left, { x: -900, y: 0 }, screen)).toBe(1);
    expect(dragProgress(dragDirection(push('BOTTOM'), { x: 0, y: 0 }), { x: 0, y: 200 }, screen)).toBe(0.25);
  });

  test('without a direction, the drag goes the way the pointer first moved', () => {
    expect(dragDirection(dissolve, { x: -2, y: 5 })).toEqual({ x: 0, y: 1 });
    expect(dragDirection(dissolve, { x: -6, y: 1 })).toEqual({ x: -1, y: 0 });
    expect(dragProgress(dragDirection(dissolve, { x: 0, y: -6 }), { x: 0, y: -400 }, screen)).toBe(0.5);
  });
});
