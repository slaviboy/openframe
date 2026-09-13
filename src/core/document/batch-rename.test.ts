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

import { describe, expect, test } from 'vitest';
import { batchRename } from './batch-rename';

const names = ['Icon_003', 'Icon_010', 'Icon/Home'];

describe('batchRename', () => {
  test('same name for every layer', () => {
    expect(batchRename(names, { match: '', replace: 'Icon', start: 1 }).names).toEqual(['Icon', 'Icon', 'Icon']);
  });

  test('ascending and descending counters, plain and three-digit', () => {
    expect(batchRename(names, { match: '', replace: 'Icon_$n', start: 1 }).names).toEqual(['Icon_1', 'Icon_2', 'Icon_3']);
    expect(batchRename(names, { match: '', replace: '$NNN-x', start: 5 }).names).toEqual(['007-x', '006-x', '005-x']);
    expect(batchRename(names, { match: '', replace: '$nnn', start: 9 }).names).toEqual(['009', '010', '011']);
  });

  test('prefix with the current name', () => {
    expect(batchRename(['Home', 'Search'], { match: '', replace: 'Icon_$&', start: 1 }).names).toEqual(['Icon_Home', 'Icon_Search']);
  });

  test('match replaces part of a name, and regular expressions swap groups', () => {
    expect(batchRename(names, { match: 'Icon/', replace: 'Image/', start: 1 }).names[2]).toBe('Image/Home');
    expect(batchRename(names, { match: '([a-zA-Z]+)_(\\d+)', replace: '$2_$1', start: 1 }).names).toEqual(['003_Icon', '010_Icon', 'Icon/Home']);
    expect(batchRename(['a-a-a'], { match: 'a', replace: 'b', start: 1 }).names).toEqual(['b-b-b']);
  });

  test('invalid expressions report an error and leave names unchanged', () => {
    const result = batchRename(names, { match: '(', replace: 'x', start: 1 });
    expect(result.error).not.toBeNull();
    expect(result.names).toEqual(names);
  });
});
