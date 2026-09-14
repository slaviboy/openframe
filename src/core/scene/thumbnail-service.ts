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

import type { ColorProfile } from '../color/color';
import type { DocumentStore } from '../document/store';
import type { Id } from '../ids/ids';
import type { SceneIndex } from './scene-index';

/** Images of layers drawn by the rendering engine, such as component thumbnails in the Assets tab. */
export interface ThumbnailService {
  /**
   * A PNG of one layer and its children alone, on a transparent background, scaled to fit `size` × `size` CSS
   * pixels at `dpr`; null when the layer has nothing to draw.
   */
  thumbnail(store: DocumentStore, index: SceneIndex, pageId: Id, id: Id, size: number, dpr: number, colorProfile?: ColorProfile): Uint8Array | null;
}
