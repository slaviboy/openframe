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

/**
 * The two libraries that read glyph outlines, neither of which ships types. Only what converting text to paths
 * actually calls is declared, so the rest of each library stays untyped and unused.
 */
declare module 'virtual:font-outlines' {
  /**
   * The bundled fonts as plain sfnt files, base64 encoded, each behind a function that fetches its own chunk.
   * Keyed by subset ("latin", "greek", "noto-arabic" and so on). Built by `scripts/vite-plugin-font-outlines.ts`.
   */
  const fonts: Readonly<Record<string, () => Promise<{ default: string }>>>;
  export default fonts;
}

declare module 'opentype.js' {
  /** One command of a glyph's outline, in the coordinates `getPath` was asked for. */
  export interface PathCommand {
    type: 'M' | 'L' | 'C' | 'Q' | 'Z';
    x?: number;
    y?: number;
    x1?: number;
    y1?: number;
    x2?: number;
    y2?: number;
  }

  export interface Path {
    commands: PathCommand[];
  }

  export interface Glyph {
    /** The glyph's outline, drawn from the pen position (`x`, `y`) at `fontSize`. */
    getPath(x: number, y: number, fontSize: number): Path;
  }

  export interface Font {
    unitsPerEm: number;
    numGlyphs: number;
    charToGlyph(char: string): Glyph;
    /** The glyph a character maps to, or 0 when the font has no glyph for it. */
    charToGlyphIndex(char: string): number;
  }

  /** Reads a font file. Throws when the bytes are not a font this library can read. */
  export function parse(buffer: ArrayBuffer): Font;
}
