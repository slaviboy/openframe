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

import { existsSync } from 'node:fs';
import { expect, test } from './fixtures';

const BOARD = 'reference/app/sample-large.openframe';
import { rowAt } from './pixel';

/**
 * Shaped text is kept between frames so that panning and zooming don't reshape it. What it was painted
 * with is part of what is kept, so this checks the canvas really does follow the text's colour, its
 * characters and its size — the ways a kept block could go stale.
 */
test('text on the canvas follows its color, its characters and its size', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('canvas')).toHaveAttribute('data-ready', 'true');
  const box = (await page.getByTestId('canvas').boundingBox())!;
  const at = (x: number, y: number) => [box.x + x, box.y + y] as const;
  /** The most-inked pixel in a patch of the canvas, with the pointer parked well away. */
  const inkiest = async (x: number, y: number, w: number, h: number) => {
    await page.mouse.move(...at(760, 620));
    let best = { r: 255, g: 255, b: 255 };
    for (let dy = 0; dy < h; dy += 2) {
      for (const p of await rowAt(page, box.x + x, box.y + y + dy, w)) {
        if (p.r + p.g + p.b < best.r + best.g + best.b) best = p;
      }
    }
    return best;
  };
  /** The patch the word "Hello" is drawn in. */
  const ink = () => inkiest(395, 288, 60, 20);

  await page.keyboard.press('t');
  await page.mouse.click(...at(400, 300));
  await expect(page.getByTestId('text-input')).toBeFocused();
  await page.keyboard.type('Hello');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('treeitem', { name: /Hello/ })).toBeVisible();

  // Black to start with.
  expect((await ink()).r).toBeLessThan(100);

  // Red: the canvas repaints, even though nothing moved.
  const hex = page.getByRole('textbox', { name: 'Fill 1 hex' });
  await hex.fill('FF0000');
  await hex.press('Enter');
  await expect(hex).toHaveValue('FF0000');
  await expect
    .poll(async () => {
      const p = await ink();
      return p.r > 150 && p.g < 120 && p.b < 120;
    })
    .toBe(true);

  // Undo puts the black back.
  await page.keyboard.press('ControlOrMeta+Z');
  await expect.poll(async () => (await ink()).r).toBeLessThan(100);

  // Editing the characters redraws them: a much longer string reaches further right.
  expect((await inkiest(480, 288, 60, 20)).r).toBeGreaterThan(200);
  await page.keyboard.press('Enter');
  await page.keyboard.type('Hello to a much longer line of text');
  await page.keyboard.press('Escape');
  await expect.poll(async () => (await inkiest(480, 288, 60, 20)).r).toBeLessThan(200);
});

test('panning and zooming a text-heavy page keeps up', async ({ page }) => {
  // Builds its layers by hand and then reads blocked time, so it is slow before it is fast: the default
  // budget is not enough on Firefox when the rest of the suite is competing for the machine.
  test.setTimeout(120_000);
  await page.goto('/');
  await expect(page.getByTestId('canvas')).toHaveAttribute('data-ready', 'true', { timeout: 30_000 });
  const box = (await page.getByTestId('canvas').boundingBox())!;

  // Twelve text layers, which used to be reshaped from scratch on every frame that drew them.
  for (let i = 0; i < 10; i++) {
    await page.keyboard.press('t');
    await page.mouse.click(box.x + 300 + (i % 5) * 130, box.y + 220 + Math.floor(i / 5) * 110);
    await expect(page.getByTestId('text-input')).toBeFocused();
    await page.keyboard.type(`Layer ${i}\nwith a few lines\nof text on it\nto shape`);
    await page.keyboard.press('Escape');
  }
  await page.keyboard.press('Escape');

  // Long tasks while panning: shaping once a frame showed up here as hundreds of milliseconds.
  await page.evaluate(() => {
    const w = window as unknown as { __long: number[] };
    w.__long = [];
    new PerformanceObserver((list) => {
      for (const e of list.getEntries()) w.__long.push(e.duration);
    }).observe({ entryTypes: ['longtask'] });
  });
  await page.mouse.move(box.x + 400, box.y + 300);
  for (let i = 0; i < 30; i++) await page.mouse.wheel(0, 30);
  await page.waitForTimeout(600);
  const blocked = await page.evaluate(() => {
    const w = window as unknown as { __long: number[] };
    return Math.round(w.__long.reduce((s, d) => s + d, 0));
  });
  // Shaping once a frame blocked for about 200 ms over this pan; keeping the shaped text blocks for none.
  expect(blocked).toBeLessThan(100);
});

test('a page of more text layers than the shaper holds keeps up zoomed out', async ({ page }) => {
  // The board is gitignored, so a working copy without it says so rather than failing.
  test.skip(!existsSync(BOARD), `${BOARD} is gitignored and not in this working copy`);
  // A 2.2 MB board to open and 421 text layers to lay out, which Firefox does not do in the default budget.
  test.setTimeout(120_000);
  await page.goto('/');
  await expect(page.getByTestId('canvas')).toHaveAttribute('data-ready', 'true', { timeout: 30_000 });

  // 421 text layers on one board: more than the laid-out blocks the shaper holds when nothing is drawing them.
  await page.setInputFiles('input[aria-label="Open an Openframe file"]', BOARD);
  await expect(page.getByTestId('canvas')).toHaveAttribute('data-ready', 'true', { timeout: 30_000 });
  await expect(page.getByRole('treeitem', { name: /Sample Page/ })).toBeVisible({ timeout: 30_000 });
  const box = (await page.getByTestId('canvas').boundingBox())!;

  // Zoom to fit puts every one of them on screen, which is where each frame used to shape all of them again.
  await page.keyboard.press('Shift+1');
  await page.waitForTimeout(600);
  await page.evaluate(() => {
    const w = window as unknown as { __long: number[] };
    w.__long = [];
    new PerformanceObserver((list) => {
      for (const e of list.getEntries()) w.__long.push(e.duration);
    }).observe({ entryTypes: ['longtask'] });
  });
  await page.mouse.move(box.x + 700, box.y + 400);
  for (let i = 0; i < 20; i++) await page.mouse.wheel(0, 20);
  await page.waitForTimeout(800);
  const blocked = await page.evaluate(() => {
    const w = window as unknown as { __long: number[] };
    return Math.round(w.__long.reduce((s, d) => s + d, 0));
  });
  console.info(`perf(browser, 421 text layers, pan at fit): main thread blocked ${blocked}ms`);
  // Shaping every layer every frame blocked this pan for tens of seconds; drawing the kept blocks blocks for
  // a fraction of it. The budget is loose because this counts blocked time, which stretches when the rest of
  // the suite is competing for the machine.
  expect(blocked).toBeLessThan(3000);
});
