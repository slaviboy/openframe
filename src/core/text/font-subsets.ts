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

/**
 * Which subsets of a split font a text needs. A font too large to hold at once — the CJK families,
 * the colour emoji font — ships as subsets, each covering a range of code points; the build reads
 * those ranges out of the Fontsource CSS (`scripts/vite-plugin-font-subsets.ts`) and only the
 * subsets a text's own characters fall in are ever loaded.
 */

/** One subset: [subset index, comma-separated hex code point ranges]. */
export type SubsetTable = readonly (readonly [number, string])[];

const parsedTables = new WeakMap<SubsetTable, readonly (readonly [number, readonly (readonly [number, number])[]])[]>();

function parsed(table: SubsetTable): readonly (readonly [number, readonly (readonly [number, number])[]])[] {
  let result = parsedTables.get(table);
  if (!result) {
    result = table.map(([index, compact]) => [
      index,
      compact
        .split(',')
        .filter(Boolean)
        .map((part): [number, number] => {
          const [lo, hi] = part.split('-');
          const start = parseInt(lo!, 16);
          return [start, hi ? parseInt(hi, 16) : start];
        }),
    ]);
    parsedTables.set(table, result);
  }
  return result;
}

/** The subsets whose ranges cover any non-ASCII character of a text, in table order. */
export function subsetsFor(text: string, table: SubsetTable): number[] {
  const codePoints = [...new Set([...text].map((c) => c.codePointAt(0)!).filter((cp) => cp > 0x7f))];
  if (codePoints.length === 0) return [];
  return parsed(table)
    .filter(([, ranges]) => codePoints.some((cp) => ranges.some(([lo, hi]) => cp >= lo && cp <= hi)))
    .map(([index]) => index);
}
