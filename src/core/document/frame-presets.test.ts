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
import { DEVICE_CATEGORIES, FRAME_PRESET_CATEGORIES, FRAME_PRESETS, presetById, presetForSize, presetsIn } from './frame-presets';

describe('frame presets', () => {
  test('every preset has a unique id and a category the Frame tool lists', () => {
    expect(new Set(FRAME_PRESETS.map((p) => p.id)).size).toBe(FRAME_PRESETS.length);
    for (const p of FRAME_PRESETS) expect(FRAME_PRESET_CATEGORIES).toContain(p.category);
    expect(presetById('phone-iphone-16')).toMatchObject({ name: 'iPhone 16', width: 393, height: 852 });
    expect(presetsIn('Watch').every((p) => p.category === 'Watch')).toBe(true);
  });

  test('a frame size finds its preset, in portrait or turned to landscape', () => {
    expect(presetForSize(393, 852)).toMatchObject({ preset: { name: 'iPhone 16' }, landscape: false });
    expect(presetForSize(852, 393)).toMatchObject({ preset: { name: 'iPhone 16' }, landscape: true });
    expect(presetForSize(1080, 1080)).toMatchObject({ preset: { name: 'Instagram post' }, landscape: false });
    // Limited to devices, a paper size isn't found.
    expect(presetForSize(595, 842, DEVICE_CATEGORIES)).toBeNull();
    expect(presetForSize(100, 100)).toBeNull();
  });
});
