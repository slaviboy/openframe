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

import type { ImagePaint, ImageScaleMode, VideoPaint } from '../schema/document';
import type { ImageAdjustment } from './adjustments';

export interface ImageRef {
  readonly hash: string;
  readonly width: number;
  readonly height: number;
}

export const IMAGE_SCALE_MODE_LABELS: Record<ImageScaleMode, string> = { FILL: 'Fill', FIT: 'Fit', CROP: 'Crop', TILE: 'Tile' };

/** A new image fill showing `image` in FILL mode. */
export const imagePaintFor = (image: ImageRef): ImagePaint => ({
  type: 'IMAGE',
  imageHash: image.hash,
  imageSize: { width: image.width, height: image.height },
  scaleMode: 'FILL',
  opacity: 1,
  visible: true,
  blendMode: 'NORMAL',
});

/** A new video fill in FILL mode: the video (`videoHash`) and its poster image. */
export const videoPaintFor = (poster: ImageRef, videoHash: string): VideoPaint => ({
  type: 'VIDEO',
  videoHash,
  imageHash: poster.hash,
  imageSize: { width: poster.width, height: poster.height },
  scaleMode: 'FILL',
  opacity: 1,
  visible: true,
  blendMode: 'NORMAL',
});

/** Replaces the video of a video fill, keeping its mode, rotation and other settings. */
export const withVideo = (paint: VideoPaint, poster: ImageRef, videoHash: string): VideoPaint => ({
  ...paint,
  videoHash,
  imageHash: poster.hash,
  imageSize: { width: poster.width, height: poster.height },
});

/** Replaces the image of a paint, keeping its mode, rotation and other settings. */
export const withImage = (paint: ImagePaint, image: ImageRef): ImagePaint => ({
  ...paint,
  imageHash: image.hash,
  imageSize: { width: image.width, height: image.height },
});

/** Rotates the image a further 90° clockwise (0 is stored as absent). */
export function rotateImage90(paint: ImagePaint): ImagePaint {
  const next = ((paint.rotation ?? 0) + 90) % 360;
  const { rotation: _previous, ...rest } = paint;
  return next === 0 ? rest : { ...rest, rotation: next as 90 | 180 | 270 };
}

/** Changes the scale mode; tile size and crop transform are only kept for the modes that use them. */
export function setImageScaleMode(paint: ImagePaint, mode: ImageScaleMode): ImagePaint {
  const { scalingFactor, imageTransform, ...rest } = paint;
  return {
    ...rest,
    scaleMode: mode,
    ...(mode === 'TILE' ? { scalingFactor: scalingFactor ?? 1 } : {}),
    ...(mode === 'CROP' && imageTransform ? { imageTransform } : {}),
  };
}

/**
 * Sets one adjustment from an inspector value (−100–100). Zero values are not stored, and the
 * `filters` field is removed when no adjustment remains.
 */
export function setImageAdjustment(paint: ImagePaint, key: ImageAdjustment, percent: number): ImagePaint {
  const value = Math.min(1, Math.max(-1, Math.round(percent) / 100));
  const entries = Object.entries({ ...paint.filters, [key]: value }).filter(([, v]) => v !== 0);
  const { filters: _previous, ...rest } = paint;
  return entries.length > 0 ? { ...rest, filters: Object.fromEntries(entries) } : rest;
}

/** Clears every adjustment. */
export function resetImageAdjustments(paint: ImagePaint): ImagePaint {
  const { filters: _previous, ...rest } = paint;
  return rest;
}

/** Tile size as a percentage of the image's pixel size (1–10000%). */
export const setTileScale = (paint: ImagePaint, percent: number): ImagePaint => ({
  ...paint,
  scalingFactor: Math.min(100, Math.max(0.01, Math.round(percent) / 100)),
});
