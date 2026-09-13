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
import type { Id } from '../ids/ids';
import { isSceneNode, type SceneNode } from '../schema/document';

export type MaskType = NonNullable<SceneNode['maskType']>;

export const MASK_TYPE_LABELS: Record<MaskType, string> = { ALPHA: 'Alpha', VECTOR: 'Vector', LUMINANCE: 'Luminance' };

const asScene = (store: DocumentStore, id: Id): SceneNode | null => {
  const node = store.get(id);
  return node && isSceneNode(node) ? node : null;
};

/** Whether a layer is used as a mask. */
export const isMaskLayer = (store: DocumentStore, id: Id): boolean => asScene(store, id)?.isMask === true;

/**
 * The mask that masks a layer: the nearest sibling below it (earlier in paint order) that is a
 * mask. A hidden mask masks nothing, but still ends the run of the mask below it. Null when unmasked.
 */
export function maskOf(store: DocumentStore, id: Id): Id | null {
  const parent = store.parentOf(id);
  if (parent === null) return null;
  const siblings = store.children(parent);
  for (let i = siblings.indexOf(id) - 1; i >= 0; i--) {
    const node = asScene(store, siblings[i]!);
    if (node?.isMask) return node.visible ? node.id : null;
  }
  return null;
}

/**
 * Splits children (in paint order) into runs for drawing: a visible mask with the siblings it masks,
 * or a single unmasked child.
 */
export function maskRuns(store: DocumentStore, children: readonly Id[]): ({ mask: Id; content: Id[] } | { mask: null; content: [Id] })[] {
  const runs: ({ mask: Id; content: Id[] } | { mask: null; content: [Id] })[] = [];
  let i = 0;
  while (i < children.length) {
    const node = asScene(store, children[i]!);
    if (node?.isMask && node.visible) {
      const content: Id[] = [];
      let j = i + 1;
      while (j < children.length && !asScene(store, children[j]!)?.isMask) content.push(children[j++]!);
      runs.push({ mask: node.id, content });
      i = j;
    } else {
      runs.push({ mask: null, content: [children[i]!] });
      i++;
    }
  }
  return runs;
}
