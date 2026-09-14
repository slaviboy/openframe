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

import { cjkSubsetFamily, cjkSubsetsFor, type CjkScript, type CjkSubsetTable } from '@/core/text/cjk';
import { decodeDataUrl } from './bundled-fonts';
import type { FontSource } from './text-shaper';

type Loaders = Record<string, () => Promise<string>>;

/** Each Noto Sans CJK subset file as a lazily imported base64 module (never fetched). */
const FILES: Readonly<Record<CjkScript, Loaders>> = {
  SC: import.meta.glob<string>('/node_modules/@fontsource-variable/noto-sans-sc/files/*-wght-normal.woff2', { query: '?inline', import: 'default' }),
  TC: import.meta.glob<string>('/node_modules/@fontsource-variable/noto-sans-tc/files/*-wght-normal.woff2', { query: '?inline', import: 'default' }),
  JP: import.meta.glob<string>('/node_modules/@fontsource-variable/noto-sans-jp/files/*-wght-normal.woff2', { query: '?inline', import: 'default' }),
  KR: import.meta.glob<string>('/node_modules/@fontsource-variable/noto-sans-kr/files/*-wght-normal.woff2', { query: '?inline', import: 'default' }),
};

const TABLES: Readonly<Record<CjkScript, () => Promise<{ default: CjkSubsetTable }>>> = {
  SC: () => import('virtual:cjk-subsets/sc'),
  TC: () => import('virtual:cjk-subsets/tc'),
  JP: () => import('virtual:cjk-subsets/jp'),
  KR: () => import('virtual:cjk-subsets/kr'),
};

const tables = new Map<CjkScript, Promise<CjkSubsetTable>>();

function tableOf(script: CjkScript): Promise<CjkSubsetTable> {
  let table = tables.get(script);
  if (!table) {
    table = TABLES[script]().then((module) => module.default);
    tables.set(script, table);
  }
  return table;
}

/**
 * The Noto Sans subsets of a script that draw a text's characters and haven't been requested yet
 * (`requested` holds "script:index" keys and is updated), decoded and named for registration.
 */
export async function loadCjkSubsets(script: CjkScript, text: string, requested: Set<string>): Promise<FontSource[]> {
  const table = await tableOf(script);
  const indices = cjkSubsetsFor(text, table).filter((index) => !requested.has(`${script}:${index}`));
  for (const index of indices) requested.add(`${script}:${index}`);
  const lower = script.toLowerCase();
  return Promise.all(
    indices.map(async (index) => {
      const load = FILES[script][`/node_modules/@fontsource-variable/noto-sans-${lower}/files/noto-sans-${lower}-${index}-wght-normal.woff2`];
      if (!load) throw new Error(`Missing Noto Sans ${script} subset ${index}`);
      return { family: cjkSubsetFamily(script, index), bytes: decodeDataUrl(await load()) };
    }),
  );
}
