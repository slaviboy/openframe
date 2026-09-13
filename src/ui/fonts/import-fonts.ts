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
import { readFontNames, styleFromFileName } from '@/core/text/font-names';
import type { UserFont } from '@/editor/fonts/font-registry';

/** Font files the upload picker accepts. */
export const FONT_ACCEPT = '.ttf,.otf,.ttc,.woff,.woff2,font/ttf,font/otf,font/collection,font/woff,font/woff2';

/** Larger files are refused (a font this big is almost certainly not a font). */
export const MAX_FONT_BYTES = 50 * 1024 * 1024;

export interface FontImportResult {
  readonly fonts: UserFont[];
  readonly errors: string[];
}

/**
 * Reads font files the user chose. Names come from the font's name table (TrueType, OpenType and
 * collections); for compressed formats (WOFF, WOFF2) the family comes from `familyOf` — the text
 * engine decoding the font — and the style from the file name.
 */
export async function readFontFiles(files: readonly File[], familyOf: (bytes: Uint8Array) => string | null): Promise<FontImportResult> {
  const fonts: UserFont[] = [];
  const errors: string[] = [];
  for (const file of files) {
    if (file.size > MAX_FONT_BYTES) {
      errors.push(`${file.name} is too large to be a font.`);
      continue;
    }
    const bytes = new Uint8Array(await file.arrayBuffer());
    const info = readFontNames(bytes);
    const family = info?.family ?? familyOf(bytes);
    if (!family) {
      errors.push(`${file.name} is not a font file that can be read.`);
      continue;
    }
    fonts.push({ id: await sha256Hex(bytes), family, style: info?.style ?? styleFromFileName(file.name), bytes, variable: info?.variable ?? false, source: 'upload' });
  }
  return { fonts, errors };
}
