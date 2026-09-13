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

import type { DocumentStore } from '../document/store';
import { hasGeometry } from '../schema/document';
import { toHex6, type RGBA } from './color';

/** A solid color used in the file, with its paint opacity. */
export interface DocumentColor {
  readonly color: RGBA;
  readonly opacity: number;
}

/** Most swatches the color picker shows. */
export const DOCUMENT_COLORS_LIMIT = 48;

/**
 * Distinct solid colors of visible fills and strokes across every page, most used first (ties keep
 * document order). Colors match by their 8-bit hex value and whole-percent opacity.
 */
export function documentColors(store: DocumentStore, limit = DOCUMENT_COLORS_LIMIT): DocumentColor[] {
  const found = new Map<string, { swatch: DocumentColor; count: number; order: number }>();
  for (const node of store.nodes()) {
    if (!hasGeometry(node)) continue;
    for (const paint of [...node.fills, ...node.strokes]) {
      if (paint.type !== 'SOLID' || !paint.visible) continue;
      const opacity = Math.round(paint.opacity * 100) / 100;
      const key = `${toHex6(paint.color)}:${opacity}`;
      const entry = found.get(key);
      if (entry) entry.count++;
      else found.set(key, { swatch: { color: { ...paint.color, a: 1 }, opacity }, count: 1, order: found.size });
    }
  }
  return [...found.values()]
    .sort((a, b) => b.count - a.count || a.order - b.order)
    .slice(0, limit)
    .map((entry) => entry.swatch);
}
