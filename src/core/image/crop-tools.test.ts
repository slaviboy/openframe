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
import { apply, multiply, scaling, translation } from '../math/matrix';
import type { ImagePaint } from '../schema/document';
import {
  aspectCropBox,
  cropAspectRatio,
  cropZoomPercent,
  fitCropBox,
  imageCenter,
  rotateImageAbout,
  scaleImageAxes,
  toCropPaint,
  zoomCropPaint,
} from './crop';
import { imagePlacement } from './image-fit';

const image = { width: 200, height: 100 };

const close = (a: { x: number; y: number }, b: { x: number; y: number }) => {
  expect(a.x).toBeCloseTo(b.x, 4);
  expect(a.y).toBeCloseTo(b.y, 4);
};

describe('crop tools', () => {
  test('resize to fit takes the bounds of the image', () => {
    const m = multiply(translation(-10, -5), scaling(0.5));
    expect(fitCropBox(m, image)).toEqual({ x: -10, y: -5, width: 100, height: 50 });
    const rotated = rotateImageAbout(m, Math.PI / 2, imageCenter(m, image));
    const box = fitCropBox(rotated, image);
    expect(box.width).toBeCloseTo(50);
    expect(box.height).toBeCloseTo(100);
  });

  test('aspect ratio presets and the largest centered box', () => {
    expect(cropAspectRatio('FREE', image)).toBeNull();
    expect(cropAspectRatio('ORIGINAL', image)).toBe(2);
    expect(cropAspectRatio('16:9', image)).toBeCloseTo(16 / 9);
    expect(aspectCropBox({ width: 100, height: 80 }, 1)).toEqual({ x: 10, y: 0, width: 80, height: 80 });
    expect(aspectCropBox({ width: 100, height: 80 }, 4)).toEqual({ x: 0, y: 27.5, width: 100, height: 25 });
  });

  test('rotation keeps the pivot; axis scaling keeps the image rectangular about a fixed image point', () => {
    const m = translation(30, 40);
    const pivot = imageCenter(m, image);
    const r = rotateImageAbout(m, Math.PI / 2, pivot);
    close(apply(r, { x: 100, y: 50 }), pivot);
    // The top-left corner turns clockwise on screen around the center.
    close(apply(r, { x: 0, y: 0 }), { x: pivot.x + 50, y: pivot.y - 100 });
    const s = scaleImageAxes(r, 2, 1, { x: 0, y: 0 });
    close(apply(s, { x: 0, y: 0 }), apply(r, { x: 0, y: 0 }));
    close(apply(s, { x: 10, y: 10 }), apply(r, { x: 20, y: 10 }));
  });

  test('zoom is relative to the scale that covers the layer, about its center', () => {
    const layer = { width: 100, height: 100 };
    const fill: ImagePaint = { type: 'IMAGE', imageHash: 'a'.repeat(64), imageSize: image, scaleMode: 'FILL', opacity: 1, visible: true, blendMode: 'NORMAL' };
    const crop = toCropPaint(fill, image, layer);
    const m = imagePlacement(crop, image, layer)!.matrix;
    expect(cropZoomPercent(m, image, layer)).toBeCloseTo(100);
    const zoomed = zoomCropPaint(crop, layer, 200);
    const zm = imagePlacement(zoomed, image, layer)!.matrix;
    expect(cropZoomPercent(zm, image, layer)).toBeCloseTo(200);
    close(imageCenter(zm, image), { x: 50, y: 50 });
    // Non-crop paints are left alone.
    expect(zoomCropPaint(fill, layer, 200)).toBe(fill);
  });
});
