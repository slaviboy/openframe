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

test('clicking a padding handle types a value; Alt-click sets opposite sides', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('canvas')).toHaveAttribute('data-ready', 'true');
  const box = (await page.getByTestId('canvas').boundingBox())!;
  await page.keyboard.press('f');
  await drag(page, [300, 200], [700, 500]);
  await page.keyboard.press('r');
  await drag(page, [340, 240], [400, 300]);
  await page.getByRole('treeitem', { name: /Frame 1/ }).click();
  await page.getByRole('button', { name: 'Main menu' }).click();
  await page.getByRole('menu', { name: 'Main menu' }).getByRole('menuitem', { name: /^Object/ }).click();
  await page.getByRole('menu', { name: 'Object' }).getByRole('menuitem', { name: /Add auto layout/ }).click();
  await page.getByRole('button', { name: 'Individual padding' }).click();
  await expect(page.getByLabel('Top padding', { exact: true })).toHaveValue('40');
  const width = Number(await page.getByTestId('field-w').inputValue());

  // Click (without dragging) the top padding handle and type a value.
  await page.mouse.move(box.x + 300 + width / 2, box.y + 220);
  await page.mouse.down();
  await page.mouse.up();
  const field = page.getByRole('dialog', { name: 'Top padding' }).getByRole('textbox');
  await expect(field).toBeFocused();
  await field.fill('24');
  await field.press('Enter');
  await expect(page.getByRole('dialog', { name: 'Top padding' })).toHaveCount(0);
  await expect(page.getByLabel('Top padding', { exact: true })).toHaveValue('24');

  // ⌥-click the left handle: the value applies to the left and right padding.
  const height = Number(await page.getByTestId('field-h').inputValue());
  await page.mouse.move(box.x + 320, box.y + 200 + height / 2);
  await page.keyboard.down('Alt');
  await page.mouse.down();
  await page.mouse.up();
  await page.keyboard.up('Alt');
  const both = page.getByRole('dialog', { name: 'Horizontal padding' }).getByRole('textbox');
  await both.fill('12');
  await both.press('Enter');
  await expect(page.getByLabel('Left padding', { exact: true })).toHaveValue('12');
  await expect(page.getByLabel('Right padding', { exact: true })).toHaveValue('12');
});
