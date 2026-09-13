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

import { apply, invert, multiply, scaling, translation, type Matrix } from '../math/matrix';
import type { Vec2 } from '../math/vec';
import type { ImagePaint, Size, Transform } from '../schema/document';
import { imagePlacement } from './image-fit';

/**
 * Crop geometry. A CROP paint's `imageTransform` T maps the layer's unit square into the image's
 * unit square. Editing works with the equivalent "image to layer" matrix M (image pixels → layer
 * coordinates): M = scale(W, H) · T⁻¹ · scale(1 / iw, 1 / ih).
 */

/** The CROP `imageTransform` that draws the image with `imageToLayer`. Null when the layer or image has no area. */
export function cropTransformFor(imageToLayer: Matrix, image: Size, layer: Size): Transform | null {
  if (image.width <= 0 || image.height <= 0 || layer.width <= 0 || layer.height <= 0) return null;
  const inverse = invert(imageToLayer);
  if (!inverse) return null;
  const t = multiply(scaling(1 / image.width, 1 / image.height), multiply(inverse, scaling(layer.width, layer.height)));
  return [t.a, t.b, t.c, t.d, t.e, t.f].map((v) => Math.round(v * 1e6) / 1e6) as Transform;
}

/**
 * Where an image paint currently draws, as image pixels → layer coordinates, for any non-tile mode.
 * Used to switch a paint to CROP without moving the image.
 */
export function imageToLayerMatrix(paint: ImagePaint, image: Size, layer: Size): Matrix | null {
  const placement = imagePlacement(paint.scaleMode === 'TILE' ? { ...paint, scaleMode: 'FILL' } : paint, image, layer);
  return placement?.matrix ?? null;
}

/** Converts an image paint to CROP mode keeping the image exactly where it draws now. */
export function toCropPaint(paint: ImagePaint, image: Size, layer: Size): ImagePaint {
  if (paint.scaleMode === 'CROP') return paint;
  const m = imageToLayerMatrix(paint, image, layer);
  const t = m && cropTransformFor(m, image, layer);
  const { scalingFactor: _tile, rotation: _rotation, ...rest } = paint;
  return t ? { ...rest, scaleMode: 'CROP', imageTransform: t } : { ...rest, scaleMode: 'CROP' };
}

/** Corners of the full image in layer coordinates (nw, ne, se, sw of the unrotated image). */
export function imageQuad(imageToLayer: Matrix, image: Size): [Vec2, Vec2, Vec2, Vec2] {
  return [
    apply(imageToLayer, { x: 0, y: 0 }),
    apply(imageToLayer, { x: image.width, y: 0 }),
    apply(imageToLayer, { x: image.width, y: image.height }),
    apply(imageToLayer, { x: 0, y: image.height }),
  ];
}

/**
 * Re-expresses a fixed image placement after the layer box moves: `oldBoxToNew` maps old layer
 * coordinates to new layer coordinates (e.g. translate(−dx, −dy) when the crop's left edge moves right).
 */
export const keepImageInPlace = (imageToLayer: Matrix, oldBoxToNew: Matrix): Matrix => multiply(oldBoxToNew, imageToLayer);

/** Moves the image within the layer (reposition while cropping). */
export const moveImage = (imageToLayer: Matrix, delta: Vec2): Matrix => multiply(translation(delta.x, delta.y), imageToLayer);

/** Scales the image uniformly about a fixed point in layer coordinates (resize while cropping). */
export function scaleImageAbout(imageToLayer: Matrix, factor: number, fixed: Vec2): Matrix {
  const about = multiply(translation(fixed.x, fixed.y), multiply(scaling(factor), translation(-fixed.x, -fixed.y)));
  return multiply(about, imageToLayer);
}
