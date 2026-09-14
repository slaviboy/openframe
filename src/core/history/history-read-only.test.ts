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

import { describe, expect, test } from 'vitest';
import { createEmptyDocument, keyOnTop, makeRectangle } from '../document/factory';
import { IdGenerator } from '../ids/ids';
import { History, type ChangeSet } from './history';

describe('read-only history', () => {
  test('commits are discarded and undo and redo do nothing while the document is read-only', () => {
    const ids = new IdGenerator('r');
    const store = createEmptyDocument({ name: 'D', now: 'n', appVersion: 't', ids });
    const pageId = store.pages()[0]!;
    let readOnly = false;
    const history = new History({ store, captureMeta: () => null, restoreMeta: () => undefined, isReadOnly: () => readOnly });
    const changes: ChangeSet['source'][] = [];
    history.subscribe((change) => changes.push(change.source));
    const add = () => {
      const id = ids.next();
      history.run('Add', (tx) => tx.create(makeRectangle({ id, parent: { id: pageId, key: keyOnTop(store, pageId) }, name: 'R', x: 0, y: 0, width: 5, height: 5 })));
      return id;
    };

    const kept = add();
    expect(history.canUndo).toBe(true);
    readOnly = true;
    expect(history.readOnly).toBe(true);
    expect(history.canUndo).toBe(false);
    expect(history.undo()).toBe(false);
    expect(store.has(kept)).toBe(true);

    // A drag's preview shows, then reverts when it commits.
    const tx = history.begin('Move');
    tx.set(kept, 'transform', [1, 0, 0, 1, 50, 0]);
    tx.flushPreview();
    expect(history.commit(tx)).toBeNull();
    expect(store.getOrThrow(kept).type === 'RECTANGLE' && store.getOrThrow(kept)).toMatchObject({ transform: [1, 0, 0, 1, 0, 0] });
    const discarded = add();
    expect(store.has(discarded)).toBe(false);
    expect(changes).toEqual(['commit', 'preview', 'cancel', 'cancel']);

    readOnly = false;
    expect(history.undo()).toBe(true);
    expect(store.has(kept)).toBe(false);
  });
});
