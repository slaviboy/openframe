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
  for (let offset = 8; offset < png.length; ) {
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
