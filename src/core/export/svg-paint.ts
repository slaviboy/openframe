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

import type { Paint } from '../schema/document';
import { escapeXml, svgNumber } from './svg-path';

/** A paint as SVG: the fill or stroke attribute's value, its opacity, and a gradient definition for `<defs>` when it has one. */
export interface SvgPaint {
  /** A color (`#rrggbb`) or a reference to a definition (`url(#id)`). */
  readonly value: string;
  /** The paint's opacity (for solid paints, the color's alpha too), for `fill-opacity` or `stroke-opacity`. */
  readonly opacity: number;
  readonly definition?: string;
}

const hex2 = (channel: number) =>
  Math.round(Math.min(1, Math.max(0, channel)) * 255)
    .toString(16)
    .padStart(2, '0');

/** A color as SVG, without its alpha (`#rrggbb`). */
export const svgColor = (color: { readonly r: number; readonly g: number; readonly b: number }): string => `#${hex2(color.r)}${hex2(color.g)}${hex2(color.b)}`;

/**
 * A paint as SVG, with `id` naming its gradient definition. Linear and radial gradients map onto the layer's bounding box
 * through their gradient transform, as in the document. Null for hidden paints and for paints SVG can't express
 * (angular and diamond gradients, images and patterns).
 */
export function svgPaint(paint: Paint, id: string): SvgPaint | null {
  if (!paint.visible) return null;
  if (paint.type === 'SOLID') return { value: svgColor(paint.color), opacity: paint.color.a * paint.opacity };
  if (paint.type !== 'GRADIENT_LINEAR' && paint.type !== 'GRADIENT_RADIAL') return null;
  const tag = paint.type === 'GRADIENT_LINEAR' ? 'linearGradient' : 'radialGradient';
  // Gradient space: a left-to-right linear gradient, or a centered radial one, filling the unit square.
  const geometry = paint.type === 'GRADIENT_LINEAR' ? 'x1="0" y1="0.5" x2="1" y2="0.5"' : 'cx="0.5" cy="0.5" r="0.5"';
  const stops = paint.gradientStops
    .map((stop) => `<stop offset="${svgNumber(stop.position)}" stop-color="${svgColor(stop.color)}"${stop.color.a < 1 ? ` stop-opacity="${svgNumber(stop.color.a)}"` : ''}/>`)
    .join('');
  const definition = `<${tag} id="${escapeXml(id)}" gradientUnits="objectBoundingBox" ${geometry} gradientTransform="matrix(${paint.gradientTransform.map(svgNumber).join(' ')})">${stops}</${tag}>`;
  return { value: `url(#${escapeXml(id)})`, opacity: paint.opacity, definition };
}
