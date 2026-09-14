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

import { beforeEach, describe, expect, test } from 'vitest';
import { createEmptyDocument, keyOnTop, makeFrame } from '../document/factory';
import { presetById } from '../document/frame-presets';
import type { DocumentStore } from '../document/store';
import { History } from '../history/history';
import { IdGenerator } from '../ids/ids';
import { DEVICE_MODELS, deviceBodyColors, deviceLayout, deviceOuterSize, deviceScreenSize, effectiveDevice } from './device';

let store: DocumentStore;
let page: string;
let history: History<null>;

beforeEach(() => {
  const ids = new IdGenerator('d');
  store = createEmptyDocument({ name: 'D', now: 'n', appVersion: 't', ids });
  page = store.pages()[0]!;
  history = new History({ store, captureMeta: () => null, restoreMeta: () => undefined });
});

const addFrame = (id: string, width: number, height: number) =>
  history.run('Frame', (tx) => tx.create(makeFrame({ id, parent: { id: page, key: keyOnTop(tx.store, page) }, name: id, x: 0, y: 0, width, height })));

describe('prototype device', () => {
  test('without a setting, a first screen with a device preset size picks that device', () => {
    expect(effectiveDevice(store, page)).toEqual({ kind: 'NONE', explicit: false });
    addFrame('phone', 852, 393);
    const device = effectiveDevice(store, page);
    expect(device).toMatchObject({ kind: 'PRESET', preset: { name: 'iPhone 16' }, landscape: true, explicit: false });
    expect(deviceScreenSize(device as Extract<typeof device, { kind: 'PRESET' }>)).toEqual({ width: 852, height: 393 });
  });

  test('the page setting wins: a preset and rotation, a custom size, or the presentation', () => {
    addFrame('phone', 393, 852);
    history.run('Device', (tx) => tx.set(page, 'prototypeDevice', { type: 'PRESET', presetId: 'tablet-ipad-pro-11-', rotation: 'CCW_90' }));
    expect(effectiveDevice(store, page)).toMatchObject({ kind: 'PRESET', preset: { name: 'iPad Pro 11"' }, landscape: true, explicit: true });
    history.run('Device', (tx) => tx.set(page, 'prototypeDevice', { type: 'CUSTOM', rotation: 'NONE' }));
    expect(effectiveDevice(store, page)).toEqual({ kind: 'CUSTOM', explicit: true });
    history.run('Device', (tx) => tx.set(page, 'prototypeDevice', { type: 'PRESET', presetId: 'gone', rotation: 'NONE' }));
    expect(effectiveDevice(store, page)).toEqual({ kind: 'NONE', explicit: true });
  });

  test('the device fits in the window with its screen inside the bezel', () => {
    const device = { kind: 'PRESET', preset: presetById('phone-iphone-16')!, landscape: false, model: 'BLACK', explicit: true } as const;
    const layout = deviceLayout(device, { width: 1000, height: 1000 }, 50);
    expect(layout.body.height).toBeCloseTo(900);
    expect(layout.body.x).toBeCloseTo((1000 - layout.body.width) / 2);
    expect(layout.screen.x).toBeGreaterThan(layout.body.x);
    expect(layout.screen.width / layout.screen.height).toBeCloseTo(393 / 852);
    expect(layout.bodyRadius).toBeGreaterThan(layout.screenRadius);
  });
});

describe('a device at 100%', () => {
  test('its size is the screen with the same bezel on every side, and a window that size plus the margins shows it unscaled', () => {
    addFrame('phone', 852, 393);
    const device = effectiveDevice(store, page) as Extract<ReturnType<typeof effectiveDevice>, { kind: 'PRESET' }>;
    const outer = deviceOuterSize(device);
    expect(outer.width).toBeGreaterThan(852);
    expect(outer.width - 852).toBeCloseTo(outer.height - 393, 9);
    const layout = deviceLayout(device, { width: outer.width + 48, height: outer.height + 48 });
    expect(layout.screen.width).toBeCloseTo(852, 9);
    expect(layout.screen.height).toBeCloseTo(393, 9);
  });
});

describe('device models', () => {
  test('a preset device has a model, black unless the page setting names another, and each model colors the body', () => {
    addFrame('phone', 393, 852);
    expect(effectiveDevice(store, page)).toMatchObject({ kind: 'PRESET', model: 'BLACK' });
    history.run('Device', (tx) => tx.set(page, 'prototypeDevice', { type: 'PRESET', presetId: 'phone-iphone-16-pro', rotation: 'NONE', model: 'GOLD' }));
    expect(effectiveDevice(store, page)).toMatchObject({ kind: 'PRESET', preset: { name: 'iPhone 16 Pro' }, model: 'GOLD' });
    const bodies = new Set(DEVICE_MODELS.map((model) => JSON.stringify(deviceBodyColors(model).body)));
    expect(bodies.size).toBe(DEVICE_MODELS.length);
  });
});
