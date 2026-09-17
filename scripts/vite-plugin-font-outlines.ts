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

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { Plugin } from 'vite';

const PREFIX = 'virtual:font-outlines';
const FILE = `${PREFIX}/`;
const RESOLVED = `\0${PREFIX}`;

/**
 * The bundled fonts whose glyph outlines can be read, by the family they are registered under. The colour emoji
 * font is left out — its glyphs are pictures rather than outlines — as are the Noto Sans CJK subsets, of which
 * there are 454.
 */
const OUTLINE_FONTS: readonly { readonly key: string; readonly package: string; readonly file: string }[] = [
  { key: 'latin', package: '@fontsource-variable/inter', file: 'inter-latin-wght-normal.woff2' },
  { key: 'latin-ext', package: '@fontsource-variable/inter', file: 'inter-latin-ext-wght-normal.woff2' },
  { key: 'cyrillic', package: '@fontsource-variable/inter', file: 'inter-cyrillic-wght-normal.woff2' },
  { key: 'cyrillic-ext', package: '@fontsource-variable/inter', file: 'inter-cyrillic-ext-wght-normal.woff2' },
  { key: 'greek', package: '@fontsource-variable/inter', file: 'inter-greek-wght-normal.woff2' },
  { key: 'greek-ext', package: '@fontsource-variable/inter', file: 'inter-greek-ext-wght-normal.woff2' },
  { key: 'vietnamese', package: '@fontsource-variable/inter', file: 'inter-vietnamese-wght-normal.woff2' },
  { key: 'noto-arabic', package: '@fontsource-variable/noto-sans-arabic', file: 'noto-sans-arabic-arabic-wght-normal.woff2' },
  { key: 'noto-hebrew', package: '@fontsource-variable/noto-sans-hebrew', file: 'noto-sans-hebrew-hebrew-wght-normal.woff2' },
];

/**
 * `virtual:font-outlines`: the bundled fonts as plain sfnt files, one lazily-loaded chunk each, so glyph outlines
 * can be read out of them.
 *
 * The files ship as WOFF2, whose tables are Brotli-compressed. Every WOFF2 decoder for the browser builds its
 * bindings with `new Function`, which the app's content security policy forbids, so the unpacking is done here at
 * build time instead — where there is no such policy — and the plain font files are what the app loads.
 */
export function fontOutlinesPlugin(root: URL): Plugin {
  return {
    name: 'openframe-font-outlines',
    resolveId(id) {
      if (id === PREFIX) return RESOLVED;
      const key = id.startsWith(FILE) ? id.slice(FILE.length) : null;
      return key && OUTLINE_FONTS.some((font) => font.key === key) ? `${RESOLVED}/${key}` : null;
    },
    async load(id) {
      if (!id.startsWith(RESOLVED)) return null;
      const key = id.slice(RESOLVED.length).replace(/^\//, '');
      // The index: each font behind a function, so only the ones a document's text needs are ever fetched.
      if (key === '') {
        const entries = OUTLINE_FONTS.map((font) => `  ${JSON.stringify(font.key)}: () => import(${JSON.stringify(`${FILE}${font.key}`)}),`);
        return `export default {\n${entries.join('\n')}\n};`;
      }
      const font = OUTLINE_FONTS.find((entry) => entry.key === key);
      if (!font) throw new Error(`openframe-font-outlines: no font for ${key}`);
      const { default: decompress } = await import('woff2-encoder/decompress');
      const woff2 = readFileSync(fileURLToPath(new URL(`./node_modules/${font.package}/files/${font.file}`, root)));
      const sfnt = await decompress(new Uint8Array(woff2));
      if (sfnt.length === 0) throw new Error(`openframe-font-outlines: ${font.file} did not unpack`);
      return `export default "${Buffer.from(sfnt).toString('base64')}";`;
    },
  };
}

/** The families these fonts are registered under, in the order a character is looked for in them. */
export const OUTLINE_FONT_KEYS: readonly string[] = OUTLINE_FONTS.map((font) => font.key);
