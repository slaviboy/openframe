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
import { apply, translation } from '../math/matrix';
import type { ImagePaint } from '../schema/document';
import { cropTransformFor, imageQuad, imageToLayerMatrix, keepImageInPlace, moveImage, scaleImageAbout, toCropPaint } from './crop';
import { imagePlacement } from './image-fit';

const image = { width: 200, height: 100 };
const layer = { width: 100, height: 100 };
const fill: ImagePaint = { type: 'IMAGE', imageHash: 'a'.repeat(64), scaleMode: 'FILL', opacity: 1, visible: true, blendMode: 'NORMAL' };

const expectSamePlacement = (a: ImagePaint, b: ImagePaint, box = layer) => {
  const pa = imagePlacement(a, image, box)!.matrix;
  const pb = imagePlacement(b, image, box)!.matrix;
  for (const p of [{ x: 0, y: 0 }, { x: 200, y: 100 }, { x: 37, y: 81 }]) {
    const qa = apply(pa, p);
    const qb = apply(pb, p);
    expect(qb.x).toBeCloseTo(qa.x, 4);
    expect(qb.y).toBeCloseTo(qa.y, 4);
  }
};

describe('crop geometry', () => {
  test('switching to CROP keeps the image where FILL, FIT or a rotation drew it', () => {
    const crop = toCropPaint(fill, image, layer);
    expect(crop.scaleMode).toBe('CROP');
    expectSamePlacement(fill, crop);
    const fit = { ...fill, scaleMode: 'FIT' as const };
    expectSamePlacement(fit, toCropPaint(fit, image, layer));
    const rotated = { ...fill, rotation: 90 as const };
    const rotatedCrop = toCropPaint(rotated, image, layer);
    expect('rotation' in rotatedCrop).toBe(false);
    expectSamePlacement(rotated, rotatedCrop);
  });

  test('cropTransformFor inverts the CROP placement', () => {
    const m = imageToLayerMatrix(fill, image, layer)!;
    const t = cropTransformFor(m, image, layer)!;
    expect(t).toEqual([0.5, 0, 0, 1, 0.25, 0]);
    expect(cropTransformFor(m, image, { width: 0, height: 5 })).toBeNull();
  });

  test('moving the crop edge keeps the image fixed in the parent', () => {
    const m = imageToLayerMatrix(fill, image, layer)!;
    // The left edge moves 20px right: the layer is now 80 wide, and old x = new x + 20.
    const moved = keepImageInPlace(m, translation(-20, 0));
    const before = apply(m, { x: 100, y: 50 });
    const after = apply(moved, { x: 100, y: 50 });
    expect(after.x + 20).toBeCloseTo(before.x);
    const t = cropTransformFor(moved, image, { width: 80, height: 100 })!;
    expectSamePlacement({ ...fill, scaleMode: 'CROP', imageTransform: t }, { ...fill, scaleMode: 'CROP', imageTransform: cropTransformFor(moved, image, { width: 80, height: 100 })! }, { width: 80, height: 100 });
  });

  test('repositioning and scaling the image', () => {
    const m = imageToLayerMatrix(fill, image, layer)!;
    expect(imageQuad(moveImage(m, { x: 10, y: -5 }), image)[0]).toEqual({ x: -40, y: -5 });
    const scaled = scaleImageAbout(m, 2, { x: 0, y: 0 });
    const [, , se] = imageQuad(scaled, image);
    expect(se).toEqual({ x: 300, y: 200 });
  });
});
