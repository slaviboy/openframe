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

import { unzipSync } from 'fflate';
import { describe, expect, test } from 'vitest';
import { zipFiles } from './download';

describe('zipFiles', () => {
  test('stores each file at its path, in folders', () => {
    const zip = zipFiles([
      { path: 'button/pill/default.png', bytes: new Uint8Array([1, 2, 3]) },
      { path: 'icon.jpg', bytes: new Uint8Array([4]) },
    ]);
    const files = unzipSync(zip);
    expect(Object.keys(files).sort()).toEqual(['button/pill/default.png', 'icon.jpg']);
    expect([...files['button/pill/default.png']!]).toEqual([1, 2, 3]);
  });
});
