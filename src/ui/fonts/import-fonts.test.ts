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
import { readFontFiles } from './import-fonts';

describe('font file import', () => {
  test('compressed fonts take the engine family and the file name style; unreadable files are reported', async () => {
    const woff2 = new File([new TextEncoder().encode('wOF2 compressed')], 'Brand-SemiBoldItalic.woff2');
    const notAFont = new File([new TextEncoder().encode('hello')], 'notes.txt');
    const result = await readFontFiles([woff2, notAFont], (bytes) => (bytes[0] === 0x77 ? 'Brand' : null));
    expect(result.fonts).toHaveLength(1);
    expect(result.fonts[0]).toMatchObject({ family: 'Brand', style: 'Semi Bold Italic', variable: false, source: 'upload' });
    expect(result.fonts[0]!.id).toMatch(/^[0-9a-f]{64}$/);
    expect(result.errors).toEqual(['notes.txt is not a font file that can be read.']);
  });
});
