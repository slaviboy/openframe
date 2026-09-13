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

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';
import { LICENSE_HEADER, repoFiles, ROOT, SOURCE_EXTENSIONS, withoutPreamble } from './files';

describe('license headers', () => {
  test('every source file starts with the Apache-2.0 license header', () => {
    const files = repoFiles(SOURCE_EXTENSIONS);
    expect(files.length).toBeGreaterThan(100);
    const missing = files.filter((file) => !withoutPreamble(readFileSync(join(ROOT, file), 'utf8')).startsWith(LICENSE_HEADER));
    expect(missing).toEqual([]);
  });
});
