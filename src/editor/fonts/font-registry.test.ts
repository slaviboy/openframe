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
import { FontRegistry, type UserFont } from './font-registry';

const font = (id: string, family = 'Test Sans', style = 'Regular'): UserFont => ({ id, family, style, bytes: new Uint8Array([1, 2, 3]), variable: false, source: 'upload' });

describe('font registry', () => {
  test('adds fonts once by content, persists them and notifies', async () => {
    const saved: string[] = [];
    const registry = new FontRegistry();
    registry.storage = { save: async (f) => void saved.push(f.id), loadAll: async () => [] };
    let notified = 0;
    registry.subscribe(() => notified++);
    expect((await registry.add([font('a'), font('a'), font('b', 'Test Sans', 'Bold')])).map((f) => f.id)).toEqual(['a', 'b']);
    expect(await registry.add([font('a')])).toEqual([]);
    expect(saved).toEqual(['a', 'b']);
    expect(notified).toBe(1);
    expect(registry.list().map((f) => f.style)).toEqual(['Regular', 'Bold']);
  });

  test('loads stored fonts at startup', async () => {
    const registry = new FontRegistry();
    await registry.load();
    registry.storage = { save: async () => undefined, loadAll: async () => [font('x', 'Stored')] };
    let notified = 0;
    registry.subscribe(() => notified++);
    await registry.load();
    await registry.load();
    expect(registry.list().map((f) => f.family)).toEqual(['Stored']);
    expect(notified).toBe(1);
  });
});
