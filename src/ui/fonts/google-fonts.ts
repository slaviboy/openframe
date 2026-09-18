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
 * The Google Fonts library, which ships with Openframe under `public/fonts/google/` (see docs/FONTS.md and
 * `scripts/fetch-google-fonts.mjs`). Every family is listed in the picker from the index alone, a few tens
 * of kilobytes; a family's own files are read only when it is picked, since the whole library is far too
 * much to hold at once.
 */

const BASE = 'fonts/google';

interface IndexFile {
  readonly file: string;
  readonly subset: string;
  readonly style: string;
  readonly weight: string;
  readonly bytes: number;
}

export interface GoogleFamily {
  readonly family: string;
  readonly slug: string;
  readonly category?: string;
  readonly axes?: readonly { readonly tag: string }[];
  readonly subsets?: readonly string[];
  /** How many files the family is in; they are listed beside them, and read when it is picked. */
  readonly fileCount: number;
}

let catalogue: Promise<readonly GoogleFamily[]> | null = null;
let listed: readonly GoogleFamily[] = [];

/** The library's families. Loaded once; an empty list when the library has not been fetched. */
export async function loadGoogleCatalogue(): Promise<readonly GoogleFamily[]> {
  catalogue ??= fetch(`${BASE}/index.json`)
    .then((response) => (response.ok ? (response.json() as Promise<{ families: GoogleFamily[] }>) : { families: [] }))
    .then(({ families }) => families.filter((f) => f.fileCount > 0))
    .catch(() => [] as GoogleFamily[]);
  listed = await catalogue;
  return listed;
}

/** The families already listed, without waiting. */
export const googleFamilies = (): readonly GoogleFamily[] => listed;

/** Whether a family belongs to the library, so the picker knows it can be had. */
export const isGoogleFamily = (family: string): boolean => listed.some((f) => f.family === family);

/**
 * A family's font files, ready to register. A variable family is one file; a static one is a file per
 * weight and per subset, and they all register under the same family name so the shaper falls back
 * between them for characters one subset does not carry.
 */
export async function readGoogleFamily(family: string): Promise<UserFont[]> {
  const entry = listed.find((f) => f.family === family);
  if (!entry) return [];
  const list = await fetch(`${BASE}/${entry.slug}/files.json`);
  if (!list.ok) throw new Error(`${family} could not be read.`);
  const files = (await list.json()) as IndexFile[];
  const variable = (entry.axes?.length ?? 0) > 0;
  // css2 lists the subsets in unicode-range order, which puts Cyrillic and Greek before Latin. The shaper
  // takes the first face registered for a family as the one to shape with, so the family would draw Latin
  // text in the fallback. The widest face — the one css2 leaves unnamed — goes first, then Latin.
  const rank = (subset: string) => (subset === 'default' ? 0 : subset === 'latin' ? 1 : subset === 'latin-ext' ? 2 : 3);
  const ordered = [...files].sort((a, b) => rank(a.subset) - rank(b.subset));
  const fonts = await Promise.all(
    ordered.map(async (file) => {
      const response = await fetch(`${BASE}/${file.file}`);
      if (!response.ok) throw new Error(`${family} could not be read.`);
      const bytes = new Uint8Array(await response.arrayBuffer());
      return { id: await sha256Hex(bytes), family, style: styleName(file, variable), bytes, variable, source: 'local' as const };
    }),
  );
  // One family, many subsets: the same weight turns up more than once, and only the first is needed to
  // name the style. The rest register under the same name and serve as fallbacks for their characters.
  return fonts;
}

/** The reference's name for a weight and slant — "Bold Italic", "Regular" — which is how styles are picked. */
function styleName(file: IndexFile, variable: boolean): string {
  if (variable) return file.style === 'italic' ? 'Italic' : 'Regular';
  const weight = Number.parseInt(file.weight, 10);
  const names: Record<number, string> = {
    100: 'Thin',
    200: 'ExtraLight',
    300: 'Light',
    400: 'Regular',
    500: 'Medium',
    600: 'SemiBold',
    700: 'Bold',
    800: 'ExtraBold',
    900: 'Black',
  };
  const name = names[Number.isFinite(weight) ? weight : 400] ?? 'Regular';
  if (file.style !== 'italic') return name;
  return name === 'Regular' ? 'Italic' : `${name} Italic`;
}
