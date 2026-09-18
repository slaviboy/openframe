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
import { isSceneNode, type SceneNode, type Transform } from '@/core/schema/document';
import type { Editor } from '../editor';
import { duplicateNodes } from './structure';

/** The space left between a frame and the copy quick-added beside it. */
const GAP = 100;

/**
 * Quick-add (the + beside a hovered frame with the Frame tool in hand): copies the frame to the side given,
 * and pushes the frames that were already there along to make room. The copy is selected; one undo step.
 */
export function quickAddFrame(editor: Editor, frameId: Id, side: 'left' | 'right'): Id | null {
  const frame = editor.doc.get(frameId);
  if (frame?.type !== 'FRAME' || frame.locked) return null;
  editor.scene.ensure(editor.pageId);
  const bounds = editor.scene.worldBounds(frameId);
  if (!bounds) return null;

  // Everything on the page that would be in the copy's way, which is the frames beyond it on that side.
  const shift = bounds.width + GAP;
  const pushed: Id[] = [];
  for (const id of editor.doc.children(editor.pageId)) {
    if (id === frameId) continue;
    const other = editor.doc.get(id);
    if (!other || !isSceneNode(other) || other.locked) continue;
    const otherBounds = editor.scene.worldBounds(id);
    if (!otherBounds) continue;
    const beyond = side === 'right' ? otherBounds.x + otherBounds.width > bounds.x + bounds.width : otherBounds.x < bounds.x;
    if (beyond) pushed.push(id);
  }

  let copy: Id | null = null;
  editor.history.run('Add frame', (tx) => {
    const away = side === 'right' ? shift : -shift;
    for (const id of pushed) {
      const node = tx.store.getOrThrow(id) as SceneNode;
      const t = node.transform;
      tx.set(id, 'transform', [t[0], t[1], t[2], t[3], t[4] + away, t[5]] satisfies Transform);
    }
    const memory = duplicateNodes(tx, editor, [frameId], { x: away, y: 0 });
    copy = memory.clones[0] ?? null;
  });
  if (copy) editor.state.select([copy]);
  return copy;
}
