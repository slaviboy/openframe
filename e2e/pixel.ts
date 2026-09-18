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

import { inflateSync } from 'node:zlib';
import type { Page } from '@playwright/test';

/** The color of the page at a point, read from a 1 × 1 screenshot. */
export async function pixelAt(page: Page, x: number, y: number): Promise<{ r: number; g: number; b: number }> {
  const png = await page.screenshot({ clip: { x, y, width: 1, height: 1 } });
  const idat: Buffer[] = [];
  // Chunks follow the 8-byte signature: length, type, data, CRC.
  for (let offset = 8; offset < png.length;) {
    const length = png.readUInt32BE(offset);
    const type = png.toString('ascii', offset + 4, offset + 8);
    if (type === 'IDAT') idat.push(png.subarray(offset + 8, offset + 8 + length));
    if (type === 'IEND') break;
    offset += 12 + length;
  }
  const raw = inflateSync(Buffer.concat(idat));
  // Every PNG filter predicts the first pixel of the first row from zeros, so its bytes follow the filter byte as they are.
  return { r: raw[1]!, g: raw[2]!, b: raw[3]! };
}

/**
 * One row of the page's pixels, as red/green/blue triples. The screenshot is a single row, so every PNG filter
 * predicts from the pixel to its left and from zeros above, which is what `unfilter` undoes.
 */
export async function rowAt(page: Page, x: number, y: number, width: number): Promise<{ r: number; g: number; b: number }[]> {
  const png = await page.screenshot({ clip: { x, y, width, height: 1 } });
  const idat: Buffer[] = [];
  let depth = 4;
  for (let offset = 8; offset < png.length;) {
    const length = png.readUInt32BE(offset);
    const type = png.toString('ascii', offset + 4, offset + 8);
    // The header says the color type, which is how many bytes each pixel takes: 6 is RGBA, 2 is RGB.
    if (type === 'IHDR') depth = png[offset + 8 + 9] === 2 ? 3 : 4;
    if (type === 'IDAT') idat.push(png.subarray(offset + 8, offset + 8 + length));
    if (type === 'IEND') break;
    offset += 12 + length;
  }
  const raw = inflateSync(Buffer.concat(idat));
  const filter = raw[0]!;
  const bytes = unfilter(raw.subarray(1), filter, depth);
  const out: { r: number; g: number; b: number }[] = [];
  for (let i = 0; i + depth <= bytes.length; i += depth) out.push({ r: bytes[i]!, g: bytes[i + 1]!, b: bytes[i + 2]! });
  return out;
}

/** Undoes one PNG row filter, the row above being zeros (there is only one row). */
function unfilter(row: Buffer, filter: number, depth: number): Buffer {
  const out = Buffer.from(row);
  for (let i = 0; i < out.length; i++) {
    const left = i >= depth ? out[i - depth]! : 0;
    // Up and Paeth both predict from the row above, which is zeros, so Paeth falls back to the pixel on the left.
    const predicted = filter === 1 || filter === 4 ? left : filter === 3 ? left >> 1 : 0;
    out[i] = (out[i]! + predicted) & 0xff;
  }
  return out;
}
