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
import { EffectSchema } from '../schema/document';
import { convertEffect, defaultEffect, effectOutset } from './effects';

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
});
