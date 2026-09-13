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
import { apply } from '../math/matrix';
import { capImageSize, imagePlacement } from './image-fit';

const wide = { width: 200, height: 100 };
const square = { width: 100, height: 100 };

describe('image placement', () => {
  test('FILL covers the layer, centered; FIT fits inside, centered', () => {
    const fill = imagePlacement({ scaleMode: 'FILL' }, wide, square)!;
    expect(apply(fill.matrix, { x: 0, y: 0 })).toEqual({ x: -50, y: 0 });
    expect(apply(fill.matrix, { x: 200, y: 100 })).toEqual({ x: 150, y: 100 });
    expect(fill.tile).toBe(false);
    const fit = imagePlacement({ scaleMode: 'FIT' }, wide, square)!;
    expect(apply(fit.matrix, { x: 0, y: 0 })).toEqual({ x: 0, y: 25 });
    expect(apply(fit.matrix, { x: 200, y: 100 })).toEqual({ x: 100, y: 75 });
  });

  test('TILE repeats at the scaling factor from the layer origin', () => {
    const tile = imagePlacement({ scaleMode: 'TILE', scalingFactor: 0.5 }, wide, square)!;
    expect(tile.tile).toBe(true);
    expect(apply(tile.matrix, { x: 200, y: 100 })).toEqual({ x: 100, y: 50 });
  });

  test('rotation turns the image clockwise in quarter turns before fitting', () => {
    const p = imagePlacement({ scaleMode: 'FIT', rotation: 90 }, wide, { width: 100, height: 200 })!;
    // The top-left corner moves to the top-right, the top-right to the bottom-right.
    expect(apply(p.matrix, { x: 0, y: 0 })).toEqual({ x: 100, y: 0 });
    expect(apply(p.matrix, { x: 200, y: 0 })).toEqual({ x: 100, y: 200 });
    const half = imagePlacement({ scaleMode: 'FIT', rotation: 180 }, wide, wide)!;
    expect(apply(half.matrix, { x: 0, y: 0 })).toEqual({ x: 200, y: 100 });
  });

  test('CROP maps by imageTransform; empty sizes place nothing', () => {
    // Show the right half of the image across the whole layer.
    const crop = imagePlacement({ scaleMode: 'CROP', imageTransform: [0.5, 0, 0, 1, 0.5, 0] }, wide, square)!;
    const p = apply(crop.matrix, { x: 100, y: 0 });
    expect(p.x).toBeCloseTo(0);
    expect(apply(crop.matrix, { x: 200, y: 100 }).x).toBeCloseTo(100);
    expect(imagePlacement({ scaleMode: 'FILL' }, wide, { width: 0, height: 10 })).toBeNull();
  });

  test('imports are capped at 4096 on the longest side', () => {
    expect(capImageSize(8192, 4096)).toEqual({ width: 4096, height: 2048 });
    expect(capImageSize(640, 480)).toEqual({ width: 640, height: 480 });
  });
});
