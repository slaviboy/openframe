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
  /** The file's thumbnail (PNG), shown in the file browser. */
  thumbnail?: ArrayBuffer;
  /** When the file was moved to the trash; absent for files that aren't in the trash. */
  trashedAt?: string;
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

/** A saved version of a file, shown in its version history: an autosave checkpoint, or a version saved with a name. */
export interface VersionRecord {
  id: string;
  fileId: string;
  createdAt: string;
  /** `named` versions were saved (or later named) by the user; `autosave` checkpoints were made by the app. */
  kind: 'autosave' | 'named';
  name?: string;
  description?: string;
  /** The version a restore checkpoint brought back (it sits above the checkpoint saved at the same time). */
  restoredFrom?: string;
  /** The serialized document. */
  text: string;
}

/** A version without its document, for listing. */
export type VersionInfo = Omit<VersionRecord, 'text'>;

interface OpenframeDB extends DBSchema {
  files: { key: string; value: FileRecord; indexes: { updatedAt: string } };
  versions: { key: string; value: VersionRecord; indexes: { fileId: string } };
  snapshots: { key: string; value: SnapshotRecord };
  journal: { key: number; value: JournalRecord; indexes: { fileId: string } };
  settings: { key: string; value: unknown };
  images: { key: string; value: ImageRecord };
  fonts: { key: string; value: FontRecord };
}

export const DB_NAME = 'openframe';
/** 1: files, snapshots, journal, settings. 2: images. 3: fonts. 4: versions. */
const DB_VERSION = 4;

const withoutText = ({ text: _text, ...info }: VersionRecord): VersionInfo => info;
const versionKind = (name: string | undefined): VersionRecord['kind'] => (name?.trim() ? 'named' : 'autosave');

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
          if (oldVersion < 4) database.createObjectStore('versions', { keyPath: 'id' }).createIndex('fileId', 'fileId');
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
    const tx = this.db.transaction(['files', 'snapshots', 'journal', 'versions'], 'readwrite');
    await tx.objectStore('files').delete(fileId);
    await tx.objectStore('snapshots').delete(fileId);
    const index = tx.objectStore('journal').index('fileId');
    for (let cursor = await index.openCursor(fileId); cursor; cursor = await cursor.continue()) await cursor.delete();
    const versions = tx.objectStore('versions').index('fileId');
    for (let cursor = await versions.openCursor(fileId); cursor; cursor = await cursor.continue()) await cursor.delete();
    await tx.done;
  }

  /** Adds the document as it is now to the file's version history: a named version when `name` is given, else an autosave checkpoint. */
  async saveVersion(fileId: string, store: DocumentStore, now: string, info: { id: string; name?: string | undefined; description?: string | undefined }): Promise<VersionInfo> {
    const name = info.name?.trim();
    const description = info.description?.trim();
    const record: VersionRecord = { id: info.id, fileId, createdAt: now, kind: versionKind(name), ...(name ? { name } : {}), ...(description ? { description } : {}), text: serializeDocument(store) };
    try {
      await this.db.put('versions', record);
    } catch (error) {
      throw classify(error);
    }
    return withoutText(record);
  }

  /** The file's version history, newest first (a restore checkpoint above the checkpoint saved with it). */
  async listVersions(fileId: string): Promise<VersionInfo[]> {
    const records = await this.db.getAllFromIndex('versions', 'fileId', fileId);
    return records
      .sort((a, b) => (a.createdAt === b.createdAt ? Number(b.restoredFrom !== undefined) - Number(a.restoredFrom !== undefined) : a.createdAt < b.createdAt ? 1 : -1))
      .map(withoutText);
  }

  /** The newest version of the file (with its document), if it has any. */
  async latestVersion(fileId: string): Promise<VersionRecord | undefined> {
    const [latest] = await this.listVersions(fileId);
    return latest && this.db.get('versions', latest.id);
  }

  /** A version's document. Throws StorageError('corrupt') when the version is missing or damaged. */
  async openVersion(id: string): Promise<{ record: VersionInfo; store: DocumentStore }> {
    const record = await this.db.get('versions', id);
    if (!record) throw new StorageError(`Version ${id} was not found in local storage.`, 'corrupt');
    try {
      return { record: withoutText(record), store: deserializeDocument(record.text) };
    } catch (error) {
      throw new StorageError('The saved version is damaged and could not be loaded.', 'corrupt', { cause: error });
    }
  }

  /** Names or describes a version; naming an autosave checkpoint makes it a named version (and clearing the name, a checkpoint again). */
  async updateVersion(id: string, patch: { name: string; description: string }): Promise<void> {
    const tx = this.db.transaction('versions', 'readwrite');
    const existing = await tx.store.get(id);
    if (existing) {
      const { name: _name, description: _description, ...rest } = existing;
      const name = patch.name.trim();
      const description = patch.description.trim();
      await tx.store.put({ ...rest, kind: versionKind(name), ...(name ? { name } : {}), ...(description ? { description } : {}) });
    }
    await tx.done;
  }

  /**
   * Restores a version: the file becomes the version's document (keeping the file's name), and two autosave checkpoints are
   * added at the same time — one saving the document as it was (`current`), and one for the restored version.
   */
  async restoreVersion(fileId: string, versionId: string, current: DocumentStore, now: string, checkpointIds: readonly [string, string]): Promise<void> {
    const { record, store } = await this.openVersion(versionId);
    store.meta = { ...store.meta, name: current.meta.name };
    const text = serializeDocument(store);
    try {
      const tx = this.db.transaction(['versions', 'snapshots', 'journal', 'files'], 'readwrite');
      const versions = tx.objectStore('versions');
      await versions.put({ id: checkpointIds[0], fileId, createdAt: now, kind: 'autosave', text: serializeDocument(current) });
      await versions.put({ id: checkpointIds[1], fileId, createdAt: now, kind: 'autosave', restoredFrom: record.id, text });
      await tx.objectStore('snapshots').put({ fileId, text, savedAt: now });
      const index = tx.objectStore('journal').index('fileId');
      for (let cursor = await index.openCursor(fileId); cursor; cursor = await cursor.continue()) await cursor.delete();
      const files = tx.objectStore('files');
      const file = await files.get(fileId);
      if (file) await files.put({ ...file, updatedAt: now });
      await tx.done;
    } catch (error) {
      throw classify(error);
    }
  }

  /** Duplicates a version as a new local file named "<file name> (Copy)". */
  async duplicateVersion(versionId: string, newId: string, name: string, now: string): Promise<FileRecord> {
    const { store } = await this.openVersion(versionId);
    store.meta = { ...store.meta, name: `${name} (Copy)` };
    return this.createFile(newId, store, now);
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

  /** Stores a file's thumbnail image (PNG bytes), shown in the file browser. */
  async setThumbnail(id: string, bytes: Uint8Array): Promise<void> {
    try {
      const tx = this.db.transaction('files', 'readwrite');
      const existing = await tx.store.get(id);
      if (existing) await tx.store.put({ ...existing, thumbnail: bytes.slice().buffer });
      await tx.done;
    } catch (error) {
      throw classify(error);
    }
  }

  /** Moves a file to the trash, from where it can be restored until it is deleted. */
  async trashFile(id: string, now: string): Promise<void> {
    await this.updateFileRecord(id, { trashedAt: now });
  }

  /** Takes a file out of the trash. */
  async restoreFile(id: string): Promise<void> {
    const tx = this.db.transaction('files', 'readwrite');
    const existing = await tx.store.get(id);
    if (existing) await tx.store.put(Object.fromEntries(Object.entries(existing).filter(([key]) => key !== 'trashedAt')) as unknown as FileRecord);
    await tx.done;
  }

  /** Duplicates a file as it is now (its journal included) as a new file named "<name> (Copy)", with its thumbnail. */
  async duplicateFile(sourceId: string, newId: string, now: string): Promise<FileRecord> {
    const opened = await this.openFile(sourceId);
    opened.store.meta = { ...opened.store.meta, name: `${opened.record.name} (Copy)` };
    const record = await this.createFile(newId, opened.store, now);
    if (opened.record.thumbnail) {
      await this.setThumbnail(newId, new Uint8Array(opened.record.thumbnail));
      return { ...record, thumbnail: opened.record.thumbnail };
    }
    return record;
  }
  /** Renames a file that isn't open: its document takes the name too (a fresh snapshot is written). */
  async renameFile(id: string, name: string, now: string): Promise<void> {
    const opened = await this.openFile(id);
    opened.store.meta = { ...opened.store.meta, name };
    await this.compact(id, opened.store, now);
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
  /** How long to wait before trying again when storage was briefly unavailable. */
  retryDelayMs?: number;
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
    if (this.timer === null) this.schedule(this.options.flushDelayMs ?? 250);
  }

  /** Flushes after a delay; a failure shows in the save status (and a transient one retries) instead of escaping. */
  private schedule(delayMs: number): void {
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.flush().catch(() => undefined);
    }, delayMs);
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
          const storageError = error instanceof StorageError ? error : classify(error);
          this.setStatus({ state: 'error', error: storageError });
          // Storage that is briefly unavailable (e.g. while another tab opens it) is tried again.
          if (storageError.reason === 'unavailable' && this.timer === null && !this.disposed) this.schedule(this.options.retryDelayMs ?? 1000);
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

  private disposed = false;

  dispose(): void {
    this.disposed = true;
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = null;
  }

  private setStatus(status: SaveStatus): void {
    this.status = status;
    this.options.onStatus?.(status);
  }
}
