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

import type { Id } from '@/core/ids/ids';
import type { ExportSetting, SceneNode } from '@/core/schema/document';
import type { Editor } from '../editor';

/** How large a layer can be and still be taken for an icon, in its own units. */
const ICON_MAX_SIZE = 64;

/** How far from square a layer can be and still be taken for an icon. */
const ICON_MAX_RATIO = 1.6;

/** What Dev Mode offers to download: a layer, and the shape it comes out in. */
export interface DevAsset {
  readonly nodeId: Id;
  readonly name: string;
  /** An icon found by its shape and size, as against a layer configured for export by hand. */
  readonly detected: boolean;
  readonly setting: ExportSetting;
}

/** The export an asset comes out as: drawings go out as SVG, everything else as a 1× PNG. */
export function assetSetting(node: SceneNode): ExportSetting {
  const drawn = node.type === 'VECTOR' || node.type === 'BOOLEAN_OPERATION' || node.type === 'LINE' || node.type === 'STAR' || node.type === 'POLYGON' || node.type === 'ELLIPSE';
  return drawn ? { format: 'SVG', constraint: { type: 'SCALE', value: 1 }, suffix: '' } : { format: 'PNG', constraint: { type: 'SCALE', value: 1 }, suffix: '' };
}

/**
 * Whether a layer looks like an icon: small, near enough square, and made of drawing rather than of text. A group or
 * a frame counts when everything in it is drawn, which is how an icon is usually put together.
 */
export function looksLikeIcon(editor: Editor, node: SceneNode): boolean {
  const { width, height } = node.size;
  if (width <= 0 || height <= 0 || width > ICON_MAX_SIZE || height > ICON_MAX_SIZE) return false;
  if (Math.max(width, height) / Math.min(width, height) > ICON_MAX_RATIO) return false;

  const drawn = (id: Id): boolean => {
    const child = editor.doc.get(id) as SceneNode | undefined;
    if (!child || child.visible === false) return false;
    if (child.type === 'TEXT' || child.type === 'SECTION' || child.type === 'SLICE') return false;
    const children = editor.doc.children(id);
    return children.length === 0 ? child.type !== 'RECTANGLE' || child.fills.every((paint) => paint.type !== 'IMAGE') : children.some(drawn);
  };
  return drawn(node.id);
}

/**
 * What a page has to hand over: every layer set up for export by hand, and the icons found by their shape. A layer
 * that carries export settings is offered as those; one found by its shape is offered as the shape it suits.
 */
export function devAssets(editor: Editor, pageId: Id = editor.pageId): DevAsset[] {
  const out: DevAsset[] = [];
  const seen = new Set<Id>();
  const walk = (id: Id) => {
    for (const childId of editor.doc.children(id)) {
      const node = editor.doc.get(childId) as SceneNode | undefined;
      if (!node) continue;
      if (node.exportSettings && node.exportSettings.length > 0) {
        seen.add(childId);
        out.push({ nodeId: childId, name: node.name, detected: false, setting: node.exportSettings[0]! });
      } else if (!seen.has(childId) && looksLikeIcon(editor, node)) {
        seen.add(childId);
        out.push({ nodeId: childId, name: node.name, detected: true, setting: assetSetting(node) });
        // An icon is handed over whole, so what it is made of is not offered separately.
        continue;
      }
      walk(childId);
    }
  };
  walk(pageId);
  return out;
}
