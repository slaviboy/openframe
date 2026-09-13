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

import type { BlendMode } from '@/core/schema/document';

/** Layer blend modes in menu order, grouped the way design tools list them (darken, lighten, contrast, inversion, component). */
export const LAYER_BLEND_OPTIONS: readonly (readonly [BlendMode, string])[] = [
  ['PASS_THROUGH', 'Pass through'],
  ['NORMAL', 'Normal'],
  ['DARKEN', 'Darken'],
  ['MULTIPLY', 'Multiply'],
  ['PLUS_DARKER', 'Plus darker'],
  ['COLOR_BURN', 'Color burn'],
  ['LIGHTEN', 'Lighten'],
  ['SCREEN', 'Screen'],
  ['PLUS_LIGHTER', 'Plus lighter'],
  ['COLOR_DODGE', 'Color dodge'],
  ['OVERLAY', 'Overlay'],
  ['SOFT_LIGHT', 'Soft light'],
  ['HARD_LIGHT', 'Hard light'],
  ['DIFFERENCE', 'Difference'],
  ['EXCLUSION', 'Exclusion'],
  ['HUE', 'Hue'],
  ['SATURATION', 'Saturation'],
  ['COLOR', 'Color'],
  ['LUMINOSITY', 'Luminosity'],
];

/** Blend modes for fills, strokes and effects (pass through only applies to layers). */
export const PAINT_BLEND_OPTIONS: readonly (readonly [BlendMode, string])[] = LAYER_BLEND_OPTIONS.filter(([mode]) => mode !== 'PASS_THROUGH');
