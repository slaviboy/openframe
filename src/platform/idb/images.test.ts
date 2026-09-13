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

import { openDB } from 'idb';
import { describe, expect, test } from 'vitest';
import { createEmptyDocument } from '@/core/document/factory';
import { IdGenerator } from '@/core/ids/ids';
import { LocalPersistence } from './persistence';

const NOW = '2026-01-01T00:00:00.000Z';
let counter = 0;

describe('image storage', () => {
  test('images round-trip by hash', async () => {
    const persistence = await LocalPersistence.open(`openframe-images-${counter++}`);
    const bytes = new Uint8Array([1, 2, 3, 4]);
    await persistence.putImage({ hash: 'a'.repeat(64), bytes: bytes.buffer, mime: 'image/png', width: 2, height: 1 });
    const record = await persistence.getImage('a'.repeat(64));
    expect(record).toMatchObject({ mime: 'image/png', width: 2, height: 1 });
    expect(Array.from(new Uint8Array(record!.bytes))).toEqual([1, 2, 3, 4]);
    expect(await persistence.getImage('b'.repeat(64))).toBeUndefined();
    persistence.close();
  });

  test('a version 1 database upgrades in place and keeps its files', async () => {
    const name = `openframe-upgrade-${counter++}`;
    const v1 = await openDB(name, 1, {
      upgrade(db) {
        const files = db.createObjectStore('files', { keyPath: 'id' });
        files.createIndex('updatedAt', 'updatedAt');
        db.createObjectStore('snapshots', { keyPath: 'fileId' });
        const journal = db.createObjectStore('journal', { keyPath: 'seq', autoIncrement: true });
        journal.createIndex('fileId', 'fileId');
        db.createObjectStore('settings');
      },
    });
    v1.close();
    const first = await LocalPersistence.open(name);
    const ids = new IdGenerator('u');
    await first.createFile('f1', createEmptyDocument({ name: 'Doc', now: NOW, appVersion: 't', ids }), NOW);
    first.close();

    const reopened = await LocalPersistence.open(name);
    expect((await reopened.listFiles()).map((f) => f.id)).toEqual(['f1']);
    await reopened.putImage({ hash: 'c'.repeat(64), bytes: new ArrayBuffer(1), mime: 'image/png', width: 1, height: 1 });
    expect(await reopened.getImage('c'.repeat(64))).toBeDefined();
    reopened.close();
  });
});
