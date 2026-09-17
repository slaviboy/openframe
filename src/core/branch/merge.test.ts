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

import { beforeEach, describe, expect, test } from 'vitest';
import { createEmptyDocument, keyOnTop, makeRectangle } from '@/core/document/factory';
import type { DocumentStore } from '@/core/document/store';
import { IdGenerator } from '@/core/ids/ids';
import type { Node, SceneNode } from '@/core/schema/document';
import { mergeDocuments } from './merge';

let base: DocumentStore;
let ours: DocumentStore;
let theirs: DocumentStore;
let pageId: string;

/** Three copies of the same one-rectangle file: where a branch started, and the two sides that grew from it. */
function copyOfBase(): DocumentStore {
  const ids = new IdGenerator('b');
  const store = createEmptyDocument({ name: 'D', now: 'n', appVersion: 't', ids });
  const page = store.pages()[0]!;
  store.applyOp({ kind: 'create', node: makeRectangle({ id: 'r1', parent: { id: page, key: keyOnTop(store, page) }, name: 'Card', x: 0, y: 0, width: 100, height: 50 }) as Node });
  return store;
}

const set = (store: DocumentStore, id: string, field: string, value: unknown) => store.applyOp({ kind: 'set', id, field, value, prev: undefined });
const node = (store: DocumentStore, id: string) => store.get(id) as SceneNode | undefined;

/** Applies a merge's changes to our side, which is what taking a merge does. */
const apply = (store: DocumentStore, result: { ops: readonly import('@/core/ops/ops').Op[] }) => {
  for (const op of result.ops) store.applyOp(op);
};

beforeEach(() => {
  base = copyOfBase();
  ours = copyOfBase();
  theirs = copyOfBase();
  pageId = base.pages()[0]!;
});

describe('merging one document into another', () => {
  test('two sides that changed nothing have nothing to merge', () => {
    const result = mergeDocuments(base, ours, theirs);
    expect(result).toMatchObject({ ops: [], conflicts: [], added: 0, changed: 0, removed: 0 });
  });

  test('what only they changed comes across', () => {
    set(theirs, 'r1', 'name', 'Hero card');
    const result = mergeDocuments(base, ours, theirs);
    expect(result.conflicts).toEqual([]);
    expect(result.changed).toBe(1);

    apply(ours, result);
    expect(node(ours, 'r1')!.name).toBe('Hero card');
  });

  test('what only we changed is left alone', () => {
    set(ours, 'r1', 'name', 'Ours');
    const result = mergeDocuments(base, ours, theirs);
    expect(result.ops).toEqual([]);
    expect(result.conflicts).toEqual([]);
  });

  test('a change both sides made the same way is already there', () => {
    set(ours, 'r1', 'name', 'Agreed');
    set(theirs, 'r1', 'name', 'Agreed');
    expect(mergeDocuments(base, ours, theirs)).toMatchObject({ ops: [], conflicts: [] });
  });

  test('a field the two moved apart on is a conflict, and our side is left as it was', () => {
    set(ours, 'r1', 'name', 'Ours');
    set(theirs, 'r1', 'name', 'Theirs');
    const result = mergeDocuments(base, ours, theirs);
    expect(result.ops).toEqual([]);
    expect(result.conflicts).toEqual([{ nodeId: 'r1', nodeName: 'Ours', field: 'name', ours: 'Ours', theirs: 'Theirs' }]);

    apply(ours, result);
    expect(node(ours, 'r1')!.name).toBe('Ours');
  });

  test('two sides changing different fields both come through', () => {
    set(ours, 'r1', 'name', 'Ours');
    set(theirs, 'r1', 'size', { width: 200, height: 50 });
    const result = mergeDocuments(base, ours, theirs);
    expect(result.conflicts).toEqual([]);

    apply(ours, result);
    expect(node(ours, 'r1')!.name).toBe('Ours');
    expect(node(ours, 'r1')!.size.width).toBe(200);
  });

  test('a layer they added comes across, parents before their children', () => {
    theirs.applyOp({ kind: 'create', node: makeRectangle({ id: 'g1', parent: { id: pageId, key: 'm' }, name: 'Group', x: 0, y: 0, width: 10, height: 10 }) as Node });
    theirs.applyOp({ kind: 'create', node: makeRectangle({ id: 'c1', parent: { id: 'g1', key: 'm' }, name: 'Child', x: 0, y: 0, width: 5, height: 5 }) as Node });

    const result = mergeDocuments(base, ours, theirs);
    expect(result.added).toBe(2);
    // The parent is made first, so the child has somewhere to land.
    expect(result.ops.map((op) => (op.kind === 'create' ? op.node.id : ''))).toEqual(['g1', 'c1']);

    apply(ours, result);
    expect(node(ours, 'c1')).toBeDefined();
  });

  test('a layer they deleted goes, unless we changed it', () => {
    theirs.applyOp({ kind: 'delete', node: theirs.getOrThrow('r1') });
    const gone = mergeDocuments(base, ours, theirs);
    expect(gone.removed).toBe(1);
    apply(ours, gone);
    expect(node(ours, 'r1')).toBeUndefined();

    // With a change of ours on it, its going is for someone to settle.
    const mine = copyOfBase();
    set(mine, 'r1', 'name', 'Still wanted');
    const kept = mergeDocuments(base, mine, theirs);
    expect(kept.removed).toBe(0);
    expect(kept.conflicts).toEqual([{ nodeId: 'r1', nodeName: 'Still wanted', field: 'existence', ours: 'kept', theirs: 'deleted' }]);
  });

  test('a layer deleted on both sides is simply gone', () => {
    ours.applyOp({ kind: 'delete', node: ours.getOrThrow('r1') });
    theirs.applyOp({ kind: 'delete', node: theirs.getOrThrow('r1') });
    expect(mergeDocuments(base, ours, theirs)).toMatchObject({ ops: [], conflicts: [] });
  });

  test('a layer moved to another parent on their side moves on ours', () => {
    theirs.applyOp({ kind: 'create', node: makeRectangle({ id: 'g1', parent: { id: pageId, key: 'm' }, name: 'Group', x: 0, y: 0, width: 10, height: 10 }) as Node });
    set(theirs, 'r1', 'parent', { id: 'g1', key: 'a' });

    const result = mergeDocuments(base, ours, theirs);
    apply(ours, result);
    expect(ours.parentOf('r1')).toBe('g1');
  });
});
