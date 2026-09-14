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

import { zipSync } from 'fflate';

export interface ExportedFile {
  /** A relative path; slashes make folders. */
  readonly path: string;
  readonly bytes: Uint8Array;
}

/** A ZIP archive of files (stored without compression: exported images are compressed already). */
export function zipFiles(files: readonly ExportedFile[]): Uint8Array {
  return zipSync(Object.fromEntries(files.map((file) => [file.path, [file.bytes, { level: 0 }] as const])));
}

/** Saves bytes as a file through the browser's downloads. */
export function downloadBytes(name: string, bytes: Uint8Array, type: string): void {
  const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type }));
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
