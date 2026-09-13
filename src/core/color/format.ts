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

import { hsbToRgb, hslToRgb, parseHex, rgbToHsb, rgbToHsl, toHex6, type RGBA } from './color';

/** Color picker input formats. */
export type ColorFormat = 'hex' | 'rgb' | 'hsl' | 'hsb';

export const COLOR_FORMAT_LABELS: Record<ColorFormat, string> = { hex: 'Hex', rgb: 'RGB', hsl: 'HSL', hsb: 'HSB' };

/** Field labels per format. */
export const COLOR_FORMAT_FIELDS: Record<ColorFormat, readonly string[]> = {
  hex: ['Hex'],
  rgb: ['R', 'G', 'B'],
  hsl: ['H', 'S', 'L'],
  hsb: ['H', 'S', 'B'],
};

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** Field values for a color: hex digits, 0–255 channels, or hue in degrees with percentages. */
export function formatColorFields(color: RGBA, format: ColorFormat): string[] {
  switch (format) {
    case 'hex':
      return [toHex6(color)];
    case 'rgb':
      return [color.r, color.g, color.b].map((v) => String(Math.round(clamp(v, 0, 1) * 255)));
    case 'hsl': {
      const { h, s, l } = rgbToHsl(color);
      return [String(Math.round(h)), String(Math.round(s * 100)), String(Math.round(l * 100))];
    }
    case 'hsb': {
      const { h, s, b } = rgbToHsb(color);
      return [String(Math.round(h)), String(Math.round(s * 100)), String(Math.round(b * 100))];
    }
  }
}

/**
 * Parses field values in a format into an opaque color (alpha comes from the separate alpha
 * control). Numbers are clamped to their ranges; returns null for malformed input.
 */
export function parseColorFields(values: readonly string[], format: ColorFormat): RGBA | null {
  if (format === 'hex') {
    const parsed = parseHex(values[0] ?? '');
    return parsed ? { ...parsed, a: 1 } : null;
  }
  if (values.length !== 3 || values.some((v) => v.trim() === '' || !Number.isFinite(Number(v)))) return null;
  const [x, y, z] = values.map(Number) as [number, number, number];
  switch (format) {
    case 'rgb':
      return { r: clamp(x, 0, 255) / 255, g: clamp(y, 0, 255) / 255, b: clamp(z, 0, 255) / 255, a: 1 };
    case 'hsl':
      return hslToRgb({ h: clamp(x, 0, 360), s: clamp(y, 0, 100) / 100, l: clamp(z, 0, 100) / 100 }, 1);
    case 'hsb':
      return hsbToRgb({ h: clamp(x, 0, 360), s: clamp(y, 0, 100) / 100, b: clamp(z, 0, 100) / 100 }, 1);
  }
}
