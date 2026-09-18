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

import { keyBetween } from '@/core/ids/fractional-index';
import type { Id } from '@/core/ids/ids';
import type { PageNode } from '@/core/schema/document';
import type { Editor } from '../editor';

/**
 * Moves a page to another place in the list: `before` is the page it lands in front of, or null to put it last.
 * Returns false when there is nothing to do, so a drop that changes nothing leaves no step in the history.
 */
export function movePage(editor: Editor, id: Id, before: Id | null): boolean {
  const pages = editor.doc.pages();
  const from = pages.indexOf(id);
  if (from === -1 || id === before) return false;
  const to = before === null ? pages.length : pages.indexOf(before);
  if (to === -1) return false;
  // Landing just after where it already is leaves the order as it was.
  if (to === from || to === from + 1) return false;

  const at = (index: number): string | null => {
    const page = index >= 0 && index < pages.length ? editor.doc.get(pages[index]!) : undefined;
    return page?.type === 'PAGE' ? page.parent.key : null;
  };
  // The page lands between the one it is dropped in front of and whatever was before that one.
  const rest = pages.filter((page) => page !== id);
  const target = before === null ? rest.length : rest.indexOf(before);
  const previous = target > 0 ? rest[target - 1] : undefined;
  const previousKey = previous ? at(pages.indexOf(previous)) : null;
  const nextKey = before === null ? null : at(pages.indexOf(before));
  editor.history.run('Move page', (tx) => {
    const page = tx.store.getOrThrow(id) as PageNode;
    tx.set(id, 'parent', { id: page.parent.id, key: keyBetween(previousKey, nextKey) });
  });
  return true;
}
