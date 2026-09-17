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

import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';

async function drag(page: Page, from: [number, number], to: [number, number]) {
  const box = (await page.getByTestId('canvas').boundingBox())!;
  await page.mouse.move(box.x + from[0], box.y + from[1]);
  await page.mouse.down();
  await page.mouse.move(box.x + to[0], box.y + to[1], { steps: 5 });
  await page.mouse.up();
}

test('dragging a grid column edge on the canvas makes the column fixed', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('canvas')).toHaveAttribute('data-ready', 'true');
  const box = (await page.getByTestId('canvas').boundingBox())!;
  await page.keyboard.press('f');
  await drag(page, [300, 200], [600, 420]);
  for (const [x, y] of [
    [320, 220],
    [440, 220],
    [320, 320],
    [440, 320],
  ] as const) {
    await page.keyboard.press('r');
    await drag(page, [x, y], [x + 100, y + 80]);
  }
  await page.getByRole('treeitem', { name: /Frame 1/ }).click();
  await page.getByRole('button', { name: 'Grid layout' }).click();
  await expect(page.getByLabel('Number of columns')).toHaveValue('2');
  await expect(page.getByLabel('Column 1 sizing')).toHaveValue('FLEX');

  // The first column ends 20 px (padding) + 100 px into the frame. Grab its edge just below the top side.
  await page.mouse.move(box.x + 450, box.y + 300);
  await drag(page, [420, 212], [460, 212]);
  await expect(page.getByLabel('Column 1 sizing')).toHaveValue('FIXED');
  await expect(page.getByLabel('Column 1 size')).toHaveValue('140');
  await expect(page.getByLabel('Column 2 sizing')).toHaveValue('FLEX');
});

/** A 2 × 2 grid frame with four rectangles in it, ready to have its tracks picked at. */
async function gridFrame(page: Page) {
  await page.goto('/');
  await expect(page.getByTestId('canvas')).toHaveAttribute('data-ready', 'true');
  await page.keyboard.press('f');
  await drag(page, [300, 200], [600, 420]);
  for (const [x, y] of [
    [320, 220],
    [440, 220],
    [320, 320],
    [440, 320],
  ] as const) {
    await page.keyboard.press('r');
    await drag(page, [x, y], [x + 100, y + 80]);
  }
  await page.getByRole('treeitem', { name: /Frame 1/ }).click();
  await page.getByRole('button', { name: 'Grid layout' }).click();
  await expect(page.getByLabel('Number of columns')).toHaveValue('2');
  return (await page.getByTestId('canvas').boundingBox())!;
}

test('a column is picked out by its pill, carried to another place, and taken away with Delete', async ({ page }) => {
  const box = await gridFrame(page);
  // Make the columns tell each other apart: the first one fixed at 140.
  await page.mouse.move(box.x + 450, box.y + 300);
  await drag(page, [420, 212], [460, 212]);
  await expect(page.getByLabel('Column 1 sizing')).toHaveValue('FIXED');
  await expect(page.getByLabel('Column 2 sizing')).toHaveValue('FLEX');

  // The first column's pill sits above the middle of that column, just outside the frame's top side.
  await page.mouse.move(box.x + 450, box.y + 300);
  await page.mouse.click(box.x + 390, box.y + 192);
  // Carrying it past the second column swaps the two, so the fixed one is now the second.
  await page.mouse.move(box.x + 450, box.y + 300);
  await drag(page, [390, 192], [540, 192]);
  await expect(page.getByLabel('Column 1 sizing')).toHaveValue('FLEX');
  await expect(page.getByLabel('Column 2 sizing')).toHaveValue('FIXED');

  // Picking a column out and pressing Delete takes the column away, not the frame.
  await page.mouse.move(box.x + 450, box.y + 300);
  await page.mouse.click(box.x + 390, box.y + 192);
  await page.keyboard.press('Delete');
  await expect(page.getByLabel('Number of columns')).toHaveValue('1');
  await expect(page.getByRole('treeitem', { name: /Frame 1/ })).toHaveCount(1);
});
