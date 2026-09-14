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
import { videoFillsOf, type VideoOptions } from '@/core/prototype/video';
import type { Paint, SceneNode } from '@/core/schema/document';
import type { Editor } from '../editor';

/**
 * Sets how the video fills of layers play in presentation view (autoplay, loop, sound). One undo step; false when none
 * of the layers has a video fill.
 */
export function setVideoOptions(editor: Editor, ids: readonly Id[], patch: Partial<VideoOptions>): boolean {
  const targets = ids.map((id) => editor.doc.get(id) as SceneNode | undefined).filter((node): node is SceneNode => videoFillsOf(node).length > 0);
  if (targets.length === 0) return false;
  editor.history.run('Change video settings', (tx) =>
    targets.forEach((node) => {
      const fills = (tx.store.getOrThrow(node.id) as SceneNode & { readonly fills: readonly Paint[] }).fills;
      tx.set(
        node.id,
        'fills',
        fills.map((paint) => (paint.type === 'VIDEO' ? { ...paint, ...patch } : paint)),
      );
    }),
  );
  return true;
}
