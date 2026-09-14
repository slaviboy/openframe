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
import { containsEmoji } from './emoji';

describe('emoji detection', () => {
  test('pictographs and flags are emoji; letters and digits are not', () => {
    expect(containsEmoji('Hi 😀')).toBe(true);
    expect(containsEmoji('🇺🇸')).toBe(true);
    expect(containsEmoji('❤️')).toBe(true);
    expect(containsEmoji('Hello 123 → ©')).toBe(false);
  });
});
