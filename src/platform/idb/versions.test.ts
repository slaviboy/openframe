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
import type { DocumentStore } from '@/core/document/store';
import { History } from '@/core/history/history';
import { IdGenerator } from '@/core/ids/ids';
import { serializeDocument } from '@/core/serialize/serialize';
import { LocalPersistence, StorageError } from './persistence';

let dbCounter = 0;
let persistence: LocalPersistence;
let ids: IdGenerator;
let store: DocumentStore;
let history: History<null>;
let pageId: string;

beforeEach(async () => {
  persistence = await LocalPersistence.open(`openframe-versions-test-${dbCounter++}`);
  ids = new IdGenerator('v');
  store = createEmptyDocument({ name: 'Doc', now: 'n', appVersion: 'test', ids });
  pageId = store.pages()[0]!;
  history = new History({ store, captureMeta: () => null, restoreMeta: () => undefined });
});

afterEach(() => persistence.close());

const addRect = (name: string) =>
  history.run('Add', (tx) => tx.create(makeRectangle({ id: ids.next(), parent: { id: pageId, key: keyOnTop(store, pageId) }, name, x: 0, y: 0, width: 5, height: 5 })));
const layerNames = (doc: DocumentStore) => doc.children(pageId).map((id) => doc.getOrThrow(id).name);

describe('version history', () => {
  test('autosave checkpoints and named versions list newest first, and open as they were saved', async () => {
    await persistence.createFile('f', store, '2026-01-01T00:00:00.000Z');
    addRect('A');
    const checkpoint = await persistence.saveVersion('f', store, '2026-01-01T01:00:00.000Z', { id: 'v1' });
    addRect('B');
    const named = await persistence.saveVersion('f', store, '2026-01-01T02:00:00.000Z', { id: 'v2', name: '  Handoff ', description: 'Ready for review' });
    expect(checkpoint).toEqual({ id: 'v1', fileId: 'f', createdAt: '2026-01-01T01:00:00.000Z', kind: 'autosave' });
    expect(named).toMatchObject({ kind: 'named', name: 'Handoff', description: 'Ready for review' });
    await persistence.saveVersion('other', store, '2026-01-01T03:00:00.000Z', { id: 'v3' });

    expect((await persistence.listVersions('f')).map((v) => v.id)).toEqual(['v2', 'v1']);
    expect((await persistence.latestVersion('f'))?.text).toBe(serializeDocument(store));
    const opened = await persistence.openVersion('v1');
    expect(layerNames(opened.store)).toEqual(['A']);
    await expect(persistence.openVersion('missing')).rejects.toBeInstanceOf(StorageError);
  });

  test('naming a checkpoint makes it a named version; clearing the name makes it a checkpoint again', async () => {
    await persistence.saveVersion('f', store, 't', { id: 'v1' });
    await persistence.updateVersion('v1', { name: 'Final', description: 'Signed off' });
    expect((await persistence.listVersions('f'))[0]).toMatchObject({ kind: 'named', name: 'Final', description: 'Signed off' });
    await persistence.updateVersion('v1', { name: ' ', description: '' });
    expect((await persistence.listVersions('f'))[0]).toEqual({ id: 'v1', fileId: 'f', createdAt: 't', kind: 'autosave' });
  });

  test('restoring a version adds two checkpoints and makes the file that version, keeping its name', async () => {
    addRect('A');
    await persistence.createFile('f', store, '2026-01-01T00:00:00.000Z');
    await persistence.saveVersion('f', store, '2026-01-01T01:00:00.000Z', { id: 'v1', name: 'Only A' });
    addRect('B');
    store.meta = { ...store.meta, name: 'Renamed' };
    await persistence.appendJournal('f', [], '2026-01-01T01:30:00.000Z');
    await persistence.compact('f', store, '2026-01-01T01:30:00.000Z');

    await persistence.restoreVersion('f', 'v1', store, '2026-01-01T02:00:00.000Z', ['c1', 'c2']);
    const versions = await persistence.listVersions('f');
    // The restored version's checkpoint sits above the checkpoint of the document as it was.
    expect(versions.map((v) => [v.id, v.kind, v.createdAt])).toEqual([
      ['c2', 'autosave', '2026-01-01T02:00:00.000Z'],
      ['c1', 'autosave', '2026-01-01T02:00:00.000Z'],
      ['v1', 'named', '2026-01-01T01:00:00.000Z'],
    ]);
    expect(versions[0]!.restoredFrom).toBe('v1');
    expect(layerNames((await persistence.openVersion('c1')).store)).toEqual(['A', 'B']);
    const reopened = await persistence.openFile('f');
    expect(layerNames(reopened.store)).toEqual(['A']);
    expect(reopened.store.meta.name).toBe('Renamed');
    expect(reopened.replayedBatches).toBe(0);
  });

  test('a version duplicates as a new file; deleting a file deletes its versions', async () => {
    addRect('A');
    await persistence.createFile('f', store, 't0');
    await persistence.saveVersion('f', store, 't1', { id: 'v1' });
    const copy = await persistence.duplicateVersion('v1', 'g', 'Doc', 't2');
    expect(copy.name).toBe('Doc (Copy)');
    expect(layerNames((await persistence.openFile('g')).store)).toEqual(['A']);
    await persistence.deleteFile('f');
    expect(await persistence.listVersions('f')).toEqual([]);
  });
});
