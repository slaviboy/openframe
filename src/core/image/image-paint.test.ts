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
import { ImagePaintSchema } from '../schema/document';
import { imagePaintFor, resetImageAdjustments, rotateImage90, setImageAdjustment, setImageScaleMode, setTileScale, withImage } from './image-paint';

describe('image adjustments on paints', () => {
  test('non-zero adjustments are stored as fractions; zero removes them, and the field when empty', () => {
    let paint = setImageAdjustment(imagePaintFor({ hash: 'a'.repeat(64), width: 1, height: 1 }), 'exposure', 40);
    paint = setImageAdjustment(paint, 'shadows', -250);
    expect(paint.filters).toEqual({ exposure: 0.4, shadows: -1 });
    expect(ImagePaintSchema.parse(paint)).toEqual(paint);
    paint = setImageAdjustment(paint, 'exposure', 0);
    expect(paint.filters).toEqual({ shadows: -1 });
    expect('filters' in setImageAdjustment(paint, 'shadows', 0)).toBe(false);
    expect('filters' in resetImageAdjustments(paint)).toBe(false);
  });
});

const image = { hash: 'a'.repeat(64), width: 640, height: 480 };

describe('image paint helpers', () => {
  test('new image fills are valid FILL paints of the image', () => {
    const paint = imagePaintFor(image);
    expect(ImagePaintSchema.parse(paint)).toEqual(paint);
    expect(paint).toMatchObject({ scaleMode: 'FILL', imageSize: { width: 640, height: 480 } });
    const replaced = withImage({ ...paint, scaleMode: 'FIT', rotation: 90 }, { hash: 'b'.repeat(64), width: 10, height: 20 });
    expect(replaced).toMatchObject({ imageHash: 'b'.repeat(64), scaleMode: 'FIT', rotation: 90, imageSize: { width: 10, height: 20 } });
  });

  test('rotation cycles through quarter turns and stores 0 as absent', () => {
    let paint = imagePaintFor(image);
    const seen: unknown[] = [];
    for (let i = 0; i < 4; i++) {
      paint = rotateImage90(paint);
      seen.push(paint.rotation);
    }
    expect(seen).toEqual([90, 180, 270, undefined]);
    expect('rotation' in paint).toBe(false);
  });

  test('scale mode keeps only the settings the mode uses; tile scale is clamped', () => {
    const tile = setImageScaleMode(imagePaintFor(image), 'TILE');
    expect(tile.scalingFactor).toBe(1);
    expect(setTileScale(tile, 50).scalingFactor).toBe(0.5);
    expect(setTileScale(tile, 0).scalingFactor).toBe(0.01);
    expect('scalingFactor' in setImageScaleMode(setTileScale(tile, 50), 'FIT')).toBe(false);
  });
});
