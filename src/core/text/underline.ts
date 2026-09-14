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

/** A font's underline, in pixels at a font size: the stroke's top below the baseline and its thickness. */
export interface UnderlineMetrics {
  readonly position: number;
  readonly thickness: number;
}

/** Used when a font doesn't report its underline. */
export const fallbackUnderlineMetrics = (fontSize: number): UnderlineMetrics => ({ position: fontSize * 0.17, thickness: Math.max(1, fontSize / 16) });

/**
 * The underline of a run on a line: its thickness (the set value, or the font's) and the y of its
 * center line, `offset` pixels below the font's own position.
 */
export function underlineLine(baseline: number, metrics: UnderlineMetrics, thickness: number | null, offset: number): { readonly y: number; readonly thickness: number } {
  const t = Math.max(0.1, thickness ?? metrics.thickness);
  return { y: baseline + metrics.position + offset + t / 2, thickness: t };
}

/**
 * A wavy line from x1 to x2 around y, as quadratic curves: [controlX, controlY, endX, endY] per half
 * wave. Its height and each half wave's length grow with the stroke thickness.
 */
export function wavySegments(x1: number, x2: number, y: number, thickness: number): [number, number, number, number][] {
  const half = Math.max(2, thickness * 2);
  const amplitude = Math.max(1, thickness * 1.2);
  const segments: [number, number, number, number][] = [];
  let up = true;
  for (let x = x1; x < x2 - 1e-6; x += half) {
    const end = Math.min(x2, x + half);
    segments.push([(x + end) / 2, y + (up ? -amplitude : amplitude) * ((end - x) / half) * 2, end, y]);
    up = !up;
  }
  return segments;
}
