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
import { createEmptyDocument, keyOnTop, makeFrame, makeRectangle } from '../document/factory';
import type { DocumentStore } from '../document/store';
import { History } from '../history/history';
import { IdGenerator } from '../ids/ids';
import { SceneIndex } from '../scene/scene-index';
import type { PrototypeTransition, SceneNode } from '../schema/document';
import type { PlayerState } from './player';
import { composeScene, frameAtPoint, layerRects, maxScrollY, responsiveSize, screenScale, scrollOffsetOf, transitionOffsets } from './presentation';
import { matchedLayersStore, withoutMatchingLayersStore } from './smart-animate';

let store: DocumentStore;
let index: SceneIndex;
let page: string;
const push: PrototypeTransition = { type: 'PUSH', direction: 'LEFT', matchLayers: false, easing: { type: 'LINEAR' }, duration: 300 };
const state = (patch: Partial<PlayerState> = {}): PlayerState => ({ pageId: page, frameId: 'home', history: [], overlays: [], temporary: null, ...patch });

beforeEach(() => {
  const ids = new IdGenerator('p');
  store = createEmptyDocument({ name: 'D', now: 'n', appVersion: 't', ids });
  page = store.pages()[0]!;
  const history = new History({ store, captureMeta: () => null, restoreMeta: () => undefined });
  const shape = (id: string, parent: string, x: number, y: number, width: number, height: number) => ({ id, parent: { id: parent, key: keyOnTop(store, parent) }, name: id, x, y, width, height });
  history.run('Build', (tx) => {
    tx.create(makeFrame(shape('home', page, 100, 100, 400, 300)));
    tx.create(makeRectangle(shape('button', 'home', 20, 40, 100, 50)));
    tx.create(makeFrame(shape('about', page, 600, 100, 400, 300)));
    // A layer matching the button in home (the same name in the same place).
    tx.create({ ...makeRectangle(shape('about-button', 'about', 220, 40, 100, 50)), name: 'button' });
    tx.create(makeRectangle(shape('about-text', 'about', 20, 200, 100, 20)));
    tx.create({ ...makeFrame(shape('menu', page, 0, 600, 200, 100)), overlay: { position: 'BOTTOM_CENTER', closeOnClickOutside: true, background: { r: 0, g: 0, b: 0, a: 0.5 } } });
    tx.create(makeFrame(shape('long', page, 0, 900, 400, 2000)));
  });
  index = new SceneIndex(store);
  index.ensure(page);
});

describe('presentation layout', () => {
  test('scaling modes', () => {
    const frame = { width: 400, height: 300 };
    expect(screenScale('ACTUAL', { width: 200, height: 100 }, frame)).toBe(1);
    expect(screenScale('FIT_WIDTH', { width: 800, height: 100 }, frame)).toBe(2);
    // Fit width and height shrinks but never enlarges; Fill screen does both.
    expect(screenScale('FIT', { width: 800, height: 600 }, frame)).toBe(1);
    expect(screenScale('FIT', { width: 200, height: 600 }, frame)).toBe(0.5);
    expect(screenScale('FILL', { width: 800, height: 900 }, frame)).toBe(2);
    expect(maxScrollY('ACTUAL', { width: 800, height: 600 }, { width: 400, height: 2000 })).toBe(1400);
    expect(maxScrollY('FIT', { width: 800, height: 600 }, frame)).toBe(0);
    // Responsive draws the screen unscaled, its frame laid out at the window's width (and height, unless it's taller).
    expect(screenScale('RESPONSIVE', { width: 800, height: 100 }, frame)).toBe(1);
    expect(responsiveSize({ width: 800, height: 600 }, frame)).toEqual({ width: 800, height: 600 });
    expect(responsiveSize({ width: 800.4, height: 600 }, { width: 400, height: 2000 })).toEqual({ width: 800, height: 2000 });
  });

  test('transitions move and fade the frames in the direction of travel', () => {
    const size = { width: 400, height: 300 };
    expect(transitionOffsets(push, 0.25, size)).toEqual({ from: { dx: -100, dy: 0, alpha: 1 }, to: { dx: 300, dy: 0, alpha: 1 }, toOnTop: true });
    expect(transitionOffsets({ ...push, type: 'MOVE_OUT', direction: 'BOTTOM' }, 0.5, size)).toEqual({ from: { dx: 0, dy: 150, alpha: 1 }, to: { dx: 0, dy: 0, alpha: 1 }, toOnTop: false });
    expect(transitionOffsets({ type: 'DISSOLVE', easing: { type: 'LINEAR' }, duration: 1 }, 1.2, size).to.alpha).toBe(1);
    const slide = transitionOffsets({ ...push, type: 'SLIDE_IN', direction: 'RIGHT' }, 0.5, size);
    expect(slide.to).toEqual({ dx: -200, dy: 0, alpha: 0.5 });
    expect(slide.from.dx).toBeCloseTo(60);
    expect(transitionOffsets({ type: 'INSTANT' }, 0, size).from.alpha).toBe(0);
  });

  test('the screen centers in the window; overlays sit at their positions over it with their backgrounds', () => {
    const scene = composeScene(store, state({ overlays: ['menu'] }), { width: 800, height: 600 }, 'FIT', 0, null);
    expect(scene.screen).toEqual({ x: 200, y: 150, width: 400, height: 300, scale: 1 });
    expect(scene.items).toEqual([
      { kind: 'frame', frameId: 'home', x: 200, y: 150, width: 400, height: 300, scale: 1, alpha: 1 },
      { kind: 'dim', x: 200, y: 150, width: 400, height: 300, color: { r: 0, g: 0, b: 0, a: 0.5 } },
      { kind: 'frame', frameId: 'menu', x: 300, y: 350, width: 200, height: 100, scale: 1, alpha: 1 },
    ]);
    // Points map to the topmost frame, in its coordinates.
    expect(frameAtPoint(scene, state({ overlays: ['menu'] }), { x: 310, y: 360 })).toEqual({ frameId: 'menu', local: { x: 10, y: 10 } });
    expect(frameAtPoint(scene, state({ overlays: ['menu'] }), { x: 220, y: 200 })).toEqual({ frameId: 'home', local: { x: 20, y: 50 } });
    expect(frameAtPoint(scene, state(), { x: 10, y: 10 })).toBeNull();
    expect(layerRects(index, scene, 'home', ['button'])).toEqual([{ x: 220, y: 190, width: 100, height: 50 }]);
  });

  test('a playing transition draws both screens; a tall screen scrolls', () => {
    const effect = { type: 'transition', from: 'home', to: 'about', overlay: false, transition: push } as const;
    const scene = composeScene(store, state({ frameId: 'about' }), { width: 800, height: 600 }, 'FIT', 0, { effect, progress: 0.5 });
    expect(scene.items.map((item) => (item.kind === 'frame' ? [item.frameId, item.x] : item.kind))).toEqual([
      ['home', 0],
      ['about', 400],
    ]);
    const tall = composeScene(store, state({ frameId: 'long' }), { width: 800, height: 600 }, 'ACTUAL', 500, null);
    expect(tall.screen).toMatchObject({ y: -500, height: 2000 });
    expect(scrollOffsetOf(index, 'home', 'button')).toBe(40);
  });

  test('in a device, the screen fills the device screen and everything is clipped to it', () => {
    const black = { r: 0, g: 0, b: 0, a: 1 };
    const grey = { r: 0.5, g: 0.5, b: 0.5, a: 1 };
    const device = { name: 'Phone', body: { x: 90, y: 40, width: 220, height: 420 }, bodyRadius: 30, screen: { x: 100, y: 50, width: 200, height: 400 }, screenRadius: 20, bodyColor: black, edgeColor: grey, frame: true };
    const scene = composeScene(store, state(), { width: 400, height: 500 }, 'ACTUAL', 0, null, device);
    // Home is 400 × 300: at the device's 200 width it scales to 0.5 (200 × 150), centered in the 400-tall screen.
    expect(scene.screen).toEqual({ x: 100, y: 175, width: 200, height: 150, scale: 0.5 });
    expect(scene.items[0]).toEqual({ kind: 'device', body: device.body, bodyRadius: 30, screen: device.screen, screenRadius: 20, bodyColor: black, edgeColor: grey, frame: true });
    expect(scene.items[1]).toMatchObject({ kind: 'frame', frameId: 'home', x: 100, y: 175, scale: 0.5 });
    expect(scene.clip).toEqual({ rect: device.screen, radius: 20 });
    expect(frameAtPoint(scene, state(), { x: 110, y: 185 })).toEqual({ frameId: 'home', local: { x: 20, y: 20 } });
  });

  test('smart animate draws the destination blended from the frame left, in place of both frames', () => {
    const effect = { type: 'transition', from: 'home', to: 'about', overlay: false, transition: { type: 'SMART_ANIMATE', easing: { type: 'LINEAR' }, duration: 300 } } as const;
    const scene = composeScene(store, state({ frameId: 'about' }), { width: 800, height: 600 }, 'FIT', 0, { effect, progress: 0.5 });
    expect(scene.items).toEqual([{ kind: 'frame', frameId: 'about', x: 200, y: 150, width: 400, height: 300, scale: 1, alpha: 1, smart: { from: 'home', progress: 0.5 } }]);
  });

  test('Animate matching layers: the frames move without their matching layers, which smart animate still above them', () => {
    const effect = { type: 'transition', from: 'home', to: 'about', overlay: false, transition: { ...push, matchLayers: true } } as const;
    const scene = composeScene(store, state({ frameId: 'about' }), { width: 800, height: 600 }, 'FIT', 0, { effect, progress: 0.5 });
    expect(scene.items).toEqual([
      { kind: 'frame', frameId: 'home', x: 0, y: 150, width: 400, height: 300, scale: 1, alpha: 1, without: 'about' },
      { kind: 'frame', frameId: 'about', x: 400, y: 150, width: 400, height: 300, scale: 1, alpha: 1, without: 'home' },
      { kind: 'frame', frameId: 'about', x: 200, y: 150, width: 400, height: 300, scale: 1, alpha: 1, matched: { from: 'home', progress: 0.5 } },
    ]);
    // The moving frames leave out the matching button; the still layer holds only it, halfway there, on a frame without fill.
    expect(withoutMatchingLayersStore(store, 'home', 'about').has('button')).toBe(false);
    expect(withoutMatchingLayersStore(store, 'about', 'home').has('about-text')).toBe(true);
    const matched = matchedLayersStore(store, 'home', 'about', 0.5);
    expect(matched.has('about-text')).toBe(false);
    expect((matched.getOrThrow('about-button') as SceneNode).transform[4]).toBe(120);
    expect((matched.getOrThrow('about') as SceneNode & { fills: unknown[] }).fills).toEqual([]);
  });
});
