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
import { createEmptyDocument, keyOnTop, makeRectangle, solid } from '@/core/document/factory';
import type { DocumentStore } from '@/core/document/store';
import { IdGenerator } from '@/core/ids/ids';
import type { Node } from '@/core/schema/document';
import { compareVersions } from './compare';

let before: DocumentStore;
let after: DocumentStore;
let pageId: string;

/** Two copies of the same one-rectangle file, which the tests then move apart. */
beforeEach(() => {
  const make = () => {
    const ids = new IdGenerator('v');
    const store = createEmptyDocument({ name: 'D', now: 'n', appVersion: 't', ids });
    const page = store.pages()[0]!;
    store.applyOp({ kind: 'create', node: makeRectangle({ id: 'r1', parent: { id: page, key: keyOnTop(store, page) }, name: 'Card', x: 0, y: 0, width: 100, height: 50 }) as Node });
    return { store, page };
  };
  const a = make();
  const b = make();
  before = a.store;
  after = b.store;
  pageId = a.page;
});

const set = (store: DocumentStore, id: string, field: string, value: unknown) => store.applyOp({ kind: 'set', id, field, value, prev: undefined });

describe('comparing a saved version with the file', () => {
  test('an untouched file has nothing to report', () => {
    expect(compareVersions(before, after, pageId)).toEqual([]);
  });

  test('the properties that read differently are listed, either side by side', () => {
    set(after, 'r1', 'transform', [1, 0, 0, 1, 40, 0]);
    set(after, 'r1', 'size', { width: 200, height: 50 });
    set(after, 'r1', 'name', 'Hero card');

    const [change] = compareVersions(before, after, pageId);
    expect(change!.kind).toBe('changed');
    expect(change!.properties).toEqual([
      { field: 'Name', before: 'Card', after: 'Hero card' },
      { field: 'X', before: '0', after: '40' },
      { field: 'Width', before: '100', after: '200' },
    ]);
  });

  test('a colour reads as its hex, so a repaint shows as one', () => {
    set(after, 'r1', 'fills', [solid({ r: 1, g: 0, b: 0, a: 1 })]);
    const change = compareVersions(before, after, pageId)[0]!;
    expect(change.properties.find((property) => property.field === 'Fill')?.after).toBe('#FF0000');
  });

  test('layers added and taken away are reported as such', () => {
    after.applyOp({ kind: 'create', node: makeRectangle({ id: 'r2', parent: { id: pageId, key: 'z' }, name: 'Badge', x: 0, y: 0, width: 10, height: 10 }) as Node });
    before.applyOp({ kind: 'create', node: makeRectangle({ id: 'r3', parent: { id: pageId, key: 'y' }, name: 'Old', x: 0, y: 0, width: 10, height: 10 }) as Node });

    const changes = compareVersions(before, after, pageId);
    expect(changes.find((change) => change.name === 'Badge')?.kind).toBe('added');
    expect(changes.find((change) => change.name === 'Old')?.kind).toBe('removed');
  });

  test('a property one side does not have is not a difference', () => {
    // Text is a property a rectangle never has, so it never reads as changed.
    const changes = compareVersions(before, after, pageId);
    expect(changes.flatMap((change) => change.properties).map((property) => property.field)).not.toContain('Text');
  });
});
