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

import fc from 'fast-check';
import { beforeEach, describe, expect, test } from 'vitest';
import { History, type ChangeSet } from '../history/history';
import { IdGenerator } from '../ids/ids';
import { migrateToCurrent, UnsupportedVersionError } from '../migrations/migrations';
import { deserializeDocument, DocumentLoadError, serializeDocument } from '../serialize/serialize';
import { createEmptyDocument, keyOnTop, makeFrame, makeRectangle } from './factory';
import { assertDocumentInvariants } from './invariants';
import type { DocumentStore } from './store';

let ids: IdGenerator;
let store: DocumentStore;
let history: History<{ selection: string[] }>;
let selection: string[];
let changes: ChangeSet[];
let pageId: string;

beforeEach(() => {
  ids = new IdGenerator('t');
  store = createEmptyDocument({ name: 'Test', now: '2026-01-01T00:00:00.000Z', appVersion: 'test', ids });
  pageId = store.pages()[0]!;
  selection = [];
  changes = [];
  history = new History({
    store,
    captureMeta: () => ({ selection: [...selection] }),
    restoreMeta: (m) => (selection = m.selection),
    validate: assertDocumentInvariants,
  });
  history.subscribe((c) => changes.push(c));
});

const addRect = (parent = pageId, x = 0) =>
  history.run('Add rectangle', (tx) => {
    const id = ids.next();
    tx.create(makeRectangle({ id, parent: { id: parent, key: keyOnTop(store, parent) }, name: 'Rectangle', x, y: 0, width: 10, height: 10 }));
    selection = [id];
    return id;
  });

describe('document store and history', () => {
  test('create, undo, redo', () => {
    const id = addRect();
    expect(store.children(pageId)).toEqual([id]);
    expect(history.undo()).toBe(true);
    expect(store.has(id)).toBe(false);
    expect(selection).toEqual([]);
    expect(history.redo()).toBe(true);
    expect(store.get(id)?.type).toBe('RECTANGLE');
    expect(selection).toEqual([id]);
  });

  test('a drag of many moves is one undo step with one coalesced op', () => {
    const id = addRect();
    const tx = history.begin('Move');
    for (let i = 1; i <= 200; i++) tx.set(id, 'transform', [1, 0, 0, 1, i, 0]);
    history.commit(tx);
    expect(tx.ops).toHaveLength(1);
    expect((store.get(id) as { transform: number[] }).transform[4]).toBe(200);
    history.undo();
    expect((store.get(id) as { transform: number[] }).transform[4]).toBe(0);
  });

  test('structurally identical sets and round-trip drags create no undo step', () => {
    const id = addRect();
    const size = (store.get(id) as { size: object }).size;
    expect(history.run('Same size', (tx) => {
      tx.set(id, 'size', { ...size });
      return tx.ops.length;
    })).toBe(0);
    const tx = history.begin('Drag back');
    tx.set(id, 'transform', [1, 0, 0, 1, 50, 0]);
    tx.set(id, 'transform', [1, 0, 0, 1, 0, 0]);
    expect(history.commit(tx)).toBeNull();
    expect(history.undoLabel).toBe('Add rectangle');
  });

  test('cancel restores document and selection', () => {
    const id = addRect();
    const tx = history.begin('Resize');
    selection = [];
    tx.set(id, 'size', { width: 99, height: 99 });
    history.cancel(tx);
    expect((store.get(id) as { size: { width: number } }).size.width).toBe(10);
    expect(selection).toEqual([id]);
    expect(history.undoLabel).toBe('Add rectangle');
  });

  test('children are ordered by fractional key, reorder via parent field', () => {
    const a = addRect();
    const b = addRect();
    expect(store.children(pageId)).toEqual([a, b]);
    const bKey = (store.get(b) as { parent: { key: string } }).parent.key;
    history.run('Bring to front', (tx) => tx.set(a, 'parent', { id: pageId, key: bKey + 'V' }));
    expect(store.children(pageId)).toEqual([b, a]);
    expect(changes.at(-1)?.structural.has(pageId)).toBe(true);
  });

  test('reparent into a frame and delete subtree', () => {
    const frameId = history.run('Frame', (tx) => {
      const id = ids.next();
      tx.create(makeFrame({ id, parent: { id: pageId, key: keyOnTop(store, pageId) }, name: 'Frame', x: 0, y: 0, width: 100, height: 100 }));
      return id;
    });
    const r = addRect(frameId);
    expect(store.pageOf(r)).toBe(pageId);
    history.run('Delete', (tx) => tx.delete(frameId));
    expect(store.has(r)).toBe(false);
    history.undo();
    expect(store.children(frameId)).toEqual([r]);
  });

  test('cycles are rejected', () => {
    const frameId = history.run('Frame', (tx) => {
      const id = ids.next();
      tx.create(makeFrame({ id, parent: { id: pageId, key: keyOnTop(store, pageId) }, name: 'F', x: 0, y: 0, width: 1, height: 1 }));
      return id;
    });
    const inner = history.run('Inner', (tx) => {
      const id = ids.next();
      tx.create(makeFrame({ id, parent: { id: frameId, key: 'V' }, name: 'G', x: 0, y: 0, width: 1, height: 1 }));
      return id;
    });
    expect(() => history.run('Cycle', (tx) => tx.set(frameId, 'parent', { id: inner, key: 'V' }))).toThrow(/cycle/);
    expect(history.inTransaction).toBe(false);
    expect(store.parentOf(frameId)).toBe(pageId);
  });

  test('failed invariant cancels the transaction', () => {
    const r = addRect();
    expect(() => history.run('Bad', (tx) => tx.set(r, 'parent', { id: '0:0', key: 'V' }))).toThrow();
    expect(store.parentOf(r)).toBe(pageId);
  });

  test('property: random edits fully undo to the original serialization', () => {
    fc.assert(
      fc.property(
        fc.array(fc.tuple(fc.constantFrom('add', 'move', 'resize', 'delete', 'rename'), fc.nat(), fc.integer({ min: -500, max: 500 })), {
          maxLength: 40,
        }),
        (actions) => {
          // Fresh document and history per run: state must not leak between generated cases.
          const runIds = new IdGenerator('p');
          const doc = createEmptyDocument({ name: 'P', now: '2026-01-01T00:00:00.000Z', appVersion: 'test', ids: runIds });
          const page = doc.pages()[0]!;
          const h = new History({ store: doc, captureMeta: () => null, restoreMeta: () => undefined, validate: assertDocumentInvariants });
          const original = serializeDocument(doc);
          for (const [kind, pick, amount] of actions) {
            const shapes = [...doc.descendants(page, false)];
            const target = shapes[pick % Math.max(1, shapes.length)];
            if (kind === 'add' || !target) {
              h.run('Add', (tx) =>
                tx.create(makeRectangle({ id: runIds.next(), parent: { id: page, key: keyOnTop(doc, page) }, name: 'R', x: amount, y: 0, width: 10, height: 10 })),
              );
            } else if (kind === 'move') {
              h.run('Move', (tx) => tx.set(target, 'transform', [1, 0, 0, 1, amount, amount]));
            } else if (kind === 'resize') {
              h.run('Resize', (tx) => tx.set(target, 'size', { width: Math.abs(amount), height: 3 }));
            } else if (kind === 'rename') {
              h.run('Rename', (tx) => tx.set(target, 'name', `n${amount}`));
            } else {
              h.run('Delete', (tx) => tx.delete(target));
            }
          }
          // No-op edits (e.g. renaming to the same name) intentionally create no undo entry,
          // so the invariant is about document state, not the number of steps.
          const final = serializeDocument(doc);
          while (h.undo());
          const undoneToOriginal = serializeDocument(doc) === original;
          while (h.redo());
          const redoneToFinal = serializeDocument(doc) === final;
          return undoneToOriginal && redoneToFinal;
        },
      ),
      { numRuns: 60 },
    );
  });
});

describe('serialization', () => {
  test('canonical round trip is byte-identical', () => {
    addRect();
    addRect(pageId, 50);
    const text = serializeDocument(store);
    const loaded = deserializeDocument(text);
    expect(serializeDocument(loaded)).toBe(text);
    assertDocumentInvariants(loaded);
  });

  test('rejects invalid JSON, wrong format, and prototype pollution', () => {
    expect(() => deserializeDocument('{oops')).toThrow(DocumentLoadError);
    expect(() => deserializeDocument('{"format":"other"}')).toThrow(/Not an Openframe/);
    const polluted = serializeDocument(store).replace('"meta":{', '"meta":{"__proto__":{"x":1},');
    expect(() => deserializeDocument(polluted)).toThrow(/Forbidden key/);
  });

  test('rejects structurally invalid documents with issues listed', () => {
    const doc = JSON.parse(serializeDocument(store));
    doc.nodes[pageId].backgroundColor.r = 7;
    try {
      deserializeDocument(JSON.stringify(doc));
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(DocumentLoadError);
      expect((e as DocumentLoadError).issues.join()).toMatch(/backgroundColor/);
    }
  });

  test('rejects dangling parents', () => {
    addRect();
    const doc = JSON.parse(serializeDocument(store));
    const rect = Object.values(doc.nodes).find((n) => (n as { type: string }).type === 'RECTANGLE') as { parent: { id: string } };
    rect.parent.id = 'zz:1';
    expect(() => deserializeDocument(JSON.stringify(doc))).toThrow(/structure/);
  });
});

describe('migrations', () => {
  test('runs steps in order and stamps versions', () => {
    const migrations = {
      1: (d: Record<string, unknown>) => ({ ...d, a: 1 }),
      2: (d: Record<string, unknown>) => ({ ...d, b: (d['a'] as number) + 1 }),
    };
    expect(migrateToCurrent({ version: 1 }, migrations, 3)).toEqual({ version: 3, a: 1, b: 2 });
  });

  test('rejects newer and invalid versions', () => {
    expect(() => migrateToCurrent({ version: 99 })).toThrow(UnsupportedVersionError);
    expect(() => migrateToCurrent({ version: 0 })).toThrow(UnsupportedVersionError);
  });
});
