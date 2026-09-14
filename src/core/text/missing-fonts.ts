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

import type { FontName, TextNode } from '../schema/document';
import { styleRange, textSegments, type RunsNode, type TextStyleOverrides, type TextStyleRun } from './style-runs';
import type { FontFamilyInfo } from './text-layout';

/** A font used in the file that isn't available, with the number of text layers using it. */
export interface MissingFont extends FontName {
  readonly layers: number;
}

const sameFont = (a: FontName, b: FontName) => a.family === b.family && a.style === b.style;

/** Whether a family and style can be shaped with the fonts available. */
export const isFontAvailable = (font: FontName, available: readonly FontFamilyInfo[]): boolean =>
  available.some((f) => f.family === font.family && f.styles.includes(font.style));

/** Every font (family and style) used by text layers or their mixed-style runs, in first-use order. */
export function textFonts(node: TextNode): FontName[] {
  const fonts: FontName[] = [node.fontName];
  for (const run of node.styleRuns ?? []) {
    const font = run.style.fontName;
    if (font && !fonts.some((f) => sameFont(f, font))) fonts.push(font);
  }
  return fonts;
}

/** Fonts used in the file that aren't available (their family, or just that style), sorted by family and style. */
export function missingFonts(nodes: Iterable<{ readonly type: string }>, available: readonly FontFamilyInfo[]): MissingFont[] {
  const missing: { font: FontName; layers: number }[] = [];
  for (const node of nodes) {
    if (node.type !== 'TEXT') continue;
    for (const font of textFonts(node as TextNode)) {
      if (isFontAvailable(font, available)) continue;
      const entry = missing.find((m) => sameFont(m.font, font));
      if (entry) entry.layers++;
      else missing.push({ font, layers: 1 });
    }
  }
  return missing
    .map(({ font, layers }) => ({ family: font.family, style: font.style, layers }))
    .sort((a, b) => a.family.localeCompare(b.family) || a.style.localeCompare(b.style));
}

/**
 * A text layer's font and runs with one font replaced by another everywhere it is used (the layer's
 * own font and every run), keeping all other styles; null when the layer doesn't use it.
 */
export function replaceFontInText(node: RunsNode, from: FontName, to: FontName): { fontName: FontName; styleRuns: TextNode['styleRuns'] } | null {
  // The same fonts textFonts lists: the layer's own and every run's.
  const uses = sameFont(node.fontName, from) || (node.styleRuns ?? []).some((run) => run.style.fontName !== undefined && sameFont(run.style.fontName, from));
  if (!uses) return null;
  const map = (font: FontName) => (sameFont(font, from) ? to : font);
  let next: RunsNode = { ...node, fontName: map(node.fontName), styleRuns: undefined };
  for (const { start, end, ...style } of textSegments(node)) {
    if (end <= start) continue;
    const overrides: TextStyleOverrides = { ...style, fontName: map(style.fontName) };
    const runs: TextStyleRun[] | undefined = styleRange(next, start, end, overrides);
    next = { ...next, styleRuns: runs };
  }
  // Runs from styleRange are normalized document runs.
  return { fontName: next.fontName, styleRuns: next.styleRuns as TextNode['styleRuns'] };
}
