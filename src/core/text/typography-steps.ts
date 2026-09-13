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

import type { LetterSpacing, LineHeight } from '../schema/document';
import { parseFontStyle } from './font-style';

/**
 * Keyboard steps for typography shortcuts: font size (⇧⌘< / ⇧⌘>), font weight (⌥⌘< / ⌥⌘>),
 * letter spacing (⌥< / ⌥>) and line height (⇧⌥< / ⇧⌥>). `direction` is 1 to increase, −1 to decrease.
 */

const round2 = (v: number) => Math.round(v * 100) / 100;

/** Font size by one pixel, within 1–10000. */
export const stepFontSize = (size: number, direction: 1 | -1): number => Math.min(10_000, Math.max(1, Math.round(size) + direction));

/** Letter spacing by 0.1 in its unit. */
export const stepLetterSpacing = (spacing: LetterSpacing, direction: 1 | -1): LetterSpacing => ({ unit: spacing.unit, value: round2(spacing.value + direction * 0.1) });

/**
 * Line height by one unit (pixel or percent, never below 0). Auto first becomes the equivalent
 * pixel value (`autoPixels`, the font's own line height at this size).
 */
export function stepLineHeight(lineHeight: LineHeight, autoPixels: number, direction: 1 | -1): LineHeight {
  if (lineHeight.unit === 'AUTO') return { unit: 'PIXELS', value: Math.max(0, Math.round(autoPixels) + direction) };
  return { unit: lineHeight.unit, value: Math.max(0, round2(lineHeight.value + direction)) };
}

/** The next heavier (1) or lighter (−1) style among `styles` with the same slant, or null at the end. */
export function stepFontWeight(style: string, styles: readonly string[], direction: 1 | -1): string | null {
  const current = parseFontStyle(style);
  const candidates = styles
    .map((name) => ({ name, ...parseFontStyle(name) }))
    .filter((s) => s.italic === current.italic && (direction > 0 ? s.weight > current.weight : s.weight < current.weight))
    .sort((a, b) => (direction > 0 ? a.weight - b.weight : b.weight - a.weight));
  return candidates[0]?.name ?? null;
}
