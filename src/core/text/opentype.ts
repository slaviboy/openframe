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

import type { OpenTypeFeatures } from '../schema/document';

export type { OpenTypeFeatures };

/** Features shapers apply unless turned off. */
const DEFAULT_ON = new Set(['liga', 'clig', 'calt', 'kern']);

export const isDefaultOnFeature = (tag: string): boolean => DEFAULT_ON.has(tag);

/** Whether a feature is in effect: its setting, or the default (on for ligatures, contextual alternates and kerning). */
export const isFeatureOn = (features: OpenTypeFeatures, tag: string): boolean => features[tag] ?? DEFAULT_ON.has(tag);

/** The features with one turned on or off. A setting equal to the default is dropped, so defaults are stored as nothing. */
export function withFeature(features: OpenTypeFeatures, tag: string, on: boolean): OpenTypeFeatures {
  const next: Record<string, boolean> = Object.fromEntries(Object.entries(features).filter(([t]) => t !== tag));
  if (on !== DEFAULT_ON.has(tag)) next[tag] = on;
  return next;
}

/** Turns on at most one of mutually exclusive features. */
function withOneOf(features: OpenTypeFeatures, tags: readonly string[], chosen: string | null): OpenTypeFeatures {
  return tags.reduce((next, tag) => withFeature(next, tag, tag === chosen), features);
}

export type FigureSpacing = 'DEFAULT' | 'PROPORTIONAL' | 'TABULAR';
export type FigureStyle = 'DEFAULT' | 'LINING' | 'OLDSTYLE';
export type NumberPosition = 'NORMAL' | 'SUPERSCRIPT' | 'SUBSCRIPT';

/** Number style: proportional (pnum) or tabular, also called monospace (tnum), figures. */
export const figureSpacing = (f: OpenTypeFeatures): FigureSpacing => (f.tnum ? 'TABULAR' : f.pnum ? 'PROPORTIONAL' : 'DEFAULT');
export const withFigureSpacing = (f: OpenTypeFeatures, value: FigureSpacing): OpenTypeFeatures => withOneOf(f, ['pnum', 'tnum'], { DEFAULT: null, PROPORTIONAL: 'pnum', TABULAR: 'tnum' }[value]);

/** Number style: uppercase, also called lining (lnum), or lowercase, also called old-style (onum), figures. */
export const figureStyle = (f: OpenTypeFeatures): FigureStyle => (f.onum ? 'OLDSTYLE' : f.lnum ? 'LINING' : 'DEFAULT');
export const withFigureStyle = (f: OpenTypeFeatures, value: FigureStyle): OpenTypeFeatures => withOneOf(f, ['lnum', 'onum'], { DEFAULT: null, LINING: 'lnum', OLDSTYLE: 'onum' }[value]);

/** Number position: superscript (sups) or subscript (subs) glyphs from the font. */
export const numberPosition = (f: OpenTypeFeatures): NumberPosition => (f.sups ? 'SUPERSCRIPT' : f.subs ? 'SUBSCRIPT' : 'NORMAL');
export const withNumberPosition = (f: OpenTypeFeatures, value: NumberPosition): OpenTypeFeatures => withOneOf(f, ['sups', 'subs'], { NORMAL: null, SUPERSCRIPT: 'sups', SUBSCRIPT: 'subs' }[value]);

const LABELS: Readonly<Record<string, string>> = {
  liga: 'Standard ligatures',
  dlig: 'Discretionary ligatures',
  calt: 'Contextual alternates',
  salt: 'Stylistic alternates',
  ordn: 'Ordinals',
  c2sc: 'Small caps from capitals',
  kern: 'Kerning',
  case: 'Case-sensitive forms',
  cpsp: 'Capital spacing',
  tnum: 'Tabular figures',
  pnum: 'Proportional figures',
  lnum: 'Lining figures',
  onum: 'Old-style figures',
  sups: 'Superscript',
  subs: 'Subscript',
  frac: 'Fractions',
  zero: 'Slashed zero',
  numr: 'Numerators',
  dnom: 'Denominators',
  sinf: 'Scientific inferiors',
};

const pad = (n: number) => String(n).padStart(2, '0');
const STYLISTIC_SETS = Array.from({ length: 20 }, (_, i) => `ss${pad(i + 1)}`);
const CHARACTER_VARIANTS = Array.from({ length: 30 }, (_, i) => `cv${pad(i + 1)}`);

/** Features by group as the OpenType features list shows them. Numbers and letter case features have their own controls. */
const LIST_GROUPS: readonly (readonly [string, readonly string[]])[] = [
  ['Letterforms', ['liga', 'dlig', 'calt', 'salt', 'ordn', 'c2sc']],
  ['Stylistic sets', STYLISTIC_SETS],
  ['Character variants', CHARACTER_VARIANTS],
  ['Horizontal spacing', ['kern']],
  ['Numbers', ['numr', 'dnom', 'sinf']],
];

/** Every feature whose support is detected for a font. */
export const PROBED_FEATURES: readonly string[] = [...LIST_GROUPS.flatMap(([, tags]) => tags), 'case', 'cpsp', 'tnum', 'pnum', 'lnum', 'onum', 'sups', 'subs', 'frac', 'zero'];

/** The display name of a feature tag. Fonts can name their stylistic sets and character variants, but those names aren't read. */
export function featureLabel(tag: string): string {
  if (/^ss\d\d$/.test(tag)) return `Stylistic set ${Number(tag.slice(2))}`;
  if (/^cv\d\d$/.test(tag)) return `Character variant ${Number(tag.slice(2))}`;
  return LABELS[tag] ?? tag;
}

/** The supported features for the OpenType features list, grouped and in order; empty groups are left out. */
export function listedFeatures(supported: ReadonlySet<string>): { readonly group: string; readonly tags: readonly string[] }[] {
  return LIST_GROUPS.map(([group, tags]) => ({ group, tags: tags.filter((tag) => supported.has(tag)) })).filter((g) => g.tags.length > 0);
}

/** Shaper feature settings for a run: every stored setting, and small caps from the letter case. */
export function toFontFeatures(features: OpenTypeFeatures, smallCaps: boolean): { name: string; value: number }[] {
  const settings = Object.entries(features).map(([name, on]) => ({ name, value: on ? 1 : 0 }));
  if (smallCaps && features.smcp === undefined) settings.push({ name: 'smcp', value: 1 });
  return settings;
}

/** Text that exercises the common features: figures, fractions, ligatures, capitals with punctuation, ordinals. */
export const FEATURE_PROBE_TEXT = `${Array.from({ length: 94 }, (_, i) => String.fromCharCode(33 + i)).join('')} 0O 1/2 3/4 10/20 fi fl ff ffi ffl st ct Th 1st 2nd 3rd 4th 1a 2o (HAMBURG) H-H H:H [H] ¿H? «H» -> --> <= >= a g l I y`;
