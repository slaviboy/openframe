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

import type { Id } from '../ids/ids';
import { isSceneNode, type SceneNode } from '../schema/document';
import type { DocumentStore } from './store';

/** Layer type filters offered by Find. */
export type FindCategory = 'frame' | 'section' | 'group' | 'shape' | 'slice';

export const FIND_CATEGORY: Record<SceneNode['type'], FindCategory> = {
  FRAME: 'frame',
  SECTION: 'section',
  GROUP: 'group',
  SLICE: 'slice',
  RECTANGLE: 'shape',
  ELLIPSE: 'shape',
  POLYGON: 'shape',
  STAR: 'shape',
  LINE: 'shape',
};

export interface FindResult {
  readonly id: Id;
  readonly pageId: Id;
}

/**
 * Layers whose name contains `query` (case-insensitive), on the given pages in page order and
 * layers-panel order (topmost first, parents before children). Hidden and locked layers are
 * included. An empty query finds nothing; an empty category set means every type.
 */
export function findLayers(
  store: DocumentStore,
  pageIds: readonly Id[],
  query: string,
  categories: ReadonlySet<FindCategory> = new Set(),
  limit = 1000,
): FindResult[] {
  const needle = query.trim().toLocaleLowerCase();
  if (!needle) return [];
  const results: FindResult[] = [];
  const visit = (parent: Id, pageId: Id) => {
    const children = store.children(parent);
    for (let i = children.length - 1; i >= 0 && results.length < limit; i--) {
      const id = children[i]!;
      const node = store.get(id);
      if (!node || !isSceneNode(node)) continue;
      if (node.name.toLocaleLowerCase().includes(needle) && (categories.size === 0 || categories.has(FIND_CATEGORY[node.type]))) {
        results.push({ id, pageId });
      }
      visit(id, pageId);
    }
  };
  for (const pageId of pageIds) visit(pageId, pageId);
  return results;
}
