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

const PREFIX = 'virtual:cjk-subsets/';
const RESOLVED = `\0${PREFIX}`;
const SCRIPTS = ['sc', 'tc', 'jp', 'kr'];

/**
 * `virtual:cjk-subsets/<sc|tc|jp|kr>`: the Noto Sans CJK subsets of a script as
 * `[subset index, "hex ranges"]`, read from the Fontsource package's CSS at build time (the CSS
 * can't be imported as text reliably, and only the ranges are needed at run time).
 */
export function cjkSubsetsPlugin(root: URL): Plugin {
  return {
    name: 'openframe-cjk-subsets',
    resolveId(id) {
      const script = id.startsWith(PREFIX) ? id.slice(PREFIX.length) : null;
      return script && SCRIPTS.includes(script) ? `${RESOLVED}${script}` : null;
    },
    load(id) {
      if (!id.startsWith(RESOLVED)) return null;
      const script = id.slice(RESOLVED.length);
      const css = readFileSync(fileURLToPath(new URL(`./node_modules/@fontsource-variable/noto-sans-${script}/wght.css`, root)), 'utf8');
      const file = new RegExp(`noto-sans-${script}-(\\d+)-wght-normal\\.woff2`);
      const subsets: [number, string][] = [];
      for (const block of css.split('@font-face').slice(1)) {
        const index = file.exec(block)?.[1];
        const ranges = /unicode-range:\s*([^;]+);/.exec(block)?.[1];
        if (index === undefined || ranges === undefined) continue;
        subsets.push([
          Number(index),
          ranges
            .split(',')
            .map((part) => part.trim().replace(/^U\+/i, ''))
            .join(','),
        ]);
      }
      if (subsets.length === 0) throw new Error(`openframe-cjk-subsets: no subsets found for ${script}`);
      return `export default ${JSON.stringify(subsets)};`;
    },
  };
}
