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
import { createEmptyDocument } from '../document/factory';
import { History } from '../history/history';
import { IdGenerator } from '../ids/ids';
import { deserializeDocument, serializeDocument } from '../serialize/serialize';
import { p3ToSrgb, srgbToP3, toCss } from './color';
import { documentColorProfile, documentToWcag, setColorProfile } from './color-profile';

describe('color profiles', () => {
  test('Display P3 red is outside sRGB; conversions round-trip', () => {
    const red = p3ToSrgb({ r: 1, g: 0, b: 0, a: 1 });
    expect(red.r).toBeCloseTo(1.0931, 3);
    expect(red.g).toBeCloseTo(-0.227, 2);
    expect(red.b).toBeCloseTo(-0.1501, 2);
    const back = srgbToP3(red);
    expect(back.r).toBeCloseTo(1, 4);
    expect(back.g).toBeCloseTo(0, 4);
    expect(back.b).toBeCloseTo(0, 4);
    // Grays are the same in both spaces.
    const gray = p3ToSrgb({ r: 0.5, g: 0.5, b: 0.5, a: 0.3 });
    expect(gray.r).toBeCloseTo(0.5, 4);
    expect(gray.a).toBe(0.3);
    expect(documentToWcag({ r: 1, g: 0, b: 0, a: 1 }, 'DISPLAY_P3')).toEqual({ r: 1, g: 0, b: 0, a: 1 });
  });

  test('CSS uses color(display-p3 …) for P3 files', () => {
    expect(toCss({ r: 1, g: 0.5, b: 0, a: 1 }, 'DISPLAY_P3')).toBe('color(display-p3 1 0.5 0 / 1)');
    expect(toCss({ r: 1, g: 0.5, b: 0, a: 1 })).toBe('#ff8000');
  });

  test("the file's profile is an undoable, persisted document setting", () => {
    const ids = new IdGenerator('c');
    const store = createEmptyDocument({ name: 'D', now: 'n', appVersion: 't', ids });
    const history = new History({ store, captureMeta: () => null, restoreMeta: () => undefined });
    expect(documentColorProfile(store)).toBe('SRGB');
    history.run('profile', (tx) => setColorProfile(tx, 'DISPLAY_P3'));
    expect(documentColorProfile(store)).toBe('DISPLAY_P3');
    expect(documentColorProfile(deserializeDocument(serializeDocument(store)))).toBe('DISPLAY_P3');
    history.undo();
    expect(documentColorProfile(store)).toBe('SRGB');
  });
});
