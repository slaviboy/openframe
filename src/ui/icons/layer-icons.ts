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

import type { SceneNode } from '@/core/schema/document';
import type { IconName } from './Icon';

/** Icon shown next to a layer of each type (layers panel, Find results). */
export const LAYER_TYPE_ICONS: Record<SceneNode['type'], IconName> = {
  FRAME: 'frame',
  GROUP: 'group',
  SECTION: 'section',
  SLICE: 'slice',
  RECTANGLE: 'rectangle',
  ELLIPSE: 'ellipse',
  POLYGON: 'polygon',
  STAR: 'star',
  LINE: 'line',
  VECTOR: 'vector',
  BOOLEAN_OPERATION: 'boolean',
  TEXT: 'text',
};

/** Icon for a specific layer: masks show the mask icon, rectangles filled with an image the image icon. */
export function layerIcon(node: SceneNode): IconName {
  if (node.isMask) return 'mask';
  if (node.type === 'FRAME' && (node.component || node.componentSet)) return 'component';
  if (node.type === 'FRAME' && node.instance) return 'instance';
  if (node.type === 'RECTANGLE' && node.fills.some((p) => p.type === 'IMAGE' && p.visible)) return 'image';
  return LAYER_TYPE_ICONS[node.type];
}
