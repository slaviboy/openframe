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

// Writes public/fonts/google/previews.json: one file per family, the one the font picker draws that
// family's name in. Run: npm run fonts:previews
//
// Offline — it reads only what the library already has on disk, so it never asks anyone to fetch the
// 726 MB again. `fetch-google-fonts.mjs` writes the same field into its own index, so a future refetch
// keeps it; this script is how the library that is already here gets it.
//
// The picker shows about a dozen of 1,946 rows at a time and loads a preview only for the rows in
// view, so what matters is that each file is small and covers a family's own name: the Latin face
// nearest to weight 400, upright. See docs/FONTS.md.
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const OUT = 'public/fonts/google';

/** Latin first, then the widest face css2 leaves unnamed, then Latin-extended; anything else last. */
const rank = (subset) => (subset === 'latin' ? 0 : subset === 'default' ? 1 : subset === 'latin-ext' ? 2 : 3);

/** The file a family's name is best drawn from: upright, Latin, nearest to weight 400, smallest. */
export function previewFile(files) {
  const upright = files.filter((f) => f.style !== 'italic');
  const [best] = (upright.length > 0 ? upright : files).sort(
    (a, b) => rank(a.subset) - rank(b.subset) || Math.abs(Number.parseInt(a.weight, 10) - 400) - Math.abs(Number.parseInt(b.weight, 10) - 400) || a.bytes - b.bytes,
  );
  return best?.file ?? null;
}

function main() {
  const index = JSON.parse(readFileSync(join(OUT, 'index.json'), 'utf8'));
  const previews = {};
  let bytes = 0;
  const missing = [];
  for (const family of index.families) {
    const list = join(OUT, family.slug, 'files.json');
    if (!existsSync(list)) {
      missing.push(family.family);
      continue;
    }
    const files = JSON.parse(readFileSync(list, 'utf8'));
    const file = previewFile(files);
    if (!file) {
      missing.push(family.family);
      continue;
    }
    previews[family.slug] = file;
    bytes += files.find((f) => f.file === file)?.bytes ?? 0;
  }
  const count = Object.keys(previews).length;
  writeFileSync(join(OUT, 'previews.json'), JSON.stringify(previews));
  const onDisk = new Set(readdirSync(OUT, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name));
  const dangling = Object.entries(previews).filter(([slug]) => !onDisk.has(slug)).length;
  console.log(`previews.json: ${count} families, ${Math.round(bytes / count / 100) / 10} KB each on average`);
  if (missing.length > 0) console.log(`no files on disk for ${missing.length}: ${missing.slice(0, 5).join(', ')}${missing.length > 5 ? '…' : ''}`);
  if (dangling > 0) throw new Error(`${dangling} previews name a family that is not on disk`);
}

main();
