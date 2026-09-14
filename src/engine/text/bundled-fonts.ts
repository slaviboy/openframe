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

import { BUNDLED_FONT_FILES, EMOJI_FAMILY } from './font-files';
import type { FontSource } from './text-shaper';

/** Decodes a base64 `data:` URL into its bytes (no request is made). */
function decodeDataUrl(url: string): Uint8Array {
  const base64 = url.slice(url.indexOf(',') + 1);
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

let pending: Promise<FontSource[]> | null = null;

/** Loads the bundled fonts once, from a lazily imported module that embeds them. */
export function loadBundledFonts(): Promise<FontSource[]> {
  pending ??= import('./bundled-font-data')
    .then(({ FONT_DATA }) =>
      BUNDLED_FONT_FILES.map(({ family, file }) => {
        const data = FONT_DATA[file];
        if (!data) throw new Error(`Missing bundled font ${file}`);
        return { family, bytes: decodeDataUrl(data) };
      }),
    )
    .catch((error: unknown) => {
      pending = null;
      throw error;
    });
  return pending;
}

let pendingEmoji: Promise<FontSource> | null = null;

/** Loads the bundled color emoji font once, from its own lazily imported module. */
export function loadEmojiFont(): Promise<FontSource> {
  pendingEmoji ??= import('./emoji-font-data')
    .then(({ EMOJI_FONT_DATA }) => ({ family: EMOJI_FAMILY, bytes: decodeDataUrl(EMOJI_FONT_DATA) }))
    .catch((error: unknown) => {
      pendingEmoji = null;
      throw error;
    });
  return pendingEmoji;
}
