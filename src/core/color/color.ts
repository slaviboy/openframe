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

/** Non-premultiplied sRGB color with channels in [0, 1]. */
export interface RGBA {
  readonly r: number;
  readonly g: number;
  readonly b: number;
  readonly a: number;
}

export interface HSB {
  /** Hue in degrees [0, 360). */
  readonly h: number;
  readonly s: number;
  readonly b: number;
}

export interface HSL {
  readonly h: number;
  readonly s: number;
  readonly l: number;
}

const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);
const to255 = (v: number): number => Math.round(clamp01(v) * 255);
const hex2 = (v: number): string => to255(v).toString(16).padStart(2, '0').toUpperCase();

export const rgba = (r: number, g: number, b: number, a = 1): RGBA => ({ r, g, b, a });

/** Uppercase 6-digit hex without '#', as shown in the inspector. */
export const toHex6 = (c: RGBA): string => hex2(c.r) + hex2(c.g) + hex2(c.b);
export const toHex8 = (c: RGBA): string => toHex6(c) + hex2(c.a);

/**
 * Parses #RGB, #RGBA, #RRGGBB, #RRGGBBAA (the '#' is optional). Also accepts
 * a 1–2 digit gray shorthand like the reference's inspector ("E" → EEEEEE).
 */
export function parseHex(input: string): RGBA | null {
  let s = input.trim().replace(/^#/, '');
  if (!/^[0-9a-fA-F]+$/.test(s)) return null;
  if (s.length === 1) s = s.repeat(6);
  else if (s.length === 2) s = s.repeat(3);
  else if (s.length === 3 || s.length === 4) s = [...s].map((ch) => ch + ch).join('');
  if (s.length !== 6 && s.length !== 8) return null;
  const n = (i: number) => parseInt(s.slice(i, i + 2), 16) / 255;
  return { r: n(0), g: n(2), b: n(4), a: s.length === 8 ? n(6) : 1 };
}

export function toCss(c: RGBA): string {
  if (c.a >= 1) return `#${toHex6(c).toLowerCase()}`;
  return `rgba(${to255(c.r)}, ${to255(c.g)}, ${to255(c.b)}, ${Math.round(clamp01(c.a) * 1000) / 1000})`;
}

export function rgbToHsb(c: RGBA): HSB {
  const max = Math.max(c.r, c.g, c.b);
  const min = Math.min(c.r, c.g, c.b);
  const d = max - min;
  return { h: hueOf(c, max, d), s: max === 0 ? 0 : d / max, b: max };
}

export function hsbToRgb(hsb: HSB, a = 1): RGBA {
  const h = (((hsb.h % 360) + 360) % 360) / 60;
  const f = (n: number) => {
    const k = (n + h) % 6;
    return hsb.b - hsb.b * hsb.s * Math.max(0, Math.min(k, 4 - k, 1));
  };
  return { r: f(5), g: f(3), b: f(1), a };
}

export function rgbToHsl(c: RGBA): HSL {
  const max = Math.max(c.r, c.g, c.b);
  const min = Math.min(c.r, c.g, c.b);
  const d = max - min;
  const l = (max + min) / 2;
  const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
  return { h: hueOf(c, max, d), s, l };
}

export function hslToRgb(hsl: HSL, a = 1): RGBA {
  const h = ((hsl.h % 360) + 360) % 360;
  const k = (n: number) => (n + h / 30) % 12;
  const amp = hsl.s * Math.min(hsl.l, 1 - hsl.l);
  const f = (n: number) => hsl.l - amp * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1));
  return { r: f(0), g: f(8), b: f(4), a };
}

function hueOf(c: RGBA, max: number, d: number): number {
  if (d === 0) return 0;
  let h: number;
  if (max === c.r) h = ((c.g - c.b) / d) % 6;
  else if (max === c.g) h = (c.b - c.r) / d + 2;
  else h = (c.r - c.g) / d + 4;
  h *= 60;
  return h < 0 ? h + 360 : h;
}

/** WCAG 2.x relative luminance. */
export function relativeLuminance(c: RGBA): number {
  const lin = (v: number) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
  return 0.2126 * lin(c.r) + 0.7152 * lin(c.g) + 0.0722 * lin(c.b);
}

/** WCAG contrast ratio (1–21) between two opaque colors. */
export function contrastRatio(fg: RGBA, bg: RGBA): number {
  const l1 = relativeLuminance(fg);
  const l2 = relativeLuminance(bg);
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
}

export const colorEquals = (x: RGBA, y: RGBA): boolean =>
  to255(x.r) === to255(y.r) && to255(x.g) === to255(y.g) && to255(x.b) === to255(y.b) && Math.abs(x.a - y.a) < 1e-3;
