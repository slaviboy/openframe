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

/** Named weights, as font style names spell them. */
export const FONT_WEIGHTS: readonly (readonly [number, string])[] = [
  [100, 'Thin'],
  [200, 'Extra Light'],
  [300, 'Light'],
  [400, 'Regular'],
  [500, 'Medium'],
  [600, 'Semi Bold'],
  [700, 'Bold'],
  [800, 'Extra Bold'],
  [900, 'Black'],
];

export interface FontStyleInfo {
  /** 1–1000 (400 regular, 700 bold). */
  readonly weight: number;
  readonly italic: boolean;
}

const normalize = (s: string) => s.toLowerCase().replace(/[\s_-]+/g, '');

const WEIGHT_ALIASES: ReadonlyMap<string, number> = new Map([
  ...FONT_WEIGHTS.map(([w, name]) => [normalize(name), w] as const),
  ['hairline', 100],
  ['ultralight', 200],
  ['book', 400],
  ['normal', 400],
  ['demibold', 600],
  ['ultrabold', 800],
  ['heavy', 900],
]);

/** Weight and slant from a style name such as "Semi Bold Italic" (unknown names are regular). */
export function parseFontStyle(style: string): FontStyleInfo {
  const italic = /italic|oblique/i.test(style);
  const rest = normalize(style.replace(/italic|oblique/gi, ''));
  return { weight: rest === '' ? 400 : (WEIGHT_ALIASES.get(rest) ?? 400), italic };
}

/** The style name for a weight and slant ("Regular", "Italic", "Bold Italic"). */
export function fontStyleName(weight: number, italic: boolean): string {
  const name = FONT_WEIGHTS.reduce((best, entry) => (Math.abs(entry[0] - weight) < Math.abs(best[0] - weight) ? entry : best))[1];
  if (!italic) return name;
  return name === 'Regular' ? 'Italic' : `${name} Italic`;
}

/** Every style of a variable font covering weights 100–900 upright and italic (Inter), regular first. */
export const VARIABLE_FONT_STYLES: readonly string[] = FONT_WEIGHTS.flatMap(([w]) => [fontStyleName(w, false), fontStyleName(w, true)]);
