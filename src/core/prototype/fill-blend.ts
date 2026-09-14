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

import { colorAt } from '../color/paints';
import { isGradientPaint, type Color, type GradientPaint, type GradientStop, type Paint, type Transform } from '../schema/document';
import { canonicalStringify } from '../serialize/serialize';

const MAX_STOPS = 64;

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const mixColor = (a: Color, b: Color, t: number): Color => ({ r: lerp(a.r, b.r, t), g: lerp(a.g, b.g, t), b: lerp(a.b, b.b, t), a: lerp(a.a, b.a, t) });
/** How much of a paint shows: its opacity, or nothing while it's hidden. */
const alphaOf = (paint: Paint) => (paint.visible ? paint.opacity : 0);

/** A solid as a gradient of its one color, of the kind and placement of `like`, so the two can blend. */
function asGradient(paint: Paint, like: GradientPaint): GradientPaint | null {
  if (isGradientPaint(paint)) return paint;
  if (paint.type !== 'SOLID') return null;
  const stops: GradientStop[] = [
    { position: 0, color: paint.color },
    { position: 1, color: paint.color },
  ];
  return { ...like, gradientStops: stops, opacity: paint.opacity, visible: paint.visible, blendMode: paint.blendMode };
}

/** Every stop position of two gradients, in order (evenly spaced when there would be more than a gradient holds). */
function stopPositions(a: readonly GradientStop[], b: readonly GradientStop[]): number[] {
  const all = [...a, ...b].map((stop) => stop.position).sort((x, y) => x - y);
  const unique = all.filter((position, i) => i === 0 || position - all[i - 1]! > 1e-6);
  return unique.length <= MAX_STOPS ? unique : Array.from({ length: MAX_STOPS }, (_, i) => i / (MAX_STOPS - 1));
}

/**
 * A paint `t` (0–1) of the way from `from` to `to` in a smart animate, as the paints to draw. Solid colors blend; gradients
 * of the same kind (or a gradient and a solid) blend their colors along the gradient, their placement and opacity; any
 * other change — image fills, or gradients of different kinds — cross-fades, the new paint over the old, with the two
 * together as opaque as the blend of theirs.
 */
export function blendPaint(from: Paint, to: Paint, t: number): Paint[] {
  if (canonicalStringify(from) === canonicalStringify(to)) return [to];
  if (from.type === 'SOLID' && to.type === 'SOLID') return [{ ...to, opacity: lerp(from.opacity, to.opacity, t), color: mixColor(from.color, to.color, t) }];
  const shape = isGradientPaint(to) ? to : isGradientPaint(from) ? from : null;
  const a = shape && asGradient(from, shape);
  const b = shape && asGradient(to, shape);
  if (a && b && a.type === b.type) {
    const stops = stopPositions(a.gradientStops, b.gradientStops).map((position) => ({ position, color: mixColor(colorAt(a.gradientStops, position), colorAt(b.gradientStops, position), t) }));
    const transform = a.gradientTransform.map((value, i) => lerp(value, b.gradientTransform[i]!, t)) as unknown as Transform;
    return [{ ...b, gradientStops: stops, gradientTransform: transform, opacity: lerp(a.opacity, b.opacity, t) }];
  }
  // The new paint fades in over the old one, which fades out just enough for the pair to show as much as the blend.
  const over = alphaOf(to) * t;
  const total = lerp(alphaOf(from), alphaOf(to), t);
  const under = over < 1 ? Math.max(0, (total - over) / (1 - over)) : 0;
  return [
    { ...from, visible: true, opacity: under },
    { ...to, visible: true, opacity: over },
  ];
}
