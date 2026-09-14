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

test('Save local copy downloads an .openframe file, and opening it restores the document as a new file', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('canvas')).toHaveAttribute('data-ready', 'true');
  const box = (await page.getByTestId('canvas').boundingBox())!;

  await page.keyboard.press('r');
  await page.mouse.move(box.x + 400, box.y + 300);
  await page.mouse.down();
  await page.mouse.move(box.x + 500, box.y + 400, { steps: 5 });
  await page.mouse.up();
  await expect(page.getByRole('treeitem', { name: /Rectangle 1/ })).toBeVisible();

  await page.getByRole('button', { name: 'Main menu' }).click();
  await page.getByRole('menuitem', { name: 'File' }).click();
  const download = page.waitForEvent('download');
  await page.getByRole('menuitem', { name: 'Save local copy…' }).click();
  const saved = await download;
  expect(saved.suggestedFilename()).toBe('Untitled.openframe');
  const path = await saved.path();

  // Delete the rectangle, then open the saved copy: it comes back in a new local file.
  await page.getByRole('treeitem', { name: /Rectangle 1/ }).click();
  await page.keyboard.press('Delete');
  await expect(page.getByRole('treeitem', { name: /Rectangle 1/ })).toHaveCount(0);
  await expect(page.getByTestId('save-status')).toHaveText('Saved locally');

  await page.getByLabel('Open an Openframe file').setInputFiles(path);
  await expect(page.getByTestId('canvas')).toHaveAttribute('data-ready', 'true');
  await expect(page.getByRole('treeitem', { name: /Rectangle 1/ })).toBeVisible();
});
