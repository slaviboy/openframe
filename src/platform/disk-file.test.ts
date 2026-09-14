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

import { afterEach, describe, expect, test } from 'vitest';
import { canOpenFromDisk, canSaveToDisk, pickSaveFile, writeDiskFile, type DiskFileHandle } from './disk-file';

const globals = globalThis as Record<string, unknown>;

afterEach(() => {
  delete globals.showSaveFilePicker;
  delete globals.showOpenFilePicker;
});

function fakeHandle(permission: PermissionState, afterRequest: PermissionState = permission) {
  const written: Uint8Array[] = [];
  let requested = 0;
  const handle: DiskFileHandle = {
    kind: 'file',
    name: 'Doc.openframe',
    getFile: () => Promise.resolve(new File([], 'Doc.openframe')),
    createWritable: () => {
      const chunks: Uint8Array[] = [];
      return Promise.resolve({
        write: (data) => {
          chunks.push(data as Uint8Array);
          return Promise.resolve();
        },
        close: () => {
          written.push(...chunks);
          return Promise.resolve();
        },
      });
    },
    queryPermission: () => Promise.resolve(permission),
    requestPermission: () => {
      requested++;
      return Promise.resolve(afterRequest);
    },
  };
  return { handle, written, requests: () => requested };
}

describe('files on disk', () => {
  test('support follows the pickers the browser has', () => {
    expect([canSaveToDisk(), canOpenFromDisk()]).toEqual([false, false]);
    globals.showSaveFilePicker = () => undefined;
    expect([canSaveToDisk(), canOpenFromDisk()]).toEqual([true, false]);
  });

  test('writing replaces the file, asking for permission only when the browser needs it', async () => {
    const granted = fakeHandle('granted');
    expect(await writeDiskFile(granted.handle, new Uint8Array([1, 2]))).toBe(true);
    expect(granted.written).toEqual([new Uint8Array([1, 2])]);
    expect(granted.requests()).toBe(0);

    const prompt = fakeHandle('prompt', 'granted');
    expect(await writeDiskFile(prompt.handle, new Uint8Array([3]))).toBe(true);
    expect(prompt.requests()).toBe(1);

    const denied = fakeHandle('prompt', 'denied');
    expect(await writeDiskFile(denied.handle, new Uint8Array([4]))).toBe(false);
    expect(denied.written).toEqual([]);
  });

  test('a canceled picker gives null; other failures are errors', async () => {
    globals.showSaveFilePicker = () => Promise.reject(new DOMException('Canceled', 'AbortError'));
    expect(await pickSaveFile('Doc.openframe')).toBeNull();
    globals.showSaveFilePicker = () => Promise.reject(new DOMException('Blocked', 'SecurityError'));
    await expect(pickSaveFile('Doc.openframe')).rejects.toThrow('Blocked');
  });
});
