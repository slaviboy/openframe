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
import { presentParams, presentUrl } from './present';

describe('presentation view addresses', () => {
  test('hide-ui=1 opens presentation view with its UI hidden', () => {
    const url = presentUrl('http://localhost/app/?other=1#section', { fileId: 'f1', pageId: 'p:1', nodeId: 'n:2', hideUi: true });
    expect(new URL(url).searchParams.get('hide-ui')).toBe('1');
    expect(presentParams(new URL(url).search)).toEqual({ fileId: 'f1', pageId: 'p:1', nodeId: 'n:2', hideUi: true });
    expect(new URL(presentUrl('http://localhost/', { fileId: 'f1', pageId: 'p:1', nodeId: null })).searchParams.has('hide-ui')).toBe(false);
    expect(presentParams('?present=1&file=f1&page=p:1')).toEqual({ fileId: 'f1', pageId: 'p:1', nodeId: null, hideUi: false });
    expect(presentParams('?file=f1&page=p:1')).toBeNull();
  });
});
