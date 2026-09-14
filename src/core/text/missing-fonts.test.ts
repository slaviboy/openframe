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
import { makeText } from '../document/factory';
import type { TextNode } from '../schema/document';
import { missingFonts, replaceFontInText } from './missing-fonts';
import { styleRange, textStyleAt } from './style-runs';

let serial = 0;
const text = (patch: Partial<TextNode>): TextNode => ({ ...makeText({ id: `x:${++serial}`, parent: { id: 'x:0', key: 'V' }, name: 'T', x: 0, y: 0, width: 0, height: 0 }), ...patch });
const available = [{ family: 'Inter', styles: ['Regular', 'Bold'] }];

describe('missing fonts', () => {
  test('fonts are missing when the family or just the style is unavailable, counted per layer', () => {
    const plain = text({ characters: 'a', fontName: { family: 'Roboto', style: 'Regular' } });
    const base = text({ characters: 'hello', fontName: { family: 'Inter', style: 'Regular' } });
    const mixed = { ...base, styleRuns: styleRange(base, 0, 2, { fontName: { family: 'Inter', style: 'Black' } }) };
    const alsoRoboto = text({ characters: 'b', fontName: { family: 'Roboto', style: 'Regular' } });
    expect(missingFonts([plain, mixed, alsoRoboto, { type: 'RECTANGLE' }], available)).toEqual([
      { family: 'Inter', style: 'Black', layers: 1 },
      { family: 'Roboto', style: 'Regular', layers: 2 },
    ]);
  });

  test('replacing a font changes the layer font and runs and keeps other styles', () => {
    const base = text({ characters: 'hello world', fontName: { family: 'Roboto', style: 'Regular' } });
    const sized = { ...base, styleRuns: styleRange(base, 0, 5, { fontSize: 30 }) };
    const node = { ...sized, styleRuns: styleRange(sized, 6, 11, { fontName: { family: 'Lato', style: 'Bold' } }) };
    const result = replaceFontInText(node, { family: 'Roboto', style: 'Regular' }, { family: 'Inter', style: 'Regular' })!;
    const replaced = { ...node, ...result };
    expect(replaced.fontName).toEqual({ family: 'Inter', style: 'Regular' });
    expect(textStyleAt(replaced, 1)).toMatchObject({ fontName: { family: 'Inter', style: 'Regular' }, fontSize: 30 });
    expect(textStyleAt(replaced, 8).fontName).toEqual({ family: 'Lato', style: 'Bold' });
    // Replacing the run's font with the layer's own leaves no run for it.
    const merged = { ...replaced, ...replaceFontInText(replaced, { family: 'Lato', style: 'Bold' }, { family: 'Inter', style: 'Regular' })! };
    expect(merged.styleRuns).toEqual([{ start: 0, end: 5, style: { fontSize: 30 } }]);
    expect(replaceFontInText(merged, { family: 'Lato', style: 'Bold' }, { family: 'Inter', style: 'Bold' })).toBeNull();
  });
});
