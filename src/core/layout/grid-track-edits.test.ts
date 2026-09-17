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
import type { GridTrack } from '../schema/document';
import { moveTrack, placementAfterMove, placementAfterRemove, removeTrack } from './grid-track-edits';

const sizes: GridTrack[] = [{ type: 'FIXED', value: 10 }, { type: 'FLEX', value: 1 }, { type: 'HUG' }];

describe('taking a grid track out', () => {
  test('the track goes, and a grid always keeps one', () => {
    expect(removeTrack(sizes, 1)).toEqual([{ type: 'FIXED', value: 10 }, { type: 'HUG' }]);
    expect(removeTrack([{ type: 'HUG' }], 0)).toBeNull();
    expect(removeTrack(sizes, 7)).toBeNull();
  });

  test('a child in the track is placed automatically again, and the ones after it move up', () => {
    expect(placementAfterRemove({ cell: 1, span: undefined }, 1)).toEqual({ cell: undefined, span: undefined });
    expect(placementAfterRemove({ cell: 2, span: undefined }, 1)).toEqual({ cell: 1, span: undefined });
    expect(placementAfterRemove({ cell: 0, span: undefined }, 1)).toEqual({ cell: 0, span: undefined });
  });

  test('a child reaching over the track reaches one track less', () => {
    expect(placementAfterRemove({ cell: 0, span: 3 }, 1)).toEqual({ cell: 0, span: 2 });
    // Down to one track it carries no span of its own any more.
    expect(placementAfterRemove({ cell: 0, span: 2 }, 1)).toEqual({ cell: 0, span: undefined });
    // A child that stops before the track is left alone.
    expect(placementAfterRemove({ cell: 0, span: 1 }, 2)).toEqual({ cell: 0, span: 1 });
  });

  test('a child placed automatically stays that way', () => {
    expect(placementAfterRemove({ cell: undefined, span: undefined }, 0)).toEqual({ cell: undefined, span: undefined });
  });
});

describe('moving a grid track', () => {
  test('the track lands where it is put, the others closing up', () => {
    expect(moveTrack(sizes, 0, 2)).toEqual([{ type: 'FLEX', value: 1 }, { type: 'HUG' }, { type: 'FIXED', value: 10 }]);
    expect(moveTrack(sizes, 2, 0)).toEqual([{ type: 'HUG' }, { type: 'FIXED', value: 10 }, { type: 'FLEX', value: 1 }]);
    expect(moveTrack(sizes, 1, 1)).toBeNull();
  });

  test('a child travels with its track, and the ones stepped over shift the other way', () => {
    expect(placementAfterMove({ cell: 0, span: undefined }, 0, 2)).toEqual({ cell: 2, span: undefined });
    expect(placementAfterMove({ cell: 1, span: undefined }, 0, 2)).toEqual({ cell: 0, span: undefined });
    expect(placementAfterMove({ cell: 2, span: undefined }, 0, 2)).toEqual({ cell: 1, span: undefined });
    // Moving back the other way pushes them along instead.
    expect(placementAfterMove({ cell: 0, span: undefined }, 2, 0)).toEqual({ cell: 1, span: undefined });
    expect(placementAfterMove({ cell: 2, span: undefined }, 2, 0)).toEqual({ cell: 0, span: undefined });
  });

  test('a child reaching across several tracks is left where it is, a move would tear it apart', () => {
    expect(placementAfterMove({ cell: 0, span: 2 }, 0, 2)).toEqual({ cell: 0, span: 2 });
  });
});
