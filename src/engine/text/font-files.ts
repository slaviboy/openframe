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

import { isCjkSubsetFamily } from '@/core/text/cjk';

/** The font family offered to users for the bundled font. */
export const BUNDLED_FAMILY = 'Inter';

/**
 * Bundled Inter (weight axis 100–900, upright and italic), split into script subsets. The Latin
 * subset is registered as the user-facing family; the other subsets are registered under internal
 * family names and used as fallbacks for characters Latin doesn't cover.
 */
export const BUNDLED_FONT_FILES: readonly { readonly family: string; readonly file: string; readonly package: string }[] = [
  { family: BUNDLED_FAMILY, file: 'inter-latin-wght-normal.woff2', package: '@fontsource-variable/inter' },
  { family: BUNDLED_FAMILY, file: 'inter-latin-wght-italic.woff2', package: '@fontsource-variable/inter' },
  ...['latin-ext', 'cyrillic', 'cyrillic-ext', 'greek', 'greek-ext', 'vietnamese'].flatMap((subset) => [
    { family: `${BUNDLED_FAMILY} (${subset})`, file: `inter-${subset}-wght-normal.woff2`, package: '@fontsource-variable/inter' },
    { family: `${BUNDLED_FAMILY} (${subset})`, file: `inter-${subset}-wght-italic.woff2`, package: '@fontsource-variable/inter' },
  ]),
  // Right-to-left scripts Inter doesn't cover.
  { family: `${BUNDLED_FAMILY} (noto-arabic)`, file: 'noto-sans-arabic-arabic-wght-normal.woff2', package: '@fontsource-variable/noto-sans-arabic' },
  { family: `${BUNDLED_FAMILY} (noto-hebrew)`, file: 'noto-sans-hebrew-hebrew-wght-normal.woff2', package: '@fontsource-variable/noto-sans-hebrew' },
];

/** The bundled color emoji fallback (Noto Color Emoji), registered once text contains emoji. */
export const EMOJI_FAMILY = `${BUNDLED_FAMILY} (noto-color-emoji)`;
export const EMOJI_FONT_FILE = { file: 'noto-color-emoji-emoji-400-normal.woff2', package: '@fontsource/noto-color-emoji' } as const;

/**
 * The symbol fallbacks, taken from the Google Fonts library that ships under `public/fonts/google/`:
 * arrows, mathematical operators, technical marks, box drawing, geometric shapes and dingbats, which
 * the bundled text fonts largely do not carry — Inter's Latin subset has ↑ and ↓ but not ← or →, and
 * the editor's own smart symbols make both.
 *
 * Picked by measured glyph coverage, not by the `unicodeRange` these families declare: that range
 * says the `mayan-numerals` subset carries U+2190 and it does not. Between them these three cover
 * 1,577 of the 1,741 code points in those blocks, for ~580 KB read once, on demand. See docs/FONTS.md.
 */
export const SYMBOL_FALLBACK_FILES: readonly string[] = [
  'noto-sans-math/noto-sans-math-normal-400-default-0.woff2',
  'noto-sans-symbols-2/noto-sans-symbols-2-normal-400-latin-ext-3.woff2',
  'noto-sans-symbols/noto-sans-symbols-normal-100_900-latin-ext-0.woff2',
];

/** The internal family name a symbol fallback is registered under: drawn from, never picked. */
export const symbolFallbackFamily = (index: number): string => `${BUNDLED_FAMILY} (noto-symbols-${index})`;

/** Whether a registered family is an internal fallback subset rather than a font users pick. */
export const isFallbackFamily = (family: string): boolean => family.startsWith(`${BUNDLED_FAMILY} (`) || isCjkSubsetFamily(family);
