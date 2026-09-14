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

import { downloadBytes } from '@/platform/download';
import { PACKAGE_EXTENSION, readPackage, writePackage } from '@/platform/package';
import { LAST_FILE_KEY, type AppSession } from './bootstrap';

/** Characters file names can't contain, replaced in saved file names. */
const UNSAFE_NAME = /[\\/:*?"<>|]/g;

/** Whether a file looks like an Openframe file (by its extension). */
export const isPackageFile = (file: File): boolean => file.name.toLowerCase().endsWith(PACKAGE_EXTENSION);

/** Save local copy: downloads the open file as an .openframe file, with the images it uses. */
export async function saveLocalCopy(session: AppSession): Promise<void> {
  const { editor, persistence } = session;
  await session.autosaver.flush();
  const bytes = await writePackage(editor.doc, async (hash) => {
    const asset = editor.images.get(hash);
    if (asset) return asset;
    const record = await persistence.getImage(hash);
    return record && { hash: record.hash, bytes: new Uint8Array(record.bytes), mime: record.mime, width: record.width, height: record.height };
  });
  const name = (editor.doc.meta.name.replace(UNSAFE_NAME, '_').trim() || 'Untitled') + PACKAGE_EXTENSION;
  downloadBytes(name, bytes, 'application/zip');
}

/**
 * Opens an .openframe file: its images are stored, the document becomes a new local file, and the app reloads into it
 * (the open file is saved first). Throws PackageError when the file can't be read.
 */
export async function openLocalFile(session: AppSession, file: File): Promise<void> {
  const { store, images } = await readPackage(new Uint8Array(await file.arrayBuffer()));
  const { persistence } = session;
  for (const image of images) await persistence.putImage({ hash: image.hash, bytes: image.bytes.slice().buffer, mime: image.mime, width: image.width, height: image.height });
  const now = new Date().toISOString();
  const id = session.editor.ids.next().replace(':', '-');
  await persistence.createFile(id, store, now);
  await session.autosaver.flush();
  await persistence.setSetting(LAST_FILE_KEY, id);
  window.location.reload();
}
