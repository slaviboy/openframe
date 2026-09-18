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

import { readdirSync } from 'node:fs';
import { extname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

/** Repository root. */
export const ROOT = fileURLToPath(new URL('../../', import.meta.url));

/** The license header every source file starts with (after an optional `/// <reference>` or `#!` line). */
export const LICENSE_HEADER = `/*
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
 */`;

/** Extensions that carry the license header. */
export const SOURCE_EXTENSIONS = ['.ts', '.tsx', '.js', '.mjs', '.cjs', '.css'];

/** Generated, installed or third-party content that is not part of the project's sources. */
// `reference/` holds the saved reference-app pages and stylesheets the fidelity pass measures against. It is
// gitignored, it is the reference's markup rather than ours, and it must never be committed — so it is not held to
// the header rule either. It only started mattering when a .css turned up among the .html captures.
const SKIPPED_DIRECTORIES = new Set(['node_modules', 'dist', '.git', 'docs-mirror', 'reference', 'test-results', 'playwright-report', 'coverage', '.claude']);

/** Repository files (relative paths, `/`-separated) with one of `extensions`; an empty list returns every file. */
export function repoFiles(extensions: readonly string[]): string[] {
  const out: string[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        if (!SKIPPED_DIRECTORIES.has(entry.name)) walk(join(dir, entry.name));
      } else if (entry.isFile() && entry.name !== '.DS_Store' && (extensions.length === 0 || extensions.includes(extname(entry.name)))) {
        out.push(relative(ROOT, join(dir, entry.name)).split('\\').join('/'));
      }
    }
  };
  walk(ROOT);
  return out.sort();
}

/** File text without a leading `/// <reference …>` or `#!` line. */
export function withoutPreamble(text: string): string {
  let rest = text;
  while (rest.startsWith('/// <reference') || rest.startsWith('#!')) rest = rest.slice(rest.indexOf('\n') + 1);
  return rest;
}
