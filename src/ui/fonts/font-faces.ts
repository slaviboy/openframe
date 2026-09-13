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

import { parseFontStyle } from '@/core/text/font-style';
import type { UserFont } from '@/editor/fonts/font-registry';

const added = new Set<string>();

/**
 * Makes user fonts available to CSS (from their bytes, no request), so the font picker and other
 * UI can show family names in their own typeface.
 */
export function addFontFaces(fonts: readonly UserFont[]): void {
  if (typeof FontFace === 'undefined' || typeof document === 'undefined') return;
  for (const font of fonts) {
    if (added.has(font.id)) continue;
    added.add(font.id);
    const { weight, italic } = parseFontStyle(font.style);
    const face = new FontFace(font.family, font.bytes.slice().buffer, { weight: font.variable ? '100 900' : String(weight), style: italic ? 'italic' : 'normal' });
    document.fonts.add(face);
    void face.load().catch(() => undefined);
  }
}
