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

async function drawRect(page: Page, x: number, y: number) {
  const box = (await page.getByTestId('canvas').boundingBox())!;
  await page.keyboard.press('r');
  await page.mouse.move(box.x + x, box.y + y);
  await page.mouse.down();
  await page.mouse.move(box.x + x + 50, box.y + y + 50, { steps: 6 });
  await page.mouse.up();
}

async function xOf(page: Page, name: string) {
  await page.getByRole('treeitem', { name: new RegExp(name) }).click();
  return Number(await page.getByTestId('field-x').inputValue());
}

test('an evenly spaced selection shows "space between"; editing it respaces the row', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('toolbar', { name: 'Tools' })).toBeVisible();
  await drawRect(page, 400, 300);
  await drawRect(page, 480, 300);
  await drawRect(page, 590, 300);

  const empty = (await page.getByTestId('canvas').boundingBox())!;
  await page.mouse.click(empty.x + 800, empty.y + 600);
  await page.keyboard.press(`${mod}+a`);
  // Uneven gaps (30 and 60): not a smart selection until tidied up.
  await expect(page.getByTestId('field-spacing')).toHaveCount(0);
  await page.keyboard.press('Control+Alt+t');
  const field = page.getByTestId('field-spacing');
  await expect(field).toHaveValue('45');

  await field.fill('10');
  await field.press('Enter');
  await expect(field).toHaveValue('10');
  const x1 = await xOf(page, 'Rectangle 1');
  const x2 = await xOf(page, 'Rectangle 2');
  const x3 = await xOf(page, 'Rectangle 3');
  expect(x2 - x1).toBe(60);
  expect(x3 - x2).toBe(60);
});
