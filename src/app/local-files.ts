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

import { canSaveToDisk, pickOpenFile, pickSaveFile, writeDiskFile, type DiskFileHandle } from '@/platform/disk-file';
import { downloadBytes } from '@/platform/download';
import { PACKAGE_EXTENSION, readPackage, writePackage } from '@/platform/package';
import { LAST_FILE_KEY, type AppSession } from './bootstrap';

/** Characters file names can't contain, replaced in saved file names. */
const UNSAFE_NAME = /[\\/:*?"<>|]/g;

/** The setting holding the file on disk a local file was saved to or opened from. */
const diskFileKey = (fileId: string) => `diskFile:${fileId}`;
/** Files on disk chosen this session (also kept here: a handle that can't be stored in IndexedDB lasts the session). */
const sessionHandles = new Map<string, DiskFileHandle>();

/** Whether a file looks like an Openframe file (by its extension). */
export const isPackageFile = (file: File): boolean => file.name.toLowerCase().endsWith(PACKAGE_EXTENSION);

/** The Openframe files of a drag, so one dropped on the canvas opens as this one does. */
export const packageFilesOf = (data: DataTransfer | null): File[] => (data ? Array.from(data.files).filter(isPackageFile) : []);

const packageName = (session: AppSession) => (session.editor.doc.meta.name.replace(UNSAFE_NAME, '_').trim() || 'Untitled') + PACKAGE_EXTENSION;

/** The open file as .openframe bytes, with the images it uses (every edit saved first). */
async function packageBytes(session: AppSession): Promise<Uint8Array> {
  const { editor, persistence } = session;
  await session.autosaver.flush();
  return writePackage(editor.doc, async (hash) => {
    const asset = editor.images.get(hash);
    if (asset) return asset;
    const record = await persistence.getImage(hash);
    return record && { hash: record.hash, bytes: new Uint8Array(record.bytes), mime: record.mime, width: record.width, height: record.height };
  });
}

/** Save local copy: downloads the open file as an .openframe file, with the images it uses. */
export async function saveLocalCopy(session: AppSession): Promise<void> {
  downloadBytes(packageName(session), await packageBytes(session), 'application/zip');
}

async function rememberDiskFile(session: AppSession, fileId: string, handle: DiskFileHandle): Promise<void> {
  sessionHandles.set(fileId, handle);
  try {
    await session.persistence.setSetting(diskFileKey(fileId), handle);
  } catch {
    // The handle can't be stored: it is remembered for this session only.
  }
}

async function rememberedDiskFile(session: AppSession, fileId: string): Promise<DiskFileHandle | undefined> {
  return sessionHandles.get(fileId) ?? (await session.persistence.getSetting<DiskFileHandle>(diskFileKey(fileId)).catch(() => undefined));
}

export type SaveResult = { readonly kind: 'saved'; readonly name: string } | { readonly kind: 'downloaded' | 'canceled' | 'denied' };

/**
 * Save: writes the open file to the file on disk it was last saved to or opened from. The first time, or with `saveAs`,
 * asks where to save it. Browsers without the File System Access API download a copy instead.
 */
export async function saveToDisk(session: AppSession, saveAs = false): Promise<SaveResult> {
  if (!canSaveToDisk()) {
    await saveLocalCopy(session);
    return { kind: 'downloaded' };
  }
  const fileId = session.session.getSnapshot().file.id;
  const known = saveAs ? undefined : await rememberedDiskFile(session, fileId);
  if (known && (await writeDiskFile(known, await packageBytes(session)))) return { kind: 'saved', name: known.name };
  const handle = await pickSaveFile(packageName(session));
  if (!handle) return { kind: 'canceled' };
  if (!(await writeDiskFile(handle, await packageBytes(session)))) return { kind: 'denied' };
  await rememberDiskFile(session, fileId, handle);
  return { kind: 'saved', name: handle.name };
}

/** The notice a save shows; null when there is nothing to say. */
export function saveResultNotice(result: SaveResult): string | null {
  if (result.kind === 'saved') return `Saved to ${result.name}.`;
  if (result.kind === 'denied') return 'Openframe wasn’t allowed to save the file.';
  return null;
}

/**
 * Opens an .openframe file: its images are stored, the document becomes a new local file, and the app reloads into it
 * (the open file is saved first). With the file's handle on disk, Save writes back to it. Throws PackageError when the
 * file can't be read.
 */
export async function openLocalFile(session: AppSession, file: File, handle?: DiskFileHandle): Promise<void> {
  const { store, images } = await readPackage(new Uint8Array(await file.arrayBuffer()));
  const { persistence } = session;
  for (const image of images) await persistence.putImage({ hash: image.hash, bytes: image.bytes.slice().buffer, mime: image.mime, width: image.width, height: image.height });
  const now = new Date().toISOString();
  const id = session.editor.ids.next().replace(':', '-');
  await persistence.createFile(id, store, now);
  if (handle) await rememberDiskFile(session, id, handle);
  await session.autosaver.flush();
  await persistence.setSetting(LAST_FILE_KEY, id);
  window.location.reload();
}

/** Open file: asks for an .openframe file on disk and opens it (Save then writes back to it); false when canceled. */
export async function openFromDisk(session: AppSession): Promise<boolean> {
  const handle = await pickOpenFile();
  if (!handle) return false;
  await openLocalFile(session, await handle.getFile(), handle);
  return true;
}
