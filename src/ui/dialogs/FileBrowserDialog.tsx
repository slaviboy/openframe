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

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { APP_VERSION, LAST_FILE_KEY, type AppSession } from '@/app/bootstrap';
import { openLocalFile } from '@/app/local-files';
import { createEmptyDocument } from '@/core/document/factory';
import type { FileRecord } from '@/platform/idb/persistence';
import { PackageError } from '@/platform/package';
import styles from './Dialog.module.css';
import css from './FileBrowserDialog.module.css';

const nowIso = () => new Date().toISOString();
const newFileId = (session: AppSession) => session.editor.ids.next().replace(':', '-');

/**
 * Files: the local files in this browser. Recents lists them by last edit, searchable by name, with their thumbnails;
 * each opens (reloading into it), renames, duplicates or moves to the trash. The trash restores files or deletes them
 * forever. New file creates an empty file and opens it; Import opens an .openframe file as a new file.
 */
export function FileBrowserDialog({ session, onClose }: { session: AppSession; onClose: () => void }) {
  const current = useSyncExternalStore(session.session.subscribe, session.session.getSnapshot).file.id;
  const [files, setFiles] = useState<FileRecord[] | null>(null);
  const [view, setView] = useState<'recents' | 'trash'>('recents');
  const [query, setQuery] = useState('');
  const [renaming, setRenaming] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [status, setStatus] = useState('');
  const importInput = useRef<HTMLInputElement>(null);

  const refresh = useCallback(() => {
    session.persistence
      .listFiles()
      .then(setFiles)
      .catch(() => setStatus('The files could not be listed.'));
  }, [session]);
  useEffect(() => {
    void session.updateThumbnail().finally(refresh);
  }, [session, refresh]);

  // Object URLs for the thumbnails, released when the list changes or the dialog closes.
  const thumbnails = useMemo(() => new Map((files ?? []).flatMap((file) => (file.thumbnail ? [[file.id, URL.createObjectURL(new Blob([file.thumbnail], { type: 'image/png' }))] as const] : []))), [files]);
  useEffect(() => () => thumbnails.forEach((url) => URL.revokeObjectURL(url)), [thumbnails]);

  const act = (action: () => Promise<unknown>, failure: string) =>
    void action()
      .then(refresh)
      .catch(() => setStatus(failure));

  const open = (id: string) =>
    act(async () => {
      if (id === current) {
        onClose();
        return;
      }
      await session.autosaver.flush();
      await session.persistence.setSetting(LAST_FILE_KEY, id);
      window.location.reload();
    }, 'The file could not be opened.');

  const newFile = () =>
    act(async () => {
      const now = nowIso();
      const id = newFileId(session);
      await session.persistence.createFile(id, createEmptyDocument({ name: 'Untitled', now, appVersion: APP_VERSION, ids: session.editor.ids }), now);
      await session.autosaver.flush();
      await session.persistence.setSetting(LAST_FILE_KEY, id);
      window.location.reload();
    }, 'A new file could not be created.');

  const rename = (file: FileRecord, name: string) => {
    setRenaming(null);
    const trimmed = name.trim();
    if (!trimmed || trimmed === file.name) return;
    act(() => (file.id === current ? session.renameFile(trimmed) : session.persistence.renameFile(file.id, trimmed, nowIso())), 'The file could not be renamed.');
  };

  const duplicate = (file: FileRecord) =>
    act(async () => {
      if (file.id === current) await session.autosaver.compactNow();
      await session.persistence.duplicateFile(file.id, newFileId(session), nowIso());
    }, 'The file could not be duplicated.');

  const trash = (file: FileRecord) => {
    if (file.id === current) {
      setStatus('The open file can’t be moved to the trash. Open another file first.');
      return;
    }
    act(() => session.persistence.trashFile(file.id, nowIso()), 'The file could not be moved to the trash.');
  };

  const importFile = (file: File) =>
    void openLocalFile(session, file).catch((error: unknown) => setStatus(error instanceof PackageError ? error.message : 'The file could not be opened.'));

  const needle = query.trim().toLowerCase();
  const shown = (files ?? []).filter((file) => (view === 'trash' ? file.trashedAt !== undefined : file.trashedAt === undefined) && file.name.toLowerCase().includes(needle));

  return (
    <div
      className={styles.backdrop}
      onPointerDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="file-browser-title"
        className={`${styles.dialog} ${css.dialog}`}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === 'Escape') {
            e.preventDefault();
            onClose();
          }
        }}
      >
        <h2 id="file-browser-title" className={styles.title}>
          Files
        </h2>
        <div className={styles.body}>
          <div className={styles.row}>
            <button type="button" className={styles.chip} aria-pressed={view === 'recents'} onClick={() => setView('recents')}>
              Recents
            </button>
            <button type="button" className={styles.chip} aria-pressed={view === 'trash'} onClick={() => setView('trash')}>
              Trash
            </button>
            <input className={styles.input} type="search" aria-label="Search files" placeholder="Search files" value={query} onChange={(e) => setQuery(e.target.value)} />
          </div>
          {files === null ? (
            <p>Loading files…</p>
          ) : shown.length === 0 ? (
            <p>{view === 'trash' ? 'The trash is empty.' : needle ? 'No matching files.' : 'No files yet.'}</p>
          ) : (
            <ul className={css.grid} aria-label={view === 'trash' ? 'Files in the trash' : 'Recent files'}>
              {shown.map((file) => (
                <li key={file.id} className={css.card} aria-label={file.name} data-current={file.id === current || undefined}>
                  <button type="button" className={css.thumbnail} title={`Open ${file.name}`} disabled={view === 'trash'} onClick={() => open(file.id)}>
                    {thumbnails.has(file.id) ? <img src={thumbnails.get(file.id)} alt="" /> : <span className={css.placeholder} aria-hidden="true" />}
                  </button>
                  {renaming === file.id ? (
                    <input
                      className={styles.input}
                      aria-label="File name"
                      defaultValue={file.name}
                      autoFocus
                      onBlur={(e) => rename(file, e.currentTarget.value)}
                      onKeyDown={(e) => {
                        e.stopPropagation();
                        if (e.key === 'Enter') e.currentTarget.blur();
                        if (e.key === 'Escape') setRenaming(null);
                      }}
                    />
                  ) : (
                    <span className={css.name}>{file.name}</span>
                  )}
                  <span className={css.meta}>
                    {file.id === current ? 'Open now · ' : ''}
                    {view === 'trash' && file.trashedAt ? `Trashed ${new Date(file.trashedAt).toLocaleString()}` : `Edited ${new Date(file.updatedAt).toLocaleString()}`}
                  </span>
                  <span className={css.actions}>
                    {view === 'recents' ? (
                      <>
                        <button type="button" className={styles.secondary} onClick={() => open(file.id)}>
                          Open
                        </button>
                        <button type="button" className={styles.secondary} onClick={() => setRenaming(file.id)}>
                          Rename
                        </button>
                        <button type="button" className={styles.secondary} onClick={() => duplicate(file)}>
                          Duplicate
                        </button>
                        <button type="button" className={styles.secondary} onClick={() => trash(file)}>
                          Move to trash
                        </button>
                      </>
                    ) : (
                      <>
                        <button type="button" className={styles.secondary} onClick={() => act(() => session.persistence.restoreFile(file.id), 'The file could not be restored.')}>
                          Restore
                        </button>
                        {confirmDelete === file.id ? (
                          <button
                            type="button"
                            className={styles.primary}
                            onClick={() => {
                              setConfirmDelete(null);
                              act(() => session.persistence.deleteFile(file.id), 'The file could not be deleted.');
                            }}
                          >
                            Delete forever
                          </button>
                        ) : (
                          <button type="button" className={styles.secondary} onClick={() => setConfirmDelete(file.id)}>
                            Delete…
                          </button>
                        )}
                      </>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          )}
          {status && <p role="status">{status}</p>}
        </div>
        <footer className={styles.footer}>
          <input
            ref={importInput}
            type="file"
            accept=".openframe"
            aria-label="Import an Openframe file"
            hidden
            onChange={(e) => {
              const file = e.currentTarget.files?.[0];
              e.currentTarget.value = '';
              if (file) importFile(file);
            }}
          />
          <button type="button" className={styles.secondary} onClick={() => importInput.current?.click()}>
            Import…
          </button>
          <button type="button" className={styles.secondary} onClick={newFile}>
            New file
          </button>
          <button type="button" className={styles.primary} onClick={onClose}>
            Close
          </button>
        </footer>
      </div>
    </div>
  );
}
