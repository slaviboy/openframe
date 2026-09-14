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

import type { Transaction } from '../history/history';
import { ROOT_ID, type Id } from '../ids/ids';
import type { DocumentStore } from './store';

/** What a file's thumbnail shows: the frame set as its thumbnail while it still exists, or else the file's first page. */
export type ThumbnailSource = { readonly kind: 'frame'; readonly id: Id; readonly pageId: Id } | { readonly kind: 'page'; readonly pageId: Id };

/** Whether a layer can be a file's thumbnail: only frames on a page can. */
export function canBeThumbnail(store: DocumentStore, id: Id): boolean {
  return store.get(id)?.type === 'FRAME' && store.pageOf(id) !== null;
}

/** The frame set as the file's thumbnail, if any (it may no longer exist). */
export function thumbnailFrameId(store: DocumentStore): Id | undefined {
  const root = store.get(ROOT_ID);
  return root?.type === 'DOCUMENT' ? root.thumbnailNodeId : undefined;
}

/** What the file's thumbnail shows; null for a document without pages. */
export function thumbnailSource(store: DocumentStore): ThumbnailSource | null {
  const id = thumbnailFrameId(store);
  if (id !== undefined && canBeThumbnail(store, id)) return { kind: 'frame', id, pageId: store.pageOf(id)! };
  const [first] = store.pages();
  return first === undefined ? null : { kind: 'page', pageId: first };
}

/** Set as thumbnail (a frame), or Restore default thumbnail (null): the frame the file's thumbnail shows. */
export function setThumbnailFrame(tx: Transaction, id: Id | null): void {
  tx.set(ROOT_ID, 'thumbnailNodeId', id ?? undefined);
}
