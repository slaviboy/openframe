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

import { apply, invert, multiply, rotation, scaling, translation, type Matrix } from '../math/matrix';
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
 * What cropping reads and writes on a paint. A video fill crops like the frames it draws, so image and video paints
 * both qualify, and the helpers below hand each one back with its own type.
 */
export type CroppablePaint = Pick<ImagePaint, 'scaleMode' | 'imageTransform' | 'scalingFactor' | 'rotation' | 'imageSize'>;

/**
 * Where an image paint currently draws, as image pixels → layer coordinates, for any non-tile mode.
 * Used to switch a paint to CROP without moving the image.
 */
export function imageToLayerMatrix(paint: CroppablePaint, image: Size, layer: Size): Matrix | null {
  const placement = imagePlacement(paint.scaleMode === 'TILE' ? { ...paint, scaleMode: 'FILL' } : paint, image, layer);
  return placement?.matrix ?? null;
}

/** Converts an image paint to CROP mode keeping the image exactly where it draws now. */
export function toCropPaint<T extends CroppablePaint>(paint: T, image: Size, layer: Size): T {
  if (paint.scaleMode === 'CROP') return paint;
  const m = imageToLayerMatrix(paint, image, layer);
  const t = m && cropTransformFor(m, image, layer);
  const { scalingFactor: _tile, rotation: _rotation, ...rest } = paint;
  // The rest of the paint is untouched, so it keeps its own type (an image or a video fill).
  return (t ? { ...rest, scaleMode: 'CROP', imageTransform: t } : { ...rest, scaleMode: 'CROP' }) as T;
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

/**
 * Scales the image along its own axes about a fixed point in image pixels, so it stays a rectangle
 * even when rotated (free-aspect resize while cropping).
 */
export function scaleImageAxes(imageToLayer: Matrix, sx: number, sy: number, fixedImage: Vec2): Matrix {
  const about = multiply(translation(fixedImage.x, fixedImage.y), multiply(scaling(sx, sy), translation(-fixedImage.x, -fixedImage.y)));
  return multiply(imageToLayer, about);
}

/** Rotates the image about a point in layer coordinates (positive radians turn clockwise on screen). */
export function rotateImageAbout(imageToLayer: Matrix, radians: number, pivot: Vec2): Matrix {
  const about = multiply(translation(pivot.x, pivot.y), multiply(rotation(radians), translation(-pivot.x, -pivot.y)));
  return multiply(about, imageToLayer);
}

/** Center of the full image in layer coordinates. */
export const imageCenter = (imageToLayer: Matrix, image: Size): Vec2 => apply(imageToLayer, { x: image.width / 2, y: image.height / 2 });

/** A crop box in layer coordinates. */
export interface CropBox {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/** Resize to fit: the box that shows the whole image (the bounds of its corners in layer coordinates). */
export function fitCropBox(imageToLayer: Matrix, image: Size): CropBox {
  const quad = imageQuad(imageToLayer, image);
  const xs = quad.map((p) => p.x);
  const ys = quad.map((p) => p.y);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return { x, y, width: Math.max(...xs) - x, height: Math.max(...ys) - y };
}

/** Crop aspect ratio presets: free, the image's own ratio, or a fixed width:height. */
export const CROP_ASPECTS = ['FREE', 'ORIGINAL', '1:1', '5:4', '4:5', '4:3', '3:4', '3:2', '2:3', '16:9', '9:16'] as const;
export type CropAspect = (typeof CROP_ASPECTS)[number];

export const CROP_ASPECT_LABELS: Record<CropAspect, string> = {
  FREE: 'Free',
  ORIGINAL: 'Original',
  '1:1': '1:1',
  '5:4': '5:4',
  '4:5': '4:5',
  '4:3': '4:3',
  '3:4': '3:4',
  '3:2': '3:2',
  '2:3': '2:3',
  '16:9': '16:9',
  '9:16': '9:16',
};

/** Width / height of a preset, or null for a free crop. */
export function cropAspectRatio(aspect: CropAspect, image: Size): number | null {
  if (aspect === 'FREE') return null;
  if (aspect === 'ORIGINAL') return image.height > 0 ? image.width / image.height : null;
  const [w, h] = aspect.split(':').map(Number) as [number, number];
  return w / h;
}

/** The largest box of `ratio` (width / height) centered in a layer of `size`. */
export function aspectCropBox(size: Size, ratio: number): CropBox {
  const width = Math.min(size.width, size.height * ratio);
  const height = width / ratio;
  return { x: (size.width - width) / 2, y: (size.height - height) / 2, width, height };
}

/** Image scale (layer units per image pixel) at which it just covers a layer of `size` (unrotated). */
const coverScale = (image: Size, size: Size): number => Math.max(size.width / image.width, size.height / image.height);

/** Crop zoom in percent: the image's scale relative to the scale that just covers the layer. */
export function cropZoomPercent(imageToLayer: Matrix, image: Size, size: Size): number {
  const scale = Math.sqrt(Math.abs(imageToLayer.a * imageToLayer.d - imageToLayer.b * imageToLayer.c));
  return (scale / coverScale(image, size)) * 100;
}

/** A CROP paint zoomed to `percent` (see `cropZoomPercent`) about the center of the layer. */
export function zoomCropPaint<T extends CroppablePaint>(paint: T, size: Size, percent: number): T {
  const image = paint.imageSize;
  const m = image && imagePlacement(paint, image, size)?.matrix;
  if (!image || !m || paint.scaleMode !== 'CROP') return paint;
  const current = cropZoomPercent(m, image, size);
  if (current <= 0) return paint;
  const next = scaleImageAbout(m, Math.max(1, percent) / current, { x: size.width / 2, y: size.height / 2 });
  const imageTransform = cropTransformFor(next, image, size);
  return imageTransform ? { ...paint, imageTransform } : paint;
}
