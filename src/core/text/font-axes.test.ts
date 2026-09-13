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
import { readFontAxes, readFontNames } from './font-names';
import { mergeAxes, variationSettings } from './font-variations';

interface AxisSpec {
  readonly tag: string;
  readonly min: number;
  readonly default: number;
  readonly max: number;
  readonly hidden?: boolean;
  /** Written to the name table; undefined leaves the axis without a name record. */
  readonly name?: string;
}

/** A minimal variable sfnt: a `name` table with the family and axis names, and an `fvar` table. */
function variableFont(axes: readonly AxisSpec[]): Uint8Array {
  const names = [{ id: 1, text: 'Axes Sans' }, ...axes.flatMap((a, i) => (a.name ? [{ id: 256 + i, text: a.name }] : []))];
  const strings = names.map((n) => [...n.text].flatMap((c) => [0, c.charCodeAt(0)]));
  const nameSize = 6 + names.length * 12 + strings.reduce((sum, s) => sum + s.length, 0);
  const fvarSize = 16 + axes.length * 20;
  const nameOffset = 12 + 2 * 16;
  const fvarOffset = nameOffset + nameSize;
  const bytes = new Uint8Array(fvarOffset + fvarSize);
  const view = new DataView(bytes.buffer);
  const writeTag = (offset: number, t: string) => [...t].forEach((c, i) => view.setUint8(offset + i, c.charCodeAt(0)));
  view.setUint32(0, 0x00010000);
  view.setUint16(4, 2);
  writeTag(12, 'name');
  view.setUint32(20, nameOffset);
  view.setUint32(24, nameSize);
  writeTag(28, 'fvar');
  view.setUint32(36, fvarOffset);
  view.setUint32(40, fvarSize);
  view.setUint16(nameOffset + 2, names.length);
  view.setUint16(nameOffset + 4, 6 + names.length * 12);
  let stringOffset = 0;
  names.forEach((n, i) => {
    const r = nameOffset + 6 + i * 12;
    view.setUint16(r, 3);
    view.setUint16(r + 2, 1);
    view.setUint16(r + 4, 0x409);
    view.setUint16(r + 6, n.id);
    view.setUint16(r + 8, strings[i]!.length);
    view.setUint16(r + 10, stringOffset);
    bytes.set(strings[i]!, nameOffset + 6 + names.length * 12 + stringOffset);
    stringOffset += strings[i]!.length;
  });
  view.setUint16(fvarOffset, 1);
  view.setUint16(fvarOffset + 4, 16);
  view.setUint16(fvarOffset + 8, axes.length);
  view.setUint16(fvarOffset + 10, 20);
  axes.forEach((a, i) => {
    const r = fvarOffset + 16 + i * 20;
    writeTag(r, a.tag);
    view.setInt32(r + 4, Math.round(a.min * 65536));
    view.setInt32(r + 8, Math.round(a.default * 65536));
    view.setInt32(r + 12, Math.round(a.max * 65536));
    view.setUint16(r + 16, a.hidden ? 1 : 0);
    view.setUint16(r + 18, 256 + i);
  });
  return bytes;
}

describe('variable font axes', () => {
  test('axes are read from fvar and named from the name table', () => {
    const bytes = variableFont([
      { tag: 'opsz', min: 12, default: 256, max: 256, name: 'Optical Size' },
      { tag: 'wght', min: 400, default: 400, max: 1000 },
      { tag: 'GRAD', min: -0.5, default: 0, max: 1, hidden: true, name: 'Grade' },
    ]);
    expect(readFontNames(bytes)).toEqual({ family: 'Axes Sans', style: 'Regular', variable: true });
    expect(readFontAxes(bytes)).toEqual([
      { tag: 'opsz', name: 'Optical Size', min: 12, default: 256, max: 256, hidden: false },
      // No name record: the standard name.
      { tag: 'wght', name: 'Weight', min: 400, default: 400, max: 1000, hidden: false },
      { tag: 'GRAD', name: 'Grade', min: -0.5, default: 0, max: 1, hidden: true },
    ]);
    expect(readFontAxes(new TextEncoder().encode('wOF2 compressed font data here'))).toEqual([]);
  });

  test('axes of several files merge, and stored values override the weight from the style', () => {
    const regular = [{ tag: 'wght', name: 'Weight', min: 100, default: 400, max: 700, hidden: false }];
    const italic = [
      { tag: 'wght', name: 'Weight', min: 300, default: 400, max: 900, hidden: false },
      { tag: 'slnt', name: 'Slant', min: -10, default: 0, max: 0, hidden: false },
    ];
    expect(mergeAxes(regular, italic)).toEqual([
      { tag: 'wght', name: 'Weight', min: 100, default: 400, max: 900, hidden: false },
      { tag: 'slnt', name: 'Slant', min: -10, default: 0, max: 0, hidden: false },
    ]);
    expect(variationSettings(700, undefined)).toEqual([{ axis: 'wght', value: 700 }]);
    expect(variationSettings(700, { wght: 540, wdth: 80 })).toEqual([
      { axis: 'wght', value: 540 },
      { axis: 'wdth', value: 80 },
    ]);
  });
});
