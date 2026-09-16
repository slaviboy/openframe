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
import { isSceneNode } from '@/core/schema/document';
import type { Editor } from '../editor';

/**
 * The hash of a layer's animated GIF: its topmost visible image fill, when that image is a GIF (the fill the canvas, the
 * Layers panel and the Fill section all label GIF). Until the image is loaded its type is unknown, so nothing is
 * returned; the canvas asks again once it arrives.
 */
export function animatedGifHash(editor: Editor, nodeId: Id | null | undefined): string | undefined {
  if (nodeId === null || nodeId === undefined) return undefined;
  const node = editor.doc.get(nodeId);
  if (!node || !isSceneNode(node) || !('fills' in node)) return undefined;
  const paint = node.fills.find((p) => p.type === 'IMAGE' && p.visible && p.imageHash !== undefined);
  if (paint?.type !== 'IMAGE' || paint.imageHash === undefined) return undefined;
  return editor.images.get(paint.imageHash)?.mime === 'image/gif' ? paint.imageHash : undefined;
}
