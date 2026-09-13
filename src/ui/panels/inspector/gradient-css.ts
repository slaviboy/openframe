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

import { toCss } from '@/core/color/color';
import type { GradientPaint } from '@/core/schema/document';

/** CSS approximation of a gradient paint for inspector swatches (ignores the gradient transform). */
export function gradientCss(paint: GradientPaint): string {
  const stops = [...paint.gradientStops]
    .sort((a, b) => a.position - b.position)
    .map((s) => `${toCss(s.color)} ${Math.round(s.position * 1000) / 10}%`)
    .join(', ');
  switch (paint.type) {
    case 'GRADIENT_LINEAR':
      return `linear-gradient(90deg, ${stops})`;
    case 'GRADIENT_ANGULAR':
      return `conic-gradient(from 90deg, ${stops})`;
    case 'GRADIENT_RADIAL':
    case 'GRADIENT_DIAMOND':
      return `radial-gradient(circle, ${stops})`;
  }
}
