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

const LIMIT = 100_000;
const NUMBER_WITH_UNIT = /^(-?\d*\.?\d+)\s*(px|%)?$/;
const format = (v: number) => String(Math.round(v * 100) / 100);

/** "Auto", "24" (pixels) or "150%". */
export function formatLineHeight(lineHeight: LineHeight): string {
  if (lineHeight.unit === 'AUTO') return 'Auto';
  return lineHeight.unit === 'PIXELS' ? format(lineHeight.value) : `${format(lineHeight.value)}%`;
}

/** Parses "auto", "24", "24px" or "150%" (negative values are invalid); null when invalid. */
export function parseLineHeight(input: string): LineHeight | null {
  const text = input.trim().toLowerCase();
  if (text === 'auto') return { unit: 'AUTO' };
  const match = NUMBER_WITH_UNIT.exec(text);
  const value = match ? Number(match[1]) : NaN;
  if (!match || !Number.isFinite(value) || value < 0) return null;
  return { unit: match[2] === '%' ? 'PERCENT' : 'PIXELS', value: Math.min(LIMIT, value) };
}

/** "0%", "-2%" or "1.5px". */
export function formatLetterSpacing(letterSpacing: LetterSpacing): string {
  return letterSpacing.unit === 'PERCENT' ? `${format(letterSpacing.value)}%` : `${format(letterSpacing.value)}px`;
}

/** Parses "2%", "-1.5px" or a bare number, which keeps `unit`; null when invalid. */
export function parseLetterSpacing(input: string, unit: LetterSpacing['unit']): LetterSpacing | null {
  const match = NUMBER_WITH_UNIT.exec(input.trim().toLowerCase());
  const value = match ? Number(match[1]) : NaN;
  if (!match || !Number.isFinite(value)) return null;
  return { unit: match[2] === '%' ? 'PERCENT' : match[2] === 'px' ? 'PIXELS' : unit, value: Math.max(-LIMIT, Math.min(LIMIT, value)) };
}
