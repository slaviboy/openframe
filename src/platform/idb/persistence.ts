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

import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { DocumentStore } from '@/core/document/store';
import type { Id } from '@/core/ids/ids';
import type { Op } from '@/core/ops/ops';
import { deserializeDocument, serializeDocument } from '@/core/serialize/serialize';

/**
 * Local persistence (IndexedDB).
 *
 * - `files`: metadata for the local file browser.
 * - `snapshots`: canonical serialized document per file (compacted state).
 * - `journal`: ops committed after the snapshot, appended in small batches. A crash
 *   loses at most one unflushed batch (≤250 ms of work); reopening replays the journal.
 *
 * Compaction writes a new snapshot and clears the journal in ONE IndexedDB
 * transaction, so there is never a window where ops are lost or double-applied.
 */
export interface FileRecord {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  /** Page the user last had open, restored on reopen. */
  lastPageId?: Id;
}

interface SnapshotRecord {
  fileId: string;
  text: string;
  savedAt: string;
}

interface JournalRecord {
  seq?: number;
  fileId: string;
  ops: Op[];
  ts: string;
}

/** An image blob, content-addressed by the SHA-256 of its bytes and shared by every local file. */
export interface ImageRecord {
  hash: string;
  bytes: ArrayBuffer;
  mime: string;
  width: number;
  height: number;
}

/** A user font (uploaded or installed), content-addressed by the SHA-256 of its bytes and shared by every local file. */
export interface FontRecord {
  id: string;
  family: string;
  style: string;
  bytes: ArrayBuffer;
  variable: boolean;
  source: 'upload' | 'local';
}

interface OpenframeDB extends DBSchema {
  files: { key: string; value: FileRecord; indexes: { updatedAt: string } };
  snapshots: { key: string; value: SnapshotRecord };
  journal: { key: number; value: JournalRecord; indexes: { fileId: string } };
  settings: { key: string; value: unknown };
  images: { key: string; value: ImageRecord };
  fonts: { key: string; value: FontRecord };
}

export const DB_NAME = 'openframe';
/** 1: files, snapshots, journal, settings. 2: images. 3: fonts. */
const DB_VERSION = 3;

export class StorageError extends Error {
  constructor(
    message: string,
    readonly reason: 'quota' | 'unavailable' | 'corrupt' | 'unknown',
    options?: { cause?: unknown },
  ) {
    super(message, options);
    this.name = 'StorageError';
  }
}

function classify(error: unknown): StorageError {
  if (error instanceof StorageError) return error;
  const name = error instanceof DOMException || error instanceof Error ? error.name : '';
  if (name === 'QuotaExceededError') {
    return new StorageError('Browser storage is full. Free up space or save the file to disk.', 'quota', { cause: error });
  }
  if (name === 'InvalidStateError' || name === 'UnknownError') {
    return new StorageError('Browser storage is unavailable.', 'unavailable', { cause: error });
  }
  return new StorageError(error instanceof Error ? error.message : String(error), 'unknown', { cause: error });
}

export interface OpenedFile {
  record: FileRecord;
  store: DocumentStore;
  /** Number of journal batches replayed on top of the snapshot. */
  replayedBatches: number;
}

export class LocalPersistence {
  private constructor(private readonly db: IDBPDatabase<OpenframeDB>) {}

  static async open(name = DB_NAME): Promise<LocalPersistence> {
    if (typeof indexedDB === 'undefined') throw new StorageError('IndexedDB is not supported in this browser.', 'unavailable');
    try {
      const db = await openDB<OpenframeDB>(name, DB_VERSION, {
        upgrade(database, oldVersion) {
          if (oldVersion < 1) {
            const files = database.createObjectStore('files', { keyPath: 'id' });
            files.createIndex('updatedAt', 'updatedAt');
            database.createObjectStore('snapshots', { keyPath: 'fileId' });
            const journal = database.createObjectStore('journal', { keyPath: 'seq', autoIncrement: true });
            journal.createIndex('fileId', 'fileId');
            database.createObjectStore('settings');
          }
          if (oldVersion < 2) database.createObjectStore('images', { keyPath: 'hash' });
          if (oldVersion < 3) database.createObjectStore('fonts', { keyPath: 'id' });
        },
      });
      return new LocalPersistence(db);
    } catch (error) {
      throw classify(error);
    }
  }

  close(): void {
    this.db.close();
  }

  async listFiles(): Promise<FileRecord[]> {
    const files = await this.db.getAllFromIndex('files', 'updatedAt');
    return files.reverse();
  }

  async getFile(id: string): Promise<FileRecord | undefined> {
    return this.db.get('files', id);
  }

  async createFile(id: string, store: DocumentStore, now: string): Promise<FileRecord> {
    const record: FileRecord = { id, name: store.meta.name, createdAt: now, updatedAt: now };
    try {
      const tx = this.db.transaction(['files', 'snapshots'], 'readwrite');
      await Promise.all([
        tx.objectStore('files').put(record),
        tx.objectStore('snapshots').put({ fileId: id, text: serializeDocument(store), savedAt: now }),
        tx.done,
      ]);
    } catch (error) {
      throw classify(error);
    }
    return record;
  }

  async updateFileRecord(id: string, patch: Partial<Omit<FileRecord, 'id'>>): Promise<void> {
    const tx = this.db.transaction('files', 'readwrite');
    const existing = await tx.store.get(id);
    if (existing) await tx.store.put({ ...existing, ...patch });
    await tx.done;
  }

  /** Loads the snapshot and replays journaled ops. Throws StorageError('corrupt') on invalid data. */
  async openFile(id: string): Promise<OpenedFile> {
    const [record, snapshot, batches] = await Promise.all([
      this.db.get('files', id),
      this.db.get('snapshots', id),
      this.db.getAllFromIndex('journal', 'fileId', id),
    ]);
    if (!record || !snapshot) throw new StorageError(`File ${id} was not found in local storage.`, 'corrupt');
    let store: DocumentStore;
    try {
      store = deserializeDocument(snapshot.text);
    } catch (error) {
      throw new StorageError('The saved document is damaged and could not be loaded.', 'corrupt', { cause: error });
    }
    batches.sort((a, b) => (a.seq ?? 0) - (b.seq ?? 0));
    let replayed = 0;
    for (const batch of batches) {
      try {
        for (const op of batch.ops) store.applyOp(op);
        replayed++;
      } catch (error) {
        // A batch that no longer applies (e.g. partially written) ends recovery; earlier state is kept.
        console.warn(`Openframe: stopped journal replay at batch ${batch.seq}`, error);
        break;
      }
    }
    return { record, store, replayedBatches: replayed };
  }

  async appendJournal(fileId: string, ops: readonly Op[], now: string): Promise<void> {
    if (ops.length === 0) return;
    try {
      const tx = this.db.transaction(['journal', 'files'], 'readwrite');
      const files = tx.objectStore('files');
      const record = await files.get(fileId);
      await tx.objectStore('journal').add({ fileId, ops: [...ops], ts: now });
      if (record) await files.put({ ...record, updatedAt: now });
      await tx.done;
    } catch (error) {
      throw classify(error);
    }
  }

  async journalBatchCount(fileId: string): Promise<number> {
    return this.db.countFromIndex('journal', 'fileId', fileId);
  }

  /** Writes a fresh snapshot and removes the journal atomically. */
  async compact(fileId: string, store: DocumentStore, now: string): Promise<void> {
    try {
      const tx = this.db.transaction(['snapshots', 'journal', 'files'], 'readwrite');
      await tx.objectStore('snapshots').put({ fileId, text: serializeDocument(store), savedAt: now });
      const index = tx.objectStore('journal').index('fileId');
      for (let cursor = await index.openCursor(fileId); cursor; cursor = await cursor.continue()) {
        await cursor.delete();
      }
      const files = tx.objectStore('files');
      const record = await files.get(fileId);
      if (record) await files.put({ ...record, name: store.meta.name, updatedAt: now });
      await tx.done;
    } catch (error) {
      throw classify(error);
    }
  }

  async deleteFile(fileId: string): Promise<void> {
    const tx = this.db.transaction(['files', 'snapshots', 'journal'], 'readwrite');
    await tx.objectStore('files').delete(fileId);
    await tx.objectStore('snapshots').delete(fileId);
    const index = tx.objectStore('journal').index('fileId');
    for (let cursor = await index.openCursor(fileId); cursor; cursor = await cursor.continue()) await cursor.delete();
    await tx.done;
  }

  /** Stores an image blob (idempotent: the key is the content hash). */
  async putImage(record: ImageRecord): Promise<void> {
    try {
      await this.db.put('images', record);
    } catch (error) {
      throw classify(error);
    }
  }

  async getImage(hash: string): Promise<ImageRecord | undefined> {
    return this.db.get('images', hash);
  }

  async putFont(record: FontRecord): Promise<void> {
    try {
      await this.db.put('fonts', record);
    } catch (error) {
      throw classify(error);
    }
  }

  async listFonts(): Promise<FontRecord[]> {
    return this.db.getAll('fonts');
  }

  async getSetting<T>(key: string): Promise<T | undefined> {
    return (await this.db.get('settings', key)) as T | undefined;
  }

  async setSetting(key: string, value: unknown): Promise<void> {
    await this.db.put('settings', value, key);
  }
}

export type SaveStatus =
  | { state: 'saved'; at: string }
  | { state: 'pending' }
  | { state: 'saving' }
  | { state: 'error'; error: StorageError };

export interface AutosaverOptions {
  persistence: LocalPersistence;
  fileId: string;
  store: DocumentStore;
  now: () => string;
  flushDelayMs?: number;
  /** Compact after this many journal batches. */
  compactEvery?: number;
  onStatus?: (status: SaveStatus) => void;
}

/**
 * Batches committed ops into journal writes. Writes are serialized so batches land in
 * commit order even if IndexedDB is slow; failures keep the pending ops for retry.
 */
export class Autosaver {
  private pending: Op[] = [];
  private timer: ReturnType<typeof setTimeout> | null = null;
  private chain: Promise<void> = Promise.resolve();
  private batchesSinceCompact = 0;
  private status: SaveStatus;

  constructor(private readonly options: AutosaverOptions) {
    this.status = { state: 'saved', at: options.now() };
  }

  get currentStatus(): SaveStatus {
    return this.status;
  }

  record(ops: readonly Op[]): void {
    if (ops.length === 0) return;
    this.pending.push(...ops);
    this.setStatus({ state: 'pending' });
    if (this.timer === null) {
      this.timer = setTimeout(() => void this.flush(), this.options.flushDelayMs ?? 250);
    }
  }

  /** Writes all pending ops now. Resolves once they are durable (or rejects). */
  flush(): Promise<void> {
    if (this.timer !== null) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    const batch = this.pending;
    this.pending = [];
    if (batch.length === 0) return this.chain;
    this.chain = this.chain
      .catch(() => undefined)
      .then(async () => {
        this.setStatus({ state: 'saving' });
        const { persistence, fileId, store, now } = this.options;
        try {
          await persistence.appendJournal(fileId, batch, now());
          this.batchesSinceCompact++;
          if (this.batchesSinceCompact >= (this.options.compactEvery ?? 200)) {
            await persistence.compact(fileId, store, now());
            this.batchesSinceCompact = 0;
          }
          this.setStatus(this.pending.length > 0 ? { state: 'pending' } : { state: 'saved', at: now() });
        } catch (error) {
          this.pending = [...batch, ...this.pending];
          this.setStatus({ state: 'error', error: error instanceof StorageError ? error : classify(error) });
          throw error;
        }
      });
    return this.chain;
  }

  /** Flushes and writes a compacted snapshot (used on explicit save and on close). */
  async compactNow(): Promise<void> {
    await this.flush();
    await this.options.persistence.compact(this.options.fileId, this.options.store, this.options.now());
    this.batchesSinceCompact = 0;
    this.setStatus({ state: 'saved', at: this.options.now() });
  }

  dispose(): void {
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = null;
  }

  private setStatus(status: SaveStatus): void {
    this.status = status;
    this.options.onStatus?.(status);
  }
}
