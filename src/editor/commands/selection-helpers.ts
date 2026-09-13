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

import type { DocumentStore } from '@/core/document/store';
import type { Id } from '@/core/ids/ids';
import { isSceneNode } from '@/core/schema/document';
import type { Editor } from '../editor';

/** Order key of a node within its parent ('' for the document root). */
export const keyOf = (store: DocumentStore, id: Id): string => {
  const node = store.getOrThrow(id);
  return node.type === 'DOCUMENT' ? '' : node.parent.key;
};

/** Key of the next sibling above `id` that is not in `exclude`, or null if `id` is top-most. */
export function nextKeyAbove(store: DocumentStore, id: Id, exclude: ReadonlySet<Id> = new Set()): string | null {
  const parent = store.parentOf(id);
  if (parent === null) return null;
  const siblings = store.children(parent);
  for (let i = siblings.indexOf(id) + 1; i < siblings.length; i++) {
    if (!exclude.has(siblings[i]!)) return keyOf(store, siblings[i]!);
  }
  return null;
}

/** Key of the top-most child of `parent`, or null when it has no children. */
export function topChildKey(store: DocumentStore, parent: Id): string | null {
  const last = store.children(parent).at(-1);
  return last ? keyOf(store, last) : null;
}

/** Selected ids that are layers (never pages or the document). */
export const selectedSceneNodes = (editor: Editor): Id[] =>
  editor.selection.filter((id) => {
    const node = editor.doc.get(id);
    return node !== undefined && isSceneNode(node);
  });
