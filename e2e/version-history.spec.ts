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

async function drawFrame(page: Page, x: number, y: number) {
  const box = (await page.getByTestId('canvas').boundingBox())!;
  await page.keyboard.press('f');
  await page.mouse.move(box.x + x, box.y + y);
  await page.mouse.down();
  await page.mouse.move(box.x + x + 120, box.y + y + 80, { steps: 4 });
  await page.mouse.up();
}

async function showVersionHistory(page: Page) {
  await page.getByRole('button', { name: 'File actions' }).click();
  await page.getByRole('menuitem', { name: 'Show version history' }).click();
  return page.getByRole('region', { name: 'Version history' });
}

test('versions save, show read-only, restore with two checkpoints, and can be named and duplicated', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('canvas')).toHaveAttribute('data-ready', 'true');
  await drawFrame(page, 300, 300);
  await expect(page.getByTestId('save-status')).toHaveText('Saved locally');

  // Save to version history, with a title and description.
  let history = await showVersionHistory(page);
  await history.getByRole('button', { name: 'Save to version history' }).click();
  await history.getByLabel('Version title').fill('One frame');
  await history.getByLabel('Version description').fill('Before the second frame');
  await history.getByRole('button', { name: 'Save', exact: true }).click();
  const versions = history.getByRole('list', { name: 'Versions' });
  await expect(versions.getByRole('listitem').filter({ hasText: 'One frame' })).toContainText('Before the second frame');
  await page.getByRole('toolbar', { name: 'Tools' }).getByRole('button', { name: 'Done' }).click();
  await expect(history).toHaveCount(0);

  await drawFrame(page, 500, 300);
  await expect(page.getByRole('treeitem', { name: /Frame 2/ })).toBeVisible();
  await expect(page.getByTestId('save-status')).toHaveText('Saved locally');

  // Selecting a version shows it read-only.
  history = await showVersionHistory(page);
  await history.getByRole('button', { name: /One frame/ }).click();
  await expect(page.getByTestId('canvas')).toHaveAttribute('data-ready', 'true');
  await expect(page.getByTestId('save-status')).toHaveText('Viewing an earlier version');
  await expect(page.getByRole('treeitem', { name: /Frame 1/ })).toBeVisible();
  await expect(page.getByRole('treeitem', { name: /Frame 2/ })).toHaveCount(0);
  await page.getByRole('treeitem', { name: /Frame 1/ }).click();
  await page.keyboard.press('Delete');
  await expect(page.getByRole('treeitem', { name: /Frame 1/ })).toBeVisible();

  // Done returns to the file as it is now.
  await page.getByRole('toolbar', { name: 'Tools' }).getByRole('button', { name: 'Done' }).click();
  await expect(page.getByTestId('save-status')).toHaveText('Saved locally');
  await expect(page.getByRole('treeitem', { name: /Frame 2/ })).toBeVisible();

  // Restoring adds two autosave checkpoints and brings the version back.
  history = await showVersionHistory(page);
  await history.getByRole('listitem').filter({ hasText: 'One frame' }).getByRole('button', { name: 'Version actions' }).click();
  await page.getByRole('menuitem', { name: 'Restore this version' }).click();
  await expect(page.getByTestId('canvas')).toHaveAttribute('data-ready', 'true');
  await expect(page.getByRole('treeitem', { name: /Frame 1/ })).toBeVisible();
  await expect(page.getByRole('treeitem', { name: /Frame 2/ })).toHaveCount(0);
  history = await showVersionHistory(page);
  const items = history.getByRole('list', { name: 'Versions' }).getByRole('listitem');
  // Current version, two checkpoints, and the saved version.
  await expect(items).toHaveCount(4);
  await expect(items.filter({ hasText: 'Autosave' })).toHaveCount(2);

  // Naming a checkpoint.
  await items.filter({ hasText: 'Autosave' }).first().getByRole('button', { name: 'Version actions' }).click();
  await page.getByRole('menuitem', { name: 'Name this version' }).click();
  await history.getByLabel('Version title').fill('Restored');
  await history.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(items.filter({ hasText: 'Restored' })).toHaveCount(1);
  await expect(items.filter({ hasText: 'Autosave' })).toHaveCount(1);

  // Duplicating a version makes a new local file.
  await items.filter({ hasText: 'One frame' }).click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'Duplicate' }).click();
  await expect(history.getByRole('status')).toHaveText('Duplicated as “Untitled (Copy)” in Files.');
});
