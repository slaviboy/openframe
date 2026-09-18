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

import { sha256Hex } from '@/core/image/hash';
import type { UserFont } from '@/editor/fonts/font-registry';

/**
 * Material Symbols, which ship with Openframe under `public/icons/material/` (see docs/ICONS.md and
 * `scripts/fetch-material-symbols.mjs`). Each icon comes two ways: as artwork, placed as a vector layer
 * that is then editable like anything else drawn here, and as a glyph of one of the three variable fonts,
 * for text that wants an icon in it.
 *
 * The index is a few hundred kilobytes and lists every icon; the artwork and the fonts are read only when
 * one is used.
 */

const BASE = 'icons/material';

/** The three styles the set is drawn in, each one variable font over fill, weight, grade and optical size. */
export type MaterialStyle = 'outlined' | 'rounded' | 'sharp';

export interface MaterialIcon {
  readonly name: string;
  readonly codepoint: number;
  readonly categories: readonly string[];
  readonly tags: readonly string[];
  readonly popularity?: number;
  readonly styles: Partial<Record<MaterialStyle, string>>;
}

interface MaterialFont {
  readonly style: MaterialStyle;
  readonly family: string;
  readonly file: string;
}

let index: Promise<{ icons: readonly MaterialIcon[]; fonts: readonly MaterialFont[] }> | null = null;
let loaded: { icons: readonly MaterialIcon[]; fonts: readonly MaterialFont[] } = { icons: [], fonts: [] };

/** The set's index. Loaded once; empty when the icons have not been fetched. */
export async function loadMaterialSymbols(): Promise<{ icons: readonly MaterialIcon[]; fonts: readonly MaterialFont[] }> {
  index ??= fetch(`${BASE}/index.json`)
    .then((response) => (response.ok ? (response.json() as Promise<{ icons: MaterialIcon[]; fonts: MaterialFont[] }>) : { icons: [], fonts: [] }))
    .catch(() => ({ icons: [] as MaterialIcon[], fonts: [] as MaterialFont[] }));
  loaded = await index;
  return loaded;
}

/** The icons already listed, without waiting. */
export const materialIcons = (): readonly MaterialIcon[] => loaded.icons;

/** The icons whose name, tags or category match every word of a query; the most used first. */
export function searchMaterialIcons(query: string, limit = 240): readonly MaterialIcon[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  const matches = loaded.icons.filter((icon) => {
    if (words.length === 0) return true;
    const haystack = `${icon.name} ${icon.tags.join(' ')} ${icon.categories.join(' ')}`.toLowerCase();
    return words.every((word) => haystack.includes(word));
  });
  return [...matches].sort((a, b) => (a.popularity ?? 0) - (b.popularity ?? 0)).slice(0, limit);
}

/** One icon's artwork, as SVG markup ready to import as vectors; null when it isn't in the set. */
export async function readMaterialIcon(name: string, style: MaterialStyle = 'outlined'): Promise<string | null> {
  const icon = loaded.icons.find((i) => i.name === name);
  const file = icon?.styles[style] ?? icon?.styles.outlined;
  if (!file) return null;
  const response = await fetch(`${BASE}/${file}`);
  return response.ok ? await response.text() : null;
}

/** One style's variable font, ready to register, so its glyphs can be typed as text. */
export async function readMaterialFont(style: MaterialStyle = 'outlined'): Promise<UserFont[]> {
  const font = loaded.fonts.find((f) => f.style === style);
  if (!font) return [];
  const response = await fetch(`${BASE}/${font.file}`);
  if (!response.ok) throw new Error(`${font.family} could not be read.`);
  const bytes = new Uint8Array(await response.arrayBuffer());
  return [{ id: await sha256Hex(bytes), family: font.family, style: 'Regular', bytes, variable: true, source: 'local' }];
}

/** The family name of a style, for text that uses the icons as glyphs. */
export const materialFamily = (style: MaterialStyle = 'outlined'): string | undefined => loaded.fonts.find((f) => f.style === style)?.family;
