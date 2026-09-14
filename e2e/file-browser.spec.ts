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

async function openFiles(page: Page) {
  await page.getByRole('button', { name: 'Main menu' }).click();
  await page.getByRole('menuitem', { name: 'File' }).click();
  await page.getByRole('menuitem', { name: 'Files…' }).click();
  return page.getByRole('dialog', { name: 'Files' });
}

test('a frame becomes the file thumbnail, and Files duplicates, trashes, restores and creates local files', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('canvas')).toHaveAttribute('data-ready', 'true');
  const box = (await page.getByTestId('canvas').boundingBox())!;

  await page.keyboard.press('f');
  await page.mouse.move(box.x + 300, box.y + 300);
  await page.mouse.down();
  await page.mouse.move(box.x + 460, box.y + 390, { steps: 4 });
  await page.mouse.up();
  await page.getByRole('treeitem', { name: /Frame 1/ }).click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'Set as thumbnail' }).click();
  await expect(page.getByTestId('thumbnail-tag')).toBeVisible();
  await expect(page.getByTestId('save-status')).toHaveText('Saved locally');

  let files = await openFiles(page);
  const recents = files.getByRole('list', { name: 'Recent files' });
  await expect(recents.getByRole('listitem', { name: 'Untitled', exact: true })).toContainText('Open now');

  await recents.getByRole('listitem', { name: 'Untitled', exact: true }).getByRole('button', { name: 'Duplicate' }).click();
  const copy = recents.getByRole('listitem', { name: 'Untitled (Copy)' });
  await expect(copy).toBeVisible();
  await copy.getByRole('button', { name: 'Move to trash' }).click();
  await expect(copy).toHaveCount(0);

  await files.getByRole('button', { name: 'Trash', exact: true }).click();
  const trashed = files.getByRole('list', { name: 'Files in the trash' }).getByRole('listitem', { name: 'Untitled (Copy)' });
  await trashed.getByRole('button', { name: 'Restore' }).click();
  await files.getByRole('button', { name: 'Recents', exact: true }).click();
  await expect(recents.getByRole('listitem', { name: 'Untitled (Copy)' })).toBeVisible();

  // New file opens an empty file.
  await files.getByRole('button', { name: 'New file' }).click();
  await expect(page.getByTestId('canvas')).toHaveAttribute('data-ready', 'true');
  await expect(page.getByRole('treeitem', { name: /Frame 1/ })).toHaveCount(0);
  files = await openFiles(page);
  await expect(files.getByRole('list', { name: 'Recent files' }).getByRole('listitem')).toHaveCount(3);
});
