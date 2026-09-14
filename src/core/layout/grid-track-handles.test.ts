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
import { gridTrackHandles, resizedTrack, trackLabel } from './grid-track-handles';

describe('grid track handles', () => {
  test('a pill per track on the top or left edge, and an edge after every track', () => {
    const handles = gridTrackHandles(
      {
        columns: [
          { start: 10, length: 100 },
          { start: 120, length: 50 },
        ],
        rows: [{ start: 10, length: 40 }],
      },
      { width: 180, height: 60 },
    );
    expect(handles).toEqual([
      { kind: 'pill', axis: 'column', index: 0, at: { x: 60, y: 0 } },
      { kind: 'edge', axis: 'column', index: 0, from: { x: 110, y: 0 }, to: { x: 110, y: 60 } },
      { kind: 'pill', axis: 'column', index: 1, at: { x: 145, y: 0 } },
      { kind: 'edge', axis: 'column', index: 1, from: { x: 170, y: 0 }, to: { x: 170, y: 60 } },
      { kind: 'pill', axis: 'row', index: 0, at: { x: 0, y: 30 } },
      { kind: 'edge', axis: 'row', index: 0, from: { x: 0, y: 50 }, to: { x: 180, y: 50 } },
    ]);
  });

  test('labels show pixels, fractions or Hug', () => {
    expect(trackLabel({ type: 'FIXED', value: 120.004 })).toBe('120');
    expect(trackLabel({ type: 'FLEX', value: 2 })).toBe('2fr');
    expect(trackLabel({ type: 'HUG' })).toBe('Hug');
    // Auto rows beyond the explicit ones are 1fr.
    expect(trackLabel(undefined)).toBe('1fr');
  });

  test('dragging a track edge makes it fixed at its new length', () => {
    expect(resizedTrack(100, 24.6)).toEqual({ type: 'FIXED', value: 125 });
    expect(resizedTrack(30, -80)).toEqual({ type: 'FIXED', value: 0 });
  });
});
