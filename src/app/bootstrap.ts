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

import { createThumbnailUpdater } from './file-thumbnails';
import { createEmptyDocument } from '@/core/document/factory';
import { IdGenerator } from '@/core/ids/ids';
import { BUILTIN_COMMANDS } from '@/editor/commands/builtin';
import { Editor } from '@/editor/editor';
import { Observable } from '@/editor/stores/observable';
import { ToolManager } from '@/editor/tools/tool-manager';
import { Autosaver, LocalPersistence, StorageError, type FileRecord, type SaveStatus } from '@/platform/idb/persistence';
import { createReplicaId } from '@/platform/replica';

export const APP_VERSION = '0.1.0';
/** The setting naming the local file the app opens on start. */
export const LAST_FILE_KEY = 'lastFileId';

export interface SessionState {
  readonly file: FileRecord;
  readonly save: SaveStatus;
  readonly recovered: boolean;
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
  if (opened) {
    file = opened.record;
    recovered = opened.replayedBatches > 0;
    editor = new Editor({ doc: opened.store, ids, ...(file.lastPageId ? { pageId: file.lastPageId } : {}), validate: import.meta.env.DEV });
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

  const thumbnails = createThumbnailUpdater(editor, persistence, file.id);
  const session = new SessionStore({ file, save: { state: 'saved', at: file.updatedAt }, recovered });
  const autosaver = new Autosaver({
    persistence,
    fileId: file.id,
    store: editor.doc,
    now: nowIso,
    onStatus: (save) => {
      session.update({ save });
      // The thumbnail follows the saved file.
      if (save.state === 'saved') thumbnails.schedule();
    },
  });

  const unsubscribe = editor.history.subscribe((change) => {
    if (change.source === 'preview') return;
    autosaver.record(change.ops);
  });

  let lastPage = editor.pageId;
  const unsubscribePage = editor.state.subscribe(() => {
    if (editor.pageId === lastPage) return;
    lastPage = editor.pageId;
    void persistence.updateFileRecord(file.id, { lastPageId: lastPage });
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
      if (!trimmed || trimmed === current.name) return;
      editor.doc.meta = { ...editor.doc.meta, name: trimmed };
      session.update({ file: { ...current, name: trimmed } });
      await persistence.updateFileRecord(current.id, { name: trimmed });
      await autosaver.compactNow();
    },
    updateThumbnail() {
      return thumbnails.now();
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
