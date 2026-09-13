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

import { isGradientPaint, type Color, type GradientPaint, type GradientStop, type GradientType, type Paint, type Transform } from '../schema/document';

export type PaintType = Paint['type'];

export const IDENTITY_GRADIENT_TRANSFORM: Transform = [1, 0, 0, 1, 0, 0];

export const PAINT_TYPE_LABELS: Record<PaintType, string> = {
  SOLID: 'Solid',
  GRADIENT_LINEAR: 'Linear',
  GRADIENT_RADIAL: 'Radial',
  GRADIENT_ANGULAR: 'Angular',
  GRADIENT_DIAMOND: 'Diamond',
  IMAGE: 'Image',
};

/** Neutral gray an image paint is summarized by when converted to a color. */
const IMAGE_SUMMARY_COLOR: Color = { r: 217 / 255, g: 217 / 255, b: 217 / 255, a: 1 };

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

/** The color a paint is summarized by (a solid's color, a gradient's first stop, or gray for images). */
export function representativeColor(paint: Paint): Color {
  if (paint.type === 'SOLID') return paint.color;
  if (paint.type === 'IMAGE') return IMAGE_SUMMARY_COLOR;
  return paint.gradientStops[0]!.color;
}

/**
 * Converts a paint to another type, keeping opacity, visibility and blend mode. A solid becomes a
 * gradient from its color to the same color at 0% alpha; a gradient keeps its stops when switching
 * between gradient types, and becomes a solid of its first stop's color. Any paint becomes an
 * image placeholder (FILL, no image yet); an image becomes a gray solid or gradient.
 */
export function convertPaint(paint: Paint, type: PaintType): Paint {
  if (paint.type === type) return paint;
  const common = { opacity: paint.opacity, visible: paint.visible, blendMode: paint.blendMode };
  if (type === 'SOLID') return { type: 'SOLID', color: { ...representativeColor(paint), a: 1 }, ...common };
  if (type === 'IMAGE') return { type: 'IMAGE', scaleMode: 'FILL', ...common };
  const base = representativeColor(paint);
  const stops: GradientStop[] = isGradientPaint(paint)
    ? paint.gradientStops.map((s) => ({ ...s, color: { ...s.color } }))
    : [
        { position: 0, color: { ...base, a: 1 } },
        { position: 1, color: { ...base, a: 0 } },
      ];
  const transform = isGradientPaint(paint) ? paint.gradientTransform : IDENTITY_GRADIENT_TRANSFORM;
  return { type, gradientStops: stops, gradientTransform: [...transform] as Transform, ...common } as GradientPaint;
}

const sortStops = (stops: readonly GradientStop[]): GradientStop[] => [...stops].sort((a, b) => a.position - b.position);

/** Linear interpolation of the stop colors at `position` (0–1). */
export function colorAt(stops: readonly GradientStop[], position: number): Color {
  const sorted = sortStops(stops);
  const p = clamp01(position);
  const first = sorted[0]!;
  const last = sorted.at(-1)!;
  if (p <= first.position) return { ...first.color };
  if (p >= last.position) return { ...last.color };
  for (let i = 1; i < sorted.length; i++) {
    const a = sorted[i - 1]!;
    const b = sorted[i]!;
    if (p <= b.position) {
      const t = b.position === a.position ? 0 : (p - a.position) / (b.position - a.position);
      const mix = (x: number, y: number) => x + (y - x) * t;
      return { r: mix(a.color.r, b.color.r), g: mix(a.color.g, b.color.g), b: mix(a.color.b, b.color.b), a: mix(a.color.a, b.color.a) };
    }
  }
  return { ...last.color };
}

/** Adds a stop in the middle of the widest gap, colored by the gradient at that point. Max 64 stops. */
export function addStop(paint: GradientPaint): GradientPaint {
  if (paint.gradientStops.length >= 64) return paint;
  const sorted = sortStops(paint.gradientStops);
  let best = { from: 0, to: 1, width: -1 };
  for (let i = 1; i < sorted.length; i++) {
    const width = sorted[i]!.position - sorted[i - 1]!.position;
    if (width > best.width) best = { from: sorted[i - 1]!.position, to: sorted[i]!.position, width };
  }
  const position = Math.round(((best.from + best.to) / 2) * 1000) / 1000;
  return { ...paint, gradientStops: sortStops([...sorted, { position, color: colorAt(sorted, position) }]) };
}

/** Removes a stop by index (in sorted order); a gradient keeps at least two stops. */
export function removeStop(paint: GradientPaint, index: number): GradientPaint {
  if (paint.gradientStops.length <= 2) return paint;
  const sorted = sortStops(paint.gradientStops);
  return { ...paint, gradientStops: sorted.filter((_, i) => i !== index) };
}

/** Updates one stop (by index in sorted order), clamping its position and re-sorting. */
export function updateStop(paint: GradientPaint, index: number, patch: Partial<GradientStop>): GradientPaint {
  const sorted = sortStops(paint.gradientStops);
  const stop = sorted[index];
  if (!stop) return paint;
  const next = { position: clamp01(patch.position ?? stop.position), color: patch.color ?? stop.color };
  return { ...paint, gradientStops: sortStops(sorted.map((s, i) => (i === index ? next : s))) };
}

/** Swaps the gradient direction by mirroring stop positions. */
export function reverseStops(paint: GradientPaint): GradientPaint {
  return { ...paint, gradientStops: sortStops(paint.gradientStops.map((s) => ({ ...s, position: 1 - s.position }))) };
}

export const isGradientType = (type: PaintType): type is GradientType => type.startsWith('GRADIENT_');
