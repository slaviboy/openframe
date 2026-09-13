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

import { describe, expect, test, vi } from 'vitest';
import { ImageRegistry, type ImageAsset } from './image-registry';

const asset = (hash: string): ImageAsset => ({ hash, bytes: new Uint8Array([1]), mime: 'image/png', width: 1, height: 1 });

describe('ImageRegistry', () => {
  test('add makes an asset available immediately, notifies once and persists it', async () => {
    const registry = new ImageRegistry();
    const save = vi.fn(async () => undefined);
    registry.storage = { save, load: async () => undefined };
    const listener = vi.fn();
    registry.subscribe(listener);
    await registry.add(asset('a'));
    await registry.add(asset('a'));
    expect(registry.get('a')?.width).toBe(1);
    expect(listener).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenCalledTimes(2);
  });

  test('request loads lazily once, and remembers hashes storage does not have', async () => {
    const registry = new ImageRegistry();
    const load = vi.fn(async (hash: string) => (hash === 'x' ? asset('x') : undefined));
    registry.storage = { save: async () => undefined, load };
    const listener = vi.fn();
    registry.subscribe(listener);
    registry.request('x');
    registry.request('x');
    registry.request('y');
    await registry.settled();
    expect(registry.get('x')).toBeDefined();
    expect(listener).toHaveBeenCalledTimes(1);
    expect(registry.isMissing('y')).toBe(true);
    registry.request('y');
    expect(load).toHaveBeenCalledTimes(2);
  });
});
