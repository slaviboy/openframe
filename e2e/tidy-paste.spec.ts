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

const mod = process.platform === 'darwin' ? 'Meta' : 'Control';

async function point(page: Page, x: number, y: number) {
  const box = (await page.getByTestId('canvas').boundingBox())!;
  return { x: box.x + x, y: box.y + y };
}

async function drawRect(page: Page, x: number, y: number) {
  const a = await point(page, x, y);
  await page.keyboard.press('r');
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move(a.x + 50, a.y + 50, { steps: 6 });
  await page.mouse.up();
}

async function positionOf(page: Page, name: string) {
  await page.getByRole('treeitem', { name: new RegExp(`^${name}`) }).click();
  return [await page.getByTestId('field-x').inputValue(), await page.getByTestId('field-y').inputValue()];
}

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('toolbar', { name: 'Tools' })).toBeVisible();
});

test('tidy up (⌃⌥T) spaces a messy row evenly and undo restores it', async ({ page }) => {
  // Gaps between the rectangles: 20 and 40 (median 30); tops at 200, 210 and 195.
  await drawRect(page, 400, 300);
  await drawRect(page, 470, 310);
  await drawRect(page, 560, 295);
  const before = await positionOf(page, 'Rectangle 2');

  await page.mouse.click((await point(page, 800, 600)).x, (await point(page, 800, 600)).y);
  await page.keyboard.press(`${mod}+a`);
  await page.keyboard.press('Control+Alt+t');
  const [x1, y1] = await positionOf(page, 'Rectangle 1');
  const [x2, y2] = await positionOf(page, 'Rectangle 2');
  const [x3, y3] = await positionOf(page, 'Rectangle 3');
  expect(y1).toBe(y3);
  expect(y2).toBe(y3);
  expect(Number(x2) - Number(x1)).toBe(80);
  expect(Number(x3) - Number(x2)).toBe(80);

  await page.keyboard.press(`${mod}+z`);
  expect(await positionOf(page, 'Rectangle 2')).toEqual(before);
});

test('right-click → Paste here pastes centered on the pointer', async ({ page }) => {
  await drawRect(page, 400, 300);
  const [x, y] = await positionOf(page, 'Rectangle 1');
  const canvasFocus = await point(page, 425, 325);
  await page.mouse.click(canvasFocus.x, canvasFocus.y);
  await page.keyboard.press(`${mod}+c`);

  const target = await point(page, 700, 500);
  await page.mouse.click(target.x, target.y, { button: 'right' });
  await page.getByRole('menuitem', { name: 'Paste here' }).click();
  await expect(page.getByRole('treeitem')).toHaveCount(2);
  // The pointer is 300 px right and 200 px below the original's center.
  await expect(page.getByTestId('field-x')).toHaveValue(String(Number(x) + 275));
  await expect(page.getByTestId('field-y')).toHaveValue(String(Number(y) + 175));
});
