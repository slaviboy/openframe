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
import { checkpointDue } from './version-history';

describe('autosave checkpoints', () => {
  test('a checkpoint is due 30 minutes after the file was opened or after the latest version, whichever is later', () => {
    const opened = '2026-01-01T10:00:00.000Z';
    expect(checkpointDue(undefined, opened, '2026-01-01T10:29:59.000Z')).toBe(false);
    expect(checkpointDue(undefined, opened, '2026-01-01T10:30:00.000Z')).toBe(true);
    // A version from an earlier session doesn't make the first save of this one a checkpoint.
    expect(checkpointDue('2025-12-01T00:00:00.000Z', opened, '2026-01-01T10:05:00.000Z')).toBe(false);
    expect(checkpointDue('2026-01-01T10:20:00.000Z', opened, '2026-01-01T10:40:00.000Z')).toBe(false);
    expect(checkpointDue('2026-01-01T10:20:00.000Z', opened, '2026-01-01T10:50:00.000Z')).toBe(true);
  });
});
