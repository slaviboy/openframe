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

async function draw(page: Page, tool: string, from: [number, number], to: [number, number]) {
  const box = (await page.getByTestId('canvas').boundingBox())!;
  await page.keyboard.press(tool);
  await page.mouse.move(box.x + from[0], box.y + from[1]);
  await page.mouse.down();
  await page.mouse.move(box.x + to[0], box.y + to[1], { steps: 5 });
  await page.mouse.up();
}

async function objectMenu(page: Page, item: RegExp) {
  await page.getByRole('button', { name: 'Main menu' }).click();
  await page
    .getByRole('menu', { name: 'Main menu' })
    .getByRole('menuitem', { name: /^Object/ })
    .click();
  await page.getByRole('menu', { name: 'Object' }).getByRole('menuitem', { name: item }).click();
}

test('Offset vector grows a vector layer, previews as it is typed, and Esc leaves it alone', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('canvas')).toHaveAttribute('data-ready', 'true');
  await draw(page, 'r', [400, 300], [460, 360]);
  await objectMenu(page, /Flatten/);
  await expect(page.getByTestId('field-w')).toHaveValue('60');

  // Escape leaves the layer as it was, though the canvas showed the offset while the dialog was open.
  await objectMenu(page, /Offset vector/);
  await expect(page.getByRole('dialog', { name: 'Offset vector' })).toBeVisible();
  await page.getByLabel('Offset amount').fill('8');
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('field-w')).toHaveValue('60');

  await objectMenu(page, /Offset vector/);
  await page.getByLabel('Offset amount').fill('8');
  await page.getByLabel('Offset join').selectOption('SQUARE');
  await page.getByRole('dialog', { name: 'Offset vector' }).getByRole('button', { name: 'Apply' }).click();
  await expect(page.getByTestId('field-w')).toHaveValue('76');
  await expect(page.getByTestId('field-h')).toHaveValue('76');

  // One undo step takes the whole offset back.
  await page.keyboard.press(`${mod}+z`);
  await expect(page.getByTestId('field-w')).toHaveValue('60');
});
