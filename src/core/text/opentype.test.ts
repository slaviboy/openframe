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

import { describe, expect, test } from 'vitest';
import {
  featureLabel,
  figureSpacing,
  figureStyle,
  isFeatureOn,
  listedFeatures,
  numberPosition,
  toFontFeatures,
  withFeature,
  withFigureSpacing,
  withFigureStyle,
  withNumberPosition,
} from './opentype';

describe('OpenType features', () => {
  test('settings equal to the font default are not stored', () => {
    expect(isFeatureOn({}, 'kern')).toBe(true);
    expect(isFeatureOn({}, 'ss01')).toBe(false);
    const off = withFeature({}, 'kern', false);
    expect(off).toEqual({ kern: false });
    expect(withFeature(off, 'kern', true)).toEqual({});
    expect(withFeature({ ss01: true }, 'ss01', false)).toEqual({});
    expect(toFontFeatures({ kern: false, ss02: true }, true)).toEqual([
      { name: 'kern', value: 0 },
      { name: 'ss02', value: 1 },
      { name: 'smcp', value: 1 },
    ]);
  });

  test('figure spacing, figure style and position are each one choice', () => {
    const tabular = withFigureSpacing({ pnum: true, zero: true }, 'TABULAR');
    expect(tabular).toEqual({ tnum: true, zero: true });
    expect(figureSpacing(tabular)).toBe('TABULAR');
    expect(withFigureSpacing(tabular, 'DEFAULT')).toEqual({ zero: true });
    expect(figureStyle(withFigureStyle({}, 'OLDSTYLE'))).toBe('OLDSTYLE');
    expect(withFigureStyle({ onum: true }, 'LINING')).toEqual({ lnum: true });
    expect(numberPosition(withNumberPosition({ sups: true }, 'SUBSCRIPT'))).toBe('SUBSCRIPT');
  });

  test('the features list groups supported features with readable names', () => {
    expect(listedFeatures(new Set(['tnum', 'cv02', 'calt', 'ss01', 'kern', 'dnom']))).toEqual([
      { group: 'Letterforms', tags: ['calt'] },
      { group: 'Stylistic sets', tags: ['ss01'] },
      { group: 'Character variants', tags: ['cv02'] },
      { group: 'Horizontal spacing', tags: ['kern'] },
      { group: 'Numbers', tags: ['dnom'] },
    ]);
    expect(featureLabel('ss03')).toBe('Stylistic set 3');
    expect(featureLabel('cv11')).toBe('Character variant 11');
    expect(featureLabel('zero')).toBe('Slashed zero');
  });
});
