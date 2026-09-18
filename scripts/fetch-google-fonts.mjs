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

// Downloads the whole Google Fonts library into public/fonts/google/ as woff2 — every family, every style,
// every subset — and writes the index the editor reads. Run: npm run fonts:fetch
//
// Openframe is offline, so the fonts have to be in the file rather than fetched when they are used. The
// library is the same for everyone, so this script is the committable record of how it got here: it is
// resumable (a file already downloaded is left alone), so it can be stopped and started again.
//
// The library is licensed per family — almost all OFL 1.1, some Apache 2.0 or UFL — and every family's
// licence is recorded in the index beside it. See docs/FONTS.md.
import { mkdirSync, existsSync, writeFileSync, readFileSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';

const OUT = 'public/fonts/google';
const INDEX = join(OUT, 'index.json');
const METADATA = 'https://fonts.google.com/metadata/fonts';
/** Chrome asks for woff2; anything older is offered ttf, which is far bigger. */
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
/** Families fetched at once. Politeness, and it is plenty fast. */
const PARALLEL = 8;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** Fetches with a few retries, since a library-sized run will meet the odd hiccup. */
async function get(url, as = 'text') {
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const response = await fetch(url, { headers: { 'User-Agent': UA } });
      if (response.status === 404 || response.status === 400) return null;
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return as === 'text' ? await response.text() : Buffer.from(await response.arrayBuffer());
    } catch (error) {
      if (attempt === 4) throw error;
      await sleep(400 * 2 ** attempt);
    }
  }
  return null;
}

/** The css2 request for a family: every axis over its full range for a variable font, every style otherwise. */
function cssUrl(family) {
  const name = family.family.replace(/ /g, '+');
  const axes = family.axes ?? [];
  if (axes.length > 0) {
    // css2 wants the axis tags in order: upper case first, then lower case, each alphabetically.
    const sorted = [...axes].sort((a, b) => {
      const lower = Number(a.tag[0] === a.tag[0].toLowerCase()) - Number(b.tag[0] === b.tag[0].toLowerCase());
      return lower !== 0 ? lower : a.tag.localeCompare(b.tag);
    });
    const tags = sorted.map((a) => a.tag).join(',');
    const ranges = sorted.map((a) => `${a.min}..${a.max}`).join(',');
    return `https://fonts.googleapis.com/css2?family=${name}:${tags}@${ranges}`;
  }
  // Static families: every weight, upright and italic, which css2 wants as `ital,wght@0,400;1,400`.
  const styles = Object.keys(family.fonts ?? {});
  const pairs = styles
    .map((style) => {
      const italic = style.endsWith('i');
      const weight = Number.parseInt(style, 10);
      return Number.isFinite(weight) ? `${italic ? 1 : 0},${weight}` : null;
    })
    .filter((pair) => pair !== null)
    .sort();
  if (pairs.length === 0) return `https://fonts.googleapis.com/css2?family=${name}`;
  const anyItalic = pairs.some((pair) => pair.startsWith('1,'));
  return anyItalic
    ? `https://fonts.googleapis.com/css2?family=${name}:ital,wght@${pairs.join(';')}`
    : `https://fonts.googleapis.com/css2?family=${name}:wght@${pairs.map((pair) => pair.slice(2)).join(';')}`;
}

/** Every `@font-face` of a stylesheet, as the file to fetch and what it is for. */
function faces(css) {
  const out = [];
  for (const block of css.split('@font-face').slice(1)) {
    const url = /url\((https:\/\/[^)]+\.woff2)\)/.exec(block)?.[1];
    if (!url) continue;
    out.push({
      url,
      // css2 names each subset in a comment above its face; the last face has none and covers the rest.
      subset: /\/\*\s*([a-z0-9-]+)\s*\*\//i.exec(block)?.[1] ?? 'default',
      style: /font-style:\s*([a-z]+)/.exec(block)?.[1] ?? 'normal',
      weight: /font-weight:\s*([^;]+)/.exec(block)?.[1]?.trim() ?? '400',
      stretch: /font-stretch:\s*([^;]+)/.exec(block)?.[1]?.trim(),
      unicodeRange: /unicode-range:\s*([^;]+)/.exec(block)?.[1]?.trim(),
    });
  }
  return out;
}

const slug = (family) => family.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

async function family(entry, done) {
  const css = await get(cssUrl(entry));
  // A family css2 will not serve (a handful are listed but not published) is recorded as having no files.
  if (css === null) return { family: entry.family, files: [], missing: true };
  const found = faces(css);
  const files = [];
  for (const [i, face] of found.entries()) {
    const name = `${slug(entry.family)}-${face.style}-${String(face.weight).replace(/\s+/g, '_')}-${face.subset}-${i}.woff2`;
    const path = join(OUT, slug(entry.family), name);
    if (!existsSync(path)) {
      const bytes = await get(face.url, 'bytes');
      if (!bytes) continue;
      mkdirSync(dirname(path), { recursive: true });
      writeFileSync(path, bytes);
    }
    files.push({
      file: `${slug(entry.family)}/${name}`,
      subset: face.subset,
      style: face.style,
      weight: face.weight,
      ...(face.stretch ? { stretch: face.stretch } : {}),
      ...(face.unicodeRange ? { unicodeRange: face.unicodeRange } : {}),
      bytes: statSync(path).size,
    });
  }
  done();
  return {
    family: entry.family,
    category: entry.category,
    axes: entry.axes ?? [],
    subsets: entry.subsets ?? [],
    designers: entry.designers ?? [],
    popularity: entry.popularity,
    files,
  };
}

async function main() {
  mkdirSync(OUT, { recursive: true });
  const raw = await get(METADATA);
  const list = JSON.parse(raw.slice(raw.indexOf('{'))).familyMetadataList;
  process.stdout.write(`${list.length} families\n`);

  // Anything already indexed and still on disk is left alone, so the run can be stopped and picked up again.
  const previous = existsSync(INDEX) ? JSON.parse(readFileSync(INDEX, 'utf8')).families : [];
  const kept = new Map(previous.filter((f) => f.files.length > 0 && f.files.every((file) => existsSync(join(OUT, file.file)))).map((f) => [f.family, f]));

  const results = [];
  let finished = 0;
  const pending = list.filter((entry) => !kept.has(entry.family));
  for (let i = 0; i < pending.length; i += PARALLEL) {
    const batch = pending.slice(i, i + PARALLEL);
    const done = () => {
      finished += 1;
      if (finished % 25 === 0) process.stdout.write(`  ${finished}/${pending.length}\n`);
    };
    results.push(...(await Promise.all(batch.map((entry) => family(entry, done)))));
    // The index is written as it goes, so stopping the run loses at most one batch.
    writeIndex([...kept.values(), ...results]);
  }
  const all = [...kept.values(), ...results];
  writeIndex(all);
  const bytes = all.flatMap((f) => f.files).reduce((sum, file) => sum + file.bytes, 0);
  process.stdout.write(`${all.length} families, ${all.flatMap((f) => f.files).length} files, ${(bytes / 1e9).toFixed(2)} GB\n`);
}

/**
 * The index the editor reads, and a file list per family beside its files.
 *
 * Listing all 34,000 files in one index makes it 21 MB, which is absurd to load just to fill a font picker.
 * So the index carries what the picker shows — the family, what it looks like, whether it is variable — and
 * the files of a family are read from its own list, at the moment it is picked.
 */
function writeIndex(families) {
  const sorted = [...families].sort((a, b) => a.family.localeCompare(b.family));
  for (const entry of sorted) {
    if (entry.files.length === 0) continue;
    writeFileSync(join(OUT, slug(entry.family), 'files.json'), JSON.stringify(entry.files));
  }
  const slim = sorted.map(({ files, ...rest }) => ({ ...rest, slug: slug(rest.family), fileCount: files.length, bytes: files.reduce((sum, f) => sum + f.bytes, 0) }));
  writeFileSync(INDEX, JSON.stringify({ source: 'fonts.google.com', fetched: new Date().toISOString().slice(0, 10), families: slim }));
}

await main();
