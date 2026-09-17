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

import type { DocumentStore } from '@/core/document/store';
import { createThumbnailUpdater } from './file-thumbnails';
import { checkpointDue, VIEW_VERSION_KEY, type VersionView } from './version-history';
import { createEmptyDocument } from '@/core/document/factory';
import { IdGenerator } from '@/core/ids/ids';
import { serializeDocument } from '@/core/serialize/serialize';
import { BUILTIN_COMMANDS } from '@/editor/commands/builtin';
import { Editor } from '@/editor/editor';
import { Observable } from '@/editor/stores/observable';
import { ToolManager } from '@/editor/tools/tool-manager';
import { Autosaver, LocalPersistence, StorageError, type FileRecord, type SaveStatus, type VersionInfo } from '@/platform/idb/persistence';
import { createReplicaId } from '@/platform/replica';

export const APP_VERSION = '0.1.0';
/** The setting naming the local file the app opens on start. */
export const LAST_FILE_KEY = 'lastFileId';

export interface SessionState {
  readonly file: FileRecord;
  readonly save: SaveStatus;
  readonly recovered: boolean;
  /** The earlier version shown read-only instead of the file as it is now, or null. */
  readonly viewing: VersionInfo | null;
}

export class SessionStore extends Observable<SessionState> {
  update(patch: Partial<SessionState>): void {
    this.setState(patch);
  }
}

export interface AppSession {
  readonly editor: Editor;
  readonly tools: ToolManager;
  readonly persistence: LocalPersistence;
  readonly autosaver: Autosaver;
  readonly session: SessionStore;
  /** Renames the local file (document metadata + file record) and writes a snapshot. */
  renameFile(name: string): Promise<void>;
  /** Renders and stores the file's thumbnail now (when the rendering engine is ready). */
  updateThumbnail(): Promise<void>;
  /** The file's version history, newest first. */
  listVersions(): Promise<VersionInfo[]>;
  /** Saves the file as it is now to its version history, with a title and description. */
  saveVersion(name: string, description: string): Promise<void>;
  /** Names or describes a version. */
  updateVersion(id: string, patch: { name: string; description: string }): Promise<void>;
  /** Reloads the app showing a version read-only (or, with null, the file as it is now). */
  viewVersion(id: string | null): Promise<void>;
  /** A version's document, for Dev Mode to compare the file against without leaving it. */
  readVersion(id: string): Promise<DocumentStore>;
  /** Restores a version (adding two autosave checkpoints) and reloads the app into the file. */
  restoreVersion(id: string): Promise<void>;
  /** Duplicates a version as a new local file. */
  duplicateVersion(id: string): Promise<FileRecord>;
  dispose(): void;
}

const nowIso = () => new Date().toISOString();

/**
 * Opens the most recent local file (replaying its journal for crash recovery) or
 * creates a new one, then wires autosave. Everything is local: IndexedDB only.
 */
export async function bootstrap(): Promise<AppSession> {
  const persistence = await LocalPersistence.open();
  const ids = new IdGenerator(createReplicaId());
  const lastId = await persistence.getSetting<string>(LAST_FILE_KEY);
  const view = await persistence.getSetting<VersionView | null>(VIEW_VERSION_KEY);

  let opened: Awaited<ReturnType<LocalPersistence['openFile']>> | null = null;
  if (lastId) {
    try {
      opened = await persistence.openFile(lastId);
    } catch (error) {
      if (!(error instanceof StorageError && error.reason === 'corrupt')) throw error;
      console.error('Openframe: last file could not be opened; starting a new file.', error);
    }
  }

  let file: FileRecord;
  let recovered = false;
  let editor: Editor;
  let viewing: VersionInfo | null = null;
  if (opened) {
    file = opened.record;
    recovered = opened.replayedBatches > 0;
    // An earlier version being viewed opens read-only in place of the file.
    const version = view?.fileId === file.id ? await persistence.openVersion(view.versionId).catch(() => null) : null;
    viewing = version?.record ?? null;
    editor = version
      ? new Editor({ doc: version.store, ids, validate: import.meta.env.DEV, readOnly: true })
      : new Editor({ doc: opened.store, ids, ...(file.lastPageId ? { pageId: file.lastPageId } : {}), validate: import.meta.env.DEV });
    if (recovered) {
      // Fold recovered journal into a fresh snapshot so the next load is fast.
      await persistence.compact(file.id, opened.store, nowIso());
    }
  } else {
    const doc = createEmptyDocument({ name: 'Untitled', now: nowIso(), appVersion: APP_VERSION, ids });
    file = await persistence.createFile(ids.next().replace(':', '-'), doc, nowIso());
    editor = new Editor({ doc, ids, validate: import.meta.env.DEV });
  }
  await persistence.setSetting(LAST_FILE_KEY, file.id);
  if (view && !viewing) await persistence.setSetting(VIEW_VERSION_KEY, null);
  editor.commands.register(...BUILTIN_COMMANDS);
  editor.images.storage = {
    save: (a) => persistence.putImage({ hash: a.hash, bytes: a.bytes.slice().buffer, mime: a.mime, width: a.width, height: a.height }),
    load: async (hash) => {
      const r = await persistence.getImage(hash);
      return r && { hash: r.hash, bytes: new Uint8Array(r.bytes), mime: r.mime, width: r.width, height: r.height };
    },
  };
  editor.fonts.storage = {
    save: (f) => persistence.putFont({ id: f.id, family: f.family, style: f.style, bytes: f.bytes.slice().buffer, variable: f.variable, source: f.source }),
    loadAll: async () => (await persistence.listFonts()).map((r) => ({ ...r, bytes: new Uint8Array(r.bytes) })),
  };
  // User fonts load before the canvas, so text shapes with them from the first frame.
  await editor.fonts.load().catch((error: unknown) => console.warn('Openframe: user fonts could not be loaded', error));

  // Saves add an autosave checkpoint to the version history every 30 minutes (when the file changed).
  const openedAt = nowIso();
  let lastVersionAt = (await persistence.listVersions(file.id))[0]?.createdAt;
  let checkpointing = false;
  const checkpoint = async () => {
    if (viewing || checkpointing || !checkpointDue(lastVersionAt, openedAt, nowIso())) return;
    checkpointing = true;
    try {
      const latest = await persistence.latestVersion(file.id);
      if (latest?.text !== serializeDocument(editor.doc)) await persistence.saveVersion(file.id, editor.doc, nowIso(), { id: crypto.randomUUID() });
      lastVersionAt = nowIso();
    } catch (error) {
      console.warn('Openframe: autosave checkpoint failed', error);
    } finally {
      checkpointing = false;
    }
  };

  const thumbnails = createThumbnailUpdater(editor, persistence, file.id);
  const session = new SessionStore({ file, save: { state: 'saved', at: file.updatedAt }, recovered, viewing });
  const autosaver = new Autosaver({
    persistence,
    fileId: file.id,
    store: editor.doc,
    now: nowIso,
    onStatus: (save) => {
      session.update({ save });
      // The thumbnail follows the saved file.
      if (save.state === 'saved') {
        thumbnails.schedule();
        void checkpoint();
      }
    },
  });

  const unsubscribe = editor.history.subscribe((change) => {
    // A version being viewed is never saved over the file.
    if (change.source === 'preview' || viewing) return;
    autosaver.record(change.ops);
  });

  let lastPage = editor.pageId;
  const unsubscribePage = editor.state.subscribe(() => {
    if (editor.pageId === lastPage || viewing) return;
    lastPage = editor.pageId;
    // Remembering the page is best effort: storage that is briefly unavailable doesn't matter here.
    void persistence.updateFileRecord(file.id, { lastPageId: lastPage }).catch(() => undefined);
  });

  const flush = () => void autosaver.flush().catch(() => undefined);
  const onVisibility = () => document.visibilityState === 'hidden' && flush();
  window.addEventListener('pagehide', flush);
  document.addEventListener('visibilitychange', onVisibility);

  return {
    editor,
    tools: new ToolManager(editor),
    persistence,
    autosaver,
    session,
    async renameFile(name: string) {
      const trimmed = name.trim();
      const current = session.getSnapshot().file;
      if (viewing || !trimmed || trimmed === current.name) return;
      editor.doc.meta = { ...editor.doc.meta, name: trimmed };
      session.update({ file: { ...current, name: trimmed } });
      await persistence.updateFileRecord(current.id, { name: trimmed });
      await autosaver.compactNow();
    },
    updateThumbnail() {
      return thumbnails.now();
    },
    listVersions() {
      return persistence.listVersions(file.id);
    },
    async saveVersion(name: string, description: string) {
      if (viewing) return;
      await autosaver.flush();
      await persistence.saveVersion(file.id, editor.doc, nowIso(), { id: crypto.randomUUID(), name, description });
      lastVersionAt = nowIso();
    },
    updateVersion(id: string, patch: { name: string; description: string }) {
      return persistence.updateVersion(id, patch);
    },
    async readVersion(id: string) {
      const { store } = await persistence.openVersion(id);
      return store;
    },
    async viewVersion(id: string | null) {
      await autosaver.flush();
      await persistence.setSetting(VIEW_VERSION_KEY, id ? ({ fileId: file.id, versionId: id } satisfies VersionView) : null);
      window.location.reload();
    },
    async restoreVersion(id: string) {
      await autosaver.flush();
      // The checkpoint of the file as it was: the file itself, not the version being viewed.
      const current = viewing ? (await persistence.openFile(file.id)).store : editor.doc;
      await persistence.restoreVersion(file.id, id, current, nowIso(), [crypto.randomUUID(), crypto.randomUUID()]);
      await persistence.setSetting(VIEW_VERSION_KEY, null);
      window.location.reload();
    },
    duplicateVersion(id: string) {
      return persistence.duplicateVersion(id, ids.next().replace(':', '-'), session.getSnapshot().file.name, nowIso());
    },
    dispose() {
      unsubscribe();
      unsubscribePage();
      window.removeEventListener('pagehide', flush);
      document.removeEventListener('visibilitychange', onVisibility);
      autosaver.dispose();
      thumbnails.dispose();
      persistence.close();
    },
  };
}
