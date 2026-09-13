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
import { EffectSchema, type Effect } from '../schema/document';
import {
  blurOffsets,
  canAddEffect,
  convertEffect,
  defaultEffect,
  effectOutset,
  isProgressiveBlur,
  levelWeight,
  limitEffects,
  maxBlurRadius,
  nextEffectType,
  progressiveBlurLevels,
  setBlurType,
} from './effects';

describe('effects', () => {
  test('defaults validate against the schema', () => {
    for (const type of ['DROP_SHADOW', 'INNER_SHADOW', 'LAYER_BLUR', 'BACKGROUND_BLUR'] as const) {
      expect(EffectSchema.safeParse(defaultEffect(type)).success).toBe(true);
    }
  });

  test('converting keeps shared settings', () => {
    const drop = { ...defaultEffect('DROP_SHADOW'), radius: 12, offset: { x: 3, y: -2 } } as ReturnType<typeof defaultEffect>;
    const inner = convertEffect(drop, 'INNER_SHADOW');
    expect(inner).toMatchObject({ type: 'INNER_SHADOW', radius: 12, offset: { x: 3, y: -2 } });
    expect('showShadowBehindNode' in inner).toBe(false);
    expect(convertEffect(inner, 'DROP_SHADOW')).toMatchObject({ type: 'DROP_SHADOW', showShadowBehindNode: false, radius: 12 });
    expect(convertEffect(drop, 'LAYER_BLUR')).toEqual({ type: 'LAYER_BLUR', radius: 12, visible: true });
    expect(EffectSchema.safeParse(convertEffect(drop, 'BACKGROUND_BLUR')).success).toBe(true);
  });

  test('outset covers drop shadows and layer blurs, ignoring hidden effects', () => {
    const drop = { ...defaultEffect('DROP_SHADOW'), offset: { x: 2, y: 10 }, radius: 6, spread: 3 } as ReturnType<typeof defaultEffect>;
    expect(effectOutset([drop])).toBe(19);
    expect(effectOutset([{ ...drop, visible: false } as typeof drop])).toBe(0);
    expect(effectOutset([defaultEffect('INNER_SHADOW'), { type: 'LAYER_BLUR', radius: 8, visible: true }])).toBe(8);
    expect(effectOutset(undefined)).toBe(0);
  });

  test('progressive blur levels weigh to 1 everywhere and follow the radius ramp', () => {
    const blur = setBlurType({ type: 'LAYER_BLUR', radius: 40, visible: true }, 'PROGRESSIVE');
    expect(EffectSchema.parse(blur)).toEqual(blur);
    const levels = progressiveBlurLevels(blur);
    expect(levels.length).toBeGreaterThan(2);
    expect(levels[0]!.radius).toBe(0);
    expect(levels.at(-1)!.radius).toBe(40);
    for (const t of [0, 0.1, 0.37, 0.5, 0.83, 1]) {
      expect(levels.reduce((sum, level) => sum + levelWeight(level, t), 0)).toBeCloseTo(1);
    }
    expect(levelWeight(levels[0]!, 0)).toBe(1);
    expect(levelWeight(levels.at(-1)!, 1)).toBe(1);
  });

  test('blur type switches keep the radius; progressive settings only exist on progressive blurs', () => {
    const progressive = setBlurType({ type: 'BACKGROUND_BLUR', radius: 12, visible: true }, 'PROGRESSIVE');
    expect(progressive).toMatchObject({ blurType: 'PROGRESSIVE', startRadius: 0, startOffset: { x: 0.5, y: 0 }, endOffset: { x: 0.5, y: 1 } });
    expect(maxBlurRadius({ ...progressive, startRadius: 30 })).toBe(30);
    expect(blurOffsets({ type: 'LAYER_BLUR', radius: 1, visible: true }).end).toEqual({ x: 0.5, y: 1 });
    const uniform = setBlurType(progressive, 'NORMAL');
    expect(uniform).toEqual({ type: 'BACKGROUND_BLUR', radius: 12, visible: true });
    expect(isProgressiveBlur(uniform)).toBe(false);
    expect(effectOutset([{ ...progressive, type: 'LAYER_BLUR', startRadius: 25 }])).toBe(25);
  });

  test('effect limits: 8 drop and inner shadows, one layer and one background blur', () => {
    const shadows = Array.from({ length: 9 }, () => defaultEffect('DROP_SHADOW'));
    expect(canAddEffect(shadows.slice(0, 7), 'DROP_SHADOW')).toBe(true);
    expect(canAddEffect(shadows.slice(0, 8), 'DROP_SHADOW')).toBe(false);
    expect(nextEffectType(shadows.slice(0, 8))).toBe('INNER_SHADOW');
    const blurs = [defaultEffect('LAYER_BLUR'), ({ ...defaultEffect('LAYER_BLUR'), radius: 30 } as Effect), defaultEffect('BACKGROUND_BLUR')];
    expect(canAddEffect(blurs, 'LAYER_BLUR')).toBe(false);
    // Only the first effects of each type count; extra ones are ignored when rendering.
    const limited = limitEffects([...shadows, ...blurs]);
    expect(limited.filter((e) => e.type === 'DROP_SHADOW')).toHaveLength(8);
    expect(limited.filter((e) => e.type === 'LAYER_BLUR')).toEqual([defaultEffect('LAYER_BLUR')]);
    expect(effectOutset([defaultEffect('LAYER_BLUR'), ({ ...defaultEffect('LAYER_BLUR'), radius: 30 } as Effect)])).toBe(4);
    const full = [...shadows.slice(0, 8), ...Array.from({ length: 8 }, () => defaultEffect('INNER_SHADOW')), ...blurs];
    expect(nextEffectType(full)).toBe('NOISE');
    const everything = [...full, defaultEffect('NOISE'), defaultEffect('NOISE'), defaultEffect('TEXTURE')];
    expect(nextEffectType(everything)).toBeNull();
    expect(canAddEffect([defaultEffect('NOISE')], 'NOISE')).toBe(true);
    expect(canAddEffect([defaultEffect('TEXTURE')], 'TEXTURE')).toBe(false);
  });

  test('noise and texture defaults are valid; converting keeps visibility; unclipped texture extends the bounds', () => {
    for (const type of ['NOISE', 'TEXTURE'] as const) expect(EffectSchema.parse(defaultEffect(type))).toEqual(defaultEffect(type));
    const hidden = { ...defaultEffect('DROP_SHADOW'), visible: false };
    expect(convertEffect(hidden, 'NOISE')).toMatchObject({ type: 'NOISE', visible: false });
    expect(convertEffect(defaultEffect('NOISE'), 'LAYER_BLUR')).toEqual(defaultEffect('LAYER_BLUR'));
    expect(effectOutset([{ ...defaultEffect('TEXTURE'), radius: 12 } as Effect])).toBe(12);
    expect(effectOutset([{ ...defaultEffect('TEXTURE'), radius: 12, clipToShape: true } as Effect])).toBe(0);
  });
});
