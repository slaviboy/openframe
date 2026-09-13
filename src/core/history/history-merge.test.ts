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
import { History } from './history';

function setup() {
  const ids = new IdGenerator('h');
  const store = createEmptyDocument({ name: 'D', now: 'n', appVersion: 't', ids });
  const history = new History<null>({ store, captureMeta: () => null, restoreMeta: () => undefined });
  const page = store.pages()[0]!;
  const id = ids.next();
  history.run('create', (tx) => tx.create(makeRectangle({ id, parent: { id: page, key: keyOnTop(store, page) }, name: 'R', x: 0, y: 0, width: 10, height: 10 })));
  return { store, history, id };
}

describe('history merging', () => {
  test('commits with the same merge key become one undo step', () => {
    const { store, history, id } = setup();
    history.run('a', (tx) => tx.set(id, 'name', 'A'), { mergeKey: 's1' });
    history.run('b', (tx) => tx.set(id, 'name', 'AB'), { mergeKey: 's1' });
    history.run('c', (tx) => tx.set(id, 'opacity', 0.5), { mergeKey: 's1' });
    expect(history.undoLabel).toBe('a');
    history.undo();
    expect(store.getOrThrow(id)).toMatchObject({ name: 'R', opacity: 1 });
    history.redo();
    expect(store.getOrThrow(id)).toMatchObject({ name: 'AB', opacity: 0.5 });
  });

  test('another commit or an undo in between starts a new step', () => {
    const { store, history, id } = setup();
    history.run('a', (tx) => tx.set(id, 'name', 'A'), { mergeKey: 's1' });
    history.run('other', (tx) => tx.set(id, 'opacity', 0.5));
    history.run('b', (tx) => tx.set(id, 'name', 'AB'), { mergeKey: 's1' });
    history.undo();
    expect(store.getOrThrow(id)).toMatchObject({ name: 'A', opacity: 0.5 });
    history.undo();
    history.run('c', (tx) => tx.set(id, 'name', 'C'), { mergeKey: 's1' });
    history.undo();
    expect(store.getOrThrow(id)).toMatchObject({ name: 'A' });
  });

  test('revert drops the merged step without making it redoable', () => {
    const { store, history, id } = setup();
    history.run('a', (tx) => tx.set(id, 'name', 'A'), { mergeKey: 's1' });
    history.run('b', (tx) => tx.set(id, 'name', 'AB'), { mergeKey: 's1' });
    expect(history.revert('other')).toBe(false);
    expect(history.revert('s1')).toBe(true);
    expect(store.getOrThrow(id)).toMatchObject({ name: 'R' });
    expect(history.canRedo).toBe(false);
    expect(history.undoLabel).toBe('create');
  });
});
