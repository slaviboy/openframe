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

/** The font family offered to users for the bundled font. */
export const BUNDLED_FAMILY = 'Inter';

/**
 * Bundled Inter (weight axis 100–900, upright and italic), split into script subsets. The Latin
 * subset is registered as the user-facing family; the other subsets are registered under internal
 * family names and used as fallbacks for characters Latin doesn't cover.
 */
export const BUNDLED_FONT_FILES: readonly { readonly family: string; readonly file: string }[] = [
  { family: BUNDLED_FAMILY, file: 'inter-latin-wght-normal.woff2' },
  { family: BUNDLED_FAMILY, file: 'inter-latin-wght-italic.woff2' },
  ...['latin-ext', 'cyrillic', 'cyrillic-ext', 'greek', 'greek-ext', 'vietnamese'].flatMap((subset) => [
    { family: `${BUNDLED_FAMILY} (${subset})`, file: `inter-${subset}-wght-normal.woff2` },
    { family: `${BUNDLED_FAMILY} (${subset})`, file: `inter-${subset}-wght-italic.woff2` },
  ]),
];

/** Whether a registered family is an internal fallback subset rather than a font users pick. */
export const isFallbackFamily = (family: string): boolean => family.startsWith(`${BUNDLED_FAMILY} (`);
