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
import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';

/** The board the zoom sweep uses, which is gitignored. */
const BOARD = 'reference/app/sample-large.openframe';

/** How many times the selection is doubled: 2^13 layers, a little over eight thousand. */
const DOUBLINGS = 13;
/** Frame times are read while the canvas is panned this many wheel steps. */
const WHEEL_STEPS = 40;

/** How far the zoom sweep goes in wheel notches, in and back out again. */
const ZOOM_STEPS = 45;

/** The gaps between animation frames while the page is moved, in milliseconds. */
async function frameTimes(page: Page, pan: () => Promise<void>): Promise<number[]> {
  await page.evaluate(() => {
    const w = window as unknown as { __frames?: number[] };
    w.__frames = [];
    let last = performance.now();
    const tick = () => {
      const now = performance.now();
      w.__frames!.push(now - last);
      last = now;
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
  await pan();
  // The first few are the sampler starting up rather than the canvas drawing.
  return (await page.evaluate(() => (window as unknown as { __frames: number[] }).__frames)).slice(5);
}

test('a document of eight thousand layers is built, drawn and panned at frame rate @chromium-only', async ({ page }) => {
  test.setTimeout(180_000);
  await page.goto('/');
  await expect(page.getByTestId('canvas')).toHaveAttribute('data-ready', 'true');
  const box = (await page.getByTestId('canvas').boundingBox())!;

  await page.keyboard.press('r');
  await page.mouse.move(box.x + 400, box.y + 300);
  await page.mouse.down();
  await page.mouse.move(box.x + 420, box.y + 320, { steps: 3 });
  await page.mouse.up();

  // Each duplication doubles what is on the page, so thirteen of them make 8,192 layers.
  const built = Date.now();
  for (let i = 0; i < DOUBLINGS; i++) {
    await page.keyboard.press('ControlOrMeta+a');
    await page.keyboard.press('ControlOrMeta+d');
  }
  const buildMs = Date.now() - built;

  // A duplication leaves the copies selected, so the whole page is picked again to count it.
  await page.keyboard.press('ControlOrMeta+a');
  await expect(page.getByTestId('inspector')).toContainText(`${2 ** DOUBLINGS} layers`);
  // Everything at once, which is the worst the canvas is ever asked to draw.
  await page.keyboard.press('Shift+1');
  await page.mouse.click(box.x + 1200, box.y + 700);

  const times = await frameTimes(page, async () => {
    await page.mouse.move(box.x + 700, box.y + 400);
    for (let i = 0; i < WHEEL_STEPS; i++) {
      await page.mouse.wheel(30, 20);
      await page.waitForTimeout(16);
    }
  });
  const sorted = [...times].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)]!;
  const p95 = sorted[Math.floor(sorted.length * 0.95)]!;
  console.info(`perf(browser, ${2 ** DOUBLINGS} layers): build ${buildMs}ms | frame median ${median.toFixed(1)}ms, p95 ${p95.toFixed(1)}ms over ${times.length} frames`);

  // Budgets are loose on purpose, as the Node ones are: this guards against a collapse, not against a slow machine.
  expect(times.length).toBeGreaterThan(30);
  expect(median).toBeLessThan(34);
  expect(p95).toBeLessThan(120);
  expect(buildMs).toBeLessThan(60_000);
});

/**
 * Zooming a real board of text and images. Text below three device pixels to the em is drawn as bars
 * rather than shaped, so a zoom sweep crosses that threshold — once per font size the board uses, and
 * this one uses nine. Crossing it is where a frame used to have to shape every text layer at once.
 *
 * The board is `reference/app/sample-large.openframe`: 725 layers, of which 421 are text (23,133
 * characters) and 39 are image fills of 1080 × 2400 sources. It is gitignored, so the test says so
 * and skips rather than failing when it isn't there.
 */
test('a board of text and images is zoomed in and out at frame rate @chromium-only', async ({ page }) => {
  test.setTimeout(180_000);
  const board = BOARD;
  test.skip(!existsSync(board), `${board} is gitignored and not in this working copy`);

  await page.goto('/');
  await expect(page.getByTestId('canvas')).toHaveAttribute('data-ready', 'true');
  await page.setInputFiles('input[aria-label="Open an Openframe file"]', board);
  await expect(page.getByRole('treeitem', { name: /Sample Page/ })).toBeVisible({ timeout: 30_000 });
  const box = (await page.getByTestId('canvas').boundingBox())!;

  // Fit puts the whole board on screen, which is the far end of the sweep.
  await page.keyboard.press('Shift+1');
  await page.waitForTimeout(600);

  // Two sweeps: the first pays for shaping every layer once, the second is what using the board feels like.
  const sweep = async () => {
    await page.mouse.move(box.x + 700, box.y + 400);
    for (const direction of [-1, 1]) {
      for (let i = 0; i < ZOOM_STEPS; i++) {
        await page.mouse.wheel(0, direction * 20);
        await page.waitForTimeout(16);
      }
    }
  };
  const first = await frameTimes(page, sweep);
  const times = await frameTimes(page, sweep);
  const sorted = [...times].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)]!;
  const p95 = sorted[Math.floor(sorted.length * 0.95)]!;
  const worst = sorted.at(-1)!;
  const firstWorst = Math.max(...first);
  console.info(`perf(browser, zoom, 421 text + 39 image fills): frame median ${median.toFixed(1)}ms, p95 ${p95.toFixed(1)}ms, worst ${worst.toFixed(1)}ms over ${times.length} frames | first sweep worst ${firstWorst.toFixed(1)}ms`);

  expect(times.length).toBeGreaterThan(30);
  expect(median).toBeLessThan(34);
  expect(p95).toBeLessThan(120);
  // The cliff this guards: one frame that has to shape every text layer at once blocks for a second or more.
  expect(worst).toBeLessThan(400);
});
