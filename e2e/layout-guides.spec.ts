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

import { expect, test } from './fixtures';

test('layout guides: add, change type and settings, hide all with Shift+G, persist', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('canvas')).toHaveAttribute('data-ready', 'true');
  const box = (await page.getByTestId('canvas').boundingBox())!;
  await page.keyboard.press('f');
  await page.mouse.move(box.x + 300, box.y + 200);
  await page.mouse.down();
  await page.mouse.move(box.x + 700, box.y + 500, { steps: 5 });
  await page.mouse.up();

  await page.getByRole('button', { name: 'Add layout guide' }).click();
  const type = page.getByLabel('Layout guide 1 type');
  await expect(type).toHaveValue('GRID');
  await expect(page.getByLabel('Layout guide 1 size')).toHaveValue('10');

  await type.selectOption('COLUMNS');
  await expect(page.getByLabel('Layout guide 1 column type')).toHaveValue('STRETCH');
  await page.getByLabel('Layout guide 1 count').fill('3');
  await page.getByLabel('Layout guide 1 count').press('Enter');
  await page.getByLabel('Layout guide 1 column type').selectOption('MIN');
  await expect(page.getByLabel('Layout guide 1 offset')).toBeVisible();

  // Undo restores the stretched columns.
  const mod = process.platform === 'darwin' ? 'Meta' : 'Control';
  await page.mouse.click(box.x + 100, box.y + 100);
  await page.mouse.click(box.x + 500, box.y + 350);
  await page.keyboard.press(`${mod}+z`);
  await expect(page.getByLabel('Layout guide 1 column type')).toHaveValue('STRETCH');

  await page.getByRole('button', { name: 'Hide layout guide 1' }).click();
  await expect(page.getByRole('button', { name: 'Show layout guide 1' })).toBeVisible();

  // View › Layout guides is on by default; Shift+G turns it off.
  await page.getByTestId('zoom-level').click();
  const item = page.getByRole('menuitemcheckbox', { name: /Layout guides/ });
  await expect(item).toHaveAttribute('aria-checked', 'true');
  await page.keyboard.press('Escape');
  await page.mouse.click(box.x + 500, box.y + 350);
  await page.keyboard.press('Shift+G');

  await expect(page.getByTestId('save-status')).toHaveText('Saved locally');
  await page.reload();
  await expect(page.getByTestId('canvas')).toHaveAttribute('data-ready', 'true');
  await page.getByTestId('zoom-level').click();
  await expect(item).toHaveAttribute('aria-checked', 'false');
  await page.keyboard.press('Escape');
  await page.getByRole('treeitem', { name: /Frame 1/ }).click();
  await expect(page.getByLabel('Layout guide 1 type')).toHaveValue('COLUMNS');
  await expect(page.getByLabel('Layout guide 1 count')).toHaveValue('3');
  await expect(page.getByRole('button', { name: 'Show layout guide 1' })).toBeVisible();
});
