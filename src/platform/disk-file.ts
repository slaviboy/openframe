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

import { PACKAGE_EXTENSION } from './package';

/** A file on disk the app can read and write again (File System Access API). */
export interface DiskFileHandle {
  readonly kind: 'file';
  readonly name: string;
  getFile(): Promise<File>;
  createWritable(): Promise<{ write(data: Uint8Array | Blob): Promise<void>; close(): Promise<void> }>;
  queryPermission?(descriptor: { mode: 'readwrite' }): Promise<PermissionState>;
  requestPermission?(descriptor: { mode: 'readwrite' }): Promise<PermissionState>;
}

interface FilePickerOptions {
  readonly suggestedName?: string;
  readonly types: readonly { readonly description: string; readonly accept: Readonly<Record<string, readonly string[]>> }[];
  readonly excludeAcceptAllOption?: boolean;
  readonly multiple?: boolean;
}

/** The File System Access API's pickers (Chromium-based browsers). */
interface PickerHost {
  showSaveFilePicker?(options: FilePickerOptions): Promise<DiskFileHandle>;
  showOpenFilePicker?(options: FilePickerOptions): Promise<DiskFileHandle[]>;
}

const PACKAGE_TYPES: FilePickerOptions['types'] = [{ description: 'Openframe file', accept: { 'application/zip': [PACKAGE_EXTENSION] } }];

const host = (): PickerHost => globalThis as unknown as PickerHost;

/** Whether the browser can save to a chosen file on disk and write it again later. */
export const canSaveToDisk = (): boolean => typeof host().showSaveFilePicker === 'function';

/** Whether the browser can open a file on disk so it can be saved back. */
export const canOpenFromDisk = (): boolean => typeof host().showOpenFilePicker === 'function';

const isAbort = (error: unknown) => error instanceof DOMException && error.name === 'AbortError';

/** Asks where to save an Openframe file; null when the picker is canceled. */
export async function pickSaveFile(suggestedName: string): Promise<DiskFileHandle | null> {
  try {
    return await host().showSaveFilePicker!({ suggestedName, types: PACKAGE_TYPES });
  } catch (error) {
    if (isAbort(error)) return null;
    throw error;
  }
}

/** Asks for an Openframe file to open; null when the picker is canceled. */
export async function pickOpenFile(): Promise<DiskFileHandle | null> {
  try {
    const [handle] = await host().showOpenFilePicker!({ types: PACKAGE_TYPES, excludeAcceptAllOption: true, multiple: false });
    return handle ?? null;
  } catch (error) {
    if (isAbort(error)) return null;
    throw error;
  }
}

/** Whether the app may write the file, asking the user when the browser needs to (after a reload, say). */
export async function ensureWritePermission(handle: DiskFileHandle): Promise<boolean> {
  const descriptor = { mode: 'readwrite' } as const;
  if (!handle.queryPermission) return true;
  if ((await handle.queryPermission(descriptor)) === 'granted') return true;
  return (await handle.requestPermission?.(descriptor)) === 'granted';
}

/** Replaces the file's contents; false when writing isn't permitted. */
export async function writeDiskFile(handle: DiskFileHandle, bytes: Uint8Array): Promise<boolean> {
  if (!(await ensureWritePermission(handle))) return false;
  const writable = await handle.createWritable();
  await writable.write(bytes);
  await writable.close();
  return true;
}
