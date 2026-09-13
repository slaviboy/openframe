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

import { invert, multiply, scaling, translation, type Matrix } from '../math/matrix';
import type { ImagePaint, Size } from '../schema/document';

/** Images larger than this on either side are scaled down proportionally on import. */
export const MAX_IMAGE_DIMENSION = 4096;

/** Pixel size an imported image is stored at: proportional, longest side ≤ 4096. */
export function capImageSize(width: number, height: number): Size {
  const s = Math.min(1, MAX_IMAGE_DIMENSION / Math.max(width, height, 1));
  return { width: Math.max(1, Math.round(width * s)), height: Math.max(1, Math.round(height * s)) };
}

export interface ImagePlacement {
  /** Maps image pixels to layer-local coordinates. */
  readonly matrix: Matrix;
  /** Repeat the image (TILE) instead of drawing it once. */
  readonly tile: boolean;
}

/** Clockwise quarter turn(s) in y-down coordinates, translated so the rotated image starts at the origin. */
function quarterTurns(rotation: ImagePaint['rotation'], image: Size): Matrix {
  const { width: w, height: h } = image;
  switch (rotation) {
    case 90:
      return { a: 0, b: 1, c: -1, d: 0, e: h, f: 0 };
    case 180:
      return { a: -1, b: 0, c: 0, d: -1, e: w, f: h };
    case 270:
      return { a: 0, b: -1, c: 1, d: 0, e: 0, f: w };
    default:
      return { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };
  }
}

/**
 * Where an image paint draws within a layer:
 * - FILL scales the (rotated) image to cover the layer, centered.
 * - FIT scales it to fit entirely inside the layer, centered.
 * - TILE repeats it from the layer origin at `scalingFactor` × its pixel size.
 * - CROP places the image by `imageTransform`, which maps the layer's unit square into the image's.
 * Returns null when the image or the layer has no area.
 */
export function imagePlacement(
  paint: Pick<ImagePaint, 'scaleMode' | 'imageTransform' | 'scalingFactor' | 'rotation'>,
  image: Size,
  layer: Size,
): ImagePlacement | null {
  if (image.width <= 0 || image.height <= 0 || layer.width <= 0 || layer.height <= 0) return null;
  if (paint.scaleMode === 'CROP') {
    const [a, b, c, d, e, f] = paint.imageTransform ?? [1, 0, 0, 1, 0, 0];
    const inverse = invert({ a, b, c, d, e, f });
    if (!inverse) return null;
    const matrix = multiply(scaling(layer.width, layer.height), multiply(inverse, scaling(1 / image.width, 1 / image.height)));
    return { matrix, tile: false };
  }
  const turn = quarterTurns(paint.rotation, image);
  const odd = paint.rotation === 90 || paint.rotation === 270;
  const rw = odd ? image.height : image.width;
  const rh = odd ? image.width : image.height;
  if (paint.scaleMode === 'TILE') {
    return { matrix: multiply(scaling(paint.scalingFactor ?? 1), turn), tile: true };
  }
  const s = paint.scaleMode === 'FILL' ? Math.max(layer.width / rw, layer.height / rh) : Math.min(layer.width / rw, layer.height / rh);
  const offset = translation((layer.width - rw * s) / 2, (layer.height - rh * s) / 2);
  return { matrix: multiply(offset, multiply(scaling(s), turn)), tile: false };
}
