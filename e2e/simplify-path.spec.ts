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

async function objectMenu(page: Page, item: RegExp) {
  await page.getByRole('button', { name: 'Main menu' }).click();
  await page
    .getByRole('menu', { name: 'Main menu' })
    .getByRole('menuitem', { name: /^Object/ })
    .click();
  await page.getByRole('menu', { name: 'Object' }).getByRole('menuitem', { name: item }).click();
}

test('Simplify vector thins a sketched path, showing the count as the slider moves', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('canvas')).toHaveAttribute('data-ready', 'true');

  // A wobbly pencil sketch, which is the kind of path simplifying is for.
  const box = (await page.getByTestId('canvas').boundingBox())!;
  await page.keyboard.press('Shift+P');
  await page.mouse.move(box.x + 400, box.y + 300);
  await page.mouse.down();
  for (let i = 1; i <= 24; i++) await page.mouse.move(box.x + 400 + i * 8, box.y + 300 + (i % 2 === 0 ? 0 : 6));
  await page.mouse.up();
  await expect(page.getByTestId('inspector')).toContainText('Vector');

  await objectMenu(page, /Simplify vector/);
  const dialog = page.getByRole('dialog', { name: 'Simplify vector' });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('status')).toContainText('points');

  await dialog.getByLabel('Simplify amount').fill('100');
  await expect(dialog.getByRole('status')).toContainText('down to');
  await dialog.getByRole('button', { name: 'Simplify' }).click();
  await expect(dialog).toBeHidden();

  // The layer is still a vector on the canvas, and one undo puts the sketch back.
  await expect(page.getByTestId('inspector')).toContainText('Vector');
  const width = Number(await page.getByTestId('field-w').inputValue());
  expect(width).toBeGreaterThan(100);
  await page.keyboard.press(`${mod}+z`);
  await expect(page.getByTestId('inspector')).toContainText('Vector');
});
