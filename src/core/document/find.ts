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
export type FindCategory = 'frame' | 'section' | 'group' | 'text' | 'shape' | 'slice';

export const FIND_CATEGORY: Record<SceneNode['type'], FindCategory> = {
  FRAME: 'frame',
  SECTION: 'section',
  GROUP: 'group',
  SLICE: 'slice',
  TEXT: 'text',
  RECTANGLE: 'shape',
  ELLIPSE: 'shape',
  POLYGON: 'shape',
  STAR: 'shape',
  LINE: 'shape',
  VECTOR: 'shape',
  BOOLEAN_OPERATION: 'shape',
};

export interface FindResult {
  readonly id: Id;
  readonly pageId: Id;
  /** Where in the layer's text the query was found; absent when it was the layer's name that matched. */
  readonly inText?: true;
}

/** What a search reads: the layers' names, the text they carry, or both. */
export type FindScope = 'name' | 'text' | 'both';

/**
 * Layers matching `query` (case-insensitive), on the given pages in page order and layers-panel order (topmost
 * first, parents before children). `scope` says whether the layers' names are read, the text they carry, or both.
 * Hidden and locked layers are included. An empty query finds nothing; an empty category set means every type.
 */
export function findLayers(
  store: DocumentStore,
  pageIds: readonly Id[],
  query: string,
  categories: ReadonlySet<FindCategory> = new Set(),
  limit = 1000,
  scope: FindScope = 'name',
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
      if (categories.size === 0 || categories.has(FIND_CATEGORY[node.type])) {
        const byName = scope !== 'text' && node.name.toLocaleLowerCase().includes(needle);
        const byText = scope !== 'name' && node.type === 'TEXT' && node.characters.toLocaleLowerCase().includes(needle);
        // A layer found by its text is marked, so replacing knows which results it may rewrite.
        if (byName) results.push({ id, pageId });
        else if (byText) results.push({ id, pageId, inText: true });
      }
      visit(id, pageId);
    }
  };
  for (const pageId of pageIds) visit(pageId, pageId);
  return results;
}

/**
 * Rewrites every run of `query` in the text of the layers given, as one undo step. Text carried by a layer whose
 * content follows a component property is left alone, since it is the property that says what it reads.
 */
export function replaceInText(store: DocumentStore, ids: readonly Id[], query: string, replacement: string): { readonly id: Id; readonly characters: string }[] {
  const needle = query.trim();
  if (needle === '') return [];
  const pattern = new RegExp(needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
  const out: { id: Id; characters: string }[] = [];
  for (const id of ids) {
    const node = store.get(id);
    if (!node || !isSceneNode(node) || node.type !== 'TEXT') continue;
    const next = node.characters.replace(pattern, replacement);
    if (next !== node.characters) out.push({ id, characters: next });
  }
  return out;
}
