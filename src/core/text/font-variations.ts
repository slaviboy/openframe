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

import type { FontVariations } from '../schema/document';
import type { FontAxis } from './font-names';

export type { FontVariations };

/** The axes of the bundled Inter variable font. */
export const BUNDLED_FONT_AXES: readonly FontAxis[] = [{ tag: 'wght', name: 'Weight', min: 100, default: 400, max: 900, hidden: false }];

/**
 * Shaper variation settings for a run: the weight axis follows the style name ("Semi Bold" → 600)
 * unless the run sets `wght` itself; every other stored axis value is applied as it is.
 */
export function variationSettings(styleWeight: number, variations: FontVariations | undefined): { axis: string; value: number }[] {
  const settings = [{ axis: 'wght', value: variations?.wght ?? styleWeight }];
  for (const [axis, value] of Object.entries(variations ?? {})) if (axis !== 'wght') settings.push({ axis, value });
  return settings;
}

/** The axes of a family made of several files: each axis once, spanning every file's range. */
export function mergeAxes(existing: readonly FontAxis[], added: readonly FontAxis[]): FontAxis[] {
  const merged = existing.map((axis) => ({ ...axis }));
  for (const axis of added) {
    const index = merged.findIndex((a) => a.tag === axis.tag);
    if (index < 0) merged.push({ ...axis });
    else merged[index] = { ...merged[index]!, min: Math.min(merged[index]!.min, axis.min), max: Math.max(merged[index]!.max, axis.max), hidden: merged[index]!.hidden && axis.hidden };
  }
  return merged;
}

/** A value within an axis's range, rounded to a step that suits the range. */
export function clampAxisValue(axis: FontAxis, value: number): number {
  const step = axisStep(axis);
  const clamped = Math.min(axis.max, Math.max(axis.min, value));
  return Math.round(clamped / step) * step;
}

/** Slider step for an axis: whole units, or hundredths for small ranges such as 0–1. */
export const axisStep = (axis: FontAxis): number => (axis.max - axis.min <= 2 ? 0.01 : 1);
