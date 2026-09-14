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

/** Chinese (Simplified, Traditional), Japanese and Korean, as the bundled Noto Sans fonts name them. */
export type CjkScript = 'SC' | 'TC' | 'JP' | 'KR';

/** The bundled Noto Sans CJK families users can pick, by script. */
export const CJK_FAMILY_SCRIPTS: Readonly<Record<string, CjkScript>> = {
  'Noto Sans SC': 'SC',
  'Noto Sans TC': 'TC',
  'Noto Sans JP': 'JP',
  'Noto Sans KR': 'KR',
};

export const CJK_FAMILIES: readonly string[] = Object.keys(CJK_FAMILY_SCRIPTS);

/** One subset of a script: [subset index, comma-separated hex code point ranges]. */
export type CjkSubsetTable = readonly (readonly [number, string])[];

const CJK = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}\u3000-\u303f\uff00-\uffef]/u;
const KANA = /[\p{Script=Hiragana}\p{Script=Katakana}]/u;
const HANGUL = /\p{Script=Hangul}/u;

/** Whether text has Chinese, Japanese or Korean characters (or CJK punctuation and full-width forms). */
export const containsCjk = (text: string): boolean => CJK.test(text);

/**
 * The script whose Noto font draws a text's CJK characters: the one picked as the layer's family,
 * or else Japanese when there is kana, Korean when there is Hangul, and Simplified Chinese otherwise
 * (shared Han characters can differ by region; picking the language's Noto family fixes that).
 */
export function cjkScriptFor(text: string, family: string): CjkScript {
  return CJK_FAMILY_SCRIPTS[family] ?? (KANA.test(text) ? 'JP' : HANGUL.test(text) ? 'KR' : 'SC');
}

/** The internal family name a subset is registered under. */
export const cjkSubsetFamily = (script: CjkScript, index: number): string => `Noto Sans ${script} (${index})`;

/** Whether a registered family is a CJK subset (an internal fallback, not a font users pick). */
export const isCjkSubsetFamily = (family: string): boolean => /^Noto Sans (SC|TC|JP|KR) \(\d+\)$/.test(family);

const parsedTables = new WeakMap<CjkSubsetTable, readonly (readonly [number, readonly (readonly [number, number])[]])[]>();

function parsed(table: CjkSubsetTable): readonly (readonly [number, readonly (readonly [number, number])[]])[] {
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
export function cjkSubsetsFor(text: string, table: CjkSubsetTable): number[] {
  const codePoints = [...new Set([...text].map((c) => c.codePointAt(0)!).filter((cp) => cp > 0x7f))];
  if (codePoints.length === 0) return [];
  return parsed(table)
    .filter(([, ranges]) => codePoints.some((cp) => ranges.some(([lo, hi]) => cp >= lo && cp <= hi)))
    .map(([index]) => index);
}
