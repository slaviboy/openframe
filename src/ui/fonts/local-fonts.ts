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
import { readFontNames } from '@/core/text/font-names';
import type { UserFont } from '@/editor/fonts/font-registry';

/** A font installed on this device, as the Local Font Access API reports it. */
interface LocalFontData {
  readonly family: string;
  readonly style: string;
  readonly postscriptName: string;
  blob(): Promise<Blob>;
}

type QueryLocalFonts = () => Promise<LocalFontData[]>;

const query = (): QueryLocalFonts | undefined => (typeof window === 'undefined' ? undefined : (window as unknown as { queryLocalFonts?: QueryLocalFonts }).queryLocalFonts);

/** Whether this browser can list installed fonts (Chromium's Local Font Access API). */
export const canListInstalledFonts = (): boolean => query() !== undefined;

let installed: LocalFontData[] | null = null;

/**
 * Lists the families installed on this device (the browser asks for permission the first time).
 * Only names are read here; a family's font files are read when it is used.
 */
export async function listInstalledFamilies(): Promise<string[]> {
  const fn = query();
  if (!fn) return [];
  installed ??= await fn.call(window);
  return [...new Set(installed.map((f) => f.family))].sort((a, b) => a.localeCompare(b));
}

/** Families listed so far (empty until `listInstalledFamilies` has run in this session). */
export const knownInstalledFamilies = (): string[] => (installed ? [...new Set(installed.map((f) => f.family))] : []);

/** Reads every installed style of a family as user fonts. */
export async function readInstalledFamily(family: string): Promise<UserFont[]> {
  const fonts: UserFont[] = [];
  for (const data of installed ?? []) {
    if (data.family !== family) continue;
    const bytes = new Uint8Array(await (await data.blob()).arrayBuffer());
    fonts.push({ id: await sha256Hex(bytes), family: data.family, style: data.style, bytes, variable: readFontNames(bytes)?.variable ?? false, source: 'local' });
  }
  return fonts;
}
