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

import outlineFonts from 'virtual:font-outlines';
import type { PathCommand } from '@/core/geometry/corners';
import type { FontLoader, OutlineFont } from '@/core/text/glyph-paths';
import { BUNDLED_FAMILY } from './font-files';

/** The first four bytes of a WOFF2 file, whose tables are packed and can't be read for their outlines. */
const WOFF2_SIGNATURE = 0x774f4632;

/** How a glyph's own path commands read, which are quadratic where a font's outlines are. */
interface GlyphCommand {
  readonly type: 'M' | 'L' | 'C' | 'Q' | 'Z';
  readonly x?: number;
  readonly y?: number;
  readonly x1?: number;
  readonly y1?: number;
  readonly x2?: number;
  readonly y2?: number;
}

/** A quadratic curve as the cubic the rest of the editor draws with. */
function cubicOf(x0: number, y0: number, c: GlyphCommand): PathCommand {
  const [qx, qy, x, y] = [c.x1!, c.y1!, c.x!, c.y!];
  return { op: 'C', x1: x0 + (2 / 3) * (qx - x0), y1: y0 + (2 / 3) * (qy - y0), x2: x + (2 / 3) * (qx - x), y2: y + (2 / 3) * (qy - y), x, y };
}

/**
 * Reads a plain font file (TrueType or OpenType) so its glyphs can be drawn as outlines. Returns null when the
 * bytes aren't a font that can be read — a font whose outlines can't be read simply contributes no glyphs.
 */
export async function loadOutlineFont(bytes: Uint8Array): Promise<OutlineFont | null> {
  // WOFF2 tables are Brotli-packed; the bundled fonts are unpacked at build time and come through `outlineFonts`.
  if (bytes.byteLength < 4 || new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(0) === WOFF2_SIGNATURE) return null;
  try {
    const { parse } = await import('opentype.js');
    const buffer = new ArrayBuffer(bytes.byteLength);
    new Uint8Array(buffer).set(bytes);
    const font = parse(buffer);
    return {
      has: (char) => font.charToGlyphIndex(char) > 0,
      outline: (char, x, y, fontSize) => {
        const commands: PathCommand[] = [];
        let [cx, cy] = [0, 0];
        for (const c of font.charToGlyph(char).getPath(x, y, fontSize).commands as GlyphCommand[]) {
          if (c.type === 'Z') commands.push({ op: 'Z' });
          else if (c.type === 'M') commands.push({ op: 'M', x: c.x!, y: c.y! });
          else if (c.type === 'L') commands.push({ op: 'L', x: c.x!, y: c.y! });
          else if (c.type === 'Q') commands.push(cubicOf(cx, cy, c));
          else commands.push({ op: 'C', x1: c.x1!, y1: c.y1!, x2: c.x2!, y2: c.y2!, x: c.x!, y: c.y! });
          if (c.type !== 'Z') {
            cx = c.x!;
            cy = c.y!;
          }
        }
        return commands;
      },
    };
  } catch {
    return null;
  }
}

/** Decodes one of the bundled fonts, which ship as base64 so they can sit in a chunk of their own. */
function bytesOf(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/**
 * Which bundled font a family's outlines come from. The subsets are registered as `Inter (greek)` and the like,
 * and the family users pick is plain `Inter`, whose outlines are in the Latin subset.
 */
function bundledKey(family: string): string | null {
  if (family === BUNDLED_FAMILY) return 'latin';
  const subset = new RegExp(`^${BUNDLED_FAMILY} \\((.+)\\)$`).exec(family)?.[1];
  return subset !== undefined && subset in outlineFonts ? subset : null;
}

/**
 * Reads glyph outlines for a family: from one of the bundled fonts when it is one of those, and otherwise from
 * the font file the family was registered with, which a user font supplies. Each font is read once.
 */
export function bundledFontLoader(fontBytesOf: (family: string) => Uint8Array | null): FontLoader {
  const loaded = new Map<string, Promise<OutlineFont | null>>();
  return (family) => {
    let font = loaded.get(family);
    if (!font) {
      const key = bundledKey(family);
      font = key === null ? loadOutlineFont(fontBytesOf(family) ?? new Uint8Array()) : outlineFonts[key]!().then((module) => loadOutlineFont(bytesOf(module.default)));
      loaded.set(family, font);
    }
    return font;
  };
}
