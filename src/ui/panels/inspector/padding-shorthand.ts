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

export interface PaddingValues {
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
  readonly left: number;
}

/**
 * CSS shorthand typed into a padding field: "1,2,3,4" is top, right, bottom and left; "1,2" is
 * top/bottom and left/right; "1,2,3" is top, left/right and bottom. Values may be separated by
 * commas or spaces. A single value is not shorthand (the field handles it); null when not valid.
 */
export function parsePaddingShorthand(text: string): PaddingValues | null {
  const parts = text.trim().split(/[\s,]+/).filter((part) => part !== '');
  if (parts.length < 2 || parts.length > 4) return null;
  const values = parts.map(Number);
  if (values.some((v) => !Number.isFinite(v) || v < 0)) return null;
  const [a, b, c, d] = values as [number, number, number?, number?];
  if (values.length === 2) return { top: a, right: b, bottom: a, left: b };
  if (values.length === 3) return { top: a, right: b, bottom: c!, left: b };
  return { top: a, right: b, bottom: c!, left: d! };
}
