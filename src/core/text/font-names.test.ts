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
import { readFontNames, styleFromFileName } from './font-names';

/** A minimal sfnt with a `name` table (Windows UTF-16BE records) and optionally an `fvar` table. */
function sfnt(names: Record<number, string>, options: { variable?: boolean; collection?: boolean; macOnly?: boolean } = {}): Uint8Array {
  const entries = Object.entries(names).map(([id, text]) => ({ id: Number(id), text }));
  const encode = (text: string) => (options.macOnly ? [...text].map((c) => c.charCodeAt(0)) : [...text].flatMap((c) => [0, c.charCodeAt(0)]));
  const strings = entries.map((e) => encode(e.text));
  const nameSize = 6 + entries.length * 12 + strings.reduce((sum, s) => sum + s.length, 0);
  const tableCount = options.variable ? 2 : 1;
  const header = options.collection ? 16 : 0;
  const dirSize = 12 + tableCount * 16;
  const nameOffset = header + dirSize;
  const bytes = new Uint8Array(nameOffset + nameSize + (options.variable ? 4 : 0));
  const view = new DataView(bytes.buffer);
  const writeTag = (offset: number, t: string) => [...t].forEach((c, i) => view.setUint8(offset + i, c.charCodeAt(0)));
  if (options.collection) {
    writeTag(0, 'ttcf');
    view.setUint32(12, header);
  }
  view.setUint32(header, 0x00010000);
  view.setUint16(header + 4, tableCount);
  writeTag(header + 12, 'name');
  view.setUint32(header + 12 + 8, nameOffset);
  view.setUint32(header + 12 + 12, nameSize);
  if (options.variable) {
    writeTag(header + 28, 'fvar');
    view.setUint32(header + 28 + 8, nameOffset + nameSize);
  }
  view.setUint16(nameOffset + 2, entries.length);
  view.setUint16(nameOffset + 4, 6 + entries.length * 12);
  let stringOffset = 0;
  entries.forEach((e, i) => {
    const r = nameOffset + 6 + i * 12;
    view.setUint16(r, options.macOnly ? 1 : 3);
    view.setUint16(r + 2, options.macOnly ? 0 : 1);
    view.setUint16(r + 4, options.macOnly ? 0 : 0x409);
    view.setUint16(r + 6, e.id);
    view.setUint16(r + 8, strings[i]!.length);
    view.setUint16(r + 10, stringOffset);
    bytes.set(strings[i]!, nameOffset + 6 + entries.length * 12 + stringOffset);
    stringOffset += strings[i]!.length;
  });
  return bytes;
}

describe('font file names', () => {
  test('reads family and style from the name table', () => {
    expect(readFontNames(sfnt({ 1: 'Test Sans', 2: 'Bold Italic' }))).toEqual({ family: 'Test Sans', style: 'Bold Italic', variable: false });
    // Typographic names win over legacy ones.
    expect(readFontNames(sfnt({ 1: 'Test Sans Light', 2: 'Regular', 16: 'Test Sans', 17: 'Light' }))).toEqual({ family: 'Test Sans', style: 'Light', variable: false });
    expect(readFontNames(sfnt({ 1: 'Mac Font' }, { macOnly: true }))).toEqual({ family: 'Mac Font', style: 'Regular', variable: false });
    expect(readFontNames(sfnt({ 1: 'Axes', 2: 'Regular' }, { variable: true }))?.variable).toBe(true);
    expect(readFontNames(sfnt({ 1: 'First', 2: 'Medium' }, { collection: true }))).toEqual({ family: 'First', style: 'Medium', variable: false });
  });

  test('rejects files it cannot read', () => {
    expect(readFontNames(new Uint8Array(4))).toBeNull();
    expect(readFontNames(new TextEncoder().encode('wOF2 compressed font data here'))).toBeNull();
    expect(readFontNames(sfnt({ 2: 'Bold' }))).toBeNull();
  });

  test('styles from file names', () => {
    expect(styleFromFileName('Roboto-SemiBoldItalic.woff2')).toBe('Semi Bold Italic');
    expect(styleFromFileName('Lato-Bold.ttf')).toBe('Bold');
    expect(styleFromFileName('Montserrat.otf')).toBe('Regular');
    expect(styleFromFileName('fa-solid-900.woff2')).toBe('Black');
    expect(styleFromFileName('fa-regular-400.woff2')).toBe('Regular');
  });
});
