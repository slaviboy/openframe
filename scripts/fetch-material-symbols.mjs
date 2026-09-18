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

// Downloads Material Symbols into public/icons/material/ — the three variable fonts, so an icon can be
// typed as text, and every icon's artwork, so it can be placed as a vector layer that is then editable
// like any other. Run: npm run icons:fetch
//
// Openframe is offline, so both have to be in the file. The set is Apache 2.0; see docs/ICONS.md.
import { mkdirSync, existsSync, writeFileSync, readFileSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';

const OUT = 'public/icons/material';
const INDEX = join(OUT, 'index.json');
const METADATA = 'https://fonts.google.com/metadata/icons';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const PARALLEL = 12;

/** The three Material Symbols styles, each one variable font over FILL, weight, grade and optical size. */
const STYLES = [
  { id: 'outlined', family: 'Material Symbols Outlined', path: 'materialsymbolsoutlined' },
  { id: 'rounded', family: 'Material Symbols Rounded', path: 'materialsymbolsrounded' },
  { id: 'sharp', family: 'Material Symbols Sharp', path: 'materialsymbolssharp' },
];

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function get(url, as = 'text') {
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const response = await fetch(url, { headers: { 'User-Agent': UA } });
      if (response.status === 404) return null;
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return as === 'text' ? await response.text() : Buffer.from(await response.arrayBuffer());
    } catch (error) {
      if (attempt === 4) throw error;
      await sleep(400 * 2 ** attempt);
    }
  }
  return null;
}

/** The variable font of one style, over every axis at its full range. */
async function font(style) {
  const name = style.family.replace(/ /g, '+');
  const css = await get(`https://fonts.googleapis.com/css2?family=${name}:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200`);
  const url = /url\((https:\/\/[^)]+\.woff2)\)/.exec(css ?? '')?.[1];
  if (!url) throw new Error(`no font for ${style.family}`);
  const file = `${style.id}.woff2`;
  const path = join(OUT, file);
  if (!existsSync(path)) {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, await get(url, 'bytes'));
  }
  return { style: style.id, family: style.family, file, bytes: statSync(path).size };
}

/** One icon's artwork, in each of the three styles. */
async function icon(entry, done) {
  const styles = {};
  for (const style of STYLES) {
    const file = `svg/${style.id}/${entry.name}.svg`;
    const path = join(OUT, file);
    if (!existsSync(path)) {
      const svg = await get(`https://fonts.gstatic.com/s/i/short-term/release/${style.path}/${entry.name}/default/24px.svg`);
      if (svg === null) continue;
      mkdirSync(dirname(path), { recursive: true });
      writeFileSync(path, svg);
    }
    styles[style.id] = file;
  }
  done();
  return {
    name: entry.name,
    codepoint: entry.codepoint,
    categories: entry.categories ?? [],
    tags: entry.tags ?? [],
    popularity: entry.popularity,
    styles,
  };
}

async function main() {
  mkdirSync(OUT, { recursive: true });
  const raw = await get(METADATA);
  const list = JSON.parse(raw.slice(raw.indexOf('{'))).icons;
  process.stdout.write(`${list.length} icons\n`);

  const fonts = [];
  for (const style of STYLES) fonts.push(await font(style));

  const previous = existsSync(INDEX) ? JSON.parse(readFileSync(INDEX, 'utf8')).icons : [];
  const kept = new Map(previous.filter((i) => Object.values(i.styles).every((file) => existsSync(join(OUT, file)))).map((i) => [i.name, i]));

  const results = [];
  let finished = 0;
  const pending = list.filter((entry) => !kept.has(entry.name));
  for (let i = 0; i < pending.length; i += PARALLEL) {
    const done = () => {
      finished += 1;
      if (finished % 100 === 0) process.stdout.write(`  ${finished}/${pending.length}\n`);
    };
    results.push(...(await Promise.all(pending.slice(i, i + PARALLEL).map((entry) => icon(entry, done)))));
  }
  const icons = [...kept.values(), ...results].sort((a, b) => a.name.localeCompare(b.name));
  writeFileSync(INDEX, JSON.stringify({ source: 'fonts.google.com/icons', fetched: new Date().toISOString().slice(0, 10), fonts, icons }));
  process.stdout.write(`${icons.length} icons, ${fonts.length} fonts\n`);
}

await main();
