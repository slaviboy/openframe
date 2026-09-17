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

import type { PathCommand } from '../geometry/corners';
import type { GlyphPlacement } from './text-layout';

/** A font whose glyph outlines can be read, as much of one as drawing outlines needs. */
export interface OutlineFont {
  /** Whether the font draws this character at all (a font without the glyph must not draw a blank box for it). */
  has(char: string): boolean;
  /** The character's outline, drawn from the pen position `x` on the baseline `y`, at `fontSize`. */
  outline(char: string, x: number, y: number, fontSize: number): PathCommand[];
}

/** Where the outlines of a font's families are read from: the family name in, a font to read out. */
export type FontLoader = (family: string) => Promise<OutlineFont | null>;

/**
 * The outlines of a laid-out text layer's characters, as one path in the layer's space. Each character is drawn
 * from the font its style asks for, or from the first of `fallbacks` that has the character — which is how text
 * that the chosen font doesn't cover still comes out as the shapes that were on the canvas.
 *
 * Characters no font on offer can draw are left out and counted in `missing`.
 */
export async function outlineGlyphs(
  placements: readonly GlyphPlacement[],
  load: FontLoader,
  fallbacks: readonly string[] = [],
): Promise<{ readonly commands: PathCommand[]; readonly missing: number }> {
  const fonts = new Map<string, OutlineFont | null>();
  const fontFor = async (family: string): Promise<OutlineFont | null> => {
    if (!fonts.has(family)) fonts.set(family, await load(family));
    return fonts.get(family) ?? null;
  };

  const commands: PathCommand[] = [];
  let missing = 0;
  for (const placement of placements) {
    let font = await fontFor(placement.family);
    if (!font?.has(placement.char)) {
      font = null;
      for (const family of fallbacks) {
        const candidate = await fontFor(family);
        if (candidate?.has(placement.char)) {
          font = candidate;
          break;
        }
      }
    }
    if (!font) {
      missing += 1;
      continue;
    }
    commands.push(...font.outline(placement.char, placement.x, placement.baseline, placement.fontSize));
  }
  return { commands, missing };
}
