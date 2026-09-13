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

import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { createEmptyDocument, keyOnTop, makeRectangle } from '@/core/document/factory';
import { assertDocumentInvariants } from '@/core/document/invariants';
import type { DocumentStore } from '@/core/document/store';
import { History } from '@/core/history/history';
import { IdGenerator } from '@/core/ids/ids';
import { serializeDocument } from '@/core/serialize/serialize';
import { Autosaver, LocalPersistence, StorageError, type SaveStatus } from './persistence';

const NOW = '2026-01-01T00:00:00.000Z';
let dbCounter = 0;
let persistence: LocalPersistence;
let ids: IdGenerator;
let store: DocumentStore;
let history: History<null>;
let pageId: string;

beforeEach(async () => {
  persistence = await LocalPersistence.open(`openframe-test-${dbCounter++}`);
  ids = new IdGenerator('p');
  store = createEmptyDocument({ name: 'Doc', now: NOW, appVersion: 'test', ids });
  pageId = store.pages()[0]!;
  history = new History({ store, captureMeta: () => null, restoreMeta: () => undefined, validate: assertDocumentInvariants });
});

afterEach(() => persistence.close());

const addRect = (x: number) =>
  history.run('Add', (tx) =>
    tx.create(makeRectangle({ id: ids.next(), parent: { id: pageId, key: keyOnTop(store, pageId) }, name: 'R', x, y: 0, width: 5, height: 5 })),
  );

describe('LocalPersistence', () => {
  test('create + open returns identical document', async () => {
    addRect(1);
    await persistence.createFile('f1', store, NOW);
    const opened = await persistence.openFile('f1');
    expect(serializeDocument(opened.store)).toBe(serializeDocument(store));
    expect(opened.replayedBatches).toBe(0);
    expect((await persistence.listFiles()).map((f) => f.id)).toEqual(['f1']);
  });

  test('journal replay recovers edits made after the snapshot (crash recovery)', async () => {
    await persistence.createFile('f1', store, NOW);
    const saver = new Autosaver({ persistence, fileId: 'f1', store, now: () => NOW, flushDelayMs: 10_000 });
    history.subscribe((c) => c.source !== 'preview' && saver.record(c.ops));
    addRect(1);
    addRect(2);
    history.undo();
    addRect(3);
    await saver.flush();
    saver.dispose();
    // Simulate a crash: no compaction happened; a new session opens the file.
    const opened = await persistence.openFile('f1');
    expect(opened.replayedBatches).toBe(1);
    expect(serializeDocument(opened.store)).toBe(serializeDocument(store));
  });

  test('compaction writes snapshot and clears journal atomically', async () => {
    await persistence.createFile('f1', store, NOW);
    const saver = new Autosaver({ persistence, fileId: 'f1', store, now: () => NOW, compactEvery: 2 });
    history.subscribe((c) => saver.record(c.ops));
    addRect(1);
    await saver.flush();
    expect(await persistence.journalBatchCount('f1')).toBe(1);
    addRect(2);
    await saver.flush();
    expect(await persistence.journalBatchCount('f1')).toBe(0);
    const opened = await persistence.openFile('f1');
    expect(serializeDocument(opened.store)).toBe(serializeDocument(store));
  });

  test('autosaver reports status transitions and batches ops', async () => {
    await persistence.createFile('f1', store, NOW);
    const statuses: SaveStatus['state'][] = [];
    const saver = new Autosaver({ persistence, fileId: 'f1', store, now: () => NOW, onStatus: (s) => statuses.push(s.state) });
    history.subscribe((c) => saver.record(c.ops));
    addRect(1);
    addRect(2);
    await saver.flush();
    expect(statuses).toEqual(['pending', 'pending', 'saving', 'saved']);
    expect(await persistence.journalBatchCount('f1')).toBe(1);
  });

  test('corrupt snapshot surfaces a StorageError instead of crashing', async () => {
    await expect(persistence.openFile('missing')).rejects.toBeInstanceOf(StorageError);
  });

  test('deleteFile removes all records', async () => {
    await persistence.createFile('f1', store, NOW);
    await persistence.appendJournal('f1', [{ kind: 'set', id: pageId, field: 'name', value: 'X', prev: 'Page 1' }], NOW);
    await persistence.deleteFile('f1');
    expect(await persistence.listFiles()).toEqual([]);
    expect(await persistence.journalBatchCount('f1')).toBe(0);
  });

  test('settings round trip', async () => {
    await persistence.setSetting('theme', 'dark');
    expect(await persistence.getSetting('theme')).toBe('dark');
  });
});
