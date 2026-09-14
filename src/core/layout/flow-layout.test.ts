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
import { layoutFlow, type FlowContainer, type FlowItem } from './flow-layout';

const container = (patch: Partial<FlowContainer> = {}): FlowContainer => ({
  direction: 'HORIZONTAL',
  wrap: false,
  padding: { top: 0, right: 0, bottom: 0, left: 0 },
  gap: 0,
  counterGap: 0,
  primaryAlign: 'MIN',
  counterAlign: 'MIN',
  width: 100,
  height: 100,
  horizontalSizing: 'FIXED',
  verticalSizing: 'FIXED',
  ...patch,
});
const item = (width: number, height: number, patch: Partial<FlowItem> = {}): FlowItem => ({ width, height, horizontalSizing: 'FIXED', verticalSizing: 'FIXED', ...patch });
const xs = (r: ReturnType<typeof layoutFlow>) => r.items.map((b) => b.x);

describe('flow layout', () => {
  test('hug contents: a 40 px label with 10 px side padding makes a 60 px button', () => {
    const button = container({ padding: { top: 5, right: 10, bottom: 5, left: 10 }, horizontalSizing: 'HUG', verticalSizing: 'HUG' });
    expect(layoutFlow(button, [item(40, 20)])).toEqual({ width: 60, height: 30, items: [{ x: 10, y: 5, width: 40, height: 20 }] });
    expect(layoutFlow(button, [item(50, 20)]).width).toBe(70);
    // Never smaller than the padding.
    expect(layoutFlow(button, [])).toMatchObject({ width: 20, height: 10 });
  });

  test('fixed gap packs items to the start, center or end, including negative gaps', () => {
    const items = [item(20, 10), item(20, 10)];
    expect(xs(layoutFlow(container({ gap: 10 }), items))).toEqual([0, 30]);
    expect(xs(layoutFlow(container({ gap: 10, primaryAlign: 'CENTER' }), items))).toEqual([25, 55]);
    expect(xs(layoutFlow(container({ gap: 10, primaryAlign: 'MAX' }), items))).toEqual([50, 80]);
    expect(xs(layoutFlow(container({ gap: -5 }), items))).toEqual([0, 15]);
  });

  test('Auto gap: between, around and evenly, never below zero', () => {
    const items = [item(20, 10), item(20, 10)];
    expect(xs(layoutFlow(container({ primaryAlign: 'SPACE_BETWEEN' }), items))).toEqual([0, 80]);
    expect(xs(layoutFlow(container({ primaryAlign: 'SPACE_AROUND' }), items))).toEqual([15, 65]);
    expect(xs(layoutFlow(container({ primaryAlign: 'SPACE_EVENLY' }), items))).toEqual([20, 60]);
    expect(xs(layoutFlow(container({ primaryAlign: 'SPACE_BETWEEN' }), [item(20, 10)]))).toEqual([0]);
    expect(xs(layoutFlow(container({ primaryAlign: 'SPACE_BETWEEN', width: 30 }), items))).toEqual([0, 20]);
  });

  test('counter axis alignment and vertical flows', () => {
    const r = layoutFlow(container({ direction: 'VERTICAL', gap: 5, counterAlign: 'CENTER', padding: { top: 10, right: 0, bottom: 0, left: 0 } }), [item(20, 10), item(40, 10)]);
    expect(r.items).toEqual([
      { x: 40, y: 10, width: 20, height: 10 },
      { x: 30, y: 25, width: 40, height: 10 },
    ]);
    expect(layoutFlow(container({ counterAlign: 'MAX' }), [item(10, 30)]).items[0]!.y).toBe(70);
  });

  test('fill container shares the free space, respecting min and max, and stretches across', () => {
    const r = layoutFlow(container({ gap: 10, padding: { top: 5, right: 5, bottom: 5, left: 5 } }), [
      item(20, 10),
      item(0, 10, { horizontalSizing: 'FILL', verticalSizing: 'FILL' }),
      item(0, 10, { horizontalSizing: 'FILL', maxWidth: 10 }),
    ]);
    // 90 inner − 20 − 2 × 10 gaps = 50; the second fill stops at 10, the first gets 40.
    expect(r.items.map((b) => b.width)).toEqual([20, 40, 10]);
    expect(xs(r)).toEqual([5, 35, 85]);
    expect(r.items[1]!.height).toBe(90);
    // In a hugging container fill items keep their size.
    const hug = layoutFlow(container({ horizontalSizing: 'HUG' }), [item(30, 10, { horizontalSizing: 'FILL' })]);
    expect(hug.width).toBe(30);
  });

  test('fill items share space by content area (border-box)', () => {
    const r = layoutFlow(container(), [item(0, 10, { horizontalSizing: 'FILL', mainInset: 20 }), item(0, 10, { horizontalSizing: 'FILL' })]);
    // 100 − 20 of padding = 80 of content, 40 each: the padded item is 60 wide.
    expect(r.items.map((b) => b.width)).toEqual([60, 40]);
  });

  test('min and max limits apply to hugging containers', () => {
    const hug = container({ horizontalSizing: 'HUG', minWidth: 80, maxHeight: 15, verticalSizing: 'HUG' });
    expect(layoutFlow(hug, [item(20, 30)])).toMatchObject({ width: 80, height: 15 });
  });

  test('wrap moves overflowing items to the next line, separated by the counter gap', () => {
    const r = layoutFlow(container({ wrap: true, gap: 10, counterGap: 5, verticalSizing: 'HUG' }), [item(40, 10), item(40, 20), item(40, 10)]);
    expect(r.items.map((b) => [b.x, b.y])).toEqual([
      [0, 0],
      [50, 0],
      [0, 25],
    ]);
    expect(r.height).toBe(35);
  });

  test('baseline alignment lines up text baselines; other items sit on their bottom edge', () => {
    const r = layoutFlow(container({ counterAlign: 'BASELINE', verticalSizing: 'HUG' }), [item(20, 20, { baseline: 15 }), item(20, 40, { baseline: 30 }), item(20, 10)]);
    expect(r.items.map((b) => b.y)).toEqual([15, 0, 20]);
    expect(r.height).toBe(40);
    // Vertical flows align to the start.
    expect(layoutFlow(container({ direction: 'VERTICAL', counterAlign: 'BASELINE' }), [item(20, 20, { baseline: 15 })]).items[0]!.x).toBe(0);
  });
});
