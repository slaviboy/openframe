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

/** Names read from a font file. */
export interface FontFileInfo {
  readonly family: string;
  readonly style: string;
  /** The font has variation axes (an `fvar` table). */
  readonly variable: boolean;
}

/** A variation axis of a variable font. */
export interface FontAxis {
  /** Four-character axis tag, e.g. `wght` or `GRAD`. */
  readonly tag: string;
  readonly name: string;
  readonly min: number;
  readonly default: number;
  readonly max: number;
  /** The font marks the axis as not meant for users. */
  readonly hidden: boolean;
}

const STANDARD_AXIS_NAMES: Readonly<Record<string, string>> = { wght: 'Weight', wdth: 'Width', opsz: 'Optical size', ital: 'Italic', slnt: 'Slant' };

const tag = (view: DataView, offset: number) =>
  String.fromCharCode(view.getUint8(offset), view.getUint8(offset + 1), view.getUint8(offset + 2), view.getUint8(offset + 3));

function utf16be(bytes: Uint8Array, start: number, length: number): string {
  let text = '';
  for (let i = start; i + 1 < start + length; i += 2) text += String.fromCharCode((bytes[i]! << 8) | bytes[i + 1]!);
  return text;
}

const latin1 = (bytes: Uint8Array, start: number, length: number) => String.fromCharCode(...bytes.subarray(start, start + length));

/** The table offsets of a TrueType or OpenType font (or a collection's first font), or null when it isn't a readable sfnt. */
function openSfnt(bytes: Uint8Array): { view: DataView; tables: Map<string, number> } | null {
  if (bytes.length < 12) return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let directory = 0;
  if (tag(view, 0) === 'ttcf') {
    if (bytes.length < 16) return null;
    directory = view.getUint32(12);
    if (directory + 12 > bytes.length) return null;
  }
  const version = view.getUint32(directory);
  if (version !== 0x00010000 && tag(view, directory) !== 'OTTO' && tag(view, directory) !== 'true') return null;
  const count = view.getUint16(directory + 4);
  const tables = new Map<string, number>();
  for (let i = 0; i < count; i++) {
    const record = directory + 12 + i * 16;
    if (record + 16 > bytes.length) return null;
    tables.set(tag(view, record), view.getUint32(record + 8));
  }
  return { view, tables };
}

/** The best record of each requested name ID: Windows English over other Windows and Unicode records over Mac Roman. */
function readNames(bytes: Uint8Array, view: DataView, name: number, ids: ReadonlySet<number>): Map<number, string> {
  const best = new Map<number, { text: string; score: number }>();
  if (name + 6 > bytes.length) return new Map();
  const count = view.getUint16(name + 2);
  const storage = name + view.getUint16(name + 4);
  for (let i = 0; i < count; i++) {
    const record = name + 6 + i * 12;
    if (record + 12 > bytes.length) break;
    const platform = view.getUint16(record);
    const encoding = view.getUint16(record + 2);
    const language = view.getUint16(record + 4);
    const id = view.getUint16(record + 6);
    const length = view.getUint16(record + 8);
    const start = storage + view.getUint16(record + 10);
    if (!ids.has(id) || start + length > bytes.length) continue;
    let text: string | null = null;
    let score = 0;
    if (platform === 3 && (encoding === 0 || encoding === 1 || encoding === 10)) {
      text = utf16be(bytes, start, length);
      score = language === 0x409 ? 3 : 2;
    } else if (platform === 0) {
      text = utf16be(bytes, start, length);
      score = 2;
    } else if (platform === 1 && encoding === 0) {
      text = latin1(bytes, start, length);
      score = language === 0 ? 1 : 0;
    }
    const trimmed = text?.trim();
    if (trimmed && (best.get(id)?.score ?? -1) < score) best.set(id, { text: trimmed, score });
  }
  return new Map([...best].map(([id, { text }]) => [id, text]));
}

/**
 * Family and style names of a TrueType or OpenType font (or the first font of a collection), from
 * its `name` table. Typographic names (IDs 16 and 17) win over legacy ones (1 and 2), and Windows
 * English records over other platforms. Returns null for anything that isn't a readable sfnt
 * (compressed WOFF and WOFF2 files included).
 */
export function readFontNames(bytes: Uint8Array): FontFileInfo | null {
  const sfnt = openSfnt(bytes);
  if (!sfnt) return null;
  const name = sfnt.tables.get('name');
  if (name === undefined || name + 6 > bytes.length) return null;
  const names = readNames(bytes, sfnt.view, name, new Set([1, 2, 16, 17]));
  const family = names.get(16) ?? names.get(1);
  const style = names.get(17) ?? names.get(2) ?? 'Regular';
  return family ? { family, style, variable: sfnt.tables.has('fvar') } : null;
}

const fixed = (view: DataView, offset: number) => Math.round((view.getInt32(offset) / 65536) * 1000) / 1000;

/**
 * The variation axes of a variable TrueType or OpenType font, from its `fvar` table, named by the
 * font's `name` table (or the standard names of registered axes). Empty for static fonts and for
 * files that aren't a readable sfnt (compressed WOFF and WOFF2 included).
 */
export function readFontAxes(bytes: Uint8Array): FontAxis[] {
  const sfnt = openSfnt(bytes);
  const fvar = sfnt?.tables.get('fvar');
  if (!sfnt || fvar === undefined || fvar + 16 > bytes.length) return [];
  const { view } = sfnt;
  const axesStart = fvar + view.getUint16(fvar + 4);
  const count = view.getUint16(fvar + 8);
  const size = view.getUint16(fvar + 10);
  if (size < 20) return [];
  const records: (Omit<FontAxis, 'name'> & { nameId: number })[] = [];
  for (let i = 0; i < count; i++) {
    const r = axesStart + i * size;
    if (r + 20 > bytes.length) break;
    records.push({ tag: tag(view, r), min: fixed(view, r + 4), default: fixed(view, r + 8), max: fixed(view, r + 12), hidden: (view.getUint16(r + 16) & 1) === 1, nameId: view.getUint16(r + 18) });
  }
  const nameTable = sfnt.tables.get('name');
  const names = nameTable === undefined ? new Map<number, string>() : readNames(bytes, view, nameTable, new Set(records.map((r) => r.nameId)));
  return records.map(({ nameId, ...axis }) => ({ ...axis, name: names.get(nameId) ?? STANDARD_AXIS_NAMES[axis.tag] ?? axis.tag }));
}

/** A style name from a font file name ("Roboto-SemiBoldItalic.woff2" → "Semi Bold Italic"), or Regular. */
export function styleFromFileName(fileName: string): string {
  const base = fileName.replace(/\.[^.]+$/, '');
  const dash = base.lastIndexOf('-');
  const part = dash >= 0 ? base.slice(dash + 1) : '';
  const words = part.replace(/([a-z])([A-Z])/g, '$1 $2').trim();
  return words === '' ? 'Regular' : words;
}
