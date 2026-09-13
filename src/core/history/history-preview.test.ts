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
import type { ChangeSet } from './history';
import { History } from './history';

function setup() {
  const ids = new IdGenerator('h');
  const store = createEmptyDocument({ name: 'D', now: 'n', appVersion: 't', ids });
  const page = store.pages()[0]!;
  const id = ids.next();
  store.applyOp({ kind: 'create', node: makeRectangle({ id, parent: { id: page, key: keyOnTop(store, page) }, name: 'R', x: 0, y: 0, width: 10, height: 10 }) });
  const history = new History({ store, captureMeta: () => null, restoreMeta: () => undefined });
  const changes: ChangeSet[] = [];
  history.subscribe((change) => changes.push(change));
  return { store, history, id, changes };
}

describe('transaction previews', () => {
  test('a coalesced set of the same field emits a new preview; nothing new emits nothing', () => {
    const { store, history, id, changes } = setup();
    const tx = history.begin('Change opacity');
    tx.set(id, 'opacity', 0.5);
    tx.flushPreview();
    tx.set(id, 'opacity', 0.25);
    tx.flushPreview();
    tx.flushPreview();
    const previews = changes.filter((c) => c.source === 'preview');
    expect(previews).toHaveLength(2);
    expect(store.getOrThrow(id)).toMatchObject({ opacity: 0.25 });
    expect(previews[1]!.nodes.get(id)).toEqual(new Set(['opacity']));
    history.commit(tx);
    expect(history.undoLabel).toBe('Change opacity');
    history.undo();
    expect(store.getOrThrow(id)).toMatchObject({ opacity: 1 });
  });

  test('a set back to an already-previewed value after a no-op still previews correctly', () => {
    const { history, id, changes } = setup();
    const tx = history.begin('Resize');
    tx.set(id, 'size', { width: 20, height: 10 });
    tx.flushPreview();
    tx.set(id, 'size', { width: 20, height: 10 });
    tx.flushPreview();
    expect(changes.filter((c) => c.source === 'preview')).toHaveLength(1);
    history.cancel(tx);
  });
});
