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
import { createEmptyDocument, keyOnTop, makeFrame, makeRectangle, solid } from '../document/factory';
import { IdGenerator } from '../ids/ids';
import { SceneIndex } from '../scene/scene-index';
import type { Node } from '../schema/document';
import { contrastRatio, rgbToHsl } from './color';
import { backgroundColorBehind, formatContrastRatio, nearestCompliantColor, requiredContrast, resolveContrastCategory } from './contrast';

const WHITE = { r: 1, g: 1, b: 1, a: 1 };
const GRAY = { r: 217 / 255, g: 217 / 255, b: 217 / 255, a: 1 };

describe('contrast checker', () => {
  test('WCAG thresholds per category; AAA only for text; Auto means graphics for non-text layers', () => {
    expect(requiredContrast('NORMAL_TEXT', 'AA')).toBe(4.5);
    expect(requiredContrast('NORMAL_TEXT', 'AAA')).toBe(7);
    expect(requiredContrast('LARGE_TEXT', 'AA')).toBe(3);
    expect(requiredContrast('LARGE_TEXT', 'AAA')).toBe(4.5);
    expect(requiredContrast('GRAPHICS', 'AA')).toBe(3);
    expect(requiredContrast('GRAPHICS', 'AAA')).toBeNull();
    expect(resolveContrastCategory('AUTO')).toBe('GRAPHICS');
    expect(formatContrastRatio(4.4999)).toBe('4.49:1');
    expect(formatContrastRatio(21)).toBe('21.00:1');
  });

  test('the nearest compliant color reaches the target with the smallest lightness change and keeps the hue', () => {
    const blue = { r: 0.4, g: 0.6, b: 0.9, a: 0.5 };
    for (const target of [3, 4.5, 7]) {
      const fixed = nearestCompliantColor(blue, WHITE, target)!;
      expect(contrastRatio({ ...fixed, a: 1 }, WHITE)).toBeGreaterThanOrEqual(target);
      expect(Math.abs(rgbToHsl(fixed).h - rgbToHsl(blue).h)).toBeLessThan(2);
      expect(fixed.a).toBe(0.5);
    }
    // Against a mid gray, a light gray gets lighter (the shorter way) rather than darker.
    const mid = { r: 0.45, g: 0.45, b: 0.45, a: 1 };
    const light = nearestCompliantColor({ r: 0.6, g: 0.6, b: 0.6, a: 1 }, mid, 3)!;
    expect(light.r).toBeGreaterThan(0.6);
    expect(nearestCompliantColor(WHITE, { r: 0, g: 0, b: 0, a: 1 }, 7)).toEqual(WHITE);
    expect(nearestCompliantColor(GRAY, mid, 21)).toBeNull();
  });

  test('the background is composited from the page and the visible layers below the layer center', () => {
    const ids = new IdGenerator('t');
    const store = createEmptyDocument({ name: 'D', now: 'n', appVersion: 't', ids });
    const page = store.pages()[0]!;
    const add = (node: Node) => {
      store.applyOp({ kind: 'create', node });
      return node.id;
    };
    const frame = add({ ...makeFrame({ id: ids.next(), parent: { id: page, key: keyOnTop(store, page) }, name: 'F', x: 0, y: 0, width: 200, height: 200 }), fills: [solid({ r: 0, g: 0, b: 1, a: 1 })] } as Node);
    const half = add({ ...makeRectangle({ id: ids.next(), parent: { id: frame, key: keyOnTop(store, frame) }, name: 'Half', x: 0, y: 0, width: 100, height: 100 }), fills: [solid({ r: 1, g: 0, b: 0, a: 1 }, 0.5)] } as Node);
    add({ ...makeRectangle({ id: ids.next(), parent: { id: frame, key: keyOnTop(store, frame) }, name: 'Hidden', x: 0, y: 0, width: 100, height: 100 }), fills: [solid(WHITE)], visible: false } as Node);
    const target = add(makeRectangle({ id: ids.next(), parent: { id: frame, key: keyOnTop(store, frame) }, name: 'T', x: 40, y: 40, width: 20, height: 20 }));
    const outside = add(makeRectangle({ id: ids.next(), parent: { id: page, key: keyOnTop(store, page) }, name: 'O', x: 500, y: 500, width: 20, height: 20 }));
    const index = new SceneIndex(store);
    // Half-transparent red over the blue frame; the hidden white layer is ignored.
    expect(backgroundColorBehind(store, index, page, target)).toEqual({ r: 0.5, g: 0, b: 0.5, a: 1 });
    // The layer itself and layers above it don't count; away from everything the page color shows.
    expect(backgroundColorBehind(store, index, page, half)).toEqual({ r: 0, g: 0, b: 1, a: 1 });
    const pageNode = store.get(page)!;
    expect(backgroundColorBehind(store, index, page, outside)).toEqual({ ...(pageNode.type === 'PAGE' ? pageNode.backgroundColor : WHITE), a: 1 });
  });
});
