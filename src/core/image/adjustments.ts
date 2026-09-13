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

import type { ImageFilters } from '../schema/document';

/** Adjustments in the order the inspector lists them and the shader receives them. */
export const IMAGE_ADJUSTMENTS = ['exposure', 'contrast', 'saturation', 'temperature', 'tint', 'highlights', 'shadows'] as const;
export type ImageAdjustment = (typeof IMAGE_ADJUSTMENTS)[number];

export const IMAGE_ADJUSTMENT_LABELS: Record<ImageAdjustment, string> = {
  exposure: 'Exposure',
  contrast: 'Contrast',
  saturation: 'Saturation',
  temperature: 'Temperature',
  tint: 'Tint',
  highlights: 'Highlights',
  shadows: 'Shadows',
};

/** Whether any adjustment is non-zero. */
export const hasAdjustments = (filters: ImageFilters | undefined): boolean => !!filters && IMAGE_ADJUSTMENTS.some((k) => (filters[k] ?? 0) !== 0);

/** Adjustment values in IMAGE_ADJUSTMENTS order (the shader's uniforms). */
export const adjustmentValues = (filters: ImageFilters | undefined): number[] => IMAGE_ADJUSTMENTS.map((k) => filters?.[k] ?? 0);

const LUMA = [0.2126, 0.7152, 0.0722] as const;
const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const luma = (c: readonly number[]) => c[0]! * LUMA[0] + c[1]! * LUMA[1] + c[2]! * LUMA[2];
const smoothstep = (edge0: number, edge1: number, x: number) => {
  const t = clamp01((x - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
};

/**
 * Applies image adjustments to one unpremultiplied sRGB color (channels 0–1). This is the
 * reference for the renderer's SkSL shader, which runs the same steps in the same order:
 * 1. exposure: multiply by 2^exposure (±1 stop)
 * 2. contrast: scale around mid gray by 1 + contrast
 * 3. saturation: scale the distance from luma by 1 + saturation
 * 4. temperature: ±0.1 red/blue; tint: +0.05 red and blue, −0.1 green (positive is magenta)
 * 5. highlights / shadows: add ±0.25 weighted by smoothstep on luma above 0.5 / below 0.5
 * 6. clamp to 0–1
 */
export function adjustColor(rgb: readonly [number, number, number], filters: ImageFilters): [number, number, number] {
  const [exposure, contrast, saturation, temperature, tint, highlights, shadows] = adjustmentValues(filters) as [number, number, number, number, number, number, number];
  const gain = 2 ** exposure;
  let c = rgb.map((v) => (v * gain - 0.5) * (1 + contrast) + 0.5);
  const l = luma(c);
  c = c.map((v) => l + (v - l) * (1 + saturation));
  c = [c[0]! + 0.1 * temperature + 0.05 * tint, c[1]! - 0.1 * tint, c[2]! - 0.1 * temperature + 0.05 * tint];
  const l2 = luma(c.map(clamp01));
  const lift = highlights * 0.25 * smoothstep(0.5, 1, l2) + shadows * 0.25 * (1 - smoothstep(0, 0.5, l2));
  return c.map((v) => clamp01(v + lift)) as [number, number, number];
}
