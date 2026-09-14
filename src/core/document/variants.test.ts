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
import { formatVariantName, parseVariantName, variantNamesFromComponents } from './variants';

describe('variant names', () => {
  test('parse and format Property=value, Property=value', () => {
    expect(parseVariantName('Size=Large, State=Default')).toEqual([
      ['Size', 'Large'],
      ['State', 'Default'],
    ]);
    expect(parseVariantName(' Size = Large ')).toEqual([['Size', 'Large']]);
    expect(formatVariantName([['Size', 'Large'], ['State', 'Default']])).toBe('Size=Large, State=Default');
  });

  test('names that do not follow the syntax are not variant names', () => {
    for (const name of ['Button', 'Size=', '=Large', 'Size=Large, Size=Small', 'Size=Large,']) expect(parseVariantName(name)).toBeNull();
  });

  test('combining slash-named components: the first part names the set, the others become Variant, Property 2, …', () => {
    expect(variantNamesFromComponents(['Button/Primary/Large/Default/False', 'Button/Secondary/Small/Pressed/True'])).toEqual({
      setName: 'Button',
      variants: ['Variant=Primary, Property 2=Large, Property 3=Default, Property 4=False', 'Variant=Secondary, Property 2=Small, Property 3=Pressed, Property 4=True'],
    });
    expect(variantNamesFromComponents(['Card', 'Card dark'])).toEqual({ setName: 'Card', variants: ['Variant=Card', 'Variant=Card dark'] });
  });
});
