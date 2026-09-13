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
import type { Transaction } from '../history/history';
import { ROOT_ID } from '../ids/ids';
import { clampColor, p3ToSrgb, type ColorProfile, type RGBA } from './color';

export const COLOR_PROFILE_LABELS: Record<ColorProfile, string> = { SRGB: 'sRGB', DISPLAY_P3: 'Display P3' };

/** The file's color profile (sRGB unless set). */
export function documentColorProfile(store: DocumentStore): ColorProfile {
  const root = store.get(ROOT_ID);
  return root?.type === 'DOCUMENT' ? (root.colorProfile ?? 'SRGB') : 'SRGB';
}

/** Changes the file's color profile (sRGB is stored as absent). Color values are kept as they are. */
export function setColorProfile(tx: Transaction, profile: ColorProfile): void {
  tx.set(ROOT_ID, 'colorProfile', profile === 'SRGB' ? undefined : profile);
}

/** A document color in (extended) sRGB, the space the renderer composes in. */
export const documentToSrgb = (c: RGBA, profile: ColorProfile): RGBA => (profile === 'DISPLAY_P3' ? p3ToSrgb(c) : c);

/** A document color clipped into sRGB, for WCAG contrast math. */
export const documentToWcag = (c: RGBA, profile: ColorProfile): RGBA => clampColor(documentToSrgb(c, profile));
